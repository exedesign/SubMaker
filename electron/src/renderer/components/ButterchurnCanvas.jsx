/**
 * ButterchurnCanvas - WebGL Milkdrop visualizer component
 * Uses Butterchurn (WebGL Milkdrop implementation) for audio-reactive visuals
 */
import React, { useRef, useEffect } from 'react';
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

async function loadPresets() {
  if (!presetsCache) {
    const mod = await import('butterchurn-presets');
    const src = mod.default || mod;
    if (typeof src.getPresets === 'function') {
      presetsCache = src.getPresets();
    } else if (typeof src === 'function') {
      try { presetsCache = src(); } catch { presetsCache = src; }
    } else {
      presetsCache = src;
    }
    presetKeysCache = Object.keys(presetsCache).sort();
    console.log(`Butterchurn: ${presetKeysCache.length} presets loaded`);
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

function cleanupSingleton() {
  if (singletonAnimFrame) {
    cancelAnimationFrame(singletonAnimFrame);
    singletonAnimFrame = null;
  }
  singletonViz = null;
  singletonAudioConnected = null;
  if (singletonCtx) {
    try { singletonCtx.close(); } catch {}
    singletonCtx = null;
  }
  singletonCanvas = null;
}

function ButterchurnCanvas({ width, height, audioElement, presetName, sensitivity = 1.0 }) {
  const canvasRef = useRef(null);
  const mountedRef = useRef(true);

  // Initialize or re-use visualizer
  useEffect(() => {
    if (!canvasRef.current || !width || !height) return;
    mountedRef.current = true;

    const canvas = canvasRef.current;
    let cancelled = false;

    async function init() {
      try {
        const butterchurn = await loadButterchurn();
        const { presets, keys } = await loadPresets();
        if (cancelled || !mountedRef.current) return;

        // Determine AudioContext — use real one if audio available
        let ctx = null;
        let analyser = null;

        if (audioElement) {
          const result = getOrCreateAudioContext(audioElement);
          if (result.audioContext) {
            ctx = result.audioContext;
            analyser = result.analyserNode;
          }
        }

        // Skip startup initialization until a real audio element exists.
        if (!ctx) {
          return;
        }

        // Re-use existing visualizer if same canvas and context
        if (singletonViz && singletonCanvas === canvas && singletonCtx === ctx) {
          // Just resize and reconnect audio if needed
          singletonViz.setRendererSize(width, height);
          if (analyser && singletonAudioConnected !== audioElement) {
            try {
              singletonViz.connectAudio(analyser);
              singletonAudioConnected = audioElement;
            } catch {}
          }
          return;
        }

        // Cleanup any previous singleton
        cleanupSingleton();

        let gl = null;
        try {
          gl = canvas.getContext('webgl2', {
            alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true,
          }) || canvas.getContext('webgl', {
            alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true,
          });
        } catch (error) {
          console.error('Butterchurn: WebGL context creation failed:', error);
          return;
        }

        if (!gl) {
          console.error('WebGL not available for Butterchurn');
          return;
        }

        if (cancelled) return;

        const viz = butterchurn.createVisualizer(ctx, canvas, {
          width, height, pixelRatio: 1, textureRatio: 1,
        });

        if (cancelled) return;

        // Store as singleton
        singletonViz = viz;
        singletonCanvas = canvas;
        singletonCtx = ctx;

        // Load initial preset
        const initialPreset = presetName && presets[presetName]
          ? presetName
          : keys[Math.floor(Math.random() * keys.length)];
        viz.loadPreset(presets[initialPreset], 0);

        // Connect audio if available (same context, so no mismatch)
        if (analyser) {
          try {
            viz.connectAudio(analyser);
            singletonAudioConnected = audioElement;
            console.log('Butterchurn: audio connected');
          } catch (e) {
            console.warn('Butterchurn: audio connect failed:', e);
          }
        }

        console.log('Butterchurn: visualizer initialized, preset:', initialPreset);

        // Render loop
        function renderLoop() {
          if (cancelled || !mountedRef.current) return;
          if (singletonViz) singletonViz.render();
          singletonAnimFrame = requestAnimationFrame(renderLoop);
        }
        singletonAnimFrame = requestAnimationFrame(renderLoop);

      } catch (err) {
        console.error('Butterchurn init error:', err);
      }
    }

    init();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      // Stop animation but DON'T destroy singleton — it will be reused on remount
      if (singletonAnimFrame) {
        cancelAnimationFrame(singletonAnimFrame);
        singletonAnimFrame = null;
      }
    };
  }, [audioElement]); // Re-init when audio element changes (context may change)

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
        singletonViz.loadPreset(presets[presetName], 2.0);
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
