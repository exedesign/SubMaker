import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiGlobe, FiArrowRight, FiRefreshCw, FiAlertCircle, FiInfo } from 'react-icons/fi';
import SecondarySubtitleEditor from './SecondarySubtitleEditor';

// Common languages
const LANGUAGES = [
  { code: null, name: 'Otomatik Algıla' },
  { code: 'en', name: 'İngilizce' },
  { code: 'ar', name: 'Arapça' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'es', name: 'İspanyolca' },
  { code: 'fr', name: 'Fransızca' },
  { code: 'de', name: 'Almanca' },
  { code: 'it', name: 'İtalyanca' },
  { code: 'pt', name: 'Portekizce' },
  { code: 'ru', name: 'Rusça' },
  { code: 'zh', name: 'Çince' },
  { code: 'ja', name: 'Japonca' },
  { code: 'ko', name: 'Korece' },
  { code: 'hi', name: 'Hintçe' },
  { code: 'fa', name: 'Farsça' },
  { code: 'he', name: 'İbranice' },
  { code: 'nl', name: 'Hollandaca' },
  { code: 'pl', name: 'Lehçe' },
  { code: 'sv', name: 'İsveççe' },
  { code: 'uk', name: 'Ukraynaca' },
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
          Kaynak Dil
          {detectedLanguage && (
            <span style={{ fontWeight: 'normal', marginLeft: 8, color: 'var(--accent-success)' }}>
              (Algılanan: {LANGUAGES.find(l => l.code === detectedLanguage)?.name || detectedLanguage})
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
              Seçili Dil ile Yeniden Transkript
            </button>
          ) : (
            <div className="retranscribe-confirm-inline">
              <div className="confirm-message">
                <FiAlertCircle size={16} style={{ color: 'var(--accent-warning)' }} />
                <span>{subtitles.length} altyazı silinecek!</span>
              </div>
              <div className="confirm-actions">
                <button 
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowRetranscribe(false)}
                >
                  İptal
                </button>
                <button 
                  className="btn btn-warning btn-sm"
                  onClick={() => {
                    clearSubtitles();
                    transcribe();
                    setShowRetranscribe(false);
                  }}
                >
                  <FiRefreshCw size={12} /> Yeniden Yap
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
