import React, { useRef, useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { FiUpload, FiX, FiImage, FiSearch, FiLoader } from 'react-icons/fi';
import axios from 'axios';

const API_URL = window.API_URL || 'http://localhost:5000/api';

// Common fonts
const FONTS = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Impact',
  'Comic Sans MS',
  'Courier New',
];

// Alignment options (numpad style)
const ALIGNMENTS = [
  { value: 7, label: '↖' },
  { value: 8, label: '↑' },
  { value: 9, label: '↗' },
  { value: 4, label: '←' },
  { value: 5, label: '•' },
  { value: 6, label: '→' },
  { value: 1, label: '↙' },
  { value: 2, label: '↓' },
  { value: 3, label: '↘' },
];

// Anchor presets for logo positioning
const LOGO_ANCHORS = [
  { value: 'top-left', label: '↖', x: 8, y: 8 },
  { value: 'top-center', label: '↑', x: 50, y: 8 },
  { value: 'top-right', label: '↗', x: 92, y: 8 },
  { value: 'center-left', label: '←', x: 8, y: 50 },
  { value: 'center', label: '•', x: 50, y: 50 },
  { value: 'center-right', label: '→', x: 92, y: 50 },
  { value: 'bottom-left', label: '↙', x: 8, y: 92 },
  { value: 'bottom-center', label: '↓', x: 50, y: 92 },
  { value: 'bottom-right', label: '↘', x: 92, y: 92 },
];

function StyleEditor() {
  const { style, setStyle, logos, selectedLogoId, setLogoImage, clearLogo, clearAllLogos, updateLogo, setLogoAnchor, selectLogo, settings, secondarySubtitle, setSecondaryStyle } = useAppStore();
  const logoInputRef = useRef(null);
  
  // Get selected logo
  const selectedLogo = logos?.find(l => l.id === selectedLogoId);
  
  // GIF Search State
  const [showGifSearch, setShowGifSearch] = useState(false);
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState(null);
  const [activeTab, setActiveTab] = useState('trending'); // 'trending' or 'search'
  
  // Get the correct API endpoint based on provider
  const getGifEndpoint = (action) => {
    const provider = settings.gifProvider || 'tenor';
    if (provider === 'giphy') {
      return action === 'search' ? '/giphy/search' : '/giphy/trending';
    }
    return action === 'search' ? '/gif/search' : '/gif/trending';
  };
  
  // Load trending GIFs when modal opens or provider changes
  useEffect(() => {
    if (showGifSearch && activeTab === 'trending') {
      loadTrendingGifs();
    }
  }, [showGifSearch, activeTab, settings.gifProvider]);
  
  const loadTrendingGifs = async () => {
    setGifLoading(true);
    setGifError(null);
    setGifResults([]);
    try {
      const endpoint = getGifEndpoint('trending');
      const response = await axios.get(`${API_URL}${endpoint}`, { params: { limit: 20 } });
      if (response.data.success) {
        setGifResults(response.data.results);
      }
    } catch (err) {
      setGifError('Error loading GIFs');
      console.error(err);
    } finally {
      setGifLoading(false);
    }
  };
  
  const searchGifs = async () => {
    if (!gifSearchQuery.trim()) return;
    
    setGifLoading(true);
    setGifError(null);
    setGifResults([]);
    setActiveTab('search');
    
    try {
      const endpoint = getGifEndpoint('search');
      const response = await axios.get(`${API_URL}${endpoint}`, { 
        params: { q: gifSearchQuery, limit: 20 } 
      });
      if (response.data.success) {
        setGifResults(response.data.results);
      }
    } catch (err) {
      setGifError('Error performing search');
      console.error(err);
    } finally {
      setGifLoading(false);
    }
  };
  
  const selectGif = async (gif) => {
    setGifLoading(true);
    try {
      // Download the GIF to local temp folder
      const response = await axios.post(`${API_URL}/gif/download`, { url: gif.url });
      
      if (response.data.success) {
        // Set the GIF as logo using base64 data URL for display
        setLogoImage(response.data.data_url, response.data.file_path);
        setShowGifSearch(false);
      }
    } catch (err) {
      setGifError('Failed to download GIF');
      console.error(err);
    } finally {
      setGifLoading(false);
    }
  };
  
  const isDual = settings.dualSubtitleEnabled;
  const secStyle = isDual ? secondarySubtitle.style : null;
  
  return (
    <div>
      {/* Font Family */}
      <div className="form-group">
        <label className="label">Font</label>
        <select 
          className="select"
          value={style.fontName}
          onChange={(e) => setStyle({ fontName: e.target.value })}
        >
          {FONTS.map((font) => (
            <option key={font} value={font} style={{ fontFamily: font }}>
              {font}
            </option>
          ))}
        </select>
      </div>
      {isDual && (
        <div className="form-group">
          <label className="label" style={{ color: 'var(--accent-primary)' }}>2. Font</label>
          <select
            className="select"
            value={secStyle.fontName}
            onChange={(e) => setSecondaryStyle({ fontName: e.target.value })}
          >
            {FONTS.map((font) => (
              <option key={font} value={font} style={{ fontFamily: font }}>
                {font}
              </option>
            ))}
          </select>
        </div>
      )}
      
      {/* Font Size */}
      <div className="form-group">
        <label className="label">Size: {style.fontSize}px</label>
        <input
          type="range"
          className="slider"
          min={24}
          max={96}
          value={style.fontSize}
          onChange={(e) => setStyle({ fontSize: parseInt(e.target.value) })}
        />
      </div>
      {isDual && (
        <div className="form-group">
          <label className="label" style={{ color: 'var(--accent-primary)' }}>2. Size: {secStyle.fontSize}px</label>
          <input
            type="range"
            className="slider"
            min={18}
            max={72}
            value={secStyle.fontSize}
            onChange={(e) => setSecondaryStyle({ fontSize: parseInt(e.target.value) })}
          />
        </div>
      )}
      
      {/* Colors */}
      <div className="form-row">
        <div className="form-group">
          <label className="label">Text Color</label>
          <input
            type="color"
            value={style.color}
            onChange={(e) => setStyle({ color: e.target.value })}
            style={{ width: '100%', height: 36, border: 'none', borderRadius: 6, cursor: 'pointer' }}
          />
        </div>
        <div className="form-group">
          <label className="label">Border Color</label>
          <input
            type="color"
            value={style.borderColor}
            onChange={(e) => setStyle({ borderColor: e.target.value })}
            style={{ width: '100%', height: 36, border: 'none', borderRadius: 6, cursor: 'pointer' }}
          />
        </div>
      </div>
      {isDual && (
        <div className="form-row">
          <div className="form-group">
            <label className="label" style={{ color: 'var(--accent-primary)' }}>2. Text Color</label>
            <input
              type="color"
              value={secStyle.color}
              onChange={(e) => setSecondaryStyle({ color: e.target.value })}
              style={{ width: '100%', height: 36, border: 'none', borderRadius: 6, cursor: 'pointer' }}
            />
          </div>
          <div className="form-group">
            <label className="label" style={{ color: 'var(--accent-primary)' }}>2. Border Color</label>
            <input
              type="color"
              value={secStyle.borderColor}
              onChange={(e) => setSecondaryStyle({ borderColor: e.target.value })}
              style={{ width: '100%', height: 36, border: 'none', borderRadius: 6, cursor: 'pointer' }}
            />
          </div>
        </div>
      )}
      
      {/* Border & Shadow */}
      <div className="form-row">
        <div className="form-group">
          <label className="label">Border: {style.borderWidth}px</label>
          <input
            type="range"
            className="slider"
            min={0}
            max={6}
            step={0.5}
            value={style.borderWidth}
            onChange={(e) => setStyle({ borderWidth: parseFloat(e.target.value) })}
          />
        </div>
        <div className="form-group">
          <label className="label">Shadow: {style.shadowDepth}px</label>
          <input
            type="range"
            className="slider"
            min={0}
            max={5}
            step={0.5}
            value={style.shadowDepth}
            onChange={(e) => setStyle({ shadowDepth: parseFloat(e.target.value) })}
          />
        </div>
      </div>
      {isDual && (
        <div className="form-row">
          <div className="form-group">
            <label className="label" style={{ color: 'var(--accent-primary)' }}>2. Border: {secStyle.borderWidth}px</label>
            <input
              type="range"
              className="slider"
              min={0}
              max={6}
              step={0.5}
              value={secStyle.borderWidth}
              onChange={(e) => setSecondaryStyle({ borderWidth: parseFloat(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label className="label" style={{ color: 'var(--accent-primary)' }}>2. Shadow: {secStyle.shadowDepth}px</label>
            <input
              type="range"
              className="slider"
              min={0}
              max={5}
              step={0.5}
              value={secStyle.shadowDepth}
              onChange={(e) => setSecondaryStyle({ shadowDepth: parseFloat(e.target.value) })}
            />
          </div>
        </div>
      )}
      
      {/* Bold & Italic */}
      <div className="form-group">
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn ${style.bold ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setStyle({ bold: !style.bold })}
            style={{ flex: 1, fontWeight: 'bold' }}
          >
            B
          </button>
          <button
            className={`btn ${style.italic ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setStyle({ italic: !style.italic })}
            style={{ flex: 1, fontStyle: 'italic' }}
          >
            I
          </button>
        </div>
      </div>
      {isDual && (
        <div className="form-group">
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn ${secStyle.bold ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSecondaryStyle({ bold: !secStyle.bold })}
              style={{ flex: 1, fontWeight: 'bold' }}
            >
              2. B
            </button>
            <button
              className={`btn ${secStyle.italic ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSecondaryStyle({ italic: !secStyle.italic })}
              style={{ flex: 1, fontStyle: 'italic' }}
            >
              2. I
            </button>
          </div>
        </div>
      )}
      
      {/* Alignment */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <div className="form-group" style={{ flex: 'none' }}>
          <label className="label">Position</label>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: 4,
            width: 100,
          }}>
            {ALIGNMENTS.map((align) => (
              <button
                key={align.value}
                className={`btn ${style.alignment === align.value ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStyle({ alignment: align.value })}
                style={{ padding: '6px 0', fontSize: 14 }}
              >
                {align.label}
              </button>
            ))}
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => setStyle({ alignment: 2, offsetX: 0, offsetY: 0, marginVertical: 50 })}
            style={{ width: 100, marginTop: 4, fontSize: 10, padding: '3px 0', opacity: 0.7 }}
          >
            ↺ Reset
          </button>
        </div>
        {isDual && (
          <div className="form-group" style={{ flex: 'none' }}>
            <label className="label" style={{ color: 'var(--accent-primary)' }}>2. Position</label>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(3, 1fr)', 
              gap: 4,
              width: 100,
            }}>
              {ALIGNMENTS.map((align) => (
                <button
                  key={align.value}
                  className={`btn ${(secStyle.alignment || 5) === align.value ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSecondaryStyle({ alignment: align.value })}
                  style={{ padding: '6px 0', fontSize: 14 }}
                >
                  {align.label}
                </button>
              ))}
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => setSecondaryStyle({ alignment: 5, offsetX: 0, offsetY: 0, marginVertical: 120 })}
              style={{ width: 100, marginTop: 4, fontSize: 10, padding: '3px 0', opacity: 0.7 }}
            >
              ↺ Reset
            </button>
          </div>
        )}
      </div>
      
      {/* Fine Adjustment */}
      <div className="form-group">
        <label className="label">Fine Adjustment</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Horizontal: {style.offsetX || 0}px
            </label>
            <input
              type="range"
              min="-50"
              max="50"
              value={style.offsetX || 0}
              onChange={(e) => setStyle({ offsetX: parseInt(e.target.value) })}
              className="slider"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Vertical: {style.offsetY || 0}px
            </label>
            <input
              type="range"
              min="-50"
              max="50"
              value={style.offsetY || 0}
              onChange={(e) => setStyle({ offsetY: parseInt(e.target.value) })}
              className="slider"
            />
          </div>
        </div>
      </div>
      {isDual && (
        <div className="form-group">
          <label className="label" style={{ color: 'var(--accent-primary)' }}>2. Fine Adjustment</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Horizontal: {secStyle.offsetX || 0}px
              </label>
              <input
                type="range"
                min="-50"
                max="50"
                value={secStyle.offsetX || 0}
                onChange={(e) => setSecondaryStyle({ offsetX: parseInt(e.target.value) })}
                className="slider"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Vertical: {secStyle.offsetY || 0}px
              </label>
              <input
                type="range"
                min="-50"
                max="50"
                value={secStyle.offsetY || 0}
                onChange={(e) => setSecondaryStyle({ offsetY: parseInt(e.target.value) })}
                className="slider"
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Logo / Watermark Section */}
      <div className="form-group" style={{ marginTop: 24, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
        <label className="label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiImage size={16} />
            Logo / Watermark ({logos?.length || 0})
          </span>
          {logos?.length > 0 && (
            <button
              className="btn btn-secondary"
              onClick={clearAllLogos}
              style={{ padding: '4px 8px', fontSize: 10 }}
              title="Remove All"
            >
              Clear
            </button>
          )}
        </label>
        
        {/* Logo Upload */}
        <input
          type="file"
          ref={logoInputRef}
          accept="image/*,.gif"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (ev) => {
                setLogoImage(ev.target.result, file.path || file.name);
              };
              reader.readAsDataURL(file);
            }
            e.target.value = ''; // Reset for re-upload same file
          }}
        />
        
        {/* Add Logo Buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            className="btn btn-secondary"
            onClick={() => logoInputRef.current?.click()}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <FiUpload size={16} />
            Upload File
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowGifSearch(true)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <FiSearch size={16} />
            Search GIF
          </button>
        </div>
        
        {/* Logo List */}
        {logos?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              Select a logo to edit:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {logos.map((logo, index) => (
                <div
                  key={logo.id}
                  onClick={() => selectLogo(logo.id)}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: selectedLogoId === logo.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                    background: 'var(--bg-secondary)',
                    padding: 4,
                  }}
                  title={`Logo ${index + 1}`}
                >
                  <img
                    src={logo.imageData}
                    alt={`Logo ${index + 1}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Selected Logo Settings */}
        {selectedLogo && (
          <>
            <div style={{ 
              background: 'var(--bg-secondary)', 
              borderRadius: 8, 
              padding: 12,
              marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>Selected Logo Settings</span>
                <button
                  className="btn btn-secondary"
                  onClick={clearLogo}
                  style={{ padding: '4px 8px', fontSize: 10 }}
                  title="Remove This Logo"
                >
                  <FiX size={12} />
                </button>
              </div>
              
              {/* Logo Position Presets */}
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="label" style={{ fontSize: 11 }}>Position</label>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(3, 1fr)', 
                  gap: 4,
                  maxWidth: 100,
                }}>
                  {LOGO_ANCHORS.map((anchor) => (
                    <button
                      key={anchor.value}
                      className={`btn ${selectedLogo.anchor === anchor.value ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setLogoAnchor(selectedLogo.id, anchor.value)}
                      style={{ padding: '4px 0', fontSize: 12 }}
                      title={anchor.value}
                    >
                      {anchor.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                  You can also drag to reposition in the preview
                </div>
              </div>
              
              {/* Logo Size */}
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label className="label" style={{ fontSize: 11 }}>Size: {selectedLogo.size}%</label>
                <input
                  type="range"
                  className="slider"
                  min={5}
                  max={50}
                  value={selectedLogo.size}
                  onChange={(e) => updateLogo(selectedLogo.id, { size: parseInt(e.target.value) })}
                />
              </div>
              
              {/* Logo Opacity */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="label" style={{ fontSize: 11 }}>Opacity: {selectedLogo.opacity}%</label>
                <input
                  type="range"
                  className="slider"
                  min={10}
                  max={100}
                  value={selectedLogo.opacity}
                  onChange={(e) => updateLogo(selectedLogo.id, { opacity: parseInt(e.target.value) })}
                />
              </div>
            </div>
          </>
        )}
      </div>
      
      {/* GIF Search Modal */}
      {showGifSearch && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg-primary)',
            borderRadius: 12,
            width: '90%',
            maxWidth: 600,
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: 16,
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>
                {settings.gifProvider === 'giphy' ? '🎥' : '🎬'} Search GIF ({settings.gifProvider === 'giphy' ? 'Giphy' : 'Tenor'})
              </h3>
              <button
                className="btn btn-secondary"
                onClick={() => setShowGifSearch(false)}
                style={{ padding: 8 }}
              >
                <FiX size={16} />
              </button>
            </div>
            
            {/* Search Bar */}
            <div style={{ padding: 16, borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Search GIFs... (e.g. thumbs up, celebrate, fire)"
                  value={gifSearchQuery}
                  onChange={(e) => setGifSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchGifs()}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-primary"
                  onClick={searchGifs}
                  disabled={gifLoading || !gifSearchQuery.trim()}
                >
                  <FiSearch size={16} />
                </button>
              </div>
              
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  className={`btn ${activeTab === 'trending' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => { setActiveTab('trending'); loadTrendingGifs(); }}
                  style={{ fontSize: 12, padding: '6px 12px' }}
                >
                  🔥 Trend
                </button>
                <button
                  className={`btn ${activeTab === 'search' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveTab('search')}
                  style={{ fontSize: 12, padding: '6px 12px' }}
                  disabled={!gifSearchQuery.trim()}
                >
                  🔍 Search
                </button>
              </div>
            </div>
            
            {/* Results Grid */}
            <div style={{
              flex: 1,
              overflow: 'auto',
              padding: 16,
            }}>
              {gifLoading && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  padding: 40,
                  color: 'var(--text-secondary)',
                }}>
                  <FiLoader size={24} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ marginLeft: 12 }}>Loading...</span>
                </div>
              )}
              
              {gifError && (
                <div style={{
                  padding: 20,
                  textAlign: 'center',
                  color: 'var(--color-error)',
                }}>
                  {gifError}
                </div>
              )}
              
              {!gifLoading && !gifError && gifResults.length === 0 && (
                <div style={{
                  padding: 40,
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                }}>
                  {activeTab === 'search' 
                    ? 'No results found. Try searching for something else.'
                    : 'Search to load GIFs'}
                </div>
              )}
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: 8,
              }}>
                {gifResults.map((gif) => (
                  <div
                    key={gif.id}
                    onClick={() => selectGif(gif)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: 'var(--bg-secondary)',
                      aspectRatio: '1',
                      position: 'relative',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <img
                      src={`${API_URL}/gif/proxy?url=${encodeURIComponent(gif.preview_url || gif.url)}`}
                      alt={gif.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                      loading="lazy"
                      onError={(e) => {
                        console.error('GIF load error:', gif.preview_url);
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            
            {/* Footer */}
            <div style={{
              padding: 12,
              borderTop: '1px solid var(--border-color)',
              textAlign: 'center',
              fontSize: 11,
              color: 'var(--text-muted)',
            }}>
              Powered by {settings.gifProvider === 'giphy' ? 'Giphy' : 'Tenor'}
            </div>
          </div>
        </div>
      )}
      
      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default StyleEditor;
