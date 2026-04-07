import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiGlobe, FiArrowRight, FiRefreshCw, FiAlertCircle, FiInfo, FiLoader, FiCpu } from 'react-icons/fi';

// All Whisper-supported languages (99 languages)
const LANGUAGES = [
  { code: null, name: 'Auto Detect' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'am', name: 'Amharic' },
  { code: 'ar', name: 'Arabic' },
  { code: 'as', name: 'Assamese' },
  { code: 'az', name: 'Azerbaijani' },
  { code: 'ba', name: 'Bashkir' },
  { code: 'be', name: 'Belarusian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'bn', name: 'Bengali' },
  { code: 'bo', name: 'Tibetan' },
  { code: 'br', name: 'Breton' },
  { code: 'bs', name: 'Bosnian' },
  { code: 'ca', name: 'Catalan' },
  { code: 'cs', name: 'Czech' },
  { code: 'cy', name: 'Welsh' },
  { code: 'da', name: 'Danish' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'et', name: 'Estonian' },
  { code: 'eu', name: 'Basque' },
  { code: 'fa', name: 'Persian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fo', name: 'Faroese' },
  { code: 'fr', name: 'French' },
  { code: 'gl', name: 'Galician' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'ha', name: 'Hausa' },
  { code: 'haw', name: 'Hawaiian' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hr', name: 'Croatian' },
  { code: 'ht', name: 'Haitian Creole' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'hy', name: 'Armenian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'is', name: 'Icelandic' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'jw', name: 'Javanese' },
  { code: 'ka', name: 'Georgian' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'km', name: 'Khmer' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ko', name: 'Korean' },
  { code: 'la', name: 'Latin' },
  { code: 'lb', name: 'Luxembourgish' },
  { code: 'ln', name: 'Lingala' },
  { code: 'lo', name: 'Lao' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'lv', name: 'Latvian' },
  { code: 'mg', name: 'Malagasy' },
  { code: 'mi', name: 'Maori' },
  { code: 'mk', name: 'Macedonian' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'mn', name: 'Mongolian' },
  { code: 'mr', name: 'Marathi' },
  { code: 'ms', name: 'Malay' },
  { code: 'mt', name: 'Maltese' },
  { code: 'my', name: 'Myanmar' },
  { code: 'ne', name: 'Nepali' },
  { code: 'nl', name: 'Dutch' },
  { code: 'nn', name: 'Nynorsk' },
  { code: 'no', name: 'Norwegian' },
  { code: 'oc', name: 'Occitan' },
  { code: 'pa', name: 'Panjabi' },
  { code: 'pl', name: 'Polish' },
  { code: 'ps', name: 'Pashto' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'sa', name: 'Sanskrit' },
  { code: 'sd', name: 'Sindhi' },
  { code: 'si', name: 'Sinhala' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'sn', name: 'Shona' },
  { code: 'so', name: 'Somali' },
  { code: 'sq', name: 'Albanian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'su', name: 'Sundanese' },
  { code: 'sv', name: 'Swedish' },
  { code: 'sw', name: 'Swahili' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'tg', name: 'Tajik' },
  { code: 'th', name: 'Thai' },
  { code: 'tk', name: 'Turkmen' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'tr', name: 'Turkish' },
  { code: 'tt', name: 'Tatar' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'uz', name: 'Uzbek' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'yi', name: 'Yiddish' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'zh', name: 'Chinese' },
  { code: 'yue', name: 'Cantonese' },
];

// Export for use by other components (e.g. ModelSelector)
export { LANGUAGES };

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
    setSettings,
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
              <option value="none">None</option>
              {Object.entries(TARGET_LANGUAGES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          
          {secondarySubtitle.targetLanguage !== 'none' && (
          <>
          {/* Translation Provider Toggle */}
          <div style={{
            display: 'flex',
            gap: 4,
            marginTop: 4,
            borderRadius: 6,
            overflow: 'hidden',
            border: '1px solid var(--border-color)',
          }}>
            <button
              className={`btn btn-sm ${settings.translationProvider !== 'qwen' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1, borderRadius: 0, border: 'none', fontSize: 11, padding: '4px 6px' }}
              onClick={() => setSettings({ translationProvider: 'online' })}
              title="Internet-based translation (MyMemory / Lingva)"
            >
              <FiGlobe size={12} style={{ marginRight: 4 }} />
              Online
            </button>
            <button
              className={`btn btn-sm ${settings.translationProvider === 'qwen' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1, borderRadius: 0, border: 'none', fontSize: 11, padding: '4px 6px' }}
              onClick={() => setSettings({ translationProvider: 'qwen' })}
              title="Local Qwen2.5 AI translation (GPU)"
            >
              <FiCpu size={12} style={{ marginRight: 4 }} />
              Qwen2.5
            </button>
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
          </>
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
