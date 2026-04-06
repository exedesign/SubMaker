import React, { useState, useMemo } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiEye, FiList, FiGrid, FiChevronDown, FiChevronUp, FiAlignLeft, FiAlignCenter, FiAlignRight, FiType } from 'react-icons/fi';

/**
 * SubtitlePreview - Comprehensive pre-render preview panel
 * Shows all subtitles, format settings, and styles
 */
function SubtitlePreview() {
  const {
    subtitles,
    style,
    animation,
    videoFormat,
    outputFormat,
    quality,
    background,
    mediaDuration,
    detectedLanguage,
    sourceLanguage,
  } = useAppStore();

  const [viewMode, setViewMode] = useState('list'); // 'list' | 'preview' | 'grid'
  const [expandedSection, setExpandedSection] = useState({ subtitles: true, format: true, style: true });
  const [previewIndex, setPreviewIndex] = useState(0);

  // Statistics
  const stats = useMemo(() => {
    if (subtitles.length === 0) return null;
    
    const totalDuration = subtitles.reduce((acc, sub) => acc + (sub.end - sub.start), 0);
    const avgDuration = totalDuration / subtitles.length;
    const longestSub = subtitles.reduce((prev, current) => 
      (current.end - current.start) > (prev.end - prev.start) ? current : prev
    );
    const shortestSub = subtitles.reduce((prev, current) => 
      (current.end - current.start) < (prev.end - prev.start) ? current : prev
    );
    const totalChars = subtitles.reduce((acc, sub) => acc + sub.text.length, 0);
    const totalWords = subtitles.reduce((acc, sub) => acc + sub.text.split(/\s+/).filter(w => w).length, 0);
    
    // RTL check
    const hasArabic = subtitles.some(sub => /[\u0600-\u06FF]/.test(sub.text));
    const hasHebrew = subtitles.some(sub => /[\u0590-\u05FF]/.test(sub.text));
    const isRTL = hasArabic || hasHebrew;
    
    return {
      count: subtitles.length,
      totalDuration: totalDuration.toFixed(1),
      avgDuration: avgDuration.toFixed(2),
      longestDuration: (longestSub.end - longestSub.start).toFixed(2),
      shortestDuration: (shortestSub.end - shortestSub.start).toFixed(2),
      totalChars,
      totalWords,
      avgChars: Math.round(totalChars / subtitles.length),
      avgWords: (totalWords / subtitles.length).toFixed(1),
      isRTL,
      hasArabic,
    };
  }, [subtitles]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const toggleSection = (section) => {
    setExpandedSection(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Format info
  const formatInfo = {
    resolution: videoFormat === 'vertical' ? '1080x1920' : videoFormat === 'square' ? '1080x1080' : '1920x1080',
    aspectRatio: videoFormat === 'vertical' ? '9:16' : videoFormat === 'square' ? '1:1' : '16:9',
    format: outputFormat.toUpperCase(),
    quality: quality === 'high' ? 'High (1080p)' : quality === 'medium' ? 'Medium (720p)' : 'Low (480p)',
    // Actual video dimensions
    width: videoFormat === 'vertical' ? 1080 : videoFormat === 'square' ? 1080 : 1920,
    height: videoFormat === 'vertical' ? 1920 : videoFormat === 'square' ? 1080 : 1080,
  };

  // Preview scale factor — from actual video dimensions to preview size
  const previewWidth = videoFormat === 'vertical' ? 180 : videoFormat === 'square' ? 220 : 280;
  const scaleFactor = previewWidth / formatInfo.width;

  // Calculate font size ratio relative to screen height
  const fontRatio = ((style.fontSize / formatInfo.height) * 100).toFixed(1);

  // Style preview — reflects real proportions
  const getPreviewStyle = () => ({
    fontFamily: style.fontName,
    fontSize: Math.max(8, style.fontSize * scaleFactor), // Scaled font size
    color: style.color,
    fontWeight: style.bold ? 'bold' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    textShadow: `${Math.max(1, style.shadowDepth * scaleFactor)}px ${Math.max(1, style.shadowDepth * scaleFactor)}px ${Math.max(2, style.shadowDepth * 2 * scaleFactor)}px rgba(0,0,0,0.8)`,
    WebkitTextStroke: `${Math.max(0.3, style.borderWidth * scaleFactor)}px ${style.borderColor}`,
    paintOrder: 'stroke fill',
    direction: stats?.isRTL ? 'rtl' : 'ltr',
    textAlign: style.alignment % 3 === 1 ? 'left' : style.alignment % 3 === 0 ? 'right' : 'center',
    lineHeight: 1.3,
  });

  if (subtitles.length === 0) {
    return (
      <div className="preview-panel empty">
        <FiEye size={32} style={{ opacity: 0.3 }} />
        <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>
          Subtitles required for preview
        </p>
      </div>
    );
  }

  return (
    <div className="subtitle-preview-panel">
      {/* Header */}
      <div className="preview-header">
        <h3 style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiEye /> Render Preview
        </h3>
        <div className="view-toggle">
          <button 
            className={`btn btn-ghost btn-sm ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            <FiList size={14} />
          </button>
          <button
            className={`btn btn-ghost btn-sm ${viewMode === 'preview' ? 'active' : ''}`}
            onClick={() => setViewMode('preview')}
            title="Preview"
          >
            <FiEye size={14} />
          </button>
          <button
            className={`btn btn-ghost btn-sm ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            <FiGrid size={14} />
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="preview-stats">
        <div className="stat-item">
          <span className="stat-value">{stats.count}</span>
          <span className="stat-label">Subtitles</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{stats.totalWords}</span>
          <span className="stat-label">Words</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{stats.avgDuration}s</span>
          <span className="stat-label">Avg. Duration</span>
        </div>
        {stats.isRTL && (
          <div className="stat-item rtl-indicator">
            <span className="stat-value">RTL</span>
            <span className="stat-label">{stats.hasArabic ? 'Arabic' : 'Hebrew'}</span>
          </div>
        )}
      </div>

      {/* Format Section */}
      <div className="preview-section">
        <div className="section-header" onClick={() => toggleSection('format')}>
          <span>📐 Format Settings</span>
          {expandedSection.format ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
        </div>
        {expandedSection.format && (
          <div className="section-content">
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Resolution:</span>
                <span className="info-value">{formatInfo.resolution}</span>
              </div>
              <div className="info-item">
                <span className="info-label">En-Boy:</span>
                <span className="info-value">{formatInfo.aspectRatio}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Format:</span>
                <span className="info-value">{formatInfo.format}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Kalite:</span>
                <span className="info-value">{formatInfo.quality}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Arkaplan:</span>
                <span className="info-value">
                  {background.type === 'color' ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ 
                        width: 14, 
                        height: 14, 
                        backgroundColor: background.value, 
                        borderRadius: 3,
                        border: '1px solid var(--border-color)'
                      }} />
                      {background.value}
                    </span>
                  ) : background.type === 'transparent' ? 'Transparent' : 'Image'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Language:</span>
                <span className="info-value">
                  {detectedLanguage || sourceLanguage || 'Otomatik'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Style Section */}
      <div className="preview-section">
        <div className="section-header" onClick={() => toggleSection('style')}>
          <span><FiType size={14} /> Style Settings</span>
          {expandedSection.style ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
        </div>
        {expandedSection.style && (
          <div className="section-content">
            {/* Realistic Video Frame Preview */}
            <div className="video-frame-preview">
              <div className="frame-label">
                <span className="format-badge">{formatInfo.aspectRatio}</span>
                <span className="resolution-badge">{formatInfo.resolution}</span>
              </div>
              <div 
                className="frame-container"
                style={{
                  width: previewWidth,
                  height: previewWidth * (formatInfo.height / formatInfo.width),
                  background: background.type === 'color' ? background.value : 
                              background.type === 'transparent' ? 'repeating-conic-gradient(#808080 0% 25%, #404040 0% 50%) 50% / 10px 10px' : '#000',
                  backgroundImage: background.type === 'image' && background.imagePath ? `url(file://${background.imagePath})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                {/* Safe area guides */}
                <div className="safe-area-guide" />
                
                {/* Subtitle position indicator */}
                <div 
                  className="subtitle-position"
                  style={{
                    top: style.alignment >= 7 ? `${10 + (style.offsetY || 0) * 0.5}%` : style.alignment >= 4 ? `${45 + (style.offsetY || 0) * 0.5}%` : 'auto',
                    bottom: style.alignment <= 3 ? `${Math.max(0, style.marginVertical * scaleFactor - (style.offsetY || 0) * 2)}px` : 'auto',
                    left: `${(style.offsetX || 0) * 0.5}%`,
                    right: `${-(style.offsetX || 0) * 0.5}%`,
                    textAlign: style.alignment % 3 === 1 ? 'left' : style.alignment % 3 === 0 ? 'right' : 'center',
                    padding: `0 ${10 * scaleFactor}px`,
                  }}
                >
                  <span style={getPreviewStyle()}>
                    {subtitles[previewIndex]?.text?.substring(0, 40) || 'Sample subtitle'}
                    {(subtitles[previewIndex]?.text?.length || 0) > 40 ? '...' : ''}
                  </span>
                </div>
              </div>
              
              {/* Font Size Indicator */}
              <div className="font-size-indicator">
                <div className="indicator-bar">
                  <div 
                    className="indicator-fill" 
                    style={{ 
                      width: `${Math.min(100, (style.fontSize / 120) * 100)}%`,
                      background: style.fontSize > 72 ? 'var(--accent-warning)' : 
                                  style.fontSize < 32 ? 'var(--accent-error)' : 'var(--accent-success)'
                    }} 
                  />
                </div>
                <div className="indicator-labels">
                  <span className="font-size-value">{style.fontSize}px</span>
                  <span className="font-ratio">Ekran oranı: {fontRatio}%</span>
                </div>
              </div>
            </div>
            
            <div className="info-grid" style={{ marginTop: 12 }}>
              <div className="info-item">
                <span className="info-label">Font:</span>
                <span className="info-value" style={{ fontFamily: style.fontName }}>{style.fontName}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Boyut:</span>
                <span className="info-value">{style.fontSize}px</span>
              </div>
              <div className="info-item">
                <span className="info-label">Renk:</span>
                <span className="info-value">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ 
                      width: 14, 
                      height: 14, 
                      backgroundColor: style.color, 
                      borderRadius: 3,
                      border: '1px solid var(--border-color)'
                    }} />
                    {style.color}
                  </span>
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Border:</span>
                <span className="info-value">{style.borderWidth}px {style.borderColor}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Animation:</span>
                <span className="info-value">{animation.type === 'none' ? 'None' : animation.type}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Hizalama:</span>
                <span className="info-value">
                  {style.alignment % 3 === 1 ? <FiAlignLeft size={14} /> : 
                   style.alignment % 3 === 0 ? <FiAlignRight size={14} /> : 
                   <FiAlignCenter size={14} />}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Subtitles Section */}
      <div className="preview-section subtitles-section">
        <div className="section-header" onClick={() => toggleSection('subtitles')}>
          <span>📝 Subtitles ({subtitles.length})</span>
          {expandedSection.subtitles ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
        </div>
        {expandedSection.subtitles && (
          <div className="section-content subtitles-list">
            {viewMode === 'preview' ? (
              // Single preview mode with navigation
              <div className="single-preview">
                <div 
                  className="preview-card large"
                  style={{
                    background: background.type === 'color' ? background.value : '#000',
                    aspectRatio: videoFormat === 'vertical' ? '9/16' : videoFormat === 'square' ? '1/1' : '16/9',
                  }}
                >
                  <div className="preview-subtitle" style={{
                    ...getPreviewStyle(),
                    position: 'absolute',
                    bottom: style.alignment <= 3 ? '10%' : style.alignment <= 6 ? '45%' : '80%',
                    left: 0,
                    right: 0,
                    padding: '0 10%',
                  }}>
                    {subtitles[previewIndex]?.text}
                  </div>
                  <div className="preview-time">
                    {formatTime(subtitles[previewIndex]?.start)} - {formatTime(subtitles[previewIndex]?.end)}
                  </div>
                </div>
                <div className="preview-nav">
                  <button 
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPreviewIndex(Math.max(0, previewIndex - 1))}
                    disabled={previewIndex === 0}
                  >
                    ← Previous
                  </button>
                  <span className="preview-counter">
                    {previewIndex + 1} / {subtitles.length}
                  </span>
                  <button 
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPreviewIndex(Math.min(subtitles.length - 1, previewIndex + 1))}
                    disabled={previewIndex === subtitles.length - 1}
                  >
                    Sonraki →
                  </button>
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              // Grid view
              <div className="subtitle-grid">
                {subtitles.map((sub, index) => (
                  <div 
                    key={sub.id} 
                    className="grid-item"
                    onClick={() => { setPreviewIndex(index); setViewMode('preview'); }}
                  >
                    <div className="grid-index">{index + 1}</div>
                    <div 
                      className="grid-text" 
                      style={{ 
                        direction: stats?.isRTL ? 'rtl' : 'ltr',
                        fontFamily: style.fontName,
                      }}
                    >
                      {sub.text.length > 50 ? sub.text.substring(0, 50) + '...' : sub.text}
                    </div>
                    <div className="grid-time">{formatTime(sub.start)}</div>
                  </div>
                ))}
              </div>
            ) : (
              // List view
              <div className="subtitle-list-view">
                {subtitles.map((sub, index) => (
                  <div 
                    key={sub.id} 
                    className="list-item"
                    onClick={() => { setPreviewIndex(index); setViewMode('preview'); }}
                  >
                    <div className="list-index">{index + 1}</div>
                    <div className="list-content">
                      <div 
                        className="list-text"
                        style={{ 
                          direction: stats?.isRTL ? 'rtl' : 'ltr',
                          fontFamily: style.fontName,
                        }}
                      >
                        {sub.text}
                      </div>
                      <div className="list-meta">
                        <span className="time">{formatTime(sub.start)} → {formatTime(sub.end)}</span>
                        <span className="duration">{(sub.end - sub.start).toFixed(2)}s</span>
                        <span className="chars">{sub.text.length} karakter</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SubtitlePreview;
