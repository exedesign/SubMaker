"""
Vocal Isolation Service â€” dual specialized BS-Roformer models

Engine:
  audio-separator (BS-Roformer â€” via PyTorch) â€” high quality 2-stem

Models:
  HyperACE v2 (Vocal):        Best vocal extraction, minimal instrumental leakage
  Resurrection UNWA (Inst):    Best instrumental extraction, minimal vocal leakage

Outputs:
  - Whisper format: mono 16kHz WAV for transcription
  - Full quality: original sample rate WAV for listening (vocals + instrumental)
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


def _preload_torch_cudnn():
    """Preload cuDNN DLLs from PyTorch's lib directory to prevent version conflicts.

    Other pip packages (e.g. nvidia-cudnn-cu12) may ship incompatible cuDNN DLLs.
    Loading PyTorch's bundled DLLs first ensures the correct version is used and
    avoids 'Could not load symbol cudnnGetLibConfig' errors.
    """
    try:
        import torch
        if not torch.cuda.is_available():
            return

        # On Windows, ensure PyTorch's cuDNN DLLs are in the DLL search path
        # before any other package can load conflicting versions
        if os.name == "nt":
            torch_lib = os.path.join(os.path.dirname(torch.__file__), "lib")
            if os.path.isdir(torch_lib):
                os.add_dll_directory(torch_lib)
                logger.debug(f"Added PyTorch DLL directory: {torch_lib}")

        # Check for conflicting nvidia-cudnn-cu12 package
        nvidia_cudnn_dir = os.path.normpath(os.path.join(
            os.path.dirname(torch.__file__), "..", "nvidia", "cudnn", "bin"
        ))
        if os.path.isdir(nvidia_cudnn_dir):
            logger.warning(
                f"Conflicting nvidia-cudnn-cu12 package detected at {nvidia_cudnn_dir}. "
                f"This can cause 'cudnnGetLibConfig' errors. "
                f"Run: pip uninstall nvidia-cudnn-cu12"
            )
    except Exception as e:
        logger.debug(f"cuDNN preload skipped: {e}")


def _verify_gpu_setup():
    """Verify GPU/CUDA/cuDNN setup and log diagnostics. Called once at startup."""
    info = {"gpu": False, "cudnn": False, "device": "cpu"}
    try:
        import torch
        if torch.cuda.is_available():
            info["gpu"] = True
            info["device"] = "cuda"
            info["gpu_name"] = torch.cuda.get_device_name(0)
            info["cuda_version"] = torch.version.cuda
            info["cudnn_version"] = torch.backends.cudnn.version()
            info["cudnn"] = torch.backends.cudnn.enabled
            logger.info(
                f"GPU OK: {info['gpu_name']}, CUDA {info['cuda_version']}, "
                f"cuDNN {info['cudnn_version']} (enabled={info['cudnn']})"
            )
        else:
            logger.warning("CUDA not available â€” vocal separation will use CPU (slower)")
    except Exception as e:
        logger.warning(f"GPU check failed: {e}")
    try:
        import onnxruntime
        providers = onnxruntime.get_available_providers()
        info["onnx_providers"] = providers
        has_cuda = "CUDAExecutionProvider" in providers
        logger.info(f"ONNX Runtime {onnxruntime.__version__}: providers={providers}")
        if not has_cuda and info["gpu"]:
            logger.warning(
                "ONNX Runtime has no CUDAExecutionProvider. "
                "Install onnxruntime-gpu: pip install onnxruntime-gpu"
            )
    except ImportError:
        pass
    return info


_preload_torch_cudnn()
_gpu_info = _verify_gpu_setup()


def get_vocal_isolator():
    """Get or create singleton VocalIsolator instance"""
    global _vocal_isolator_instance
    if _vocal_isolator_instance is None:
        _vocal_isolator_instance = VocalIsolator()
    return _vocal_isolator_instance


# Available models configuration
AVAILABLE_MODELS = {
    "vocal_ep317": {
        "engine": "mdx",
        "model_file": "model_bs_roformer_ep_317_sdr_12.9755.ckpt",
        "label": "BS-Roformer EP317 (Vocals)",
        "description": "High quality vocal separation â€” SDR 12.97, BS-Roformer. Compatible with 8GB VRAM.",
        "stems": ["vocals", "instrumental"],
        "speed": "medium",
    },
    "instrumental_resurrection": {
        "engine": "mdx",
        "model_file": "bs_roformer_instrumental_resurrection_unwa.ckpt",
        "label": "Resurrection UNWA (Music)",
        "description": "Cleanest instrumental output â€” minimal vocal leakage. BS-Roformer dim=256, compatible with 8GB VRAM.",
        "stems": ["vocals", "instrumental"],
        "speed": "medium",
    },
}


class VocalIsolator:
    """
    Separates vocals from music using audio-separator (BS-Roformer models).

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
            VOCAL_CACHE_DIR, VOCAL_CACHE_ENABLED, resolve_model_dir,
        )
        self.engine = VOCAL_ENGINE
        self.mdx_model_name = VOCAL_MDX_MODEL
        self.mdx_segment_size = VOCAL_MDX_SEGMENT_SIZE
        self.mdx_batch_size = VOCAL_MDX_BATCH_SIZE
        self.demucs_model_name = DEMUCS_MODEL
        self.demucs_device = DEMUCS_DEVICE
        self.cache_dir = Path(VOCAL_CACHE_DIR)
        self.cache_enabled = VOCAL_CACHE_ENABLED
        self.models_dir = resolve_model_dir("audio-separator").parent
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Model cache â€” keep loaded models in memory to avoid reloading
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
                status["cuda_version"] = torch.version.cuda
                status["cudnn_version"] = torch.backends.cudnn.version()
                status["cudnn_enabled"] = torch.backends.cudnn.enabled
                mem = torch.cuda.get_device_properties(0).total_memory
                status["gpu_memory_gb"] = round(mem / 1024**3, 1)
        except ImportError:
            status["cuda_available"] = False
        try:
            import onnxruntime
            status["onnx_providers"] = onnxruntime.get_available_providers()
        except ImportError:
            pass
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
    # audio-separator engine (BS-Roformer)
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

        # Explicitly free old separator before loading a new model
        if self._separator is not None:
            logger.info(f"Releasing old model: {self._separator_model}")
            old_sep = self._separator
            self._separator = None
            self._separator_model = None
            del old_sep
            import gc
            gc.collect()
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass

        # Check CUDA availability and configure environment for GPU compatibility
        use_cuda = False
        gpu_info = "CPU"
        try:
            import torch
            if torch.cuda.is_available():
                use_cuda = True
                gpu_info = f"CUDA ({torch.cuda.get_device_name(0)})"
                # LAZY loading avoids 'Could not load symbol cudnnGetLibConfig' errors
                # caused by cuDNN version mismatches with ONNX Runtime
                if "CUDA_MODULE_LOADING" not in os.environ:
                    os.environ["CUDA_MODULE_LOADING"] = "LAZY"
        except ImportError:
            pass

        logger.info(f"Loading model: {model_name} ({gpu_info})")

        # Model files are stored in resources/models/audio-separator/
        model_cache_dir = str(self.models_dir / "audio-separator")
        os.makedirs(model_cache_dir, exist_ok=True)

        sep = Separator(
            output_dir=str(self.cache_dir),
            output_format="wav",
            model_file_dir=model_cache_dir,
            use_autocast=use_cuda,  # Mixed-precision only when CUDA is available
            mdxc_params={
                "segment_size": self.mdx_segment_size,
                "batch_size": self.mdx_batch_size,
                "overlap": 8,
                "pitch_shift": 0,
            },
            mdx_params={
                "hop_length": 1024,
                "segment_size": self.mdx_segment_size,
                "overlap": 0.25,
                "batch_size": self.mdx_batch_size,
                "enable_denoise": False,
            },
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
        Separate vocals using audio-separator (BS-Roformer).
        Returns dict with 'whisper_path' and optionally 'stems' for full quality outputs.
        """
        model_name = model_name or self.mdx_model_name

        if progress_callback:
            if self._separator_model == model_name:
                progress_callback(5, f"Model ready ({model_name})")
            else:
                progress_callback(5, f"Loading model ({model_name})...")

        start = time.time()

        key = self._get_cache_key(audio_path, f"mdx_{model_name}")

        load_start = time.time()
        try:
            sep = self._get_separator(model_name)
        except SystemExit as e:
            # audio-separator calls sys.exit(1) on some model load failures
            raise RuntimeError(f"Failed to load model: {model_name} (audio-separator sys.exit: {e})")
        except Exception as e:
            raise RuntimeError(f"Failed to load model: {model_name}: {e}")
        logger.info(f"Model ready in {time.time() - load_start:.1f}s: {model_name}")

        if progress_callback:
            progress_callback(20, "Starting vocal separation...")

        logger.info(f"Starting separation: {audio_path}")

        # Pre-convert input to 44100Hz stereo WAV with padding.
        # BS-Roformer models expect 44100Hz stereo PCM; feeding MP3/other
        # formats directly causes tensor size mismatches in STFT.
        # Short audio (< 20s) is padded with silence â€” UNWA's chunk_size
        # is ~17s at 44100Hz, and audio shorter than one chunk causes
        # "size of tensor a (0) must match size of tensor b (N)" errors.
        # The unique preconv filename ensures output filenames from
        # audio-separator are also unique (no collisions between runs).
        import uuid as _uuid
        run_id = _uuid.uuid4().hex[:8]
        actual_input = audio_path
        temp_wav = str(self.cache_dir / f"_preconv_{run_id}.wav")
        min_duration_sec = 20  # pad short audio to this minimum
        try:
            import subprocess
            # Get duration
            dur_probe = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "csv=p=0", audio_path],
                capture_output=True, text=True, timeout=10
            )
            src_duration = float(dur_probe.stdout.strip()) if dur_probe.stdout.strip() else 0

            if src_duration > 0 and src_duration < min_duration_sec:
                # Pad with silence to minimum duration
                pad_secs = min_duration_sec - src_duration
                # Suppress FFmpeg metadata warnings (e.g., "Incorrect BOM value" from broken MP3 ID3 tags)
                subprocess.run(
                    ["ffmpeg", "-y", "-hide_banner", "-loglevel", "quiet",
                     "-i", audio_path,
                     "-af", f"apad=pad_dur={pad_secs}",
                     "-ar", "44100", "-ac", "2", "-acodec", "pcm_s16le",
                     "-vn", temp_wav],
                    check=True, timeout=120,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
                logger.info(f"Pre-converted to 44100Hz stereo WAV with {pad_secs:.1f}s padding (src={src_duration:.1f}s)")
            else:
                # Suppress FFmpeg metadata warnings (e.g., "Incorrect BOM value" from broken MP3 ID3 tags)
                subprocess.run(
                    ["ffmpeg", "-y", "-hide_banner", "-loglevel", "quiet",
                     "-i", audio_path,
                     "-ar", "44100", "-ac", "2", "-acodec", "pcm_s16le",
                     "-vn", temp_wav],
                    check=True, timeout=120,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
                logger.info(f"Pre-converted to 44100Hz stereo WAV: {temp_wav}")
            actual_input = temp_wav
        except Exception as conv_err:
            logger.warning(f"Pre-conversion failed, using original: {conv_err}")
            temp_wav = None

        # Intercept audio-separator's internal tqdm to forward segment progress.
        # tqdm is patched at class level for the duration of sep.separate() only.
        import tqdm as _tqdm_mod
        _orig_tqdm_update = _tqdm_mod.tqdm.update
        _tqdm_state = {"n": 0, "total": None}

        def _tqdm_progress_hook(self, n=1):
            _orig_tqdm_update(self, n)
            if self.total and self.total > 0:
                _tqdm_state["total"] = self.total
                _tqdm_state["n"] = self.n
                frac = min(1.0, self.n / self.total)
                scaled = 22 + int(frac * 56)  # 22-78%, leaving room for 20 start / 80 post
                if progress_callback:
                    progress_callback(scaled, f"Separating... {self.n}/{self.total}")

        _tqdm_mod.tqdm.update = _tqdm_progress_hook

        # Snapshot existing files in cache_dir before separation so we can detect new ones
        pre_existing = set(str(f) for f in self.cache_dir.iterdir() if f.is_file())

        try:
            output_files = sep.separate(actual_input)
        except SystemExit as e:
            self._separator = None
            self._separator_model = None
            raise RuntimeError(f"Separation failed (sys.exit): {e}")
        except RuntimeError as e:
            err_msg = str(e).lower()
            if "cudnn" in err_msg or "cudnngetlibconfig" in err_msg:
                logger.warning(
                    f"cuDNN error detected, retrying with cuDNN disabled: {e}"
                )
                import torch
                torch.backends.cudnn.enabled = False
                try:
                    self._separator = None
                    self._separator_model = None
                    sep = self._get_separator(model_name)
                    output_files = sep.separate(actual_input)
                    logger.info("Separation succeeded with cuDNN disabled")
                except Exception as retry_err:
                    torch.backends.cudnn.enabled = True
                    raise RuntimeError(
                        f"Separation failed while cuDNN disabled: {retry_err}"
                    )
                finally:
                    torch.backends.cudnn.enabled = True
            else:
                raise
        except Exception as e:
            self._separator = None
            self._separator_model = None
            error_str = str(e).lower()
            if any(kw in error_str for kw in ("cuda", "cudnn", "gpu", "onnxruntime", "provider")):
                raise RuntimeError(
                    f"GPU separation failed (possible CUDA/cuDNN incompatibility): {e}"
                ) from e
            raise RuntimeError(f"Separation failed: {e}") from e
        finally:
            _tqdm_mod.tqdm.update = _orig_tqdm_update

        # Always invalidate the cached separator after each run.
        # audio-separator keeps internal state that can cause subsequent
        # separate() calls to return empty lists or stale results.
        # Also delete the local sep reference BEFORE post-cleanup so that
        # file handles are released on Windows (prevents PermissionError).
        self._separator = None
        self._separator_model = None
        del sep
        import gc
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                logger.info("GPU memory freed after separation")
        except Exception:
            pass

        logger.info(f"Separation complete, output files: {output_files}")

        # Fallback: if audio-separator returned empty list but wrote files to disk,
        # scan cache_dir for files matching the pre-converted input stem.
        if not output_files:
            logger.warning(f"sep.separate() returned empty list, scanning output directory for results...")
            input_stem = Path(actual_input).stem  # e.g. "_preconv_abc12345"
            found = sorted(self.cache_dir.glob(f"{input_stem}*.*"))
            # Exclude the pre-converted input itself
            found = [str(f) for f in found if str(f) != actual_input and f.suffix.lower() in (".wav", ".flac", ".mp3")]
            if found:
                logger.info(f"Found output files via stem match: {found}")
                output_files = found
            else:
                # Detect newly created files by comparing with pre-separation snapshot
                new_files = []
                for f in self.cache_dir.iterdir():
                    if f.is_file() and str(f) not in pre_existing and not f.name.startswith("_preconv_"):
                        if f.suffix.lower() in (".wav", ".flac", ".mp3"):
                            new_files.append(str(f))
                if new_files:
                    logger.info(f"Found new output files via snapshot diff: {new_files}")
                    output_files = sorted(new_files)

        if not output_files:
            raise RuntimeError(f"MDX separation produced no output files for: {audio_path}")

        if progress_callback:
            progress_callback(80, "Processing vocals...")

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
            elif 'instrument' in f_lower or 'no_vocal' in f_lower or 'accomp' in f_lower or 'other' in f_lower:
                instrumental_path = f

        # Fallback: first = vocals (primary output)
        if not vocals_path and resolved_files:
            vocals_path = resolved_files[0]
        if not instrumental_path and len(resolved_files) > 1:
            instrumental_path = resolved_files[1]

        if not vocals_path or not Path(vocals_path).exists():
            raise RuntimeError(f"MDX separation found no usable vocals file. Resolved: {resolved_files}")

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

        # Clean up pre-converted input and raw separator output files
        if temp_wav:
            try:
                Path(temp_wav).unlink(missing_ok=True)
            except Exception:
                pass
        for f in resolved_files:
            try:
                fp = Path(f)
                if fp.exists() and f != result.get("whisper_path"):
                    hq_paths = list(result.get("stems", {}).values())
                    if f not in hq_paths:
                        fp.unlink(missing_ok=True)
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
            progress_callback(100, f"Vocal isolation completed ({elapsed:.0f}s)")

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

        # Resolve device â€” prefer CUDA (NVIDIA GPU), fallback to CPU
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
                progress_callback(5, f"Demucs model ready ({model_name}, {device})")
            logger.info(f"Reusing cached Demucs model: {model_name} on {device}")
        else:
            if progress_callback:
                progress_callback(5, f"Loading Demucs model ({model_name}, {device})...")
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
            progress_callback(15, "Reading audio file...")

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
            progress_callback(25, f"Demucs processing ({audio_duration:.0f}s audio)...")

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

        # Send intermediate progress while apply_model runs (25% â†’ 75%)
        fake_pct = 25
        while not apply_done.wait(timeout=3.0):
            if fake_pct < 75:
                fake_pct = min(75, fake_pct + 2)
                elapsed_so_far = time.time() - start
                if progress_callback:
                    progress_callback(fake_pct, f"Demucs running... ({elapsed_so_far:.0f}s)")

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
            progress_callback(80, "Saving stems...")

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
                logger.info(f"Stem saved: {stem_name} â†’ {hq_path}")

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
            progress_callback(100, f"Vocal isolation completed ({elapsed:.0f}s)")

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
        effective_model = model_id or "vocal_ep317"

        # Check cache
        cached = self._get_cached(audio_path, effective_model)
        if cached:
            if progress_callback:
                progress_callback(100, "Loaded from cache")
            return cached

        if not self.is_available():
            logger.warning("No vocal separation engine available, returning original")
            return audio_path

        model_info = AVAILABLE_MODELS.get(effective_model)
        if not model_info:
            logger.warning(f"Unknown model_id '{effective_model}', using default")
            model_info = AVAILABLE_MODELS["vocal_ep317"]

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
                    progress_callback(10, "MDX failed, trying Demucs...")
                result = self._separate_demucs(audio_path, None, progress_callback, keep_full_quality=False)
                return result["whisper_path"]
            elif engine == "demucs" and self._mdx_available():
                logger.info("Falling back to MDX-Net...")
                if progress_callback:
                    progress_callback(10, "Demucs failed, trying MDX-Net...")
                result = self._separate_mdx(audio_path, None, progress_callback, keep_full_quality=False)
                return result["whisper_path"]
        except Exception as e2:
            logger.error(f"Fallback engine also failed: {e2}")

        logger.warning("All separation engines failed, returning original audio")
        return audio_path

    def separate_full(
        self,
        audio_path: str,
        model_id: str = "vocal_ep317",
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
            },
            "duration": 12.3,
            "model_id": "vocal_ep317",
        }
        """
        # Check full cache
        cached = self._get_cached_full(audio_path, model_id)
        whisper_cached = self._get_cached(audio_path, model_id)
        if cached and whisper_cached:
            if progress_callback:
                progress_callback(100, "Loaded from cache")
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

    def separate_dual_full(
        self,
        audio_path: str,
        selected_stems: Optional[List[str]] = None,
        progress_callback: Optional[Callable] = None,
    ) -> Dict:
        """
        Dual-model separation: each model runs only for its specialized output.

        EP317  (model_bs_roformer_ep_317_sdr_12.9755.ckpt)
               â†’ best vocal extraction + whisper_path (mono 16kHz)
        UNWA   (bs_roformer_instrumental_resurrection_unwa.ckpt)
               â†’ cleanest instrumental output for karaoke

        Args:
            selected_stems: list of stems to extract, e.g. ['vocals', 'instrumental'].
                            If None or empty, both models run.

        Returns dict compatible with separate_full():
        {
            "whisper_path": "path/to/mono_16khz.wav",   # None if vocals not requested
            "stems": {
                "vocals":       "path/to/vocals_hq.wav",        # if requested
                "instrumental": "path/to/instrumental_hq.wav",  # if requested
            },
            "duration": <total_elapsed_seconds>,
            "model_id": "dual",
            "cached": <bool>,
        }
        """
        if selected_stems is None or len(selected_stems) == 0:
            selected_stems = ["vocals", "instrumental"]

        need_vocals = "vocals" in selected_stems
        need_instrumental = "instrumental" in selected_stems

        EP317_MODEL = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
        UNWA_MODEL  = "bs_roformer_instrumental_resurrection_unwa.ckpt"

        # â”€â”€ cache check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        # Cache keys must match what _separate_mdx writes ("mdx_<model_filename>")
        ep317_cache_id = f"mdx_{EP317_MODEL}"
        unwa_cache_id  = f"mdx_{UNWA_MODEL}"

        vocals_cached_whisper = self._get_cached(audio_path, ep317_cache_id) if need_vocals else None
        vocals_cached_full    = self._get_cached_full(audio_path, ep317_cache_id) if need_vocals else None
        instr_cached_full     = self._get_cached_full(audio_path, unwa_cache_id) if need_instrumental else None

        vocals_hq_cached   = (vocals_cached_full or {}).get("vocals") if vocals_cached_full else None
        instr_hq_cached    = (instr_cached_full or {}).get("instrumental") if instr_cached_full else None

        all_cached = (
            (not need_vocals or (vocals_cached_whisper and vocals_hq_cached)) and
            (not need_instrumental or instr_hq_cached)
        )
        if all_cached:
            if progress_callback:
                progress_callback(100, "Loaded from cache")
            stems = {}
            if need_vocals and vocals_hq_cached:
                stems["vocals"] = vocals_hq_cached
            if need_instrumental and instr_hq_cached:
                stems["instrumental"] = instr_hq_cached
            return {
                "whisper_path": vocals_cached_whisper if need_vocals else None,
                "stems": stems,
                "duration": 0,
                "model_id": "dual",
                "cached": True,
            }

        # â”€â”€ determine progress slices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        # vocals_cached_whisper / vocals_hq_cached may be partially cached
        run_ep317 = need_vocals and not (vocals_cached_whisper and vocals_hq_cached)
        run_unwa  = need_instrumental and not instr_hq_cached

        both_run = run_ep317 and run_unwa
        start_total = time.time()
        result_stems: Dict = {}
        whisper_path = vocals_cached_whisper  # may already be cached

        # â”€â”€ EP317: vocals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if run_ep317:
            def ep317_progress(pct, msg=""):
                if progress_callback:
                    mapped = pct * 0.50 if both_run else pct
                    progress_callback(int(mapped), msg)

            logger.info("[dual] Running EP317 for vocals...")
            ep317_result = self._separate_mdx(
                audio_path, EP317_MODEL, ep317_progress, keep_full_quality=True
            )
            whisper_path = ep317_result.get("whisper_path")
            ep317_stems  = ep317_result.get("stems", {})
            if "vocals" in ep317_stems:
                result_stems["vocals"] = ep317_stems["vocals"]
        elif need_vocals and vocals_hq_cached:
            result_stems["vocals"] = vocals_hq_cached

        # â”€â”€ UNWA: instrumental â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if run_unwa:
            def unwa_progress(pct, msg=""):
                if progress_callback:
                    mapped = 50 + pct * 0.50 if both_run else pct
                    progress_callback(int(mapped), msg)

            logger.info("[dual] Running Resurrection UNWA for instrumental...")
            unwa_result = self._separate_mdx(
                audio_path, UNWA_MODEL, unwa_progress, keep_full_quality=True
            )
            unwa_stems = unwa_result.get("stems", {})
            # UNWA produces instrumental as primary output
            inst_path = (
                unwa_stems.get("instrumental")
                or unwa_stems.get("vocals")   # fallback: some models label primary as vocals
            )
            if inst_path:
                result_stems["instrumental"] = inst_path
            # whisper_path from UNWA is NOT useful for Whisper (it's music-optimised)
        elif need_instrumental and instr_hq_cached:
            result_stems["instrumental"] = instr_hq_cached

        elapsed = time.time() - start_total
        if progress_callback:
            progress_callback(100, f"Separation completed ({elapsed:.0f}s)")

        return {
            "whisper_path": whisper_path,
            "stems": result_stems,
            "duration": elapsed,
            "model_id": "dual",
            "cached": False,
        }

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
                "-hide_banner", "-loglevel", "quiet",
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



