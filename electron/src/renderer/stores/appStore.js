/**
 * SubMaker App Store (Zustand)
 * Global state management
 */
import { create } from 'zustand';
import axios from 'axios';
import { fetchJson, fetchFormData, streamJsonEvents } from '../services/electronTransport';

const API_URL = window.API_URL || 'http://localhost:5000/api';

// Create axios instance — uses regular XMLHttpRequest just like Chrome.
// No IPC proxy: Electron's Chromium network stack is identical to Chrome's.
const api = axios.create({
  baseURL: API_URL,
  timeout: 600000, // 10 min timeout for long operations
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
});

const isAbsolutePath = (p) => {
  if (!p || typeof p !== 'string') return false;
  const s = p.trim();
  if (!s) return false;
  if (/^\.{1,2}[\\/]/.test(s)) return false;
  if (/[\\/]fakepath[\\/]/i.test(s)) return false;
  return /^[a-zA-Z]:[\\/]/.test(s) || s.startsWith('\\\\') || s.startsWith('/');
};

const pickRealSourcePath = (...candidates) => {
  for (const candidate of candidates) {
    if (isAbsolutePath(candidate)) return candidate;
  }
  return null;
};

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
  mediaFileType: null, // 'audio' or 'video'
  originalMediaPath: null, // Add this line to store the original path
  originalFileName: null, // Original filename before temp upload (e.g., "My Song.mp3")
  subtitles: [],
  history: [],
  
  // Computed properties
  getMediaUrl: () => {
    const { mediaFile, originalMediaPath } = get();
    if (!mediaFile) return null;

    // If we have an absolute original path, create a URL to serve it locally
    if (originalMediaPath && (originalMediaPath.includes('/') || originalMediaPath.includes('\\'))) {
      return `http://localhost:5000/api/media/local?path=${encodeURIComponent(originalMediaPath)}`;
    }
    
    // Fallback for files uploaded to temp (legacy or web-only)
    if (typeof mediaFile === 'string') {
      const fileName = mediaFile.split(/[\\/]/).pop();
      return `http://localhost:5000/api/media/temp/${encodeURIComponent(fileName)}`;
    }
    
    return null;
  },

  // Background settings
  background: {
    type: 'color', // 'color', 'image', 'transparent'
    value: '#000000',
    imagePath: null,
  },
  
  // Visualizer (Butterchurn/Milkdrop)
  visualizer: {
    enabled: false,
    presetName: null,
    opacity: 0.8,
    autoCycle: false,
    autoCycleInterval: 30,
    sensitivity: 1.0,
  },

  // Video format
  videoFormat: 'horizontal', // 'horizontal', 'vertical', 'square' (active preview format)
  selectedFormats: ['horizontal'], // formats to render (multi-select)
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
      // Position control
      alignment: 5, // 1-9 grid (5 = center bottom)
      offsetX: 0, // Horizontal offset (-100 to +100)
      offsetY: 0, // Dikey kayma (-100 to +100)
    },
    isTranslating: false,
  },
  
  // App Settings
  settings: {
    gifProvider: 'tenor', // 'tenor' or 'giphy'
    dualSubtitleEnabled: true, // Module toggle in settings - enabled by default
    seekStep: 5, // Arrow key seek step in seconds

    // Audio Visualization Settings - Simplified and enabled by default
    audioVisualization: {
      showWaveform: true,      // Active by default - simple waveform
      waveformHeight: 110,     // Optimized height
      waveformColor: '#00FF88',// Bright green (more visible)
      enhancement: 1.2,        // Optimized boost
    },
  },

  // Model Settings - per-language model selection (faster-whisper)
  modelSettings: {
    ar: 'medium',    // Arabic - large model
    tr: 'turbo',     // Turkish - optimal
    en: 'turbo',     // English
    es: 'turbo',     // Spanish
    fr: 'turbo',     // French
    de: 'turbo',     // German
    it: 'turbo',     // Italian
    pt: 'turbo',     // Portuguese
    ru: 'turbo',     // Russian
    zh: 'medium',    // Chinese
    ja: 'medium',    // Japanese
    ko: 'medium',    // Korean
    auto: 'turbo'    // Default for auto-detect
  },
  
  // Whisper Advanced Parameters (user-tunable)
  whisperParams: {
    beam_size: null,                    // null = use default from content/language config
    best_of: null,
    patience: null,
    no_speech_threshold: null,
    temperature: null,                  // null = use fallback list, or scalar 0.0-1.0
    condition_on_previous_text: null,   // null = use content-type default
    initial_prompt: null,               // null = use language-specific auto prompt
    suppress_blank: null,
  },

  // Vocal Isolation
  vocalIsolation: false,
  // EP317 → vocals (best vocal quality + Whisper input)
  // Resurrection UNWA → instrumental (cleanest music for karaoke)
  // Toggling stems via 'Stems to Extract' controls which models actually run
  vocalSelectedStems: ['vocals', 'instrumental'],
  vocalSeparation: null,     // { stems: { vocals, instrumental, drums?, bass?, other? }, model_id, duration }
  vocalSeparating: false,    // true while separation is running
  vocalSeparationProgress: 0,
  vocalSeparationMessage: '',
  initialMediaPath: null,    // First media file absolute path selected in current project
  originalMediaFile: null,   // Original media file path (before stem replacement)

  // Audio Mixer (DAW-style multi-track)
  audioMixer: {
    enabled: false,
    tracks: {},         // { vocals: { id, label, icon, color, url, filePath, volume, muted, solo }, ... }
    masterVolume: 1.0,
    masterMuted: false,
  },

  // Export Settings
  exportFormats: [],              // Requested output formats: 'json', 'lrc', 'enhanced_lrc', 'id3'
  lastExportOutputs: {},          // Last export results (paths, status)
  
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
  
  // Batch render state
  batchRenderActive: false,
  batchRenderResults: [],
  batchRenderTotal: 0,
  batchRenderCurrent: 0,

  // Playback state (global for sync with FloatingPreview)
  playbackTime: 0,
  isPlaying: false,
  globalAudioRef: null, // Global audio element reference for sync
  
  // Output
  outputPath: null,

  // Loading state
  isLoading: false,
  loadingMessage: '',

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
  setMediaFile: (file, type, originalPath = null) => {
    const resolvedOriginal = originalPath || (typeof file === 'string' ? file : null);
    console.log('Setting media file:', { file, type, originalPath: resolvedOriginal });

    // Preserve initialMediaPath — the very first media file the user imported
    const prev = get().initialMediaPath;
    set({
      mediaFile: file,
      mediaFileType: type,
      originalMediaPath: resolvedOriginal,
      originalFileName: null, // reset; re-set by uploadFile if needed
      initialMediaPath: prev || resolvedOriginal,
      error: null,
      currentStep: 'transcribe',
      subtitles: [],
      history: [],
      selectedSubtitleId: null,
      playbackTime: 0,
      isPlaying: false,
      globalAudioRef: null,
      mediaDuration: 0,
      currentTranscriptText: '',
      outputPath: null,
      vocalSeparation: null,
      vocalSeparating: false,
      vocalSeparationProgress: 0,
      vocalSeparationMessage: '',
      audioMixer: { enabled: false, tracks: {}, masterVolume: 1.0, masterMuted: false, showTimelineTracks: true },
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
  
  // Visualizer actions
  setVisualizerEnabled: (enabled) => set((state) => ({
    visualizer: { ...state.visualizer, enabled }
  })),

  updateVisualizer: (updates) => set((state) => ({
    visualizer: { ...state.visualizer, ...updates }
  })),

  setVisualizerPreset: (presetName) => set((state) => ({
    visualizer: { ...state.visualizer, presetName }
  })),

  randomizeVisualizerPreset: async () => {
    try {
      const { getRandomPresetName } = await import('../components/ButterchurnCanvas');
      const name = await getRandomPresetName();
      set((state) => ({ visualizer: { ...state.visualizer, presetName: name } }));
    } catch (e) {
      console.error('Failed to randomize preset:', e);
    }
  },

  // Format settings
  setVideoFormat: (format) => set({ videoFormat: format }),
  toggleSelectedFormat: (format) => set((state) => {
    const current = state.selectedFormats;
    const has = current.includes(format);
    let next;
    if (has && current.length > 1) {
      // Deselect (but keep at least one)
      next = current.filter(f => f !== format);
    } else if (!has) {
      // Add format
      next = [...current, format];
    } else {
      return {}; // Can't deselect the last one
    }
    // Also update preview to first selected format
    return { selectedFormats: next, videoFormat: next[0] };
  }),
  setOutputFormat: (format) => set({ outputFormat: format }),
  setQuality: (quality) => set({ quality }),
  
  // Language settings
  setSourceLanguage: (lang) => set({ sourceLanguage: lang }),
  
  // Upload file
  uploadFile: async (file, options = {}) => {
    const { originalPath } = options;
    console.log('uploadFile called:', { name: file.name, type: file.type, size: file.size, originalPath });
    set({ isLoading: true, loadingMessage: 'Uploading file...', error: null });

    try {
      const audioExts = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'];
      const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'webm'];
      const extension = (file.name || '').split('.').pop().toLowerCase();
      const fileType = audioExts.includes(extension) ? 'audio' : (videoExts.includes(extension) ? 'video' : 'unknown');

      if (fileType === 'unknown') {
        throw new Error(`Unsupported file type: .${extension}`);
      }

      // If an original absolute path is provided via Electron's dialog, use it directly.
      if (originalPath && isAbsolutePath(originalPath)) {
        console.log('Using original path directly:', originalPath);
        get().setMediaFile(originalPath, fileType, originalPath);
        set({ isLoading: false, loadingMessage: '', originalFileName: file.name || null });
        console.log('Media file set, step changed to transcribe');
        return;
      }

      // For drag-and-drop without a resolved path, upload file content to backend
      const formData = new FormData();
      formData.append('file', file);

      console.log('Uploading to backend via FormData...');
      const data = await fetchFormData(`${API_URL}/upload`, formData);
      console.log('Upload response:', data);

      // The backend returns the path where it saved the file.
      get().setMediaFile(data.filePath, fileType, data.originalPath || data.filePath || null);
      // Preserve original filename when file was uploaded to temp
      if (data.original_name) {
        set({ originalFileName: data.original_name });
      }
      set({ isLoading: false, loadingMessage: '' });
      console.log('Upload complete, step changed to transcribe');

    } catch (error) {
      console.error('uploadFile error:', error);
      set({
        error: error.response?.data?.error || error.message,
        isLoading: false,
        loadingMessage: '',
        isProcessing: false,
      });
      return null;
    }
  },

  // Browse file via backend native dialog (browser mode — no Electron IPC)
  browseFile: async (fileType = 'media') => {
    set({ isLoading: true, loadingMessage: 'Opening file picker...', error: null });

    try {
      const response = await api.post('/browse-file', {
        file_type: fileType,
        title: fileType === 'audio' ? 'Select Audio File'
             : fileType === 'video' ? 'Select Video File'
             : 'Select Media File',
      });

      const data = response.data;

      if (data.cancelled || !data.filePath) {
        set({ isLoading: false, loadingMessage: '' });
        return null;
      }

      console.log('[BrowseFile] Selected:', data.filePath, 'type:', data.file_type);

      get().setMediaFile(data.filePath, data.file_type, data.filePath);
      set({ isLoading: false, loadingMessage: '', originalFileName: data.filePath.split(/[\\/]/).pop() });
      return data.filePath;

    } catch (error) {
      console.error('browseFile error:', error);
      set({
        error: error.response?.data?.error || error.message || 'File browse failed',
        isLoading: false,
        loadingMessage: '',
      });
      return null;
    }
  },

  // Transcribe audio with streaming progress
  transcribe: async () => {
    const {
      mediaFile,
      originalMediaPath,
      sourceLanguage,
      modelSettings,
      checkBackendHealth,
      audioMixer,
      vocalIsolation,
    } = get();

    // Always prefer the original imported media path for transcription
    const sourceMedia = originalMediaPath || mediaFile;

    if (!sourceMedia) {
      set({ error: 'No media file selected' });
      return null;
    }

    const isOnline = await checkBackendHealth();
    if (!isOnline) {
      set({ error: 'Backend is not available' });
      return null;
    }

    // If vocal isolation is enabled but stems don't exist yet, run separation first
    const hasVocalsTrack = audioMixer.enabled && audioMixer.tracks.vocals;
    if (vocalIsolation && !hasVocalsTrack) {
      console.log('[Transcribe] Vocal isolation enabled — running separation first...');
      set({
        isProcessing: true,
        processingStep: 'Running vocal isolation...',
        processingProgress: 0,
      });
      try {
        await get().separateVocals();
      } catch (sepErr) {
        console.error('[Transcribe] Vocal separation failed, continuing with original:', sepErr);
      }
    }

    // Re-read audioMixer after potential separation
    const currentMixer = get().audioMixer;
    const vocalsTrack = currentMixer.enabled && currentMixer.tracks.vocals;
    const transcriptionPath = vocalsTrack ? vocalsTrack.filePath : sourceMedia;
    // Skip backend vocal isolation if we already have a separated vocals track
    const skipVocalIsolation = !!vocalsTrack;

    console.log('[Transcribe] sourceMedia:', sourceMedia);
    console.log('[Transcribe] transcriptionPath:', transcriptionPath);
    console.log('[Transcribe] originalMediaPath:', originalMediaPath);
    console.log('[Transcribe] mediaFile:', mediaFile);

    set({
      isProcessing: true,
      processingStep: 'Loading AI model for transcription...',
      processingProgress: 0,
      currentTranscriptText: '',
      error: null,
    });

    const requestBody = {
      file_path: transcriptionPath,
      language: sourceLanguage,
      model_settings: modelSettings,
      enable_vocal_isolation: skipVocalIsolation ? false : get().vocalIsolation,
      vocal_model_id: 'vocal_ep317', // EP317 always used for Whisper transcription (best vocals)
      output_formats: get().exportFormats,
      whisper_params: Object.fromEntries(
        Object.entries(get().whisperParams).filter(([_, value]) => value !== null)
      ),
    };

    return new Promise((resolve, reject) => {
      let streamSettled = false;
      let heartbeatCount = 0;

      const handleStreamEvent = (data) => {
        if (data.type === 'heartbeat') {
          heartbeatCount++;
          set({
            processingStep: `Loading AI model... (${heartbeatCount * 3}s)`,
          });
          return;
        }

        if (data.type === 'status') {
          set({
            processingStep: data.message,
            processingProgress: data.progress,
          });
          return;
        }

        if (data.type === 'progress') {
          const stepMessage = data.current_text
            ? `${data.current_text}`
            : `Processing... ${data.progress}%`;
          set({
            processingStep: stepMessage,
            processingProgress: data.progress,
            currentTranscriptText: data.current_text || '',
          });
          return;
        }

        if (data.type === 'complete') {
          streamSettled = true;
          const transcribedSubtitles = data.subtitles.map((sub) => ({
            ...sub,
            source: 'transcript',
            type: sub.type || 'speech',
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
          return;
        }

        if (data.type === 'error') {
          streamSettled = true;
          set({
            error: data.error,
            isProcessing: false,
            currentTranscriptText: '',
          });
          reject(new Error(data.error));
        }
      };

      console.log('[Transcribe] Sending to /api/transcribe/stream, file_path:', transcriptionPath);
      streamJsonEvents(`${API_URL}/transcribe/stream`, requestBody, handleStreamEvent).then(() => {
        if (streamSettled) return;

        set({
          error: 'Transcription connection closed unexpectedly',
          isProcessing: false,
        });
        reject(new Error('Stream ended unexpectedly'));
      }).catch((error) => {
        if (streamSettled) return;

        console.log('[Transcribe] Streaming failed, using regular API:', error.message);
        set({ processingStep: 'Falling back to standard API...' });

        fetchJson(`${API_URL}/transcribe`, {
          method: 'POST',
          body: {
            file_path: transcriptionPath,
            language: sourceLanguage,
          },
        }).then((data) => {
          const { subtitles, language, duration } = data;
          const transcribedSubtitles = subtitles.map((sub) => ({
            ...sub,
            source: 'transcript',
            type: sub.type || 'speech',
          }));

          set({
            subtitles: transcribedSubtitles,
            detectedLanguage: language,
            mediaDuration: duration,
            isProcessing: false,
            currentStep: 'edit',
            currentTranscriptText: '',
          });
          resolve(data);
        }).catch((fallbackError) => {
          set({
            error: fallbackError.payload?.error || fallbackError.message,
            isProcessing: false,
            currentTranscriptText: '',
          });
          reject(fallbackError);
        });
      });
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
  
  // Internal: render a single format and return a Promise that resolves on completion
  _renderOneFormat: (format, visualizerData, secondarySubData) => {
    const {
      mediaFile, originalMediaPath, subtitles, background,
      outputFormat, quality, style, animation, logos,
      sourceLanguage, detectedLanguage,
      getMixerConfigForRender,
    } = get();

    const mixerConfig = getMixerConfigForRender();

    // Always use the original imported media path for render.
    // mediaFile may have been replaced by a stem URL after vocal separation.
    const renderAudioPath = originalMediaPath || mediaFile;

    return new Promise(async (resolve, reject) => {
      try {
        const response = await api.post('/render', {
          audio_path: renderAudioPath,
          original_name: get().originalFileName,
          subtitles,
          background,
          video_format: format,
          output_format: outputFormat,
          quality,
          style,
          animation,
          source_language: sourceLanguage || detectedLanguage,
          logos: logos?.length > 0 ? logos : null,
          secondarySubtitle: secondarySubData,
          visualizer: visualizerData,
          audio_mixer: mixerConfig,
        });

        if (!response.data.success || !response.data.job_id) {
          throw new Error(response.data.error || 'Failed to start render job');
        }

        const jobId = response.data.job_id;
        set({ renderJobId: jobId });

        // Poll until completion
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await api.get(`/render/status/${jobId}`);
            const status = statusRes.data;

            set({
              processingProgress: status.progress,
              processingStep: status.step || 'Processing...',
            });

            if (status.status === 'completed') {
              clearInterval(pollInterval);
              set({ renderJobId: null, renderPolling: null });
              resolve({ success: true, outputPath: status.output_path });
            } else if (status.status === 'error') {
              clearInterval(pollInterval);
              set({ renderJobId: null, renderPolling: null });
              reject(new Error(status.error || 'Render failed'));
            } else if (status.status === 'cancelled') {
              clearInterval(pollInterval);
              set({ renderJobId: null, renderPolling: null });
              reject(new Error('Render cancelled'));
            }
          } catch (err) {
            // Don't stop polling on network errors
            console.error('Polling error:', err);
          }
        }, 500);

        set({ renderPolling: pollInterval });
      } catch (error) {
        reject(error);
      }
    });
  },

  // Render video — automatically handles multi-format if multiple selected
  render: async () => {
    const {
      mediaFile, originalMediaPath, savedFileName, subtitles, selectedFormats, visualizer,
      checkBackendHealth, settings, secondarySubtitle,
    } = get();

    // Always prefer the original imported media path
    const sourceMediaPath = originalMediaPath || mediaFile;

    if (!sourceMediaPath || !subtitles.length) {
      set({ error: 'No media file or subtitles' });
      return null;
    }

    const isOnline = await checkBackendHealth();
    if (!isOnline) {
      set({ error: 'Backend is not available' });
      return null;
    }

    const formats = selectedFormats.length > 0 ? selectedFormats : ['horizontal'];
    const formatLabels = { horizontal: '16:9', vertical: '9:16', square: '1:1' };
    const isMulti = formats.length > 1;
    const startTime = Date.now();
    const results = [];

    set({
      isProcessing: true,
      processingStep: 'Starting render...',
      processingProgress: 0,
      outputPath: null,
      error: null,
      renderStartTime: startTime,
      renderElapsedTime: 0,
      batchRenderActive: isMulti,
      batchRenderResults: [],
      batchRenderTotal: formats.length,
      batchRenderCurrent: 0,
    });

    // Start render timer
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      set({ renderElapsedTime: elapsed });
    }, 1000);
    set({ renderTimer: timer });

    // Prepare secondary subtitle data
    const secondarySubData = settings.dualSubtitleEnabled && secondarySubtitle.subtitles?.length > 0
      ? {
          enabled: true,
          subtitles: secondarySubtitle.subtitles,
          style: secondarySubtitle.style,
          targetLanguage: secondarySubtitle.targetLanguage,
        }
      : null;

    try {
      for (let i = 0; i < formats.length; i++) {
        const fmt = formats[i];
        if (!get().isProcessing) break; // cancelled

        if (isMulti) {
          set({
            batchRenderCurrent: i + 1,
            processingStep: `${formatLabels[fmt]} rendering... (${i + 1}/${formats.length})`,
            videoFormat: fmt,
          });
        }

        // Pre-render visualizer for THIS format's dimensions
        let visualizerData = visualizer.enabled ? { ...visualizer } : null;
        if (visualizer.enabled && sourceMediaPath) {
          try {
            set({ processingStep: isMulti
              ? `${formatLabels[fmt]} — Rendering... (${i + 1}/${formats.length})`
              : 'Rendering...'
            });
            const { exportVisualizerVideo } = await import('../services/visualizerFrameExporter');
            // Build audio URL from local or temp endpoint based on the original media path
            const isAbsPath = (p) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/');
            const isTempPath = (p) => /[\\/]temp[\\/]/i.test(p);
            const audioFilename = savedFileName || sourceMediaPath.split(/[\\/]/).pop();
            const baseUrl = API_URL.replace('/api', '');
            const audioUrl = (isAbsPath(sourceMediaPath) && !isTempPath(sourceMediaPath))
              ? `${baseUrl}/api/media/local?path=${encodeURIComponent(sourceMediaPath)}`
              : `${baseUrl}/api/media/temp/${encodeURIComponent(audioFilename)}`;
            // Ensure presetName is set — auto-select random if null
            let renderPresetName = visualizer.presetName;
            if (!renderPresetName) {
              try {
                const { getRandomPresetName } = await import('../components/ButterchurnCanvas');
                renderPresetName = await getRandomPresetName();
                console.log(`[Render] Auto-selected visualizer preset: ${renderPresetName}`);
              } catch (e) {
                console.warn('[Render] Could not auto-select preset:', e);
              }
            }
            const vizVideoPath = await exportVisualizerVideo({
              audioUrl,
              duration: get().mediaDuration || 180,
              width: fmt === 'vertical' ? 1080 : fmt === 'square' ? 1080 : 1920,
              height: fmt === 'vertical' ? 1920 : fmt === 'square' ? 1080 : 1080,
              presetName: renderPresetName,
              fps: 30,
              onProgress: (p) => set({ processingProgress: Math.round(p * 0.3) }),
            });
            visualizerData = { ...visualizer, videoPath: vizVideoPath };
            console.log(`Visualizer pre-rendered for ${fmt}:`, vizVideoPath);
          } catch (vizErr) {
            console.error('Visualizer pre-render failed:', vizErr);
            console.warn('[Render] Visualizer export failed, rendering without visualizer');
            visualizerData = null;
          }
        }

        // Render this format
        try {
          const result = await get()._renderOneFormat(fmt, visualizerData, secondarySubData);
          results.push({ format: fmt, label: formatLabels[fmt], success: true, outputPath: result.outputPath });
          set({ outputPath: result.outputPath });
          console.log(`Render completed for ${fmt}:`, result.outputPath);
        } catch (err) {
          console.error(`Render failed for ${fmt}:`, err);
          results.push({ format: fmt, label: formatLabels[fmt], success: false, error: err.message });
        }

        if (isMulti) {
          set({ batchRenderResults: [...results] });
        }
      }

      // Done — finalize
      const { renderTimer, renderStats, renderStartTime } = get();
      const duration = Math.floor((Date.now() - renderStartTime) / 1000);

      if (renderTimer) clearInterval(renderTimer);

      set({
        isProcessing: false,
        currentStep: 'render',
        renderJobId: null,
        renderPolling: null,
        renderTimer: null,
        renderElapsedTime: duration,
        batchRenderActive: false,
        renderStats: {
          totalRenders: renderStats.totalRenders + formats.length,
          lastRenderDuration: duration,
        },
      });

      // Restore preview to first selected format
      set({ videoFormat: formats[0] });

      return results.length === 1 ? results[0] : results;
    } catch (error) {
      const { renderTimer } = get();
      if (renderTimer) clearInterval(renderTimer);

      set({
        error: error.response?.data?.error || error.message,
        isProcessing: false,
        renderTimer: null,
        batchRenderActive: false,
      });
      return null;
    }
  },

  // Cancel render
  cancelRender: async () => {
    const { renderJobId, renderPolling, renderTimer } = get();

    if (renderPolling) clearInterval(renderPolling);
    if (renderTimer) clearInterval(renderTimer);

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
      batchRenderActive: false,
    });
  },

  // Clear error
  clearError: () => set({ error: null }),
  setError: (error) => set({ error }),

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
    return modelSettings[language] || modelSettings['auto'] || 'turbo';
  },
  
  // Reset model settings to defaults
  resetModelSettings: () => set({
    modelSettings: {
      ar: 'medium',
      tr: 'turbo',
      en: 'turbo',
      es: 'turbo',
      fr: 'turbo',
      de: 'turbo',
      it: 'turbo',
      pt: 'turbo',
      ru: 'turbo',
      zh: 'medium',
      ja: 'medium',
      ko: 'medium',
      auto: 'turbo'
    }
  }),

  // Whisper advanced params
  setWhisperParam: (key, value) => set((state) => ({
    whisperParams: { ...state.whisperParams, [key]: value }
  })),
  resetWhisperParams: () => set({
    whisperParams: {
      beam_size: null, best_of: null, patience: null,
      no_speech_threshold: null, temperature: null,
      condition_on_previous_text: null, initial_prompt: null,
      suppress_blank: null,
    }
  }),

  // Vocal isolation
  setVocalIsolation: (enabled) => set({ vocalIsolation: enabled }),

  // Toggle a stem on/off (model auto-assigned per stem: EP317→vocals, UNWA→instrumental)
  toggleVocalStem: (stemName) => set((state) => {
    const current = state.vocalSelectedStems;
    const updated = current.includes(stemName)
      ? current.filter(s => s !== stemName)
      : [...current, stemName];
    // Must have at least one stem selected
    if (updated.length === 0) return state;
    return { vocalSelectedStems: updated };
  }),

  // Use a separated stem as the active media file
  useVocalStem: (stemUrl) => {
    const { mediaFile, originalMediaFile } = get();
    // Save original media file on first use
    const origFile = originalMediaFile || mediaFile;
    set({ mediaFile: stemUrl, originalMediaFile: origFile });
  },

  // Restore original media file
  restoreOriginalMedia: () => {
    const { originalMediaFile } = get();
    if (originalMediaFile) {
      set({ mediaFile: originalMediaFile, originalMediaFile: null });
    }
  },

  // ── Audio Mixer Actions ──────────────────────────────────────────────
  initAudioMixer: (stems, stemUrls, backendOriginalPath) => {
    // stems: { vocals: '/abs/path', instrumental: '/abs/path', ... }
    // stemUrls: { vocals: 'http://...', instrumental: 'http://...', ... }
    // backendOriginalPath: original file path from backend response (guaranteed)
    const { mediaFile, originalMediaPath, originalMediaFile } = get();
    const originalFilePath = originalMediaPath || originalMediaFile || backendOriginalPath || mediaFile;

    const STEM_META = {
      vocals: { label: 'Vocals', icon: '🎤', color: 'rgba(168, 85, 247, 0.8)' },
      instrumental: { label: 'Instrumental', icon: '🎵', color: 'rgba(59, 130, 246, 0.8)' },
      drums: { label: 'Drums', icon: '🥁', color: 'rgba(239, 68, 68, 0.8)' },
      bass: { label: 'Bass', icon: '🎸', color: 'rgba(34, 197, 94, 0.8)' },
      other: { label: 'Other', icon: '🎹', color: 'rgba(251, 191, 36, 0.8)' },
    };

    const tracks = {};

    // Add original media as master track (always first)
    if (originalFilePath) {
      // Build a playable URL for the original media
      let originalUrl = null;
      if (originalFilePath.includes('/') || originalFilePath.includes('\\')) {
        originalUrl = `http://localhost:5000/api/media/local?path=${encodeURIComponent(originalFilePath)}`;
      } else {
        const fileName = originalFilePath.split(/[\\/]/).pop();
        originalUrl = `http://localhost:5000/api/media/temp/${encodeURIComponent(fileName)}`;
      }

      tracks['original'] = {
        id: 'original',
        label: '▶️ Orjinal Ses',
        icon: '🔊',
        color: 'rgba(100, 116, 139, 0.8)',
        url: originalUrl,
        filePath: originalFilePath,
        volume: 1.0,
        muted: true,  // Muted by default — stems provide separated audio
        solo: false,
        waveformData: null,
        isOriginal: true,
      };
    }

    // Add all stems
    for (const [stemId, url] of Object.entries(stemUrls)) {
      const meta = STEM_META[stemId] || { label: stemId, icon: '🔊', color: 'rgba(150,150,150,0.8)' };
      tracks[stemId] = {
        id: stemId,
        label: meta.label,
        icon: meta.icon,
        color: meta.color,
        url,                              // Full HTTP URL for playback
        filePath: stems[stemId] || null,  // Absolute file path for backend render
        volume: 1.0,
        muted: false,
        solo: false,
        waveformData: null,
      };
    }

    set({ audioMixer: { enabled: true, tracks, masterVolume: 1.0, masterMuted: false, showTimelineTracks: true }, isPlaying: false });
    
    // Load waveforms for all tracks asynchronously
    get().loadTrackWaveforms(tracks);
  },

  // Load waveforms for all tracks
  loadTrackWaveforms: async (tracks) => {
    for (const [trackId, track] of Object.entries(tracks)) {
      if (!track.filePath) continue;
      try {
        const data = await fetchJson(`${API_URL}/waveform`, {
          method: 'POST',
          body: { file_path: track.filePath },
        });

        if (data.waveform) {
          get().setTrackWaveform(trackId, data.waveform);
        }
      } catch (err) {
        console.warn(`Failed to load waveform for ${trackId}:`, err);
      }
    }
  },

  setTrackVolume: (trackId, volume) => set((state) => ({
    audioMixer: {
      ...state.audioMixer,
      tracks: {
        ...state.audioMixer.tracks,
        [trackId]: { ...state.audioMixer.tracks[trackId], volume: Math.max(0, Math.min(1, volume)) },
      },
    },
  })),

  setTrackMuted: (trackId, muted) => set((state) => ({
    audioMixer: {
      ...state.audioMixer,
      tracks: {
        ...state.audioMixer.tracks,
        [trackId]: { ...state.audioMixer.tracks[trackId], muted },
      },
    },
  })),

  setTrackSolo: (trackId, solo) => set((state) => ({
    audioMixer: {
      ...state.audioMixer,
      tracks: {
        ...state.audioMixer.tracks,
        [trackId]: { ...state.audioMixer.tracks[trackId], solo },
      },
    },
  })),

  setTrackWaveform: (trackId, waveformData) => set((state) => ({
    audioMixer: {
      ...state.audioMixer,
      tracks: {
        ...state.audioMixer.tracks,
        [trackId]: { ...state.audioMixer.tracks[trackId], waveformData },
      },
    },
  })),

  toggleTimelineTracks: () => set((state) => ({
    audioMixer: { ...state.audioMixer, showTimelineTracks: !state.audioMixer.showTimelineTracks },
  })),

  setMasterVolume: (volume) => set((state) => ({
    audioMixer: { ...state.audioMixer, masterVolume: Math.max(0, Math.min(1, volume)) },
  })),

  setMasterMuted: (muted) => set((state) => ({
    audioMixer: { ...state.audioMixer, masterMuted: muted },
  })),

  resetAudioMixer: () => set({
    audioMixer: { enabled: false, tracks: {}, masterVolume: 1.0, masterMuted: false, showTimelineTracks: true },
  }),

  // Get mixer config for render (unmuted tracks with volumes)
  getMixerConfigForRender: () => {
    const { audioMixer } = get();
    if (!audioMixer.enabled) return null;
    const anySoloed = Object.values(audioMixer.tracks).some(t => t.solo);
    const tracks = [];
    for (const t of Object.values(audioMixer.tracks)) {
      const isMuted = audioMixer.masterMuted || t.muted || (anySoloed && !t.solo);
      if (isMuted || !t.filePath) continue;
      tracks.push({ path: t.filePath, volume: t.volume * audioMixer.masterVolume });
    }
    if (tracks.length === 0) return null;
    return { tracks, useMixer: true };
  },

  // Run full vocal separation for preview/listening
  // EP317 handles vocals, Resurrection UNWA handles instrumental — each runs only if its stem is selected
  separateVocals: async () => {
    const { mediaFile, originalMediaPath, originalMediaFile, vocalSelectedStems } = get();
    const filePath = originalMediaPath || originalMediaFile || mediaFile;
    if (!filePath) return;

    set({ vocalSeparating: true, vocalSeparationProgress: 0, vocalSeparationMessage: 'Starting...' });

    try {
      let separationSettled = false;
      let separationError = null;

      await streamJsonEvents(`${API_URL}/vocal-isolation/separate`, {
        file_path: filePath,
        selected_stems: vocalSelectedStems,
      }, (event) => {
        if (event.type === 'progress') {
          set({ vocalSeparationProgress: event.progress, vocalSeparationMessage: event.message || '' });
          return;
        }

        if (event.type === 'result' && event.success) {
          separationSettled = true;
          const stemUrls = {};
          for (const [name, url] of Object.entries(event.stems || {})) {
            stemUrls[name] = `http://localhost:5000${url}`;
          }

          const stemPaths = event.stems_paths || {};
          set({
            vocalSeparation: {
              stems: stemUrls,
              stemPaths,
              model_id: event.model_id,
              duration: event.duration,
              cached: event.cached,
            },
            vocalSeparating: false,
            vocalSeparationProgress: 100,
            vocalSeparationMessage: event.cached ? 'Loaded from cache' : `Completed (${event.duration?.toFixed(1)}s)`,
          });
          get().initAudioMixer(stemPaths, stemUrls, event.original_path);
          return;
        }

        if (event.type === 'error') {
          separationSettled = true;
          console.error('Vocal separation error:', event.error);
          set({ vocalSeparating: false, vocalSeparationMessage: `Error: ${event.error}` });
          separationError = new Error(event.error);
        }
      });

      if (separationError) {
        throw separationError;
      }

      if (!separationSettled) {
        throw new Error('Vocal separation stream ended unexpectedly');
      }
    } catch (error) {
      console.error('Vocal separation failed:', error);
      set({ vocalSeparating: false, vocalSeparationMessage: `Error: ${error.message}` });
    }
  },

  // Export settings
  setExportFormats: (formats) => set({ exportFormats: formats }),

  // Export lyrics in various formats
  exportLyrics: async (format) => {
    const { subtitles, originalMediaPath, language } = get();
    console.log('[SOURCE_PATH] exportLyrics -> real source path:', originalMediaPath);
    console.log('[SOURCE_PATH] exportLyrics -> format:', format);

    if (!subtitles || subtitles.length === 0) {
      throw new Error("No subtitles to export.");
    }
    if (!originalMediaPath) {
      throw new Error("Source media path is not available.");
    }

    set({ isLoading: true, loadingMessage: `Exporting to ${format.toUpperCase()}...` });

    try {
      const result = await fetchJson(`${API_URL}/export/lyrics`, {
        method: 'POST',
        body: {
          subtitles,
          format,
          source_path: originalMediaPath,
          original_name: get().originalFileName,
          language: language,
        },
      });

      set({ isLoading: false });
      return result;

    } catch (error) {
      console.error(`Export failed: ${error.message}`);
      set({ isLoading: false, error: `Export failed: ${error.message}` });
      throw error;
    }
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
        
        // Post-update state check
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
    vocalSeparation: null,
    vocalSeparating: false,
    vocalSeparationProgress: 0,
    vocalSeparationMessage: '',
    initialMediaPath: null,
    originalMediaFile: null,
    audioMixer: { enabled: false, tracks: {}, masterVolume: 1.0, masterMuted: false },
    detectedLanguage: null,
    secondarySubtitle: {
      enabled: false,
      targetLanguage: 'en',
      subtitles: [],
      style: {
        fontName: 'Arial',
        fontSize: 72,  // Updated for 4K rendering
        color: '#FFFFFF', // White by default
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

// Debug: Access store from console
if (typeof window !== 'undefined') {
  window.appStore = useAppStore;
}