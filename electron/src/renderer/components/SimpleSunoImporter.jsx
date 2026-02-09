import React, { useState } from 'react'
import { useAppStore } from '../stores/appStore'

const SimpleSunoImporter = () => {
  const { importLyrics, subtitles } = useAppStore()
  const [lyricsText, setLyricsText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [importMode, setImportMode] = useState('replace')

  const handleImport = async () => {
    if (!lyricsText.trim()) return

    setIsProcessing(true)
    try {
      // Parse lyrics into subtitle format
      const lines = lyricsText.split('\n').filter(line => line.trim())
      const subtitles = []
      let currentTime = 0

      lines.forEach((line, index) => {
        // Clean the text
        let cleanText = line
          .replace(/^\[.*?\]\s*/, '')     // Remove [Section]
          .replace(/\[cite_start\]/g, '') // Remove [cite_start]
          .replace(/\([^)]+\)/g, '')      // Remove (descriptions)
          .replace(/\[pause\]/g, '')      // Remove [pause]
          .trim()

        if (cleanText) {
          const duration = Math.max(2, Math.min(5, cleanText.length * 0.08)) // Dynamic duration based on text length
          
          subtitles.push({
            id: Date.now() + index,
            start: currentTime,
            end: currentTime + duration,
            text: cleanText
          })
          
          currentTime += duration + 0.5 // Add small gap between subtitles
        }
      })

      if (subtitles.length > 0) {
        await importLyrics(subtitles, {
          merge: importMode === 'merge',
          replace: importMode === 'replace'
        })
        setLyricsText('')
        // Navigate to edit step
        useAppStore.getState().setCurrentStep('edit')
      }
    } catch (error) {
      console.error('Import error:', error)
      alert('Error importing lyrics. Please check the format.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClear = () => {
    setLyricsText('')
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '12px',
      padding: '20px',
      color: 'var(--text-primary)',
      boxShadow: 'var(--shadow-sm)',
      border: '1px solid var(--border-color)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div style={{
          fontSize: '24px',
          background: 'var(--bg-hover)',
          borderRadius: '8px',
          padding: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '48px',
          height: '48px'
        }}>
          🎵
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
            AI Lyrics Import
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', opacity: 0.8 }}>
            Paste your song lyrics and import as subtitles
          </p>
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        {subtitles.length > 0 && (
          <div style={{ 
            marginBottom: '12px', 
            padding: '12px', 
            backgroundColor: 'var(--bg-hover)', 
            borderRadius: '8px',
            border: '1px solid var(--border-color)'
          }}>
            <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
              📋 Import Mode ({subtitles.length} existing subtitles):
            </label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={(e) => setImportMode(e.target.value)}
                />
                <span style={{ fontSize: '13px' }}>🔄 Replace All</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  value="merge"
                  checked={importMode === 'merge'}
                  onChange={(e) => setImportMode(e.target.value)}
                />
                <span style={{ fontSize: '13px' }}>➕ Merge with Existing</span>
              </label>
            </div>
          </div>
        )}
        
        <textarea
          value={lyricsText}
          onChange={(e) => setLyricsText(e.target.value)}
          placeholder={`Paste your song lyrics here...

Example:
[Verse 1]
Walking down the street tonight
Feeling like everything's alright
[Chorus]
This is my song, this is my time
Everything's gonna be just fine

[Verse 2]
Music playing in my head
All the words that need to be said`}
          style={{
            width: '100%',
            minHeight: '200px',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'rgba(255, 255, 255, 0.1)',
            color: 'white',
            fontSize: '14px',
            fontFamily: 'monospace',
            resize: 'vertical',
            outline: 'none',
            lineHeight: '1.6',
            backdropFilter: 'blur(10px)'
          }}
        />
      </div>

      <div style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'center'
      }}>
        <button
          onClick={handleImport}
          disabled={!lyricsText.trim() || isProcessing}
          style={{
            padding: '12px 24px',
            borderRadius: '10px',
            border: 'none',
            background: !lyricsText.trim() || isProcessing 
              ? 'rgba(255, 255, 255, 0.3)'
              : 'linear-gradient(45deg, #ff6b6b, #ff8e53)',
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: !lyricsText.trim() || isProcessing ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
            boxShadow: !lyricsText.trim() || isProcessing ? 'none' : '0 4px 15px rgba(255, 107, 107, 0.4)',
            opacity: !lyricsText.trim() || isProcessing ? 0.6 : 1
          }}
        >
          {isProcessing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid transparent',
                borderTop: '2px solid white',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              Processing...
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              📥 Import Lyrics
            </div>
          )}
        </button>
        
        {lyricsText && (
          <button
            onClick={handleClear}
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              background: 'transparent',
              color: 'white',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
            🗑️ Clear
          </button>
        )}
        
        <div style={{
          fontSize: '12px',
          opacity: 0.7,
          marginLeft: 'auto'
        }}>
          {lyricsText ? `${lyricsText.split('\n').filter(l => l.trim()).length} lines` : 'Ready to import'}
        </div>
      </div>

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  )
}

export default SimpleSunoImporter