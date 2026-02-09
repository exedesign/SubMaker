import React, { useEffect } from 'react';
import { useAppStore } from './stores/appStore';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import StatusBar from './components/StatusBar';
import PreviewPanel from './components/PreviewPanel';

function App() {
  const { checkBackendHealth, previewMode } = useAppStore();

  useEffect(() => {
    // Check backend health on mount
    checkBackendHealth();
    
    // Periodically check backend status (every 30 seconds)
    const interval = setInterval(checkBackendHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app">
      <Header />
      <div className="app-body">
        <Sidebar />
        <MainContent />
        {/* Docked preview panel */}
        {previewMode === 'docked' && <PreviewPanel />}
      </div>
      <StatusBar />
      {/* Floating preview panel */}
      {previewMode === 'floating' && <PreviewPanel />}
    </div>
  );
}

export default App;
