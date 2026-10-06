from enum import Enum
import numpy as np

class State(Enum):
    IDLE = "IDLE"
    SPEECH = "SPEECH"
    FINALIZING = "FINALIZING"

class AudioRingBuffer:
    def __init__(self, max_samples: int = 16000 * 30):  # 30 seconds max buffer
        self.buffer = np.array([], dtype=np.float32)
        self.max_samples = max_samples

    def append(self, samples: np.ndarray):
        if len(self.buffer) == 0:
            self.buffer = samples.astype(np.float32)
        else:
            self.buffer = np.concatenate([self.buffer, samples.astype(np.float32)])
        if len(self.buffer) > self.max_samples:
            self.buffer = self.buffer[-self.max_samples:]

    def get_all(self) -> np.ndarray:
        return self.buffer

    def clear(self):
        self.buffer = np.array([], dtype=np.float32)

    def trim_samples(self, count: int):
        if count >= len(self.buffer):
            self.buffer = np.array([], dtype=np.float32)
        else:
            self.buffer = self.buffer[count:]

class Segmenter:
    """
    Voice activity detection and segmentation state machine.
    - Transitions from IDLE to SPEECH when speech_prob > 0.5.
    - Captures preroll audio preceding speech start.
    - Finalizes when silence >= hangover_ms or duration >= max_len_ms.
    """
    def __init__(self, hangover_ms: int = 700, preroll_ms: int = 300, max_len_ms: int = 8000, sample_rate: int = 16000, threshold: float = 0.5):
        self.hangover_ms = hangover_ms
        self.preroll_ms = preroll_ms
        self.max_len_ms = max_len_ms
        self.sample_rate = sample_rate
        self.threshold = threshold

        self.state = State.IDLE
        self.buffer = AudioRingBuffer()
        self.silence_run_ms = 0
        self.speech_run_frames = 0
        self.segment_start_ms = 0

    def on_frame(self, frame_samples: np.ndarray, prob: float, t_ms: int, frame_ms: int = 20) -> np.ndarray | None:
        self.buffer.append(frame_samples)

        # Require 2 consecutive speech frames (~64ms at 32ms frames) above
        # threshold to enter SPEECH. Threshold defaults to 0.5 but is wired
        # to VAD_THRESHOLD env via SessionState, soraise it to 0.6-0.7 on
        # noisy CPU hosts to stop triggering on room noise / earphone hiss.
        if prob > self.threshold:
            self.speech_run_frames += 1
            if self.speech_run_frames >= 2:
                self.silence_run_ms = 0
            if self.state == State.IDLE and self.speech_run_frames >= 2:
                self.state = State.SPEECH
                self.segment_start_ms = max(0, t_ms - self.preroll_ms)
        else:
            self.speech_run_frames = 0
            if self.state == State.SPEECH:
                self.silence_run_ms += frame_ms

        # Finalization trigger: hangover exceeded or forced cut on max length.
        # Return ONLY the speech segment (from segment start, which already
        # backs off by preroll_ms) — never the whole ring buffer. Returning
        # stale pre-speech silence makes every transcription slower and makes
        # Whisper hallucinate on dead air, snowballing on CPU hosts.
        if self.state == State.SPEECH:
            duration_ms = t_ms - self.segment_start_ms
            if self.silence_run_ms >= self.hangover_ms or duration_ms >= self.max_len_ms:
                keep_ms = duration_ms + frame_ms
                keep_samples = int(keep_ms * self.sample_rate / 1000)
                full = self.buffer.get_all()
                segment = full[-keep_samples:].copy() if keep_samples < len(full) else full.copy()
                self.buffer.clear()
                self.state = State.IDLE
                self.silence_run_ms = 0
                self.speech_run_frames = 0
                return segment

        return None

    def force_finalize(self) -> np.ndarray | None:
        if len(self.buffer.get_all()) > 0:
            segment = self.buffer.get_all().copy()
            self.buffer.clear()
            self.state = State.IDLE
            return segment
        return None
