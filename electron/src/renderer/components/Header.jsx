import React, { useState, useCallback } from 'react';
import { FiFilm, FiSettings, FiFolder, FiX, FiGlobe, FiToggleLeft, FiToggleRight, FiMusic, FiUpload, FiFile } from 'react-icons/fi';
import { useAppStore } from '../stores/appStore';

function Header() {
  const [showSettings, setShowSettings] = useState(false);
  const {
    settings, setSettings, setDualSubtitleEnabled, secondarySubtitle, updateAudioVisualization,
    mediaFile, originalFileName, mediaType, setMediaFile, uploadFile,
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
          
          setMediaFile(filePath, fileType);
          useAppStore.getState().setCurrentStep('transcribe');
        }
        return;
      }
      // Fallback: backend native file dialog (browser mode)
      const { browseFile } = useAppStore.getState();
      await browseFile('media');
    } catch (err) {
      console.error('File change error:', err);
    }
  }, [setMediaFile, uploadFile]);

  const displayName = originalFileName
    ? (originalFileName.length > 25 ? originalFileName.substring(0, 22) + '...' : originalFileName)
    : null;

  return (
    <>
      <header className="header">
        <div className="header-logo">
          <FiFilm />
          <span>SubMaker</span>
        </div>

        {/* Source file indicator */}
        {mediaFile && (
          <button
            className="btn btn-ghost header-source-btn"
            onClick={handleChangeSource}
            title={originalFileName ? `Kaynak: ${originalFileName}\nTıklayarak değiştir` : 'Kaynak dosya seç'}
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
            <FiFile size={12} style={{ flexShrink: 0, color: mediaType === 'audio' ? '#22c55e' : '#6366f1' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName || 'Kaynak Seç'}
            </span>
            <FiUpload size={11} style={{ flexShrink: 0, opacity: 0.5 }} />
          </button>
        )}

        <div className="header-actions">
          {/* Change source button (when no media loaded) */}
          {!mediaFile && (
            <button
              className="btn btn-ghost btn-icon"
              title="Kaynak dosya seç"
              onClick={handleChangeSource}
            >
              <FiUpload />
            </button>
          )}
          <button
            className="btn btn-ghost btn-icon"
            title="Open Project Folder"
            onClick={() => window.electronAPI?.openPath('.')}
          >
            <FiFolder />
          </button>
          <button
            className="btn btn-ghost btn-icon"
            title="Settings"
            onClick={() => setShowSettings(true)}
          >
            <FiSettings />
          </button>
        </div>
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
            overflow: 'hidden',
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
                Ayarlar
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
            <div style={{ padding: 20 }}>
              {/* GIF Provider */}
              <div className="form-group">
                <label className="label" style={{ marginBottom: 8, display: 'block' }}>
                  GIF Servisi
                </label>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Logo/Watermark için GIF arama servisini seçin
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className={`btn ${settings.gifProvider === 'tenor' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setSettings({ gifProvider: 'tenor' })}
                    style={{ 
                      flex: 1, 
                      padding: '12px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>🎬</span>
                    <span style={{ fontWeight: 600 }}>Tenor</span>
                    <span style={{ fontSize: 10, opacity: 0.7 }}>by Google</span>
                  </button>
                  <button
                    className={`btn ${settings.gifProvider === 'giphy' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setSettings({ gifProvider: 'giphy' })}
                    style={{ 
                      flex: 1, 
                      padding: '12px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>🎥</span>
                    <span style={{ fontWeight: 600 }}>Giphy</span>
                    <span style={{ fontSize: 10, opacity: 0.7 }}>Popular</span>
                  </button>
                </div>
              </div>
              
              {/* Info */}
              <div style={{ 
                marginTop: 20, 
                padding: 12, 
                background: 'var(--bg-secondary)', 
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}>
                <strong style={{ color: 'var(--text-primary)' }}>💡 İpucu:</strong><br/>
                Her iki servis de ücretsiz GIF araması sunar. Farklı sonuçlar için servisi değiştirmeyi deneyebilirsiniz.
              </div>
              
              {/* Divider */}
              <div style={{ height: 1, background: 'var(--border-color)', margin: '20px 0' }} />
              
              {/* Dual Subtitle Module Toggle */}
              <div className="form-group">
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  marginBottom: 8 
                }}>
                  <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FiGlobe size={16} />
                    Çift Dilli Altyazı
                  </label>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setDualSubtitleEnabled(!settings.dualSubtitleEnabled)}
                    style={{ 
                      padding: 4,
                      color: settings.dualSubtitleEnabled ? 'var(--primary-color)' : 'var(--text-secondary)'
                    }}
                  >
                    {settings.dualSubtitleEnabled ? <FiToggleRight size={28} /> : <FiToggleLeft size={28} />}
                  </button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Ana altyazının altında ikinci bir dilde çeviri gösterin. Çeviri otomatik yapılır ve manuel düzenlenebilir.
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
                      <span style={{ fontSize: 13 }}>Aktif</span>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
                      Stil panelinde "Çift Dil" sekmesinden ayarları yapabilirsiniz.
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
                    Audio Görselleştirme
                  </label>
                  <button
                    className="btn btn-ghost"
                    onClick={() => updateAudioVisualization({ showWaveform: !settings.audioVisualization.showWaveform })}
                    style={{ 
                      padding: 4,
                      color: settings.audioVisualization.showWaveform ? 'var(--primary-color)' : 'var(--text-secondary)'
                    }}
                  >
                    {settings.audioVisualization.showWaveform ? <FiToggleRight size={28} /> : <FiToggleLeft size={28} />}
                  </button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Zaman çizelgesinde ses dalgası görselleştirmesi gösterin.
                  <br/>
                  <span style={{ color: 'var(--accent-success)' }}>✓ Waveform varsayılan olarak aktiftir.</span>
                </p>
                
                {settings.audioVisualization.showWaveform && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <label style={{ fontSize: 12, minWidth: '80px' }}>Dalga Yüksek.:</label>
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
                      <label style={{ fontSize: 12, minWidth: '80px' }}>Güçlendirme:</label>
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
                      <label style={{ fontSize: 12, minWidth: '80px' }}>Dalga Rengi:</label>
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
                      <span style={{ fontSize: 13 }}>Aktif</span>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
                      Profesyonel ses düzenleyicisi tarzında görselleştirme etkin.
                    </p>
                  </div>
                )}
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
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Header;
