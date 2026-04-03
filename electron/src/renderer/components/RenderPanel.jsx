import React from 'react';
import { useAppStore } from '../stores/appStore';
import { FiFolder, FiRefreshCw, FiFilm, FiX, FiEdit3, FiCheck, FiAlertCircle } from 'react-icons/fi';

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
    batchRenderActive,
    batchRenderResults,
    batchRenderTotal,
    batchRenderCurrent,
    selectedFormats,
  } = useAppStore();

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

  const isMultiFormat = selectedFormats.length > 1;
  const formatLabels = { horizontal: '16:9', vertical: '9:16', square: '1:1' };
  const renderLabel = isMultiFormat
    ? `Render (${selectedFormats.map(f => formatLabels[f]).join(', ')})`
    : 'Render Video';

  return (
    <div style={{
      padding: 16,
      background: 'var(--bg-secondary)',
      borderTop: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          {outputPath && !batchRenderActive ? (
            <div>
              <p style={{ color: 'var(--accent-success)', fontWeight: 500, marginBottom: 4 }}>
                ✓ Video rendered successfully! Duration: {formatTime(renderStats.lastRenderDuration)}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all', marginBottom: 4 }}>
                {outputPath}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Total renders: {renderStats.totalRenders} | Last render: {formatTime(renderStats.lastRenderDuration)}
              </p>
            </div>
          ) : isProcessing ? (
            <div>
              <p style={{ fontWeight: 500, marginBottom: 4, color: 'var(--accent-primary)' }}>
                {batchRenderActive
                  ? `Rendering ${formatLabels[selectedFormats[batchRenderCurrent - 1]] || ''} (${batchRenderCurrent}/${batchRenderTotal})`
                  : 'Rendering...'
                } {processingProgress}% • {formatTime(renderElapsedTime)}
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
                  background: batchRenderActive ? 'var(--accent-success)' : 'var(--accent-primary)',
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
                {isMultiFormat && ` • ${selectedFormats.length} format`}
              </p>
              {renderStats.totalRenders > 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Total renders: {renderStats.totalRenders} | Last render: {formatTime(renderStats.lastRenderDuration)}
                </p>
              )}
            </div>
          )}
        </div>

        {outputPath && !isProcessing ? (
          <>
            <button className="btn btn-secondary" onClick={handleOpenFolder}>
              <FiFolder /> Show in Folder
            </button>
            <button
              className="btn btn-primary"
              onClick={render}
              disabled={subtitles.length === 0}
              style={{ minWidth: 130 }}
            >
              <FiFilm /> {renderLabel}
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
          <>
            <button
              className="btn btn-secondary"
              onClick={() => useAppStore.getState().setCurrentStep('edit')}
              style={{ minWidth: 120 }}
            >
              <FiEdit3 /> Back to Edit
            </button>
            <button
              className="btn btn-primary"
              onClick={render}
              disabled={subtitles.length === 0}
              style={{ minWidth: 130 }}
            >
              <FiFilm /> {renderLabel}
            </button>
          </>
        )}
      </div>

      {/* Multi-format render results */}
      {batchRenderResults.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
        }}>
          {batchRenderResults.map((r, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                background: r.success ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                color: r.success ? 'var(--accent-success)' : 'var(--accent-error)',
                border: `1px solid ${r.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              }}
            >
              {r.success ? <FiCheck size={12} /> : <FiAlertCircle size={12} />}
              {r.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RenderPanel;
