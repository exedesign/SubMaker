import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiTrash2, FiPlus, FiPlay, FiMic, FiRefreshCw, FiAlertCircle, FiGlobe, FiDownload, FiMusic, FiDisc } from 'react-icons/fi';
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
    exportLyrics,
    mediaFile,
    detectedLanguage,
    sourceLanguage,
    mediaDuration,
    setPlaybackTime,
    audioMixer,
  } = useAppStore();

  const [showRetranscribeConfirm, setShowRetranscribeConfirm] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportStatus, setExportStatus] = useState(null);
  const [syltStatus, setSyltStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [syltMessage, setSyltMessage] = useState(''); // Detailed message for SYLT embedding
  const [mixerNotification, setMixerNotification] = useState(null); // Show when mixer is activated
  
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

  const handleExport = async (format) => {
    setShowExportMenu(false);
    setExportStatus({ loading: true, format });
    const result = await exportLyrics(format);
    if (result?.success) {
      const savedTo = result.source_copy_path || result.output_path || result.download_filename;
      const msg = result.message || `${result.download_filename || format} saved`;
      setExportStatus({
        success: true,
        format,
        path: savedTo,
        message: msg,
        sourceCopy: result.source_copy_path || null,
      });
      setTimeout(() => setExportStatus(null), 5000);
    } else {
      setExportStatus({ error: result?.error || 'Export failed', format });
      setTimeout(() => setExportStatus(null), 6000);
    }
  };

  const isMp3 = mediaFile && mediaFile.toLowerCase().endsWith('.mp3');

  const handleEmbedSYLT = async () => {
    if (!isMp3 || subtitles.length === 0) return;
    setSyltStatus('loading');
    setSyltMessage("Writing SYLT to MP3...");
    try {
      const result = await exportLyrics('id3', {});
      if (result?.success && result?.sylt_written) {
        setSyltStatus('success');
        const count = result?.verification?.sylt_entries;
        const location = result?.source_location || 'unknown location';
        const message = `✓ ${count} SYLT entry embedded → ${location}`;
        setSyltMessage(message);
        console.log(`SYLT embedded: ${count} entries into ${result.source_file}`);
        if (result.verification?.sylt_sample) {
          console.log('SYLT sample:', result.verification.sylt_sample);
        }
      } else {
        setSyltStatus('error');
        setSyltMessage(`Error: ${result?.error || 'SYLT embedding failed'}`);
        console.error('SYLT embed failed:', result?.error || 'unknown');
      }
    } catch (err) {
      setSyltStatus('error');
      setSyltMessage(`Error: ${err.message || 'SYLT embedding failed'}`);
      console.error('SYLT embed error:', err);
    }
    setTimeout(() => {
      setSyltStatus(null);
      setSyltMessage('');
    }, 4000);
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
          
          {/* SYLT Embed Button — only for MP3 files */}
          {isMp3 && (
            <button
              className="btn btn-sm"
              onClick={handleEmbedSYLT}
              disabled={isProcessing || syltStatus === 'loading'}
              title="Embed synchronized lyrics (SYLT) into MP3 file"
              style={{
                background: syltStatus === 'success' ? 'var(--accent-success)' :
                           syltStatus === 'error' ? 'var(--accent-error)' :
                           'rgba(168, 85, 247, 0.9)',
                color: '#fff',
                fontSize: 11,
                padding: '4px 10px',
                gap: 4,
                transition: 'background 0.2s',
              }}
            >
              <FiDisc size={13} />
              {syltStatus === 'loading' ? 'Embedding...' :
               syltStatus === 'success' ? 'Embedded!' :
               syltStatus === 'error' ? 'Error!' :
               'Embed to MP3'}
            </button>
          )}

          {/* Export Lyrics Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={isProcessing}
              title="Export Lyrics"
              style={{ color: 'var(--accent-primary)' }}
            >
              <FiDownload size={14} />
            </button>
            {showExportMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                padding: 4,
                minWidth: 180,
                zIndex: 100,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}>
                <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', fontSize: 12 }}
                  onClick={() => handleExport('enhanced_lrc')}>
                  <FiMusic size={12} /> Enhanced LRC (Word-level)
                </button>
                <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', fontSize: 12 }}
                  onClick={() => handleExport('lrc')}>
                  <FiMusic size={12} /> Standard LRC
                </button>
                <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', fontSize: 12 }}
                  onClick={() => handleExport('word_json')}>
                  <FiDownload size={12} /> Word-Level JSON
                </button>
                {isMp3 && (
                  <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', fontSize: 12, color: 'var(--accent-success)' }}
                    onClick={() => handleExport('id3')}>
                    <FiMusic size={12} /> Write ID3 Synced Lyrics
                  </button>
                )}
              </div>
            )}
          </div>

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
      
      {/* Export Status Toast */}
      {exportStatus && (
        <div style={{
          padding: '8px 12px',
          marginBottom: 8,
          borderRadius: 6,
          fontSize: 12,
          background: exportStatus.loading ? 'rgba(99,102,241,0.1)' :
                     exportStatus.success ? 'rgba(16,185,129,0.1)' :
                     'rgba(239,68,68,0.1)',
          color: exportStatus.loading ? 'var(--accent-primary)' :
                 exportStatus.success ? 'var(--accent-success)' :
                 'var(--accent-error)',
          border: `1px solid ${exportStatus.loading ? 'rgba(99,102,241,0.3)' :
                               exportStatus.success ? 'rgba(16,185,129,0.3)' :
                               'rgba(239,68,68,0.3)'}`,
        }}>
          {exportStatus.loading && `Exporting ${exportStatus.format}...`}
          {exportStatus.success && (
            <span>
              {exportStatus.message || `${exportStatus.format} saved successfully`}
              {exportStatus.sourceCopy && (
                <span style={{ display: 'block', fontSize: 10, marginTop: 2, opacity: 0.8, wordBreak: 'break-all' }}>
                  {exportStatus.sourceCopy}
                </span>
              )}
            </span>
          )}
          {exportStatus.error && `Error: ${exportStatus.error}`}
        </div>
      )}

      {/* SYLT Embed Status Toast */}
      {syltStatus && (
        <div style={{
          padding: '10px 12px',
          marginBottom: 8,
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          background: syltStatus === 'loading' ? 'rgba(99,102,241,0.1)' :
                     syltStatus === 'success' ? 'rgba(16,185,129,0.1)' :
                     'rgba(239,68,68,0.1)',
          color: syltStatus === 'loading' ? 'var(--accent-primary)' :
                 syltStatus === 'success' ? 'var(--accent-success)' :
                 'var(--accent-error)',
          border: `1px solid ${syltStatus === 'loading' ? 'rgba(99,102,241,0.3)' :
                               syltStatus === 'success' ? 'rgba(16,185,129,0.3)' :
                               'rgba(239,68,68,0.3)'}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          {syltStatus === 'loading' && <span>⏳ Writing SYLT to MP3...</span>}
          {syltStatus === 'success' && (
            <span>
              {syltMessage}
              <span style={{ display: 'block', fontSize: 10, marginTop: 2, opacity: 0.8 }}>
                ID3 tags written successfully
              </span>
            </span>
          )}
          {syltStatus === 'error' && <span>❌ {syltMessage || 'SYLT embedding failed'}</span>}
        </div>
      )}

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
