import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { streamJsonEvents } from '../services/electronTransport';

/* ── Model display order & icons ───────────────────────────────────── */
const CHECK_ITEMS = [
  { key: '_python',  label: 'Python Runtime',     icon: '⚙', type: 'system' },
  { key: '_ffmpeg',  label: 'FFmpeg Engine',       icon: '🎬', type: 'system' },
  { key: 'turbo',    label: 'Whisper Turbo',       icon: '🎤', type: 'model', category: 'required' },
  { key: 'audio-separator', label: 'Vocal Separator', icon: '🎵', type: 'model', category: 'required' },
  { key: 'qwen',     label: 'Qwen Translation',   icon: '🌐', type: 'model', category: 'translation' },
  { key: 'small',    label: 'Whisper Small',       icon: '🎤', type: 'model', category: 'extra' },
  { key: 'tiny',     label: 'Whisper Tiny',        icon: '🎤', type: 'model', category: 'extra' },
  { key: 'medium',   label: 'Whisper Medium',      icon: '🎤', type: 'model', category: 'extra' },
  { key: 'large-v3', label: 'Whisper Large v3',     icon: '🎤', type: 'model', category: 'extra' },
  { key: 'distil-large-v3', label: 'Whisper Distil Large', icon: '🎤', type: 'model', category: 'extra' },
  { key: 'flux-klein', label: 'FLUX Cover Art',   icon: '🎨', type: 'model', category: 'cover-art' },
  { key: 'flux-small-decoder', label: 'FLUX Decoder', icon: '🎨', type: 'model', category: 'cover-art' },
];

const FIRST_RUN_KEY = 'submaker-startup-check-done';
const API_BASE = window.API_URL || 'http://localhost:5000/api';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function StartupHealthCheck() {
  const { systemHealth, runSystemHealthCheck, setStartupCheckComplete, backendStatus, downloadModels, modelDownloading, modelProgress } = useAppStore();

  // ── Phase state: 'packages' first, then 'health' ─────────────────
  const [phase, setPhase] = useState('packages'); // 'packages' | 'health'
  const [pkgState, setPkgState] = useState({
    loading: false,          // fetching /packages/check
    missing: [],
    installed: [],
    warnings: {},            // pkg_name -> warning string (e.g. CPU-only torch)
    installing: false,
    log: [],                 // pip output lines (capped at 300)
    done: false,
    success: null,
    restartRequired: false,  // true when torch was installed (CUDA activation)
    error: null,
  });
  const pkgCheckDoneRef = useRef(false);
  const logEndRef = useRef(null);

  // ── Existing health-check state ───────────────────────────────────
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

  // ── Transition from packages phase to health phase ────────────────
  const proceedToHealthPhase = useCallback(() => {
    setPhase('health');
    if (!hasRunRef.current) {
      hasRunRef.current = true;
      runSystemHealthCheck(!isFirstRun);
    }
  }, [runSystemHealthCheck, isFirstRun]);

  // ── Check packages when backend comes online ──────────────────────
  useEffect(() => {
    if (backendStatus !== 'online' || pkgCheckDoneRef.current) return;
    pkgCheckDoneRef.current = true;

    setPkgState(s => ({ ...s, loading: true }));
    fetch(`${API_BASE}/packages/check`)
      .then(r => r.json())
      .then(data => {
        setPkgState(s => ({
          ...s,
          loading: false,
          missing: data.missing || [],
          installed: data.installed || [],
          warnings: data.warnings || {},
        }));
        if (!data.missing || data.missing.length === 0) {
          // All packages present — skip straight to health check
          proceedToHealthPhase();
        }
      })
      .catch(() => {
        // If check fails (e.g. endpoint not found), skip to health check
        setPkgState(s => ({ ...s, loading: false }));
        proceedToHealthPhase();
      });
  }, [backendStatus, proceedToHealthPhase]);

  // ── Auto-scroll pip log ───────────────────────────────────────────
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [pkgState.log]);

  // ── Restart application (after package install) ────────────────────
  const handleRestartApp = useCallback(() => {
    // First signal backend to restart itself, then Electron will relaunch
    fetch(`${API_BASE}/packages/restart`, { method: 'POST' }).catch(() => {});
    // Ask Electron to relaunch after a short delay
    if (window.electronAPI?.relaunchApp) {
      setTimeout(() => window.electronAPI.relaunchApp(), 800);
    } else {
      // Fallback: reload the window
      setTimeout(() => window.location.reload(), 800);
    }
  }, []);

  // ── Install missing packages (SSE stream) ─────────────────────────
  const handleInstallPackages = useCallback(async () => {
    setPkgState(s => ({ ...s, installing: true, log: [], done: false, error: null, restartRequired: false }));
    try {
      await streamJsonEvents(
        `${API_BASE}/packages/install`,
        { packages: pkgState.missing },
        (event) => {
          if (event.type === '_rc') return; // internal exit code marker
          if (event.type === 'output' || event.type === 'status' || event.type === 'command') {
            setPkgState(s => ({
              ...s,
              log: [...s.log.slice(-299), event.message],
            }));
          } else if (event.type === 'done') {
            setPkgState(s => ({
              ...s,
              installing: false,
              done: true,
              success: event.success,
              restartRequired: event.restart_required || false,
              log: [...s.log.slice(-299), event.message],
            }));
          } else if (event.type === 'error') {
            setPkgState(s => ({
              ...s,
              log: [...s.log.slice(-299), `⚠ ${event.message}`],
            }));
          }
        },
      );
    } catch (err) {
      setPkgState(s => ({
        ...s,
        installing: false,
        done: true,
        success: false,
        error: err.message,
        log: [...s.log.slice(-299), `Error: ${err.message}`],
      }));
    }
  }, [pkgState.missing]);

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
          {/* Close/skip button — always visible */}
          <button
            className="startup-close-btn"
            onClick={handleContinue}
            title="Skip & Continue"
          >
            ✕
          </button>
          <div className="startup-subtitle">
            {phase === 'packages' && pkgState.loading ? 'Checking Python packages...' :
             phase === 'packages' && pkgState.installing ? 'Installing missing packages...' :
             phase === 'packages' && pkgState.done && pkgState.success ? 'Packages ready' :
             phase === 'packages' && pkgState.missing.length > 0 ? 'Missing packages detected' :
             !systemHealth ? 'Connecting to backend...' :
             anyDownloading ? 'Downloading models...' :
             showDownloadUI && failCount > 0 ? 'Some models are missing' :
             allDone ? 'System check complete' : 'Verifying system components...'}
          </div>
        </div>

        {/* ── Packages phase ─────────────────────────────────────── */}
        {phase === 'packages' && (
          <div className="startup-pkg-phase">
            {pkgState.loading && (
              <div className="startup-pkg-loading">
                <span className="startup-icon-spin" />
                <span>Checking Python packages...</span>
              </div>
            )}

            {!pkgState.loading && !pkgState.installing && !pkgState.done && pkgState.missing.length > 0 && (
              <>
                <div className="startup-pkg-list">
                  {pkgState.missing.map(pkg => (
                    <div key={pkg} className="startup-pkg-item">
                      <span className="startup-pkg-icon">📦</span>
                      <span className="startup-pkg-name">{pkg}</span>
                      <span className="startup-pkg-badge">missing</span>
                      {pkgState.warnings[pkg] && (
                        <span className="startup-pkg-warning" title={pkgState.warnings[pkg]}>⚠ CPU only</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="startup-pkg-actions">
                  <button className="startup-btn startup-btn--primary" onClick={handleInstallPackages}>
                    Install {pkgState.missing.length} missing package{pkgState.missing.length !== 1 ? 's' : ''}
                  </button>
                  <button className="startup-btn startup-btn--secondary" onClick={proceedToHealthPhase}>
                    Skip
                  </button>
                </div>
              </>
            )}

            {(pkgState.installing || (pkgState.done && pkgState.log.length > 0)) && (
              <div className="startup-pkg-terminal">
                {pkgState.log.map((line, i) => (
                  <div key={i} className="startup-pkg-log-line">{line}</div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}

            {pkgState.done && (
              <div className={`startup-pkg-result ${pkgState.success ? 'startup-pkg-result--ok' : 'startup-pkg-result--fail'}`}>
                {pkgState.success
                  ? '✓ All packages installed successfully'
                  : `⚠ Installation failed${pkgState.error ? ': ' + pkgState.error : ''}`}
              </div>
            )}

            {pkgState.done && (
              <div className="startup-pkg-actions">
                {pkgState.success && pkgState.restartRequired && (
                  <button className="startup-btn startup-btn--primary" onClick={handleRestartApp}>
                    🔄 Restart App (Required for CUDA)
                  </button>
                )}
                {!pkgState.success && (
                  <button className="startup-btn startup-btn--primary" onClick={handleInstallPackages}>
                    Retry
                  </button>
                )}
                {(!pkgState.restartRequired) && (
                  <button
                    className={`startup-btn ${pkgState.success ? 'startup-btn--primary' : 'startup-btn--secondary'}`}
                    onClick={proceedToHealthPhase}
                  >
                    {pkgState.success ? 'Continue' : 'Skip & Continue'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Health check phase ───────────────────────────────────── */}
        {phase === 'health' && <>
        <div className="startup-checks">
          {CHECK_ITEMS.map((item) => {
            const state = itemStates[item.key] || 'waiting';
            const prog = progress[item.key] || 0;
            const isDownloading = modelDownloading[item.key];
            const dlProgress = modelProgress[item.key];
            const dlPercent = dlProgress?.progress || 0;
            const dlBytes = dlProgress?.downloaded_bytes || 0;
            const dlTotal = dlProgress?.total_bytes || 0;
            const dlError = dlProgress?.status === 'error' ? (dlProgress.error || 'Download failed') : null;

            return (
              <div key={item.key} className={`startup-check-row startup-check-row--${isDownloading ? 'checking' : state}`}>
                <div className="startup-check-icon">{item.icon}</div>
                <div className="startup-check-body">
                  <div className="startup-check-label">
                    {item.label}
                    {isDownloading && (
                      <span className="startup-download-badge">
                        {dlPercent > 0 ? `${dlPercent}%` : 'preparing...'}
                      </span>
                    )}
                    {isDownloading && dlTotal > 0 && (
                      <span className="startup-download-size">
                        {formatBytes(dlBytes)} / {formatBytes(dlTotal)}
                      </span>
                    )}
                    {!isDownloading && dlError && (
                      <span className="startup-download-badge startup-download-badge--error" title={dlError}>
                        failed
                      </span>
                    )}
                  </div>
                  <div className="startup-check-bar-track">
                    <div
                      className={`startup-check-bar-fill startup-check-bar-fill--${isDownloading ? 'downloading' : state}`}
                      style={{
                        width: isDownloading ? `${Math.max(2, dlPercent)}%` : `${prog}%`,
                        transition: isDownloading ? 'width 0.8s ease-out' : 'width 0.05s linear',
                      }}
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
                <span>Downloading models... Please wait</span>
                <button
                  className="startup-btn startup-btn--secondary"
                  onClick={handleContinue}
                  style={{ marginLeft: '12px' }}
                >
                  Skip
                </button>
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
        </>}
      </div>
    </div>
  );
}

export default StartupHealthCheck;
