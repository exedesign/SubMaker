import React, { useState, useCallback, useEffect } from 'react';
import { FiFilm, FiSettings, FiX, FiGlobe, FiMusic, FiUpload, FiFile, FiMinus, FiSquare, FiMaximize2, FiChevronsLeft, FiTrash2, FiDroplet } from 'react-icons/fi';
import THEMES from '../themes';

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
import { useAppStore } from '../stores/appStore';

function Header() {
  const [showSettings, setShowSettings] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const isElectron = !!window.electronAPI;
  const {
    settings, setSettings, setDualSubtitleEnabled, secondarySubtitle, updateAudioVisualization,
    mediaFile, originalFileName, mediaType, uploadFile,
    currentStep, subtitles,
    cacheInfo, fetchCacheInfo, clearCache,
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

  // Startup cache cleanup (if enabled)
  useEffect(() => {
    if (settings.cleanCacheOnStartup) {
      clearCache().then(() => fetchCacheInfo());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <header className="header">
        <div className="header-logo">
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
            ? <FiFile size={12} style={{ flexShrink: 0, color: mediaType === 'audio' ? '#22c55e' : '#6366f1' }} />
            : <FiUpload size={12} style={{ flexShrink: 0 }} />
          }
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName || 'Select Source'}
          </span>
          {mediaFile && <FiUpload size={11} style={{ flexShrink: 0, opacity: 0.5 }} />}
        </button>

        {/* Cache indicator — right next to settings gear */}
        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
            maxWidth: 450,
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
                onClick={() => setShowSettings(false)}
                style={{ padding: 8 }}
              >
                <FiX size={16} />
              </button>
            </div>
            
            {/* Settings Content */}
            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
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
                onClick={() => setShowSettings(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Header;
