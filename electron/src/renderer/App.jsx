import React, { useEffect, useRef } from 'react';
import { useAppStore } from './stores/appStore';
import { matchesShortcut } from './utils/shortcutHelper';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import StatusBar from './components/StatusBar';
import PreviewPanel from './components/PreviewPanel';
import PreviewScreenOutput from './components/PreviewScreenOutput';
import StartupHealthCheck from './components/StartupHealthCheck';
import THEMES from './themes';
import './styles/startup.css';

// Detect if this window is the second-display preview output
const isPreviewScreen = new URLSearchParams(window.location.search).has('previewScreen');

function MainApp() {
  const { checkBackendHealth, backendStatus, previewMode, settings, generateCoverArt, coverArt, startupCheckComplete } = useAppStore();
  const fastPollRef = useRef(null);

  // Global Ctrl+Enter → Generate Cover Art
  useEffect(() => {
    const handleKeyDown = (e) => {
      const { shortcuts, coverArt, generateCoverArt } = useAppStore.getState();
      if (matchesShortcut(e, shortcuts.generateCoverArt.keys)) {
        e.preventDefault();
        if (!coverArt.isGenerating) generateCoverArt();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Global shortcuts: Audio solo toggles (V/B/C) & Panel navigation (Alt+B / Shift+P)
  useEffect(() => {
    const handleMixerKeys = (e) => {
      const isInput = e.target.matches('input, textarea, select, [contenteditable]');
      if (isInput) return;
      const { shortcuts, audioMixer, setTrackSolo, requestFocusPanel } = useAppStore.getState();

      // V — Toggle Vocal Solo
      if (matchesShortcut(e, shortcuts.soloVocals.keys)) {
        e.preventDefault();
        if (audioMixer.enabled && audioMixer.tracks.vocals) {
          setTrackSolo('vocals', !audioMixer.tracks.vocals.solo);
        }
        return;
      }
      // B — Toggle Instrumental Solo
      if (matchesShortcut(e, shortcuts.soloInstrumental.keys)) {
        e.preventDefault();
        if (audioMixer.enabled && audioMixer.tracks.instrumental) {
          setTrackSolo('instrumental', !audioMixer.tracks.instrumental.solo);
        }
        return;
      }
      // C — Toggle Original Solo
      if (matchesShortcut(e, shortcuts.soloOriginal.keys)) {
        e.preventDefault();
        if (audioMixer.enabled && audioMixer.tracks.original) {
          setTrackSolo('original', !audioMixer.tracks.original.solo);
        }
        return;
      }
      // Alt+B — Show Batch Panel
      if (matchesShortcut(e, shortcuts.showBatchPanel.keys)) {
        e.preventDefault();
        requestFocusPanel('batch');
        return;
      }
      // Shift+P — Show Playlist Panel
      if (matchesShortcut(e, shortcuts.showPlaylistPanel.keys)) {
        e.preventDefault();
        requestFocusPanel('playlist');
        return;
      }
    };
    document.addEventListener('keydown', handleMixerKeys);
    return () => document.removeEventListener('keydown', handleMixerKeys);
  }, []);

  // Apply color theme to :root CSS variables
  useEffect(() => {
    const theme = THEMES[settings.colorTheme] || THEMES['default'];
    const root = document.documentElement;
    Object.entries(theme.vars).forEach(([prop, value]) => {
      root.style.setProperty(prop, value);
    });
  }, [settings.colorTheme]);

  useEffect(() => {
    checkBackendHealth();

    // Poll quickly (every 3s) until backend comes online, then slow down to 30s
    const startFastPoll = () => {
      if (fastPollRef.current) return;
      fastPollRef.current = setInterval(checkBackendHealth, 3000);
    };
    startFastPoll();

    return () => {
      if (fastPollRef.current) clearInterval(fastPollRef.current);
    };
  }, [checkBackendHealth]);

  // Switch to slow polling once online
  useEffect(() => {
    if (backendStatus === 'online' && fastPollRef.current) {
      clearInterval(fastPollRef.current);
      fastPollRef.current = null;
      // Switch to slow poll
      const slow = setInterval(checkBackendHealth, 30000);
      fastPollRef.current = slow;
    }
  }, [backendStatus, checkBackendHealth]);

  return (
    <div className="app">
      {!startupCheckComplete && <StartupHealthCheck />}
      <Header />
      <div className="app-body">
        <Sidebar />
        <MainContent />
        {previewMode === 'docked' && <PreviewPanel />}
      </div>
      <StatusBar />
      {previewMode === 'floating' && <PreviewPanel />}
    </div>
  );
}

function App() {
  if (isPreviewScreen) return <PreviewScreenOutput />;
  return <MainApp />;
}

export default App;