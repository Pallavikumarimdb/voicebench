from dataclasses import dataclass, field
import numpy as np
from segmenter import Segmenter
from stabilizer import LocalAgreementStabilizer

@dataclass
class WordTs:
    text: str
    start: float
    end: float

@dataclass
class Utterance:
    utt_id: int
    text: str
    words: list[WordTs] | None = None
    t_capture_ms: int = 0
    t_final_ms: int | None = None

class SessionState:
    def __init__(
        self,
        session_id: str,
        src_lang: str = "ja",
        sample_rate: int = 16000,
        agreement_n: int = 2,
        vad_threshold: float = 0.5,
        hangover_ms: int = 700,
        preroll_ms: int = 300,
        max_len_ms: int = 8000,
    ):
        self.session_id = session_id
        self.src_lang = src_lang
        self.sample_rate = sample_rate
        self.current_utt_id = 1
        self.current_seq = 0

        self.segmenter = Segmenter(
            sample_rate=sample_rate,
            hangover_ms=hangover_ms,
            preroll_ms=preroll_ms,
            max_len_ms=max_len_ms,
            threshold=vad_threshold,
        )
        self.stabilizer = LocalAgreementStabilizer(agreement_n=agreement_n)

        # Buffer for current active utterance (bounded to 30s max to prevent unbounded memory growth)
        self.max_buffer_samples = int(sample_rate * 30)
        self.active_audio = np.array([], dtype=np.float32)
        self.last_capture_time_ms = 0
        self.last_asr_run_time_ms = 0
        # Guards against CPU death spiral: never overlap transcribes, and don't
        # burn CPU transcribing long silence (which also causes hallucinations).
        self.asr_busy = False
        self.last_speech_ms = 0
        # Single-slot pending queue: if ASR is busy when a new final arrives,
        # store it here (overwrite any older pending) and process after current
        # transcription completes. Prevents short phrases from being silently dropped.
        self.pending_segment: np.ndarray | None = None
        self.pending_capture_ms: int = 0


    def append_audio(self, audio_chunk: np.ndarray, t_capture_ms: int):
        self.last_capture_time_ms = t_capture_ms
        if len(self.active_audio) == 0:
            self.active_audio = audio_chunk
        else:
            self.active_audio = np.concatenate([self.active_audio, audio_chunk])
        
        # Enforce max buffer size
        if len(self.active_audio) > self.max_buffer_samples:
            self.active_audio = self.active_audio[-self.max_buffer_samples:]

    def trim_active_audio(self, seconds: float):
        samples_to_trim = int(seconds * self.sample_rate)
        if samples_to_trim > 0 and samples_to_trim < len(self.active_audio):
            self.active_audio = self.active_audio[samples_to_trim:]

    def next_utterance(self):
        self.current_utt_id += 1
        self.active_audio = np.array([], dtype=np.float32)
        self.stabilizer.reset()
