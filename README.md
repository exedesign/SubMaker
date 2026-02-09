# SubMaker - AI Subtitle Generator with Karaoke Effects

A fully offline, AI-powered desktop application for creating professional subtitled videos with advanced karaoke animations.

## ✨ Key Features

- 🎙️ **AI Transcription**: Uses faster-whisper for accurate speech-to-text  
- 🎤 **Karaoke Effects**: Word-by-word highlighting with yellow tracking animations
- 🌍 **Dual Language Support**: Primary + secondary subtitles with translation
- 🔤 **Arabic RTL Support**: Proper Arabic text reshaping and right-to-left display
- 🎨 **Custom Backgrounds**: Solid colors, images, or transparent backgrounds
- 📐 **Multiple Formats**: 4K support for Horizontal (16:9), Vertical (9:16), Square (1:1)
- ✏️ **Professional Styling**: Custom fonts, colors, borders, shadows, animations
- 🎬 **Animation Effects**: Fade, Karaoke, Pop, Typewriter with GPU acceleration
- 💻 **Desktop App**: Native Electron app with drag-and-drop support
- 🚀 **GPU Optimization**: CUDA/NVENC acceleration for fast 4K rendering

## 🏗️ Architecture

```
SubMaker/
├── backend/           # Python Flask API
│   ├── services/      # Core services
│   │   ├── transcription.py    # faster-whisper integration
│   │   ├── translation.py      # Argos Translate
│   │   ├── arabic_support.py   # RTL text processing
│   │   ├── video_generator.py  # Video creation
│   │   ├── subtitle_engine.py  # ASS/SRT generation
│   │   └── ffmpeg_processor.py # FFmpeg commands
│   ├── api/
│   │   └── routes.py  # REST API endpoints
│   └── main.py        # Server entry point
│
├── electron/          # Electron.js + React frontend
│   ├── src/
│   │   ├── main/      # Electron main process
│   │   └── renderer/  # React components
│   └── package.json
│
└── resources/         # Shared resources
    ├── fonts/         # Custom fonts
    └── models/        # Whisper models (auto-downloaded)
```

## 📋 Requirements

- **Python** 3.9+
- **Node.js** 18+
- **FFmpeg** (must be in PATH)
- **GPU** (optional): NVIDIA GPU with CUDA for faster transcription

## 🚀 Installation

### 1. Clone and Setup

```bash
# Windows
.\setup.bat

# Or manually:
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

cd ../electron
npm install
```

### 2. Install FFmpeg

Download from https://ffmpeg.org/download.html and add to PATH.

### 3. Run the Application

```bash
# Start backend (Terminal 1)
.\start-backend.bat

# Start frontend (Terminal 2)
.\start-frontend.bat

# Or in electron folder:
npm run electron:dev
```

## 🎯 Usage

1. **Upload**: Drag & drop MP3/WAV or video file
2. **Transcribe**: AI automatically transcribes speech
3. **Edit**: Modify subtitles, timing, and text
4. **Style**: Customize fonts, colors, position, animations
5. **Preview**: Real-time preview with audio playback
6. **Render**: Export final video with burned subtitles

## 🎨 Customization Options

### Background
- Solid colors (including chroma key green/blue)
- Custom images
- Transparent (WebM/MOV output)

### Subtitle Styling
- Font family and size
- Text and border colors
- Shadow effects
- Position (9 positions)
- Bold/Italic

### Animations
- **Fade**: Smooth fade in/out
- **Karaoke**: Word-by-word highlight
- **Pop**: Scale animation
- **Typewriter**: Character reveal

### Output Formats
- MP4 (H.264) - Universal
- WebM (VP9) - Web/Transparent
- MOV (ProRes) - Professional

## 🔧 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/upload` | POST | Upload media file |
| `/api/transcribe` | POST | Transcribe audio |
| `/api/translate` | POST | Translate subtitles |
| `/api/subtitles/generate` | POST | Generate subtitle file |
| `/api/video/generate` | POST | Generate video |
| `/api/render` | POST | Full render pipeline |

## 🐛 Troubleshooting

### Backend won't start
- Check Python is 3.9+: `python --version`
- Ensure virtual environment is activated
- Install missing packages: `pip install -r requirements.txt`

### Transcription fails
- First run downloads model (~3GB for large-v3)
- Check disk space
- For GPU: Install CUDA toolkit

### FFmpeg errors
- Verify FFmpeg is installed: `ffmpeg -version`
- Ensure FFmpeg is in system PATH

### Arabic text appears broken
- arabic-reshaper and python-bidi must be installed
- Use fonts with Arabic support (e.g., NotoSansArabic)

## 📄 License

MIT License

## 🙏 Credits

- [faster-whisper](https://github.com/guillaumekln/faster-whisper) - Speech recognition
- [Argos Translate](https://github.com/argosopentech/argos-translate) - Translation
- [FFmpeg](https://ffmpeg.org/) - Video processing
- [Electron](https://www.electronjs.org/) - Desktop framework
- [React](https://reactjs.org/) - UI framework
