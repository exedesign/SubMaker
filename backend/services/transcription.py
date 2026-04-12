"""
Transcription Service — Faster-Whisper ASR with built-in word timestamps.
Handles preprocessing, RTL handling, and subtitle formatting.
"""
import os
import time
import logging
from typing import Iterator, List, Dict, Any, Optional
from pathlib import Path

try:
    import numpy as np
    import librosa
    AUDIO_PROCESSING_AVAILABLE = True
except ImportError:
    AUDIO_PROCESSING_AVAILABLE = False
    np = None
    librosa = None

import sys
sys.path.append(str(Path(__file__).parent.parent))
from config import (
    MODELS_DIR, WHISPER_MODEL_SIZE, WHISPER_DEVICE, WHISPER_COMPUTE_TYPE,
    LANGUAGE_MODELS, LANGUAGE_PARAMS, CONTENT_TYPE_CONFIGS, MUSIC_GENRE_CONFIGS,
    LANGUAGE_PROMPTS, RTL_LANGUAGES
)

from services.engines import get_engine

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TranscriptionService:
    """Service for transcribing audio files using Faster-Whisper with word timestamps"""

    def __init__(
        self,
        model_size: str = WHISPER_MODEL_SIZE,
        device: str = WHISPER_DEVICE,
        compute_type: str = WHISPER_COMPUTE_TYPE,
    ):
        self.default_model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.engine = get_engine()
        self.performance_metrics = {}

        # RTL (Right-to-Left) languages — canonical list from config
        self.RTL_LANGUAGES = set(RTL_LANGUAGES)

        # Register with VRAM manager
        from services.vram_manager import get_vram_manager
        get_vram_manager().register("whisper", self.unload)

    def unload(self):
        """Free GPU memory held by the Whisper model."""
        if self.engine:
            self.engine.unload_model()
    
    def get_optimal_model_size(self, language: Optional[str]) -> str:
        """Get optimal model size for a specific language"""
        if language and language.lower() in LANGUAGE_MODELS:
            return LANGUAGE_MODELS[language.lower()]
        return self.default_model_size
    
    def get_language_params(self, language: Optional[str]) -> Dict[str, Any]:
        """Get language-specific transcription parameters"""
        if language and language.lower() in LANGUAGE_PARAMS:
            return LANGUAGE_PARAMS[language.lower()].copy()
        
        # Default parameters
        return {
            'no_speech_threshold': 0.5,
            'log_prob_threshold': -0.5,
            'compression_ratio_threshold': 2.0,
            'beam_size': 5,
            'best_of': 3,
            'patience': 1.0,
            'temperature': [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
            'condition_on_previous_text': False
        }
    
    def preprocess_audio(self, audio_path: str, target_path: Optional[str] = None) -> str:
        """Preprocess audio for better transcription quality.

        Applies only safe, Whisper-compatible preprocessing: 16kHz resampling,
        peak normalization, and leading silence trimming.
        
        Leading silence trimming is critical for vocal-isolated tracks where
        the original song has a long instrumental intro — the vocal track
        will have silence at the start which confuses Whisper's language
        detection (first 30s) and causes hallucinations.
        
        Returns the path to the preprocessed file. The trimmed offset (in
        seconds) is stored as self._preprocess_offset so that subtitle
        timestamps can be shifted back to match the original audio.
        """
        self._preprocess_offset = 0.0  # Reset offset

        if not AUDIO_PROCESSING_AVAILABLE:
            logger.warning("Audio preprocessing unavailable (librosa not installed)")
            return audio_path

        try:
            logger.info(f"Preprocessing audio: {audio_path}")

            # Load audio at 16kHz (Whisper's native sample rate)
            y, sr = librosa.load(audio_path, sr=16000)

            # Trim leading silence — find where audio energy first exceeds threshold
            # Use a conservative threshold to preserve quiet vocal onsets
            # top_db=30 means anything quieter than -30dB from peak is considered silence
            y_trimmed, trim_indices = librosa.effects.trim(y, top_db=30, frame_length=2048, hop_length=512)
            leading_samples = trim_indices[0]
            leading_silence_sec = leading_samples / sr

            if leading_silence_sec > 2.0:
                # Only trim if there's meaningful leading silence (>2s)
                # Keep 0.5s of lead-in for natural onset
                keep_samples = int(0.5 * sr)
                start_sample = max(0, leading_samples - keep_samples)
                y = y[start_sample:]
                self._preprocess_offset = start_sample / sr
                logger.info(
                    f"Trimmed {leading_silence_sec:.1f}s leading silence "
                    f"(kept 0.5s lead-in, offset={self._preprocess_offset:.2f}s)"
                )
            else:
                logger.info(f"Leading silence {leading_silence_sec:.1f}s — no trim needed")

            # Peak-normalize to 95% to avoid clipping without distorting spectrum
            max_val = float(np.abs(y).max())
            if max_val > 0:
                y = y / max_val * 0.95

            # Save preprocessed audio
            if target_path is None:
                base_path = Path(audio_path)
                target_path = str(base_path.parent / f"{base_path.stem}_preprocessed{base_path.suffix}")

            import soundfile as sf
            sf.write(target_path, y, sr)

            logger.info(f"Audio preprocessed and saved to: {target_path}")
            return target_path

        except Exception as e:
            logger.warning(f"Audio preprocessing failed: {e}")
            return audio_path
    
    def preprocess_music_audio(
        self, 
        audio_path: str, 
        content_type: str = 'speech',
        genre: Optional[str] = None,
        target_path: Optional[str] = None
    ) -> str:
        """Enhanced audio preprocessing for music and lyrics"""
        if not AUDIO_PROCESSING_AVAILABLE:
            logger.warning("Audio preprocessing unavailable (librosa not installed)")
            return audio_path
            
        try:
            logger.info(f"Music preprocessing: {audio_path} (type: {content_type}, genre: {genre})")
            
            # Load audio
            y, sr = librosa.load(audio_path, sr=16000)
            
            # Get content-specific config
            config = CONTENT_TYPE_CONFIGS.get(content_type, CONTENT_TYPE_CONFIGS['speech'])
            preprocessing = config['preprocessing']
            
            # Basic normalization
            y = librosa.util.normalize(y)
            
            # Enhanced preprocessing based on content type
            if content_type == 'music':
                y = self._apply_music_preprocessing(y, sr, genre, preprocessing)
            elif content_type == 'podcast':
                y = self._apply_podcast_preprocessing(y, sr, preprocessing)
            else:  # speech
                y = self._apply_speech_preprocessing(y, sr, preprocessing)
            
            # Save preprocessed audio
            if target_path is None:
                base_path = Path(audio_path)
                target_path = str(base_path.parent / f"{base_path.stem}_processed_{content_type}{base_path.suffix}")
            
            import soundfile as sf
            sf.write(target_path, y, sr)
            
            logger.info(f"Enhanced audio preprocessing completed: {target_path}")
            return target_path
            
        except Exception as e:
            logger.warning(f"Music audio preprocessing failed: {e}")
            return audio_path
    
    def _apply_music_preprocessing(self, y: "np.ndarray", sr: int, genre: Optional[str], config: Dict) -> "np.ndarray":
        """Apply music-specific audio processing.

        When Demucs vocal isolation has been applied upstream, the audio
        arriving here is already clean isolated vocals. Heavy filtering
        would DEGRADE quality, so we apply minimal processing.
        """
        try:
            # Dynamic range compression for consistent vocal levels
            if config.get('dynamic_range_compression', False):
                threshold = 0.3
                ratio = 4.0
                y = np.where(
                    np.abs(y) > threshold,
                    np.sign(y) * (threshold + (np.abs(y) - threshold) / ratio),
                    y
                )

            # Single gentle preemphasis for vocal clarity only
            # NOTE: Do NOT apply multiple passes — cascaded preemphasis
            # destroys bass/mid frequencies and degrades ASR accuracy.
            if config.get('vocal_freq_boost', False):
                y = librosa.effects.preemphasis(y, coef=0.97)

            # Final normalization to prevent clipping
            max_val = np.abs(y).max()
            if max_val > 0:
                y = y / max_val * 0.95

        except Exception as e:
            logger.warning(f"Music-specific preprocessing failed: {e}")

        return y
    
    def _apply_podcast_preprocessing(self, y: "np.ndarray", sr: int, config: Dict) -> "np.ndarray":
        """Apply podcast-specific audio processing"""
        try:
            # Enhanced noise reduction for long-form content
            if config.get('noise_reduction') == 'enhanced':
                y = librosa.effects.preemphasis(y, coef=0.97)
                
            # Voice enhancement for podcast content
            if config.get('enhancement_level') == 'high':
                # Apply gentle compression for consistent levels
                y = np.tanh(y * 1.5) / 1.5
                
        except Exception as e:
            logger.warning(f"Podcast preprocessing failed: {e}")
            
        return y
    
    def _apply_speech_preprocessing(self, y: "np.ndarray", sr: int, config: Dict) -> "np.ndarray":
        """Apply speech-specific audio processing.

        Preemphasis is intentionally skipped — it is a legacy step that
        distorts spectral balance for transformer-based ASR (Whisper).
        Audio arriving here has already been normalized by the caller.
        """
        return y
        
    def _get_device_and_compute(self) -> tuple:
        """Determine the best device and compute type"""
        device = self.device
        compute_type = self.compute_type
        
        if device == "auto":
            try:
                import torch
                device = "cuda" if torch.cuda.is_available() else "cpu"
            except ImportError:
                device = "cpu"
        
        if compute_type == "auto":
            compute_type = "float16" if device == "cuda" else "int8"
            
        return device, compute_type
    
    def load_model(self, language: Optional[str] = None, model_size_override: Optional[str] = None):
        """Load the optimal model for the given language via the active ASR engine.

        Args:
            language: Language code for optimal model selection
            model_size_override: Explicit model ID (overrides language-based selection)
        """
        if not self.engine.is_available():
            raise ImportError(
                "faster-whisper is not installed. Run: pip install faster-whisper"
            )

        if model_size_override:
            model_id = model_size_override
        else:
            model_id = self.get_optimal_model_size(language)
        device, compute_type = self._get_device_and_compute()

        logger.info(f"Loading model '{model_id}' for language '{language or 'auto'}' on {device} ({compute_type})")

        self.engine.load_model(model_id, device, compute_type)

        logger.info("Model loaded successfully!")

    # Class-level RTL_LANGUAGES removed — uses self.RTL_LANGUAGES set in __init__ from config

    def _process_rtl_text(self, text: str, language: str) -> str:
        """Process RTL text for proper display using ArabicTextProcessor."""
        try:
            from services.arabic_support import ArabicTextProcessor
            if ArabicTextProcessor.is_available():
                return ArabicTextProcessor.process_text(text, language)
        except ImportError:
            logger.warning("Arabic support libraries not available for RTL processing")
        return text

    def _filter_hallucinations(self, segments: List[Dict], language: Optional[str] = None) -> List[Dict]:
        """Filter out common Whisper hallucination patterns from segments.

        Handles: exact duplicates, near-duplicate consecutive segments,
        known hallucination phrases, and low-confidence segments.
        """
        if not segments:
            return segments

        HALLUCINATION_PATTERNS = [
            "thanks for watching", "thank you for watching",
            "please subscribe", "like and subscribe",
            "subtitle by", "subtitles by", "captions by",
            "subtitles m.k", "subtitles mk", "subtitle m.k",
            "translated by", "transcribed by",
            "amara.org", "www.", "http",
            "music playing", "♪",
        ]

        if language and language.lower() == 'tr':
            # Turkish common hallucinations: subscribe, like, thank you for watching, subtitle credits
            HALLUCINATION_PATTERNS.extend([
                "abone ol", "beğen",
                "izlediğiniz için teşekkürler",
                "altyazı m.k", "altyazı m .k", "altyazı mk",
                "altyazılar m.k", "alt yazı m.k",
                "çeviri m.k", "çeviri mk",
            ])

        filtered = []
        seen_texts = set()
        prev_text = ""

        for seg in segments:
            text = seg.get('text', '').strip()
            normalized = text.lower().strip()

            # Skip empty or very short segments
            if len(normalized) < 2:
                logger.debug(f"Filtered too-short segment: '{text}'")
                continue

            # Skip exact duplicates
            if normalized in seen_texts:
                logger.info(f"Filtered duplicate: '{text[:40]}...'")
                continue

            # Skip near-duplicate of previous segment (stuttering/looping)
            # Higher threshold for Turkish: character overlap is higher due to language structure
            if prev_text and self._text_similarity(normalized, prev_text) > 0.95:
                logger.info(f"Filtered near-duplicate: '{text[:40]}...'")
                continue

            # Skip known hallucination patterns
            is_hallucination = False
            for pattern in HALLUCINATION_PATTERNS:
                if pattern in normalized:
                    logger.info(f"Filtered hallucination '{pattern}': '{text[:40]}...'")
                    is_hallucination = True
                    break
            if is_hallucination:
                continue

            # Skip segments where all words have very low probability
            # Turkish Whisper models may produce lower confidence scores; threshold set conservatively
            if seg.get('words') and seg['words']:
                avg_prob = sum(w.get('probability', 0) for w in seg['words']) / len(seg['words'])
                if avg_prob < 0.10:  # Lowered from 0.25 to allow more Turkish speech through
                    logger.info(f"Filtered low-confidence (avg_prob={avg_prob:.2f}): '{text[:40]}...'")
                    continue

            seen_texts.add(normalized)
            prev_text = normalized
            filtered.append(seg)

        removed = len(segments) - len(filtered)
        if removed > 0:
            logger.info(f"Hallucination filter: removed {removed}/{len(segments)} segments")

        return filtered

    @staticmethod
    def _text_similarity(a: str, b: str) -> float:
        """Simple character-level Jaccard similarity."""
        if not a or not b:
            return 0.0
        set_a, set_b = set(a), set(b)
        intersection = len(set_a & set_b)
        union = len(set_a | set_b)
        return intersection / union if union > 0 else 0.0

    def transcribe_with_content_type(
        self,
        audio_path: str,
        content_type: str = 'speech',
        content_genre: Optional[str] = None,
        language: Optional[str] = None,
        task: str = "transcribe",
        word_timestamps: bool = True,
        progress_callback: Optional[callable] = None,
        user_params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Content-aware transcription with optimized preprocessing and model selection
        
        Args:
            audio_path: Path to audio/video file
            content_type: 'speech', 'music', or 'podcast'
            content_genre: Music genre for fine-tuning (optional)
            language: Language code or None for auto-detect
            task: 'transcribe' or 'translate'
            word_timestamps: Include word-level timestamps
            progress_callback: Callback function for progress updates
            
        Returns:
            Dict containing segments and optimized metadata
        """
        start_time = time.time()
        
        logger.info(f"Content-aware transcription: {content_type}")
        if content_genre:
            logger.info(f"Music genre: {content_genre}")
        
        # Get content-specific configuration
        config = CONTENT_TYPE_CONFIGS.get(content_type, CONTENT_TYPE_CONFIGS['speech'])

        # Vocal isolation for music content (separate vocals from instruments)
        vocal_audio_path = audio_path
        vocal_isolation_applied = False
        if content_type == 'music' and config['preprocessing'].get('vocal_isolation', False):
            try:
                from services.vocal_isolator import get_vocal_isolator
                isolator = get_vocal_isolator()
                if isolator.is_available():
                    logger.info("Performing vocal isolation with demucs...")
                    if progress_callback:
                        progress_callback(5, "Separating vocals...")
                    # Map isolator's 0-100% to pipeline's 5-40%
                    def vocal_progress(pct, msg=""):
                        if progress_callback:
                            progress_callback(5 + int(pct * 0.35), msg)
                    vocal_audio_path = isolator.separate_vocals(
                        audio_path,
                        progress_callback=vocal_progress
                    )
                    vocal_isolation_applied = (vocal_audio_path != audio_path)
                    if vocal_isolation_applied:
                        logger.info(f"Vocal isolation complete: {vocal_audio_path}")
                    else:
                        logger.warning("Vocal isolation returned original audio (fallback)")
                else:
                    logger.warning("Demucs not available, skipping vocal isolation")
            except Exception as e:
                logger.warning(f"Vocal isolation failed, using original audio: {e}")
                vocal_audio_path = audio_path

        # Enhanced audio preprocessing based on content type (applied to isolated vocals)
        if progress_callback:
            progress_callback(42, "Pre-processing audio...")
        processed_audio_path = self.preprocess_music_audio(
            vocal_audio_path,
            content_type=content_type,
            genre=content_genre
        )

        # Determine optimal model size based on content type
        optimal_model = config['default_model']
        if language:
            # Check if language has specific requirements
            lang_model = self.get_optimal_model_size(language)
            # Use the larger of content-type requirement or language requirement
            model_priority = ['tiny', 'base', 'small', 'medium', 'large-v3']
            content_idx = model_priority.index(optimal_model) if optimal_model in model_priority else 2
            lang_idx = model_priority.index(lang_model) if lang_model in model_priority else 2
            optimal_model = model_priority[max(content_idx, lang_idx)]

        logger.info(f"Using optimal model: {optimal_model} for {content_type}")

        # Load optimal model with explicit override
        if progress_callback:
            progress_callback(45, f"Loading {optimal_model} model...")
        self.load_model(language, model_size_override=optimal_model)
        
        # Get content-specific transcription parameters
        params = config['whisper_params'].copy()
        
        # Merge with language-specific params if available
        if language:
            lang_params = self.get_language_params(language)
            if content_type in ('music', 'podcast'):
                # Music/podcast: pick the MORE PERMISSIVE/STRONGER value for each param
                HIGHER_IS_BETTER = {'beam_size', 'best_of', 'patience', 'compression_ratio_threshold'}
                LOWER_IS_BETTER = {'no_speech_threshold'}
                MORE_NEGATIVE_IS_BETTER = {'log_prob_threshold'}
                for key, value in lang_params.items():
                    if key in params:
                        if key == 'temperature':
                            continue  # Keep content-type config's fallback list
                        elif key == 'condition_on_previous_text':
                            if content_type == 'music':
                                continue  # Music: keep False to prevent hallucination loops
                            else:
                                params[key] = value
                        elif key in HIGHER_IS_BETTER:
                            params[key] = max(params[key], value)
                        elif key in LOWER_IS_BETTER:
                            params[key] = min(params[key], value)
                        elif key in MORE_NEGATIVE_IS_BETTER:
                            params[key] = min(params[key], value)
                        else:
                            params[key] = value
                logger.info(f"Merged params (music-priority) for {language}/{content_type}: {params}")
            else:
                # Speech: language params take priority
                for key, value in lang_params.items():
                    if key in params:
                        params[key] = value
        
        is_rtl = language and language.lower() in self.RTL_LANGUAGES
        
        if is_rtl:
            logger.info(f"RTL language detected: {language} - using optimized settings")
        
        # Transcribe via ASR engine with optimized parameters
        if progress_callback:
            progress_callback(50, "Transcription started...")
        if is_rtl:
            params['initial_prompt'] = ""  # RTL: empty prompt prevents garbled output
        elif language and language.lower() in LANGUAGE_PROMPTS:
            lang_prompts = LANGUAGE_PROMPTS[language.lower()]
            if lang_prompts is not None:
                prompt = lang_prompts.get(content_type, lang_prompts.get('speech', ''))
                params['initial_prompt'] = prompt
                logger.info(f"Using initial_prompt for {language}/{content_type}")

        # Apply user fine-tune overrides (highest priority)
        if user_params:
            for key, value in user_params.items():
                if value is not None:
                    params[key] = value
                    logger.info(f"User override: {key} = {value}")

        result = self.engine.transcribe(
            processed_audio_path,
            language=language,
            task=task,
            word_timestamps=word_timestamps,
            progress_callback=progress_callback,
            **params
        )

        total_duration = result.get("duration", 0)
        result_segments = result["segments"]

        logger.info(f"Detected language: {result['language']} (probability: {result.get('language_probability', 0):.2f})")
        logger.info(f"Duration: {total_duration:.2f}s")
        logger.info(f"Content type: {content_type} with {optimal_model} model")

        # Post-process: RTL text handling (engine-independent)
        if is_rtl:
            for seg in result_segments:
                seg["text"] = self._process_rtl_text(seg["text"], language)
                if "words" in seg:
                    for w in seg["words"]:
                        w["word"] = self._process_rtl_text(w["word"], language)

        # Filter hallucinations and repetitions
        result_segments = self._filter_hallucinations(result_segments, language)
        logger.info(f"After hallucination filtering: {len(result_segments)} segments")

        # Performance metrics
        processing_time = time.time() - start_time
        self.performance_metrics[content_type] = {
            'processing_time': processing_time,
            'audio_duration': total_duration,
            'real_time_factor': processing_time / total_duration if total_duration > 0 else 0,
            'segments_count': len(result_segments),
            'model_used': optimal_model,
            'preprocessing_type': content_type
        }

        logger.info(f"Transcription completed in {processing_time:.2f}s")
        logger.info(f"Real-time factor: {self.performance_metrics[content_type]['real_time_factor']:.2f}x")

        # Cleanup preprocessed file if different from original
        if processed_audio_path != audio_path and processed_audio_path != vocal_audio_path:
            try:
                os.remove(processed_audio_path)
                logger.info(f"Cleaned up preprocessed file: {processed_audio_path}")
            except Exception as e:
                logger.warning(f"Failed to cleanup preprocessed file: {e}")

        # Note: vocal isolation cache files are intentionally kept for reuse

        return {
            "segments": result_segments,
            "language": result["language"],
            "language_probability": result.get("language_probability", 0),
            "duration": round(total_duration, 3),
            "content_type": content_type,
            "content_genre": content_genre,
            "model_used": optimal_model,
            "preprocessing_applied": True,
            "vocal_isolation_applied": vocal_isolation_applied,
            "performance": self.performance_metrics[content_type]
        }
    
    def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
        task: str = "transcribe",
        word_timestamps: bool = True,
        progress_callback: Optional[callable] = None,
        preprocess_audio: bool = True,
        user_params: Optional[Dict[str, Any]] = None,
        model_size_override: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Transcribe an audio file with language-specific optimizations

        Args:
            audio_path: Path to audio/video file
            language: Language code (e.g., 'en', 'ar') or None for auto-detect
            task: 'transcribe' or 'translate' (to English)
            word_timestamps: Include word-level timestamps
            progress_callback: Callback function for progress updates
            preprocess_audio: Whether to preprocess audio for better quality
            model_size_override: Explicit model ID from frontend settings

        Returns:
            Dict containing segments and metadata
        """
        start_time = time.time()
        
        # Preprocess audio if requested
        processed_audio_path = audio_path
        if preprocess_audio:
            if progress_callback:
                progress_callback(10, "Pre-processing audio...")
            processed_audio_path = self.preprocess_audio(audio_path)

        if progress_callback:
            progress_callback(20, "Loading model...")
        self.load_model(language, model_size_override=model_size_override)
        
        if not os.path.exists(processed_audio_path):
            raise FileNotFoundError(f"Audio file not found: {processed_audio_path}")
        
        logger.info(f"Transcribing: {audio_path}")
        logger.info(f"Language: {language or 'auto-detect'}")

        # Get language-specific parameters
        params = self.get_language_params(language)
        is_rtl = language and language.lower() in self.RTL_LANGUAGES

        if is_rtl:
            logger.info(f"RTL language detected: {language} - using optimized settings")

        # Transcribe via ASR engine
        if progress_callback:
            progress_callback(30, "Transcription started...")
        if is_rtl:
            params['initial_prompt'] = ""  # RTL: empty prompt prevents garbled output
        elif language and language.lower() in LANGUAGE_PROMPTS:
            lang_prompts = LANGUAGE_PROMPTS[language.lower()]
            if lang_prompts is not None:
                prompt = lang_prompts.get('speech', '')
                params['initial_prompt'] = prompt
                logger.info(f"Using initial_prompt for {language}/speech")

        # Apply user fine-tune overrides (highest priority)
        if user_params:
            for key, value in user_params.items():
                if value is not None:
                    params[key] = value
                    logger.info(f"User override: {key} = {value}")

        result = self.engine.transcribe(
            processed_audio_path,
            language=language,
            task=task,
            word_timestamps=word_timestamps,
            progress_callback=progress_callback,
            **params
        )

        result_segments = result["segments"]
        total_duration = result.get("duration", 0)

        # If leading silence was trimmed during preprocessing, shift all timestamps
        # back to align with the original audio/video timeline
        preprocess_offset = getattr(self, '_preprocess_offset', 0.0)
        if preprocess_offset > 0:
            logger.info(f"Applying timestamp offset +{preprocess_offset:.2f}s for trimmed silence")
            total_duration += preprocess_offset
            for seg in result_segments:
                seg["start"] = round(seg["start"] + preprocess_offset, 3)
                seg["end"] = round(seg["end"] + preprocess_offset, 3)
                if "words" in seg:
                    for w in seg["words"]:
                        w["start"] = round(w["start"] + preprocess_offset, 3)
                        w["end"] = round(w["end"] + preprocess_offset, 3)

        logger.info(f"Detected language: {result['language']} (probability: {result.get('language_probability', 0):.2f})")
        logger.info(f"Duration: {total_duration:.2f}s")
        logger.info(f"Total segments found: {len(result_segments)}")

        # Post-process: RTL text handling
        if is_rtl:
            for seg in result_segments:
                seg["text"] = self._process_rtl_text(seg["text"], language)
                if "words" in seg:
                    for w in seg["words"]:
                        w["word"] = self._process_rtl_text(w["word"], language)

        # Filter hallucinations and repetitions
        result_segments = self._filter_hallucinations(result_segments, language)

        # Performance metrics
        transcription_time = time.time() - start_time
        speed_factor = total_duration / transcription_time if transcription_time > 0 else 0

        self.performance_metrics[language or 'auto'] = {
            'transcription_time': transcription_time,
            'audio_duration': total_duration,
            'speed_factor': speed_factor,
            'model_size': self.get_optimal_model_size(language),
            'segment_count': len(result_segments)
        }

        logger.info(f"Transcription completed in {transcription_time:.2f}s (speed: {speed_factor:.2f}x)")

        # Cleanup preprocessed file if it was created
        if preprocess_audio and processed_audio_path != audio_path:
            try:
                os.remove(processed_audio_path)
                logger.info("Cleaned up preprocessed audio file")
            except Exception as e:
                logger.warning(f"Failed to cleanup preprocessed file: {e}")

        return {
            "language": result["language"],
            "language_probability": result.get("language_probability", 0),
            "duration": total_duration,
            "segments": result_segments,
            "performance": self.performance_metrics.get(language or 'auto', {})
        }
    
    def get_performance_stats(self) -> Dict[str, Any]:
        """Get performance statistics for all languages"""
        return {
            'metrics': self.performance_metrics.copy(),
        }
    
    def transcribe_to_subtitles(
        self,
        audio_path: str,
        language: Optional[str] = None,
        max_chars_per_line: int = 42,
        max_words_per_segment: int = 8
    ) -> List[Dict[str, Any]]:
        """
        Transcribe and format as subtitle segments
        
        Args:
            audio_path: Path to audio file
            language: Language code or None for auto
            max_chars_per_line: Maximum characters per subtitle line
            max_words_per_segment: Maximum words per segment
            
        Returns:
            List of subtitle segments ready for rendering
        """
        result = self.transcribe(
            audio_path,
            language=language,
            word_timestamps=True
        )
        
        subtitles = []
        subtitle_id = 1
        
        for segment in result["segments"]:
            if "words" in segment and segment["words"]:
                # Split by words for better timing
                words = segment["words"]
                current_word_objs = []
                current_start = None

                for word in words:
                    if current_start is None:
                        current_start = word["start"]

                    current_word_objs.append(word)
                    current_text = " ".join(w["word"] for w in current_word_objs).strip()

                    # Check if we should split
                    should_split = (
                        len(current_word_objs) >= max_words_per_segment or
                        len(current_text) >= max_chars_per_line
                    )

                    if should_split:
                        subtitles.append({
                            "id": subtitle_id,
                            "start": current_start,
                            "end": word["end"],
                            "text": current_text,
                            "words": [w.copy() if isinstance(w, dict) else w for w in current_word_objs]
                        })
                        subtitle_id += 1
                        current_word_objs = []
                        current_start = None

                # Add remaining words
                if current_word_objs:
                    subtitles.append({
                        "id": subtitle_id,
                        "start": current_start,
                        "end": words[-1]["end"],
                        "text": " ".join(w["word"] for w in current_word_objs).strip(),
                        "words": [w.copy() if isinstance(w, dict) else w for w in current_word_objs]
                    })
                    subtitle_id += 1
            else:
                # No word timestamps, use segment as-is
                subtitles.append({
                    "id": subtitle_id,
                    "start": segment["start"],
                    "end": segment["end"],
                    "text": segment["text"]
                })
                subtitle_id += 1

        return {
            "language": result["language"],
            "duration": result["duration"],
            "subtitles": subtitles
        }
    
    def transcribe_with_content_type_to_subtitles(
        self,
        audio_path: str,
        content_type: str = 'speech',
        content_genre: Optional[str] = None,
        language: Optional[str] = None,
        max_chars_per_line: int = 42,
        max_words_per_segment: int = 8
    ) -> Dict[str, Any]:
        """
        Content-aware transcription and formatting as subtitle segments
        
        Args:
            audio_path: Path to audio file
            content_type: 'speech', 'music', or 'podcast'
            content_genre: Music genre for fine-tuning (optional)
            language: Language code or None for auto
            max_chars_per_line: Maximum characters per subtitle line
            max_words_per_segment: Maximum words per segment
            
        Returns:
            Dict containing subtitle segments and metadata
        """
        result = self.transcribe_with_content_type(
            audio_path,
            content_type=content_type,
            content_genre=content_genre,
            language=language,
            word_timestamps=True
        )
        
        subtitles = []
        subtitle_id = 1
        
        # Adjust segmentation based on content type
        if content_type == 'music':
            # For music, prefer longer segments to capture lyrical phrases
            max_words_per_segment = max(max_words_per_segment, 12)
            max_chars_per_line = max(max_chars_per_line, 60)
        elif content_type == 'podcast':
            # For podcasts, allow longer segments for natural speech flow
            max_words_per_segment = max(max_words_per_segment, 15)
            max_chars_per_line = max(max_chars_per_line, 80)
        
        for segment in result["segments"]:
            if "words" in segment and segment["words"]:
                # Split by words for better timing — preserve full word objects with timestamps
                words = segment["words"]
                current_word_objs = []
                current_start = None

                for word in words:
                    if current_start is None:
                        current_start = word["start"]

                    current_word_objs.append(word)
                    current_text = " ".join(w["word"] for w in current_word_objs).strip()

                    # Check if we should split
                    should_split = (
                        len(current_word_objs) >= max_words_per_segment or
                        len(current_text) >= max_chars_per_line
                    )

                    if should_split:
                        subtitles.append({
                            "id": subtitle_id,
                            "start": current_start,
                            "end": word["end"],
                            "text": current_text,
                            "words": [w.copy() if isinstance(w, dict) else w for w in current_word_objs],
                            "content_type": content_type
                        })
                        subtitle_id += 1
                        current_word_objs = []
                        current_start = None

                # Add remaining words
                if current_word_objs:
                    subtitles.append({
                        "id": subtitle_id,
                        "start": current_start,
                        "end": words[-1]["end"],
                        "text": " ".join(w["word"] for w in current_word_objs).strip(),
                        "words": [w.copy() if isinstance(w, dict) else w for w in current_word_objs],
                        "content_type": content_type
                    })
                    subtitle_id += 1
            else:
                # No word timestamps, use segment as-is
                subtitles.append({
                    "id": subtitle_id,
                    "start": segment["start"],
                    "end": segment["end"],
                    "text": segment["text"],
                    "content_type": content_type
                })
                subtitle_id += 1
        
        return {
            "language": result["language"],
            "duration": result["duration"],
            "subtitles": subtitles,
            "content_type": content_type,
            "content_genre": content_genre,
            "model_used": result.get("model_used"),
            "preprocessing_applied": result.get("preprocessing_applied", True),
            "vocal_isolation_applied": result.get("vocal_isolation_applied", False),
            "performance": result.get("performance", {})
        }


# Singleton instance
_transcription_service = None

def get_transcription_service() -> TranscriptionService:
    """Get or create the transcription service singleton"""
    global _transcription_service
    if _transcription_service is None:
        _transcription_service = TranscriptionService()
    return _transcription_service
