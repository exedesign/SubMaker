/**
 * Preload script for Electron
 * Exposes safe APIs to the renderer process
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

console.log('[PRELOAD] Script loaded successfully');

// ─── Capture real file paths from drag-and-drop ───────────────────────
// With contextIsolation the preload shares the DOM but has its own JS context.
// Electron patches File objects with an absolute `.path` property in this
// privileged context even when the renderer cannot see it.
let _lastDroppedPaths = [];

function capturePaths(fileList, sourceLabel) {
  _lastDroppedPaths = [];

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    // Electron 32+ removed File.path; use webUtils.getPathForFile instead
    const p = webUtils.getPathForFile(file);
    if (p && p.length > 0 && p !== file.name) {
      _lastDroppedPaths.push(p);
    }
  }

  if (_lastDroppedPaths.length > 0) {
    console.log(`[PRELOAD] Captured ${sourceLabel} paths:`, _lastDroppedPaths);
  }
}

function setupFilePathCaptureListeners() {
  document.addEventListener('drop', (event) => {
    try {
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        capturePaths(files, 'drop');
      }
    } catch (error) {
      console.error('[PRELOAD] Drop path capture failed:', error);
    }
  }, true); // capture phase — fires before react-dropzone's handler

  // Also capture from <input type="file"> change events (for click-to-select)
  document.addEventListener('change', (event) => {
    try {
      if (event.target?.type === 'file' && event.target.files?.length > 0) {
        capturePaths(event.target.files, 'input');
      }
    } catch (error) {
      console.error('[PRELOAD] Input path capture failed:', error);
    }
  }, true);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', setupFilePathCaptureListeners, { once: true });
} else {
  setupFilePathCaptureListeners();
}

function streamViaMain(request, onEvent) {
  const id = `sse-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const eventChannel = `sse:event:${id}`;
  const endChannel = `sse:end:${id}`;

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      ipcRenderer.removeListener(eventChannel, handleEvent);
      ipcRenderer.removeListener(endChannel, handleEnd);
    };

    const handleEvent = (_event, payload) => {
      if (typeof onEvent === 'function') {
        try {
          onEvent(payload);
        } catch (error) {
          console.error('[PRELOAD] SSE event callback failed:', error);
        }
      }
    };

    const handleEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ ok: true });
    };

    ipcRenderer.on(eventChannel, handleEvent);
    ipcRenderer.once(endChannel, handleEnd);

    ipcRenderer.invoke('sse:request', { id, ...request }).then((result) => {
      if (settled || result?.ok !== false) return;
      settled = true;
      cleanup();
      reject(new Error('SSE request failed'));
    }).catch((error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
  });
}

// ─── Expose APIs to renderer ──────────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  // File dialogs
  openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  openImage: () => {
    console.log('[PRELOAD] openImage called');
    return ipcRenderer.invoke('dialog:openImage');
  },
  saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),

  // Shell operations
  openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // App info
  getAppPath: (name) => ipcRenderer.invoke('app:getPath', name),

  // Backend control
  getBackendStatus: () => ipcRenderer.invoke('backend:status'),
  restartBackend: () => ipcRenderer.invoke('backend:restart'),

  // GPU / SwiftShader status
  getGpuStatus: () => ipcRenderer.invoke('gpu:status'),
  clearGpuCrashMarker: () => ipcRenderer.invoke('gpu:clearCrashMarker'),

  // Network proxies
  fetchViaMain: (request) => ipcRenderer.invoke('ipc:fetch', request),
  streamViaMain,

  // Platform info
  platform: process.platform,
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux',

  // Path utilities
  resolvePath: (path) => ipcRenderer.invoke('path:resolve', path),
  getBasename: (path) => ipcRenderer.invoke('path:basename', path),

  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow:    () => ipcRenderer.send('window:close'),
  onMaximizeChange:  (cb) => ipcRenderer.on('window:maximize-change',  (_e, v) => cb(null, v)),
  offMaximizeChange: (cb) => ipcRenderer.removeListener('window:maximize-change', cb),

  // Preview window controls (used inside the second display window)
  previewMinimize: () => ipcRenderer.send('preview-window:minimize'),
  previewMaximize: () => ipcRenderer.send('preview-window:maximize'),
  previewClose:    () => ipcRenderer.send('preview-window:close'),
  // Request main window to broadcast current state immediately
  requestPreviewState: () => ipcRenderer.send('preview:request-state'),
  onPreviewBroadcastNow: (cb) => ipcRenderer.on('preview:broadcast-now', cb),
  offPreviewBroadcastNow: (cb) => ipcRenderer.removeListener('preview:broadcast-now', cb),

  // Second display preview
  openPreviewOnSecondDisplay: () => ipcRenderer.invoke('preview:openOnSecondDisplay'),
  closePreviewWindow: () => ipcRenderer.invoke('preview:close'),
  onPreviewWindowOpened:  (cb) => ipcRenderer.on('preview:window-opened', cb),
  offPreviewWindowOpened: (cb) => ipcRenderer.removeListener('preview:window-opened', cb),
  onPreviewWindowClosed:  (cb) => ipcRenderer.on('preview:window-closed', cb),
  offPreviewWindowClosed: (cb) => ipcRenderer.removeListener('preview:window-closed', cb),

  // File system helpers
  readTextFile: (filePath) => ipcRenderer.invoke('fs:readTextFile', filePath),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('fs:writeTextFile', filePath, content),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('fs:fileExists', filePath),
  saveWithDialog: (options) => ipcRenderer.invoke('fs:saveWithDialog', options),

  // Drag-and-drop path capture (preload has privileged access to File.path)
  getDroppedPaths: () => [..._lastDroppedPaths],

  // Visualizer raw pipe — stream raw RGBA frames to FFmpeg via IPC
  vizPipeStart: (opts) => ipcRenderer.invoke('viz:pipe-start', opts),
  vizPipeWrite: (buffer) => ipcRenderer.invoke('viz:pipe-write', buffer),
  vizPipeEnd: () => ipcRenderer.invoke('viz:pipe-end'),
  vizPipeCancel: () => ipcRenderer.invoke('viz:pipe-cancel'),
});

console.log('[PRELOAD] electronAPI exposed to window object');

// Expose API URL
contextBridge.exposeInMainWorld('API_URL', 'http://localhost:5000/api');
