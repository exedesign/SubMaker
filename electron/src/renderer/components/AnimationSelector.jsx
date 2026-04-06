import React from 'react';
import { useAppStore } from '../stores/appStore';
import { FiZap, FiStar, FiType, FiMusic } from 'react-icons/fi';

const ANIMATION_TYPES = [
  { value: 'none', label: 'None', icon: null, desc: 'No animation' },
  { value: 'fade', label: 'Fade', icon: FiZap, desc: 'Smooth fade in/out' },
  { value: 'karaoke', label: 'Karaoke', icon: FiMusic, desc: 'Word-by-word highlight' },
  { value: 'pop', label: 'Pop', icon: FiStar, desc: 'Scale animation' },
  { value: 'typewriter', label: 'Typewriter', icon: FiType, desc: 'Character reveal' },
];

function AnimationSelector() {
  const { animation, setAnimation, setVocalIsolation } = useAppStore();
  
  const handleAnimationChange = (type) => {
    setAnimation({ type });
    setVocalIsolation(type !== 'none');
  };
  
  return (
    <div>
      {/* Animation Type */}
      <div className="form-group">
        <label className="label">Effect Type</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ANIMATION_TYPES.map((anim) => (
            <button
              key={anim.value}
              className={`btn ${animation.type === anim.value ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleAnimationChange(anim.value)}
              style={{ 
                justifyContent: 'flex-start', 
                padding: '10px 12px',
                textAlign: 'left',
              }}
            >
              {anim.icon && <anim.icon style={{ marginRight: 8 }} />}
              <span style={{ flex: 1 }}>{anim.label}</span>
              <span style={{ fontSize: 11, opacity: 0.7 }}>{anim.desc}</span>
            </button>
          ))}
        </div>
      </div>
      
      {/* Fade Settings */}
      {animation.type === 'fade' && (
        <>
          <div className="form-group">
            <label className="label">Fade In: {animation.fadeIn}ms</label>
            <input
              type="range"
              className="slider"
              min={0}
              max={1000}
              step={50}
              value={animation.fadeIn}
              onChange={(e) => setAnimation({ fadeIn: parseInt(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label className="label">Fade Out: {animation.fadeOut}ms</label>
            <input
              type="range"
              className="slider"
              min={0}
              max={1000}
              step={50}
              value={animation.fadeOut}
              onChange={(e) => setAnimation({ fadeOut: parseInt(e.target.value) })}
            />
          </div>
        </>
      )}
      
      {/* Karaoke Settings */}
      {animation.type === 'karaoke' && (
        <>
          <div className="form-group">
            <label className="label">Karaoke Style</label>
            <div className="tabs">
              <button
                className={`tab ${animation.karaokeType === 'sweep' ? 'active' : ''}`}
                onClick={() => setAnimation({ karaokeType: 'sweep' })}
              >
                Sweep
              </button>
              <button
                className={`tab ${animation.karaokeType === 'instant' ? 'active' : ''}`}
                onClick={() => setAnimation({ karaokeType: 'instant' })}
              >
                Instant
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="label">Highlight Color</label>
            <input
              type="color"
              value={animation.highlightColor}
              onChange={(e) => setAnimation({ highlightColor: e.target.value })}
              style={{ width: '100%', height: 36, border: 'none', borderRadius: 6, cursor: 'pointer' }}
            />
          </div>
        </>
      )}
      
      {/* Info for other types */}
      {animation.type === 'pop' && (
        <div style={{ 
          padding: 12, 
          background: 'var(--bg-primary)', 
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--text-secondary)',
        }}>
          Text will scale from 0% to 100% when appearing, creating a "pop" effect.
        </div>
      )}
      
      {animation.type === 'typewriter' && (
        <div style={{ 
          padding: 12, 
          background: 'var(--bg-primary)', 
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--text-secondary)',
        }}>
          Characters will appear one by one, like a typewriter effect.
        </div>
      )}
    </div>
  );
}

export default AnimationSelector;
