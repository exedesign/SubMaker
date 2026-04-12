"""
SubMaker Configuration
"""
import os
import sys
from pathlib import Path

# Detect production mode (set by Electron main process)
IS_PRODUCTION = os.environ.get('SUBMAKER_PRODUCTION') == '1'

# Base paths
BASE_DIR = Path(__file__).parent.parent
BACKEND_DIR = Path(__file__).parent
RESOURCES_DIR = BASE_DIR / "resources"
FONTS_DIR = RESOURCES_DIR / "fonts"
PRESETS_DIR = RESOURCES_DIR / "presets"

# In production, use user-writable locations for temp/output
if IS_PRODUCTION:
    _USER_DATA = Path(os.environ.get('SUBMAKER_USER_DATA', Path.home() / 'SubMaker'))
    TEMP_DIR = _USER_DATA / "temp"
    OUTPUT_DIR = _USER_DATA / "output"
    # Models are bundled with the installer in resources/models
    MODELS_DIR = RESOURCES_DIR / "models"
else:
    TEMP_DIR = BASE_DIR / "temp"
    OUTPUT_DIR = BASE_DIR / "output"
    MODELS_DIR = RESOURCES_DIR / "models"

# Create directories if they don't exist
for dir_path in [MODELS_DIR, FONTS_DIR, PRESETS_DIR, TEMP_DIR, OUTPUT_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)

# Qwen2.5 translation model
QWEN_MODEL_ID = "Qwen/Qwen2.5-3B-Instruct-AWQ"

# FLUX.2 Klein 4B settings (loaded with BitsAndBytes NF4 quantization)
FLUX_KLEIN_MODEL_REPO = "black-forest-labs/FLUX.2-klein-4B"
FLUX_KLEIN_LOCAL_DIR = MODELS_DIR / "flux-klein-4b"

# Cover Art Model Registry — all available image generation models
COVER_ART_MODELS = {
    "flux-klein": {
        "name": "FLUX.2 Klein 4B",
        "description": "4B param rectified flow transformer (full NF4 quantized). Fast iteration with Qwen3 text encoder.",
        "generator_class": "services.generators.flux_klein.FluxKleinGenerator",
        "vram_estimate": "~3.5 GB",
        "supports_text_macros": True,
        "defaults": {
            "steps": 4,
            "cfgScale": 1.0,
            "width": 1024,
            "height": 1024,
            "maxSteps": 50,
            "minSteps": 1,
            "maxCfg": 20.0,
            "minCfg": 0.0,
        },
    },
}

# Server settings
SERVER_HOST = "127.0.0.1"
SERVER_PORT = 5000
DEBUG = False

# Whisper settings (faster-whisper / CTranslate2)
# Available models: turbo, large-v3, large-v3-turbo, large-v2, distil-large-v3, medium, small, base, tiny
# - turbo/large-v3-turbo: Best speed/accuracy balance (recommended)
# - large-v3: Highest accuracy, slower
# - distil-large-v3: Fast with high accuracy
# - medium/small/base/tiny: Smaller models, progressively faster but less accurate
WHISPER_MODEL_SIZE = "turbo"  # Default model size
WHISPER_DEVICE = "auto"  # Options: auto, cpu, cuda - auto detects CUDA GPU
WHISPER_COMPUTE_TYPE = "int8"  # Options: auto, int8, float16, float32 - int8 for better CPU performance

# Language-specific model sizes for optimal performance
LANGUAGE_MODELS = {
    'ar': 'small',    # Arabic: Use larger model for better accuracy
    'tr': 'turbo',    # Turkish: Turbo for best speed/accuracy
    'en': 'turbo',    # English: Turbo for speed
    'es': 'turbo',    # Spanish: Turbo
    'fr': 'turbo',    # French: Turbo
    'de': 'turbo',    # German: Turbo
    'ru': 'turbo',    # Russian: Turbo
    'zh': 'small',    # Chinese: Larger model needed
    'ja': 'small',    # Japanese: Larger model needed
    'ko': 'small'     # Korean: Larger model needed
}

# Language-specific transcription parameters
LANGUAGE_PARAMS = {
    'ar': {  # Arabic: Conservative settings for accuracy
        'no_speech_threshold': 0.6,  # Default — lower values cause cascading segment loss
        'log_prob_threshold': -1.0,
        'compression_ratio_threshold': 2.8,
        'beam_size': 10,
        'best_of': 5,
        'patience': 2.0,
        'temperature': [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],  # Fallback on failed segments
        'condition_on_previous_text': False,
        'hallucination_silence_threshold': 2.0,
    },
    'tr': {  # Turkish: Optimized for music/lyrics
        'no_speech_threshold': 0.6,  # Default — lower values cause cascading segment loss at end of audio
        'log_prob_threshold': -1.0,
        'compression_ratio_threshold': 2.8,
        'beam_size': 8,
        'best_of': 5,
        'patience': 2.0,
        'temperature': [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],  # Fallback on failed segments
        'condition_on_previous_text': False,  # Prevents cascading no-speech failures in music
        'hallucination_silence_threshold': 2.0,  # Skip hallucinated segments during >2s silence
    },
    'en': {  # English: Standard settings
        'no_speech_threshold': 0.6,
        'log_prob_threshold': -0.5,
        'compression_ratio_threshold': 2.0,
        'beam_size': 5,
        'best_of': 3,
        'patience': 1.0,
        'temperature': [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],  # Fallback on failed segments
        'condition_on_previous_text': False,  # Prevents cascading no-speech at end of audio
        'hallucination_silence_threshold': 2.0,
    }
}

# Language-specific initial prompts for Whisper
# These dramatically improve transcription accuracy by guiding the decoder
# toward the correct character set and vocabulary for each language.
LANGUAGE_PROMPTS = {
    'tr': {
        'music': "Bu bir Türkçe şarkıdır. Sözler:",
        'speech': "Bu bir Türkçe konuşmadır.",
        'podcast': "Bu bir Türkçe podcast yayınıdır.",
    },
    'en': {
        'music': "These are English song lyrics.",
        'speech': "This is an English speech transcription.",
        'podcast': "This is an English podcast transcription.",
    },
    'es': {
        'music': "Esta es una canción en español. La letra dice:",
        'speech': "Esta es una transcripción en español.",
        'podcast': "Este es un podcast en español.",
    },
    'fr': {
        'music': "Ceci est une chanson en français. Les paroles:",
        'speech': "Ceci est une transcription en français.",
        'podcast': "Ceci est un podcast en français.",
    },
    'de': {
        'music': "Dies ist ein deutsches Lied. Der Liedtext:",
        'speech': "Dies ist eine deutsche Transkription.",
        'podcast': "Dies ist ein deutscher Podcast.",
    },
    'it': {
        'music': "Questa è una canzone italiana. Il testo:",
        'speech': "Questa è una trascrizione in italiano.",
        'podcast': "Questo è un podcast in italiano.",
    },
    'pt': {
        'music': "Esta é uma música em português. A letra:",
        'speech': "Esta é uma transcrição em português.",
        'podcast': "Este é um podcast em português.",
    },
    'ru': {
        'music': "Это песня на русском языке. Текст песни:",
        'speech': "Это транскрипция на русском языке.",
        'podcast': "Это подкаст на русском языке.",
    },
    'zh': {
        'music': "这是一首中文歌曲。歌词如下：",
        'speech': "这是中文语音转录。",
        'podcast': "这是中文播客。",
    },
    'ja': {
        'music': "これは日本語の歌です。歌詞：",
        'speech': "これは日本語の音声転写です。",
        'podcast': "これは日本語のポッドキャストです。",
    },
    'ko': {
        'music': "이것은 한국어 노래입니다. 가사:",
        'speech': "이것은 한국어 음성 전사입니다.",
        'podcast': "이것은 한국어 팟캐스트입니다.",
    },
    # RTL languages: None means use empty prompt (handled in transcription.py)
    'ar': None,
    'he': None,
    'fa': None,
    'ur': None,
}

# Content type specific configurations
CONTENT_TYPE_CONFIGS = {
    'speech': {
        'default_model': 'turbo',
        'preprocessing': {
            'vocal_isolation': False,
            'noise_reduction': 'standard',
            'enhancement_level': 'medium'
        },
        'whisper_params': {
            'no_speech_threshold': 0.6,
            'log_prob_threshold': -0.5,
            'compression_ratio_threshold': 2.0,
            'beam_size': 5,
            'best_of': 3,
            'condition_on_previous_text': False,  # Prevents cascading no-speech at end of audio
            'hallucination_silence_threshold': 2.0,
        }
    },
    'music': {
        'default_model': 'large-v3',
        'preprocessing': {
            'vocal_isolation': True,
            'noise_reduction': 'enhanced',
            'enhancement_level': 'high',
            'vocal_freq_boost': True,
            'dynamic_range_compression': True
        },
        'whisper_params': {
            'no_speech_threshold': 0.2,  # Lower threshold for music
            'log_prob_threshold': -1.2,  # More permissive
            'compression_ratio_threshold': 3.0,  # Higher for music lyrics
            'beam_size': 10,  # Enhanced beam search
            'best_of': 5,
            'patience': 2.0,
            'temperature': [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],  # Fallback on failed segments
            'condition_on_previous_text': False,  # Prevents hallucination loops in music
            'suppress_blank': False,  # Don't suppress silence in music
            'hallucination_silence_threshold': 2.0,  # Skip hallucinations during >2s silence
        }
    },
    'podcast': {
        'default_model': 'medium',
        'preprocessing': {
            'vocal_isolation': False,
            'noise_reduction': 'enhanced',
            'enhancement_level': 'high'
        },
        'whisper_params': {
            'no_speech_threshold': 0.6,
            'log_prob_threshold': -0.7,
            'compression_ratio_threshold': 2.2,
            'beam_size': 8,
            'best_of': 4,
            'patience': 1.5,
            'condition_on_previous_text': False,  # Prevents cascading no-speech at end of audio
            'hallucination_silence_threshold': 2.0,
        }
    }
}

# Music genre specific enhancements
MUSIC_GENRE_CONFIGS = {
    'pop': {
        'vocal_freq_range': (100, 8000),
        'compression_threshold': 2.8,
        'enhancement_focus': 'vocal_clarity'
    },
    'rock': {
        'vocal_freq_range': (120, 6000),
        'compression_threshold': 3.2,
        'enhancement_focus': 'distortion_reduction'
    },
    'classical': {
        'vocal_freq_range': (80, 10000),
        'compression_threshold': 2.5,
        'enhancement_focus': 'dynamic_range'
    },
    'rap': {
        'vocal_freq_range': (150, 5000),
        'compression_threshold': 3.5,
        'enhancement_focus': 'rhythm_preservation'
    },
    'jazz': {
        'vocal_freq_range': (90, 9000),
        'compression_threshold': 2.3,
        'enhancement_focus': 'frequency_balance'
    }
}

# FFmpeg settings — check for bundled ffmpeg first (Inno Setup installer)
_bundled_ffmpeg = BASE_DIR.parent / "ffmpeg" / ("ffmpeg.exe" if os.name == 'nt' else "ffmpeg")
if _bundled_ffmpeg.exists():
    FFMPEG_PATH = str(_bundled_ffmpeg)
else:
    FFMPEG_PATH = "ffmpeg"  # Fallback to system PATH

# Video settings - 4K Resolution Standard (used as ASS design resolution)
VIDEO_FORMATS = {
    "horizontal": {"width": 3840, "height": 2160, "aspect": "16:9"},  # 4K UHD
    "vertical": {"width": 2160, "height": 3840, "aspect": "9:16"},    # 4K Vertical  
    "square": {"width": 2160, "height": 2160, "aspect": "1:1"}        # 4K Square
}

# Output resolution presets — aspect ratios preserved per format
RESOLUTION_PRESETS = {
    "1k": {
        "horizontal": {"width": 1920, "height": 1080},
        "vertical": {"width": 1080, "height": 1920},
        "square": {"width": 1080, "height": 1080},
    },
    "2k": {
        "horizontal": {"width": 2560, "height": 1440},
        "vertical": {"width": 1440, "height": 2560},
        "square": {"width": 1440, "height": 1440},
    },
    "4k": {
        "horizontal": {"width": 3840, "height": 2160},
        "vertical": {"width": 2160, "height": 3840},
        "square": {"width": 2160, "height": 2160},
    },
}

DEFAULT_FPS = 30
DEFAULT_VIDEO_CODEC = "libx264"
DEFAULT_AUDIO_CODEC = "aac"
DEFAULT_AUDIO_BITRATE = "192k"

# GPU Acceleration Settings for 4K Performance
# Enable hardware encoding when available (much faster for 4K)
ENABLE_GPU_ACCELERATION = True

# Background Image Optimization for 4K Performance  
BACKGROUND_IMAGE_OPTIMIZATION = True
BACKGROUND_QUALITY = 95  # JPEG quality for preprocessed images (90-100)

# ASS Subtitle Performance Settings for 4K Karaoke
ASS_PERFORMANCE_MODE = True  # Enable optimized ASS rendering
ASS_FONT_CACHE = True        # Enable font caching
ASS_SHAPER_SIMPLE = False    # Use complex (HarfBuzz) text shaping — required for Arabic, Devanagari, Thai etc.

HARDWARE_CODECS = {
    "nvidia": {
        "h264": "h264_nvenc",
        "hevc": "hevc_nvenc",
        "preset": "fast",
        "properties": ["-rc", "vbr", "-tune", "hq", "-spatial-aq", "1", "-temporal-aq", "1"]
    },
    "intel": {
        "h264": "h264_qsv", 
        "hevc": "hevc_qsv",
        "preset": "fast",
        "properties": ["-look_ahead", "1"]
    },
    "amd": {
        "h264": "h264_amf",
        "hevc": "hevc_amf", 
        "preset": "balanced",
        "properties": ["-usage", "transcoding"]
    }
}

# Subtitle settings - Optimized for 4K
DEFAULT_FONT = "NotoSans-Regular"
DEFAULT_FONT_SIZE = 96  # Increased for 4K (2x of 1080p)
DEFAULT_FONT_COLOR = "#FFFFFF"
DEFAULT_BORDER_COLOR = "#000000"
DEFAULT_BORDER_WIDTH = 4  # Increased for 4K (2x of 1080p)
DEFAULT_SHADOW_DEPTH = 2  # Increased for 4K (2x of 1080p)

# Supported languages for transcription
SUPPORTED_LANGUAGES = [
    ("en", "English"),
    ("ar", "Arabic"),
    ("tr", "Turkish"),
    ("es", "Spanish"),
    ("fr", "French"),
    ("de", "German"),
    ("it", "Italian"),
    ("pt", "Portuguese"),
    ("ru", "Russian"),
    ("zh", "Chinese"),
    ("ja", "Japanese"),
    ("ko", "Korean"),
]

# RTL Languages
RTL_LANGUAGES = ["ar", "he", "fa", "ur", "yi", "ps", "sd", "ug"]

# Output formats
OUTPUT_FORMATS = {
    "mp4": {"codec": "libx264", "ext": "mp4", "supports_alpha": False},
    "webm": {"codec": "libvpx-vp9", "ext": "webm", "supports_alpha": True},
    "mov": {"codec": "prores_ks", "ext": "mov", "supports_alpha": True}
}

# Vocal Isolation Settings
# Engine: "mdx" (audio-separator: BS-Roformer EP317 / Resurrection UNWA)
VOCAL_ENGINE = "mdx"

# Default vocal model (BS-Roformer EP317 — SDR 12.97 vocal extraction)
VOCAL_MDX_MODEL = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
VOCAL_MDX_SEGMENT_SIZE = 256    # Chunk size (256 = default balance, 512 = faster but more RAM)
VOCAL_MDX_BATCH_SIZE = 4        # Batch size for GPU (higher = faster but more VRAM)

# Demucs fallback settings
DEMUCS_MODEL = "htdemucs"
DEMUCS_DEVICE = "auto"
DEMUCS_SHIFTS = 0
DEMUCS_OVERLAP = 0.1
DEMUCS_SEGMENT = None
DEMUCS_FLOAT16 = True

# Shared settings
VOCAL_CACHE_ENABLED = True
VOCAL_CACHE_DIR = TEMP_DIR / "vocal_cache"
VOCAL_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ASR Engine Settings (Faster-Whisper — direct transcription with word timestamps)
ASR_ENGINE_CONFIG = {
    "name": "Faster-Whisper",
    "description": "CTranslate2-based fast transcription with built-in word timing",
    "default_model": "turbo",
    "language_models": {
        "tr": {"speech": "turbo", "music": "selimc/whisper-large-v3-turbo-turkish"},
        "ar": {"speech": "medium", "music": "large-v3"},
        "en": {"speech": "turbo", "music": "large-v3"},
    }
}

# Tenor GIF API
# Get your free API key from: https://developers.google.com/tenor/guides/quickstart
TENOR_API_KEY = os.environ.get("TENOR_API_KEY", "AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ")  # Default is a limited demo key
TENOR_CLIENT_KEY = "submaker_app"

# Giphy GIF API
# Get your free API key from: https://developers.giphy.com/
# Note: Public beta key may have rate limits
GIPHY_API_KEY = os.environ.get("GIPHY_API_KEY", "Gc7131jiJuvI7IdN0HZ1D7nh0ow5BU6g")  # Public API key
