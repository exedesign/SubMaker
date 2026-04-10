import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';

const TEXT_STYLES = [
  { id: 'plain',       label: 'Plain',       icon: 'Aa' },
  { id: 'calligraphic',label: 'Calligraphic', icon: '𝒞' },
  { id: 'neon',        label: 'Neon',        icon: '💡' },
  { id: 'graffiti',    label: 'Graffiti',    icon: '🎨' },
  { id: 'gothic',      label: 'Gothic',      icon: '𝔊' },
  { id: 'handwritten', label: 'Handwritten', icon: '✍' },
  { id: 'abstract',    label: 'Abstract',    icon: '◈' },
  { id: 'retro',       label: 'Retro',       icon: '📺' },
  { id: 'metallic',    label: 'Metallic',    icon: '⚙' },
  { id: 'watercolor',  label: 'Watercolor',  icon: '🎭' },
  { id: 'fire',        label: 'Fire',        icon: '🔥' },
  { id: 'stencil',     label: 'Stencil',     icon: '🔲' },
  { id: 'pixel',       label: 'Pixel',       icon: '▦' },
  { id: 'embossed',    label: 'Embossed',    icon: '🪨' },
  { id: 'glitch',      label: 'Glitch',      icon: '⚡' },
  { id: 'chalk',       label: 'Chalk',       icon: '📝' },
  { id: 'typewriter',  label: 'Typewriter',  icon: '⌨' },
];

const POSITIONS = [
  { pos: 'top-left', icon: '↖' },
  { pos: 'top', icon: '↑' },
  { pos: 'top-right', icon: '↗' },
  { pos: 'left', icon: '←' },
  { pos: 'center', icon: '•' },
  { pos: 'right', icon: '→' },
  { pos: 'bottom-left', icon: '↙' },
  { pos: 'bottom', icon: '↓' },
  { pos: 'bottom-right', icon: '↘' },
];

const POS_ICONS = Object.fromEntries(POSITIONS.map(p => [p.pos, p.icon]));
const STYLE_MAP = Object.fromEntries(TEXT_STYLES.map(s => [s.id, s]));

function parseTextMacros(prompt) {
  const macros = [];
  if (!prompt) return macros;
  const regex = /text\[([^\]]+)\](?:@([\w-]+))?(?::(\w+))?/gi;
  let match;
  while ((match = regex.exec(prompt)) !== null) {
    macros.push({
      text: match[1],
      position: match[2] || 'bottom',
      style: match[3] || 'plain',
    });
  }
  return macros;
}

function buildMacro(m) {
  const stylePart = m.style && m.style !== 'plain' ? `:${m.style}` : '';
  return `text[${m.text}]@${m.position}${stylePart}`;
}

function rebuildPrompt(prompt, newMacros) {
  let clean = (prompt || '').replace(/,?\s*text\[[^\]]+\](?:@[\w-]+)?(?::\w+)?/gi, '').replace(/,\s*$/, '').trim();
  const parts = newMacros.map(buildMacro);
  if (parts.length > 0) {
    clean = clean ? `${clean}, ${parts.join(', ')}` : parts.join(', ');
  }
  return clean;
}

function TextOverlayHelper() {
  const { coverArt, updateCoverArtPrompt } = useAppStore();
  const [activeIdx, setActiveIdx] = useState(null);
  const [newText, setNewText] = useState('');
  const [editIdx, setEditIdx] = useState(null);
  const [editValue, setEditValue] = useState('');

  const macros = parseTextMacros(coverArt.editedPrompt);

  const updateMacros = (newMacros) => {
    updateCoverArtPrompt(rebuildPrompt(coverArt.editedPrompt, newMacros));
  };

  const addText = () => {
    const text = newText.trim();
    if (!text) return;
    updateMacros([...macros, { text, position: 'bottom', style: 'plain' }]);
    setNewText('');
  };

  const removeMacro = (idx) => {
    updateMacros(macros.filter((_, i) => i !== idx));
    setActiveIdx(null);
  };

  const changeMacroStyle = (idx, style) => {
    updateMacros(macros.map((m, i) => i === idx ? { ...m, style } : m));
  };

  const changeMacroPosition = (idx, position) => {
    updateMacros(macros.map((m, i) => i === idx ? { ...m, position } : m));
  };

  const handleEditStart = (idx) => {
    setEditIdx(idx);
    setEditValue(macros[idx].text);
    setActiveIdx(null);
  };

  const handleEditConfirm = (idx) => {
    if (editValue.trim()) {
      updateMacros(macros.map((m, i) => i === idx ? { ...m, text: editValue.trim() } : m));
    }
    setEditIdx(null);
  };

  return (
    <div className="text-overlay-section">
      {/* Text Overlay Chips */}
      {macros.length > 0 && (
        <div className="text-overlay-chips">
          {macros.map((macro, idx) => {
            const styleInfo = STYLE_MAP[macro.style] || STYLE_MAP.plain;
            const posIcon = POS_ICONS[macro.position] || '↓';
            const isActive = activeIdx === idx;
            const isEditing = editIdx === idx;

            return (
              <div key={idx} className="text-overlay-chip-wrapper">
                {isEditing ? (
                  <input
                    className="tag-chip-edit"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => handleEditConfirm(idx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEditConfirm(idx);
                      if (e.key === 'Escape') setEditIdx(null);
                    }}
                    autoFocus
                    style={{ borderColor: '#14b8a6' }}
                  />
                ) : (
                  <button
                    className={`text-overlay-chip ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveIdx(isActive ? null : idx)}
                    onDoubleClick={() => handleEditStart(idx)}
                    title="Click for style/position, double-click to edit text"
                  >
                    <span className="text-overlay-chip-badge">T</span>
                    <span className="text-overlay-chip-text">{macro.text}</span>
                    <span className="text-overlay-chip-meta" title={styleInfo.label}>{styleInfo.icon}</span>
                    <span className="text-overlay-chip-meta" title={macro.position}>{posIcon}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="tag-chip-remove"
                      onClick={(e) => { e.stopPropagation(); removeMacro(idx); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); removeMacro(idx); } }}
                      title="Remove"
                    >
                      ×
                    </span>
                  </button>
                )}

                {/* Dropdown: Style & Position editor */}
                {isActive && (
                  <div className="text-overlay-dropdown">
                    <div className="text-overlay-dropdown-section">
                      <div className="text-overlay-dropdown-title">
                        Style {macro.style !== 'plain' && <span className="tag-macro-ai-badge">AI</span>}
                      </div>
                      <div className="text-overlay-style-grid">
                        {TEXT_STYLES.map(({ id, label, icon }) => (
                          <button
                            key={id}
                            className={`text-overlay-style-opt ${macro.style === id ? 'active' : ''}`}
                            onClick={() => changeMacroStyle(idx, id)}
                            title={label}
                          >
                            <span>{icon}</span>
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="text-overlay-dropdown-section">
                      <div className="text-overlay-dropdown-title">Position</div>
                      <div className="text-overlay-pos-grid">
                        {POSITIONS.map(({ pos, icon }) => (
                          <button
                            key={pos}
                            className={`tag-macro-pos-btn ${macro.position === pos ? 'active' : ''}`}
                            onClick={() => changeMacroPosition(idx, pos)}
                            title={pos}
                          >
                            {icon}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add new text overlay */}
      <div className="text-overlay-add">
        <span className="text-overlay-add-icon">T</span>
        <input
          className="text-overlay-add-input"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Add text overlay..."
          onKeyDown={(e) => { if (e.key === 'Enter') addText(); }}
        />
        <button
          className="text-overlay-add-btn"
          disabled={!newText.trim()}
          onClick={addText}
          title="Add text overlay"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default TextOverlayHelper;
