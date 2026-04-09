import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';

const TEXT_STYLES = [
  { id: 'plain',       label: 'Plain',       icon: 'Aa',  desc: 'PIL overlay (post-process)' },
  { id: 'calligraphic',label: 'Calligraphic', icon: '𝒞',  desc: 'Elegant calligraphic lettering' },
  { id: 'neon',        label: 'Neon',        icon: '💡',  desc: 'Glowing neon sign' },
  { id: 'graffiti',    label: 'Graffiti',    icon: '🎨',  desc: 'Street art graffiti' },
  { id: 'gothic',      label: 'Gothic',      icon: '𝔊',  desc: 'Gothic blackletter' },
  { id: 'handwritten', label: 'Handwritten', icon: '✍',   desc: 'Handwritten script' },
  { id: 'abstract',    label: 'Abstract',    icon: '◈',   desc: 'Abstract artistic typography' },
  { id: 'retro',       label: 'Retro',       icon: '📺',  desc: 'Retro vintage style' },
  { id: 'metallic',    label: 'Metallic',    icon: '⚙',   desc: '3D shiny metallic' },
  { id: 'watercolor',  label: 'Watercolor',  icon: '🎭',  desc: 'Watercolor painted' },
  { id: 'fire',        label: 'Fire',        icon: '🔥',  desc: 'Text made of flames' },
  { id: 'stencil',     label: 'Stencil',     icon: '🔲',  desc: 'Military stencil' },
  { id: 'pixel',       label: 'Pixel',       icon: '▦',   desc: 'Pixel art 8-bit' },
  { id: 'embossed',    label: 'Embossed',    icon: '🪨',  desc: 'Carved stone embossed' },
  { id: 'glitch',      label: 'Glitch',      icon: '⚡',  desc: 'Digital glitch distorted' },
  { id: 'chalk',       label: 'Chalk',       icon: '📝',  desc: 'Chalk on blackboard' },
  { id: 'typewriter',  label: 'Typewriter',  icon: '⌨',   desc: 'Old typewriter' },
];

function TextOverlayHelper() {
  const { coverArt, updateCoverArtPrompt } = useAppStore();
  const [showTextHelper, setShowTextHelper] = useState(false);
  const [helperText, setHelperText] = useState('');
  const [helperPosition, setHelperPosition] = useState('bottom');
  const [helperStyle, setHelperStyle] = useState('plain');

  // Build macro string from current state
  const buildMacro = (text, pos, style) => {
    const stylePart = style && style !== 'plain' ? `:${style}` : '';
    return `text[${text.trim()}]@${pos}${stylePart}`;
  };

  // Regex to find existing text macros in prompt
  const textMacroRegex = /,?\s*text\[[^\]]+\](?:@[\w-]+)?(?::\w+)?/gi;

  // Replace existing macro or append new one, then trigger auto-generate via updateCoverArtPrompt
  const applyMacro = (text, pos, style) => {
    if (!text.trim()) return;
    const macro = buildMacro(text, pos, style);
    const current = coverArt.editedPrompt || '';
    let newPrompt;
    if (textMacroRegex.test(current)) {
      // Replace all existing text macros with the new one
      textMacroRegex.lastIndex = 0;
      newPrompt = current.replace(textMacroRegex, '').replace(/,\s*$/, '').trim();
      newPrompt = newPrompt ? `${newPrompt}, ${macro}` : macro;
    } else {
      newPrompt = current ? `${current}, ${macro}` : macro;
    }
    updateCoverArtPrompt(newPrompt);
  };

  const insertMacro = () => {
    if (!helperText.trim()) return;
    applyMacro(helperText, helperPosition, helperStyle);
    setHelperText('');
  };

  // When position changes, update existing macro in prompt if text is present
  const handlePositionChange = (pos) => {
    setHelperPosition(pos);
    if (helperText.trim()) {
      applyMacro(helperText, pos, helperStyle);
    }
  };

  // When style changes, update existing macro in prompt if text is present
  const handleStyleChange = (style) => {
    setHelperStyle(style);
    if (helperText.trim()) {
      applyMacro(helperText, helperPosition, style);
    }
  };

  const isAIStyle = helperStyle && helperStyle !== 'plain';

  return (
    <div className="tag-macro-section">
      <button
        className="tag-macro-toggle"
        onClick={() => setShowTextHelper(!showTextHelper)}
      >
        <span className="tag-macro-icon">T</span>
        Add Text Overlay
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: showTextHelper ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', marginLeft: 'auto' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {showTextHelper && (
        <div className="tag-macro-helper">
          <input
            type="text"
            className="tag-macro-input"
            value={helperText}
            onChange={(e) => setHelperText(e.target.value)}
            placeholder="Enter text to overlay..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && helperText.trim()) insertMacro();
            }}
          />

          {/* Style selector */}
          <div className="tag-macro-style-section">
            <div className="tag-macro-pos-title">Style {isAIStyle && <span className="tag-macro-ai-badge">AI</span>}</div>
            <div className="tag-macro-style-grid">
              {TEXT_STYLES.map(({ id, label, icon, desc }) => (
                <button
                  key={id}
                  className={`tag-macro-style-btn ${helperStyle === id ? 'active' : ''}`}
                  onClick={() => handleStyleChange(id)}
                  title={desc}
                >
                  <span className="tag-macro-style-icon">{icon}</span>
                  <span className="tag-macro-style-label">{label}</span>
                </button>
              ))}
            </div>
            {isAIStyle && (
              <div className="tag-macro-ai-note">
                AI-generated text — style rendered by Flux Klein
              </div>
            )}
          </div>

          {/* Position grid */}
          <div className="tag-macro-pos-grid">
            <div className="tag-macro-pos-title">Position</div>
            <div className="tag-macro-pos-buttons">
              {[
                { pos: 'top-left', icon: '↖' },
                { pos: 'top', icon: '↑' },
                { pos: 'top-right', icon: '↗' },
                { pos: 'left', icon: '←' },
                { pos: 'center', icon: '•' },
                { pos: 'right', icon: '→' },
                { pos: 'bottom-left', icon: '↙' },
                { pos: 'bottom', icon: '↓' },
                { pos: 'bottom-right', icon: '↘' },
              ].map(({ pos, icon }) => (
                <button
                  key={pos}
                  className={`tag-macro-pos-btn ${helperPosition === pos ? 'active' : ''}`}
                  onClick={() => handlePositionChange(pos)}
                  title={pos}
                >
                  {icon}
                </button>
              ))}
            </div>
            <button
              className="tag-macro-pos-reset"
              onClick={() => handlePositionChange('bottom')}
            >
              ↺ Reset
            </button>
          </div>

          <button
            className="tag-macro-add-btn"
            disabled={!helperText.trim()}
            onClick={insertMacro}
          >
            Insert
          </button>
        </div>
      )}
    </div>
  );
}

export default TextOverlayHelper;
