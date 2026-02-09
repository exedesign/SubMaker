import React from 'react';
import { useAppStore } from '../stores/appStore';
import { FiMonitor, FiSmartphone, FiSquare } from 'react-icons/fi';

function FormatSelector() {
  const { 
    videoFormat, 
    setVideoFormat, 
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
      {/* Aspect Ratio */}
      <div className="form-group">
        <label className="label">Aspect Ratio</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn ${videoFormat === 'horizontal' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setVideoFormat('horizontal')}
            style={{ flex: 1, flexDirection: 'column', padding: '12px 8px' }}
          >
            <FiMonitor size={20} />
            <span style={{ fontSize: 11, marginTop: 4 }}>16:9</span>
          </button>
          <button
            className={`btn ${videoFormat === 'vertical' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setVideoFormat('vertical')}
            style={{ flex: 1, flexDirection: 'column', padding: '12px 8px' }}
          >
            <FiSmartphone size={20} />
            <span style={{ fontSize: 11, marginTop: 4 }}>9:16</span>
          </button>
          <button
            className={`btn ${videoFormat === 'square' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setVideoFormat('square')}
            style={{ flex: 1, flexDirection: 'column', padding: '12px 8px' }}
          >
            <FiSquare size={20} />
            <span style={{ fontSize: 11, marginTop: 4 }}>1:1</span>
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          {videoFormat === 'horizontal' && '1920×1080 - YouTube, Desktop'}
          {videoFormat === 'vertical' && '1080×1920 - TikTok, Reels, Shorts'}
          {videoFormat === 'square' && '1080×1080 - Instagram, Facebook'}
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
