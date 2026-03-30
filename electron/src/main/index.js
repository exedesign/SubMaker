/**
 * SubMaker Electron Main Process
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
// vizRenderManager removed — viz rendering now happens in-page + Flask

// NOTE: Do NOT use app.disableHardwareAcceleration() — it crashes WebGL components
// (Butterchurn visualizer etc.) at startup. The IPC HTTP proxy handles the original
// crash cause (Chromium network stack during GPU operations) without disabling GPU.

// Workaround for NVIDIA ACCESS_VIOLATION (0xC0000005) crash on renderer start.
// The GPU sandbox interacts badly with certain NVIDIA drivers in Electron 28.
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('no-sandbox');

// Use a separate user data dir in dev to avoid profile lock with other instances
if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('userData'), 'dev'));
}

// Keep references to prevent garbage collection
let mainWindow = null;
let pythonProcess = null;

// Development mode check
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/**
 * Create the main application window
 */
function createWindow() {
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

  // Load the app
  if (isDev) {
    const devPort = process.env.VITE_DEV_PORT || '5173';
    console.log(`🔧 [MAIN] Loading dev URL: http://127.0.0.1:${devPort}`);
    mainWindow.loadURL(`http://127.0.0.1:${devPort}`);
    mainWindow.webContents.openDevTools();
  } else {
    console.log('🔧 [MAIN] Loading production file');
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

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
  });

  // Notify renderer about maximize/unmaximize state changes
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximize-change', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximize-change', false);
  });

  // Handle renderer crash — log details and show dialog before reload
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    const crashInfo = `Renderer crashed!\nReason: ${details.reason}\nExit Code: ${details.exitCode}\nTime: ${new Date().toISOString()}`;
    console.error(`\u274c [MAIN] ${crashInfo}`);
    
    // Write crash log to file
    const fs = require('fs');
    const crashLogPath = path.join(app.getPath('userData'), 'crash-log.txt');
    const logEntry = `\n${'='.repeat(60)}\n${crashInfo}\n`;
    try {
      fs.appendFileSync(crashLogPath, logEntry);
      console.log(`\u{1F4DD} [MAIN] Crash log written to: ${crashLogPath}`);
    } catch (e) {
      console.error('Failed to write crash log:', e);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox({
        type: 'error',
        title: 'Renderer Crash',
        message: `Renderer process crashed`,
        detail: `Reason: ${details.reason}\nExit Code: ${details.exitCode}\n\nCrash log: ${crashLogPath}\n\n"Yeniden Yükle" ile devam edebilirsiniz.`,
        buttons: ['Yeniden Yükle', 'Kapat'],
        defaultId: 0,
      }).then((result) => {
        if (result.response === 0) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (isDev) {
              const devPort = process.env.VITE_DEV_PORT || '5173';
              mainWindow.loadURL(`http://127.0.0.1:${devPort}?crash_recovery=1`);
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

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Start the Python backend server
 */
function startPythonBackend() {
  const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
  
  let backendPath;
  if (isDev) {
    backendPath = path.join(__dirname, '../../../backend/main.py');
  } else {
    backendPath = path.join(process.resourcesPath, 'backend/main.py');
  }

  console.log(`Starting Python backend: ${backendPath}`);

  pythonProcess = spawn(pythonPath, [backendPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`Python: ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Python Error: ${data}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`Python process exited with code ${code}`);
    pythonProcess = null;
  });

  pythonProcess.on('error', (err) => {
    console.error('Failed to start Python backend:', err);
  });
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
    setTimeout(waitForBackend, 2000);
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
ipcMain.handle('ipc:fetch', async (event, { url, method, headers, body, responseType }) => {
  const http = require('http');
  const urlObj = new URL(url);

  return new Promise((resolve, reject) => {
    const reqHeaders = { ...(headers || {}) };
    let bodyStr = null;

    if (body !== undefined && body !== null) {
      bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      if (!reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
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

    if (bodyStr) req.write(bodyStr);
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
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options.filters || [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'flac'] },
      { name: 'Video Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
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
// Path Utilities (exposed to renderer)
// =============================================================================
ipcMain.handle('path:resolve', (event, relativePath) => {
  return path.resolve(relativePath);
});

ipcMain.handle('path:basename', (event, fullPath) => {
  return path.basename(fullPath);
});

// Visualizer rendering moved to in-page canvas + Flask HTTP POST pipeline
// (no more hidden BrowserWindow / IPC render)
