import os
import numpy as np

class ASRModelWrapper:
    """
    Wrapper for faster-whisper WhisperModel.
    Ensures condition_on_previous_text=False to mitigate silence hallucinations.
    """
    def __init__(
        self,
        model_size: str = "large-v3-turbo",
        device: str = "cuda",
        compute_type: str = "float16",
        cpu_threads: int = 4
    ):
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.model = None
        self._load_model(cpu_threads)

    def _load_model(self, cpu_threads: int):
        try:
            from faster_whisper import WhisperModel
            import torch

            # If CUDA requested but unavailable, fall back to CPU
            actual_device = self.device
            actual_compute = self.compute_type
            actual_model = self.model_size
            if actual_device == "cuda" and not torch.cuda.is_available():
                print("[ASR] CUDA not available on host. Falling back to CPU with int8.")
                actual_device = "cpu"
                actual_compute = "int8"
                # If running on CPU and model was the heavy large-v3-turbo default, switch to fast 'base' model
                if "STT_MODEL_SIZE" not in os.environ and actual_model == "large-v3-turbo":
                    actual_model = "base"
                    print(f"[ASR] CPU detected: automatically switching to fast '{actual_model}' model for real-time latency.")

            self.model_size = actual_model
            print(f"[ASR] Loading faster-whisper model '{self.model_size}' on {actual_device} ({actual_compute})...")
            self.model = WhisperModel(
                self.model_size,
                device=actual_device,
                compute_type=actual_compute,
                cpu_threads=cpu_threads
            )
            print("[ASR] Model loaded successfully.")
        except Exception as e:
            print(f"[ASR] Failed to initialize faster-whisper model: {e}")
            self.model = None

    def transcribe(self, audio_f32: np.ndarray, language: str = "ja", word_timestamps: bool = True) -> dict:
        """
        Transcribes a 16kHz float32 audio array.
        Returns {"text": str, "words": list[dict], "language": str}
        """
        if self.model is None or len(audio_f32) == 0:
            return {"text": "", "words": [], "language": language}

        try:
            # Faster-whisper accepts float32 numpy array directly
            segments, info = self.model.transcribe(
                audio_f32,
                language=language,
                task="transcribe",
                beam_size=1,
                best_of=1,
                temperature=0.0,
                condition_on_previous_text=False, # Critical: prevents silence hallucination
                no_speech_threshold=0.6,
                compression_ratio_threshold=2.4,
                hallucination_silence_threshold=0.5,
                word_timestamps=word_timestamps
            )

            full_text = []
            words_list = []
            for seg in segments:
                # Whisper invents phrases on noise/silence. Segments the model
                # itself flags as non-speech are dropped rather than shown.
                if getattr(seg, 'no_speech_prob', 0.0) > 0.6:
                    continue
                
                text_clean = seg.text.strip()
                if not text_clean:
                    continue

                full_text.append(text_clean)
                if seg.words:
                    for w in seg.words:
                        words_list.append({
                            "text": w.word,
                            "start": round(w.start, 3),
                            "end": round(w.end, 3),
                            "probability": round(w.probability, 3)
                        })

            joined_text = " ".join(full_text).strip()
            
            # Deduplicate repeated phrase loops (e.g. "phrase. phrase. phrase.")
            import re
            deduped_text = re.sub(r'(\b.+?\b)(?:\s+\1){2,}', r'\1', joined_text, flags=re.IGNORECASE)

            return {
                "text": deduped_text,
                "words": words_list,
                "language": info.language
            }
        except Exception as e:
            print(f"[ASR] Error during transcription: {e}")
            return {"text": "", "words": [], "language": language}
