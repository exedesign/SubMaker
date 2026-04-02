import React from 'react';
import { useAppStore } from '../stores/appStore';
import { fetchJson } from '../services/electronTransport';
import { 
  FiFolder, FiClock, FiMusic, FiEdit3, FiVideo, FiCheck, 
  FiLoader, FiMic, FiFilm, FiX 
} from 'react-icons/fi';

function StatusBar() {
  const { 
    backendStatus, 
    mediaFile, 
    originalFileName,
    subtitles, 
    currentStep,
    isProcessing,
    processingStep,
    processingProgress,
    outputPath,
    mediaDuration,
    cancelRender,
    renderJobId,
  } = useAppStore();
  
  // Output klasörünü aç
  const openOutputFolder = async () => {
    try {
      // Electron API varsa kullan
      if (window.electronAPI?.openPath) {
        if (outputPath) {
          // Dosya varsa dosyayı Explorer'da göster
          await window.electronAPI.openPath(outputPath);
        } else {
          // Varsayılan output klasörünü aç
          const defaultOutput = 'D:\\AI\\SubMaker\\output';
          await window.electronAPI.openPath(defaultOutput);
        }
      } else {
        // Tarayıcı modunda - backend üzerinden aç
        const folderPath = outputPath 
          ? outputPath.substring(0, outputPath.lastIndexOf('\\'))
          : 'D:\\AI\\SubMaker\\output';
        
        // Backend'e klasör açma isteği gönder
        await fetchJson(`http://localhost:5000/api/open-folder?path=${encodeURIComponent(folderPath)}`);
      }
    } catch (error) {
      console.error('Error opening output folder:', error);
    }
  };
  
  // Süreyi formatla
  const formatDuration = (seconds) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // İşlem tipini belirle
  const getProcessType = () => {
    const step = processingStep?.toLowerCase() || '';
    if (step.includes('transcri') || step.includes('transkrip') || step.includes('model') || step.includes('whisper')) {
      return 'transcribe';
    }
    if (step.includes('render') || step.includes('video') || step.includes('altyazı') || step.includes('ffmpeg') || step.includes('oluşturul')) {
      return 'render';
    }
    if (step.includes('upload') || step.includes('yükle')) {
      return 'upload';
    }
    return 'other';
  };
  
  const processType = getProcessType();
  
  // İşlem yapılıyorsa tam genişlikte progress bar göster
  if (isProcessing) {
    return (
      <div className="status-bar processing-mode">
        <div className="status-process-full">
          {/* İkon ve başlık */}
          <div className="process-header">
            {processType === 'transcribe' && <FiMic className="process-icon pulse" size={18} />}
            {processType === 'render' && <FiFilm className="process-icon spin-slow" size={18} />}
            {processType === 'upload' && <FiMusic className="process-icon" size={18} />}
            {processType === 'other' && <FiLoader className="process-icon spin" size={18} />}
            
            <span className="process-title">
              {processType === 'transcribe' && 'Transkripsiyon'}
              {processType === 'render' && 'Video Oluşturuluyor'}
              {processType === 'upload' && 'Dosya Yükleniyor'}
              {processType === 'other' && 'İşleniyor'}
            </span>
          </div>
          
          {/* Progress bar */}
          <div className="process-progress-wrapper">
            <div className="process-progress-bar">
              <div 
                className={`process-progress-fill ${processType}`}
                style={{ width: `${processingProgress || 0}%` }}
              />
            </div>
            <span className="process-percent">{processingProgress || 0}%</span>
          </div>
          
          {/* Durum mesajı */}
          <div className="process-status">
            <span className="process-step">{processingStep}</span>
          </div>
          
          {/* İptal butonu (sadece render için) */}
          {renderJobId && (
            <button 
              className="process-cancel-btn"
              onClick={cancelRender}
              title="İptal Et"
            >
              <FiX size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }
  
  // Normal durum
  return (
    <div className="status-bar">
      {/* Sol: Backend durumu */}
      <div className="status-section left">
        <div className="status-item">
          <span 
            className={`status-dot ${
              backendStatus === 'online' ? '' : 
              backendStatus === 'checking' ? 'loading' : 'offline'
            }`}
          />
          <span className="status-label">
            {backendStatus === 'online' ? 'Bağlı' :
             backendStatus === 'checking' ? 'Kontrol...' : 'Çevrimdışı'}
          </span>
        </div>
        
        {mediaFile && (
          <>
            <div className="status-divider" />
            <div className="status-item file-info">
              <FiMusic size={12} />
              <span className="status-label truncate" title={originalFileName || mediaFile}>
                {originalFileName || (mediaFile ? mediaFile.split(/[/\\]/).pop() : '')}
              </span>
            </div>
            
            {mediaDuration > 0 && (
              <div className="status-item">
                <FiClock size={12} />
                <span className="status-label">{formatDuration(mediaDuration)}</span>
              </div>
            )}
          </>
        )}
        
        {subtitles.length > 0 && (
          <>
            <div className="status-divider" />
            <div className="status-item">
              <span className="status-badge">{subtitles.length}</span>
              <span className="status-label">altyazı</span>
            </div>
          </>
        )}
      </div>
      
      {/* Orta: Adım bilgisi */}
      <div className="status-section center">
        <div className="status-step">
          {currentStep === 'upload' && <FiMusic size={14} />}
          {currentStep === 'transcribe' && <FiMic size={14} />}
          {currentStep === 'edit' && <FiEdit3 size={14} />}
          {(currentStep === 'style' || currentStep === 'render') && <FiFilm size={14} />}
          {currentStep === 'complete' && <FiCheck size={14} style={{ color: 'var(--accent-success)' }} />}
          <span>
            {currentStep === 'upload' && 'Dosya Yükle'}
            {currentStep === 'transcribe' && 'Transkript'}
            {currentStep === 'edit' && 'Düzenleme'}
            {(currentStep === 'style' || currentStep === 'render') && 'Video Oluşturma'}
            {currentStep === 'complete' && 'Tamamlandı'}
          </span>
        </div>
      </div>
      
      {/* Sağ: Output klasörü */}
      <div className="status-section right">
        {outputPath ? (
          <button 
            className="status-output-btn success"
            onClick={openOutputFolder}
            title={`Çıktı: ${outputPath}`}
          >
            <FiCheck size={14} />
            <span>Çıktıyı Aç</span>
            <FiFolder size={14} />
          </button>
        ) : (
          <button 
            className="status-output-btn"
            onClick={openOutputFolder}
            title="Output klasörünü aç"
          >
            <FiFolder size={14} />
            <span>Output</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default StatusBar;
