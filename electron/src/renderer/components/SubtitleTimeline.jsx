import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';

function SubtitleTimeline({ currentTime, duration, onSeek }) {
  const { 
    subtitles, 
    selectedSubtitleId, 
    setSelectedSubtitleId, 
    updateSubtitle, 
    settings,
    mediaFile,
    originalFileName,
    savedFileName
  } = useAppStore();
  
  const containerRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragData, setDragData] = useState(null);
  const [hoveredSubtitle, setHoveredSubtitle] = useState(null);
  const [waveformData, setWaveformData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const lastDrawTime = useRef(0); // For throttling canvas draws
  const analysisTimeout = useRef(null); // For debouncing analysis
  
  // Calculate position from time
  const timeToPercent = (time) => {
    if (!duration) return 0;
    return (time / duration) * 100;
  };
  
  // Convert percent to time
  const percentToTime = (percent) => {
    if (!duration) return 0;
    return (percent / 100) * duration;
  };
  
  // Simple waveform analysis
  const analyzeAudio = useCallback(async () => {
    if (!mediaFile || !settings.audioVisualization.showWaveform) return;
    
    setIsAnalyzing(true);
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const response = await fetch(`http://localhost:5000/api/media/temp/${encodeURIComponent(savedFileName || mediaFile.split(/[\\/]/).pop())}`);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const channelData = audioBuffer.getChannelData(0);
      const samples = 800;
      const blockSize = Math.floor(channelData.length / samples);
      const waveformPoints = [];
      
      for (let i = 0; i < samples; i++) {
        const start = i * blockSize;
        let sum = 0;
        let maxVal = 0;
        
        for (let j = 0; j < blockSize; j++) {
          const val = Math.abs(channelData[start + j] || 0);
          sum += val;
          maxVal = Math.max(maxVal, val);
        }
        
        waveformPoints.push({
          average: sum / blockSize,
          peak: maxVal,
          position: (i / samples) * 100
        });
      }
      
      setWaveformData(waveformPoints);
      
    } catch (error) {
      console.error('Audio analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [mediaFile, settings.audioVisualization]);
  
  
  // Simple waveform drawing
  const drawWaveform = useCallback(() => {
    const canvas = waveformCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !waveformData || !settings.audioVisualization.showWaveform) return;
    
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = settings.audioVisualization.waveformHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background grid (optional)
    if (settings.audioVisualization.showGrid) {
      ctx.strokeStyle = 'rgba(100, 120, 140, 0.1)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 10; i++) {
        const y = (i / 10) * canvas.height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }
    
    // Draw waveform with enhanced colors
    const centerY = canvas.height / 2;
    const maxHeight = centerY * 0.95;
    
    // Create simple line-style waveform background
    const baseColor = '#00FF88'; // Bright green

    // Clear previous drawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw subtle center baseline
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 255, 136, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([1, 2]);
    ctx.moveTo(0, centerY);
    ctx.lineTo(canvas.width, centerY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // No heavy shadows - keep it clean
    
    // Minimal vertical line waveform (clear and precise)
    const lineSpacing = Math.max(1, canvas.width / waveformData.length);
    
    waveformData.forEach((point, index) => {
      const x = index * lineSpacing;
      
      // Enhanced amplitude calculation for clarity
      const enhancementFactor = settings.audioVisualization.enhancement || 2.5;
      let amplitude = Math.max(point.peak || 0, (point.average || 0) * 1.8);
      amplitude = Math.max(amplitude, 0.08); // Minimum for visibility
      amplitude = amplitude * enhancementFactor;
      amplitude = Math.min(amplitude, 0.9); // Leave margin
      
      // Calculate line height
      const lineHeight = amplitude * maxHeight;
      
      // Use a bright, contrasting color
      ctx.strokeStyle = '#00FF88'; // Bright green for better visibility
      ctx.lineWidth = Math.max(1, lineSpacing * 0.6); // Thinner lines
      ctx.lineCap = 'round';
      
      // Draw vertical line from center
      ctx.beginPath();
      ctx.moveTo(x, centerY - lineHeight);
      ctx.lineTo(x, centerY + lineHeight);
      ctx.stroke();
    });
    
    // Draw clean playback indicator
    if (currentTime && duration) {
      const playbackX = (currentTime / duration) * canvas.width;
      
      // Sharp playback line
      ctx.strokeStyle = '#FF0066'; // Bright pink for contrast
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(playbackX, 0);
      ctx.lineTo(playbackX, canvas.height);
      ctx.stroke();
    }
  }, [waveformData, currentTime, duration, settings.audioVisualization]);

  // Handle subtitle mouse down for resizing/moving
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
  
  // Handle click on timeline
  const handleTimelineClick = (e) => {
    if (!containerRef.current || !duration || isDragging) return;
    
    // Clear subtitle selection when clicking on empty area
    setSelectedSubtitleId(null);
    
    const rect = containerRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    onSeek?.(Math.max(0, Math.min(duration, newTime)));
  };
  
  // Handle mouse move for dragging and resizing
  const handleMouseMove = (e) => {
    if (!isDragging || !containerRef.current || !duration) return;
    
    // If timeline dragging (no dragData)
    if (!dragData) {
      const rect = containerRef.current.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      const newTime = percent * duration;
      onSeek?.(Math.max(0, Math.min(duration, newTime)));
      return;
    }
    
    // Subtitle resize/move logic
    const rect = containerRef.current.getBoundingClientRect();
    const currentPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const currentTime = percentToTime(currentPercent);
    
    const startPercent = ((dragData.startX - rect.left) / rect.width) * 100;
    const startTime = percentToTime(startPercent);
    const timeDelta = currentTime - startTime;
    
    const { subtitle, mode } = dragData;
    
    // Helper: Find neighboring subtitles for collision detection
    const getNeighbors = (currentSubId) => {
      const otherSubs = subtitles.filter(s => s.id !== currentSubId);
      const prevSub = otherSubs.filter(s => s.end <= subtitle.start).sort((a, b) => b.end - a.end)[0];
      const nextSub = otherSubs.filter(s => s.start >= subtitle.end).sort((a, b) => a.start - b.start)[0];
      return { prevSub, nextSub };
    };
    
    const { prevSub, nextSub } = getNeighbors(subtitle.id);
    
    switch (mode) {
      case 'move': {
        const subtitleDuration = subtitle.end - subtitle.start;
        let newStart = Math.max(0, subtitle.start + timeDelta);
        let newEnd = newStart + subtitleDuration;
        
        // Collision detection for move
        if (prevSub && newStart < prevSub.end) {
          newStart = prevSub.end + 0.1; // 0.1s gap
          newEnd = newStart + subtitleDuration;
        }
        if (nextSub && newEnd > nextSub.start) {
          newEnd = nextSub.start - 0.1; // 0.1s gap
          newStart = newEnd - subtitleDuration;
        }
        
        // Final bounds check
        newStart = Math.max(0, newStart);
        newEnd = Math.min(duration, newEnd);
        
        updateSubtitle(subtitle.id, {
          start: newStart,
          end: newEnd,
        });
        break;
      }
      case 'resize-start': {
        let newStart = Math.max(0, Math.min(subtitle.end - 0.1, subtitle.start + timeDelta));
        
        // Collision with previous subtitle
        if (prevSub && newStart < prevSub.end) {
          newStart = prevSub.end + 0.1;
        }
        
        // Ensure minimum duration
        newStart = Math.min(newStart, subtitle.end - 0.1);
        
        updateSubtitle(subtitle.id, { start: Math.max(0, newStart) });
        break;
      }
      case 'resize-end': {
        let newEnd = Math.max(subtitle.start + 0.1, Math.min(duration, subtitle.end + timeDelta));
        
        // Collision with next subtitle
        if (nextSub && newEnd > nextSub.start) {
          newEnd = nextSub.start - 0.1;
        }
        
        // Ensure minimum duration
        newEnd = Math.max(newEnd, subtitle.start + 0.1);
        
        updateSubtitle(subtitle.id, { end: Math.min(duration, newEnd) });
        break;
      }
    }
  };
  
  useEffect(() => {
    const handleMouseUp = () => {
      setIsDragging(false);
      setDragData(null);
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
  
  // Simple audio analysis when media changes
  useEffect(() => {
    if (!mediaFile || !settings.audioVisualization.showWaveform) {
      setWaveformData(null);
      return;
    }
    
    const analysisTimeout = setTimeout(() => {
      analyzeAudio();
    }, 500);
    
    return () => clearTimeout(analysisTimeout);
  }, [mediaFile, settings.audioVisualization.showWaveform]);
  
  // Redraw waveform
  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);
  
  // Format time display
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${mins}:${seconds.toString().padStart(2, '0')}`;
  };
  
  return (
    <div style={{ marginTop: 16 }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        marginBottom: 4,
        fontSize: 11,
        color: 'var(--text-muted)',
      }}>
        <span>
          Altyazı Zaman Çizelgesi
          {isAnalyzing && <span style={{ color: 'var(--accent-warning)' }}> (Ses analizi yapılıyor...)</span>}
        </span>
        <span>{subtitles.length} altyazı</span>
      </div>
      
      {/* Audio Visualization Area */}
      <div style={{ 
        position: 'relative',
        background: 'var(--bg-card)',
        borderRadius: '6px 6px 0 0',
        overflow: 'hidden',
        border: '1px solid var(--border-color)',
        borderBottom: 'none'
      }}>
        {/* Waveform Canvas */}
        {settings.audioVisualization.showWaveform && (
          <canvas
            ref={waveformCanvasRef}
            style={{
              display: 'block',
              width: '100%',
              height: settings.audioVisualization.waveformHeight,
              background: 'var(--bg-secondary)',
            }}
          />
        )}
        
        {/* Visualization Status */}
        {!settings.audioVisualization.showWaveform && (
          <div style={{
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: 12,
            background: 'var(--bg-secondary)',
          }}>
            Basit ses dalgası görselleştirmesi
          </div>
        )}
      </div>
      
      {/* Timeline container */}
      <div
        ref={containerRef}
        onClick={handleTimelineClick}
        onMouseDown={(e) => {
          if (!e.target.closest('.resize-handle') && !dragData) {
            setIsDragging(true);
          }
        }}
        style={{
          position: 'relative',
          height: 60,
          background: 'var(--bg-tertiary)',
          borderRadius: settings.audioVisualization.showWaveform 
            ? '0 0 6px 6px' 
            : 6,
          overflow: 'hidden',
          cursor: 'pointer',
          border: '1px solid var(--border-color)',
          borderTop: settings.audioVisualization.showWaveform 
            ? 'none' 
            : '1px solid var(--border-color)',
        }}
      >
        {/* Subtitle blocks */}
        {subtitles.map((sub, index) => {
          const left = timeToPercent(sub.start);
          const width = timeToPercent(sub.end - sub.start);
          const isActive = currentTime >= sub.start && currentTime < sub.end;
          const isSelected = sub.id === selectedSubtitleId;
          const isHovered = hoveredSubtitle === sub.id;
          
          return (
            <div
              key={sub.id}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedSubtitleId(sub.id);
                onSeek?.(sub.start);
              }}
              onMouseEnter={() => setHoveredSubtitle(sub.id)}
              onMouseLeave={() => setHoveredSubtitle(null)}
              title={sub.text}
              style={{
                position: 'absolute',
                left: `${left}%`,
                width: `${Math.max(width, 0.5)}%`,
                top: 8,
                height: 44,
                background: isActive 
                  ? 'var(--accent-secondary)' 
                  : isSelected 
                    ? 'var(--accent-secondary)' 
                    : 'var(--bg-secondary)',
                borderRadius: 4,
                padding: '4px 6px',
                overflow: 'visible',
                border: isSelected ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                transition: 'background 0.15s',
                cursor: 'pointer',
              }}
            >
              {/* Left resize handle */}
              {(isHovered || isSelected) && (
                <div
                  className="resize-handle left"
                  style={{
                    position: 'absolute',
                    left: -6,
                    top: 0,
                    width: 12,
                    height: '100%',
                    cursor: 'ew-resize',
                    background: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: '4px 0 0 4px',
                    zIndex: 10,
                    border: '1px solid rgba(255, 255, 255, 0.5)',
                  }}
                  onMouseDown={(e) => handleSubtitleMouseDown(e, sub, 'resize-start')}
                  title="Başlangıç süresini ayarla"
                />
              )}
              
              {/* Right resize handle */}
              {(isHovered || isSelected) && (
                <div
                  className="resize-handle right"
                  style={{
                    position: 'absolute',
                    right: -6,
                    top: 0,
                    width: 12,
                    height: '100%',
                    cursor: 'ew-resize',
                    background: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: '0 4px 4px 0',
                    zIndex: 10,
                    border: '1px solid rgba(255, 255, 255, 0.5)',
                  }}
                  onMouseDown={(e) => handleSubtitleMouseDown(e, sub, 'resize-end')}
                  title="Bitiş süresini ayarla"
                />
              )}
              
              {/* Main content - for moving */}
              <div
                onMouseDown={(e) => {
                  if (!e.target.closest('.resize-handle')) {
                    handleSubtitleMouseDown(e, sub, 'move');
                  }
                }}
                style={{ position: 'relative', width: '100%', height: '100%' }}
              >
                <div style={{
                  fontSize: 9,
                  color: isActive ? 'white' : 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {formatTime(sub.start)}
                </div>
                <div style={{
                  fontSize: 10,
                  color: isActive ? 'white' : 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: 2,
                }}>
                  {sub.text}
                </div>
              </div>
            </div>
          );
        })}
        
        {/* Playhead */}
        <div
          style={{
            position: 'absolute',
            left: `${timeToPercent(currentTime)}%`,
            top: 0,
            bottom: 0,
            width: 2,
            background: '#ff4444',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <div style={{
            position: 'absolute',
            top: -4,
            left: -4,
            width: 10,
            height: 10,
            background: '#ff4444',
            borderRadius: '50%',
          }} />
        </div>
        
        {/* Time markers */}
        {duration > 0 && [0, 0.25, 0.5, 0.75, 1].map((percent) => (
          <div
            key={percent}
            style={{
              position: 'absolute',
              left: `${percent * 100}%`,
              bottom: 2,
              fontSize: 9,
              color: 'var(--text-muted)',
              transform: 'translateX(-50%)',
            }}
          >
            {formatTime(percent * duration)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default SubtitleTimeline;
