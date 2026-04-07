/**
 * VisualizerFrameExporter
 * Sequential Butterchurn rendering: frame-by-frame capture + FFmpeg assembly.
 *
 * Uses butterchurn's render({ elapsedTime }) for frame-precise timing.
 * Audio levels are extracted directly from the AudioBuffer (no real-time needed).
 *
 * Transport modes (raw RGBA, no JPEG encoding):
 *   1. Electron IPC pipe  — window.electronAPI.vizPipeStart available
 *   2. SocketIO pipe      — browser/dev mode, streams to Flask backend via WebSocket
 */

import { io } from 'socket.io-client';
import { fetchArrayBuffer } from './electronTransport';

const API_URL = window.API_URL || 'http://localhost:5000/api';
const SOCKET_URL = API_URL.replace(/\/api$/, '');

// ─── Shared helpers ───────────────────────────────────────────────────

let _cachedButterchurn = null;
let _cachedPresetKeys = null;
let _presetObjCache = {};  // on-demand: name → preset object

async function loadButterchurnModule() {
  if (!_cachedButterchurn) {
    const mod = await import('butterchurn');
    _cachedButterchurn = mod.default || mod;
  }
  return _cachedButterchurn;
}

async function loadPresetKeysFromBackend() {
  if (_cachedPresetKeys) return _cachedPresetKeys;
  try {
    const res = await fetch(`${API_URL}/presets/list`);
    const data = await res.json();
    _cachedPresetKeys = data.presets || [];
    console.log(`[VizExport] ${_cachedPresetKeys.length} presets available from folder`);
  } catch (e) {
    console.error('[VizExport] Failed to load preset list:', e);
    _cachedPresetKeys = [];
  }
  return _cachedPresetKeys;
}

async function loadPresetFromBackend(name) {
  if (_presetObjCache[name]) return _presetObjCache[name];
  try {
    const res = await fetch(`${API_URL}/presets/load/${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const preset = await res.json();
    _presetObjCache[name] = preset;
    return preset;
  } catch (e) {
    console.warn(`[VizExport] Failed to load preset '${name}':`, e.message);
    return null;
  }
}

function resolvePresetName(keys, presetName) {
  if (!keys.length) throw new Error('No Butterchurn presets available');
  if (keys.includes(presetName)) return presetName;
  const fallback = keys[Math.floor(Math.random() * keys.length)];
  console.warn(`[VizExport] Preset '${presetName}' not found, using: ${fallback}`);
  return fallback;
}

/**
 * Safely load a preset into a butterchurn visualizer.
 * Some presets may fail to load. If loading fails, try up to 5 random alternatives.
 */
async function safeLoadPreset(viz, presetKeys, presetName) {
  const preset = await loadPresetFromBackend(presetName);
  if (preset) {
    try {
      viz.loadPreset(preset, 0);
      return presetName;
    } catch (e) {
      console.warn(`[VizExport] Preset '${presetName}' failed to load: ${e.message}`);
    }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const fallbackName = presetKeys[Math.floor(Math.random() * presetKeys.length)];
    const fallback = await loadPresetFromBackend(fallbackName);
    if (!fallback) continue;
    try {
      viz.loadPreset(fallback, 0);
      console.log(`[VizExport] Fallback preset loaded: ${fallbackName}`);
      return fallbackName;
    } catch (e2) {
      console.warn(`[VizExport] Fallback '${fallbackName}' also failed: ${e2.message}`);
    }
  }
  throw new Error('Could not load any Butterchurn preset');
}

async function fetchAndDecodeAudio(audioUrl) {
  console.log(`[VizExport] Fetching audio: ${audioUrl}`);
  const buf = await fetchArrayBuffer(audioUrl);
  console.log(`[VizExport] Audio fetched: ${buf.byteLength} bytes`);

  const tmpCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (tmpCtx.state === 'suspended') await tmpCtx.resume();
  const audioBuffer = await tmpCtx.decodeAudioData(buf);
  await tmpCtx.close();
  console.log(`[VizExport] Decoded: ${audioBuffer.duration.toFixed(1)}s, ${audioBuffer.sampleRate}Hz`);
  return audioBuffer;
}

// ─── Export canvas singleton ──────────────────────────────────────────
// Reuse the same canvas+GL across exports to avoid Chromium GPU resource
// exhaustion that causes context loss on the 2nd+ batch item.
let _exportCanvas = null;
let _exportGl = null;

/**
 * Get or create the export canvas+GL context. Reuses across calls.
 * If the previous context was lost, recreates canvas from scratch.
 */
function getOrCreateExportCanvas(width, height) {
  // Check if existing canvas is still usable
  if (_exportCanvas && _exportGl && !_exportGl.isContextLost()) {
    if (_exportCanvas.width !== width || _exportCanvas.height !== height) {
      _exportCanvas.width = width;
      _exportCanvas.height = height;
    }
    return { canvas: _exportCanvas, gl: _exportGl, reused: true };
  }

  // Need a fresh canvas (first call or context was lost)
  if (_exportCanvas) {
    console.log('[VizExport] Previous export canvas unusable, recreating');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const gl = canvas.getContext('webgl2', {
    preserveDrawingBuffer: true,
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: 'high-performance',
  });

  _exportCanvas = canvas;
  _exportGl = gl;
  return { canvas, gl, reused: false };
}

/**
 * Non-destructive cleanup — release butterchurn resources but keep the
 * canvas+GL context alive for reuse. Do NOT call loseContext().
 */
function cleanupExportViz(viz) {
  // Butterchurn viz holds GPU textures/framebuffers — let GC collect them.
  // The canvas and GL context persist in the module singleton for reuse.
  viz = null;
}

// ─── Main entry point ─────────────────────────────────────────────────

/**
 * Export visualizer as a video file on the backend.
 * @returns {Promise<string>} Server-side path to the assembled video
 */
export async function exportVisualizerVideo({
  audioUrl,
  duration,
  width = 1920,
  height = 1080,
  presetName,
  fps = 30,
  onProgress,
  signal,
}) {
  console.log(`[VizExport] Starting: ${width}x${height}, ${duration}s, fps=${fps}`);

  const butterchurn = await loadButterchurnModule();
  const presetKeys = await loadPresetKeysFromBackend();
  const resolvedName = resolvePresetName(presetKeys, presetName);
  const audioBuffer = await fetchAndDecodeAudio(audioUrl);

  // Always use audioBuffer's actual duration as the ground truth.
  // The store's mediaDuration is unreliable (may be 0 or from partial metadata).
  const actualDuration = audioBuffer.duration;
  const totalFrames = Math.ceil(actualDuration * fps);

  console.log(`[VizExport] Preset: ${resolvedName}, Frames: ${totalFrames}, duration=${actualDuration.toFixed(1)}s (requested=${duration}s)`);

  const opts = { width, height, fps, totalFrames, actualDuration, onProgress, signal };

  if (window.electronAPI?.vizPipeStart) {
    console.log('[VizExport] ★ Electron IPC pipe: raw RGBA → FFmpeg stdin');
    return await renderFramesPipe(butterchurn, presetKeys, resolvedName, audioBuffer, opts);
  }

  console.log('[VizExport] ★ SocketIO pipe: raw RGBA → FFmpeg stdin via WebSocket');
  return await renderFramesPipeSocketIO(butterchurn, presetKeys, resolvedName, audioBuffer, opts);
}

// ─── FFT for offline frequency analysis ──────────────────────────────

/**
 * Compute frequency magnitude spectrum from PCM samples using Cooley-Tukey FFT.
 * Returns Uint8Array[fftSize/2] matching AnalyserNode.getByteFrequencyData() format.
 * This is what butterchurn needs to drive bass/mid/treb/vol preset variables.
 */
function computeFrequencyData(samples, fftSize) {
  const N = fftSize;
  const re = new Float32Array(N);
  const im = new Float32Array(N);

  // Apply Blackman window to reduce spectral leakage
  for (let i = 0; i < N; i++) {
    const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))
                   + 0.08 * Math.cos(4 * Math.PI * i / (N - 1));
    re[i] = (samples[i] || 0) * w;
  }

  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
    }
  }

  // Cooley-Tukey butterfly passes
  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -Math.PI / halfLen;
    const wCos = Math.cos(angle);
    const wSin = Math.sin(angle);
    for (let i = 0; i < N; i += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < halfLen; k++) {
        const ur = re[i + k + halfLen] * wr - im[i + k + halfLen] * wi;
        const ui = re[i + k + halfLen] * wi + im[i + k + halfLen] * wr;
        re[i + k + halfLen] = re[i + k] - ur;
        im[i + k + halfLen] = im[i + k] - ui;
        re[i + k] += ur;
        im[i + k] += ui;
        const newWr = wr * wCos - wi * wSin;
        wi = wr * wSin + wi * wCos;
        wr = newWr;
      }
    }
  }

  // Convert magnitude to byte array, normalised to match AnalyserNode output.
  // Map 0 dB (full scale) → 255, −120 dB (silence) → 0.
  const freqBins = N / 2;
  const freqData = new Uint8Array(freqBins);
  for (let i = 0; i < freqBins; i++) {
    const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / N;
    const db = 20 * Math.log10(Math.max(mag, 1e-8));
    freqData[i] = Math.max(0, Math.min(255, Math.round((db + 120) * (255 / 120))));
  }
  return freqData;
}

// ─── Audio level extraction from AudioBuffer ─────────────────────────

/**
 * Compute audio levels for a specific time from an AudioBuffer.
 * Returns time-domain AND frequency-domain data (Uint8Array[1024] each),
 * matching butterchurn's AudioProcessor.fftSize = 1024.
 * freqByteArray drives bass/mid/treb/vol variables in preset equations.
 */
function getAudioLevelsAtTime(audioBuffer, time) {
  const sampleRate = audioBuffer.sampleRate;
  const startSample = Math.floor(time * sampleRate);
  const windowSize = 1024; // butterchurn's fftSize
  const numChannels = audioBuffer.numberOfChannels;

  // Get channel data references
  const channels = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  const left = new Uint8Array(windowSize);
  const right = new Uint8Array(windowSize);
  const mono = new Uint8Array(windowSize);
  const monoF = new Float32Array(windowSize);

  for (let i = 0; i < windowSize; i++) {
    const idx = startSample + i;
    if (idx >= audioBuffer.length) {
      left[i] = 128;
      right[i] = 128;
      mono[i] = 128;
      // monoF[i] stays 0 (silence)
      continue;
    }

    const L = channels[0][idx];
    const R = numChannels > 1 ? channels[1][idx] : L;
    const M = (L + R) / 2;

    // Convert float [-1, 1] to unsigned byte [0, 255]
    left[i] = Math.max(0, Math.min(255, Math.round((L + 1) * 127.5)));
    right[i] = Math.max(0, Math.min(255, Math.round((R + 1) * 127.5)));
    mono[i] = Math.max(0, Math.min(255, Math.round((M + 1) * 127.5)));
    monoF[i] = M;
  }

  // Compute FFT frequency data — this drives bass/mid/treb/vol in preset equations.
  // We share the mono spectrum for L/R to avoid 3× FFT cost; the difference is subtle.
  const freqByteArray = computeFrequencyData(monoF, windowSize);

  return {
    timeByteArray: mono,
    timeByteArrayL: left,
    timeByteArrayR: right,
    freqByteArray,
    freqByteArrayL: freqByteArray,
    freqByteArrayR: freqByteArray,
  };
}

// ─── Raw stdin pipe rendering (Electron only) ────────────────────────

/**
 * Stream raw RGBA frames directly to FFmpeg via Electron IPC stdin pipe.
 * Eliminates JPEG encoding, HTTP upload, disk write, and FFmpeg JPEG decode per frame.
 * FFmpeg handles vflip (WebGL bottom-up → top-down) in its filter chain.
 */
async function renderFramesPipe(butterchurn, presetKeys, presetName, audioBuffer, opts) {
  const { width, height, fps, totalFrames, actualDuration, onProgress, signal } = opts;
  console.log(`[VizExport:Pipe] Rendering ${totalFrames} frames, ${actualDuration.toFixed(1)}s`);

  // Reuse export canvas singleton to prevent GPU resource exhaustion across batch items
  const { canvas, gl, reused } = getOrCreateExportCanvas(width, height);
  if (reused) {
    console.log('[VizExport:Pipe] Reusing existing export canvas');
    // Small delay to let GPU stabilize after previous export
    await new Promise(r => setTimeout(r, 50));
  }

  let contextLost = false;
  canvas.addEventListener('webglcontextlost', () => {
    contextLost = true;
    console.error('[VizExport:Pipe] ⚠ WebGL context LOST!');
  });

  const viz = butterchurn.createVisualizer(null, canvas, {
    width, height, pixelRatio: 1, textureRatio: 1,
  });
  await safeLoadPreset(viz, presetKeys, presetName);

  // Warm-up: render a few frames before capture so the preset's internal state
  // (warp mesh, motion vectors, per-frame equations) is initialized.
  // Without this, some presets produce a static/frozen output.
  const frameInterval = 1 / fps;
  for (let w = 0; w < 5; w++) {
    const lvl = getAudioLevelsAtTime(audioBuffer, Math.min(w * frameInterval, audioBuffer.duration - 0.01));
    try { viz.render({ elapsedTime: frameInterval, audioLevels: lvl }); } catch {}
  }

  const pixelBuf = new Uint8Array(width * height * 4);

  // Start FFmpeg pipe process (main process computes correct temp dir path)
  const { encoder } = await window.electronAPI.vizPipeStart({ width, height, fps });
  console.log(`[VizExport:Pipe] FFmpeg started: encoder=${encoder}`);

  let capturedFrames = 0;
  let renderErrors = 0;
  let lastPixelHash = 0;
  let frozenCount = 0;
  const t0 = performance.now();

  try {
    for (let i = 0; i < totalFrames; i++) {
      // Abort check
      if (signal?.aborted) {
        await window.electronAPI.vizPipeCancel();
        const abortErr = new Error('Render cancelled by user');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      // Context loss check
      if (contextLost || gl.isContextLost()) {
        contextLost = true;
        console.warn(`[VizExport:Pipe] Context lost at frame ${i}, stopping`);
        break;
      }

      const time = i * frameInterval;
      const audioLevels = getAudioLevelsAtTime(audioBuffer, time);

      // Render frame
      try {
        viz.render({ elapsedTime: frameInterval, audioLevels });
      } catch (e) {
        renderErrors++;
        if (renderErrors <= 5) console.warn(`[VizExport:Pipe] Frame ${i} render error:`, e.message);
        if (gl.isContextLost()) { contextLost = true; break; }
        continue;
      }

      // GPU sync + context loss checks
      if (gl.isContextLost()) { contextLost = true; break; }
      try { gl.finish(); } catch { contextLost = true; break; }
      if (gl.isContextLost()) { contextLost = true; break; }

      // Read raw pixels (RGBA, bottom-up — FFmpeg vflip handles orientation)
      try {
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuf);
      } catch { contextLost = true; break; }

      // Frozen frame detection
      let pixelHash = 0;
      for (let p = 0; p < pixelBuf.length; p += 4001) pixelHash += pixelBuf[p];
      if (pixelHash === lastPixelHash) { frozenCount++; } else { frozenCount = 0; }
      lastPixelHash = pixelHash;

      // Send raw buffer to FFmpeg stdin via IPC (with backpressure)
      await window.electronAPI.vizPipeWrite(pixelBuf.buffer);
      capturedFrames++;

      // Diagnostics every 60 frames
      if (i % 60 === 0) {
        const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
        const fps_actual = (capturedFrames / parseFloat(elapsed)).toFixed(1);
        console.log(`[VizExport:Pipe] Frame ${i}/${totalFrames} | fps=${fps_actual} | frozen=${frozenCount} | ${elapsed}s`);
      }

      // Progress callback
      if (onProgress && i % 30 === 0) {
        onProgress(Math.round((i / totalFrames) * 80));
      }

      // Yield to event loop every 10 frames for UI responsiveness
      if (i % 10 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  } catch (err) {
    // On any error, cancel the pipe (but keep canvas alive for reuse)
    if (err.name !== 'AbortError') {
      try { await window.electronAPI.vizPipeCancel(); } catch {}
    }
    throw err;
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(
    `[VizExport:Pipe] Capture done: ${capturedFrames}/${totalFrames} frames, ` +
    `${renderErrors} errors, contextLost=${contextLost}, frozen=${frozenCount} | ${elapsed}s`
  );

  if (capturedFrames === 0) {
    try { await window.electronAPI.vizPipeCancel(); } catch {}
    throw new Error('Visualizer export failed: no frames captured');
  }

  // Frozen frame threshold: if >50% frames were frozen, warn but still produce output.
  // The backend composites this over the actual background (GIF/image/color),
  // so even a static visualizer overlay is better than no visualizer at all.
  if (frozenCount > totalFrames * 0.5) {
    console.warn(`[VizExport:Pipe] High frozen frame ratio (${frozenCount}/${totalFrames}), output may be static but continuing`);
  }

  if (onProgress) onProgress(85);

  // Close stdin and wait for FFmpeg to finish encoding
  console.log('[VizExport:Pipe] Closing stdin, waiting for FFmpeg...');
  const result = await window.electronAPI.vizPipeEnd();

  if (onProgress) onProgress(100);
  console.log(`[VizExport:Pipe] Video: ${result.videoPath} (${result.fileSizeMB} MB)`);
  return result.videoPath;
}

// ─── SocketIO pipe rendering (browser / dev mode) ────────────────────

/**
 * Stream raw RGBA frames to Flask backend via WebSocket (socket.io).
 * Equivalent to the Electron IPC pipe but works without the Electron API.
 * Backend spawns FFmpeg and pipes the raw stream directly — no JPEG encoding.
 */
async function renderFramesPipeSocketIO(butterchurn, presetKeys, presetName, audioBuffer, opts) {
  const { width, height, fps, totalFrames, actualDuration, onProgress, signal } = opts;
  console.log(`[VizExport:WS] Rendering ${totalFrames} frames, ${actualDuration.toFixed(1)}s`);

  const socket = io(SOCKET_URL, { transports: ['websocket'] });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', (e) => { clearTimeout(timer); reject(e); });
  });

  const { canvas, gl, reused } = getOrCreateExportCanvas(width, height);
  if (reused) {
    console.log('[VizExport:WS] Reusing existing export canvas');
    await new Promise(r => setTimeout(r, 50));
  }

  let contextLost = false;
  canvas.addEventListener('webglcontextlost', () => {
    contextLost = true;
    console.error('[VizExport:WS] ⚠ WebGL context LOST!');
  });

  const viz = butterchurn.createVisualizer(null, canvas, {
    width, height, pixelRatio: 1, textureRatio: 1,
  });
  await safeLoadPreset(viz, presetKeys, presetName);

  // Warm-up: render a few frames before capture so the preset's internal state is initialized
  const frameInterval = 1 / fps;
  for (let w = 0; w < 5; w++) {
    const lvl = getAudioLevelsAtTime(audioBuffer, Math.min(w * frameInterval, audioBuffer.duration - 0.01));
    try { viz.render({ elapsedTime: frameInterval, audioLevels: lvl }); } catch {}
  }

  const pixelBuf = new Uint8Array(width * height * 4);

  const { encoder } = await new Promise((resolve, reject) => {
    socket.emit('viz:pipe:start', { width, height, fps }, (res) => {
      if (res?.error) reject(new Error(res.error));
      else resolve(res);
    });
  });
  console.log(`[VizExport:WS] FFmpeg started: encoder=${encoder}`);

  let capturedFrames = 0;
  let renderErrors = 0;
  let lastPixelHash = 0;
  let frozenCount = 0;
  const t0 = performance.now();

  // Abort if socket disconnects mid-render
  let socketError = null;
  socket.once('disconnect', () => { socketError = new Error('Socket disconnected during render'); });

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) {
        socket.emit('viz:pipe:cancel');
        socket.disconnect();
        const err = new Error('Render cancelled by user');
        err.name = 'AbortError';
        throw err;
      }

      if (socketError) throw socketError;

      if (contextLost || gl.isContextLost()) {
        contextLost = true;
        console.warn(`[VizExport:WS] Context lost at frame ${i}, stopping`);
        break;
      }

      const time = i * frameInterval;
      const audioLevels = getAudioLevelsAtTime(audioBuffer, time);

      try {
        viz.render({ elapsedTime: frameInterval, audioLevels });
      } catch (e) {
        renderErrors++;
        if (renderErrors <= 5) console.warn(`[VizExport:WS] Frame ${i} render error:`, e.message);
        if (gl.isContextLost()) { contextLost = true; break; }
        continue;
      }

      if (gl.isContextLost()) { contextLost = true; break; }
      try { gl.finish(); } catch { contextLost = true; break; }
      if (gl.isContextLost()) { contextLost = true; break; }

      try {
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuf);
      } catch { contextLost = true; break; }

      let pixelHash = 0;
      for (let p = 0; p < pixelBuf.length; p += 4001) pixelHash += pixelBuf[p];
      if (pixelHash === lastPixelHash) { frozenCount++; } else { frozenCount = 0; }
      lastPixelHash = pixelHash;

      // Send raw RGBA frame — ack provides natural backpressure
      await new Promise((resolve, reject) => {
        socket.emit('viz:frame', pixelBuf.buffer, (res) => {
          if (res?.error) reject(new Error(res.error));
          else resolve();
        });
      });
      capturedFrames++;

      if (i % 60 === 0) {
        const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
        const fps_actual = (capturedFrames / parseFloat(elapsed)).toFixed(1);
        console.log(`[VizExport:WS] Frame ${i}/${totalFrames} | fps=${fps_actual} | frozen=${frozenCount} | ${elapsed}s`);
      }

      if (onProgress && i % 30 === 0) {
        onProgress(Math.round((i / totalFrames) * 80));
      }

      if (i % 10 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      try { socket.emit('viz:pipe:cancel'); } catch {}
    }
    socket.disconnect();
    throw err;
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(
    `[VizExport:WS] Capture done: ${capturedFrames}/${totalFrames} frames, ` +
    `${renderErrors} errors, contextLost=${contextLost} | ${elapsed}s`
  );

  if (capturedFrames === 0) {
    try { socket.emit('viz:pipe:cancel'); } catch {}
    socket.disconnect();
    throw new Error('Visualizer export failed: no frames captured');
  }

  if (onProgress) onProgress(85);

  const result = await new Promise((resolve, reject) => {
    socket.emit('viz:pipe:end', (res) => {
      if (res?.error) reject(new Error(res.error));
      else resolve(res);
    });
  });

  socket.disconnect();

  if (onProgress) onProgress(100);
  console.log(`[VizExport:WS] Video: ${result.videoPath} (${result.fileSizeMB} MB)`);
  return result.videoPath;
}
