import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiGlobe, FiArrowRight, FiRefreshCw, FiAlertCircle, FiInfo, FiLoader } from 'react-icons/fi';

// Common languages for source
const LANGUAGES = [
  { code: null, name: 'Auto Detect' },
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'Arabic' },
  { code: 'tr', name: 'Turkish' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'hi', name: 'Hindi' },
  { code: 'fa', name: 'Farsi' },
  { code: 'he', name: 'Hebrew' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'sv', name: 'Swedish' },
  { code: 'uk', name: 'Ukrainian' },
];

// Target languages for translation
const TARGET_LANGUAGES = {
  'en': 'English',
  'tr': 'Turkish',
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
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

function LanguageSelector() {
  const { 
    sourceLanguage, 
    setSourceLanguage, 
    detectedLanguage,
    transcribe,
    clearSubtitles,
    subtitles,
    isProcessing,
    settings,
    secondarySubtitle,
    setSecondaryLanguage,
    translateToSecondary,
  } = useAppStore();
  
  const [showRetranscribe, setShowRetranscribe] = useState(false);
  
  return (
    <div>
      {/* Source Language */}
      <div className="form-group">
        <label className="label">
          Source Language
          {detectedLanguage && (
            <span style={{ fontWeight: 'normal', marginLeft: 8, color: 'var(--accent-success)' }}>
              (Detected: {LANGUAGES.find(l => l.code === detectedLanguage)?.name || detectedLanguage})
            </span>
          )}
        </label>
        <select 
          className="select"
          value={sourceLanguage || ''}
          onChange={(e) => setSourceLanguage(e.target.value || null)}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code || 'auto'} value={lang.code || ''}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>
      
      {/* Retranscribe Button */}
      {subtitles.length > 0 && (
        <div className="form-group">
          {!showRetranscribe ? (
            <button 
              className="btn btn-ghost retranscribe-btn"
              onClick={() => setShowRetranscribe(true)}
              disabled={isProcessing}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <FiRefreshCw size={14} />
              Re-transcribe with Selected Language
            </button>
          ) : (
            <div className="retranscribe-confirm-inline">
              <div className="confirm-message">
                <FiAlertCircle size={16} style={{ color: 'var(--accent-warning)' }} />
                <span>{subtitles.length} subtitles will be deleted!</span>
              </div>
              <div className="confirm-actions">
                <button 
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowRetranscribe(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-warning btn-sm"
                  onClick={() => {
                    clearSubtitles();
                    transcribe();
                    setShowRetranscribe(false);
                  }}
                >
                  <FiRefreshCw size={12} /> Re-transcribe
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Target Language & Translate (Secondary Subtitle) */}
      {settings.dualSubtitleEnabled && (
        <>
          <div className="form-group" style={{ marginTop: 8 }}>
            <label className="label">Target Language</label>
            <select
              className="select"
              value={secondarySubtitle.targetLanguage}
              onChange={(e) => setSecondaryLanguage(e.target.value)}
            >
              {Object.entries(TARGET_LANGUAGES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 4 }}
            onClick={async () => {
              if (subtitles.length === 0) {
                alert('Please generate main subtitles first');
                return;
              }
              await translateToSecondary();
            }}
            disabled={secondarySubtitle.isTranslating || subtitles.length === 0}
          >
            {secondarySubtitle.isTranslating ? (
              <>
                <FiLoader style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ marginLeft: 8 }}>Translating...</span>
              </>
            ) : (
              <>
                <FiRefreshCw size={14} />
                <span style={{ marginLeft: 8 }}>
                  {secondarySubtitle.subtitles?.length > 0 ? 'Re-translate' : 'Translate All'}
                </span>
              </>
            )}
          </button>
          
          {secondarySubtitle.subtitles?.length > 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, textAlign: 'center' }}>
              ✓ {secondarySubtitle.subtitles.length} subtitles translated
            </p>
          )}
          
          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </>
      )}
    </div>
  );
}

export default LanguageSelector;
