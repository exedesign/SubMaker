import React from 'react';
import { useAppStore } from '../stores/appStore';
import { FiDownload, FiFolder, FiRefreshCw, FiFilm, FiX } from 'react-icons/fi';

function RenderPanel() {
  const { 
    subtitles, 
    render, 
    cancelRender,
    outputPath, 
    isProcessing,
    processingProgress,
    processingStep,
    resetProject,
    renderStats,
    renderElapsedTime,
  } = useAppStore();
  
  // Format time helper
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  if (subtitles.length === 0) return null;
  
  const handleOpenFolder = () => {
    if (outputPath) {
      window.electronAPI?.openPath(outputPath);
    }
  };
  
  return (
    <div style={{
      padding: 16,
      background: 'var(--bg-secondary)',
      borderTop: '1px solid var(--border-color)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        {outputPath ? (
          <div>
            <p style={{ color: 'var(--accent-success)', fontWeight: 500, marginBottom: 4 }}>
              ✓ Video rendered successfully! Duration: {formatTime(renderStats.lastRenderDuration)}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all', marginBottom: 4 }}>
              {outputPath}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              📊 Total renders: {renderStats.totalRenders} | Last render: {formatTime(renderStats.lastRenderDuration)}
            </p>
          </div>
        ) : isProcessing ? (
          <div>
            <p style={{ fontWeight: 500, marginBottom: 4, color: 'var(--accent-primary)' }}>
              🎬 Rendering... {processingProgress}% • {formatTime(renderElapsedTime)}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {processingStep || 'Processing...'}
            </p>
            <div style={{
              height: 4,
              background: 'var(--bg-tertiary)',
              borderRadius: 2,
              marginTop: 8,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${processingProgress}%`,
                background: 'var(--accent-primary)',
                borderRadius: 2,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        ) : (
          <div>
            <p style={{ fontWeight: 500, marginBottom: 4 }}>Ready to render</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {subtitles.length} subtitles will be burned into the video
            </p>
            {renderStats.totalRenders > 0 && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                📊 Total renders: {renderStats.totalRenders} | Last render: {formatTime(renderStats.lastRenderDuration)}
              </p>
            )}
          </div>
        )}
      </div>
      
      {outputPath ? (
        <>
          <button className="btn btn-secondary" onClick={handleOpenFolder}>
            <FiFolder /> Show in Folder
          </button>
          <button 
            className="btn btn-primary" 
            onClick={render}
            disabled={subtitles.length === 0}
            style={{ minWidth: 150 }}
          >
            <FiFilm /> Re-Render
          </button>
          <button className="btn btn-secondary" onClick={resetProject}>
            <FiRefreshCw /> New Project
          </button>
        </>
      ) : isProcessing ? (
        <button 
          className="btn btn-secondary" 
          onClick={cancelRender}
          style={{ minWidth: 120 }}
        >
          <FiX /> Cancel
        </button>
      ) : (
        <button 
          className="btn btn-primary" 
          onClick={render}
          disabled={subtitles.length === 0}
          style={{ minWidth: 150 }}
        >
          <FiFilm /> Render Video
        </button>
      )}
    </div>
  );
}

export default RenderPanel;
