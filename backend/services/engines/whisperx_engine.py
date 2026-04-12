"""
Faster-Whisper ASR Engine — direct transcription with word-level timestamps.
Uses faster-whisper (CTranslate2) for fast, accurate transcription
with built-in word timestamp support. No external alignment needed.
"""
import os
import time
import logging
from typing import Dict, Any, Optional, List
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).parent.parent.parent))
from config import MODELS_DIR

from .base import TranscriptionResult, SegmentResult

logger = logging.getLogger(__name__)


# Faster-Whisper model catalogue
FASTER_WHISPER_MODELS = [
    {
        "id": "turbo",
        "name": "Turbo (809M)",
        "size_mb": 1600,
        "description": "Fast, high accuracy (recommended)",
    },
    {
        "id": "distil-large-v3",
        "name": "Distil Large V3 (756M)",
        "size_mb": 1500,
        "description": "Large-v3 distilled — fast, high accuracy",
    },
    {
        "id": "small",
        "name": "Small (244M)",
        "size_mb": 460,
        "description": "Balanced speed/accuracy",
    },
    {
        "id": "tiny",
        "name": "Tiny (39M)",
        "size_mb": 75,
        "description": "Fastest, low accuracy",
    },
]


class FasterWhisperEngine:
    """ASR engine using faster-whisper (CTranslate2) with built-in word timestamps."""

    engine_id = "faster-whisper"
    engine_name = "Faster-Whisper"

    def __init__(self):
        self._model = None
        self._model_id = None
        self._device = "cpu"
        self._compute_type = "int8"

    # ------------------------------------------------------------------
    # Availability
    # ------------------------------------------------------------------
    def is_available(self) -> bool:
        try:
            import faster_whisper  # noqa: F401
            return True
        except (ImportError, OSError):
            return False

    # ------------------------------------------------------------------
    # Model catalogue
    # ------------------------------------------------------------------
    def get_available_models(self, language: Optional[str] = None) -> List[Dict[str, Any]]:
        return [m.copy() for m in FASTER_WHISPER_MODELS]

    # ------------------------------------------------------------------
    # Model loading
    # ------------------------------------------------------------------
    def load_model(self, model_id: str, device: str = "cpu", compute_type: str = "int8") -> None:
        from faster_whisper import WhisperModel

        # Skip reload if same model is already loaded
        if self._model is not None and self._model_id == model_id and self._device == device:
            logger.info(f"Faster-Whisper model already loaded: {model_id}")
            return

        # Preload PyTorch cuDNN DLLs to prevent version conflicts (same fix as vocal_isolator)
        if device == "cuda":
            try:
                import torch
                if torch.cuda.is_available() and os.name == "nt":
                    torch_lib = os.path.join(os.path.dirname(torch.__file__), "lib")
                    if os.path.isdir(torch_lib):
                        os.add_dll_directory(torch_lib)
                        logger.info(f"Added PyTorch DLL directory for cuDNN: {torch_lib}")
            except Exception as e:
                logger.warning(f"cuDNN preload failed: {e}")

        logger.info(f"Loading Faster-Whisper model: {model_id} on {device} ({compute_type})")
        logger.info(f"Model download/cache dir: {MODELS_DIR}")

        # Check if a flat (non-HuggingFace-cache) model directory exists
        flat_model_dir = os.path.join(str(MODELS_DIR), model_id)
        if os.path.isdir(flat_model_dir) and any(
            f.endswith(".bin") for f in os.listdir(flat_model_dir)
        ):
            model_path = flat_model_dir
            logger.info(f"Using local flat model directory: {model_path}")
        else:
            model_path = model_id
            logger.info(f"Using HuggingFace model ID: {model_path}")

        try:
            self._model = WhisperModel(
                model_path,
                device=device,
                compute_type=compute_type,
                download_root=str(MODELS_DIR),
                cpu_threads=os.cpu_count() or 4,
                num_workers=1,
            )
        except Exception as e:
            err_msg = str(e)
            if "snapshot" in err_msg or "internet" in err_msg.lower() or "locate the files" in err_msg:
                raise RuntimeError(
                    f"Model '{model_id}' not found locally and could not be downloaded. "
                    f"Cache dir: {MODELS_DIR}. "
                    f"Please check your internet connection — models are downloaded on first use (~1-3 GB per model). "
                    f"Original error: {err_msg}"
                ) from e
            raise
        self._model_id = model_id
        self._device = device
        self._compute_type = compute_type
        logger.info("Faster-Whisper model loaded successfully!")

    # ------------------------------------------------------------------
    # Unload
    # ------------------------------------------------------------------
    def unload_model(self) -> None:
        """Free GPU/CPU memory held by the loaded model."""
        if self._model is None:
            return
        logger.info(f"Unloading Faster-Whisper model: {self._model_id}")
        del self._model
        self._model = None
        self._model_id = None
        import gc
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except ImportError:
            pass
        logger.info("Faster-Whisper model unloaded")

    # ------------------------------------------------------------------
    # Transcribe
    # ------------------------------------------------------------------
    def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
        task: str = "transcribe",
        word_timestamps: bool = True,
        progress_callback: Optional[callable] = None,
        **engine_params
    ) -> TranscriptionResult:

        if self._model is None:
            raise RuntimeError("No model loaded. Call load_model() first.")

        # --- 1) Transcribe ---
        if progress_callback:
            progress_callback(55, "Running Faster-Whisper transcription...")

        # Build faster-whisper compatible params
        fw_params = {}
        known_params = {
            'beam_size', 'best_of', 'patience', 'temperature',
            'no_speech_threshold', 'log_prob_threshold',
            'compression_ratio_threshold', 'condition_on_previous_text',
            'suppress_blank', 'initial_prompt',
            'hallucination_silence_threshold',
            'repetition_penalty', 'no_repeat_ngram_size',
            'prompt_reset_on_temperature',
            'vad_filter', 'vad_parameters',
        }
        for k, v in engine_params.items():
            if k in known_params and v is not None:
                fw_params[k] = v

        segments_gen, info = self._model.transcribe(
            audio_path,
            language=language,
            task=task,
            word_timestamps=word_timestamps,
            **fw_params,
        )

        detected_language = info.language or language or "en"
        logger.info(f"Faster-Whisper transcription started. Language: {detected_language}, duration: {info.duration:.1f}s")

        # --- 2) Iterate generator lazily for real-time progress ---
        if progress_callback:
            progress_callback(56, "Transcribing audio...")

        result_segments: List[SegmentResult] = []
        idx = 0
        for seg in segments_gen:
            seg_data: SegmentResult = {
                "id": idx + 1,
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg.text.strip(),
            }

            # Word-level timestamps from faster-whisper
            seg_data["words"] = []
            seg_words = seg.words or []
            for w in seg_words:
                seg_data["words"].append({
                    "word": w.word.strip(),
                    "start": round(w.start, 3),
                    "end": round(w.end, 3),
                    "probability": round(w.probability, 3),
                })

            # If no word timestamps but text exists, add segment as single word block
            if not seg_words and seg.text.strip():
                seg_data["words"].append({
                    "word": seg.text.strip(),
                    "start": round(seg.start, 3),
                    "end": round(seg.end, 3),
                    "probability": 1.0,
                })

            result_segments.append(seg_data)

            # Progress — report per segment as generator yields them
            if progress_callback and info.duration and info.duration > 0:
                raw_pct = min(seg_data["end"] / info.duration, 1.0)
                progress_callback(55 + int(raw_pct * 40), seg_data["text"][:40])
            idx += 1

        # --- 3) Duration ---
        duration = info.duration or 0.0
        if not duration and result_segments:
            duration = result_segments[-1]["end"]

        # --- 4) Build result ---
        if progress_callback:
            progress_callback(92, "Organizing results...")

        logger.info(f"Transcription done: {len(result_segments)} segments, {duration:.1f}s")

        return {
            "segments": result_segments,
            "language": detected_language,
            "language_probability": round(info.language_probability or 0.0, 3),
            "duration": round(duration, 3),
        }
