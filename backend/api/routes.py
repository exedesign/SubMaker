"""
SubMaker API Routes
Flask endpoints for transcription, translation, and video rendering
"""
import os
import uuid
import json
import requests
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, Response
from werkzeug.utils import secure_filename
import mimetypes

import sys
sys.path.append(str(Path(__file__).parent.parent))
from config import TEMP_DIR, OUTPUT_DIR, FONTS_DIR, SUPPORTED_LANGUAGES, TENOR_API_KEY, TENOR_CLIENT_KEY, GIPHY_API_KEY
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

# Create Blueprint
api = Blueprint("api", __name__)

# CORS headers for all responses
@api.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# Handle OPTIONS preflight requests
@api.route('/<path:path>', methods=['OPTIONS'])
@api.route('/', methods=['OPTIONS'])
def handle_options(path=''):
    response = jsonify({'status': 'ok'})
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

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


@api.route("/media/output/<path:filename>", methods=["GET"])
def serve_output_media(filename):
    """Serve media files from output directory"""
    file_path = OUTPUT_DIR / filename
    if file_path.exists():
        return send_file(str(file_path))
    return jsonify({"error": "File not found"}), 404


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
    
    if file.filename == "" or file.filename is None:
        return jsonify({"error": "No file selected"}), 400
    
    # Get original filename and extension
    original_filename = file.filename
    
    # Extract extension safely
    if "." in original_filename:
        ext = original_filename.rsplit(".", 1)[1].lower()
    else:
        return jsonify({"error": "File must have an extension"}), 400
    
    # Determine file type
    all_allowed = ALLOWED_AUDIO_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS | ALLOWED_IMAGE_EXTENSIONS
    
    if ext not in all_allowed:
        return jsonify({"error": f"File type '.{ext}' not allowed"}), 400
    
    # Create safe filename with original extension
    safe_filename = f"{uuid.uuid4().hex}.{ext}"
    file_path = TEMP_DIR / safe_filename
    file.save(str(file_path))
    
    # Determine type
    if ext in ALLOWED_AUDIO_EXTENSIONS:
        file_type = "audio"
    elif ext in ALLOWED_VIDEO_EXTENSIONS:
        file_type = "video"
    else:
        file_type = "image"
    
    return jsonify({
        "success": True,
        "file_path": str(file_path),
        "file_type": file_type,
        "original_name": original_filename
    })


# =============================================================================
# Transcription
# =============================================================================

@api.route("/transcribe", methods=["POST"])
def transcribe():
    """Transcribe audio/video to text with timestamps - supports content types"""
    data = request.json
    file_path = data.get("file_path")
    language = data.get("language")  # None for auto-detect
    model_settings = data.get("model_settings", {})  # Frontend'den gelen model ayarları
    
    # New content-aware parameters
    content_type = data.get("content_type", "speech")  # 'speech', 'music', 'podcast'
    content_genre = data.get("content_genre")  # Music genre (optional)
    
    if not file_path:
        return jsonify({"error": "file_path required"}), 400
    
    if not os.path.exists(file_path):
        return jsonify({"error": "File not found"}), 404
    
    try:
        service = get_transcription_service()
        
        # Model ayarlarını kullanarak optimal model boyutunu belirle
        if model_settings and language:
            optimal_model = model_settings.get(language, model_settings.get('auto', 'small'))
            print(f"Using model '{optimal_model}' for language '{language}' (from frontend settings)")
        else:
            optimal_model = service.get_optimal_model_size(language)
            print(f"Using default optimal model '{optimal_model}' for language '{language}'")
        
        print(f"Content type: {content_type}, Genre: {content_genre}")
        
        # Use content-aware transcription if content type is specified
        if content_type != "speech" or content_genre:
            result = service.transcribe_with_content_type_to_subtitles(
                file_path,
                content_type=content_type,
                content_genre=content_genre,
                language=language
            )
        else:
            # Use standard transcription for speech
            result = service.transcribe_to_subtitles(
                file_path,
                language=language
            )
        
        return jsonify({
            "success": True,
            "language": result["language"],
            "duration": result["duration"],
            "subtitles": result["subtitles"],
            "content_type": content_type,
            "content_genre": content_genre,
            "model_used": result.get("model_used", optimal_model),
            "preprocessing_applied": result.get("preprocessing_applied", False),
            "performance": result.get("performance", {})
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@api.route("/transcribe/stream", methods=["POST"])
def transcribe_stream():
    """Transcribe with streaming progress updates using SSE - supports content types"""
    from flask import Response, stream_with_context
    import json as json_module
    
    data = request.json
    file_path = data.get("file_path")
    language = data.get("language")
    model_settings = data.get("model_settings", {})  # Frontend'den gelen model ayarları
    
    # New content-aware parameters
    content_type = data.get("content_type", "speech")
    content_genre = data.get("content_genre")
    
    if not file_path:
        return jsonify({"error": "file_path required"}), 400
    
    if not os.path.exists(file_path):
        return jsonify({"error": "File not found"}), 404
    
    def generate():
        try:
            service = get_transcription_service()
            
            # Content-specific loading messages
            content_messages = {
                'speech': 'Loading speech transcription model...',
                'music': 'Loading large model for music lyrics...',
                'podcast': 'Loading podcast transcription model...'
            }
            
            # Load model first with optimal size
            yield f"data: {json_module.dumps({'type': 'status', 'message': content_messages.get(content_type, content_messages['speech']), 'progress': 5})}\n\n"
            
            # Model ayarlarından optimal model boyutunu belirle
            if model_settings and language:
                optimal_model = model_settings.get(language, model_settings.get('auto', 'small'))
                yield f"data: {json_module.dumps({'type': 'status', 'message': f'Loading {optimal_model} model for {language} ({content_type})...', 'progress': 8})}\n\n"
            
            service.load_model(language)
            
            # Content-specific processing messages
            processing_messages = {
                'speech': 'Processing speech...',
                'music': 'Analyzing music and extracting lyrics...',
                'podcast': 'Processing podcast audio...'
            }
            
            yield f"data: {json_module.dumps({'type': 'status', 'message': processing_messages.get(content_type, 'Starting transcription...'), 'progress': 10})}\n\n"
            
            # Use content-aware transcription
            if content_type != "speech" or content_genre:
                result = service.transcribe_with_content_type(
                    file_path,
                    content_type=content_type,
                    content_genre=content_genre,
                    language=language,
                    word_timestamps=True
                )
            else:
                # Custom transcription with progress for speech
                result = service.transcribe(
                    file_path,
                    language=language,
                    word_timestamps=True
                )
            
            # Process segments
            subtitles = []
            subtitle_id = 1
            total_segments = len(result['segments'])
            
            for i, segment in enumerate(result['segments']):
                progress = 10 + int((i / total_segments) * 80)
                
                # Format subtitle
                if 'words' in segment and segment['words']:
                    words = segment['words']
                    current_words = []
                    current_start = None
                    
                    for word in words:
                        if current_start is None:
                            current_start = word['start']
                        current_words.append(word['word'])
                        
                        if len(current_words) >= 8 or len(' '.join(current_words)) >= 42:
                            subtitles.append({
                                'id': subtitle_id,
                                'start': current_start,
                                'end': word['end'],
                                'text': ' '.join(current_words).strip(),
                                'words': current_words.copy()
                            })
                            subtitle_id += 1
                            current_words = []
                            current_start = None
                    
                    if current_words:
                        subtitles.append({
                            'id': subtitle_id,
                            'start': current_start,
                            'end': words[-1]['end'],
                            'text': ' '.join(current_words).strip(),
                            'words': current_words
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
                
                # Send progress update with current subtitle
                yield f"data: {json_module.dumps({'type': 'progress', 'progress': progress, 'current_text': segment['text'][:50]})}\n\n"
            
            # Apply Arabic/RTL processing if detected language is RTL
            detected_lang = result.get('language', '')
            is_rtl = detected_lang in {'ar', 'fa', 'he', 'ur', 'ps', 'sd', 'yi'}
            
            if is_rtl:
                try:
                    subtitles = ArabicTextProcessor.process_subtitles(subtitles, detected_lang)
                    yield f"data: {json_module.dumps({'type': 'status', 'message': 'RTL text işleniyor...', 'progress': 95})}\n\n"
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
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
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
    
    data = request.json
    subtitles = data.get("subtitles", [])
    target_lang = data.get("target_lang", "en")
    source_lang = data.get("source_lang", "auto")
    
    if not subtitles:
        return jsonify({"error": "subtitles required"}), 400
    
    try:
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
    
    data = request.json
    text = data.get("text", "")
    target_lang = data.get("target_lang", "en")
    source_lang = data.get("source_lang", "auto")
    
    if not text:
        return jsonify({"error": "text required"}), 400
    
    try:
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
    
    if not subtitles:
        return jsonify({"error": "subtitles required"}), 400
    
    try:
        engine = get_subtitle_engine()
        engine.set_resolution_from_format(video_format)
        
        # Create style from dict
        sub_style = SubtitleStyle(
            font_name=style.get("font_name", "Arial"),
            font_size=style.get("font_size", 48),
            primary_color=style.get("color", "#FFFFFF"),
            border_color=style.get("border_color", "#000000"),
            border_width=style.get("border_width", 2),
            shadow_depth=style.get("shadow_depth", 1),
            bold=style.get("bold", False),
            italic=style.get("italic", False),
            alignment=style.get("alignment", 2),
            margin_vertical=style.get("margin_vertical", 30)
        )
        
        # Create animation config
        anim_config = AnimationConfig(
            type=animation.get("type", "none"),
            fade_in=animation.get("fade_in", 200),
            fade_out=animation.get("fade_out", 200),
            karaoke_type=animation.get("karaoke_type", "sweep"),
            highlight_color=animation.get("highlight_color", "#FFFF00")
        )
        
        # Generate file
        output_filename = f"subtitles_{uuid.uuid4().hex[:8]}.{format}"
        output_path = str(TEMP_DIR / output_filename)
        
        if format == "ass":
            engine.save_ass(subtitles, output_path, sub_style, anim_config)
        else:
            engine.save_srt(subtitles, output_path)
        
        return jsonify({
            "success": True,
            "subtitle_path": output_path,
            "format": format
        })
    except Exception as e:
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
                   output_format, quality, style, animation, source_language=None, logo=None, logos=None, secondary_subtitle=None):
    """Background render job"""
    global _render_jobs
    
    print(f"[Render Job {job_id}] Starting...")
    print(f"[Render Job {job_id}] Logos count: {len(logos) if logos else 0}")
    print(f"[Render Job {job_id}] Secondary subtitle enabled: {secondary_subtitle is not None}")
    
    try:
        _render_jobs[job_id] = {
            "status": "processing",
            "progress": 5,
            "step": "Altyazı dosyası oluşturuluyor...",
            "error": None,
            "output_path": None
        }
        
        # Step 1: Generate subtitle file
        print(f"[Render Job {job_id}] Getting subtitle engine...")
        # Create fresh engine for each render to avoid cached styles
        engine = SubtitleEngine()
        engine.set_resolution_from_format(video_format)
        
        _render_jobs[job_id]["progress"] = 10
        _render_jobs[job_id]["step"] = "Stil ayarları uygulanıyor..."
        
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
            margin_vertical=int(style.get("marginVertical", style.get("margin_vertical", 50)))
        )
        
        print(f"[Render Job {job_id}] Created SubtitleStyle: font={sub_style.font_name}, size={sub_style.font_size}, color={sub_style.primary_color}, border={sub_style.border_color}, align={sub_style.alignment}")
        
        _render_jobs[job_id]["progress"] = 15
        _render_jobs[job_id]["step"] = "Animasyon ayarları uygulanıyor..."
        
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
        _render_jobs[job_id]["step"] = "ASS altyazı dosyası oluşturuluyor..."
        
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
                alignment=2,  # Always bottom center for secondary
                margin_vertical=int(sec_style_data.get("marginVertical", 120))
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
        
        _render_jobs[job_id]["progress"] = 30
        _render_jobs[job_id]["step"] = "Video oluşturuluyor..."
        
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
                print(f"[Render Job {job_id}] Progress: {scaled}% - {step}")
        
        print(f"[Render Job {job_id}] Generating video: audio={audio_path}, bg={background.get('type')}, logos={len(logos) if logos else 0}")
        result = generator.generate_video_with_subtitles(
            audio_path=audio_path,
            subtitle_path=subtitle_path,
            background_type=background.get("type", "color"),
            background_value=background.get("value", "#000000"),
            background_image=background.get("imagePath"),
            format_type=video_format,
            output_format=output_format,
            quality=quality,
            logo=logo,
            logos=logos,
            progress_callback=progress_callback
        )
        
        _render_jobs[job_id]["progress"] = 98
        _render_jobs[job_id]["step"] = "Temizlik yapılıyor..."
        
        # Clean up temp subtitle file
        try:
            os.remove(subtitle_path)
        except:
            pass
        
        _render_jobs[job_id]["progress"] = 100
        _render_jobs[job_id]["status"] = "completed"
        _render_jobs[job_id]["step"] = "Tamamlandı!"
        _render_jobs[job_id]["output_path"] = result.get("output_path")
        _render_jobs[job_id]["result"] = result
        
        print(f"[Render Job {job_id}] Completed! Output: {result.get('output_path')}")
        
    except Exception as e:
        import traceback
        print(f"[Render Job {job_id}] ERROR: {str(e)}")
        traceback.print_exc()
        _render_jobs[job_id]["status"] = "error"
        _render_jobs[job_id]["error"] = str(e)
        _render_jobs[job_id]["step"] = f"Hata: {str(e)}"


@api.route("/render", methods=["POST"])
def render_video():
    """
    Start async render job
    Returns job_id for progress tracking
    """
    try:
        data = request.json
        
        if not data:
            return jsonify({"error": "No JSON data received"}), 400
        
        # Required fields
        audio_path = data.get("audio_path")
        subtitles = data.get("subtitles")
        
        print(f"[Render] Received request: audio_path={audio_path}, subtitles_count={len(subtitles) if subtitles else 0}")
        
        print(f"🔍 DEBUG: Subtitle has words? {subtitles[0].get('words') is not None if subtitles else False}")
        if subtitles and subtitles[0].get('words'):
            print(f"🔍 DEBUG: Words count = {len(subtitles[0]['words'])}")
        else:
            print(f"❌ DEBUG: NO WORDS DATA - Karaoke won't work!")
        
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
        
        print(f"[Render] Starting job {job_id}: format={video_format}, output={output_format}, quality={quality}, lang={source_language}, logos={len(logos) if logos else 0}, dual_sub={secondary_subtitle is not None}")
        
        # Start background thread
        thread = threading.Thread(
            target=run_render_job,
            args=(job_id, audio_path, subtitles, background, video_format,
                  output_format, quality, style, animation, source_language, logo, logos, secondary_subtitle)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            "success": True,
            "job_id": job_id,
            "status": "started"
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@api.route("/render/status/<job_id>", methods=["GET"])
def render_status(job_id):
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
        "output_path": job["output_path"]
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

@api.route("/open-folder", methods=["GET"])
def open_folder():
    """Open folder in system file explorer"""
    import subprocess
    import platform
    
    folder_path = request.args.get('path', str(OUTPUT_DIR))
    
    try:
        # Klasör yoksa oluştur
        if not os.path.exists(folder_path):
            os.makedirs(folder_path, exist_ok=True)
        
        # İşletim sistemine göre aç
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
    Suno lirik metinlerini parse ederek subtitle formatına çevirir
    
    Request body:
    {
        "lyrics": "string",  # Ham lirik metni
        "duration": float    # Hedef toplam süre (opsiyonel)
    }
    """
    try:
        data = request.get_json()
        lyrics_text = data.get('lyrics', '')
        total_duration = data.get('duration')
        
        if not lyrics_text:
            return jsonify({"error": "Lyrics text is required"}), 400
        
        # Parse et
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
    Suno liriklerinin önizlemesini döndürür (timing hesaplamadan)
    """
    try:
        data = request.get_json()
        lyrics_text = data.get('lyrics', '')
        
        if not lyrics_text:
            return jsonify({"error": "Lyrics text is required"}), 400
            
        # Sadece parse et, timing ayarlaması yapma
        parsed_subtitles = parse_suno_lyrics(lyrics_text)
        
        # Özet bilgiler
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
            "sample_subtitles": parsed_subtitles[:5]  # İlk 5 örnek
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
