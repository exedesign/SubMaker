import React from 'react';
import { useAppStore } from '../stores/appStore';
import VideoDropzone from './VideoDropzone';
import SubtitleEditor from './SubtitleEditor';
import VideoPreview from './VideoPreview';
import RenderPanel from './RenderPanel';
import SimpleSunoImporter from './SimpleSunoImporter';

function MainContent() {
  const { currentStep, mediaFile } = useAppStore();
  
  return (
    <main className="main-content">
      {/* Upload Step */}
      {(currentStep === 'upload' || !mediaFile) && (
        <div style={{ height: '100%', padding: '20px', overflow: 'auto' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <VideoDropzone />
          </div>
        </div>
      )}
      
      {/* Post-Upload: Show Suno Importer */}
      {mediaFile && currentStep === 'transcribe' && (
        <div style={{ height: '100%', padding: '20px', overflow: 'auto' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ 
              textAlign: 'center', 
              marginBottom: '30px',
              padding: '20px',
              background: 'var(--bg-secondary)',
              borderRadius: '12px',
              border: '1px solid var(--border-color)'
            }}>
              <h2 style={{ margin: '0 0 8px 0', color: 'var(--text-color)' }}>
                🎵 Media Loaded Successfully!
              </h2>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>
                Now you can import AI lyrics or transcribe the audio directly
              </p>
            </div>
            
            <SimpleSunoImporter />
            
            <div style={{ 
              marginTop: '30px', 
              textAlign: 'center',
              padding: '20px',
              background: 'var(--bg-tertiary)',
              borderRadius: '12px',
              border: '1px solid var(--border-color)'
            }}>
              <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-color)' }}>
                Or use AI transcription
              </h3>
              <p style={{ margin: '0 0 16px 0', color: 'var(--text-muted)', fontSize: '14px' }}>
                Let AI automatically transcribe your audio into subtitles
              </p>
              <button 
                className="btn btn-primary"
                onClick={() => useAppStore.getState().transcribe()}
                style={{ padding: '12px 24px', fontSize: '14px' }}
              >
                🎙️ Start AI Transcription
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Editing Steps */}
      {mediaFile && (currentStep === 'edit' || currentStep === 'style' || currentStep === 'render') && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Preview Area */}
          <div style={{ flex: '0 0 auto', padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
            <VideoPreview />
          </div>
          
          {/* Editor Area */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <SubtitleEditor />
          </div>
          
          {/* Render Panel */}
          <RenderPanel />
        </div>
      )}
    </main>
  );
}

export default MainContent;
