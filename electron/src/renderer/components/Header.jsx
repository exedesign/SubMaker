import React, { useState, useCallback, useEffect } from 'react';
import { FiFilm, FiSettings, FiX, FiGlobe, FiMusic, FiUpload, FiFile, FiMinus, FiSquare, FiMaximize2, FiChevronsLeft, FiTrash2, FiDroplet, FiHeart, FiCpu, FiDownload, FiCheck, FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';
import { useAppStore } from '../stores/appStore';
import packageJson from '../../../package.json';
import THEMES from '../themes';
import KeyboardShortcuts from './KeyboardShortcuts';

const Toggle = ({ enabled, onClick }) => (
  <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
    <svg width="36" height="20" viewBox="0 0 36 20">
      <rect x="0" y="0" width="36" height="20" rx="10"
        fill={enabled ? 'rgb(34, 197, 94)' : 'rgba(255,255,255,0.15)'} />
      <circle cx={enabled ? 26 : 10} cy="10" r="7"
        fill="#fff" />
    </svg>
  </button>
);

// ── System Health Panel ──────────────────────────────────────────────

const CATEGORY_LABELS = {
  required: 'Required',
  translation: 'Translation',
  extra: 'Extra Whisper Models',
  'cover-art': 'Cover Art',
};

const CATEGORY_ORDER = ['required', 'translation', 'extra', 'cover-art'];

function SystemHealthPanel({ systemHealth, healthCheckLoading, onRefresh, onDownload, modelDownloading }) {
  if (healthCheckLoading && !systemHealth) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
        <FiRefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: 12, fontSize: 13 }}>Checking system...</p>
      </div>
    );
  }

  if (!systemHealth) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
          Health check not available. Backend may be offline.
        </p>
        <button className="btn btn-primary" onClick={onRefresh} style={{ padding: '8px 20px' }}>
          <FiRefreshCw size={14} style={{ marginRight: 6 }} />
          Run Check
        </button>
      </div>
    );
  }

  const { python, ffmpeg, models, summary } = systemHealth;
  const missingModels = Object.entries(models).filter(([, m]) => m.status === 'missing' || m.status === 'incomplete');
  const missingKeys = missingModels.map(([k]) => k);

  // Group models by category
  const grouped = {};
  for (const cat of CATEGORY_ORDER) grouped[cat] = [];
  for (const [key, model] of Object.entries(models)) {
    const cat = model.category || 'extra';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ key, ...model });
  }

  return (
    <div>
      {/* System Status */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiCpu size={16} />
            System Status
          </label>
          <button
            className="btn btn-secondary"
            onClick={onRefresh}
            disabled={healthCheckLoading}
            style={{ padding: '4px 12px', fontSize: 11 }}
          >
            <FiRefreshCw size={12} style={{ marginRight: 4, animation: healthCheckLoading ? 'spin 1s linear infinite' : 'none' }} />
            {healthCheckLoading ? 'Checking...' : 'Refresh'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{
            padding: '10px 12px',
            background: python.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            borderRadius: 8,
            border: `1px solid ${python.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Python</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: python.ok ? '#22c55e' : '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
              {python.ok ? <FiCheck size={14} /> : <FiAlertTriangle size={14} />}
              {python.ok ? python.version : 'Not Found'}
            </div>
          </div>
          <div style={{
            padding: '10px 12px',
            background: ffmpeg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            borderRadius: 8,
            border: `1px solid ${ffmpeg.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>FFmpeg</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: ffmpeg.ok ? '#22c55e' : '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
              {ffmpeg.ok ? <FiCheck size={14} /> : <FiAlertTriangle size={14} />}
              {ffmpeg.ok ? 'Installed' : 'Not Found'}
            </div>
          </div>
        </div>

        {/* Summary bar */}
        <div style={{
          padding: '10px 12px',
          background: 'var(--bg-secondary)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
        }}>
          <span>
            <strong style={{ color: '#22c55e' }}>{summary.installed}</strong> installed
            {summary.incomplete > 0 && <>, <strong style={{ color: '#f59e0b' }}>{summary.incomplete}</strong> incomplete</>}
            {summary.missing > 0 && <>, <strong style={{ color: '#ef4444' }}>{summary.missing}</strong> missing</>}
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>{summary.total} total</span>
        </div>
      </div>

      {/* Download All Missing button */}
      {missingKeys.length > 0 && (
        <>
          <div style={{ height: 1, background: 'var(--border-color)', margin: '16px 0' }} />
          <button
            className="btn btn-primary"
            onClick={() => onDownload(missingKeys)}
            disabled={missingKeys.some(k => modelDownloading[k])}
            style={{ width: '100%', padding: '10px 16px', fontSize: 13, marginBottom: 16 }}
          >
            <FiDownload size={14} style={{ marginRight: 6 }} />
            Download {missingKeys.length} Missing Model{missingKeys.length > 1 ? 's' : ''}
          </button>
        </>
      )}

      {/* Models by category */}
      {CATEGORY_ORDER.map((cat) => {
        const catModels = grouped[cat];
        if (!catModels || catModels.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div style={{ height: 1, background: 'var(--border-color)', margin: '12px 0' }} />
            <label className="label" style={{ fontSize: 12, marginBottom: 8, display: 'block', color: 'var(--text-secondary)' }}>
              {CATEGORY_LABELS[cat] || cat}
            </label>
            {catModels.map((model) => {
              const isOk = model.status === 'ok';
              const isIncomplete = model.status === 'incomplete';
              const isMissing = model.status === 'missing' || model.status === 'empty';
              const isDownloading = !!modelDownloading[model.key];
              return (
                <div
                  key={model.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 6,
                    marginBottom: 6,
                    border: `1px solid ${isOk ? 'rgba(34,197,94,0.15)' : isIncomplete ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isOk ? (
                        <FiCheck size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
                      ) : isIncomplete ? (
                        <FiAlertTriangle size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
                      ) : (
                        <FiAlertTriangle size={13} style={{ color: '#ef4444', flexShrink: 0 }} />
                      )}
                      {model.name}
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 400 }}>
                        {model.size_mb >= 1000 ? `${(model.size_mb / 1000).toFixed(1)} GB` : `${model.size_mb} MB`}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {model.description}
                    </div>
                  </div>
                  {(isMissing || isIncomplete) && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => onDownload([model.key])}
                      disabled={isDownloading}
                      style={{ padding: '4px 10px', fontSize: 10, marginLeft: 8, flexShrink: 0 }}
                    >
                      {isDownloading ? (
                        <><FiRefreshCw size={11} style={{ marginRight: 4, animation: 'spin 1s linear infinite' }} />Downloading...</>
                      ) : (
                        <><FiDownload size={11} style={{ marginRight: 4 }} />Download</>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Header Component ─────────────────────────────────────────────────

function Header() {
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('general');
  const [showAbout, setShowAbout] = useState(false);
  const [gpuUnloading, setGpuUnloading] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const isElectron = !!window.electronAPI;
  const {
    settings, setSettings, setDualSubtitleEnabled, secondarySubtitle, updateAudioVisualization,
    mediaFile, originalFileName, mediaFileType, uploadFile,
    currentStep, subtitles,
    cacheInfo, fetchCacheInfo, clearCache,
    systemStats, fetchSystemStats, unloadAllModels,
    systemHealth, healthCheckLoading, runSystemHealthCheck, downloadModels, modelDownloading,
  } = useAppStore();

  const handleChangeSource = useCallback(async () => {
    const isUsableOriginalPath = (p) => {
      if (!p || typeof p !== 'string') return false;
      if (/[\\/]fakepath[\\/]/i.test(p)) return false;
      return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/');
    };

    try {
      // Try native Electron dialog first
      if (window.electronAPI?.openFile) {
        const result = await window.electronAPI.openFile({
          filters: [
            { name: 'Audio Files', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'flac'] },
            { name: 'Video Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] },
          ],
        });
        if (result && !result.canceled && result.filePaths.length > 0) {
          const filePath = result.filePaths[0];
          const ext = filePath.split('.').pop().toLowerCase();
          const audioExts = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'];
          const fileType = audioExts.includes(ext) ? 'audio' : 'video';
          
          // DEBUG: Log the exact path being set
          console.log('[SELECT AUDIO] Full file path:', filePath);
          console.log('[SELECT AUDIO] File type:', fileType);

          const fileName = window.electronAPI.getBasename
            ? await window.electronAPI.getBasename(filePath)
            : filePath.split(/[\\/]/).pop();
          const file = new File([], fileName);
          await uploadFile(file, { originalPath: filePath });
        }
        return;
      }
      // Fallback: backend native file dialog (browser mode)
      const { browseFile } = useAppStore.getState();
      await browseFile('media');
    } catch (err) {
      console.error('File change error:', err);
    }
  }, [uploadFile]);

  const displayName = originalFileName
    ? (originalFileName.length > 25 ? originalFileName.substring(0, 22) + '...' : originalFileName)
    : null;

  // Maximize state sync
  useEffect(() => {
    if (!isElectron) return;
    const handler = (_e, maximized) => setIsMaximized(maximized);
    window.electronAPI.onMaximizeChange?.(handler);
    return () => window.electronAPI.offMaximizeChange?.(handler);
  }, [isElectron]);

  const handleMinimize = () => window.electronAPI?.minimizeWindow?.();
  const handleMaximize = () => window.electronAPI?.maximizeWindow?.();
  const handleClose   = () => window.electronAPI?.closeWindow?.();

  // Cache info polling
  useEffect(() => {
    fetchCacheInfo();
    const iv = setInterval(fetchCacheInfo, 30000);
    return () => clearInterval(iv);
  }, [fetchCacheInfo]);

  // System stats polling (GPU VRAM + CPU)
  useEffect(() => {
    fetchSystemStats();
    const iv = setInterval(fetchSystemStats, 3000);
    return () => clearInterval(iv);
  }, [fetchSystemStats]);

  // Startup cache cleanup (if enabled)
  useEffect(() => {
    if (settings.cleanCacheOnStartup) {
      clearCache().then(() => fetchCacheInfo());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh health check when System tab is opened
  useEffect(() => {
    if (showSettings && settingsTab === 'system') {
      runSystemHealthCheck();
    }
  }, [showSettings, settingsTab, runSystemHealthCheck]);

  return (
    <>
      <header className="header">
        <div className="header-logo" onClick={() => setShowAbout(true)} style={{ cursor: 'pointer' }} title="About SubMaker">
          <FiFilm />
          <span>SubMaker</span>
        </div>

        {/* Source file indicator — always visible */}
        <button
          className="btn btn-ghost header-source-btn"
          onClick={handleChangeSource}
          title={originalFileName ? `Source: ${originalFileName}\nClick to change` : 'Select source file'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            fontSize: 12,
            color: 'var(--text-secondary)',
            borderRadius: 6,
            border: '1px solid var(--border-color)',
            background: 'var(--bg-tertiary)',
            maxWidth: 280,
          }}
        >
          {mediaFile
            ? <FiFile size={12} style={{ flexShrink: 0, color: mediaFileType === 'audio' ? '#22c55e' : '#6366f1' }} />
            : <FiUpload size={12} style={{ flexShrink: 0 }} />
          }
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName || 'Select Source'}
          </span>
          {mediaFile && <FiUpload size={11} style={{ flexShrink: 0, opacity: 0.5 }} />}
        </button>

        {/* Cache indicator — right next to settings gear */}
        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>

          {/* GPU VRAM bar */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', borderRadius: 6,
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
              height: 28, minWidth: 90, position: 'relative', overflow: 'hidden',
              WebkitAppRegion: 'no-drag', cursor: 'pointer',
              transition: 'border-color 0.2s',
            }}
            title={`GPU VRAM: ${systemStats.gpuUsedMb} / ${systemStats.gpuTotalMb} MB (${systemStats.gpuPercent}%) — Click to unload all models`}
            onClick={async () => {
              if (gpuUnloading) return;
              setGpuUnloading(true);
              try {
                await unloadAllModels();
                setTimeout(() => fetchSystemStats(), 500);
              } finally {
                setGpuUnloading(false);
              }
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary-color)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
          >
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${Math.min(100, systemStats.gpuPercent)}%`,
              background: systemStats.gpuPercent > 80 ? 'rgba(239,68,68,0.35)' : systemStats.gpuPercent > 50 ? 'rgba(249,115,22,0.3)' : 'rgba(99,102,241,0.25)',
              borderRadius: 6, transition: 'width 0.8s ease, background 0.5s',
            }} />
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'relative', zIndex: 1, opacity: 0.7, flexShrink: 0, color: '#6366f1' }}>
              <rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="10" y1="10" x2="10" y2="14"/><line x1="14" y1="10" x2="14" y2="14"/>
            </svg>
            <span style={{ position: 'relative', zIndex: 1, fontSize: 10, fontWeight: 600, color: gpuUnloading ? '#f59e0b' : 'var(--text-secondary)', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace" }}>
              {gpuUnloading
                ? 'Unloading...'
                : systemStats.gpuTotalMb > 0
                  ? `${(systemStats.gpuUsedMb / 1024).toFixed(1)}/${(systemStats.gpuTotalMb / 1024).toFixed(0)}G`
                  : 'N/A'
              }
            </span>
          </div>

          {/* CPU bar */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', borderRadius: 6,
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
              height: 28, minWidth: 65, position: 'relative', overflow: 'hidden',
              WebkitAppRegion: 'no-drag',
            }}
            title={`CPU Usage: ${systemStats.cpuPercent}%`}
          >
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${Math.min(100, systemStats.cpuPercent)}%`,
              background: systemStats.cpuPercent > 80 ? 'rgba(239,68,68,0.35)' : systemStats.cpuPercent > 50 ? 'rgba(249,115,22,0.3)' : 'rgba(34,197,94,0.25)',
              borderRadius: 6, transition: 'width 0.8s ease, background 0.5s',
            }} />
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'relative', zIndex: 1, opacity: 0.7, flexShrink: 0, color: '#22c55e' }}>
              <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
            </svg>
            <span style={{ position: 'relative', zIndex: 1, fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace" }}>
              {systemStats.cpuPercent}%
            </span>
          </div>

          {/* Temp size / clear */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              padding: '4px 10px',
              borderRadius: 6,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              minWidth: 110,
              height: 28,
              position: 'relative',
              overflow: 'hidden',
              WebkitAppRegion: 'no-drag',
              transition: 'border-color 0.2s',
            }}
            onClick={async () => { await clearCache(); fetchCacheInfo(); }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary-color)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
            title={`Temp: ${cacheInfo.fileCount} file(s) \u2014 Click to clear`}
          >
            {/* Rainbow gradient fill */}
            <div style={{
              position: 'absolute',
              left: 0, top: 0, bottom: 0,
              width: `${Math.min(100, (cacheInfo.sizeBytes / (2 * 1024 * 1024 * 1024)) * 100)}%`,
              background: 'linear-gradient(90deg, #22c55e, #84cc16, #eab308, #f97316, #ef4444)',
              opacity: 0.35,
              borderRadius: 6,
              transition: 'width 0.5s ease',
            }} />
            <FiTrash2 size={11} style={{ position: 'relative', zIndex: 1, opacity: 0.7, flexShrink: 0 }} />
            <span style={{
              position: 'relative', zIndex: 1,
              fontSize: 11, fontWeight: 500,
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
            }}>
              {cacheInfo.sizeBytes < 1024 * 1024
                ? `${Math.max(0, cacheInfo.sizeBytes / 1024).toFixed(0)} KB`
                : cacheInfo.sizeBytes < 1024 * 1024 * 1024
                ? `${(cacheInfo.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
                : `${(cacheInfo.sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
              }
            </span>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            title="Settings"
            onClick={() => setShowSettings(true)}
          >
            <FiSettings />
          </button>
          <button
            className="btn btn-ghost btn-icon about-heart-btn"
            title="About"
            onClick={() => setShowAbout(true)}
          >
            <FiHeart style={{ color: '#ef4444', fill: '#ef4444' }} />
          </button>
        </div>

        {/* Window controls — only in Electron */}
        {isElectron && (
          <div className="window-controls">
            <button className="wc-btn wc-minimize" onClick={handleMinimize} title="Minimize">
              <FiMinus size={14} />
            </button>
            <button className="wc-btn wc-maximize" onClick={handleMaximize} title={isMaximized ? 'Restore' : 'Maximize'}>
              {isMaximized ? <FiSquare size={13} /> : <FiMaximize2 size={13} />}
            </button>
            <button className="wc-btn wc-close" onClick={handleClose} title="Close">
              <FiX size={14} />
            </button>
          </div>
        )}
      </header>
      
      {/* Settings Modal */}
      {showSettings && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg-primary)',
            borderRadius: 12,
            width: '90%',
            maxWidth: 600,
            maxHeight: '85vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: 16,
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <h3 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FiSettings size={18} />
                Settings
              </h3>
              <button
                className="btn btn-secondary"
                onClick={() => { setShowSettings(false); setSettingsTab('general'); }}
                style={{ padding: 8 }}
              >
                <FiX size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{
              display: 'flex',
              borderBottom: '1px solid var(--border-color)',
              padding: '0 16px',
            }}>
              {[
                { id: 'general', label: 'General' },
                { id: 'system', label: 'System' },
                { id: 'shortcuts', label: 'Keyboard Shortcuts' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: settingsTab === tab.id ? '2px solid var(--primary-color)' : '2px solid transparent',
                    padding: '10px 16px',
                    fontSize: 13,
                    fontWeight: settingsTab === tab.id ? 600 : 400,
                    color: settingsTab === tab.id ? 'var(--primary-color)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            
            {/* Settings Content */}
            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              {settingsTab === 'shortcuts' ? (
                <KeyboardShortcuts />
              ) : settingsTab === 'system' ? (
                <SystemHealthPanel
                  systemHealth={systemHealth}
                  healthCheckLoading={healthCheckLoading}
                  onRefresh={runSystemHealthCheck}
                  onDownload={downloadModels}
                  modelDownloading={modelDownloading}
                />
              ) : (
              <>
              {/* Color Theme */}
              <div className="form-group">
                <label className="label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FiDroplet size={16} />
                  Color Theme
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {Object.entries(THEMES).map(([key, theme]) => (
                    <button
                      key={key}
                      className={`btn ${settings.colorTheme === key ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setSettings({ colorTheme: key })}
                      style={{
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        textAlign: 'left',
                        justifyContent: 'flex-start',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 3 }}>
                        {theme.preview.map((c, i) => (
                          <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: c, border: '1px solid rgba(255,255,255,0.15)' }} />
                        ))}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 500 }}>{theme.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--border-color)', margin: '20px 0' }} />

              {/* GIF Provider */}
              <div className="form-group">
                <label className="label" style={{ marginBottom: 8, display: 'block' }}>
                  GIF Service
                </label>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Select GIF search service for logo/watermark
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className={`btn ${settings.gifProvider === 'tenor' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setSettings({ gifProvider: 'tenor' })}
                    style={{ 
                      flex: 1, 
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 14 }}>🎬</span>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>Tenor</span>
                  </button>
                  <button
                    className={`btn ${settings.gifProvider === 'giphy' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setSettings({ gifProvider: 'giphy' })}
                    style={{ 
                      flex: 1, 
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 14 }}>🎥</span>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>Giphy</span>
                  </button>
                </div>
              </div>
              
              {/* Info */}
              <div style={{ 
                marginTop: 12, 
                padding: 8, 
                background: 'var(--bg-secondary)', 
                borderRadius: 6,
                fontSize: 11,
                color: 'var(--text-secondary)',
              }}>
                <strong style={{ color: 'var(--text-primary)' }}>💡 Tip:</strong> Both services offer free GIF search. Try switching for different results.
              </div>
              
              {/* Divider */}
              <div style={{ height: 1, background: 'var(--border-color)', margin: '20px 0' }} />
              
              {/* Secondary Subtitle Module Toggle */}
              <div className="form-group">
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  marginBottom: 8 
                }}>
                  <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FiGlobe size={16} />
                    Secondary Subtitle
                  </label>
                  <Toggle enabled={settings.dualSubtitleEnabled} onClick={() => setDualSubtitleEnabled(!settings.dualSubtitleEnabled)} />
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Show a translation in a second language below the main subtitle. Translation is automatic and manually editable.
                </p>
                
                {settings.dualSubtitleEnabled && (
                  <div style={{ 
                    padding: 12, 
                    background: 'rgba(99, 102, 241, 0.1)', 
                    borderRadius: 8,
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary-color)' }}>
                      <FiGlobe size={14} />
                      <span style={{ fontSize: 13 }}>Active</span>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
                      Configure settings from the Secondary Subtitle section in the sidebar.
                    </p>
                  </div>
                )}
              </div>
              
              {/* Divider */}
              <div style={{ height: 1, background: 'var(--border-color)', margin: '20px 0' }} />
              
              {/* Audio Visualization Settings */}
              <div className="form-group">
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  marginBottom: 8 
                }}>
                  <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FiMusic size={16} />
                    Audio Visualization
                  </label>
                  <Toggle enabled={settings.audioVisualization.showWaveform} onClick={() => updateAudioVisualization({ showWaveform: !settings.audioVisualization.showWaveform })} />
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Show waveform visualization on the timeline.
                  <br/>
                  <span style={{ color: 'var(--accent-success)' }}>✓ Waveform is enabled by default.</span>
                </p>
                
                {settings.audioVisualization.showWaveform && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <label style={{ fontSize: 12, minWidth: '80px' }}>Wave Height:</label>
                      <input
                        type="range"
                        min="80"
                        max="300"
                        value={settings.audioVisualization.waveformHeight}
                        onChange={(e) => updateAudioVisualization({ waveformHeight: parseInt(e.target.value) })}
                        style={{ flex: 1 }}
                      />
                      <span style={{ fontSize: 11, minWidth: '30px' }}>{settings.audioVisualization.waveformHeight}px</span>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <label style={{ fontSize: 12, minWidth: '80px' }}>Boost:</label>
                      <input
                        type="range"
                        min="1"
                        max="6"
                        step="0.2"
                        value={settings.audioVisualization.enhancement}
                        onChange={(e) => updateAudioVisualization({ enhancement: parseFloat(e.target.value) })}
                        style={{ flex: 1 }}
                      />
                      <span style={{ fontSize: 11, minWidth: '30px' }}>{settings.audioVisualization.enhancement.toFixed(1)}x</span>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <label style={{ fontSize: 12, minWidth: '80px' }}>Wave Color:</label>
                      <input
                        type="color"
                        value={settings.audioVisualization.waveformColor}
                        onChange={(e) => updateAudioVisualization({ waveformColor: e.target.value })}
                        style={{ 
                          width: 40,
                          height: 30,
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer'
                        }}
                      />
                    </div>
                  </div>
                )}
                
                {settings.audioVisualization.showWaveform && (
                  <div style={{ 
                    padding: 12, 
                    background: 'rgba(34, 197, 94, 0.1)', 
                    borderRadius: 8,
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#22c55e' }}>
                      <FiMusic size={14} />
                      <span style={{ fontSize: 13 }}>Active</span>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
                      Professional audio editor-style visualization enabled.
                    </p>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--border-color)', margin: '20px 0' }} />

              {/* Seek Step Setting */}
              <div className="form-group">
                <label className="label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FiChevronsLeft size={16} />
                  Keyboard Seek Step
                </label>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  How many seconds to skip when pressing the Left / Right arrow keys.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    step="1"
                    value={settings.seekStep ?? 5}
                    onChange={(e) => setSettings({ seekStep: parseInt(e.target.value) })}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 13, minWidth: 48, textAlign: 'right', color: 'var(--text-primary)' }}>
                    {settings.seekStep ?? 5} sec
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--border-color)', margin: '20px 0' }} />

              {/* Cache Cleanup on Startup */}
              <div className="form-group">
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8
                }}>
                  <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FiTrash2 size={16} />
                    Clear Cache on Startup
                  </label>
                  <Toggle enabled={settings.cleanCacheOnStartup} onClick={() => setSettings({ cleanCacheOnStartup: !settings.cleanCacheOnStartup })} />
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Automatically clear temp files and vocal cache when the application starts.
                </p>
              </div>
              </>
              )}
            </div>
            
            {/* Footer */}
            <div style={{
              padding: 16,
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'flex-end',
            }}>
              <button
                className="btn btn-primary"
                onClick={() => { setShowSettings(false); setSettingsTab('general'); }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {/* About Modal */}
      {showAbout && (
        <div className="about-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAbout(false); }}>
          <div className="about-modal">
            <div className="about-modal-header">
              <h3><FiHeart size={18} style={{ color: '#ef4444', fill: '#ef4444' }} /> About SubMaker</h3>
              <button className="btn btn-secondary" onClick={() => setShowAbout(false)} style={{ padding: 8 }}>
                <FiX size={16} />
              </button>
            </div>
            <div className="about-modal-body">
              {/* Author */}
              <div className="about-author">
                <div className="about-app-name">SubMaker</div>
                <div className="about-version">v{packageJson.version}</div>
                <div className="about-desc">Professional subtitle generator with AI-powered transcription, translation, cover art generation, video input support and audio visualization.</div>

                {/* Features */}
                <div className="about-features">
                  <div className="about-feature"><span className="about-feature-icon">🎙️</span><span>AI-powered speech-to-text transcription with word-level timing using Faster-Whisper, supporting 99 languages with automatic language detection</span></div>
                  <div className="about-feature"><span className="about-feature-icon">🌍</span><span>Local AI translation with Qwen 2.5, enabling dual-subtitle output in any language pair — no internet connection required</span></div>
                  <div className="about-feature"><span className="about-feature-icon">🎨</span><span>AI cover art generation powered by FLUX.2 Klein with NF4 quantization — produces high-quality images directly on your GPU with text overlay support and 17 typography styles</span></div>
                  <div className="about-feature"><span className="about-feature-icon">🎵</span><span>Real-time audio visualization with Butterchurn (Milkdrop) presets, waveform display and beat-reactive effects synced to your music</span></div>
                  <div className="about-feature"><span className="about-feature-icon">🎤</span><span>AI vocal isolation using BS-Roformer models — separate vocals from instrumentals for cleaner transcription results</span></div>
                  <div className="about-feature"><span className="about-feature-icon">📝</span><span>Advanced lyrics import with LRC/SRT parsing, manual timing editor and real-time synchronized preview</span></div>
                  <div className="about-feature"><span className="about-feature-icon">🎬</span><span>Video input support — import video files, preview with synchronized subtitles and render with burned-in subtitles using the original video as background source</span></div>
                  <div className="about-feature"><span className="about-feature-icon">🖼️</span><span>Multiple background modes — Milkdrop visualizer, solid color, custom image, gradient and source video with transparency support</span></div>
                  <div className="about-feature"><span className="about-feature-icon">💾</span><span>Full offline operation — all AI models run locally on your machine with intelligent VRAM management for consumer GPUs</span></div>
                </div>

                <div className="about-author-info">
                  <span className="about-label">Developer</span>
                  <span className="about-value">Fatih EKE</span>
                </div>
                <div className="about-author-info">
                  <span className="about-label">Contact</span>
                  <a className="about-link" href="mailto:fatiheke@gmail.com">fatiheke@gmail.com</a>
                </div>
              </div>

              {/* Technologies */}
              <div className="about-tech-title">Technologies & Credits</div>
              <div className="about-tech-list">
                <div className="about-tech-item">
                  <div className="about-tech-name">Electron</div>
                  <div className="about-tech-desc">Cross-platform desktop application framework by GitHub/Microsoft. Enables building native apps with web technologies.</div>
                </div>
                <div className="about-tech-item">
                  <div className="about-tech-name">React 18</div>
                  <div className="about-tech-desc">JavaScript UI library by Meta. Component-based architecture for building interactive user interfaces.</div>
                </div>
                <div className="about-tech-item">
                  <div className="about-tech-name">Vite</div>
                  <div className="about-tech-desc">Next-generation frontend build tool. Lightning-fast HMR and optimized production builds.</div>
                </div>
                <div className="about-tech-item">
                  <div className="about-tech-name">Zustand</div>
                  <div className="about-tech-desc">Lightweight state management for React. Minimal boilerplate with powerful subscription model.</div>
                </div>
                <div className="about-tech-item">
                  <div className="about-tech-name">Flask + SocketIO</div>
                  <div className="about-tech-desc">Python web framework with real-time WebSocket support. Powers the backend API and streaming progress updates.</div>
                </div>
                <div className="about-tech-item">
                  <div className="about-tech-name">Faster-Whisper</div>
                  <div className="about-tech-desc">CTranslate2-based Whisper implementation by SYSTRAN. Up to 4x faster than OpenAI Whisper with word-level timestamps.</div>
                </div>
                <div className="about-tech-item">
                  <div className="about-tech-name">Qwen 2.5-3B AWQ</div>
                  <div className="about-tech-desc">Large language model by Alibaba Cloud. Used for AI translation and lyrics analysis with AWQ quantization for efficient GPU inference.</div>
                </div>
                <div className="about-tech-item">
                  <div className="about-tech-name">FLUX.2 Klein</div>
                  <div className="about-tech-desc">4B parameter text-to-image model by Black Forest Labs. NF4 quantized for cover art generation on consumer GPUs.</div>
                </div>
                <div className="about-tech-item">
                  <div className="about-tech-name">Hugging Face Diffusers</div>
                  <div className="about-tech-desc">State-of-the-art diffusion model library. Provides pipeline infrastructure for image generation.</div>
                </div>
                <div className="about-tech-item">
                  <div className="about-tech-name">BitsAndBytes</div>
                  <div className="about-tech-desc">Quantization library by Tim Dettmers. Enables NF4/INT8 quantization for running large models on limited VRAM.</div>
                </div>
                <div className="about-tech-item">
                  <div className="about-tech-name">PyTorch + CUDA</div>
                  <div className="about-tech-desc">Deep learning framework by Meta with NVIDIA CUDA GPU acceleration. Foundation for all AI inference operations.</div>
                </div>
                <div className="about-tech-item">
                  <div className="about-tech-name">Audio-Separator</div>
                  <div className="about-tech-desc">BS-Roformer based vocal isolation. Separates vocals from instrumentals using HyperACE v2 and Resurrection UNWA models.</div>
                </div>
                <div className="about-tech-item">
                  <div className="about-tech-name">Butterchurn</div>
                  <div className="about-tech-desc">WebGL Milkdrop visualizer by Jordan Berg. Real-time music visualization with thousands of community presets.</div>
                </div>
                <div className="about-tech-item">
                  <div className="about-tech-name">Librosa</div>
                  <div className="about-tech-desc">Audio analysis library for Python. Provides audio feature extraction, waveform analysis and signal processing.</div>
                </div>
                <div className="about-tech-item">
                  <div className="about-tech-name">Mutagen</div>
                  <div className="about-tech-desc">Python module for handling audio metadata. Reads and writes ID3 tags for MP3 and other audio formats.</div>
                </div>
                <div className="about-tech-item">
                  <div className="about-tech-name">FFmpeg</div>
                  <div className="about-tech-desc">Complete multimedia framework. Audio/video encoding, decoding, transcoding and muxing operations.</div>
                </div>
              </div>
            </div>
            <div className="about-modal-footer">
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 10, fontStyle: 'italic', lineHeight: 1.4 }}>
                Loved this? Support me to make the next one even better.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', width: '100%', marginBottom: 8 }}>
                {/* Kreosus */}
                <button
                  className="about-support-btn"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={() => {
                    const url = 'https://kreosus.com/exedesign#creator-profile-support';
                    if (window.electronAPI?.openExternal) {
                      window.electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#f59e0b" strokeWidth="2" fill="none"/>
                    <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#f59e0b">K</text>
                  </svg>
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <span style={{ fontSize: 11, fontWeight: 600 }}>Kreosus</span>
                    <span style={{ fontSize: 9, opacity: 0.7 }}>Support</span>
                  </span>
                </button>
                {/* Patreon - Monthly */}
                <button
                  className="about-support-btn"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={() => {
                    const url = 'https://www.patreon.com/10985664/join';
                    if (window.electronAPI?.openExternal) {
                      window.electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14.82 2.41c3.96 0 7.18 3.24 7.18 7.21 0 3.96-3.22 7.18-7.18 7.18-3.97 0-7.21-3.22-7.21-7.18 0-3.97 3.24-7.21 7.21-7.21M2 21.6h3.5V2.41H2V21.6z" fill="#FF424D"/>
                  </svg>
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <span style={{ fontSize: 11, fontWeight: 600 }}>Patreon</span>
                    <span style={{ fontSize: 9, opacity: 0.7 }}>Monthly</span>
                  </span>
                </button>
                {/* Patreon - One-time */}
                <button
                  className="about-support-btn"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={() => {
                    const url = 'https://www.patreon.com/cw/fatiheke/shop';
                    if (window.electronAPI?.openExternal) {
                      window.electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14.82 2.41c3.96 0 7.18 3.24 7.18 7.21 0 3.96-3.22 7.18-7.18 7.18-3.97 0-7.21-3.22-7.21-7.18 0-3.97 3.24-7.21 7.21-7.21M2 21.6h3.5V2.41H2V21.6z" fill="#FF424D"/>
                  </svg>
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                    <span style={{ fontSize: 11, fontWeight: 600 }}>Patreon</span>
                    <span style={{ fontSize: 9, opacity: 0.7 }}>One-time</span>
                  </span>
                </button>
              </div>
              <span>© 2026 Fatih EKE — All rights reserved</span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.6, marginTop: 2 }}>
                Made with VS Code, GitHub Copilot &amp; Claude
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Header;
