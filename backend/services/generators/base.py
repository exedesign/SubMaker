"""
BaseGenerator — Abstract base class for cover art generators.
All model-specific generators must subclass this.
"""
import base64
import gc
import io
import logging
import re
import threading
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from threading import Lock
from typing import Dict, Optional

import torch

logger = logging.getLogger(__name__)


class BaseGenerator(ABC):
    """Abstract base class for cover art image generators."""

    def __init__(self, model_id: str):
        self.model_id = model_id
        self.pipe = None
        self._lock = Lock()
        self._loaded = False
        self._unload_timer = None

        from services.vram_manager import get_vram_manager
        get_vram_manager().register(model_id, self._do_unload)

    @abstractmethod
    def _ensure_loaded(self, progress_callback=None):
        """Load the model pipeline. Called before generation."""
        ...

    @abstractmethod
    def _do_generate(self, prompt: str, negative_prompt: str, width: int, height: int,
                     num_inference_steps: int, guidance_scale: float, seed: int,
                     progress_callback=None) -> Dict:
        """Model-specific generation logic. Returns dict with image_base64, seed, width, height."""
        ...

    def get_defaults(self) -> Dict:
        """Return default generation parameters for this model."""
        from config import COVER_ART_MODELS
        return COVER_ART_MODELS[self.model_id]["defaults"]

    def get_model_info(self) -> Dict:
        """Return model metadata."""
        from config import COVER_ART_MODELS
        cfg = COVER_ART_MODELS[self.model_id]
        return {
            "id": self.model_id,
            "name": cfg["name"],
            "description": cfg["description"],
            "vram_estimate": cfg["vram_estimate"],
            "defaults": cfg["defaults"],
            "supports_text_macros": cfg.get("supports_text_macros", False),
        }

    def generate(self, prompt: str, width: int = 1024, height: int = 1024,
                 num_inference_steps: int = 4, guidance_scale: float = 0.0,
                 seed: int = -1, negative_prompt: str = "",
                 progress_callback=None) -> Dict:
        """Generate a cover art image. Handles text[] macros and delegates to model-specific _do_generate."""
        # Cancel any pending unload — we're about to use the pipeline
        if self._unload_timer:
            self._unload_timer.cancel()
            self._unload_timer = None

        # Extract text macros before sending prompt to the model
        clean_prompt, text_macros = self.extract_text_macros(prompt)

        result = self._do_generate(
            prompt=clean_prompt or prompt,
            negative_prompt=negative_prompt,
            width=width,
            height=height,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            seed=seed,
            progress_callback=progress_callback,
        )

        # Apply text overlay if macros were found
        if text_macros and result.get("image_base64"):
            from PIL import Image as PILImage
            img_bytes = base64.b64decode(result["image_base64"])
            img = PILImage.open(io.BytesIO(img_bytes)).convert("RGBA")
            img = self.apply_text_overlay(img, text_macros)
            img_rgb = img.convert("RGB")
            result["image_base64"] = self._image_to_base64(img_rgb)

        # Save to temp file instead of keeping base64 in memory
        if result.get("image_base64"):
            from config import TEMP_DIR
            cover_dir = Path(TEMP_DIR) / "cover_art"
            cover_dir.mkdir(parents=True, exist_ok=True)
            filename = f"cover_{uuid.uuid4().hex[:12]}.png"
            file_path = cover_dir / filename
            file_path.write_bytes(base64.b64decode(result["image_base64"]))
            result["image_filename"] = filename
            result["image_path"] = str(file_path)
            del result["image_base64"]

        return result

    def _do_unload(self):
        """Unload pipeline and free VRAM."""
        with self._lock:
            if not self._loaded:
                return
            if self._unload_timer:
                self._unload_timer.cancel()
                self._unload_timer = None
            logger.info(f"[{self.model_id}] Unloading pipeline...")
            del self.pipe
            self.pipe = None
            self._loaded = False
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            logger.info(f"[{self.model_id}] Pipeline unloaded")

    def _schedule_unload(self, delay: float = 120.0):
        """Schedule unload after inactivity."""
        if self._unload_timer:
            self._unload_timer.cancel()
        self._unload_timer = threading.Timer(delay, self._do_unload)
        self._unload_timer.daemon = True
        self._unload_timer.start()

    def _make_seed(self, seed: int):
        """Create a torch Generator on CPU with the given seed (or random if -1)."""
        if seed < 0:
            gen = torch.Generator("cpu")
            actual_seed = gen.seed()
        else:
            actual_seed = seed
            gen = torch.Generator("cpu").manual_seed(actual_seed)
        return gen, actual_seed

    def _image_to_base64(self, image) -> str:
        """Convert a PIL image to base64 PNG string."""
        buf = io.BytesIO()
        image.save(buf, format="PNG", optimize=True)
        return base64.b64encode(buf.getvalue()).decode("utf-8")

    # ── Text overlay (text[...] macro) ────────────────────────────────

    _TEXT_MACRO_RE = re.compile(
        r'text\[([^\]]+)\](?:@(top-left|top|top-right|left|center|right|bottom-left|bottom|bottom-right))?(?::(\w+))?',
        re.IGNORECASE,
    )

    # AI text style → prompt descriptor (Flux Klein compatible)
    _AI_TEXT_STYLES = {
        'calligraphic': 'elegant calligraphic lettering',
        'neon':         'glowing neon sign',
        'graffiti':     'graffiti street art style',
        'gothic':       'gothic blackletter',
        'handwritten':  'handwritten script',
        'abstract':     'abstract artistic typography',
        'retro':        'retro vintage',
        'metallic':     '3D shiny metallic',
        'watercolor':   'watercolor painted',
        'fire':         'text made of flames and fire',
        'stencil':      'military stencil',
        'pixel':        'pixel art 8-bit',
        'embossed':     'embossed carved stone',
        'glitch':       'digital glitch distorted',
        'chalk':        'chalk on blackboard',
        'typewriter':   'old typewriter',
    }

    # Position → natural language for AI prompt
    _POS_DESCRIPTIONS = {
        'top-left':     'in the top-left corner',
        'top':          'at the top',
        'top-right':    'in the top-right corner',
        'left':         'on the left side',
        'center':       'in the center',
        'right':        'on the right side',
        'bottom-left':  'in the bottom-left corner',
        'bottom':       'at the bottom',
        'bottom-right': 'in the bottom-right corner',
    }

    @staticmethod
    def extract_text_macros(prompt: str):
        """
        Extract text[Content]@position:style macros from prompt.
        Returns (clean_prompt, pil_macros, ai_prompt_parts).
        - pil_macros: [(text, position), ...] for PIL post-processing (no style / style='plain')
        - ai_prompt_parts: [str, ...] prompt fragments for AI-rendered text (when style is set)
        """
        pil_macros = []
        ai_parts = []

        def _repl(m):
            text = m.group(1).strip()
            pos = (m.group(2) or 'bottom').lower()
            style = (m.group(3) or '').lower()

            if style and style != 'plain':
                # AI-rendered: convert to prompt description
                style_desc = BaseGenerator._AI_TEXT_STYLES.get(style, style)
                pos_desc = BaseGenerator._POS_DESCRIPTIONS.get(pos, f'at the {pos}')
                ai_parts.append(f'{style_desc} text saying "{text}" {pos_desc}')
            else:
                # PIL overlay (plain or no style)
                pil_macros.append((text, pos))
            return ''

        clean = BaseGenerator._TEXT_MACRO_RE.sub(_repl, prompt)
        clean = re.sub(r'\s{2,}', ' ', clean).strip().rstrip(',').strip()

        # Append AI text descriptions to the clean prompt
        if ai_parts:
            ai_text = ', '.join(ai_parts)
            clean = f'{clean}, {ai_text}' if clean else ai_text

        return clean, pil_macros

    @staticmethod
    def apply_text_overlay(image, macros):
        """
        Draw text overlays on a PIL image.
        macros: [(text, position), ...] where position is one of 9 grid positions.
        """
        if not macros:
            return image
        from PIL import ImageDraw, ImageFont
        from pathlib import Path

        img = image.copy()
        draw = ImageDraw.Draw(img)
        W, H = img.size

        # Try to load a good font, fall back to default
        font_size = max(24, int(H * 0.06))
        font = None
        # Common system fonts on Windows
        font_paths = [
            Path("C:/Windows/Fonts/arialbd.ttf"),
            Path("C:/Windows/Fonts/arial.ttf"),
            Path("C:/Windows/Fonts/segoeui.ttf"),
        ]
        for fp in font_paths:
            if fp.exists():
                try:
                    font = ImageFont.truetype(str(fp), font_size)
                    break
                except Exception:
                    pass
        if font is None:
            font = ImageFont.load_default()

        for text, position in macros:
            # Measure text
            bbox = draw.textbbox((0, 0), text, font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]

            margin = int(H * 0.05)

            # X position
            if 'left' in position:
                x = margin
            elif 'right' in position:
                x = W - tw - margin
            else:  # center / top / bottom (no left/right)
                x = (W - tw) // 2

            # Y position
            if position.startswith('top'):
                y = margin
            elif position.startswith('bottom') or position == 'none':
                y = H - th - margin
            elif position in ('left', 'center', 'right'):
                y = (H - th) // 2
            else:  # fallback bottom
                y = H - th - margin

            # Draw shadow then text
            shadow_offset = max(2, font_size // 16)
            draw.text((x + shadow_offset, y + shadow_offset), text, font=font, fill=(0, 0, 0, 180))
            draw.text((x, y), text, font=font, fill=(255, 255, 255, 255))

        return img

    def _latent_to_preview(self, latents, height, width):
        """
        Convert latent tensor to a rough RGB preview image (no VAE decode).
        Returns base64 JPEG string or None on failure.
        Works with both 4D [B,C,H,W] and packed 2D [seq, hidden] latents.
        """
        try:
            from PIL import Image as PILImage

            lat = latents[0].float().cpu()

            if lat.dim() == 3:
                pass  # [C, H, W]
            elif lat.dim() == 2:
                h_lat = height // 8
                w_lat = width // 8
                c = 16
                if lat.shape[0] == h_lat * w_lat and lat.shape[1] >= c:
                    lat = lat[:, :c].reshape(h_lat, w_lat, c).permute(2, 0, 1)
                else:
                    return None
            else:
                return None

            nc = lat.shape[0]
            r_idx, g_idx, b_idx = 0, nc // 3, 2 * nc // 3
            rgb = torch.stack([lat[r_idx], lat[g_idx], lat[b_idx]])

            for i in range(3):
                mn, mx = rgb[i].min(), rgb[i].max()
                if mx - mn > 1e-8:
                    rgb[i] = (rgb[i] - mn) / (mx - mn)
                else:
                    rgb[i] = torch.zeros_like(rgb[i])

            rgb_np = (rgb * 255).byte().numpy().transpose(1, 2, 0)
            img = PILImage.fromarray(rgb_np)
            img = img.resize((256, 256), PILImage.BILINEAR)

            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=50)
            return base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception as e:
            logger.debug(f"[{self.model_id}] Latent preview error: {e}")
            return None

    @staticmethod
    def save_image(image_base64: str, filename: str, target_dir: str = None) -> str:
        """Save base64 image to disk. Returns absolute path."""
        from config import OUTPUT_DIR
        from pathlib import Path

        safe_name = re.sub(r'[^\w\-.]', '_', filename)
        if not safe_name.lower().endswith('.png'):
            safe_name += '.png'

        if target_dir and Path(target_dir).is_dir():
            out_path = Path(target_dir) / safe_name
        else:
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            out_path = OUTPUT_DIR / safe_name

        img_bytes = base64.b64decode(image_base64)
        out_path.write_bytes(img_bytes)
        logger.info(f"Saved cover art: {out_path}")
        return str(out_path)
