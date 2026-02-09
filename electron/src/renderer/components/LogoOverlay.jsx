import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiMaximize2, FiX } from 'react-icons/fi';

function SingleLogo({ logo, containerRef, isSelected, onSelect, onRemove }) {
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
    zIndex: isSelected ? 101 : 100,
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
  const { logos, selectedLogoId, selectLogo, removeLogo } = useAppStore();
  
  if (!logos || logos.length === 0) return null;
  
  return (
    <>
      {logos.map(logo => (
        <SingleLogo
          key={logo.id}
          logo={logo}
          containerRef={containerRef}
          isSelected={selectedLogoId === logo.id}
          onSelect={() => selectLogo(logo.id)}
          onRemove={() => removeLogo(logo.id)}
        />
      ))}
    </>
  );
}

export default LogoOverlay;
