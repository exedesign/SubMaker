/**
 * SubMaker Electron Main Process
 */
const { app, BrowserWindow, ipcMain, dialog, shell, screen, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
// vizRenderManager removed — viz rendering now happens in-page + Flask

// ─── SwiftShader (software WebGL) fallback — check FIRST ─────────────
// If a previous run wrote a crash marker, relaunch with software rendering.
// SwiftShader is slower but immune to NVIDIA driver crashes.
// The marker is only cleared after the user successfully completes a render
// (or manually deletes the file), so the app stays in safe mode until proven stable.
//
// IMPORTANT: The marker path must be computed AFTER setPath so dev and prod
// share the same location check.

// Use a separate user data dir in dev to avoid profile lock with other instances
if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('userData'), 'dev'));
}

const CRASH_MARKER = path.join(app.getPath('userData'), 'gpu-crash-marker.txt');
const swiftshaderActive = process.argv.includes('--use-angle=swiftshader');
if (!swiftshaderActive && fs.existsSync(CRASH_MARKER)) {
  console.log('[MAIN] GPU crash marker found — relaunching with SwiftShader');
  app.relaunch({ args: ['--use-angle=swiftshader', ...process.argv.slice(1)] });
  app.exit(0);
}

// ─── GPU Configuration ────────────────────────────────────────────────
// Strategy: keep Electron's GPU behaviour as close to Chrome as possible.
// Chrome works fine on the same machine / NVIDIA driver, so we avoid
// aggressive flags (disable-gpu-compositing, disable-gpu-rasterization,
// custom ANGLE backends) that make Electron behave DIFFERENTLY from Chrome
// and can actually destabilise the GPU process.
//
// Only two minimal flags are applied:
//   --no-sandbox            : required for Electron on some NVIDIA configs
//   --disable-gpu-sandbox   : avoids sandbox DLL conflicts on NVIDIA Optimus
//
// SwiftShader fallback is the safety net: if the renderer still crashes,
// a crash marker causes the next launch to use software WebGL.
if (swiftshaderActive) {
  console.log('[MAIN] SwiftShader mode — using software WebGL');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
}
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');
// Suppress unsupported DevTools Autofill protocol errors (harmless Chromium CDP noise)
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,AutofillEnableAccountWalletStorage,Autofill,AutofillCreditCardAuthentication,AutofillAddressProfileSavePrompt,AutofillCreditCardEnabled');

// Keep references to prevent garbage collection
let mainWindow = null;
let pythonProcess = null;

// Development mode check
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/**
 * Create the main application window
 */
function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }

  console.log('🔧 [MAIN] Creating main window...');
  console.log('🔧 [MAIN] Preload path:', path.join(__dirname, 'preload.js'));
  console.log('🔧 [MAIN] __dirname:', __dirname);
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
    },
    frame: false,
    show: false,
  });

  // Set Content-Security-Policy header to suppress Electron security warning
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https:; style-src-elem 'self' 'unsafe-inline' https:; connect-src 'self' http://localhost:* ws://localhost:*; img-src 'self' data: blob: http://localhost:*; media-src 'self' blob: file: http://localhost:*; font-src 'self' data: https:;"]
      }
    });
  });

  // Load the app
  if (isDev) {
    const devPort = process.env.VITE_DEV_PORT || '5173';
    const devHost = process.env.VITE_DEV_HOST || 'localhost';
    console.log(`🔧 [MAIN] Loading dev URL: http://${devHost}:${devPort}`);
    mainWindow.loadURL(`http://${devHost}:${devPort}`);
  } else {
    console.log('🔧 [MAIN] Loading production file');
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('💥 [MAIN] Page failed to load:', { errorCode, errorDescription, validatedURL });
  });

  // F12 to toggle devtools in production
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('🔧 [MAIN] Window ready to show');
    mainWindow.show();

    if (isDev) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          // Suppress Autofill CDP errors by filtering DevTools webContents console output
          // These errors originate from devtools:// protocol page, not the app renderer
          mainWindow.webContents.on('console-message', (event, level, message) => {
            if (message.includes('Autofill.enable') || message.includes('Autofill.setAddresses')) {
              event.preventDefault();
            }
          });

          mainWindow.webContents.openDevTools({ mode: 'detach' });

          // Also filter the DevTools webContents itself (where the errors actually originate)
          const devToolsWC = mainWindow.webContents.devToolsWebContents;
          if (devToolsWC) {
            devToolsWC.on('console-message', (event, level, message) => {
              if (message.includes('Autofill.enable') || message.includes('Autofill.setAddresses')) {
                event.preventDefault();
              }
            });
          }
        }
      }, 1500);
    }
  });

  // Notify renderer about maximize/unmaximize state changes
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximize-change', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximize-change', false);
  });

  // SwiftShader mode: Do NOT auto-clear the crash marker on page load.
  // The marker persists so the app stays in safe software-rendering mode.
  // It is only cleared via the 'gpu:clearCrashMarker' IPC call (e.g. from
  // a "Retry hardware acceleration" button in settings, or after a
  // successful render completes without crashing).
  if (swiftshaderActive) {
    mainWindow.webContents.once('did-finish-load', () => {
      console.log('[MAIN] SwiftShader mode active — crash marker kept for safety');
    });
  }

  // Handle renderer crash — log details, write crash marker, show dialog
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    const crashInfo = `Renderer crashed!\nReason: ${details.reason}\nExit Code: ${details.exitCode}\nTime: ${new Date().toISOString()}`;
    console.error(`\u274c [MAIN] ${crashInfo}`);

    // Write crash log to file
    const crashLogPath = path.join(app.getPath('userData'), 'crash-log.txt');
    const logEntry = `\n${'='.repeat(60)}\n${crashInfo}\n`;
    try {
      fs.appendFileSync(crashLogPath, logEntry);
      console.log(`\u{1F4DD} [MAIN] Crash log written to: ${crashLogPath}`);
    } catch (e) {
      console.error('Failed to write crash log:', e);
    }

    // GPU crash (ACCESS_VIOLATION 0xC0000005) — write marker so next launch
    // uses SwiftShader software rendering instead.
    const isGpuCrash = details.exitCode === -1073741819 || details.reason === 'crashed';
    if (isGpuCrash && !swiftshaderActive) {
      try {
        fs.writeFileSync(CRASH_MARKER, `${new Date().toISOString()}\n${details.exitCode}\n`);
        console.log('[MAIN] GPU crash marker written — next launch will use SwiftShader');
      } catch (e) {
        console.error('Failed to write crash marker:', e);
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      const swiftMsg = isGpuCrash && !swiftshaderActive
        ? '\n\nOn next startup, software mode (SwiftShader) will be tested for GPU issues.'
        : '';
      dialog.showMessageBox({
        type: 'error',
        title: 'Renderer Crash',
        message: `Renderer process crashed`,
        detail: `Reason: ${details.reason}\nExit Code: ${details.exitCode}\n\nCrash log: ${crashLogPath}${swiftMsg}\n\nYou can continue with "Reload".`,
        buttons: ['Reload', 'Close'],
        defaultId: 0,
      }).then((result) => {
        if (result.response === 0) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (isDev) {
              const devPort = process.env.VITE_DEV_PORT || '5173';
              const devHost = process.env.VITE_DEV_HOST || 'localhost';
              mainWindow.loadURL(`http://${devHost}:${devPort}?crash_recovery=1`);
            } else {
              mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'), {
                query: { crash_recovery: '1' }
              });
            }
          }
        } else {
          app.quit();
        }
      });
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('\u26a0\ufe0f [MAIN] Window became unresponsive');
  });

  mainWindow.webContents.on('responsive', () => {
    console.log('\u2705 [MAIN] Window is responsive again');
  });

  // Handle window close — also close the preview window if open
  mainWindow.on('closed', () => {
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.close();
    }
    mainWindow = null;
  });
}

/**
 * Start the Python backend server
 */
function startPythonBackend() {
  let backendPath;
  let backendCwd;
  if (isDev) {
    backendPath = path.join(__dirname, '../../../backend/main.py');
    backendCwd = path.join(__dirname, '../../..');
  } else {
    backendPath = path.join(process.resourcesPath, 'backend/main.py');
    backendCwd = path.join(process.resourcesPath);
  }

  // Verify the backend script exists before attempting to spawn
  if (!fs.existsSync(backendPath)) {
    console.error(`❌ [MAIN] Backend script not found: ${backendPath}`);
    dialog.showErrorBox('SubMaker - Backend Not Found',
      `Backend script not found at:\n${backendPath}\n\nPlease reinstall SubMaker.`);
    return;
  }

  console.log(`🚀 [MAIN] Starting Python backend: ${backendPath}`);
  console.log(`🚀 [MAIN] Backend cwd: ${backendCwd}`);

  // Build environment for backend
  const backendEnv = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
  };
  if (!isDev) {
    backendEnv.SUBMAKER_PRODUCTION = '1';
    backendEnv.SUBMAKER_USER_DATA = path.join(app.getPath('userData'), '..', 'SubMaker');
  }

  // Try common Python executable names
  // Prefer venv Python if it exists (has all dependencies installed)
  const venvPython = process.platform === 'win32'
    ? path.join(backendCwd, 'backend', 'venv', 'Scripts', 'python.exe')
    : path.join(backendCwd, 'backend', 'venv', 'bin', 'python');

  const pythonCandidates = [];
  if (isDev && fs.existsSync(venvPython)) {
    pythonCandidates.push(venvPython);
    console.log(`🐍 [MAIN] Found venv Python: ${venvPython}`);
  }
  pythonCandidates.push(...(process.platform === 'win32'
    ? ['python', 'python3', 'py']
    : ['python3', 'python']));

  const trySpawn = (idx) => {
    if (idx >= pythonCandidates.length) {
      console.error('❌ [MAIN] No working Python executable found. Tried:', pythonCandidates.join(', '));
      dialog.showErrorBox('SubMaker - Python Not Found',
        'Python not found on this system.\n\nPlease install Python 3.10+ from https://www.python.org/downloads/\nand make sure it is added to PATH.\n\nAfter installing Python, run:\npip install flask flask-cors flask-socketio eventlet faster-whisper librosa soundfile audio-separator mutagen numpy tqdm pydub');
      return;
    }
    const pyExe = pythonCandidates[idx];
    console.log(`🔧 [MAIN] Trying: ${pyExe} ${backendPath}`);

    pythonProcess = spawn(pyExe, [backendPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: backendCwd,
      shell: true,
      env: backendEnv,
    });

    let spawnFailed = false;
    let stderrBuffer = '';

    pythonProcess.on('error', (err) => {
      spawnFailed = true;
      console.error(`❌ [MAIN] Failed to start with '${pyExe}':`, err.message);
      pythonProcess = null;
      trySpawn(idx + 1);
    });

    // If the process exits almost immediately (within 3s), try next candidate
    pythonProcess.on('close', (code) => {
      if (code !== null && code !== 0) {
        console.warn(`⚠️ [MAIN] Python (${pyExe}) exited with code ${code}`);
        // Show import errors to user
        if (stderrBuffer.includes('ModuleNotFoundError') || stderrBuffer.includes('No module named')) {
          const missingModule = stderrBuffer.match(/No module named '([^']+)'/)?.[1] || 'unknown';
          dialog.showErrorBox('SubMaker - Missing Python Package',
            `Python package '${missingModule}' is not installed.\n\nPlease run:\npip install -r backend/requirements.txt\n\nFull error:\n${stderrBuffer.slice(-500)}`);
        }
      }
      pythonProcess = null;
    });

    pythonProcess.stdout.on('data', (data) => {
      console.log(`Python: ${data.toString().trim()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      stderrBuffer += msg + '\n';
      // Flask prints startup info to stderr — that's normal
      if (msg.includes('Running on') || msg.includes('WARNING')) {
        console.log(`Python: ${msg}`);
      } else {
        console.error(`Python Error: ${msg}`);
      }
    });
  };

  trySpawn(0);
}

/**
 * Stop the Python backend
 */
function stopPythonBackend() {
  if (pythonProcess) {
    console.log('Stopping Python backend...');
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
  }
}

// App event handlers
app.whenReady().then(() => {
  console.log('🔧 [MAIN] Electron app ready');
  console.log('🔧 [MAIN] Node version:', process.version);
  console.log('🔧 [MAIN] Electron version:', process.versions.electron);
  console.log('🔧 [MAIN] Platform:', process.platform);
  
  // Check if backend is already running (e.g. started manually in dev)
  const http = require('http');
  let attempts = 0;
  const maxAttempts = 60; // 60 * 2s = 120s max wait
  
  const checkHealth = () => new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:5000/api/health', (res) => resolve(res.statusCode === 200));
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
  
  const startBackendIfNeeded = async () => {
    const alreadyRunning = await checkHealth();
    if (alreadyRunning) {
      console.log('\u2705 [MAIN] Backend already running, skipping spawn');
    } else {
      console.log('\u{1F680} [MAIN] Starting Python backend...');
      startPythonBackend();
    }
  };
  
  const waitForBackend = () => {
    attempts++;
    checkHealth().then(ok => {
      if (ok) {
        console.log(`\u2705 [MAIN] Backend ready after ${attempts * 2}s`);
        createWindow();
      } else {
        retryOrCreate();
      }
    });
  };
  
  const retryOrCreate = () => {
    if (attempts >= maxAttempts) {
      console.log('\u26a0\ufe0f [MAIN] Backend not ready after 120s, opening window anyway');
      createWindow();
    } else {
      setTimeout(waitForBackend, 2000);
    }
  };
  
  // Start backend if needed, then wait for it
  startBackendIfNeeded().then(() => {
    // In dev mode the backend may take a while to start —
    // open the window immediately and let the renderer poll health.
    if (isDev) {
      console.log('🔧 [MAIN] Dev mode: opening window immediately, renderer will poll health');
      setTimeout(createWindow, 1500);
    } else {
      setTimeout(waitForBackend, 2000);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopPythonBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopPythonBackend();
});

// =============================================================================
// SSE Proxy — route SSE requests through main process (Node.js HTTP)
// to avoid Chromium renderer ACCESS_VIOLATION crashes caused by NVIDIA DLL conflicts
// =============================================================================
ipcMain.handle('sse:request', async (event, { id, url, body }) => {
  const http = require('http');
  const urlObj = new URL(url);

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: parseInt(urlObj.port) || 5000,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      if (res.statusCode !== 200) {
        let responseBody = '';
        res.on('data', c => responseBody += c.toString());
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseBody);
            reject(new Error(parsed.error || `Server error: ${res.statusCode}`));
          } catch {
            reject(new Error(`Server returned ${res.statusCode}`));
          }
        });
        return;
      }

      let buffer = '';
      // Collect ALL SSE events, only send progress updates at throttled rate
      // and batch final result — minimize IPC traffic to prevent renderer crash
      let lastSendTime = 0;
      const THROTTLE_MS = 2000; // Only send progress every 2 seconds

      res.on('data', (chunk) => {
        if (event.sender.isDestroyed()) { req.destroy(); return; }
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (!event.sender.isDestroyed()) {
                // Always send complete/error/result events immediately
                if (data.type === 'complete' || data.type === 'error' || data.type === 'result') {
                  event.sender.send(`sse:event:${id}`, data);
                } else {
                  // Throttle progress/status/heartbeat events
                  const now = Date.now();
                  if (now - lastSendTime >= THROTTLE_MS) {
                    lastSendTime = now;
                    event.sender.send(`sse:event:${id}`, data);
                  }
                }
              }
            } catch (e) { /* skip parse errors */ }
          }
        }
      });

      res.on('end', () => {
        // Flush remaining buffer
        if (buffer.trim().startsWith('data: ')) {
          try {
            const data = JSON.parse(buffer.trim().slice(6));
            if (!event.sender.isDestroyed()) {
              event.sender.send(`sse:event:${id}`, data);
            }
          } catch (e) { /* skip */ }
        }
        if (!event.sender.isDestroyed()) {
          event.sender.send(`sse:end:${id}`);
        }
        resolve({ ok: true });
      });

      res.on('error', (err) => reject(err));
    });

    req.on('error', reject);
    req.setTimeout(600000); // 10 min timeout
    req.write(JSON.stringify(body));
    req.end();
  });
});

// =============================================================================
// Generic HTTP Proxy — route ALL renderer HTTP through Node.js to avoid
// Chromium network stack ACCESS_VIOLATION crashes during GPU operations
// =============================================================================
ipcMain.handle('ipc:fetch', async (event, { url, method, headers, body, responseType, formDataParts }) => {
  const http = require('http');
  const urlObj = new URL(url);

  return new Promise((resolve, reject) => {
    const reqHeaders = {};
    // Sanitise headers — drop undefined/null values that crash Node HTTP client
    if (headers && typeof headers === 'object') {
      for (const [key, value] of Object.entries(headers)) {
        if (value !== undefined && value !== null && typeof value !== 'object') {
          reqHeaders[key] = String(value);
        }
      }
    }
    let bodyBuf = null;

    // ── FormData multipart support ──────────────────────────────
    // When the renderer serialises a FormData into parts[], we rebuild
    // a proper multipart/form-data body here in the main process so
    // the actual HTTP request goes through Node.js, not Chromium.
    if (Array.isArray(formDataParts) && formDataParts.length > 0) {
      const boundary = `----ElectronIPC${Date.now()}${Math.random().toString(36).slice(2)}`;
      reqHeaders['Content-Type'] = `multipart/form-data; boundary=${boundary}`;

      const chunks = [];
      for (const part of formDataParts) {
        let header = `--${boundary}\r\n`;
        if (part.type === 'blob') {
          header += `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n`;
          header += `Content-Type: ${part.mime}\r\n\r\n`;
          chunks.push(Buffer.from(header, 'utf-8'));
          chunks.push(Buffer.from(part.data, 'base64'));
          chunks.push(Buffer.from('\r\n', 'utf-8'));
        } else {
          header += `Content-Disposition: form-data; name="${part.name}"\r\n\r\n`;
          header += `${part.data}\r\n`;
          chunks.push(Buffer.from(header, 'utf-8'));
        }
      }
      chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'));
      bodyBuf = Buffer.concat(chunks);
      reqHeaders['Content-Length'] = bodyBuf.length;
    } else if (body !== undefined && body !== null) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      bodyBuf = Buffer.from(bodyStr, 'utf-8');
      if (!reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
      reqHeaders['Content-Length'] = bodyBuf.length;
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port: parseInt(urlObj.port) || 5000,
      path: urlObj.pathname + urlObj.search,
      method: method || 'GET',
      headers: reqHeaders,
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        let data;
        if (responseType === 'arraybuffer') {
          // Transfer binary data as base64 (IPC can't transfer raw ArrayBuffer efficiently)
          data = buffer.toString('base64');
        } else {
          const text = buffer.toString('utf-8');
          try { data = JSON.parse(text); } catch { data = text; }
        }
        resolve({ status: res.statusCode, headers: res.headers, data });
      });
    });

    req.on('error', (err) => reject(new Error(err.message)));
    req.setTimeout(600000, () => { req.destroy(); reject(new Error('Request timeout')); });

    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
});

// =============================================================================
// IPC Handlers
// =============================================================================

// Window controls (frameless window)
ipcMain.on('window:minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window:close', () => { if (mainWindow) mainWindow.close(); });

// Open file dialog
ipcMain.handle('dialog:openFile', async (event, options) => {
  const opts = options || {};
  const props = ['openFile'];
  if (opts.multiSelections) props.push('multiSelections');
  console.log('[MAIN] dialog:openFile called, multiSelections:', !!opts.multiSelections, 'props:', props);
  const result = await dialog.showOpenDialog(mainWindow, {
    title: opts.title || undefined,
    properties: props,
    filters: opts.filters || [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'flac'] },
      { name: 'Video Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  console.log('[MAIN] dialog:openFile result:', result.canceled ? 'canceled' : result.filePaths?.length + ' files');
  return result;
});

// Open image dialog
ipcMain.handle('dialog:openImage', async () => {
  console.log('🖼️ [MAIN] Image dialog requested');
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp'] },
      ],
    });
    console.log('🖼️ [MAIN] Dialog result:', result);
    return result;
  } catch (error) {
    console.error('🖼️ [MAIN] Dialog error:', error);
    throw error;
  }
});

// Save file dialog
ipcMain.handle('dialog:saveFile', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: options.defaultPath || 'output.mp4',
    filters: options.filters || [
      { name: 'MP4 Video', extensions: ['mp4'] },
      { name: 'WebM Video', extensions: ['webm'] },
      { name: 'MOV Video', extensions: ['mov'] },
    ],
  });
  return result;
});

// Open URL in default browser
ipcMain.handle('shell:openExternal', async (event, url) => {
  // Only allow http/https URLs
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    return shell.openExternal(url);
  }
});

// Open folder in explorer (highlights the file if it exists)
ipcMain.handle('shell:openPath', async (event, filePath) => {
  const path = require('path');
  const fs = require('fs');
  const resolved = path.resolve(filePath);
  if (fs.existsSync(resolved)) {
    return shell.showItemInFolder(resolved);
  }
  // Fallback: open parent directory
  const dir = path.dirname(resolved);
  return shell.openPath(dir);
});

// Get app paths
ipcMain.handle('app:getPath', (event, name) => {
  return app.getPath(name);
});

// Check if backend is running
ipcMain.handle('backend:status', () => {
  return pythonProcess !== null;
});

// Restart backend
ipcMain.handle('backend:restart', () => {
  stopPythonBackend();
  setTimeout(startPythonBackend, 1000);
  return true;
});

// =============================================================================
// Second Display Preview Window
// =============================================================================
let previewWindow = null;

ipcMain.handle('preview:openOnSecondDisplay', async () => {
  const { screen } = require('electron');
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const second = displays.find(d => d.id !== primary.id);

  if (!second) {
    return { error: 'no_second_display' };
  }

  // Close existing preview window if open
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.close();
    previewWindow = null;
  }

  const { x, y, width, height } = second.bounds;

  previewWindow = new BrowserWindow({
    x, y, width, height,
    minWidth: 400,
    minHeight: 300,
    fullscreen: false,
    frame: false,        // custom titlebar in renderer
    transparent: true,   // allows alpha/overlay mode
    resizable: true,
    movable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const devPort = process.env.VITE_DEV_PORT || '5173';
  const devHost = process.env.VITE_DEV_HOST || 'localhost';

  if (isDev) {
    await previewWindow.loadURL(`http://${devHost}:${devPort}/?previewScreen=1`);
  } else {
    await previewWindow.loadFile(path.join(__dirname, '../../dist/index.html'), {
      query: { previewScreen: '1' },
    });
  }

  // Ensure it stays on the target display
  previewWindow.setBounds({ x, y, width, height });

  // Start in pseudo-fullscreen on the second display
  previewWindow._prevBounds = { x, y, width, height };
  previewWindow._pseudoFullscreen = true;
  previewWindow.setAlwaysOnTop(true, 'screen-saver');
  previewWindow.setBounds(second.bounds, true);

  previewWindow.on('closed', () => {
    previewWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('preview:window-closed');
    }
  });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('preview:window-opened');
  }
  return { success: true };
});

// Window controls for the PREVIEW window (sent from PreviewScreenOutput)
ipcMain.on('preview-window:minimize', () => { if (previewWindow && !previewWindow.isDestroyed()) previewWindow.minimize(); });
ipcMain.on('preview-window:maximize', () => {
  if (!previewWindow || previewWindow.isDestroyed()) return;
  // Use pseudo-fullscreen (setBounds) instead of setFullScreen to avoid
  // the Windows OS-level caption notification bar that appears on transparent windows.
  if (previewWindow._pseudoFullscreen) {
    previewWindow._pseudoFullscreen = false;
    previewWindow.setAlwaysOnTop(false);
    if (previewWindow._prevBounds) {
      previewWindow.setBounds(previewWindow._prevBounds, true);
      previewWindow._prevBounds = null;
    } else {
      previewWindow.unmaximize();
    }
  } else {
    previewWindow._prevBounds = previewWindow.getBounds();
    const display = screen.getDisplayMatching(previewWindow.getBounds());
    previewWindow._pseudoFullscreen = true;
    previewWindow.setAlwaysOnTop(true, 'screen-saver');
    previewWindow.setBounds(display.bounds, true);
  }
});
ipcMain.on('preview-window:close', () => { if (previewWindow && !previewWindow.isDestroyed()) previewWindow.close(); });

// Main window broadcasts current state to preview window on request
ipcMain.on('preview:request-state', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('preview:broadcast-now');
  }
});

ipcMain.handle('preview:close', () => {
  if (previewWindow && !previewWindow.isDestroyed()) previewWindow.close();
  return true;
});

// =============================================================================
// File System helpers (used by M3U import/export)
// =============================================================================
ipcMain.handle('fs:readTextFile', (event, filePath) => {
  const resolved = path.resolve(filePath);
  return fs.readFileSync(resolved, 'utf-8');
});

ipcMain.handle('fs:writeTextFile', (event, filePath, content) => {
  const resolved = path.resolve(filePath);
  fs.writeFileSync(resolved, content, 'utf-8');
  return true;
});

// Save file dialog + write
ipcMain.handle('fs:saveWithDialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: options.defaultPath || 'playlist.m3u',
    filters: options.filters || [{ name: 'M3U Playlist', extensions: ['m3u'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, options.content || '', 'utf-8');
  return { filePath: result.filePath };
});

// =============================================================================
// GPU / SwiftShader status
// =============================================================================
ipcMain.handle('gpu:status', () => ({
  swiftshader: swiftshaderActive,
  crashMarkerExists: fs.existsSync(CRASH_MARKER),
}));

ipcMain.handle('gpu:clearCrashMarker', () => {
  try { fs.unlinkSync(CRASH_MARKER); } catch {}
  console.log('[MAIN] Crash marker cleared by user — next launch will try hardware GPU');
  return true;
});

// =============================================================================
// Path Utilities (exposed to renderer)
// =============================================================================
ipcMain.handle('path:resolve', (event, relativePath) => {
  return path.resolve(relativePath);
});

ipcMain.handle('path:basename', (event, fullPath) => {
  return path.basename(fullPath);
});

// =============================================================================
// Visualizer Raw Pipe — stream RGBA frames from renderer to FFmpeg stdin
// Eliminates JPEG encode + HTTP upload + disk write per frame (~60% faster)
// =============================================================================
let _vizPipeProcess = null;
let _vizPipeOutputPath = null;
let _vizPipeDrainResolve = null;

ipcMain.handle('viz:pipe-start', async (event, { width, height, fps }) => {
  // Kill any leftover process
  if (_vizPipeProcess) {
    try { _vizPipeProcess.kill('SIGKILL'); } catch {}
    _vizPipeProcess = null;
  }

  // Compute output path — must match backend's TEMP_DIR so paths are consistent.
  // In production: use SUBMAKER_USER_DATA/temp (same as backend).
  // In dev: use project root's temp directory.
  let tempDir;
  if (isDev) {
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    tempDir = path.join(projectRoot, 'temp');
  } else {
    const userData = path.join(app.getPath('userData'), '..', 'SubMaker');
    tempDir = path.join(userData, 'temp');
  }
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const uuid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const outputPath = path.join(tempDir, `viz_${uuid}.mp4`);
  _vizPipeOutputPath = outputPath;

  // Detect NVENC availability — try h264_nvenc first, fall back to libx264
  const ffmpegPath = 'ffmpeg';
  const nvencArgs = [
    '-y',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${width}x${height}`,
    '-r', String(fps),
    '-i', 'pipe:0',
    '-vf', 'vflip',
    '-c:v', 'h264_nvenc',
    '-preset', 'p3',
    '-rc', 'vbr',
    '-cq', '22',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    console.log(`[VizPipe] Starting FFmpeg: ${width}x${height} @${fps}fps → ${outputPath}`);
    const proc = spawn(ffmpegPath, nvencArgs, {
      stdio: ['pipe', 'ignore', 'pipe'],
      windowsHide: true,
    });

    let stderrBuf = '';
    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      // Keep only last 2KB of stderr
      if (stderrBuf.length > 2048) stderrBuf = stderrBuf.slice(-2048);
    });

    // If FFmpeg exits immediately (e.g. NVENC not available), fall back to libx264
    let started = false;
    const earlyExitHandler = (code) => {
      if (started) return;
      console.warn(`[VizPipe] NVENC failed (exit=${code}), falling back to libx264`);

      const cpuArgs = [
        '-y',
        '-f', 'rawvideo',
        '-pix_fmt', 'rgba',
        '-s', `${width}x${height}`,
        '-r', String(fps),
        '-i', 'pipe:0',
        '-vf', 'vflip',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '22',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outputPath,
      ];

      const cpuProc = spawn(ffmpegPath, cpuArgs, {
        stdio: ['pipe', 'ignore', 'pipe'],
        windowsHide: true,
      });

      cpuProc.stderr.on('data', (chunk) => {
        stderrBuf += chunk.toString();
        if (stderrBuf.length > 2048) stderrBuf = stderrBuf.slice(-2048);
      });

      _vizPipeProcess = cpuProc;
      started = true;

      // Handle stdin errors (broken pipe if FFmpeg dies)
      cpuProc.stdin.on('error', (err) => {
        console.error('[VizPipe] stdin error (cpu):', err.message);
      });

      console.log('[VizPipe] libx264 fallback started');
      resolve({ ready: true, encoder: 'libx264' });
    };

    proc.on('exit', earlyExitHandler);

    // Give FFmpeg 500ms to start — if it's still alive, NVENC works
    setTimeout(() => {
      if (started) return;
      proc.removeListener('exit', earlyExitHandler);
      started = true;
      _vizPipeProcess = proc;

      proc.stdin.on('error', (err) => {
        console.error('[VizPipe] stdin error:', err.message);
      });

      console.log('[VizPipe] NVENC encoder ready');
      resolve({ ready: true, encoder: 'h264_nvenc' });
    }, 500);

    proc.on('error', (err) => {
      if (!started) {
        started = true;
        reject(new Error(`FFmpeg spawn failed: ${err.message}`));
      }
    });
  });
});

ipcMain.handle('viz:pipe-write', async (event, buffer) => {
  if (!_vizPipeProcess || !_vizPipeProcess.stdin || _vizPipeProcess.stdin.destroyed) {
    throw new Error('VizPipe not active');
  }

  const nodeBuf = Buffer.from(buffer);
  const canContinue = _vizPipeProcess.stdin.write(nodeBuf);

  // Backpressure: if internal buffer is full, wait for drain
  if (!canContinue) {
    await new Promise((resolve) => {
      _vizPipeDrainResolve = resolve;
      _vizPipeProcess.stdin.once('drain', () => {
        _vizPipeDrainResolve = null;
        resolve();
      });
    });
  }
});

ipcMain.handle('viz:pipe-end', async () => {
  if (!_vizPipeProcess) {
    throw new Error('VizPipe not active');
  }

  const proc = _vizPipeProcess;
  const outputPath = _vizPipeOutputPath;
  _vizPipeProcess = null;
  _vizPipeOutputPath = null;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      reject(new Error('VizPipe FFmpeg timeout (5 min)'));
    }, 5 * 60 * 1000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`FFmpeg exited with code ${code}`));
        return;
      }
      // Verify output file exists
      try {
        const stat = fs.statSync(outputPath);
        if (stat.size < 1000) {
          reject(new Error('FFmpeg produced empty output'));
          return;
        }
        const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
        console.log(`[VizPipe] Done: ${outputPath} (${sizeMB} MB)`);
        resolve({ videoPath: outputPath, fileSizeMB: parseFloat(sizeMB) });
      } catch (err) {
        reject(new Error(`Output file not found: ${outputPath}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`FFmpeg error: ${err.message}`));
    });

    // Close stdin to signal end of input
    try {
      proc.stdin.end();
    } catch (err) {
      clearTimeout(timeout);
      reject(new Error(`stdin.end() failed: ${err.message}`));
    }
  });
});

ipcMain.handle('viz:pipe-cancel', () => {
  if (_vizPipeProcess) {
    try { _vizPipeProcess.kill('SIGKILL'); } catch {}
    _vizPipeProcess = null;
  }
  // Cleanup output file
  if (_vizPipeOutputPath) {
    try { fs.unlinkSync(_vizPipeOutputPath); } catch {}
    _vizPipeOutputPath = null;
  }
  _vizPipeDrainResolve = null;
  console.log('[VizPipe] Cancelled');
  return { cancelled: true };
});

// Visualizer rendering moved to in-page canvas + Flask HTTP POST pipeline
// (no more hidden BrowserWindow / IPC render)
