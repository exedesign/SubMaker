import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAppStore } from '../stores/appStore';
import { FiUploadCloud, FiMusic, FiVideo } from 'react-icons/fi';

function VideoDropzone() {
  const { uploadFile, setMediaFile, error, clearError, addToBatchQueue } = useAppStore();

  const isAbsolutePath = (p) => {
    if (!p || typeof p !== 'string') return false;
    if (/[\\/]fakepath[\\/]/i.test(p)) return false;
    return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/');
  };

  // Resolve absolute paths for dropped files (multi-file aware)
  const resolveDroppedPaths = async (acceptedFiles) => {
    const paths = [];
    // Try preload captured paths first
    let preloadPaths = [];
    if (window.electronAPI?.getDroppedPaths) {
      preloadPaths = window.electronAPI.getDroppedPaths();
    }
    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i];
      let absPath = null;
      // Strategy 1: Preload path
      if (preloadPaths[i] && isAbsolutePath(preloadPaths[i])) {
        absPath = preloadPaths[i];
      }
      // Strategy 2: file.path
      if (!absPath && isAbsolutePath(file.path)) {
        absPath = file.path;
      }
      // Strategy 3: IPC resolve
      if (!absPath && file.path && window.electronAPI?.resolvePath) {
        try {
          const resolved = await window.electronAPI.resolvePath(file.path);
          if (isAbsolutePath(resolved)) absPath = resolved;
        } catch {}
      }
      paths.push({ file, absPath });
    }
    return paths;
  };
  
  const onDrop = useCallback(async (acceptedFiles) => {
    if (!acceptedFiles.length) return;

    try {
      const resolved = await resolveDroppedPaths(acceptedFiles);

      // Multi-file drop → batch queue
      if (resolved.length > 1) {
        const validPaths = resolved.map(r => r.absPath).filter(Boolean);
        console.log(`[Drop] Resolved ${resolved.length} files, ${validPaths.length} with absolute paths:`, validPaths);
        if (validPaths.length) {
          addToBatchQueue(validPaths);
          console.log(`[Drop] ${validPaths.length} files added to batch queue`);
        } else {
          console.warn('[Drop] No absolute paths resolved — falling back to single file upload');
          // Fallback: upload first file normally
          const { file, absPath } = resolved[0];
          await uploadFile(file, { originalPath: absPath || null });
        }
        return;
      }

      // Single file → normal flow
      const { file, absPath } = resolved[0];
      console.log('File dropped:', { name: file.name, path: absPath, size: file.size });
      await uploadFile(file, { originalPath: absPath || null });
    } catch (err) {
      console.error('Drop error:', err);
      useAppStore.getState().setError(err.message || 'File drop failed');
    }
  }, [uploadFile, addToBatchQueue]);
  
  // In browser mode, disable click-to-open (browser file picker can't provide real paths)
  // Drag-and-drop still works for FormData upload fallback
  const isElectron = !!window.electronAPI?.openFile;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac'],
      'video/*': ['.mp4', '.mkv', '.avi', '.mov', '.webm'],
    },
    maxFiles: 100,
    noClick: true, // Always handle click manually — routes to Electron or backend dialog
  });
  
  const openFileDialog = async (fileType = 'media') => {
    try {
      // Strategy 1: Electron IPC dialog (when running in Electron)
      if (window.electronAPI?.openFile) {
        const result = await window.electronAPI.openFile({
          filters: [
            { name: 'Media Files', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'mp4', 'mkv', 'avi', 'mov', 'webm'] },
            { name: 'Audio Files', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'] },
            { name: 'Video Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] },
          ],
        });

        if (result && !result.canceled && result.filePaths?.length > 0) {
          const filePath = result.filePaths[0];
          console.log('File selected via Electron dialog:', filePath);

          const fileName = window.electronAPI.getBasename
            ? await window.electronAPI.getBasename(filePath)
            : filePath.split(/[\\/]/).pop();
          const file = new File([], fileName);

          await uploadFile(file, { originalPath: filePath });
        }
        return;
      }

      // Strategy 2: Backend native dialog (browser mode — opens Windows file picker via backend)
      const { browseFile } = useAppStore.getState();
      await browseFile(fileType);
    } catch (err) {
      console.error('File dialog error:', err);
      useAppStore.getState().setError(err.message || 'File selection failed');
    }
  };
  
  return (
    <div style={{ maxWidth: 600, width: '100%', padding: 20, margin: '0 auto' }}>
      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? 'active' : ''}`}
        style={{ marginBottom: 20, cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); openFileDialog('media'); }}
      >
        <input {...getInputProps()} />
        <div className="dropzone-icon">
          <FiUploadCloud size={64} />
        </div>
        <p className="dropzone-text" style={{ fontSize: 18, marginBottom: 8 }}>
          {isDragActive ? (
            'Drop your file here...'
          ) : (
            <>Click to select or <strong>drag & drop</strong> your file</>
          )}
        </p>
        <p className="dropzone-text" style={{ fontSize: 14 }}>
          Supports MP3, WAV, M4A, MP4, MKV, AVI, MOV
        </p>
      </div>
      
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => openFileDialog('audio')}>
          <FiMusic /> Select Audio
        </button>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => openFileDialog('video')}>
          <FiVideo /> Select Video
        </button>
      </div>
      
      {error && (
        <div 
          style={{ 
            marginTop: 20, 
            padding: 12, 
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--accent-error)',
            borderRadius: 8,
            color: 'var(--accent-error)',
          }}
        >
          {error}
          <button 
            onClick={clearError}
            style={{ marginLeft: 12, color: 'inherit', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}
      
      <div style={{ marginTop: 40, textAlign: 'center' }}>
        <h3 style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>How it works</h3>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              width: 48, height: 48, borderRadius: '50%', 
              background: 'var(--bg-tertiary)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 8px',
              color: 'var(--accent-primary)',
              fontWeight: 'bold'
            }}>1</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Upload audio</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              width: 48, height: 48, borderRadius: '50%', 
              background: 'var(--bg-tertiary)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 8px',
              color: 'var(--accent-primary)',
              fontWeight: 'bold'
            }}>2</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>AI transcribes</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              width: 48, height: 48, borderRadius: '50%', 
              background: 'var(--bg-tertiary)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 8px',
              color: 'var(--accent-primary)',
              fontWeight: 'bold'
            }}>3</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Edit & style</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              width: 48, height: 48, borderRadius: '50%', 
              background: 'var(--bg-tertiary)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 8px',
              color: 'var(--accent-primary)',
              fontWeight: 'bold'
            }}>4</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Export video</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              width: 48, height: 48, borderRadius: '50%', 
              background: 'var(--bg-tertiary)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 8px',
              color: 'var(--accent-primary)',
              fontWeight: 'bold'
            }}>5</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Karaoke</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoDropzone;
