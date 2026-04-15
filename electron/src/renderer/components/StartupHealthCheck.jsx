import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';

/* ── Model display order & icons ───────────────────────────────────── */
const CHECK_ITEMS = [
  { key: '_python',  label: 'Python Runtime',     icon: '⚙', type: 'system' },
  { key: '_ffmpeg',  label: 'FFmpeg Engine',       icon: '🎬', type: 'system' },
  { key: 'turbo',    label: 'Whisper Turbo',       icon: '🎤', type: 'model', category: 'required' },
  { key: 'audio-separator', label: 'Vocal Separator', icon: '🎵', type: 'model', category: 'required' },
  { key: 'qwen',     label: 'Qwen Translation',   icon: '🌐', type: 'model', category: 'translation' },
  { key: 'small',    label: 'Whisper Small',       icon: '🎤', type: 'model', category: 'extra' },
  { key: 'tiny',     label: 'Whisper Tiny',        icon: '🎤', type: 'model', category: 'extra' },
  { key: 'distil-large-v3', label: 'Whisper Distil Large', icon: '🎤', type: 'model', category: 'extra' },
  { key: 'flux-klein', label: 'FLUX Cover Art',   icon: '🎨', type: 'model', category: 'cover-art' },
  { key: 'flux-small-decoder', label: 'FLUX Decoder', icon: '🎨', type: 'model', category: 'cover-art' },
];

const FIRST_RUN_KEY = 'submaker-startup-check-done';

function StartupHealthCheck() {
  const { systemHealth, runSystemHealthCheck, setStartupCheckComplete, backendStatus, downloadModels, modelDownloading } = useAppStore();
  const [itemStates, setItemStates] = useState({}); // key -> 'waiting' | 'checking' | 'ok' | 'fail'
  const [progress, setProgress] = useState({});     // key -> 0..100
  const [fadeOut, setFadeOut] = useState(false);
  const [visible, setVisible] = useState(true);
  const [showDownloadUI, setShowDownloadUI] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const animatingRef = useRef(false);
  const hasRunRef = useRef(false);

  const isFirstRun = !localStorage.getItem(FIRST_RUN_KEY);

  // Initialize all items to 'waiting'
  useEffect(() => {
    const initial = {};
    const initialProgress = {};
    CHECK_ITEMS.forEach(item => {
      initial[item.key] = 'waiting';
      initialProgress[item.key] = 0;
    });
    setItemStates(initial);
    setProgress(initialProgress);
  }, []);

  // Trigger health check when backend comes online
  useEffect(() => {
    if (backendStatus === 'online' && !hasRunRef.current) {
      hasRunRef.current = true;
      // Use quick (cached) for subsequent runs
      runSystemHealthCheck(!isFirstRun);
    }
  }, [backendStatus, runSystemHealthCheck, isFirstRun]);

  // Animate items sequentially once health data arrives
  const animateSequence = useCallback(async (healthData) => {
    if (animatingRef.current) return;
    animatingRef.current = true;

    const baseDelay = isFirstRun ? 280 : 80;
    const fillDuration = isFirstRun ? 250 : 60;
    const fillSteps = 10;

    let failedModels = [];

    for (let i = 0; i < CHECK_ITEMS.length; i++) {
      const item = CHECK_ITEMS[i];
      
      // Set to 'checking'
      setItemStates(prev => ({ ...prev, [item.key]: 'checking' }));

      // Determine result
      let ok = false;
      if (item.key === '_python') {
        ok = healthData.python?.ok ?? false;
      } else if (item.key === '_ffmpeg') {
        ok = healthData.ffmpeg?.ok ?? false;
      } else {
        const m = healthData.models?.[item.key];
        ok = m?.status === 'ok' || m?.status === 'incomplete';
        if (!ok && item.type === 'model') {
          failedModels.push(item.key);
        }
      }

      // Animate progress bar fill
      for (let step = 1; step <= fillSteps; step++) {
        await new Promise(r => setTimeout(r, fillDuration / fillSteps));
        setProgress(prev => ({ ...prev, [item.key]: (step / fillSteps) * 100 }));
      }

      // Brief pause then show result
      await new Promise(r => setTimeout(r, baseDelay * 0.3));
      setItemStates(prev => ({ ...prev, [item.key]: ok ? 'ok' : 'fail' }));
      
      // Delay before next item
      if (i < CHECK_ITEMS.length - 1) {
        await new Promise(r => setTimeout(r, baseDelay * 0.4));
      }
    }

    // Mark first run done
    localStorage.setItem(FIRST_RUN_KEY, Date.now().toString());

    // If there are missing models, show download UI instead of fading out
    if (failedModels.length > 0) {
      await new Promise(r => setTimeout(r, 400));
      setShowDownloadUI(true);
      return; // Don't auto-fade
    }

    // Hold the completed state briefly
    await new Promise(r => setTimeout(r, isFirstRun ? 600 : 300));

    // Fade out
    setFadeOut(true);
    await new Promise(r => setTimeout(r, 500));
    setVisible(false);
    setStartupCheckComplete();
  }, [isFirstRun, setStartupCheckComplete]);

  // Start animation when health data arrives
  useEffect(() => {
    if (systemHealth && !animatingRef.current) {
      animateSequence(systemHealth);
    }
  }, [systemHealth, animateSequence]);

  // When downloads complete, re-check and update states
  useEffect(() => {
    if (!downloadStarted) return;
    const anyActive = Object.values(modelDownloading).some(v => v);
    if (!anyActive && downloadStarted) {
      // Downloads finished — refresh health and update item states
      runSystemHealthCheck(false).then(newHealth => {
        if (!newHealth) return;
        const updatedStates = { ...itemStates };
        CHECK_ITEMS.forEach(item => {
          if (item.type === 'model') {
            const m = newHealth.models?.[item.key];
            updatedStates[item.key] = (m?.status === 'ok' || m?.status === 'incomplete') ? 'ok' : 'fail';
          }
        });
        setItemStates(updatedStates);
      });
    }
  }, [modelDownloading, downloadStarted]);

  // Handle download missing models
  const handleDownloadMissing = useCallback(() => {
    const missingKeys = CHECK_ITEMS
      .filter(item => item.type === 'model' && itemStates[item.key] === 'fail')
      .map(item => item.key);
    if (missingKeys.length > 0) {
      setDownloadStarted(true);
      downloadModels(missingKeys);
    }
  }, [itemStates, downloadModels]);

  // Handle download single model
  const handleDownloadSingle = useCallback((key) => {
    setDownloadStarted(true);
    downloadModels([key]);
  }, [downloadModels]);

  // Handle skip/continue
  const handleContinue = useCallback(async () => {
    setFadeOut(true);
    await new Promise(r => setTimeout(r, 500));
    setVisible(false);
    setStartupCheckComplete();
  }, [setStartupCheckComplete]);

  if (!visible) return null;

  const allDone = CHECK_ITEMS.every(i => itemStates[i.key] === 'ok' || itemStates[i.key] === 'fail');
  const okCount = CHECK_ITEMS.filter(i => itemStates[i.key] === 'ok').length;
  const failCount = CHECK_ITEMS.filter(i => itemStates[i.key] === 'fail').length;
  const anyDownloading = Object.values(modelDownloading).some(v => v);
  const missingModelItems = CHECK_ITEMS.filter(i => i.type === 'model' && itemStates[i.key] === 'fail');

  return (
    <div className={`startup-overlay ${fadeOut ? 'startup-overlay--fade-out' : ''}`}>
      <div className="startup-card">
        {/* Header */}
        <div className="startup-header">
          <div className="startup-logo">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            <span className="startup-title">SubMaker</span>
          </div>
          <div className="startup-subtitle">
            {!systemHealth ? 'Connecting to backend...' :
             anyDownloading ? 'Downloading models...' :
             showDownloadUI && failCount > 0 ? 'Some models are missing' :
             allDone ? 'System check complete' : 'Verifying system components...'}
          </div>
        </div>

        {/* Check list */}
        <div className="startup-checks">
          {CHECK_ITEMS.map((item) => {
            const state = itemStates[item.key] || 'waiting';
            const prog = progress[item.key] || 0;
            const isDownloading = modelDownloading[item.key];

            return (
              <div key={item.key} className={`startup-check-row startup-check-row--${isDownloading ? 'checking' : state}`}>
                <div className="startup-check-icon">{item.icon}</div>
                <div className="startup-check-body">
                  <div className="startup-check-label">
                    {item.label}
                    {isDownloading && <span className="startup-download-badge">downloading...</span>}
                  </div>
                  <div className="startup-check-bar-track">
                    <div
                      className={`startup-check-bar-fill startup-check-bar-fill--${isDownloading ? 'checking' : state}`}
                      style={{ width: isDownloading ? '100%' : `${prog}%`, animation: isDownloading ? 'startupPulse 1.5s ease-in-out infinite' : 'none' }}
                    />
                  </div>
                </div>
                <div className="startup-check-result">
                  {isDownloading && <span className="startup-icon-spin" />}
                  {!isDownloading && state === 'ok' && <span className="startup-icon-ok">✓</span>}
                  {!isDownloading && state === 'fail' && showDownloadUI && (
                    <button
                      className="startup-download-btn-small"
                      onClick={() => handleDownloadSingle(item.key)}
                      title="Download"
                    >↓</button>
                  )}
                  {!isDownloading && state === 'fail' && !showDownloadUI && <span className="startup-icon-fail">✗</span>}
                  {state === 'checking' && !isDownloading && <span className="startup-icon-spin" />}
                  {state === 'waiting' && <span className="startup-icon-wait">—</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        {allDone && !showDownloadUI && (
          <div className="startup-summary">
            <span className="startup-summary-ok">{okCount} passed</span>
            {failCount > 0 && <span className="startup-summary-fail">{failCount} missing</span>}
          </div>
        )}

        {/* Download UI - shown when models are missing */}
        {showDownloadUI && failCount > 0 && (
          <div className="startup-download-actions">
            <div className="startup-summary" style={{ marginTop: '12px', paddingTop: '12px' }}>
              <span className="startup-summary-ok">{okCount} passed</span>
              <span className="startup-summary-fail">{failCount} missing</span>
            </div>
            
            {!anyDownloading && (
              <div className="startup-download-buttons">
                <button
                  className="startup-btn startup-btn--primary"
                  onClick={handleDownloadMissing}
                >
                  Download Missing Models ({failCount})
                </button>
                <button
                  className="startup-btn startup-btn--secondary"
                  onClick={handleContinue}
                >
                  Skip & Continue
                </button>
              </div>
            )}

            {anyDownloading && (
              <div className="startup-download-status">
                <span className="startup-icon-spin" style={{ marginRight: '8px' }} />
                <span>Downloading... This may take a while</span>
              </div>
            )}

            {downloadStarted && !anyDownloading && failCount === 0 && (
              <div className="startup-download-buttons">
                <button
                  className="startup-btn startup-btn--primary"
                  onClick={handleContinue}
                >
                  Continue
                </button>
              </div>
            )}
          </div>
        )}

        {/* After download completes with all OK */}
        {showDownloadUI && failCount === 0 && (
          <div className="startup-download-actions">
            <div className="startup-summary" style={{ marginTop: '12px', paddingTop: '12px' }}>
              <span className="startup-summary-ok">{okCount} passed</span>
            </div>
            <div className="startup-download-buttons">
              <button
                className="startup-btn startup-btn--primary"
                onClick={handleContinue}
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StartupHealthCheck;
