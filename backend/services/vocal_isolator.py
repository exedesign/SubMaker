"""
Vocal Isolation Service — multi-engine, multi-model support

Engines:
  audio-separator (MDX23C, BS-Roformer — via ONNX/PyTorch) — fast/quality 2-stem
  Demucs (PyTorch) — high quality, 4-stem (vocals, drums, bass, other)

Models:
  MDX23C:       Fast 2-stem separation (~120MB, auto-download)
  BS-Roformer:  Best vocal quality SDR 12.97 (~500MB, auto-download)
  Demucs FT:    4-stem separation (vocals, drums, bass, other)

Outputs:
  - Whisper format: mono 16kHz WAV for transcription
  - Full quality: original sample rate WAV for listening (vocals + instrumental/stems)
"""
import hashlib
import logging
import os
import shutil
import time
from pathlib import Path
from typing import Optional, Callable, Dict, List

import numpy as np

logger = logging.getLogger(__name__)

_vocal_isolator_instance = None


def get_vocal_isolator():
    """Get or create singleton VocalIsolator instance"""
    global _vocal_isolator_instance
    if _vocal_isolator_instance is None:
        _vocal_isolator_instance = VocalIsolator()
    return _vocal_isolator_instance


# Available models configuration
AVAILABLE_MODELS = {
    "mdx23c": {
        "engine": "mdx",
        "model_file": "MDX23C-8KFFT-InstVoc_HQ.ckpt",
        "label": "MDX23C",
        "description": "Gelişmiş MDX mimarisi, hızlı 2-stem ayrıştırma. İlk kullanımda indirir (~120MB).",
        "stems": ["vocals", "instrumental"],
        "speed": "fast",
    },
    "bs_roformer": {
        "engine": "mdx",
        "model_file": "model_bs_roformer_ep_317_sdr_12.9755.ckpt",
        "label": "BS-Roformer",
        "description": "SDR 12.97 — en yüksek vokal kalitesi, minimal sızıntı. İlk kullanımda indirir (~500MB).",
        "stems": ["vocals", "instrumental"],
        "speed": "medium",
    },
    "demucs_ft": {
        "engine": "demucs",
        "model_file": "htdemucs_ft",
        "label": "Demucs Fine-Tuned",
        "description": "En yüksek kalite, 4 stem ayrımı (vokal, davul, bas, diğer). GPU önerilir.",
        "stems": ["vocals", "drums", "bass", "other"],
        "speed": "slow",
    },
}


class VocalIsolator:
    """
    Separates vocals from music using audio-separator (MDX23C/BS-Roformer) or Demucs.

    Features:
    - Multi-model support with model selection
    - Full quality audio output for listening (vocals + instrumental/stems)
    - Whisper-ready mono 16kHz output for transcription
    - Result caching
    - GPU/CPU auto-detection
    - Progress callback for SSE streaming
    """

    def __init__(self):
        from config import (
            VOCAL_ENGINE, VOCAL_MDX_MODEL, VOCAL_MDX_SEGMENT_SIZE,
            VOCAL_MDX_BATCH_SIZE, DEMUCS_MODEL, DEMUCS_DEVICE,
            VOCAL_CACHE_DIR, VOCAL_CACHE_ENABLED,
        )
        self.engine = VOCAL_ENGINE
        self.mdx_model_name = VOCAL_MDX_MODEL
        self.mdx_segment_size = VOCAL_MDX_SEGMENT_SIZE
        self.mdx_batch_size = VOCAL_MDX_BATCH_SIZE
        self.demucs_model_name = DEMUCS_MODEL
        self.demucs_device = DEMUCS_DEVICE
        self.cache_dir = Path(VOCAL_CACHE_DIR)
        self.cache_enabled = VOCAL_CACHE_ENABLED
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Model cache — keep loaded models in memory to avoid reloading
        self._separator = None           # audio-separator Separator instance
        self._separator_model = None     # currently loaded model filename
        self._demucs_model = None        # cached Demucs PyTorch model
        self._demucs_model_name_loaded = None  # which Demucs model is loaded
        self._demucs_device_loaded = None      # which device it's on

    # ------------------------------------------------------------------
    # Availability checks
    # ------------------------------------------------------------------

    def _mdx_available(self) -> bool:
        try:
            from audio_separator.separator import Separator
            return True
        except ImportError:
            return False

    def _demucs_available(self) -> bool:
        try:
            import demucs.pretrained
            return True
        except ImportError:
            return False

    def is_available(self) -> bool:
        return self._mdx_available() or self._demucs_available()

    def get_status(self) -> dict:
        status = {
            "available": self.is_available(),
            "engine": self.engine,
            "mdx_model": self.mdx_model_name,
            "mdx_available": self._mdx_available(),
            "demucs_model": self.demucs_model_name,
            "demucs_available": self._demucs_available(),
            "model_loaded": self._separator_model is not None or self._demucs_model is not None,
            "cache_enabled": self.cache_enabled,
            "available_models": self._get_available_models_info(),
        }
        try:
            import torch
            status["cuda_available"] = torch.cuda.is_available()
            if torch.cuda.is_available():
                status["gpu_name"] = torch.cuda.get_device_name(0)
        except ImportError:
            status["cuda_available"] = False
        return status

    def _get_available_models_info(self) -> list:
        """Return list of available models based on installed packages."""
        models = []
        for model_id, info in AVAILABLE_MODELS.items():
            available = (
                self._mdx_available() if info["engine"] == "mdx"
                else self._demucs_available()
            )
            models.append({
                "id": model_id,
                "label": info["label"],
                "description": info["description"],
                "stems": info["stems"],
                "speed": info["speed"],
                "available": available,
            })
        return models

    # ------------------------------------------------------------------
    # Cache
    # ------------------------------------------------------------------

    def _get_cache_key(self, audio_path: str, model_id: str = None) -> str:
        fp = Path(audio_path)
        mtime = str(fp.stat().st_mtime)
        fsize = str(fp.stat().st_size)
        mid = model_id or (self.mdx_model_name if self.engine == "mdx" else self.demucs_model_name)
        raw = f"{audio_path}:{mtime}:{fsize}:{mid}"
        return hashlib.md5(raw.encode()).hexdigest()

    def _get_cached(self, audio_path: str, model_id: str = None) -> Optional[str]:
        if not self.cache_enabled:
            return None
        key = self._get_cache_key(audio_path, model_id)
        cached = self.cache_dir / f"{key}_vocals.wav"
        if cached.exists():
            logger.info(f"Cache hit: {cached}")
            return str(cached)
        return None

    def _get_cached_full(self, audio_path: str, model_id: str = None) -> Optional[Dict]:
        """Check if full-quality cached outputs exist."""
        if not self.cache_enabled:
            return None
        key = self._get_cache_key(audio_path, model_id)
        vocals_hq = self.cache_dir / f"{key}_vocals_hq.wav"
        instrumental_hq = self.cache_dir / f"{key}_instrumental_hq.wav"
        if vocals_hq.exists() and instrumental_hq.exists():
            result = {
                "vocals": str(vocals_hq),
                "instrumental": str(instrumental_hq),
            }
            # Check for Demucs 4-stem outputs
            for stem in ["drums", "bass", "other"]:
                stem_path = self.cache_dir / f"{key}_{stem}_hq.wav"
                if stem_path.exists():
                    result[stem] = str(stem_path)
            logger.info(f"Full cache hit: {list(result.keys())}")
            return result
        return None

    # ------------------------------------------------------------------
    # audio-separator engine (MDX23C, BS-Roformer)
    # ------------------------------------------------------------------

    def _get_separator(self, model_name: str):
        """Get or create a cached Separator instance with the requested model loaded.

        Reuses the same Separator+model if the model hasn't changed,
        avoiding expensive model reload on every separation call.
        GPU (CUDA) is auto-detected by audio-separator internally.
        """
        from audio_separator.separator import Separator

        if self._separator is not None and self._separator_model == model_name:
            logger.info(f"Reusing cached model: {model_name}")
            return self._separator

        # Log GPU status for debugging
        gpu_info = "CPU"
        try:
            import torch
            if torch.cuda.is_available():
                gpu_info = f"CUDA ({torch.cuda.get_device_name(0)})"
        except ImportError:
            pass

        logger.info(f"Loading model: {model_name} ({gpu_info})")

        # Use a proper model cache directory (not /tmp/ which is problematic on Windows)
        model_cache_dir = str(self.cache_dir / "models")
        os.makedirs(model_cache_dir, exist_ok=True)

        sep = Separator(
            output_dir=str(self.cache_dir),
            output_format="wav",
            model_file_dir=model_cache_dir,
            use_autocast=True,  # Mixed-precision for faster GPU inference
        )

        logger.info(f"Downloading/loading model: {model_name} (model_dir={model_cache_dir})")
        sep.load_model(model_filename=model_name)
        logger.info(f"Model loaded successfully: {model_name}")

        self._separator = sep
        self._separator_model = model_name
        return sep

    def _separate_mdx(self, audio_path: str, model_name: str = None,
                      progress_callback=None, keep_full_quality=False) -> dict:
        """
        Separate vocals using audio-separator (MDX23C, BS-Roformer, etc.).
        Returns dict with 'whisper_path' and optionally 'stems' for full quality outputs.
        """
        model_name = model_name or self.mdx_model_name

        if progress_callback:
            if self._separator_model == model_name:
                progress_callback(5, f"Model hazır ({model_name})")
            else:
                progress_callback(5, f"Model yükleniyor ({model_name})...")

        start = time.time()

        key = self._get_cache_key(audio_path, f"mdx_{model_name}")

        load_start = time.time()
        try:
            sep = self._get_separator(model_name)
        except SystemExit as e:
            # audio-separator calls sys.exit(1) on some model load failures
            raise RuntimeError(f"Model yüklenemedi: {model_name} (audio-separator sys.exit: {e})")
        except Exception as e:
            raise RuntimeError(f"Model yüklenemedi: {model_name}: {e}")
        logger.info(f"Model ready in {time.time() - load_start:.1f}s: {model_name}")

        if progress_callback:
            progress_callback(20, "Vokal ayrıştırma başlıyor...")

        logger.info(f"Starting separation: {audio_path}")
        try:
            output_files = sep.separate(audio_path)
        except SystemExit as e:
            raise RuntimeError(f"Ayrıştırma başarısız (sys.exit): {e}")
        logger.info(f"Separation complete, output files: {output_files}")

        if progress_callback:
            progress_callback(80, "Vokaller işleniyor...")

        # Resolve output files to full paths (audio-separator may return just filenames)
        resolved_files = []
        cache_dir_str = str(self.cache_dir)
        for f in output_files:
            fp = Path(f)
            if not fp.is_absolute():
                fp = Path(cache_dir_str) / fp
            resolved_files.append(str(fp))

        # Identify vocals and instrumental files
        vocals_path = None
        instrumental_path = None
        for f in resolved_files:
            f_lower = Path(f).name.lower()
            if 'vocal' in f_lower or 'voice' in f_lower:
                vocals_path = f
            elif 'instrument' in f_lower or 'no_vocal' in f_lower or 'accomp' in f_lower:
                instrumental_path = f

        # Fallback: first = vocals (primary output)
        if not vocals_path and resolved_files:
            vocals_path = resolved_files[0]
        if not instrumental_path and len(resolved_files) > 1:
            instrumental_path = resolved_files[1]

        if not vocals_path or not Path(vocals_path).exists():
            raise RuntimeError(f"MDX separation produced no vocals output: {resolved_files}")

        result = {}

        # Save full quality copies before converting
        if keep_full_quality:
            vocals_hq = str(self.cache_dir / f"{key}_vocals_hq.wav")
            shutil.copy2(vocals_path, vocals_hq)
            result["stems"] = {"vocals": vocals_hq}

            if instrumental_path and Path(instrumental_path).exists():
                instrumental_hq = str(self.cache_dir / f"{key}_instrumental_hq.wav")
                shutil.copy2(instrumental_path, instrumental_hq)
                result["stems"]["instrumental"] = instrumental_hq

        # Convert vocals to mono 16kHz WAV for Whisper
        final_path = str(self.cache_dir / f"{key}_vocals.wav")
        self._convert_to_whisper_format(vocals_path, final_path)
        result["whisper_path"] = final_path

        # Clean up separator raw output files
        for f in resolved_files:
            try:
                if Path(f).exists() and f != final_path:
                    # Don't delete if it's one of our HQ copies
                    hq_paths = [v for v in result.get("stems", {}).values()]
                    if f not in hq_paths:
                        os.remove(f)
            except Exception:
                pass

        elapsed = time.time() - start
        try:
            import soundfile as sf
            info = sf.info(audio_path)
            duration = info.duration
            speed = duration / elapsed if elapsed > 0 else 0
            logger.info(f"Vocal isolation ({model_name}): {elapsed:.1f}s ({speed:.1f}x realtime)")
        except Exception:
            logger.info(f"Vocal isolation ({model_name}): {elapsed:.1f}s")

        if progress_callback:
            progress_callback(100, f"Vokal izolasyonu tamamlandı ({elapsed:.0f}s)")

        result["duration"] = elapsed
        return result

    # ------------------------------------------------------------------
    # Demucs engine (high quality, PyTorch, 4 stems)
    # ------------------------------------------------------------------

    def _separate_demucs(self, audio_path: str, model_name: str = None,
                         progress_callback=None, keep_full_quality=False) -> dict:
        """
        Separate vocals using Demucs (PyTorch).
        Returns dict with 'whisper_path' and optionally 'stems' for full quality outputs.
        Demucs produces 4 stems: vocals, drums, bass, other.
        """
        import torch
        from demucs.pretrained import get_model
        from demucs.apply import apply_model
        from demucs.audio import AudioFile
        from config import DEMUCS_SHIFTS, DEMUCS_OVERLAP, DEMUCS_FLOAT16

        model_name = model_name or self.demucs_model_name

        start = time.time()

        # Resolve device — prefer CUDA (NVIDIA GPU), fallback to CPU
        if self.demucs_device == "auto":
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            device = torch.device(self.demucs_device)

        # Reuse cached model if same model+device, otherwise load fresh
        if (self._demucs_model is not None
                and self._demucs_model_name_loaded == model_name
                and self._demucs_device_loaded == str(device)):
            model = self._demucs_model
            if progress_callback:
                progress_callback(5, f"Demucs model hazır ({model_name}, {device})")
            logger.info(f"Reusing cached Demucs model: {model_name} on {device}")
        else:
            if progress_callback:
                progress_callback(5, f"Demucs model yükleniyor ({model_name}, {device})...")
            model = get_model(model_name)
            model.to(device)
            model.eval()
            if DEMUCS_FLOAT16 and device.type == "cuda":
                model.half()
            # Cache for next call
            self._demucs_model = model
            self._demucs_model_name_loaded = model_name
            self._demucs_device_loaded = str(device)
            logger.info(f"Demucs model loaded: {model_name} on {device}")

        if progress_callback:
            progress_callback(15, "Ses dosyası okunuyor...")

        sr = model.samplerate
        af = AudioFile(audio_path)
        wav = af.read(seek_time=0, streams=0, samplerate=sr, channels=model.audio_channels)
        audio_duration = wav.shape[-1] / sr

        # Normalize
        ref = wav.mean(0)
        wav = (wav - ref.mean()) / ref.std()
        wav = wav.unsqueeze(0).to(device)
        if DEMUCS_FLOAT16 and device.type == "cuda":
            wav = wav.half()

        if progress_callback:
            progress_callback(25, f"Demucs çalışıyor ({audio_duration:.0f}s ses)...")

        # Run apply_model in a sub-thread so we can send progress updates
        import threading
        apply_result = [None]
        apply_error = [None]
        apply_done = threading.Event()

        def _run_apply():
            try:
                kwargs = dict(device=device, progress=False, num_workers=0,
                              shifts=DEMUCS_SHIFTS, split=True, overlap=DEMUCS_OVERLAP)
                with torch.no_grad():
                    if device.type == "cuda":
                        with torch.amp.autocast("cuda"):
                            apply_result[0] = apply_model(model, wav, **kwargs)
                    else:
                        apply_result[0] = apply_model(model, wav, **kwargs)
            except Exception as e:
                apply_error[0] = e
            finally:
                apply_done.set()

        apply_thread = threading.Thread(target=_run_apply, daemon=True)
        apply_thread.start()

        # Send intermediate progress while apply_model runs (25% → 75%)
        fake_pct = 25
        while not apply_done.wait(timeout=3.0):
            if fake_pct < 75:
                fake_pct = min(75, fake_pct + 2)
                elapsed_so_far = time.time() - start
                if progress_callback:
                    progress_callback(fake_pct, f"Demucs işliyor... ({elapsed_so_far:.0f}s)")

        if apply_error[0] is not None:
            raise apply_error[0]

        sources = apply_result[0]

        if DEMUCS_FLOAT16 and device.type == "cuda":
            sources = sources.float()

        # Extract all stems
        stem_names = model.sources  # typically ['drums', 'bass', 'other', 'vocals']
        stems_np = {}
        for idx, name in enumerate(stem_names):
            stem_audio = sources[0, idx]
            stem_audio = stem_audio * ref.std() + ref.mean()
            stem_np = stem_audio.cpu().float().numpy()
            if stem_np.ndim == 2 and stem_np.shape[0] > 1:
                stems_np[name] = stem_np  # Keep stereo for HQ
            elif stem_np.ndim == 2:
                stems_np[name] = stem_np[0]
            else:
                stems_np[name] = stem_np

        del sources, wav
        if device.type == "cuda":
            torch.cuda.empty_cache()

        if progress_callback:
            progress_callback(80, "Stem'ler kaydediliyor...")

        key = self._get_cache_key(audio_path, f"demucs_{model_name}")
        result = {}

        # Save vocals as Whisper format (mono 16kHz)
        vocals_np = stems_np.get("vocals")
        if vocals_np is not None:
            # Mono for Whisper
            vocals_mono = np.mean(vocals_np, axis=0) if vocals_np.ndim == 2 else vocals_np
            final_path = str(self.cache_dir / f"{key}_vocals.wav")
            self._save_numpy_wav(vocals_mono, sr, final_path)
            result["whisper_path"] = final_path

        # Save full quality stems
        if keep_full_quality:
            import soundfile as sf
            result["stems"] = {}

            for stem_name, stem_data in stems_np.items():
                hq_path = str(self.cache_dir / f"{key}_{stem_name}_hq.wav")
                # Save at original sample rate, stereo if available
                sf.write(hq_path, stem_data.T if stem_data.ndim == 2 else stem_data,
                         sr, subtype="PCM_16")
                result["stems"][stem_name] = hq_path
                logger.info(f"Stem saved: {stem_name} → {hq_path}")

            # Also create combined instrumental (drums + bass + other)
            non_vocal_stems = [stems_np[s] for s in ["drums", "bass", "other"] if s in stems_np]
            if non_vocal_stems:
                instrumental = sum(non_vocal_stems)
                instr_path = str(self.cache_dir / f"{key}_instrumental_hq.wav")
                sf.write(instr_path, instrumental.T if instrumental.ndim == 2 else instrumental,
                         sr, subtype="PCM_16")
                result["stems"]["instrumental"] = instr_path

        elapsed = time.time() - start
        speed = audio_duration / elapsed if elapsed > 0 else 0
        logger.info(f"Demucs vocal isolation: {elapsed:.1f}s ({speed:.1f}x realtime)")

        if progress_callback:
            progress_callback(100, f"Vokal izolasyonu tamamlandı ({elapsed:.0f}s)")

        result["duration"] = elapsed
        return result

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def separate_vocals(
        self,
        audio_path: str,
        output_dir: Optional[str] = None,
        progress_callback: Optional[Callable] = None,
        model_id: str = None,
    ) -> str:
        """
        Separate vocals from audio for Whisper transcription.
        Returns path to mono 16kHz WAV file ready for Whisper.
        """
        effective_model = model_id or ("mdx23c" if self.engine == "mdx" else "demucs_ft")

        # Check cache
        cached = self._get_cached(audio_path, effective_model)
        if cached:
            if progress_callback:
                progress_callback(100, "Önbellekten yüklendi")
            return cached

        if not self.is_available():
            logger.warning("No vocal separation engine available, returning original")
            return audio_path

        model_info = AVAILABLE_MODELS.get(effective_model)
        if not model_info:
            logger.warning(f"Unknown model_id '{effective_model}', using default")
            model_info = AVAILABLE_MODELS["mdx23c"]

        engine = model_info["engine"]
        model_file = model_info["model_file"]

        # Try primary engine
        try:
            if engine == "mdx" and self._mdx_available():
                logger.info(f"Using MDX-Net engine: {model_file}")
                result = self._separate_mdx(audio_path, model_file, progress_callback, keep_full_quality=False)
                return result["whisper_path"]
            elif engine == "demucs" and self._demucs_available():
                logger.info(f"Using Demucs engine: {model_file}")
                result = self._separate_demucs(audio_path, model_file, progress_callback, keep_full_quality=False)
                return result["whisper_path"]
        except Exception as e:
            logger.error(f"Primary engine ({engine}) failed: {e}")
            import traceback
            traceback.print_exc()

        # Fallback to other engine
        try:
            if engine == "mdx" and self._demucs_available():
                logger.info("Falling back to Demucs...")
                if progress_callback:
                    progress_callback(10, "MDX başarısız, Demucs ile deneniyor...")
                result = self._separate_demucs(audio_path, None, progress_callback, keep_full_quality=False)
                return result["whisper_path"]
            elif engine == "demucs" and self._mdx_available():
                logger.info("Falling back to MDX-Net...")
                if progress_callback:
                    progress_callback(10, "Demucs başarısız, MDX-Net ile deneniyor...")
                result = self._separate_mdx(audio_path, None, progress_callback, keep_full_quality=False)
                return result["whisper_path"]
        except Exception as e2:
            logger.error(f"Fallback engine also failed: {e2}")

        logger.warning("All separation engines failed, returning original audio")
        return audio_path

    def separate_full(
        self,
        audio_path: str,
        model_id: str = "mdx23c",
        progress_callback: Optional[Callable] = None,
        selected_stems: Optional[List[str]] = None,
    ) -> Dict:
        """
        Full separation with all stems in original quality for listening.

        Args:
            selected_stems: Optional list of stem names to include in output.
                           If None, all stems are included.

        Returns dict:
        {
            "whisper_path": "path/to/mono_16khz.wav",
            "stems": {
                "vocals": "path/to/vocals_hq.wav",
                "instrumental": "path/to/instrumental_hq.wav",
                "drums": "...",  # Demucs only
                "bass": "...",   # Demucs only
                "other": "...",  # Demucs only
            },
            "duration": 12.3,
            "model_id": "mdx23c",
        }
        """
        # Check full cache
        cached = self._get_cached_full(audio_path, model_id)
        whisper_cached = self._get_cached(audio_path, model_id)
        if cached and whisper_cached:
            if progress_callback:
                progress_callback(100, "Önbellekten yüklendi")
            stems = cached
            if selected_stems:
                stems = {k: v for k, v in stems.items() if k in selected_stems}
            return {
                "whisper_path": whisper_cached,
                "stems": stems,
                "duration": 0,
                "model_id": model_id,
                "cached": True,
            }

        model_info = AVAILABLE_MODELS.get(model_id)
        if not model_info:
            raise ValueError(f"Unknown model_id: {model_id}. Available: {list(AVAILABLE_MODELS.keys())}")

        engine = model_info["engine"]
        model_file = model_info["model_file"]

        if engine == "mdx" and self._mdx_available():
            result = self._separate_mdx(audio_path, model_file, progress_callback, keep_full_quality=True)
        elif engine == "demucs" and self._demucs_available():
            result = self._separate_demucs(audio_path, model_file, progress_callback, keep_full_quality=True)
        else:
            raise RuntimeError(f"Engine '{engine}' not available for model '{model_id}'")

        # Filter stems based on selection
        if selected_stems and "stems" in result:
            result["stems"] = {k: v for k, v in result["stems"].items() if k in selected_stems}

        result["model_id"] = model_id
        return result

    # ------------------------------------------------------------------
    # Audio utilities
    # ------------------------------------------------------------------

    def _convert_to_whisper_format(self, input_path: str, output_path: str):
        """Convert any audio to mono 16kHz WAV using ffmpeg (fastest method)."""
        import subprocess

        try:
            subprocess.run([
                "ffmpeg", "-y", "-i", input_path,
                "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le",
                "-loglevel", "error",
                output_path
            ], capture_output=True, check=True, timeout=120)
            logger.info(f"Converted to Whisper format: {output_path}")
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            logger.warning(f"ffmpeg conversion failed, trying soundfile: {e}")
            try:
                import soundfile as sf
                data, sr = sf.read(input_path)
                if data.ndim > 1:
                    data = np.mean(data, axis=1)
                if sr != 16000:
                    try:
                        from scipy.signal import resample_poly
                        from math import gcd
                        g = gcd(16000, sr)
                        data = resample_poly(data.astype(np.float32),
                                             up=16000 // g, down=sr // g)
                    except ImportError:
                        import librosa
                        data = librosa.resample(data.astype(np.float32),
                                                orig_sr=sr, target_sr=16000)
                max_val = np.abs(data).max()
                if max_val > 0:
                    data = data / max_val * 0.95
                sf.write(output_path, data.astype(np.float32), 16000, subtype="PCM_16")
            except Exception as e2:
                logger.error(f"All conversion methods failed: {e2}")
                shutil.copy2(input_path, output_path)

    def _save_numpy_wav(self, audio_np: np.ndarray, source_sr: int, output_path: str):
        """Save numpy audio array as mono 16kHz WAV."""
        import soundfile as sf

        target_sr = 16000
        if source_sr != target_sr:
            try:
                from scipy.signal import resample_poly
                from math import gcd
                g = gcd(target_sr, source_sr)
                audio_np = resample_poly(audio_np.astype(np.float32),
                                         up=target_sr // g, down=source_sr // g)
            except ImportError:
                import librosa
                audio_np = librosa.resample(audio_np.astype(np.float32),
                                            orig_sr=source_sr, target_sr=target_sr)

        audio_np = audio_np.astype(np.float32)
        max_val = np.abs(audio_np).max()
        if max_val > 0:
            audio_np = audio_np / max_val * 0.95

        sf.write(output_path, audio_np, target_sr, subtype="PCM_16")
        logger.info(f"Vocals saved: {output_path} ({len(audio_np) / target_sr:.1f}s)")

    def clear_cache(self):
        if self.cache_dir.exists():
            shutil.rmtree(self.cache_dir)
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            logger.info("Vocal cache cleared")
