/**
 * useAudioMixer — Web Audio API multi-track mixer hook
 *
 * Creates synchronized <audio> elements for each stem track,
 * routes them through GainNodes for independent volume/mute/solo control,
 * and exposes a unified playback API compatible with globalAudioRef.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '../stores/appStore';

// Singleton AudioContext — reused across hook re-mounts
let sharedAudioCtx = null;

function getSharedAudioContext() {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

/**
 * Compute the effective gain for a track given mute/solo/master state.
 */
function computeGain(track, allTracks, masterVolume, masterMuted) {
  if (masterMuted) return 0;
  if (track.muted) return 0;
  const anySoloed = Object.values(allTracks).some(t => t.solo);
  if (anySoloed && !track.solo) return 0;
  return track.volume * masterVolume;
}

export default function useAudioMixer() {
  const audioMixer = useAppStore(s => s.audioMixer);
  const setPlaybackTime = useAppStore(s => s.setPlaybackTime);
  const setIsPlaying = useAppStore(s => s.setIsPlaying);

  // Refs that persist across renders
  const nodesRef = useRef({});        // { [trackId]: { audio, source, gain } }
  const primaryRef = useRef(null);    // primary <audio> element ref (for globalAudioRef compat)
  const ctxRef = useRef(null);        // AudioContext
  const cleanupDone = useRef(false);

  const [isLoaded, setIsLoaded] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const tracks = audioMixer.tracks;
  const { masterVolume, masterMuted } = audioMixer;

  // ── Create / destroy audio nodes when tracks change ────────────────
  useEffect(() => {
    if (!audioMixer.enabled) return;

    const trackIds = Object.keys(tracks);
    if (trackIds.length === 0) return;

    const ctx = getSharedAudioContext();
    ctxRef.current = ctx;
    const existingNodes = nodesRef.current;

    // Remove nodes for tracks that no longer exist
    for (const id of Object.keys(existingNodes)) {
      if (!tracks[id]) {
        try {
          existingNodes[id].gain.disconnect();
          existingNodes[id].source.disconnect();
          existingNodes[id].audio.pause();
          existingNodes[id].audio.removeAttribute('src');
          existingNodes[id].audio.load();
        } catch (e) { /* ignore */ }
        delete existingNodes[id];
      }
    }

    // Create nodes for new tracks — skip tracks without a playable URL
    const playableIds = trackIds.filter(id => tracks[id].url);
    let loadCount = 0;
    const totalTracks = playableIds.length;

    if (totalTracks === 0) return;

    for (const id of playableIds) {
      if (existingNodes[id]) {
        // Track already exists — just update src if changed
        if (existingNodes[id].audio.src !== tracks[id].url) {
          existingNodes[id].audio.src = tracks[id].url;
        }
        loadCount++;
        continue;
      }

      const audio = document.createElement('audio');
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.src = tracks[id].url;

      // MediaElementSourceNode — can only be created once per element
      const source = ctx.createMediaElementSource(audio);
      const gain = ctx.createGain();
      source.connect(gain);
      gain.connect(ctx.destination);

      existingNodes[id] = { audio, source, gain };

      audio.addEventListener('canplay', () => {
        loadCount++;
        if (loadCount >= totalTracks) {
          setIsLoaded(true);
          // Use the first track (vocals preferred) as primary for duration
          const primary = existingNodes.vocals?.audio || existingNodes[trackIds[0]]?.audio;
          if (primary) {
            setDuration(primary.duration || 0);
            primaryRef.current = primary;
          }
        }
      }, { once: true });
    }

    // Set primary ref immediately if nodes already loaded (vocals preferred)
    const primaryId = existingNodes.vocals ? 'vocals' : playableIds[0];
    if (primaryId && existingNodes[primaryId]) {
      primaryRef.current = existingNodes[primaryId].audio;
    }

    nodesRef.current = existingNodes;
    cleanupDone.current = false;

    return () => {
      // Don't destroy on re-render — only on full unmount
      // The cleanup will be handled by the separate unmount effect
    };
  }, [audioMixer.enabled, JSON.stringify(Object.keys(tracks))]);

  // ── Cleanup on full unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (cleanupDone.current) return;
      cleanupDone.current = true;
      const nodes = nodesRef.current;
      for (const id of Object.keys(nodes)) {
        try {
          nodes[id].gain.disconnect();
          nodes[id].source.disconnect();
          nodes[id].audio.pause();
          nodes[id].audio.removeAttribute('src');
          nodes[id].audio.load();
        } catch (e) { /* ignore */ }
      }
      nodesRef.current = {};
      primaryRef.current = null;
      setIsLoaded(false);
    };
  }, []);

  // ── Update GainNode values when volume/mute/solo/master changes ────
  useEffect(() => {
    const nodes = nodesRef.current;
    for (const [id, track] of Object.entries(tracks)) {
      if (!nodes[id]) continue;
      const gain = computeGain(track, tracks, masterVolume, masterMuted);
      // Smooth ramp to avoid clicks
      const now = nodes[id].gain.context.currentTime;
      nodes[id].gain.gain.cancelScheduledValues(now);
      nodes[id].gain.gain.setTargetAtTime(gain, now, 0.02);
    }
  }, [tracks, masterVolume, masterMuted]);

  // ── Time update from primary element ───────────────────────────────
  useEffect(() => {
    const primary = primaryRef.current;
    if (!primary) return;

    const onTimeUpdate = () => {
      const t = primary.currentTime;
      setCurrentTime(t);
      setPlaybackTime(t);
    };

    const onEnded = () => {
      setIsPlaying(false);
      // Pause all
      for (const n of Object.values(nodesRef.current)) {
        n.audio.pause();
      }
    };

    const onDurationChange = () => {
      setDuration(primary.duration || 0);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    primary.addEventListener('timeupdate', onTimeUpdate);
    primary.addEventListener('ended', onEnded);
    primary.addEventListener('durationchange', onDurationChange);
    primary.addEventListener('play', onPlay);
    primary.addEventListener('pause', onPause);

    return () => {
      primary.removeEventListener('timeupdate', onTimeUpdate);
      primary.removeEventListener('ended', onEnded);
      primary.removeEventListener('durationchange', onDurationChange);
      primary.removeEventListener('play', onPlay);
      primary.removeEventListener('pause', onPause);
    };
  }, [primaryRef.current, setPlaybackTime, setIsPlaying]);

  // ── Drift correction: resync elements that drift >50ms ─────────────
  useEffect(() => {
    if (!audioMixer.enabled) return;
    const primary = primaryRef.current;
    if (!primary) return;

    const interval = setInterval(() => {
      const nodes = nodesRef.current;
      const refTime = primary.currentTime;
      for (const [id, n] of Object.entries(nodes)) {
        if (n.audio === primary) continue;
        if (Math.abs(n.audio.currentTime - refTime) > 0.05) {
          n.audio.currentTime = refTime;
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [audioMixer.enabled, primaryRef.current]);

  // ── Playback controls ──────────────────────────────────────────────
  const play = useCallback(async () => {
    if (ctxRef.current?.state === 'suspended') {
      await ctxRef.current.resume();
    }
    const nodes = nodesRef.current;
    const promises = [];
    for (const n of Object.values(nodes)) {
      promises.push(n.audio.play().catch(() => {}));
    }
    await Promise.all(promises);
  }, []);

  const pause = useCallback(() => {
    for (const n of Object.values(nodesRef.current)) {
      n.audio.pause();
    }
  }, []);

  const seek = useCallback((time) => {
    const clampedTime = Math.max(0, Math.min(duration, time));
    for (const n of Object.values(nodesRef.current)) {
      n.audio.currentTime = clampedTime;
    }
    setCurrentTime(clampedTime);
    setPlaybackTime(clampedTime);
  }, [duration, setPlaybackTime]);

  // Expose a ref-like object compatible with globalAudioRef.current
  const audioRefProxy = useRef({
    get currentTime() { return primaryRef.current?.currentTime || 0; },
    set currentTime(v) { seek(v); },
    get duration() { return primaryRef.current?.duration || 0; },
    get paused() { return primaryRef.current?.paused ?? true; },
    play: () => play(),
    pause: () => pause(),
    get muted() { return masterMuted; },
    set muted(v) { useAppStore.getState().setMasterMuted(v); },
    get volume() { return masterVolume; },
    set volume(v) { useAppStore.getState().setMasterVolume(v); },
  });

  // Keep proxy methods up-to-date
  useEffect(() => {
    audioRefProxy.current.play = () => play();
    audioRefProxy.current.pause = () => pause();
  }, [play, pause]);

  return {
    play,
    pause,
    seek,
    isLoaded,
    duration,
    currentTime,
    audioRefProxy,   // Use as globalAudioRef
    primaryAudio: primaryRef.current,
  };
}
