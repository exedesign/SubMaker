"""
Global VRAM Manager — Coordinates GPU memory across all AI models.
Ensures only one large model occupies VRAM at a time on memory-constrained GPUs (e.g. 8GB RTX 3070).
Models: Whisper (transcription), Qwen 2.5 (analysis/translation), FLUX Klein (image generation)
"""

import gc
import logging
import threading
from typing import Optional, Callable, Dict

logger = logging.getLogger(__name__)


class VRAMManager:
    """Singleton that tracks which model currently holds GPU memory
    and ensures clean handoff between models."""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._active_model: Optional[str] = None
        self._unloaders: Dict[str, Callable] = {}
        self._op_lock = threading.Lock()
        logger.info("[VRAM] Manager initialized")

    def register(self, model_name: str, unload_fn: Callable):
        """Register a model's unload function so the manager can evict it when needed."""
        self._unloaders[model_name] = unload_fn
        logger.info(f"[VRAM] Registered model: {model_name}")

    def acquire(self, model_name: str):
        """Prepare VRAM for `model_name` by unloading any other active model."""
        with self._op_lock:
            if self._active_model == model_name:
                return  # Already active

            if self._active_model and self._active_model in self._unloaders:
                prev = self._active_model
                logger.info(f"[VRAM] Evicting '{prev}' to make room for '{model_name}'")
                try:
                    self._unloaders[prev]()
                except Exception as e:
                    logger.warning(f"[VRAM] Error unloading '{prev}': {e}")
                self._cleanup_gpu()

            self._active_model = model_name
            logger.info(f"[VRAM] Acquired for '{model_name}'")

    def release(self, model_name: str):
        """Release VRAM held by `model_name`."""
        with self._op_lock:
            if self._active_model != model_name:
                return
            if model_name in self._unloaders:
                try:
                    self._unloaders[model_name]()
                except Exception as e:
                    logger.warning(f"[VRAM] Error unloading '{model_name}': {e}")
            self._active_model = None
            self._cleanup_gpu()
            logger.info(f"[VRAM] Released '{model_name}'")

    def release_all(self) -> list:
        """Unload ALL registered models and free VRAM. Returns list of unloaded model names."""
        unloaded = []
        with self._op_lock:
            for name, unload_fn in list(self._unloaders.items()):
                try:
                    unload_fn()
                    unloaded.append(name)
                    logger.info(f"[VRAM] Unloaded '{name}'")
                except Exception as e:
                    logger.warning(f"[VRAM] Error unloading '{name}': {e}")
            self._active_model = None
            self._cleanup_gpu()
            logger.info(f"[VRAM] All models released: {unloaded}")
        return unloaded

    def get_active(self) -> Optional[str]:
        return self._active_model

    @staticmethod
    def _cleanup_gpu():
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
        except ImportError:
            pass


# Module-level accessor
def get_vram_manager() -> VRAMManager:
    return VRAMManager()
