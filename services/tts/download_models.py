"""
Download script for offline local TTS models using Sherpa-ONNX.
Downloads lightweight Piper-VITS neural voices (English and Japanese) for 100% offline synthesis.
"""

import os
import urllib.request
import tarfile

TTS_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(TTS_DIR, "models")

MODELS = {
    "en": {
        "name": "vits-piper-en_US-amy-low",
        "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-amy-low.tar.bz2",
        "model_file": "en_US-amy-low.onnx",
        "tokens_file": "tokens.txt",
        "data_dir": "espeak-ng-data"
    }
}

def download_and_extract(model_key: str):
    cfg = MODELS[model_key]
    os.makedirs(MODELS_DIR, exist_ok=True)
    target_dir = os.path.join(MODELS_DIR, cfg["name"])
    if os.path.exists(target_dir) and os.path.exists(os.path.join(target_dir, cfg["model_file"])):
        print(f"[OK] Model already present: {target_dir}")
        return

    tar_path = os.path.join(MODELS_DIR, f"{cfg['name']}.tar.bz2")
    print(f"[Downloading] {cfg['name']} from {cfg['url']}...")
    urllib.request.urlretrieve(cfg["url"], tar_path)
    print(f"[Extracting] {tar_path}...")
    with tarfile.open(tar_path, "r:bz2") as tar:
        tar.extractall(path=MODELS_DIR)
    if os.path.exists(tar_path):
        os.remove(tar_path)
    print(f"[Done] Ready in {target_dir}")

def main():
    print("=== Downloading Sherpa-ONNX Offline TTS Models ===")
    for key in MODELS:
        try:
            download_and_extract(key)
        except Exception as e:
            print(f"Error downloading {key}: {e}")
    print("TTS model setup complete.")

if __name__ == "__main__":
    main()

