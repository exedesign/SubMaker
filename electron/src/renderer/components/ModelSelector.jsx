/**
 * ModelSelector Component
 * Subtitle model selection, Beam Size setting, Vocal Isolation model selection and separation preview
 */
import React from 'react';
import { useAppStore } from '../stores/appStore';
import {
  FiSliders,
  FiVolume2, FiMusic,
} from 'react-icons/fi';

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

// Faster-Whisper model list
const WHISPER_MODELS = {
  default: [
    { value: 'turbo', label: 'Turbo (809M)', description: 'Fast, high accuracy (recommended)' },
    { value: 'large-v3', label: 'Large V3 (1550M)', description: 'Highest accuracy, slow' },
    { value: 'large-v3-turbo', label: 'Large V3 Turbo (809M)', description: 'Large-v3 quality, turbo speed' },
    { value: 'large-v2', label: 'Large V2 (1550M)', description: 'Very high accuracy, slow' },
    { value: 'distil-large-v3', label: 'Distil Large V3 (756M)', description: 'Large-v3 distil — fast, high accuracy' },
    { value: 'medium', label: 'Medium (769M)', description: 'Slow, high accuracy' },
    { value: 'small', label: 'Small (244M)', description: 'Balanced speed/accuracy' },
    { value: 'base', label: 'Base (74M)', description: 'Fast, medium accuracy' },
    { value: 'tiny', label: 'Tiny (39M)', description: 'Fastest, low accuracy' },
  ],
  tr: [
    { value: 'turbo', label: 'Turbo (809M)', description: 'Fast, high accuracy (recommended)' },
    { value: 'large-v3', label: 'Large V3 (1550M)', description: 'Highest accuracy, slow' },
    { value: 'large-v3-turbo', label: 'Large V3 Turbo (809M)', description: 'Large-v3 quality, turbo speed' },
    { value: 'large-v2', label: 'Large V2 (1550M)', description: 'Very high accuracy, slow' },
    { value: 'distil-large-v3', label: 'Distil Large V3 (756M)', description: 'Large-v3 distil — fast, high accuracy' },
    { value: 'medium', label: 'Medium (769M)', description: 'Slow, high accuracy' },
    { value: 'small', label: 'Small (244M)', description: 'Balanced speed/accuracy' },
    { value: 'base', label: 'Base (74M)', description: 'Fast, medium accuracy' },
    { value: 'tiny', label: 'Tiny (39M)', description: 'Fastest, low accuracy' },
    { value: 'selimc/whisper-large-v3-turbo-turkish', label: 'Turkish Fine-tuned (Turbo)', description: 'Common Voice 17.0 Turkish fine-tune, best Turkish accuracy', recommended: true },
  ],
};

import { LANGUAGES } from './LanguageSelector';

// Stem display labels
const STEM_LABELS = {
  vocals: { label: 'Vocals', icon: '🎤', color: 'rgba(168, 85, 247, 0.8)' },
  instrumental: { label: 'Instrumental', icon: '🎵', color: 'rgba(59, 130, 246, 0.8)' },
  drums: { label: 'Drums', icon: '🥁', color: 'rgba(239, 68, 68, 0.8)' },
  bass: { label: 'Bass', icon: '🎸', color: 'rgba(34, 197, 94, 0.8)' },
  other: { label: 'Other', icon: '🎹', color: 'rgba(251, 191, 36, 0.8)' },
};

function ModelSelector() {
  const {
    modelSettings,
    setModelForLanguage,
    getModelForLanguage,
    resetModelSettings,
    whisperParams,
    setWhisperParam,
    resetWhisperParams,
    vocalIsolation,
    setVocalIsolation,
    vocalSelectedStems,
    toggleVocalStem,
    vocalSeparation,
    vocalSeparating,
    vocalSeparationProgress,
    vocalSeparationMessage,
    separateVocals,
    mediaFile,
    sourceLanguage,
    setSourceLanguage,
  } = useAppStore();

  // Derive selectedLanguage from store's sourceLanguage (null = 'auto')
  const selectedLanguage = sourceLanguage || 'auto';
  const selectedLanguageName = LANGUAGES.find(l => l.code === sourceLanguage)?.name || 'Auto Detect';

  const handleModelChange = (language, modelSize) => {
    setModelForLanguage(language, modelSize);
  };

  const getAvailableModels = () => {
    const langKey = selectedLanguage !== 'auto' && WHISPER_MODELS[selectedLanguage]
      ? selectedLanguage
      : 'default';
    return WHISPER_MODELS[langKey] || WHISPER_MODELS.default;
  };

  const availableModels = getAvailableModels();
  const currentModel = getModelForLanguage(selectedLanguage);
  const modelInfo = availableModels.find(m => m.value === currentModel) || availableModels[0];
  const currentBeamSize = whisperParams.beam_size ?? 5;

  return (
    <div>
      {/* Model Selection */}
      <div className="form-group">
        <label className="label">
          Model - {selectedLanguageName}
        </label>
        <select
          className="select"
          value={currentModel}
          onChange={(e) => handleModelChange(selectedLanguage, e.target.value)}
        >
          {availableModels.map((model) => (
            <option key={model.value} value={model.value}>
              {model.recommended ? '⭐ ' : ''}{model.label}
            </option>
          ))}
        </select>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          {modelInfo.description}
        </p>
      </div>

      {/* Beam Size */}
      <div style={{
        marginTop: 12,
        border: '1px solid var(--border-color)',
        borderRadius: 6,
        padding: 12,
        background: 'rgba(139, 92, 246, 0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <FiSliders size={13} style={{ color: 'rgb(139, 92, 246)' }} />
          <span style={{ fontWeight: 600, fontSize: 12 }}>Beam Size</span>
              <span style={{
                marginLeft: 'auto',
                background: 'rgba(139, 92, 246, 0.2)',
                padding: '2px 10px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                color: 'rgb(139, 92, 246)',
              }}>{currentBeamSize}</span>
            </div>

            <input
              type="range"
              min="1" max="20" step="1"
              value={currentBeamSize}
              onChange={(e) => setWhisperParam('beam_size', parseInt(e.target.value))}
              style={{ width: '100%', height: 6 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
              <span>1 (fast)</span>
              <span>5 (default)</span>
              <span>20 (max accuracy)</span>
            </div>
          </div>

          {/* ========== Vocal Isolation Section ========== */}
          <div style={{
            marginTop: 12,
            border: '1px solid rgba(168, 85, 247, 0.3)',
            borderRadius: 6,
            padding: 12,
          }}>
            {/* Enable/Disable Toggle */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 13,
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FiVolume2 size={14} style={{ color: 'rgb(168, 85, 247)' }} />
                <span style={{ fontWeight: 600 }}>Vocal Isolation</span>
              </label>
              <Toggle enabled={vocalIsolation} onClick={() => setVocalIsolation(!vocalIsolation)} />
            </div>

            {/* Auto model routing — no manual model selection needed */}
            {vocalIsolation && (
              <div style={{ marginTop: 10 }}>
                {/* Info badge */}
                <div style={{
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  marginBottom: 8,
                  padding: '6px 8px',
                  background: 'rgba(168, 85, 247, 0.06)',
                  borderRadius: 4,
                  border: '1px solid rgba(168, 85, 247, 0.18)',
                  lineHeight: 1.6,
                }}>
                  <strong style={{ color: 'var(--text-secondary)' }}>Auto model routing:</strong><br />
                  🎤 <strong>Vocals</strong> → BS-Roformer EP317&nbsp;&nbsp;·&nbsp;&nbsp;
                  🎵 <strong>Instrumental</strong> → Resurrection UNWA
                </div>

                {/* Stem Selection Checkboxes */}
                <div style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  background: 'var(--bg-primary)',
                  borderRadius: 6,
                  border: '1px solid var(--border-color)',
                }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                    Stems to Extract
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {['vocals', 'instrumental'].map((stemId) => {
                      const stemInfo = STEM_LABELS[stemId];
                      if (!stemInfo) return null;
                      const checked = vocalSelectedStems.includes(stemId);
                      return (
                        <label key={stemId} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          cursor: 'pointer',
                          fontSize: 10,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: checked ? `${stemInfo.color}15` : 'transparent',
                          border: `1px solid ${checked ? stemInfo.color : 'var(--border-color)'}`,
                          transition: 'all 0.15s',
                        }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleVocalStem(stemId)}
                            style={{ width: 12, height: 12, margin: 0 }}
                          />
                          <span>{stemInfo.icon}</span>
                          <span style={{ fontWeight: checked ? 600 : 400 }}>{stemInfo.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Separate Button */}
                {mediaFile && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      className="btn btn-primary"
                      onClick={separateVocals}
                      disabled={vocalSeparating}
                      style={{
                        width: '100%',
                        fontSize: 11,
                        padding: '6px 12px',
                        background: 'rgba(168, 85, 247, 0.9)',
                      }}
                    >
                      <FiMusic size={12} />
                      {vocalSeparating ? 'Separating...' : 'Separate'}
                    </button>

                    {/* Separation error message (non-separating) */}
                    {!vocalSeparating && vocalSeparationMessage && !vocalSeparation && (
                      <p style={{ fontSize: 10, color: 'var(--accent-error)', marginTop: 4 }}>
                        {vocalSeparationMessage}
                      </p>
                    )}
                  </div>
                )}

                {/* Stem separation result — mixer indicator */}
                {vocalSeparation && vocalSeparation.stems && (
                  <div style={{
                    marginTop: 8,
                    padding: '8px 10px',
                    background: 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-success)' }}>
                        {Object.keys(vocalSeparation.stems).length} stems separated
                      </span>
                      <p style={{ fontSize: 9, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                        Audio layers shown on timeline
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {vocalSeparation.cached && (
                        <span style={{
                          fontSize: 9,
                          padding: '1px 6px',
                          borderRadius: 6,
                          background: 'rgba(34, 197, 94, 0.2)',
                          color: 'var(--accent-success)',
                        }}>
                          Cached
                        </span>
                      )}
                      {vocalSeparation.duration > 0 && (
                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                          {vocalSeparation.duration.toFixed(1)}s
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!vocalIsolation && (
              <p style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                marginTop: 6,
                marginLeft: 32,
              }}>
                Removes background music. Improves transcription quality.
              </p>
            )}
          </div>

      {/* Reset */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
        <button
          className="btn btn-ghost"
          onClick={() => {
            resetModelSettings();
            resetWhisperParams();
            setSourceLanguage(null);
          }}
          style={{ width: '100%', fontSize: 11, padding: '6px 12px' }}
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}

export default ModelSelector;
