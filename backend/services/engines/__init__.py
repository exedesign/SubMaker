"""
ASR Engine registry — Faster-Whisper (direct transcription with word timestamps).
"""
from .base import ASREngine, TranscriptionResult
from .whisperx_engine import FasterWhisperEngine


def get_engine() -> ASREngine:
    """Create the Faster-Whisper engine instance."""
    return FasterWhisperEngine()


__all__ = [
    "ASREngine", "TranscriptionResult",
    "FasterWhisperEngine",
    "get_engine",
]
