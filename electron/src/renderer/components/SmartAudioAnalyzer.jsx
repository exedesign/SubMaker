import React, { useState, useRef, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'

const SmartAudioAnalyzer = () => {
  const { importLyrics, addSubtitle } = useAppStore()
  const [audioFile, setAudioFile] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [voiceSegments, setVoiceSegments] = useState([])
  const [analysisResults, setAnalysisResults] = useState(null)
  const [lyricsText, setLyricsText] = useState('')
  const [mappingMode, setMappingMode] = useState('auto') // 'auto' | 'manual'
  
  const fileInputRef = useRef(null)
  const audioContextRef = useRef(null)

  // Voice Activity Detection using Web Audio API
  const analyzeAudioForVoice = async (audioBuffer) => {
    const channelData = audioBuffer.getChannelData(0)
    const sampleRate = audioBuffer.sampleRate
    const windowSize = Math.floor(sampleRate * 0.025) // 25ms window
    const hopSize = Math.floor(sampleRate * 0.010) // 10ms hop
    
    const voiceSegments = []
    let isInVoiceSegment = false
    let currentSegmentStart = 0
    
    for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
      const window = channelData.slice(i, i + windowSize)
      
      // Calculate energy (RMS)
      const energy = Math.sqrt(window.reduce((sum, sample) => sum + sample * sample, 0) / windowSize)
      
      // Calculate zero crossing rate
      let zeroCrossings = 0
      for (let j = 1; j < window.length; j++) {
        if ((window[j] >= 0) !== (window[j-1] >= 0)) {
          zeroCrossings++
        }
      }
      const zcr = zeroCrossings / window.length
      
      // Simple voice detection heuristic
      const isVoice = energy > 0.01 && zcr > 0.1 && zcr < 0.3
      const timeStamp = i / sampleRate
      
      if (isVoice && !isInVoiceSegment) {
        // Start of voice segment
        isInVoiceSegment = true
        currentSegmentStart = timeStamp
      } else if (!isVoice && isInVoiceSegment) {
        // End of voice segment
        isInVoiceSegment = false
        if (timeStamp - currentSegmentStart > 0.5) { // Minimum 0.5s duration
          voiceSegments.push({
            start: currentSegmentStart,
            end: timeStamp,
            duration: timeStamp - currentSegmentStart,
            confidence: energy
          })
        }
      }
    }
    
    // Close final segment if still open
    if (isInVoiceSegment) {
      voiceSegments.push({
        start: currentSegmentStart,
        end: channelData.length / sampleRate,
        duration: (channelData.length / sampleRate) - currentSegmentStart,
        confidence: 0.5
      })
    }
    
    return voiceSegments
  }

  const handleAudioUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    
    setAudioFile(file)
    setIsAnalyzing(true)
    
    try {
      // Create audio context
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      
      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer()
      
      // Decode audio
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer)
      
      // Analyze for voice segments
      const segments = await analyzeAudioForVoice(audioBuffer)
      
      setVoiceSegments(segments)
      setAnalysisResults({
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        voiceSegments: segments,
        totalVoiceDuration: segments.reduce((sum, seg) => sum + seg.duration, 0)
      })
      
    } catch (error) {
      console.error('Audio analysis failed:', error)
      alert('Audio analysis failed: ' + error.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const mapLyricsToVoiceSegments = () => {
    if (!lyricsText.trim() || voiceSegments.length === 0) {
      alert('Please provide both audio file and lyrics text')
      return
    }

    const lines = lyricsText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Clean Suno format
        return line
          .replace(/^\[.*?\]\s*/, '')
          .replace(/\[cite_start\]/g, '')
          .replace(/\([^)]+\)/g, '')
          .replace(/\[pause\]/g, '')
          .trim()
      })
      .filter(line => line.length > 0)

    const mappedSubtitles = []

    if (mappingMode === 'auto') {
      // Auto mapping: distribute lines across voice segments
      lines.forEach((line, index) => {
        if (index < voiceSegments.length) {
          const segment = voiceSegments[index]
          mappedSubtitles.push({
            id: Date.now() + index,
            start: segment.start,
            end: segment.end,
            text: line,
            type: 'verse',
            confidence: segment.confidence,
            autoMapped: true
          })
        }
      })
    } else {
      // Manual mapping: distribute evenly across available voice time
      const totalVoiceTime = voiceSegments.reduce((sum, seg) => sum + seg.duration, 0)
      const timePerLine = totalVoiceTime / lines.length
      
      let currentTime = voiceSegments[0]?.start || 0
      
      lines.forEach((line, index) => {
        const start = currentTime
        const end = currentTime + Math.min(timePerLine, 5) // Max 5 seconds per line
        
        mappedSubtitles.push({
          id: Date.now() + index,
          start,
          end,
          text: line,
          type: 'verse',
          manualMapped: true
        })
        
        currentTime = end + 0.3 // Small gap
      })
    }

    importLyrics(mappedSubtitles)
    alert(`Successfully mapped ${mappedSubtitles.length} subtitles to voice segments!`)
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = (seconds % 60).toFixed(1)
    return `${mins}:${secs.padStart(4, '0')}`
  }

  return (
    <div style={{ 
      background: 'linear-gradient(135deg, #8B5A96, #6C5CE7)',
      borderRadius: '20px',
      padding: '24px',
      color: 'white',
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
    }}>
      <h2 style={{ textAlign: 'center', marginBottom: '24px', fontSize: '28px' }}>
        🎤 Smart Audio Analyzer
      </h2>
      <p style={{ textAlign: 'center', marginBottom: '24px', color: 'rgba(255,255,255,0.9)' }}>
        Upload audio file to detect voice segments and automatically map lyrics
      </p>

      {/* Audio Upload */}
      <div style={{ 
        display: 'grid', 
        gap: '24px', 
        gridTemplateColumns: analysisResults ? '1fr 1fr' : '1fr'
      }}>
        <div style={{ 
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '16px',
          padding: '20px',
          backdropFilter: 'blur(10px)'
        }}>
          <h3 style={{ marginBottom: '16px' }}>📁 Audio File</h3>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleAudioUpload}
            style={{ display: 'none' }}
          />
          
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isAnalyzing}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '12px',
              border: '2px dashed rgba(255,255,255,0.3)',
              background: 'transparent',
              color: 'white',
              cursor: 'pointer',
              fontSize: '16px',
              marginBottom: '16px'
            }}
          >
            {isAnalyzing ? '🔄 Analyzing...' : '📁 Choose Audio File'}
          </button>

          {audioFile && (
            <div style={{ 
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px'
            }}>
              <strong>File:</strong> {audioFile.name}<br />
              <strong>Size:</strong> {(audioFile.size / (1024 * 1024)).toFixed(1)} MB
            </div>
          )}

          {/* Lyrics Input */}
          <div style={{ marginTop: '16px' }}>
            <h4 style={{ marginBottom: '8px' }}>📝 Lyrics Text</h4>
            <textarea
              value={lyricsText}
              onChange={(e) => setLyricsText(e.target.value)}
              placeholder={`Paste your lyrics here...

Example:
[Verse 1]
Hello world, this is my song
Every word has its place
[Chorus]  
Singing loud and clear today`}
              rows={8}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.1)',
                color: 'white',
                fontSize: '14px',
                fontFamily: 'monospace',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Mapping Options */}
          <div style={{ marginTop: '16px' }}>
            <h4 style={{ marginBottom: '8px' }}>🎯 Mapping Mode</h4>
            <div style={{ display: 'flex', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="radio"
                  value="auto"
                  checked={mappingMode === 'auto'}
                  onChange={(e) => setMappingMode(e.target.value)}
                />
                Auto (Voice Segments)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="radio"
                  value="manual"
                  checked={mappingMode === 'manual'}
                  onChange={(e) => setMappingMode(e.target.value)}
                />
                Manual (Even Distribution)
              </label>
            </div>
          </div>

          {/* Map Button */}
          {analysisResults && lyricsText.trim() && (
            <button
              onClick={mapLyricsToVoiceSegments}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(45deg, #00D2FF, #3A7BD5)',
                color: 'white',
                fontWeight: '700',
                fontSize: '16px',
                cursor: 'pointer',
                marginTop: '16px',
                boxShadow: '0 8px 24px rgba(0, 210, 255, 0.4)'
              }}
            >
              🎯 Map Lyrics to Voice Segments
            </button>
          )}
        </div>

        {/* Analysis Results */}
        {analysisResults && (
          <div style={{ 
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '16px',
            padding: '20px',
            backdropFilter: 'blur(10px)'
          }}>
            <h3 style={{ marginBottom: '16px' }}>📊 Analysis Results</h3>
            
            <div style={{ 
              display: 'grid',
              gap: '12px',
              gridTemplateColumns: 'repeat(2, 1fr)',
              marginBottom: '16px'
            }}>
              <div style={{ 
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '12px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {formatTime(analysisResults.duration)}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>Total Duration</div>
              </div>
              
              <div style={{ 
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '12px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {voiceSegments.length}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>Voice Segments</div>
              </div>

              <div style={{ 
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '12px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {formatTime(analysisResults.totalVoiceDuration)}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>Voice Duration</div>
              </div>

              <div style={{ 
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '12px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                  {((analysisResults.totalVoiceDuration / analysisResults.duration) * 100).toFixed(1)}%
                </div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>Voice Ratio</div>
              </div>
            </div>

            {/* Voice Segments Timeline */}
            <h4 style={{ marginBottom: '12px' }}>🎵 Detected Voice Segments</h4>
            <div style={{ 
              maxHeight: '300px',
              overflow: 'auto',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: '8px',
              padding: '8px'
            }}>
              {voiceSegments.map((segment, index) => (
                <div key={index} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  marginBottom: '4px',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '6px'
                }}>
                  <div>
                    <strong>Segment {index + 1}</strong><br />
                    <small style={{ opacity: 0.8 }}>
                      {formatTime(segment.start)} → {formatTime(segment.end)}
                    </small>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div>{formatTime(segment.duration)}</div>
                    <div style={{ 
                      width: '40px',
                      height: '6px',
                      background: `linear-gradient(to right, 
                        ${segment.confidence > 0.8 ? '#2ECC71' : segment.confidence > 0.5 ? '#F39C12' : '#E74C3C'}, 
                        rgba(255,255,255,0.3))`,
                      borderRadius: '3px'
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SmartAudioAnalyzer