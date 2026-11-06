import os
import re
import time
import struct
import json
import asyncio
import traceback
from typing import Optional, Set
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from prometheus_client import Histogram, Counter, Gauge, generate_latest, CONTENT_TYPE_LATEST

from vad import SileroVADWrapper
from asr import ASRModelWrapper
from session_state import SessionState

app = FastAPI(title="Voice STT Service", version="0.3.0")

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
    buckets=[0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 2.0]
)
VAD_DURATION = Histogram(
    "stt_vad_duration_seconds",
    "Time spent on VAD frame evaluation",
    buckets=[0.0005, 0.001, 0.002, 0.005, 0.01]
)
COMMITTED_UTTERANCES = Counter(
    "stt_committed_utterances_total",
    "Total committed utterances finalized"
)
DROPPED_SEGMENTS = Counter(
    "stt_dropped_segments_total",
    "Total segments dropped due to bounded queue overflow"
)
ACTIVE_SESSIONS_GAUGE = Gauge(
    "stt_active_sessions",
    "Current active STT WebSocket connections"
)
LAST_SEGMENT_RTF = Gauge(
    "stt_last_segment_rtf",
    "Real-Time Factor (RTF = decode_time / audio_duration) of most recent segment",
    ["engine"]
)

# Global models (single instance per worker process)
vad_wrapper = SileroVADWrapper(
    threshold=float(os.getenv("VAD_THRESHOLD", "0.5")),
    sample_rate=16000
)

asr_wrapper = ASRModelWrapper(
    model_size=os.getenv("STT_MODEL_SIZE", "small"),
    device=os.getenv("STT_DEVICE", "cpu"),
    compute_type=os.getenv("STT_COMPUTE_TYPE", "int8"),
    cpu_threads=int(os.getenv("SHERPA_CPU_THREADS", "4"))
)

agreement_n = int(os.getenv("LOCAL_AGREEMENT_N", "2"))
min_chunk_ms = int(os.getenv("MIN_CHUNK_MS", "500"))
vad_threshold = float(os.getenv("VAD_THRESHOLD", "0.5"))
hangover_ms = int(os.getenv("HANGOVER_MS", "700"))
preroll_ms = int(os.getenv("PREROLL_MS", "300"))
max_len_ms = int(os.getenv("MAX_LEN_MS", "15000"))

# Concurrency and queue limits
MAX_ACTIVE_SESSIONS = int(os.getenv("MAX_ACTIVE_SESSIONS", "64"))
MAX_CONCURRENT_DECODES = int(os.getenv("MAX_CONCURRENT_DECODES", str(max(2, (os.cpu_count() or 4)))))
DECODE_SEMAPHORE = asyncio.Semaphore(MAX_CONCURRENT_DECODES)

_ACTIVE_SESSION_IDS: Set[str] = set()

# Survive mid-call STT reconnects (gateway auto-reconnect, uvicorn reload):
_PERSISTENT_SESSIONS: dict = {}
_PERSISTENT_SESSIONS_TS: dict = {}
_SESSION_TTL_S = 300

def _get_or_create_session(session_id: str, agreement: int) -> SessionState:
    now = time.time()
    expired = [k for k, ts in _PERSISTENT_SESSIONS_TS.items() if now - ts > _SESSION_TTL_S]
    for k in expired:
        _PERSISTENT_SESSIONS.pop(k, None)
        _PERSISTENT_SESSIONS_TS.pop(k, None)
    if session_id in _PERSISTENT_SESSIONS:
        _PERSISTENT_SESSIONS_TS[session_id] = now
        return _PERSISTENT_SESSIONS[session_id]
    s = SessionState(
        session_id=session_id,
        agreement_n=agreement,
        vad_threshold=vad_threshold,
        hangover_ms=hangover_ms,
        preroll_ms=preroll_ms,
        max_len_ms=max_len_ms,
    )
    _PERSISTENT_SESSIONS[session_id] = s
    _PERSISTENT_SESSIONS_TS[session_id] = now
    return s

def _touch_session(session_id: str):
    if session_id in _PERSISTENT_SESSIONS_TS:
        _PERSISTENT_SESSIONS_TS[session_id] = time.time()

@app.get("/metrics")
async def metrics():
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "engine": asr_wrapper.default_engine_type,
        "model_name": asr_wrapper.model_size,
        "asr_loaded": asr_wrapper.model is not None,
        "vad_loaded": vad_wrapper.model is not None,
        "active_sessions": len(_ACTIVE_SESSION_IDS),
        "max_concurrent_decodes": MAX_CONCURRENT_DECODES
    }

async def decode_worker(
    websocket: WebSocket,
    session: SessionState,
    queue: asyncio.Queue,
    stop_event: asyncio.Event
):
    """
    Dedicated worker task running off the WebSocket receive loop.
    Consumes finished VAD segments, limits concurrent CPU usage,
    computes RTF, and emits final transcripts asynchronously.
    """
    while not stop_event.is_set():
        try:
            item = await asyncio.wait_for(queue.get(), timeout=0.2)
        except asyncio.TimeoutError:
            continue
        except asyncio.CancelledError:
            break

        if item is None:  # Sentinel to exit
            break

        segment = item["segment"]
        t_capture = item["t_capture"]
        utt_id = item["utt_id"]
        src_lang = item["src_lang"]
        stt_model = item.get("stt_model")

        audio_duration_ms = (len(segment) / 16000.0) * 1000.0
        t0 = time.perf_counter()

        try:
            async with DECODE_SEMAPHORE:
                with ASR_DURATION.labels(model=asr_wrapper.model_size, chunk_ms="final").time():
                    asr_result = await asyncio.to_thread(
                        asr_wrapper.transcribe,
                        segment,
                        src_lang,
                        True,
                        stt_model
                    )

            decode_time_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            rtf = round((decode_time_ms / 1000.0) / (audio_duration_ms / 1000.0), 4) if audio_duration_ms > 0 else 0.0
            engine_name = asr_result.get("engine", asr_wrapper.model_size)
            LAST_SEGMENT_RTF.labels(engine=engine_name).set(rtf)

            final_text = (asr_result.get("text", "") or "").strip()

            # Structured logging: decode time vs audio duration and RTF per segment
            print(json.dumps({
                "sessionId": session.session_id,
                "uttId": utt_id,
                "stage": "asr_final",
                "audioDurationMs": round(audio_duration_ms, 1),
                "decodeMs": decode_time_ms,
                "rtf": rtf,
                "engine": engine_name,
                "text": final_text
            }))

            if final_text and len(final_text) >= 2:
                COMMITTED_UTTERANCES.inc()
                final_msg = {
                    "type": "final",
                    "uttId": utt_id,
                    "text": final_text,
                    "words": asr_result.get("words", []),
                    "tCapture": t_capture,
                    "tFinal": int(time.time() * 1000),
                    "decodeMs": decode_time_ms,
                    "rtf": rtf
                }
                try:
                    await websocket.send_text(json.dumps(final_msg))
                except Exception:
                    break

        except Exception as e:
            print(f"[STT] Error during segment decoding: {e}")
        finally:
            queue.task_done()

@app.websocket("/stream")
async def websocket_stream(websocket: WebSocket):
    # Admission control: reject if server is saturated
    if len(_ACTIVE_SESSION_IDS) >= MAX_ACTIVE_SESSIONS:
        await websocket.close(code=1013, reason="Server capacity saturated, try again later")
        return

    await websocket.accept()
    session = SessionState(
        session_id="uninitialized",
        agreement_n=agreement_n,
        vad_threshold=vad_threshold,
        hangover_ms=hangover_ms,
        preroll_ms=preroll_ms,
        max_len_ms=max_len_ms,
    )
    session_is_bound = False
    bound_sid = f"temp_{id(websocket)}"
    _ACTIVE_SESSION_IDS.add(bound_sid)
    ACTIVE_SESSIONS_GAUGE.set(len(_ACTIVE_SESSION_IDS))

    # Bounded queue: cap to 3 segments max to bound memory and drop on purpose under extreme lag
    decode_queue: asyncio.Queue = asyncio.Queue(maxsize=3)
    stop_event = asyncio.Event()
    worker_task = asyncio.create_task(decode_worker(websocket, session, decode_queue, stop_event))

    is_echo_gated = False

    try:
        while True:
            # WebSocket receive loop: strictly receives frames, runs lightweight VAD, and pushes to queue
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break

            if "bytes" in message and message["bytes"] is not None:
                raw_bytes = message["bytes"]
                if len(raw_bytes) < 13:
                    continue

                try:
                    msg_type, seq, t_capture = struct.unpack_from("<BId", raw_bytes, 0)
                except struct.error:
                    continue
                if msg_type != 0x01:
                    continue

                pcm_bytes = raw_bytes[13:]
                if len(pcm_bytes) == 0 or len(pcm_bytes) % 2 != 0:
                    continue

                try:
                    pcm_data = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
                except (ValueError, BufferError):
                    continue

                now_ms = int(time.time() * 1000)

                # If echo gate is active (e.g. agent is currently speaking and no caller barge-in),
                # drop audio from queuing to prevent transcribing the bot's own voice
                if is_echo_gated:
                    continue

                # 1. Fast VAD evaluation (~0.05ms)
                with VAD_DURATION.time():
                    is_speech, prob = vad_wrapper.is_speech(pcm_data)
                if is_speech:
                    session.last_speech_ms = now_ms

                # 2. Feed segmenter (silence hangover cut)
                finalized_segment = session.segmenter.on_frame(
                    pcm_data,
                    prob=prob,
                    t_ms=now_ms,
                    frame_ms=int(len(pcm_data) / 16.0)
                )

                # 3. If speech segment was finalized:
                if finalized_segment is not None and len(finalized_segment) >= 1600:  # >= 100ms
                    # Bound CPU work: cap finals to last 15s max (240k samples)
                    if len(finalized_segment) > 16000 * 15:
                        finalized_segment = finalized_segment[-16000 * 15:]

                    # Bounded queue: discard oldest segment if queue is full rather than letting lag grow
                    if decode_queue.full():
                        try:
                            discarded = decode_queue.get_nowait()
                            decode_queue.task_done()
                            DROPPED_SEGMENTS.inc()
                            print(json.dumps({
                                "sessionId": session.session_id,
                                "stage": "asr_dropped_queue_overflow",
                                "tCapture": session.last_capture_time_ms
                            }))
                        except (asyncio.QueueEmpty, ValueError):
                            pass

                    # Enqueue segment non-blockingly
                    item = {
                        "segment": finalized_segment,
                        "t_capture": session.last_capture_time_ms,
                        "utt_id": session.current_utt_id,
                        "src_lang": session.src_lang,
                        "stt_model": getattr(session, "stt_model", None)
                    }
                    decode_queue.put_nowait(item)

                    session.next_utterance()
                    _touch_session(session.session_id)

            elif "text" in message and message["text"] is not None:
                try:
                    payload = json.loads(message["text"])
                    msg_type = payload.get("type")

                    if msg_type == "session_start":
                        raw_sid = str(payload.get("sessionId", "s_default"))
                        clean_sid = raw_sid if re.match(r'^[a-zA-Z0-9_\-]{1,128}$', raw_sid) else "s_default"

                        if bound_sid in _ACTIVE_SESSION_IDS:
                            _ACTIVE_SESSION_IDS.remove(bound_sid)
                        bound_sid = clean_sid
                        _ACTIVE_SESSION_IDS.add(bound_sid)
                        ACTIVE_SESSIONS_GAUGE.set(len(_ACTIVE_SESSION_IDS))

                        if not session_is_bound or session.session_id == "uninitialized":
                            persisted = _get_or_create_session(clean_sid, agreement_n)
                            session = persisted
                            session_is_bound = True
                        session.session_id = clean_sid
                        _touch_session(clean_sid)

                        raw_lang = str(payload.get("srcLang", "ja")).lower().strip()
                        ALLOWED_LANGUAGES = {"ja", "en", "zh", "ko", "es", "fr", "de", "it", "pt", "ru"}
                        session.src_lang = raw_lang if raw_lang in ALLOWED_LANGUAGES else "ja"
                        session.stt_model = payload.get("sttModel") or payload.get("sttEngine")

                        try:
                            start_utt = int(payload.get("startUttId", 1))
                            if 1 <= start_utt <= 100000:
                                session.current_utt_id = max(session.current_utt_id, start_utt)
                        except (ValueError, TypeError):
                            pass

                        print(f"[STT] Started session {session.session_id} (srcLang: {session.src_lang}, engine: {asr_wrapper.default_engine_type})")

                    elif msg_type == "echo_gate":
                        # Support echo gate control directly from gateway/telephony
                        is_echo_gated = bool(payload.get("active", False))

                    elif msg_type == "session_stop":
                        leftover = session.segmenter.force_finalize()
                        if leftover is not None and len(leftover) >= 1600:
                            if not decode_queue.full():
                                decode_queue.put_nowait({
                                    "segment": leftover,
                                    "t_capture": session.last_capture_time_ms,
                                    "utt_id": session.current_utt_id,
                                    "src_lang": session.src_lang,
                                    "stt_model": getattr(session, "stt_model", None)
                                })
                        print(f"[STT] Stopped session {session.session_id}")

                except Exception as ex:
                    print(f"[STT] Control frame error: {ex}")

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[STT] Stream exception: {e}")
    finally:
        stop_event.set()
        worker_task.cancel()
        if bound_sid in _ACTIVE_SESSION_IDS:
            _ACTIVE_SESSION_IDS.remove(bound_sid)
        ACTIVE_SESSIONS_GAUGE.set(len(_ACTIVE_SESSION_IDS))
        print(f"[STT] Session {session.session_id} disconnected.")
