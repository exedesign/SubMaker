"""
Transcription Service using faster-whisper
Converts audio/video files to text with timestamps
"""
import os
import time
import logging
from typing import Iterator, List, Dict, Any, Optional
from pathlib import Path

try:
    from faster_whisper import WhisperModel
    WHISPER_AVAILABLE = True
except ImportError as e:
    print(f"Warning: faster-whisper not available: {e}")
    WHISPER_AVAILABLE = False
    WhisperModel = None
except Exception as e:
    print(f"Warning: faster-whisper loading failed: {e}")
    WHISPER_AVAILABLE = False
    WhisperModel = None

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
    LANGUAGE_MODELS, LANGUAGE_PARAMS, CONTENT_TYPE_CONFIGS, MUSIC_GENRE_CONFIGS
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ModelCache:
    """Cache system for Whisper models to avoid reloading"""
    
    def __init__(self):
        self.models = {}
        self.last_used = {}
        self.max_cached_models = 3  # Limit memory usage
    
    def get_model(self, model_size: str, device: str, compute_type: str) -> WhisperModel:
        """Get or load a model from cache"""
        cache_key = f"{model_size}_{device}_{compute_type}"
        
        if cache_key in self.models:
            self.last_used[cache_key] = time.time()
            logger.info(f"Using cached model: {cache_key}")
            return self.models[cache_key]
        
        # Remove least recently used model if cache is full
        if len(self.models) >= self.max_cached_models:
            lru_key = min(self.last_used.keys(), key=lambda k: self.last_used[k])
            logger.info(f"Removing cached model: {lru_key}")
            del self.models[lru_key]
            del self.last_used[lru_key]
        
        logger.info(f"Loading new model: {cache_key}")
        model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            download_root=str(MODELS_DIR)
        )
        
        self.models[cache_key] = model
        self.last_used[cache_key] = time.time()
        return model


class TranscriptionService:
    """Service for transcribing audio files using faster-whisper with optimizations"""
    
    def __init__(
        self,
        model_size: str = WHISPER_MODEL_SIZE,
        device: str = WHISPER_DEVICE,
        compute_type: str = WHISPER_COMPUTE_TYPE
    ):
        self.default_model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.model_cache = ModelCache()
        self.performance_metrics = {}
        
        # RTL (Right-to-Left) languages that need special handling
        self.RTL_LANGUAGES = {'ar', 'fa', 'he', 'ur', 'ps', 'sd', 'yi'}
    
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
            'temperature': 0.0,
            'condition_on_previous_text': False
        }
    
    def preprocess_audio(self, audio_path: str, target_path: Optional[str] = None) -> str:
        """Preprocess audio for better transcription quality"""
        if not AUDIO_PROCESSING_AVAILABLE:
            logger.warning("Audio preprocessing unavailable (librosa not installed)")
            return audio_path
        
        try:
            logger.info(f"Preprocessing audio: {audio_path}")
            
            # Load audio
            y, sr = librosa.load(audio_path, sr=16000)  # Whisper expects 16kHz
            
            # Normalize audio
            y = librosa.util.normalize(y)
            
            # Reduce noise (simple)
            y = librosa.effects.preemphasis(y)
            
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
        """Apply music-specific audio processing"""
        try:
            # Vocal frequency enhancement
            if config.get('vocal_freq_boost', False):
                # Focus on vocal frequency range (typically 80Hz - 8kHz for vocals)
                freq_range = (100, 8000)
                if genre and genre in MUSIC_GENRE_CONFIGS:
                    freq_range = MUSIC_GENRE_CONFIGS[genre]['vocal_freq_range']
                
                # Apply bandpass-like enhancement (simple version)
                y = librosa.effects.preemphasis(y, coef=0.97)
            
            # Dynamic range compression for consistent vocal levels
            if config.get('dynamic_range_compression', False):
                # Simple compression using numpy
                threshold = 0.3
                ratio = 4.0
                y = np.where(
                    np.abs(y) > threshold,
                    np.sign(y) * (threshold + (np.abs(y) - threshold) / ratio),
                    y
                )
            
            # Enhanced noise reduction for music
            if config.get('noise_reduction') == 'enhanced':
                # Multiple preemphasis passes for better noise reduction
                y = librosa.effects.preemphasis(y, coef=0.95)
                y = librosa.effects.preemphasis(y, coef=0.98)
            
            # Vocal isolation attempt (basic stereo to mono with mid extraction)
            if config.get('vocal_isolation', False) and len(y.shape) > 1:
                # This is a placeholder - for real vocal isolation, we'd need Spleeter/DEMUCS
                logger.info("Note: For professional vocal isolation, consider using Spleeter or DEMUCS")
                # Simple mid extraction if we had stereo (but librosa.load already converts to mono)
                pass
                
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
        """Apply speech-specific audio processing (standard)"""
        try:
            # Standard noise reduction
            if config.get('noise_reduction') == 'standard':
                y = librosa.effects.preemphasis(y)
            elif config.get('noise_reduction') == 'enhanced':
                y = librosa.effects.preemphasis(y, coef=0.97)
                
        except Exception as e:
            logger.warning(f"Speech preprocessing failed: {e}")
            
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
    
    def load_model(self, language: Optional[str] = None) -> WhisperModel:
        """Load the optimal Whisper model for the given language"""
        if not WHISPER_AVAILABLE:
            raise ImportError(
                "faster-whisper is not installed. "
                "Please run: pip install faster-whisper"
            )
        
        model_size = self.get_optimal_model_size(language)
        device, compute_type = self._get_device_and_compute()
        
        logger.info(f"Loading Whisper model '{model_size}' for language '{language or 'auto'}' on {device} ({compute_type})")
        
        model = self.model_cache.get_model(model_size, device, compute_type)
        
        logger.info("Model loaded successfully!")
        return model
    
    # RTL (Right-to-Left) languages that need special handling
    RTL_LANGUAGES = {'ar', 'fa', 'he', 'ur', 'ps', 'sd', 'yi'}
    
    def transcribe_with_content_type(
        self,
        audio_path: str,
        content_type: str = 'speech',
        content_genre: Optional[str] = None,
        language: Optional[str] = None,
        task: str = "transcribe",
        word_timestamps: bool = True,
        progress_callback: Optional[callable] = None
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
        
        # Enhanced audio preprocessing based on content type
        processed_audio_path = self.preprocess_music_audio(
            audio_path, 
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
        
        # Load optimal model
        original_model_size = self.default_model_size
        self.default_model_size = optimal_model
        model = self.load_model(language)
        self.default_model_size = original_model_size
        
        # Get content-specific transcription parameters
        params = config['whisper_params'].copy()
        
        # Override with language-specific params if available
        if language:
            lang_params = self.get_language_params(language)
            # Merge content-type params with language params (language takes priority for conflicts)
            for key, value in lang_params.items():
                if key in params:
                    params[key] = value
        
        is_rtl = language and language.lower() in self.RTL_LANGUAGES
        
        if is_rtl:
            logger.info(f"RTL language detected: {language} - using optimized settings")
        
        # Content-specific VAD settings
        vad_filter = False  # Disabled for music content by default
        if content_type == 'speech':
            vad_filter = True  # Enable for speech content
        elif content_type == 'podcast':
            vad_filter = False  # Disabled for long-form content
        
        logger.info(f"VAD filter: {vad_filter} for {content_type}")
        
        # Transcribe with optimized parameters
        segments, info = model.transcribe(
            processed_audio_path,
            language=language,
            task=task,
            word_timestamps=word_timestamps,
            vad_filter=vad_filter,
            initial_prompt="" if is_rtl else None,
            **params
        )
        
        print(f"Detected language: {info.language} (probability: {info.language_probability:.2f})")
        print(f"Duration: {info.duration:.2f}s")
        print(f"Content type: {content_type} with {optimal_model} model")
        
        # Convert segments to list with progress tracking
        result_segments = []
        total_duration = info.duration if info.duration else 0
        segment_count = 0
        
        for segment in segments:
            segment_count += 1
            
            # RTL text processing
            text = segment.text.strip()
            if is_rtl:
                text = self._process_rtl_text(text, language)
            
            segment_data = {
                "id": segment_count,
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": text
            }
            
            # Add word-level timestamps if requested
            if word_timestamps and hasattr(segment, 'words') and segment.words:
                words = []
                for word in segment.words:
                    word_text = word.word.strip()
                    if is_rtl:
                        word_text = self._process_rtl_text(word_text, language)
                    
                    words.append({
                        "word": word_text,
                        "start": round(word.start, 2),
                        "end": round(word.end, 2),
                        "probability": round(word.probability, 3)
                    })
                segment_data["words"] = words
            
            result_segments.append(segment_data)
            
            # Progress callback
            if progress_callback and total_duration > 0:
                progress = min((segment.end / total_duration) * 100, 100)
                progress_callback(progress)
        
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
        if processed_audio_path != audio_path:
            try:
                os.remove(processed_audio_path)
                logger.info(f"Cleaned up preprocessed file: {processed_audio_path}")
            except Exception as e:
                logger.warning(f"Failed to cleanup preprocessed file: {e}")
        
        return {
            "segments": result_segments,
            "language": info.language,
            "language_probability": round(info.language_probability, 3),
            "duration": round(total_duration, 2),
            "content_type": content_type,
            "content_genre": content_genre,
            "model_used": optimal_model,
            "preprocessing_applied": True,
            "performance": self.performance_metrics[content_type]
        }
    
    def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
        task: str = "transcribe",
        word_timestamps: bool = True,
        vad_filter: bool = False,  # Disabled by default for music/songs
        progress_callback: Optional[callable] = None,
        preprocess_audio: bool = True
    ) -> Dict[str, Any]:
        """
        Transcribe an audio file with language-specific optimizations
        
        Args:
            audio_path: Path to audio/video file
            language: Language code (e.g., 'en', 'ar') or None for auto-detect
            task: 'transcribe' or 'translate' (to English)
            word_timestamps: Include word-level timestamps
            vad_filter: Filter out non-speech segments (disabled for songs)
            progress_callback: Callback function for progress updates
            preprocess_audio: Whether to preprocess audio for better quality
            
        Returns:
            Dict containing segments and metadata
        """
        start_time = time.time()
        
        # Preprocess audio if requested
        processed_audio_path = audio_path
        if preprocess_audio:
            processed_audio_path = self.preprocess_audio(audio_path)
        
        model = self.load_model(language)
        
        if not os.path.exists(processed_audio_path):
            raise FileNotFoundError(f"Audio file not found: {processed_audio_path}")
        
        logger.info(f"Transcribing: {audio_path}")
        logger.info(f"Language: {language or 'auto-detect'}, VAD: {vad_filter}")
        
        # Get language-specific parameters
        params = self.get_language_params(language)
        is_rtl = language and language.lower() in self.RTL_LANGUAGES
        
        if is_rtl:
            logger.info(f"RTL language detected: {language} - using optimized settings")
        
        # Transcribe with language-specific optimizations
        segments, info = model.transcribe(
            processed_audio_path,
            language=language,
            task=task,
            word_timestamps=word_timestamps,
            vad_filter=vad_filter,
            initial_prompt="" if is_rtl else None,
            **params
        )
        
        print(f"Detected language: {info.language} (probability: {info.language_probability:.2f})")
        print(f"Duration: {info.duration:.2f}s")
        
        # Convert segments to list with progress tracking
        result_segments = []
        total_duration = info.duration if info.duration else 0
        segment_count = 0
        
        for segment in segments:
            segment_count += 1
            segment_data = {
                "id": segment.id,
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
                "confidence": segment.avg_logprob
            }
            
            print(f"Segment {segment_count}: [{segment.start:.2f}s - {segment.end:.2f}s] {segment.text.strip()[:50]}...")
            
            # Add word-level timestamps if available
            if word_timestamps and segment.words:
                segment_data["words"] = [
                    {
                        "word": word.word,
                        "start": word.start,
                        "end": word.end,
                        "confidence": word.probability
                    }
                    for word in segment.words
                ]
            
            result_segments.append(segment_data)
            
            # Progress callback
            if progress_callback and total_duration > 0:
                progress = min(100, int((segment.end / total_duration) * 100))
                progress_callback(progress, segment_data)
        
        logger.info(f"Total segments found: {segment_count}")
        
        # Performance metrics
        transcription_time = time.time() - start_time
        audio_duration = info.duration if info.duration else 0
        speed_factor = audio_duration / transcription_time if transcription_time > 0 else 0
        
        self.performance_metrics[language or 'auto'] = {
            'transcription_time': transcription_time,
            'audio_duration': audio_duration,
            'speed_factor': speed_factor,
            'model_size': self.get_optimal_model_size(language),
            'segment_count': segment_count
        }
        
        logger.info(f"Transcription completed in {transcription_time:.2f}s (speed: {speed_factor:.2f}x)")
        
        # Cleanup preprocessed file if it was created
        if preprocess_audio and processed_audio_path != audio_path:
            try:
                os.remove(processed_audio_path)
                logger.info("Cleaned up preprocessed audio file")
            except Exception as e:
                logger.warning(f"Failed to cleanup preprocessed file: {e}")
        
        # Filter out likely hallucinations (repeated segments)
        if len(result_segments) > 1:
            filtered_segments = []
            seen_texts = set()
            for seg in result_segments:
                # Normalize text for comparison
                normalized = seg['text'].lower().strip()
                if len(normalized) < 3:  # Skip very short segments
                    continue
                if normalized in seen_texts:
                    logger.info(f"Filtered duplicate/hallucination: {seg['text'][:30]}...")
                    continue
                seen_texts.add(normalized)
                filtered_segments.append(seg)
            
            logger.info(f"After filtering: {len(filtered_segments)} segments (removed {segment_count - len(filtered_segments)} duplicates)")
            result_segments = filtered_segments
        
        return {
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "segments": result_segments,
            "performance": self.performance_metrics.get(language or 'auto', {})
        }
    
    def get_performance_stats(self) -> Dict[str, Any]:
        """Get performance statistics for all languages"""
        return {
            'metrics': self.performance_metrics.copy(),
            'cached_models': list(self.model_cache.models.keys()),
            'cache_usage': len(self.model_cache.models)
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
                current_words = []
                current_start = None
                
                for word in words:
                    if current_start is None:
                        current_start = word["start"]
                    
                    current_words.append(word["word"])
                    current_text = " ".join(current_words).strip()
                    
                    # Check if we should split
                    should_split = (
                        len(current_words) >= max_words_per_segment or
                        len(current_text) >= max_chars_per_line
                    )
                    
                    if should_split:
                        subtitles.append({
                            "id": subtitle_id,
                            "start": current_start,
                            "end": word["end"],
                            "text": current_text,
                            "words": current_words.copy()
                        })
                        subtitle_id += 1
                        current_words = []
                        current_start = None
                
                # Add remaining words
                if current_words:
                    subtitles.append({
                        "id": subtitle_id,
                        "start": current_start,
                        "end": words[-1]["end"],
                        "text": " ".join(current_words).strip(),
                        "words": current_words
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
                # Split by words for better timing
                words = segment["words"]
                current_words = []
                current_start = None
                
                for word in words:
                    if current_start is None:
                        current_start = word["start"]
                    
                    current_words.append(word["word"])
                    current_text = " ".join(current_words).strip()
                    
                    # Check if we should split
                    should_split = (
                        len(current_words) >= max_words_per_segment or
                        len(current_text) >= max_chars_per_line
                    )
                    
                    if should_split:
                        subtitles.append({
                            "id": subtitle_id,
                            "start": current_start,
                            "end": word["end"],
                            "text": current_text,
                            "words": current_words.copy(),
                            "content_type": content_type
                        })
                        subtitle_id += 1
                        current_words = []
                        current_start = None
                
                # Add remaining words
                if current_words:
                    subtitles.append({
                        "id": subtitle_id,
                        "start": current_start,
                        "end": words[-1]["end"],
                        "text": " ".join(current_words).strip(),
                        "words": current_words,
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
