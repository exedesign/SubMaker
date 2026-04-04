/**
 * VisualizerFrameExporter
 * Sequential Butterchurn rendering: frame-by-frame capture + FFmpeg assembly.
 *
 * Uses butterchurn's render({ elapsedTime }) for frame-precise timing.
 * Audio levels are extracted directly from the AudioBuffer (no real-time needed).
 * Frames are batch-uploaded to the backend and assembled by FFmpeg (NVENC).
 *
 * Works identically in both Electron and browser (same engine, same API).
 */

import { fetchJson, fetchArrayBuffer, fetchFormData } from './electronTransport';

const API_URL = window.API_URL || 'http://localhost:5000/api';
const FRAME_BATCH_SIZE = 90;

// ─── Shared helpers ───────────────────────────────────────────────────

let _cachedValid = null;

/**
 * Test if a preset's equation strings can be compiled by new Function().
 * This is what butterchurn does internally — no WebGL needed.
 */
function isPresetValid(preset) {
  try {
    const strs = [preset.init_eqs_str, preset.frame_eqs_str, preset.pixel_eqs_str];
    for (const s of strs) {
      if (s && s !== '') new Function('a', s + ' return a;');
    }
    if (preset.shapes) {
      for (const shape of preset.shapes) {
        if (shape.init_eqs_str) new Function('a', shape.init_eqs_str + ' return a;');
        if (shape.frame_eqs_str) new Function('a', shape.frame_eqs_str + ' return a;');
      }
    }
    if (preset.waves) {
      for (const wave of preset.waves) {
        if (wave.init_eqs_str) new Function('a', wave.init_eqs_str + ' return a;');
        if (wave.frame_eqs_str) new Function('a', wave.frame_eqs_str + ' return a;');
        if (wave.point_eqs_str && wave.point_eqs_str !== '') new Function('a', wave.point_eqs_str + ' return a;');
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function loadButterchurnPresets() {
  if (_cachedValid) return _cachedValid;

  const butterchurnMod = await import('butterchurn');
  const butterchurn = butterchurnMod.default || butterchurnMod;
  const presetsMod = await import('butterchurn-presets');
  const src = presetsMod.default || presetsMod;
  let allPresets;
  if (typeof src.getPresets === 'function') allPresets = src.getPresets();
  else if (typeof src === 'function') { try { allPresets = src(); } catch { allPresets = src; } }
  else allPresets = src;

  // Filter out presets with broken equation strings
  const presets = {};
  const allKeys = Object.keys(allPresets);
  for (const name of allKeys) {
    if (isPresetValid(allPresets[name])) {
      presets[name] = allPresets[name];
    }
  }

  console.log(`[VizExport] Validated presets: ${Object.keys(presets).length}/${allKeys.length}`);
  _cachedValid = { butterchurn, presets };
  return _cachedValid;
}

function resolvePreset(presets, presetName) {
  const keys = Object.keys(presets);
  if (!keys.length) throw new Error('No Butterchurn presets available');
  let name = presetName;
  let preset = presets[name];
  if (!preset) {
    name = keys[Math.floor(Math.random() * keys.length)];
    preset = presets[name];
    console.warn(`[VizExport] Preset '${presetName}' not found, using: ${name}`);
  }
  return { preset, name };
}

/**
 * Safely load a preset into a butterchurn visualizer.
 * Some presets contain invalid JS that causes SyntaxError in new Function().
 * If loading fails, try up to 5 random alternatives.
 */
function safeLoadPreset(viz, presets, preset, name) {
  try {
    viz.loadPreset(preset, 0);
    return name;
  } catch (e) {
    console.warn(`[VizExport] Preset '${name}' failed to load: ${e.message}`);
  }
  const keys = Object.keys(presets);
  for (let attempt = 0; attempt < 5; attempt++) {
    const fallbackName = keys[Math.floor(Math.random() * keys.length)];
    try {
      viz.loadPreset(presets[fallbackName], 0);
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

function cleanupWebGL(canvas) {
  try {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {}
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

  const { butterchurn, presets } = await loadButterchurnPresets();
  const { preset, name } = resolvePreset(presets, presetName);
  const audioBuffer = await fetchAndDecodeAudio(audioUrl);

  // Always use audioBuffer's actual duration as the ground truth.
  // The store's mediaDuration is unreliable (may be 0 or from partial metadata).
  const actualDuration = audioBuffer.duration;
  const totalFrames = Math.ceil(actualDuration * fps);

  console.log(`[VizExport] Preset: ${name}, Frames: ${totalFrames}, duration=${actualDuration.toFixed(1)}s (requested=${duration}s)`);

  return await renderFrames(butterchurn, presets, preset, name, audioBuffer, {
    width, height, fps, totalFrames, actualDuration, onProgress, signal,
  });
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

// ─── Sequential frame rendering ──────────────────────────────────────

async function renderFrames(butterchurn, presets, preset, presetName, audioBuffer, opts) {
  const { width, height, fps, totalFrames, actualDuration, onProgress, signal } = opts;
  console.log(`[VizExport] Rendering ${totalFrames} frames, ${actualDuration.toFixed(1)}s`);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  // Pre-create WebGL2 context WITH preserveDrawingBuffer before butterchurn gets it.
  // Use powerPreference: 'high-performance' to hint the GPU and reduce context loss.
  const gl = canvas.getContext('webgl2', {
    preserveDrawingBuffer: true,
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: 'high-performance',
  });

  // Detect WebGL context loss
  let contextLost = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    // Do NOT call e.preventDefault() — that signals "I will restore the context"
    // but we have no restoration code.  Without preventDefault the browser
    // immediately invalidates the GL state so gl.finish() / gl.readPixels()
    // return as no-ops instead of potentially hanging.
    contextLost = true;
    console.error('[VizExport] ⚠ WebGL context LOST!');
  });

  // audioContext = null: official butterchurn test pattern for offline rendering.
  const viz = butterchurn.createVisualizer(null, canvas, {
    width, height, pixelRatio: 1, textureRatio: 1,
  });
  safeLoadPreset(viz, presets, preset, presetName);

  // Helper 2D canvas for converting WebGL readPixels → JPEG blob.
  // This completely bypasses any preserveDrawingBuffer / toBlob timing issues:
  //   1. viz.render() → renders to WebGL framebuffer
  //   2. gl.finish() → waits for GPU to complete all commands
  //   3. gl.readPixels() → synchronously copies pixels from GPU to CPU
  //   4. Draw flipped image to 2D helper canvas → toBlob for JPEG
  const helperCanvas = document.createElement('canvas');
  helperCanvas.width = width;
  helperCanvas.height = height;
  const ctx2d = helperCanvas.getContext('2d');
  const stride = width * 4;
  const pixelBuf = new Uint8Array(width * height * 4);

  // Create backend session for frame storage
  const sessionData = await fetchJson(`${API_URL}/visualizer/session`, {
    method: 'POST',
    body: { fps, width, height },
  });
  const sessionId = sessionData.session_id;
  if (!sessionId) throw new Error('Session creation failed');
  console.log(`[VizExport] Session: ${sessionId}`);

  const frameInterval = 1 / fps;
  let batch = [];
  let batchNum = 0;
  let capturedFrames = 0;
  let skippedFrames = 0;
  let renderErrors = 0;
  let lastPixelHash = 0;
  let frozenCount = 0;
  const t0 = performance.now();

  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) {
      cleanupWebGL(canvas);
      const abortErr = new Error('Render cancelled by user');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    // Check context loss both via event flag AND synchronous gl.isContextLost().
    // gl.isContextLost() catches loss that occurred DURING the previous iteration
    // before the async webglcontextlost DOM event had a chance to fire.
    if (contextLost || gl.isContextLost()) {
      if (!contextLost) {
        contextLost = true;
        console.warn(`[VizExport] Context lost detected via gl.isContextLost() at frame ${i}`);
      } else {
        console.warn(`[VizExport] Context lost (event flag) at frame ${i}, stopping render`);
      }
      break;
    }

    const time = i * frameInterval;
    const audioLevels = getAudioLevelsAtTime(audioBuffer, time);

    // Render the frame
    try {
      viz.render({
        elapsedTime: frameInterval,
        audioLevels,
      });
    } catch (e) {
      renderErrors++;
      if (renderErrors <= 5) console.warn(`[VizExport] Frame ${i} render error:`, e.message);
      // Check if the render threw because the context is gone
      if (gl.isContextLost()) {
        contextLost = true;
        console.warn(`[VizExport] Context lost during viz.render() at frame ${i}`);
        break;
      }
      continue;
    }

    // Synchronous context loss check BEFORE gl.finish() — some GPU drivers
    // hang indefinitely on gl.finish() after context loss instead of returning.
    if (gl.isContextLost()) {
      contextLost = true;
      console.warn(`[VizExport] Context lost before gl.finish() at frame ${i}, stopping`);
      break;
    }

    // Force GPU to finish all pending operations before reading pixels.
    // Wrapped in try-catch: on some Chromium/NVIDIA combos gl.finish()
    // can throw after context loss even though we checked isContextLost() above.
    try {
      gl.finish();
    } catch (glErr) {
      contextLost = true;
      console.warn(`[VizExport] gl.finish() threw at frame ${i}: ${glErr.message}, stopping`);
      break;
    }

    // Double-check after finish — context may have been lost during the GPU sync.
    if (gl.isContextLost()) {
      contextLost = true;
      console.warn(`[VizExport] Context lost after gl.finish() at frame ${i}, stopping`);
      break;
    }

    // Synchronous pixel capture — reads directly from GPU framebuffer.
    // This is immune to preserveDrawingBuffer and async timing issues.
    try {
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuf);
    } catch (glErr) {
      contextLost = true;
      console.warn(`[VizExport] gl.readPixels() threw at frame ${i}: ${glErr.message}, stopping`);
      break;
    }

    // Quick pixel hash to detect frozen/identical frames
    let pixelHash = 0;
    for (let p = 0; p < pixelBuf.length; p += 4001) pixelHash += pixelBuf[p];

    if (pixelHash === lastPixelHash) {
      frozenCount++;
    } else {
      frozenCount = 0;
    }
    lastPixelHash = pixelHash;

    // Flip vertically (WebGL readPixels returns bottom-up) and write to 2D canvas
    const imageData = ctx2d.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      const srcOff = (height - 1 - y) * stride;
      imageData.data.set(pixelBuf.subarray(srcOff, srcOff + stride), y * stride);
    }
    ctx2d.putImageData(imageData, 0, 0);

    // Convert to JPEG via 2D canvas (no WebGL buffer dependency)
    const blob = await new Promise((resolve) => {
      helperCanvas.toBlob(resolve, 'image/jpeg', 0.90);
    });

    if (!blob || blob.size < 100) {
      skippedFrames++;
      if (skippedFrames <= 5) console.warn(`[VizExport] Frame ${i} empty (blob=${blob?.size}), skipping`);
      continue;
    }

    // Log diagnostic info every 30 frames
    if (i % 30 === 0) {
      console.log(`[VizExport] Frame ${i}/${totalFrames} | blob=${blob.size} | hash=${pixelHash} | frozen=${frozenCount}`);
    }

    batch.push({ index: capturedFrames, blob });
    capturedFrames++;

    // Upload batch when full
    if (batch.length >= FRAME_BATCH_SIZE) {
      await uploadFrameBatch(sessionId, batchNum, batch);
      batchNum++;
      batch = [];
    }

    if (onProgress && i % 30 === 0) {
      onProgress(Math.round((i / totalFrames) * 75));
    }

    // Yield to event loop every 10 frames for UI responsiveness
    if (i % 10 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Upload remaining frames
  if (batch.length > 0) {
    await uploadFrameBatch(sessionId, batchNum, batch);
  }

  // Cleanup WebGL before assembly — prevents GPU holding resources during FFmpeg
  cleanupWebGL(canvas);

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(
    `[VizExport] Done: ${capturedFrames} captured, ${skippedFrames} empty, ${renderErrors} errors, ` +
    `contextLost=${contextLost}, frozenStreak=${frozenCount} | ${elapsed}s`
  );

  if (capturedFrames === 0) {
    throw new Error('Visualizer export failed: no frames were captured (WebGL context lost immediately)');
  }

  if (contextLost) {
    console.warn(`[VizExport] Context was lost — assembling partial video with ${capturedFrames}/${totalFrames} frames`);
  }

  if (onProgress) onProgress(80);

  // Assemble video on backend via FFmpeg
  const result = await assembleFrames(sessionId, fps, capturedFrames);

  if (onProgress) onProgress(100);
  console.log(`[VizExport] Video: ${result.videoPath}`);
  return result.videoPath;
}

// ─── Backend communication ────────────────────────────────────────────

async function uploadFrameBatch(sessionId, batchIndex, frames) {
  const formData = new FormData();
  formData.append('session_id', sessionId);
  for (const { index, blob } of frames) {
    formData.append('frames', blob, `frame_${String(index).padStart(5, '0')}.jpg`);
  }
  const data = await fetchFormData(`${API_URL}/visualizer/frames`, formData);
  console.log(`[VizExport] Batch ${batchIndex}: ${data.received} frames uploaded`);
}

async function assembleFrames(sessionId, fps, totalFrames) {
  console.log(`[VizExport] Assembling ${totalFrames} frames @ ${fps}fps...`);
  return await fetchJson(`${API_URL}/visualizer/assemble`, {
    method: 'POST',
    body: { session_id: sessionId, fps, total_frames: totalFrames },
  });
}
