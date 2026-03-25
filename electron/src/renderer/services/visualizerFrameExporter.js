/**
 * VisualizerFrameExporter
 * Pre-renders Butterchurn visualizer to a WebM video for final render compositing.
 * Uses an offscreen canvas + MediaRecorder to capture frames.
 */
import { getOrCreateAudioContext, cleanupAudioContext } from '../hooks/useAudioContext';

const API_URL = window.API_URL || 'http://localhost:5000/api';

/**
 * Export visualizer as a WebM video file and upload to backend.
 * @param {Object} options
 * @param {string} options.audioUrl - URL to the audio file
 * @param {number} options.duration - Audio duration in seconds
 * @param {number} options.width - Output width
 * @param {number} options.height - Output height
 * @param {string} options.presetName - Butterchurn preset name
 * @param {number} options.fps - Target FPS (default 30)
 * @param {function} options.onProgress - Progress callback (0-100)
 * @returns {Promise<string>} - Server-side path to the visualizer video
 */
export async function exportVisualizerVideo({
  audioUrl,
  duration,
  width = 1920,
  height = 1080,
  presetName,
  fps = 30,
  onProgress,
}) {
  // Load butterchurn lazily
  const butterchurnMod = await import('butterchurn');
  const butterchurn = butterchurnMod.default || butterchurnMod;
  const presetsMod = await import('butterchurn-presets');
  const src = presetsMod.default || presetsMod;
  let presets;
  if (typeof src.getPresets === 'function') {
    presets = src.getPresets();
  } else if (typeof src === 'function') {
    try { presets = src(); } catch { presets = src; }
  } else {
    presets = src;
  }

  const preset = presets[presetName];
  if (!preset) {
    throw new Error(`Preset not found: ${presetName}`);
  }

  // Create offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const gl = canvas.getContext('webgl2', {
    alpha: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
  }) || canvas.getContext('webgl', {
    alpha: false,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
  });

  if (!gl) {
    throw new Error('WebGL not available for frame export');
  }

  // Create offline audio context to decode audio
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Fetch and decode audio
  const response = await fetch(audioUrl);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  // Create visualizer
  const viz = butterchurn.createVisualizer(audioCtx, canvas, {
    width,
    height,
    pixelRatio: 1,
    textureRatio: 1,
  });

  viz.loadPreset(preset, 0);

  // Create analyser to feed audio data
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  viz.connectAudio(analyser);

  // Use MediaRecorder to capture canvas as WebM
  const stream = canvas.captureStream(fps);
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 8000000, // 8 Mbps
  });

  const chunks = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve, reject) => {
    mediaRecorder.onstop = async () => {
      try {
        // Create blob from recorded chunks
        const blob = new Blob(chunks, { type: 'video/webm' });

        // Upload to backend
        const formData = new FormData();
        formData.append('file', blob, 'visualizer.webm');

        const uploadResponse = await fetch(`${API_URL}/upload`, {
          method: 'POST',
          body: formData,
        });

        const result = await uploadResponse.json();
        if (result.file_path) {
          resolve(result.file_path);
        } else {
          reject(new Error('Upload failed'));
        }
      } catch (err) {
        reject(err);
      } finally {
        // Cleanup
        audioCtx.close();
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    };

    mediaRecorder.onerror = (e) => {
      audioCtx.close();
      reject(e.error || new Error('MediaRecorder error'));
    };

    // Start recording
    mediaRecorder.start(1000); // Collect data every second

    // Render frames
    const totalFrames = Math.ceil(duration * fps);
    const samplesPerFrame = Math.floor(audioBuffer.sampleRate / fps);
    const timeData = new Float32Array(analyser.fftSize);
    const freqData = new Float32Array(analyser.frequencyBinCount);
    let currentFrame = 0;

    // Create an offline source to simulate audio playback
    const offlineCtx = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();

    // Render frame by frame using requestAnimationFrame for smooth output
    function renderFrame() {
      if (currentFrame >= totalFrames) {
        mediaRecorder.stop();
        return;
      }

      // Render the visualizer
      viz.render();

      currentFrame++;
      if (onProgress) {
        onProgress(Math.round((currentFrame / totalFrames) * 100));
      }

      requestAnimationFrame(renderFrame);
    }

    renderFrame();
  });
}
