import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { fetchJson } from '../services/electronTransport';
import { FiPlay, FiPause, FiSkipBack, FiSkipForward } from 'react-icons/fi';

// Stem track constants
const STEM_ORDER = ['original', 'vocals', 'instrumental', 'drums', 'bass', 'other'];
const STEM_TRACK_HEIGHT = 48;
const STEM_HEADER_WIDTH = 110;

const isAbsolutePath = (value) => {
  if (!value || typeof value !== 'string') return false;
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/');
};

// Memoized stem track row component
const StemTrackRow = React.memo(({
  trackId, label, icon, color, waveformData, isMuted, volume,
  onVolumeChange, onMuteToggle, currentTime, duration,
}) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = isMuted ? 'rgba(40, 40, 50, 0.4)' : 'rgba(20, 25, 35, 0.6)';
    ctx.fillRect(0, 0, width, height);

    // Center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Waveform bars
    if (waveformData && waveformData.length > 0) {
      const barWidth = Math.max(0.5, width / waveformData.length);
      const centerY = height / 2;
      let maxAmp = 0;
      for (let i = 0; i < waveformData.length; i++) {
        if (waveformData[i] > maxAmp) maxAmp = waveformData[i];
      }
      if (maxAmp < 0.01) maxAmp = 0.01;

      ctx.fillStyle = isMuted ? 'rgba(100, 100, 100, 0.2)' : color.replace('0.8)', '0.7)');

      for (let i = 0; i < waveformData.length; i++) {
        const amp = waveformData[i] / maxAmp;
        const barH = amp * (height * 0.4);
        const x = i * barWidth;
        ctx.fillRect(x, centerY - barH, barWidth, barH * 2);
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '10px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Dalga formu yükleniyor...', width / 2, height / 2 + 3);
    }

    // Playhead
    if (duration > 0 && currentTime >= 0) {
      const x = (currentTime / duration) * width;
      ctx.strokeStyle = '#ff3333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }, [waveformData, color, isMuted, volume, currentTime, duration]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: STEM_TRACK_HEIGHT,
      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
      background: isMuted ? 'rgba(0, 0, 0, 0.2)' : 'transparent',
      opacity: isMuted ? 0.5 : 1, transition: 'opacity 0.15s',
    }}>
      {/* Track Header */}
      <div style={{
        flex: `0 0 ${STEM_HEADER_WIDTH}px`, display: 'flex', flexDirection: 'column',
        padding: '2px 6px', gap: 2,
        borderRight: `2px solid ${isMuted ? 'rgba(100,100,100,0.3)' : color}`,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontWeight: 600,
          color: isMuted ? 'var(--text-muted)' : color.replace('0.8)', '1)'),
        }}>
          <span style={{ fontSize: 12 }}>{icon}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onMuteToggle(); }}
            style={{
              width: 22, height: 16, padding: 0, fontSize: 8, fontWeight: 700,
              background: isMuted ? 'rgba(239, 68, 68, 0.7)' : 'rgba(100, 100, 100, 0.3)',
              color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer',
            }}
          >M</button>
          <input
            type="range" min="0" max="100"
            value={Math.round(volume * 100)}
            onChange={(e) => { e.stopPropagation(); onVolumeChange(parseInt(e.target.value) / 100); }}
            onClick={(e) => e.stopPropagation()}
            style={{ flex: 1, height: 2, cursor: 'pointer', accentColor: color.replace('0.8)', '1)') }}
            title={`Volume: ${Math.round(volume * 100)}%`}
          />
          <span style={{ fontSize: 8, color: 'var(--text-muted)', minWidth: 20, textAlign: 'right' }}>
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>
      {/* Track Waveform Canvas */}
      <canvas
        ref={canvasRef}
        style={{ flex: 1, height: STEM_TRACK_HEIGHT - 4, borderRadius: '0 4px 4px 0', background: 'rgba(0, 0, 0, 0.3)' }}
        width={700}
        height={STEM_TRACK_HEIGHT - 4}
      />
    </div>
  );
});
StemTrackRow.displayName = 'StemTrackRow';

function SubtitleTimeline({ currentTime, duration, onSeek }) {
  const {
    subtitles,
    selectedSubtitleId,
    setSelectedSubtitleId,
    updateSubtitle,
    settings,
    mediaFile,
    originalMediaPath,
    originalMediaFile,
    initialMediaPath,
    originalFileName,
    savedFileName,
    audioMixer,
    setTrackVolume,
    setTrackMuted,
    setTrackSolo,
    isPlaying,
    globalAudioRef,
    mediaDuration,
  } = useAppStore();

  // Playback controls
  const handleTogglePlay = useCallback(() => {
    const ref = globalAudioRef;
    if (!ref?.current) return;
    if (ref.current.paused) {
      ref.current.play();
    } else {
      ref.current.pause();
    }
  }, [globalAudioRef]);

  const handleSkip = useCallback((seconds) => {
    const ref = globalAudioRef;
    if (!ref?.current) return;
    const dur = ref.current.duration || mediaDuration || duration || 0;
    ref.current.currentTime = Math.max(0, Math.min(dur, ref.current.currentTime + seconds));
  }, [globalAudioRef, mediaDuration, duration]);
  
  const containerRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const stemContainerRef = useRef(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragData, setDragData] = useState(null);
  const [hoveredSubtitle, setHoveredSubtitle] = useState(null);
  const [waveformData, setWaveformData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const lastDrawTime = useRef(0); // For throttling canvas draws
  const analysisTimeout = useRef(null); // For debouncing analysis

  // Derive sorted tracks when mixer is active
  const mixerEnabled = audioMixer?.enabled && Object.keys(audioMixer.tracks || {}).length > 0;
  const sortedTracks = mixerEnabled
    ? Object.entries(audioMixer.tracks)
        .map(([id, track]) => ({ id, ...track }))
        .sort((a, b) => {
          const ia = STEM_ORDER.indexOf(a.id);
          const ib = STEM_ORDER.indexOf(b.id);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        })
    : [];
  
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
      const waveformSourcePath = [mediaFile, originalMediaFile, originalMediaPath, initialMediaPath]
        .find((value) => isAbsolutePath(value));

      if (!waveformSourcePath) {
        setWaveformData(null);
        return;
      }

      const response = await fetchJson('http://localhost:5000/api/waveform', {
        method: 'POST',
        body: { file_path: waveformSourcePath },
      });

      const rawWaveform = Array.isArray(response?.waveform) ? response.waveform : [];
      const samples = rawWaveform.length;
      const waveformPoints = rawWaveform.map((amplitude, index) => ({
        average: amplitude,
        peak: amplitude,
        position: samples > 1 ? (index / (samples - 1)) * 100 : 0,
      }));

      setWaveformData(waveformPoints);

    } catch (error) {
      console.error('Audio analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [initialMediaPath, mediaFile, originalMediaFile, originalMediaPath, settings.audioVisualization.showWaveform]);
  
  
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

  // Resize stem track canvases when container width changes
  useEffect(() => {
    if (!mixerEnabled || !stemContainerRef.current) return;

    const handleResize = () => {
      if (!stemContainerRef.current) return;
      const containerWidth = stemContainerRef.current.clientWidth;
      const canvasWidth = Math.max(200, containerWidth - STEM_HEADER_WIDTH);
      const canvases = stemContainerRef.current.querySelectorAll('canvas');
      canvases.forEach((canvas) => {
        if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
      });
    };

    handleResize();
    const observer = new ResizeObserver(handleResize);
    observer.observe(stemContainerRef.current);
    return () => observer.disconnect();
  }, [mixerEnabled, sortedTracks.length]);
  
  // Format time display
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${mins}:${seconds.toString().padStart(2, '0')}`;
  };
  
  return (
    <div style={{ marginTop: 16 }}>
      {/* Transport Bar — playback + timeline header unified */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
        padding: '4px 8px',
        background: 'var(--bg-tertiary)',
        borderRadius: 6,
        border: '1px solid var(--border-color)',
      }}>
        {/* Playback Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            onClick={() => handleSkip(-5)}
            title="5s geri"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, padding: 0,
              background: 'transparent', border: 'none', borderRadius: 4,
              color: 'var(--text-secondary)', cursor: 'pointer',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <FiSkipBack size={13} />
          </button>
          <button
            onClick={handleTogglePlay}
            title={isPlaying ? 'Duraklat' : 'Oynat'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, padding: 0,
              background: isPlaying ? 'var(--accent-primary)' : 'var(--bg-hover)',
              border: 'none', borderRadius: '50%',
              color: isPlaying ? '#fff' : 'var(--text-primary)', cursor: 'pointer',
              transition: 'background 0.15s, transform 0.1s',
            }}
            onMouseEnter={e => { if (!isPlaying) e.currentTarget.style.background = 'var(--accent-primary)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { if (!isPlaying) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
          >
            {isPlaying ? <FiPause size={14} /> : <FiPlay size={14} style={{ marginLeft: 1 }} />}
          </button>
          <button
            onClick={() => handleSkip(5)}
            title="5s ileri"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, padding: 0,
              background: 'transparent', border: 'none', borderRadius: 4,
              color: 'var(--text-secondary)', cursor: 'pointer',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <FiSkipForward size={13} />
          </button>
        </div>

        {/* Time Display */}
        <span style={{
          fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)',
          minWidth: 80, letterSpacing: '0.5px',
        }}>
          {formatTime(currentTime)}<span style={{ opacity: 0.4 }}> / </span>{formatTime(duration)}
        </span>

        {/* Spacer + Info */}
        <span style={{ flex: 1 }}>
          {isAnalyzing && <span style={{ fontSize: 11, color: 'var(--accent-warning)' }}>Ses analizi...</span>}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{subtitles.length} altyazı</span>
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

      {/* Stem Tracks Panel - shown when vocal isolation is complete */}
      {mixerEnabled && sortedTracks.length > 0 && (
        <div
          ref={stemContainerRef}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderTop: 'none',
            borderBottom: 'none',
            maxHeight: sortedTracks.length * STEM_TRACK_HEIGHT + 28,
            overflowY: sortedTracks.length > 4 ? 'auto' : 'hidden',
          }}
        >
          {/* Section Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '3px 8px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            background: 'rgba(0, 0, 0, 0.15)',
          }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>
              Ses Katmanları ({sortedTracks.length})
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.6 }}>
              {sortedTracks.filter(t => t.waveformData).length}/{sortedTracks.length} dalga formu
            </span>
          </div>

          {/* Track Rows */}
          {sortedTracks.map((track) => (
            <StemTrackRow
              key={track.id}
              trackId={track.id}
              label={track.label}
              icon={track.icon}
              color={track.color}
              waveformData={track.waveformData}
              isMuted={track.muted}
              volume={track.volume}
              onVolumeChange={(vol) => setTrackVolume(track.id, vol)}
              onMuteToggle={() => setTrackMuted(track.id, !track.muted)}
              currentTime={currentTime}
              duration={duration}
            />
          ))}
        </div>
      )}

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
          borderRadius: (settings.audioVisualization.showWaveform || mixerEnabled)
            ? '0 0 6px 6px'
            : 6,
          overflow: 'hidden',
          cursor: 'pointer',
          border: '1px solid var(--border-color)',
          borderTop: (settings.audioVisualization.showWaveform || mixerEnabled)
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
