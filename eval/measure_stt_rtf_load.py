#!/usr/bin/env python3
"""
Benchmark script to measure ASR Real-Time Factor (RTF) and latency under load.
Simulates multiple concurrent audio streams sending 16kHz audio segments
to verify RTF << 0.5 (safe threshold to prevent queue overflows under overlap).
"""

import os
import sys
import time
import json
import asyncio
import numpy as np
import soundfile as sf
from typing import List, Dict, Any

# Ensure services/stt is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "stt")))
from asr import ASRModelWrapper

SAMPLE_WAV = os.path.abspath(os.path.join(os.path.dirname(__file__), "datasets", "sample_ja_16k.wav"))

def benchmark_direct_engine(num_concurrent: int = 5, runs_per_worker: int = 4) -> Dict[str, Any]:
    """
    Direct multi-threaded engine benchmark to measure raw RTF under concurrent load.
    """
    print(f"\n=================================================================")
    print(f"1. Direct Engine Concurrency Benchmark (Threads: {num_concurrent}, Runs/thread: {runs_per_worker})")
    print(f"=================================================================")

    if not os.path.exists(SAMPLE_WAV):
        raise FileNotFoundError(f"Sample WAV not found at {SAMPLE_WAV}")

    audio_data, sr = sf.read(SAMPLE_WAV)
    if sr != 16000:
        raise ValueError(f"Expected 16kHz audio, got {sr}Hz")
    audio_f32 = audio_data.astype(np.float32)
    audio_duration_s = len(audio_f32) / 16000.0

    wrapper = ASRModelWrapper()
    print(f"Active Engine: {wrapper.default_engine_type} ({wrapper.model_size})")
    print(f"Sample Duration: {audio_duration_s:.2f}s ({len(audio_f32)} samples)")

    # Warm-up
    _ = wrapper.transcribe(audio_f32, language="ja")

    import concurrent.futures

    latencies_ms: List[float] = []
    rtfs: List[float] = []
    results: List[str] = []

    t_start = time.perf_counter()

    def worker_run(worker_id: int):
        worker_lats = []
        worker_rtfs = []
        for _ in range(runs_per_worker):
            t0 = time.perf_counter()
            res = wrapper.transcribe(audio_f32, language="ja")
            dt_ms = (time.perf_counter() - t0) * 1000.0
            rtf = (dt_ms / 1000.0) / audio_duration_s
            worker_lats.append(dt_ms)
            worker_rtfs.append(rtf)
            if worker_id == 0 and len(results) == 0:
                results.append(res.get("text", ""))
        return worker_lats, worker_rtfs

    with concurrent.futures.ThreadPoolExecutor(max_workers=num_concurrent) as executor:
        futures = [executor.submit(worker_run, i) for i in range(num_concurrent)]
        for fut in concurrent.futures.as_completed(futures):
            w_lats, w_rtfs = fut.result()
            latencies_ms.extend(w_lats)
            rtfs.extend(w_rtfs)

    total_wall_time = time.perf_counter() - t_start
    total_audio_processed_s = len(latencies_ms) * audio_duration_s

    latencies_ms.sort()
    rtfs.sort()

    p50_lat = latencies_ms[len(latencies_ms) // 2]
    p95_lat = latencies_ms[int(len(latencies_ms) * 0.95)]
    mean_lat = sum(latencies_ms) / len(latencies_ms)
    p50_rtf = rtfs[len(rtfs) // 2]
    p95_rtf = rtfs[int(len(rtfs) * 0.95)]
    mean_rtf = sum(rtfs) / len(rtfs)
    throughput_rtf = total_wall_time / total_audio_processed_s

    print(f"\n--- Benchmark Results ---")
    print(f"Total Segments Decoded : {len(latencies_ms)}")
    print(f"Total Audio Duration   : {total_audio_processed_s:.2f}s")
    print(f"Total Wall Clock Time  : {total_wall_time:.2f}s")
    print(f"Decode Latency (mean)  : {mean_lat:.1f} ms")
    print(f"Decode Latency (p50)   : {p50_lat:.1f} ms")
    print(f"Decode Latency (p95)   : {p95_lat:.1f} ms")
    print(f"RTF (mean)             : {mean_rtf:.4f}")
    print(f"RTF (p50)              : {p50_rtf:.4f}")
    print(f"RTF (p95)              : {p95_rtf:.4f}")
    print(f"Throughput Factor      : {throughput_rtf:.4f} (aggregate wall-time / total audio)")
    print(f"Transcript Sample      : {results[0] if results else ''}")

    is_safe = p95_rtf < 0.5
    status_str = "SAFE (RTF << 0.5, zero queue backlog under overlap)" if is_safe else "UNSAFE (RTF >= 0.5, queue overflow danger)"
    print(f"Verdict                : {status_str}")

    return {
        "engine": wrapper.default_engine_type,
        "model": wrapper.model_size,
        "sample_duration_s": audio_duration_s,
        "p50_latency_ms": p50_lat,
        "p95_latency_ms": p95_lat,
        "mean_rtf": mean_rtf,
        "p50_rtf": p50_rtf,
        "p95_rtf": p95_rtf,
        "throughput_rtf": throughput_rtf,
        "is_safe": is_safe
    }

async def benchmark_websocket_service(
    service_url: str = "ws://localhost:8001/stream",
    num_sessions: int = 4
):
    """
    WebSocket client simulation: streams binary 16kHz PCM audio frames over WebSocket
    to verify real-time network protocol streaming and segment finalization.
    """
    import websockets
    import struct

    print(f"\n=================================================================")
    print(f"2. WebSocket Service Streaming Benchmark ({num_sessions} Concurrent Streams -> {service_url})")
    print(f"=================================================================")

    if not os.path.exists(SAMPLE_WAV):
        return

    audio_data, sr = sf.read(SAMPLE_WAV)
    audio_f32 = audio_data.astype(np.float32)
    # Convert to 16-bit PCM
    pcm16 = (np.clip(audio_f32, -1.0, 1.0) * 32767).astype(np.int16).tobytes()

    # Frame size: 50ms at 16kHz = 800 samples = 1600 bytes
    frame_bytes = 1600

    async def stream_client(client_id: int):
        session_id = f"bench_sess_{client_id}_{int(time.time()*1000)}"
        finals = []
        try:
            async with websockets.connect(service_url) as ws:
                # 1. Handshake
                await ws.send(json.dumps({
                    "type": "session_start",
                    "sessionId": session_id,
                    "srcLang": "ja",
                    "sampleRate": 16000
                }))

                async def receiver():
                    try:
                        async for msg in ws:
                            if isinstance(msg, str):
                                data = json.loads(msg)
                                if data.get("type") == "final":
                                    finals.append(data)
                    except Exception:
                        pass

                recv_task = asyncio.create_task(receiver())

                # 2. Stream audio chunks at real-time rate (50ms interval)
                seq = 0
                for offset in range(0, len(pcm16), frame_bytes):
                    chunk = pcm16[offset:offset+frame_bytes]
                    t_capture = time.time() * 1000.0
                    header = struct.pack("<BId", 0x01, seq, t_capture)
                    seq += 1
                    await ws.send(header + chunk)
                    await asyncio.sleep(0.045)  # simulate real-time audio rate

                # Stream 1 second of trailing silence to trigger VAD hangover cut
                silence_frame = bytes(frame_bytes)
                for _ in range(20):
                    t_capture = time.time() * 1000.0
                    header = struct.pack("<BId", 0x01, seq, t_capture)
                    seq += 1
                    await ws.send(header + silence_frame)
                    await asyncio.sleep(0.045)

                # Stop session
                await ws.send(json.dumps({"type": "session_stop"}))
                await asyncio.sleep(0.5)
                recv_task.cancel()

        except Exception as e:
            print(f"[Client {client_id}] Connection error: {e}")

        return finals

    tasks = [stream_client(i) for i in range(num_sessions)]
    results = await asyncio.gather(*tasks)

    total_finals = sum(len(r) for r in results)
    print(f"\n--- WebSocket Results ---")
    print(f"Total concurrent streams : {num_sessions}")
    print(f"Final utterances emitted : {total_finals}")
    for idx, r in enumerate(results):
        if r:
            f0 = r[0]
            print(f" Stream #{idx}: text='{f0.get('text')}' | decodeMs={f0.get('decodeMs')}ms | RTF={f0.get('rtf')}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="STT RTF Benchmark")
    parser.add_argument("--direct-only", action="store_true", help="Run only in-process direct benchmark")
    parser.add_argument("--concurrency", type=int, default=5, help="Number of concurrent sessions")
    args = parser.parse_args()

    # Always run direct engine benchmark
    res = benchmark_direct_engine(num_concurrent=args.concurrency, runs_per_worker=4)

    if not args.direct_only:
        # Check if service is running on port 8001
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.5)
        is_running = sock.connect_ex(('127.0.0.1', 8001)) == 0
        sock.close()
        if is_running:
            asyncio.run(benchmark_websocket_service(num_sessions=args.concurrency))
        else:
            print("\nNote: STT service is not currently running on port 8001; skipping live WebSocket streaming test.")
            print("To test WebSocket live streaming: start the service with `uvicorn services.stt.main:app --port 8001`.")
