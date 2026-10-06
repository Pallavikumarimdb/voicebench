"""
Script to download lightweight Sherpa-ONNX speech models for CPU inference:
1. Alibaba SenseVoice-Small (Multilingual: EN, JA, ZH, KO, YUE + ITN)
2. NVIDIA NeMo Parakeet-CTC (English Conformer-CTC)
"""

import os
import urllib.request

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

MODELS = {
    "sense-voice": {
        "dir": os.path.join(MODELS_DIR, "sense-voice"),
        "files": {
            "model.int8.onnx": "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx",
            "tokens.txt": "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/tokens.txt",
        }
    },
    "parakeet-ctc": {
        "dir": os.path.join(MODELS_DIR, "parakeet-ctc"),
        "files": {
            "model.int8.onnx": "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-ctc-en-conformer-large/resolve/main/model.int8.onnx",
            "tokens.txt": "https://huggingface.co/csukuangfj/sherpa-onnx-nemo-ctc-en-conformer-large/resolve/main/tokens.txt",
        }
    }
}

def download_file(url: str, dest_path: str):
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
        print(f"  [OK] Already exists: {os.path.basename(dest_path)} ({os.path.getsize(dest_path) // 1024} KB)")
        return
    print(f"  [Downloading] {os.path.basename(dest_path)} from {url}...")
    urllib.request.urlretrieve(url, dest_path)
    print(f"  [Done] Saved to {dest_path}")

def main():
    print("=== Downloading Sherpa-ONNX Speech Models for CPU Inference ===")
    for model_name, config in MODELS.items():
        print(f"\nModel: {model_name}")
        os.makedirs(config["dir"], exist_ok=True)
        for fname, url in config["files"].items():
            dest = os.path.join(config["dir"], fname)
            download_file(url, dest)
    print("\nAll models ready in services/stt/models/")

if __name__ == "__main__":
    main()
