import React from 'react';
import { useAppStore } from '../stores/appStore';

function AudioVisualizationSettings() {
  const { settings, updateAudioVisualization } = useAppStore();
  const audioViz = settings.audioVisualization;

  const handleToggleWaveform = () => {
    updateAudioVisualization({
      showWaveform: !audioViz.showWaveform
    });
  };

  const handleToggleSpectrogram = () => {
    updateAudioVisualization({
      showSpectrogram: !audioViz.showSpectrogram
    });
  };

  const handleToggleGrid = () => {
    updateAudioVisualization({
      showGrid: !audioViz.showGrid
    });
  };

  const handleWaveformHeightChange = (e) => {
    updateAudioVisualization({
      waveformHeight: parseInt(e.target.value)
    });
  };

  const handleSpectrogramHeightChange = (e) => {
    updateAudioVisualization({
      spectrogramHeight: parseInt(e.target.value)
    });
  };

  const handleWaveformColorChange = (e) => {
    updateAudioVisualization({
      waveformColor: e.target.value
    });
  };

  const handleSpectrogramOpacityChange = (e) => {
    updateAudioVisualization({
      spectrogramOpacity: parseFloat(e.target.value)
    });
  };

  const handleEnhancementChange = (e) => {
    updateAudioVisualization({
      enhancement: parseFloat(e.target.value)
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
      {/* Waveform Settings */}
      <div style={{
        padding: 16,
        background: 'var(--bg-card)',
        borderRadius: 8,
        border: '1px solid var(--border-color)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: '700', marginBottom: 4, color: '#4A9EFF' }}>
              🌊 Waveform Visualization
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Professional audio waveform analysis
            </div>
          </div>

          <label className="switch">
            <input
              type="checkbox"
              checked={audioViz.showWaveform}
              onChange={handleToggleWaveform}
            />
            <span className="slider"></span>
          </label>
        </div>

        {audioViz.showWaveform && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Waveform Height */}
            <div>
              <label style={{ fontSize: 12, fontWeight: '600', color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
                Height: {audioViz.waveformHeight}px
              </label>
              <input
                type="range"
                min="60"
                max="300"
                value={audioViz.waveformHeight}
                onChange={handleWaveformHeightChange}
                style={{ width: '100%', accentColor: '#4A9EFF' }}
              />
            </div>

            {/* Waveform Color */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <label style={{ fontSize: 12, fontWeight: '600', color: 'var(--text-muted)', flex: 1 }}>
                Color
              </label>
              <input
                type="color"
                value={audioViz.waveformColor}
                onChange={handleWaveformColorChange}
                style={{
                  width: 50,
                  height: 30,
                  border: '2px solid var(--border-color)',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Spectrogram Settings */}
      <div style={{
        padding: 16,
        background: 'var(--bg-card)',
        borderRadius: 8,
        border: '1px solid var(--border-color)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: '700', marginBottom: 4, color: '#FF6B35' }}>
              🔥 Spectrogram Analysis
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Frequency domain heat map
            </div>
          </div>

          <label className="switch">
            <input
              type="checkbox"
              checked={audioViz.showSpectrogram}
              onChange={handleToggleSpectrogram}
            />
            <span className="slider"></span>
          </label>
        </div>

        {audioViz.showSpectrogram && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Spectrogram Height */}
            <div>
              <label style={{ fontSize: 12, fontWeight: '600', color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
                Height: {audioViz.spectrogramHeight}px
              </label>
              <input
                type="range"
                min="80"
                max="400"
                value={audioViz.spectrogramHeight}
                onChange={handleSpectrogramHeightChange}
                style={{ width: '100%', accentColor: '#FF6B35' }}
              />
            </div>

            {/* Spectrogram Opacity */}
            <div>
              <label style={{ fontSize: 12, fontWeight: '600', color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
                Opacity: {Math.round(audioViz.spectrogramOpacity * 100)}%
              </label>
              <input
                type="range"
                min="0.3"
                max="1.0"
                step="0.1"
                value={audioViz.spectrogramOpacity}
                onChange={handleSpectrogramOpacityChange}
                style={{ width: '100%', accentColor: '#FF6B35' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Advanced Settings */}
      <div style={{
        padding: 16,
        background: 'var(--bg-card)',
        borderRadius: 8,
        border: '1px solid var(--border-color)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{ fontSize: 15, fontWeight: '700', marginBottom: 12, color: '#8B5CF6' }}>
          ⚙️ Advanced Settings
        </div>

        {/* Grid Toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: '600' }}>
              Grid Lines
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Show reference lines
            </div>
          </div>

          <label className="switch">
            <input
              type="checkbox"
              checked={audioViz.showGrid}
              onChange={handleToggleGrid}
            />
            <span className="slider"></span>
          </label>
        </div>

        {/* Enhancement Level */}
        <div>
          <label style={{ fontSize: 12, fontWeight: '600', color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
            Visual Boost: {audioViz.enhancement}x
          </label>
          <input
            type="range"
            min="1.0"
            max="3.0"
            step="0.1"
            value={audioViz.enhancement || 1.5}
            onChange={handleEnhancementChange}
            style={{ width: '100%', accentColor: '#8B5CF6' }}
          />
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            Higher values produce a more prominent visual
          </div>
        </div>
      </div>
              <input
                type="color"
                value={audioViz.waveformColor}
                onChange={handleWaveformColorChange}
                style={{
                  width: '100%',
                  height: 32,
                  borderRadius: 4,
                  border: '1px solid var(--border-color)'
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Spectrogram Settings */}
      <div style={{
        padding: 12,
        background: 'var(--bg-card)',
        borderRadius: 6,
        border: '1px solid var(--border-color)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: '600', marginBottom: 2 }}>
              📊 Spectrogram
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Frequency analysis visual representation
            </div>
          </div>

          <label className="switch">
            <input
              type="checkbox"
              checked={audioViz.showSpectrogram}
              onChange={handleToggleSpectrogram}
            />
            <span className="slider"></span>
          </label>
        </div>

        {audioViz.showSpectrogram && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Spectrogram Height */}
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                Height: {audioViz.spectrogramHeight}px
              </label>
              <input
                type="range"
                min="60"
                max="300"
                value={audioViz.spectrogramHeight}
                onChange={handleSpectrogramHeightChange}
                style={{ width: '100%' }}
              />
            </div>

            {/* Spectrogram Opacity */}
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                Opacity: {Math.round(audioViz.spectrogramOpacity * 100)}%
              </label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={audioViz.spectrogramOpacity}
                onChange={handleSpectrogramOpacityChange}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Info Footer */}
      <div style={{
        padding: 14,
        background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-card))',
        borderRadius: 8,
        border: '1px solid var(--border-light)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: '500' }}>
          🎚️ Professional Audio Editor Visualization
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          Advanced audio visualization with spectrum and waveform analysis
        </div>
      </div>
    </div>
  );
}

export default AudioVisualizationSettings;
