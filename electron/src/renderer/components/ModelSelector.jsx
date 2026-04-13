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
    { value: 'small', label: 'Small (244M)', description: 'Balanced speed/accuracy' },
    { value: 'tiny', label: 'Tiny (39M)', description: 'Fastest, low accuracy' },
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

// Scenario-based Whisper presets — each sets optimal params behind the scenes
const WHISPER_PRESETS = {
  auto: {
    label: '⚡ Auto',
    description: 'Default — backend picks optimal settings',
    icon: '⚡',
    params: {},  // all null → backend defaults
  },
  music_vocal: {
    label: '🎤 Music (Vocal)',
    description: 'Vocal songs — aggressive detection, catch all lyrics',
    icon: '🎤',
    params: {
      beam_size: 10, no_speech_threshold: 0.8, temperature: 0.0,
      best_of: 5, patience: 2.0,
      condition_on_previous_text: false, suppress_blank: false,
    },
  },
  music_long: {
    label: '🎶 Long Track',
    description: 'Tracks >5 min — maximum patience, wider search',
    icon: '🎶',
    params: {
      beam_size: 12, no_speech_threshold: 0.9, temperature: 0.0,
      best_of: 7, patience: 3.0,
      condition_on_previous_text: false, suppress_blank: false,
    },
  },
  music_quiet: {
    label: '🎧 Quiet Vocals',
    description: 'Soft/whispered singing — lowest thresholds',
    icon: '🎧',
    params: {
      beam_size: 12, no_speech_threshold: 0.95, temperature: 0.0,
      best_of: 8, patience: 2.5,
      condition_on_previous_text: false, suppress_blank: false,
    },
  },
  music_fast: {
    label: '🔥 Fast Rap/Flow',
    description: 'Rap, fast lyrics — high precision, smaller beam',
    icon: '🔥',
    params: {
      beam_size: 8, no_speech_threshold: 0.7, temperature: 0.0,
      best_of: 5, patience: 1.5,
      condition_on_previous_text: true, suppress_blank: false,
    },
  },
  speech: {
    label: '🗣️ Speech',
    description: 'Clear speech — balanced accuracy and speed',
    icon: '🗣️',
    params: {
      beam_size: 5, no_speech_threshold: 0.6, temperature: 0.0,
      best_of: 3, patience: 1.0,
      condition_on_previous_text: false, suppress_blank: true,
    },
  },
  podcast: {
    label: '🎙️ Podcast',
    description: 'Long dialogue — good noise handling',
    icon: '🎙️',
    params: {
      beam_size: 8, no_speech_threshold: 0.6, temperature: 0.0,
      best_of: 4, patience: 1.5,
      condition_on_previous_text: true, suppress_blank: true,
    },
  },
  noisy: {
    label: '📢 Noisy Audio',
    description: 'Low quality / background noise — max tolerance',
    icon: '📢',
    params: {
      beam_size: 12, no_speech_threshold: 0.9, temperature: 0.2,
      best_of: 6, patience: 2.0,
      condition_on_previous_text: false, suppress_blank: false,
    },
  },
};

// All param keys that presets can set
const ALL_PRESET_KEYS = ['beam_size', 'no_speech_threshold', 'temperature', 'best_of', 'patience', 'condition_on_previous_text', 'suppress_blank'];

function WhisperPresetSelector({ whisperParams, setWhisperParam }) {
  // Detect which preset matches current params
  const detectPreset = () => {
    const hasAny = ALL_PRESET_KEYS.some(k => whisperParams[k] != null);
    if (!hasAny) return 'auto';
    for (const [key, preset] of Object.entries(WHISPER_PRESETS)) {
      if (key === 'auto') continue;
      const allMatch = Object.entries(preset.params).every(([pk, pv]) => whisperParams[pk] === pv);
      if (allMatch) return key;
    }
    return null; // custom / unknown
  };
  const currentPreset = detectPreset();

  const applyPreset = (presetKey) => {
    const preset = WHISPER_PRESETS[presetKey];
    if (!preset) return;
    if (presetKey === 'auto') {
      // Clear all overrides
      ALL_PRESET_KEYS.forEach(k => setWhisperParam(k, null));
    } else {
      ALL_PRESET_KEYS.forEach(k => {
        setWhisperParam(k, preset.params[k] ?? null);
      });
    }
  };

  return (
    <div style={{
      marginTop: 12,
      border: '1px solid var(--border-color)',
      borderRadius: 6,
      padding: 10,
      background: 'rgba(139, 92, 246, 0.03)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <FiSliders size={13} style={{ color: 'rgb(139, 92, 246)' }} />
        <span style={{ fontWeight: 600, fontSize: 12 }}>Transcription Preset</span>
        {currentPreset && WHISPER_PRESETS[currentPreset] && (
          <span style={{
            marginLeft: 'auto', fontSize: 9, padding: '1px 8px',
            borderRadius: 10, fontWeight: 600,
            background: currentPreset === 'auto' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(251, 191, 36, 0.2)',
            color: currentPreset === 'auto' ? 'rgb(139, 92, 246)' : 'rgb(251, 191, 36)',
          }}>{WHISPER_PRESETS[currentPreset].label}</span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {Object.entries(WHISPER_PRESETS).map(([key, preset]) => {
          const isActive = currentPreset === key;
          return (
            <button
              key={key}
              className="btn btn-ghost"
              onClick={() => applyPreset(key)}
              title={preset.description}
              style={{
                fontSize: 10, padding: '6px 6px',
                textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 4,
                background: isActive ? 'rgba(139, 92, 246, 0.12)' : undefined,
                border: isActive ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid var(--border-color)',
                color: isActive ? 'rgb(167, 139, 250)' : undefined,
                fontWeight: isActive ? 700 : 400,
                borderRadius: 5,
              }}
            >
              <span style={{ fontSize: 13 }}>{preset.icon}</span>
              <span>{preset.label.replace(/^[^\s]+\s/, '')}</span>
            </button>
          );
        })}
      </div>

      {/* Description of active preset */}
      {currentPreset && WHISPER_PRESETS[currentPreset] && (
        <p style={{
          fontSize: 9, color: 'var(--text-muted)', margin: '6px 0 0',
          fontStyle: 'italic', lineHeight: 1.5,
        }}>
          {WHISPER_PRESETS[currentPreset].description}
        </p>
      )}
    </div>
  );
}

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

  // Language-specific beam_size defaults (must match backend config.py LANGUAGE_PARAMS)
  const BEAM_SIZE_DEFAULTS = { tr: 8, ar: 10, en: 5 };
  const langDefault = BEAM_SIZE_DEFAULTS[sourceLanguage] ?? 5;
  const isBeamAuto = whisperParams.beam_size === null || whisperParams.beam_size === undefined;
  const currentBeamSize = isBeamAuto ? langDefault : whisperParams.beam_size;

  const availableModels = getAvailableModels();
  const currentModel = getModelForLanguage(selectedLanguage);
  const modelInfo = availableModels.find(m => m.value === currentModel) || availableModels[0];

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
              }}>{currentBeamSize}{isBeamAuto ? ' (auto)' : ''}</span>
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
              <span>{langDefault} (default)</span>
              <span>20 (max accuracy)</span>
            </div>
          </div>

          {/* ========== Transcription Preset ========== */}
          <WhisperPresetSelector whisperParams={whisperParams} setWhisperParam={setWhisperParam} />

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
