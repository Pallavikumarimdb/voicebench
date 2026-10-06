#!/usr/bin/env python3
"""
Single-command service orchestrator for Voice AI Infrastructure.
Supports starting:
  - Voice Agent pipeline (Agent + TTS + STT + Gateway + Client)
  - Voice Translator pipeline (MT + TTS + STT + Gateway + Client)
  - Full pipeline (All services concurrently)

Usage:
  python scripts/start_all.py --mode agent
  python scripts/start_all.py --mode translator
  python scripts/start_all.py --mode all
  python scripts/start_all.py --skip-client
"""

import os
import sys
import time
import socket
import signal
import argparse
import subprocess
import threading
from typing import Dict, List, Optional

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
IS_WINDOWS = sys.platform.startswith("win")

# ANSI color codes
COLORS = {
    "AGENT": "\033[96m",     # Cyan
    "TTS": "\033[95m",       # Magenta
    "STT": "\033[93m",       # Yellow
    "MT": "\033[94m",        # Blue
    "GATEWAY": "\033[92m",   # Green
    "CLIENT": "\033[97m",    # White / Bright
    "RESET": "\033[0m",
    "BOLD": "\033[1m",
    "WARN": "\033[91m",
}

def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            return s.connect_ex((host, port)) == 0
    except Exception:
        return False

def wait_for_port(port: int, timeout: float = 60.0, host: str = "127.0.0.1") -> bool:
    start_time = time.time()
    while time.time() - start_time < timeout:
        if is_port_in_use(port, host):
            return True
        time.sleep(0.5)
    return False

def get_npm_cmd() -> str:
    return "npm.cmd" if IS_WINDOWS else "npm"

class ProcessManager:
    def __init__(self):
        self.processes: Dict[str, subprocess.Popen] = []
        self._lock = threading.Lock()
        self.shutting_down = False

    def start_service(self, name: str, cmd: List[str], cwd: str, env_vars: Optional[Dict[str, str]] = None):
        color = COLORS.get(name, "")
        reset = COLORS["RESET"]
        prefix = f"{color}[{name:<8}]{reset} "

        merged_env = os.environ.copy()
        merged_env["PYTHONUNBUFFERED"] = "1"
        # Ensure service folder is in PYTHONPATH for local module resolution
        if "PYTHONPATH" in merged_env:
            merged_env["PYTHONPATH"] = f"{cwd}{os.pathsep}{ROOT_DIR}{os.pathsep}{merged_env['PYTHONPATH']}"
        else:
            merged_env["PYTHONPATH"] = f"{cwd}{os.pathsep}{ROOT_DIR}"

        if env_vars:
            merged_env.update(env_vars)

        try:
            p = subprocess.Popen(
                cmd,
                cwd=cwd,
                env=merged_env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True,
            )
            with self._lock:
                self.processes.append((name, p))

            def stream_output():
                for line in iter(p.stdout.readline, ''):
                    if self.shutting_down:
                        break
                    sys.stdout.write(f"{prefix}{line}")
                    sys.stdout.flush()
                p.stdout.close()

            t = threading.Thread(target=stream_output, daemon=True)
            t.start()

        except Exception as e:
            print(f"{COLORS['WARN']}[ERROR] Failed to start {name}: {e}{reset}")

    def shutdown(self):
        self.shutting_down = True
        print(f"\n{COLORS['BOLD']}Stopping all services...{COLORS['RESET']}")
        with self._lock:
            for name, p in self.processes:
                try:
                    if p.poll() is None:
                        if IS_WINDOWS:
                            subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        else:
                            p.terminate()
                except Exception:
                    pass
        print("All services stopped.")

def main():
    parser = argparse.ArgumentParser(description="Voice AI Infrastructure Multi-Service Runner")
    parser.add_argument(
        "--mode",
        choices=["agent", "translator", "all"],
        default="all",
        help="Service profile to run (agent, translator, or all). Default: all",
    )
    parser.add_argument(
        "--skip-client",
        action="store_true",
        help="Do not start the client Vite dev server (useful if already running)",
    )
    args = parser.parse_args()

    mode = args.mode.lower()
    pm = ProcessManager()

    def handle_sigint(signum, frame):
        pm.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_sigint)
    signal.signal(signal.SIGTERM, handle_sigint)

    npm_bin = get_npm_cmd()
    py_bin = sys.executable

    print(f"\n{COLORS['BOLD']}============================================================{COLORS['RESET']}")
    print(f"{COLORS['BOLD']}  Voice AI Infrastructure - Starting Pipeline in [{mode.upper()}] Mode{COLORS['RESET']}")
    print(f"{COLORS['BOLD']}============================================================{COLORS['RESET']}\n")

    # 1. Agent Service (port 8003)
    if mode in ("agent", "all"):
        if is_port_in_use(8003):
            print(f"{COLORS['WARN']}⚠ Port 8003 is already active (keeping existing Agent service).{COLORS['RESET']}")
        else:
            print("🚀 Starting Agent Service on http://localhost:8003 ...")
            pm.start_service(
                "AGENT",
                [py_bin, "-m", "uvicorn", "services.agent.app.main:app", "--host", "0.0.0.0", "--port", "8003", "--reload"],
                cwd=ROOT_DIR,
            )

    # 2. TTS Service (port 8004)
    if mode in ("agent", "translator", "all"):
        if is_port_in_use(8004):
            print(f"{COLORS['WARN']}⚠ Port 8004 is already active (keeping existing TTS service).{COLORS['RESET']}")
        else:
            print("🚀 Starting TTS Service on http://localhost:8004 ...")
            pm.start_service(
                "TTS",
                [py_bin, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8004", "--reload"],
                cwd=os.path.join(ROOT_DIR, "services", "tts"),
            )

    # 3. STT Service (port 8001)
    if mode in ("agent", "translator", "all"):
        if is_port_in_use(8001):
            print(f"{COLORS['WARN']}⚠ Port 8001 is already active (keeping existing STT service).{COLORS['RESET']}")
        else:
            print("🚀 Starting STT Service on ws://localhost:8001/stream ...")
            pm.start_service(
                "STT",
                [py_bin, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--reload"],
                cwd=os.path.join(ROOT_DIR, "services", "stt"),
            )

    # 4. MT Service (port 8002)
    if mode in ("translator", "all"):
        if is_port_in_use(8002):
            print(f"{COLORS['WARN']}⚠ Port 8002 is already active (keeping existing MT service).{COLORS['RESET']}")
        else:
            print("🚀 Starting MT Service on http://localhost:8002 ...")
            pm.start_service(
                "MT",
                [py_bin, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002", "--reload"],
                cwd=os.path.join(ROOT_DIR, "services", "mt"),
            )

    # Wait for STT and Agent backend services to be ready
    if mode in ("agent", "translator", "all"):
        if not is_port_in_use(8001):
            sys.stdout.write("⏳ Waiting for STT Whisper model to initialize...")
            sys.stdout.flush()
            if wait_for_port(8001, timeout=90.0):
                print(f" {COLORS['BOLD']}✓ STT Ready!{COLORS['RESET']}")
            else:
                print(f" {COLORS['WARN']}⚠ STT wait timed out; starting Gateway anyway.{COLORS['RESET']}")

    # 5. Gateway (port 8443)
    if is_port_in_use(8443):
        print(f"{COLORS['WARN']}⚠ Port 8443 is already active (keeping existing Gateway).{COLORS['RESET']}")
    else:
        print(f"🚀 Starting Gateway on http://localhost:8443 (mode: {mode}) ...")
        pm.start_service(
            "GATEWAY",
            [npm_bin, "run", "dev"],
            cwd=os.path.join(ROOT_DIR, "gateway"),
            env_vars={"GATEWAY_MODE": "agent" if mode == "agent" else "translate"},
        )

    # 6. Client (port 5173)
    if not args.skip_client:
        if is_port_in_use(5173):
            print(f"{COLORS['WARN']}⚠ Port 5173 is already active (Client Vite dev server already running).{COLORS['RESET']}")
        else:
            print("🚀 Starting Client UI on http://localhost:5173 ...")
            pm.start_service(
                "CLIENT",
                [npm_bin, "run", "dev"],
                cwd=os.path.join(ROOT_DIR, "client"),
            )

    print(f"\n{COLORS['BOLD']}------------------------------------------------------------{COLORS['RESET']}")
    print(f"{COLORS['BOLD']}Dashboard & Endpoint URLs:{COLORS['RESET']}")
    print(f"  • Web Client UI:          http://localhost:5173")
    print(f"  • Gateway Server:         http://localhost:8443 / ws://localhost:8443/session")
    if mode in ("agent", "all"):
        print(f"  • Agent Brain Service:    http://localhost:8003 (docs: http://localhost:8003/docs)")
    if mode in ("agent", "translator", "all"):
        print(f"  • TTS Streaming Service:  http://localhost:8004 (docs: http://localhost:8004/docs)")
        print(f"  • STT Whisper Service:    ws://localhost:8001/stream")
    if mode in ("translator", "all"):
        print(f"  • MT Translation Service: http://localhost:8002 (docs: http://localhost:8002/docs)")
    print(f"{COLORS['BOLD']}------------------------------------------------------------{COLORS['RESET']}")
    print("Press Ctrl+C to stop all services.\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pm.shutdown()

if __name__ == "__main__":
    main()
