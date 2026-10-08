"""
M0 Foundation Check: Run a Japanese .wav through the STT pipeline and verify stage timestamps.
"""
import os
import sys
import time

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
import soundfile as sf
import numpy as np

# Ensure services/stt is on path
stt_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "stt"))
sys.path.insert(0, stt_dir)

from vad import SileroVADWrapper
from asr import ASRModelWrapper
from session_state import SessionState

def test_stt_foundation():
    audio_path = os.path.join(os.path.dirname(__file__), "datasets", "sample_ja_16k.wav")
    assert os.path.exists(audio_path), f"Audio file not found: {audio_path}"
    
    data, sr = sf.read(audio_path)
    assert sr == 16000, f"Expected 16kHz, got {sr}"
    if data.dtype != np.float32:
        data = data.astype(np.float32)

    print(f"[M0 Test] Loaded {audio_path}: {len(data)} samples ({len(data)/16000:.2f}s)")

    # Initialize VAD and ASR (using tiny/base or large-v3-turbo with cpu fallback)
    vad = SileroVADWrapper(threshold=0.5, sample_rate=16000)
    model_size = os.getenv("STT_MODEL_SIZE", "tiny")
    asr = ASRModelWrapper(model_size=model_size, device="cpu", compute_type="int8")

    session = SessionState(session_id="m0_foundation_test", agreement_n=2)
    session.src_lang = "ja"

    frame_size = 512 # 32ms frames at 16kHz
    t_start = int(time.time() * 1000)
    logged_events = []

    print("[M0 Test] Streaming audio chunks through VAD and Segmenter...")
    for idx in range(0, len(data), frame_size):
        chunk = data[idx:idx + frame_size]
        t_capture = t_start + int(idx / 16.0)

        # 1. VAD check
        t_vad_start = time.perf_counter()
        is_speech, prob = vad.is_speech(chunk)
        t_vad_end = time.perf_counter()

        now_ms = int(time.time() * 1000)
        finalized_segment = session.segmenter.on_frame(
            chunk,
            prob=prob,
            t_ms=now_ms,
            frame_ms=int(len(chunk) / 16.0)
        )
        session.append_audio(chunk, t_capture)

        if finalized_segment is not None and len(finalized_segment) > 1600:
            t_asr_start = time.perf_counter()
            result = asr.transcribe(finalized_segment, language="ja", word_timestamps=True)
            t_asr_end = time.perf_counter()

            event = {
                "stage": "asr_final",
                "uttId": session.current_utt_id,
                "text": result["text"],
                "words_count": len(result["words"]),
                "tCapture": session.last_capture_time_ms,
                "tFinal": int(time.time() * 1000),
                "asrDurationMs": round((t_asr_end - t_asr_start) * 1000, 2),
                "vadDurationUs": round((t_vad_end - t_vad_start) * 1000000, 2)
            }
            logged_events.append(event)
            print(f"[M0 Event] {event}")
            session.next_utterance()

    # Flush leftover audio
    leftover = session.segmenter.force_finalize()
    if leftover is not None and len(leftover) > 1600:
        t_asr_start = time.perf_counter()
        result = asr.transcribe(leftover, language="ja", word_timestamps=True)
        t_asr_end = time.perf_counter()
        event = {
            "stage": "asr_final_flush",
            "uttId": session.current_utt_id,
            "text": result["text"],
            "words_count": len(result["words"]),
            "tCapture": session.last_capture_time_ms,
            "tFinal": int(time.time() * 1000),
            "asrDurationMs": round((t_asr_end - t_asr_start) * 1000, 2),
        }
        logged_events.append(event)
        print(f"[M0 Event] {event}")

    assert len(logged_events) > 0, "No ASR events generated from Japanese wav!"
    print(f"\n[M0 SUCCESS] Foundation check passed! Transcribed text: '{logged_events[0]['text']}'")

if __name__ == "__main__":
    test_stt_foundation()
