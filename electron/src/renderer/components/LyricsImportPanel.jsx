import React, { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { fetchJson } from '../services/electronTransport'
import './LyricsImportPanel.css'

const LyricsImportPanel = () => {
  const { importLyrics, subtitles } = useAppStore()
  
  const [lyricsText, setLyricsText] = useState('')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [importMode, setImportMode] = useState('replace') // 'replace' or 'merge'

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

      // Import to store with selected mode
      importLyrics(quickSubtitles, { 
        merge: importMode === 'merge',
        replace: importMode === 'replace'
      })
      
      const action = importMode === 'merge' ? 'added' : 'imported'
      setSuccessMessage(`Successfully ${action} ${quickSubtitles.length} subtitles!`)
      setLyricsText('')
      
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err) {
      setError('Quick import failed: ' + err.message)
    }
  }

  // Example text
  const exampleLyrics = `[Intro] (Ambient, Peaceful Silence) (Child's Voice - Softly)
بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ [pause]

[Section 1: El-Huda / Rehber] 
[cite_start]إِنَّ هَذَا الْقُرْآنَ يَهْدِي لِلَّتِي هِيَ أَقْوَمُ [pause]
[cite_start]هُذَا بَيَانُ لِلنَّاسِ وَهُدًى وَمَوْعِظَةٌ لِلْمُتَّقِينَ [pause]
(Edebi Köprü - Şiirsel) هذا ضياءٌ من لدن مالك القلوب [pause]

[Bridge: Kalbi Tefekkür]
[cite_start]أَفَلَا يَتَدَبَّرُونَ الْقُرْآنَ أَمْ عَلَى قُلُوبِ أَقْفَالُهَا [pause]`

  // Real-time preview
  useEffect(() => {
    if (lyricsText.trim()) {
      debouncePreview()
    } else {
      setPreviewData(null)
    }
  }, [lyricsText])

  // Debounce function
  const debouncePreview = (() => {
    let timeout
    return () => {
      clearTimeout(timeout)
      timeout = setTimeout(generatePreview, 500)
    }
  })()

  const generatePreview = async () => {
    if (!lyricsText.trim()) return

    try {
      setIsLoading(true)
      setError('')
      
      const data = await fetchJson('http://127.0.0.1:5000/api/parse-lyrics/preview', {
        method: 'POST',
        body: { lyrics: lyricsText },
      })
      
      if (data.success) {
        setPreviewData(data)
      } else {
        setError(data.error || 'Preview generation failed')
      }
    } catch (err) {
      setError('Preview connection failed: ' + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleImport = async () => {
    if (!lyricsText.trim()) {
      setError('Please enter lyrics text')
      return
    }

    try {
      setIsLoading(true)
      setError('')
      setSuccessMessage('')
      
      const requestBody = {
        lyrics: lyricsText
      }
      
      if (totalDuration && !isNaN(parseFloat(totalDuration))) {
        requestBody.duration = parseFloat(totalDuration)
      }

      const data = await fetchJson('http://127.0.0.1:5000/api/parse-lyrics', {
        method: 'POST',
        body: requestBody,
      })
      
      if (data.success) {
        // SubtitleStore'a aktar with selected mode
        importLyrics(data.subtitles, { 
          merge: importMode === 'merge',
          replace: importMode === 'replace'
        })
        
        const action = importMode === 'merge' ? 'added' : 'imported'
        setSuccessMessage(`✅ ${data.count} lyrics segment ${action} successfully!`)
        
        // Clear form
        setTimeout(() => {
          setLyricsText('')
          setTotalDuration('')
          setPreviewData(null)
          setIsOpen(false)
          setSuccessMessage('')
        }, 2000)
      } else {
        setError(data.error || 'Import failed')
      }
    } catch (err) {
      setError('Import connection failed: ' + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const loadExample = () => {
    setLyricsText(exampleLyrics)
  }

  const clearForm = () => {
    setLyricsText('')
    setTotalDuration('')
    setPreviewData(null)
    setError('')
    setSuccessMessage('')
  }

  return (
    <div className="lyrics-import-panel">
      {/* Trigger Button - More prominent */}
      <button
        className={`lyrics-import-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          fontSize: '16px',
          fontWeight: '700',
          minHeight: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--border-color)'
        }}
      >
        🎵 Import AI Lyrics
        <span style={{marginLeft: 'auto'}}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Panel Content */}
      {isOpen && (
        <div className="lyrics-import-content">
          <div className="panel-header">
            <h3>🎵 AI Lyrics Importer</h3>
            <p><strong>Paste your song lyrics below and choose import method:</strong></p>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              <div>⚡ <strong>Quick Import:</strong> Instant copy-paste for manual timeline editing</div>
              <div>🤖 <strong>Smart Import:</strong> AI-powered parsing with intelligent timing</div>
            </div>
            
            {/* Import Mode Selection */}
            {subtitles.length > 0 && (
              <div style={{ 
                marginTop: '12px', 
                padding: '12px', 
                backgroundColor: '#f3f4f6', 
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <label style={{ fontSize: '14px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                  📋 Import Mode ({subtitles.length} existing subtitles):
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="replace"
                      checked={importMode === 'replace'}
                      onChange={(e) => setImportMode(e.target.value)}
                    />
                    <span style={{ fontSize: '13px' }}>🔄 Replace All (Clear existing)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      value="merge"
                      checked={importMode === 'merge'}
                      onChange={(e) => setImportMode(e.target.value)}
                    />
                    <span style={{ fontSize: '13px' }}>➕ Merge (Keep existing + add lyrics)</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Input Section - Prominent textarea */}
          <div className="input-section">
            <div className="textarea-container">
              <label style={{fontSize: '16px', fontWeight: '600', marginBottom: '8px', display: 'block'}}>📝 Paste Your Song Lyrics Here:</label>
              <textarea
                value={lyricsText}
                onChange={(e) => setLyricsText(e.target.value)}
                placeholder="Paste your song lyrics here...&#10;Example:&#10;[Intro] (Ambient)&#10;بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ [pause]&#10;[Section 1: Title]&#10;[cite_start]Your lyrics content here..."
                rows={12}
                className="lyrics-textarea"
                style={{
                  fontSize: '14px',
                  padding: '16px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  minHeight: '200px',
                  fontFamily: 'monospace'
                }}
              />
              <div className="textarea-controls">
                <button onClick={loadExample} className="btn-secondary btn-small">
                  Load Example
                </button>
                <button onClick={clearForm} className="btn-secondary btn-small">
                  Clear
                </button>
              </div>
            </div>

            <div className="duration-container">
              <label>Target Duration (seconds, optional):</label>
              <input
                type="number"
                value={totalDuration}
                onChange={(e) => setTotalDuration(e.target.value)}
                placeholder="e.g. 180"
                min="10"
                step="0.1"
                className="duration-input"
              />
            </div>
          </div>

          {/* Preview Section */}
          {previewData && (
            <div className="preview-section">
              <h4>📋 Preview</h4>
              <div className="preview-stats">
                <div className="stat-item">
                  <span className="stat-label">Lines:</span>
                  <span className="stat-value">{previewData.preview.line_count}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Duration:</span>
                  <span className="stat-value">{previewData.preview.estimated_duration.toFixed(1)}s</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Types:</span>
                  <span className="stat-value">{previewData.preview.types.join(', ')}</span>
                </div>
                {previewData.preview.has_citations && (
                  <div className="stat-item">
                    <span className="stat-label">Citations:</span>
                    <span className="stat-value">✓ Yes</span>
                  </div>
                )}
                {previewData.preview.has_sections && (
                  <div className="stat-item">
                    <span className="stat-label">Sections:</span>
                    <span className="stat-value">✓ Yes</span>
                  </div>
                )}
              </div>
              
              {previewData.sample_subtitles && previewData.sample_subtitles.length > 0 && (
                <div className="sample-subtitles">
                  <h5>Sample Subtitles:</h5>
                  <div className="subtitle-list">
                    {previewData.sample_subtitles.map((sub, index) => (
                      <div key={index} className={`subtitle-item ${sub.type}`}>
                        <span className="timing">{sub.start.toFixed(1)}s - {sub.end.toFixed(1)}s</span>
                        <span className="text">{sub.text}</span>
                        <span className="type">[{sub.type}]</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          {error && (
            <div className="message error">
              <i className="icon-warning"></i>
              {error}
            </div>
          )}

          {successMessage && (
            <div className="message success">
              <i className="icon-check"></i>
              {successMessage}
            </div>
          )}

          {/* Action Buttons */}
          <div className="action-buttons">
            {/* Quick Import - No Backend Analysis */}
            <button
              onClick={handleQuickImport}
              disabled={!lyricsText.trim()}
              className="btn-primary quick-import"
              title="Instant import for manual timeline editing"
            >
              <i className="icon-flash"></i>
              ⚡ Quick Import
            </button>
            
            {/* Smart Import - With Backend Analysis */}
            <button
              onClick={handleImport}
              disabled={!lyricsText.trim() || isLoading}
              className="btn-secondary smart-import"
              title="AI-powered import with smart timing"
            >
              {isLoading ? (
                <>
                  <i className="icon-loading spinning"></i>
                  Processing...
                </>
              ) : (
                <>
                  <i className="icon-import"></i>
                  🤖 Smart Import
                </>
              )}
            </button>
            
            <button
              onClick={() => setIsOpen(false)}
              className="btn-tertiary"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default LyricsImportPanel