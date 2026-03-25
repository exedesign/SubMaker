"""
ASR Engine Protocol — contract for the Faster-Whisper speech recognition engine.
Every engine must produce the same normalized output format.
"""
from typing import Protocol, Dict, Any, Optional, List, TypedDict, runtime_checkable


class WordTimestamp(TypedDict):
    word: str
    start: float       # seconds, 3 decimal places
    end: float
    probability: float  # 0.0-1.0 (from alignment score)


class SegmentResult(TypedDict):
    id: int
    start: float
    end: float
    text: str
    words: List[WordTimestamp]


class TranscriptionResult(TypedDict):
    segments: List[SegmentResult]
    language: str
    language_probability: float
    duration: float


@runtime_checkable
class ASREngine(Protocol):
    """Contract that the ASR engine must satisfy."""

    engine_id: str    # e.g. "whisperx"
    engine_name: str  # Human-readable: "Faster-Whisper"

    def get_available_models(self, language: Optional[str] = None) -> List[Dict[str, Any]]:
        """Return list of models this engine supports.
        Each dict: {"id": str, "name": str, "size_mb": int, "description": str}
        If language is provided, may include language-specific fine-tuned models.
        """
        ...

    def is_available(self) -> bool:
        """Check if engine dependencies are installed."""
        ...

    def load_model(self, model_id: str, device: str = "cpu", compute_type: str = "int8") -> None:
        """Pre-load a model for caching. Engine manages its own cache."""
        ...

    def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
        task: str = "transcribe",
        word_timestamps: bool = True,
        progress_callback: Optional[callable] = None,
        **engine_params
    ) -> TranscriptionResult:
        """Run transcription (+ forced alignment if word_timestamps=True)
        and return normalized result."""
        ...
