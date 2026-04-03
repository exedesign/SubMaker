/**
 * CompactMixedTimeline - Renders subtitles and audio mixer tracks in a single layered timeline
 * Shows:
 * - Original audio (if available) or primary waveform
 * - Vokal separation stems (vocals, instrumental, drums, bass, other) as separate tracks
 * - Subtitles overlaid on timeline
 * - Volume controls for each track
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import './CompactMixedTimeline.css';

const TRACK_HEIGHT = 60;
const STEM_ORDER = ['original', 'vocals', 'instrumental', 'drums', 'bass', 'other'];

/**
 * Single waveform track renderer (memoized for performance)
 */
const TrackWaveform = React.memo(({ 
  trackId, 
  trackLabel, 
  color, 
  waveformData,
  isMuted,
  volume,
  onVolumeChange,
  onMuteToggle,
  currentTime,
  duration,
}) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = isMuted ? 'rgba(40, 40, 50, 0.4)' : 'rgba(20, 25, 35, 0.6)';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Waveform
    if (waveformData && waveformData.length > 0) {
      const barWidth = Math.max(0.5, width / waveformData.length);
      const centerY = height / 2;
      let maxAmp = 0;
      for (let i = 0; i < waveformData.length; i++) {
        if (waveformData[i] > maxAmp) maxAmp = waveformData[i];
      }
      if (maxAmp < 0.01) maxAmp = 0.01;

      ctx.fillStyle = isMuted 
        ? 'rgba(100, 100, 100, 0.2)' 
        : color.replace('0.8)', '0.7)');

      for (let i = 0; i < waveformData.length; i++) {
        const amp = waveformData[i] / maxAmp;
        const barH = amp * (height * 0.4);
        const x = i * barWidth;

        ctx.fillRect(x, centerY - barH, barWidth, barH * 2);
      }
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
      display: 'flex',
      alignItems: 'center',
      height: TRACK_HEIGHT,
      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
      gap: 8,
      padding: '4px 8px',
      background: isMuted ? 'rgba(0, 0, 0, 0.2)' : 'transparent',
    }}>
      {/* Track Label & Controls */}
      <div style={{
        flex: '0 0 120px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: color.replace('0.8)', '1)'),
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {trackLabel}
        </div>
        <div style={{
          display: 'flex',
          gap: 4,
          alignItems: 'center',
        }}>
          {/* Mute Button */}
          <button
            onClick={onMuteToggle}
            style={{
              width: 24,
              height: 20,
              padding: 0,
              fontSize: 9,
              fontWeight: 700,
              background: isMuted ? 'rgba(239, 68, 68, 0.7)' : 'rgba(100, 100, 100, 0.3)',
              color: '#fff',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            M
          </button>

          {/* Volume Slider */}
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(volume * 100)}
            onChange={(e) => onVolumeChange(parseInt(e.target.value) / 100)}
            style={{
              height: 3,
              flex: 1,
              cursor: 'pointer',
              accentColor: color.replace('0.8)', '1)'),
            }}
            title={`Volume: ${Math.round(volume * 100)}%`}
          />

          {/* Volume % */}
          <div style={{
            fontSize: 9,
            width: 24,
            textAlign: 'right',
            color: 'var(--text-muted)',
          }}>
            {Math.round(volume * 100)}%
          </div>
        </div>
      </div>

      {/* Waveform Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          flex: 1,
          height: TRACK_HEIGHT - 8,
          borderRadius: 4,
          background: 'rgba(0, 0, 0, 0.3)',
        }}
        width={800}
        height={TRACK_HEIGHT - 8}
      />
    </div>
  );
});

TrackWaveform.displayName = 'TrackWaveform';

/**
 * Main timeline component
 */
function CompactMixedTimeline({ currentTime, duration, onSeek }) {
  const {
    audioMixer,
    setTrackVolume,
    setTrackMuted,
    setTrackWaveform,
  } = useAppStore();

  const containerRef = useRef(null);

  // Resize canvas
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        const canvases = containerRef.current.querySelectorAll('canvas');
        canvases.forEach((canvas) => {
          canvas.width = width - 128 - 16; // Account for label and padding
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Track click for seeking
  const handleTimelineClick = useCallback((e) => {
    if (!containerRef.current || !duration) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - 128 - 8; // Account for label and gap
    const percent = x / (rect.width - 128 - 16);
    const newTime = percent * duration;
    onSeek?.(Math.max(0, Math.min(duration, newTime)));
  }, [duration, onSeek]);

  if (!audioMixer.enabled || !audioMixer.tracks || Object.keys(audioMixer.tracks).length === 0) {
    return null;
  }

  // Render tracks in specific order
  const sortedTracks = [];
  for (const stemId of STEM_ORDER) {
    if (audioMixer.tracks[stemId]) {
      sortedTracks.push({ id: stemId, ...audioMixer.tracks[stemId] });
    }
  }

  // Count loaded waveforms
  const loadedWaveforms = sortedTracks.filter(t => t.waveformData).length;
  const isLoading = loadedWaveforms < sortedTracks.length;

  return (
    <div
      ref={containerRef}
      onClick={handleTimelineClick}
      style={{
        overflowY: 'auto',
        maxHeight: 300,
        background: 'linear-gradient(135deg, rgba(20, 25, 35, 0.3) 0%, rgba(10, 15, 25, 0.3) 100%)',
        borderRadius: 8,
        border: '1px solid rgba(99, 102, 241, 0.2)',
        padding: '8px 0',
      }}
    >
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '4px 8px',
        color: 'var(--text-muted)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>🎵 Audio Layers — Click to select</span>
        {isLoading && <span style={{ fontSize: 9, opacity: 0.7 }}>Loading waveforms...</span>}
      </div>

      {sortedTracks.map((track) => (
        <TrackWaveform
          key={track.id}
          trackId={track.id}
          trackLabel={track.label}
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

      <div style={{
        padding: '8px 12px',
        fontSize: 10,
        color: 'var(--text-muted)',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
      }}>
        {sortedTracks.length} audio layers
      </div>
    </div>
  );
}

export default CompactMixedTimeline;
