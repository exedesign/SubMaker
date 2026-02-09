"""
SubMaker Configuration
"""
import os
from pathlib import Path

# Base paths
BASE_DIR = Path(__file__).parent.parent
BACKEND_DIR = Path(__file__).parent
RESOURCES_DIR = BASE_DIR / "resources"
MODELS_DIR = RESOURCES_DIR / "models"
FONTS_DIR = RESOURCES_DIR / "fonts"
TEMP_DIR = BASE_DIR / "temp"
OUTPUT_DIR = BASE_DIR / "output"

# Create directories if they don't exist
for dir_path in [MODELS_DIR, FONTS_DIR, TEMP_DIR, OUTPUT_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)

# Server settings
SERVER_HOST = "127.0.0.1"
SERVER_PORT = 5000
DEBUG = False

# Whisper settings
# For better Arabic transcription accuracy, use 'small' or 'medium' model
# Options: tiny, base, small, medium, large-v3
# - tiny/base: Fast but less accurate (especially for Arabic)
# - small: Good balance for most languages including Arabic  
# - medium/large-v3: Best accuracy for Arabic but slower
WHISPER_MODEL_SIZE = "small"  # Default model size
WHISPER_DEVICE = "cpu"  # Options: auto, cpu, cuda - Set to cpu to avoid ROCm SDK errors
WHISPER_COMPUTE_TYPE = "int8"  # Options: auto, int8, float16, float32 - int8 for better CPU performance

# Language-specific model sizes for optimal performance
LANGUAGE_MODELS = {
    'ar': 'medium',   # Arabic: Use larger model for better accuracy
    'tr': 'small',    # Turkish: Small model is sufficient
    'en': 'base',     # English: Base model for speed
    'es': 'small',    # Spanish: Small model
    'fr': 'small',    # French: Small model
    'de': 'small',    # German: Small model
    'ru': 'small',    # Russian: Small model
    'zh': 'medium',   # Chinese: Larger model needed
    'ja': 'medium',   # Japanese: Larger model needed
    'ko': 'medium'    # Korean: Larger model needed
}

# Language-specific transcription parameters
LANGUAGE_PARAMS = {
    'ar': {  # Arabic: Conservative settings for accuracy
        'no_speech_threshold': 0.3,
        'log_prob_threshold': -1.0,
        'compression_ratio_threshold': 2.8,
        'beam_size': 10,
        'best_of': 5,
        'patience': 2.0,
        'temperature': 0.0,
        'condition_on_previous_text': False
    },
    'tr': {  # Turkish: Balanced settings
        'no_speech_threshold': 0.4,
        'log_prob_threshold': -0.7,
        'compression_ratio_threshold': 2.4,
        'beam_size': 5,
        'best_of': 3,
        'patience': 1.5,
        'temperature': 0.0,
        'condition_on_previous_text': False
    },
    'en': {  # English: Standard settings
        'no_speech_threshold': 0.5,
        'log_prob_threshold': -0.5,
        'compression_ratio_threshold': 2.0,
        'beam_size': 5,
        'best_of': 3,
        'patience': 1.0,
        'temperature': 0.0,
        'condition_on_previous_text': False
    }
}

# Content type specific configurations
CONTENT_TYPE_CONFIGS = {
    'speech': {
        'default_model': 'small',
        'preprocessing': {
            'vocal_isolation': False,
            'noise_reduction': 'standard',
            'enhancement_level': 'medium'
        },
        'whisper_params': {
            'no_speech_threshold': 0.5,
            'log_prob_threshold': -0.5,
            'compression_ratio_threshold': 2.0,
            'beam_size': 5,
            'best_of': 3
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
            'temperature': 0.0,
            'condition_on_previous_text': False,
            'suppress_blank': False  # Don't suppress silence in music
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
            'no_speech_threshold': 0.4,
            'log_prob_threshold': -0.7,
            'compression_ratio_threshold': 2.2,
            'beam_size': 8,
            'best_of': 4,
            'patience': 1.5
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

# FFmpeg settings
FFMPEG_PATH = "ffmpeg"  # Use system ffmpeg or specify full path

# Video settings - 4K Resolution Standard
VIDEO_FORMATS = {
    "horizontal": {"width": 3840, "height": 2160, "aspect": "16:9"},  # 4K UHD
    "vertical": {"width": 2160, "height": 3840, "aspect": "9:16"},    # 4K Vertical  
    "square": {"width": 2160, "height": 2160, "aspect": "1:1"}        # 4K Square
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
ASS_SHAPER_SIMPLE = True     # Use simple text shaping (faster)

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
RTL_LANGUAGES = ["ar", "he", "fa", "ur"]

# Output formats
OUTPUT_FORMATS = {
    "mp4": {"codec": "libx264", "ext": "mp4", "supports_alpha": False},
    "webm": {"codec": "libvpx-vp9", "ext": "webm", "supports_alpha": True},
    "mov": {"codec": "prores_ks", "ext": "mov", "supports_alpha": True}
}

# Tenor GIF API
# Get your free API key from: https://developers.google.com/tenor/guides/quickstart
TENOR_API_KEY = os.environ.get("TENOR_API_KEY", "AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ")  # Default is a limited demo key
TENOR_CLIENT_KEY = "submaker_app"

# Giphy GIF API
# Get your free API key from: https://developers.giphy.com/
# Note: Public beta key may have rate limits
GIPHY_API_KEY = os.environ.get("GIPHY_API_KEY", "Gc7131jiJuvI7IdN0HZ1D7nh0ow5BU6g")  # Public API key
