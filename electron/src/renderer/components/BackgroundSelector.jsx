import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiImage, FiDroplet, FiGrid, FiActivity, FiShuffle, FiRefreshCw } from 'react-icons/fi';

// Predefined colors
const PRESET_COLORS = [
  '#000000', // Black
  '#FFFFFF', // White
  '#00FF00', // Green (chroma key)
  '#0000FF', // Blue (chroma key)
  '#1a1a2e', // Dark blue
  '#e94560', // Red accent
  '#0f4c75', // Navy
  '#3498db', // Blue
];

// Lazy load preset keys for visualizer
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

function BackgroundSelector() {
  const {
    background, setBackgroundType, setBackgroundColor, setBackgroundImage,
    visualizer, setVisualizerEnabled, updateVisualizer, setVisualizerPreset, randomizeVisualizerPreset,
  } = useAppStore();

  const [customColor, setCustomColor] = useState(background.value || '#000000');
  const [isUploading, setIsUploading] = useState(false);

  // Visualizer state
  const [presetKeys, setPresetKeys] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);

  // Determine active tab: color, image, transparent, or visualizer
  const activeTab = visualizer.enabled ? 'visualizer' : background.type;

  // Auto-cycle presets
  useEffect(() => {
    if (!visualizer.enabled || !visualizer.autoCycle) return;
    const interval = setInterval(() => {
      randomizeVisualizerPreset();
    }, visualizer.autoCycleInterval * 1000);
    return () => clearInterval(interval);
  }, [visualizer.enabled, visualizer.autoCycle, visualizer.autoCycleInterval]);

  // Load preset keys when visualizer tab is active
  useEffect(() => {
    if (visualizer.enabled && presetKeys.length === 0) {
      setIsLoadingPresets(true);
      loadPresetKeys().then((keys) => {
        setPresetKeys(keys);
        setIsLoadingPresets(false);
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

  const handleTabClick = (tab) => {
    if (tab === 'visualizer') {
      setVisualizerEnabled(true);
    } else {
      setVisualizerEnabled(false);
      setBackgroundType(tab);
    }
  };

  const handleImageSelect = async () => {
    try {
      setIsUploading(true);
      if (window.electronAPI && window.electronAPI.openImage) {
        const result = await window.electronAPI.openImage();
        if (result && !result.canceled && result.filePaths.length > 0) {
          setBackgroundImage(result.filePaths[0]);
          setIsUploading(false);
          return;
        }
      }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          try {
            const blobUrl = URL.createObjectURL(file);
            setBackgroundImage(blobUrl);
            const { uploadFile } = useAppStore.getState();
            const uploadResult = await uploadFile(file);
            if (uploadResult && uploadResult.file_path) {
              setBackgroundImage(uploadResult.file_path);
            } else {
              throw new Error('Upload failed');
            }
          } catch (uploadError) {
            console.error('Upload error:', uploadError);
            setBackgroundType('color');
            alert('Image upload failed.');
          } finally {
            setIsUploading(false);
          }
        } else {
          setIsUploading(false);
        }
      };
      input.click();
    } catch (err) {
      console.error('Image select error:', err);
      setIsUploading(false);
    }
  };

  return (
    <div>
      {/* Tab Selection: Color, Image, Alpha, Visualiser */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button
          className={`tab ${activeTab === 'color' ? 'active' : ''}`}
          onClick={() => handleTabClick('color')}
        >
          <FiDroplet size={12} style={{ flexShrink: 0 }} /> Color
        </button>
        <button
          className={`tab ${activeTab === 'image' ? 'active' : ''}`}
          onClick={() => handleTabClick('image')}
        >
          <FiImage size={12} style={{ flexShrink: 0 }} /> Image
        </button>
        <button
          className={`tab ${activeTab === 'transparent' ? 'active' : ''}`}
          onClick={() => handleTabClick('transparent')}
        >
          <FiGrid size={12} style={{ flexShrink: 0 }} /> Alpha
        </button>
        <button
          className={`tab ${activeTab === 'visualizer' ? 'active' : ''}`}
          onClick={() => handleTabClick('visualizer')}
        >
          <FiActivity size={12} style={{ flexShrink: 0 }} /> Visualiser
        </button>
      </div>

      {/* Color Picker */}
      {activeTab === 'color' && (
        <div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
            marginBottom: 12,
          }}>
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => {
                  setCustomColor(color);
                  setBackgroundColor(color);
                }}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  backgroundColor: color,
                  border: background.value === color
                    ? '3px solid var(--accent-primary)'
                    : '2px solid var(--border-color)',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
                title={color}
              />
            ))}
          </div>

          <div className="form-group">
            <label className="label">Custom Color</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="color"
                value={customColor}
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  setBackgroundColor(e.target.value);
                }}
                style={{
                  width: 48,
                  height: 36,
                  padding: 0,
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              />
              <input
                type="text"
                className="input"
                value={customColor}
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                    setBackgroundColor(e.target.value);
                  }
                }}
                placeholder="#000000"
              />
            </div>
          </div>
        </div>
      )}

      {/* Image Selector */}
      {activeTab === 'image' && (
        <div>
          {background.imagePath ? (
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  width: '100%',
                  aspectRatio: '16/9',
                  backgroundImage: `url(file://${background.imagePath})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              />
              <p style={{ fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                {background.imagePath.split(/[/\\]/).pop()}
              </p>
            </div>
          ) : (
            <div
              className="dropzone"
              onClick={handleImageSelect}
              style={{ padding: 24 }}
            >
              <FiImage size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
              <p>Click to select image</p>
            </div>
          )}

          <button
            className="btn btn-secondary"
            style={{ width: '100%' }}
            onClick={handleImageSelect}
            disabled={isUploading}
          >
            <FiImage /> {isUploading ? 'Uploading...' : background.imagePath ? 'Change Image' : 'Select Image'}
          </button>
        </div>
      )}

      {/* Transparent Info */}
      {activeTab === 'transparent' && (
        <div style={{
          padding: 12,
          background: 'var(--bg-primary)',
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--text-secondary)',
        }}>
          <p style={{ marginBottom: 8 }}>
            <strong>Alpha Channel</strong>
          </p>
          <p>
            Transparent background will be exported as WebM (VP9) or MOV (ProRes 4444).
            Perfect for overlaying on other videos.
          </p>
        </div>
      )}

      {/* Visualiser */}
      {activeTab === 'visualizer' && (
        <div>
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
            {isLoadingPresets ? (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Loading presets...
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
              marginBottom: visualizer.autoCycle ? 8 : 0,
            }}>
              <input
                type="checkbox"
                checked={visualizer.autoCycle}
                onChange={(e) => updateVisualizer({ autoCycle: e.target.checked })}
                style={{ width: 14, height: 14 }}
              />
              <FiRefreshCw size={12} />
              <span style={{ fontWeight: 600 }}>Auto Cycle</span>
            </label>

            {visualizer.autoCycle && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
                  <span>Interval</span>
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
              <label className="label" style={{ marginBottom: 0 }}>Opacity</label>
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
        </div>
      )}
    </div>
  );
}

export default BackgroundSelector;
