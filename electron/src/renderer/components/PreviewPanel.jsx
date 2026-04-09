import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import {
  FiEye, FiEyeOff, FiMinimize2, FiMaximize2, FiMove,
  FiExternalLink, FiSidebar, FiX, FiMaximize,
  FiChevronDown, FiChevronRight, FiMenu, FiMonitor
} from 'react-icons/fi';
import LogoOverlay from './LogoOverlay';
import ButterchurnCanvas from './ButterchurnCanvas';
import AnimationSelector from './AnimationSelector';
import BackgroundSelector from './BackgroundSelector';
import FormatSelector from './FormatSelector';
import PlaylistPanel from './PlaylistPanel';
import BatchPanel from './BatchPanel';
import CoverArtPanel from './CoverArtPanel';

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
    logos,
    settings,
    secondarySubtitle,
    visualizer,
    globalAudioRef,
    cycleVisualizerPreset,
    playlist,
    isProcessing,
    detectedLanguage,
    rightPanelTab,
    setRightPanelTab,
  } = useAppStore();

  // RTL language detection
  const RTL_LANGS = ['ar', 'fa', 'he', 'ur', 'ps', 'sd', 'yi'];
  const isRtl = RTL_LANGS.includes(detectedLanguage);

  // When playlist is active, use playlist's time & subtitles for karaoke display
  const effectivePlaybackTime = playlist.isActive ? playlist.playbackTime : playbackTime;
  const effectiveSubtitles = playlist.isActive && playlist.currentTrackIndex >= 0
    ? (playlist.tracks[playlist.currentTrackIndex]?.subtitles || [])
    : subtitles;

  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSecondDisplayOpen, setIsSecondDisplayOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(300); // Docked panel width
  const [collapsedSections, setCollapsedSections] = useState({ format: true, background: true, animation: true });

  // Visualizer reinit key — increments when render completes so ButterchurnCanvas remounts
  const [vizVersion, setVizVersion] = useState(0);
  const prevProcessingRef = useRef(false);
  useEffect(() => {
    if (prevProcessingRef.current && !isProcessing) {
      // Render just finished → force visualizer remount to reinitialize
      setVizVersion(v => v + 1);
    }
    prevProcessingRef.current = isProcessing;
  }, [isProcessing]);

  // Derive actual audio element reactively — globalAudioRef.current changes
  // silently (ref mutation), so we use playbackTime/isPlaying as triggers
  // to re-evaluate the ref on each render
  const audioElementForViz = globalAudioRef?.current ?? null;

  // Collapsible section definitions
  const PREVIEW_SECTIONS_DEF = [
    { id: 'format', title: 'Video Format', Component: FormatSelector },
    { id: 'background', title: 'Background', Component: BackgroundSelector },
    { id: 'animation', title: 'Animation', Component: AnimationSelector },
    { id: 'playlist', title: 'Playlist', Component: PlaylistPanel },
    { id: 'batch', title: 'Batch', Component: BatchPanel },
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

  // ArrowUp/ArrowDown to cycle visualizer presets when visualizer is enabled
  useEffect(() => {
    if (!visualizer.enabled) return;
    const handleKeyDown = (e) => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        cycleVisualizerPreset(-1);
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        cycleVisualizerPreset(1);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visualizer.enabled, cycleVisualizerPreset]);

  // Mouse wheel to cycle visualizer presets on preview frame
  useEffect(() => {
    if (!visualizer.enabled) return;
    const el = previewFrameRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault();
      cycleVisualizerPreset(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [visualizer.enabled, cycleVisualizerPreset]);

  // Open preview on second display
  const handleOpenSecondScreen = useCallback(async () => {
    if (window.electronAPI?.openPreviewOnSecondDisplay) {
      const result = await window.electronAPI.openPreviewOnSecondDisplay();
      if (result?.error === 'no_second_display') {
        alert('Second display not found. Please connect another monitor.');
      } else if (result?.success) {
        setIsSecondDisplayOpen(true);
      }
    } else {
      const url = window.location.origin + window.location.pathname + '?previewScreen=1';
      window.open(url, '_blank', 'width=1280,height=720');
      setIsSecondDisplayOpen(true);
    }
  }, []);

  // Track second display window open/close
  useEffect(() => {
    if (!window.electronAPI) return;
    const onOpened = () => setIsSecondDisplayOpen(true);
    const onClosed = () => setIsSecondDisplayOpen(false);
    window.electronAPI.onPreviewWindowOpened?.(onOpened);
    window.electronAPI.onPreviewWindowClosed?.(onClosed);
    return () => {
      window.electronAPI.offPreviewWindowOpened?.(onOpened);
      window.electronAPI.offPreviewWindowClosed?.(onClosed);
    };
  }, []);

  // Format info — fixed 1080p reference coordinate system.
  // ASS PlayRes uses the same values; auto-scales to actual render resolution.
  const formatInfo = useMemo(() => {
    const REF = { horizontal: { w: 1920, h: 1080 }, vertical: { w: 1080, h: 1920 }, square: { w: 1080, h: 1080 } };
    const fmt = REF[videoFormat] || REF.horizontal;
    return {
      width: fmt.w,
      height: fmt.h,
      aspectRatio: videoFormat === 'vertical' ? '9:16' : videoFormat === 'square' ? '1:1' : '16:9',
    };
  }, [videoFormat]);

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
    wordWrap: 'break-word',
  }), [style, scaleFactor]);

  // Active subtitle - only one at a time, precisely timed
  const activeSubtitle = useMemo(() => {
    if (!effectiveSubtitles.length) return null;

    // playbackTime >= start AND playbackTime < end (end excluded to prevent overlap)
    const active = effectiveSubtitles.find(sub => 
      effectivePlaybackTime >= sub.start && effectivePlaybackTime < sub.end
    );
    
    return active || null;
  }, [effectiveSubtitles, effectivePlaybackTime]);

  // Active secondary subtitle (translation) - same time-based logic
  const activeSecondarySubtitle = useMemo(() => {
    if (!settings?.dualSubtitleEnabled) return null;
    if (!secondarySubtitle?.subtitles?.length) return null;

    // Secondary subtitle lookup by playbackTime
    const activeSecondary = secondarySubtitle.subtitles.find(sub => 
      effectivePlaybackTime >= sub.start && effectivePlaybackTime < sub.end
    );
    
    return activeSecondary || null;
  }, [secondarySubtitle?.subtitles, effectivePlaybackTime, settings?.dualSubtitleEnabled]);

  // Animation progress — word-accurate for karaoke
  const animationProgress = useMemo(() => {
    if (!activeSubtitle) return { progress: 0, phase: 'none' };
    
    const duration = activeSubtitle.end - activeSubtitle.start;
    const elapsed = effectivePlaybackTime - activeSubtitle.start;
    
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
        
        // Find word position in text
        const idx = fullText.indexOf(wordText, textPos);
        if (idx === -1) continue;
        
        if (effectivePlaybackTime >= w.end) {
          // Word fully spoken
          highlightedChars = idx + wordText.length;
          textPos = highlightedChars;
        } else if (effectivePlaybackTime >= w.start) {
          // Currently speaking — sweep within word
          const wordProgress = (effectivePlaybackTime - w.start) / Math.max(0.01, w.end - w.start);
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
    
    const fadeInDuration = animation.fadeIn / 1000;
    const fadeOutDuration = animation.fadeOut / 1000;
    
    let opacity = 1;
    if (elapsed < fadeInDuration) {
      opacity = elapsed / fadeInDuration;
    } else if (effectivePlaybackTime > activeSubtitle.end - fadeOutDuration) {
      opacity = (activeSubtitle.end - effectivePlaybackTime) / fadeOutDuration;
    }
    
    return { progress, opacity: Math.max(0, Math.min(1, opacity)), elapsed, duration };
  }, [activeSubtitle, effectivePlaybackTime, animation.fadeIn, animation.fadeOut, animation.type]);

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
    wordWrap: 'break-word',
  }), [style, fsScaleFactor]);

  // BroadcastChannel — sync preview state to second display window
  // Must be after displayText, formatInfo, animationProgress, activeSecondarySubtitle are all defined
  useEffect(() => {
    let channel;
    try { channel = new BroadcastChannel('submaker-preview-sync'); } catch { return; }
    const buildState = () => ({
      type: 'PREVIEW_STATE',
      displayText,
      style: {
        fontName: style.fontName,
        fontSize: style.fontSize,
        color: style.color,
        bold: style.bold,
        italic: style.italic,
        shadowDepth: style.shadowDepth,
        borderWidth: style.borderWidth,
        borderColor: style.borderColor,
        alignment: style.alignment,
        marginVertical: style.marginVertical,
        offsetX: style.offsetX || 0,
        offsetY: style.offsetY || 0,
      },
      background,
      animation: { type: animation.type, highlightColor: animation.highlightColor },
      animationProgress: animationProgress.progress,
      isRtl,
      fmtWidth: formatInfo.width,
      fmtHeight: formatInfo.height,
      secondaryText: settings?.dualSubtitleEnabled ? (activeSecondarySubtitle?.translatedText || null) : null,
      secondaryStyle: secondarySubtitle?.style || null,
      visualizer: {
        enabled: visualizer.enabled,
        presetName: visualizer.presetName,
        opacity: visualizer.opacity,
        sensitivity: visualizer.sensitivity,
      },
      logos: (logos || []).filter(l => l.enabled && l.imageData).map(l => ({
        id: l.id,
        imageData: l.imageData,
        position: l.position,
        size: l.size,
        opacity: l.opacity,
      })),
    });
    const state = buildState();
    channel.postMessage(state);
    try { localStorage.setItem('submaker-preview-state', JSON.stringify(state)); } catch {}
    return () => channel.close();
  }, [displayText, style, background, animation, animationProgress.progress, formatInfo, settings?.dualSubtitleEnabled, activeSecondarySubtitle?.translatedText, secondarySubtitle?.style, visualizer.enabled, visualizer.presetName, visualizer.opacity, visualizer.sensitivity, logos]);

  // When preview window asks for immediate state (on mount), broadcast right away
  useEffect(() => {
    if (!window.electronAPI?.onPreviewBroadcastNow) return;
    const handler = () => {
      let channel;
      try { channel = new BroadcastChannel('submaker-preview-sync'); } catch { return; }
      // Read latest state at call time (not stale closure)
      const s = useAppStore.getState();
      const vf = s.videoFormat || 'horizontal';
      const REF = { horizontal: { w: 1920, h: 1080 }, vertical: { w: 1080, h: 1920 }, square: { w: 1080, h: 1080 } };
      const rp = REF[vf] || REF.horizontal;
      const fmt = { width: rp.w, height: rp.h };
      const secSub = s.settings?.dualSubtitleEnabled ? s.secondarySubtitle : null;
      const state = {
        type: 'PREVIEW_STATE',
        displayText: s.subtitles?.length ? s.subtitles[0]?.text : '',
        style: {
          fontName: s.style.fontName, fontSize: s.style.fontSize, color: s.style.color,
          bold: s.style.bold, italic: s.style.italic, shadowDepth: s.style.shadowDepth,
          borderWidth: s.style.borderWidth, borderColor: s.style.borderColor,
          alignment: s.style.alignment, marginVertical: s.style.marginVertical,
          offsetX: s.style.offsetX || 0, offsetY: s.style.offsetY || 0,
        },
        background: s.background,
        animation: { type: s.animation.type, highlightColor: s.animation.highlightColor },
        animationProgress: 0,
        isRtl: ['ar', 'fa', 'he', 'ur', 'ps', 'sd', 'yi'].includes(s.detectedLanguage),
        fmtWidth: fmt.width, fmtHeight: fmt.height,
        secondaryText: secSub?.subtitles?.[0]?.translatedText || null,
        secondaryStyle: secSub?.style || null,
        visualizer: {
          enabled: s.visualizer.enabled,
          presetName: s.visualizer.presetName,
          opacity: s.visualizer.opacity,
          sensitivity: s.visualizer.sensitivity,
        },
        logos: (s.logos || []).filter(l => l.enabled && l.imageData).map(l => ({
          id: l.id,
          imageData: l.imageData,
          position: l.position,
          size: l.size,
          opacity: l.opacity,
        })),
      };
      channel.postMessage(state);
      try { localStorage.setItem('submaker-preview-state', JSON.stringify(state)); } catch {}
      channel.close();
    };
    window.electronAPI.onPreviewBroadcastNow(handler);
    return () => window.electronAPI.offPreviewBroadcastNow?.(handler);
  }, []); // Mount-only — handler reads fresh state via getState()

  // Only show live preview when media is loaded or playlist has tracks
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
        {/* Butterchurn Visualizer Overlay — stays mounted during render (freezes when GPU freed for export, reinits after) */}
        {visualizer.enabled && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            opacity: visualizer.opacity,
            zIndex: 1,
            pointerEvents: 'none',
          }}>
            <ButterchurnCanvas
              key={vizVersion}
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
              // ASS-matching position: alignment 7-9=top, 4-6=middle, 1-3=bottom
              top: style.alignment >= 7 ? `${Math.max(4, (style.marginVertical + (style.offsetY || 0)) * scaleFactor)}px` : style.alignment >= 4 ? '50%' : 'auto',
              bottom: style.alignment <= 3 ? `${Math.max(4, (style.marginVertical + (style.offsetY || 0)) * scaleFactor)}px` : 'auto',
              transform: style.alignment >= 4 && style.alignment <= 6 ? 'translateY(-50%)' : undefined,
              // ASS MarginL/MarginR: default 20 + offsetX
              left: `${Math.max(0, (20 + (style.offsetX || 0)) * scaleFactor)}px`,
              right: `${Math.max(0, (20 - (style.offsetX || 0)) * scaleFactor)}px`,
              flexDirection: 'column',
              alignItems: style.alignment % 3 === 1 ? 'flex-start' : style.alignment % 3 === 0 ? 'flex-end' : 'center',
              gap: '2px',
              ...getSubtitleAnimationStyle(),
            }}
          >
            {/* Main subtitle - with animation */}
            <span style={{ ...getScaledStyle, direction: isRtl ? 'rtl' : 'ltr' }}>
              {renderAnimatedText(displayText)}
            </span>
          </div>
        )}
        
        {/* Secondary subtitle (translation) - separate container, NO animation */}
        {settings?.dualSubtitleEnabled && activeSecondarySubtitle?.translatedText && (() => {
          const secAlign = secondarySubtitle?.style?.alignment || 5;
          const secMarginV = secondarySubtitle?.style?.marginVertical || 120;
          const secOffsetX = secondarySubtitle?.style?.offsetX || 0;
          const secOffsetY = secondarySubtitle?.style?.offsetY || 0;
          return (
          <div 
            className="frame-subtitle secondary-subtitle"
            style={{
              // ASS-matching position for secondary subtitle
              top: secAlign >= 7 ? `${Math.max(4, (secMarginV + secOffsetY) * scaleFactor)}px` : secAlign >= 4 ? '50%' : 'auto',
              bottom: secAlign <= 3 ? `${Math.max(4, (secMarginV + secOffsetY) * scaleFactor)}px` : 'auto',
              transform: secAlign >= 4 && secAlign <= 6 ? 'translateY(-50%)' : undefined,
              left: `${Math.max(0, (20 + secOffsetX) * scaleFactor)}px`,
              right: `${Math.max(0, (20 - secOffsetX) * scaleFactor)}px`,
              flexDirection: 'column',
              alignItems: (secAlign % 3) === 1 ? 'flex-start' : (secAlign % 3) === 0 ? 'flex-end' : 'center',
              display: 'flex',
            }}
          >
            {/* Secondary subtitle text */}
            <span style={{
              fontFamily: secondarySubtitle?.style?.fontName || 'Arial',
              fontSize: Math.max(5, (secondarySubtitle?.style?.fontSize || 36) * scaleFactor),
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
          );
        })()}
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
            onDragOver={(e) => handleSectionDragOver(e, id)}
            onDrop={(e) => handleSectionDrop(e, id)}
          >
            <h3
              className="sidebar-section-title"
              draggable
              onDragStart={(e) => handleSectionDragStart(e, id)}
              onDragEnd={handleSectionDragEnd}
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
            {/* Playlist section stays mounted even when collapsed to keep audio alive */}
            {id === 'playlist' ? (
              <div className="sidebar-section-body" style={isCollapsed ? { display: 'none' } : {}}>
                <Component />
              </div>
            ) : !isCollapsed && (
              <div className="sidebar-section-body">
                <Component />
              </div>
            )}
          </div>
        );
      })}

      {/* Render Button — right panel */}
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
        {/* PlaylistPanel hidden but mounted — keeps audio element and keyboard handlers alive in fullscreen */}
        <div style={{ display: 'none', position: 'absolute', pointerEvents: 'none' }} aria-hidden="true">
          <PlaylistPanel />
        </div>

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
          {/* Visualizer — reuse singleton, CSS scaled — stays mounted during render */}
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
                key={vizVersion}
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
                top: style.alignment >= 7 ? `${Math.max(4, (style.marginVertical + (style.offsetY || 0)) * fsScaleFactor)}px` : style.alignment >= 4 ? '50%' : 'auto',
                bottom: style.alignment <= 3 ? `${Math.max(4, (style.marginVertical + (style.offsetY || 0)) * fsScaleFactor)}px` : 'auto',
                transform: style.alignment >= 4 && style.alignment <= 6 ? 'translateY(-50%)' : undefined,
                left: `${Math.max(0, (20 + (style.offsetX || 0)) * fsScaleFactor)}px`,
                right: `${Math.max(0, (20 - (style.offsetX || 0)) * fsScaleFactor)}px`,
                justifyContent: style.alignment % 3 === 1 ? 'flex-start' : style.alignment % 3 === 0 ? 'flex-end' : 'center',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                ...getSubtitleAnimationStyle(),
              }}
            >
              <span style={{ ...fsScaledStyle, direction: isRtl ? 'rtl' : 'ltr' }}>
                {renderAnimatedText(displayText)}
              </span>
            </div>
          )}

          {/* Secondary subtitle */}
          {settings?.dualSubtitleEnabled && activeSecondarySubtitle?.translatedText && (() => {
            const secAlign = secondarySubtitle?.style?.alignment || 5;
            const secMarginV = secondarySubtitle?.style?.marginVertical || 120;
            const secOffsetX = secondarySubtitle?.style?.offsetX || 0;
            const secOffsetY = secondarySubtitle?.style?.offsetY || 0;
            return (
            <div
              className="frame-subtitle secondary-subtitle"
              style={{
                top: secAlign >= 7 ? `${Math.max(4, (secMarginV + secOffsetY) * fsScaleFactor)}px` : secAlign >= 4 ? '50%' : 'auto',
                bottom: secAlign <= 3 ? `${Math.max(4, (secMarginV + secOffsetY) * fsScaleFactor)}px` : 'auto',
                transform: secAlign >= 4 && secAlign <= 6 ? 'translateY(-50%)' : undefined,
                left: `${Math.max(0, (20 + secOffsetX) * fsScaleFactor)}px`,
                right: `${Math.max(0, (20 - secOffsetX) * fsScaleFactor)}px`,
                justifyContent: (secAlign % 3) === 1 ? 'flex-start' : (secAlign % 3) === 0 ? 'flex-end' : 'center',
                alignItems: 'center',
                display: 'flex',
              }}
            >
              <span style={{
                fontFamily: secondarySubtitle?.style?.fontName || 'Arial',
                fontSize: Math.max(5, (secondarySubtitle?.style?.fontSize || 36) * fsScaleFactor),
                color: secondarySubtitle?.style?.color || '#FFFF00',
                fontWeight: secondarySubtitle?.style?.bold ? 'bold' : 'normal',
                fontStyle: secondarySubtitle?.style?.italic ? 'italic' : 'normal',
                textShadow: (secondarySubtitle?.style?.shadowDepth ?? 1) > 0
                  ? `${Math.max(0.5, (secondarySubtitle?.style?.shadowDepth ?? 1) * fsScaleFactor)}px ${Math.max(0.5, (secondarySubtitle?.style?.shadowDepth ?? 1) * fsScaleFactor)}px ${Math.max(1, (secondarySubtitle?.style?.shadowDepth ?? 1) * 2 * fsScaleFactor)}px rgba(0,0,0,0.9)`
                  : 'none',
                WebkitTextStroke: (secondarySubtitle?.style?.borderWidth ?? 2) > 0
                  ? `${Math.max(0.2, (secondarySubtitle?.style?.borderWidth ?? 2) * fsScaleFactor)}px ${secondarySubtitle?.style?.borderColor || '#000000'}`
                  : 'none',
                paintOrder: 'stroke fill',
                textAlign: 'center',
                lineHeight: 1.2,
              }}>
                {activeSecondarySubtitle.translatedText}
              </span>
            </div>
            );
          })()}
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
          {/* Tab Switcher */}
          <div className="preview-tabs">
            <button
              className={`preview-tab ${rightPanelTab === 'preview' ? 'active' : ''}`}
              onClick={() => setRightPanelTab('preview')}
            >
              <FiEye size={11} />
              Preview
            </button>
            <button
              className={`preview-tab ${rightPanelTab === 'coverArt' ? 'active' : ''}`}
              onClick={() => setRightPanelTab('coverArt')}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              Cover Art
            </button>
          </div>
          <div className="preview-actions">
            {rightPanelTab === 'preview' && (
              <>
                <button onClick={handleOpenSecondScreen} title="Open on second display"><FiMonitor size={12} /></button>
                <button onClick={toggleFullscreen} title="Fullscreen"><FiMaximize size={12} /></button>
              </>
            )}
            <button
              onClick={() => setPreviewMode('floating')}
              title="Switch to floating mode"
            >
              <FiExternalLink size={12} />
            </button>
          </div>
        </div>
        <div className="preview-content">
          {rightPanelTab === 'coverArt' ? <CoverArtPanel /> : previewContent}
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
            onClick={handleOpenSecondScreen}
            title="Open on second display"
          >
            <FiMonitor size={10} />
          </button>
          <button
            onClick={toggleFullscreen}
            title="Fullscreen"
          >
            <FiMaximize size={10} />
          </button>
          <button
            onClick={() => setPreviewMode('docked')}
            title="Dock to panel"
          >
            <FiSidebar size={12} />
          </button>
          <button
            onClick={() => setIsVisible(false)}
            title="Hide"
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
