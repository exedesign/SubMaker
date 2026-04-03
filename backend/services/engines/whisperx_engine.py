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
        "id": "large-v3",
        "name": "Large V3 (1550M)",
        "size_mb": 2900,
        "description": "Highest accuracy, slower",
    },
    {
        "id": "large-v3-turbo",
        "name": "Large V3 Turbo (809M)",
        "size_mb": 1600,
        "description": "Large-v3 quality, turbo speed",
    },
    {
        "id": "large-v2",
        "name": "Large V2 (1550M)",
        "size_mb": 2900,
        "description": "Very high accuracy, slower",
    },
    {
        "id": "distil-large-v3",
        "name": "Distil Large V3 (756M)",
        "size_mb": 1500,
        "description": "Large-v3 distilled — fast, high accuracy",
    },
    {
        "id": "medium",
        "name": "Medium (769M)",
        "size_mb": 1400,
        "description": "Slower, high accuracy",
    },
    {
        "id": "small",
        "name": "Small (244M)",
        "size_mb": 460,
        "description": "Balanced speed/accuracy",
    },
    {
        "id": "base",
        "name": "Base (74M)",
        "size_mb": 140,
        "description": "Fast, medium accuracy",
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
        models = [m.copy() for m in FASTER_WHISPER_MODELS]
        if language == "tr":
            models.append({
                "id": "selimc/whisper-large-v3-turbo-turkish",
                "name": "Turkish Fine-tuned (Turbo)",
                "size_mb": 800,
                "description": "Common Voice 17.0 Turkish fine-tune, best Turkish accuracy",
                "recommended": True,
            })
        return models

    # ------------------------------------------------------------------
    # Model loading
    # ------------------------------------------------------------------
    def load_model(self, model_id: str, device: str = "cpu", compute_type: str = "int8") -> None:
        from faster_whisper import WhisperModel

        # Skip reload if same model is already loaded
        if self._model is not None and self._model_id == model_id and self._device == device:
            logger.info(f"Faster-Whisper model already loaded: {model_id}")
            return

        logger.info(f"Loading Faster-Whisper model: {model_id} on {device} ({compute_type})")
        self._model = WhisperModel(
            model_id,
            device=device,
            compute_type=compute_type,
            download_root=str(MODELS_DIR),
            cpu_threads=os.cpu_count() or 4,
            num_workers=1,
        )
        self._model_id = model_id
        self._device = device
        self._compute_type = compute_type
        logger.info("Faster-Whisper model loaded successfully!")

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
        logger.info(f"Faster-Whisper transcription started. Language: {detected_language}")

        # --- 2) Consume generator and build segments ---
        if progress_callback:
            progress_callback(65, "Processing segments...")

        result_segments: List[SegmentResult] = []
        raw_segments = list(segments_gen)  # Consume generator fully

        for idx, seg in enumerate(raw_segments):
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

            # Progress
            if progress_callback and info.duration and info.duration > 0:
                raw_pct = min(seg_data["end"] / info.duration, 1.0)
                progress_callback(55 + int(raw_pct * 40), seg_data["text"][:40])

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
