import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { displayShortcut, captureShortcut } from '../utils/shortcutHelper';

const CATEGORIES = [
  {
    label: 'Global',
    icon: '🌐',
    ids: ['generateCoverArt'],
  },
  {
    label: 'Timeline / Playback',
    icon: '⏱️',
    ids: ['seekBackward', 'seekForward', 'goToStart', 'playPause', 'toggleSplitMode', 'exitSplitMode'],
  },
  {
    label: 'Playlist',
    icon: '📋',
    ids: ['nextTrack', 'prevTrack'],
  },
  {
    label: 'Audio Mixer',
    icon: '🎚️',
    ids: ['soloVocals', 'soloInstrumental', 'soloOriginal'],
  },
  {
    label: 'Panel Navigation',
    icon: '📂',
    ids: ['showBatchPanel', 'showPlaylistPanel'],
  },
  {
    label: 'Visualizer',
    icon: '🎨',
    ids: ['vizPrevPreset', 'vizNextPreset'],
  },
  {
    label: 'Logo / Object',
    icon: '🖼️',
    ids: ['logoMoveUp', 'logoMoveDown', 'logoMoveLeft', 'logoMoveRight', 'logoMoveUpFast', 'logoMoveDownFast', 'logoMoveLeftFast', 'logoMoveRightFast', 'logoLayerUp', 'logoLayerDown'],
  },
];

export default function KeyboardShortcuts() {
  const shortcuts = useAppStore((s) => s.shortcuts);
  const setShortcut = useAppStore((s) => s.setShortcut);
  const resetShortcuts = useAppStore((s) => s.resetShortcuts);
  const [editingId, setEditingId] = useState(null);
  const captureBtnRef = useRef(null);

  // Global listener for capture mode
  useEffect(() => {
    if (!editingId) return;
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Escape cancels
      if (e.key === 'Escape') {
        setEditingId(null);
        return;
      }
      const combo = captureShortcut(e);
      if (combo) {
        setShortcut(editingId, combo);
        setEditingId(null);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [editingId, setShortcut]);

  const handleStartEdit = useCallback((id) => {
    setEditingId(id);
  }, []);

  return (
    <div>
      {CATEGORIES.map((cat) => (
        <div key={cat.label} style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span>{cat.icon}</span>
            {cat.label}
          </div>

          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            {cat.ids.map((id, idx) => {
              const sc = shortcuts[id];
              if (!sc) return null;
              const isEditing = editingId === id;
              return (
                <div
                  key={id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom: idx < cat.ids.length - 1 ? '1px solid var(--border-color)' : 'none',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
                    {sc.label}
                  </span>
                  <button
                    ref={isEditing ? captureBtnRef : null}
                    onClick={() => handleStartEdit(id)}
                    style={{
                      background: isEditing ? 'rgba(99, 102, 241, 0.25)' : 'var(--bg-primary)',
                      border: isEditing ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                      borderRadius: 6,
                      padding: '4px 12px',
                      fontSize: 12,
                      fontFamily: 'monospace',
                      color: isEditing ? 'var(--primary-color)' : 'var(--text-primary)',
                      cursor: 'pointer',
                      minWidth: 90,
                      textAlign: 'center',
                      outline: 'none',
                      animation: isEditing ? 'pulse-border 1s ease-in-out infinite' : 'none',
                    }}
                  >
                    {isEditing ? '▸ Press a key…' : displayShortcut(sc.keys)}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Reset All */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          className="btn btn-secondary"
          onClick={resetShortcuts}
          style={{ fontSize: 12, padding: '6px 14px' }}
        >
          Reset All to Defaults
        </button>
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse-border {
          0%, 100% { border-color: var(--primary-color); }
          50% { border-color: rgba(99, 102, 241, 0.4); }
        }
      `}</style>
    </div>
  );
}
