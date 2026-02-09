import React, { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import SmartAudioAnalyzer from './SmartAudioAnalyzer'
import InteractiveTimeline from './InteractiveTimeline'

const AdvancedLyricsImporter = () => {
  const { importLyrics, subtitles } = useAppStore()
  
  const [lyricsText, setLyricsText] = useState('')
  const [parsedLines, setParsedLines] = useState([])
  const [timing, setTiming] = useState({
    startTime: 0,
    defaultDuration: 3,
    totalDuration: 180,
    useEqualSpacing: true
  })
  const [previewSubtitles, setPreviewSubtitles] = useState([])
  const [activeTab, setActiveTab] = useState('input') // 'input' | 'audio' | 'preview' | 'timeline'

  // Real-time parsing and preview
  useEffect(() => {
    if (lyricsText.trim()) {
      parseLyrics()
    } else {
      setParsedLines([])
      setPreviewSubtitles([])
    }
  }, [lyricsText, timing])

  const parseLyrics = () => {
    const lines = lyricsText.split('\n').filter(line => line.trim())
    
    const parsed = lines.map((line, index) => {
      const originalLine = line
      
      // Extract section info
      const sectionMatch = line.match(/^\[([^\]]+)\]/)
      const isSection = !!sectionMatch
      const sectionName = sectionMatch ? sectionMatch[1] : null
      
      // Clean the text
      let cleanText = line
        .replace(/^\[.*?\]\s*/, '')     // Remove [Section]
        .replace(/\[cite_start\]/g, '') // Remove [cite_start]
        .replace(/\([^)]+\)/g, '')      // Remove (descriptions)
        .replace(/\[pause\]/g, '')      // Remove [pause]
        .trim()

      return {
        id: index,
        original: originalLine,
        cleaned: cleanText,
        isSection,
        sectionName,
        include: cleanText.length > 0,
        customDuration: timing.defaultDuration,
        customStart: null
      }
    })

    setParsedLines(parsed)
    generatePreview(parsed)
  }

  const generatePreview = (lines) => {
    const includedLines = lines.filter(line => line.include)
    
    if (includedLines.length === 0) {
      setPreviewSubtitles([])
      return
    }

    let currentTime = timing.startTime
    const previews = []

    if (timing.useEqualSpacing) {
      const timePerLine = timing.totalDuration / includedLines.length
      
      includedLines.forEach((line, index) => {
        const start = timing.startTime + (index * timePerLine)
        const end = start + (line.customDuration || timing.defaultDuration)
        
        previews.push({
          id: Date.now() + index,
          start,
          end,
          text: line.cleaned,
          type: line.isSection ? 'section' : 'verse',
          sectionName: line.sectionName,
          originalIndex: line.id
        })
      })
    } else {
      // Custom spacing
      includedLines.forEach((line, index) => {
        const start = line.customStart !== null ? line.customStart : currentTime
        const duration = line.customDuration || timing.defaultDuration
        const end = start + duration
        
        previews.push({
          id: Date.now() + index,
          start,
          end,
          text: line.cleaned,
          type: line.isSection ? 'section' : 'verse',
          sectionName: line.sectionName,
          originalIndex: line.id
        })
        
        currentTime = end + 0.5 // Small gap between subtitles
      })
    }

    setPreviewSubtitles(previews)
  }

  const updateLineIncluded = (index, included) => {
    const updated = parsedLines.map(line => 
      line.id === index ? { ...line, include: included } : line
    )
    setParsedLines(updated)
    generatePreview(updated)
  }

  const updateLineDuration = (index, duration) => {
    const updated = parsedLines.map(line => 
      line.id === index ? { ...line, customDuration: parseFloat(duration) } : line
    )
    setParsedLines(updated)
    generatePreview(updated)
  }

  const updateLineStart = (index, start) => {
    const updated = parsedLines.map(line => 
      line.id === index ? { ...line, customStart: parseFloat(start) } : line
    )
    setParsedLines(updated)
    generatePreview(updated)
  }

  const handleImport = () => {
    importLyrics(previewSubtitles)
    setActiveTab('timeline')
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = (seconds % 60).toFixed(1)
    return `${mins}:${secs.padStart(4, '0')}`
  }

  return (
    <div style={{ 
      background: 'var(--bg-card)', 
      borderRadius: '12px', 
      padding: '24px',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-color)',
      boxShadow: 'var(--shadow-md)'
    }}>
      <h2 style={{ textAlign: 'center', marginBottom: '24px', fontSize: '28px' }}>
        🎵 Advanced AI Lyrics Importer
      </h2>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', justifyContent: 'center' }}>
        {[
          { id: 'input', label: '📝 Input', emoji: '📝' },
          { id: 'audio', label: '🎤 Audio Analysis', emoji: '🎤' },
          { id: 'preview', label: '👀 Preview', emoji: '👀' },
          { id: 'timeline', label: '🎬 Timeline', emoji: '🎬' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 24px',
              borderRadius: '12px',
              border: 'none',
              background: activeTab === tab.id 
                ? 'var(--accent-primary)' 
                : 'var(--bg-hover)',
              color: 'white',
              fontWeight: '600',
              cursor: 'pointer',
              backdropFilter: 'blur(10px)',
              transition: 'all 0.3s ease'
            }}
          >
            {tab.emoji} {tab.label}
          </button>
        ))}
      </div>

      {/* Input Tab */}
      {activeTab === 'input' && (
        <div style={{ display: 'grid', gap: '20px', gridTemplateColumns: '1fr 300px' }}>
          {/* Left: Lyrics Input */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
              📝 Paste Your Song Lyrics:
            </label>
            <textarea
              value={lyricsText}
              onChange={(e) => setLyricsText(e.target.value)}
              placeholder={`Paste your song lyrics here...

Example:
[Intro] (Ambient)
بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ [pause]
[Verse 1]
Your beautiful lyrics here...
[Chorus]
The main hook of the song...`}
              rows={15}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-hover)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                fontFamily: 'monospace',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Right: Timing Controls */}
          <div style={{ 
            background: 'rgba(255,255,255,0.1)', 
            borderRadius: '16px', 
            padding: '20px',
            backdropFilter: 'blur(10px)'
          }}>
            <h3 style={{ marginBottom: '16px' }}>⏱️ Timing Settings</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>
                Start Time (seconds):
              </label>
              <input
                type="number"
                value={timing.startTime}
                onChange={(e) => setTiming(prev => ({ ...prev, startTime: parseFloat(e.target.value) || 0 }))}
                step="0.1"
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.1)',
                  color: 'white'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>
                Default Duration per Line:
              </label>
              <input
                type="number"
                value={timing.defaultDuration}
                onChange={(e) => setTiming(prev => ({ ...prev, defaultDuration: parseFloat(e.target.value) || 3 }))}
                step="0.1"
                min="0.5"
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.1)',
                  color: 'white'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>
                Total Duration (seconds):
              </label>
              <input
                type="number"
                value={timing.totalDuration}
                onChange={(e) => setTiming(prev => ({ ...prev, totalDuration: parseFloat(e.target.value) || 180 }))}
                step="5"
                min="10"
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.1)',
                  color: 'white'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  checked={timing.useEqualSpacing}
                  onChange={(e) => setTiming(prev => ({ ...prev, useEqualSpacing: e.target.checked }))}
                />
                Equal Spacing
              </label>
            </div>

            <div style={{ 
              padding: '12px', 
              background: 'rgba(255,255,255,0.1)', 
              borderRadius: '8px',
              fontSize: '12px'
            }}>
              <div><strong>Lines Found:</strong> {parsedLines.filter(l => l.include).length}</div>
              <div><strong>Estimated Duration:</strong> {Math.ceil(previewSubtitles.length * timing.defaultDuration)}s</div>
              <div><strong>Time per Line:</strong> {timing.useEqualSpacing ? (timing.totalDuration / Math.max(1, parsedLines.filter(l => l.include).length)).toFixed(1) : timing.defaultDuration}s</div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Tab */}
      {activeTab === 'preview' && (
        <div style={{ display: 'grid', gap: '20px', gridTemplateColumns: '1fr 400px' }}>
          {/* Left: Line Editor */}
          <div style={{ 
            maxHeight: '500px', 
            overflow: 'auto',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '16px',
            padding: '16px'
          }}>
            <h3 style={{ marginBottom: '16px' }}>📋 Edit Lines</h3>
            {parsedLines.map((line, index) => (
              <div key={line.id} style={{ 
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                padding: '12px',
                marginBottom: '8px',
                background: line.include ? 'var(--accent-success)' : 'var(--bg-hover)',
                borderRadius: '8px',
                border: line.isSection ? '2px solid rgba(255, 193, 7, 0.5)' : '1px solid rgba(255,255,255,0.1)'
              }}>
                <input
                  type="checkbox"
                  checked={line.include}
                  onChange={(e) => updateLineIncluded(line.id, e.target.checked)}
                />
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    fontSize: '12px', 
                    color: 'rgba(255,255,255,0.7)',
                    marginBottom: '4px',
                    fontFamily: 'monospace'
                  }}>
                    {line.original}
                  </div>
                  <div style={{ fontWeight: line.isSection ? 'bold' : 'normal' }}>
                    {line.cleaned || <em style={{ color: 'rgba(255,255,255,0.5)' }}>No text</em>}
                  </div>
                </div>

                {line.include && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="number"
                      value={line.customDuration}
                      onChange={(e) => updateLineDuration(line.id, e.target.value)}
                      step="0.1"
                      min="0.5"
                      style={{
                        width: '60px',
                        padding: '4px',
                        borderRadius: '4px',
                        border: '1px solid rgba(255,255,255,0.3)',
                        background: 'rgba(255,255,255,0.1)',
                        color: 'white',
                        fontSize: '12px'
                      }}
                    />
                    <span style={{ fontSize: '12px' }}>s</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right: Preview Timeline */}
          <div style={{ 
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '16px',
            padding: '16px'
          }}>
            <h3 style={{ marginBottom: '16px' }}>⏳ Timeline Preview</h3>
            <div style={{ 
              maxHeight: '400px', 
              overflow: 'auto',
              borderRadius: '8px',
              background: 'rgba(0,0,0,0.2)'
            }}>
              {previewSubtitles.map((sub, index) => (
                <div key={sub.id} style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: 'rgba(255,255,255,0.7)',
                      marginBottom: '2px'
                    }}>
                      {formatTime(sub.start)} → {formatTime(sub.end)}
                    </div>
                    <div style={{ 
                      fontWeight: sub.type === 'section' ? 'bold' : 'normal',
                      color: sub.type === 'section' ? '#ffeb3b' : 'white'
                    }}>
                      {sub.text}
                    </div>
                  </div>
                  <div style={{
                    width: '8px',
                    height: '40px',
                    background: sub.type === 'section' 
                      ? 'linear-gradient(to bottom, #ffeb3b, #ffc107)'
                      : 'linear-gradient(to bottom, #4caf50, #2e7d32)',
                    borderRadius: '4px'
                  }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Audio Analysis Tab */}
      {activeTab === 'audio' && (
        <div style={{ 
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '16px',
          padding: '24px'
        }}>
          <h3 style={{ 
            marginBottom: '20px', 
            textAlign: 'center',
            color: 'white',
            fontSize: '20px'
          }}>
            🎤 Smart Audio Analysis
          </h3>
          <p style={{ 
            textAlign: 'center', 
            marginBottom: '24px',
            color: 'rgba(255,255,255,0.8)' 
          }}>
            Upload an audio file to automatically detect speech segments and sync with your lyrics
          </p>
          <SmartAudioAnalyzer 
            lyrics={parsedLines.filter(l => l.include).map(l => l.cleaned)}
            onAnalysisComplete={(voiceSegments) => {
              console.log('Voice segments detected:', voiceSegments);
              // Burada voice segment'leri lyrics ile eşleştirebiliriz
            }}
          />
        </div>
      )}

      {/* Timeline Tab */}
      {activeTab === 'timeline' && (
        <InteractiveTimeline />
      )}

      {/* Action Buttons */}
      <div style={{ 
        display: 'flex', 
        gap: '12px', 
        justifyContent: 'center', 
        marginTop: '24px',
        flexWrap: 'wrap'
      }}>
        {activeTab === 'preview' && previewSubtitles.length > 0 && (
          <button
            onClick={handleImport}
            style={{
              padding: '16px 32px',
              borderRadius: '12px',
              border: 'none',
              background: 'var(--accent-success)',
              color: 'white',
              fontWeight: '700',
              fontSize: '16px',
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(76, 175, 80, 0.4)',
              transition: 'all 0.3s ease'
            }}
          >
            ✨ Import to Timeline ({previewSubtitles.length} subtitles)
          </button>
        )}
        
        <button
          onClick={() => {
            setLyricsText('')
            setParsedLines([])
            setPreviewSubtitles([])
            setActiveTab('input')
          }}
          style={{
            padding: '16px 32px',
            borderRadius: '12px',
            border: '2px solid rgba(255,255,255,0.3)',
            background: 'transparent',
            color: 'white',
            fontWeight: '600',
            cursor: 'pointer',
            backdropFilter: 'blur(10px)'
          }}
        >
          🗑️ Clear All
        </button>
      </div>
    </div>
  )
}

export default AdvancedLyricsImporter