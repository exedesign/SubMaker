"""
Cover Art Generator Registry — Multi-model image generation.
Each model has its own generator class implementing BaseGenerator.
"""
from __future__ import annotations
from typing import Dict, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from services.generators.base import BaseGenerator

_generators: Dict[str, BaseGenerator] = {}


def get_generator(model_id: str = "flux-klein"):
    """Get or create a generator instance for the given model ID."""
    if model_id not in _generators:
        from config import COVER_ART_MODELS
        if model_id not in COVER_ART_MODELS:
            raise ValueError(f"Unknown cover art model: {model_id}")

        model_cfg = COVER_ART_MODELS[model_id]
        cls_path = model_cfg["generator_class"]

        # Import the generator class
        module_name, class_name = cls_path.rsplit(".", 1)
        import importlib
        mod = importlib.import_module(module_name)
        cls = getattr(mod, class_name)
        _generators[model_id] = cls(model_id)

    return _generators[model_id]


def get_all_model_info() -> list:
    """Return metadata for all registered cover art models."""
    from config import COVER_ART_MODELS
    result = []
    for model_id, cfg in COVER_ART_MODELS.items():
        result.append({
            "id": model_id,
            "name": cfg["name"],
            "description": cfg["description"],
            "vram_estimate": cfg["vram_estimate"],
            "defaults": cfg["defaults"],
            "supports_negative_prompt": cfg.get("supports_negative_prompt", False),
            "supports_text_macros": cfg.get("supports_text_macros", False),
        })
    return result
