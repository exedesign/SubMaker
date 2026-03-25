import React, { useState, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiVolume2, FiVolumeX, FiChevronDown, FiChevronUp } from 'react-icons/fi';

// Track display order
const TRACK_ORDER = ['vocals', 'instrumental', 'drums', 'bass', 'other'];

function TrackStrip({ track, onVolumeChange, onMuteToggle, onSoloToggle, dimmed }) {
  const volumePercent = Math.round(track.volume * 100);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '5px 10px',
      borderLeft: `4px solid ${track.color}`,
      background: track.muted ? 'rgba(0,0,0,0.15)' : 'transparent',
      opacity: dimmed ? 0.35 : 1,
      transition: 'opacity 0.15s, background 0.15s',
    }}>
      {/* Icon + Label */}
      <span style={{ fontSize: 13, width: 24, textAlign: 'center', flexShrink: 0 }}>
        {track.icon}
      </span>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        width: 80,
        flexShrink: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: 'var(--text-color)',
      }}>
        {track.label}
      </span>

      {/* Volume Slider */}
      <input
        type="range"
        min="0"
        max="100"
        value={volumePercent}
        onChange={(e) => onVolumeChange(parseInt(e.target.value, 10) / 100)}
        style={{
          flex: 1,
          height: 4,
          cursor: 'pointer',
          accentColor: track.color,
        }}
      />
      <span style={{
        fontSize: 10,
        width: 30,
        textAlign: 'right',
        color: 'var(--text-muted)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {volumePercent}%
      </span>

      {/* Mute Button */}
      <button
        onClick={onMuteToggle}
        title={track.muted ? 'Sesi aç' : 'Sustur'}
        style={{
          background: track.muted ? 'rgba(239, 68, 68, 0.8)' : 'var(--bg-primary)',
          border: `1px solid ${track.muted ? 'rgba(239,68,68,0.6)' : 'var(--border-color)'}`,
          borderRadius: 4,
          width: 24,
          height: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: track.muted ? '#fff' : 'var(--text-muted)',
          fontSize: 10,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        M
      </button>

      {/* Solo Button */}
      <button
        onClick={onSoloToggle}
        title={track.solo ? 'Solo kapat' : 'Solo'}
        style={{
          background: track.solo ? `${track.color}` : 'var(--bg-primary)',
          border: `1px solid ${track.solo ? track.color : 'var(--border-color)'}`,
          borderRadius: 4,
          width: 24,
          height: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: track.solo ? '#fff' : 'var(--text-muted)',
          fontSize: 10,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        S
      </button>
    </div>
  );
}

export default function AudioMixer() {
  const audioMixer = useAppStore(s => s.audioMixer);
  const setTrackVolume = useAppStore(s => s.setTrackVolume);
  const setTrackMuted = useAppStore(s => s.setTrackMuted);
  const setTrackSolo = useAppStore(s => s.setTrackSolo);
  const setMasterVolume = useAppStore(s => s.setMasterVolume);
  const setMasterMuted = useAppStore(s => s.setMasterMuted);

  const [collapsed, setCollapsed] = useState(false);

  const { tracks, masterVolume, masterMuted } = audioMixer;
  const anySoloed = Object.values(tracks).some(t => t.solo);

  // Sort tracks by predefined order
  const sortedTrackIds = Object.keys(tracks).sort((a, b) => {
    const ia = TRACK_ORDER.indexOf(a);
    const ib = TRACK_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const trackCount = sortedTrackIds.length;

  const handleMasterVolumeChange = useCallback((e) => {
    setMasterVolume(parseInt(e.target.value, 10) / 100);
  }, [setMasterVolume]);

  if (!audioMixer.enabled || trackCount === 0) return null;

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: 8,
      border: '1px solid var(--border-color)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          cursor: 'pointer',
          background: 'var(--bg-tertiary)',
          borderBottom: collapsed ? 'none' : '1px solid var(--border-color)',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: 6 }}>
          🎚️ Audio Mixer
          <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>
            ({trackCount} kanal)
          </span>
        </span>
        {collapsed ? <FiChevronDown size={14} /> : <FiChevronUp size={14} />}
      </div>

      {!collapsed && (
        <div style={{ padding: '4px 0' }}>
          {/* Master Channel */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 10px',
            borderLeft: '4px solid var(--text-muted)',
            borderBottom: '1px solid var(--border-color)',
            marginBottom: 2,
          }}>
            <span style={{ fontSize: 13, width: 24, textAlign: 'center', flexShrink: 0 }}>
              {masterMuted ? <FiVolumeX size={14} /> : <FiVolume2 size={14} />}
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              width: 80,
              flexShrink: 0,
              color: 'var(--text-color)',
            }}>
              Master
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(masterVolume * 100)}
              onChange={handleMasterVolumeChange}
              style={{
                flex: 1,
                height: 4,
                cursor: 'pointer',
                accentColor: 'var(--accent-color)',
              }}
            />
            <span style={{
              fontSize: 10,
              width: 30,
              textAlign: 'right',
              color: 'var(--text-muted)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {Math.round(masterVolume * 100)}%
            </span>
            <button
              onClick={() => setMasterMuted(!masterMuted)}
              title={masterMuted ? 'Sesi aç' : 'Tümünü sustur'}
              style={{
                background: masterMuted ? 'rgba(239, 68, 68, 0.8)' : 'var(--bg-primary)',
                border: `1px solid ${masterMuted ? 'rgba(239,68,68,0.6)' : 'var(--border-color)'}`,
                borderRadius: 4,
                width: 24,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: masterMuted ? '#fff' : 'var(--text-muted)',
                fontSize: 10,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              M
            </button>
            {/* Spacer to align with solo column */}
            <div style={{ width: 24, flexShrink: 0 }} />
          </div>

          {/* Track Strips */}
          {sortedTrackIds.map(id => {
            const track = tracks[id];
            const dimmed = anySoloed && !track.solo && !track.muted;
            return (
              <TrackStrip
                key={id}
                track={track}
                dimmed={dimmed}
                onVolumeChange={(v) => setTrackVolume(id, v)}
                onMuteToggle={() => setTrackMuted(id, !track.muted)}
                onSoloToggle={() => setTrackSolo(id, !track.solo)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
