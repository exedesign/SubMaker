import React from 'react';
import { useAppStore } from '../stores/appStore';
import { FiMonitor, FiSmartphone, FiSquare, FiCheck } from 'react-icons/fi';

const FORMAT_OPTIONS = [
  { value: 'horizontal', label: '16:9', desc: '1920×1080 - YouTube, Desktop', Icon: FiMonitor },
  { value: 'vertical', label: '9:16', desc: '1080×1920 - TikTok, Reels, Shorts', Icon: FiSmartphone },
  { value: 'square', label: '1:1', desc: '1080×1080 - Instagram, Facebook', Icon: FiSquare },
];

function FormatSelector() {
  const {
    selectedFormats,
    toggleSelectedFormat,
    videoFormat,
    outputFormat,
    setOutputFormat,
    quality,
    setQuality,
    background,
  } = useAppStore();

  // Determine available output formats
  const outputFormats = background.type === 'transparent'
    ? [
        { value: 'webm', label: 'WebM (VP9)', desc: 'Smaller size, web compatible' },
        { value: 'mov', label: 'MOV (ProRes)', desc: 'Professional, larger size' },
      ]
    : [
        { value: 'mp4', label: 'MP4 (H.264)', desc: 'Universal compatibility' },
        { value: 'webm', label: 'WebM (VP9)', desc: 'Web optimized' },
        { value: 'mov', label: 'MOV', desc: 'Apple/Final Cut' },
      ];

  return (
    <div>
      {/* Aspect Ratio — Multi-select */}
      <div className="form-group">
        <label className="label">
          Aspect Ratio
          {selectedFormats.length > 1 && (
            <span style={{
              marginLeft: 8,
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 8,
              background: 'rgba(34, 197, 94, 0.2)',
              color: 'var(--accent-success)',
              fontWeight: 500,
            }}>
              {selectedFormats.length} format seçili
            </span>
          )}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {FORMAT_OPTIONS.map(({ value, label, Icon }) => {
            const isSelected = selectedFormats.includes(value);
            const isPreview = videoFormat === value;
            return (
              <button
                key={value}
                className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => toggleSelectedFormat(value)}
                style={{
                  flex: 1,
                  flexDirection: 'column',
                  padding: '12px 8px',
                  position: 'relative',
                  outline: isPreview ? '2px solid var(--accent-primary)' : 'none',
                  outlineOffset: 2,
                }}
                title={`${isSelected ? 'Kaldır' : 'Ekle'}: ${label}`}
              >
                {isSelected && (
                  <span style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: 'var(--accent-success)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <FiCheck size={9} color="#fff" />
                  </span>
                )}
                <Icon size={20} />
                <span style={{ fontSize: 11, marginTop: 4 }}>{label}</span>
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          {selectedFormats.length > 1
            ? `${selectedFormats.map(f => FORMAT_OPTIONS.find(o => o.value === f)?.label).join(', ')} formatlarında render alınacak`
            : FORMAT_OPTIONS.find(o => o.value === selectedFormats[0])?.desc
          }
        </p>
      </div>

      {/* Output Format */}
      <div className="form-group">
        <label className="label">Output Format</label>
        <select
          className="select"
          value={outputFormat}
          onChange={(e) => setOutputFormat(e.target.value)}
        >
          {outputFormats.map((fmt) => (
            <option key={fmt.value} value={fmt.value}>
              {fmt.label}
            </option>
          ))}
        </select>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          {outputFormats.find(f => f.value === outputFormat)?.desc}
        </p>
      </div>

      {/* Quality */}
      <div className="form-group">
        <label className="label">Quality</label>
        <div className="tabs">
          <button
            className={`tab ${quality === 'low' ? 'active' : ''}`}
            onClick={() => setQuality('low')}
          >
            Fast
          </button>
          <button
            className={`tab ${quality === 'medium' ? 'active' : ''}`}
            onClick={() => setQuality('medium')}
          >
            Balanced
          </button>
          <button
            className={`tab ${quality === 'high' ? 'active' : ''}`}
            onClick={() => setQuality('high')}
          >
            Best
          </button>
        </div>
      </div>
    </div>
  );
}

export default FormatSelector;
