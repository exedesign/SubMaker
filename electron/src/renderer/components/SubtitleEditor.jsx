import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiTrash2, FiPlus, FiPlay, FiMic, FiRefreshCw, FiAlertCircle, FiGlobe } from 'react-icons/fi';
import SimpleSunoImporter from './SimpleSunoImporter';

function SubtitleEditor() {
  const { 
    subtitles, 
    selectedSubtitleId, 
    selectSubtitle, 
    updateSubtitle, 
    deleteSubtitle,
    addSubtitle,
    transcribe,
    clearSubtitles,
    currentStep,
    isProcessing,
    settings,
    secondarySubtitle,
    updateSecondarySubtitle,
    translateToSecondary,
    playbackTime,
  } = useAppStore();
  
  const [showRetranscribeConfirm, setShowRetranscribeConfirm] = useState(false);
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };
  
  const handleAddSubtitle = () => {
    // Use current playback time if available, otherwise use end of last subtitle
    const currentTime = playbackTime || 0;
    const lastSub = subtitles[subtitles.length - 1];
    
    // If we have a current playback time, use it
    let start = currentTime;
    
    // If no playback time, default to after last subtitle
    if (currentTime === 0 && lastSub) {
      start = lastSub.end + 0.5;
    }
    
    addSubtitle({
      start,
      end: start + 3,
      text: 'New subtitle',
    });
  };
  
  const handleRetranscribe = () => {
    clearSubtitles();
    transcribe();
    setShowRetranscribeConfirm(false);
  };

  const handleTranslateToSecondary = async () => {
    await translateToSecondary();
  };

  if (subtitles.length === 0) {
    return (
      <div className="empty-state">
        <FiMic className="empty-state-icon" />
        <h2 className="empty-state-title">No Subtitles</h2>
        <p className="empty-state-text">
          Add subtitles manually, transcribe audio, or import AI lyrics.
        </p>
        
        <div style={{ 
          marginBottom: 24, 
          maxWidth: '600px',
          margin: '0 auto 24px auto'
        }}>
          <SimpleSunoImporter />
        </div>
        
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button className="btn btn-primary" onClick={transcribe}>
            <FiPlay /> Transcribe
          </button>
          <button className="btn btn-secondary" onClick={handleAddSubtitle}>
            <FiPlus /> Add Manually
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="subtitle-editor">
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: '1px solid var(--border-color)',
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
          Subtitles ({subtitles.length})
        </h3>
        
        <div style={{ display: 'flex', gap: 8 }}>
          {settings.dualSubtitleEnabled && (
            <button 
              className="btn btn-primary btn-sm"
              onClick={handleTranslateToSecondary}
              disabled={isProcessing || secondarySubtitle.isTranslating}
              title={`Translate to ${secondarySubtitle.targetLanguage.toUpperCase()}`}
              style={{ background: 'var(--accent-success)' }}
            >
              <FiGlobe size={14} /> 
              {secondarySubtitle.isTranslating ? 'Translating...' : `To ${secondarySubtitle.targetLanguage.toUpperCase()}`}
            </button>
          )}
          
          <button 
            className="btn btn-ghost btn-sm"
            onClick={() => setShowRetranscribeConfirm(true)}
            disabled={isProcessing}
            title="Re-transcribe"
            style={{ color: 'var(--accent-warning)' }}
          >
            <FiRefreshCw size={14} />
          </button>
          
          <button className="btn btn-secondary btn-sm" onClick={handleAddSubtitle}>
            <FiPlus size={14} /> Add
          </button>
        </div>
      </div>

      {showRetranscribeConfirm && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <FiAlertCircle color="orange" />
              <h3>Confirm Re-transcription</h3>
            </div>
            <p>This will delete all current subtitles and create new ones from the audio.</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-ghost" 
                onClick={() => setShowRetranscribeConfirm(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-warning" 
                onClick={handleRetranscribe}
              >
                <FiRefreshCw size={14} /> Re-transcribe
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Subtitle List - Always visible */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {subtitles.map((subtitle, index) => {
              const translatedSub = settings.dualSubtitleEnabled 
                ? secondarySubtitle.subtitles?.find(s => s.id === subtitle.id)
                : null;
              
              return (
                <div 
                  key={subtitle.id}
                  className={`subtitle-item ${selectedSubtitleId === subtitle.id ? 'selected' : ''}`}
                  onClick={() => selectSubtitle(subtitle.id)}
                >
                  <div className="subtitle-index">{index + 1}</div>
                  
                  <div className="subtitle-content">
                    <div className="subtitle-time">
                      <input
                        type="text"
                        value={formatTime(subtitle.start)}
                        onChange={(e) => {
                          const timeValue = parseFloat(e.target.value.replace(/:/g, ''));
                          if (!isNaN(timeValue)) {
                            updateSubtitle(subtitle.id, { start: timeValue });
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span>→</span>
                      <input
                        type="text"
                        value={formatTime(subtitle.end)}
                        onChange={(e) => {
                          const timeValue = parseFloat(e.target.value.replace(/:/g, ''));
                          if (!isNaN(timeValue)) {
                            updateSubtitle(subtitle.id, { end: timeValue });
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    
                    <textarea
                      className="subtitle-text-input"
                      value={subtitle.text}
                      onChange={(e) => updateSubtitle(subtitle.id, { text: e.target.value })}
                      rows={2}
                      onClick={(e) => e.stopPropagation()}
                    />
                    
                    {settings.dualSubtitleEnabled && translatedSub && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          marginBottom: 4,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <FiGlobe size={11} />
                          <span>Translation ({secondarySubtitle.targetLanguage.toUpperCase()})</span>
                        </div>
                        <textarea
                          className="subtitle-text-input"
                          value={translatedSub.translatedText || ''}
                          onChange={(e) => updateSecondarySubtitle(subtitle.id, e.target.value)}
                          rows={2}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            background: 'rgba(99, 102, 241, 0.1)',
                            borderColor: 'rgba(99, 102, 241, 0.3)',
                          }}
                          placeholder="Use 'Translate All' button in Style panel"
                        />
                      </div>
                    )}
                  </div>
                  
                  <button 
                    className="btn btn-ghost btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSubtitle(subtitle.id);
                    }}
                    title="Delete"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

export default SubtitleEditor;
