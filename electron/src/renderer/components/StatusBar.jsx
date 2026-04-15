import React from 'react';
import { useAppStore } from '../stores/appStore';
import { fetchJson } from '../services/electronTransport';
import { 
  FiFolder, FiClock, FiMusic, FiEdit3, FiVideo, FiCheck, 
  FiLoader, FiMic, FiFilm, FiX, FiImage 
} from 'react-icons/fi';

function StatusBar() {
  const { 
    backendStatus, 
    mediaFile, 
    originalFileName,
    subtitles, 
    currentStep,
    isProcessing,
    processingStep,
    processingProgress,
    currentTranscriptText,
    outputPath,
    mediaDuration,
    cancelRender,
    renderJobId,
    renderElapsedTime,
    batchRenderActive,
    batchRenderCurrent,
    batchRenderTotal,
    selectedFormats,
    vocalSeparating,
    vocalSeparationProgress,
    vocalSeparationMessage,
    cancelVocalSeparation,
    batch,
    cancelBatch,
  } = useAppStore();
  
  const openOutputFolder = async () => {
    try {
      if (window.electronAPI?.openPath) {
        if (outputPath) {
          await window.electronAPI.openPath(outputPath);
        } else {
          // Ask backend for the configured output directory
          const res = await fetchJson('http://localhost:5000/api/output-dir');
          const defaultOutput = res?.output_dir || '.';
          await window.electronAPI.openPath(defaultOutput);
        }
      } else {
        // Browser mode - open via backend
        const folderPath = outputPath 
          ? outputPath.substring(0, outputPath.lastIndexOf('\\'))
          : null;
        
        if (folderPath) {
          await fetchJson(`http://localhost:5000/api/open-folder?path=${encodeURIComponent(folderPath)}`);
        } else {
          // Open configured output directory
          const res = await fetchJson('http://localhost:5000/api/output-dir');
          if (res?.output_dir) {
            await fetchJson(`http://localhost:5000/api/open-folder?path=${encodeURIComponent(res.output_dir)}`);
          }
        }
      }
    } catch (error) {
      console.error('Error opening output folder:', error);
    }
  };
  
  const formatDuration = (seconds) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const getProcessType = () => {
    if (vocalSeparating) return 'vocal';
    const step = processingStep?.toLowerCase() || '';
    if (step.includes('cover art') || step.includes('flux') || step.includes('diffusion step') || step.includes('text encoder') || step.includes('pipeline ready') || step.includes('image generation')) {
      return 'coverart';
    }
    if (step.includes('transcri') || step.includes('transkrip') || step.includes('model') || step.includes('whisper')) {
      return 'transcribe';
    }
    if (step.includes('render') || step.includes('video') || step.includes('subtitle') || step.includes('ffmpeg') || step.includes('generat')) {
      return 'render';
    }
    if (step.includes('upload')) {
      return 'upload';
    }
    return 'other';
  };
  
  const processType = getProcessType();
  
  // Effective progress values: vocal isolation progress takes priority when active
  const effectiveProgress = vocalSeparating ? vocalSeparationProgress : (processingProgress || 0);
  const effectiveStep = vocalSeparating ? vocalSeparationMessage : (currentTranscriptText ? `"${currentTranscriptText}"` : processingStep);
  const effectiveCancel = vocalSeparating && !isProcessing ? cancelVocalSeparation : cancelRender;

  // Batch processing mode — takes priority over single-file processing display
  if (batch.isRunning) {
    const bq = batch.queue;
    const completedCount = bq.filter(q => q.status === 'completed').length;
    const currentItem = bq.find(q => q.status === 'processing');
    // Overall = completed items + fraction of current item's progress
    const overallProgress = bq.length
      ? Math.round(((completedCount + (currentItem ? (currentItem.progress || 0) / 100 : 0)) / bq.length) * 100)
      : 0;
    const itemStep = currentItem?.step || effectiveStep || 'Processing...';
    const itemProgress = currentItem?.progress || effectiveProgress || 0;

    return (
      <div className="status-bar processing-mode">
        <div className="status-process-full">
          <div className="process-header">
            <FiLoader className="process-icon spin" size={18} />
            <span className="process-title">
              Batch {completedCount + 1}/{bq.length}
              {currentItem ? ` — ${currentItem.fileName}` : ''}
            </span>
          </div>
          <div className="process-progress-wrapper">
            <div className="process-progress-bar">
              <div className="process-progress-fill batch" style={{ width: `${itemProgress}%` }} />
            </div>
            <span className="process-percent">{itemProgress}%</span>
          </div>
          <div className="process-status">
            <span className="process-step">{itemStep}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8 }}>
              Overall: {overallProgress}%
            </span>
          </div>
          <button
            className="process-cancel-btn"
            onClick={cancelBatch}
            style={{ display: 'flex', alignItems: 'center', gap: 6, width: 'auto', padding: '0 10px', fontSize: 11, fontWeight: 500 }}
          >
            <FiX size={14} />
            <span>Cancel Batch</span>
          </button>
        </div>
      </div>
    );
  }
  
  if (isProcessing || vocalSeparating) {
    const formatLabels = { horizontal: '16:9', vertical: '9:16', square: '1:1' };
    const elapsedStr = renderElapsedTime > 0 ? formatDuration(renderElapsedTime) : null;
    const batchLabel = batchRenderActive
      ? ` (${formatLabels[selectedFormats[batchRenderCurrent - 1]] || ''} ${batchRenderCurrent}/${batchRenderTotal})`
      : '';

    return (
      <div className="status-bar processing-mode">
        <div className="status-process-full">
          {/* Icon and title */}
          <div className="process-header">
            {processType === 'transcribe' && <FiMic className="process-icon pulse" size={18} />}
            {processType === 'render' && <FiFilm className="process-icon spin-slow" size={18} />}
            {processType === 'upload' && <FiMusic className="process-icon" size={18} />}
            {processType === 'vocal' && <FiMusic className="process-icon pulse" size={18} />}
            {processType === 'coverart' && <FiImage className="process-icon pulse" size={18} />}
            {processType === 'other' && <FiLoader className="process-icon spin" size={18} />}
            
            <span className="process-title">
              {processType === 'transcribe' && 'Transcription'}
              {processType === 'render' && `Rendering${batchLabel}`}
              {processType === 'upload' && 'Uploading File'}
              {processType === 'vocal' && 'Vocal Isolation'}
              {processType === 'coverart' && 'Cover Art Generation'}
              {processType === 'other' && 'Processing'}
            </span>
            {elapsedStr && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>
                <FiClock size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} />{elapsedStr}
              </span>
            )}
          </div>
          
          {/* Progress bar */}
          <div className="process-progress-wrapper">
            <div className="process-progress-bar">
              <div 
                className={`process-progress-fill ${processType}`}
                style={{ width: `${effectiveProgress}%` }}
              />
            </div>
            <span className="process-percent">{effectiveProgress}%</span>
          </div>
          
          {/* Status message or recognized text */}
          <div className="process-status">
            <span className="process-step">
              {effectiveStep}
            </span>
          </div>
          
          <button
            className="process-cancel-btn"
            onClick={effectiveCancel}
            title="Cancel"
            style={{ display: 'flex', alignItems: 'center', gap: 6, width: 'auto', padding: '0 10px', fontSize: 11, fontWeight: 500, marginLeft: 'auto', flexShrink: 0 }}
          >
            <FiX size={14} />
            <span>Cancel {processType === 'transcribe' ? 'Transcription' : processType === 'render' ? 'Render' : processType === 'upload' ? 'Upload' : processType === 'vocal' ? 'Separation' : processType === 'coverart' ? 'Generation' : 'Process'}</span>
          </button>
        </div>
      </div>
    );
  }
  
  // Normal durum
  return (
    <div className="status-bar">
      {/* Sol: Backend durumu */}
      <div className="status-section left">
        <div className="status-item">
          <span 
            className={`status-dot ${
              backendStatus === 'online' ? '' : 
              backendStatus === 'checking' ? 'loading' : 'offline'
            }`}
          />
          <span className="status-label">
            {backendStatus === 'online' ? 'Connected' :
             backendStatus === 'checking' ? 'Checking...' : 'Offline'}
          </span>
        </div>
        
        {mediaFile && (
          <>
            <div className="status-divider" />
            <div className="status-item file-info">
              <FiMusic size={12} />
              <span className="status-label truncate" title={originalFileName || mediaFile}>
                {originalFileName || (mediaFile ? mediaFile.split(/[/\\]/).pop() : '')}
              </span>
            </div>
            
            {mediaDuration > 0 && (
              <div className="status-item">
                <FiClock size={12} />
                <span className="status-label">{formatDuration(mediaDuration)}</span>
              </div>
            )}
          </>
        )}
        
        {subtitles.length > 0 && (
          <>
            <div className="status-divider" />
            <div className="status-item">
              <span className="status-badge">{subtitles.length}</span>
              <span className="status-label">subtitles</span>
            </div>
          </>
        )}
      </div>
      
      {/* Center: Step info */}
      <div className="status-section center">
        <div className="status-step">
          {currentStep === 'upload' && <FiMusic size={14} />}
          {currentStep === 'transcribe' && <FiMic size={14} />}
          {currentStep === 'edit' && <FiEdit3 size={14} />}
          {(currentStep === 'style' || currentStep === 'render') && <FiFilm size={14} />}
          {currentStep === 'complete' && <FiCheck size={14} style={{ color: 'var(--accent-success)' }} />}
          <span>
            {currentStep === 'upload' && 'Upload File'}
            {currentStep === 'transcribe' && 'Transcribe'}
            {currentStep === 'edit' && 'Edit'}
            {(currentStep === 'style' || currentStep === 'render') && 'Render Video'}
            {currentStep === 'complete' && 'Complete'}
          </span>
        </div>
      </div>
      
      {/* Right: Output folder */}
      <div className="status-section right">
        {outputPath ? (
          <button 
            className="status-output-btn success"
            onClick={openOutputFolder}
            title={`Output: ${outputPath}`}
          >
            <FiCheck size={14} />
            <span>Open Output</span>
            <FiFolder size={14} />
          </button>
        ) : (
          <button 
            className="status-output-btn"
            onClick={openOutputFolder}
            title="Open output folder"
          >
            <FiFolder size={14} />
            <span>Output</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default StatusBar;
