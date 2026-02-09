/**
 * ModelSelector Component
 * İçerik türü ve dil bazında Whisper model boyutu seçimi
 */
import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiSettings, FiChevronDown, FiChevronUp, FiCpu, FiMusic, FiMic, FiHeadphones } from 'react-icons/fi';

// İçerik türleri
const CONTENT_TYPES = [
  { 
    value: 'speech', 
    label: 'Konuşma', 
    icon: FiMic,
    description: 'Normal konuşma, röportaj, sunum',
    recommendedModel: 'small'
  },
  { 
    value: 'music', 
    label: 'Müzik/Lirik', 
    icon: FiMusic,
    description: 'Şarkı sözleri, müzik videoları',
    recommendedModel: 'large-v3'
  },
  { 
    value: 'podcast', 
    label: 'Podcast/Ses Kitabı', 
    icon: FiHeadphones,
    description: 'Uzun ses kayıtları, anlatım',
    recommendedModel: 'medium'
  }
];

// Müzik türleri
const MUSIC_GENRES = [
  { value: null, label: 'Genel (Otomatik)' },
  { value: 'pop', label: 'Pop' },
  { value: 'rock', label: 'Rock' },
  { value: 'classical', label: 'Klasik' },
  { value: 'rap', label: 'Rap/Hip-Hop' },
  { value: 'jazz', label: 'Jazz' }
];

// Mevcut Whisper model boyutları
const MODEL_SIZES = [
  { value: 'tiny', label: 'Tiny (39M)', description: 'En hızlı, düşük doğruluk' },
  { value: 'base', label: 'Base (74M)', description: 'Hızlı, orta doğruluk' },
  { value: 'small', label: 'Small (244M)', description: 'Dengeli hız/doğruluk' },
  { value: 'medium', label: 'Medium (769M)', description: 'Yavaş, yüksek doğruluk' },
  { value: 'large-v3', label: 'Large-v3 (1550M)', description: 'En yavaş, en yüksek doğruluk' }
];

// Desteklenen diller ve açıklamaları
const SUPPORTED_LANGUAGES = [
  { code: 'auto', name: 'Otomatik Algılama', description: 'Tüm diller için varsayılan' },
  { code: 'ar', name: 'Arapça', description: 'RTL dil, medium önerilir' },
  { code: 'tr', name: 'Türkçe', description: 'Small model yeterli' },
  { code: 'en', name: 'İngilizce', description: 'Base model optimize' },
  { code: 'es', name: 'İspanyolca', description: 'Small model yeterli' },
  { code: 'fr', name: 'Fransızca', description: 'Small model yeterli' },
  { code: 'de', name: 'Almanca', description: 'Small model yeterli' },
  { code: 'it', name: 'İtalyanca', description: 'Small model yeterli' },
  { code: 'pt', name: 'Portekizce', description: 'Small model yeterli' },
  { code: 'ru', name: 'Rusça', description: 'Small model yeterli' },
  { code: 'zh', name: 'Çince', description: 'Medium önerilir' },
  { code: 'ja', name: 'Japonca', description: 'Medium önerilir' },
  { code: 'ko', name: 'Korece', description: 'Medium önerilir' }
];

function ModelSelector() {
  const { 
    modelSettings, 
    contentType, 
    contentGenre,
    setModelForLanguage, 
    getModelForLanguage, 
    resetModelSettings,
    setContentType,
    setContentGenre,
    getRecommendedModel
  } = useAppStore();
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('auto');

  const handleModelChange = (language, modelSize) => {
    setModelForLanguage(language, modelSize);
  };

  const handleContentTypeChange = (type) => {
    setContentType(type);
    // Auto-suggest recommended model for content type
    const recommendedModel = getRecommendedModel(type, selectedLanguage);
    setModelForLanguage(selectedLanguage, recommendedModel);
  };

  const getModelInfo = (modelSize) => {
    return MODEL_SIZES.find(m => m.value === modelSize) || MODEL_SIZES[2]; // default to small
  };

  const currentModel = getModelForLanguage(selectedLanguage);
  const modelInfo = getModelInfo(currentModel);
  const selectedContentType = CONTENT_TYPES.find(ct => ct.value === contentType);

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
          <span style={{ fontWeight: 600, fontSize: 13 }}>Model ve İçerik Ayarları</span>
          {selectedContentType && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 4,
              background: 'rgba(99, 102, 241, 0.2)',
              padding: '2px 8px',
              borderRadius: 12,
              fontSize: 11
            }}>
              <selectedContentType.icon size={12} />
              {selectedContentType.label}
            </div>
          )}
        </div>
        {isExpanded ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
      </div>

      {/* Content */}
      {isExpanded && (
        <div style={{ padding: 16 }}>
          {/* Content Type Selection */}
          <div className="form-group">
            <label className="label">İçerik Türü</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {CONTENT_TYPES.map((type) => {
                const IconComponent = type.icon;
                return (
                  <button
                    key={type.value}
                    className={`btn ${contentType === type.value ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ 
                      padding: '8px 12px',
                      fontSize: 11,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      height: 'auto'
                    }}
                    onClick={() => handleContentTypeChange(type.value)}
                  >
                    <IconComponent size={16} />
                    <span style={{ fontWeight: 600 }}>{type.label}</span>
                  </button>
                );
              })}
            </div>
            <p style={{ 
              fontSize: 11, 
              color: 'var(--text-muted)', 
              marginTop: 6,
              fontStyle: 'italic' 
            }}>
              {selectedContentType?.description} • Önerilen: {selectedContentType?.recommendedModel}
            </p>
          </div>

          {/* Music Genre Selection (only for music content) */}
          {contentType === 'music' && (
            <div className="form-group">
              <label className="label">Müzik Türü (İsteğe Bağlı)</label>
              <select
                className="select"
                value={contentGenre || ''}
                onChange={(e) => setContentGenre(e.target.value || null)}
              >
                {MUSIC_GENRES.map((genre) => (
                  <option key={genre.value || 'auto'} value={genre.value || ''}>
                    {genre.label}
                  </option>
                ))}
              </select>
              <p style={{ 
                fontSize: 11, 
                color: 'var(--text-muted)', 
                marginTop: 4 
              }}>
                Müzik türü seçimi lirik tespiti kalitesini artırabilir
              </p>
            </div>
          )}

          {/* Language Selection */}
          <div className="form-group">
            <label className="label">Dil Seçin</label>
            <select
              className="select"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
            <p style={{ 
              fontSize: 11, 
              color: 'var(--text-muted)', 
              marginTop: 4,
              fontStyle: 'italic' 
            }}>
              {SUPPORTED_LANGUAGES.find(l => l.code === selectedLanguage)?.description}
            </p>
          </div>

          {/* Model Selection */}
          <div className="form-group">
            <label className="label">
              Model Boyutu - {SUPPORTED_LANGUAGES.find(l => l.code === selectedLanguage)?.name}
            </label>
            <select
              className="select"
              value={currentModel}
              onChange={(e) => handleModelChange(selectedLanguage, e.target.value)}
            >
              {MODEL_SIZES.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
            <p style={{ 
              fontSize: 11, 
              color: 'var(--text-muted)', 
              marginTop: 4 
            }}>
              {modelInfo.description}
            </p>
          </div>

          {/* Current Model Info */}
          <div style={{
            background: 'var(--bg-primary)',
            borderRadius: 6,
            padding: 12,
            marginTop: 12,
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <FiSettings size={14} />
              <span style={{ fontWeight: 600, fontSize: 12 }}>Seçili Konfigürasyon</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              <div><strong>İçerik:</strong> {selectedContentType?.label}</div>
              {contentType === 'music' && contentGenre && (
                <div><strong>Müzik Türü:</strong> {MUSIC_GENRES.find(g => g.value === contentGenre)?.label}</div>
              )}
              <div><strong>Dil:</strong> {SUPPORTED_LANGUAGES.find(l => l.code === selectedLanguage)?.name}</div>
              <div><strong>Model:</strong> {modelInfo.label}</div>
              <div><strong>Açıklama:</strong> {modelInfo.description}</div>
            </div>
          </div>

          {/* Reset Button */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
            <button
              className="btn btn-ghost"
              onClick={() => {
                resetModelSettings();
                setContentType('speech');
                setContentGenre(null);
                setSelectedLanguage('auto');
              }}
              style={{ 
                width: '100%', 
                fontSize: 11,
                padding: '6px 12px'
              }}
            >
              <FiSettings size={12} />
              Varsayılan Ayarlara Dön
            </button>
          </div>

          {/* Performance Tips */}
          <div style={{ marginTop: 12, padding: 8, background: 'rgba(255, 193, 7, 0.1)', borderRadius: 4 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              <strong>💡 İpuçları:</strong><br />
              • <strong>Müzik:</strong> Large-v3 model lirik kalitesi için gerekli<br />
              • <strong>Konuşma:</strong> Small/base model genelde yeterli<br />
              • <strong>Podcast:</strong> Medium model uzun kayıtlar için ideal<br />
              • Büyük modeller daha doğru ama yavaştır
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ModelSelector;