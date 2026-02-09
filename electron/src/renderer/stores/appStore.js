/**
 * SubMaker App Store (Zustand)
 * Global state management
 */
import { create } from 'zustand';
import axios from 'axios';

const API_URL = window.API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  timeout: 600000, // 10 min timeout for long operations
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});

export const useAppStore = create((set, get) => ({
  // ==========================================================================
  // State
  // ==========================================================================
  
  // Backend status
  backendStatus: 'checking', // 'online', 'offline', 'checking'
  
  // Current step
  currentStep: 'upload', // 'upload', 'transcribe', 'edit', 'style', 'preview', 'render'
  
  // Audio/Video file
  mediaFile: null,
  mediaType: null, // 'audio' or 'video'
  mediaDuration: 0,
  originalFileName: null, // Original filename from user
  savedFileName: null, // Actual filename saved on server (UUID)
  
  // Background settings
  background: {
    type: 'color', // 'color', 'image', 'transparent'
    value: '#000000',
    imagePath: null,
  },
  
  // Video format
  videoFormat: 'horizontal', // 'horizontal', 'vertical', 'square'
  outputFormat: 'mp4', // 'mp4', 'webm', 'mov'
  quality: 'low', // 'high', 'medium', 'low' - Default low for faster karaoke rendering
  
  // Language
  sourceLanguage: null, // null for auto-detect
  detectedLanguage: null,
  
  // Subtitles
  subtitles: [],
  selectedSubtitleId: null,
  
  // Style settings - Optimized for 4K
  style: {
    fontName: 'Arial',
    fontSize: 96,  // Increased for 4K rendering
    color: '#FFFFFF',
    borderColor: '#000000',
    borderWidth: 4,    // Increased for 4K visibility
    shadowDepth: 2,     // Increased shadow for 4K
    bold: false,
    italic: false,
    alignment: 2, // bottom center
    marginVertical: 100, // Increased margin for 4K
  },
  
  // Animation settings
  animation: {
    type: 'fade', // 'none', 'fade', 'karaoke', 'pop', 'typewriter'
    fadeIn: 200,
    fadeOut: 200,
    karaokeType: 'instant', // 'instant', 'sweep' - instant is faster for 4K
    highlightColor: '#FFFF00',
  },
  
  // Logo/Watermark settings (multiple logos supported)
  logos: [],
  selectedLogoId: null,
  
  // ==========================================================================
  // Secondary Subtitle (Dual Language) Settings
  // ==========================================================================
  secondarySubtitle: {
    enabled: true,
    targetLanguage: 'en',
    subtitles: [], // Translated subtitles with {id, translatedText, ...}
    style: {
      fontName: 'Arial',
      fontSize: 72,  // Secondary subtitle font size for 4K
      color: '#FFFFFF', // White by default
      borderColor: '#000000',
      borderWidth: 4,    // Increased for 4K
      shadowDepth: 2,     // Increased for 4K
      bold: false,
      italic: false,
      marginVertical: 240, // Below primary subtitle - increased for 4K
      // Pozisyon kontrolü
      alignment: 5, // 1-9 grid (5 = center bottom)
      offsetX: 0, // Yatay kayma (-100 to +100)
      offsetY: 0, // Dikey kayma (-100 to +100)
    },
    isTranslating: false,
  },
  
  // App Settings
  settings: {
    gifProvider: 'tenor', // 'tenor' or 'giphy'
    dualSubtitleEnabled: true, // Module toggle in settings - varsayılan açık
    
    // Audio Visualization Settings - Basitleştirilmiş ve Varsayılan Aktif
    audioVisualization: {
      showWaveform: true,      // Varsayılan olarak aktif - Basit waveform
      waveformHeight: 110,     // Optimize edilmiş yükseklik
      waveformColor: '#00FF88',// Parlak yeşil renk (daha belirgin)
      enhancement: 1.2,        // Optimize edilmiş güçlendirme
    },
  },
  
  // Model Settings - Dil bazında model seçimi
  modelSettings: {
    ar: 'medium',    // Arapça için büyük model
    tr: 'small',     // Türkçe için optimal
    en: 'base',      // İngilizce için hız odaklı
    es: 'small',     // İspanyolca
    fr: 'small',     // Fransızca
    de: 'small',     // Almanca
    it: 'small',     // İtalyanca
    pt: 'small',     // Portekizce
    ru: 'small',     // Rusça
    zh: 'medium',    // Çince
    ja: 'medium',    // Japonca
    ko: 'medium',    // Korece
    auto: 'small'    // Otomatik algılama için varsayılan
  },
  
  // Content Type Settings
  contentType: 'speech', // 'speech', 'music', 'podcast'
  contentGenre: null,    // For music: 'pop', 'rock', 'classical', 'rap', 'jazz'
  
  // Preview mode
  previewMode: 'docked', // 'docked' or 'floating'
  
  // Processing state
  isProcessing: false,
  processingStep: '',
  processingProgress: 0,
  currentTranscriptText: '', // Currently transcribing text preview
  
  // Render statistics and timer
  renderStats: {
    totalRenders: 0,
    lastRenderDuration: 0,
  },
  renderStartTime: null,
  renderTimer: null,
  renderElapsedTime: 0,
  
  // Render statistics and timer
  renderStats: {
    totalRenders: 0,
    lastRenderDuration: 0,
  },
  renderStartTime: null,
  renderTimer: null,
  renderElapsedTime: 0,
  
  // Playback state (global for sync with FloatingPreview)
  playbackTime: 0,
  isPlaying: false,
  globalAudioRef: null, // Global audio element reference for sync
  
  // Output
  outputPath: null,
  
  // Errors
  error: null,
  
  // ==========================================================================
  // Actions
  // ==========================================================================
  
  // Backend health check
  checkBackendHealth: async () => {
    set({ backendStatus: 'checking' });
    try {
      const response = await api.get('/health');
      set({ backendStatus: 'online', error: null });
      return true;
    } catch (error) {
      set({ backendStatus: 'offline' });
      return false;
    }
  },
  
  setBackendStatus: (status) => set({ backendStatus: status }),
  
  // Playback actions
  setPlaybackTime: (time) => set({ playbackTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setGlobalAudioRef: (ref) => set({ globalAudioRef: ref }),
  
  // Set current step
  setCurrentStep: (step) => set({ currentStep: step }),
  
  // Set media file
  setMediaFile: async (filePath, type) => {
    // Extract original filename from path
    const originalFileName = filePath ? filePath.split(/[/\\\\]/).pop() : null;
    
    set({ 
      mediaFile: filePath, 
      mediaType: type,
      originalFileName: originalFileName,
      savedFileName: originalFileName, // For direct file access, saved = original
      subtitles: [],
      outputPath: null,
      error: null,
    });
  },
  
  // Background settings
  setBackgroundType: (type) => set((state) => ({
    background: { ...state.background, type }
  })),
  
  setBackgroundColor: (color) => set((state) => ({
    background: { ...state.background, type: 'color', value: color }
  })),
  
  setBackgroundImage: (path) => set((state) => {
    // Clean up previous blob URL if exists
    if (state.background.imagePath && state.background.imagePath.startsWith('blob:')) {
      URL.revokeObjectURL(state.background.imagePath);
    }
    
    const newBackground = { 
      ...state.background, 
      type: 'image', 
      value: path, 
      imagePath: path 
    };
    return { background: newBackground };
  }),
  
  // Format settings
  setVideoFormat: (format) => set({ videoFormat: format }),
  setOutputFormat: (format) => set({ outputFormat: format }),
  setQuality: (quality) => set({ quality }),
  
  // Language settings
  setSourceLanguage: (lang) => set({ sourceLanguage: lang }),
  
  // Upload file
  uploadFile: async (file) => {
    const { checkBackendHealth } = get();
    
    const isOnline = await checkBackendHealth();
    if (!isOnline) {
      set({ error: 'Backend is not available' });
      return null;
    }
    
    set({ isProcessing: true, processingStep: 'Uploading file...', processingProgress: 0 });
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000, // 10 min for large files
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          set({ processingProgress: progress });
        },
      });
      
      const { file_path, file_type, original_name } = response.data;
      
      // Extract saved filename from full path for API requests
      const savedFileName = file_path ? file_path.split(/[\\/]/).pop() : null;
      
      // Only set mediaFile for audio/video files, not for background images
      if (file_type === 'audio' || file_type === 'video') {
        set({ 
          mediaFile: file_path,
          mediaType: file_type,
          originalFileName: original_name,
          savedFileName: savedFileName,
          isProcessing: false,
          currentStep: 'transcribe',
        });
      } else {
        // For other files (like background images), don't change media state
        set({ 
          isProcessing: false,
        });
      }
      
      return response.data;
    } catch (error) {
      set({ 
        error: error.response?.data?.error || error.message,
        isProcessing: false,
      });
      return null;
    }
  },
  
  // Transcribe audio with streaming progress
  transcribe: async () => {
    const { 
      mediaFile, 
      sourceLanguage, 
      modelSettings, 
      contentType, 
      contentGenre,
      checkBackendHealth 
    } = get();
    
    if (!mediaFile) {
      set({ error: 'No media file selected' });
      return null;
    }
    
    const isOnline = await checkBackendHealth();
    if (!isOnline) {
      set({ error: 'Backend is not available' });
      return null;
    }
    
    // Show content type specific loading message
    const contentTypeMessages = {
      speech: 'Konuşma transkripsiyon için AI modeli yükleniyor...',
      music: 'Müzik lirik tespiti için Large model yükleniyor...',
      podcast: 'Podcast transkripsiyon için AI modeli yükleniyor...'
    };
    
    set({ 
      isProcessing: true, 
      processingStep: contentTypeMessages[contentType] || contentTypeMessages['speech'], 
      processingProgress: 0,
      currentTranscriptText: '',
      error: null,
    });
    
    return new Promise((resolve, reject) => {
      try {
        // Use fetch with streaming for SSE
        fetch('http://localhost:5000/api/transcribe/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_path: mediaFile,
            language: sourceLanguage,
            model_settings: modelSettings,  // Model ayarlarını backend'e gönder
            content_type: contentType,      // İçerik türü
            content_genre: contentGenre,    // Müzik türü (opsiyonel)
          }),
        }).then(response => {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          
          function processStream() {
            reader.read().then(({ done, value }) => {
              if (done) return;
              
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    
                    if (data.type === 'status') {
                      set({ 
                        processingStep: data.message,
                        processingProgress: data.progress,
                      });
                    } else if (data.type === 'progress') {
                      set({ 
                        processingStep: `Transkripsiyon yapılıyor... ${data.progress}%`,
                        processingProgress: data.progress,
                        currentTranscriptText: data.current_text || '',
                      });
                    } else if (data.type === 'complete') {
                      // Mark transcribed subtitles with source
                      const transcribedSubtitles = data.subtitles.map(sub => ({
                        ...sub,
                        source: 'transcript',
                        type: sub.type || 'speech'
                      }));
                      
                      set({ 
                        subtitles: transcribedSubtitles,
                        detectedLanguage: data.language,
                        mediaDuration: data.duration,
                        isProcessing: false,
                        currentStep: 'edit',
                        currentTranscriptText: '',
                      });
                      resolve(data);
                    } else if (data.type === 'error') {
                      set({ 
                        error: data.error,
                        isProcessing: false,
                        currentTranscriptText: '',
                      });
                      reject(new Error(data.error));
                    }
                  } catch (e) {
                    console.log('Parse error:', e);
                  }
                }
              }
              
              processStream();
            });
          }
          
          processStream();
        }).catch(error => {
          // Fallback to regular API if streaming fails
          console.log('Streaming failed, using regular API:', error);
          api.post('/transcribe', {
            file_path: mediaFile,
            language: sourceLanguage,
          }).then(response => {
            const { subtitles, language, duration } = response.data;
            
            // Mark transcribed subtitles with source
            const transcribedSubtitles = subtitles.map(sub => ({
              ...sub,
              source: 'transcript',
              type: sub.type || 'speech'
            }));
            
            set({ 
              subtitles: transcribedSubtitles,
              detectedLanguage: language,
              mediaDuration: duration,
              isProcessing: false,
              currentStep: 'edit',
            });
            resolve(response.data);
          }).catch(err => {
            set({ 
              error: err.response?.data?.error || err.message,
              isProcessing: false,
            });
            reject(err);
          });
        });
      } catch (error) {
        set({ 
          error: error.message,
          isProcessing: false,
        });
        reject(error);
      }
    });
  },
  
  // Update subtitle
  updateSubtitle: (id, updates) => set((state) => ({
    subtitles: state.subtitles.map((sub) =>
      sub.id === id ? { ...sub, ...updates } : sub
    ),
  })),
  
  // Delete subtitle
  deleteSubtitle: (id) => set((state) => ({
    subtitles: state.subtitles.filter((sub) => sub.id !== id),
  })),
  
  // Clear all subtitles (for retranscribe)
  clearSubtitles: () => set({ 
    subtitles: [], 
    selectedSubtitleId: null,
    detectedLanguage: null,
    currentStep: 'transcribe',
  }),
  
  // Add subtitle
  addSubtitle: (subtitle) => set((state) => {
    const newSubtitles = [...state.subtitles, { ...subtitle, id: subtitle.id || Date.now() }]
    // Sort by start time to keep subtitles in order
    newSubtitles.sort((a, b) => a.start - b.start)
    return { subtitles: newSubtitles }
  }),
  
  // Import lyrics from Suno format - works with both transcript and lyrics
  importLyrics: (parsedLyrics, options = {}) => set((state) => {
    const { merge = false, replace = true } = options;
    
    // Convert parsed lyrics to subtitle format with unique IDs
    const lyricsSubtitles = parsedLyrics.map((lyric, index) => ({
      id: Date.now() + index,
      start: lyric.start,
      end: lyric.end,
      text: lyric.text,
      type: lyric.type || 'verse',
      metadata: lyric.metadata || {},
      source: 'lyrics', // Mark as lyrics import
      // Ensure text is clean and not empty
      originalText: lyric.text
    })).filter(sub => sub.text && sub.text.trim() !== '' && sub.text !== '[pause]');
    
    // Determine final subtitles array
    let finalSubtitles;
    
    if (merge) {
      // Merge mode: Keep existing subtitles and add new lyrics
      // Mark existing subtitles without source as 'transcript'
      const existingWithSource = state.subtitles.map(sub => ({
        ...sub,
        source: sub.source || 'transcript'
      }));
      
      // Combine and sort by start time
      finalSubtitles = [...existingWithSource, ...lyricsSubtitles]
        .sort((a, b) => a.start - b.start);
    } else if (replace) {
      // Replace mode: Replace all subtitles with lyrics (default behavior)
      finalSubtitles = [...lyricsSubtitles];
    } else {
      // Keep existing, just update metadata
      finalSubtitles = state.subtitles;
    }
    
    return {
      subtitles: finalSubtitles,
      currentStep: 'edit', // Move to edit step after import
      selectedSubtitleId: lyricsSubtitles.length > 0 ? lyricsSubtitles[0].id : null,
      // Update duration based on longest subtitle
      mediaDuration: finalSubtitles.length > 0 ? 
        Math.max(...finalSubtitles.map(sub => sub.end), state.mediaDuration || 0) : 
        state.mediaDuration
    };
  }),
  
  // Clear lyrics (specific to lyrics import)
  clearLyrics: () => set((state) => ({
    subtitles: state.subtitles.filter(sub => !sub.type || !['section', 'citation', 'verse', 'intro', 'outro', 'bridge'].includes(sub.type)),
  })),
  
  // Select subtitle
  selectSubtitle: (id) => set({ selectedSubtitleId: id }),
  setSelectedSubtitleId: (id) => set({ selectedSubtitleId: id }),
  
  // Style settings
  setStyle: (updates) => set((state) => ({
    style: { ...state.style, ...updates },
  })),
  
  // Animation settings
  setAnimation: (updates) => set((state) => ({
    animation: { ...state.animation, ...updates },
  })),
  
  // Logo settings (multiple logos)
  addLogo: (imageData, imagePath) => set((state) => {
    const newLogo = {
      id: Date.now(),
      enabled: true,
      imageData,
      imagePath,
      position: { x: 50, y: 10 + (state.logos.length * 15) % 80 },
      size: 15,
      opacity: 100,
      anchor: 'custom',
    };
    return {
      logos: [...state.logos, newLogo],
      selectedLogoId: newLogo.id,
    };
  }),
  
  updateLogo: (id, updates) => set((state) => ({
    logos: state.logos.map(logo => 
      logo.id === id ? { ...logo, ...updates } : logo
    ),
  })),
  
  removeLogo: (id) => set((state) => ({
    logos: state.logos.filter(logo => logo.id !== id),
    selectedLogoId: state.selectedLogoId === id ? null : state.selectedLogoId,
  })),
  
  clearAllLogos: () => set({ logos: [], selectedLogoId: null }),
  
  selectLogo: (id) => set({ selectedLogoId: id }),
  
  setLogoPosition: (id, x, y) => set((state) => ({
    logos: state.logos.map(logo => 
      logo.id === id ? { ...logo, position: { x, y }, anchor: 'custom' } : logo
    ),
  })),
  
  setLogoAnchor: (id, anchor) => {
    const positions = {
      'top-left': { x: 5, y: 5 },
      'top-center': { x: 50, y: 5 },
      'top-right': { x: 95, y: 5 },
      'center': { x: 50, y: 50 },
      'bottom-left': { x: 5, y: 95 },
      'bottom-center': { x: 50, y: 95 },
      'bottom-right': { x: 95, y: 95 },
    };
    set((state) => ({
      logos: state.logos.map(logo => 
        logo.id === id ? { ...logo, anchor, position: positions[anchor] || logo.position } : logo
      ),
    }));
  },
  
  // Legacy compatibility
  setLogo: (updates) => set((state) => {
    if (state.selectedLogoId) {
      return {
        logos: state.logos.map(logo => 
          logo.id === state.selectedLogoId ? { ...logo, ...updates } : logo
        ),
      };
    }
    return state;
  }),
  
  setLogoImage: (imageData, imagePath) => set((state) => {
    const newLogo = {
      id: Date.now(),
      enabled: true,
      imageData,
      imagePath,
      position: { x: 50, y: 10 + (state.logos.length * 15) % 80 },
      size: 15,
      opacity: 100,
      anchor: 'custom',
    };
    return {
      logos: [...state.logos, newLogo],
      selectedLogoId: newLogo.id,
    };
  }),
  
  clearLogo: () => set((state) => ({
    logos: state.selectedLogoId 
      ? state.logos.filter(l => l.id !== state.selectedLogoId) 
      : state.logos,
    selectedLogoId: null,
  })),
  
  // Settings
  setSettings: (updates) => set((state) => ({
    settings: { ...state.settings, ...updates },
  })),
  
  // Audio Visualization Settings
  updateAudioVisualization: (updates) => set((state) => ({
    settings: {
      ...state.settings,
      audioVisualization: {
        ...state.settings.audioVisualization,
        ...updates
      }
    }
  })),
  
  // Preview mode
  setPreviewMode: (mode) => set({ previewMode: mode }),
  
  // Active render job
  renderJobId: null,
  renderPolling: null,
  
  // Render video (async with polling)
  render: async () => {
    const { 
      mediaFile, subtitles, background, videoFormat, 
      outputFormat, quality, style, animation, logos,
      sourceLanguage, detectedLanguage, checkBackendHealth,
      settings, secondarySubtitle
    } = get();
    
    if (!mediaFile || !subtitles.length) {
      set({ error: 'No media file or subtitles' });
      return null;
    }
    
    const isOnline = await checkBackendHealth();
    if (!isOnline) {
      set({ error: 'Backend is not available' });
      return null;
    }
    
    const startTime = Date.now();
    
    set({ 
      isProcessing: true, 
      processingStep: 'Starting render...', 
      processingProgress: 0,
      outputPath: null, // Clear previous output
      error: null,
      renderStartTime: startTime,
      renderElapsedTime: 0,
    });
    
    // Start render timer
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      set(state => ({ renderElapsedTime: elapsed }));
    }, 1000);
    
    set({ renderTimer: timer });
    
    try {
      // Prepare secondary subtitle data if enabled
      const secondarySubData = settings.dualSubtitleEnabled && secondarySubtitle.subtitles?.length > 0
        ? {
            enabled: true,
            subtitles: secondarySubtitle.subtitles,
            style: secondarySubtitle.style,
            targetLanguage: secondarySubtitle.targetLanguage,
          }
        : null;
      
      // Start render job
      console.log('Starting render with data:', {
        audio_path: mediaFile,
        subtitles_count: subtitles.length,
        background,
        video_format: videoFormat,
        output_format: outputFormat,
        quality,
        source_language: sourceLanguage || detectedLanguage,
        logos_count: logos?.length || 0,
        dual_subtitle: secondarySubData ? 'enabled' : 'disabled',
      });
      
      const response = await api.post('/render', {
        audio_path: mediaFile,
        subtitles,
        background,
        video_format: videoFormat,
        output_format: outputFormat,
        quality,
        style,
        animation,
        source_language: sourceLanguage || detectedLanguage,
        logos: logos?.length > 0 ? logos : null,
        secondarySubtitle: secondarySubData,
      });
      
      console.log('Render started, response:', response.data);
      
      if (!response.data.success || !response.data.job_id) {
        throw new Error(response.data.error || 'Failed to start render job');
      }
      
      const jobId = response.data.job_id;
      set({ renderJobId: jobId });
      
      // Start polling for progress
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await api.get(`/render/status/${jobId}`);
          const status = statusRes.data;
          
          console.log('Render status:', status);
          
          set({ 
            processingProgress: status.progress,
            processingStep: status.step || 'Processing...',
          });
          
          if (status.status === 'completed') {
            clearInterval(pollInterval);
            
            const { renderTimer, renderStats, renderStartTime } = get();
            const endTime = Date.now();
            const duration = Math.floor((endTime - renderStartTime) / 1000);
            
            // Clear timer
            if (renderTimer) {
              clearInterval(renderTimer);
            }
            
            console.log('Render completed! Output:', status.output_path);
            console.log('Render duration:', duration, 'seconds');
            
            set({ 
              outputPath: status.output_path,
              isProcessing: false,
              currentStep: 'render', // Keep on render step instead of 'complete'
              renderJobId: null,
              renderPolling: null,
              renderTimer: null,
              renderElapsedTime: duration,
              renderStats: {
                totalRenders: renderStats.totalRenders + 1,
                lastRenderDuration: duration,
              },
            });
          } else if (status.status === 'error') {
            clearInterval(pollInterval);
            
            const { renderTimer } = get();
            if (renderTimer) {
              clearInterval(renderTimer);
            }
            
            console.error('Render error:', status.error);
            set({ 
              error: status.error || 'Render failed',
              isProcessing: false,
              renderJobId: null,
              renderPolling: null,
              renderTimer: null,
            });
          } else if (status.status === 'cancelled') {
            clearInterval(pollInterval);
            
            const { renderTimer } = get();
            if (renderTimer) {
              clearInterval(renderTimer);
            }
            
            set({ 
              isProcessing: false,
              renderJobId: null,
              renderPolling: null,
              renderTimer: null,
            });
          }
        } catch (err) {
          console.error('Polling error:', err);
          // Don't stop polling on network errors, just log
        }
      }, 500); // Poll every 500ms
      
      set({ renderPolling: pollInterval });
      
      return { success: true, job_id: jobId };
    } catch (error) {
      const { renderTimer } = get();
      if (renderTimer) {
        clearInterval(renderTimer);
      }
      
      set({ 
        error: error.response?.data?.error || error.message,
        isProcessing: false,
        renderTimer: null,
      });
      return null;
    }
  },
  
  // Cancel render
  cancelRender: async () => {
    const { renderJobId, renderPolling, renderTimer } = get();
    
    if (renderPolling) {
      clearInterval(renderPolling);
    }
    
    if (renderTimer) {
      clearInterval(renderTimer);
    }
    
    if (renderJobId) {
      try {
        await api.post(`/render/cancel/${renderJobId}`);
      } catch (err) {
        console.error('Cancel error:', err);
      }
    }
    
    set({ 
      isProcessing: false,
      renderJobId: null,
      renderPolling: null,
      renderTimer: null,
      processingProgress: 0,
      processingStep: '',
    });
  },
  
  // Clear error
  clearError: () => set({ error: null }),
  
  // ==========================================================================
  // Model Settings Actions
  // ==========================================================================
  
  // Set model size for a specific language
  setModelForLanguage: (language, modelSize) => set((state) => ({
    modelSettings: { ...state.modelSettings, [language]: modelSize }
  })),
  
  // Get model size for a language
  getModelForLanguage: (language) => {
    const { modelSettings } = get();
    return modelSettings[language] || modelSettings['auto'] || 'small';
  },
  
  // Reset model settings to defaults
  resetModelSettings: () => set({
    modelSettings: {
      ar: 'medium',
      tr: 'small', 
      en: 'base',
      es: 'small',
      fr: 'small',
      de: 'small',
      it: 'small', 
      pt: 'small',
      ru: 'small',
      zh: 'medium',
      ja: 'medium',
      ko: 'medium',
      auto: 'small'
    }
  }),

  // Content type settings
  setContentType: (type) => set({ contentType: type }),
  setContentGenre: (genre) => set({ contentGenre: genre }),
  
  // Get recommended model for content type
  getRecommendedModel: (contentType, language) => {
    const contentConfigs = {
      speech: { ar: 'medium', tr: 'small', en: 'base', auto: 'small' },
      music: { ar: 'large-v3', tr: 'large-v3', en: 'large-v3', auto: 'large-v3' },
      podcast: { ar: 'medium', tr: 'medium', en: 'medium', auto: 'medium' }
    };
    
    return contentConfigs[contentType]?.[language] || 
           contentConfigs[contentType]?.auto || 
           'small';
  },

  // ==========================================================================
  // Secondary Subtitle Actions
  // ==========================================================================
  
  // Update audio visualization settings
  updateAudioVisualization: (updates) => set((state) => ({
    settings: {
      ...state.settings,
      audioVisualization: {
        ...state.settings.audioVisualization,
        ...updates
      }
    }
  })),
  
  // Toggle dual subtitle module
  setDualSubtitleEnabled: (enabled) => set((state) => ({
    settings: { ...state.settings, dualSubtitleEnabled: enabled },
    secondarySubtitle: { ...state.secondarySubtitle, enabled: enabled }
  })),
  
  // Set secondary subtitle target language
  setSecondaryLanguage: (lang) => set((state) => ({
    secondarySubtitle: { ...state.secondarySubtitle, targetLanguage: lang }
  })),
  
  // Translate all subtitles to secondary language
  translateToSecondary: async () => {
    const { subtitles, secondarySubtitle, detectedLanguage } = get();
    
    if (!subtitles.length) {
      set({ error: 'No subtitles to translate' });
      return null;
    }
    
    set((state) => ({
      secondarySubtitle: { ...state.secondarySubtitle, isTranslating: true }
    }));
    
    try {
      console.log('[Store] Translating subtitles...', { target: secondarySubtitle.targetLanguage });
      const response = await api.post('/translate/secondary', {
        subtitles: subtitles,
        target_lang: secondarySubtitle.targetLanguage,
        source_lang: detectedLanguage || 'auto'
      });
      
      console.log('[Store] Translation response:', response.data);
      
      if (response.data.success) {
        console.log('[Store] Translation successful, updating state...', {
          translatedSubtitles: response.data.subtitles,
          count: response.data.subtitles?.length
        });
        
        set((state) => ({
          secondarySubtitle: {
            ...state.secondarySubtitle,
            subtitles: response.data.subtitles,
            isTranslating: false
          }
        }));
        
        // State güncellemesi sonrası kontrol
        setTimeout(() => {
          const currentState = get();
          console.log('[Store] State updated, checking...', {
            secondarySubtitlesCount: currentState.secondarySubtitle?.subtitles?.length,
            dualEnabled: currentState.settings?.dualSubtitleEnabled,
            firstSubtitle: currentState.secondarySubtitle?.subtitles?.[0]
          });
        }, 100);
        
        console.log('[Store] Secondary subtitles saved:', response.data.subtitles?.length);
        return response.data.subtitles;
      } else {
        throw new Error(response.data.error || 'Translation failed');
      }
    } catch (error) {
      console.error('[Store] Translation error:', error);
      set((state) => ({
        secondarySubtitle: { ...state.secondarySubtitle, isTranslating: false },
        error: error.response?.data?.error || error.message
      }));
      return null;
    }
  },
  
  // Update a single secondary subtitle manually
  updateSecondarySubtitle: (id, newText) => set((state) => ({
    secondarySubtitle: {
      ...state.secondarySubtitle,
      subtitles: state.secondarySubtitle.subtitles.map(sub =>
        sub.id === id ? { ...sub, translatedText: newText } : sub
      )
    }
  })),
  
  // Set secondary subtitle style
  setSecondaryStyle: (styleUpdates) => set((state) => ({
    secondarySubtitle: {
      ...state.secondarySubtitle,
      style: { ...state.secondarySubtitle.style, ...styleUpdates }
    }
  })),
  
  // Clear secondary subtitles
  clearSecondarySubtitles: () => set((state) => ({
    secondarySubtitle: {
      ...state.secondarySubtitle,
      subtitles: []
    }
  })),
  
  // Reset project
  resetProject: () => set({
    currentStep: 'upload',
    mediaFile: null,
    mediaType: null,
    mediaDuration: 0,
    subtitles: [],
    selectedSubtitleId: null,
    outputPath: null,
    error: null,
    background: { type: 'color', value: '#000000', imagePath: null },
    detectedLanguage: null,
    secondarySubtitle: {
      enabled: false,
      targetLanguage: 'en',
      subtitles: [],
      style: {
        fontName: 'Arial',
        fontSize: 72,  // Updated for 4K rendering
        color: '#FFFF00',
        borderColor: '#000000',
        borderWidth: 4,      // Increased for 4K
        shadowDepth: 2,       // Increased for 4K
        bold: false,
        italic: false,
        marginVertical: 240,  // Increased for 4K
      },
      isTranslating: false,
    },
  }),
}));

// Debug: Store'a console'dan erişim için
if (typeof window !== 'undefined') {
  window.appStore = useAppStore;
}