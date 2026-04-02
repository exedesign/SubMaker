/**
 * ButterchurnCanvas - WebGL Milkdrop visualizer component
 * Uses Butterchurn (WebGL Milkdrop implementation) for audio-reactive visuals
 */
import React, { useRef, useEffect, useCallback } from 'react';
import { getOrCreateAudioContext } from '../hooks/useAudioContext';

// Lazy-load butterchurn and presets to avoid blocking initial render
let butterchurnModule = null;
let presetsCache = null;
let presetKeysCache = null;

async function loadButterchurn() {
  if (!butterchurnModule) {
    const mod = await import('butterchurn');
    butterchurnModule = mod.default || mod;
  }
  return butterchurnModule;
}

/**
 * Test if a preset's equation strings can be compiled by new Function().
 * Butterchurn uses new Function('a', eqStr + ' return a;') internally.
 * Some presets have broken JS that throws SyntaxError.
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

async function loadPresets() {
  if (!presetsCache) {
    const mod = await import('butterchurn-presets');
    const src = mod.default || mod;
    let allPresets;
    if (typeof src.getPresets === 'function') {
      allPresets = src.getPresets();
    } else if (typeof src === 'function') {
      try { allPresets = src(); } catch { allPresets = src; }
    } else {
      allPresets = src;
    }

    // Filter out presets with broken equation strings
    const validPresets = {};
    const allKeys = Object.keys(allPresets);
    for (const name of allKeys) {
      if (isPresetValid(allPresets[name])) {
        validPresets[name] = allPresets[name];
      }
    }

    presetsCache = validPresets;
    presetKeysCache = Object.keys(validPresets).sort();
    console.log(`Butterchurn: ${presetKeysCache.length}/${allKeys.length} presets valid`);
  }
  return { presets: presetsCache, keys: presetKeysCache };
}

export async function getPresetKeys() {
  const { keys } = await loadPresets();
  return keys;
}

export async function getRandomPresetName() {
  const { keys } = await loadPresets();
  return keys[Math.floor(Math.random() * keys.length)];
}

// Singleton visualizer state — prevents WebGL context exhaustion
let singletonViz = null;
let singletonCanvas = null;
let singletonCtx = null;
let singletonAnimFrame = null;
let singletonAudioConnected = null;

function stopRenderLoop() {
  if (singletonAnimFrame) {
    cancelAnimationFrame(singletonAnimFrame);
    singletonAnimFrame = null;
  }
}

function destroySingleton() {
  stopRenderLoop();
  singletonViz = null;
  singletonAudioConnected = null;
  singletonCanvas = null;
  // Don't close AudioContext — it may be shared with other components
  singletonCtx = null;
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
      const { presets, keys } = await loadPresets();
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

      // Let butterchurn create and manage its own WebGL context
      // Do NOT pre-create a WebGL context — it can conflict with butterchurn's internal context type
      const viz = butterchurn.createVisualizer(ctx, canvas, {
        width: targetWidth,
        height: targetHeight,
        pixelRatio: 1,
        textureRatio: 1,
      });

      if (!mountedRef.current) return false;

      // Store as singleton
      singletonViz = viz;
      singletonCanvas = canvas;
      singletonCtx = ctx;

      // Load initial preset — try selected, then random fallbacks
      const initialPreset = preset && presets[preset]
        ? preset
        : keys[Math.floor(Math.random() * keys.length)];
      let loadedPreset = null;
      const candidates = [initialPreset, ...keys.sort(() => Math.random() - 0.5).slice(0, 10)];
      for (const name of candidates) {
        try {
          viz.loadPreset(presets[name], 0);
          loadedPreset = name;
          break;
        } catch (e) {
          console.warn(`Butterchurn: preset '${name}' load failed:`, e.message);
        }
      }
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

      console.log('Butterchurn: visualizer initialized, preset:', initialPreset);

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
      stopRenderLoop();
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
      const { presets } = await loadPresets();
      if (presets[presetName] && singletonViz) {
        try {
          singletonViz.loadPreset(presets[presetName], 2.0);
        } catch (e) {
          console.warn('Butterchurn: preset load failed:', presetName, e.message);
        }
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
