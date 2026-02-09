/**
 * SubMaker Electron Main Process
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

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
      enableRemoteModule: false,
      webSecurity: true,
    },
    titleBarStyle: 'hiddenInset',
    frame: process.platform === 'darwin' ? true : true,
    show: false,
  });

  // Load the app
  if (isDev) {
    console.log('🔧 [MAIN] Loading dev URL: http://localhost:5173');
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    console.log('🔧 [MAIN] Loading production file');
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('🔧 [MAIN] Window ready to show');
    mainWindow.show();
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
  
  // Start backend first
  startPythonBackend();
  
  // Wait a bit for backend to start, then create window
  setTimeout(createWindow, 2000);

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
// IPC Handlers
// =============================================================================

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

// Open folder in explorer
ipcMain.handle('shell:openPath', async (event, filePath) => {
  return shell.showItemInFolder(filePath);
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
