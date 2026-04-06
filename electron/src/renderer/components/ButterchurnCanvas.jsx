/**
 * ButterchurnCanvas - WebGL Milkdrop visualizer component
 * Uses Butterchurn (WebGL Milkdrop implementation) for audio-reactive visuals
 * Presets loaded from resources/presets/ folder via backend API
 */
import React, { useRef, useEffect, useCallback } from 'react';
import { getOrCreateAudioContext } from '../hooks/useAudioContext';

const API_URL = window.API_URL || 'http://localhost:5000/api';

// Lazy-load butterchurn module
let butterchurnModule = null;
let presetKeysCache = null;
let presetsCache = {};  // on-demand cache: name → preset object

async function loadButterchurn() {
  if (!butterchurnModule) {
    const mod = await import('butterchurn');
    butterchurnModule = mod.default || mod;
  }
  return butterchurnModule;
}

/**
 * Fetch the list of available preset names from the backend (resources/presets/ folder).
 * Cached after first load.
 */
async function loadPresetKeys() {
  if (presetKeysCache) return presetKeysCache;
  try {
    const res = await fetch(`${API_URL}/presets/list`);
    const data = await res.json();
    presetKeysCache = data.presets || [];
    console.log(`Butterchurn: ${presetKeysCache.length} presets available from folder`);
  } catch (e) {
    console.error('Failed to load preset list from backend:', e);
    presetKeysCache = [];
  }
  return presetKeysCache;
}

/**
 * Load a single preset by name. Fetches from backend and caches in memory.
 */
async function loadPresetByName(name) {
  if (presetsCache[name]) return presetsCache[name];
  try {
    const res = await fetch(`${API_URL}/presets/load/${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const preset = await res.json();
    presetsCache[name] = preset;
    return preset;
  } catch (e) {
    console.warn(`Butterchurn: failed to load preset '${name}':`, e.message);
    return null;
  }
}

/**
 * Load multiple presets at once via batch API.
 */
async function loadPresetsBatch(names) {
  const missing = names.filter(n => !presetsCache[n]);
  if (missing.length > 0) {
    try {
      const res = await fetch(`${API_URL}/presets/load-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: missing }),
      });
      const data = await res.json();
      for (const [name, preset] of Object.entries(data)) {
        presetsCache[name] = preset;
      }
    } catch (e) {
      console.warn('Butterchurn: batch preset load failed:', e.message);
    }
  }
  const result = {};
  for (const name of names) {
    if (presetsCache[name]) result[name] = presetsCache[name];
  }
  return result;
}

export async function getPresetKeys() {
  return await loadPresetKeys();
}

export async function getRandomPresetName() {
  const keys = await loadPresetKeys();
  return keys[Math.floor(Math.random() * keys.length)];
}

export { loadPresetByName, loadPresetsBatch };

// Singleton visualizer state — prevents WebGL context exhaustion
let singletonViz = null;
let singletonCanvas = null;
let singletonCtx = null;
let singletonAnimFrame = null;
let singletonAudioConnected = null;
let _singletonContextLost = false;

function stopRenderLoop() {
  if (singletonAnimFrame) {
    cancelAnimationFrame(singletonAnimFrame);
    singletonAnimFrame = null;
  }
}

function destroySingleton() {
  stopRenderLoop();
  // Remove context event listeners before destroying
  if (singletonCanvas) {
    singletonCanvas.removeEventListener('webglcontextlost', _onContextLost);
    singletonCanvas.removeEventListener('webglcontextrestored', _onContextRestored);
  }
  singletonViz = null;
  singletonAudioConnected = null;
  singletonCanvas = null;
  // Don't close AudioContext — it may be shared with other components
  singletonCtx = null;
  _singletonContextLost = false;
}

// Context loss handler — marks singleton as dead so render loop stops wasting cycles
function _onContextLost(e) {
  e.preventDefault(); // Allow context restoration
  _singletonContextLost = true;
  stopRenderLoop();
  console.warn('Butterchurn: WebGL context lost — render paused');
}

// Context restored handler — reinitialize the visualizer
function _onContextRestored() {
  console.log('Butterchurn: WebGL context restored — reinitializing');
  _singletonContextLost = false;
  // Mark singleton as stale so next initVisualizer creates fresh viz
  singletonViz = null;
}

/**
 * Destroy the preview visualizer singleton.
 * Call before starting a viz export to free GPU resources and prevent context contention.
 */
export function destroyPreviewViz() {
  destroySingleton();
  console.log('Butterchurn: preview singleton destroyed (pre-export cleanup)');
}

function ButterchurnCanvas({ width, height, audioElement, presetName, sensitivity = 1.0 }) {
  const canvasRef = useRef(null);
  const mountedRef = useRef(true);
  const initAttemptRef = useRef(0);
  const retryTimerRef = useRef(null);

  // Core init function — creates or reconnects the visualizer
  const initVisualizer = useCallback(async (canvas, audioEl, targetWidth, targetHeight, preset) => {
    try {
      const butterchurn = await loadButterchurn();
      const keys = await loadPresetKeys();
      if (!mountedRef.current) return false;

      // Determine AudioContext
      let ctx = null;
      let analyser = null;

      // Only use getOrCreateAudioContext for real HTMLMediaElement (not proxy objects)
      if (audioEl && audioEl instanceof HTMLMediaElement) {
        const result = getOrCreateAudioContext(audioEl);
        if (result.audioContext) {
          ctx = result.audioContext;
          analyser = result.analyserNode;
        }
      }

      // Fallback: standalone AudioContext (renders visuals without audio reactivity)
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') {
          // Try to resume — may need user gesture
          ctx.resume().catch(() => {});
        }
      }

      // Re-use existing visualizer if same canvas
      if (singletonViz && singletonCanvas === canvas) {
        singletonViz.setRendererSize(targetWidth, targetHeight);
        // Reconnect audio if element changed
        if (analyser && singletonAudioConnected !== audioEl) {
          try {
            singletonViz.connectAudio(analyser);
            singletonAudioConnected = audioEl;
            console.log('Butterchurn: audio reconnected');
          } catch (e) {
            console.warn('Butterchurn: audio reconnect failed:', e);
          }
        }
        // Ensure render loop is running
        if (!singletonAnimFrame) {
          startRenderLoop();
        }
        return true;
      }

      // Cleanup any previous singleton
      destroySingleton();

      if (!mountedRef.current) return false;

      // Suppress WebGL shader compilation warnings from butterchurn
      // These are harmless (preset shaders with minor GLSL incompatibilities) but flood the console
      // We temporarily filter console.warn/error during init to keep the console clean
      const _origWarn = console.warn;
      const _origError = console.error;
      const webglFilter = (...args) => {
        const msg = args[0];
        if (typeof msg === 'string' && (msg.includes('WebGL') || msg.includes('INVALID_OPERATION') || msg.includes('program not linked') || msg.includes('program not valid'))) return;
        _origWarn.apply(console, args);
      };
      const webglErrorFilter = (...args) => {
        const msg = args[0];
        if (typeof msg === 'string' && (msg.includes('WebGL') || msg.includes('INVALID_OPERATION') || msg.includes('program not linked') || msg.includes('program not valid'))) return;
        _origError.apply(console, args);
      };
      console.warn = webglFilter;
      console.error = webglErrorFilter;

      // Let butterchurn create and manage its own WebGL context
      const viz = butterchurn.createVisualizer(ctx, canvas, {
        width: targetWidth,
        height: targetHeight,
        pixelRatio: 1,
        textureRatio: 1,
      });

      // Restore original console methods
      console.warn = _origWarn;
      console.error = _origError;

      if (!mountedRef.current) return false;

      // Store as singleton
      singletonViz = viz;
      singletonCanvas = canvas;
      singletonCtx = ctx;
      _singletonContextLost = false;

      // Register context loss/restore handlers
      canvas.addEventListener('webglcontextlost', _onContextLost);
      canvas.addEventListener('webglcontextrestored', _onContextRestored);

      // Load initial preset — try selected, then random fallbacks
      const initialPresetName = preset && keys.includes(preset)
        ? preset
        : keys[Math.floor(Math.random() * keys.length)];
      let loadedPreset = null;
      const candidates = [initialPresetName, ...keys.sort(() => Math.random() - 0.5).slice(0, 10)];
      // Suppress WebGL shader warnings during preset loading (same filter as init)
      console.warn = webglFilter;
      console.error = webglErrorFilter;
      for (const name of candidates) {
        try {
          const presetData = await loadPresetByName(name);
          if (!presetData) continue;
          viz.loadPreset(presetData, 0);
          loadedPreset = name;
          break;
        } catch (e) {
          // Use original warn for our own messages
          _origWarn(`Butterchurn: preset '${name}' load failed:`, e.message);
        }
      }
      console.warn = _origWarn;
      console.error = _origError;
      if (!loadedPreset) {
        console.error('Butterchurn: no preset could be loaded');
        return false;
      }

      // Connect audio if available
      if (analyser) {
        try {
          viz.connectAudio(analyser);
          singletonAudioConnected = audioEl;
          console.log('Butterchurn: audio connected');
        } catch (e) {
          console.warn('Butterchurn: audio connect failed:', e);
        }
      }

      console.log('Butterchurn: visualizer initialized, preset:', loadedPreset);

      // Start render loop
      startRenderLoop();
      return true;

    } catch (err) {
      console.error('Butterchurn init error:', err);
      return false;
    }
  }, []);

  // Render loop with error recovery
  function startRenderLoop() {
    stopRenderLoop();

    function renderLoop() {
      if (!mountedRef.current) return;
      // Skip rendering if context is lost — avoids flooding console with WebGL errors
      if (_singletonContextLost) {
        singletonAnimFrame = requestAnimationFrame(renderLoop);
        return;
      }
      try {
        if (singletonViz) singletonViz.render();
      } catch (e) {
        console.warn('Butterchurn render error:', e);
        // Don't stop the loop — skip this frame and continue
      }
      singletonAnimFrame = requestAnimationFrame(renderLoop);
    }
    singletonAnimFrame = requestAnimationFrame(renderLoop);
  }

  // Main effect: initialize visualizer on mount
  useEffect(() => {
    if (!canvasRef.current || !width || !height) return;
    mountedRef.current = true;
    initAttemptRef.current = 0;

    const canvas = canvasRef.current;

    // Init with current audio element (may be null — uses fallback)
    initVisualizer(canvas, audioElement, width, height, presetName);

    return () => {
      mountedRef.current = false;
      destroySingleton();
      if (retryTimerRef.current) {
        clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []); // Mount only — audio connection handled separately

  // Effect: connect/reconnect audio when audioElement changes
  useEffect(() => {
    if (!audioElement || !canvasRef.current) return;

    // If viz exists, just reconnect audio
    if (singletonViz && singletonCanvas === canvasRef.current) {
      if (audioElement instanceof HTMLMediaElement) {
        const result = getOrCreateAudioContext(audioElement);
        if (result.analyserNode && singletonAudioConnected !== audioElement) {
          try {
            singletonViz.connectAudio(result.analyserNode);
            singletonAudioConnected = audioElement;
            console.log('Butterchurn: audio connected (late binding)');
          } catch (e) {
            console.warn('Butterchurn: late audio connect failed:', e);
          }
        }
      }
      return;
    }

    // Viz doesn't exist yet — reinitialize with audio
    if (canvasRef.current && width && height) {
      initVisualizer(canvasRef.current, audioElement, width, height, presetName);
    }
  }, [audioElement, initVisualizer, width, height, presetName]);

  // Retry: poll for audio element if not yet available
  // (globalAudioRef.current may change without triggering re-render)
  useEffect(() => {
    if (audioElement) return; // Already have audio, no need to poll

    // Poll every 500ms for audio element arrival
    if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    retryTimerRef.current = setInterval(() => {
      if (!mountedRef.current) {
        clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
        return;
      }
      initAttemptRef.current++;
      // After 20 attempts (10s), stop polling
      if (initAttemptRef.current > 20) {
        clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    }, 500);

    return () => {
      if (retryTimerRef.current) {
        clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [audioElement]);

  // Handle resize
  useEffect(() => {
    if (singletonViz && width && height) {
      singletonViz.setRendererSize(width, height);
    }
  }, [width, height]);

  // Handle preset changes
  useEffect(() => {
    if (!singletonViz || !presetName) return;

    async function changePreset() {
      const presetData = await loadPresetByName(presetName);
      if (presetData && singletonViz) {
        // Suppress WebGL shader warnings during preset switch
        const _w = console.warn, _e = console.error;
        const wf = (...a) => { if (typeof a[0] === 'string' && (a[0].includes('WebGL') || a[0].includes('INVALID_OPERATION'))) return; _w.apply(console, a); };
        const ef = (...a) => { if (typeof a[0] === 'string' && (a[0].includes('WebGL') || a[0].includes('INVALID_OPERATION'))) return; _e.apply(console, a); };
        console.warn = wf; console.error = ef;
        try {
          singletonViz.loadPreset(presetData, 2.0);
        } catch (e) {
          _w('Butterchurn: preset load failed:', presetName, e.message);
        }
        console.warn = _w; console.error = _e;
      }
    }
    changePreset();
  }, [presetName]);

  return (
    <canvas
      ref={canvasRef}
      width={width || 512}
      height={height || 512}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
      }}
    />
  );
}

export default React.memo(ButterchurnCanvas);
