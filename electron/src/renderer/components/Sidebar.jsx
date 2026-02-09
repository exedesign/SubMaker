import React from 'react';
import { useAppStore } from '../stores/appStore';
import BackgroundSelector from './BackgroundSelector';
import FormatSelector from './FormatSelector';
import StyleEditor from './StyleEditor';
import AnimationSelector from './AnimationSelector';
import LanguageSelector from './LanguageSelector';
import ModelSelector from './ModelSelector';

function Sidebar() {
  const { currentStep, mediaFile, subtitles } = useAppStore();
  
  // Don't show sidebar on upload step
  if (currentStep === 'upload' || !mediaFile) {
    return null;
  }
  
  return (
    <aside className="sidebar">
      {/* Settings Panel */}
      <div className="sidebar-content">
        {/* Language Settings */}
        <div className="sidebar-section">
          <h3 className="sidebar-section-title">Dil Ayarları</h3>
          <LanguageSelector />
        </div>
        
        {/* Model Settings */}
        <div className="sidebar-section">
          <h3 className="sidebar-section-title">Model Ayarları</h3>
          <ModelSelector />
        </div>
        
        {/* Background Settings */}
        <div className="sidebar-section">
          <h3 className="sidebar-section-title">Arkaplan</h3>
          <BackgroundSelector />
        </div>
        
        {/* Format Settings */}
        <div className="sidebar-section">
          <h3 className="sidebar-section-title">Video Formatı</h3>
          <FormatSelector />
        </div>
        
        {/* Style Settings */}
        <div className="sidebar-section">
          <h3 className="sidebar-section-title">Altyazı Stili</h3>
          <StyleEditor />
        </div>
        
        {/* Animation Settings */}
        <div className="sidebar-section">
          <h3 className="sidebar-section-title">Animasyon</h3>
          <AnimationSelector />
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
