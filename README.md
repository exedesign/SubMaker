# SubMaker

**AI-powered subtitle and karaoke video generator for Windows.**  
Transcribe audio, isolate vocals, translate to 37+ languages, and burn animated subtitles — all offline, no cloud required.

[![Patreon](https://img.shields.io/badge/Patreon-Support%20monthly-FF424D?style=flat&logo=patreon&logoColor=white)](https://www.patreon.com/10985664/join)
[![Patreon Shop](https://img.shields.io/badge/Patreon-One--time%20tip-FF424D?style=flat&logo=patreon&logoColor=white)](https://www.patreon.com/cw/fatiheke/shop)
[![Kreosus](https://img.shields.io/badge/Kreosus-Destek%20ol-f59e0b?style=flat&logoColor=white)](https://kreosus.com/exedesign#creator-profile-support)

---

## Features

- **AI Transcription** — faster-whisper with multiple model choices (Turbo, Medium, Large v3, Distil Large v3, Small, Tiny)
- **Vocal Isolation** — BS-Roformer model separates vocals from music before transcription
- **AI Translation** — Qwen 2.5-3B (local LLM) translates subtitles into 37+ languages
- **Karaoke Animations** — word-by-word highlight, fade, pop, typewriter effects with real-time preview
- **Arabic / RTL Support** — proper reshaping and bidi rendering for Arabic, Hebrew, Urdu
- **Cover Art Generation** — FLUX.2 Klein 4B text-to-image (optional, downloadable separately)
- **GPU Acceleration** — CUDA transcription and NVENC video encoding
- **Dual Subtitles** — primary + secondary language on the same frame
- **Multiple Output Formats** — MP4 (H.264), WebM (VP9), MOV (ProRes)
- **Fully Offline** — no API keys, no network calls during use
- **Windows Installer** — bundled Python runtime, PyTorch CUDA, FFmpeg

---

## Download

> Windows 10/11 x64 required. NVIDIA GPU recommended (CPU fallback available).

The installer is distributed as three files that must be in the same folder:

| File | Size | Contents |
|---|---|---|
| `SubMaker_Setup_1.2.0.exe` | ~209 MB | Application + Python tools |
| `SubMaker_Python_Runtime.7z` | ~1.7 GB | Python 3.13 + PyTorch CUDA 12.4 |
| `SubMaker_Models.7z.001` | ~1.8 GB | Whisper Turbo + Vocal Separator models |

Run `SubMaker_Setup_1.2.0.exe` after placing all three files in the same folder.  
Additional models (Whisper variants, Qwen translation, FLUX cover art) can be downloaded from inside the app.

---

## System Requirements

| Component | Minimum | Recommended |
|---|---|---|
| OS | Windows 10 x64 | Windows 11 x64 |
| RAM | 8 GB | 16 GB |
| Disk | 10 GB free | 20 GB free |
| GPU | — (CPU mode) | NVIDIA RTX, 6 GB VRAM |
| CUDA | — | 12.4+ |

---

## AI Models

Models are stored in `%AppData%\SubMaker\models\` and can be managed from the app's **System Health** panel.

| Model | Folder | Size | Purpose |
|---|---|---|---|
| Whisper Turbo *(bundled)* | `turbo` | 1.5 GB | Default transcription — fast & accurate |
| BS-Roformer *(bundled)* | `audio-separator` | 805 MB | Vocal isolation |
| Whisper Distil Large v3 | `distil-large-v3` | 1.5 GB | High accuracy, faster than Large |
| Whisper Large v3 | `large-v3` | 2.9 GB | Best accuracy |
| Whisper Medium | `medium` | 1.5 GB | Good balance |
| Whisper Small | `small` | 464 MB | Arabic, CJK languages |
| Whisper Tiny | `tiny` | 75 MB | Fastest, lower accuracy |
| Qwen 2.5-3B AWQ | `qwen2.5-3b-awq` | 2.6 GB | Local translation LLM |
| FLUX.2 Klein 4B | `flux-klein-4b` | 6.9 GB | Cover art generation |
| FLUX.2 Small Decoder | `flux-small-decoder` | 591 MB | Faster VAE decode |

---

## Usage

1. **Upload** — drag & drop or browse for an MP3, WAV, MP4, or MKV file
2. **Vocal Isolation** *(optional)* — enable to separate vocals before transcription
3. **Transcribe** — choose model and language, then start transcription
4. **Edit** — adjust subtitle text and timing in the editor
5. **Translate** *(optional)* — generate a second-language subtitle track
6. **Style** — set font, color, size, position, animation, background
7. **Preview** — real-time preview with audio playback and visualizer
8. **Export** — render final video with burned-in subtitles

---

## Architecture

```
SubMaker/
├── backend/                    # Python 3.13 Flask API (port 5000)
│   ├── main.py                 # Server entry point + bootstrap diagnostics
│   ├── config.py               # Model paths, CUDA config, resolve_model_dir()
│   ├── api/
│   │   └── routes.py           # REST + SSE streaming endpoints
│   └── services/
│       ├── transcription.py    # faster-whisper orchestration
│       ├── vocal_isolator.py   # BS-Roformer via audio-separator
│       ├── qwen_translation.py # Qwen 2.5-3B local translation
│       ├── subtitle_engine.py  # ASS/SRT generation
│       ├── video_generator.py  # FFmpeg video rendering
│       ├── cover_art_generator.py
│       ├── lyrics_analyzer.py  # Word timing alignment
│       ├── lyrics_tagger.py    # ID3 tag embedding
│       ├── arabic_support.py   # RTL reshaping
│       ├── vram_manager.py     # GPU memory tracking
│       └── engines/
│           └── whisperx_engine.py  # WhisperX adapter
│
├── electron/                   # Electron 28 + React 18 frontend
│   ├── src/
│   │   ├── main/
│   │   │   ├── index.js        # Main process, IPC, window management
│   │   │   └── preload.js      # Secure IPC bridge (contextBridge)
│   │   └── renderer/
│   │       ├── components/
│   │       │   ├── StartupHealthCheck.jsx  # Boot health check + model downloader
│   │       │   ├── Header.jsx              # System health panel, package status
│   │       │   ├── PreviewPanel.jsx        # Audio/video preview
│   │       │   ├── PreviewScreenOutput.jsx # Subtitle preview canvas
│   │       │   └── ButterchurnCanvas.jsx   # Audio visualizer
│   │       ├── stores/
│   │       │   └── appStore.js # Zustand global state
│   │       └── styles/
│   │           ├── globals.css
│   │           └── startup.css
│   └── package.json
│
├── installer/
│   ├── SubMaker.nsi            # NSIS installer script
│   ├── prepare_build.ps1       # Full build pipeline (Electron + Python + 7z)
│   └── download_models.py      # Model downloader (used by app + installer)
│
└── resources/
    ├── fonts/
    └── presets/
```

---

## Development Setup

### Prerequisites

- Node.js 18+
- Python 3.11–3.13
- FFmpeg in PATH
- NVIDIA GPU + CUDA 12.x *(optional)*

### Run in dev mode

```powershell
# 1. Install Python dependencies
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
pip install -r requirements.txt

# 2. Install Node dependencies
cd ..\electron
npm install

# 3. Start backend
cd ..
.\start_backend.bat

# 4. Start Electron (new terminal)
cd electron
npm run electron:dev
```

### Build Windows Installer

```powershell
# Full build (Electron + Python + NSIS) — takes 30–60 min
cd installer
PowerShell -ExecutionPolicy Bypass -File prepare_build.ps1

# Skip Electron rebuild (Python already staged)
PowerShell -ExecutionPolicy Bypass -File prepare_build.ps1 -SkipElectronBuild

# Skip Python setup (already staged)
PowerShell -ExecutionPolicy Bypass -File prepare_build.ps1 -SkipElectronBuild -SkipPythonSetup
```

Output: `installer/output/SubMaker_Setup_x.x.x.exe` + sidecar `.7z` files.

---

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Server + CUDA status |
| `/api/system-health` | GET | Models, packages, disk, VRAM |
| `/api/packages/check` | GET | Python package status + warnings |
| `/api/packages/install` | POST | Install missing packages |
| `/api/upload` | POST | Upload media file |
| `/api/transcribe/stream` | POST | SSE transcription stream |
| `/api/vocal-isolation/separate` | POST | SSE vocal separation stream |
| `/api/translate` | POST | Subtitle translation (Qwen) |
| `/api/subtitles/generate` | POST | Generate ASS/SRT file |
| `/api/video/generate` | POST | Render video with subtitles |
| `/api/models/download` | POST | SSE model download stream |

---

## Troubleshooting

**App opens but backend doesn't start**  
Check `%AppData%\SubMaker\backend-bootstrap.log` for the exact error. Usually a missing DLL (Visual C++ Redistributable) — install `vc_redist.x64.exe` from the installer folder.

**"torch CPU-only build" warning in System Health**  
The bundled Python runtime includes PyTorch CUDA. If this appears after a manual `pip install torch`, you installed the CPU build. Re-run the app after a clean install.

**Transcription crashes at startup**  
Older installs may have corrupted `.dist-info/RECORD` files (empty files from a build bug). Reinstall using the latest installer.

**Vocal isolation not available**  
The BS-Roformer model must be in `%AppData%\SubMaker\models\audio-separator\`. Download it from **System Health → Download** inside the app.

**FLUX cover art not available**  
FLUX Klein 4B (6.9 GB) is not bundled in the installer. Download from System Health when needed.

**Arabic/RTL text rendering issues**  
Ensure you're using a font with Arabic glyph support (e.g., Cairo, Noto Sans Arabic). The app reshapes and reverses Arabic text automatically via `arabic-reshaper` + `python-bidi`.

---

## Credits

- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — CTranslate2-based Whisper inference
- [audio-separator](https://github.com/nomadkaraoke/python-audio-separator) — BS-Roformer vocal isolation
- [Qwen2.5](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-AWQ) — Local translation LLM by Alibaba
- [FLUX.2](https://huggingface.co/black-forest-labs) — Cover art image generation by Black Forest Labs
- [FFmpeg](https://ffmpeg.org/) — Video encoding and processing
- [Electron](https://www.electronjs.org/) — Desktop application framework
- [React](https://react.dev/) — UI framework

---

## Support

SubMaker is free and open source. If it saves you time, consider supporting development:

| Platform | Type | Link |
|---|---|---|
| Patreon | Monthly membership | [patreon.com/fatiheke](https://www.patreon.com/10985664/join) |
| Patreon | One-time tip | [patreon.com/fatiheke/shop](https://www.patreon.com/cw/fatiheke/shop) |
| Kreosus | One-time / recurring | [kreosus.com/exedesign](https://kreosus.com/exedesign#creator-profile-support) |

---

## License

MIT
