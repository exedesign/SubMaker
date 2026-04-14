import React, { useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';

/**
 * CoverArtSettings — Collapsible settings panel for image generation.
 * Steps, CFG Scale, dimensions, seed, and system prompt.
 */
function CoverArtSettings() {
  const { coverArt, setCoverArt, fetchDefaultSystemPrompt } = useAppStore();

  // Fetch default system prompt on first mount
  useEffect(() => {
    if (!coverArt.defaultSystemPrompt) {
      fetchDefaultSystemPrompt();
    }
  }, []);

  const [isCustomSize, setIsCustomSize] = useState(false);

  const SIZE_OPTIONS = [
    { label: '512×512', w: 512, h: 512 },
    { label: '768×768', w: 768, h: 768 },
    { label: '1024×1024', w: 1024, h: 1024 },
  ];

  const isPresetMatch = SIZE_OPTIONS.some(o => o.w === coverArt.width && o.h === coverArt.height);

  const handleResetAll = () => {
    setCoverArt({
      steps: 4,
      cfgScale: 1.0,
      width: 1024,
      height: 1024,
      seed: -1,
      systemPrompt: coverArt.defaultSystemPrompt,
    });
  };

  return (
    <div className="cover-art-settings">
      {/* Steps */}
      <div className="cover-art-setting-row">
        <label>Steps</label>
        <div className="cover-art-setting-control">
          <input
            type="range"
            min={1}
            max={50}
            step={1}
            value={coverArt.steps}
            onChange={(e) => setCoverArt({ steps: parseInt(e.target.value) })}
          />
          <span className="cover-art-setting-value">{coverArt.steps}</span>
        </div>
      </div>

      {/* CFG Scale */}
      <div className="cover-art-setting-row">
        <label>CFG Scale</label>
        <div className="cover-art-setting-control">
          <input
            type="range"
            min={0}
            max={20}
            step={0.1}
            value={coverArt.cfgScale}
            onChange={(e) => setCoverArt({ cfgScale: parseFloat(e.target.value) })}
          />
          <span className="cover-art-setting-value">{coverArt.cfgScale.toFixed(1)}</span>
        </div>
      </div>

      {/* Dimensions */}
      <div className="cover-art-setting-row">
        <label>Size</label>
        <div className="cover-art-size-buttons">
          {SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              className={`cover-art-size-btn ${!isCustomSize && coverArt.width === opt.w && coverArt.height === opt.h ? 'active' : ''}`}
              onClick={() => { setIsCustomSize(false); setCoverArt({ width: opt.w, height: opt.h }); }}
            >
              {opt.label}
            </button>
          ))}
          <button
            className={`cover-art-size-btn ${isCustomSize || !isPresetMatch ? 'active' : ''}`}
            onClick={() => setIsCustomSize(true)}
          >
            Custom
          </button>
        </div>
        {(isCustomSize || !isPresetMatch) && (
          <div className="cover-art-custom-size">
            <input
              type="number"
              min={256}
              max={2048}
              step={16}
              value={coverArt.width}
              onChange={(e) => setCoverArt({ width: Math.max(256, Math.min(2048, parseInt(e.target.value) || 512)) })}
            />
            <span>×</span>
            <input
              type="number"
              min={256}
              max={2048}
              step={16}
              value={coverArt.height}
              onChange={(e) => setCoverArt({ height: Math.max(256, Math.min(2048, parseInt(e.target.value) || 512)) })}
            />
          </div>
        )}
      </div>

      {/* Seed */}
      <div className="cover-art-setting-row">
        <label>Seed</label>
        <div className="cover-art-setting-control">
          <input
            type="number"
            className="cover-art-seed-input"
            value={coverArt.seed}
            onChange={(e) => setCoverArt({ seed: parseInt(e.target.value) || -1 })}
            placeholder="-1 (random)"
          />
          <button
            className="cover-art-btn-small"
            onClick={() => setCoverArt({ seed: -1 })}
            title="Reset to random"
          >
            🎲
          </button>
        </div>
      </div>

      {/* System Prompt */}
      <div className="cover-art-setting-row column">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label>System Prompt <span className="cover-art-hint-inline">(Qwen creative direction)</span></label>
          {coverArt.systemPrompt !== coverArt.defaultSystemPrompt && (
            <button
              className="cover-art-btn-small"
              onClick={() => setCoverArt({ systemPrompt: coverArt.defaultSystemPrompt })}
              title="Reset to default prompt"
              style={{ fontSize: '10px', width: 'auto', padding: '2px 8px', gap: '4px', display: 'flex', alignItems: 'center' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
              </svg>
              Default
            </button>
          )}
        </div>
        <textarea
          className="cover-art-textarea system-prompt"
          value={coverArt.systemPrompt}
          onChange={(e) => setCoverArt({ systemPrompt: e.target.value })}
          placeholder="Loading default prompt..."
          rows={4}
        />
      </div>

      {/* Reset All Settings */}
      <button
        className="cover-art-btn secondary cover-art-reset-all"
        onClick={handleResetAll}
        title="Reset all settings and system prompt to defaults"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
        </svg>
        Reset All Settings
      </button>
    </div>
  );
}

export default CoverArtSettings;
