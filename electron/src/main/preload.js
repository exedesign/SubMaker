/**
 * Preload script for Electron
 * Exposes safe APIs to the renderer process
 */
const { contextBridge, ipcRenderer } = require('electron');

console.log('🔧 [PRELOAD] Script loaded successfully');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // File dialogs
  openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  openImage: () => {
    console.log('🖼️ [PRELOAD] openImage called');
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
});

console.log('🔧 [PRELOAD] electronAPI exposed to window object');

// Expose API URL
contextBridge.exposeInMainWorld('API_URL', 'http://localhost:5000/api');
