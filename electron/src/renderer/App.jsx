import React, { useEffect, useRef } from 'react';
import { useAppStore } from './stores/appStore';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import StatusBar from './components/StatusBar';
import PreviewPanel from './components/PreviewPanel';
import LoadingOverlay from './components/LoadingOverlay';

function App() {
  const { checkBackendHealth, backendStatus, previewMode } = useAppStore();
  const fastPollRef = useRef(null);

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
      <LoadingOverlay />
    </div>
  );
}

export default App;