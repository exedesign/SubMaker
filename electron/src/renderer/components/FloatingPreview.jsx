import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiEye, FiEyeOff, FiMinimize2, FiMaximize2, FiMove } from 'react-icons/fi';

/**
 * FloatingPreview - Draggable live preview window
 * All style changes are reflected in real time
 */
function FloatingPreview() {
  const {
    subtitles,
    style,
    videoFormat,
    background,
    mediaFile,
    currentStep,
    playbackTime,
    isPlaying,
    animation,
    settings,
    secondarySubtitle,
    detectedLanguage,
  } = useAppStore();

  // RTL language detection
  const RTL_LANGS = ['ar', 'fa', 'he', 'ur', 'ps', 'sd', 'yi'];
  const isRtl = RTL_LANGS.includes(detectedLanguage);

  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  
  // Drag - Direct DOM manipulation for smooth dragging
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    // Initial position: bottom right
    container.style.right = '20px';
    container.style.bottom = '40px';
    container.style.left = 'auto';
    container.style.top = 'auto';
  }, []);
  
  const handleMouseDown = (e) => {
    // Prevent clicks on buttons from triggering drag
    if (e.target.closest('button')) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    isDragging.current = true;
    container.classList.add('dragging');
    document.body.classList.add('dragging-preview');
    
    const rect = container.getBoundingClientRect();
    offset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    e.preventDefault();
  };
  
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      
      const container = containerRef.current;
      if (!container) return;
      
      // New position
      let newX = e.clientX - offset.current.x;
      let newY = e.clientY - offset.current.y;
      
      // Screen boundaries
      const maxX = window.innerWidth - container.offsetWidth;
      const maxY = window.innerHeight - container.offsetHeight;
      
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));
      
      // Direct style update (no state, very fast)
      container.style.left = newX + 'px';
      container.style.top = newY + 'px';
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    };
    
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.classList.remove('dragging-preview');
        const container = containerRef.current;
        if (container) {
          container.classList.remove('dragging');
        }
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Format info — ALL HOOKS MUST COME BEFORE CONDITIONAL RETURNS
  const formatInfo = useMemo(() => ({
    width: videoFormat === 'vertical' ? 1080 : videoFormat === 'square' ? 1080 : 1920,
    height: videoFormat === 'vertical' ? 1920 : videoFormat === 'square' ? 1080 : 1080,
    aspectRatio: videoFormat === 'vertical' ? '9:16' : videoFormat === 'square' ? '1:1' : '16:9',
  }), [videoFormat]);

  // Preview dimensions
  const previewWidth = videoFormat === 'vertical' ? 140 : videoFormat === 'square' ? 180 : 240;
  const previewHeight = previewWidth * (formatInfo.height / formatInfo.width);
  const scaleFactor = previewWidth / formatInfo.width;

  // Font screen ratio
  const fontRatio = ((style.fontSize / formatInfo.height) * 100).toFixed(1);

  // Scaled style
  const getScaledStyle = useMemo(() => ({
    fontFamily: style.fontName,
    fontSize: Math.max(6, style.fontSize * scaleFactor),
    color: style.color,
    fontWeight: style.bold ? 'bold' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    textShadow: `${Math.max(0.5, style.shadowDepth * scaleFactor)}px ${Math.max(0.5, style.shadowDepth * scaleFactor)}px ${Math.max(1, style.shadowDepth * 2 * scaleFactor)}px rgba(0,0,0,0.9)`,
    WebkitTextStroke: `${Math.max(0.2, style.borderWidth * scaleFactor)}px ${style.borderColor}`,
    paintOrder: 'stroke fill',
    textAlign: style.alignment % 3 === 1 ? 'left' : style.alignment % 3 === 0 ? 'right' : 'center',
    lineHeight: 1.2,
    maxWidth: '90%',
    wordWrap: 'break-word',
  }), [style, scaleFactor]);

  // Find active subtitle by playback time (REAL-TIME)
  const activeSubtitle = useMemo(() => {
    if (!subtitles.length) return null;
    return subtitles.find(sub => playbackTime >= sub.start && playbackTime <= sub.end);
  }, [subtitles, playbackTime]);

  // Find active secondary subtitle - TIME BASED
  const activeSecondarySubtitle = useMemo(() => {
    if (!settings?.dualSubtitleEnabled) return null;
    if (!secondarySubtitle?.subtitles?.length) return null;
    
    // Find secondary subtitle active at current time
    const found = secondarySubtitle.subtitles.find(sub => 
      playbackTime >= sub.start && playbackTime < sub.end
    );
    
    return found;
  }, [playbackTime, secondarySubtitle?.subtitles, settings?.dualSubtitleEnabled]);

  // Secondary subtitle scaled style
  const getSecondaryScaledStyle = useMemo(() => {
    if (!secondarySubtitle?.style) return {};
    const secStyle = secondarySubtitle.style;
    return {
      fontFamily: secStyle.fontName,
      fontSize: Math.max(5, secStyle.fontSize * scaleFactor * 0.85),
      color: secStyle.color,
      fontWeight: secStyle.bold ? 'bold' : 'normal',
      fontStyle: secStyle.italic ? 'italic' : 'normal',
      textShadow: (secStyle.shadowDepth ?? 1) > 0
        ? `${Math.max(0.5, secStyle.shadowDepth * scaleFactor)}px ${Math.max(0.5, secStyle.shadowDepth * scaleFactor)}px ${Math.max(1, secStyle.shadowDepth * 2 * scaleFactor)}px rgba(0,0,0,0.9)`
        : 'none',
      WebkitTextStroke: (secStyle.borderWidth ?? 2) > 0
        ? `${Math.max(0.2, secStyle.borderWidth * scaleFactor)}px ${secStyle.borderColor}`
        : 'none',
      paintOrder: 'stroke fill',
      textAlign: 'center',
      lineHeight: 1.2,
      maxWidth: '90%',
    };
  }, [secondarySubtitle?.style, scaleFactor]);

  // Animation progress calculation
  const animationProgress = useMemo(() => {
    if (!activeSubtitle) return { progress: 0, phase: 'none' };
    
    const duration = activeSubtitle.end - activeSubtitle.start;
    const elapsed = playbackTime - activeSubtitle.start;
    
    let progress;
    
    // Word-accurate karaoke progress using word-level timing data
    if (animation.type === 'karaoke' && activeSubtitle.words?.length > 0) {
      const fullText = activeSubtitle.text;
      const words = activeSubtitle.words;
      let highlightedChars = 0;
      let textPos = 0;
      
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const wordText = (w.word || '').trim();
        if (!wordText) continue;
        
        const idx = fullText.indexOf(wordText, textPos);
        if (idx === -1) continue;
        
        if (playbackTime >= w.end) {
          highlightedChars = idx + wordText.length;
          textPos = highlightedChars;
        } else if (playbackTime >= w.start) {
          const wordProgress = (playbackTime - w.start) / Math.max(0.01, w.end - w.start);
          highlightedChars = idx + Math.ceil(wordProgress * wordText.length);
          break;
        } else {
          break;
        }
      }
      
      progress = Math.min(100, Math.max(0, (highlightedChars / Math.max(1, fullText.length)) * 100));
    } else {
      progress = Math.min(100, Math.max(0, (elapsed / duration) * 100));
    }
    
    // Fade in/out phases (first and last 15%)
    const fadeInDuration = animation.fadeIn / 1000; // ms to seconds
    const fadeOutDuration = animation.fadeOut / 1000;
    
    let phase = 'visible';
    let opacity = 1;
    
    if (elapsed < fadeInDuration) {
      phase = 'fadeIn';
      opacity = elapsed / fadeInDuration;
    } else if (playbackTime > activeSubtitle.end - fadeOutDuration) {
      phase = 'fadeOut';
      opacity = (activeSubtitle.end - playbackTime) / fadeOutDuration;
    }
    
    return { progress, phase, opacity: Math.max(0, Math.min(1, opacity)), elapsed, duration };
  }, [activeSubtitle, playbackTime, animation.fadeIn, animation.fadeOut, animation.type]);

  // Visible character count for typewriter effect
  const typewriterChars = useMemo(() => {
    if (animation.type !== 'typewriter' || !activeSubtitle) return -1;
    const { elapsed, duration } = animationProgress;
    const text = activeSubtitle.text;
    // Writing completes at 80% of duration
    const writeTime = duration * 0.8;
    const charProgress = Math.min(1, elapsed / writeTime);
    return Math.floor(charProgress * text.length);
  }, [animation.type, activeSubtitle, animationProgress]);

  // Scale for pop effect
  const popScale = useMemo(() => {
    if (animation.type !== 'pop' || !activeSubtitle) return 1;
    const { elapsed } = animationProgress;
    // Pop animation in the first 0.15 seconds
    if (elapsed < 0.15) {
      // 0 -> 1.2 -> 1 easing
      const t = elapsed / 0.15;
      if (t < 0.6) {
        return t / 0.6 * 1.3; // 0 -> 1.3
      } else {
        return 1.3 - (t - 0.6) / 0.4 * 0.3; // 1.3 -> 1
      }
    }
    return 1;
  }, [animation.type, activeSubtitle, animationProgress]);

  // Render functions - by effect type
  const renderAnimatedText = (text) => {
    if (!activeSubtitle) return text;
    
    switch (animation.type) {
      case 'karaoke': {
        const totalChars = text.length;
        const highlightedChars = Math.floor((animationProgress.progress / 100) * totalChars);
        return (
          <span className="karaoke-text">
            <span 
              className="karaoke-highlighted"
              style={{ color: animation.highlightColor }}
            >
              {text.substring(0, highlightedChars)}
            </span>
            <span className="karaoke-unhighlighted">
              {text.substring(highlightedChars)}
            </span>
          </span>
        );
      }
      
      case 'typewriter': {
        const visibleText = typewriterChars >= 0 ? text.substring(0, typewriterChars) : text;
        return (
          <span className="typewriter-text">
            {visibleText}
            {typewriterChars < text.length && typewriterChars >= 0 && (
              <span className="typewriter-cursor">|</span>
            )}
          </span>
        );
      }
      
      case 'fade':
      case 'pop':
      default:
        return text;
    }
  };

  // Subtitle container style (for animations)
  const getSubtitleAnimationStyle = () => {
    const baseStyle = {};
    
    if (!activeSubtitle) return baseStyle;
    
    switch (animation.type) {
      case 'fade':
        baseStyle.opacity = animationProgress.opacity;
        baseStyle.transition = 'opacity 0.1s ease';
        break;
        
      case 'pop':
        baseStyle.transform = `scale(${popScale})`;
        baseStyle.opacity = popScale > 0.1 ? 1 : 0;
        break;
        
      case 'typewriter':
      case 'karaoke':
      default:
        break;
    }
    
    return baseStyle;
  };

  // Text to display - MAIN SUBTITLE
  const displayText = useMemo(() => {
    if (activeSubtitle) {
      const text = activeSubtitle.text;
      return text.length > 40 ? text.substring(0, 40) + '...' : text;
    }
    // If not playing or no subtitle, show the first subtitle
    if (subtitles.length > 0) {
      const text = subtitles[0].text;
      return text.length > 40 ? text.substring(0, 40) + '...' : text;
    }
    return 'Waiting for subtitles...';
  }, [activeSubtitle, subtitles]);

  // Secondary language text to display - SIMPLE AND CLEAR
  const secondaryDisplayText = useMemo(() => {
    const text = activeSecondarySubtitle?.translatedText;

    if (!text) return null;
    return text.length > 50 ? text.substring(0, 50) + '...' : text;
  }, [activeSecondarySubtitle]);

  // Don't show if no media file or still in upload stage
  if (!mediaFile || currentStep === 'upload') {
    return null;
  }

  // Visibility toggle
  if (!isVisible) {
    return (
      <button 
        className="floating-preview-toggle"
        onClick={() => setIsVisible(true)}
        title="Show preview"
      >
        <FiEye size={16} />
      </button>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`floating-preview ${isMinimized ? 'minimized' : ''}`}
    >
      {/* Header - Draggable */}
      <div 
        className="floating-preview-header"
        onMouseDown={handleMouseDown}
      >
        <span className="floating-preview-title">
          <FiMove size={12} className="drag-icon" />
          Live Preview
        </span>
        <div className="floating-preview-actions">
          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <FiMaximize2 size={12} /> : <FiMinimize2 size={12} />}
          </button>
          <button 
            onClick={() => setIsVisible(false)}
            title="Gizle"
          >
            <FiEyeOff size={12} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="floating-preview-content">
          {/* Video Frame */}
          <div 
            className="floating-frame"
            style={{
              width: previewWidth,
              height: previewHeight,
              background: background.type === 'color' ? background.value : 
                          background.type === 'transparent' ? 'repeating-conic-gradient(#808080 0% 25%, #404040 0% 50%) 50% / 8px 8px' : '#000',
              backgroundImage: background.type === 'image' && background.imagePath ? `url(file://${background.imagePath})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {/* Format indicator */}
            <div className="frame-format-badge">{formatInfo.aspectRatio}</div>
            
            {/* Safe area guide */}
            <div className="frame-safe-area" />
            
            {/* Combined Subtitles Container - main subtitle logic */}
            <div 
              className={`frame-subtitle ${animation.type}-mode`}
              style={{
                top: style.alignment >= 7 ? `${8 + (style.offsetY || 0) * 0.5}%` : style.alignment >= 4 ? `${42 + (style.offsetY || 0) * 0.5}%` : 'auto',
                bottom: style.alignment <= 3 ? `${Math.max(4, style.marginVertical * scaleFactor - (style.offsetY || 0) * 2)}px` : 'auto',
                left: `${5 + (style.offsetX || 0) * 0.5}%`,
                right: `${5 - (style.offsetX || 0) * 0.5}%`,
                flexDirection: 'column',
                alignItems: style.alignment % 3 === 1 ? 'flex-start' : style.alignment % 3 === 0 ? 'flex-end' : 'center',
                gap: '2px',
                ...getSubtitleAnimationStyle(),
              }}
            >
              {/* Primary Subtitle */}
              <span style={{ ...getScaledStyle, direction: isRtl ? 'rtl' : 'ltr' }}>
                {renderAnimatedText(displayText)}
              </span>
              
              {/* Secondary Subtitle - Second Language */}
              {settings?.dualSubtitleEnabled && secondaryDisplayText && (
                <span style={{
                  fontFamily: secondarySubtitle?.style?.fontName || 'Arial',
                  fontSize: Math.max(5, (secondarySubtitle?.style?.fontSize || 36) * scaleFactor * 0.8),
                  color: secondarySubtitle?.style?.color || '#FFFF00',
                  fontWeight: secondarySubtitle?.style?.bold ? 'bold' : 'normal',
                  fontStyle: secondarySubtitle?.style?.italic ? 'italic' : 'normal',
                  textShadow: (secondarySubtitle?.style?.shadowDepth ?? 1) > 0
                    ? `${Math.max(0.5, (secondarySubtitle?.style?.shadowDepth ?? 1) * scaleFactor)}px ${Math.max(0.5, (secondarySubtitle?.style?.shadowDepth ?? 1) * scaleFactor)}px ${Math.max(1, (secondarySubtitle?.style?.shadowDepth ?? 1) * 2 * scaleFactor)}px rgba(0,0,0,0.9)`
                    : 'none',
                  WebkitTextStroke: (secondarySubtitle?.style?.borderWidth ?? 2) > 0
                    ? `${Math.max(0.2, (secondarySubtitle?.style?.borderWidth ?? 2) * scaleFactor)}px ${secondarySubtitle?.style?.borderColor || '#000000'}`
                    : 'none',
                  paintOrder: 'stroke fill',
                  textAlign: 'center',
                  lineHeight: 1.2,
                  maxWidth: '90%',
                  marginTop: '4px',
                }}>
                  {secondaryDisplayText}
                </span>
              )}
            </div>
          </div>

          {/* Info Panel */}
          <div className="floating-info">
            <div className="info-row">
              <span className="info-key">Font:</span>
              <span className="info-val" style={{ fontFamily: style.fontName }}>{style.fontName}</span>
            </div>
            <div className="info-row">
              <span className="info-key">Boyut:</span>
              <span className="info-val highlight">{style.fontSize}px</span>
            </div>
            <div className="info-row">
              <span className="info-key">Animation:</span>
              <span className={`info-val animation-badge ${animation.type}`}>
                {animation.type === 'karaoke' ? '🎤 Karaoke' : 
                 animation.type === 'fade' ? '✨ Fade' :
                 animation.type === 'pop' ? '💥 Pop' :
                 animation.type === 'typewriter' ? '⌨️ Typewriter' : '—'}
              </span>
            </div>
            <div className="info-row colors">
              <span 
                className="color-dot" 
                style={{ background: style.color }}
                title={`Metin: ${style.color}`}
              />
              <span 
                className="color-dot border" 
                style={{ background: style.borderColor }}
                title={`Border: ${style.borderColor}`}
              />
              {animation.type === 'karaoke' && (
                <span 
                  className="color-dot karaoke" 
                  style={{ background: animation.highlightColor }}
                  title={`Karaoke: ${animation.highlightColor}`}
                />
              )}
            </div>
          </div>

          {/* Playback Info - Real-time sync indicator */}
          <div className="floating-playback-info">
            <div className={`playback-indicator ${isPlaying ? 'playing' : ''}`}>
              <span className="time">{formatTime(playbackTime)}</span>
              {isPlaying && <span className="live-badge">CANLI</span>}
            </div>
            {activeSubtitle && (
              <div className="active-subtitle-num">
                #{subtitles.indexOf(activeSubtitle) + 1} / {subtitles.length}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Zaman formatla
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default FloatingPreview;
