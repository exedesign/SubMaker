/**
 * Preload script for Electron
 * Exposes safe APIs to the renderer process
 */
const { contextBridge, ipcRenderer } = require('electron');

console.log('[PRELOAD] Script loaded successfully');

// ─── Capture real file paths from drag-and-drop ───────────────────────
// With contextIsolation the preload shares the DOM but has its own JS context.
// Electron patches File objects with an absolute `.path` property in this
// privileged context even when the renderer cannot see it.
let _lastDroppedPaths = [];

document.addEventListener('drop', (event) => {
  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    _lastDroppedPaths = [];
    for (let i = 0; i < files.length; i++) {
      const p = files[i].path;
      if (p && p.length > 0 && p !== files[i].name) {
        _lastDroppedPaths.push(p);
      }
    }
    if (_lastDroppedPaths.length > 0) {
      console.log('[PRELOAD] Captured drop paths:', _lastDroppedPaths);
    }
  }
}, true); // capture phase — fires before react-dropzone's handler

// Also capture from <input type="file"> change events (for click-to-select)
document.addEventListener('change', (event) => {
  if (event.target?.type === 'file' && event.target.files?.length > 0) {
    _lastDroppedPaths = [];
    for (let i = 0; i < event.target.files.length; i++) {
      const p = event.target.files[i].path;
      if (p && p.length > 0 && p !== event.target.files[i].name) {
        _lastDroppedPaths.push(p);
      }
    }
    if (_lastDroppedPaths.length > 0) {
      console.log('[PRELOAD] Captured input paths:', _lastDroppedPaths);
    }
  }
}, true);

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

  // App info
  getAppPath: (name) => ipcRenderer.invoke('app:getPath', name),

  // Backend control
  getBackendStatus: () => ipcRenderer.invoke('backend:status'),
  restartBackend: () => ipcRenderer.invoke('backend:restart'),

  // Platform info
  platform: process.platform,
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux',

  // Path utilities
  resolvePath: (path) => ipcRenderer.invoke('path:resolve', path),
  getBasename: (path) => ipcRenderer.invoke('path:basename', path),

  // Drag-and-drop path capture (preload has privileged access to File.path)
  getDroppedPaths: () => [..._lastDroppedPaths],
});

console.log('[PRELOAD] electronAPI exposed to window object');

// Expose API URL
contextBridge.exposeInMainWorld('API_URL', 'http://localhost:5000/api');
