"""
Voice TTS Service.
Provides streaming text-to-speech synthesis (16kHz 16-bit mono PCM).
Supports:
1. Local offline neural TTS via Sherpa-ONNX (Piper/VITS models).
2. Streaming Edge-TTS with resilient fallback and timeout protection.
"""

import os
import io
import time
import asyncio
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

app = FastAPI(title="Voice TTS Streaming Service", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODELS_DIR = os.path.abspath(os.getenv("TTS_MODELS_DIR", os.path.join(os.path.dirname(__file__), "models")))
_local_tts_instance = None

def _get_local_tts():
    """Lazily initialize Sherpa-ONNX OfflineTts if model files are found."""
    global _local_tts_instance
    if _local_tts_instance is not None:
        return _local_tts_instance

    try:
        import sherpa_onnx
        # Look for piper-vits models in MODELS_DIR
        for root, dirs, files in os.walk(MODELS_DIR):
            onnx_files = [f for f in files if f.endswith(".onnx")]
            tokens_files = [f for f in files if f == "tokens.txt"]
            if onnx_files and tokens_files:
                model_path = os.path.join(root, onnx_files[0])
                tokens_path = os.path.join(root, tokens_files[0])
                data_dir = os.path.join(root, "espeak-ng-data")
                if not os.path.exists(data_dir):
                    data_dir = ""

                vits_config = sherpa_onnx.OfflineTtsVitsModelConfig(
                    model=model_path,
                    tokens=tokens_path,
                    data_dir=data_dir
                )
                model_config = sherpa_onnx.OfflineTtsModelConfig(
                    vits=vits_config,
                    num_threads=int(os.getenv("TTS_CPU_THREADS", "4"))
                )
                tts_config = sherpa_onnx.OfflineTtsConfig(model=model_config)
                print(f"[TTS] Initializing local Sherpa-ONNX TTS from {model_path}...")
                _local_tts_instance = sherpa_onnx.OfflineTts(tts_config)
                print("[TTS] Local Sherpa-ONNX TTS ready.")
                return _local_tts_instance
    except Exception as e:
        print(f"[TTS] Local TTS initialization note: {e}")
    return None

class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    voice: str = Field("ja-JP-NanamiNeural", pattern=r"^[a-zA-Z0-9\-_]{1,64}$")
    sample_rate: int = Field(16000, ge=8000, le=48000)

@app.get("/health")
async def health():
    local_tts = _get_local_tts()
    return {
        "status": "ok",
        "service": "tts",
        "has_local_tts": local_tts is not None,
        "default_engine": "sherpa-onnx" if local_tts is not None else "edge-tts"
    }

@app.post("/synthesize")
async def synthesize(req: SynthesizeRequest):
    """
    Synthesize text into a streaming sequence of 16-bit mono PCM chunks.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    async def pcm_stream_generator():
        target_sr = req.sample_rate

        # 1. Attempt local offline TTS first if available or configured
        local_tts = _get_local_tts()
        if local_tts is not None and (os.getenv("TTS_PREFER_LOCAL", "1") == "1" or not req.voice.startswith("ja-")):
            try:
                from scipy import signal
                audio = await asyncio.to_thread(local_tts.generate, req.text, 0, 1.0)
                data = np.array(audio.samples, dtype=np.float32)
                in_sr = audio.sample_rate
                if in_sr != target_sr:
                    num_samples = int(len(data) * target_sr / in_sr)
                    data = signal.resample(data, num_samples).astype(np.float32)

                pcm16 = (np.clip(data, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
                frame_bytes = int(target_sr * 0.05 * 2)
                for i in range(0, len(pcm16), frame_bytes):
                    yield pcm16[i:i + frame_bytes]
                    await asyncio.sleep(0.005)
                return
            except Exception as ex:
                print(f"[TTS] Local TTS generation failed, trying Edge-TTS: {ex}")

        # 2. Attempt Edge-TTS streaming synthesis with timeout protection
        try:
            import edge_tts
            import soundfile as sf
            from scipy import signal

            ALLOWED_PREFIXES = ("ja-", "en-")
            voice = req.voice if req.voice.startswith(ALLOWED_PREFIXES) else "ja-JP-NanamiNeural"
            communicate = edge_tts.Communicate(req.text, voice=voice)

            async def _stream_edge():
                buf = bytearray()
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        buf.extend(chunk["data"])
                return buf

            # Guard edge-tts stream with a 5s timeout to prevent hanging when network/endpoints stall
            audio_bytes = await asyncio.wait_for(_stream_edge(), timeout=5.0)

            if audio_bytes:
                data, in_sr = sf.read(io.BytesIO(audio_bytes))
                if data.ndim > 1:
                    data = data.mean(axis=1)

                if in_sr != target_sr:
                    num_samples = int(len(data) * target_sr / in_sr)
                    data = signal.resample(data, num_samples).astype(np.float32)

                pcm16 = (np.clip(data, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
                frame_bytes = int(target_sr * 0.05 * 2)
                for i in range(0, len(pcm16), frame_bytes):
                    yield pcm16[i:i + frame_bytes]
                    await asyncio.sleep(0.005)
                return
        except Exception as ex:
            print(f"[TTS] Notice: Edge-TTS synthesis failed or timed out: {ex}")

        # 3. Last-resort fallback: Generate soft modulated tone speech envelope
        duration_s = max(0.4, min(len(req.text) * 0.08, 3.0))
        total_samples = int(target_sr * duration_s)
        t = np.linspace(0, duration_s, total_samples, endpoint=False)
        waveform = 0.2 * np.sin(2 * np.pi * 320 * t) * np.sin(np.pi * t / duration_s)
        pcm16 = (waveform * 32767).astype(np.int16).tobytes()

        frame_bytes = int(target_sr * 0.05 * 2)
        for i in range(0, len(pcm16), frame_bytes):
            yield pcm16[i:i + frame_bytes]
            await asyncio.sleep(0.005)

    return StreamingResponse(pcm_stream_generator(), media_type="audio/pcm")
