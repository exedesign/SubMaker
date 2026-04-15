"""
FLUX.2 Klein 4B Generator (BitsAndBytes NF4)
Model: black-forest-labs/FLUX.2-klein-4B
  Transformer: NF4 quantized (~7.2 GB → ~1.8 GB)
  Text Encoder: Qwen3ForCausalLM NF4 quantized (~4.6 GB → ~1.2 GB)
  VAE: FLUX.2 Small Decoder (~28M params, ~0.11 GB) — 1.4x faster decode
Pipeline: diffusers Flux2KleinPipeline (requires diffusers git main)
VRAM: ~3.1 GB models, GPU-resident (no CPU offload)
"""

import gc
import logging
from pathlib import Path
from typing import Dict

import torch

from config import FLUX_KLEIN_MODEL_REPO, FLUX_KLEIN_LOCAL_DIR, FLUX_SMALL_DECODER_REPO, FLUX_SMALL_DECODER_LOCAL_DIR
from services.generators.base import BaseGenerator

logger = logging.getLogger(__name__)


class FluxKleinGenerator(BaseGenerator):
    """FLUX.2 Klein 4B cover art generator using BitsAndBytes NF4 quantization + Qwen3 text encoder."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Prompt embedding cache — avoids re-running Qwen3 text encoder for repeated prompts
        self._cached_prompt = None
        self._cached_prompt_embeds = None
        self._cached_text_ids = None

    def _ensure_loaded(self, progress_callback=None):
        def _progress(pct, msg):
            if progress_callback:
                progress_callback(pct, msg, None)

        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return

            _progress(2, "Preparing VRAM...")
            from services.vram_manager import get_vram_manager
            get_vram_manager().acquire(self.model_id)

            torch.backends.cudnn.benchmark = True
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True

            # Resolve model source — local bundled directory or HuggingFace Hub
            local_dir = Path(str(FLUX_KLEIN_LOCAL_DIR))
            if (local_dir / "model_index.json").exists():
                model_source = str(local_dir)
                logger.info(f"[FluxKlein] Using local model: {model_source}")
            else:
                model_source = FLUX_KLEIN_MODEL_REPO
                logger.info(f"[FluxKlein] Local model not found, using HuggingFace: {model_source}")

            # Load transformer with NF4 quantization (~7.2 GB → ~1.8 GB)
            _progress(5, "Loading FLUX Klein transformer (NF4 quantized)...")
            logger.info("[FluxKlein] Loading transformer with BitsAndBytes NF4 quantization...")
            from diffusers import Flux2KleinPipeline, Flux2Transformer2DModel, BitsAndBytesConfig
            from transformers import BitsAndBytesConfig as TransformersBnBConfig

            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
            )

            transformer = Flux2Transformer2DModel.from_pretrained(
                model_source,
                subfolder="transformer",
                quantization_config=bnb_config,
                torch_dtype=torch.bfloat16,
            )

            # Load text encoder with NF4 quantization (~4.6 GB → ~1.2 GB)
            _progress(12, "Loading Qwen3 text encoder (NF4 quantized)...")
            logger.info("[FluxKlein] Loading Qwen3 text encoder with NF4 quantization...")
            from transformers import AutoModelForCausalLM

            text_encoder_bnb = TransformersBnBConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16,
            )

            text_encoder = AutoModelForCausalLM.from_pretrained(
                model_source,
                subfolder="text_encoder",
                quantization_config=text_encoder_bnb,
                torch_dtype=torch.bfloat16,
            )

            # Load Small Decoder VAE (~28M params, ~1.4x faster decode)
            _progress(15, "Loading FLUX.2 Small Decoder VAE...")
            from diffusers import AutoencoderKLFlux2
            small_decoder_dir = Path(str(FLUX_SMALL_DECODER_LOCAL_DIR))
            if (small_decoder_dir / "config.json").exists():
                vae_source = str(small_decoder_dir)
                logger.info(f"[FluxKlein] Using local Small Decoder VAE: {vae_source}")
            else:
                vae_source = FLUX_SMALL_DECODER_REPO
                logger.info(f"[FluxKlein] Local Small Decoder not found, using HuggingFace: {vae_source}")

            vae = AutoencoderKLFlux2.from_pretrained(
                vae_source,
                torch_dtype=torch.bfloat16,
            )

            # Build pipeline — all models GPU-resident, no CPU offload
            _progress(18, "Building Flux2Klein pipeline (GPU-resident)...")
            logger.info("[FluxKlein] Loading Flux2KleinPipeline (GPU-resident, no CPU offload)...")

            self.pipe = Flux2KleinPipeline.from_pretrained(
                model_source,
                transformer=transformer,
                text_encoder=text_encoder,
                vae=vae,
                torch_dtype=torch.bfloat16,
            )

            # Move VAE to GPU (small decoder: ~0.11 GB) — transformer & text_encoder already on CUDA from BnB
            self.pipe.vae.to("cuda")

            self._loaded = True
            _progress(25, "Pipeline ready")
            logger.info("[FluxKlein] Pipeline ready — GPU-resident (transformer NF4 + Qwen3 NF4 + Small Decoder VAE)")

    def _latent_to_preview(self, latents, height, width):
        """
        Flux Klein packed latent preview.
        Latents shape: [B, (H/16)*(W/16), 64] — 2x patch size, 64 channels.
        """
        try:
            from PIL import Image as PILImage

            lat = latents[0].float().cpu()  # [seq_len, 64]

            if lat.dim() != 2:
                return None

            h_lat = height // 16
            w_lat = width // 16
            c = 64

            if lat.shape[0] != h_lat * w_lat or lat.shape[1] < c:
                return None

            lat = lat[:, :c].reshape(h_lat, w_lat, c).permute(2, 0, 1)  # [64, h, w]

            # Pick 3 evenly-spaced channels for RGB approximation
            r_idx, g_idx, b_idx = 0, c // 3, 2 * c // 3
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

            import io, base64
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=50)
            return base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception as e:
            logger.debug(f"[FluxKlein] Latent preview error: {e}")
            return None

    def _do_generate(self, prompt: str, negative_prompt: str, width: int, height: int,
                     num_inference_steps: int, guidance_scale: float, seed: int,
                     progress_callback=None) -> Dict:
        def _progress(pct, msg, preview=None):
            if progress_callback:
                progress_callback(pct, msg, preview)

        # Cancel pending unload timer before starting
        if self._unload_timer:
            self._unload_timer.cancel()
            self._unload_timer = None

        # Clamp dimensions to valid range and round to nearest multiple of 16
        width = max(256, min(2048, round(width / 16) * 16))
        height = max(256, min(2048, round(height / 16) * 16))

        self._ensure_loaded(progress_callback)

        if self.pipe is None:
            raise RuntimeError("FLUX Klein pipeline failed to load")

        _progress(28, "Processing prompt...")

        generator, actual_seed = self._make_seed(seed)

        # Cache prompt embeddings — skip Qwen3 text encoder if prompt unchanged
        cache_key = (prompt, 512)  # (prompt, max_sequence_length)
        if self._cached_prompt == cache_key and self._cached_prompt_embeds is not None:
            prompt_embeds = self._cached_prompt_embeds
            text_ids = self._cached_text_ids
            use_cached = True
            logger.info("[FluxKlein] Using cached prompt embeddings (skipping text encoder)")
        else:
            use_cached = False

        logger.info(
            f"[FluxKlein] Generating {width}x{height}, steps={num_inference_steps}, "
            f"cfg={guidance_scale}, seed={actual_seed}, cached_prompt={use_cached}"
        )
        _progress(30, f"Generating image (seed: {actual_seed})...")

        def _step_callback(pipe, step_index, timestep, callback_kwargs):
            pct = 30 + int((step_index + 1) / num_inference_steps * 60)
            preview_b64 = None
            try:
                latents = callback_kwargs.get("latents")
                if latents is not None:
                    preview_b64 = self._latent_to_preview(latents, height, width)
            except Exception as e:
                logger.debug(f"[FluxKlein] Preview error: {e}")
            _progress(pct, f"Diffusion step {step_index + 1}/{num_inference_steps}", preview_b64)
            return callback_kwargs

        with torch.inference_mode():
            if use_cached:
                image = self.pipe(
                    prompt_embeds=prompt_embeds,
                    height=height,
                    width=width,
                    num_inference_steps=num_inference_steps,
                    guidance_scale=guidance_scale,
                    generator=generator,
                    max_sequence_length=512,
                    callback_on_step_end=_step_callback,
                    callback_on_step_end_tensor_inputs=["latents"],
                ).images[0]
            else:
                # Encode prompt and cache for future calls
                prompt_embeds, text_ids = self.pipe.encode_prompt(
                    prompt=prompt,
                    max_sequence_length=512,
                )
                self._cached_prompt = cache_key
                self._cached_prompt_embeds = prompt_embeds
                self._cached_text_ids = text_ids
                logger.info("[FluxKlein] Prompt encoded and cached")

                image = self.pipe(
                    prompt_embeds=prompt_embeds,
                    height=height,
                    width=width,
                    num_inference_steps=num_inference_steps,
                    guidance_scale=guidance_scale,
                    generator=generator,
                    max_sequence_length=512,
                    callback_on_step_end=_step_callback,
                    callback_on_step_end_tensor_inputs=["latents"],
                ).images[0]

        _progress(92, "Encoding image...")
        image_base64 = self._image_to_base64(image)
        self._schedule_unload()
        _progress(100, "Complete")

        return {
            "image_base64": image_base64,
            "seed": actual_seed,
            "width": width,
            "height": height,
        }
