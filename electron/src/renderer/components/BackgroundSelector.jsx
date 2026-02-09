import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiImage, FiDroplet, FiGrid } from 'react-icons/fi';

// Predefined colors
const PRESET_COLORS = [
  '#000000', // Black
  '#FFFFFF', // White
  '#00FF00', // Green (chroma key)
  '#0000FF', // Blue (chroma key)
  '#1a1a2e', // Dark blue
  '#e94560', // Red accent
  '#0f4c75', // Navy
  '#3498db', // Blue
];

function BackgroundSelector() {
  const { background, setBackgroundType, setBackgroundColor, setBackgroundImage } = useAppStore();
  const [customColor, setCustomColor] = useState(background.value || '#000000');
  const [isUploading, setIsUploading] = useState(false);
  
  const handleImageSelect = async () => {
    try {
      setIsUploading(true);
      
      // Check if we're in Electron environment
      if (window.electronAPI && window.electronAPI.openImage) {
        const result = await window.electronAPI.openImage();
        
        if (result && !result.canceled && result.filePaths.length > 0) {
          setBackgroundImage(result.filePaths[0]);
          setIsUploading(false);
          return;
        }
      }
      
      // Fallback: Web file input with backend upload
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          try {
            // Create blob URL for immediate preview
            const blobUrl = URL.createObjectURL(file);
            setBackgroundImage(blobUrl);
            
            // Upload file to backend
            const { uploadFile } = useAppStore.getState();
            const uploadResult = await uploadFile(file);
            
            if (uploadResult && uploadResult.file_path) {
              // Replace blob URL with backend path
              setBackgroundImage(uploadResult.file_path);
              console.log('🖼️ Background image uploaded successfully:', uploadResult.file_path);
            } else {
              throw new Error('Upload failed - no file path returned');
            }
          } catch (uploadError) {
            console.error('🖼️ Upload error:', uploadError);
            // Reset to color background on upload failure
            setBackgroundType('color');
            setBackgroundValue('#000000');
            alert('Image upload failed. Please try again or use a different image.');
          } finally {
            setIsUploading(false);
          }
        } else {
          setIsUploading(false);
        }
      };
      input.click();
      
    } catch (err) {
      console.error('🖼️ Image select error:', err);
      setIsUploading(false);
    }
  };
  
  return (
    <div>
      {/* Type Selection */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button 
          className={`tab ${background.type === 'color' ? 'active' : ''}`}
          onClick={() => setBackgroundType('color')}
        >
          <FiDroplet style={{ marginRight: 4 }} /> Color
        </button>
        <button 
          className={`tab ${background.type === 'image' ? 'active' : ''}`}
          onClick={() => setBackgroundType('image')}
        >
          <FiImage style={{ marginRight: 4 }} /> Image
        </button>
        <button 
          className={`tab ${background.type === 'transparent' ? 'active' : ''}`}
          onClick={() => setBackgroundType('transparent')}
        >
          <FiGrid style={{ marginRight: 4 }} /> Alpha
        </button>
      </div>
      
      {/* Color Picker */}
      {background.type === 'color' && (
        <div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(4, 1fr)', 
            gap: 8,
            marginBottom: 12,
          }}>
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => {
                  setCustomColor(color);
                  setBackgroundColor(color);
                }}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  backgroundColor: color,
                  border: background.value === color 
                    ? '3px solid var(--accent-primary)' 
                    : '2px solid var(--border-color)',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
                title={color}
              />
            ))}
          </div>
          
          <div className="form-group">
            <label className="label">Custom Color</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="color"
                value={customColor}
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  setBackgroundColor(e.target.value);
                }}
                style={{ 
                  width: 48, 
                  height: 36, 
                  padding: 0, 
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              />
              <input
                type="text"
                className="input"
                value={customColor}
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                    setBackgroundColor(e.target.value);
                  }
                }}
                placeholder="#000000"
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Image Selector */}
      {background.type === 'image' && (
        <div>
          {background.imagePath ? (
            <div style={{ marginBottom: 12 }}>
              <div 
                style={{
                  width: '100%',
                  aspectRatio: '16/9',
                  backgroundImage: `url(file://${background.imagePath})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              />
              <p style={{ fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                {background.imagePath.split(/[/\\]/).pop()}
              </p>
            </div>
          ) : (
            <div 
              className="dropzone" 
              onClick={handleImageSelect}
              style={{ padding: 24 }}
            >
              <FiImage size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
              <p>Click to select image</p>
            </div>
          )}
          
          <button 
            className="btn btn-secondary" 
            style={{ width: '100%' }}
            onClick={handleImageSelect}
            disabled={isUploading}
          >
            <FiImage /> {isUploading ? '⏳ Yüklüyor...' : background.imagePath ? 'Change Image' : 'Select Image'}
          </button>
        </div>
      )}
      
      {/* Transparent Info */}
      {background.type === 'transparent' && (
        <div style={{ 
          padding: 12, 
          background: 'var(--bg-primary)', 
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--text-secondary)',
        }}>
          <p style={{ marginBottom: 8 }}>
            <strong>Alpha Channel</strong>
          </p>
          <p>
            Transparent background will be exported as WebM (VP9) or MOV (ProRes 4444).
            Perfect for overlaying on other videos.
          </p>
        </div>
      )}
    </div>
  );
}

export default BackgroundSelector;
