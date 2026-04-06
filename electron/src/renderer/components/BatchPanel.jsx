import React, { useState, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { fetchJson } from '../services/electronTransport';
import {
  FiPlus, FiTrash2, FiPlay, FiSquare, FiX,
  FiMusic, FiCheck, FiAlertCircle, FiLoader,
  FiMenu, FiClock, FiPause,
  FiTag,
} from 'react-icons/fi';

const API_URL = window.API_URL || 'http://localhost:5000/api';

// Filled toggle switch — green when on, gray when off
const Toggle = ({ enabled, onClick }) => (
  <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0 }}>
    <svg width="36" height="20" viewBox="0 0 36 20">
      <rect x="0" y="0" width="36" height="20" rx="10"
        fill={enabled ? 'rgb(34, 197, 94)' : 'rgba(255,255,255,0.15)'} />
      <circle cx={enabled ? 26 : 10} cy="10" r="7"
        fill="#fff" />
    </svg>
  </button>
);

// ─── Component ──────────────────────────────────────────────────────

export default function BatchPanel() {
  const {
    batch,
    addToBatchQueue,
    removeFromBatchQueue,
    reorderBatchQueue,
    clearBatchQueue,
    startBatch,
    cancelBatch,
    resumeBatch,
    setStepMode,
    setBatchAudioSource,
    setBatchEmbedId3,
    setVocalIsolation,
    vocalIsolation,
    secondarySubtitle,
    selectedFormats,
  } = useAppStore();

  const { queue, isRunning, stepMode, pausedForReview, pausedItemId, audioSource, embedId3 } = batch;

  // Local UI state
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [adding, setAdding] = useState(false);

  // ─── File add ─────────────────────────────────────────────────────

  const handleAddFiles = useCallback(async () => {
    setAdding(true);
    try {
      if (window.electronAPI?.openFile) {
        const result = await window.electronAPI.openFile({
          title: 'Select media files for batch',
          filters: [{ name: 'Media', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'mp4', 'mkv', 'avi', 'mov', 'webm'] }],
          multiSelections: true,
        });
        const paths = result?.filePaths || [];
        console.log('[Batch] Dialog returned paths:', paths);
        if (paths.length && !result.canceled) {
          addToBatchQueue(paths);
        }
      } else {
        try {
          const res = await fetchJson(`${API_URL}/batch/pick-files`, { method: 'POST' });
          const paths = res?.paths || [];
          console.log('[Batch] Backend dialog returned paths:', paths);
          if (paths.length) addToBatchQueue(paths);
        } catch (err) {
          console.error('[Batch] Backend file picker failed:', err.message);
        }
      }
    } catch (err) {
      console.error('[Batch] Add files error:', err);
    }
    setAdding(false);
  }, [addToBatchQueue]);

  // ─── Drag reorder ─────────────────────────────────────────────────

  const handleDragStart = useCallback((e, idx) => {
    if (isRunning) return;
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    e.currentTarget.style.opacity = '0.4';
  }, [isRunning]);

  const handleDragEnd = useCallback((e) => {
    e.currentTarget.style.opacity = '1';
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
      reorderBatchQueue(dragIdx, targetIdx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx, reorderBatchQueue]);

  // ─── Helpers ──────────────────────────────────────────────────────

  const statusIcon = (status) => {
    switch (status) {
      case 'pending': return <FiClock size={14} className="batch-icon-pending" />;
      case 'processing': return <FiLoader size={14} className="batch-icon-processing spin" />;
      case 'completed': return <FiCheck size={14} className="batch-icon-completed" />;
      case 'failed': return <FiAlertCircle size={14} className="batch-icon-failed" />;
      default: return <FiMusic size={14} />;
    }
  };

  const completedCount = queue.filter(q => q.status === 'completed').length;
  const failedCount = queue.filter(q => q.status === 'failed').length;
  const pendingCount = queue.filter(q => q.status === 'pending').length;

  // ─── File drop on batch panel ─────────────────────────────────

  const handleFileDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isRunning) return;

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    let preloadPaths = [];
    if (window.electronAPI?.getDroppedPaths) {
      preloadPaths = window.electronAPI.getDroppedPaths();
    }

    const isAbs = (p) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\') || p.startsWith('/');
    const paths = [];
    const unresolvedNames = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (preloadPaths[i] && isAbs(preloadPaths[i])) {
        paths.push(preloadPaths[i]);
        continue;
      }
      if (file.path && isAbs(file.path)) {
        paths.push(file.path);
        continue;
      }
      if (file.path && window.electronAPI?.resolvePath) {
        try {
          const resolved = await window.electronAPI.resolvePath(file.path);
          if (isAbs(resolved)) { paths.push(resolved); continue; }
        } catch {}
      }
      unresolvedNames.push(file.name);
    }

    if (unresolvedNames.length > 0 && paths.length === 0) {
      console.log('[Batch] No absolute paths resolved from drop, opening backend file picker...');
      try {
        const res = await fetchJson(`${API_URL}/batch/pick-files`, { method: 'POST' });
        const backendPaths = res?.paths || [];
        if (backendPaths.length) {
          paths.push(...backendPaths);
        }
      } catch (err) {
        console.error('[Batch] Backend file picker failed:', err.message);
      }
    }

    console.log('[Batch] Drop resolved', paths.length, 'paths from', files.length, 'files:', paths);
    if (paths.length) addToBatchQueue(paths);
  }, [isRunning, addToBatchQueue]);

  const handleDragOverPanel = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="batch-panel" onDrop={handleFileDrop} onDragOver={handleDragOverPanel}>
      {/* Header bar */}
      <div className="batch-header-bar">
        <span className="batch-count">
          {queue.length} file{queue.length !== 1 ? 's' : ''}
          {isRunning && ` — ${completedCount}/${queue.length} done`}
        </span>
        <div className="batch-header-actions">
          <button
            className="btn-icon-sm"
            onClick={handleAddFiles}
            disabled={isRunning || adding}
            title="Add files"
          >
            <FiPlus size={14} />
          </button>
          <button
            className="btn-icon-sm"
            onClick={clearBatchQueue}
            disabled={isRunning || !queue.length}
            title="Clear all"
          >
            <FiTrash2 size={14} />
          </button>
        </div>
      </div>

      {/* File queue */}
      <div className="batch-queue">
        {queue.length === 0 && (
          <div className="batch-empty">
            <FiMusic size={24} style={{ opacity: 0.3 }} />
            <span>Drop multiple files or click + to add</span>
          </div>
        )}
        {queue.map((item, idx) => (
          <div
            key={item.id}
            className={`batch-item ${item.status} ${dragOverIdx === idx ? 'drag-over' : ''} ${isRunning && item.status === 'processing' ? 'active' : ''}`}
            draggable={!isRunning}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
          >
            <span className="batch-item-grip" title="Drag to reorder">
              <FiMenu size={12} />
            </span>
            {statusIcon(item.status)}
            <span className="batch-item-name" title={item.filePath}>
              {item.fileName}
            </span>
            {item.status === 'processing' && pausedForReview && pausedItemId === item.id ? (
              <span className="batch-item-progress" style={{ color: 'rgb(251, 191, 36)' }}>⏸ Review</span>
            ) : item.status === 'processing' ? (
              <span className="batch-item-progress">{item.progress}%</span>
            ) : null}
            {item.status === 'failed' && (
              <span className="batch-item-error" title={item.error}>!</span>
            )}
            {!isRunning && (
              <button
                className="batch-item-remove"
                onClick={() => removeFromBatchQueue(item.id)}
                title="Remove"
              >
                <FiX size={12} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Batch progress summary (when running) */}
      {isRunning && (
        <div className="batch-progress-summary">
          <div className="batch-progress-bar">
            <div
              className="batch-progress-fill"
              style={{ width: `${queue.length ? (completedCount / queue.length * 100) : 0}%` }}
            />
          </div>
          <span className="batch-progress-text">
            {completedCount}/{queue.length}{failedCount > 0 ? ` (${failedCount} failed)` : ''}
          </span>
        </div>
      )}

      {/* Step summary — shows what batch will do based on current settings */}
      {!isRunning && queue.length > 0 && (
        <div className="batch-info-note" style={{ padding: '8px 10px', fontSize: '11px', opacity: 0.7 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
            {vocalIsolation && (
              <span style={{ color: 'rgb(168, 85, 247)' }}>🎤 Vocal Isolation</span>
            )}
            <span>📝 Transcribe</span>
            {stepMode && <span style={{ color: 'rgb(251, 191, 36)' }}>⏸ Review</span>}
            {secondarySubtitle.targetLanguage !== 'none' && (
              <span>🌐 Translate → {secondarySubtitle.targetLanguage.toUpperCase()}</span>
            )}
            <span>🎬 Render ({selectedFormats.join(', ')})</span>
            {audioSource === 'instrumental' && (
              <span style={{ color: 'rgb(59, 130, 246)' }}>🎵 Karaoke (-krk)</span>
            )}
            {embedId3 && (
              <span style={{ color: 'rgb(16, 185, 129)' }}>🏷️ Embed ID3</span>
            )}
          </div>
        </div>
      )}

      {/* Batch options toggles */}
      {!isRunning && queue.length > 0 && (
        <div style={{ padding: '4px 10px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Pause for review */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <FiPause size={13} style={{ color: stepMode ? 'rgb(251, 191, 36)' : 'inherit' }} />
              Pause after transcription for review
            </span>
            <Toggle enabled={stepMode} onClick={() => setStepMode(!stepMode)} />
          </div>

          {/* Karaoke render */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <FiMusic size={13} style={{ color: audioSource === 'instrumental' ? 'rgb(59, 130, 246)' : 'inherit' }} />
              Render with Instrumental (Karaoke -krk)
            </span>
            <Toggle
              enabled={audioSource === 'instrumental'}
              onClick={() => {
                const next = audioSource !== 'instrumental';
                setBatchAudioSource(next ? 'instrumental' : 'original');
                // Toggle vocal isolation: enable if turning on, disable if both off
                if (next) {
                  setVocalIsolation(true);
                } else if (!embedId3) {
                  setVocalIsolation(false);
                }
              }}
            />
          </div>

          {/* Embed ID3 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <FiTag size={13} style={{ color: embedId3 ? 'rgb(16, 185, 129)' : 'inherit' }} />
              Embed lyrics to MP3 (ID3)
            </span>
            <Toggle enabled={embedId3} onClick={() => {
              const next = !embedId3;
              setBatchEmbedId3(next);
              // Toggle vocal isolation: enable if turning on, disable if both off
              if (next) {
                setVocalIsolation(true);
              } else if (audioSource !== 'instrumental') {
                setVocalIsolation(false);
              }
            }} />
          </div>
        </div>
      )}

      {/* Paused for review — user can edit subtitles then continue */}
      {pausedForReview && (
        <div style={{
          padding: '10px 12px',
          background: 'rgba(251, 191, 36, 0.08)',
          border: '1px solid rgba(251, 191, 36, 0.3)',
          borderRadius: 6,
          margin: '4px 8px 8px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 12, color: 'rgb(251, 191, 36)', fontWeight: 600, marginBottom: 6 }}>
            ⏸ Batch paused — review subtitles
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
            {queue.find(q => q.id === pausedItemId)?.fileName || 'Current file'} — edit subtitles in the editor, then continue.
          </div>
          <button
            onClick={resumeBatch}
            style={{
              padding: '6px 20px',
              background: 'rgb(251, 191, 36)',
              color: '#000',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <FiPlay size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            Continue Batch
          </button>
        </div>
      )}

      {/* Batch results (after completion) */}
      {!isRunning && failedCount > 0 && (
        <div className="batch-results">
          <div className="batch-results-header">
            <FiAlertCircle size={14} /> {failedCount} failed
          </div>
          {queue.filter(q => q.status === 'failed').map(q => (
            <div key={q.id} className="batch-result-item failed">
              <span>{q.fileName}</span>
              <span className="batch-result-error" title={q.error}>{q.error}</span>
            </div>
          ))}
        </div>
      )}

      {/* Start / Cancel button */}
      <div className="batch-action">
        {isRunning ? (
          <button className="batch-btn-main cancel" onClick={cancelBatch}>
            <FiSquare size={16} /> Cancel Batch
          </button>
        ) : (
          <button
            className="batch-btn-main start"
            onClick={startBatch}
            disabled={!queue.some(q => q.status === 'pending' || q.status === 'failed')}
          >
            <FiPlay size={16} /> Start Batch ({pendingCount + failedCount})
          </button>
        )}
      </div>
    </div>
  );
}
