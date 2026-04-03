import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiGlobe, FiArrowRight, FiRefreshCw, FiAlertCircle, FiInfo } from 'react-icons/fi';
import SecondarySubtitleEditor from './SecondarySubtitleEditor';

// Common languages
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

function LanguageSelector() {
  const { 
    sourceLanguage, 
    setSourceLanguage, 
    detectedLanguage,
    transcribe,
    clearSubtitles,
    subtitles,
    isProcessing,
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
      
      {/* Secondary Subtitle Settings */}
      <SecondarySubtitleEditor />
    </div>
  );
}

export default LanguageSelector;
