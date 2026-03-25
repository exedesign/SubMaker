/**
 * Singleton Web Audio API manager
 * createMediaElementSource() can only be called once per element —
 * this module ensures we reuse the same context and source node.
 */

let audioContext = null;
let mediaSource = null;
let analyserNode = null;
let connectedElement = null;

export function getOrCreateAudioContext(audioElement) {
  if (!audioElement) return { audioContext: null, analyserNode: null };

  // If already connected to this element, return existing nodes
  if (audioContext && connectedElement === audioElement && mediaSource) {
    // Resume if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return { audioContext, analyserNode };
  }

  // If connected to a different element, close old context
  if (audioContext && connectedElement !== audioElement) {
    try {
      audioContext.close();
    } catch (e) {
      // ignore
    }
    audioContext = null;
    mediaSource = null;
    analyserNode = null;
    connectedElement = null;
  }

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    mediaSource = audioContext.createMediaElementSource(audioElement);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0.8;

    // Connect: source → analyser → destination (speakers)
    mediaSource.connect(analyserNode);
    analyserNode.connect(audioContext.destination);

    connectedElement = audioElement;

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  } catch (e) {
    console.error('Failed to create AudioContext:', e);
    return { audioContext: null, analyserNode: null };
  }

  return { audioContext, analyserNode };
}

export function cleanupAudioContext() {
  if (audioContext) {
    try {
      audioContext.close();
    } catch (e) {
      // ignore
    }
  }
  audioContext = null;
  mediaSource = null;
  analyserNode = null;
  connectedElement = null;
}
