import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import './EnhancedSubtitleTimeline.css';

function EnhancedSubtitleTimeline({ currentTime, duration, onSeek }) {
  const { 
    subtitles, 
    selectedSubtitleId, 
    setSelectedSubtitleId, 
    updateSubtitle,
    deleteSubtitle,
    addSubtitle,
    mediaFile
  } = useAppStore();
  
  // Waveform state
  const [waveformData, setWaveformData] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
    deleteSubtitle,
    addSubtitle
  } = useAppStore();
  
  const containerRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  
  // Waveform analysis
  const analyzeWaveform = useCallback(async () => {
    if (!mediaFile || isAnalyzing) return;
    
    setIsAnalyzing(true);
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const fileBuffer = await mediaFile.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(fileBuffer);
      
      const channelData = audioBuffer.getChannelData(0);
      const samples = 200; // Number of waveform bars
      const blockSize = Math.floor(channelData.length / samples);
      const waveform = [];
      
      for (let i = 0; i < samples; i++) {
        const start = i * blockSize;
        const end = start + blockSize;
        let max = 0;
        
        for (let j = start; j < end && j < channelData.length; j++) {
          max = Math.max(max, Math.abs(channelData[j]));
        }
        
        waveform.push(max);
      }
      
      setWaveformData(waveform);
      audioContext.close();
    } catch (error) {
      console.error('Waveform analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [mediaFile, isAnalyzing]);
  
  // Draw waveform
  const drawWaveform = useCallback(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !waveformData.length) return;
    
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const waveformHeight = 80;
    
    ctx.clearRect(0, 0, width, waveformHeight);
    ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
    ctx.fillRect(0, 0, width, waveformHeight);
    
    const barWidth = width / waveformData.length;
    const maxAmplitude = Math.max(...waveformData, 0.1);
    
    ctx.fillStyle = '#e94560';
    waveformData.forEach((amplitude, i) => {
      const normalizedAmp = amplitude / maxAmplitude;
      const barHeight = normalizedAmp * (waveformHeight * 0.8);
      const x = i * barWidth;
      const y = (waveformHeight - barHeight) / 2;
      
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    });
    
    // Current time indicator
    if (currentTime && duration) {
      const progressX = (currentTime / duration) * width;
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(progressX, 0);
      ctx.lineTo(progressX, waveformHeight);
      ctx.stroke();
    }
  }, [waveformData, currentTime, duration]);
  
  // Effects
  useEffect(() => {
    if (mediaFile) {
      analyzeWaveform();
    }
  }, [mediaFile, analyzeWaveform]);
  
  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);
  
  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = waveformCanvasRef.current;
      if (canvas && containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        canvas.width = containerWidth || 800;
        canvas.height = 80;
        drawWaveform();
      }
    };
    
    // Initial setup and resize listener
    const timer = setTimeout(handleResize, 100); // Delay to ensure DOM is ready
    window.addEventListener('resize', handleResize);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [drawWaveform]);
  const waveformCanvasRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragData, setDragData] = useState(null);
  const [editingSubtitle, setEditingSubtitle] = useState(null);
  const [wordEditMode, setWordEditMode] = useState(false);
  const [hoveredSubtitle, setHoveredSubtitle] = useState(null);
  const [showControls, setShowControls] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [viewWindow, setViewWindow] = useState({ start: 0, end: 1 });
  
  // Calculate position from time
  const timeToPercent = useCallback((time) => {
    if (!duration) return 0;
    const normalizedTime = Math.max(0, Math.min(duration, time));
    const windowDuration = (viewWindow.end - viewWindow.start) * duration;
    const windowStart = viewWindow.start * duration;
    return ((normalizedTime - windowStart) / windowDuration) * 100;
  }, [duration, viewWindow]);
  
  // Calculate time from position
  const percentToTime = useCallback((percent) => {
    if (!duration) return 0;
    const windowDuration = (viewWindow.end - viewWindow.start) * duration;
    const windowStart = viewWindow.start * duration;
    return windowStart + (percent / 100) * windowDuration;
  }, [duration, viewWindow]);
  
  // Handle timeline click
  const handleTimelineClick = (e) => {
    if (!containerRef.current || !duration) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const percent = ((e.clientX - rect.left) / rect.width) * 100;
    const newTime = percentToTime(percent);
    onSeek?.(Math.max(0, Math.min(duration, newTime)));
  };
  
  // Waveform analysis
  const analyzeWaveform = useCallback(async () => {
    if (!mediaFile || isAnalyzing) return;
    
    setIsAnalyzing(true);
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const fileBuffer = await mediaFile.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(fileBuffer);
      
      const channelData = audioBuffer.getChannelData(0);
      const samples = 200; // Number of waveform bars
      const blockSize = Math.floor(channelData.length / samples);
      const waveform = [];
      
      for (let i = 0; i < samples; i++) {
        const start = i * blockSize;
        const end = start + blockSize;
        let max = 0;
        
        for (let j = start; j < end && j < channelData.length; j++) {
          max = Math.max(max, Math.abs(channelData[j]));
        }
        
        waveform.push(max);
      }
      
      setWaveformData(waveform);
      audioContext.close();
    } catch (error) {
      console.error('Waveform analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [mediaFile, isAnalyzing]);
  
  // Draw waveform
  const drawWaveform = useCallback(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !waveformData.length) return;
    
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const waveformHeight = 80; // Waveform section height
    
    // Clear waveform area
    ctx.clearRect(0, 0, width, waveformHeight);
    
    // Draw waveform background
    ctx.fillStyle = 'var(--bg-tertiary)';
    ctx.fillRect(0, 0, width, waveformHeight);
    
    // Draw waveform bars
    const barWidth = width / waveformData.length;
    const maxAmplitude = Math.max(...waveformData, 0.1);
    
    ctx.fillStyle = '#e94560';
    waveformData.forEach((amplitude, i) => {
      const normalizedAmp = amplitude / maxAmplitude;
      const barHeight = normalizedAmp * (waveformHeight * 0.8);
      const x = i * barWidth;
      const y = (waveformHeight - barHeight) / 2;
      
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    });
    
    // Draw current time indicator
    if (currentTime && duration) {
      const progressX = (currentTime / duration) * width;
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(progressX, 0);
      ctx.lineTo(progressX, waveformHeight);
      ctx.stroke();
    }
  }, [waveformData, currentTime, duration]);
  
  // Analyze waveform when media file changes
  useEffect(() => {
    if (mediaFile) {
      analyzeWaveform();
    }
  }, [mediaFile, analyzeWaveform]);
  
  // Redraw waveform when data or time changes
  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  // Handle subtitle mouse down for dragging and resizing
  const handleSubtitleMouseDown = (e, subtitle, mode) => {
    e.stopPropagation();
    setIsDragging(true);
    setDragData({
      subtitle,
      mode, // 'move', 'resize-start', 'resize-end'
      startX: e.clientX,
      originalStart: subtitle.start,
      originalEnd: subtitle.end,
    });
  };
  
  // Handle subtitle dragging
  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !dragData || !containerRef.current || !duration) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const currentPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const currentTime = percentToTime(currentPercent);
    
    const startPercent = ((dragData.startX - rect.left) / rect.width) * 100;
    const startTime = percentToTime(startPercent);
    const timeDelta = currentTime - startTime;
    
    const { subtitle, mode } = dragData;
    
    switch (mode) {
      case 'move': {
        const duration = subtitle.end - subtitle.start;
        const newStart = Math.max(0, subtitle.start + timeDelta);
        const newEnd = newStart + duration;
        
        updateSubtitle(subtitle.id, {
          start: newStart,
          end: Math.min(newEnd, duration || Infinity),
        });
        break;
      }
      case 'resize-start': {
        const newStart = Math.max(0, Math.min(subtitle.end - 0.1, subtitle.start + timeDelta));
        updateSubtitle(subtitle.id, { start: newStart });
        break;
      }
      case 'resize-end': {
        const newEnd = Math.max(subtitle.start + 0.1, Math.min(duration || Infinity, subtitle.end + timeDelta));
        updateSubtitle(subtitle.id, { end: newEnd });
        break;
      }
    }
  }, [isDragging, dragData, duration, updateSubtitle, percentToTime]);
  
  // Mouse event listeners
  useEffect(() => {
    const handleMouseUp = () => {
      setIsDragging(false);
      setDragData(null);
      // Mouse bırakıldığında hover state'i temizleyerek uniform genişliğe dön
      setHoveredSubtitle(null);
      setShowControls(null);
    };
    
    if (isDragging) {
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('mousemove', handleMouseMove);
      return () => {
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('mousemove', handleMouseMove);
      };
    }
  }, [isDragging, handleMouseMove]);
  
  // Format time display
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${mins}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };
  
  // Handle inline text editing
  const handleTextEdit = (subtitle, newText) => {
    updateSubtitle(subtitle.id, { text: newText });
    setEditingSubtitle(null);
  };
  
  // Split subtitle by words
  const splitByWords = (subtitle) => {
    const words = subtitle.text.split(/\s+/).filter(word => word.trim());
    const duration = subtitle.end - subtitle.start;
    const wordDuration = duration / words.length;
    
    // Delete original
    deleteSubtitle(subtitle.id);
    
    // Add word subtitles
    words.forEach((word, index) => {
      addSubtitle({
        start: subtitle.start + (index * wordDuration),
        end: subtitle.start + ((index + 1) * wordDuration),
        text: word,
        type: subtitle.type,
        metadata: { ...subtitle.metadata, isWordSegment: true }
      });
    });
  };
  
  // Merge with next subtitle
  const mergeWithNext = (subtitle) => {
    const currentIndex = subtitles.findIndex(sub => sub.id === subtitle.id);
    if (currentIndex === -1 || currentIndex === subtitles.length - 1) return;
    
    const nextSubtitle = subtitles[currentIndex + 1];
    const mergedText = `${subtitle.text} ${nextSubtitle.text}`;
    
    updateSubtitle(subtitle.id, {
      end: nextSubtitle.end,
      text: mergedText
    });
    
    deleteSubtitle(nextSubtitle.id);
  };
  
  // Get subtitle type color
  const getTypeColor = (type) => {
    switch (type) {
      case 'section': return '#3b82f6';
      case 'citation': return '#10b981';
      case 'verse': return '#8b5cf6';
      case 'bridge': return '#f59e0b';
      case 'intro': return '#06b6d4';
      case 'outro': return '#ef4444';
      default: return '#6b7280';
    }
  };
  
  // Zoom controls
  const zoomIn = () => setZoom(Math.min(zoom * 1.5, 10));
  const zoomOut = () => setZoom(Math.max(zoom / 1.5, 0.1));
  
  // Calculate visible subtitles
  const windowStart = viewWindow.start * duration;
  const windowEnd = viewWindow.end * duration;
  const visibleSubtitles = subtitles.filter(sub => 
    sub.end > windowStart && sub.start < windowEnd
  );

  return (
    <div className="enhanced-subtitle-timeline">
      {/* Timeline Controls */}
      <div className="timeline-controls">
        <div className="control-group">
          <button 
            className={`control-btn ${wordEditMode ? 'active' : ''}`}
            onClick={() => setWordEditMode(!wordEditMode)}
            title="Word Edit Mode"
          >
            🔤
          </button>
          <button className="control-btn" onClick={zoomIn} title="Zoom In">
            🔍+
          </button>
          <button className="control-btn" onClick={zoomOut} title="Zoom Out">
            🔍-
          </button>
        </div>
        
        <div className="timeline-info">
          <span>Duration: {formatTime(duration)}</span>
          <span>Subtitles: {subtitles.length}</span>
          <span>Zoom: {Math.round(zoom * 100)}%</span>
        </div>
      </div>
      
      {/* Main Timeline with Waveform */}
      <div 
        ref={containerRef}
        className="timeline-container"
        style={{ height: Math.max(200, subtitles.length * 36 + 160) }} // Updated for new layout
        onClick={handleTimelineClick}
      >
        {/* Waveform Canvas */}
        <canvas
          ref={waveformCanvasRef}
          className="waveform-canvas"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '80px',
            pointerEvents: 'none',
            zIndex: 1,
            borderRadius: '6px 6px 0 0'
          }}
        />
        
        {/* Waveform Status */}
        {isAnalyzing && (
          <div style={{
            position: 'absolute',
            top: 30,
            left: 20,
            color: 'var(--accent-primary)',
            fontSize: 12,
            zIndex: 2
          }}>
            🎵 Analyzing waveform...
          </div>
        )}
        
        {!waveformData.length && !isAnalyzing && mediaFile && (
          <div style={{
            position: 'absolute',
            top: 30,
            right: 20,
            color: 'var(--text-muted)',
            fontSize: 11,
            zIndex: 2
          }}>
            🎵 Waveform ready
          </div>
        )}
        {/* Background grid */}
        <div className="timeline-grid" style={{ top: '80px', height: 'calc(100% - 80px)' }}>
          {Array.from({ length: 21 }, (_, i) => (
            <div 
              key={i}
              className="grid-line"
              style={{ left: `${i * 5}%` }}
            />
          ))}
        </div>
        
        {/* Subtitle bars with uniform width + expandable on hover/select */}
        {visibleSubtitles.map((subtitle, index) => {
          const startLeft = timeToPercent(subtitle.start);
          const realWidth = timeToPercent(subtitle.end) - startLeft;
          const isSelected = selectedSubtitleId === subtitle.id;
          const isHovered = hoveredSubtitle === subtitle.id;
          const isEditing = editingSubtitle === subtitle.id;
          const isExpanded = isSelected || isHovered || isDragging;
          
          // Use uniform width unless expanded
          const UNIFORM_WIDTH = 8; // Daha görünür uniform genişlik
          const displayWidth = isExpanded ? Math.max(UNIFORM_WIDTH, realWidth) : UNIFORM_WIDTH;
          const displayLeft = Math.max(0, startLeft); // Her zaman gerçek pozisyonda
          
          return (
            <div 
              key={subtitle.id}
              className={`subtitle-bar ${isSelected ? 'selected' : ''} ${subtitle.type || 'default'} ${isExpanded ? 'expanded' : 'compact'}`}
              style={{
                left: `${displayLeft}%`,
                width: `${displayWidth}%`,
                top: 110 + (index * 36), // Yeni yükseklik için daha fazla spacing
                backgroundColor: isExpanded ? getTypeColor(subtitle.type) : '#6b7280',
                cursor: isDragging ? 'grabbing' : 'grab',
                transition: isDragging ? 'none' : 'all 0.2s ease-out',
                opacity: isExpanded ? 1 : 0.7,
                border: isExpanded ? '2px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
                zIndex: isExpanded ? 10 : 1,
                position: 'absolute',
                height: '28px', // Biraz daha yüksek - resize için daha kolay
                borderRadius: '4px',
                overflow: 'hidden'
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedSubtitleId(subtitle.id);
              }}
              onMouseEnter={() => {
                if (!isDragging) {
                  setHoveredSubtitle(subtitle.id);
                  setShowControls(subtitle.id);
                }
              }}
              onMouseLeave={(e) => {
                if (!isDragging) {
                  // Slight delay to prevent flickering during resize handle interaction
                  setTimeout(() => {
                    if (!isDragging) {
                      setHoveredSubtitle(null);
                      setShowControls(null);
                    }
                  }, 50);
                }
              }}
            >
              {/* Resize handles - visible on hover/selection */}
              <div 
                className="resize-handle left"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleSubtitleMouseDown(e, subtitle, 'resize-start');
                }}
                title="Başlangıç süresini ayarla"
              />
              <div 
                className="resize-handle right"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleSubtitleMouseDown(e, subtitle, 'resize-end');
                }}
                title="Bitiş süresini ayarla"
              />
              
              {/* Text content with duration indicator */}
              <div 
                className="subtitle-content"
                style={{
                  padding: '2px 12px',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isExpanded ? 'flex-start' : 'center',
                  fontSize: isExpanded ? '12px' : '10px',
                  fontWeight: isExpanded ? '500' : '400',
                  color: 'white',
                  textShadow: '1px 1px 2px rgba(0,0,0,0.5)'
                }}
                onMouseDown={(e) => {
                  if (!e.target.closest('.resize-handle')) {
                    handleSubtitleMouseDown(e, subtitle, 'move');
                  }
                }}
              >
                {isEditing ? (
                  <input
                    type="text"
                    value={subtitle.text}
                    onChange={(e) => handleTextEdit(subtitle, e.target.value)}
                    onBlur={() => setEditingSubtitle(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setEditingSubtitle(null);
                      if (e.key === 'Escape') setEditingSubtitle(null);
                    }}
                    autoFocus
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      fontSize: '12px',
                      width: '100%',
                      outline: 'none'
                    }}
                  />
                ) : (
                  <>
                    {isExpanded ? (
                      <>
                        <div className="text-content" style={{ flex: 1, textAlign: 'left' }}>
                          {subtitle.text}
                        </div>
                        <div className="duration-info" style={{ 
                          fontSize: '9px', 
                          opacity: 0.8,
                          marginLeft: '8px'
                        }}>
                          {formatTime(subtitle.end - subtitle.start)}
                        </div>
                      </>
                    ) : (
                      <div className="text-content" style={{ 
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden'
                      }}>
                        {subtitle.text?.length > 6 ? subtitle.text.substring(0, 6) + '...' : subtitle.text}
                      </div>
                    )}
                  </>
                )}              
              </div>
              
              {/* Control buttons - only visible when expanded */}
              {showControls === subtitle.id && isExpanded && !isEditing && (
                <div className="subtitle-controls">
                  {wordEditMode && (
                    <button
                      className="control-btn small"
                      onClick={(e) => {
                        e.stopPropagation();
                        splitByWords(subtitle);
                      }}
                      title="Split by words"
                    >
                      ✂️
                    </button>
                  )}
                  <button
                    className="control-btn small"
                    onClick={(e) => {
                      e.stopPropagation();
                      mergeWithNext(subtitle);
                    }}
                    title="Merge with next"
                  >
                    🔗
                  </button>
                  <button
                    className="control-btn small danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSubtitle(subtitle.id);
                    }}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          );
        })}
        
        {/* Playhead */}
        <div
          className="playhead"
          style={{
            left: `${timeToPercent(currentTime)}%`,
          }}
        >
          <div className="playhead-indicator" />
          <div className="playhead-line" />
          <div className="playhead-time">
            {formatTime(currentTime)}
          </div>
        </div>
        
        {/* Time markers */}
        {duration > 0 && (
          <div className="time-markers">
            {Array.from({ length: 11 }, (_, i) => {
              const percent = i * 10;
              const time = percentToTime(percent);
              return (
                <div
                  key={percent}
                  className="time-marker"
                  style={{ left: `${percent}%` }}
                >
                  <div className="marker-line" />
                  <div className="marker-time">{formatTime(time)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Minimap for navigation */}
      <div className="timeline-minimap">
        <div className="minimap-track">
          {subtitles.map(subtitle => (
            <div
              key={subtitle.id}
              className="minimap-subtitle"
              style={{
                left: `${(subtitle.start / duration) * 100}%`,
                width: `${((subtitle.end - subtitle.start) / duration) * 100}%`,
                backgroundColor: getTypeColor(subtitle.type)
              }}
            />
          ))}
          <div 
            className="minimap-window"
            style={{
              left: `${viewWindow.start * 100}%`,
              width: `${(viewWindow.end - viewWindow.start) * 100}%`
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default EnhancedSubtitleTimeline;