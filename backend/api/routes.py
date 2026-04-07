"""
SubMaker API Routes
Flask endpoints for transcription, translation, and video rendering
"""
import os
import re
import uuid
import json
import shutil
import subprocess
import requests
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, Response
from werkzeug.utils import secure_filename
import mimetypes

import sys
sys.path.append(str(Path(__file__).parent.parent))
from config import TEMP_DIR, OUTPUT_DIR, FONTS_DIR, SUPPORTED_LANGUAGES, TENOR_API_KEY, TENOR_CLIENT_KEY, GIPHY_API_KEY, FFMPEG_PATH, ENABLE_GPU_ACCELERATION, PRESETS_DIR, VOCAL_CACHE_DIR
from services import (
    TranscriptionService,
    TranslationService,
    ArabicTextProcessor,
    VideoGenerator,
    SubtitleEngine,
    SubtitleStyle,
    AnimationConfig
)
from lyrics_parser import parse_suno_lyrics

# ---------------------------------------------------------------------------
# Startup: remove stale temp files from previous sessions
# ---------------------------------------------------------------------------
def _cleanup_stale_temp():
    """Remove temp files left over from a previous (crashed/killed) session."""
    try:
        patterns = ["viz_*.mp4", "render_*.ass", "mix_*.wav", "gif_*.mp4", "logo_*.*", "bg_*_temp.jpg"]
        removed = 0
        for pat in patterns:
            for f in TEMP_DIR.glob(pat):
                try:
                    f.unlink()
                    removed += 1
                except Exception:
                    pass
        # Clear stale vocal cache files
        if VOCAL_CACHE_DIR.exists():
            for f in VOCAL_CACHE_DIR.iterdir():
                if f.is_file():
                    try:
                        f.unlink()
                        removed += 1
                    except Exception:
                        pass
        if removed:
            print(f"[Startup] Temp cleanup: removed {removed} stale file(s) from {TEMP_DIR}")
    except Exception as exc:
        print(f"[Startup] Temp cleanup warning: {exc}")

# Startup cleanup is now controlled by frontend settings via /temp/cleanup.
# _cleanup_stale_temp()

# Create Blueprint
api = Blueprint("api", __name__)

# NOTE: CORS is handled globally by flask-cors in main.py.
# Do NOT add manual Access-Control-Allow-Origin headers here — it causes
# duplicate "*, *" values which browsers reject.

# Service instances (lazy loaded)
_transcription_service = None
_translation_service = None
_video_generator = None
_subtitle_engine = None


def get_transcription_service():
    global _transcription_service
    if _transcription_service is None:
        _transcription_service = TranscriptionService()
    return _transcription_service


def get_translation_service():
    global _translation_service
    if _translation_service is None:
        _translation_service = TranslationService()
    return _translation_service


def get_video_generator():
    global _video_generator
    if _video_generator is None:
        _video_generator = VideoGenerator()
    return _video_generator


def get_subtitle_engine():
    global _subtitle_engine
    if _subtitle_engine is None:
        _subtitle_engine = SubtitleEngine()
    return _subtitle_engine


# =============================================================================
# Health Check
# =============================================================================

@api.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "SubMaker API",
        "version": "1.0.0"
    })


# =============================================================================
# Whisper Model Management
# =============================================================================

@api.route("/models", methods=["GET"])
def get_whisper_models():
    """Get available Whisper models"""
    from services.engines import get_engine
    language = request.args.get("language")
    try:
        engine = get_engine()
        models = engine.get_available_models(language)
        return jsonify({"models": models})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# Tenor GIF Search
# =============================================================================

@api.route("/gif/search", methods=["GET"])
def search_gifs():
    """Search GIFs from Tenor"""
    query = request.args.get("q", "")
    limit = request.args.get("limit", 20, type=int)
    pos = request.args.get("pos", "")  # For pagination
    
    if not query:
        return jsonify({"error": "Search query required"}), 400
    
    try:
        params = {
            "q": query,
            "key": TENOR_API_KEY,
            "client_key": TENOR_CLIENT_KEY,
            "limit": min(limit, 50),
            "media_filter": "gif,tinygif",
        }
        
        if pos:
            params["pos"] = pos
        
        response = requests.get(
            "https://tenor.googleapis.com/v2/search",
            params=params,
            timeout=10
        )
        
        if response.status_code != 200:
            return jsonify({"error": f"Tenor API error: {response.status_code}"}), 500
        
        data = response.json()
        
        # Transform results to simpler format
        results = []
        for item in data.get("results", []):
            media = item.get("media_formats", {})
            
            # Get different sizes
            gif = media.get("gif", {})
            tinygif = media.get("tinygif", {})
            
            results.append({
                "id": item.get("id"),
                "title": item.get("title", ""),
                "url": gif.get("url", ""),
                "preview_url": tinygif.get("url", gif.get("url", "")),
                "width": gif.get("dims", [0, 0])[0],
                "height": gif.get("dims", [0, 0])[1],
                "preview_width": tinygif.get("dims", [0, 0])[0],
                "preview_height": tinygif.get("dims", [0, 0])[1],
            })
        
        return jsonify({
            "success": True,
            "results": results,
            "next": data.get("next", ""),
        })
        
    except requests.RequestException as e:
        return jsonify({"error": f"Network error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route("/gif/trending", methods=["GET"])
def trending_gifs():
    """Get trending GIFs from Tenor"""
    limit = request.args.get("limit", 20, type=int)
    pos = request.args.get("pos", "")
    
    try:
        params = {
            "key": TENOR_API_KEY,
            "client_key": TENOR_CLIENT_KEY,
            "limit": min(limit, 50),
            "media_filter": "gif,tinygif",
        }
        
        if pos:
            params["pos"] = pos
        
        response = requests.get(
            "https://tenor.googleapis.com/v2/featured",
            params=params,
            timeout=10
        )
        
        if response.status_code != 200:
            return jsonify({"error": f"Tenor API error: {response.status_code}"}), 500
        
        data = response.json()
        
        results = []
        for item in data.get("results", []):
            media = item.get("media_formats", {})
            gif = media.get("gif", {})
            tinygif = media.get("tinygif", {})
            
            results.append({
                "id": item.get("id"),
                "title": item.get("title", ""),
                "url": gif.get("url", ""),
                "preview_url": tinygif.get("url", gif.get("url", "")),
                "width": gif.get("dims", [0, 0])[0],
                "height": gif.get("dims", [0, 0])[1],
                "preview_width": tinygif.get("dims", [0, 0])[0],
                "preview_height": tinygif.get("dims", [0, 0])[1],
            })
        
        return jsonify({
            "success": True,
            "results": results,
            "next": data.get("next", ""),
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route("/gif/download", methods=["POST"])
def download_gif():
    """Download a GIF and save it locally for use as logo"""
    data = request.json
    gif_url = data.get("url")
    
    if not gif_url:
        return jsonify({"error": "GIF URL required"}), 400
    
    try:
        # Download the GIF
        response = requests.get(gif_url, timeout=30)
        
        if response.status_code != 200:
            return jsonify({"error": "Failed to download GIF"}), 500
        
        # Save to temp directory
        filename = f"gif_{uuid.uuid4().hex[:8]}.gif"
        file_path = TEMP_DIR / filename
        
        with open(file_path, "wb") as f:
            f.write(response.content)
        
        # Convert to base64 data URL for frontend display
        import base64
        base64_data = base64.b64encode(response.content).decode('utf-8')
        data_url = f"data:image/gif;base64,{base64_data}"
        
        return jsonify({
            "success": True,
            "file_path": str(file_path),
            "filename": filename,
            "data_url": data_url,
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# Giphy GIF Search
# =============================================================================

@api.route("/giphy/search", methods=["GET"])
def giphy_search():
    """Search GIFs from Giphy"""
    query = request.args.get("q", "")
    limit = request.args.get("limit", 20, type=int)
    offset = request.args.get("offset", 0, type=int)
    
    if not query:
        return jsonify({"error": "Search query required"}), 400
    
    try:
        params = {
            "q": query,
            "api_key": GIPHY_API_KEY,
            "limit": min(limit, 50),
            "offset": offset,
            "rating": "g",  # Safe for all audiences
        }
        
        response = requests.get(
            "https://api.giphy.com/v1/gifs/search",
            params=params,
            timeout=10
        )
        
        if response.status_code != 200:
            return jsonify({"error": f"Giphy API error: {response.status_code}"}), 500
        
        data = response.json()
        
        results = []
        for item in data.get("data", []):
            images = item.get("images", {})
            original = images.get("original", {})
            preview = images.get("fixed_width", {})
            
            results.append({
                "id": item.get("id"),
                "title": item.get("title", ""),
                "url": original.get("url", ""),
                "preview_url": preview.get("url", original.get("url", "")),
                "width": int(original.get("width", 0)),
                "height": int(original.get("height", 0)),
                "preview_width": int(preview.get("width", 0)),
                "preview_height": int(preview.get("height", 0)),
            })
        
        pagination = data.get("pagination", {})
        
        return jsonify({
            "success": True,
            "results": results,
            "total": pagination.get("total_count", 0),
            "offset": pagination.get("offset", 0),
        })
        
    except requests.RequestException as e:
        return jsonify({"error": f"Network error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route("/giphy/trending", methods=["GET"])
def giphy_trending():
    """Get trending GIFs from Giphy"""
    limit = request.args.get("limit", 20, type=int)
    offset = request.args.get("offset", 0, type=int)
    
    try:
        params = {
            "api_key": GIPHY_API_KEY,
            "limit": min(limit, 50),
            "offset": offset,
            "rating": "g",
        }
        
        response = requests.get(
            "https://api.giphy.com/v1/gifs/trending",
            params=params,
            timeout=10
        )
        
        if response.status_code != 200:
            return jsonify({"error": f"Giphy API error: {response.status_code}"}), 500
        
        data = response.json()
        
        results = []
        for item in data.get("data", []):
            images = item.get("images", {})
            original = images.get("original", {})
            preview = images.get("fixed_width", {})
            
            results.append({
                "id": item.get("id"),
                "title": item.get("title", ""),
                "url": original.get("url", ""),
                "preview_url": preview.get("url", original.get("url", "")),
                "width": int(original.get("width", 0)),
                "height": int(original.get("height", 0)),
                "preview_width": int(preview.get("width", 0)),
                "preview_height": int(preview.get("height", 0)),
            })
        
        pagination = data.get("pagination", {})
        
        return jsonify({
            "success": True,
            "results": results,
            "total": pagination.get("total_count", 0),
            "offset": pagination.get("offset", 0),
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# GIF Proxy (for CORS issues)
# =============================================================================

@api.route("/gif/proxy", methods=["GET"])
def gif_proxy():
    """Proxy GIF images to avoid CORS issues"""
    url = request.args.get("url")
    
    if not url:
        return jsonify({"error": "URL required"}), 400
    
    try:
        response = requests.get(url, timeout=15, stream=True)
        
        if response.status_code != 200:
            return jsonify({"error": "Failed to fetch image"}), 500
        
        # Return the image with proper headers
        return Response(
            response.content,
            content_type=response.headers.get('Content-Type', 'image/gif'),
            headers={
                'Cache-Control': 'public, max-age=86400',
                'Access-Control-Allow-Origin': '*'
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# File Serving (for browser security)
# =============================================================================

@api.route("/media/<path:filename>", methods=["GET"])
def serve_media(filename):
    """Serve media files from temp/output directories"""
    # Check temp directory first
    temp_path = TEMP_DIR / filename
    if temp_path.exists():
        return send_file(str(temp_path))
    
    # Check output directory
    output_path = OUTPUT_DIR / filename
    if output_path.exists():
        return send_file(str(output_path))
    
    return jsonify({"error": "File not found"}), 404


@api.route("/media/temp/<path:filename>", methods=["GET"])
def serve_temp_media(filename):
    """Serve media files from temp directory with Range support"""
    file_path = TEMP_DIR / filename
    print(f"Serving temp media: {file_path}, exists: {file_path.exists()}")
    if file_path.exists():
        # Determine MIME type
        mime_type, _ = mimetypes.guess_type(str(file_path))
        if mime_type is None:
            # Default MIME types for common audio formats
            ext = file_path.suffix.lower()
            mime_map = {
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.ogg': 'audio/ogg',
                '.m4a': 'audio/mp4',
                '.flac': 'audio/flac',
                '.aac': 'audio/aac',
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
            }
            mime_type = mime_map.get(ext, 'application/octet-stream')
        print(f"Serving {filename} with MIME type: {mime_type}")
        # conditional=True enables HTTP Range requests for seeking
        return send_file(str(file_path), mimetype=mime_type, conditional=True)
    print(f"File not found: {file_path}")
    return jsonify({"error": "File not found"}), 404


@api.route("/media/local", methods=["GET"])
def serve_local_media():
    """Serve absolute local media files selected via native dialog."""
    raw_path = request.args.get("path", "")
    if not raw_path:
        return jsonify({"error": "path required"}), 400

    try:
        local_path = Path(raw_path).expanduser().resolve()
    except Exception:
        return jsonify({"error": "Invalid path"}), 400

    # Only allow absolute file paths
    if not local_path.is_absolute() or not local_path.exists() or not local_path.is_file():
        return jsonify({"error": "File not found"}), 404

    # Restrict to known media extensions
    ext = local_path.suffix.lower()
    allowed_exts = {
        '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac',
        '.mp4', '.mkv', '.avi', '.mov', '.webm',
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif',
    }
    if ext not in allowed_exts:
        return jsonify({"error": "Unsupported media type"}), 400

    mime_type, _ = mimetypes.guess_type(str(local_path))
    if not mime_type:
        mime_map = {
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.ogg': 'audio/ogg',
            '.m4a': 'audio/mp4',
            '.flac': 'audio/flac',
            '.aac': 'audio/aac',
            '.mp4': 'video/mp4',
            '.mkv': 'video/x-matroska',
            '.avi': 'video/x-msvideo',
            '.mov': 'video/quicktime',
            '.webm': 'video/webm',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
            '.avif': 'image/avif',
        }
        mime_type = mime_map.get(ext, 'application/octet-stream')

    return send_file(str(local_path), mimetype=mime_type, conditional=True)


@api.route("/media/read-text", methods=["GET"])
def read_text_file():
    """Read a text file (M3U playlist) — only .m3u/.m3u8 extensions allowed"""
    file_path = request.args.get('path', '').strip()
    if not file_path:
        return jsonify({'error': 'path is required'}), 400
    resolved = Path(file_path).resolve()
    ext = resolved.suffix.lower()
    if ext not in ('.m3u', '.m3u8'):
        return jsonify({'error': 'Only .m3u and .m3u8 files are allowed'}), 403
    if not resolved.is_file():
        return jsonify({'error': 'File not found'}), 404
    try:
        content = resolved.read_text(encoding='utf-8', errors='replace')
        return content, 200, {'Content-Type': 'text/plain; charset=utf-8'}
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api.route("/media/output/<path:filename>", methods=["GET"])
def serve_output_media(filename):
    """Serve media files from output directory"""
    file_path = OUTPUT_DIR / filename
    if file_path.exists():
        return send_file(str(file_path), as_attachment=True, download_name=filename)
    return jsonify({"error": "File not found"}), 404


# =============================================================================
# Waveform Generation
# =============================================================================

@api.route("/waveform", methods=["POST"])
def generate_waveform():
    """Generate waveform visualization data from audio file"""
    data = request.json or {}
    file_path = data.get("file_path")
    
    if not file_path:
        return jsonify({"error": "file_path required"}), 400
    
    try:
        import librosa
        import numpy as np
        from pathlib import Path
        
        audio_path = Path(file_path)
        if not audio_path.exists():
            return jsonify({"error": f"File not found: {file_path}"}), 404
        
        # Load audio file
        print(f"[Waveform] Loading: {audio_path}")
        y, sr = librosa.load(str(audio_path), sr=None, mono=True)
        
        # Resample to lower sample rate for visualization (100 samples per second)
        # This gives us reasonable granularity without excessive data
        chunk_size = max(1, len(y) // 500)  # 500 samples max for frontend
        
        # Calculate RMS energy for each chunk
        waveform = []
        for i in range(0, len(y), chunk_size):
            chunk = y[i:i+chunk_size]
            rms = float(np.sqrt(np.mean(chunk ** 2)))
            waveform.append(rms)
        
        # Normalize to 0-1 range
        max_amp = max(waveform) if waveform else 1
        if max_amp < 0.01:
            max_amp = 0.01
        waveform = [amp / max_amp for amp in waveform]
        
        print(f"[Waveform] Generated {len(waveform)} samples for visualization")
        
        return jsonify({
            "success": True,
            "waveform": waveform,
            "duration": float(len(y) / sr),
            "samples": len(waveform),
        })
    
    except ImportError:
        return jsonify({"error": "librosa not installed. Run: pip install librosa"}), 500
    except Exception as e:
        import traceback
        print(f"[Waveform] Error: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# =============================================================================
# Languages
# =============================================================================

@api.route("/languages", methods=["GET"])
def get_languages():
    """Get supported languages"""
    return jsonify({
        "languages": [
            {"code": code, "name": name}
            for code, name in SUPPORTED_LANGUAGES
        ]
    })


@api.route("/translation/packages", methods=["GET"])
def get_translation_packages():
    """Get available and installed translation packages"""
    try:
        service = get_translation_service()
        return jsonify({
            "available": service.get_available_packages(),
            "installed": service.get_installed_packages()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route("/translation/install", methods=["POST"])
def install_translation_package():
    """Install a translation language pair"""
    data = request.json
    from_code = data.get("from_code")
    to_code = data.get("to_code")
    
    if not from_code or not to_code:
        return jsonify({"error": "from_code and to_code required"}), 400
    
    try:
        service = get_translation_service()
        service.install_language_pair(from_code, to_code)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# File Upload
# =============================================================================

ALLOWED_AUDIO_EXTENSIONS = {"mp3", "wav", "m4a", "ogg", "flac", "aac"}
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "mkv", "avi", "mov", "webm"}
ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "bmp", "webp"}


def allowed_file(filename, allowed_extensions):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_extensions


@api.route("/upload", methods=["POST"])
def upload_file():
    """Upload an audio, video, or image file"""
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files["file"]
    original_path = request.form.get("originalPath")

    if not file.filename:
        return jsonify({"error": "No file selected"}), 400

    # If a real path is provided (from Electron), we trust it and don't save a copy.
    if original_path and os.path.exists(original_path):
        print(f"Using original media path: {original_path}")
        
        ext = original_path.rsplit(".", 1)[1].lower()
        if ext in ALLOWED_AUDIO_EXTENSIONS:
            file_type = "audio"
        elif ext in ALLOWED_VIDEO_EXTENSIONS:
            file_type = "video"
        else:
            file_type = "image"
            
        return jsonify({
            "success": True,
            "filePath": original_path, # Return the original path
            "file_type": file_type,
            "original_name": os.path.basename(original_path),
            "originalPath": original_path,
        })

    # Fallback for web-based uploads (drag-drop from browser)
    raw_filename = file.filename  # preserve original name with Unicode chars
    original_filename = secure_filename(file.filename)
    if "." in original_filename:
        ext = original_filename.rsplit(".", 1)[1].lower()
    else:
        return jsonify({"error": "File must have an extension"}), 400

    all_allowed = ALLOWED_AUDIO_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS | ALLOWED_IMAGE_EXTENSIONS
    if ext not in all_allowed:
        return jsonify({"error": f"File type '.{ext}' not allowed"}), 400

    safe_filename = f"{uuid.uuid4().hex}.{ext}"
    temp_file_path = TEMP_DIR / safe_filename
    file.save(str(temp_file_path))

    if ext in ALLOWED_AUDIO_EXTENSIONS:
        file_type = "audio"
    elif ext in ALLOWED_VIDEO_EXTENSIONS:
        file_type = "video"
    else:
        file_type = "image"

    return jsonify({
        "success": True,
        "filePath": str(temp_file_path), # Return path to temp copy
        "file_type": file_type,
        "original_name": raw_filename,   # unsanitized name for export naming
        "originalPath": None, # No original path in this case
    })


# =============================================================================
# Temp folder cleanup
# =============================================================================

@api.route("/temp/cache-info", methods=["GET"])
def temp_cache_info():
    """Return total size of the temp directory tree in bytes."""
    try:
        total_bytes = 0
        file_count = 0
        if TEMP_DIR.exists():
            for f in TEMP_DIR.rglob("*"):
                if f.is_file():
                    try:
                        total_bytes += f.stat().st_size
                        file_count += 1
                    except Exception:
                        pass
        return jsonify({"size_bytes": total_bytes, "file_count": file_count})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@api.route("/temp/cleanup", methods=["POST"])
def temp_cleanup():
    """Remove all files in the temp directory tree."""
    try:
        removed = []
        # Active job paths — don't touch files belonging to a running job
        active_paths = set()
        for job in _render_jobs.values():
            if job.get("status") == "running":
                for key in ("visualizer_video_path",):
                    p = job.get(key)
                    if p:
                        active_paths.add(str(p))

        if TEMP_DIR.exists():
            for f in TEMP_DIR.rglob("*"):
                if f.is_file() and str(f) not in active_paths:
                    try:
                        f.unlink()
                        removed.append(str(f.relative_to(TEMP_DIR)))
                    except Exception:
                        pass
            # Remove empty subdirectories (bottom-up)
            for d in sorted(TEMP_DIR.rglob("*"), reverse=True):
                if d.is_dir():
                    try:
                        d.rmdir()  # only removes if empty
                    except Exception:
                        pass
        print(f"[Temp Cleanup] Removed {len(removed)} file(s)")
        return jsonify({"success": True, "removed": removed, "count": len(removed)})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# =============================================================================
# Native File Browser (for browser mode — no Electron IPC)
# =============================================================================

@api.route("/browse-file", methods=["POST"])
def browse_file():
    """Open a native file dialog on the server machine and return the selected path."""
    data = request.json or {}
    file_type = data.get("file_type", "media")
    title = data.get("title", "Select a file")
    initial_dir = data.get("initial_dir")

    from services.file_dialog import open_file_dialog

    selected_path = open_file_dialog(
        file_type=file_type,
        title=title,
        initial_dir=initial_dir,
    )

    if selected_path:
        ext = selected_path.rsplit(".", 1)[-1].lower() if "." in selected_path else ""
        if ext in ALLOWED_AUDIO_EXTENSIONS:
            detected_type = "audio"
        elif ext in ALLOWED_VIDEO_EXTENSIONS:
            detected_type = "video"
        elif ext in ALLOWED_IMAGE_EXTENSIONS:
            detected_type = "image"
        else:
            detected_type = "unknown"

        return jsonify({
            "success": True,
            "filePath": selected_path,
            "file_type": detected_type,
            "original_name": os.path.basename(selected_path),
            "cancelled": False,
        })
    else:
        return jsonify({
            "success": True,
            "filePath": None,
            "file_type": None,
            "original_name": None,
            "cancelled": True,
        })


# =============================================================================
# Vocal Isolation (standalone, SSE streaming)
# =============================================================================

@api.route("/vocal-isolation/separate", methods=["POST", "OPTIONS"])
def vocal_isolation_separate():
    """Full vocal separation with SSE progress streaming."""
    from flask import Response, stream_with_context
    import json as json_module

    if request.method == "OPTIONS":
        resp = jsonify({})
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return resp, 200

    data = request.json
    if not data:
        return jsonify({"error": "Invalid request body"}), 400

    file_path = data.get("file_path")
    selected_stems = data.get("selected_stems")  # e.g. ['vocals', 'instrumental']

    if not file_path:
        return jsonify({"error": "file_path required"}), 400

    if not os.path.exists(file_path):
        return jsonify({"error": f"File not found: {file_path}"}), 404

    def generate():
        import queue
        import threading

        try:
            from services.vocal_isolator import get_vocal_isolator
            isolator = get_vocal_isolator()

            if not isolator.is_available():
                yield f"data: {json_module.dumps({'type': 'error', 'error': 'No vocal separation engine available'})}\n\n"
                return

            progress_queue = queue.Queue()
            result_holder = [None]
            error_holder = [None]

            def progress_callback(pct, message=""):
                progress_queue.put(('progress', int(pct), message))

            def run_separation():
                try:
                    result_holder[0] = isolator.separate_dual_full(
                        audio_path=file_path,
                        selected_stems=selected_stems if selected_stems else None,
                        progress_callback=progress_callback,
                    )
                    progress_queue.put(('done', None, None))
                except Exception as e:
                    error_holder[0] = str(e)
                    progress_queue.put(('error', None, str(e)))

            thread = threading.Thread(target=run_separation, daemon=True)
            thread.start()

            while True:
                try:
                    msg_type, val, text = progress_queue.get(timeout=30)
                except queue.Empty:
                    # Check if thread died without putting a result
                    if not thread.is_alive():
                        err = error_holder[0] or "Separation thread died unexpectedly"
                        yield f"data: {json_module.dumps({'type': 'error', 'error': err})}\n\n"
                        return
                    yield f"data: {json_module.dumps({'type': 'heartbeat'})}\n\n"
                    continue

                if msg_type == 'progress':
                    yield f"data: {json_module.dumps({'type': 'progress', 'progress': val, 'message': text})}\n\n"
                elif msg_type == 'done':
                    result = result_holder[0]
                    stems = result.get("stems", {})
                    # Build URL paths for frontend playback
                    stem_urls = {}
                    stem_paths = {}
                    for stem_name, abs_path in stems.items():
                        rel = os.path.relpath(abs_path, str(TEMP_DIR)).replace("\\", "/")
                        stem_urls[stem_name] = f"/api/media/temp/{rel}"
                        stem_paths[stem_name] = abs_path

                    yield f"data: {json_module.dumps({'type': 'result', 'success': True, 'stems': stem_urls, 'stems_paths': stem_paths, 'original_path': file_path, 'model_id': result.get('model_id', 'dual'), 'duration': result.get('duration', 0), 'cached': result.get('cached', False)})}\n\n"
                    return
                elif msg_type == 'error':
                    yield f"data: {json_module.dumps({'type': 'error', 'error': text})}\n\n"
                    return

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield f"data: {json_module.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    )


# =============================================================================
# Transcription
# =============================================================================

@api.route("/transcribe", methods=["POST"])
def transcribe():
    """Transcribe audio/video to text with timestamps - supports content types"""
    data = request.json
    if not data:
        print("[Transcribe] ERROR: request.json is None (bad Content-Type or empty body)")
        return jsonify({"error": "Invalid request body"}), 400

    file_path = data.get("file_path")
    language = data.get("language")  # None for auto-detect
    model_settings = data.get("model_settings", {})  # Model settings from frontend
    output_formats = data.get("output_formats", [])  # e.g. ["json", "lrc", "enhanced_lrc", "id3"]

    print(f"[Transcribe] file_path='{file_path}', exists={os.path.exists(file_path) if file_path else 'N/A'}")

    if not file_path:
        return jsonify({"error": "file_path required"}), 400

    if not os.path.exists(file_path):
        print(f"[Transcribe] File NOT found: '{file_path}'")
        return jsonify({"error": f"File not found: {file_path}"}), 404

    try:
        service = get_transcription_service()
        
        # Determine optimal model size using frontend settings
        if model_settings and language:
            optimal_model = model_settings.get(language, model_settings.get('auto', 'small'))
            print(f"Using model '{optimal_model}' for language '{language}' (from frontend settings)")
        else:
            optimal_model = service.get_optimal_model_size(language)
            print(f"Using default optimal model '{optimal_model}' for language '{language}'")
        
        # Standard transcription
        result = service.transcribe_to_subtitles(
            file_path,
            language=language
        )
        
        # Generate requested output formats
        outputs = {}
        if output_formats and result.get("subtitles"):
            try:
                from services.subtitle_engine import get_subtitle_engine
                engine = get_subtitle_engine()
                job_id = uuid.uuid4().hex[:8]

                if "json" in output_formats or "word_json" in output_formats:
                    json_path = str(OUTPUT_DIR / f"lyrics_{job_id}.json")
                    engine.save_word_level_json(result["subtitles"], json_path)
                    outputs["word_level_json_path"] = json_path

                if "lrc" in output_formats:
                    lrc_path = str(OUTPUT_DIR / f"lyrics_{job_id}.lrc")
                    engine.save_lrc(result["subtitles"], lrc_path)
                    outputs["lrc_path"] = lrc_path

                if "enhanced_lrc" in output_formats:
                    elrc_path = str(OUTPUT_DIR / f"lyrics_{job_id}_enhanced.lrc")
                    engine.save_enhanced_lrc(result["subtitles"], elrc_path)
                    outputs["enhanced_lrc_path"] = elrc_path

                if "id3" in output_formats and file_path.lower().endswith(".mp3"):
                    from services.lyrics_tagger import get_lyrics_tagger
                    tagger = get_lyrics_tagger()
                    if tagger.is_available():
                        id3_result = tagger.write_synced_lyrics(
                            file_path, result["subtitles"],
                            language=result.get("language", "en")
                        )
                        outputs["id3_written"] = id3_result
                    else:
                        outputs["id3_error"] = "mutagen not installed"

            except Exception as export_err:
                print(f"Output format generation warning: {export_err}")
                outputs["export_error"] = str(export_err)

        return jsonify({
            "success": True,
            "language": result["language"],
            "duration": result["duration"],
            "subtitles": result["subtitles"],
            "model_used": result.get("model_used", optimal_model),
            "performance": result.get("performance", {}),
            "outputs": outputs
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@api.route("/transcribe/stream", methods=["POST", "OPTIONS"])
def transcribe_stream():
    """Transcribe with streaming progress updates using SSE - supports content types"""
    from flask import Response, stream_with_context
    import json as json_module

    # Handle CORS preflight
    if request.method == "OPTIONS":
        resp = jsonify({})
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return resp, 200

    data = request.json
    if not data:
        print("[Transcribe Stream] ERROR: request.json is None (bad Content-Type or empty body)")
        return jsonify({"error": "Invalid request body"}), 400

    file_path = data.get("file_path")
    language = data.get("language")
    model_settings = data.get("model_settings", {})  # Model settings from frontend

    whisper_params = data.get("whisper_params", {})  # User fine-tune overrides
    enable_vocal_isolation = data.get("enable_vocal_isolation", False)
    vocal_model_id = data.get("vocal_model_id")  # e.g. "vocal_ep317" or "instrumental_resurrection"

    if not file_path:
        return jsonify({"error": "file_path required"}), 400

    print(f"[Transcribe Stream] file_path='{file_path}', exists={os.path.exists(file_path)}")

    if not os.path.exists(file_path):
        return jsonify({"error": f"File not found: {file_path}"}), 404

    def generate():
        import queue
        import threading

        try:
            print(f"[Transcribe Stream] SSE generator started for: {file_path}")
            service = get_transcription_service()
            print(f"[Transcribe Stream] Transcription service loaded")

            # Initial status
            print(f"[Transcribe Stream] Yielding initial status (5%)")
            yield f"data: {json_module.dumps({'type': 'status', 'message': 'Starting transcription pipeline...', 'progress': 5})}\n\n"

            # Thread+Queue pattern for real-time progress during blocking operations
            progress_queue = queue.Queue()
            result_holder = [None]
            error_holder = [None]

            def progress_callback(progress_pct, message=""):
                """Called from transcription service during long operations.
                progress_pct: 0-100 within the service's scope
                Maps to 10-90% in the SSE stream."""
                mapped = 10 + int(progress_pct * 0.80)
                progress_queue.put(('progress', mapped, message))

            def run_transcription():
                try:
                    # Vocal isolation if enabled
                    audio_to_transcribe = file_path
                    if enable_vocal_isolation:
                        try:
                            from services.vocal_isolator import get_vocal_isolator
                            isolator = get_vocal_isolator()
                            if isolator.is_available():
                                progress_callback(5, "Vocal isolation in progress...")
                                audio_to_transcribe = isolator.separate_vocals(
                                    file_path,
                                    progress_callback=lambda p, m: progress_callback(p * 0.3, m),
                                    model_id=vocal_model_id,
                                )
                            else:
                                progress_callback(5, "Demucs not available, using original audio...")
                        except Exception as vi_err:
                            print(f"Vocal isolation failed, using original: {vi_err}")

                    # Use frontend model_settings if provided
                    model_override = model_settings.get(language) or model_settings.get('auto') if model_settings else None
                    result = service.transcribe(
                        audio_to_transcribe,
                        language=language,
                        word_timestamps=True,
                        progress_callback=progress_callback,
                        user_params=whisper_params,
                        model_size_override=model_override
                    )
                    result_holder[0] = result
                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    error_holder[0] = e
                finally:
                    progress_queue.put(('done', 0, ''))

            print(f"[Transcribe Stream] Yielding pipeline started (10%)")
            yield f"data: {json_module.dumps({'type': 'status', 'message': 'Transcription pipeline started...', 'progress': 10})}\n\n"

            # Run transcription in background thread
            print(f"[Transcribe Stream] Starting transcription thread...")
            thread = threading.Thread(target=run_transcription, daemon=True)
            thread.start()

            # Yield progress events from the queue in real-time
            while True:
                try:
                    event_type, pct, msg = progress_queue.get(timeout=3)
                    if event_type == 'done':
                        break
                    yield f"data: {json_module.dumps({'type': 'progress', 'progress': pct, 'current_text': msg})}\n\n"
                except queue.Empty:
                    # Heartbeat to keep SSE connection alive
                    yield f"data: {json_module.dumps({'type': 'heartbeat'})}\n\n"

            thread.join(timeout=10)

            if error_holder[0]:
                yield f"data: {json_module.dumps({'type': 'error', 'error': str(error_holder[0])})}\n\n"
                return

            result = result_holder[0]
            if not result:
                yield f"data: {json_module.dumps({'type': 'error', 'error': 'Transcription returned no result'})}\n\n"
                return

            # Process segments into subtitles
            subtitles = []
            subtitle_id = 1
            total_segments = len(result['segments'])

            for i, segment in enumerate(result['segments']):
                progress = 90 + int((i / max(total_segments, 1)) * 8)

                # Format subtitle — preserve full word objects with timestamps for karaoke
                if 'words' in segment and segment['words']:
                    words = segment['words']
                    current_word_objs = []
                    current_start = None

                    for word in words:
                        if current_start is None:
                            current_start = word['start']
                        current_word_objs.append(word)
                        current_text = ' '.join(w['word'] for w in current_word_objs).strip()

                        if len(current_word_objs) >= 8 or len(current_text) >= 42:
                            subtitles.append({
                                'id': subtitle_id,
                                'start': current_start,
                                'end': word['end'],
                                'text': current_text,
                                'words': [w.copy() if isinstance(w, dict) else w for w in current_word_objs]
                            })
                            subtitle_id += 1
                            current_word_objs = []
                            current_start = None

                    if current_word_objs:
                        subtitles.append({
                            'id': subtitle_id,
                            'start': current_start,
                            'end': words[-1]['end'],
                            'text': ' '.join(w['word'] for w in current_word_objs).strip(),
                            'words': [w.copy() if isinstance(w, dict) else w for w in current_word_objs]
                        })
                        subtitle_id += 1
                else:
                    subtitles.append({
                        'id': subtitle_id,
                        'start': segment['start'],
                        'end': segment['end'],
                        'text': segment['text']
                    })
                    subtitle_id += 1

                yield f"data: {json_module.dumps({'type': 'progress', 'progress': progress, 'current_text': segment['text'][:50]})}\n\n"

            # Apply Arabic/RTL processing if detected language is RTL
            detected_lang = result.get('language', '')
            is_rtl = detected_lang in {'ar', 'fa', 'he', 'ur', 'ps', 'sd', 'yi'}

            if is_rtl:
                try:
                    subtitles = ArabicTextProcessor.process_subtitles(subtitles, detected_lang)
                    yield f"data: {json_module.dumps({'type': 'status', 'message': 'Processing RTL text...', 'progress': 99})}\n\n"
                except Exception as rtl_err:
                    print(f"RTL processing warning: {rtl_err}")

            # Send final result
            yield f"data: {json_module.dumps({'type': 'complete', 'progress': 100, 'language': result['language'], 'duration': result['duration'], 'subtitles': subtitles, 'is_rtl': is_rtl})}\n\n"

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield f"data: {json_module.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    )


# =============================================================================
# Translation
# =============================================================================

@api.route("/translate", methods=["POST"])
def translate():
    """Translate subtitles to another language"""
    data = request.json
    subtitles = data.get("subtitles")
    from_code = data.get("from_code")
    to_code = data.get("to_code")
    
    if not subtitles or not from_code or not to_code:
        return jsonify({"error": "subtitles, from_code, and to_code required"}), 400
    
    try:
        service = get_translation_service()
        translated = service.translate_subtitles(
            subtitles,
            from_code,
            to_code
        )
        
        # Apply Arabic processing if needed
        if ArabicTextProcessor.is_rtl_language(to_code):
            translated = ArabicTextProcessor.process_subtitles(translated, to_code)
        
        return jsonify({
            "success": True,
            "subtitles": translated
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# Secondary Subtitle Translation (Dual Language Support)
# =============================================================================

@api.route("/translate/secondary", methods=["POST"])
def translate_secondary():
    """Translate subtitles for secondary language display"""
    from services.translation_service import get_translation_service as get_text_translator
    from services.qwen_translation import get_qwen_service
    
    data = request.json
    subtitles = data.get("subtitles", [])
    target_lang = data.get("target_lang", "en")
    source_lang = data.get("source_lang", "auto")
    provider = data.get("provider", "online")
    
    if not subtitles:
        return jsonify({"error": "subtitles required"}), 400
    
    try:
        if provider == "qwen":
            translator = get_qwen_service()
        else:
            translator = get_text_translator()
        translated = translator.translate_subtitles(subtitles, target_lang, source_lang)
        
        # Apply RTL processing if needed
        if ArabicTextProcessor.is_rtl_language(target_lang):
            for sub in translated:
                if sub.get('translatedText'):
                    processed = ArabicTextProcessor.process_text(sub['translatedText'], target_lang)
                    sub['translatedText'] = processed
        
        return jsonify({
            "success": True,
            "subtitles": translated,
            "target_lang": target_lang
        })
    except Exception as e:
        print(f"[Translation] Error: {e}")
        return jsonify({"error": str(e)}), 500


@api.route("/translate/single", methods=["POST"])
def translate_single():
    """Translate a single text"""
    from services.translation_service import get_translation_service as get_text_translator
    from services.qwen_translation import get_qwen_service
    
    data = request.json
    text = data.get("text", "")
    target_lang = data.get("target_lang", "en")
    source_lang = data.get("source_lang", "auto")
    provider = data.get("provider", "online")
    
    if not text:
        return jsonify({"error": "text required"}), 400
    
    try:
        if provider == "qwen":
            translator = get_qwen_service()
        else:
            translator = get_text_translator()
        result = translator.translate_text(text, target_lang, source_lang)
        
        # Apply RTL processing if needed
        if result.get('success') and ArabicTextProcessor.is_rtl_language(target_lang):
            result['translated'] = ArabicTextProcessor.process_text(result['translated'], target_lang)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@api.route("/translate/languages", methods=["GET"])
def get_translation_languages():
    """Get supported translation languages"""
    from services.translation_service import get_translation_service as get_text_translator
    
    try:
        translator = get_text_translator()
        languages = translator.get_supported_languages()
        return jsonify({
            "success": True,
            "languages": languages
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# Subtitle Generation
# =============================================================================

@api.route("/subtitles/generate", methods=["POST"])
def generate_subtitles():
    """Generate ASS/SRT subtitle file from subtitle data"""
    data = request.json
    subtitles = data.get("subtitles")
    format = data.get("format", "ass")  # ass or srt
    style = data.get("style", {})
    animation = data.get("animation", {})
    video_format = data.get("video_format", "horizontal")
    secondary_subtitle = data.get("secondary_subtitle")

    if not subtitles:
        return jsonify({"error": "subtitles data required"}), 400

    try:
        engine = get_subtitle_engine()
        
        # Create SubtitleStyle object
        style_obj = SubtitleStyle(
            font_name=style.get("fontName", "Arial"),
            font_size=style.get("fontSize", 24),
            primary_color=style.get("primaryColor", "&H00FFFFFF"),
            secondary_color=style.get("secondaryColor", "&H000000FF"),
            outline_color=style.get("outlineColor", "&H00000000"),
            back_color=style.get("backColor", "&H80000000"),
            bold=style.get("bold", False),
            italic=style.get("italic", False),
            underline=style.get("underline", False),
            strikeout=style.get("strikeout", False),
            spacing=style.get("spacing", 0),
            angle=style.get("angle", 0),
            border_style=style.get("borderStyle", 1),
            outline=style.get("outline", 1),
            shadow=style.get("shadow", 1),
            alignment=style.get("alignment", 2),
            margin_l=style.get("marginL", 10),
            margin_r=style.get("marginR", 10),
            margin_v=style.get("marginV", 10),
            encoding=style.get("encoding", 1),
            karaoke_style=style.get("karaokeStyle", "fill"),
            karaoke_color=style.get("karaokeColor", "&H0000FF00"),
            blur=style.get("blur", 0),
            text_opacity=style.get("textOpacity", 1.0),
            border_opacity=style.get("borderOpacity", 1.0),
            background_opacity=style.get("backgroundOpacity", 0.5),
            shadow_opacity=style.get("shadowOpacity", 0.5),
            shadow_x=style.get("shadowX", 1),
            shadow_y=style.get("shadowY", 1),
            font_family_override=style.get("fontFamilyOverride"),
        )
        
        # Create AnimationConfig object
        anim_config = AnimationConfig(
            mode=animation.get("mode", "none"),
            scope=animation.get("scope", "line"),
            style=animation.get("style", "fade"),
            speed=animation.get("speed", 200),
            delay=animation.get("delay", 50),
            color_mode=animation.get("colorMode", "custom"),
            start_color=animation.get("startColor"),
            end_color=animation.get("endColor"),
            mid_color=animation.get("midColor"),
            gradient_angle=animation.get("gradientAngle", 0),
            use_sub_timing=animation.get("useSubTiming", True),
        )

        if format.lower() == "ass":
            content = engine.generate_ass(
                subtitles,
                style_obj,
                video_format,
                anim_config,
                secondary_subtitle
            )
            mimetype = "text/plain"
            filename = "subtitles.ass"
        elif format.lower() == "srt":
            content = engine.generate_srt(subtitles)
            mimetype = "application/x-subrip"
            filename = "subtitles.srt"
        else:
            return jsonify({"error": "Unsupported format"}), 400

        return Response(
            content,
            mimetype=mimetype,
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# =============================================================================
# Video Generation
# =============================================================================

@api.route("/video/generate", methods=["POST"])
def generate_video():
    """Generate video from audio with background"""
    data = request.json
    audio_path = data.get("audio_path")
    background_type = data.get("background_type", "color")  # color, image, transparent
    background_value = data.get("background_value", "#000000")
    video_format = data.get("video_format", "horizontal")  # horizontal, vertical, square
    output_format = data.get("output_format", "mp4")  # mp4, webm, mov
    quality = data.get("quality", "high")
    
    if not audio_path:
        return jsonify({"error": "audio_path required"}), 400
    
    if not os.path.exists(audio_path):
        return jsonify({"error": "Audio file not found"}), 404
    
    try:
        generator = get_video_generator()
        result = generator.generate_video(
            audio_path=audio_path,
            background_type=background_type,
            background_value=background_value,
            format_type=video_format,
            output_format=output_format,
            quality=quality
        )
        
        return jsonify({
            "success": True,
            **result
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# Full Render Pipeline (Async)
# =============================================================================

# Active render jobs storage
_render_jobs = {}

import threading
import time

# RTL (Right-to-Left) language codes
RTL_LANGUAGES = {'ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd', 'ug'}

def detect_rtl_from_subtitles(subtitles):
    """Detect if subtitles contain RTL text"""
    import re
    # Arabic, Hebrew, Persian character ranges
    rtl_pattern = re.compile(r'[\u0600-\u06FF\u0590-\u05FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]')
    
    for sub in subtitles[:5]:  # Check first 5 subtitles
        text = sub.get("text", "") if isinstance(sub, dict) else str(sub)
        if rtl_pattern.search(text):
            return True
    return False

def run_render_job(job_id, audio_path, subtitles, background, video_format,
                   output_format, quality, style, animation, source_language=None, logo=None, logos=None, secondary_subtitle=None, visualizer=None, audio_mixer=None, original_name=None, render_resolution=None, output_dir=None, is_karaoke=False):
    """Background render job"""
    global _render_jobs

    print(f"[Render Job {job_id}] Starting...")
    print(f"[Render Job {job_id}] Logos count: {len(logos) if logos else 0}")
    print(f"[Render Job {job_id}] Secondary subtitle enabled: {secondary_subtitle is not None}")
    print(f"[Render Job {job_id}] Audio mixer: {audio_mixer is not None}")

    mixed_audio_path = None  # temp file for multi-track mix
    original_audio_path = audio_path  # preserve original path before mixer may replace it

    try:
        _render_jobs[job_id] = {
            "status": "processing",
            "progress": 5,
            "step": "Generating subtitle file...",
            "error": None,
            "output_path": None,
        }
        
        # Step 1: Generate subtitle file
        print(f"[Render Job {job_id}] Getting subtitle engine...")
        # Create fresh engine for each render to avoid cached styles
        engine = SubtitleEngine()
        # Use FIXED 1080p-based PlayRes as a reference coordinate system.
        # ASS with ScaledBorderAndShadow: yes auto-scales to actual video resolution.
        # This keeps font sizes consistent with what the user sees in preview.
        PLAYRES_REF = {
            'horizontal': (1920, 1080),
            'vertical': (1080, 1920),
            'square': (1080, 1080),
        }
        ref_w, ref_h = PLAYRES_REF.get(video_format, (1920, 1080))
        engine.set_resolution(ref_w, ref_h)
        print(f"[Render Job {job_id}] Subtitle PlayRes set to fixed reference: {ref_w}x{ref_h} (video will be scaled by ASS)")
        
        _render_jobs[job_id]["progress"] = 10
        _render_jobs[job_id]["step"] = "Applying style settings..."
        
        # Log all style settings
        print(f"[Render Job {job_id}] Full style settings received: {style}")
        print(f"[Render Job {job_id}] Full animation settings received: {animation}")
        
        sub_style = SubtitleStyle(
            font_name=style.get("fontName", style.get("font_name", "Arial")),
            font_size=int(style.get("fontSize", style.get("font_size", 48))),
            primary_color=style.get("color", "#FFFFFF"),
            border_color=style.get("borderColor", style.get("border_color", "#000000")),
            border_width=float(style.get("borderWidth", style.get("border_width", 2))),
            shadow_depth=float(style.get("shadowDepth", style.get("shadow_depth", 1))),
            bold=bool(style.get("bold", False)),
            italic=bool(style.get("italic", False)),
            alignment=int(style.get("alignment", 2)),
            margin_vertical=int(style.get("marginVertical", style.get("margin_vertical", 50))),
            offset_x=int(style.get("offsetX", 0)),
            offset_y=int(style.get("offsetY", 0))
        )
        
        print(f"[Render Job {job_id}] Created SubtitleStyle: font={sub_style.font_name}, size={sub_style.font_size}, color={sub_style.primary_color}, border={sub_style.border_color}, align={sub_style.alignment}")
        
        _render_jobs[job_id]["progress"] = 15
        _render_jobs[job_id]["step"] = "Applying animation settings..."
        
        # Detect RTL language from subtitles or source language
        is_rtl = source_language in RTL_LANGUAGES or detect_rtl_from_subtitles(subtitles)
        if is_rtl:
            print(f"[Render Job {job_id}] RTL language detected - karaoke will animate right-to-left")
        
        # Animation config with highlight color for karaoke and RTL support
        anim_config = AnimationConfig(
            type=animation.get("type", "none"),
            fade_in=animation.get("fadeIn", animation.get("fade_in", 200)),
            fade_out=animation.get("fadeOut", animation.get("fade_out", 200)),
            karaoke_type=animation.get("karaokeType", animation.get("karaoke_type", "sweep")),
            highlight_color=animation.get("highlightColor", animation.get("highlight_color", "#FFFF00")),
            rtl=is_rtl
        )
        
        _render_jobs[job_id]["progress"] = 20
        _render_jobs[job_id]["step"] = "Generating ASS subtitle file..."
        
        subtitle_path = str(TEMP_DIR / f"render_{job_id}.ass")
        print(f"[Render Job {job_id}] Saving ASS to: {subtitle_path}")
        
        # Check if dual subtitle is enabled
        if secondary_subtitle and secondary_subtitle.get('enabled') and secondary_subtitle.get('subtitles'):
            print(f"[Render Job {job_id}] Creating dual subtitle ASS file...")
            
            # Create secondary style
            sec_style_data = secondary_subtitle.get('style', {})
            secondary_style = SubtitleStyle(
                name="Secondary",
                font_name=sec_style_data.get("fontName", "Arial"),
                font_size=int(sec_style_data.get("fontSize", 36)),
                primary_color=sec_style_data.get("color", "#FFFF00"),
                border_color=sec_style_data.get("borderColor", "#000000"),
                border_width=float(sec_style_data.get("borderWidth", 2)),
                shadow_depth=float(sec_style_data.get("shadowDepth", 1)),
                bold=bool(sec_style_data.get("bold", False)),
                italic=bool(sec_style_data.get("italic", False)),
                alignment=int(sec_style_data.get("alignment", 2)),
                margin_vertical=int(sec_style_data.get("marginVertical", 120)),
                offset_x=int(sec_style_data.get("offsetX", 0)),
                offset_y=int(sec_style_data.get("offsetY", 0))
            )
            
            engine.save_ass_dual(
                primary_subtitles=subtitles,
                secondary_subtitles=secondary_subtitle.get('subtitles', []),
                output_path=subtitle_path,
                primary_style=sub_style,
                secondary_style=secondary_style,
                animation=anim_config
            )
        else:
            engine.save_ass(subtitles, subtitle_path, sub_style, anim_config)
        
        # DEBUG: Log ASS file header to verify PlayRes and style values
        try:
            with open(subtitle_path, 'r', encoding='utf-8') as f:
                ass_header = f.read(1500)
            print(f"[Render Job {job_id}] ASS FILE HEADER:\n{ass_header[:1500]}")
        except Exception as e:
            print(f"[Render Job {job_id}] Could not read ASS file: {e}")
        
        _render_jobs[job_id]["progress"] = 25
        _render_jobs[job_id]["step"] = "Preparing audio..."

        # Step 1.5: Mix audio tracks if mixer config provided
        if audio_mixer and audio_mixer.get("useMixer") and audio_mixer.get("tracks"):
            tracks = audio_mixer["tracks"]
            print(f"[Render Job {job_id}] Mixing {len(tracks)} audio tracks...")

            # Validate all track files exist
            for t in tracks:
                if not os.path.exists(t["path"]):
                    raise FileNotFoundError(f"Mixer track not found: {t['path']}")

            mixed_audio_path = str(TEMP_DIR / f"mix_{job_id}.wav")

            if len(tracks) == 1:
                # Single track — just apply volume
                t = tracks[0]
                mix_cmd = [
                    "ffmpeg", "-y", "-i", t["path"],
                    "-af", f"volume={t['volume']}",
                    "-ar", "44100", "-ac", "2",
                    mixed_audio_path
                ]
            else:
                # Multi-track amix
                mix_cmd = ["ffmpeg", "-y"]
                for t in tracks:
                    mix_cmd.extend(["-i", t["path"]])

                filters = []
                for i, t in enumerate(tracks):
                    filters.append(f"[{i}]volume={t['volume']}[a{i}]")
                mix_inputs = "".join(f"[a{i}]" for i in range(len(tracks)))
                filters.append(f"{mix_inputs}amix=inputs={len(tracks)}:duration=longest:normalize=0[out]")

                mix_cmd.extend(["-filter_complex", ";".join(filters)])
                mix_cmd.extend(["-map", "[out]", "-ar", "44100", "-ac", "2", mixed_audio_path])

            print(f"[Render Job {job_id}] FFmpeg mix command: {' '.join(mix_cmd)}")
            import subprocess as sp
            mix_result = sp.run(mix_cmd, capture_output=True, text=True)
            if mix_result.returncode != 0:
                raise RuntimeError(f"Audio mix failed: {mix_result.stderr[-500:]}")

            audio_path = mixed_audio_path
            print(f"[Render Job {job_id}] Mixed audio saved to: {mixed_audio_path}")

        _render_jobs[job_id]["progress"] = 30
        _render_jobs[job_id]["step"] = "Generating video..."

        # Step 2: Generate video with subtitles
        print(f"[Render Job {job_id}] Getting video generator...")
        generator = get_video_generator()
        
        # Progress callback for video generation
        def progress_callback(progress, step=""):
            # Scale 30-95 for video generation
            scaled = 30 + int(progress * 0.65)
            _render_jobs[job_id]["progress"] = min(95, scaled)
            if step:
                _render_jobs[job_id]["step"] = step
                print(f"[Render Job {job_id}] Progress: {min(95, scaled)}% - {step}")

        # Cancel check callback — generator will kill FFmpeg if this returns True
        def cancel_check():
            return _render_jobs.get(job_id, {}).get("status") == "cancelled"
        
        bg_type = background.get('type') if isinstance(background, dict) else background
        print(f"[Render Job {job_id}] Generating video: audio={audio_path}, bg={bg_type}, logos={len(logos) if logos else 0}")

        # Visualizer video path (pre-rendered by frontend)
        visualizer_video_path = None
        if visualizer and isinstance(visualizer, dict):
            visualizer_video_path = visualizer.get("videoPath")
        _render_jobs[job_id]["visualizer_video_path"] = visualizer_video_path

        # -----------------------------------------------------------
        # Determine output filename and directory
        # Priority: original_name > audio filename
        # -----------------------------------------------------------
        # 1) Stem name — always prefer original_name when provided
        if original_name:
            source_stem = Path(original_name).stem
        else:
            source_stem = Path(original_audio_path).stem

        # 2) Output directory
        if output_dir:
            source_dir = output_dir
        elif str(TEMP_DIR).lower() in str(Path(original_audio_path).resolve()).lower():
            source_dir = str(OUTPUT_DIR)
        else:
            source_dir = os.path.dirname(original_audio_path)

        os.makedirs(source_dir, exist_ok=True)

        # 3) Build filename: {name}-{format}[-krk].{ext}
        krk_suffix = "-krk" if is_karaoke else ""
        render_output_path = os.path.join(source_dir, f"{source_stem}-{video_format}{krk_suffix}.{output_format}")
        print(f"[Render Job {job_id}] Output path: {render_output_path}")
        print(f"[Render Job {job_id}] Audio: {audio_path} (exists={os.path.exists(audio_path)})")
        print(f"[Render Job {job_id}] Subtitle: {subtitle_path} (exists={os.path.exists(subtitle_path)})")
        if visualizer_video_path:
            print(f"[Render Job {job_id}] Visualizer: {visualizer_video_path} (exists={os.path.exists(str(visualizer_video_path))})")

        result = generator.generate_video_with_subtitles(
            audio_path=audio_path,
            subtitle_path=subtitle_path,
            output_path=render_output_path,
            background_type=background.get("type", "color"),
            background_value=background.get("value", "#000000"),
            background_image=background.get("imagePath"),
            format_type=video_format,
            output_format=output_format,
            quality=quality,
            logo=logo,
            logos=logos,
            progress_callback=progress_callback,
            visualizer_video_path=visualizer_video_path,
            visualizer_opacity=visualizer.get("opacity", 0.8) if visualizer else 0.8,
            cancel_check=cancel_check,
            resolution=render_resolution,
        )

        _render_jobs[job_id]["progress"] = 98
        _render_jobs[job_id]["step"] = "Final checks..."
        
        # Clean up temp files
        try:
            os.remove(subtitle_path)
        except:
            pass
        if mixed_audio_path:
            try:
                os.remove(mixed_audio_path)
            except:
                pass
        _viz = _render_jobs[job_id].get("visualizer_video_path")
        if _viz:
            try:
                if os.path.exists(_viz):
                    os.remove(_viz)
            except Exception:
                pass
        # Note: vocal_cache files are NOT deleted here — they may be
        # needed by subsequent format renders within the same batch.
        # Cleanup happens via /temp/cleanup or on next startup.

        _render_jobs[job_id]["progress"] = 100
        _render_jobs[job_id]["status"] = "completed"
        _render_jobs[job_id]["step"] = "Completed!"
        _render_jobs[job_id]["output_path"] = result.get("output_path")
        _render_jobs[job_id]["result"] = result
        
        print(f"[Render Job {job_id}] Completed! Output: {result.get('output_path')}")
        
    except Exception as e:
        import traceback
        print(f"[Render Job {job_id}] ERROR: {str(e)}")
        traceback.print_exc()
        # Don't overwrite cancelled status
        if _render_jobs[job_id]["status"] != "cancelled":
            _render_jobs[job_id]["status"] = "error"
            _render_jobs[job_id]["error"] = str(e)
            _render_jobs[job_id]["step"] = f"Error: {str(e)}"
        else:
            _render_jobs[job_id]["step"] = "Cancelled"
        # Cleanup job-specific temp files on cancel / error
        for _tmp in [
            str(TEMP_DIR / f"render_{job_id}.ass"),
            str(TEMP_DIR / f"mix_{job_id}.wav"),
        ]:
            try:
                if os.path.exists(_tmp):
                    os.remove(_tmp)
            except Exception:
                pass
        _viz = _render_jobs[job_id].get("visualizer_video_path")
        if _viz:
            try:
                if os.path.exists(_viz):
                    os.remove(_viz)
            except Exception:
                pass
        if VOCAL_CACHE_DIR.exists():
            for _vcf in list(VOCAL_CACHE_DIR.iterdir()):
                if _vcf.is_file():
                    try:
                        _vcf.unlink()
                    except Exception:
                        pass


@api.route("/render", methods=["POST"])
def render_video():
    """
    Start async render job
    Returns job_id for progress tracking
    """
    try:
        try:
            data = request.json
        except Exception as json_err:
            print(f"[Render] ❌ JSON parse error: {json_err}")
            return jsonify({"error": f"Invalid JSON body: {json_err}"}), 400
        
        if not data:
            return jsonify({"error": "No JSON data received"}), 400
        
        print(f"[Render] Request body size: {request.content_length} bytes")
        
        # Required fields
        audio_path = data.get("audio_path")
        subtitles = data.get("subtitles")
        
        print(f"[Render] Received request: audio_path={audio_path}, subtitles_count={len(subtitles) if isinstance(subtitles, list) else 'N/A'}")
        
        try:
            if isinstance(subtitles, list) and len(subtitles) > 0 and isinstance(subtitles[0], dict):
                has_words = subtitles[0].get('words') is not None
                print(f"🔍 DEBUG: Subtitle has words? {has_words}")
                if has_words:
                    print(f"🔍 DEBUG: Words count = {len(subtitles[0]['words'])}")
                else:
                    print(f"❌ DEBUG: NO WORDS DATA - Karaoke won't work!")
            else:
                print(f"⚠️ DEBUG: subtitles type={type(subtitles).__name__}, unexpected format")
        except Exception as dbg_err:
            print(f"⚠️ DEBUG: Error inspecting subtitles: {dbg_err}")
        
        if not audio_path or not subtitles:
            return jsonify({"error": "audio_path and subtitles required"}), 400
        
        if not os.path.exists(audio_path):
            print(f"[Render] Audio file not found: {audio_path}")
            return jsonify({"error": f"Audio file not found: {audio_path}"}), 404
        
        # Create job
        job_id = uuid.uuid4().hex[:12]
        
        # Optional fields with defaults
        background = data.get("background", {"type": "color", "value": "#000000"})
        video_format = data.get("video_format", "horizontal")
        output_format = data.get("output_format", "mp4")
        quality = data.get("quality", "high")
        style = data.get("style", {})
        animation = data.get("animation", {})
        source_language = data.get("source_language")  # For RTL detection
        
        # Logo settings - support both single 'logo' and multiple 'logos'
        logos = data.get("logos")  # New: array of logos
        logo = data.get("logo")  # Legacy: single logo
        
        # Secondary subtitle (dual language) settings
        secondary_subtitle = data.get("secondarySubtitle")

        # Visualizer settings
        visualizer = data.get("visualizer")

        # Audio mixer settings (multi-track stem mixing)
        audio_mixer = data.get("audio_mixer")

        # Original filename for correct output naming when source is temp
        original_name = data.get("original_name")

        # Output resolution preset (1k/2k/4k)
        render_resolution = data.get("render_resolution")

        # Custom output directory (e.g. for batch karaoke render to original file location)
        output_dir = data.get("output_dir")

        # Karaoke flag — appends -krk suffix to output filename
        is_karaoke = data.get("is_karaoke", False)

        print(f"[Render] Starting job {job_id}: format={video_format}, output={output_format}, quality={quality}, resolution={render_resolution}, lang={source_language}, logos={len(logos) if logos else 0}, dual_sub={secondary_subtitle is not None}, visualizer={visualizer is not None}, mixer={audio_mixer is not None}, output_dir={output_dir}, karaoke={is_karaoke}")

        # Start background thread
        thread = threading.Thread(
            target=run_render_job,
            args=(job_id, audio_path, subtitles, background, video_format,
                  output_format, quality, style, animation, source_language, logo, logos, secondary_subtitle, visualizer, audio_mixer, original_name, render_resolution, output_dir, is_karaoke)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            "success": True,
            "job_id": job_id,
            "message": "Video rendering job started"
        })
        
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[Render] ❌ 500 ERROR in render_video: {e}\n{tb}")
        return jsonify({"error": str(e), "traceback": tb}), 500


@api.route("/render/status/<job_id>", methods=["GET"])
def get_render_status(job_id):
    """Get render job status"""
    if job_id not in _render_jobs:
        return jsonify({"error": "Job not found"}), 404
    
    job = _render_jobs[job_id]
    return jsonify({
        "job_id": job_id,
        "status": job["status"],
        "progress": job["progress"],
        "step": job["step"],
        "error": job["error"],
        "output_path": job["output_path"],
    })


@api.route("/render/cancel/<job_id>", methods=["POST"])
def cancel_render(job_id):
    """Cancel a render job (best effort)"""
    if job_id in _render_jobs:
        _render_jobs[job_id]["status"] = "cancelled"
        return jsonify({"success": True})
    return jsonify({"error": "Job not found"}), 404


# =============================================================================
# File Download
# =============================================================================

@api.route("/download/<path:filename>", methods=["GET"])
def download_file(filename):
    """Download a generated file"""
    # Check in output directory
    output_path = OUTPUT_DIR / filename
    if output_path.exists():
        return send_file(str(output_path), as_attachment=True)
    
    # Check in temp directory
    temp_path = TEMP_DIR / filename
    if temp_path.exists():
        return send_file(str(temp_path), as_attachment=True)
    
    return jsonify({"error": "File not found"}), 404



# =============================================================================
# Fonts
# =============================================================================

@api.route("/fonts", methods=["GET"])
def get_fonts():
    """Get available fonts"""
    fonts = []
    
    if FONTS_DIR.exists():
        for font_file in FONTS_DIR.glob("*.ttf"):
            fonts.append({
                "name": font_file.stem,
                "path": str(font_file)
            })
        for font_file in FONTS_DIR.glob("*.otf"):
            fonts.append({
                "name": font_file.stem,
                "path": str(font_file)
            })
    
    # Add common system fonts
    system_fonts = [
        "Arial", "Helvetica", "Times New Roman", "Georgia",
        "Verdana", "Tahoma", "Trebuchet MS", "Impact"
    ]
    
    for font in system_fonts:
        fonts.append({"name": font, "path": None, "system": True})
    
    return jsonify({"fonts": fonts})


# =============================================================================
# Folder Operations
# =============================================================================

# =============================================================================
# Visualizer Presets (folder-based)
# =============================================================================

@api.route("/presets/list", methods=["GET"])
def list_presets():
    """List all available visualizer preset names from resources/presets/ folder"""
    try:
        if not PRESETS_DIR.exists():
            return jsonify({"presets": [], "count": 0})

        presets = sorted([
            f.stem for f in PRESETS_DIR.iterdir()
            if f.suffix == '.json' and f.is_file()
        ])
        return jsonify({"presets": presets, "count": len(presets)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route("/presets/load/<path:name>", methods=["GET"])
def load_preset(name):
    """Load a single preset JSON by name"""
    try:
        preset_path = PRESETS_DIR / f"{name}.json"
        if not preset_path.exists():
            return jsonify({"error": f"Preset not found: {name}"}), 404
        # Ensure path is within PRESETS_DIR (path traversal prevention)
        if not preset_path.resolve().is_relative_to(PRESETS_DIR.resolve()):
            return jsonify({"error": "Invalid preset path"}), 400
        return send_file(str(preset_path), mimetype='application/json')
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route("/presets/load-batch", methods=["POST"])
def load_presets_batch():
    """Load multiple presets at once. Body: { "names": ["preset1", "preset2", ...] }"""
    try:
        data = request.json
        names = data.get("names", [])
        result = {}
        for name in names:
            preset_path = PRESETS_DIR / f"{name}.json"
            if preset_path.exists() and preset_path.resolve().is_relative_to(PRESETS_DIR.resolve()):
                with open(preset_path, 'r') as f:
                    result[name] = json.load(f)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route("/presets/delete/<path:name>", methods=["DELETE"])
def delete_preset(name):
    """Delete a preset by name"""
    try:
        preset_path = PRESETS_DIR / f"{name}.json"
        if not preset_path.exists():
            return jsonify({"error": f"Preset not found: {name}"}), 404
        if not preset_path.resolve().is_relative_to(PRESETS_DIR.resolve()):
            return jsonify({"error": "Invalid preset path"}), 400
        preset_path.unlink()
        return jsonify({"success": True, "deleted": name})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Batch Processing ─────────────────────────────────────────────────

@api.route("/batch/validate-files", methods=["POST"])
def batch_validate_files():
    """Validate multiple file paths and return metadata for each."""
    data = request.json or {}
    paths = data.get("paths", [])
    if not isinstance(paths, list) or not paths:
        return jsonify({"error": "paths array required"}), 400

    AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"}
    VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".mov", ".webm"}
    results = []

    for fp in paths:
        if not fp or not isinstance(fp, str) or not os.path.isabs(fp):
            results.append({"path": fp, "valid": False, "error": "Invalid path"})
            continue
        if not os.path.exists(fp):
            results.append({"path": fp, "valid": False, "error": "File not found"})
            continue

        ext = os.path.splitext(fp)[1].lower()
        if ext not in AUDIO_EXTS and ext not in VIDEO_EXTS:
            results.append({"path": fp, "valid": False, "error": f"Unsupported format: {ext}"})
            continue

        file_type = "audio" if ext in AUDIO_EXTS else "video"
        name = os.path.basename(fp)
        duration = 0

        try:
            import subprocess
            probe = subprocess.run(
                ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", fp],
                capture_output=True, text=True, timeout=10,
            )
            if probe.returncode == 0:
                import json as _json
                info = _json.loads(probe.stdout)
                duration = float(info.get("format", {}).get("duration", 0))
        except Exception:
            pass

        results.append({
            "path": fp,
            "valid": True,
            "name": name,
            "type": file_type,
            "duration": round(duration, 2),
        })

    return jsonify({"files": results, "total": len(results), "valid": sum(1 for r in results if r.get("valid"))})


@api.route("/batch/pick-files", methods=["POST"])
def batch_pick_files():
    """Open a native multi-file dialog and return selected absolute paths."""
    from services.file_dialog import open_multi_file_dialog

    paths = open_multi_file_dialog(
        file_type="media",
        title="Select media files for batch processing",
    )

    return jsonify({"paths": paths, "count": len(paths)})


@api.route("/open-folder", methods=["GET"])
def open_folder():
    """Open folder in system file explorer"""
    import subprocess
    import platform
    
    folder_path = request.args.get('path', str(OUTPUT_DIR))
    
    try:
        # Create folder if it doesn't exist
        if not os.path.exists(folder_path):
            os.makedirs(folder_path, exist_ok=True)
        
        # Open based on operating system
        system = platform.system()
        if system == 'Windows':
            subprocess.Popen(['explorer', folder_path])
        elif system == 'Darwin':  # macOS
            subprocess.Popen(['open', folder_path])
        else:  # Linux
            subprocess.Popen(['xdg-open', folder_path])
        
        return jsonify({"success": True, "path": folder_path})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# Suno Lyrics Parser
# =============================================================================

@api.route("/parse-lyrics", methods=["POST"])
def parse_lyrics():
    """
    Parse Suno format lyrics into subtitle segments with timing
    
    Request body:
    {
        "lyrics": "string",  # Raw lyrics text
        "duration": float    # Target total duration (optional)
    }
    """
    try:
        data = request.get_json()
        lyrics_text = data.get('lyrics', '')
        total_duration = data.get('duration')
        
        if not lyrics_text:
            return jsonify({"error": "Lyrics text is required"}), 400
        
        # Parse lyrics
        parsed_subtitles = parse_suno_lyrics(lyrics_text, total_duration)
        
        return jsonify({
            "success": True,
            "subtitles": parsed_subtitles,
            "count": len(parsed_subtitles),
            "total_duration": max([sub['end'] for sub in parsed_subtitles]) if parsed_subtitles else 0
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route("/parse-lyrics/preview", methods=["POST"])
def preview_lyrics():
    """
    Return preview of Suno lyrics without timing calculations
    """
    try:
        data = request.get_json()
        lyrics_text = data.get('lyrics', '')
        
        if not lyrics_text:
            return jsonify({"error": "Lyrics text is required"}), 400
            
        # Parse without timing adjustment
        parsed_subtitles = parse_suno_lyrics(lyrics_text)
        
        # Summary information
        preview_info = {
            "line_count": len(parsed_subtitles),
            "estimated_duration": max([sub['end'] for sub in parsed_subtitles]) if parsed_subtitles else 0,
            "types": list(set([sub.get('type', 'unknown') for sub in parsed_subtitles])),
            "languages": list(set([sub.get('metadata', {}).get('language', 'unknown') for sub in parsed_subtitles])),
            "has_citations": any(sub.get('type') == 'citation' for sub in parsed_subtitles),
            "has_sections": any(sub.get('type') == 'section' for sub in parsed_subtitles)
        }
        
        return jsonify({
            "success": True,
            "preview": preview_info,
            "sample_subtitles": parsed_subtitles[:5]  # First 5 samples
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# Lyrics Export
# =============================================================================

@api.route("/export/lyrics", methods=["POST"])
def export_lyrics():
    """Export subtitles to various formats (LRC, ID3, etc.)"""
    data = request.json
    subtitles = data.get("subtitles")
    format_type = data.get("format")
    source_file_path = data.get("source_path") # The original media file path
    language = data.get("language", "en")
    original_name = data.get("original_name")  # Original filename before temp upload

    if not all([subtitles, format_type, source_file_path]):
        return jsonify({"error": "subtitles, format, and source_path are required"}), 400

    # Security check: ensure the source path is a real, absolute file
    if not os.path.isabs(source_file_path) or not os.path.exists(source_file_path):
        return jsonify({"error": f"Source file not found: {source_file_path}"}), 404

    try:
        engine = get_subtitle_engine()
        job_id = uuid.uuid4().hex[:8]
        output_path = None

        # Derive output directory from source file location
        source_dir = os.path.dirname(source_file_path)
        source_stem = Path(source_file_path).stem

        # If source is in temp dir, redirect output to OUTPUT_DIR with original filename
        if str(TEMP_DIR) in str(Path(source_file_path).resolve()):
            source_dir = str(OUTPUT_DIR)
            if original_name:
                source_stem = Path(original_name).stem

        if format_type == "lrc":
            output_path = os.path.join(source_dir, f"{source_stem}.lrc")
            engine.save_lrc(subtitles, output_path)
        elif format_type == "enhanced_lrc":
            output_path = os.path.join(source_dir, f"{source_stem}_enhanced.lrc")
            engine.save_enhanced_lrc(subtitles, output_path)
        elif format_type == "word_json":
            output_path = os.path.join(source_dir, f"{source_stem}.json")
            engine.save_word_level_json(subtitles, output_path)
        elif format_type == "id3":
            if not source_file_path.lower().endswith(".mp3"):
                return jsonify({"error": "ID3 tags can only be written to MP3 files"}), 400

            from services.lyrics_tagger import get_lyrics_tagger
            tagger = get_lyrics_tagger()
            if not tagger.is_available():
                return jsonify({"error": "mutagen library not installed"}), 500

            # Determine the target file for SYLT embed
            is_temp = str(TEMP_DIR) in str(Path(source_file_path).resolve())

            if is_temp:
                # Source is a temp upload — copy to OUTPUT_DIR with original name, then embed
                target_name = original_name if original_name else (source_stem + ".mp3")
                target_name = target_name.replace('/', '_').replace('\\', '_').replace(':', '_')
                target_file = os.path.join(str(OUTPUT_DIR), target_name)
                import shutil
                shutil.copy2(source_file_path, target_file)
                print(f"[Export ID3] Temp source → copied to: {target_file}")
            else:
                # Source is the REAL original file — embed directly into it
                target_file = source_file_path
                print(f"[Export ID3] Writing SYLT directly to original: {target_file}")

            result = tagger.write_synced_lyrics(target_file, subtitles, language=language)
            return jsonify({
                "success": True,
                "sylt_written": result.get("sylt", False),
                "uslt_written": result.get("uslt", False),
                "source_file": target_file,
                "source_location": os.path.dirname(target_file),
                "is_original": not is_temp,
                "verification": {
                    "sylt_entries": len(subtitles),
                },
                "message": f"ID3v2.4 SYLT embedded into {'original file' if not is_temp else 'output copy'}"
            })
        else:
            return jsonify({"error": f"Unsupported format: {format_type}"}), 400

        return jsonify({
            "success": True,
            "format": format_type,
            "output_path": output_path
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# =============================================================================
# Karaoke MP3 — instrumental stem + embedded SYLT in one shot
# =============================================================================

@api.route("/export/karaoke-mp3", methods=["POST"])
def export_karaoke_mp3():
    """
    Create a karaoke MP3 from the instrumental stem with SYLT lyrics embedded.
    - Converts instrumental WAV/FLAC → MP3 via ffmpeg (320 kbps)
    - Names the file <original_stem>-krk.mp3 next to the original file
    - Embeds synchronized lyrics (SYLT) using mutagen
    """
    data = request.json
    instrumental_path = data.get("instrumental_path")  # abs path to instrumental WAV/MP3
    subtitles          = data.get("subtitles")          # [{start, end, text}, ...]
    original_path      = data.get("original_path")      # abs path to original media (for naming)
    language           = data.get("language", "und")
    original_name      = data.get("original_name")      # original filename (before temp upload)

    if not instrumental_path or not subtitles or not original_path:
        return jsonify({"error": "instrumental_path, subtitles, and original_path are required"}), 400

    if not os.path.isabs(instrumental_path) or not os.path.exists(instrumental_path):
        return jsonify({"error": f"Instrumental file not found: {instrumental_path}"}), 404

    if not os.path.isabs(original_path) or not os.path.exists(original_path):
        return jsonify({"error": f"Original file not found: {original_path}"}), 404

    try:
        from services.lyrics_tagger import get_lyrics_tagger
        tagger = get_lyrics_tagger()
        if not tagger.is_available():
            return jsonify({"error": "mutagen library not installed — run: pip install mutagen"}), 500

        # Determine output dir and stem name
        source_dir = os.path.dirname(original_path)
        if str(TEMP_DIR) in str(Path(original_path).resolve()):
            source_dir = str(OUTPUT_DIR)

        # Determine stem from original name (prefer original_name over temp path)
        name_base = original_name if original_name else os.path.basename(original_path)
        stem = Path(name_base).stem
        output_path = os.path.join(source_dir, f"{stem}-krk.mp3")

        ext = Path(instrumental_path).suffix.lower()

        if ext == ".mp3":
            # Already MP3 — just copy
            import shutil
            shutil.copy2(instrumental_path, output_path)
        else:
            # Convert to MP3 via ffmpeg (320 kbps CBR)
            ffmpeg_path = str(FFMPEG_PATH) if FFMPEG_PATH else "ffmpeg"
            cmd = [
                ffmpeg_path, "-y",
                "-i", instrumental_path,
                "-codec:a", "libmp3lame",
                "-b:a", "320k",
                "-id3v2_version", "3",
                output_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg conversion failed:\n{result.stderr[-800:]}")

        print(f"[Karaoke MP3] Wrote: {output_path}")

        # Embed SYLT
        embed_result = tagger.write_synced_lyrics(output_path, subtitles, language=language)

        return jsonify({
            "success": True,
            "output_path": output_path,
            "output_dir": os.path.dirname(output_path),
            "filename": os.path.basename(output_path),
            "sylt_written": embed_result.get("sylt", False),
            "uslt_written": embed_result.get("uslt", False),
            "subtitle_count": len(subtitles),
        })

    except Exception as exc:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(exc)}), 500


# =============================================================================
# Vocal MP3 — vocal stem → <name>-vocal.mp3 next to original file
# =============================================================================

@api.route("/export/vocal-mp3", methods=["POST"])
def export_vocal_mp3():
    """
    Create a vocal MP3 from the vocal stem with optional embedded SYLT lyrics.
    - Converts vocal WAV/FLAC → MP3 via ffmpeg (320 kbps)
    - Names the file <original_stem>-vocal.mp3 next to the original file
    - Embeds synchronized lyrics (SYLT) using mutagen
    """
    data = request.json
    vocal_path    = data.get("vocal_path")      # abs path to vocal WAV/MP3
    subtitles     = data.get("subtitles")        # [{start, end, text}, ...]
    original_path = data.get("original_path")    # abs path to original media
    language      = data.get("language", "und")
    original_name = data.get("original_name")    # original filename

    if not vocal_path or not original_path:
        return jsonify({"error": "vocal_path and original_path are required"}), 400

    if not os.path.isabs(vocal_path) or not os.path.exists(vocal_path):
        return jsonify({"error": f"Vocal file not found: {vocal_path}"}), 404

    if not os.path.isabs(original_path) or not os.path.exists(original_path):
        return jsonify({"error": f"Original file not found: {original_path}"}), 404

    try:
        # Determine output dir and stem name
        source_dir = os.path.dirname(original_path)
        if str(TEMP_DIR) in str(Path(original_path).resolve()):
            source_dir = str(OUTPUT_DIR)

        name_base = original_name if original_name else os.path.basename(original_path)
        stem = Path(name_base).stem
        output_path = os.path.join(source_dir, f"{stem}-vocal.mp3")

        ext = Path(vocal_path).suffix.lower()

        if ext == ".mp3":
            import shutil
            shutil.copy2(vocal_path, output_path)
        else:
            ffmpeg_path = str(FFMPEG_PATH) if FFMPEG_PATH else "ffmpeg"
            cmd = [
                ffmpeg_path, "-y",
                "-i", vocal_path,
                "-codec:a", "libmp3lame",
                "-b:a", "320k",
                "-id3v2_version", "3",
                output_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg conversion failed:\n{result.stderr[-800:]}")

        print(f"[Vocal MP3] Wrote: {output_path}")

        # Embed SYLT if subtitles provided
        sylt_written = False
        if subtitles and len(subtitles) > 0:
            from services.lyrics_tagger import get_lyrics_tagger
            tagger = get_lyrics_tagger()
            if tagger.is_available():
                embed_result = tagger.write_synced_lyrics(output_path, subtitles, language=language)
                sylt_written = embed_result.get("sylt", False)

        return jsonify({
            "success": True,
            "output_path": output_path,
            "output_dir": os.path.dirname(output_path),
            "filename": os.path.basename(output_path),
            "sylt_written": sylt_written,
            "subtitle_count": len(subtitles) if subtitles else 0,
        })

    except Exception as exc:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(exc)}), 500


# =============================================================================
# Playlist — SYLT Read API
# =============================================================================

@api.route("/playlist/validate-mp3", methods=["POST"])
def playlist_validate_mp3():
    """Check if an MP3 file has embedded SYLT (synchronized lyrics)"""
    data = request.json
    mp3_path = data.get("path")

    if not mp3_path or not os.path.isabs(mp3_path):
        return jsonify({"error": "Absolute MP3 path required"}), 400

    if not os.path.exists(mp3_path):
        return jsonify({"error": f"File not found: {mp3_path}"}), 404

    if not mp3_path.lower().endswith(".mp3"):
        return jsonify({"error": "Only MP3 files are supported"}), 400

    try:
        from services.lyrics_tagger import get_lyrics_tagger
        tagger = get_lyrics_tagger()
        if not tagger.is_available():
            return jsonify({"error": "mutagen library not installed"}), 500

        sylt_data = tagger.read_sylt(mp3_path)
        has_sylt = sylt_data is not None and len(sylt_data) > 0

        # Get basic MP3 info
        title = Path(mp3_path).stem
        try:
            from mutagen.id3 import ID3
            tags = ID3(mp3_path)
            tit2 = tags.getall("TIT2")
            if tit2:
                title = str(tit2[0])
        except Exception:
            pass

        # Get duration
        duration = 0
        try:
            from mutagen.mp3 import MP3
            audio = MP3(mp3_path)
            duration = audio.info.length
        except Exception:
            pass

        return jsonify({
            "valid": has_sylt,
            "path": mp3_path,
            "title": title,
            "duration": duration,
            "sylt_entries": len(sylt_data) if sylt_data else 0,
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Failed to read MP3: {str(e)}"}), 500


@api.route("/playlist/read-sylt", methods=["POST"])
def playlist_read_sylt():
    """Read SYLT data from MP3 and return as subtitle-format entries"""
    data = request.json
    mp3_path = data.get("path")

    if not mp3_path or not os.path.isabs(mp3_path):
        return jsonify({"error": "Absolute MP3 path required"}), 400

    if not os.path.exists(mp3_path):
        return jsonify({"error": f"File not found: {mp3_path}"}), 404

    from services.lyrics_tagger import get_lyrics_tagger
    tagger = get_lyrics_tagger()
    if not tagger.is_available():
        return jsonify({"error": "mutagen library not installed"}), 500

    sylt_data = tagger.read_sylt(mp3_path)
    if not sylt_data or len(sylt_data) == 0:
        return jsonify({"error": "No SYLT data found in file"}), 404

    # Convert SYLT (text, timestamp_ms) pairs to subtitle format
    subtitles = []
    for i, (text, timestamp_ms) in enumerate(sylt_data):
        clean_text = text.rstrip('\n').strip()
        if not clean_text:
            continue

        start = timestamp_ms / 1000.0  # ms to seconds
        # End time = next entry's start, or start + 3s for the last
        if i + 1 < len(sylt_data):
            end = sylt_data[i + 1][1] / 1000.0
        else:
            end = start + 3.0

        subtitles.append({
            "id": i + 1,
            "text": clean_text,
            "start": round(start, 3),
            "end": round(end, 3),
        })

    return jsonify({
        "success": True,
        "subtitles": subtitles,
        "count": len(subtitles),
    })
