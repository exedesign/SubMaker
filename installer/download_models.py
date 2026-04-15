"""
SubMaker — Model Downloader
============================
Downloads AI models after installation (or standalone).
Usage:
    python download_models.py --list
    python download_models.py --all
    python download_models.py --models turbo audio-separator qwen
    python download_models.py --info
"""

import argparse
import os
import sys
import json
import shutil
from pathlib import Path

# Enable UTF-8 output on Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ─── Model Registry ───────────────────────────────────────────────────────────

MODELS = {
    "turbo": {
        "name": "Whisper Turbo",
        "description": "Speech recognition — fast and accurate (recommended)",
        "size_mb": 1500,
        "type": "whisper",
        "repo_id": "deepdml/faster-whisper-large-v3-turbo-ct2",
        "local_dir": "turbo",
    },
    "small": {
        "name": "Whisper Small",
        "description": "Better accuracy for Arabic/Chinese/Japanese/Korean",
        "size_mb": 464,
        "type": "whisper",
        "repo_id": "Systran/faster-whisper-small",
        "local_dir": "small",
    },
    "tiny": {
        "name": "Whisper Tiny",
        "description": "Fastest, lower accuracy",
        "size_mb": 75,
        "type": "whisper",
        "repo_id": "Systran/faster-whisper-tiny",
        "local_dir": "tiny",
    },
    "distil-large-v3": {
        "name": "Whisper Distil Large v3",
        "description": "Fast + high accuracy (distilled)",
        "size_mb": 1500,
        "type": "whisper",
        "repo_id": "Systran/faster-distil-whisper-large-v3",
        "local_dir": "distil-large-v3",
    },
    "audio-separator": {
        "name": "BS-Roformer Vocal Separator",
        "description": "Vocal isolation — extract vocals from music",
        "size_mb": 805,
        "type": "audio-separator",
        "local_dir": "audio-separator",
        "model_files": [
            "model_bs_roformer_ep_317_sdr_12.9755.ckpt",
            "bs_roformer_instrumental_resurrection_unwa.ckpt",
        ],
        "download_urls": {
            "model_bs_roformer_ep_317_sdr_12.9755.ckpt":
                "https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/model_bs_roformer_ep_317_sdr_12.9755.ckpt",
            "model_bs_roformer_ep_317_sdr_12.9755.yaml":
                "https://github.com/nomadkaraoke/python-audio-separator/releases/download/model-configs/model_bs_roformer_ep_317_sdr_12.9755.yaml",
            "bs_roformer_instrumental_resurrection_unwa.ckpt":
                "https://github.com/nomadkaraoke/python-audio-separator/releases/download/model-configs/bs_roformer_instrumental_resurrection_unwa.ckpt",
            "config_bs_roformer_instrumental_resurrection_unwa.yaml":
                "https://github.com/nomadkaraoke/python-audio-separator/releases/download/model-configs/config_bs_roformer_instrumental_resurrection_unwa.yaml",
        },
    },
    "qwen": {
        "name": "Qwen 2.5 3B AWQ",
        "description": "AI translation engine — 37+ languages",
        "size_mb": 2600,
        "type": "huggingface",
        "repo_id": "Qwen/Qwen2.5-3B-Instruct-AWQ",
        "local_dir": "qwen2.5-3b-awq",
    },
    "flux-klein": {
        "name": "FLUX.2 Klein 4B",
        "description": "AI cover art generator — text to image",
        "size_mb": 22600,
        "type": "huggingface",
        "repo_id": "black-forest-labs/FLUX.2-klein-4B",
        "local_dir": "flux-klein-4b",
    },
    "flux-small-decoder": {
        "name": "FLUX.2 Small Decoder",
        "description": "Fast VAE decoder — 1.4x faster decode, low VRAM",
        "size_mb": 250,
        "type": "huggingface",
        "repo_id": "black-forest-labs/FLUX.2-small-decoder",
        "local_dir": "flux-small-decoder",
    },
}

# ─── Helper Functions ──────────────────────────────────────────────────────────

def get_models_dir():
    """Detect the models directory."""
    # If run from installer staging / installed app
    script_dir = Path(__file__).parent
    
    # Env var override (highest priority)
    env_dir = os.environ.get("SUBMAKER_MODELS_DIR")
    if env_dir:
        p = Path(env_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p
    
    # Installed app: {app}\tools\download_models.py → {app}\resources\resources\models
    app_dir = script_dir.parent
    installed_models = app_dir / "resources" / "resources" / "models"
    if (app_dir / "resources" / "resources").exists():
        installed_models.mkdir(parents=True, exist_ok=True)
        return installed_models
    
    # Dev mode: SubMaker\installer\download_models.py → SubMaker\resources\models
    dev_models = script_dir.parent / "resources" / "models"
    if dev_models.exists():
        return dev_models
    
    # Fallback to installed app structure
    installed_models.mkdir(parents=True, exist_ok=True)
    return installed_models


def format_size(mb):
    if mb >= 1000:
        return f"{mb / 1000:.1f} GB"
    return f"{mb} MB"


def print_header(text):
    print(f"\n{'=' * 60}")
    print(f"  {text}")
    print(f"{'=' * 60}\n")


def print_model_info(models_dir):
    """Print model information with installation status."""
    print_header("SubMaker AI Models")
    total_size = 0
    for key, model in MODELS.items():
        local_path = models_dir / model["local_dir"]
        installed = local_path.exists() and any(local_path.iterdir()) if local_path.exists() else False
        status = "[+] Installed" if installed else "[-] Not installed"
        size_str = format_size(model["size_mb"])
        total_size += model["size_mb"]
        print(f"  [{key}]")
        print(f"    {model['name']} ({size_str})")
        print(f"    {model['description']}")
        print(f"    Status: {status}")
        print(f"    Path  : {local_path}")
        print()
    print(f"  Total (all): {format_size(total_size)}")
    print(f"  Models dir : {models_dir}")
    print()


def download_whisper_model(model_info, models_dir):
    """Download a Whisper model using huggingface_hub."""
    from huggingface_hub import snapshot_download
    
    target_dir = models_dir / model_info["local_dir"]
    repo_id = model_info["repo_id"]
    
    print(f"  [>] Downloading {repo_id} -> {target_dir}")
    
    snapshot_download(
        repo_id=repo_id,
        local_dir=str(target_dir),
        local_dir_use_symlinks=False,
    )
    
    print(f"  [OK] {model_info['name']} downloaded.")
    return True


def download_huggingface_model(model_info, models_dir):
    """Download a model from HuggingFace Hub."""
    from huggingface_hub import snapshot_download
    
    target_dir = models_dir / model_info["local_dir"]
    repo_id = model_info["repo_id"]
    
    print(f"  [>] Downloading {repo_id} -> {target_dir}")
    
    snapshot_download(
        repo_id=repo_id,
        local_dir=str(target_dir),
        local_dir_use_symlinks=False,
    )
    
    print(f"  [OK] {model_info['name']} downloaded.")
    return True


def download_audio_separator_model(model_info, models_dir):
    """Download audio-separator model files directly from known URLs."""
    import requests
    
    target_dir = models_dir / model_info["local_dir"]
    target_dir.mkdir(parents=True, exist_ok=True)
    
    download_urls = model_info.get("download_urls", {})
    if not download_urls:
        print(f"  [FAIL] No download URLs configured for audio-separator")
        return False
    
    for filename, url in download_urls.items():
        dest = target_dir / filename
        if dest.exists() and dest.stat().st_size > 0:
            print(f"  [=] {filename} already exists, skipping.")
            continue
        
        print(f"  [>] Downloading {filename}...")
        try:
            resp = requests.get(url, stream=True, timeout=600)
            resp.raise_for_status()
            total = int(resp.headers.get('content-length', 0))
            downloaded = 0
            with open(str(dest), "wb") as f:
                for chunk in resp.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total > 0:
                            pct = int(downloaded / total * 100)
                            print(f"\r  [>] {filename}: {pct}% ({downloaded // (1024*1024)} MB / {total // (1024*1024)} MB)", end="", flush=True)
            print(f"\n  [OK] {filename} downloaded ({dest.stat().st_size // (1024*1024)} MB)")
        except Exception as e:
            print(f"\n  [FAIL] Failed to download {filename}: {e}")
            # Clean up partial download
            if dest.exists():
                dest.unlink()
            return False
    
    print(f"  [OK] {model_info['name']} completed.")
    return True


def download_model(key, models_dir):
    """Download a single model."""
    if key not in MODELS:
        print(f"  [FAIL] Unknown model: {key}")
        print(f"     Valid models: {', '.join(MODELS.keys())}")
        return False
    
    model = MODELS[key]
    local_path = models_dir / model["local_dir"]
    
    # Check if already installed
    if local_path.exists() and any(local_path.iterdir()):
        print(f"  [=] {model['name']} already installed, skipping.")
        return True
    
    print(f"\n  [>] {model['name']} ({format_size(model['size_mb'])})")
    print(f"    {model['description']}")
    
    try:
        if model["type"] == "whisper":
            return download_whisper_model(model, models_dir)
        elif model["type"] == "huggingface":
            return download_huggingface_model(model, models_dir)
        elif model["type"] == "audio-separator":
            return download_audio_separator_model(model, models_dir)
        else:
            print(f"  [FAIL] Unknown model type: {model['type']}")
            return False
    except Exception as e:
        print(f"  [FAIL] Download error: {e}")
        return False


# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="SubMaker AI Model Downloader",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python download_models.py --list              List available models
  python download_models.py --info              Model info and installation status
  python download_models.py --all               Download all models
  python download_models.py --models turbo qwen Download specified models
  python download_models.py --essential         Download essential models (turbo + audio-separator)
        """,
    )
    
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--list", action="store_true", help="List available models")
    group.add_argument("--info", action="store_true", help="Model info and installation status")
    group.add_argument("--all", action="store_true", help="Download all models")
    group.add_argument("--essential", action="store_true", help="Download essential models (turbo + audio-separator)")
    group.add_argument("--models", nargs="+", choices=list(MODELS.keys()),
                       help="Download specified models")
    
    parser.add_argument("--models-dir", type=str, default=None,
                        help="Models directory (default: auto-detect)")
    parser.add_argument("--force", action="store_true",
                        help="Re-download existing models")
    
    args = parser.parse_args()
    
    # Determine models directory
    if args.models_dir:
        models_dir = Path(args.models_dir)
        models_dir.mkdir(parents=True, exist_ok=True)
    else:
        models_dir = get_models_dir()
    
    # --list
    if args.list:
        print("\nAvailable models:")
        for key, model in MODELS.items():
            print(f"  {key:20s} {model['name']:30s} {format_size(model['size_mb']):>10s}")
        return 0
    
    # --info
    if args.info:
        print_model_info(models_dir)
        return 0
    
    # Determine which models to download
    if args.all:
        to_download = list(MODELS.keys())
    elif args.essential:
        to_download = ["turbo", "audio-separator"]
    else:
        to_download = args.models
    
    # If --force, remove existing models
    if args.force:
        for key in to_download:
            model = MODELS[key]
            local_path = models_dir / model["local_dir"]
            if local_path.exists():
                print(f"  [DEL] Removing {model['name']} (--force)...")
                shutil.rmtree(local_path, ignore_errors=True)
    
    print_header("SubMaker Model Downloader")
    print(f"  Models dir : {models_dir}")
    print(f"  To download: {len(to_download)} model(s)")
    
    total_mb = sum(MODELS[k]["size_mb"] for k in to_download)
    print(f"  Estimated size: {format_size(total_mb)}")
    print()
    
    # Download
    success = 0
    failed = 0
    for key in to_download:
        if download_model(key, models_dir):
            success += 1
        else:
            failed += 1
    
    # Summary
    print_header("Result")
    print(f"  [OK] Succeeded: {success}")
    if failed:
        print(f"  [FAIL] Failed: {failed}")
    print()
    
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
