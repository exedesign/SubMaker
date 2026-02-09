import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiPlay, FiPause, FiVolume2, FiVolumeX, FiMaximize, FiSkipBack, FiSkipForward } from 'react-icons/fi';
import SubtitleTimeline from './SubtitleTimeline';

const API_URL = 'http://localhost:5000/api';

function VideoPreview() {
  const { 
    mediaFile, 
    originalFileName,
    savedFileName,
    mediaType,
    videoFormat, 
    subtitles, 
    style, 
    background,
    setPlaybackTime,
    setIsPlaying: setGlobalIsPlaying,
    setGlobalAudioRef,
    settings,
    secondarySubtitle,
  } = useAppStore();
  
  // Convert local file path to API URL for browser access
  const mediaUrl = useMemo(() => {
    if (!mediaFile) return null;
    // Use savedFileName (UUID) for API requests, fallback to extracting from path
    const filename = savedFileName || mediaFile.split(/[\\/]/).pop();
    const url = `${API_URL}/media/temp/${encodeURIComponent(filename)}`;
    return url;
  }, [mediaFile, savedFileName]);
  
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const audioRef = useRef(null);
  
  // Register global audio ref in store for other components to use
  useEffect(() => {
    setGlobalAudioRef(audioRef);
    return () => setGlobalAudioRef(null); // Cleanup
  }, [setGlobalAudioRef]);
  
  // Reset state when media changes
  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
    setDuration(0);
    setIsLoaded(false);
    setLoadError(null);
  }, [mediaUrl]);
  
  // Find active subtitle - end dahil değil, çakışma önlenir
  const activeSubtitle = useMemo(() => {
    return subtitles.find(
      sub => currentTime >= sub.start && currentTime < sub.end
    );
  }, [subtitles, currentTime]);

  // Aktif subtitle'ın index'i
  const activeSubtitleIndex = useMemo(() => {
    if (!activeSubtitle || !subtitles.length) return -1;
    return subtitles.findIndex(s => s.id === activeSubtitle.id);
  }, [activeSubtitle, subtitles]);
  
  // Find secondary subtitle text to display - TIME BASED
  const secondaryText = useMemo(() => {
    if (!settings?.dualSubtitleEnabled) return null;
    if (!secondarySubtitle?.subtitles?.length) return null;
    
    // Current time'a göre aktif ikincil altyazıyı bul
    const translation = secondarySubtitle.subtitles.find(sub => 
      currentTime >= sub.start && currentTime < sub.end
    );
    
    return translation?.translatedText || null;
  }, [settings?.dualSubtitleEnabled, secondarySubtitle?.subtitles, currentTime]);
  
  // Handle play/pause
  const togglePlay = useCallback(async () => {
    if (!audioRef.current || !isLoaded) {
      console.log('Audio not ready yet');
      return;
    }
    
    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.log('Playback error:', error.message);
      setLoadError(error.message);
    }
  }, [isPlaying, isLoaded]);
  
  // Skip forward/backward
  const skip = useCallback((seconds) => {
    if (audioRef.current) {
      const newTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds));
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }, [duration]);
  
  // Toggle mute
  const toggleMute = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);
  
  // Format time display
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${mins}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // Get background style
  const getBackgroundStyle = () => {
    if (background.type === 'color') {
      return { backgroundColor: background.value };
    } else if (background.type === 'image' && background.imagePath) {
      return { 
        backgroundImage: `url(file://${background.imagePath})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    } else if (background.type === 'transparent') {
      return { 
        background: 'repeating-conic-gradient(#808080 0% 25%, #404040 0% 50%) 50% / 20px 20px',
      };
    }
    return { backgroundColor: '#000' };
  };
  
  // Get subtitle style
  const getSubtitleStyle = () => ({
    fontFamily: style.fontName,
    fontSize: `${style.fontSize / 2}px`, // Scale down for preview
    color: style.color,
    fontWeight: style.bold ? 'bold' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    textShadow: `${style.shadowDepth}px ${style.shadowDepth}px ${style.shadowDepth * 2}px rgba(0,0,0,0.8)`,
    WebkitTextStroke: `${style.borderWidth / 2}px ${style.borderColor}`,
    paintOrder: 'stroke fill',
  });
  
  // Get secondary subtitle style
  const getSecondarySubtitleStyle = () => {
    const secStyle = secondarySubtitle?.style || {};
    return {
      fontFamily: secStyle.fontName || 'Arial',
      fontSize: `${(secStyle.fontSize || 36) / 2}px`, // Scale down for preview
      color: secStyle.color || '#FFFF00',
      fontWeight: secStyle.bold ? 'bold' : 'normal',
      fontStyle: secStyle.italic ? 'italic' : 'normal',
      textShadow: `${secStyle.shadowDepth || 1}px ${secStyle.shadowDepth || 1}px ${(secStyle.shadowDepth || 1) * 2}px rgba(0,0,0,0.8)`,
      WebkitTextStroke: `${(secStyle.borderWidth || 2) / 2}px ${secStyle.borderColor || '#000000'}`,
      paintOrder: 'stroke fill',
    };
  };
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Preview Container */}
      <div 
        className={`video-preview ${videoFormat === 'vertical' ? 'vertical' : ''}`}
        style={{
          ...getBackgroundStyle(),
          maxWidth: videoFormat === 'vertical' ? 300 : '100%',
          margin: '0 auto',
        }}
      >
        {/* Hidden audio element */}
        {mediaUrl && (
          <audio
            ref={audioRef}
            src={mediaUrl}
            preload="auto"
            onTimeUpdate={(e) => {
              const time = e.target.currentTime;
              setCurrentTime(time);
              setPlaybackTime(time); // Global state for FloatingPreview sync
            }}
            onLoadedMetadata={(e) => {
              setDuration(e.target.duration);
              setIsLoaded(true);
              setLoadError(null);
            }}
            onLoadedData={() => {
              setIsLoaded(true);
            }}
            onCanPlay={() => {
              setIsLoaded(true);
            }}
            onCanPlayThrough={() => {}}
            onEnded={() => {
              setIsPlaying(false);
              setGlobalIsPlaying(false);
            }}
            onError={(e) => {
              const error = e.target.error;
              const errorMessages = {
                1: 'MEDIA_ERR_ABORTED: Loading aborted',
                2: 'MEDIA_ERR_NETWORK: Network error',
                3: 'MEDIA_ERR_DECODE: Decode error',
                4: 'MEDIA_ERR_SRC_NOT_SUPPORTED: Format not supported'
              };
              const message = error ? (errorMessages[error.code] || `Error code: ${error.code}`) : 'Unknown error';
              console.error('Audio load error:', message);
              setLoadError(message);
              setIsLoaded(false);
            }}
            onPause={() => {
              setIsPlaying(false);
              setGlobalIsPlaying(false);
            }}
            onPlay={() => {
              setIsPlaying(true);
              setGlobalIsPlaying(true);
            }}
            onStalled={() => {}}
            onSuspend={() => {}}
            onWaiting={() => {}}
          />
        )}
        
        {/* Loading/Error indicator */}
        {mediaUrl && !isLoaded && !loadError && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'white',
            fontSize: 14,
          }}>
            Loading audio...
          </div>
        )}
        
        {loadError && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#ff6b6b',
            fontSize: 12,
            textAlign: 'center',
            padding: 20,
          }}>
            {loadError}
          </div>
        )}
        
        {/* Subtitle Overlay - Primary */}
        {activeSubtitle && (
          <div 
            className="subtitle-overlay"
            style={{
              bottom: style.alignment <= 3 ? '10%' : style.alignment <= 6 ? '45%' : '80%',
              textAlign: style.alignment % 3 === 1 ? 'left' : style.alignment % 3 === 0 ? 'right' : 'center',
            }}
          >
            <span className="subtitle-text" style={getSubtitleStyle()}>
              {activeSubtitle.text}
            </span>
          </div>
        )}
        
        {/* DEBUG: Her zaman görünür test */}
        <div 
          style={{
            position: 'absolute',
            top: '5px',
            left: '5px',
            backgroundColor: 'red',
            color: 'white',
            padding: '5px',
            fontSize: '12px',
            zIndex: 9999,
          }}
        >
          VideoPreview Active
        </div>
        
        {/* Subtitle Overlay - Secondary (Translated) */}
        {settings?.dualSubtitleEnabled && (
          <div 
            className="subtitle-overlay secondary-subtitle"
            style={{
              bottom: '6%',
              left: '50%',
              transform: 'translateX(-50%)',
              textAlign: 'center',
              position: 'absolute',
            }}
          >
            <span className="subtitle-text" style={{
              fontFamily: secondarySubtitle?.style?.fontName || 'Arial',
              fontSize: `${Math.max(12, (secondarySubtitle?.style?.fontSize || 36) * 0.7)}px`,
              color: secondarySubtitle?.style?.color || '#FFFF00',
              fontWeight: secondarySubtitle?.style?.bold ? 'bold' : 'normal',
              fontStyle: secondarySubtitle?.style?.italic ? 'italic' : 'normal',
              textShadow: '1px 1px 2px rgba(0,0,0,0.9)',
              WebkitTextStroke: `1px ${secondarySubtitle?.style?.borderColor || '#000'}`,
              paintOrder: 'stroke fill',
            }}>
              {secondaryText || `[Test: ${secondarySubtitle?.subtitles?.length || 0} çeviri mevcut]`}
            </span>
          </div>
        )}
        
        {/* Orijinal Secondary */}
        {secondaryText && (
          <div 
            className="subtitle-overlay secondary-subtitle"
            style={{
              bottom: '3%',
              textAlign: 'center',
            }}
          >
            <span className="subtitle-text" style={getSecondarySubtitleStyle()}>
              {secondaryText}
            </span>
          </div>
        )}
      </div>
      
      {/* Controls */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 8,
        padding: '8px 12px',
        background: 'var(--bg-secondary)',
        borderRadius: 8,
      }}>
        {/* Skip back */}
        <button 
          className="btn btn-ghost btn-icon" 
          onClick={() => skip(-5)}
          title="5 saniye geri"
          disabled={!isLoaded}
        >
          <FiSkipBack size={16} />
        </button>
        
        {/* Play/Pause */}
        <button 
          className="btn btn-ghost btn-icon" 
          onClick={togglePlay}
          disabled={!isLoaded}
          style={{ opacity: isLoaded ? 1 : 0.5 }}
        >
          {isPlaying ? <FiPause size={18} /> : <FiPlay size={18} />}
        </button>
        
        {/* Skip forward */}
        <button 
          className="btn btn-ghost btn-icon" 
          onClick={() => skip(5)}
          title="5 saniye ileri"
          disabled={!isLoaded}
        >
          <FiSkipForward size={16} />
        </button>
        
        {/* Time display */}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 75, fontFamily: 'monospace' }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        
        {/* Progress slider */}
        <input
          type="range"
          className="slider"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          disabled={!isLoaded}
          onChange={(e) => {
            const time = parseFloat(e.target.value);
            setCurrentTime(time);
            if (audioRef.current) {
              audioRef.current.currentTime = time;
            }
          }}
          style={{ flex: 1 }}
        />
        
        {/* Volume */}
        <button 
          className="btn btn-ghost btn-icon" 
          onClick={toggleMute}
          title={isMuted ? 'Sesi aç' : 'Sesi kapat'}
        >
          {isMuted ? <FiVolumeX size={16} /> : <FiVolume2 size={16} />}
        </button>
      </div>
      
      {/* Subtitle Timeline */}
      {subtitles.length > 0 && (
        <SubtitleTimeline 
          currentTime={currentTime}
          duration={duration}
          onSeek={(time) => {
            setCurrentTime(time);
            if (audioRef.current) {
              audioRef.current.currentTime = time;
            }
          }}
        />
      )}
    </div>
  );
}

export default VideoPreview;
