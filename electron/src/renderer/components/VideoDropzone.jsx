import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAppStore } from '../stores/appStore';
import { FiUploadCloud, FiMusic, FiVideo } from 'react-icons/fi';

function VideoDropzone() {
  const { uploadFile, setMediaFile, error, clearError } = useAppStore();
  
  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      await uploadFile(file);
    }
  }, [uploadFile]);
  
  const { getRootProps, getInputProps, isDragActive, isDragAccept } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac'],
      'video/*': ['.mp4', '.mkv', '.avi', '.mov', '.webm'],
    },
    maxFiles: 1,
  });
  
  const openFileDialog = async () => {
    try {
      const result = await window.electronAPI?.openFile({
        filters: [
          { name: 'Audio Files', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'flac'] },
          { name: 'Video Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] },
        ],
      });
      
      if (result && !result.canceled && result.filePaths.length > 0) {
        // Simulating file upload by setting path directly for electron
        const filePath = result.filePaths[0];
        const ext = filePath.split('.').pop().toLowerCase();
        const audioExts = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'];
        const fileType = audioExts.includes(ext) ? 'audio' : 'video';
        
        setMediaFile(filePath, fileType);
        useAppStore.getState().setCurrentStep('transcribe');
      }
    } catch (err) {
      console.error('File dialog error:', err);
    }
  };
  
  return (
    <div style={{ maxWidth: 600, width: '100%', padding: 20, margin: '0 auto' }}>
      <div 
        {...getRootProps()} 
        className={`dropzone ${isDragActive ? 'active' : ''}`}
        style={{ marginBottom: 20 }}
      >
        <input {...getInputProps()} />
        <div className="dropzone-icon">
          <FiUploadCloud size={64} />
        </div>
        <p className="dropzone-text" style={{ fontSize: 18, marginBottom: 8 }}>
          {isDragActive ? (
            'Drop your file here...'
          ) : (
            <>Drag & drop your <strong>audio</strong> or <strong>video</strong> file</>
          )}
        </p>
        <p className="dropzone-text" style={{ fontSize: 14 }}>
          Supports MP3, WAV, M4A, MP4, MKV, AVI, MOV
        </p>
      </div>
      
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={openFileDialog}>
          <FiMusic /> Select Audio
        </button>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={openFileDialog}>
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
        </div>
      </div>
    </div>
  );
}

export default VideoDropzone;
