import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { matchesShortcut } from '../utils/shortcutHelper';
import { fetchFormData } from '../services/electronTransport';
import {
  FiPlus, FiTrash2, FiPlay, FiPause,
  FiSkipBack, FiSkipForward, FiX, FiMusic, FiAlertCircle,
  FiSave, FiMenu, FiDownload, FiUpload
} from 'react-icons/fi';

const API_URL = window.API_URL || 'http://localhost:5000/api';

const PLAYLIST_STORAGE_KEY = 'submaker-playlist';

// Module-level audio singleton — persists across PlaylistPanel mount/unmount/fullscreen cycles
let _audio = null;
function getAudio() {
  if (!_audio) {
    _audio = new Audio();
    _audio.preload = 'auto';
  }
  return _audio;
}

/**
 * PlaylistPanel — Karaoke playlist player for SYLT-embedded MP3s.
 * Features: multi-add, save/load, drag reorder, double-click to play.
 */
export default function PlaylistPanel() {
  const {
    playlist,
    addToPlaylist,
    removeFromPlaylist,
    reorderPlaylist,
    setCurrentTrack,
    nextTrack,
    prevTrack,
    setPlaylistPlaying,
    setPlaylistPlaybackTime,
    clearPlaylist,
    savePlaylist,
    settings,
  } = useAppStore();

  const audioRef = useRef(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [addProgress, setAddProgress] = useState(''); // e.g. "3/10"

  // Drag reorder state
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  // Single-click selection (navigation without playing)
  const [selectedIdx, setSelectedIdx] = useState(null);

  const { tracks, currentTrackIndex, isActive, isPlaying, playbackTime } = playlist;
  const currentTrack = currentTrackIndex >= 0 ? tracks[currentTrackIndex] : null;

  // ---------- Audio element management — use module singleton ----------
  useEffect(() => {
    audioRef.current = getAudio();
    // No cleanup: singleton persists across mount/unmount cycles (fullscreen)
  }, []);

  // Load track into audio element when currentTrack changes
  useEffect(() => {
    const audio = getAudio();
    audioRef.current = audio;

    if (!currentTrack) {
      audio.pause();
      audio.src = '';
      audio._loadedTrackId = null;
      setPlaylistPlaying(false);
      return;
    }

    // Skip reload if this track is already loaded (remount/collapse guard)
    if (audio._loadedTrackId === currentTrack.id) {
      if (audio.paused && !audio.ended) {
        // Paused mid-track after remount — do NOT auto-resume, preserve pause state
      }
      return;
    }

    // Pause main video/audio before starting playlist
    useAppStore.getState().setIsPlaying(false);

    const url = `http://localhost:5000/api/media/local?path=${encodeURIComponent(currentTrack.path)}`;
    audio._loadedTrackId = currentTrack.id;
    audio.src = url;
    audio.load();
    audio.play().then(() => setPlaylistPlaying(true)).catch(() => {});
  }, [currentTrack?.id]);

  // Sync play/pause from store
  useEffect(() => {
    const audio = getAudio();
    audioRef.current = audio;
    if (!currentTrack) return;
    if (isPlaying && audio.paused) {
      audio.play().catch(() => {});
    } else if (!isPlaying && !audio.paused) {
      audio.pause();
    }
  }, [isPlaying, currentTrack?.id]);

  // Time update + auto-advance
  useEffect(() => {
    const audio = getAudio();
    const onTimeUpdate = () => setPlaylistPlaybackTime(audio.currentTime);
    const onEnded = () => {
      const state = useAppStore.getState();
      const { tracks: t, currentTrackIndex: idx } = state.playlist;
      if (idx + 1 < t.length) {
        nextTrack();
      } else {
        setPlaylistPlaying(false);
      }
    };
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  // ---------- Load saved playlist on mount ----------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLAYLIST_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved) || saved.length === 0) return;
      // Only load if playlist is currently empty
      if (useAppStore.getState().playlist.tracks.length > 0) return;

      (async () => {
        for (const item of saved) {
          if (!item.path) continue;
          await useAppStore.getState().addToPlaylist(item.path);
        }
      })();
    } catch {}
  }, []);

  // ---------- Auto-save playlist when tracks change ----------
  useEffect(() => {
    if (tracks.length === 0) {
      localStorage.removeItem(PLAYLIST_STORAGE_KEY);
      return;
    }
    const serializable = tracks.map(t => ({ path: t.path, title: t.title, duration: t.duration, syltEntries: t.syltEntries }));
    try {
      localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(serializable));
    } catch {}
  }, [tracks]);

  // ---------- Keyboard shortcuts ----------
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      const state = useAppStore.getState().playlist;
      const sc = useAppStore.getState().shortcuts;

      if (matchesShortcut(e, sc.nextTrack.keys)) {
        if (state.tracks.length === 0) return;
        e.preventDefault();
        nextTrack();
        return;
      }
      if (matchesShortcut(e, sc.prevTrack.keys)) {
        if (state.tracks.length === 0) return;
        e.preventDefault();
        prevTrack();
        return;
      }

      if (matchesShortcut(e, sc.playPause.keys) && state.isActive) {
        e.preventDefault();
        const audio = getAudio();
        if (audio.paused) {
          audio.play().then(() => setPlaylistPlaying(true)).catch(() => {});
        } else {
          audio.pause();
          setPlaylistPlaying(false);
        }
        return;
      }

      // Also handle Space when tracks exist but nothing is active yet — start first track
      if (matchesShortcut(e, sc.playPause.keys) && !state.isActive && state.tracks.length > 0 && !useAppStore.getState().mediaFile) {
        e.preventDefault();
        setCurrentTrack(0);
        return;
      }

      if (state.isActive && !e.ctrlKey) {
        const step = settings?.seekStep ?? 5;
        if (matchesShortcut(e, sc.seekBackward.keys)) {
          e.preventDefault();
          const audio = getAudio();
          audio.currentTime = Math.max(0, audio.currentTime - step);
        } else if (matchesShortcut(e, sc.seekForward.keys)) {
          e.preventDefault();
          const audio = getAudio();
          audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + step);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [nextTrack, prevTrack, setPlaylistPlaying, settings?.seekStep]);

  // ---------- Upload a File object to backend, return temp path ----------
  const uploadFileToBackend = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const data = await fetchFormData(`${API_URL}/upload`, formData);
    return data.filePath; // absolute temp path on backend
  }, []);

  // ---------- File picker (multi-select) ----------
  const handleAddMP3 = useCallback(async () => {
    setError(null);
    setAdding(true);
    setAddProgress('');
    try {
      if (window.electronAPI?.openFile) {
        // Electron native dialog — returns absolute paths directly
        const result = await window.electronAPI.openFile({
          filters: [{ name: 'MP3 Files', extensions: ['mp3'] }],
          properties: ['openFile', 'multiSelections'],
        });
        if (!result || result.canceled || !result.filePaths?.length) {
          setAdding(false);
          return;
        }
        const total = result.filePaths.length;
        let errors = [];
        for (let i = 0; i < total; i++) {
          setAddProgress(`${i + 1}/${total}`);
          const res = await addToPlaylist(result.filePaths[i]);
          if (res.error) errors.push(`${result.filePaths[i].split(/[\\/]/).pop()}: ${res.error}`);
        }
        if (errors.length > 0) {
          setError(errors.join(' | '));
        }
      } else {
        // Web fallback — use hidden file input, upload to backend temp
        await new Promise((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.mp3,audio/mpeg';
          input.multiple = true;
          input.onchange = async () => {
            const files = Array.from(input.files || []);
            if (files.length === 0) { resolve(); return; }
            const total = files.length;
            let errors = [];
            for (let i = 0; i < total; i++) {
              setAddProgress(`${i + 1}/${total}`);
              try {
                const tempPath = await uploadFileToBackend(files[i]);
                const res = await addToPlaylist(tempPath);
                if (res.error) errors.push(`${files[i].name}: ${res.error}`);
              } catch (err) {
                errors.push(`${files[i].name}: ${err.message}`);
              }
            }
            if (errors.length > 0) {
              setError(errors.join(' | '));
            }
            resolve();
          };
          // Handle cancel (no selection)
          input.addEventListener('cancel', () => resolve());
          input.click();
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
      setAddProgress('');
    }
  }, [addToPlaylist, uploadFileToBackend]);

  // ---------- Drag reorder handlers ----------
  const handleDragStart = useCallback((e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    if (e.currentTarget) e.currentTarget.style.opacity = '0.4';
  }, []);

  const handleDragEnd = useCallback((e) => {
    if (e.currentTarget) e.currentTarget.style.opacity = '1';
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);

  const handleDragOver = useCallback((e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (idx !== dragOverIdx) setDragOverIdx(idx);
  }, [dragOverIdx]);

  const handleDrop = useCallback((e, targetIdx) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== targetIdx) {
      reorderPlaylist(dragIdx, targetIdx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx, reorderPlaylist]);

  // ---------- Double-click to play ----------
  const handleTrackDoubleClick = useCallback((idx) => {
    const state = useAppStore.getState().playlist;
    if (state.currentTrackIndex === idx) {
      // Same track — restart from beginning
      const audio = getAudio();
      audio.currentTime = 0;
      audio.play().then(() => setPlaylistPlaying(true)).catch(() => {});
    } else {
      setCurrentTrack(idx);
    }
  }, [setCurrentTrack, setPlaylistPlaying]);

  // ---------- Controls ----------
  const togglePlay = useCallback(() => {
    const state = useAppStore.getState().playlist;
    if (!state.tracks[state.currentTrackIndex]) {
      if (state.tracks.length > 0) setCurrentTrack(0);
      return;
    }
    const audio = getAudio();
    if (audio.paused) {
      audio.play().then(() => setPlaylistPlaying(true)).catch(() => {});
    } else {
      audio.pause();
      setPlaylistPlaying(false);
    }
  }, [setCurrentTrack, setPlaylistPlaying]);

  // ---------- Format time ----------
  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ---------- Export M3U ----------
  const handleExportM3U = useCallback(async () => {
    if (tracks.length === 0) return;

    const lines = ['#EXTM3U'];
    for (const t of tracks) {
      const dur = Math.round(t.duration || -1);
      lines.push(`#EXTINF:${dur},${t.title}`);
      lines.push(t.path);
    }
    const content = lines.join('\r\n');

    try {
      if (window.electronAPI?.saveWithDialog) {
        await window.electronAPI.saveWithDialog({
          defaultPath: 'playlist.m3u',
          filters: [{ name: 'M3U Playlist', extensions: ['m3u'] }],
          content,
        });
      } else {
        // Web fallback — download via blob
        const blob = new Blob([content], { type: 'audio/x-mpegurl' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'playlist.m3u';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError('Export failed: ' + err.message);
    }
  }, [tracks]);

  // ---------- Import M3U ----------
  const handleImportM3U = useCallback(async () => {
    const parseM3U = async (text) => {
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const paths = [];
      for (const line of lines) {
        if (line.startsWith('#')) continue; // comment/directive
        paths.push(line);
      }
      return paths;
    };

    const addPaths = async (paths) => {
      setAdding(true);
      const total = paths.length;
      let errors = [];
      for (let i = 0; i < total; i++) {
        setAddProgress(`${i + 1}/${total}`);
        const res = await addToPlaylist(paths[i]);
        if (res?.error) errors.push(`${paths[i].split(/[\\/]/).pop()}: ${res.error}`);
      }
      if (errors.length > 0) setError(errors.join(' | '));
      setAdding(false);
      setAddProgress('');
    };

    try {
      if (window.electronAPI?.openFile) {
        const result = await window.electronAPI.openFile({
          filters: [{ name: 'M3U Playlist', extensions: ['m3u', 'm3u8'] }],
          properties: ['openFile'],
        });
        if (!result || result.canceled || !result.filePaths?.length) return;
        // Read file via IPC in Electron, fallback to backend API
        let text;
        if (window.electronAPI?.readTextFile) {
          text = await window.electronAPI.readTextFile(result.filePaths[0]);
        } else {
          const resp = await fetch(`${API_URL}/media/read-text?path=${encodeURIComponent(result.filePaths[0])}`);
          if (!resp.ok) throw new Error('Could not read file');
          text = await resp.text();
        }
        const paths = await parseM3U(text);
        await addPaths(paths);
      } else {
        // Web fallback
        await new Promise((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.m3u,.m3u8';
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) { resolve(); return; }
            const text = await file.text();
            const paths = await parseM3U(text);
            await addPaths(paths);
            resolve();
          };
          input.addEventListener('cancel', () => resolve());
          input.click();
        });
      }
    } catch (err) {
      setError('Import failed: ' + err.message);
    }
  }, [addToPlaylist]);

  // ---------- Render ----------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn btn-sm"
          onClick={handleAddMP3}
          disabled={adding}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, padding: '4px 8px' }}
        >
          <FiPlus size={12} />
          {adding ? (addProgress ? `Adding ${addProgress}...` : 'Adding...') : 'Add MP3'}
        </button>
        <button
          className="btn btn-sm"
          onClick={handleImportM3U}
          disabled={adding}
          title="Import M3U playlist"
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px' }}
        >
          <FiUpload size={11} />
        </button>
        {tracks.length > 0 && (
          <button
            className="btn btn-sm"
            onClick={handleExportM3U}
            title="Export M3U playlist"
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px' }}
          >
            <FiDownload size={11} />
          </button>
        )}
        {tracks.length > 0 && (
          <button
            className="btn btn-sm"
            onClick={clearPlaylist}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px', color: 'var(--text-secondary)' }}
            title="Clear playlist"
          >
            <FiTrash2 size={11} />
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 11, color: 'var(--error)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <FiAlertCircle size={11} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 0 }}>
            <FiX size={10} />
          </button>
        </div>
      )}

      {/* Track list */}
      {tracks.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 1,
          maxHeight: 200, overflowY: 'auto',
          border: '1px solid var(--border-color)', borderRadius: 4,
          padding: 3,
        }}>
          {tracks.map((track, idx) => {
            const isCurrent = idx === currentTrackIndex;
            const isSelected = idx === selectedIdx;
            const isDragOver = idx === dragOverIdx && dragIdx !== null && dragIdx !== idx;
            return (
              <div
                key={track.id}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onClick={() => setSelectedIdx(idx)}
                onDoubleClick={() => handleTrackDoubleClick(idx)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 4px', borderRadius: 3, cursor: 'default',
                  fontSize: 11,
                  background: isCurrent
                    ? 'var(--accent-primary-alpha, rgba(0,120,255,0.15))'
                    : isSelected
                    ? 'var(--bg-tertiary)'
                    : 'transparent',
                  color: isCurrent ? 'var(--accent-primary)' : 'var(--text-primary)',
                  outline: isSelected && !isCurrent ? '1px solid var(--border-color)' : 'none',
                  borderTop: isDragOver ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  transition: 'border-color 0.1s',
                  userSelect: 'none',
                }}
              >
                {/* Drag handle */}
                <span style={{ cursor: 'grab', opacity: 0.35, display: 'flex', flexShrink: 0 }} title="Drag to reorder">
                  <FiMenu size={10} />
                </span>
                {/* Track number */}
                <span style={{ width: 16, textAlign: 'right', opacity: 0.4, fontSize: 10, flexShrink: 0 }}>
                  {idx + 1}
                </span>
                {/* Playing indicator or music icon */}
                {isCurrent && isPlaying ? (
                  <span style={{ flexShrink: 0, color: 'var(--accent-primary)', display: 'flex' }}>
                    <FiPlay size={9} />
                  </span>
                ) : (
                  <FiMusic size={9} style={{ flexShrink: 0, opacity: 0.4 }} />
                )}
                {/* Title */}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}
                  title={track.title + (track.hasSylt ? ' (SYLT)' : '')}
                >
                  {track.title}
                  {track.hasSylt && (
                    <span style={{ fontSize: 8, background: 'var(--accent-primary)', color: '#fff', borderRadius: 2, padding: '0 3px', lineHeight: '14px', flexShrink: 0 }}>
                      SYLT
                    </span>
                  )}
                </span>
                {/* Duration */}
                <span style={{ opacity: 0.4, fontSize: 10, flexShrink: 0 }}>
                  {formatTime(track.duration)}
                </span>
                {/* Remove */}
                <button
                  onClick={(e) => { e.stopPropagation(); removeFromPlaylist(track.id); setSelectedIdx(prev => prev === idx ? null : prev); }}
                  style={{ background: 'none', border: 'none', padding: 1, cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', opacity: 0.5 }}
                  title="Remove"
                >
                  <FiX size={10} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Mini player controls */}
      {tracks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Now playing */}
          {currentTrack && (
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentTrackIndex + 1}/{tracks.length} — {currentTrack.title}
            </div>
          )}

          {/* Progress bar */}
          {currentTrack && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-secondary)' }}>
              <span style={{ width: 30, textAlign: 'right' }}>{formatTime(playbackTime)}</span>
              <div
                style={{ flex: 1, height: 3, background: 'var(--border-color)', borderRadius: 2, cursor: 'pointer', position: 'relative' }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  const audio = getAudio();
                  if (currentTrack) {
                    audio.currentTime = pct * (currentTrack.duration || audio.duration || 0);
                  }
                }}
              >
                <div style={{
                  width: `${currentTrack.duration ? (playbackTime / currentTrack.duration) * 100 : 0}%`,
                  height: '100%', background: 'var(--accent-primary)', borderRadius: 2,
                }} />
              </div>
              <span style={{ width: 30 }}>{formatTime(currentTrack.duration)}</span>
            </div>
          )}

          {/* Transport buttons */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            <button
              className="btn btn-sm"
              onClick={() => prevTrack()}
              title="Previous (Ctrl+←)"
              style={{ padding: '3px 6px', fontSize: 11, display: 'flex', alignItems: 'center' }}
            >
              <FiSkipBack size={12} />
            </button>
            <button
              className="btn btn-sm"
              onClick={togglePlay}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              style={{ padding: '3px 10px', fontSize: 11, display: 'flex', alignItems: 'center' }}
            >
              {isPlaying ? <FiPause size={14} /> : <FiPlay size={14} />}
            </button>
            <button
              className="btn btn-sm"
              onClick={() => nextTrack()}
              title="Next (Ctrl+→)"
              style={{ padding: '3px 6px', fontSize: 11, display: 'flex', alignItems: 'center' }}
            >
              <FiSkipForward size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {tracks.length === 0 && !adding && (
        <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, color: 'var(--text-secondary)', opacity: 0.7 }}>
          <FiMusic size={16} style={{ marginBottom: 4, display: 'block', margin: '0 auto 4px' }} />
          Add SYLT-embedded MP3 files for karaoke playback
        </div>
      )}
    </div>
  );
}
