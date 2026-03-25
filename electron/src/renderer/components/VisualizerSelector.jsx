/**
 * VisualizerSelector - Sidebar UI for Butterchurn/Milkdrop visualizer settings
 */
import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiActivity, FiShuffle, FiRefreshCw } from 'react-icons/fi';

// Lazy load preset keys
let cachedPresetKeys = null;

async function loadPresetKeys() {
  if (cachedPresetKeys) return cachedPresetKeys;
  try {
    const { getPresetKeys } = await import('./ButterchurnCanvas');
    cachedPresetKeys = await getPresetKeys();
    return cachedPresetKeys;
  } catch (e) {
    console.error('Failed to load preset keys:', e);
    return [];
  }
}

function VisualizerSelector() {
  const {
    visualizer,
    setVisualizerEnabled,
    updateVisualizer,
    setVisualizerPreset,
    randomizeVisualizerPreset,
  } = useAppStore();

  const [presetKeys, setPresetKeys] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Auto-cycle presets
  useEffect(() => {
    if (!visualizer.enabled || !visualizer.autoCycle) return;
    const interval = setInterval(() => {
      randomizeVisualizerPreset();
    }, visualizer.autoCycleInterval * 1000);
    return () => clearInterval(interval);
  }, [visualizer.enabled, visualizer.autoCycle, visualizer.autoCycleInterval]);

  // Load preset keys when enabled
  useEffect(() => {
    if (visualizer.enabled && presetKeys.length === 0) {
      setIsLoading(true);
      loadPresetKeys().then((keys) => {
        setPresetKeys(keys);
        setIsLoading(false);
        // Set initial random preset if none selected
        if (!visualizer.presetName && keys.length > 0) {
          const randomKey = keys[Math.floor(Math.random() * keys.length)];
          setVisualizerPreset(randomKey);
        }
      });
    }
  }, [visualizer.enabled]);

  const filteredPresets = searchTerm
    ? presetKeys.filter(k => k.toLowerCase().includes(searchTerm.toLowerCase()))
    : presetKeys;

  return (
    <div>
      {/* Enable/Disable Toggle */}
      <div style={{
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: 6,
        padding: 12,
        marginBottom: 12,
        background: visualizer.enabled ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
      }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          fontSize: 13,
        }}>
          <input
            type="checkbox"
            checked={visualizer.enabled}
            onChange={(e) => setVisualizerEnabled(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <FiActivity size={14} style={{ color: 'rgb(99, 102, 241)' }} />
          <span style={{ fontWeight: 600 }}>Milkdrop Visualizer</span>
        </label>
        <p style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          marginTop: 6,
          marginLeft: 32,
        }}>
          Sesle senkron ProjectM/Milkdrop görselleştirici. Önizleme ve videoda görünür.
        </p>
      </div>

      {visualizer.enabled && (
        <>
          {/* Preset Selection */}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Preset</span>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 10, padding: '2px 8px' }}
                onClick={randomizeVisualizerPreset}
                title="Rastgele preset"
              >
                <FiShuffle size={11} /> Rastgele
              </button>
            </label>

            {/* Search */}
            <input
              type="text"
              className="input"
              placeholder="Preset ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ marginBottom: 6, fontSize: 11 }}
            />

            {/* Preset dropdown */}
            {isLoading ? (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Presetler yükleniyor...
              </p>
            ) : (
              <select
                className="select"
                value={visualizer.presetName || ''}
                onChange={(e) => setVisualizerPreset(e.target.value)}
                style={{ fontSize: 11 }}
              >
                {filteredPresets.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            )}

            {visualizer.presetName && (
              <p style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                marginTop: 4,
                wordBreak: 'break-all',
              }}>
                {visualizer.presetName}
              </p>
            )}
          </div>

          {/* Auto-Cycle */}
          <div style={{
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            padding: 10,
            marginBottom: 12,
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              fontSize: 12,
              marginBottom: 8,
            }}>
              <input
                type="checkbox"
                checked={visualizer.autoCycle}
                onChange={(e) => updateVisualizer({ autoCycle: e.target.checked })}
                style={{ width: 14, height: 14 }}
              />
              <FiRefreshCw size={12} />
              <span style={{ fontWeight: 600 }}>Otomatik Değiştir</span>
            </label>

            {visualizer.autoCycle && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
                  <span>Aralık</span>
                  <span>{visualizer.autoCycleInterval}s</span>
                </div>
                <input
                  type="range"
                  min="10" max="120" step="5"
                  value={visualizer.autoCycleInterval}
                  onChange={(e) => updateVisualizer({ autoCycleInterval: parseInt(e.target.value) })}
                  style={{ width: '100%', height: 4 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                  <span>10s</span>
                  <span>120s</span>
                </div>
              </div>
            )}
          </div>

          {/* Opacity */}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="label" style={{ marginBottom: 0 }}>Saydamlık</label>
              <span style={{
                background: 'rgba(99, 102, 241, 0.2)',
                padding: '2px 8px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 600,
                color: 'rgb(99, 102, 241)',
              }}>{Math.round(visualizer.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0" max="100" step="5"
              value={Math.round(visualizer.opacity * 100)}
              onChange={(e) => updateVisualizer({ opacity: parseInt(e.target.value) / 100 })}
              style={{ width: '100%', height: 4 }}
            />
          </div>

          {/* Sensitivity */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="label" style={{ marginBottom: 0 }}>Ses Hassasiyeti</label>
              <span style={{
                background: 'rgba(139, 92, 246, 0.2)',
                padding: '2px 8px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 600,
                color: 'rgb(139, 92, 246)',
              }}>{visualizer.sensitivity.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="5" max="30" step="1"
              value={Math.round(visualizer.sensitivity * 10)}
              onChange={(e) => updateVisualizer({ sensitivity: parseInt(e.target.value) / 10 })}
              style={{ width: '100%', height: 4 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
              <span>0.5x</span>
              <span>1.0x</span>
              <span>3.0x</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default VisualizerSelector;
