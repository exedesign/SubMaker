import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { matchesShortcut } from '../utils/shortcutHelper'

// ── Sony ACID-style DAW Track Constants ──────────────────────────────────────
const STEM_ORDER = ['original', 'vocals', 'instrumental', 'drums', 'bass', 'other']
const TRACK_LANE_HEIGHT = 80   // Taller lanes like professional DAWs
const TRACK_HEADER_WIDTH = 150 // Wider header for controls

// ── Per-track waveform canvas (memoized) ─────────────────────────────────────
const TrackWaveformCanvas = React.memo(({ waveformData, color, height, width, currentTime, duration, muted }) => {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = width
    canvas.height = height

    // Dark background with subtle gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height)
    bgGrad.addColorStop(0, '#0d1520')
    bgGrad.addColorStop(0.5, '#111b2b')
    bgGrad.addColorStop(1, '#0d1520')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, width, height)

    // Grid lines (every 50px)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    for (let x = 0; x < width; x += 50) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    // Center line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()

    if (waveformData && waveformData.length > 0) {
      const barWidth = Math.max(1, width / waveformData.length)
      const centerY = height / 2
      let maxAmp = 0
      for (let i = 0; i < waveformData.length; i++) {
        if (waveformData[i] > maxAmp) maxAmp = waveformData[i]
      }
      if (maxAmp < 0.01) maxAmp = 0.01

      // Waveform bars with gradient fill
      for (let i = 0; i < waveformData.length; i++) {
        const amp = waveformData[i] / maxAmp
        const barH = amp * (height * 0.42)
        const x = i * barWidth
        const grad = ctx.createLinearGradient(x, centerY - barH, x, centerY + barH)
        grad.addColorStop(0, color)
        grad.addColorStop(0.5, color.replace('0.8)', '1)').replace(')', ', 0.95)'))
        grad.addColorStop(1, color)
        ctx.fillStyle = muted ? 'rgba(100,100,100,0.3)' : grad
        ctx.fillRect(x, centerY - barH, Math.max(1, barWidth - 0.5), barH * 2)
      }

      // Top edge highlight
      ctx.strokeStyle = muted ? 'rgba(100,100,100,0.15)' : color.replace('0.8)', '0.3)')
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i < waveformData.length; i++) {
        const amp = waveformData[i] / maxAmp
        const barH = amp * (height * 0.42)
        const x = i * barWidth + barWidth / 2
        if (i === 0) ctx.moveTo(x, centerY - barH)
        else ctx.lineTo(x, centerY - barH)
      }
      ctx.stroke()
    } else {
      // Loading animation dots
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.font = '12px "Segoe UI", Arial'
      ctx.textAlign = 'center'
      ctx.fillText('Loading waveform...', width / 2, height / 2 + 4)
    }

    // Playhead
    if (duration > 0 && currentTime >= 0) {
      const x = (currentTime / duration) * width
      // Glow effect
      ctx.shadowColor = '#ff3333'
      ctx.shadowBlur = 6
      ctx.strokeStyle = '#ff3333'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
      ctx.shadowBlur = 0
    }
  }, [waveformData, color, height, width, currentTime, duration, muted])

  return (
    <canvas
      ref={ref}
      style={{ flex: 1, display: 'block', height: '100%', borderRadius: '0 4px 4px 0' }}
    />
  )
})

// ── Track Header Component (DAW-style) ──────────────────────────────────────
const TrackHeader = React.memo(({ track, trackId, isOriginal, onVolumeChange, onMuteToggle, onSoloToggle }) => {
  const dimmed = !isOriginal && (track.muted || track._dimmed)

  return (
    <div style={{
      position: 'sticky',
      left: 0,
      width: TRACK_HEADER_WIDTH,
      minWidth: TRACK_HEADER_WIDTH,
      flexShrink: 0,
      background: 'linear-gradient(135deg, #0f1923 0%, #162033 100%)',
      borderRight: `3px solid ${track.color}`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '6px 8px',
      zIndex: 10,
      gap: 3,
      opacity: dimmed ? 0.4 : 1,
      transition: 'opacity 0.15s',
    }}>
      {/* Row 1: Icon + Name */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.3px',
      }}>
        <span style={{ fontSize: 14 }}>{track.icon}</span>
        <span style={{
          color: track.color.replace('0.8)', '1)'),
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>{track.label}</span>
        {isOriginal && (
          <span style={{
            fontSize: 8, background: 'rgba(255,255,255,0.1)', padding: '1px 4px',
            borderRadius: 3, color: 'rgba(255,255,255,0.5)',
          }}>SRC</span>
        )}
      </div>

      {/* Row 2: Volume fader */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', width: 14 }}>VOL</span>
        <input
          type="range" min="0" max="100"
          value={Math.round((track.volume ?? 1) * 100)}
          onChange={(e) => { e.stopPropagation(); onVolumeChange?.(trackId, parseInt(e.target.value) / 100) }}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1, height: 4, accentColor: track.color.replace('0.8)', '1)'),
            cursor: 'pointer', WebkitAppearance: 'none', appearance: 'none',
            background: `linear-gradient(to right, ${track.color} ${Math.round((track.volume ?? 1) * 100)}%, rgba(255,255,255,0.1) ${Math.round((track.volume ?? 1) * 100)}%)`,
            borderRadius: 2, outline: 'none',
          }}
        />
        <span style={{
          fontSize: 9, color: 'rgba(255,255,255,0.5)',
          minWidth: 26, textAlign: 'right', fontFamily: 'monospace',
        }}>{Math.round((track.volume ?? 1) * 100)}%</span>
      </div>

      {/* Row 3: M / S buttons */}
      {!isOriginal && (
        <div style={{ display: 'flex', gap: 4, marginTop: 1 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onMuteToggle?.(trackId, !track.muted) }}
            style={{
              width: 26, height: 18, fontSize: 10, fontWeight: 800, cursor: 'pointer',
              background: track.muted ? '#ef4444' : 'rgba(255,255,255,0.06)',
              color: track.muted ? '#fff' : 'rgba(255,255,255,0.4)',
              border: `1px solid ${track.muted ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 3, padding: 0, lineHeight: '18px',
              transition: 'all 0.1s',
            }}>M</button>
          <button
            onClick={(e) => { e.stopPropagation(); onSoloToggle?.(trackId, !track.solo) }}
            style={{
              width: 26, height: 18, fontSize: 10, fontWeight: 800, cursor: 'pointer',
              background: track.solo ? track.color.replace('0.8)', '1)') : 'rgba(255,255,255,0.06)',
              color: track.solo ? '#fff' : 'rgba(255,255,255,0.4)',
              border: `1px solid ${track.solo ? track.color.replace('0.8)', '0.6)') : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 3, padding: 0, lineHeight: '18px',
              transition: 'all 0.1s',
            }}>S</button>
        </div>
      )}
    </div>
  )
})

const FlexibleTimeline = () => {
  const {
    subtitles,
    selectedSubtitleId,
    setSelectedSubtitleId,
    updateSubtitle,
    deleteSubtitle,
    addSubtitle,
    mediaFile,
    originalFileName,
    mediaFileType,
    playbackTime,
    setPlaybackTime,
    isPlaying: globalIsPlaying,
    setIsPlaying: setGlobalIsPlaying,
    globalAudioRef,
    audioMixer,
    setTrackVolume,
    setTrackMuted,
    setTrackSolo,
    toggleTimelineTracks,
    settings,
  } = useAppStore()

  // Audio State
  const [audioFile, setAudioFile] = useState(null)
  const [waveformData, setWaveformData] = useState([])
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  
  // Zoom State - for mouse wheel zoom
  const [zoom, setZoom] = useState(1.5) // Start with 1.5x zoom for better text readability
  
  // Interaction State
  const [dragState, setDragState] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [splitMode, setSplitMode] = useState(false)
  const [splitPosition, setSplitPosition] = useState(null)
  const [hoveredSubtitle, setHoveredSubtitle] = useState(null)
  const [resizeState, setResizeState] = useState(null)
  const [editingSubtitle, setEditingSubtitle] = useState(null)
  const [editText, setEditText] = useState('')
  const [selectedSubtitleIds, setSelectedSubtitleIds] = useState([])
  
  // Refs
  const timelineRef = useRef(null)
  const canvasRef = useRef(null)
  const animationFrameRef = useRef(null)

  // Constants
  const TRACK_HEIGHT = 50
  const HEADER_HEIGHT = 40
  const PIXELS_PER_SECOND = 100
  const MIN_SUBTITLE_WIDTH = 80 // Minimum width for very compressed view
  const MAX_COMPRESSED_WIDTH = 150 // Maximum width at 1x zoom for compressed view
  const RESIZE_HANDLE_WIDTH = 24

  // Multi-track layout (when mixer active)
  const mixerActive = audioMixer.enabled && audioMixer.showTimelineTracks
  const sortedTrackIds = mixerActive
    ? Object.keys(audioMixer.tracks).sort((a, b) => {
        const ia = STEM_ORDER.indexOf(a)
        const ib = STEM_ORDER.indexOf(b)
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      })
    : []
  const trackCount = sortedTrackIds.length
  const multiTrackHeight = trackCount * TRACK_LANE_HEIGHT

  // Calculate timeline dimensions - ensure we have real container width
  const maxDuration = Math.max(300, duration, ...(Array.isArray(subtitles) ? subtitles.map(s => s.end) : []))
  const viewDuration = maxDuration
  // Get timeline width more reliably
  const containerWidth = timelineRef.current?.clientWidth || 800
  const timelineWidth = Math.max(600, containerWidth) // Minimum 600px for usability

  // Utility functions with container-based positioning  
  const timeToPixel = useCallback((time) => {
    if (!duration || duration === 0) return 0
    // Ensure time doesn't exceed duration
    const clampedTime = Math.min(time, duration)
    // Calculate pixel position including zoom scale
    const baseWidth = timelineWidth
    const pixelsPerSecond = (baseWidth / duration) * zoom // Include zoom in calculation
    return clampedTime * pixelsPerSecond
  }, [duration, timelineWidth, zoom])

  const pixelToTime = useCallback((pixel) => {
    if (!duration || duration === 0) return 0
    // Calculate time including zoom scale
    const baseWidth = timelineWidth
    const pixelsPerSecond = (baseWidth / duration) * zoom // Include zoom in calculation
    const time = pixel / pixelsPerSecond
    // Ensure time doesn't exceed duration
    return Math.min(time, duration)
  }, [duration, timelineWidth, zoom])

  const formatTime = useCallback((seconds) => {
    if (isNaN(seconds)) return '0:00.00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }, [])

  // Audio analysis with better error handling
  const analyzeAudioFile = useCallback(async (file) => {
    if (!file) return
    
    try {
      setAudioFile(file)
      
      // Create audio URL first
      const audioUrl = URL.createObjectURL(file)
      if (audioRef.current) {
        audioRef.current.src = audioUrl
        audioRef.current.onloadedmetadata = () => {
          setDuration(audioRef.current.duration)
        }
      }

      // Audio context for waveform
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const arrayBuffer = await file.arrayBuffer()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      
      setDuration(audioBuffer.duration)
      
      // Generate waveform data
      const channelData = audioBuffer.getChannelData(0)
      const samples = Math.min(2000, Math.floor(channelData.length / 1000))
      const blockSize = Math.floor(channelData.length / samples)
      const waveform = []
      
      for (let i = 0; i < samples; i++) {
        const start = i * blockSize
        const end = Math.min(start + blockSize, channelData.length)
        
        let max = 0
        for (let j = start; j < end; j++) {
          max = Math.max(max, Math.abs(channelData[j]))
        }
        waveform.push(max)
      }
      
      setWaveformData(waveform)
      
    } catch (error) {
      console.error('Audio analysis error:', error)
      alert('Error loading audio file. Please try a different format.')
    }
  }, [])

  // Find word split position based on timing
  const findWordSplitPosition = useCallback((subtitle, clickTime) => {
    const words = subtitle.text.trim().split(/\s+/)
    if (words.length <= 1) return null
    
    const duration = subtitle.end - subtitle.start
    const relativeTime = clickTime - subtitle.start
    const timeRatio = Math.max(0, Math.min(1, relativeTime / duration))
    
    // Calculate word index based on time ratio
    const wordIndex = Math.round(timeRatio * words.length)
    const clampedIndex = Math.max(1, Math.min(words.length - 1, wordIndex))
    
    // Calculate time for this word position
    const wordTimeRatio = clampedIndex / words.length
    const splitTime = subtitle.start + (wordTimeRatio * duration)
    
    return {
      index: clampedIndex,
      time: splitTime
    }
  }, [])

  // Draw base waveform (static - doesn't change during playback)
  const drawBaseWaveform = useCallback(() => {
    if (!canvasRef.current) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height)
    
    // Simple background
    ctx.fillStyle = '#16213e'
    ctx.fillRect(0, 0, width, height)
    
    // Simple center line
    ctx.strokeStyle = '#4a5568'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()
    
    // Draw waveform if available
    if (waveformData && waveformData.length > 0) {
      // Optimize bar width calculation for zoom levels
      const effectiveWidth = width / Math.max(1, zoom * 0.8) // Slightly adjust for zoom
      const barWidth = Math.max(1, effectiveWidth / waveformData.length)
      const centerY = height / 2
      const maxAmplitude = Math.max(...waveformData, 0.1)
      
      ctx.fillStyle = '#e94560'
      
      // Sample data more efficiently at high zoom levels
      const stride = zoom > 4 ? Math.floor(waveformData.length / (width * 2)) : 1
      
      for (let i = 0; i < waveformData.length; i += stride) {
        const amplitude = waveformData[i]
        const x = (i / stride) * barWidth
        const normalizedAmp = Math.min(amplitude / maxAmplitude, 1)
        const barHeight = normalizedAmp * height * 0.4
        
        ctx.fillRect(x, centerY - barHeight, Math.max(1, barWidth), barHeight * 2)
      }
      
      // Add success message
      ctx.fillStyle = '#4ade80'
      ctx.font = 'bold 12px Arial'
      ctx.textAlign = 'right'
      ctx.fillText('🎵 Audio track active', width - 10, 20)
    } else {
      // Enhanced placeholder with better messaging
      ctx.fillStyle = '#a0aec0'
      ctx.font = '14px Arial'
      ctx.textAlign = 'center'
      
      if (mediaFile) {
        const fileName = originalFileName || 
          (typeof mediaFile === 'string' 
            ? mediaFile.split(/[\\/]/).pop() 
            : mediaFile.name) || 'Unknown'
        
        if (audioFile && duration > 0) {
          ctx.fillText(`🎵 ${fileName}`, width / 2, height / 2 - 15)
          ctx.fillText(`⏱️ Duration: ${formatTime(duration)}`, width / 2, height / 2)
          ctx.fillText('🎯 Audio ready — add subtitles', width / 2, height / 2 + 15)
        } else if (audioFile) {
          ctx.fillText(`📁 ${fileName}`, width / 2, height / 2 - 15)
          ctx.fillText('🔄 Loading audio metadata...', width / 2, height / 2)
          ctx.fillText('Please wait a moment', width / 2, height / 2 + 15)
        } else {
          ctx.fillText(`📁 ${fileName}`, width / 2, height / 2 - 10)
          ctx.fillText('⏳ Processing audio...', width / 2, height / 2 + 10)
        }
      } else {
        ctx.fillText('📂 Select a media file', width / 2, height / 2 - 10)
        ctx.fillText('Load an audio/video file via File > Open', width / 2, height / 2 + 10)
      }
    }
  }, [waveformData, audioFile, duration, formatTime, mediaFile])

  // Draw playhead overlay (called every frame during playback)
  const drawPlayhead = useCallback(() => {
    if (!canvasRef.current || !duration) return
    
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    
    // Redraw base waveform first
    drawBaseWaveform()
    
    // Draw playhead on top
    if (currentTime >= 0 && duration > 0) {
      const playheadX = timeToPixel(currentTime)
      
      // Always draw playhead if it's within reasonable bounds
      if (playheadX >= -10 && playheadX <= width + 10) {
        // Playhead line - make it more prominent
        ctx.strokeStyle = '#ff0000'
        ctx.lineWidth = 4
        ctx.setLineDash([])
        ctx.shadowColor = '#ff0000'
        ctx.shadowBlur = 3
        ctx.beginPath()
        ctx.moveTo(playheadX, 0)
        ctx.lineTo(playheadX, height)
        ctx.stroke()
        ctx.shadowBlur = 0
        
        // Playhead top indicator - enhanced
        ctx.fillStyle = '#ff0000'
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(playheadX - 8, 0)
        ctx.lineTo(playheadX + 8, 0)
        ctx.lineTo(playheadX, 16)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        
        // Playhead bottom indicator
        ctx.fillStyle = '#ff0000'
        ctx.beginPath()
        ctx.moveTo(playheadX - 8, height)
        ctx.lineTo(playheadX + 8, height)
        ctx.lineTo(playheadX, height - 16)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        
        // Time label at playhead - always show when playing
        if (globalIsPlaying && playheadX >= 30 && playheadX <= width - 30) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
          ctx.fillRect(playheadX - 30, height - 30, 60, 18)
          ctx.fillStyle = '#ffffff'
          ctx.font = 'bold 11px Arial'
          ctx.textAlign = 'center'
          ctx.fillText(formatTime(currentTime), playheadX, height - 18)
        }
      }
    }
  }, [currentTime, duration, timeToPixel, formatTime, globalIsPlaying, drawBaseWaveform])

  const seek = useCallback((time) => {
    if (!globalAudioRef?.current) {
      console.warn('Global audio ref not available for seek')
      return
    }
    
    const seekTime = Math.max(0, Math.min(duration, time))
    const audioElement = globalAudioRef.current
    
    audioElement.currentTime = seekTime
    setCurrentTime(seekTime)
    
    // Force canvas redraw immediately after seek
    if (canvasRef.current) {
      drawPlayhead()
    }
  }, [duration, globalAudioRef, drawPlayhead])

  // Enhanced timeline click handler with seek
  const handleTimelineClick = useCallback((e) => {
    if (isDragging) return
    
    const rect = e.currentTarget.getBoundingClientRect()
    if (!rect) return
    
    // Get scroll position and zoom-adjusted coordinates
    const scrollLeft = e.currentTarget.scrollLeft || 0
    const clickX = e.clientX - rect.left + scrollLeft
    const clickTime = pixelToTime(clickX)
    
    // Seek to clicked position using global state
    if (duration > 0) {
      const seekTime = Math.max(0, Math.min(duration, clickTime))
      seek(seekTime)
    }
  }, [isDragging, pixelToTime, duration, seek, zoom])

  // Check if mouse is over resize handle - improved with data attributes
  const getResizeHandle = useCallback((e, subtitle) => {
    // Check if the target or its parent has handle data attribute
    let target = e.target
    while (target && target !== e.currentTarget) {
      if (target.dataset && target.dataset.handle) {
        return target.dataset.handle
      }
      target = target.parentElement
    }
    
    // Fallback to position-based detection with more generous areas
    if (!e.currentTarget) return null
    
    const rect = e.currentTarget.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const elementWidth = rect.width
    
    // Large resize handle areas for precise control (40px from each edge)
    const handleSize = Math.max(RESIZE_HANDLE_WIDTH + 10, 40)
    
    // Check left handle
    if (mouseX <= handleSize) return 'left'
    // Check right handle
    if (mouseX >= elementWidth - handleSize) return 'right'
    
    return null
  }, [])

  // Enhanced drag handlers with zoom-aware coordinates
  const handleSubtitleMouseDown = useCallback((e, subtitle) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (splitMode) {
      // In split mode, instantly split the subtitle at click position
      const rect = timelineRef.current?.getBoundingClientRect()
      if (!rect) return
      
      const scrollLeft = timelineRef.current?.scrollLeft || 0
      const clickX = e.clientX - rect.left + scrollLeft
      const clickTime = pixelToTime(clickX)
      
      if (subtitle.text.trim().split(/\s+/).length > 1) {
        const wordSplit = findWordSplitPosition(subtitle, clickTime)
        if (wordSplit && wordSplit.time > subtitle.start && wordSplit.time < subtitle.end) {
          // Direct split execution with duration constraint
          const words = subtitle.text.trim().split(/\s+/)
          const maxEnd = duration > 0 ? Math.min(subtitle.end, duration) : subtitle.end
          
          const firstPart = {
            ...subtitle,
            end: wordSplit.time,
            text: words.slice(0, wordSplit.index).join(' ').trim()
          }
          
          const secondPart = {
            id: Date.now() + Math.random(),
            start: wordSplit.time,
            end: maxEnd, // Don't exceed media duration
            text: words.slice(wordSplit.index).join(' ').trim()
          }
          
          // Validate and execute split
          if (firstPart.text && secondPart.text) {
            updateSubtitle(subtitle.id, firstPart)
            addSubtitle(secondPart)
          }
        }
      }
      return
    }
    
    // Multi-select with Shift key
    if (e.shiftKey) {
      setSelectedSubtitleIds(prev => {
        if (prev.includes(subtitle.id)) {
          // Already selected, remove
          return prev.filter(id => id !== subtitle.id)
        } else {
          // Not selected, add
          return [...prev, subtitle.id]
        }
      })
      return
    }
    
    const resizeHandle = getResizeHandle(e, subtitle)
    const rect = timelineRef.current.getBoundingClientRect()
    const startX = e.clientX - rect.left
    const startTime = pixelToTime(startX)
    
    if (resizeHandle) {
      // Resize mode
      setResizeState({
        subtitleId: subtitle.id,
        handle: resizeHandle,
        startX,
        startTime,
        originalStart: subtitle.start,
        originalEnd: subtitle.end
      })
      setDragState({
        subtitleId: subtitle.id,
        type: 'resize',
        handle: resizeHandle,
        startX,
        startTime,
        originalStart: subtitle.start,
        originalEnd: subtitle.end,
        finalStart: subtitle.start,
        finalEnd: subtitle.end
      })
    } else {
      // Move mode - check multi-selection
      const subtitlesToDrag = selectedSubtitleIds.includes(subtitle.id) && selectedSubtitleIds.length > 0
        ? selectedSubtitleIds
        : [subtitle.id]
      
      // Store initial positions for all subtitles to drag
      const initialPositions = {}
      subtitlesToDrag.forEach(id => {
        const sub = subtitles.find(s => s.id === id)
        if (sub) {
          initialPositions[id] = {
            start: sub.start,
            end: sub.end,
            left: timeToPixel(sub.start)
          }
        }
      })
      
      const initialLeft = timeToPixel(subtitle.start)
      setDragState({
        subtitleId: subtitle.id,
        startX,
        startTime,
        originalStart: subtitle.start,
        originalEnd: subtitle.end,
        originalLeft: initialLeft,
        startLeft: initialLeft,
        type: 'move',
        finalStart: subtitle.start,
        finalEnd: subtitle.end,
        isMultiDrag: subtitlesToDrag.length > 1,
        subtitlesToDrag,
        initialPositions
      })
    }
    
    setIsDragging(true)
    setSelectedSubtitleId(subtitle.id)
  }, [splitMode, pixelToTime, getResizeHandle, setSelectedSubtitleId, findWordSplitPosition, updateSubtitle, addSubtitle, duration, timeToPixel, selectedSubtitleIds, subtitles])

  // Handle double click to edit subtitle text
  const handleSubtitleDoubleClick = useCallback((e, subtitle) => {
    e.preventDefault()
    e.stopPropagation()
    
    setEditingSubtitle(subtitle.id)
    setEditText(subtitle.text)
  }, [])
  
  // Handle save edited text
  const handleSaveEdit = useCallback(() => {
    if (editingSubtitle && editText.trim()) {
      updateSubtitle(editingSubtitle, { text: editText.trim() })
    }
    setEditingSubtitle(null)
    setEditText('')
  }, [editingSubtitle, editText, updateSubtitle])
  
  // Handle cancel edit
  const handleCancelEdit = useCallback(() => {
    setEditingSubtitle(null)
    setEditText('')
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !dragState) return
    
    const rect = timelineRef.current?.getBoundingClientRect()
    if (!rect) return
    
    // Account for scroll position in zoom-scaled container
    const scrollLeft = timelineRef.current?.scrollLeft || 0
    const currentX = e.clientX - rect.left + scrollLeft
    let currentTime = pixelToTime(currentX)
    
    // Snap to grid for precision (0.1 second intervals when Shift is pressed)
    if (e.shiftKey) {
      currentTime = Math.round(currentTime * 10) / 10
    }
    
    if (dragState.type === 'resize' && resizeState) {
      const subtitle = Array.isArray(subtitles) ? subtitles.find(s => s.id === resizeState.subtitleId) : null
      if (!subtitle) return
      
      // Minimum duration constraint - more precise control
      const MIN_DURATION = 0.2
      
      if (resizeState.handle === 'left') {
        // Left handle resize - prevent overlap with previous subtitle
        const newStart = Math.max(0, currentTime)
        const maxStart = subtitle.end - MIN_DURATION
        let finalStart = Math.min(newStart, maxStart)
        
        // Ensure doesn't go beyond container (shouldn't happen for left but safety check)
        const CONTAINER_TIME_LIMIT = pixelToTime(timelineWidth - 20)
        if (finalStart > CONTAINER_TIME_LIMIT) {
          finalStart = Math.min(finalStart, CONTAINER_TIME_LIMIT - 0.1)
        }
        
        // Check for overlap with previous subtitle
        const prevSubtitle = (Array.isArray(subtitles) ? subtitles : [])
          .filter(s => s.id !== subtitle.id && s.end <= subtitle.start)
          .sort((a, b) => b.end - a.end)[0]
        
        if (prevSubtitle) {
          finalStart = Math.max(finalStart, prevSubtitle.end + 0.05)
        }
          
        setDragState(prev => ({
          ...prev,
          currentX,
          currentTime,
          finalStart: Math.min(finalStart, subtitle.end - MIN_DURATION),
          finalEnd: subtitle.end
        }))
      } else if (resizeState.handle === 'right') {
        // Right handle resize - prevent overlap with next subtitle and duration
        const minEnd = subtitle.start + MIN_DURATION
        let finalEnd = Math.max(minEnd, currentTime)
        
        // Ensure doesn't exceed duration
        if (duration > 0) {
          finalEnd = Math.min(finalEnd, duration)
        }
        
        // Ensure doesn't exceed container bounds
        const CONTAINER_TIME_LIMIT = pixelToTime(timelineWidth - 20)
        finalEnd = Math.min(finalEnd, CONTAINER_TIME_LIMIT)
        
        // Check for overlap with next subtitle
        const nextSubtitle = (Array.isArray(subtitles) ? subtitles : [])
          .filter(s => s.id !== subtitle.id && s.start >= subtitle.end)
          .sort((a, b) => a.start - b.start)[0]
        
        if (nextSubtitle) {
          finalEnd = Math.min(finalEnd, nextSubtitle.start - 0.05)
        }
        
        setDragState(prev => ({
          ...prev,
          currentX,
          currentTime,
          finalStart: subtitle.start,
          finalEnd: Math.max(finalEnd, subtitle.start + MIN_DURATION)
        }))
      }
    } else if (dragState.type === 'move') {
      // Move mode - multi-drag support
      const timeDiff = currentTime - dragState.startTime
      
      if (dragState.isMultiDrag) {
        // Multi-drag: Move all selected subtitles together
        const updatedPositions = {}
        const idsToDrag = dragState.subtitlesToDrag || []
        
        for (const id of idsToDrag) {
          const initialPos = dragState.initialPositions[id]
          if (!initialPos) continue
          
          const subtitleDuration = initialPos.end - initialPos.start
          let newStart = Math.max(0, initialPos.start + timeDiff)
          let newEnd = newStart + subtitleDuration
          
          // Ensure doesn't exceed duration
          if (duration > 0 && newEnd > duration) {
            newEnd = duration
            newStart = Math.max(0, newEnd - subtitleDuration)
          }
          
          // Check for overlaps with non-dragged subtitles
          const otherSubtitles = (Array.isArray(subtitles) ? subtitles : [])
            .filter(s => !idsToDrag.includes(s.id))
            .sort((a, b) => a.start - b.start)
          
          for (const other of otherSubtitles) {
            if (newStart < other.end && newEnd > other.start) {
              if (initialPos.start < other.start) {
                newEnd = Math.min(newEnd, other.start - 0.05)
                newStart = newEnd - subtitleDuration
              } else {
                newStart = Math.max(newStart, other.end + 0.05)
                newEnd = newStart + subtitleDuration
              }
            }
          }
          
          // Container bounds check
          const CONTAINER_TIME_LIMIT = pixelToTime(timelineWidth - 20)
          if (newEnd > CONTAINER_TIME_LIMIT) {
            newEnd = CONTAINER_TIME_LIMIT
            newStart = Math.max(0, newEnd - subtitleDuration)
          }
          
          updatedPositions[id] = {
            start: Math.max(0, newStart),
            end: Math.max(newStart + 0.1, newEnd)
          }
        }
        
        setDragState(prevState => ({
          ...prevState,
          currentX,
          currentTime,
          updatedPositions
        }))
      } else {
        // Single drag
        const newStart = Math.max(0, dragState.originalStart + timeDiff)
        const subtitleDuration = dragState.originalEnd - dragState.originalStart
        const newEnd = newStart + subtitleDuration
        
        let finalStart = Math.max(0, newStart)
        let finalEnd = finalStart + subtitleDuration
        
        // Ensure doesn't exceed duration
        if (duration > 0) {
          if (finalEnd > duration) {
            finalEnd = duration
            finalStart = Math.max(0, finalEnd - subtitleDuration)
          }
        }
        
        // Check for overlaps with all other subtitles
        const otherSubtitles = (Array.isArray(subtitles) ? subtitles : [])
          .filter(s => s.id !== dragState.subtitleId)
          .sort((a, b) => a.start - b.start)
        
        for (const other of otherSubtitles) {
          if (finalStart < other.end && finalEnd > other.start) {
            if (dragState.originalStart < other.start) {
              finalEnd = Math.min(finalEnd, other.start - 0.05)
              finalStart = finalEnd - subtitleDuration
            } else {
              finalStart = Math.max(finalStart, other.end + 0.05)
              finalEnd = finalStart + subtitleDuration
            }
          }
        }
        
        // Final constraint: don't go below 0
        if (finalStart < 0) {
          finalStart = 0
          finalEnd = subtitleDuration
        }
        
        // Final duration check
        if (duration > 0 && finalEnd > duration) {
          finalEnd = duration
          finalStart = Math.max(0, finalEnd - subtitleDuration)
        }
        
        // CRITICAL: Container bounds check during drag
        const CONTAINER_TIME_LIMIT = pixelToTime(timelineWidth - 20)
        if (finalEnd > CONTAINER_TIME_LIMIT) {
          finalEnd = CONTAINER_TIME_LIMIT
          finalStart = Math.max(0, finalEnd - subtitleDuration)
        }
        
        // Ensure we don't exceed the visible timeline width
        if (finalStart > CONTAINER_TIME_LIMIT - 0.5) {
          finalStart = Math.max(0, CONTAINER_TIME_LIMIT - 0.5)
          finalEnd = finalStart + Math.min(subtitleDuration, 0.5)
        }
        
        // Update drag state for visual feedback
        setDragState(prevState => ({
          ...prevState,
          currentX,
          currentTime,
          finalStart,
          finalEnd
        }))
      }
    }
  }, [isDragging, dragState, resizeState, subtitles, pixelToTime, duration])

  const handleMouseUp = useCallback(() => {
    // Apply final updates on mouse up with additional overlap prevention
    if (isDragging && dragState) {
      if (dragState.isMultiDrag && dragState.updatedPositions) {
        // Multi-drag: update all dragged subtitles
        Object.entries(dragState.updatedPositions).forEach(([id, positions]) => {
          updateSubtitle(id, {
            start: positions.start,
            end: positions.end
          })
        })
      } else if (dragState.finalStart !== undefined && dragState.finalEnd !== undefined) {
        // Single drag/resize
        const subtitleId = dragState.subtitleId || resizeState?.subtitleId
        if (subtitleId) {
          let finalStart = dragState.finalStart
          let finalEnd = dragState.finalEnd
          
          // Ensure subtitle doesn't exceed duration first
          if (duration > 0) {
            finalEnd = Math.min(finalEnd, duration)
            finalStart = Math.min(finalStart, duration - 0.1)
          }
          
          // Ensure subtitle doesn't go below 0
          finalStart = Math.max(0, finalStart)
          finalEnd = Math.max(finalStart + 0.1, finalEnd)
          
          // Final overlap check with all other subtitles
          const otherSubtitles = Array.isArray(subtitles) ? subtitles.filter(s => s.id !== subtitleId) : []
          
          for (const other of otherSubtitles) {
            // Ensure no overlap with any other subtitle
            if (finalStart < other.end && finalEnd > other.start) {
              // There's still overlap - fix it
              if (dragState.originalStart < other.start) {
                // Keep it before this subtitle
                finalEnd = Math.min(finalEnd, other.start - 0.1)
                finalStart = Math.min(finalStart, finalEnd - 0.2) // Minimum duration
              } else {
                // Keep it after this subtitle  
                finalStart = Math.max(finalStart, other.end + 0.1)
                finalEnd = Math.max(finalEnd, finalStart + 0.2) // Minimum duration
              }
            }
          }
          
          // Ensure valid duration
          if (finalEnd <= finalStart) {
            finalEnd = finalStart + 0.5 // Force minimum 0.5s duration
          }
          
          // Final duration check after collision resolution
          if (duration > 0) {
            finalEnd = Math.min(finalEnd, duration)
            finalStart = Math.min(finalStart, finalEnd - 0.1)
          }
          
          // CRITICAL: Final container bounds check
          const CONTAINER_TIME_LIMIT = pixelToTime(timelineWidth - 20)
          if (finalEnd > CONTAINER_TIME_LIMIT) {
            finalEnd = CONTAINER_TIME_LIMIT
            finalStart = Math.min(finalStart, finalEnd - 0.1)
          }
          if (finalStart > CONTAINER_TIME_LIMIT - 0.1) {
            finalStart = CONTAINER_TIME_LIMIT - 0.1
            finalEnd = Math.min(finalEnd, CONTAINER_TIME_LIMIT)
          }
          
          // Final bounds check
          finalStart = Math.max(0, finalStart)
          
          updateSubtitle(subtitleId, {
            start: finalStart,
            end: finalEnd
          })
        }
      }
    }
    
    setIsDragging(false)
    setDragState(null)
    setResizeState(null)
  }, [isDragging, dragState, resizeState, updateSubtitle, duration, subtitles, pixelToTime, timelineWidth])

  // Enhanced cursor management for better UX
  const getCursor = useCallback((subtitle, e) => {
    if (splitMode) return `url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-2L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2zm0 12c-1.1 0-2-.89-2-2s.89-2 2-2 2 .89 2 2-.89 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3h-3z' fill='%23ff6b35'/%3E%3C/svg%3E") 12 12, crosshair`
    if (isDragging) {
      if (dragState?.type === 'resize') return 'ew-resize'
      return 'grabbing'
    }
    
    const resizeHandle = getResizeHandle(e, subtitle)
    if (resizeHandle) return 'ew-resize'
    return 'grab'
  }, [splitMode, isDragging, dragState, getResizeHandle])

  // Enhanced keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!duration || duration <= 0) return
      // When playlist is active, let PlaylistPanel handle Arrow keys
      const pl = useAppStore.getState().playlist
      const sc = useAppStore.getState().shortcuts
      if (pl.isActive && (matchesShortcut(e, sc.seekBackward.keys) || matchesShortcut(e, sc.seekForward.keys))) return
      
      // Arrow keys: seek by configurable step
      if (matchesShortcut(e, sc.seekBackward.keys) && !e.target.matches('input,textarea')) {
        e.preventDefault()
        const step = settings?.seekStep ?? 5
        seek(Math.max(0, currentTime - step))
      } else if (matchesShortcut(e, sc.seekForward.keys) && !e.target.matches('input,textarea')) {
        e.preventDefault()
        const step = settings?.seekStep ?? 5
        seek(Math.min(duration, currentTime + step))
      } else if (matchesShortcut(e, sc.goToStart.keys)) {
        e.preventDefault()
        seek(0)
      } else if (matchesShortcut(e, sc.toggleSplitMode.keys)) {
        e.preventDefault()
        setSplitMode(!splitMode)
      } else if (matchesShortcut(e, sc.exitSplitMode.keys)) {
        setSplitMode(false)
        setSplitPosition(null)
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [audioFile, seek, currentTime, duration, splitMode, settings?.seekStep])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Simplified media file handling - only for waveform data and duration
  useEffect(() => {
    if (mediaFile) {
      const fileName = originalFileName || mediaFile.split(/[\\/]/).pop()
      setAudioFile({ name: fileName, path: mediaFile })
      
      // Use global audio element for duration if available
      if (globalAudioRef?.current) {
        const audioElement = globalAudioRef.current
        
        const handleLoadedMetadata = () => {
          const audioDuration = audioElement.duration
          if (audioDuration && audioDuration > 0) {
            setDuration(audioDuration)
            generateSimpleWaveform(audioDuration)
          }
        }
        
        const handleError = () => {
          console.warn('Global audio element error, using fallback duration')
          setDuration(180) // 3 minutes fallback
          generateSimpleWaveform(180)
        }
        
        if (audioElement.duration && audioElement.duration > 0) {
          // Duration already loaded
          setDuration(audioElement.duration)
          generateSimpleWaveform(audioElement.duration)
        } else {
          // Wait for metadata
          audioElement.addEventListener('loadedmetadata', handleLoadedMetadata)
          audioElement.addEventListener('error', handleError)
          
          return () => {
            audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata)
            audioElement.removeEventListener('error', handleError)
          }
        }
      } else {
        // Fallback if global audio ref not available yet
        setDuration(180)
        generateSimpleWaveform(180)
      }
    } else {
      setAudioFile(null)
      setDuration(0)
      setWaveformData([])
    }
  }, [mediaFile, mediaFileType, globalAudioRef])
  
  // Helper function to generate simple waveform data
  const generateSimpleWaveform = useCallback((duration) => {
    const waveformLength = Math.min(500, Math.max(200, Math.floor(duration * 2)))
    const simpleWaveform = Array.from({ length: waveformLength }, (_, i) => {
      const base = Math.sin(i * 0.02) * 0.6
      const noise = (Math.random() - 0.5) * 0.4
      const envelope = Math.sin((i / waveformLength) * Math.PI) * 0.8
      return Math.abs(base + noise) * envelope + 0.1
    })
    setWaveformData(simpleWaveform)
  }, [])

  useEffect(() => {
    drawBaseWaveform()
  }, [drawBaseWaveform, waveformData, duration])

  // Mouse wheel zoom handler - apply to both containers
  useEffect(() => {
    const handleWheel = (e) => {
      // Zoom with mouse wheel (no modifier key needed)
      if (!e.shiftKey && !e.ctrlKey) {
        e.preventDefault()
        const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1
        setZoom(prevZoom => {
          const newZoom = prevZoom + zoomDelta
          // Constrain zoom: minimum 0.5x (wider view), maximum 8x (detailed editing)
          // Optimized for subtitle editing workflow
          return Math.max(0.5, Math.min(8, newZoom))
        })
      }
    }

    // Apply to unified timeline container only
    const timelineElement = timelineRef.current
    
    if (timelineElement) {
      timelineElement.addEventListener('wheel', handleWheel, { passive: false })
    }
    
    return () => {
      if (timelineElement) {
        timelineElement.removeEventListener('wheel', handleWheel)
      }
    }
  }, [])

  // Initial store check - verify store state on component mount
  // Sync with global playbackTime from main media player
  useEffect(() => {
    if (playbackTime !== currentTime) {
      setCurrentTime(playbackTime)
    }
  }, [playbackTime, currentTime])

  // Audio time update for playback tracking with canvas redraw
  useEffect(() => {
    const updateTime = () => {
      // Use global audio ref for time tracking
      if (globalAudioRef?.current && globalIsPlaying && !globalAudioRef.current.paused) {
        const newTime = globalAudioRef.current.currentTime
        setCurrentTime(newTime)
        
        // Force canvas redraw to show playhead movement
        if (canvasRef.current) {
          drawPlayhead()
        }
        
        animationFrameRef.current = requestAnimationFrame(updateTime)
      }
    }
    
    if (globalIsPlaying && globalAudioRef?.current) {
      updateTime()
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [globalIsPlaying, globalAudioRef, drawPlayhead])

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && timelineRef.current) {
        const canvas = canvasRef.current
        const container = timelineRef.current
        // Canvas width with zoom applied
        const baseWidth = container.clientWidth
        const contentWidth = baseWidth * zoom
        
        canvas.width = contentWidth
        canvas.height = 120
        drawBaseWaveform()
      }
    }
    
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [drawBaseWaveform, zoom])

  // Filter and position subtitles - with null safety
  const validSubtitles = Array.isArray(subtitles) ? subtitles.filter(sub => sub.start >= 0) : []
  
  const SUBTITLE_HEIGHT = 40
  const TIMELINE_BASE_HEIGHT = 120
  const SUBTITLE_ROW_TOP = 20 // Relative to subtitles overlay container, not absolute position
  
  // SINGLE-ROW PROPORTIONAL FIT ALGORITHM - ALWAYS FIT TO CONTAINER
  const subtitlesWithPositions = []
  const sortedSubtitles = validSubtitles.length > 0 ? [...validSubtitles].sort((a, b) => a.start - b.start) : []

  const MIN_GAP = Math.max(2, 4 / zoom) // Gap between subtitles
  const CONTAINER_MARGIN = 20
  const availableWidth = timelineWidth - (CONTAINER_MARGIN * 2)
  
  // Define totalAudioDuration outside if block
  const totalAudioDuration = Math.max(duration, maxDuration, 300) // Use real audio duration
  
  if (sortedSubtitles.length === 0) {
    // No subtitles to position
  } else {
    // STEP 1: Use FULL AUDIO DURATION as timeline span (not just subtitle range)
    const timelineStart = 0 // Always start from beginning
    const timelineEnd = totalAudioDuration // Always end at audio duration
    const timelineSpan = totalAudioDuration // Full audio span
    
    // STEP 2: Calculate ideal positions and widths based on FULL audio timeline
    const totalGapSpace = (sortedSubtitles.length - 1) * MIN_GAP
    const availableContentWidth = availableWidth - totalGapSpace
    
    let initialSubtitles = sortedSubtitles.map(subtitle => {
      const subtitleDuration = subtitle.end - subtitle.start
      const absoluteStart = subtitle.start // Position relative to audio start (0)
      
      // Calculate proportional position and width within FULL AUDIO timeline
      const startRatio = timelineSpan > 0 ? absoluteStart / timelineSpan : 0
      const durationRatio = timelineSpan > 0 ? subtitleDuration / timelineSpan : 1 / sortedSubtitles.length
      
      return {
        ...subtitle,
        startRatio,
        durationRatio,
        absoluteStart,
        // Width based on actual duration proportion to total audio
        idealWidth: Math.max(MIN_SUBTITLE_WIDTH, durationRatio * availableContentWidth)
      }
    })
    
    // STEP 3: Position subtitles according to their ACTUAL time positions in audio
    // This ensures proper spacing that reflects real timeline positions
    let positionedSubtitles = []
    
    initialSubtitles.forEach((subtitle, index) => {
      // Calculate actual position based on time in audio
      const leftPosition = CONTAINER_MARGIN + (subtitle.startRatio * availableContentWidth)
      
      positionedSubtitles.push({
        ...subtitle,
        calculatedLeft: leftPosition,
        calculatedWidth: subtitle.idealWidth
      })
    })
    
    // STEP 4: Apply proportional compression if needed (but keep time-based spacing)
    positionedSubtitles.forEach((subtitle, index) => {
      subtitlesWithPositions.push({
        ...subtitle,
        left: subtitle.calculatedLeft,
        top: SUBTITLE_ROW_TOP,
        width: subtitle.calculatedWidth,
        row: 0
      })
    })
    
    // STEP 5: Optional - fine-tune if last subtitle exceeds container
    // Optional final validation - but maintain timeline accuracy
    const lastSubtitle = subtitlesWithPositions[subtitlesWithPositions.length - 1]
    if (lastSubtitle && lastSubtitle.left + lastSubtitle.width > timelineWidth - CONTAINER_MARGIN) {
      // Only compress if absolutely necessary to fit
      const overhang = (lastSubtitle.left + lastSubtitle.width) - (timelineWidth - CONTAINER_MARGIN)
      
      // Reduce all widths slightly to accommodate
      const reductionPerSubtitle = overhang / subtitlesWithPositions.length
      subtitlesWithPositions.forEach(subtitle => {
        subtitle.width = Math.max(MIN_SUBTITLE_WIDTH, subtitle.width - reductionPerSubtitle)
      })
    }
  }
  
  // Timeline height: base waveform (or multi-track) + subtitle row
  const waveformAreaHeight = mixerActive ? multiTrackHeight : TIMELINE_BASE_HEIGHT
  const timelineHeight = waveformAreaHeight + SUBTITLE_HEIGHT + 40
  
  // Show timeline even without subtitles
  const showEmptyTimeline = validSubtitles.length === 0

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '12px',
      padding: '24px',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-color)',
      boxShadow: 'var(--shadow-md)',
      minHeight: '450px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '15px'
      }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '500' }}>
          ✂️ Timeline ({validSubtitles.length} subtitles)
          {duration && duration > 0 && <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}> • {formatTime(duration)}</span>}
          <span style={{ color: 'var(--accent-secondary)', fontSize: '14px', marginLeft: '10px' }}>📏 {zoom.toFixed(1)}x</span>
          {splitMode && <span style={{ color: 'var(--accent-primary)', marginLeft: '10px' }}>✂️ Split Mode</span>}
        </h2>
      </div>

      {/* Enhanced Controls */}
      <div style={{
        display: 'flex',
        gap: '15px',
        alignItems: 'center',
        marginBottom: '20px',
        padding: '12px',
        background: 'var(--bg-secondary)',
        borderRadius: '8px',
        flexWrap: 'wrap'
      }}>
        {/* Source Legend - Show if both transcript and lyrics exist */}
        {(Array.isArray(subtitles) && subtitles.some(s => s.source === 'transcript') && subtitles.some(s => s.source === 'lyrics')) && (
          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            alignItems: 'center',
            padding: '6px 12px',
            background: 'var(--bg-hover)',
            borderRadius: '6px',
            fontSize: '12px'
          }}>
            <span style={{ fontWeight: '600' }}>Source:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '16px', height: '16px', background: 'var(--bg-hover)', borderRadius: '3px' }} />
              <span>Transcript</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '16px', height: '16px', background: '#9333ea', borderRadius: '3px' }} />
              <span>Lyrics</span>
            </div>
          </div>
        )}
        
        {/* Split Mode Toggle */}
        <button
          onClick={() => setSplitMode(!splitMode)}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            background: splitMode ? 'var(--accent-primary)' : 'var(--bg-hover)',
            color: 'var(--text-primary)',
            border: splitMode ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
            cursor: 'pointer',
            fontSize: '13px',
            transition: 'var(--transition-fast)',
            fontWeight: splitMode ? 'bold' : 'normal'
          }}
        >
          ✂️ {splitMode ? 'Exit Split Mode' : 'Split Mode'}
        </button>
        
        {/* Multi-Selection Indicator and Clear Button */}
        {selectedSubtitleIds.length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            background: 'var(--accent-primary)',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'white',
            fontWeight: '500'
          }}>
            <span>🔵 {selectedSubtitleIds.length} selected</span>
            <button
              onClick={() => setSelectedSubtitleIds([])}
              style={{
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'white',
                color: 'var(--accent-primary)',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: '600'
              }}
            >
              Clear
            </button>
          </div>
        )}
        
        <div style={{ width: '1px', height: '20px', background: 'var(--border-color)' }} />
        
        {/* Playback Controls */}
        {duration > 0 && (
          <>
            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            
            <button
              onClick={() => seek(Math.max(0, currentTime - 5))}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                background: 'var(--bg-hover)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '11px'
              }}
            >
              ⏮️ -5s
            </button>
            
            <button
              onClick={() => seek(Math.min(duration, currentTime + 5))}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                background: 'var(--bg-hover)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '11px'
              }}
            >
              ⏭️ +5s
            </button>
          </>
        )}
        
        <div style={{ width: '1px', height: '20px', background: 'var(--border-color)' }} />
        
        {/* Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: 'none',
              background: 'var(--bg-hover)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '12px',
              opacity: zoom <= 0.5 ? 0.5 : 1
            }}
            disabled={zoom <= 0.5}
            title="Zoom Out"
          >
            ➖
          </button>
          
          <span style={{ 
            fontSize: '11px', 
            color: 'var(--text-muted)', 
            minWidth: '45px',
            textAlign: 'center'
          }}>
            {(zoom * 100).toFixed(0)}%
          </span>
          
          <button
            onClick={() => setZoom(z => Math.min(8, z + 0.25))}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: 'none',
              background: 'var(--bg-hover)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '12px',
              opacity: zoom >= 8 ? 0.5 : 1
            }}
            disabled={zoom >= 8}
            title="Zoom In"
          >
            ➕
          </button>
          
          <button
            onClick={() => setZoom(1)}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: 'none',
              background: 'var(--accent-secondary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '10px'
            }}
            title="Reset zoom (100%)"
          >
            🎯
          </button>
        </div>

        {/* Multi-Track Toggle */}
        {audioMixer.enabled && (
          <>
            <div style={{ width: '1px', height: '20px', background: 'var(--border-color)' }} />
            <button
              onClick={() => toggleTimelineTracks()}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                background: audioMixer.showTimelineTracks ? 'var(--accent-primary)' : 'var(--bg-hover)',
                color: 'var(--text-primary)',
                border: `1px solid ${audioMixer.showTimelineTracks ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                fontWeight: audioMixer.showTimelineTracks ? '600' : 'normal',
                transition: 'var(--transition-fast)'
              }}
              title={audioMixer.showTimelineTracks ? 'Hide Layers' : 'Show Layers'}
            >
              🎚️ {audioMixer.showTimelineTracks ? 'Layers' : 'Layers'}
            </button>
          </>
        )}
      </div>

      {/* Unified Timeline Container - Waveform + Subtitles */}
      <div
        ref={timelineRef}
        onClick={handleTimelineClick}
        style={{
          position: 'relative',
          width: '100%',
          height: `${timelineHeight}px`,
          background: 'var(--bg-secondary)',
          overflowX: 'auto',
          overflowY: mixerActive ? 'auto' : 'hidden',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          cursor: splitMode ? 'crosshair' : 'pointer',
          boxSizing: 'border-box'
        }}
      >
        {/* Unified zoom-scalable content */}
        <div style={{
          position: 'relative',
          width: `${timelineWidth * zoom}px`,
          height: '100%'
        }}>
          {/* Multi-Track Waveform Lanes (when mixer active) */}
          {mixerActive && sortedTrackIds.map((trackId, idx) => {
            const track = audioMixer.tracks[trackId]
            const anySoloed = Object.values(audioMixer.tracks).some(t => t.solo)
            const dimmed = track.muted || (anySoloed && !track.solo)

            return (
              <div key={trackId} style={{
                position: 'absolute',
                top: idx * TRACK_LANE_HEIGHT,
                left: 0,
                width: '100%',
                height: TRACK_LANE_HEIGHT,
                display: 'flex',
                borderBottom: '1px solid var(--border-color)',
                opacity: dimmed ? 0.3 : 1,
                transition: 'opacity 0.15s',
              }}>
                {/* Track Header */}
                <div style={{
                  position: 'sticky',
                  left: 0,
                  width: TRACK_HEADER_WIDTH,
                  flexShrink: 0,
                  background: 'var(--bg-tertiary)',
                  borderRight: `3px solid ${track.color}`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  padding: '3px 6px',
                  zIndex: 5,
                  gap: 1,
                }}>
                  {/* Track Name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}>
                    <span>{track.icon}</span>
                    <span style={{ color: 'var(--text-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.label}</span>
                  </div>
                  {/* Volume Slider */}
                  <input
                    type="range" min="0" max="100"
                    value={Math.round(track.volume * 100)}
                    onChange={(e) => { e.stopPropagation(); setTrackVolume(trackId, parseInt(e.target.value) / 100) }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: '100%', height: 3, accentColor: track.color, cursor: 'pointer' }}
                  />
                  {/* Mute + Solo */}
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setTrackMuted(trackId, !track.muted) }}
                      style={{
                        width: 22, height: 16, fontSize: 9, fontWeight: 700, cursor: 'pointer',
                        background: track.muted ? 'rgba(239,68,68,0.8)' : 'var(--bg-primary)',
                        color: track.muted ? '#fff' : 'var(--text-muted)',
                        border: `1px solid ${track.muted ? 'rgba(239,68,68,0.6)' : 'var(--border-color)'}`,
                        borderRadius: 3, padding: 0, lineHeight: '16px',
                      }}>M</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setTrackSolo(trackId, !track.solo) }}
                      style={{
                        width: 22, height: 16, fontSize: 9, fontWeight: 700, cursor: 'pointer',
                        background: track.solo ? track.color : 'var(--bg-primary)',
                        color: track.solo ? '#fff' : 'var(--text-muted)',
                        border: `1px solid ${track.solo ? track.color : 'var(--border-color)'}`,
                        borderRadius: 3, padding: 0, lineHeight: '16px',
                      }}>S</button>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 2, lineHeight: '16px' }}>
                      {Math.round(track.volume * 100)}%
                    </span>
                  </div>
                </div>

                {/* Track Waveform */}
                <TrackWaveformCanvas
                  waveformData={track.waveformData}
                  color={track.color}
                  height={TRACK_LANE_HEIGHT}
                  width={Math.max(600, timelineWidth * zoom - TRACK_HEADER_WIDTH)}
                  currentTime={currentTime}
                  duration={duration}
                />
              </div>
            )
          })}

          {/* Single Waveform Canvas (when mixer not active) */}
          {!mixerActive && (
            <canvas
              ref={canvasRef}
              onClick={handleTimelineClick}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                display: 'block',
                width: '100%',
                height: '120px',
                background: 'var(--bg-tertiary)',
                cursor: splitMode ? 'crosshair' : 'pointer',
                zIndex: 1
              }}
            />
          )}

          {/* Global Playhead spanning all tracks */}
          {mixerActive && duration > 0 && currentTime >= 0 && (
            <div style={{
              position: 'absolute',
              left: `${TRACK_HEADER_WIDTH + ((currentTime / duration) * Math.max(600, timelineWidth * zoom - TRACK_HEADER_WIDTH))}px`,
              top: 0,
              width: '2px',
              height: `${multiTrackHeight}px`,
              background: '#ff0000',
              zIndex: 20,
              pointerEvents: 'none',
              boxShadow: '0 0 4px rgba(255,0,0,0.5)',
            }} />
          )}

          {/* Subtitles Overlay */}
          <div style={{
            position: 'absolute',
            top: `${waveformAreaHeight}px`,
            left: 0,
            width: '100%',
            height: `${timelineHeight - waveformAreaHeight}px`,
            zIndex: 2,
            pointerEvents: 'none'
          }}>
            {/* Simple Subtitles */}
            {subtitlesWithPositions.map((subtitle) => {
              const isSelected = selectedSubtitleId === subtitle.id || selectedSubtitleIds.includes(subtitle.id)
              const isHovered = hoveredSubtitle === subtitle.id
              const isDraggingThis = isDragging && dragState?.subtitleId === subtitle.id
              const isInMultiDrag = isDragging && dragState?.isMultiDrag && dragState?.subtitlesToDrag?.includes(subtitle.id)
              
              // Determine color based on source
              const sourceColors = {
                transcript: 'var(--bg-hover)',      // Default blue
                lyrics: '#9333ea',                   // Purple for lyrics
              }
              const baseColor = subtitle.source ? sourceColors[subtitle.source] || sourceColors.transcript : sourceColors.transcript
              
              // Use drag state for visual feedback during drag
              let displayLeft = subtitle.left
              let displayWidth = subtitle.width
              
              // Multi-drag visual feedback
              if (isInMultiDrag && dragState?.updatedPositions && dragState.updatedPositions[subtitle.id]) {
                const updatedPos = dragState.updatedPositions[subtitle.id]
                displayLeft = timeToPixel(updatedPos.start)
                const displayRight = timeToPixel(updatedPos.end)
                displayWidth = Math.max(MIN_SUBTITLE_WIDTH, displayRight - displayLeft)
              } else if (isDraggingThis && dragState) {
                // Single drag
                if (dragState.finalStart !== undefined && dragState.finalEnd !== undefined) {
                  displayLeft = timeToPixel(dragState.finalStart)
                  const displayRight = timeToPixel(dragState.finalEnd)
                  displayWidth = Math.max(MIN_SUBTITLE_WIDTH, displayRight - displayLeft)
                }
              }
              
              // CRITICAL: Hard bounds enforcement for display position
              // NEVER allow subtitle to exceed container bounds
              const CONTAINER_MAX = timelineWidth - 100 // Hard limit with margin
              if (displayLeft + displayWidth > CONTAINER_MAX) {
                if (displayLeft >= CONTAINER_MAX) {
                  displayLeft = CONTAINER_MAX - MIN_SUBTITLE_WIDTH
                  displayWidth = MIN_SUBTITLE_WIDTH
                } else {
                  displayWidth = CONTAINER_MAX - displayLeft
                }
              }
              if (displayLeft < 0) {
                displayLeft = 0
              }
              
              return (
                <div
                  key={subtitle.id}
                  onMouseDown={(e) => handleSubtitleMouseDown(e, subtitle)}
                  onDoubleClick={(e) => handleSubtitleDoubleClick(e, subtitle)}
                  onMouseEnter={() => setHoveredSubtitle(subtitle.id)}
                  onMouseLeave={() => setHoveredSubtitle(null)}
                  style={{
                    position: 'absolute',
                    left: `${displayLeft}px`,
                    width: `${displayWidth}px`,
                    top: `${subtitle.top}px`,
                    height: `${SUBTITLE_HEIGHT}px`,
                    background: isSelected
                      ? 'var(--accent-primary)'
                      : isHovered
                      ? 'var(--accent-secondary)'
                      : baseColor,
                    borderRadius: '6px',
                    border: isSelected ? '2px solid var(--text-primary)' : '1px solid var(--border-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    cursor: splitMode ? 'crosshair' : 'grab',
                    pointerEvents: 'auto', // Enable interactions for subtitle boxes
                    color: 'white',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    padding: '0 6px',
                    userSelect: 'none',
                    zIndex: isSelected ? 10 : 3, // Combined zIndex logic
                    transition: (isDraggingThis || isInMultiDrag) ? 'none' : 'all 0.15s ease-out',
                    opacity: (isDraggingThis || isInMultiDrag) ? 0.8 : 1,
                    boxShadow: (isDraggingThis || isInMultiDrag) ? '0 4px 12px rgba(0,0,0,0.3)' : 'none'
                  }}
                  title={`${formatTime(subtitle.start)} - ${formatTime(subtitle.end)}: ${subtitle.text}

Left edge: Adjust start
Right edge: Adjust end
Center: Move entire block
S + click: Split by word
Shift + click: Multi-select`}
                >
                  {/* Left Resize Handle - Invisible */}
                  <div
                    data-handle="left"
                    style={{
                      position: 'absolute',
                      left: '0',
                      top: '0',
                      width: `${RESIZE_HANDLE_WIDTH}px`,
                      height: '100%',
                      cursor: 'ew-resize',
                      zIndex: 3
                    }}
                    title="Left edge: Adjust start"
                  />
                  
                  {/* Move Area */}
                  <div style={{ 
                    flex: 1, 
                    textAlign: 'center',
                    padding: '0 8px',
                    background: splitMode && isHovered 
                      ? 'var(--accent-primary)' 
                      : isHovered 
                      ? 'rgba(255,255,255,0.1)' 
                      : 'transparent',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: splitMode ? 'crosshair' : 'grab',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    border: splitMode && isHovered ? '2px dashed var(--accent-primary)' : 'none'
                  }}>
                    {subtitle.text}
                  </div>
                  
                  {/* Right Resize Handle - Invisible */}
                  <div
                    data-handle="right"
                    style={{
                      position: 'absolute',
                      right: '0',
                      top: '0',
                      width: `${RESIZE_HANDLE_WIDTH}px`,
                      height: '100%',
                      cursor: 'ew-resize',
                      zIndex: 3
                    }}
                    title="Right edge: Adjust end"
                  />
                </div>
              )
            })}
            
            {/* Empty timeline message */}
            {showEmptyTimeline && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '14px',
                pointerEvents: 'none'
              }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>✂️</div>
                <div>Add subtitles to see them here</div>
                <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>
                  Drag edges: Expand/Shrink • Center: Move • S: Split
                </div>
              </div>
            )}
          </div> {/* End subtitles overlay */}
        </div> {/* End zoom-scalable content */}
      </div> {/* End unified timeline container */}

      {/* Edit Popup Modal */}
      {editingSubtitle && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
          onClick={handleCancelEdit}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              borderRadius: '12px',
              padding: '24px',
              minWidth: '500px',
              maxWidth: '700px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
              border: '1px solid var(--border-color)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)' }}>
              ✏️ Edit Subtitle Text
            </h3>
            
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                fontSize: '14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                resize: 'vertical',
                fontFamily: 'inherit'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  handleSaveEdit()
                } else if (e.key === 'Escape') {
                  handleCancelEdit()
                }
              }}
            />
            
            <div style={{ 
              marginTop: '16px', 
              display: 'flex', 
              gap: '12px', 
              justifyContent: 'flex-end' 
            }}>
              <button
                onClick={handleCancelEdit}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-hover)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel (Esc)
              </button>
              <button
                onClick={handleSaveEdit}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--accent-primary)',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Save (Ctrl+Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Status Bar */}
      <div style={{
        marginTop: '15px',
        fontSize: '11px',
        color: 'var(--text-muted)',
        textAlign: 'center',
        borderTop: '1px solid var(--border-color)',
        paddingTop: '10px'
      }}>
        {mediaFile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>
              🎵 {originalFileName || audioFile?.name || (typeof mediaFile === 'string' ? mediaFile.split(/[\\/]/).pop() : 'Media File')} 
              {duration > 0 && ` | ⏱️ ${formatTime(duration)}`}
              {zoom !== 1 && ` | 🔍 ${zoom.toFixed(1)}x`}
              {selectedSubtitleId && ` | Selected: ${Array.isArray(subtitles) ? subtitles.find(s => s.id === selectedSubtitleId)?.text?.substring(0, 30) : ''}...`}
            </div>
            <div style={{ fontSize: '10px', opacity: 0.7 }}>
              ⌨️ Controls: S=Split Mode | ⟨⟩=Drag Edges | Shift+Drag=Fine (0.1s) | Mouse Wheel=Zoom
            </div>
          </div>
        ) : (
          <div>📂 Select a media file and edit on the timeline | ⟨⟩ Resize, Move, Split</div>
        )}
      </div>
    </div>
  )
}

export default FlexibleTimeline