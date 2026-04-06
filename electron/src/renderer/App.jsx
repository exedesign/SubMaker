import React, { useEffect, useRef } from 'react';
import { useAppStore } from './stores/appStore';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import StatusBar from './components/StatusBar';
import PreviewPanel from './components/PreviewPanel';
import PreviewScreenOutput from './components/PreviewScreenOutput';
import THEMES from './themes';

// Detect if this window is the second-display preview output
const isPreviewScreen = new URLSearchParams(window.location.search).has('previewScreen');

function MainApp() {
  const { checkBackendHealth, backendStatus, previewMode, settings } = useAppStore();
  const fastPollRef = useRef(null);

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