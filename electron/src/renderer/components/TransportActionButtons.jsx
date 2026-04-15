import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiPlus, FiRefreshCw, FiDownload, FiMusic, FiDisc, FiHeadphones, FiMic, FiFileText } from 'react-icons/fi';

/**
 * TransportActionButtons — Export/action buttons displayed inside the transport bar.
 * Compact versions of Embed to MP3, Karaoke MP3, Vocal MP3, Export, Re-transcribe, + Add.
 */
function TransportActionButtons() {
  const {
    subtitles,
    isProcessing,
    mediaFile,
    audioMixer,
    addSubtitle,
    playbackTime,
    exportLyrics,
    createKaraokeMp3,
    createVocalMp3,
    clearSubtitles,
    transcribe,
  } = useAppStore();

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [syltStatus, setSyltStatus] = useState(null);
  const [karaokeStatus, setKaraokeStatus] = useState(null);
  const [vocalStatus, setVocalStatus] = useState(null);
  const [showRetranscribeConfirm, setShowRetranscribeConfirm] = useState(false);
  const [srtStatus, setSrtStatus] = useState(null);

  const isMp3 = mediaFile && mediaFile.toLowerCase().endsWith('.mp3');
  const hasInstrumental = !!audioMixer?.tracks?.instrumental?.filePath;
  const hasVocals = !!audioMixer?.tracks?.vocals?.filePath;

  const handleAddSubtitle = () => {
    const currentTime = playbackTime || 0;
    const lastSub = subtitles[subtitles.length - 1];
    let start = currentTime;
    if (currentTime === 0 && lastSub) {
      start = lastSub.end + 0.5;
    }
    addSubtitle({ start, end: start + 3, text: 'New subtitle' });
  };

  const handleExportSRT = async () => {
    if (subtitles.length === 0) return;
    setSrtStatus('loading');
    try {
      const result = await exportLyrics('srt', {});
      setSrtStatus(result?.success ? 'success' : 'error');
    } catch {
      setSrtStatus('error');
    }
    setTimeout(() => setSrtStatus(null), 3000);
  };

  const handleEmbedSYLT = async () => {
    if (!isMp3 || subtitles.length === 0) return;
    setSyltStatus('loading');
    try {
      const result = await exportLyrics('id3', {});
      if (result?.success && result?.sylt_written) {
        setSyltStatus('success');
      } else {
        setSyltStatus('error');
      }
    } catch {
      setSyltStatus('error');
    }
    setTimeout(() => setSyltStatus(null), 3000);
  };

  const handleCreateKaraokeMp3 = async () => {
    setKaraokeStatus('loading');
    try {
      const result = await createKaraokeMp3();
      setKaraokeStatus(result?.success ? 'success' : 'error');
    } catch {
      setKaraokeStatus('error');
    }
    setTimeout(() => setKaraokeStatus(null), 3000);
  };

  const handleCreateVocalMp3 = async () => {
    setVocalStatus('loading');
    try {
      const result = await createVocalMp3();
      setVocalStatus(result?.success ? 'success' : 'error');
    } catch {
      setVocalStatus('error');
    }
    setTimeout(() => setVocalStatus(null), 3000);
  };

  const handleExport = async (format) => {
    setShowExportMenu(false);
    await exportLyrics(format);
  };

  const btnBase = {
    display: 'flex', alignItems: 'center', gap: 3,
    fontSize: 10, fontWeight: 500,
    padding: '3px 8px', border: 'none', borderRadius: 4,
    color: '#fff', cursor: 'pointer',
    transition: 'opacity 0.15s, filter 0.15s',
    whiteSpace: 'nowrap',
  };

  if (subtitles.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {/* Embed to MP3 */}
      {isMp3 && (
        <button
          onClick={handleEmbedSYLT}
          disabled={isProcessing || syltStatus === 'loading'}
          title="Embed synchronized lyrics (SYLT) into MP3"
          style={{
            ...btnBase,
            background: syltStatus === 'success' ? 'var(--accent-success)' :
                         syltStatus === 'error' ? 'var(--accent-error)' :
                         'rgba(168, 85, 247, 0.85)',
            opacity: isProcessing ? 0.5 : 1,
          }}
        >
          <FiDisc size={11} />
          {syltStatus === 'loading' ? 'Writing...' :
           syltStatus === 'success' ? 'Done!' :
           syltStatus === 'error' ? 'Error' :
           'Embed to MP3'}
        </button>
      )}

      {/* Karaoke MP3 */}
      {hasInstrumental && (
        <button
          onClick={handleCreateKaraokeMp3}
          disabled={isProcessing || karaokeStatus === 'loading'}
          title="Create karaoke MP3 from instrumental stem"
          style={{
            ...btnBase,
            background: karaokeStatus === 'success' ? 'var(--accent-success)' :
                          karaokeStatus === 'error' ? 'var(--accent-error)' :
                          'rgba(20, 184, 166, 0.85)',
            opacity: isProcessing ? 0.5 : 1,
          }}
        >
          <FiHeadphones size={11} />
          {karaokeStatus === 'loading' ? 'Creating...' :
           karaokeStatus === 'success' ? 'Done!' :
           karaokeStatus === 'error' ? 'Error' :
           'Karaoke MP3'}
        </button>
      )}

      {/* Vocal MP3 */}
      {hasVocals && (
        <button
          onClick={handleCreateVocalMp3}
          disabled={isProcessing || vocalStatus === 'loading'}
          title="Create vocal MP3 from vocal stem"
          style={{
            ...btnBase,
            background: vocalStatus === 'success' ? 'var(--accent-success)' :
                          vocalStatus === 'error' ? 'var(--accent-error)' :
                          'rgba(244, 114, 182, 0.85)',
            opacity: isProcessing ? 0.5 : 1,
          }}
        >
          <FiMic size={11} />
          {vocalStatus === 'loading' ? 'Creating...' :
           vocalStatus === 'success' ? 'Done!' :
           vocalStatus === 'error' ? 'Error' :
           'Vocal MP3'}
        </button>
      )}

      {/* Export SRT */}
      <button
        onClick={handleExportSRT}
        disabled={isProcessing || srtStatus === 'loading'}
        title="Export subtitles as SRT file"
        style={{
          ...btnBase,
          background: srtStatus === 'success' ? 'var(--accent-success)' :
                       srtStatus === 'error' ? 'var(--accent-error)' :
                       'rgba(59, 130, 246, 0.85)',
          opacity: isProcessing ? 0.5 : 1,
        }}
      >
        <FiFileText size={11} />
        {srtStatus === 'loading' ? 'Exporting...' :
         srtStatus === 'success' ? 'Done!' :
         srtStatus === 'error' ? 'Error' :
         'Export SRT'}
      </button>

      {/* Export Dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowExportMenu(!showExportMenu)}
          disabled={isProcessing}
          title="Export Lyrics"
          style={{
            ...btnBase,
            background: 'transparent',
            color: 'var(--accent-primary)',
            padding: '3px 5px',
          }}
        >
          <FiDownload size={13} />
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
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', fontSize: 11 }}
              onClick={() => handleExport('enhanced_lrc')}>
              <FiMusic size={11} /> Enhanced LRC (Word-level)
            </button>
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', fontSize: 11 }}
              onClick={() => handleExport('lrc')}>
              <FiMusic size={11} /> Standard LRC
            </button>
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', fontSize: 11 }}
              onClick={() => handleExport('srt')}>
              <FiFileText size={11} /> SRT Subtitle
            </button>
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', fontSize: 11 }}
              onClick={() => handleExport('word_json')}>
              <FiDownload size={11} /> Word-Level JSON
            </button>
            {isMp3 && (
              <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', fontSize: 11, color: 'var(--accent-success)' }}
                onClick={() => handleExport('id3')}>
                <FiMusic size={11} /> Write ID3 Synced Lyrics
              </button>
            )}
          </div>
        )}
      </div>

      {/* Re-transcribe */}
      <button
        onClick={() => setShowRetranscribeConfirm(true)}
        disabled={isProcessing}
        title="Re-transcribe"
        style={{
          ...btnBase,
          background: 'transparent',
          color: 'var(--accent-warning)',
          padding: '3px 5px',
        }}
      >
        <FiRefreshCw size={13} />
      </button>

      {/* + Add */}
      <button
        onClick={handleAddSubtitle}
        title="Add subtitle"
        style={{
          ...btnBase,
          background: 'var(--bg-hover)',
          color: 'var(--text-secondary)',
          padding: '3px 7px',
        }}
      >
        <FiPlus size={12} /> Add
      </button>

      {/* Re-transcribe Confirm Dialog */}
      {showRetranscribeConfirm && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}
          onClick={() => setShowRetranscribeConfirm(false)}
        >
          <div style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 12, padding: 24, maxWidth: 400,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: 15 }}>Re-transcribe?</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              This will clear all current subtitles and start a new transcription.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowRetranscribeConfirm(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" style={{ background: 'var(--accent-warning)' }}
                onClick={() => { setShowRetranscribeConfirm(false); clearSubtitles(); transcribe(); }}>
                Re-transcribe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TransportActionButtons;
