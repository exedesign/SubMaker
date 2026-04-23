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
        
        # Default parameters — applied for any language not in LANGUAGE_PARAMS
        return {
            'no_speech_threshold': 0.6,
            'log_prob_threshold': -0.5,
            'compression_ratio_threshold': 2.0,
            'beam_size': 5,
            'best_of': 3,
            'patience': 1.0,
            'temperature': [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
            'condition_on_previous_text': False,
        }
    
    def preprocess_audio(self, audio_path: str, target_path: Optional[str] = None) -> str:
        """Preprocess audio for better transcription quality using ffmpeg.

        Uses ffmpeg subprocess instead of Python audio libraries to avoid
        hangs on embedded Python installations.

        Steps:
        1. Detect & trim leading/trailing silence (keep 0.5 s lead-in, 0.3 s tail)
        2. Resample to 16 kHz mono (Whisper's native format)
        3. Dynamic loudness normalisation (boosts quiet vocal sections)

        Returns the path to the preprocessed file.  The trimmed offset
        (in seconds) is stored as ``self._preprocess_offset`` so that
        subtitle timestamps can be shifted back to the original timeline.
        """
        import subprocess, re
        from config import FFMPEG_PATH

        self._preprocess_offset = 0.0

        if target_path is None:
            base_path = Path(audio_path)
            target_path = str(base_path.parent / f"{base_path.stem}_preprocessed.wav")

        try:
            logger.info(f"Preprocessing audio (ffmpeg): {audio_path}")

            # --- 1) Detect silence boundaries and total duration ---
            leading_end, trailing_start, total_dur = self._ffmpeg_detect_silence(
                FFMPEG_PATH, audio_path
            )

            # --- 2) Calculate trim points ---
            trim_start = 0.0
            trim_end = total_dur

            leading_sec = leading_end
            trailing_sec = total_dur - trailing_start if trailing_start < total_dur else 0.0

            if leading_sec > 2.0:
                trim_start = leading_sec - 0.5  # keep 0.5 s lead-in
                self._preprocess_offset = trim_start
                logger.info(
                    f"Trimmed {leading_sec:.1f}s leading silence "
                    f"(kept 0.5s lead-in, offset={self._preprocess_offset:.2f}s)"
                )
            else:
                logger.info(f"Leading silence {leading_sec:.1f}s — no trim needed")

            if trailing_sec > 2.0:
                trim_end = trailing_start + 0.3  # keep 0.3 s tail
                logger.info(
                    f"Trimmed {trailing_sec:.1f}s trailing silence (kept 0.3s tail)"
                )
            else:
                logger.info(f"Trailing silence {trailing_sec:.1f}s — no trim needed")

            seg_duration = trim_end - trim_start

            # --- 3) Process: trim + normalise + resample to 16 kHz mono ---
            # dynaudnorm: per-frame loudness normalisation.  Boosts quiet
            # vocal sections and normalises peaks — replaces the manual
            # DRC + peak normalisation that previously used librosa/numpy.
            af = "dynaudnorm=framelen=500:gausssize=31:peak=0.95:maxgain=8"

            cmd = [
                FFMPEG_PATH, '-y', '-hide_banner', '-loglevel', 'warning',
                '-ss', f'{trim_start:.3f}',
                '-i', audio_path,
                '-t', f'{seg_duration:.3f}',
                '-af', af,
                '-ar', '16000',
                '-ac', '1',
                '-c:a', 'pcm_s16le',
                '-f', 'wav',
                target_path,
            ]

            logger.info(
                f"ffmpeg preprocess: [{trim_start:.1f}s – {trim_end:.1f}s] "
                f"→ 16 kHz mono + dynaudnorm"
            )

            proc = subprocess.run(
                cmd, capture_output=True, text=True,
                encoding='utf-8', errors='replace', timeout=120,
            )

            if proc.returncode != 0:
                raise RuntimeError(
                    f"ffmpeg exit {proc.returncode}: {proc.stderr[-500:]}"
                )

            if not os.path.exists(target_path):
                raise RuntimeError("ffmpeg produced no output file")

            logger.info(f"Audio preprocessed and saved to: {target_path}")
            return target_path

        except Exception as e:
            logger.warning(f"Audio preprocessing failed: {e}")
            return audio_path

    # ------------------------------------------------------------------
    # ffmpeg-based silence detection (used by preprocess_audio)
    # ------------------------------------------------------------------
    @staticmethod
    def _ffmpeg_detect_silence(
        ffmpeg_path: str, audio_path: str,
        noise_db: str = "-30dB", min_dur: float = 0.5,
    ):
        """Detect leading/trailing silence via ffmpeg *silencedetect*.

        Returns ``(leading_silence_end, trailing_silence_start, total_duration)``.
        All values are in seconds.
        """
        import subprocess, re

        cmd = [
            ffmpeg_path, '-i', audio_path, '-hide_banner',
            '-af', f'silencedetect=noise={noise_db}:d={min_dur}',
            '-f', 'null', '-',
        ]

        proc = subprocess.run(
            cmd, capture_output=True, text=True,
            encoding='utf-8', errors='replace', timeout=60,
        )

        # Parse total duration — "Duration: 00:02:49.74, ..."
        duration = 0.0
        dur_m = re.search(r'Duration:\s*(\d+):(\d+):([\d.]+)', proc.stderr)
        if dur_m:
            duration = (
                int(dur_m.group(1)) * 3600
                + int(dur_m.group(2)) * 60
                + float(dur_m.group(3))
            )

        # Collect silence_start / silence_end pairs
        silences: list = []
        pending_start = None
        for line in proc.stderr.split('\n'):
            sm = re.search(r'silence_start:\s*([\d.e+-]+)', line)
            em = re.search(r'silence_end:\s*([\d.e+-]+)', line)
            if sm:
                pending_start = float(sm.group(1))
            if em and pending_start is not None:
                silences.append((pending_start, float(em.group(1))))
                pending_start = None
        # Unclosed silence → extends to EOF
        if pending_start is not None:
            silences.append((pending_start, duration))

        # Leading: first silence block starting at / near 0
        leading_end = 0.0
        if silences and silences[0][0] < 0.1:
            leading_end = silences[0][1]

        # Trailing: last silence block reaching EOF
        trailing_start = duration
        if silences and silences[-1][1] >= duration - 0.5:
            trailing_start = silences[-1][0]

        return leading_end, trailing_start, duration

    @staticmethod
    def _apply_dynamic_range_compression(
        y: "np.ndarray",
        sr: int,
        threshold_db: float = -15.0,
        ratio: float = 3.0,
        attack_sec: float = 0.01,
        release_sec: float = 0.1,
    ) -> "np.ndarray":
        """Soft-knee upward compressor operating on per-frame RMS.

        Boosts sections that are quieter than *threshold_db* (relative to
        the peak RMS) by reducing the gap between loud and quiet parts.
        This makes quiet vocal phrases (verse endings, fade-outs) audible
        enough for Whisper's internal speech detector.

        A noise floor at −40 dB from peak prevents boosting silence
        (instrumental breaks in vocal-isolated tracks).

        Parameters
        ----------
        y : ndarray  – mono audio signal
        sr : int     – sample rate
        threshold_db : float – compressor knee in dB below peak RMS
                               (default −15 dB catches ~35% of voiced frames)
        ratio : float        – compression ratio (3:1)
        attack_sec : float   – attack time constant
        release_sec : float  – release time constant
        """
        if len(y) == 0:
            return y

        frame_length = int(0.025 * sr)   # 25 ms frames
        hop_length = int(0.010 * sr)     # 10 ms hop

        # Per-frame RMS envelope
        frames = librosa.util.frame(y, frame_length=frame_length, hop_length=hop_length)
        rms = np.sqrt(np.mean(frames ** 2, axis=0))

        # Reference: peak RMS across the track
        peak_rms = rms.max()
        if peak_rms < 1e-8:
            return y  # silence — nothing to compress

        # Convert thresholds from dB-below-peak to linear
        threshold_linear = peak_rms * (10 ** (threshold_db / 20.0))
        # Noise floor: don't boost anything below −40 dB from peak
        # (instrumental breaks / residual BS-Roformer bleed)
        noise_floor = peak_rms * (10 ** (-40.0 / 20.0))

        # Compute per-frame gain
        gain_db = np.zeros_like(rms)
        # Only boost frames that are below threshold but above noise floor
        boost_mask = (rms < threshold_linear) & (rms > noise_floor)
        if boost_mask.any():
            rms_db = 20 * np.log10(rms[boost_mask] / peak_rms + 1e-10)
            target_db = threshold_db + (rms_db - threshold_db) / ratio
            gain_db[boost_mask] = target_db - rms_db

        # Smooth gain envelope (attack/release) to avoid clicks
        alpha_attack = 1.0 - np.exp(-1.0 / (attack_sec * sr / hop_length))
        alpha_release = 1.0 - np.exp(-1.0 / (release_sec * sr / hop_length))
        smoothed = np.zeros_like(gain_db)
        for i in range(1, len(gain_db)):
            if gain_db[i] > smoothed[i - 1]:
                smoothed[i] = alpha_attack * gain_db[i] + (1 - alpha_attack) * smoothed[i - 1]
            else:
                smoothed[i] = alpha_release * gain_db[i] + (1 - alpha_release) * smoothed[i - 1]

        # Convert gain to linear and interpolate to sample level
        gain_linear = 10 ** (smoothed / 20.0)
        gain_samples = np.interp(
            np.arange(len(y)),
            np.arange(len(gain_linear)) * hop_length + frame_length // 2,
            gain_linear,
        )
        gain_samples = np.clip(gain_samples, 0.1, 8.0)  # safety: max 8× boost

        y_compressed = y * gain_samples

        boost_applied = float(gain_linear.max())
        if boost_applied > 1.05:
            logger.info(
                f"Dynamic range compression: max boost {boost_applied:.1f}x, "
                f"threshold {threshold_db:.0f}dB, ratio {ratio:.0f}:1"
            )
        else:
            logger.info("Dynamic range compression: no significant boost needed")

        return y_compressed

    @staticmethod
    def _detect_vocal_segments(
        y: "np.ndarray",
        sr: int,
        threshold_db: float = -35.0,
        min_silence_sec: float = 2.0,
        min_vocal_sec: float = 1.0,
        pad_sec: float = 0.3,
    ) -> List[tuple]:
        """Detect contiguous vocal regions by RMS energy.

        Returns a list of ``(start_sec, end_sec)`` tuples, each
        representing a segment where the vocal energy is above
        *threshold_db*.  Short gaps (< *min_silence_sec*) are merged
        into the surrounding vocal region and each segment is padded by
        *pad_sec* for a natural onset / decay.

        This is NOT the same as Silero VAD (which detects *speech*
        patterns and fails on singing).  Simple energy thresholding
        works perfectly on vocal-isolated tracks because the separator
        already removed instrumental energy — anything above the noise
        floor is vocals.
        """
        frame_length = int(0.05 * sr)   # 50 ms
        hop_length = int(0.025 * sr)    # 25 ms

        # Per-frame RMS
        frames = librosa.util.frame(y, frame_length=frame_length, hop_length=hop_length)
        rms = np.sqrt(np.mean(frames ** 2, axis=0))
        rms_db = 20 * np.log10(rms + 1e-10)

        # Boolean mask: True where energy exceeds threshold
        is_vocal = rms_db > threshold_db

        # Convert frame mask → sample-level time boundaries
        segments = []
        in_vocal = False
        seg_start = 0.0
        for i, v in enumerate(is_vocal):
            t = i * hop_length / sr
            if v and not in_vocal:
                seg_start = t
                in_vocal = True
            elif not v and in_vocal:
                seg_end = t
                if seg_end - seg_start >= min_vocal_sec:
                    segments.append((seg_start, seg_end))
                in_vocal = False
        if in_vocal:
            seg_end = len(y) / sr
            if seg_end - seg_start >= min_vocal_sec:
                segments.append((seg_start, seg_end))

        # Merge segments separated by short silence
        if len(segments) > 1:
            merged = [segments[0]]
            for start, end in segments[1:]:
                prev_start, prev_end = merged[-1]
                if start - prev_end < min_silence_sec:
                    merged[-1] = (prev_start, end)
                else:
                    merged.append((start, end))
            segments = merged

        # Add padding
        duration = len(y) / sr
        segments = [
            (max(0.0, s - pad_sec), min(duration, e + pad_sec))
            for s, e in segments
        ]

        return segments

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
            # Dynamic range compression — use the proper RMS-envelope
            # compressor to boost quiet vocal sections (verse endings,
            # fade-outs) to audible levels for Whisper.
            if config.get('dynamic_range_compression', False):
                y = self._apply_dynamic_range_compression(y, sr)

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
            except (ImportError, OSError):
                # OSError catches DLL load failures on Windows (e.g. torch_cuda.dll missing)
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
            # Provide a diagnostic-aware error message
            try:
                import faster_whisper  # noqa: F401 — check importability
                raise RuntimeError(
                    "faster-whisper loaded but engine is unavailable. "
                    "Check backend logs for details."
                )
            except ImportError as _ie:
                raise ImportError(
                    f"faster-whisper is not installed. "
                    f"Go to Settings → System → Python Packages and install it. "
                    f"({_ie})"
                ) from _ie
            except OSError as _oe:
                raise RuntimeError(
                    f"faster-whisper failed to load (missing DLL or C++ runtime). "
                    f"Install PyTorch with CUDA from Settings → System → Python Packages, "
                    f"then restart the app. Details: {_oe}"
                ) from _oe

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

    def _filter_hallucinations(self, segments: List[Dict], language: Optional[str] = None, content_type: str = 'speech') -> List[Dict]:
        """Filter out common Whisper hallucination patterns from segments.

        Handles: exact duplicates, near-duplicate consecutive segments,
        known hallucination phrases, and low-confidence segments.

        For music content, duplicate/near-duplicate filters are skipped
        because choruses and refrains naturally repeat identical lyrics.
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
        is_music = content_type == 'music'

        for seg in segments:
            text = seg.get('text', '').strip()
            normalized = text.lower().strip()

            # Skip empty or very short segments
            if len(normalized) < 2:
                logger.debug(f"Filtered too-short segment: '{text}'")
                continue

            # Skip exact duplicates (disabled for music — choruses repeat)
            if not is_music and normalized in seen_texts:
                logger.info(f"Filtered duplicate: '{text[:40]}...'")
                continue

            # Skip near-duplicate of previous segment (stuttering/looping)
            # Disabled for music — consecutive repeated lines are normal in songs
            if not is_music and prev_text and self._text_similarity(normalized, prev_text) > 0.95:
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
            # Music uses a lower threshold since singing produces lower confidence
            if seg.get('words') and seg['words']:
                avg_prob = sum(w.get('probability', 0) for w in seg['words']) / len(seg['words'])
                confidence_threshold = 0.05 if is_music else 0.10
                if avg_prob < confidence_threshold:
                    logger.info(f"Filtered low-confidence (avg_prob={avg_prob:.2f}, thr={confidence_threshold}): '{text[:40]}...'")
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

    def _transcribe_vocal_chunks(
        self,
        vocal_audio_path: str,
        language: Optional[str],
        task: str,
        word_timestamps: bool,
        progress_callback: Optional[callable],
        engine_params: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Chunk-based transcription for vocal-isolated tracks.

        Whisper processes audio in 30-second windows.  When a vocal-
        isolated track has long silent stretches (instrumental breaks),
        the decoder enters a hallucination loop at the silence→vocal
        transition and produces garbage text instead of lyrics.

        This method detects vocal regions by RMS energy, then transcribes
        each region independently.  Each region is DRC-compressed and
        peak-normalised before transcription.

        Returns the same dict structure as ``engine.transcribe()``.
        """
        import soundfile as sf

        y, sr = librosa.load(vocal_audio_path, sr=16000)
        total_duration = len(y) / sr

        # Detect vocal regions
        vocal_segments = self._detect_vocal_segments(y, sr)
        logger.info(
            f"Vocal chunk detection: {len(vocal_segments)} regions in "
            f"{total_duration:.1f}s track: "
            + ", ".join(f"{s:.0f}-{e:.0f}s" for s, e in vocal_segments)
        )

        if not vocal_segments:
            logger.warning("No vocal regions detected — falling back to full-file transcription")
            processed = self.preprocess_audio(vocal_audio_path)
            return self.engine.transcribe(
                processed, language=language, task=task,
                word_timestamps=word_timestamps,
                progress_callback=progress_callback,
                **engine_params,
            )

        all_segments = []
        detected_language = language or "en"
        language_probability = 0.0
        total_regions = len(vocal_segments)

        for ri, (region_start, region_end) in enumerate(vocal_segments):
            start_sample = int(region_start * sr)
            end_sample = min(int(region_end * sr), len(y))
            chunk_audio = y[start_sample:end_sample]
            chunk_duration = len(chunk_audio) / sr

            if chunk_duration < 0.5:
                continue

            logger.info(f"Transcribing region {ri + 1}/{total_regions}: "
                        f"{region_start:.1f}-{region_end:.1f}s ({chunk_duration:.1f}s)")

            # Apply DRC + normalize per region
            chunk_audio = self._apply_dynamic_range_compression(chunk_audio, sr)
            max_val = float(np.abs(chunk_audio).max())
            if max_val > 0:
                chunk_audio = chunk_audio / max_val * 0.95

            # Write to temp file
            chunk_path = str(Path(vocal_audio_path).parent / f"_chunk_{ri}.wav")
            sf.write(chunk_path, chunk_audio, sr)

            # Progress
            if progress_callback:
                pct = 55 + int((ri / total_regions) * 35)
                progress_callback(pct, f"Transcribing region {ri + 1}/{total_regions}...")

            try:
                chunk_result = self.engine.transcribe(
                    chunk_path,
                    language=language,
                    task=task,
                    word_timestamps=word_timestamps,
                    **engine_params,
                )

                # Update detected language from first region
                if ri == 0:
                    detected_language = chunk_result.get("language", detected_language)
                    language_probability = chunk_result.get("language_probability", 0)

                # Offset timestamps to original timeline
                for seg in chunk_result["segments"]:
                    seg["start"] = round(seg["start"] + region_start, 3)
                    seg["end"] = round(seg["end"] + region_start, 3)
                    if "words" in seg:
                        for w in seg["words"]:
                            w["start"] = round(w["start"] + region_start, 3)
                            w["end"] = round(w["end"] + region_start, 3)
                    all_segments.append(seg)

            except Exception as e:
                logger.warning(f"Region {ri + 1} transcription failed: {e}")
            finally:
                try:
                    os.remove(chunk_path)
                except OSError:
                    pass

        # Re-number IDs
        for i, seg in enumerate(all_segments):
            seg["id"] = i + 1

        logger.info(f"Chunk-based transcription: {len(all_segments)} segments "
                    f"from {total_regions} regions")

        return {
            "segments": all_segments,
            "language": detected_language,
            "language_probability": language_probability,
            "duration": total_duration,
        }

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

        # Audio preprocessing (applied to isolated vocals or original)
        if progress_callback:
            progress_callback(42, "Pre-processing audio...")
        if not vocal_isolation_applied:
            processed_audio_path = self.preprocess_music_audio(
                vocal_audio_path,
                content_type=content_type,
                genre=content_genre
            )
        else:
            processed_audio_path = vocal_audio_path  # chunks handle their own preprocessing

        # Determine optimal model size based on content type
        optimal_model = config['default_model']
        if language:
            # Check if language has specific requirements
            lang_model = self.get_optimal_model_size(language)
            # Use the larger of content-type requirement or language requirement
            model_priority = ['tiny', 'base', 'small', 'medium', 'turbo', 'large-v3']
            content_idx = model_priority.index(optimal_model) if optimal_model in model_priority else 4
            lang_idx = model_priority.index(lang_model) if lang_model in model_priority else 4
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
                HIGHER_IS_BETTER = {'beam_size', 'best_of', 'patience', 'compression_ratio_threshold', 'no_speech_threshold'}
                MORE_NEGATIVE_IS_BETTER = {'log_prob_threshold'}
                for key, value in lang_params.items():
                    if key not in params:
                        # New param from lang config — add it
                        params[key] = value
                    elif key == 'temperature':
                        continue  # Keep content-type config's fallback list
                    elif key == 'condition_on_previous_text':
                        if content_type == 'music':
                            continue  # Music: keep False to prevent hallucination loops
                        else:
                            params[key] = value
                    elif key in HIGHER_IS_BETTER:
                        params[key] = max(params[key], value)
                    elif key in MORE_NEGATIVE_IS_BETTER:
                        params[key] = min(params[key], value)
                    else:
                        params[key] = value
                logger.info(f"Merged params (music-priority) for {language}/{content_type}: {params}")
            else:
                # Speech: language params take priority — merge all keys
                for key, value in lang_params.items():
                    params[key] = value
        
        is_rtl = language and language.lower() in self.RTL_LANGUAGES

        if is_rtl:
            logger.info(f"RTL language detected: {language} - using optimized settings")
        
        # Build initial_prompt and user overrides
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

        # --- Transcription ---
        if progress_callback:
            progress_callback(50, "Transcription started...")

        if vocal_isolation_applied and AUDIO_PROCESSING_AVAILABLE:
            # Chunk-based transcription: detect vocal regions by energy,
            # transcribe each independently.  This prevents Whisper from
            # hallucinating at silence→vocal transitions.
            result = self._transcribe_vocal_chunks(
                vocal_audio_path, language, task, word_timestamps,
                progress_callback, params,
            )
        else:
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
        result_segments = self._filter_hallucinations(result_segments, language, content_type=content_type)
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
        """
        start_time = time.time()

        logger.info(f"transcribe() start — audio={audio_path}, lang={language}, model_override={model_size_override}")

        # Preprocess audio if requested (ffmpeg-based, no Python audio libs)
        processed_audio_path = audio_path
        if preprocess_audio:
            if progress_callback:
                progress_callback(10, "Analyzing audio...")
            processed_audio_path = self.preprocess_audio(audio_path)
            if progress_callback:
                progress_callback(17, "Audio ready...")

        _target_model = model_size_override or self.get_optimal_model_size(language)
        model_already_loaded = (
            getattr(self.engine, '_model', None) is not None
            and getattr(self.engine, '_model_id', None) == _target_model
        )
        if progress_callback:
            if model_already_loaded:
                progress_callback(20, f"Model ready ({_target_model})...")
            else:
                progress_callback(20, f"Loading {_target_model} model...")
        self.load_model(language, model_size_override=model_size_override)
        if progress_callback and not model_already_loaded:
            progress_callback(27, f"Model loaded ({_target_model})...")

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
            params['initial_prompt'] = ""
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
