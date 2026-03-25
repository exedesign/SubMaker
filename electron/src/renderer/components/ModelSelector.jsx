/**
 * ModelSelector Component
 * Whisper model seçimi, Beam Size ayarı, Vokal İzolasyonu model seçimi ve ayrım önizleme
 */
import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import {
  FiCpu, FiChevronDown, FiChevronUp, FiSliders, FiSave, FiTrash2,
  FiVolume2, FiMusic, FiZap, FiAward,
} from 'react-icons/fi';

// Faster-Whisper model listeleri
const WHISPER_MODELS = {
  default: [
    { value: 'turbo', label: 'Turbo (809M)', description: 'Hızlı, yüksek doğruluk (tavsiye)' },
    { value: 'large-v3', label: 'Large V3 (1550M)', description: 'En yüksek doğruluk, yavaş' },
    { value: 'large-v3-turbo', label: 'Large V3 Turbo (809M)', description: 'Large-v3 kalitesi, turbo hızı' },
    { value: 'large-v2', label: 'Large V2 (1550M)', description: 'Çok yüksek doğruluk, yavaş' },
    { value: 'distil-large-v3', label: 'Distil Large V3 (756M)', description: 'Large-v3 distil — hızlı, yüksek doğruluk' },
    { value: 'medium', label: 'Medium (769M)', description: 'Yavaş, yüksek doğruluk' },
    { value: 'small', label: 'Small (244M)', description: 'Dengeli hız/doğruluk' },
    { value: 'base', label: 'Base (74M)', description: 'Hızlı, orta doğruluk' },
    { value: 'tiny', label: 'Tiny (39M)', description: 'En hızlı, düşük doğruluk' },
  ],
  tr: [
    { value: 'turbo', label: 'Turbo (809M)', description: 'Hızlı, yüksek doğruluk (tavsiye)' },
    { value: 'large-v3', label: 'Large V3 (1550M)', description: 'En yüksek doğruluk, yavaş' },
    { value: 'large-v3-turbo', label: 'Large V3 Turbo (809M)', description: 'Large-v3 kalitesi, turbo hızı' },
    { value: 'large-v2', label: 'Large V2 (1550M)', description: 'Çok yüksek doğruluk, yavaş' },
    { value: 'distil-large-v3', label: 'Distil Large V3 (756M)', description: 'Large-v3 distil — hızlı, yüksek doğruluk' },
    { value: 'medium', label: 'Medium (769M)', description: 'Yavaş, yüksek doğruluk' },
    { value: 'small', label: 'Small (244M)', description: 'Dengeli hız/doğruluk' },
    { value: 'base', label: 'Base (74M)', description: 'Hızlı, orta doğruluk' },
    { value: 'tiny', label: 'Tiny (39M)', description: 'En hızlı, düşük doğruluk' },
    { value: 'selimc/whisper-large-v3-turbo-turkish', label: 'Turkish Fine-tuned (Turbo)', description: 'Common Voice 17.0 Türkçe fine-tune, en iyi Türkçe doğruluk', recommended: true },
  ],
};

// Desteklenen diller
const SUPPORTED_LANGUAGES = [
  { code: 'auto', name: 'Otomatik Algılama', description: 'Tüm diller için varsayılan (turbo)' },
  { code: 'ar', name: 'Arapça', description: 'RTL dil, medium önerilir' },
  { code: 'tr', name: 'Türkçe', description: 'Turbo model önerilir' },
  { code: 'en', name: 'İngilizce', description: 'Turbo model önerilir' },
  { code: 'es', name: 'İspanyolca', description: 'Turbo model önerilir' },
  { code: 'fr', name: 'Fransızca', description: 'Turbo model önerilir' },
  { code: 'de', name: 'Almanca', description: 'Turbo model önerilir' },
  { code: 'it', name: 'İtalyanca', description: 'Turbo model önerilir' },
  { code: 'pt', name: 'Portekizce', description: 'Turbo model önerilir' },
  { code: 'ru', name: 'Rusça', description: 'Turbo model önerilir' },
  { code: 'zh', name: 'Çince', description: 'Medium önerilir' },
  { code: 'ja', name: 'Japonca', description: 'Medium önerilir' },
  { code: 'ko', name: 'Korece', description: 'Medium önerilir' }
];

// Vocal isolation models
const VOCAL_MODELS = [
  {
    id: 'mdx23c',
    label: 'MDX23C (Hızlı)',
    description: 'Gelişmiş MDX mimarisi, 2 stem (vokal + enstrümantal). ~120MB model.',
    icon: FiZap,
    stems: ['vocals', 'instrumental'],
    badge: 'Hızlı',
    badgeColor: 'rgba(59, 130, 246, 0.8)',
  },
  {
    id: 'bs_roformer',
    label: 'BS-Roformer (En İyi Vokal)',
    description: 'SDR 12.97 — en yüksek vokal kalitesi, minimal sızıntı. ~500MB model.',
    icon: FiAward,
    stems: ['vocals', 'instrumental'],
    badge: 'Kalite',
    badgeColor: 'rgba(168, 85, 247, 0.8)',
  },
  {
    id: 'demucs_ft',
    label: 'Demucs FT (4 Stem)',
    description: '4 stem ayrımı (vokal, davul, bas, diğer). GPU önerilir.',
    icon: FiMusic,
    stems: ['vocals', 'drums', 'bass', 'other', 'instrumental'],
    badge: '4 Stem',
    badgeColor: 'rgba(34, 197, 94, 0.8)',
  },
];

// Stem display labels
const STEM_LABELS = {
  vocals: { label: 'Vokal', icon: '🎤', color: 'rgba(168, 85, 247, 0.8)' },
  instrumental: { label: 'Enstrümantal', icon: '🎵', color: 'rgba(59, 130, 246, 0.8)' },
  drums: { label: 'Davul', icon: '🥁', color: 'rgba(239, 68, 68, 0.8)' },
  bass: { label: 'Bas', icon: '🎸', color: 'rgba(34, 197, 94, 0.8)' },
  other: { label: 'Diğer', icon: '🎹', color: 'rgba(251, 191, 36, 0.8)' },
};

// LocalStorage key for user presets
const PRESETS_STORAGE_KEY = 'submaker_beam_presets';

function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePresetsToStorage(presets) {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
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
    vocalModelId,
    setVocalModelId,
    vocalSelectedStems,
    toggleVocalStem,
    vocalSeparation,
    vocalSeparating,
    vocalSeparationProgress,
    vocalSeparationMessage,
    separateVocals,
    mediaFile,
  } = useAppStore();

  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('auto');
  const [presets, setPresets] = useState(loadPresets);
  const [newPresetName, setNewPresetName] = useState('');
  const [showPresetSave, setShowPresetSave] = useState(false);

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
  const selectedVocalModel = VOCAL_MODELS.find(m => m.id === vocalModelId) || VOCAL_MODELS[0];

  // Preset management
  const handleSavePreset = () => {
    const name = newPresetName.trim();
    if (!name) return;
    const updated = [...presets.filter(p => p.name !== name), { name, beam_size: currentBeamSize }];
    setPresets(updated);
    savePresetsToStorage(updated);
    setNewPresetName('');
    setShowPresetSave(false);
  };

  const handleDeletePreset = (name) => {
    const updated = presets.filter(p => p.name !== name);
    setPresets(updated);
    savePresetsToStorage(updated);
  };

  const handleApplyPreset = (preset) => {
    setWhisperParam('beam_size', preset.beam_size);
  };

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: 8,
      marginBottom: 12,
      overflow: 'hidden',
      border: '1px solid rgba(99, 102, 241, 0.3)',
    }}>
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          background: 'rgba(99, 102, 241, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiCpu size={16} style={{ color: 'var(--primary-color)' }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Whisper</span>
          <span style={{
            background: 'rgba(99, 102, 241, 0.2)',
            padding: '2px 8px',
            borderRadius: 12,
            fontSize: 10,
          }}>
            Beam: {currentBeamSize}
          </span>
        </div>
        {isExpanded ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
      </div>

      {isExpanded && (
        <div style={{ padding: 16 }}>
          {/* Language Selection */}
          <div className="form-group">
            <label className="label">Dil Seçin</label>
            <select
              className="select"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
              {SUPPORTED_LANGUAGES.find(l => l.code === selectedLanguage)?.description}
            </p>
          </div>

          {/* Model Selection */}
          <div className="form-group">
            <label className="label">
              Whisper Model - {SUPPORTED_LANGUAGES.find(l => l.code === selectedLanguage)?.name}
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
              <span>1 (hızlı)</span>
              <span>5 (varsayılan)</span>
              <span>20 (maksimum doğruluk)</span>
            </div>

            {/* User Presets */}
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Kayıtlı Preset'ler</span>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 10, padding: '2px 8px' }}
                  onClick={() => setShowPresetSave(!showPresetSave)}
                >
                  <FiSave size={10} /> Kaydet
                </button>
              </div>

              {/* Save new preset form */}
              {showPresetSave && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                  <input
                    type="text"
                    placeholder="Preset adı (ör: Müzik, Podcast)"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      fontSize: 11,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 4,
                      color: 'var(--text-primary)',
                    }}
                    autoFocus
                  />
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 10, padding: '4px 10px' }}
                    onClick={handleSavePreset}
                    disabled={!newPresetName.trim()}
                  >
                    Beam: {currentBeamSize}
                  </button>
                </div>
              )}

              {/* Preset buttons */}
              {presets.length > 0 ? (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {presets.map((preset) => (
                    <div key={preset.name} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                      <button
                        className={`btn ${currentBeamSize === preset.beam_size ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ fontSize: 10, padding: '3px 8px', borderRadius: '4px 0 0 4px' }}
                        onClick={() => handleApplyPreset(preset)}
                        title={`Beam Size: ${preset.beam_size}`}
                      >
                        {preset.name} ({preset.beam_size})
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{
                          fontSize: 9, padding: '3px 4px', borderRadius: '0 4px 4px 0',
                          color: 'var(--accent-danger)', opacity: 0.6,
                          borderLeft: '1px solid var(--border-color)',
                        }}
                        onClick={() => handleDeletePreset(preset.name)}
                        title="Preset'i sil"
                      >
                        <FiTrash2 size={9} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Henüz preset yok. Beam size'ı ayarlayıp "Kaydet" ile preset oluşturun.
                </p>
              )}
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
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              fontSize: 13,
            }}>
              <input
                type="checkbox"
                checked={vocalIsolation}
                onChange={(e) => setVocalIsolation(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <FiVolume2 size={14} style={{ color: 'rgb(168, 85, 247)' }} />
              <span style={{ fontWeight: 600 }}>Vokal İzolasyonu</span>
            </label>

            {/* Model Selection — always visible when enabled */}
            {vocalIsolation && (
              <div style={{ marginTop: 10 }}>
                <label className="label" style={{ fontSize: 11, marginBottom: 6 }}>Ayrıştırma Modeli</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {VOCAL_MODELS.map((model) => {
                    const isSelected = vocalModelId === model.id;
                    const Icon = model.icon;
                    return (
                      <button
                        key={model.id}
                        className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setVocalModelId(model.id)}
                        style={{
                          flex: 1,
                          flexDirection: 'column',
                          padding: '8px 6px',
                          position: 'relative',
                          gap: 4,
                        }}
                      >
                        <span style={{
                          position: 'absolute',
                          top: 3,
                          right: 4,
                          fontSize: 8,
                          padding: '1px 5px',
                          borderRadius: 6,
                          background: model.badgeColor,
                          color: '#fff',
                          fontWeight: 600,
                        }}>
                          {model.badge}
                        </span>
                        <Icon size={16} />
                        <span style={{ fontSize: 10, fontWeight: 600 }}>{model.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  {selectedVocalModel.description}
                </p>

                {/* Stem Selection Checkboxes */}
                <div style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  background: 'var(--bg-primary)',
                  borderRadius: 6,
                  border: '1px solid var(--border-color)',
                }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                    Çıkarılacak Stem'ler
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selectedVocalModel.stems.map((stemId) => {
                      const stemInfo = STEM_LABELS[stemId];
                      if (!stemInfo) return null;
                      const checked = (vocalSelectedStems[vocalModelId] || []).includes(stemId);
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
                            onChange={() => toggleVocalStem(vocalModelId, stemId)}
                            style={{ width: 12, height: 12, margin: 0 }}
                          />
                          <span>{stemInfo.icon}</span>
                          <span style={{ fontWeight: checked ? 600 : 400 }}>{stemInfo.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Separate Button + Progress */}
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
                      {vocalSeparating ? 'Ayrıştırılıyor...' : 'Ayrıştır ve Dinle'}
                    </button>

                    {/* Progress bar */}
                    {vocalSeparating && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{
                          height: 3,
                          background: 'var(--bg-tertiary)',
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${vocalSeparationProgress}%`,
                            background: 'rgb(168, 85, 247)',
                            borderRadius: 2,
                            transition: 'width 0.3s ease',
                          }} />
                        </div>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          {vocalSeparationMessage} ({vocalSeparationProgress}%)
                        </p>
                      </div>
                    )}

                    {/* Separation Message (non-separating) */}
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
                        {Object.keys(vocalSeparation.stems).length} stem ayrıştırıldı
                      </span>
                      <p style={{ fontSize: 9, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                        Ses katmanları zaman çizelgesinde görüntüleniyor
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
                          Önbellek
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
                Arka plan müziğini temizler. Müzik transkripsiyon kalitesini artırır.
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
                setSelectedLanguage('auto');
              }}
              style={{ width: '100%', fontSize: 11, padding: '6px 12px' }}
            >
              Varsayılan Ayarlara Dön
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ModelSelector;
