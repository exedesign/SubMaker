import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import {
  FiEye, FiEyeOff, FiMinimize2, FiMaximize2, FiMove,
  FiExternalLink, FiSidebar, FiX, FiMaximize,
  FiChevronDown, FiChevronRight, FiMenu
} from 'react-icons/fi';
import LogoOverlay from './LogoOverlay';
import ButterchurnCanvas from './ButterchurnCanvas';
import AnimationSelector from './AnimationSelector';
import BackgroundSelector from './BackgroundSelector';
import FormatSelector from './FormatSelector';

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
 * PreviewPanel - Dual mode live preview
 * - Docked Mode: Fixed in right panel, resizable
 * - Floating Mode: Draggable window
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
  const [panelWidth, setPanelWidth] = useState(300); // Docked panel width
  const [collapsedSections, setCollapsedSections] = useState({ format: true, background: true, animation: true });

  // Derive actual audio element reactively — globalAudioRef.current changes
  // silently (ref mutation), so we use playbackTime/isPlaying as triggers
  // to re-evaluate the ref on each render
  const audioElementForViz = globalAudioRef?.current ?? null;

  // Collapsible section definitions
  const PREVIEW_SECTIONS_DEF = [
    { id: 'format', title: 'Video Format', Component: FormatSelector },
    { id: 'background', title: 'Background', Component: BackgroundSelector },
    { id: 'animation', title: 'Animation', Component: AnimationSelector },
  ];
  const PREVIEW_DEFAULT_ORDER = PREVIEW_SECTIONS_DEF.map(s => s.id);
  const PREVIEW_ORDER_KEY = 'submaker-preview-order';
  const PREVIEW_COLLAPSED_KEY = 'submaker-preview-collapsed';

  // Section order state (drag reorder)
  const [previewSectionOrder, setPreviewSectionOrder] = useState(() => {
    try {
      const saved = localStorage.getItem(PREVIEW_ORDER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === PREVIEW_DEFAULT_ORDER.length &&
            PREVIEW_DEFAULT_ORDER.every(id => parsed.includes(id))) {
          return parsed;
        }
      }
    } catch {}
    return PREVIEW_DEFAULT_ORDER;
  });
  const [sectionDraggedId, setSectionDraggedId] = useState(null);
  const [sectionDragOverId, setSectionDragOverId] = useState(null);

  // Persist collapsed state
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PREVIEW_COLLAPSED_KEY);
      if (saved) setCollapsedSections(JSON.parse(saved));
    } catch {}
  }, []);

  const toggleSection = (key) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(PREVIEW_COLLAPSED_KEY, JSON.stringify(next));
      return next;
    });
  };

  // Section drag handlers
  const handleSectionDragStart = useCallback((e, id) => {
    setSectionDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    if (e.currentTarget) e.currentTarget.style.opacity = '0.5';
  }, []);

  const handleSectionDragEnd = useCallback((e) => {
    if (e.currentTarget) e.currentTarget.style.opacity = '1';
    setSectionDraggedId(null);
    setSectionDragOverId(null);
  }, []);

  const handleSectionDragOver = useCallback((e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== sectionDragOverId) setSectionDragOverId(id);
  }, [sectionDragOverId]);

  const handleSectionDrop = useCallback((e, targetId) => {
    e.preventDefault();
    const sourceId = sectionDraggedId;
    if (!sourceId || sourceId === targetId) {
      setSectionDraggedId(null);
      setSectionDragOverId(null);
      return;
    }
    setPreviewSectionOrder(prev => {
      const newOrder = [...prev];
      const srcIdx = newOrder.indexOf(sourceId);
      const tgtIdx = newOrder.indexOf(targetId);
      if (srcIdx === -1 || tgtIdx === -1) return prev;
      newOrder.splice(srcIdx, 1);
      newOrder.splice(tgtIdx, 0, sourceId);
      localStorage.setItem(PREVIEW_ORDER_KEY, JSON.stringify(newOrder));
      return newOrder;
    });
    setSectionDraggedId(null);
    setSectionDragOverId(null);
  }, [sectionDraggedId]);

  // Build ordered sections
  const previewSectionMap = {};
  PREVIEW_SECTIONS_DEF.forEach(s => { previewSectionMap[s.id] = s; });
  const orderedPreviewSections = previewSectionOrder.map(id => previewSectionMap[id]).filter(Boolean);

  // Floating mode dimensions
  const [floatingSize, setFloatingSize] = useState({ width: 300, height: 400 });
  
  // Drag state for floating mode
  const containerRef = useRef(null);
  const previewFrameRef = useRef(null);
  const fullscreenRef = useRef(null);
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
  
  // Resize handler for floating mode (edges and corners)
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

  // Fullscreen toggle — uses native Fullscreen API for true OS-level fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!isFullscreen) {
      setIsFullscreen(true);
    } else {
      // Exit via state; native exit handled by fullscreenchange listener
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  }, [isFullscreen]);

  // Request native fullscreen when our state goes true
  useEffect(() => {
    if (isFullscreen && fullscreenRef.current) {
      fullscreenRef.current.requestFullscreen().catch(() => {
        // Fallback: still show the overlay even if native FS is denied
      });
    }
  }, [isFullscreen]);

  // Sync state when user exits native fullscreen via Escape / F11
  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, [isFullscreen]);

  // Format bilgileri
  const formatInfo = useMemo(() => ({
    width: videoFormat === 'vertical' ? 1080 : videoFormat === 'square' ? 1080 : 1920,
    height: videoFormat === 'vertical' ? 1920 : videoFormat === 'square' ? 1080 : 1080,
    aspectRatio: videoFormat === 'vertical' ? '9:16' : videoFormat === 'square' ? '1:1' : '16:9',
  }), [videoFormat]);

  // Preview dimensions - dynamic based on panel width
  const previewDimensions = useMemo(() => {
    // Calculate available width by mode
    let availableWidth;
    if (previewMode === 'docked') {
      availableWidth = panelWidth - 40; // For padding
    } else {
      availableWidth = floatingSize.width - 40; // Floating mode padding
    }
    
    let baseWidth = availableWidth;
    
    // Adjust by format - scale for vertical and square
    if (videoFormat === 'vertical') {
      baseWidth = Math.min(availableWidth * 0.6, availableWidth - 20);
    } else if (videoFormat === 'square') {
      baseWidth = Math.min(availableWidth * 0.85, availableWidth - 20);
    }
    
    const height = baseWidth * (formatInfo.height / formatInfo.width);
    const scaleFactor = baseWidth / formatInfo.width;
    
    return { width: baseWidth, height, scaleFactor };
  }, [previewMode, panelWidth, floatingSize.width, videoFormat, formatInfo]);

  // Fullscreen dimensions — recalculate on screen/window resize
  const [screenSize, setScreenSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setScreenSize({ w: screen.width || window.innerWidth, h: screen.height || window.innerHeight });
    window.addEventListener('resize', onResize);
    // Also update when entering fullscreen (screen dimensions may differ)
    document.addEventListener('fullscreenchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onResize);
    };
  }, []);

  const fullscreenDimensions = useMemo(() => {
    const screenW = isFullscreen ? (screen.width || screenSize.w) : screenSize.w;
    const screenH = isFullscreen ? (screen.height || screenSize.h) : screenSize.h;
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
  }, [formatInfo, isFullscreen, screenSize]);

  const { width: previewWidth, height: previewHeight, scaleFactor } = previewDimensions;
  const { width: fsWidth, height: fsHeight, scaleFactor: fsScaleFactor } = fullscreenDimensions;

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

  // Active subtitle - only one at a time, precisely timed
  const activeSubtitle = useMemo(() => {
    if (!subtitles.length) return null;

    // playbackTime >= start AND playbackTime < end (end excluded to prevent overlap)
    const active = subtitles.find(sub => 
      playbackTime >= sub.start && playbackTime < sub.end
    );
    
    return active || null;
  }, [subtitles, playbackTime]);

  // Active secondary subtitle (translation) - same time-based logic
  const activeSecondarySubtitle = useMemo(() => {
    if (!settings?.dualSubtitleEnabled) return null;
    if (!secondarySubtitle?.subtitles?.length) return null;

    // Secondary subtitle lookup by playbackTime
    const activeSecondary = secondarySubtitle.subtitles.find(sub => 
      playbackTime >= sub.start && playbackTime < sub.end
    );
    
    return activeSecondary || null;
  }, [secondarySubtitle?.subtitles, playbackTime, settings?.dualSubtitleEnabled]);

  // Animation progress
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

  // Display text - only show when there is an active subtitle
  const displayText = useMemo(() => {
    if (activeSubtitle) {
      const text = activeSubtitle.text;
      return text.length > 60 ? text.substring(0, 60) + '...' : text;
    }
    return null; // Return null when no active subtitle
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

  // Only show live preview once the app has moved beyond transcription.
  if (!mediaFile || !['edit', 'style', 'render'].includes(currentStep)) {
    return null;
  }

  // Hidden state toggle button (floating only)
  if (!isVisible && previewMode === 'floating') {
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

  // Preview content (shared between modes)
  const previewContent = (
    <>
      {/* Video Frame */}
      <div className="preview-frame-wrapper">
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
              audioElement={audioElementForViz}
              presetName={visualizer.presetName}
              sensitivity={visualizer.sensitivity}
            />
          </div>
        )}

        <div className="frame-format-badge">{formatInfo.aspectRatio}</div>
        <div className="frame-safe-area" />

        {/* Logo Overlay */}
        <LogoOverlay containerRef={previewFrameRef} scaleFactor={scaleFactor} />
        
        {/* Only show when there is an active subtitle */}
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
            {/* Main subtitle - with animation */}
            <span style={getScaledStyle}>
              {renderAnimatedText(displayText)}
            </span>
          </div>
        )}
        
        {/* Secondary subtitle (translation) - separate container, NO animation */}
        {settings?.dualSubtitleEnabled && activeSecondarySubtitle?.translatedText && (
          <div 
            className="frame-subtitle secondary-subtitle"
            style={{
              // Secondary subtitle position
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
            {/* Secondary subtitle text */}
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
              {activeSecondarySubtitle.translatedText || `[NO TRANSLATION: ${activeSecondarySubtitle.text}]`}
            </span>
          </div>
        )}
      </div>
      </div>

      {/* Settings Sections — collapsible + draggable (same as Sidebar) */}
      {orderedPreviewSections.map(({ id, title, Component }) => {
        const isDragging = sectionDraggedId === id;
        const isDragOver = sectionDragOverId === id && sectionDraggedId !== id;
        const isCollapsed = !!collapsedSections[id];

        return (
          <div
            key={id}
            className={`sidebar-section${isDragging ? ' dragging' : ''}${isDragOver ? ' drag-over' : ''}${isCollapsed ? ' collapsed' : ''}`}
            draggable
            onDragStart={(e) => handleSectionDragStart(e, id)}
            onDragEnd={handleSectionDragEnd}
            onDragOver={(e) => handleSectionDragOver(e, id)}
            onDrop={(e) => handleSectionDrop(e, id)}
          >
            <h3
              className="sidebar-section-title"
              onClick={() => toggleSection(id)}
            >
              <span
                className="sidebar-drag-handle"
                title="Drag to reorder"
                onClick={(e) => e.stopPropagation()}
              >
                <FiMenu size={12} />
              </span>
              <span className="sidebar-section-label">{title}</span>
              <span className="sidebar-collapse-icon">
                {isCollapsed ? <FiChevronRight size={14} /> : <FiChevronDown size={14} />}
              </span>
            </h3>
            {!isCollapsed && (
              <div className="sidebar-section-body">
                <Component />
              </div>
            )}
          </div>
        );
      })}

      {/* Render Butonu — sağ panelde */}
      {subtitles.length > 0 && (
        <button
          className="btn btn-primary"
          onClick={() => useAppStore.getState().render()}
          disabled={subtitles.length === 0}
          style={{ width: '100%', padding: '8px 12px', fontSize: 13 }}
        >
          🎬 Render Video
        </button>
      )}
    </>
  );

  // FULLSCREEN OVERLAY - pure output, no UI chrome
  if (isFullscreen) {
    return (
      <div
        ref={fullscreenRef}
        className="preview-fullscreen-overlay"
        onDoubleClick={() => {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
          setIsFullscreen(false);
        }}
      >
        {/* Close button - auto-hides */}
        <button
          className="preview-fullscreen-close"
          onClick={() => {
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => {});
            }
            setIsFullscreen(false);
          }}
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
                audioElement={audioElementForViz}
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
          title="Drag to resize"
        />
        
        <div className="preview-header">
          <span className="preview-title">
            <FiEye size={12} />
            Live Preview
          </span>
          <div className="preview-actions">
            <button
              onClick={toggleFullscreen}
              title="Fullscreen"
            >
              <FiMaximize size={12} />
            </button>
            <button
              onClick={() => setPreviewMode('floating')}
              title="Switch to floating mode"
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
          Live Preview
        </span>
        <div className="preview-actions">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Expand' : 'Collapse'}
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
