import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';

/**
 * Tag type → color mapping for chips
 */
const TAG_COLORS = {
  color:       { bg: 'rgba(239, 68, 68, 0.15)',  border: '#ef4444', text: '#fca5a5' },
  subject:     { bg: 'rgba(59, 130, 246, 0.15)',  border: '#3b82f6', text: '#93c5fd' },
  environment: { bg: 'rgba(16, 185, 129, 0.15)',  border: '#10b981', text: '#6ee7b7' },
  action:      { bg: 'rgba(249, 115, 22, 0.15)',  border: '#f97316', text: '#fdba74' },
  style:       { bg: 'rgba(168, 85, 247, 0.15)',  border: '#a855f7', text: '#c4b5fd' },
};

const TAG_LABELS = {
  color: 'Color',
  subject: 'Subject',
  environment: 'Environment',
  action: 'Action',
  style: 'Style',
};

/**
 * TagEditor — Chip/badge-based visual prompt editor.
 * Each tag is a colored chip. Click to see alternatives from Qwen.
 * Tags can be edited inline or removed.
 */
function TagEditor() {
  const {
    coverArt,
    updateCoverArtTag,
    removeCoverArtTag,
    fetchCoverArtAlternatives,
  } = useAppStore();

  const [activeTagId, setActiveTagId] = useState(null);
  const [editingTagId, setEditingTagId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const handleChipClick = (tag) => {
    if (activeTagId === tag.id) {
      setActiveTagId(null);
    } else {
      setActiveTagId(tag.id);
      if (!tag.alternatives || tag.alternatives.length === 0) {
        fetchCoverArtAlternatives(tag.id);
      }
    }
  };

  const handleAlternativeSelect = (tagId, altValue) => {
    updateCoverArtTag(tagId, altValue);
    setActiveTagId(null);
  };

  const handleEditStart = (tag) => {
    setEditingTagId(tag.id);
    setEditValue(tag.value);
    setActiveTagId(null);
  };

  const handleEditConfirm = (tagId) => {
    if (editValue.trim()) {
      updateCoverArtTag(tagId, editValue.trim());
    }
    setEditingTagId(null);
  };

  const handleEditKeyDown = (e, tagId) => {
    if (e.key === 'Enter') handleEditConfirm(tagId);
    if (e.key === 'Escape') setEditingTagId(null);
  };

  return (
    <div className="tag-editor">
      <div className="tag-chips-container">
        {coverArt.tags.map((tag) => {
          const colors = TAG_COLORS[tag.type] || TAG_COLORS.style;
          const isActive = activeTagId === tag.id;
          const isEditing = editingTagId === tag.id;

          return (
            <div key={tag.id} className="tag-chip-wrapper">
              {isEditing ? (
                <input
                  className="tag-chip-edit"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => handleEditConfirm(tag.id)}
                  onKeyDown={(e) => handleEditKeyDown(e, tag.id)}
                  autoFocus
                  style={{ borderColor: colors.border }}
                />
              ) : (
                <button
                  className={`tag-chip ${isActive ? 'active' : ''}`}
                  style={{
                    background: colors.bg,
                    borderColor: isActive ? colors.border : 'transparent',
                    color: colors.text,
                  }}
                  onClick={() => handleChipClick(tag)}
                  onDoubleClick={() => handleEditStart(tag)}
                  title={`${TAG_LABELS[tag.type]}: ${tag.value} (click for alternatives, double-click to edit)`}
                >
                  <span className="tag-chip-type">{TAG_LABELS[tag.type]}</span>
                  <span className="tag-chip-value">{tag.value}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="tag-chip-remove"
                    onClick={(e) => { e.stopPropagation(); removeCoverArtTag(tag.id); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); removeCoverArtTag(tag.id); } }}
                    title="Remove tag"
                  >
                    ×
                  </span>
                </button>
              )}

              {/* Alternatives dropdown */}
              {isActive && tag.alternatives && tag.alternatives.length > 0 && (
                <div className="tag-alternatives-dropdown">
                  {tag.alternatives.map((alt, i) => (
                    <button
                      key={i}
                      className="tag-alternative-item"
                      onClick={() => handleAlternativeSelect(tag.id, alt)}
                      style={{ borderLeftColor: colors.border }}
                    >
                      {alt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TagEditor;
