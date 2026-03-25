"""
SubMaker Backend Main Entry Point
Starts the Flask API server
"""
import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO, emit

from config import SERVER_HOST, SERVER_PORT, DEBUG
from api.routes import api


def create_app():
    """Create and configure the Flask application"""
    app = Flask(__name__)
    
    # Enable CORS for all origins (development mode)
    CORS(app,
         resources={r"/api/*": {"origins": "*"}},
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
        cors_allowed_origins="*",
        async_mode="threading"
    )
    
    @socketio.on("connect")
    def handle_connect():
        print("Client connected")
        emit("connected", {"status": "connected"})
    
    @socketio.on("disconnect")
    def handle_disconnect():
        print("Client disconnected")
    
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
        socketio.run(app, host=SERVER_HOST, port=SERVER_PORT, debug=DEBUG, allow_unsafe_werkzeug=True)
    else:
        app.run(host=SERVER_HOST, port=SERVER_PORT, debug=DEBUG, allow_unsafe_werkzeug=True)


if __name__ == "__main__":
    main()
