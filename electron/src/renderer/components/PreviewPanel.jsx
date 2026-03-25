import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import {
  FiEye, FiEyeOff, FiMinimize2, FiMaximize2, FiMove,
  FiExternalLink, FiSidebar, FiX, FiMoreVertical, FiMaximize
} from 'react-icons/fi';
import LogoOverlay from './LogoOverlay';
import ButterchurnCanvas from './ButterchurnCanvas';

// Utility function to convert backend file paths to HTTP URLs
const getImageUrl = (imagePath) => {
  if (!imagePath) return null;
  
  // If it's already a blob URL or HTTP URL, use as is
  if (imagePath.startsWith('blob:') || imagePath.startsWith('http')) {
    return imagePath;
  }
  
  // If it's a backend file path, convert to HTTP URL
  if (imagePath.includes('\\temp\\') || imagePath.includes('/temp/')) {
    const filename = imagePath.split(/[\\/]/).pop();
    return `http://localhost:5000/api/media/temp/${filename}`;
  }
  
  // If it's an output path
  if (imagePath.includes('\\output\\') || imagePath.includes('/output/')) {
    const filename = imagePath.split(/[\\/]/).pop();
    return `http://localhost:5000/api/media/output/${filename}`;
  }
  
  // Fallback for other paths
  return imagePath;
};

/**
 * PreviewPanel - Çift modlu canlı önizleme
 * - Docked Mode: Sağ panelde sabit, resize edilebilir
 * - Floating Mode: Sürüklenebilir pencere
 */
function PreviewPanel() {
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
    previewMode,
    setPreviewMode,
    logo,
    settings,
    secondarySubtitle,
    visualizer,
    globalAudioRef,
  } = useAppStore();

  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(300); // Docked panel genişliği

  // Floating mode boyutları
  const [floatingSize, setFloatingSize] = useState({ width: 300, height: 400 });
  
  // Drag state for floating mode
  const containerRef = useRef(null);
  const previewFrameRef = useRef(null);
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const resizeDirection = useRef(null);
  const offset = useRef({ x: 0, y: 0 });
  const startX = useRef(0);
  const startY = useRef(0);
  const startWidth = useRef(0);
  const startHeight = useRef(0);
  const startLeft = useRef(0);
  const startTop = useRef(0);
  
  // Resize handler for docked mode
  const handleResizeStart = (e) => {
    if (previewMode !== 'docked') return;
    isResizing.current = true;
    resizeDirection.current = 'docked';
    startX.current = e.clientX;
    startWidth.current = panelWidth;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  };
  
  // Resize handler for floating mode (kenarlar ve köşeler)
  const handleFloatingResizeStart = (e, direction) => {
    if (previewMode !== 'floating') return;
    e.preventDefault();
    e.stopPropagation();
    
    isResizing.current = true;
    resizeDirection.current = direction;
    startX.current = e.clientX;
    startY.current = e.clientY;
    startWidth.current = floatingSize.width;
    startHeight.current = floatingSize.height;
    
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      startLeft.current = rect.left;
      startTop.current = rect.top;
    }
    
    document.body.style.userSelect = 'none';
  };
  
  useEffect(() => {
    const handleResizeMove = (e) => {
      if (!isResizing.current) return;
      
      const dir = resizeDirection.current;
      
      // Docked mode resize
      if (dir === 'docked') {
        const delta = startX.current - e.clientX;
        const newWidth = Math.max(200, Math.min(600, startWidth.current + delta));
        setPanelWidth(newWidth);
        return;
      }
      
      // Floating mode resize
      const container = containerRef.current;
      if (!container) return;
      
      const deltaX = e.clientX - startX.current;
      const deltaY = e.clientY - startY.current;
      
      let newWidth = startWidth.current;
      let newHeight = startHeight.current;
      let newLeft = startLeft.current;
      let newTop = startTop.current;
      
      // Yatay resize
      if (dir.includes('e')) {
        newWidth = Math.max(200, Math.min(800, startWidth.current + deltaX));
      }
      if (dir.includes('w')) {
        newWidth = Math.max(200, Math.min(800, startWidth.current - deltaX));
        newLeft = startLeft.current + deltaX;
      }
      
      // Dikey resize
      if (dir.includes('s')) {
        newHeight = Math.max(150, Math.min(800, startHeight.current + deltaY));
      }
      if (dir.includes('n')) {
        newHeight = Math.max(150, Math.min(800, startHeight.current - deltaY));
        newTop = startTop.current + deltaY;
      }
      
      setFloatingSize({ width: newWidth, height: newHeight });
      
      if (dir.includes('w') || dir.includes('n')) {
        container.style.left = newLeft + 'px';
        container.style.top = newTop + 'px';
        container.style.right = 'auto';
        container.style.bottom = 'auto';
      }
    };
    
    const handleResizeEnd = () => {
      if (isResizing.current) {
        isResizing.current = false;
        resizeDirection.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
    
    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
    };
  }, []);
  
  // Set initial position for floating mode
  useEffect(() => {
    if (previewMode === 'floating' && containerRef.current) {
      const container = containerRef.current;
      container.style.right = '20px';
      container.style.bottom = '60px';
      container.style.left = 'auto';
      container.style.top = 'auto';
    }
  }, [previewMode]);
  
  // Drag handlers for floating mode
  const handleMouseDown = (e) => {
    if (previewMode !== 'floating') return;
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
      if (!isDragging.current || previewMode !== 'floating') return;
      
      const container = containerRef.current;
      if (!container) return;
      
      let newX = e.clientX - offset.current.x;
      let newY = e.clientY - offset.current.y;
      
      const maxX = window.innerWidth - container.offsetWidth;
      const maxY = window.innerHeight - container.offsetHeight;
      
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));
      
      container.style.left = newX + 'px';
      container.style.top = newY + 'px';
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    };
    
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.classList.remove('dragging-preview');
        containerRef.current?.classList.remove('dragging');
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [previewMode]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  // Escape key to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Format bilgileri
  const formatInfo = useMemo(() => ({
    width: videoFormat === 'vertical' ? 1080 : videoFormat === 'square' ? 1080 : 1920,
    height: videoFormat === 'vertical' ? 1920 : videoFormat === 'square' ? 1080 : 1080,
    aspectRatio: videoFormat === 'vertical' ? '9:16' : videoFormat === 'square' ? '1:1' : '16:9',
  }), [videoFormat]);

  // Önizleme boyutları - panel genişliğine göre dinamik
  const previewDimensions = useMemo(() => {
    // Mod'a göre kullanılabilir genişliği hesapla
    let availableWidth;
    if (previewMode === 'docked') {
      availableWidth = panelWidth - 40; // Padding için
    } else {
      availableWidth = floatingSize.width - 40; // Floating mode padding
    }
    
    let baseWidth = availableWidth;
    
    // Format'a göre ayarla - vertical ve square için oranla
    if (videoFormat === 'vertical') {
      baseWidth = Math.min(availableWidth * 0.6, availableWidth - 20);
    } else if (videoFormat === 'square') {
      baseWidth = Math.min(availableWidth * 0.85, availableWidth - 20);
    }
    
    const height = baseWidth * (formatInfo.height / formatInfo.width);
    const scaleFactor = baseWidth / formatInfo.width;
    
    return { width: baseWidth, height, scaleFactor };
  }, [previewMode, panelWidth, floatingSize.width, videoFormat, formatInfo]);

  // Fullscreen dimensions - fill entire screen maintaining aspect ratio
  const fullscreenDimensions = useMemo(() => {
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const videoAspect = formatInfo.width / formatInfo.height;
    let w, h;
    if (screenW / screenH > videoAspect) {
      h = screenH;
      w = h * videoAspect;
    } else {
      w = screenW;
      h = w / videoAspect;
    }
    const sf = w / formatInfo.width;
    return { width: w, height: h, scaleFactor: sf };
  }, [formatInfo]);

  const { width: previewWidth, height: previewHeight, scaleFactor } = previewDimensions;
  const { width: fsWidth, height: fsHeight, scaleFactor: fsScaleFactor } = fullscreenDimensions;

  // Ölçeklenmiş stil
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

  // Aktif altyazı - sadece bir tane ve tam zamanında
  const activeSubtitle = useMemo(() => {
    if (!subtitles.length) return null;
    
    // playbackTime >= start VE playbackTime < end (end dahil değil, çakışmayı önler)
    const active = subtitles.find(sub => 
      playbackTime >= sub.start && playbackTime < sub.end
    );
    
    return active || null;
  }, [subtitles, playbackTime]);

  // Aktif ikincil altyazı (çeviri) - aynı time-based mantık
  const activeSecondarySubtitle = useMemo(() => {
    if (!settings?.dualSubtitleEnabled) return null;
    if (!secondarySubtitle?.subtitles?.length) return null;
    
    // playbackTime bazlı ikincil altyazı bulma
    const activeSecondary = secondarySubtitle.subtitles.find(sub => 
      playbackTime >= sub.start && playbackTime < sub.end
    );
    
    return activeSecondary || null;
  }, [secondarySubtitle?.subtitles, playbackTime, settings?.dualSubtitleEnabled]);

  // Animasyon ilerleme
  const animationProgress = useMemo(() => {
    if (!activeSubtitle) return { progress: 0, phase: 'none' };
    
    const duration = activeSubtitle.end - activeSubtitle.start;
    const elapsed = playbackTime - activeSubtitle.start;
    const progress = Math.min(100, Math.max(0, (elapsed / duration) * 100));
    
    const fadeInDuration = animation.fadeIn / 1000;
    const fadeOutDuration = animation.fadeOut / 1000;
    
    let opacity = 1;
    if (elapsed < fadeInDuration) {
      opacity = elapsed / fadeInDuration;
    } else if (playbackTime > activeSubtitle.end - fadeOutDuration) {
      opacity = (activeSubtitle.end - playbackTime) / fadeOutDuration;
    }
    
    return { progress, opacity: Math.max(0, Math.min(1, opacity)), elapsed, duration };
  }, [activeSubtitle, playbackTime, animation.fadeIn, animation.fadeOut]);

  // Typewriter
  const typewriterChars = useMemo(() => {
    if (animation.type !== 'typewriter' || !activeSubtitle) return -1;
    const { elapsed, duration } = animationProgress;
    const text = activeSubtitle.text;
    const writeTime = duration * 0.8;
    const charProgress = Math.min(1, elapsed / writeTime);
    return Math.floor(charProgress * text.length);
  }, [animation.type, activeSubtitle, animationProgress]);

  // Pop scale
  const popScale = useMemo(() => {
    if (animation.type !== 'pop' || !activeSubtitle) return 1;
    const { elapsed } = animationProgress;
    if (elapsed < 0.15) {
      const t = elapsed / 0.15;
      if (t < 0.6) return t / 0.6 * 1.3;
      return 1.3 - (t - 0.6) / 0.4 * 0.3;
    }
    return 1;
  }, [animation.type, activeSubtitle, animationProgress]);

  // Animated text renderer
  const renderAnimatedText = (text) => {
    if (!activeSubtitle) return text;
    
    switch (animation.type) {
      case 'karaoke': {
        const highlightedChars = Math.floor((animationProgress.progress / 100) * text.length);
        return (
          <span className="karaoke-text">
            <span className="karaoke-highlighted" style={{ color: animation.highlightColor }}>
              {text.substring(0, highlightedChars)}
            </span>
            <span className="karaoke-unhighlighted">{text.substring(highlightedChars)}</span>
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
      default:
        return text;
    }
  };

  // Animation style
  const getSubtitleAnimationStyle = () => {
    if (!activeSubtitle) return {};
    
    switch (animation.type) {
      case 'fade':
        return { opacity: animationProgress.opacity, transition: 'opacity 0.1s ease' };
      case 'pop':
        return { transform: `scale(${popScale})`, opacity: popScale > 0.1 ? 1 : 0 };
      default:
        return {};
    }
  };

  // Display text - sadece aktif altyazı varsa göster
  const displayText = useMemo(() => {
    if (activeSubtitle) {
      const text = activeSubtitle.text;
      return text.length > 60 ? text.substring(0, 60) + '...' : text;
    }
    return null; // Aktif altyazı yoksa null döndür
  }, [activeSubtitle]);

  // Fullscreen scaled style (must be before any early returns to maintain hooks order)
  const fsScaledStyle = useMemo(() => ({
    fontFamily: style.fontName,
    fontSize: Math.max(6, style.fontSize * fsScaleFactor),
    color: style.color,
    fontWeight: style.bold ? 'bold' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    textShadow: `${Math.max(0.5, style.shadowDepth * fsScaleFactor)}px ${Math.max(0.5, style.shadowDepth * fsScaleFactor)}px ${Math.max(1, style.shadowDepth * 2 * fsScaleFactor)}px rgba(0,0,0,0.9)`,
    WebkitTextStroke: `${Math.max(0.2, style.borderWidth * fsScaleFactor)}px ${style.borderColor}`,
    paintOrder: 'stroke fill',
    textAlign: style.alignment % 3 === 1 ? 'left' : style.alignment % 3 === 0 ? 'right' : 'center',
    lineHeight: 1.2,
    maxWidth: '90%',
    wordWrap: 'break-word',
  }), [style, fsScaleFactor]);

  // Don't show preview panel until media is loaded
  if (!mediaFile || currentStep === 'upload') {
    return null;
  }

  // Hidden state toggle button (floating only)
  if (!isVisible && previewMode === 'floating') {
    return (
      <button 
        className="floating-preview-toggle"
        onClick={() => setIsVisible(true)}
        title="Önizlemeyi göster"
      >
        <FiEye size={16} />
      </button>
    );
  }

  // Preview content (shared between modes)
  const previewContent = (
    <>
      {/* Video Frame */}
      <div
        ref={previewFrameRef}
        className="preview-frame"
        onDoubleClick={toggleFullscreen}
        style={{
          cursor: isFullscreen ? 'zoom-out' : 'zoom-in',
          width: previewWidth,
          height: previewHeight,
          backgroundColor: background.type === 'color' ? background.value : 
                          background.type === 'transparent' ? '#000' : '#000',
          backgroundImage: background.type === 'image' && background.imagePath 
            ? `url(${getImageUrl(background.imagePath)})`
            : background.type === 'transparent' 
            ? 'repeating-conic-gradient(#808080 0% 25%, #404040 0% 50%)'
            : 'none',
          backgroundSize: background.type === 'image' || background.type === 'transparent' ? 'cover' : 'auto',
          backgroundPosition: background.type === 'image' || background.type === 'transparent' ? 'center' : 'initial',
          backgroundRepeat: background.type === 'transparent' ? 'repeat' : 'no-repeat',
          position: 'relative',
        }}
      >
        {/* Butterchurn Visualizer Overlay */}
        {visualizer.enabled && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            opacity: visualizer.opacity,
            zIndex: 1,
            pointerEvents: 'none',
          }}>
            <ButterchurnCanvas
              width={previewWidth}
              height={previewHeight}
              audioElement={globalAudioRef?.current ?? null}
              presetName={visualizer.presetName}
              sensitivity={visualizer.sensitivity}
            />
          </div>
        )}

        <div className="frame-format-badge">{formatInfo.aspectRatio}</div>
        <div className="frame-safe-area" />

        {/* Logo Overlay */}
        <LogoOverlay containerRef={previewFrameRef} scaleFactor={scaleFactor} />
        
        {/* Sadece aktif altyazı varsa göster */}
        {displayText && (
          <div 
            className={`frame-subtitle ${animation.type}-mode`}
            style={{
              top: style.alignment >= 7 ? '8%' : style.alignment >= 4 ? '42%' : 'auto',
              bottom: style.alignment <= 3 ? `${Math.max(4, style.marginVertical * scaleFactor)}px` : 'auto',
              left: '5%',
              right: '5%',
              justifyContent: style.alignment % 3 === 1 ? 'flex-start' : style.alignment % 3 === 0 ? 'flex-end' : 'center',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              ...getSubtitleAnimationStyle(),
            }}
          >
            {/* Ana altyazı - animasyon ile */}
            <span style={getScaledStyle}>
              {renderAnimatedText(displayText)}
            </span>
          </div>
        )}
        
        {/* İkincil altyazı (çeviri) - ayrı container, animasyon YOK */}
        {settings?.dualSubtitleEnabled && activeSecondarySubtitle?.translatedText && (
          <div 
            className="frame-subtitle secondary-subtitle"
            style={{
              // İkincil altyazı pozisyonu
              top: (secondarySubtitle?.style?.alignment || 5) >= 7 ? 
                `${8 + (secondarySubtitle?.style?.offsetY || 0) * 0.5}%` : 
                (secondarySubtitle?.style?.alignment || 5) >= 4 ? 
                `${42 + (secondarySubtitle?.style?.offsetY || 0) * 0.5}%` : 'auto',
              bottom: (secondarySubtitle?.style?.alignment || 5) <= 3 ? 
                `${Math.max(4, (secondarySubtitle?.style?.marginVertical || 120) * scaleFactor) - (secondarySubtitle?.style?.offsetY || 0) * 2}px` : 'auto',
              left: `${5 + (secondarySubtitle?.style?.offsetX || 0) * 0.5}%`,
              right: `${5 - (secondarySubtitle?.style?.offsetX || 0) * 0.5}%`,
              justifyContent: ((secondarySubtitle?.style?.alignment || 5) % 3) === 1 ? 'flex-start' : 
                             ((secondarySubtitle?.style?.alignment || 5) % 3) === 0 ? 'flex-end' : 'center',
              alignItems: 'center',
              display: 'flex',
            }}
          >
            {/* İkincil altyazı metni - DEBUG EKLİ */}
            <span style={{
              fontFamily: secondarySubtitle?.style?.fontName || 'Arial',
              fontSize: Math.max(5, (secondarySubtitle?.style?.fontSize || 36) * scaleFactor * 0.8),
              color: secondarySubtitle?.style?.color || '#FFFF00',
              fontWeight: secondarySubtitle?.style?.bold ? 'bold' : 'normal',
              fontStyle: secondarySubtitle?.style?.italic ? 'italic' : 'normal',
              textShadow: `${Math.max(0.5, (secondarySubtitle?.style?.shadowDepth || 1) * scaleFactor)}px ${Math.max(0.5, (secondarySubtitle?.style?.shadowDepth || 1) * scaleFactor)}px ${Math.max(1, (secondarySubtitle?.style?.shadowDepth || 1) * 2 * scaleFactor)}px rgba(0,0,0,0.9)`,
              WebkitTextStroke: `${Math.max(0.2, (secondarySubtitle?.style?.borderWidth || 2) * scaleFactor)}px ${secondarySubtitle?.style?.borderColor || '#000000'}`,
              paintOrder: 'stroke fill',
              textAlign: 'center',
              lineHeight: 1.2,
              maxWidth: '90%',
            }}>
              {console.log('[PreviewPanel] DEBUG:', {
                activeSecondarySubtitle,
                translatedText: activeSecondarySubtitle.translatedText,
                originalText: activeSecondarySubtitle.text,
                hasTranslation: !!activeSecondarySubtitle.translatedText
              })}
              {activeSecondarySubtitle.translatedText || `[ÇEVİRİ YOK: ${activeSecondarySubtitle.text}]`}
            </span>
          </div>
        )}
      </div>

      {/* Info Panel */}
      <div className="preview-info">
        <div className="info-row">
          <span className="info-key">Font:</span>
          <span className="info-val" style={{ fontFamily: style.fontName }}>{style.fontName}</span>
        </div>
        <div className="info-row">
          <span className="info-key">Boyut:</span>
          <span className="info-val highlight">{style.fontSize}px</span>
        </div>
        <div className="info-row">
          <span className="info-key">Animasyon:</span>
          <span className={`info-val animation-badge ${animation.type}`}>
            {animation.type === 'karaoke' ? '🎤 Karaoke' : 
             animation.type === 'fade' ? '✨ Fade' :
             animation.type === 'pop' ? '💥 Pop' :
             animation.type === 'typewriter' ? '⌨️ Typewriter' : '—'}
          </span>
        </div>
        <div className="info-row colors">
          <span className="color-dot" style={{ background: style.color }} title={`Metin: ${style.color}`} />
          <span className="color-dot border" style={{ background: style.borderColor }} title={`Kenarlık: ${style.borderColor}`} />
          {animation.type === 'karaoke' && (
            <span className="color-dot karaoke" style={{ background: animation.highlightColor }} title={`Karaoke: ${animation.highlightColor}`} />
          )}
        </div>
      </div>

      {/* Playback Info */}
      <div className="preview-playback-info">
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
    </>
  );

  // FULLSCREEN OVERLAY - pure output, no UI chrome
  if (isFullscreen) {
    return (
      <div
        className="preview-fullscreen-overlay"
        onDoubleClick={() => setIsFullscreen(false)}
      >
        {/* Close button - auto-hides */}
        <button
          className="preview-fullscreen-close"
          onClick={() => setIsFullscreen(false)}
          title="Kapat (ESC)"
        >
          <FiX size={18} />
        </button>

        {/* Pure video frame - fills screen */}
        <div
          className="preview-frame fullscreen-frame"
          style={{
            width: fsWidth,
            height: fsHeight,
            backgroundColor: background.type === 'color' ? background.value :
                            background.type === 'transparent' ? '#000' : '#000',
            backgroundImage: background.type === 'image' && background.imagePath
              ? `url(${getImageUrl(background.imagePath)})`
              : background.type === 'transparent'
              ? 'repeating-conic-gradient(#808080 0% 25%, #404040 0% 50%)'
              : 'none',
            backgroundSize: background.type === 'image' || background.type === 'transparent' ? 'cover' : 'auto',
            backgroundPosition: background.type === 'image' || background.type === 'transparent' ? 'center' : 'initial',
            backgroundRepeat: background.type === 'transparent' ? 'repeat' : 'no-repeat',
            position: 'relative',
            cursor: 'default',
          }}
        >
          {/* Visualizer — reuse singleton, CSS scaled */}
          {visualizer.enabled && (
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              opacity: visualizer.opacity,
              zIndex: 1,
              pointerEvents: 'none',
              background: `var(--visualizer-bg, transparent)`,
            }}>
              <ButterchurnCanvas
                width={Math.round(fsWidth)}
                height={Math.round(fsHeight)}
                audioElement={globalAudioRef?.current ?? null}
                presetName={visualizer.presetName}
                sensitivity={visualizer.sensitivity}
              />
            </div>
          )}

          {/* Logo */}
          <LogoOverlay containerRef={previewFrameRef} scaleFactor={fsScaleFactor} />

          {/* Subtitle */}
          {displayText && (
            <div
              className={`frame-subtitle ${animation.type}-mode`}
              style={{
                top: style.alignment >= 7 ? '8%' : style.alignment >= 4 ? '42%' : 'auto',
                bottom: style.alignment <= 3 ? `${Math.max(4, style.marginVertical * fsScaleFactor)}px` : 'auto',
                left: '5%',
                right: '5%',
                justifyContent: style.alignment % 3 === 1 ? 'flex-start' : style.alignment % 3 === 0 ? 'flex-end' : 'center',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                ...getSubtitleAnimationStyle(),
              }}
            >
              <span style={fsScaledStyle}>
                {renderAnimatedText(displayText)}
              </span>
            </div>
          )}

          {/* Secondary subtitle */}
          {settings?.dualSubtitleEnabled && activeSecondarySubtitle?.translatedText && (
            <div
              className="frame-subtitle secondary-subtitle"
              style={{
                top: (secondarySubtitle?.style?.alignment || 5) >= 7 ?
                  `${8 + (secondarySubtitle?.style?.offsetY || 0) * 0.5}%` :
                  (secondarySubtitle?.style?.alignment || 5) >= 4 ?
                  `${42 + (secondarySubtitle?.style?.offsetY || 0) * 0.5}%` : 'auto',
                bottom: (secondarySubtitle?.style?.alignment || 5) <= 3 ?
                  `${Math.max(4, (secondarySubtitle?.style?.marginVertical || 120) * fsScaleFactor) - (secondarySubtitle?.style?.offsetY || 0) * 2}px` : 'auto',
                left: `${5 + (secondarySubtitle?.style?.offsetX || 0) * 0.5}%`,
                right: `${5 - (secondarySubtitle?.style?.offsetX || 0) * 0.5}%`,
                justifyContent: ((secondarySubtitle?.style?.alignment || 5) % 3) === 1 ? 'flex-start' :
                               ((secondarySubtitle?.style?.alignment || 5) % 3) === 0 ? 'flex-end' : 'center',
                alignItems: 'center',
                display: 'flex',
              }}
            >
              <span style={{
                fontFamily: secondarySubtitle?.style?.fontName || 'Arial',
                fontSize: Math.max(5, (secondarySubtitle?.style?.fontSize || 36) * fsScaleFactor * 0.8),
                color: secondarySubtitle?.style?.color || '#FFFF00',
                fontWeight: secondarySubtitle?.style?.bold ? 'bold' : 'normal',
                fontStyle: secondarySubtitle?.style?.italic ? 'italic' : 'normal',
                textShadow: `${Math.max(0.5, (secondarySubtitle?.style?.shadowDepth || 1) * fsScaleFactor)}px ${Math.max(0.5, (secondarySubtitle?.style?.shadowDepth || 1) * fsScaleFactor)}px ${Math.max(1, (secondarySubtitle?.style?.shadowDepth || 1) * 2 * fsScaleFactor)}px rgba(0,0,0,0.9)`,
                WebkitTextStroke: `${Math.max(0.2, (secondarySubtitle?.style?.borderWidth || 2) * fsScaleFactor)}px ${secondarySubtitle?.style?.borderColor || '#000000'}`,
                paintOrder: 'stroke fill',
                textAlign: 'center',
                lineHeight: 1.2,
                maxWidth: '90%',
              }}>
                {activeSecondarySubtitle.translatedText}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // DOCKED MODE
  if (previewMode === 'docked') {
    return (
      <div 
        className="preview-panel docked"
        style={{ width: panelWidth }}
      >
        {/* Resize Handle */}
        <div 
          className="preview-resize-handle"
          onMouseDown={handleResizeStart}
          title="Sürükleyerek boyutlandır"
        >
          <FiMoreVertical size={12} />
        </div>
        
        <div className="preview-header">
          <span className="preview-title">
            <FiEye size={12} />
            Canlı Önizleme
          </span>
          <div className="preview-actions">
            <button
              onClick={toggleFullscreen}
              title="Tam ekran"
            >
              <FiMaximize size={12} />
            </button>
            <button
              onClick={() => setPreviewMode('floating')}
              title="Taşınabilir moda geç"
            >
              <FiExternalLink size={12} />
            </button>
          </div>
        </div>
        <div className="preview-content">
          {previewContent}
        </div>
      </div>
    );
  }

  // FLOATING MODE
  return (
    <div 
      ref={containerRef}
      className={`preview-panel floating ${isMinimized ? 'minimized' : ''}`}
      style={{ 
        width: floatingSize.width, 
        height: isMinimized ? 'auto' : floatingSize.height 
      }}
    >
      {/* Resize handles */}
      <div className="floating-resize-handle n" onMouseDown={(e) => handleFloatingResizeStart(e, 'n')} />
      <div className="floating-resize-handle s" onMouseDown={(e) => handleFloatingResizeStart(e, 's')} />
      <div className="floating-resize-handle e" onMouseDown={(e) => handleFloatingResizeStart(e, 'e')} />
      <div className="floating-resize-handle w" onMouseDown={(e) => handleFloatingResizeStart(e, 'w')} />
      <div className="floating-resize-handle nw" onMouseDown={(e) => handleFloatingResizeStart(e, 'nw')} />
      <div className="floating-resize-handle ne" onMouseDown={(e) => handleFloatingResizeStart(e, 'ne')} />
      <div className="floating-resize-handle sw" onMouseDown={(e) => handleFloatingResizeStart(e, 'sw')} />
      <div className="floating-resize-handle se" onMouseDown={(e) => handleFloatingResizeStart(e, 'se')} />
      
      <div className="preview-header" onMouseDown={handleMouseDown}>
        <span className="preview-title">
          <FiMove size={12} className="drag-icon" />
          Canlı Önizleme
        </span>
        <div className="preview-actions">
          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Genişlet' : 'Daralt'}
          >
            {isMinimized ? <FiMaximize2 size={10} /> : <FiMinimize2 size={10} />}
          </button>
          <button
            onClick={toggleFullscreen}
            title="Tam ekran"
          >
            <FiMaximize size={10} />
          </button>
          <button
            onClick={() => setPreviewMode('docked')}
            title="Panele sabitle"
          >
            <FiSidebar size={12} />
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
        <div className="preview-content">
          {previewContent}
        </div>
      )}
    </div>
  );
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default PreviewPanel;
