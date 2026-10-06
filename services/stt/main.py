import os
import re
import time
import struct
import json
import asyncio
import traceback
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from prometheus_client import Histogram, Counter, generate_latest, CONTENT_TYPE_LATEST

from vad import SileroVADWrapper
from asr import ASRModelWrapper
from session_state import SessionState

app = FastAPI(title="Voice STT Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus Metrics
ASR_DURATION = Histogram(
    "stt_asr_duration_seconds",
    "Time spent running ASR inference",
    ["model", "chunk_ms"],
    buckets=[0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 2.0]
)
VAD_DURATION = Histogram(
    "stt_vad_duration_seconds",
    "Time spent on VAD frame evaluation",
    buckets=[0.001, 0.002, 0.005, 0.01, 0.02]
)
COMMITTED_UTTERANCES = Counter(
    "stt_committed_utterances_total",
    "Total committed utterances finalized"
)

# Global models (single instance per GPU worker process)
vad_wrapper = SileroVADWrapper(
    threshold=float(os.getenv("VAD_THRESHOLD", "0.5")),
    sample_rate=16000
)

asr_wrapper = ASRModelWrapper(
    model_size=os.getenv("STT_MODEL_SIZE", "large-v3-turbo"),
    device=os.getenv("STT_DEVICE", "cuda"),
    compute_type=os.getenv("STT_COMPUTE_TYPE", "float16")
)

agreement_n = int(os.getenv("LOCAL_AGREEMENT_N", "2"))
min_chunk_ms = int(os.getenv("MIN_CHUNK_MS", "500"))

@app.get("/metrics")
async def metrics():
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "asr_loaded": asr_wrapper.model is not None,
        "vad_loaded": vad_wrapper.model is not None
    }

@app.websocket("/stream")
async def websocket_stream(websocket: WebSocket):
    await websocket.accept()
    session = SessionState(session_id="uninitialized", agreement_n=agreement_n)

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                print(f"[STT] WebSocket disconnect frame received for session {session.session_id}")
                break

            if "bytes" in message and message["bytes"] is not None:
                raw_bytes = message["bytes"]
                if len(raw_bytes) < 13:
                    continue

                try:
                    # Parse binary header: msgType(1B), seq(4B LE), tCapture(8B LE float64)
                    msg_type, seq, t_capture = struct.unpack_from("<BId", raw_bytes, 0)
                except struct.error:
                    continue
                if msg_type != 0x01:
                    continue

                pcm_bytes = raw_bytes[13:]
                if len(pcm_bytes) == 0 or len(pcm_bytes) % 2 != 0:
                    continue
                try:
                    # Convert 16-bit signed PCM to float32 (-1.0 to 1.0)
                    pcm_data = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
                except (ValueError, BufferError):
                    continue

                now_ms = int(time.time() * 1000)

                try:
                    # 1. Evaluate VAD
                    with VAD_DURATION.time():
                        is_speech, prob = vad_wrapper.is_speech(pcm_data)
                    if is_speech:
                        session.last_speech_ms = now_ms

                    # 2. Feed segmenter
                    finalized_segment = session.segmenter.on_frame(
                        pcm_data,
                        prob=prob,
                        t_ms=now_ms,
                        frame_ms=int(len(pcm_data) / 16.0) # 16 samples per ms at 16kHz
                    )

                    session.append_audio(pcm_data, int(t_capture))

                    # 2b. Drop stale silence: if the segmenter is idle and nothing
                    # speech-like arrived for 5s, the buffer is dead air. Reset it
                    # so partials don't transcribe (and hallucinate on) minutes
                    # of accumulated silence, and CPU stays bounded on slow hosts.
                    if (
                        session.segmenter.state.name == "IDLE"
                        and len(session.active_audio) > session.sample_rate * 5
                        and (now_ms - session.last_speech_ms) > 5000
                    ):
                        session.active_audio = np.array([], dtype=np.float32)

                    # 3. If speech segment was finalized by VAD silence hangover / max length:
                    if finalized_segment is not None and len(finalized_segment) > 1600: # at least 100ms
                        if not session.asr_busy:
                            session.asr_busy = True
                            try:
                                with ASR_DURATION.labels(model=asr_wrapper.model_size, chunk_ms="final").time():
                                    asr_result = await asyncio.to_thread(
                                        asr_wrapper.transcribe,
                                        finalized_segment,
                                        session.src_lang,
                                        True
                                    )
                            finally:
                                session.asr_busy = False

                            final_text = asr_result["text"]
                            if final_text:
                                COMMITTED_UTTERANCES.inc()
                                final_msg = {
                                    "type": "final",
                                    "uttId": session.current_utt_id,
                                    "text": final_text,
                                    "words": asr_result["words"],
                                    "tCapture": session.last_capture_time_ms,
                                    "tFinal": int(time.time() * 1000)
                                }
                                try:
                                    await websocket.send_text(json.dumps(final_msg))
                                except Exception:
                                    pass

                                # Log structured event for offline eval replays
                                print(json.dumps({
                                    "sessionId": session.session_id,
                                    "uttId": session.current_utt_id,
                                    "stage": "asr_final",
                                    "tCapture": session.last_capture_time_ms,
                                    "tFinal": final_msg["tFinal"],
                                    "text": final_text
                                }))

                                session.next_utterance()

                    # 4. Periodic partial ASR running every min_chunk_ms, but only
                    # while speech is (or was very recently) active. Transcribing
                    # pure silence wastes CPU on slow hosts and makes Whisper
                    # hallucinate random phrases.
                    elif len(session.active_audio) >= int((min_chunk_ms / 1000.0) * session.sample_rate):
                        if (now_ms - session.last_asr_run_time_ms) >= min_chunk_ms:
                            session.last_asr_run_time_ms = now_ms

                            if session.asr_busy or (now_ms - session.last_speech_ms) > 2500:
                                pass
                            else:
                                session.asr_busy = True
                                try:
                                    with ASR_DURATION.labels(model=asr_wrapper.model_size, chunk_ms=str(min_chunk_ms)).time():
                                        asr_result = await asyncio.to_thread(
                                            asr_wrapper.transcribe,
                                            session.active_audio,
                                            session.src_lang,
                                            True
                                        )
                                finally:
                                    session.asr_busy = False

                                hypo = asr_result["text"]
                                stabilizer_out = session.stabilizer.update(hypo, asr_result["words"])

                                if stabilizer_out["trim_audio_s"] > 0:
                                    session.trim_active_audio(stabilizer_out["trim_audio_s"])

                                full_stream_text = (stabilizer_out["committed"] + stabilizer_out["partial"]).strip()
                                if full_stream_text:
                                    partial_msg = {
                                        "type": "partial",
                                        "uttId": session.current_utt_id,
                                        "seq": seq,
                                        "text": full_stream_text,
                                        "stableChars": stabilizer_out["stable_chars"],
                                        "tCapture": session.last_capture_time_ms,
                                        "tEmit": int(time.time() * 1000)
                                    }
                                    try:
                                        await websocket.send_text(json.dumps(partial_msg))
                                    except Exception:
                                        pass
                except Exception:
                    # Send/write failures on a dying socket are expected during
                    # teardown: end the stream quietly instead of traceback-spam.
                    # Genuine per-frame bugs still surface via the traceback below.
                    try:
                        from starlette.websockets import WebSocketState
                        alive = websocket.client_state == WebSocketState.CONNECTED
                    except Exception:
                        alive = True
                    if alive:
                        traceback.print_exc()
                    else:
                        print(f"[STT] Stream ended for session {session.session_id}.")
                        break

            elif "text" in message and message["text"] is not None:
                # Handle JSON control frames
                try:
                    payload = json.loads(message["text"])
                    msg_type = payload.get("type")
                    if msg_type == "session_start":
                        raw_sid = str(payload.get("sessionId", "s_default"))
                        # Validate sessionId format (alphanumeric, dashes, underscores, max 128 chars)
                        session.session_id = raw_sid if re.match(r'^[a-zA-Z0-9_\-]{1,128}$', raw_sid) else "s_default"

                        # Validate srcLang against supported languages
                        raw_lang = str(payload.get("srcLang", "ja")).lower().strip()
                        ALLOWED_LANGUAGES = {"ja", "en", "zh", "ko", "es", "fr", "de", "it", "pt", "ru"}
                        session.src_lang = raw_lang if raw_lang in ALLOWED_LANGUAGES else "ja"

                        # Validate sampleRate: 8kHz - 48kHz
                        try:
                            sr = int(payload.get("sampleRate", 16000))
                            session.sample_rate = sr if 8000 <= sr <= 48000 else 16000
                        except (ValueError, TypeError):
                            session.sample_rate = 16000

                        # Continue utterance numbering across mid-call reconnects
                        # so the gateway never merges unrelated turns.
                        try:
                            start_utt = int(payload.get("startUttId", 1))
                            if 1 <= start_utt <= 100000:
                                session.current_utt_id = start_utt
                        except (ValueError, TypeError):
                            pass

                        print(f"[STT] Started session {session.session_id} (srcLang: {session.src_lang}, sampleRate: {session.sample_rate})")
                    elif msg_type == "session_stop":
                        # Flush any remaining audio without blocking the loop.
                        leftover = session.segmenter.force_finalize()
                        if leftover is not None and len(leftover) > 1600 and not session.asr_busy:
                            session.asr_busy = True
                            try:
                                asr_result = await asyncio.to_thread(
                                    asr_wrapper.transcribe, leftover, session.src_lang, True
                                )
                            finally:
                                session.asr_busy = False
                            if asr_result["text"]:
                                await websocket.send_text(json.dumps({
                                    "type": "final",
                                    "uttId": session.current_utt_id,
                                    "text": asr_result["text"],
                                    "words": asr_result["words"],
                                    "tCapture": session.last_capture_time_ms,
                                    "tFinal": int(time.time() * 1000)
                                }))
                        print(f"[STT] Stopped session {session.session_id}")
                except Exception as ex:
                    print(f"[STT] Error parsing text control frame: {ex}")

    except WebSocketDisconnect:
        print(f"[STT] WebSocket disconnected for session {session.session_id}")
    except Exception as e:
        print(f"[STT] Unexpected error in stream: {e}")
