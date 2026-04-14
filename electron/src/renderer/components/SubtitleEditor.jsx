import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiTrash2, FiPlus, FiPlay, FiMic, FiGlobe } from 'react-icons/fi';
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
    mediaFile,
    detectedLanguage,
    sourceLanguage,
    mediaDuration,
    setPlaybackTime,
    audioMixer,
  } = useAppStore();

  const [mixerNotification, setMixerNotification] = useState(null);
  
  // Show notification when audio mixer is enabled
  useEffect(() => {
    if (audioMixer.enabled && Object.keys(audioMixer.tracks).length > 0) {
      setMixerNotification('✓ Audio layer timeline enabled');
      const timer = setTimeout(() => setMixerNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [audioMixer.enabled, audioMixer.tracks]);
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };
  
  const handleAddSubtitle = () => {
    const currentTime = playbackTime || 0;
    const lastSub = subtitles[subtitles.length - 1];
    let start = currentTime;
    if (currentTime === 0 && lastSub) {
      start = lastSub.end + 0.5;
    }
    addSubtitle({ start, end: start + 3, text: 'New subtitle' });
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
        marginBottom: 8,
        paddingBottom: 8,
        borderBottom: '1px solid var(--border-color)',
      }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
          Subtitles ({subtitles.length})
        </h3>
        
        <div style={{ display: 'flex', gap: 8 }}>
          {settings.dualSubtitleEnabled && secondarySubtitle.targetLanguage !== 'none' && (
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
        </div>
      </div>
      
      {/* Mixer Notification */}
      {mixerNotification && (
        <div style={{
          padding: '10px 12px',
          marginBottom: 8,
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          background: 'rgba(16,185,129,0.1)',
          color: 'var(--accent-success)',
          border: '1px solid rgba(16,185,129,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          animation: 'fadeIn 0.3s ease-in',
        }}>
          {mixerNotification}
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
                      rows={1}
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
                          rows={1}
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
