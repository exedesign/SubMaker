# SubMaker Services
# Heavy ML services are wrapped in try/except so the backend can start
# with a minimal Python installation (Flask stack + numpy only).
# Missing packages are installed at runtime via the /packages/install endpoint.

from .arabic_support import ArabicTextProcessor
from .subtitle_engine import SubtitleEngine, SubtitleStyle, AnimationConfig
from .ffmpeg_processor import FFmpegProcessor
from .lyrics_tagger import LyricsTagger, get_lyrics_tagger

try:
    from .transcription import TranscriptionService
except ImportError as _e:
    import logging as _logging
    _logging.getLogger(__name__).warning(f"TranscriptionService unavailable (missing packages): {_e}")
    TranscriptionService = None  # type: ignore

try:
    from .video_generator import VideoGenerator
except ImportError as _e:
    import logging as _logging
    _logging.getLogger(__name__).warning(f"VideoGenerator unavailable (missing packages): {_e}")
    VideoGenerator = None  # type: ignore

try:
    from .vocal_isolator import VocalIsolator, get_vocal_isolator
except ImportError as _e:
    import logging as _logging
    _logging.getLogger(__name__).warning(f"VocalIsolator unavailable (missing packages): {_e}")
    VocalIsolator = None  # type: ignore
    def get_vocal_isolator():
        raise ImportError("VocalIsolator not available — install required packages first")

__all__ = [
    "TranscriptionService",
    "TranslationService",
    "ArabicTextProcessor",
    "VideoGenerator",
    "SubtitleEngine",
    "SubtitleStyle",
    "AnimationConfig",
    "FFmpegProcessor",
    "VocalIsolator",
    "get_vocal_isolator",
    "LyricsTagger",
    "get_lyrics_tagger"
]
