/**
 * Secondary Subtitle Editor Component
 * Manages dual language subtitle settings and translations
 */
import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiGlobe, FiRefreshCw, FiChevronDown, FiChevronUp, FiType, FiLoader } from 'react-icons/fi';
import axios from 'axios';

const API_URL = window.API_URL || 'http://localhost:5000/api';

// Alignment options (same as primary - numpad style)
const ALIGNMENTS = [
  { value: 7, label: '↖' },
  { value: 8, label: '↑' },
  { value: 9, label: '↗' },
  { value: 4, label: '←' },
  { value: 5, label: '•' },
  { value: 6, label: '→' },
  { value: 1, label: '↙' },
  { value: 2, label: '↓' },
  { value: 3, label: '↘' },
];

// Common fonts
const FONTS = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Impact',
  'Comic Sans MS',
  'Courier New',
];

// Supported languages for translation
const LANGUAGES = {
  'en': 'English',
  'tr': 'Türkçe',
  'es': 'Español',
  'fr': 'Français',
  'de': 'Deutsch',
  'it': 'Italiano',
  'pt': 'Português',
  'ru': 'Русский',
  'ja': '日本語',
  'ko': '한국어',
  'zh': '中文',
  'ar': 'العربية',
  'hi': 'हिन्दी',
  'nl': 'Nederlands',
  'pl': 'Polski',
  'sv': 'Svenska',
};

function SecondarySubtitleEditor() {
  const {
    settings,
    secondarySubtitle,
    setSecondaryLanguage,
    setSecondaryStyle,
    translateToSecondary,
    subtitles,
  } = useAppStore();
  
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Don't render if dual subtitle is not enabled
  if (!settings.dualSubtitleEnabled) {
    return null;
  }
  
  const { style, targetLanguage, subtitles: translatedSubs, isTranslating } = secondarySubtitle;
  const hasTranslation = translatedSubs && translatedSubs.length > 0;
  
  const handleTranslate = async () => {
    if (subtitles.length === 0) {
      alert('Önce ana altyazıları oluşturun');
      return;
    }
    await translateToSecondary();
  };

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: 8,
      marginTop: 16,
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
          <FiGlobe size={16} style={{ color: 'var(--primary-color)' }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Çift Dilli Altyazı</span>
          {hasTranslation && (
            <span style={{ 
              fontSize: 11, 
              background: 'var(--primary-color)', 
              color: 'white',
              padding: '2px 6px',
              borderRadius: 4,
            }}>
              {translatedSubs.length} çeviri
            </span>
          )}
        </div>
        {isExpanded ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
      </div>
      
      {/* Content */}
      {isExpanded && (
        <div style={{ padding: 16 }}>
          {/* Language Selection */}
          <div className="form-group">
            <label className="label">Hedef Dil</label>
            <select
              className="select"
              value={targetLanguage}
              onChange={(e) => setSecondaryLanguage(e.target.value)}
            >
              {Object.entries(LANGUAGES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          
          {/* Translate Button */}
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 8, marginBottom: 16 }}
            onClick={handleTranslate}
            disabled={isTranslating || subtitles.length === 0}
          >
            {isTranslating ? (
              <>
                <FiLoader style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ marginLeft: 8 }}>Çeviriliyor...</span>
              </>
            ) : (
              <>
                <FiRefreshCw size={14} />
                <span style={{ marginLeft: 8 }}>
                  {hasTranslation ? 'Yeniden Çevir' : 'Tümünü Çevir'}
                </span>
              </>
            )}
          </button>
          
          {hasTranslation && (
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16, textAlign: 'center' }}>
              ✓ {translatedSubs.length} altyazı çevrildi. Düzenlemeler için altyazı listesini kullanın.
            </p>
          )}
          
          {/* Style Settings */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
            <label className="label" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <FiType size={14} />
              İkinci Altyazı Stili
            </label>
            
            {/* Font */}
            <div className="form-group">
              <label className="label" style={{ fontSize: 11 }}>Font</label>
              <select
                className="select"
                value={style.fontName}
                onChange={(e) => setSecondaryStyle({ fontName: e.target.value })}
              >
                {FONTS.map((font) => (
                  <option key={font} value={font} style={{ fontFamily: font }}>
                    {font}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Font Size */}
            <div className="form-group">
              <label className="label" style={{ fontSize: 11 }}>Boyut: {style.fontSize}px</label>
              <input
                type="range"
                className="slider"
                min={18}
                max={72}
                value={style.fontSize}
                onChange={(e) => setSecondaryStyle({ fontSize: parseInt(e.target.value) })}
              />
            </div>
            
            {/* Colors Row */}
            <div className="form-row">
              <div className="form-group">
                <label className="label" style={{ fontSize: 11 }}>Metin Rengi</label>
                <input
                  type="color"
                  value={style.color}
                  onChange={(e) => setSecondaryStyle({ color: e.target.value })}
                  style={{ width: '100%', height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }}
                />
              </div>
              <div className="form-group">
                <label className="label" style={{ fontSize: 11 }}>Kenarlık</label>
                <input
                  type="color"
                  value={style.borderColor}
                  onChange={(e) => setSecondaryStyle({ borderColor: e.target.value })}
                  style={{ width: '100%', height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }}
                />
              </div>
            </div>
            
            {/* Border Width */}
            <div className="form-group">
              <label className="label" style={{ fontSize: 11 }}>Kenarlık: {style.borderWidth}px</label>
              <input
                type="range"
                className="slider"
                min={0}
                max={6}
                value={style.borderWidth}
                onChange={(e) => setSecondaryStyle({ borderWidth: parseInt(e.target.value) })}
              />
            </div>
            
            {/* Vertical Margin (Position) */}
            <div className="form-group">
              <label className="label" style={{ fontSize: 11 }}>Dikey Pozisyon: {style.marginVertical}px</label>
              <input
                type="range"
                className="slider"
                min={60}
                max={300}
                value={style.marginVertical}
                onChange={(e) => setSecondaryStyle({ marginVertical: parseInt(e.target.value) })}
              />
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                Ana altyazının altında ne kadar aşağıda görüneceği
              </p>
            </div>
            
            {/* Position Controls - ANA DİL İLE AYNI */}
            <div className="form-group">
              <label className="label" style={{ fontSize: 11 }}>Position</label>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(3, 1fr)', 
                gap: 4,
                maxWidth: 120,
                marginBottom: 8
              }}>
                {ALIGNMENTS.map((align) => (
                  <button
                    key={align.value}
                    className={`btn ${(style.alignment || 5) === align.value ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setSecondaryStyle({ alignment: align.value })}
                    style={{ padding: '6px 0', fontSize: 14 }}
                  >
                    {align.label}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Margin from edge - ANA DİL İLE AYNI */}
            <div className="form-group">
              <label className="label" style={{ fontSize: 11 }}>Margin from edge: {style.marginVertical}px</label>
              <input
                type="range"
                className="slider"
                min={10}
                max={200}
                value={style.marginVertical}
                onChange={(e) => setSecondaryStyle({ marginVertical: parseInt(e.target.value) })}
              />
            </div>
            
            {/* Fine-tune Offset Controls */}
            <div className="form-group">
              <label className="label" style={{ fontSize: 11 }}>Fine Adjustment</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    Horizontal: {style.offsetX || 0}px
                  </label>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    value={style.offsetX || 0}
                    onChange={(e) => setSecondaryStyle({ offsetX: parseInt(e.target.value) })}
                    className="slider"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    Vertical: {style.offsetY || 0}px
                  </label>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    value={style.offsetY || 0}
                    onChange={(e) => setSecondaryStyle({ offsetY: parseInt(e.target.value) })}
                    className="slider"
                  />
                </div>
              </div>
            </div>
            
            {/* Bold / Italic */}
            <div className="form-row" style={{ marginTop: 8 }}>
              <button
                className={`btn ${style.bold ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, fontWeight: 'bold' }}
                onClick={() => setSecondaryStyle({ bold: !style.bold })}
              >
                B
              </button>
              <button
                className={`btn ${style.italic ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, fontStyle: 'italic' }}
                onClick={() => setSecondaryStyle({ italic: !style.italic })}
              >
                I
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default SecondarySubtitleEditor;
