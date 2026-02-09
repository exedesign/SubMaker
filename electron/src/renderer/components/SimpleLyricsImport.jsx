import React, { useState } from 'react'
import { useAppStore } from '../stores/appStore'

const SimpleLyricsImport = () => {
  const importLyrics = useAppStore(state => state.importLyrics)
  
  const [lyricsText, setLyricsText] = useState('')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const handleQuickImport = () => {
    if (!lyricsText.trim()) {
      setError('Please enter lyrics text')
      return
    }

    try {
      setError('')
      
      // Quick import - split by lines and create basic timing
      const lines = lyricsText.split('\n').filter(line => line.trim())
      const timePerLine = 3 // 3 seconds per line
      
      const quickSubtitles = lines.map((line, index) => {
        // Clean the line
        const cleanText = line
          .replace(/^\[.*?\]\s*/, '')     // Remove [Section]
          .replace(/\[cite_start\]/g, '') // Remove [cite_start]
          .replace(/\([^)]+\)/g, '')      // Remove (descriptions)
          .replace(/\[pause\]/g, '')      // Remove [pause]
          .trim()

        if (!cleanText) return null

        return {
          id: Date.now() + index,
          start: index * timePerLine,
          end: (index + 1) * timePerLine,
          text: cleanText,
          type: 'verse'
        }
      }).filter(Boolean)

      // Import to store
      importLyrics(quickSubtitles)
      setSuccessMessage(`Successfully imported ${quickSubtitles.length} subtitles!`)
      setLyricsText('')
      
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err) {
      setError('Quick import failed: ' + err.message)
    }
  }

  return (
    <div style={{padding: '20px', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'var(--bg-card)'}}>
      <h3 style={{color: 'var(--accent-primary)', marginBottom: '16px', textAlign: 'center'}}>🎵 Import AI Lyrics</h3>
      
      {/* Direct Input Area */}
      <div style={{marginBottom: '16px'}}>
        <label style={{fontSize: '16px', fontWeight: '600', marginBottom: '8px', display: 'block'}}>
          📝 Paste Your Song Lyrics Here:
        </label>
        <textarea
          value={lyricsText}
          onChange={(e) => setLyricsText(e.target.value)}
          placeholder={`Paste your song lyrics here...
Example:
[Intro] (Ambient)
بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ [pause]
[Section 1: Title]
[cite_start]Your lyrics content here...`}
          rows={8}
          style={{
            width: '100%',
            fontSize: '14px',
            padding: '12px',
            border: '2px solid #e2e8f0',
            borderRadius: '8px',
            minHeight: '150px',
            fontFamily: 'monospace',
            resize: 'vertical'
          }}
        />
      </div>

      {/* Messages */}
      {error && (
        <div style={{color: 'var(--accent-error)', marginBottom: '12px', padding: '8px', backgroundColor: 'var(--bg-hover)', borderRadius: '4px', border: '1px solid var(--accent-error)'}}>
          ❌ {error}
        </div>
      )}

      {successMessage && (
        <div style={{color: 'var(--accent-success)', marginBottom: '12px', padding: '8px', backgroundColor: 'var(--bg-hover)', borderRadius: '4px', border: '1px solid var(--accent-success)'}}>
          ✅ {successMessage}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap'}}>
        <button
          onClick={handleQuickImport}
          disabled={!lyricsText.trim()}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            background: lyricsText.trim() ? 'var(--accent-warning)' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '8px',
            cursor: lyricsText.trim() ? 'pointer' : 'not-allowed',
            boxShadow: lyricsText.trim() ? 'var(--shadow-sm)' : 'none'
          }}
        >
          ⚡ Quick Import
        </button>
        
        <button
          onClick={() => setLyricsText('')}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: '600',
            color: '#6b7280',
            background: 'white',
            border: '2px solid #e2e8f0',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          🗑️ Clear
        </button>
      </div>
    </div>
  )
}

export default SimpleLyricsImport