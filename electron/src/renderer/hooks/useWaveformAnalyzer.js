/**
 * useWaveformAnalyzer — Generates waveform amplitude data for each audio mixer track.
 *
 * Fetches audio from each stem URL, decodes it via Web Audio API,
 * and stores a Float32Array of amplitude samples in the store.
 */
import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';

const WAVEFORM_SAMPLES = 500;

export default function useWaveformAnalyzer() {
  const audioMixer = useAppStore(s => s.audioMixer);
  const setTrackWaveform = useAppStore(s => s.setTrackWaveform);
  const analyzedRef = useRef(new Set());

  useEffect(() => {
    if (!audioMixer.enabled) {
      analyzedRef.current.clear();
      return;
    }

    const tracks = audioMixer.tracks;
    for (const [trackId, track] of Object.entries(tracks)) {
      if (!track.url || track.waveformData || analyzedRef.current.has(track.url)) continue;
      analyzedRef.current.add(track.url);

      (async () => {
        try {
          const response = await fetch(track.url);
          const arrayBuffer = await response.arrayBuffer();
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

          const channelData = audioBuffer.getChannelData(0);
          const blockSize = Math.floor(channelData.length / WAVEFORM_SAMPLES);
          const waveform = new Float32Array(WAVEFORM_SAMPLES);

          for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
            const start = i * blockSize;
            const end = Math.min(start + blockSize, channelData.length);
            let max = 0;
            for (let j = start; j < end; j++) {
              max = Math.max(max, Math.abs(channelData[j]));
            }
            waveform[i] = max;
          }

          setTrackWaveform(trackId, waveform);
          audioCtx.close();
        } catch (err) {
          console.error(`Waveform analysis failed for ${trackId}:`, err);
        }
      })();
    }
  }, [audioMixer.enabled, audioMixer.tracks, setTrackWaveform]);
}
