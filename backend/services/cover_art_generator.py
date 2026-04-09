"""
Cover Art Generator Service — Multi-Model Router
Delegates to model-specific generators via services.generators package.
Backward-compatible: get_cover_art_generator() still works (defaults to flux-klein).
"""

import logging
from typing import Optional

from services.generators import get_generator, get_all_model_info
from services.generators.base import BaseGenerator

logger = logging.getLogger(__name__)


def get_cover_art_generator(model_id: str = "flux-klein") -> BaseGenerator:
    """Get a cover art generator for the given model ID."""
    return get_generator(model_id)


def get_available_models() -> list:
    """Return metadata for all available cover art models."""
    return get_all_model_info()

