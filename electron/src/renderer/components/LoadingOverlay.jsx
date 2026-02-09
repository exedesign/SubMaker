import React from 'react';
import { useAppStore } from '../stores/appStore';

function LoadingOverlay() {
  const { isProcessing, processingStep, processingProgress, currentTranscriptText } = useAppStore();
  
  if (!isProcessing) return null;
  
  return (
    <div className="loading-overlay">
      <div className="loading-spinner" />
      <p className="loading-text" style={{ marginTop: 16, fontWeight: 500 }}>
        {processingStep || 'Processing...'}
      </p>
      {processingProgress > 0 && (
        <div style={{ width: 300, marginTop: 16 }}>
          <div className="progress-bar">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${processingProgress}%` }} 
            />
          </div>
          <p style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            {processingProgress}%
          </p>
        </div>
      )}
      
      {/* Show current transcription text */}
      {currentTranscriptText && (
        <div style={{
          marginTop: 20,
          padding: '12px 20px',
          background: 'var(--bg-tertiary)',
          borderRadius: 8,
          maxWidth: 400,
          textAlign: 'center',
        }}>
          <p style={{ 
            fontSize: 11, 
            color: 'var(--text-muted)', 
            marginBottom: 6,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Tanınan metin:
          </p>
          <p style={{ 
            fontSize: 14, 
            color: 'var(--text-primary)',
            fontStyle: 'italic',
          }}>
            "{currentTranscriptText}"
          </p>
        </div>
      )}
    </div>
  );
}

export default LoadingOverlay;
