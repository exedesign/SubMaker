/**
 * PreviewScreenOutput  Second display / presentation window component.
 * Receives state via BroadcastChannel('submaker-preview-sync').
 * Has its own custom titlebar with window controls (minimize / fullscreen / close).
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ButterchurnCanvas from './ButterchurnCanvas';

const CHANNEL_NAME = 'submaker-preview-sync';
const isElectron = !!window.electronAPI;

const getImageUrl = (imagePath) => {
  if (!imagePath) return null;
  if (imagePath.startsWith('blob:') || imagePath.startsWith('http')) return imagePath;
  if (imagePath.includes('\\temp\\') || imagePath.includes('/temp/')) {
    return `http://localhost:5000/api/media/temp/${imagePath.split(/[\\/]/).pop()}`;
  }
  return `http://localhost:5000/api/media/local?path=${encodeURIComponent(imagePath)}`;
};

//  Titlebar 
function PreviewTitlebar({ isFullscreen, onMinimize, onFullscreen, onClose }) {
  return (
    <div
      style={{
        height: 36,
        background: 'rgba(10,12,18,0.95)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        WebkitAppRegion: 'drag',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#e93b6a', fontSize: 13, fontWeight: 600 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>
        </svg>
        SubMaker Preview
      </div>

      {/* Window controls */}
      <div style={{ display: 'flex', gap: 6, WebkitAppRegion: 'no-drag' }}>
        <WcButton onClick={onMinimize} title="Minimize" hoverBg="rgba(255,255,255,0.12)">
          <svg width="12" height="2" viewBox="0 0 12 2"><rect width="12" height="2" rx="1" fill="currentColor"/></svg>
        </WcButton>
        <WcButton onClick={onFullscreen} title={isFullscreen ? 'Windowed' : 'Fullscreen'} hoverBg="rgba(255,255,255,0.12)">
          {isFullscreen
            ? <svg width="12" height="12" viewBox="0 0 10 10"><path d="M1 4H4V1M6 1V4H9M9 6H6V9M4 9V6H1" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg>
            : <svg width="12" height="12" viewBox="0 0 10 10"><path d="M1 1H4M1 1V4M9 1H6M9 1V4M1 9H4M1 9V6M9 9H6M9 9V6" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg>
          }
        </WcButton>
        <WcButton onClick={onClose} title="Close" hoverBg="#e53935">
          <svg width="12" height="12" viewBox="0 0 10 10"><path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </WcButton>
      </div>
    </div>
  );
}

function WcButton({ onClick, title, hoverBg, children }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 36, height: 28, borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.07)',
        background: hovered ? hoverBg : 'rgba(255,255,255,0.04)',
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', padding: 0,
        transition: 'background 0.15s',
      }}
    >
      {children}
    </button>
  );
}

//  Main component 
export default function PreviewScreenOutput() {
  const containerRef = useRef(null);
  const [state, setState] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  // Track window size
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // BroadcastChannel or localStorage poll
  useEffect(() => {
    let channel;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (e) => {
        if (e.data?.type === 'PREVIEW_STATE') setState(e.data);
      };
    } catch {
      const poll = setInterval(() => {
        try {
          const raw = localStorage.getItem('submaker-preview-state');
          if (raw) setState(JSON.parse(raw));
        } catch {}
      }, 50);
      return () => clearInterval(poll);
    }
    return () => channel?.close();
  }, []);

  // Request main window to broadcast current state on mount
  useEffect(() => {
    if (isElectron) {
      window.electronAPI.requestPreviewState?.();
    } else {
      try {
        const ch = new BroadcastChannel(CHANNEL_NAME);
        ch.postMessage({ type: 'REQUEST_STATE' });
        setTimeout(() => ch.close(), 200);
      } catch {}
    }
  }, []);

  // Listen for localStorage updates (web fallback cross-tab)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'submaker-preview-state' && e.newValue) {
        try { setState(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ESC key exits fullscreen
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        if (isElectron) {
          window.electronAPI.previewMaximize?.(); // toggles off
        } else {
          document.exitFullscreen?.();
        }
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  // Fullscreen change sync
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Body/html transparency when alpha mode active
  useEffect(() => {
    const isAlpha = state?.background?.type === 'transparent';
    document.body.style.background = isAlpha ? 'transparent' : '';
    document.documentElement.style.background = isAlpha ? 'transparent' : '';
  }, [state?.background?.type]);

  // Window control handlers
  const handleMinimize = useCallback(() => {
    if (isElectron) window.electronAPI.previewMinimize?.();
    else window.blur();
  }, []);

  const handleFullscreen = useCallback(() => {
    if (isElectron) {
      window.electronAPI.previewMaximize?.();
      // Optimistically toggle — Electron resize event will correct if needed
      setIsFullscreen(f => !f);
    } else {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  }, []);

  const handleClose = useCallback(() => {
    if (isElectron) window.electronAPI.previewClose?.();
    else window.close();
  }, []);

  //  Render values 
  const renderText = (text, animation, progress) => {
    if (!text) return null;
    if (animation?.type === 'karaoke' && progress != null) {
      const chars = Math.floor((progress / 100) * text.length);
      return (
        <span>
          <span style={{ color: animation.highlightColor || '#FFD700' }}>{text.substring(0, chars)}</span>
          <span>{text.substring(chars)}</span>
        </span>
      );
    }
    return text;
  };

  const bg   = state?.background;
  const isAlphaMode = bg?.type === 'transparent';
  const sty  = state?.style;
  const anim = state?.animation;
  const fmtW = state?.fmtWidth  || 1920;
  const fmtH = state?.fmtHeight || 1080;

  const titlebarH = isFullscreen ? 0 : 36;
  const availH = size.h - titlebarH;

  const scale = useMemo(() => {
    return Math.min(size.w / fmtW, availH / fmtH);
  }, [size, fmtW, fmtH, availH]);

  const frameW = fmtW * scale;
  const frameH = fmtH * scale;
  const sf = scale;

  const displayText = state?.displayText || null;

  const subtitleStyle = sty ? {
    fontFamily: sty.fontName || 'Arial',
    fontSize: Math.max(6, (sty.fontSize || 48) * sf),
    color: sty.color || '#FFFFFF',
    fontWeight: sty.bold ? 'bold' : 'normal',
    fontStyle: sty.italic ? 'italic' : 'normal',
    textShadow: `${Math.max(0.5, (sty.shadowDepth || 2) * sf)}px ${Math.max(0.5, (sty.shadowDepth || 2) * sf)}px ${Math.max(1, (sty.shadowDepth || 2) * 2 * sf)}px rgba(0,0,0,0.9)`,
    WebkitTextStroke: `${Math.max(0.2, (sty.borderWidth || 2) * sf)}px ${sty.borderColor || '#000000'}`,
    paintOrder: 'stroke fill',
    textAlign: sty.alignment % 3 === 1 ? 'left' : sty.alignment % 3 === 0 ? 'right' : 'center',
    lineHeight: 1.2, maxWidth: '90%', wordWrap: 'break-word',
  } : {};

  const alignment = sty?.alignment ?? 2;
  const marginV   = sty?.marginVertical ?? 80;

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: isAlphaMode ? 'transparent' : '#000', overflow: 'hidden' }}>
      {/* Custom titlebar  hidden in fullscreen */}
      {!isFullscreen && (
        <PreviewTitlebar
          isFullscreen={isFullscreen}
          onMinimize={handleMinimize}
          onFullscreen={handleFullscreen}
          onClose={handleClose}
        />
      )}

      {/* Preview frame area */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative', background: isAlphaMode ? 'transparent' : undefined }}>
        {/* Hover zone to reveal titlebar in fullscreen mode */}
        {isFullscreen && (
          <>
            <div
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, zIndex: 20 }}
              onMouseEnter={() => { const b = document.getElementById('__ps-fsbar'); if (b) b.style.transform = 'translateY(0)'; }}
            />
            <div
              id="__ps-fsbar"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 19, transform: 'translateY(-100%)', transition: 'transform 0.2s' }}
              onMouseLeave={() => { const b = document.getElementById('__ps-fsbar'); if (b) b.style.transform = 'translateY(-100%)'; }}
            >
              <PreviewTitlebar
                isFullscreen={isFullscreen}
                onMinimize={handleMinimize}
                onFullscreen={handleFullscreen}
                onClose={handleClose}
              />
            </div>
          </>
        )}

        {/* Video frame */}
        <div
          ref={containerRef}
          style={{
            width: frameW, height: frameH,
            position: 'relative', overflow: 'hidden',
            backgroundColor: isAlphaMode ? 'transparent' : bg?.type === 'color' ? bg.value : '#000000',
            backgroundImage: !isAlphaMode && bg?.type === 'image' && bg.imagePath
              ? `url(${getImageUrl(bg.imagePath)})`
              : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Butterchurn Visualizer Overlay */}
          {state?.visualizer?.enabled && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              opacity: state.visualizer.opacity ?? 0.8,
              zIndex: 1, pointerEvents: 'none',
            }}>
              <ButterchurnCanvas
                width={frameW}
                height={frameH}
                audioElement={null}
                presetName={state.visualizer.presetName}
                sensitivity={state.visualizer.sensitivity ?? 1.0}
              />
            </div>
          )}

          {/* Logo overlays */}
          {(state?.logos || []).map(logo => (
            <img
              key={logo.id}
              src={logo.imageData}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                left: `${logo.position.x}%`,
                top: `${logo.position.y}%`,
                transform: 'translate(-50%, -50%)',
                width: `${logo.size}%`,
                opacity: logo.opacity / 100,
                pointerEvents: 'none',
                zIndex: 3,
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
              }}
            />
          ))}

          {/* Primary subtitle */}
          {displayText && (
            <div style={{
              position: 'absolute',
              top: alignment >= 7 ? '8%' : alignment >= 4 ? '42%' : 'auto',
              bottom: alignment <= 3 ? `${Math.max(4, marginV * sf)}px` : 'auto',
              left: '5%', right: '5%',
              display: 'flex',
              justifyContent: alignment % 3 === 1 ? 'flex-start' : alignment % 3 === 0 ? 'flex-end' : 'center',
              flexDirection: 'column',
              alignItems: 'center',
              zIndex: 2,
            }}>
              <span style={{ ...subtitleStyle, direction: state?.isRtl ? 'rtl' : 'ltr' }}>
                {renderText(displayText, anim, state?.animationProgress)}
              </span>
            </div>
          )}

          {/* Secondary subtitle */}
          {state?.secondaryText && state?.secondaryStyle && (
            <div style={{
              position: 'absolute',
              bottom: `${Math.max(4, (state.secondaryStyle.marginVertical || 120) * sf)}px`,
              left: '5%', right: '5%',
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              zIndex: 2,
            }}>
              <span style={{
                fontFamily: state.secondaryStyle.fontName || 'Arial',
                fontSize: Math.max(5, (state.secondaryStyle.fontSize || 36) * sf * 0.8),
                color: state.secondaryStyle.color || '#FFFF00',
                fontWeight: state.secondaryStyle.bold ? 'bold' : 'normal',
                textShadow: '2px 2px 4px rgba(0,0,0,0.9)',
                WebkitTextStroke: `1px ${state.secondaryStyle.borderColor || '#000'}`,
                paintOrder: 'stroke fill',
                lineHeight: 1.2, textAlign: 'center',
              }}>
                {state.secondaryText}
              </span>
            </div>
          )}

          {/* Subtle waiting indicator */}
          {!state && (
            <div style={{
              position: 'absolute', bottom: 10, right: 14,
              fontSize: 11, color: 'rgba(255,255,255,0.18)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'rgba(233,59,106,0.45)',
                display: 'inline-block',
                animation: 'psblink 1.5s ease-in-out infinite',
              }} />
              Waiting for main window
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes psblink{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
    </div>
  );
}
