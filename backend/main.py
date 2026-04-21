"""
SubMaker Backend Main Entry Point
Starts the Flask API server
"""
import os
import sys
import uuid
import subprocess
import threading
import logging
from pathlib import Path

# ── Early bootstrap diagnostic ────────────────────────────────────────
# Write a diagnostic log before any project imports, so we can see
# exactly where it fails if an import crashes.
_BOOT_LOG = None
try:
    _user_data = Path(os.environ.get('SUBMAKER_USER_DATA', Path.home() / 'SubMaker'))
    _user_data.mkdir(parents=True, exist_ok=True)
    _BOOT_LOG = _user_data / "backend-bootstrap.log"
    with open(_BOOT_LOG, 'w', encoding='utf-8') as f:
        f.write(f"=== SubMaker Backend Bootstrap ===\n")
        f.write(f"Time: {__import__('datetime').datetime.now().isoformat()}\n")
        f.write(f"Python: {sys.version}\n")
        f.write(f"Executable: {sys.executable}\n")
        f.write(f"__file__: {__file__}\n")
        f.write(f"cwd: {os.getcwd()}\n")
        f.write(f"sys.path: {sys.path}\n")
        f.write(f"SUBMAKER_PRODUCTION: {os.environ.get('SUBMAKER_PRODUCTION', 'not set')}\n")
        f.write(f"SUBMAKER_USER_DATA: {os.environ.get('SUBMAKER_USER_DATA', 'not set')}\n\n")
except Exception as e:
    print(f"[BOOT] Failed to write bootstrap log: {e}")

def _boot_log(msg):
    """Append a line to the bootstrap log."""
    print(msg)
    if _BOOT_LOG:
        try:
            with open(_BOOT_LOG, 'a', encoding='utf-8') as f:
                f.write(f"{msg}\n")
        except Exception:
            pass

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))
_boot_log(f"[BOOT] sys.path updated, backend dir: {Path(__file__).parent}")

try:
    _boot_log("[BOOT] Importing Flask...")
    from flask import Flask, request
    from flask_cors import CORS
    from flask_socketio import SocketIO, emit
    _boot_log("[BOOT] Flask imported OK")
except Exception as e:
    _boot_log(f"[BOOT] FATAL — Flask import failed: {e}")
    raise

try:
    _boot_log("[BOOT] Importing config...")
    from config import SERVER_HOST, SERVER_PORT, DEBUG, TEMP_DIR, FFMPEG_PATH, IS_PRODUCTION
    _boot_log(f"[BOOT] Config imported OK — PORT={SERVER_PORT}, TEMP={TEMP_DIR}, PROD={IS_PRODUCTION}")
except Exception as e:
    _boot_log(f"[BOOT] FATAL — config import failed: {e}")
    raise

# ---------------------------------------------------------------------------
# Production log file — captures all print output for debugging packaged builds
# ---------------------------------------------------------------------------
if IS_PRODUCTION:
    _USER_DATA = Path(os.environ.get('SUBMAKER_USER_DATA', Path.home() / 'SubMaker'))
    _LOG_FILE = _USER_DATA / "backend.log"
    _USER_DATA.mkdir(parents=True, exist_ok=True)
    try:
        _log_fh = open(_LOG_FILE, 'w', encoding='utf-8', buffering=1)  # line-buffered
        # Tee stdout/stderr to both console and log file
        class _Tee:
            def __init__(self, *streams):
                self.streams = streams
            def write(self, data):
                for s in self.streams:
                    try:
                        s.write(data)
                        s.flush()
                    except Exception:
                        pass
            def flush(self):
                for s in self.streams:
                    try:
                        s.flush()
                    except Exception:
                        pass
        sys.stdout = _Tee(sys.__stdout__, _log_fh)
        sys.stderr = _Tee(sys.__stderr__, _log_fh)
        print(f"[LOG] Backend log file: {_LOG_FILE}")
    except Exception as _log_err:
        print(f"[LOG] Failed to create log file: {_log_err}")

try:
    _boot_log("[BOOT] Importing api.routes...")
    from api.routes import api
    _boot_log("[BOOT] api.routes imported OK")
except Exception as e:
    _boot_log(f"[BOOT] FATAL — api.routes import failed: {e}")
    import traceback
    _boot_log(traceback.format_exc())
    raise

# ── Vocal isolation diagnostics at boot ───────────────────────────────
try:
    _boot_log("[BOOT] Checking torch...")
    import torch
    _boot_log(f"[BOOT] torch {torch.__version__} OK, CUDA={torch.cuda.is_available()}")
except Exception as e:
    _boot_log(f"[BOOT] torch import FAILED: {type(e).__name__}: {e}")

try:
    _boot_log("[BOOT] Checking audio_separator...")
    from audio_separator.separator import Separator
    _boot_log("[BOOT] audio_separator OK")
except Exception as e:
    _boot_log(f"[BOOT] audio_separator import FAILED: {type(e).__name__}: {e}")

# ---------------------------------------------------------------------------
# Visualizer WebSocket pipe state (per socket session)
# ---------------------------------------------------------------------------
_viz_procs = {}          # sid -> subprocess.Popen
_viz_paths = {}          # sid -> output mp4 path
_viz_lock = threading.Lock()
_nvenc_ok = None
_nvenc_probe_lock = threading.Lock()


def _check_nvenc():
    """Probe h264_nvenc availability once and cache the result."""
    global _nvenc_ok
    if _nvenc_ok is not None:
        return _nvenc_ok
    with _nvenc_probe_lock:
        if _nvenc_ok is not None:
            return _nvenc_ok
        ffmpeg = str(FFMPEG_PATH) if FFMPEG_PATH else 'ffmpeg'
        try:
            r = subprocess.run(
                [ffmpeg, '-y', '-f', 'lavfi', '-i', 'nullsrc=s=8x8:d=1',
                 '-frames:v', '1', '-c:v', 'h264_nvenc', '-f', 'null', '-'],
                capture_output=True, timeout=10
            )
            _nvenc_ok = (r.returncode == 0)
        except Exception:
            _nvenc_ok = False
        print(f'[VizPipe] NVENC available: {_nvenc_ok}')
        return _nvenc_ok


def create_app():
    """Create and configure the Flask application"""
    app = Flask(__name__)
    
    # Enable CORS for Electron renderer (localhost only)
    CORS(app,
         resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173", "file://"]}},
         allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
    
    # Allow large file uploads (500MB for WAV files)
    app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB
    
    # Register API blueprint
    app.register_blueprint(api, url_prefix="/api")
    
    return app


def create_socketio(app):
    """Create SocketIO for real-time updates"""
    socketio = SocketIO(
        app,
        cors_allowed_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        async_mode="threading",
        max_http_buffer_size=50 * 1024 * 1024,  # 50 MB — supports 4K RGBA frames
    )

    @socketio.on("connect")
    def handle_connect():
        print("Client connected")
        emit("connected", {"status": "connected"})

    @socketio.on("disconnect")
    def handle_disconnect():
        print("Client disconnected")
        sid = request.sid
        with _viz_lock:
            proc = _viz_procs.pop(sid, None)
            path = _viz_paths.pop(sid, None)
        if proc:
            try:
                proc.kill()
            except Exception:
                pass
        if path:
            try:
                os.unlink(path)
            except Exception:
                pass

    # -----------------------------------------------------------------------
    # Visualizer raw pipe — stream RGBA frames from browser to FFmpeg stdin
    # Replaces the JPEG batch upload approach; no encode/decode per frame.
    # -----------------------------------------------------------------------

    @socketio.on("viz:pipe:start")
    def handle_viz_pipe_start(data):
        sid = request.sid
        width = int(data.get('width', 1920))
        height = int(data.get('height', 1080))
        fps = int(data.get('fps', 30))

        # Kill any leftover session for this socket
        with _viz_lock:
            old = _viz_procs.get(sid)
            if old:
                try:
                    old.kill()
                except Exception:
                    pass

        out_path = str(TEMP_DIR / f"viz_{uuid.uuid4().hex}.mp4")
        ffmpeg = str(FFMPEG_PATH) if FFMPEG_PATH else 'ffmpeg'

        base_args = [
            ffmpeg, '-y',
            '-f', 'rawvideo', '-pix_fmt', 'rgba',
            '-s', f'{width}x{height}', '-r', str(fps),
            '-i', 'pipe:0',
            '-vf', 'vflip',
        ]
        tail_args = ['-pix_fmt', 'yuv420p', '-movflags', '+faststart', out_path]

        if _check_nvenc():
            cmd = base_args + ['-c:v', 'h264_nvenc', '-preset', 'p3', '-rc', 'vbr', '-cq', '22'] + tail_args
            encoder = 'h264_nvenc'
        else:
            cmd = base_args + ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22'] + tail_args
            encoder = 'libx264'

        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        with _viz_lock:
            _viz_procs[sid] = proc
            _viz_paths[sid] = out_path

        print(f'[VizPipe/WS] Started {width}x{height}@{fps}fps encoder={encoder} sid={sid[:8]}')
        return {'encoder': encoder}

    @socketio.on("viz:frame")
    def handle_viz_frame(data):
        sid = request.sid
        proc = _viz_procs.get(sid)
        if not proc or proc.poll() is not None:
            return {'error': 'No active process'}
        try:
            proc.stdin.write(data if isinstance(data, bytes) else bytes(data))
        except BrokenPipeError:
            return {'error': 'Broken pipe'}
        return {'ok': True}

    @socketio.on("viz:pipe:end")
    def handle_viz_pipe_end():
        sid = request.sid
        with _viz_lock:
            proc = _viz_procs.pop(sid, None)
            out_path = _viz_paths.pop(sid, None)

        if not proc:
            return {'error': 'No active session'}

        try:
            proc.stdin.close()
            proc.wait(timeout=300)
        except Exception as e:
            try:
                proc.kill()
            except Exception:
                pass
            return {'error': str(e)}

        if out_path and os.path.exists(out_path):
            size_mb = round(os.path.getsize(out_path) / (1024 * 1024), 2)
            print(f'[VizPipe/WS] Done: {out_path} ({size_mb} MB)')
            return {'videoPath': out_path, 'fileSizeMB': size_mb}
        return {'error': 'Output file not found'}

    @socketio.on("viz:pipe:cancel")
    def handle_viz_pipe_cancel():
        sid = request.sid
        with _viz_lock:
            proc = _viz_procs.pop(sid, None)
            out_path = _viz_paths.pop(sid, None)
        if proc:
            try:
                proc.kill()
            except Exception:
                pass
        if out_path:
            try:
                os.unlink(out_path)
            except Exception:
                pass
        return {'cancelled': True}

    return socketio


# Create app
app = create_app()

# Try to create socketio (may fail if eventlet not installed)
try:
    socketio = create_socketio(app)
    USE_SOCKETIO = True
except Exception as e:
    print(f"SocketIO not available: {e}")
    socketio = None
    USE_SOCKETIO = False


def main():
    """Main entry point"""
    print(f"""
===============================================================
                                                               
   SUBMAKER - Local Subtitle Generator                        
                                                               
   Backend Server                                              
                                                               
===============================================================

    Server starting on http://{SERVER_HOST}:{SERVER_PORT}
    """)
    
    if USE_SOCKETIO and socketio:
        socketio.run(app, host=SERVER_HOST, port=SERVER_PORT, debug=DEBUG)
    else:
        app.run(host=SERVER_HOST, port=SERVER_PORT, debug=DEBUG)


if __name__ == "__main__":
    main()
