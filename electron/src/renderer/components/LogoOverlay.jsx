import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { matchesShortcut } from '../utils/shortcutHelper';
import { FiMaximize2, FiX } from 'react-icons/fi';

function SingleLogo({ logo, containerRef, isSelected, onSelect, onRemove, zIndex }) {
  const { setLogoPosition, updateLogo } = useAppStore();
  const logoRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, startPosX: 0, startPosY: 0, startSize: 15 });
  const logoIdRef = useRef(logo.id);
  
  // Keep logoId ref updated
  useEffect(() => {
    logoIdRef.current = logo.id;
  }, [logo.id]);
  
  const handleMouseDown = useCallback((e, action) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    
    // Store current values in ref to avoid closure issues
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startPosX: logo.position.x,
      startPosY: logo.position.y,
      startSize: logo.size,
    };
    
    if (action === 'drag') {
      setIsDragging(true);
    } else if (action === 'resize') {
      setIsResizing(true);
    }
  }, [logo.position.x, logo.position.y, logo.size, onSelect]);
  
  useEffect(() => {
    if (!isDragging && !isResizing) return;
    
    const handleMouseMove = (e) => {
      if (!containerRef?.current) return;
      
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const dragStart = dragStartRef.current;
      const currentLogoId = logoIdRef.current;
      
      if (isDragging) {
        const deltaX = ((e.clientX - dragStart.x) / rect.width) * 100;
        const deltaY = ((e.clientY - dragStart.y) / rect.height) * 100;
        
        const newX = Math.max(0, Math.min(100, dragStart.startPosX + deltaX));
        const newY = Math.max(0, Math.min(100, dragStart.startPosY + deltaY));
        
        setLogoPosition(currentLogoId, newX, newY);
      } else if (isResizing) {
        const deltaX = ((e.clientX - dragStart.x) / rect.width) * 100;
        const newSize = Math.max(5, Math.min(50, dragStart.startSize + deltaX));
        updateLogo(currentLogoId, { size: newSize });
      }
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, containerRef, setLogoPosition, updateLogo]);
  
  if (!logo.enabled || !logo.imageData) return null;
  
  const logoStyle = {
    position: 'absolute',
    left: `${logo.position.x}%`,
    top: `${logo.position.y}%`,
    transform: 'translate(-50%, -50%)',
    width: `${logo.size}%`,
    opacity: logo.opacity / 100,
    cursor: isDragging ? 'grabbing' : 'grab',
    userSelect: 'none',
    zIndex: isSelected ? 200 : 100 + zIndex,
    outline: isSelected ? '2px solid var(--accent-primary)' : 'none',
    outlineOffset: 4,
    borderRadius: 4,
  };
  
  return (
    <div 
      ref={logoRef}
      style={logoStyle}
      onMouseDown={(e) => handleMouseDown(e, 'drag')}
    >
      <img 
        src={logo.imageData} 
        alt="Logo"
        style={{
          width: '100%',
          height: 'auto',
          pointerEvents: 'none',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
        }}
        draggable={false}
      />
      
      {/* Controls only shown when selected */}
      {isSelected && (
        <>
          {/* Delete button */}
          <div
            style={{
              position: 'absolute',
              right: -8,
              top: -8,
              width: 20,
              height: 20,
              background: '#e74c3c',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <FiX size={12} color="white" />
          </div>
          
          {/* Resize handle */}
          <div
            style={{
              position: 'absolute',
              right: -8,
              bottom: -8,
              width: 16,
              height: 16,
              background: 'var(--accent-primary)',
              borderRadius: '50%',
              cursor: 'nwse-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
            }}
            onMouseDown={(e) => handleMouseDown(e, 'resize')}
          >
            <FiMaximize2 size={10} color="white" />
          </div>
        </>
      )}
      
      {/* Center indicator when dragging */}
      {isDragging && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 8,
          height: 8,
          background: 'var(--accent-primary)',
          borderRadius: '50%',
          border: '2px solid white',
        }} />
      )}
    </div>
  );
}

function LogoOverlay({ containerRef, scaleFactor = 1 }) {
  const { logos, selectedLogoId, selectLogo, removeLogo, setLogoPosition, moveLogoLayerUp, moveLogoLayerDown } = useAppStore();
  const logoInteractionTs = useAppStore((s) => s.logoInteractionTs);
  const autoDeselectTimer = useRef(null);

  // Keyboard controls: Arrow keys = move pixel by pixel, Shift+Arrow = 10px, Ctrl+Up/Down = layer order
  // Uses capture phase + stopImmediatePropagation so when a logo IS selected,
  // other global handlers (timeline seek, playlist, visualizer) don't fire.
  // When no logo is selected, the event passes through normally.
  useEffect(() => {
    const handleKeyDown = (e) => {
      // No logo selected → let other handlers (visualizer, timeline, etc.) handle the keys
      const currentSelectedId = useAppStore.getState().selectedLogoId;
      if (!currentSelectedId) return;

      const sc = useAppStore.getState().shortcuts;

      // Ctrl+Up/Down = change layer order
      if (matchesShortcut(e, sc.logoLayerUp.keys)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        moveLogoLayerUp(currentSelectedId);
        // Reset auto-deselect timer
        if (autoDeselectTimer.current) clearTimeout(autoDeselectTimer.current);
        autoDeselectTimer.current = setTimeout(() => selectLogo(null), 3000);
        return;
      }
      if (matchesShortcut(e, sc.logoLayerDown.keys)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        moveLogoLayerDown(currentSelectedId);
        if (autoDeselectTimer.current) clearTimeout(autoDeselectTimer.current);
        autoDeselectTimer.current = setTimeout(() => selectLogo(null), 3000);
        return;
      }

      // Ctrl+Left/Right should pass through to playlist (next/prev track)
      if (e.ctrlKey) return;

      // Only intercept arrow keys
      const { key } = e;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return;

      // Arrow keys = move position
      e.preventDefault();
      e.stopImmediatePropagation();
      const container = containerRef?.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();

      // Determine step from matching fast or normal shortcuts
      let pxStep = 1;
      if (matchesShortcut(e, sc.logoMoveUpFast.keys) || matchesShortcut(e, sc.logoMoveDownFast.keys) ||
          matchesShortcut(e, sc.logoMoveLeftFast.keys) || matchesShortcut(e, sc.logoMoveRightFast.keys)) {
        pxStep = 10;
      }

      const pctX = (pxStep / rect.width) * 100;
      const pctY = (pxStep / rect.height) * 100;

      const logo = useAppStore.getState().logos.find(l => l.id === currentSelectedId);
      if (!logo) return;

      let newX = logo.position.x;
      let newY = logo.position.y;

      if (key === 'ArrowLeft') newX = Math.max(0, newX - pctX);
      if (key === 'ArrowRight') newX = Math.min(100, newX + pctX);
      if (key === 'ArrowUp') newY = Math.max(0, newY - pctY);
      if (key === 'ArrowDown') newY = Math.min(100, newY + pctY);

      setLogoPosition(currentSelectedId, newX, newY);

      // Reset auto-deselect timer
      if (autoDeselectTimer.current) clearTimeout(autoDeselectTimer.current);
      autoDeselectTimer.current = setTimeout(() => selectLogo(null), 3000);
    };

    // Capture phase → runs BEFORE bubble-phase handlers in other components
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [containerRef, selectLogo, setLogoPosition, moveLogoLayerUp, moveLogoLayerDown]);

  // Auto-deselect after 3 seconds of inactivity (also resets on sidebar interactions via logoInteractionTs)
  useEffect(() => {
    if (!selectedLogoId) return;
    if (autoDeselectTimer.current) clearTimeout(autoDeselectTimer.current);
    autoDeselectTimer.current = setTimeout(() => selectLogo(null), 3000);
    return () => { if (autoDeselectTimer.current) clearTimeout(autoDeselectTimer.current); };
  }, [selectedLogoId, selectLogo, logoInteractionTs]);

  // Click on preview frame background → deselect
  useEffect(() => {
    const container = containerRef?.current;
    if (!container || !selectedLogoId) return;
    const handleClick = (e) => {
      // Only deselect if click is directly on the frame (not on a logo child)
      if (e.target === container || e.target.classList.contains('frame-safe-area') || e.target.classList.contains('frame-format-badge')) {
        selectLogo(null);
      }
    };
    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [containerRef, selectedLogoId, selectLogo]);

  // Reset timer on any logo interaction
  const handleLogoSelect = useCallback((id) => {
    if (autoDeselectTimer.current) clearTimeout(autoDeselectTimer.current);
    autoDeselectTimer.current = setTimeout(() => selectLogo(null), 3000);
    selectLogo(id);
  }, [selectLogo]);

  if (!logos || logos.length === 0) return null;
  
  return (
    <>
      {logos.map((logo, index) => (
        <SingleLogo
          key={logo.id}
          logo={logo}
          containerRef={containerRef}
          isSelected={selectedLogoId === logo.id}
          onSelect={() => handleLogoSelect(logo.id)}
          onRemove={() => removeLogo(logo.id)}
          zIndex={index}
        />
      ))}
    </>
  );
}

export default LogoOverlay;
