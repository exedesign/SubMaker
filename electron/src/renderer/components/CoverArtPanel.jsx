import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import TagEditor from './TagEditor';
import TextOverlayHelper from './TextOverlayHelper';
import CoverArtSettings from './CoverArtSettings';

/**
 * CoverArtPanel — Main cover art generation panel.
 * Layout: Generated image → Tag editor → Control buttons → Settings
 */
function CoverArtPanel() {
  const {
    coverArt,
    subtitles,
    analyzeLyrics,
    generateCoverArt,
    cancelCoverArt,
    toggleSeedLock,
    saveCoverArt,
    downloadCoverArt,
    setCoverArt,
    updateCoverArtPrompt,
    processingStep,
    processingProgress,
    setBackgroundImage,
    embedCoverArt,
    originalMediaPath,
  } = useAppStore();

  const [showSettings, setShowSettings] = useState(false);
  const [saveFilename, setSaveFilename] = useState('');
  const [embedStatus, setEmbedStatus] = useState(null);

  const hasLyrics = subtitles && subtitles.length > 0;
  const hasPrompt = !!(coverArt.editedPrompt || coverArt.rawPrompt);

  const handleSave = async () => {
    const name = saveFilename.trim() || `cover_art_${Date.now()}`;
    const path = await saveCoverArt(name);
    if (path) {
      setSaveFilename('');
    }
  };

  return (
    <div className="cover-art-panel">
      {/* Generated Image Preview */}
      <div className="cover-art-preview" style={{ aspectRatio: `${coverArt.width || 1} / ${coverArt.height || 1}` }}>
        {coverArt.isGenerating && coverArt.previewImage ? (
          <img
            src={`data:image/jpeg;base64,${coverArt.previewImage}`}
            className="cover-art-image cover-art-live-preview"
            alt="Generating preview"
          />
        ) : coverArt.generatedImage ? (
          <img
            src={`data:image/png;base64,${coverArt.generatedImage}`}
            alt="Generated Cover Art"
            className="cover-art-image"
          />
        ) : (
          <div className="cover-art-placeholder">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span>No cover art generated yet</span>
            {!hasLyrics && <span className="cover-art-hint">Transcribe audio first to analyze lyrics</span>}
          </div>
        )}
        {coverArt.isGenerating && (
          <div className={`cover-art-loading ${coverArt.previewImage ? 'has-preview' : ''}`}>
            {!coverArt.previewImage && <div className="cover-art-spinner" />}
            <span>{processingStep || 'Generating...'}</span>
            {processingProgress > 0 && (
              <div className="cover-art-mini-progress">
                <div className="cover-art-mini-bar" style={{ width: `${processingProgress}%` }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Prompt Editor */}
      <div className="cover-art-section">
        <label className="cover-art-label">Prompt</label>
        {coverArt.tags.length > 0 ? (
          <TagEditor />
        ) : (
          <textarea
            className="cover-art-textarea"
            value={coverArt.editedPrompt}
            onChange={(e) => updateCoverArtPrompt(e.target.value)}
            placeholder="Analyze lyrics or type a prompt manually..."
            rows={3}
          />
        )}
      </div>

      {/* Direct prompt edit (when tags present, show raw prompt below) */}
      {coverArt.tags.length > 0 && (
        <div className="cover-art-section">
          <label className="cover-art-label">Full Prompt</label>
          <textarea
            className="cover-art-textarea"
            value={coverArt.editedPrompt}
            onChange={(e) => updateCoverArtPrompt(e.target.value)}
            rows={3}
          />
        </div>
      )}

      {/* Text Overlay Helper — always visible */}
      <TextOverlayHelper />

      {/* Control Buttons */}
      <div className="cover-art-controls">
        <button
          className="cover-art-btn secondary"
          onClick={analyzeLyrics}
          disabled={!hasLyrics || coverArt.isAnalyzing}
          title="Analyze lyrics with Qwen 2.5"
        >
          {coverArt.isAnalyzing ? (
            <><div className="btn-spinner" /> Analyzing...</>
          ) : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> Analyze</>
          )}
        </button>

        <button
          className="cover-art-btn primary"
          onClick={coverArt.isGenerating ? cancelCoverArt : generateCoverArt}
          disabled={!hasPrompt && !coverArt.isGenerating}
          title={coverArt.isGenerating ? 'Cancel generation' : 'Generate cover art'}
          style={{ marginLeft: 'auto' }}
        >
          {coverArt.isGenerating ? (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="6" width="12" height="12" rx="1"/></svg> Cancel</>
          ) : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/></svg> Generate</>
          )}
        </button>

        <button
          className={`cover-art-btn icon ${coverArt.seedLocked ? 'locked' : ''}`}
          onClick={toggleSeedLock}
          title={coverArt.seedLocked ? 'Seed locked — click to unlock for new composition' : 'Seed unlocked — click to lock current composition'}
        >
          {coverArt.seedLocked ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
          )}
        </button>
      </div>

      {/* Seed & Generation Time info */}
      {coverArt.lastUsedSeed != null && (
        <div className="cover-art-seed-info">
          Seed: {coverArt.lastUsedSeed}
          {coverArt.seedLocked && <span className="seed-locked-badge">Locked</span>}
          {coverArt.lastGenerationTime != null && (
            <span className="cover-art-time-badge">{coverArt.lastGenerationTime}s</span>
          )}
        </div>
      )}

      {/* Download & Set BG */}
      {coverArt.generatedImage && (
        <div className="cover-art-save">
          <button className="cover-art-btn secondary" onClick={downloadCoverArt} title="Download PNG">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download
          </button>
          <button
            className="cover-art-btn secondary"
            onClick={() => {
              const byteString = atob(coverArt.generatedImage);
              const ab = new ArrayBuffer(byteString.length);
              const ia = new Uint8Array(ab);
              for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
              const blob = new Blob([ab], { type: 'image/png' });
              const blobUrl = URL.createObjectURL(blob);
              setBackgroundImage(blobUrl);
            }}
            title="Use as preview background"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
            Set BG
          </button>
          <button
            className="cover-art-btn secondary"
            onClick={async () => {
              setEmbedStatus('saving');
              const result = await embedCoverArt();
              setEmbedStatus(result.success ? 'done' : 'error');
              setTimeout(() => setEmbedStatus(null), 2000);
            }}
            disabled={!originalMediaPath || embedStatus === 'saving'}
            title={originalMediaPath ? `Embed into ${originalMediaPath.split(/[\\/]/).pop()} and save PNG` : 'No audio file loaded'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
            {embedStatus === 'saving' ? '...' : embedStatus === 'done' ? '✓' : 'Set Cover'}
          </button>
        </div>
      )}

      {/* Settings toggle */}
      <button
        className="cover-art-settings-toggle"
        onClick={() => setShowSettings(!showSettings)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        Settings
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: showSettings ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {showSettings && <CoverArtSettings />}

      {/* History */}
      {coverArt.history.length > 1 && (
        <div className="cover-art-section">
          <label className="cover-art-label">History</label>
          <div className="cover-art-history">
            {coverArt.history.map((item, i) => (
              <button
                key={i}
                className={`cover-art-history-thumb ${coverArt.generatedImage === item.image_base64 ? 'active' : ''}`}
                onClick={() => setCoverArt({
                  generatedImage: item.image_base64,
                  editedPrompt: item.prompt,
                  lastUsedSeed: item.seed,
                })}
                title={`Seed: ${item.seed}`}
              >
                <img src={`data:image/png;base64,${item.image_base64}`} alt={`History ${i + 1}`} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CoverArtPanel;
