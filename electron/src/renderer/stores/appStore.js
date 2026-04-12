/**
 * SubMaker App Store (Zustand)
 * Global state management
 */
import { create } from 'zustand';
import axios from 'axios';
import { fetchJson, fetchFormData, streamJsonEvents } from '../services/electronTransport';

const API_URL = window.API_URL || 'http://localhost:5000/api';

// Debounced auto-generate timer for tag/prompt changes
let _autoGenTimer = null;
const AUTO_GEN_DELAY = 600; // ms after last tag change before auto-generating

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
    type: 'color', // 'color', 'image', 'transparent', 'source'
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
  renderResolution: '4k', // '1k', '2k', '4k' — output resolution preset
  
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
    marginHorizontal: 20, // Horizontal margin (left/right)
    offsetX: 0, // Horizontal fine adjustment
    offsetY: 0, // Vertical fine adjustment
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
  logoInteractionTs: 0,
  
  // ==========================================================================
  // Secondary Subtitle (Dual Language) Settings
  // ==========================================================================
  secondarySubtitle: {
    enabled: true,
    targetLanguage: 'none',
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
      marginHorizontal: 20, // Horizontal margin (left/right)
      // Position control
      alignment: 5, // 1-9 grid (5 = center bottom)
      offsetX: 0, // Horizontal offset (-100 to +100)
      offsetY: 0, // Dikey kayma (-100 to +100)
    },
    isTranslating: false,
  },
  
  // App Settings
  settings: {
    colorTheme: 'default', // 'default' | 'black-green' | 'black-red' | 'anthracite-blue'
    gifProvider: 'tenor', // 'tenor' or 'giphy'
    dualSubtitleEnabled: true, // Module toggle in settings - enabled by default
    seekStep: 5, // Arrow key seek step in seconds
    cleanCacheOnStartup: true, // Clear temp/cache files when app starts

    // Audio Visualization Settings - Simplified and enabled by default
    audioVisualization: {
      showWaveform: true,      // Active by default - simple waveform
      waveformHeight: 110,     // Optimized height
      waveformColor: '#00FF88',// Bright green (more visible)
      enhancement: 1.2,        // Optimized boost
    },

    // Translation uses Qwen2.5 locally
  },

  // Keyboard shortcuts — keys are action IDs, values are key combo strings
  shortcuts: {
    // Global
    generateCoverArt: { keys: 'Ctrl+Enter', label: 'Generate Cover Art' },
    // Timeline / Playback
    seekBackward: { keys: 'ArrowLeft', label: 'Seek Backward' },
    seekForward: { keys: 'ArrowRight', label: 'Seek Forward' },
    goToStart: { keys: 'Home', label: 'Go to Start' },
    playPause: { keys: 'Space', label: 'Play / Pause' },
    toggleSplitMode: { keys: 'S', label: 'Toggle Split Mode' },
    exitSplitMode: { keys: 'Escape', label: 'Exit Split Mode' },
    // Playlist
    nextTrack: { keys: 'Ctrl+ArrowRight', label: 'Next Track' },
    prevTrack: { keys: 'Ctrl+ArrowLeft', label: 'Previous Track' },
    // Visualizer
    vizPrevPreset: { keys: 'ArrowUp', label: 'Previous Visualizer Preset' },
    vizNextPreset: { keys: 'ArrowDown', label: 'Next Visualizer Preset' },
    // Logo / Object
    logoMoveUp: { keys: 'ArrowUp', label: 'Move Object Up' },
    logoMoveDown: { keys: 'ArrowDown', label: 'Move Object Down' },
    logoMoveLeft: { keys: 'ArrowLeft', label: 'Move Object Left' },
    logoMoveRight: { keys: 'ArrowRight', label: 'Move Object Right' },
    logoMoveUpFast: { keys: 'Shift+ArrowUp', label: 'Move Object Up (10px)' },
    logoMoveDownFast: { keys: 'Shift+ArrowDown', label: 'Move Object Down (10px)' },
    logoMoveLeftFast: { keys: 'Shift+ArrowLeft', label: 'Move Object Left (10px)' },
    logoMoveRightFast: { keys: 'Shift+ArrowRight', label: 'Move Object Right (10px)' },
    logoLayerUp: { keys: 'Ctrl+ArrowUp', label: 'Object Layer Up' },
    logoLayerDown: { keys: 'Ctrl+ArrowDown', label: 'Object Layer Down' },
  },

  setShortcut: (actionId, newKeys) => set((state) => ({
    shortcuts: {
      ...state.shortcuts,
      [actionId]: { ...state.shortcuts[actionId], keys: newKeys },
    },
  })),

  resetShortcuts: () => set((state) => {
    // Reset to defaults
    const defaults = {
      generateCoverArt: { keys: 'Ctrl+Enter', label: 'Generate Cover Art' },
      seekBackward: { keys: 'ArrowLeft', label: 'Seek Backward' },
      seekForward: { keys: 'ArrowRight', label: 'Seek Forward' },
      goToStart: { keys: 'Home', label: 'Go to Start' },
      playPause: { keys: 'Space', label: 'Play / Pause' },
      toggleSplitMode: { keys: 'S', label: 'Toggle Split Mode' },
      exitSplitMode: { keys: 'Escape', label: 'Exit Split Mode' },
      nextTrack: { keys: 'Ctrl+ArrowRight', label: 'Next Track' },
      prevTrack: { keys: 'Ctrl+ArrowLeft', label: 'Previous Track' },
      vizPrevPreset: { keys: 'ArrowUp', label: 'Previous Visualizer Preset' },
      vizNextPreset: { keys: 'ArrowDown', label: 'Next Visualizer Preset' },
      logoMoveUp: { keys: 'ArrowUp', label: 'Move Object Up' },
      logoMoveDown: { keys: 'ArrowDown', label: 'Move Object Down' },
      logoMoveLeft: { keys: 'ArrowLeft', label: 'Move Object Left' },
      logoMoveRight: { keys: 'ArrowRight', label: 'Move Object Right' },
      logoMoveUpFast: { keys: 'Shift+ArrowUp', label: 'Move Object Up (10px)' },
      logoMoveDownFast: { keys: 'Shift+ArrowDown', label: 'Move Object Down (10px)' },
      logoMoveLeftFast: { keys: 'Shift+ArrowLeft', label: 'Move Object Left (10px)' },
      logoMoveRightFast: { keys: 'Shift+ArrowRight', label: 'Move Object Right (10px)' },
      logoLayerUp: { keys: 'Ctrl+ArrowUp', label: 'Object Layer Up' },
      logoLayerDown: { keys: 'Ctrl+ArrowDown', label: 'Object Layer Down' },
    };
    return { shortcuts: defaults };
  }),

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
  vocalAbortController: null, // AbortController for standalone vocal separation
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
  rightPanelTab: 'preview', // 'preview' or 'coverArt'

  // Cover Art Generator
  coverArt: {
    selectedModel: 'flux-klein',  // Active model ID
    tags: [],                // [{id, type, value, position, alternatives}]
    freeTextSegments: [],    // [{id, text, position}] — free text between tags
    rawPrompt: '',           // Qwen-generated base prompt
    editedPrompt: '',        // User-edited final prompt (tags + freeText merged)
    steps: 4,                // 4-12 (4 = fast, good quality with Turbo)
    cfgScale: 1.5,           // 0.0-2.0 (1.5 default)
    seed: -1,                // -1 = random
    seedLocked: false,       // Auto-lock after first generation
    lastUsedSeed: null,      // Last seed used for generation
    width: 512,
    height: 512,
    previewImage: null,      // Live preview base64 JPEG during generation
    systemPrompt: '',        // Custom Qwen system prompt (empty = use backend default)
    defaultSystemPrompt: '',  // Fetched from backend once, used for reset
    isAnalyzing: false,
    isGenerating: false,
    currentJobId: null,        // Active generation job ID for cancellation
    generatedImage: null,    // base64 PNG string
    history: [],             // [{image_base64, prompt, seed, timestamp}]
  },
  
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

  // Playlist (Karaoke Player)
  playlist: {
    tracks: [],            // [{ id, path, title, duration, syltEntries, subtitles }]
    currentTrackIndex: -1, // -1 = no track selected
    isActive: false,       // true when playlist is driving playback
    isPlaying: false,      // playlist-local play state
    playbackTime: 0,       // playlist-local playback time
  },

  // Batch Processing (multi-file sequential pipeline)
  batch: {
    queue: [],             // [{id, filePath, fileName, status, progress, step, error, results}]
    isRunning: false,
    currentIndex: -1,
    profile: null,         // active profile snapshot used during batch run
    savedProfiles: [],     // [{name, profile, createdAt}] persisted to localStorage
    abortController: null,
    stepMode: false,       // pause after transcription for manual review
    pausedForReview: false, // true when waiting for user to review/edit subtitles
    pausedItemId: null,    // id of the item currently paused for review
    _reviewResolve: null,  // internal: resolve function to resume after review
    audioSource: 'original', // 'original' | 'instrumental' — which audio to use in rendered output
    embedId3: false,          // embed ID3 lyrics into original MP3 for each batch item
    animationType: 'fade',    // 'none' | 'fade' | 'karaoke' | 'pop' | 'typewriter'
  },

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
    // If switching from video to non-video, reset 'source' background to 'color'
    const bgUpdate = (type !== 'video' && get().background.type === 'source')
      ? { background: { ...get().background, type: 'color', value: '#000000' } }
      : {};
    set({
      mediaFile: file,
      mediaFileType: type,
      originalMediaPath: resolvedOriginal,
      originalFileName: null, // reset; re-set by uploadFile if needed
      initialMediaPath: prev || resolvedOriginal,
      ...bgUpdate,
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

  // Cycle visualizer preset by direction (+1 = next, -1 = previous)
  cycleVisualizerPreset: async (direction) => {
    try {
      const { getPresetKeys } = await import('../components/ButterchurnCanvas');
      const keys = await getPresetKeys();
      if (!keys || keys.length === 0) return;
      const current = get().visualizer.presetName;
      let idx = keys.indexOf(current);
      if (idx === -1) idx = 0;
      else idx = (idx + direction + keys.length) % keys.length;
      set((state) => ({ visualizer: { ...state.visualizer, presetName: keys[idx] } }));
    } catch (e) {
      console.error('Failed to cycle preset:', e);
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
  setRenderResolution: (renderResolution) => set({ renderResolution }),
  
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

      // ALWAYS upload to backend (even if originalPath provided from Electron dialog)
      // This ensures consistent handling: all files go to /temp with UUID naming
      let fileToUpload = file;

      // If original file is too large or FormData empty, read from Electron's absolute path
      if (originalPath && isAbsolutePath(originalPath) && (!file.size || file.size === 0)) {
        console.log('Reading file from Electron path:', originalPath);
        // Use IPC to read file from Electron's file system
        if (window.electronAPI?.readFile) {
          try {
            const buffer = await window.electronAPI.readFile(originalPath);
            const fileName = file.name || originalPath.split(/[\\/]/).pop();
            fileToUpload = new File([buffer], fileName, { type: file.type });
            console.log('File read from Electron:', { size: buffer.length });
          } catch (readError) {
            console.warn('Failed to read file via IPC, trying FormData:', readError);
            // Fallback to empty File (will try FormData)
          }
        }
      }

      // Upload file content to backend
      const formData = new FormData();
      formData.append('file', fileToUpload);
      // Pass original disk path so backend can use it directly instead of saving to temp
      if (originalPath && isAbsolutePath(originalPath)) {
        formData.append('originalPath', originalPath);
      }

      console.log('Uploading to backend via FormData...', { 
        fileName: fileToUpload.name, 
        fileSize: fileToUpload.size,
        originalPath: originalPath || null,
      });
      const data = await fetchFormData(`${API_URL}/upload`, formData);
      console.log('Upload response:', data);

      // Backend returns the path where it saved the file
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

    const abortController = new AbortController();
    set({ renderAbortController: abortController });

    // If vocal isolation is enabled but stems don't exist yet, run separation first
    let hasVocalsTrack = audioMixer.enabled && audioMixer.tracks.vocals;

    // Verify cached vocal file still exists on disk (user may have deleted temp/)
    if (hasVocalsTrack) {
      const cachedPath = audioMixer.tracks.vocals.filePath;
      let fileExists = false;
      try {
        if (window.electronAPI?.fileExists) {
          fileExists = await window.electronAPI.fileExists(cachedPath);
        } else {
          // Browser fallback: ask backend
          const resp = await fetch(`http://localhost:5000/api/media/local?path=${encodeURIComponent(cachedPath)}`, { method: 'HEAD' });
          fileExists = resp.ok;
        }
      } catch { fileExists = false; }

      if (!fileExists) {
        console.log('[Transcribe] Cached vocal file missing, re-running separation:', cachedPath);
        set({ audioMixer: { enabled: false, tracks: {}, masterVolume: 1.0, masterMuted: false, showTimelineTracks: false } });
        hasVocalsTrack = false;
      }
    }

    if (vocalIsolation && !hasVocalsTrack) {
      console.log('[Transcribe] Vocal isolation enabled — running separation first...');
      set({
        isProcessing: true,
        processingStep: 'Running vocal isolation...',
        processingProgress: 0,
      });
      try {
        await get().separateVocals(abortController.signal);
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
      let lastKnownStep = 'Loading AI model...';

      const handleStreamEvent = (data) => {
        console.log('[Transcribe Stream] Event received:', data?.type, data);
        
        if (data.type === 'heartbeat') {
          heartbeatCount++;
          set({
            processingStep: `${lastKnownStep} (${heartbeatCount * 3}s)`,
          });
          return;
        }

        if (data.type === 'status') {
          lastKnownStep = data.message;
          heartbeatCount = 0;
          set({
            processingStep: data.message,
            processingProgress: data.progress,
          });
          return;
        }

        if (data.type === 'progress') {
          heartbeatCount = 0;
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
      streamJsonEvents(`${API_URL}/transcribe/stream`, requestBody, handleStreamEvent, abortController.signal).then(() => {
        if (streamSettled) return;
        // If cancelled, the signal is aborted — resolve silently
        if (abortController.signal.aborted) {
          set({ isProcessing: false, currentTranscriptText: '', renderAbortController: null });
          resolve(null);
          return;
        }

        set({
          error: 'Transcription connection closed unexpectedly',
          isProcessing: false,
        });
        reject(new Error('Stream ended unexpectedly'));
      }).catch((error) => {
        if (streamSettled) return;

        // If cancelled by user, resolve silently — don't fall back or show errors
        if (error.name === 'AbortError') {
          set({ isProcessing: false, currentTranscriptText: '', renderAbortController: null });
          resolve(null);
          return;
        }

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
  
  selectLogo: (id) => set({ selectedLogoId: id, logoInteractionTs: Date.now() }),
  bumpLogoInteraction: () => set({ logoInteractionTs: Date.now() }),

  moveLogoLayerUp: (id) => set((state) => {
    const idx = state.logos.findIndex(l => l.id === id);
    if (idx < 0 || idx >= state.logos.length - 1) return state;
    const newLogos = [...state.logos];
    [newLogos[idx], newLogos[idx + 1]] = [newLogos[idx + 1], newLogos[idx]];
    return { logos: newLogos };
  }),

  moveLogoLayerDown: (id) => set((state) => {
    const idx = state.logos.findIndex(l => l.id === id);
    if (idx <= 0) return state;
    const newLogos = [...state.logos];
    [newLogos[idx - 1], newLogos[idx]] = [newLogos[idx], newLogos[idx - 1]];
    return { logos: newLogos };
  }),

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
      'center-left': { x: 5, y: 50 },
      'center': { x: 50, y: 50 },
      'center-right': { x: 95, y: 50 },
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

  // Cache management
  cacheInfo: { sizeBytes: 0, fileCount: 0 },

  // System stats (GPU VRAM + CPU)
  systemStats: { cpuPercent: 0, gpuUsedMb: 0, gpuTotalMb: 0, gpuPercent: 0 },

  fetchSystemStats: async () => {
    try {
      const res = await fetch(`${API_URL}/system/stats`);
      if (res.ok) {
        const d = await res.json();
        set({ systemStats: {
          cpuPercent: d.cpu_percent || 0,
          gpuUsedMb: d.gpu_used_mb || 0,
          gpuTotalMb: d.gpu_total_mb || 0,
          gpuPercent: d.gpu_percent || 0,
        }});
      }
    } catch (e) { /* silent */ }
  },

  unloadAllModels: async () => {
    try {
      const res = await fetch(`${API_URL}/system/unload-all`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        return d.unloaded || [];
      }
    } catch (e) { console.warn('Unload all failed:', e); }
    return [];
  },

  fetchCacheInfo: async () => {
    try {
      const res = await fetch(`${API_URL}/temp/cache-info`);
      if (res.ok) {
        const data = await res.json();
        set({ cacheInfo: { sizeBytes: data.size_bytes, fileCount: data.file_count } });
      }
    } catch (e) { console.warn('Cache info fetch failed:', e); }
  },

  clearCache: async () => {
    try {
      const res = await fetch(`${API_URL}/temp/cleanup`, { method: 'POST' });
      if (res.ok) {
        set({ cacheInfo: { sizeBytes: 0, fileCount: 0 } });
      }
    } catch (e) { console.warn('Cache cleanup failed:', e); }
  },
  
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
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

  // ============================================================
  // Cover Art Actions
  // ============================================================
  setCoverArt: (updates) => set((s) => ({
    coverArt: { ...s.coverArt, ...updates }
  })),

  fetchDefaultSystemPrompt: async () => {
    try {
      const res = await fetch(`${API_URL}/cover-art/default-prompt`);
      const data = await res.json();
      if (data.success && data.defaultPrompt) {
        const { coverArt } = get();
        const updates = { defaultSystemPrompt: data.defaultPrompt };
        // Only set systemPrompt if it hasn't been customized yet
        if (!coverArt.systemPrompt) {
          updates.systemPrompt = data.defaultPrompt;
        }
        set(s => ({ coverArt: { ...s.coverArt, ...updates } }));
      }
    } catch (e) {
      console.error('[CoverArt] Failed to fetch default prompt:', e);
    }
  },

  analyzeLyrics: async () => {
    const { subtitles, coverArt } = get();
    const lyrics = subtitles.map(s => s.text).join('\n');
    if (!lyrics.trim()) return;

    set(s => ({ coverArt: { ...s.coverArt, isAnalyzing: true } }));
    try {
      const body = { lyrics };
      // Only send systemPrompt if user customized it (differs from backend default)
      if (coverArt.systemPrompt && coverArt.systemPrompt !== coverArt.defaultSystemPrompt) {
        body.systemPrompt = coverArt.systemPrompt;
      }

      const res = await fetch(`${API_URL}/cover-art/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        const tags = (data.tags || []).map((t, i) => ({ ...t, id: i + 1 }));
        set(s => ({
          coverArt: {
            ...s.coverArt,
            tags,
            rawPrompt: data.raw_prompt || '',
            editedPrompt: data.raw_prompt || '',
            isAnalyzing: false,
          }
        }));
        // Auto-generate first image after successful analysis
        setTimeout(() => get().generateCoverArt(), 100);
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (e) {
      console.error('[CoverArt] Analysis error:', e);
      set(s => ({ coverArt: { ...s.coverArt, isAnalyzing: false } }));
    }
  },

  generateCoverArt: async () => {
    const { coverArt, cancelCoverArt } = get();
    const prompt = coverArt.editedPrompt || coverArt.rawPrompt;
    if (!prompt.trim()) return;

    // If already generating, cancel the current job first
    if (coverArt.isGenerating && coverArt.currentJobId) {
      await cancelCoverArt();
      // Small delay to let backend process cancellation
      await new Promise(r => setTimeout(r, 200));
    }

    set(s => ({
      coverArt: { ...s.coverArt, isGenerating: true, currentJobId: null, previewImage: null },
      isProcessing: true,
      processingProgress: 0,
      processingStep: 'Starting cover art generation...',
    }));
    try {
      const seed = coverArt.seedLocked && coverArt.lastUsedSeed != null
        ? coverArt.lastUsedSeed
        : coverArt.seed;

      const res = await fetch(`${API_URL}/cover-art/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: coverArt.selectedModel,
          width: coverArt.width,
          height: coverArt.height,
          steps: coverArt.steps,
          cfgScale: coverArt.cfgScale,
          seed,
        }),
      });
      const startData = await res.json();
      if (!startData.success || !startData.job_id) {
        throw new Error(startData.error || 'Failed to start generation');
      }

      const jobId = startData.job_id;
      set(s => ({ coverArt: { ...s.coverArt, currentJobId: jobId } }));

      // Poll for progress
      const result = await new Promise((resolve, reject) => {
        let pollFailures = 0;
        const MAX_POLL_FAILURES = 60;

        const pollTimeout = setTimeout(() => {
          clearInterval(pollInterval);
          reject(new Error('Cover art generation timeout (10 min)'));
        }, 10 * 60 * 1000);

        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`${API_URL}/cover-art/generate/status/${jobId}`);

            // Handle HTTP errors (especially 404 = backend crashed/restarted)
            if (!statusRes.ok) {
              if (statusRes.status === 404) {
                clearInterval(pollInterval);
                clearTimeout(pollTimeout);
                reject(new Error('Generation job lost — backend may have restarted'));
                return;
              }
              // Other HTTP errors (500, etc)
              pollFailures++;
              if (pollFailures >= MAX_POLL_FAILURES) {
                clearInterval(pollInterval);
                clearTimeout(pollTimeout);
                reject(new Error('Generation polling failed'));
              }
              return;
            }

            const status = await statusRes.json();
            pollFailures = 0;

            set(s => ({
              processingProgress: status.progress || 0,
              processingStep: status.step || 'Generating cover art...',
              coverArt: {
                ...s.coverArt,
                previewImage: status.preview_image || s.coverArt.previewImage,
              },
            }));

            if (status.status === 'completed') {
              clearInterval(pollInterval);
              clearTimeout(pollTimeout);
              resolve(status);
            } else if (status.status === 'error') {
              clearInterval(pollInterval);
              clearTimeout(pollTimeout);
              reject(new Error(status.error || 'Generation failed'));
            } else if (status.status === 'cancelled') {
              clearInterval(pollInterval);
              clearTimeout(pollTimeout);
              reject(new Error('__CANCELLED__'));
            }
          } catch (err) {
            pollFailures++;
            if (pollFailures >= MAX_POLL_FAILURES) {
              clearInterval(pollInterval);
              clearTimeout(pollTimeout);
              reject(new Error('Generation polling failed'));
            }
          }
        }, 500);
      });

      const wasFirstGen = !get().coverArt.generatedImage;
      const elapsedSeconds = result.elapsed_seconds || null;
      set(s => ({
        coverArt: {
          ...s.coverArt,
          generatedImage: result.image_base64,
          lastUsedSeed: result.seed,
          seedLocked: wasFirstGen ? true : s.coverArt.seedLocked,
          isGenerating: false,
          previewImage: null,
          currentJobId: null,
          lastGenerationTime: elapsedSeconds,
          history: [
            { image_base64: result.image_base64, prompt, seed: result.seed, timestamp: Date.now() },
            ...s.coverArt.history,
          ].slice(0, 20),
        },
        isProcessing: false,
        processingProgress: 0,
        processingStep: '',
      }));

      // Auto-save PNG next to the original audio file
      try {
        const { originalMediaPath } = get();
        if (originalMediaPath) {
          const parts = originalMediaPath.replace(/\\/g, '/').split('/');
          const audioName = parts.pop().replace(/\.[^.]+$/, '');
          const audioDir = parts.join('/');
          await fetch(`${API_URL}/cover-art/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: result.image_base64,
              filename: audioName + '_cover',
              targetDir: audioDir,
            }),
          });
          console.log('[CoverArt] Auto-saved next to audio file');
        }
      } catch (autoSaveErr) {
        console.warn('[CoverArt] Auto-save failed:', autoSaveErr);
      }
    } catch (e) {
      if (e.message !== '__CANCELLED__') {
        console.error('[CoverArt] Generation error:', e);
      }
      set(s => ({
        coverArt: { ...s.coverArt, isGenerating: false, previewImage: null, currentJobId: null },
        isProcessing: false,
        processingProgress: 0,
        processingStep: '',
      }));
    }
  },

  cancelCoverArt: async () => {
    const { coverArt } = get();
    if (!coverArt.currentJobId) return;
    try {
      await fetch(`${API_URL}/cover-art/cancel/${coverArt.currentJobId}`, { method: 'POST' });
      console.log('[CoverArt] Cancel requested for job:', coverArt.currentJobId);
    } catch (e) {
      console.warn('[CoverArt] Cancel request failed:', e);
    }
  },

  updateCoverArtPrompt: (newPrompt) => {
    set(s => ({ coverArt: { ...s.coverArt, editedPrompt: newPrompt } }));
    // Auto-generate after prompt change (debounced) — skip if already generating
    const { coverArt } = get();
    if (coverArt.generatedImage && !coverArt.isGenerating) {
      clearTimeout(_autoGenTimer);
      _autoGenTimer = setTimeout(() => {
        // Re-check: don't fire if a generation started while we waited
        if (!get().coverArt.isGenerating) get().generateCoverArt();
      }, 1200);
    }
  },

  updateCoverArtTag: (tagId, newValue) => {
    set(s => {
      const tags = s.coverArt.tags.map(t =>
        t.id === tagId ? { ...t, value: newValue } : t
      );
      // Preserve text overlay macros from current prompt
      const textMacros = (s.coverArt.editedPrompt || '').match(/,?\s*text\[[^\]]+\](?:@[\w-]+)?(?::\w+)?/gi) || [];
      // Rebuild prompt from tags + preserved text macros
      let prompt = tags.map(t => t.value).filter(Boolean).join(', ');
      if (textMacros.length > 0) {
        const macroStr = textMacros.map(m => m.replace(/^,\s*/, '')).join(', ');
        prompt = prompt ? `${prompt}, ${macroStr}` : macroStr;
      }
      return { coverArt: { ...s.coverArt, tags, editedPrompt: prompt || s.coverArt.rawPrompt } };
    });
    // Auto-generate after tag change (debounced)
    const { coverArt } = get();
    if (coverArt.generatedImage) {
      clearTimeout(_autoGenTimer);
      _autoGenTimer = setTimeout(() => get().generateCoverArt(), AUTO_GEN_DELAY);
    }
  },

  removeCoverArtTag: (tagId) => {
    set(s => {
      const tags = s.coverArt.tags.filter(t => t.id !== tagId);
      // Preserve text overlay macros from current prompt
      const textMacros = (s.coverArt.editedPrompt || '').match(/,?\s*text\[[^\]]+\](?:@[\w-]+)?(?::\w+)?/gi) || [];
      let prompt = tags.map(t => t.value).filter(Boolean).join(', ');
      if (textMacros.length > 0) {
        const macroStr = textMacros.map(m => m.replace(/^,\s*/, '')).join(', ');
        prompt = prompt ? `${prompt}, ${macroStr}` : macroStr;
      }
      return { coverArt: { ...s.coverArt, tags, editedPrompt: prompt || s.coverArt.rawPrompt } };
    });
    // Auto-generate after tag removal (debounced)
    const { coverArt } = get();
    if (coverArt.generatedImage) {
      clearTimeout(_autoGenTimer);
      _autoGenTimer = setTimeout(() => get().generateCoverArt(), AUTO_GEN_DELAY);
    }
  },

  toggleSeedLock: () => {
    set(s => ({
      coverArt: {
        ...s.coverArt,
        seedLocked: !s.coverArt.seedLocked,
        seed: s.coverArt.seedLocked ? -1 : s.coverArt.seed,
      }
    }));
  },

  fetchCoverArtAlternatives: async (tagId) => {
    const { coverArt, subtitles } = get();
    const tag = coverArt.tags.find(t => t.id === tagId);
    if (!tag) return;

    const context = subtitles.map(s => s.text).join('\n').slice(0, 500);
    try {
      const res = await fetch(`${API_URL}/cover-art/alternatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagType: tag.type, tagValue: tag.value, context }),
      });
      const data = await res.json();
      if (data.success && data.alternatives) {
        set(s => ({
          coverArt: {
            ...s.coverArt,
            tags: s.coverArt.tags.map(t =>
              t.id === tagId ? { ...t, alternatives: data.alternatives } : t
            ),
          }
        }));
      }
    } catch (e) {
      console.error('[CoverArt] Alternatives fetch error:', e);
    }
  },

  saveCoverArt: async (filename) => {
    const { coverArt } = get();
    if (!coverArt.generatedImage) return;
    try {
      const res = await fetch(`${API_URL}/cover-art/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: coverArt.generatedImage, filename }),
      });
      const data = await res.json();
      if (data.success) return data.path;
    } catch (e) {
      console.error('[CoverArt] Save error:', e);
    }
    return null;
  },

  downloadCoverArt: () => {
    const { coverArt } = get();
    if (!coverArt.generatedImage) return;
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${coverArt.generatedImage}`;
    link.download = `cover_art_${coverArt.lastUsedSeed || Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  embedCoverArt: async () => {
    const { coverArt, originalMediaPath } = get();
    if (!coverArt.generatedImage || !originalMediaPath) return { success: false, error: 'No image or audio file' };
    try {
      const res = await fetch('http://localhost:5000/api/cover-art/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: coverArt.generatedImage,
          audioPath: originalMediaPath,
        }),
      });
      const data = await res.json();
      return data;
    } catch (e) {
      console.error('[CoverArt] Embed failed:', e);
      return { success: false, error: e.message };
    }
  },
  
  // Active render job
  renderJobId: null,
  renderPolling: null,
  renderAbortController: null,  // AbortController — aborted by cancelRender()
  
  // Internal: render a single format and return a Promise that resolves on completion
  // renderOptions: { audioPath, originalName, outputDir } — optional overrides for batch karaoke render
  _renderOneFormat: (format, visualizerData, secondarySubData, renderOptions = {}) => {
    const {
      mediaFile, originalMediaPath, subtitles, background,
      outputFormat, quality, style, animation, logos,
      sourceLanguage, detectedLanguage, renderResolution,
      getMixerConfigForRender,
    } = get();

    const mixerConfig = getMixerConfigForRender();

    // Always use the original imported media path for render.
    // mediaFile may have been replaced by a stem URL after vocal separation.
    const renderAudioPath = renderOptions.audioPath || originalMediaPath || mediaFile;

    return new Promise(async (resolve, reject) => {
      // Bail out immediately if cancelled during preparation phase
      if (!get().isProcessing) {
        reject(new Error('Render cancelled'));
        return;
      }
      try {
        // Debug: log logo data being sent to render
        if (logos?.length > 0) {
          console.log('[Render] Logos payload:', logos.map(l => ({ id: l.id, size: l.size, position: l.position, opacity: l.opacity, enabled: l.enabled })));
        }
        const response = await api.post('/render', {
          audio_path: renderAudioPath,
          original_name: renderOptions.originalName || get().originalFileName,
          media_type: get().mediaFileType || 'audio',
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
          render_resolution: renderResolution,
          output_dir: renderOptions.outputDir || null,
          is_karaoke: renderOptions.isKaraoke || false,
        });

        if (!response.data.success || !response.data.job_id) {
          throw new Error(response.data.error || 'Failed to start render job');
        }

        const jobId = response.data.job_id;
        set({ renderJobId: jobId });

        // Poll until completion — with timeout and retry limit
        let pollFailures = 0;
        const MAX_POLL_FAILURES = 60; // 30s at 500ms interval

        const pollTimeout = setTimeout(() => {
          clearInterval(pollInterval);
          set({ renderJobId: null, renderPolling: null });
          reject(new Error('Render job timeout (5 min)'));
        }, 5 * 60 * 1000);

        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await api.get(`/render/status/${jobId}`);
            pollFailures = 0; // Reset on success
            const status = statusRes.data;

            set({
              processingProgress: status.progress,
              processingStep: status.step || 'Processing...',
            });

            if (status.status === 'completed') {
              clearInterval(pollInterval);
              clearTimeout(pollTimeout);
              set({ renderJobId: null, renderPolling: null });
              resolve({ success: true, outputPath: status.output_path });
            } else if (status.status === 'error') {
              clearInterval(pollInterval);
              clearTimeout(pollTimeout);
              set({ renderJobId: null, renderPolling: null });
              reject(new Error(status.error || 'Render failed'));
            } else if (status.status === 'cancelled') {
              clearInterval(pollInterval);
              clearTimeout(pollTimeout);
              set({ renderJobId: null, renderPolling: null });
              reject(new Error('Render cancelled'));
            }
          } catch (err) {
            pollFailures++;
            console.error(`Polling error (${pollFailures}/${MAX_POLL_FAILURES}):`, err.message);
            if (pollFailures >= MAX_POLL_FAILURES) {
              clearInterval(pollInterval);
              clearTimeout(pollTimeout);
              set({ renderJobId: null, renderPolling: null });
              reject(new Error(`Render polling failed after ${pollFailures} attempts`));
            }
          }
        }, 500);

        set({ renderPolling: pollInterval });
      } catch (error) {
        reject(error);
      }
    });
  },

  // Render video — automatically handles multi-format if multiple selected
  // renderOptions: { audioPath, originalName, outputDir } — optional overrides (used by batch karaoke)
  render: async (renderOptions = {}) => {
    const {
      mediaFile, originalMediaPath, savedFileName, subtitles, selectedFormats, visualizer,
      checkBackendHealth, settings, secondarySubtitle,
    } = get();

    // Use renderOptions.audioPath if provided (batch karaoke), otherwise original media
    const sourceMediaPath = renderOptions.audioPath || originalMediaPath || mediaFile;

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
    const abortController = new AbortController();

    set({
      isProcessing: true,
      renderAbortController: abortController,
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
    const secondarySubData = secondarySubtitle.targetLanguage !== 'none' && secondarySubtitle.subtitles?.length > 0
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
            // Destroy preview visualizer before export to free GPU resources
            // and prevent WebGL context contention during batch items
            try {
              const { destroyPreviewViz } = await import('../components/ButterchurnCanvas');
              destroyPreviewViz();
            } catch (e) { /* preview may not be mounted */ }
            // Build audio URL — use local endpoint for absolute paths (including temp stems),
            // temp endpoint only for relative filenames (uploaded files in temp root)
            const isAbsPath = (p) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/');
            const baseUrl = API_URL.replace('/api', '');
            let audioUrl;
            if (isAbsPath(sourceMediaPath)) {
              // Absolute path (original file or instrumental stem in vocal_cache)
              audioUrl = `${baseUrl}/api/media/local?path=${encodeURIComponent(sourceMediaPath)}`;
            } else {
              // Relative filename — served from temp root
              const audioFilename = savedFileName || sourceMediaPath.split(/[\\/]/).pop();
              audioUrl = `${baseUrl}/api/media/temp/${encodeURIComponent(audioFilename)}`;
            }
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
              // Keep at 1080p — 4K WebGL rendering is too slow and causes context loss.
              // Backend upscale (1080p→4K) in filter_complex is cheap compared to
              // rendering 4× more pixels per frame in WebGL + readPixels + JPEG encode.
              width: fmt === 'vertical' ? 1080 : fmt === 'square' ? 1080 : 1920,
              height: fmt === 'vertical' ? 1920 : fmt === 'square' ? 1080 : 1080,
              presetName: renderPresetName,
              fps: 30,
              onProgress: (p) => set({ processingProgress: Math.round(p * 0.3) }),
              signal: abortController.signal,
            });
            visualizerData = { ...visualizer, videoPath: vizVideoPath };
            console.log(`Visualizer pre-rendered for ${fmt}:`, vizVideoPath);
          } catch (vizErr) {
            // AbortError = user cancelled — propagate upward
            if (vizErr.name === 'AbortError') throw vizErr;
            console.error('Visualizer pre-render failed:', vizErr.message);
            console.warn('[Render] Visualizer export failed (WebGL context loss?), rendering without visualizer');
            set({ processingStep: 'Visualizer unavailable, rendering without...' });
            visualizerData = null;
          }
        }

        // Check cancellation after potentially-long visualizer export
        if (!get().isProcessing) break;

        // Render this format
        try {
          const result = await get()._renderOneFormat(fmt, visualizerData, secondarySubData, renderOptions);
          results.push({ format: fmt, label: formatLabels[fmt], success: true, outputPath: result.outputPath });
          set({ outputPath: result.outputPath });
          console.log(`Render completed for ${fmt}:`, result.outputPath);
        } catch (err) {
          console.error(`Render failed for ${fmt}:`, err);
          if (err.response?.data) {
            console.error(`[Render] Backend error details:`, err.response.data);
            if (err.response.data.traceback) console.error(`[Render] Backend traceback:\n`, err.response.data.traceback);
          }
          results.push({ format: fmt, label: formatLabels[fmt], success: false, error: err.response?.data?.error || err.message });
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
      const { renderTimer, renderPolling } = get();
      if (renderTimer) clearInterval(renderTimer);
      if (renderPolling) clearInterval(renderPolling);

      // Don't show error message when user explicitly cancelled
      if (error.name === 'AbortError') {
        set({ isProcessing: false, renderAbortController: null, renderTimer: null, renderPolling: null, batchRenderActive: false });
        return null;
      }

      set({
        error: error.response?.data?.error || error.message,
        isProcessing: false,
        renderAbortController: null,
        renderTimer: null,
        renderPolling: null,
        batchRenderActive: false,
      });
      return null;
    }
  },

  // Cancel render — aborts everything in-flight: visualizer export, SSE streams, vocal separation
  cancelRender: async () => {
    const { renderJobId, renderPolling, renderTimer, renderAbortController } = get();

    // Abort all in-flight fetch/SSE connections (visualizer export, transcription, vocal separation)
    if (renderAbortController) {
      renderAbortController.abort();
    }

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
      renderAbortController: null,
      renderJobId: null,
      renderPolling: null,
      renderTimer: null,
      processingProgress: 0,
      processingStep: '',
      batchRenderActive: false,
      vocalSeparating: false,
      vocalSeparationMessage: 'Cancelled',
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
        label: '▶️ Original Audio',
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
  cancelVocalSeparation: () => {
    const { vocalAbortController } = get();
    if (vocalAbortController) {
      vocalAbortController.abort();
      set({ vocalAbortController: null, vocalSeparating: false, vocalSeparationMessage: 'Cancelled' });
    }
  },

  separateVocals: async (signal) => {
    const { mediaFile, originalMediaPath, originalMediaFile, vocalSelectedStems } = get();
    const filePath = originalMediaPath || originalMediaFile || mediaFile;
    if (!filePath) return;

    // Create abort controller for standalone separation if no AbortSignal provided
    let abortSignal = signal instanceof AbortSignal ? signal : undefined;
    if (!abortSignal) {
      const controller = new AbortController();
      set({ vocalAbortController: controller });
      abortSignal = controller.signal;
    }

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
            vocalAbortController: null,
            vocalSeparationMessage: event.cached ? 'Loaded from cache' : `Completed (${event.duration?.toFixed(1)}s)`,
          });
          get().initAudioMixer(stemPaths, stemUrls, event.original_path);
          return;
        }

        if (event.type === 'error') {
          separationSettled = true;
          console.error('Vocal separation error:', event.error);
          set({ vocalSeparating: false, vocalAbortController: null, vocalSeparationMessage: `Error: ${event.error}` });
          separationError = new Error(event.error);
        }
      }, abortSignal);

      if (separationError) {
        throw separationError;
      }

      if (!separationSettled) {
        throw new Error('Vocal separation stream ended unexpectedly');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        set({ vocalSeparating: false, vocalAbortController: null, vocalSeparationMessage: 'Cancelled' });
        return;
      }
      console.error('Vocal separation failed:', error);
      set({ vocalSeparating: false, vocalAbortController: null, vocalSeparationMessage: `Error: ${error.message}` });
    }
  },

  // Export settings
  setExportFormats: (formats) => set({ exportFormats: formats }),

  // Create karaoke MP3: instrumental stem + embedded SYLT lyrics → <name>-krk.mp3
  createKaraokeMp3: async () => {
    const { subtitles, originalMediaPath, originalFileName, audioMixer, language } = get();
    const instrumentalTrack = audioMixer?.tracks?.instrumental;

    if (!instrumentalTrack?.filePath) {
      throw new Error('Instrumental track not available. Please run vocal separation first.');
    }
    if (!subtitles || subtitles.length === 0) {
      throw new Error('No subtitles to embed.');
    }
    if (!originalMediaPath) {
      throw new Error('Original media path is not available.');
    }

    set({ isLoading: true, loadingMessage: 'Creating Karaoke MP3...' });
    try {
      const result = await fetchJson(`${API_URL}/export/karaoke-mp3`, {
        method: 'POST',
        body: {
          instrumental_path: instrumentalTrack.filePath,
          subtitles,
          original_path: originalMediaPath,
          original_name: originalFileName || null,
          language: language || 'und',
        },
      });
      set({ isLoading: false });
      return result;
    } catch (err) {
      set({ isLoading: false, error: `Karaoke MP3 failed: ${err.message}` });
      throw err;
    }
  },

  // Create vocal MP3: vocal stem + embedded SYLT lyrics → <name>-vocal.mp3
  createVocalMp3: async () => {
    const { subtitles, originalMediaPath, originalFileName, audioMixer, language } = get();
    const vocalsTrack = audioMixer?.tracks?.vocals;

    if (!vocalsTrack?.filePath) {
      throw new Error('Vocal track not available. Please run vocal separation first.');
    }
    if (!originalMediaPath) {
      throw new Error('Original media path is not available.');
    }

    set({ isLoading: true, loadingMessage: 'Creating Vocal MP3...' });
    try {
      const result = await fetchJson(`${API_URL}/export/vocal-mp3`, {
        method: 'POST',
        body: {
          vocal_path: vocalsTrack.filePath,
          subtitles: subtitles || [],
          original_path: originalMediaPath,
          original_name: originalFileName || null,
          language: language || 'und',
        },
      });
      set({ isLoading: false });
      return result;
    } catch (err) {
      set({ isLoading: false, error: `Vocal MP3 failed: ${err.message}` });
      throw err;
    }
  },

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
        source_lang: detectedLanguage || 'auto',
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

  // ==========================================================================
  // Playlist (Karaoke Player) Actions
  // ==========================================================================

  // Add MP3 to playlist — validates and optionally reads SYLT
  addToPlaylist: async (mp3Path) => {
    try {
      // 1. Validate MP3 and check for SYLT
      const valRes = await api.post('/playlist/validate-mp3', { path: mp3Path });
      const info = valRes.data;

      // 2. Read SYLT subtitles if available
      let subtitles = [];
      if (info.valid && info.sylt_entries > 0) {
        try {
          const syltRes = await api.post('/playlist/read-sylt', { path: mp3Path });
          subtitles = syltRes.data.subtitles || [];
        } catch {}
      }

      const track = {
        id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        path: mp3Path,
        title: info.title,
        duration: info.duration,
        syltEntries: info.sylt_entries || 0,
        hasSylt: info.valid,
        subtitles,
      };

      set((state) => ({
        playlist: {
          ...state.playlist,
          tracks: [...state.playlist.tracks, track],
        },
      }));
      return { success: true, track };
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      return { error: msg };
    }
  },

  removeFromPlaylist: (trackId) => set((state) => {
    const tracks = state.playlist.tracks.filter(t => t.id !== trackId);
    let idx = state.playlist.currentTrackIndex;
    // Adjust index if needed
    if (tracks.length === 0) {
      idx = -1;
    } else if (idx >= tracks.length) {
      idx = tracks.length - 1;
    }
    return {
      playlist: {
        ...state.playlist,
        tracks,
        currentTrackIndex: idx,
        isActive: tracks.length > 0 ? state.playlist.isActive : false,
      },
    };
  }),

  reorderPlaylist: (fromIndex, toIndex) => set((state) => {
    const tracks = [...state.playlist.tracks];
    const [moved] = tracks.splice(fromIndex, 1);
    tracks.splice(toIndex, 0, moved);
    // Adjust currentTrackIndex
    let idx = state.playlist.currentTrackIndex;
    if (idx === fromIndex) idx = toIndex;
    else if (fromIndex < idx && toIndex >= idx) idx--;
    else if (fromIndex > idx && toIndex <= idx) idx++;
    return { playlist: { ...state.playlist, tracks, currentTrackIndex: idx } };
  }),

  setCurrentTrack: (index) => set((state) => ({
    playlist: {
      ...state.playlist,
      currentTrackIndex: index,
      isActive: index >= 0,
      playbackTime: 0,
    },
  })),

  nextTrack: () => set((state) => {
    const { tracks, currentTrackIndex } = state.playlist;
    if (tracks.length === 0) return {};
    const next = (currentTrackIndex + 1) % tracks.length;
    return { playlist: { ...state.playlist, currentTrackIndex: next, playbackTime: 0 } };
  }),

  prevTrack: () => set((state) => {
    const { tracks, currentTrackIndex } = state.playlist;
    if (tracks.length === 0) return {};
    const prev = (currentTrackIndex - 1 + tracks.length) % tracks.length;
    return { playlist: { ...state.playlist, currentTrackIndex: prev, playbackTime: 0 } };
  }),

  setPlaylistPlaying: (isPlaying) => set((state) => ({
    playlist: { ...state.playlist, isPlaying },
  })),

  setPlaylistPlaybackTime: (time) => set((state) => ({
    playlist: { ...state.playlist, playbackTime: time },
  })),

  clearPlaylist: () => set((state) => ({
    playlist: {
      tracks: [],
      currentTrackIndex: -1,
      isActive: false,
      isPlaying: false,
      playbackTime: 0,
    },
  })),

  // Save playlist to localStorage (paths + metadata only, no subtitles)
  savePlaylist: () => {
    const { tracks } = get().playlist;
    const serializable = tracks.map(t => ({ path: t.path, title: t.title, duration: t.duration, syltEntries: t.syltEntries }));
    try {
      localStorage.setItem('submaker-playlist', JSON.stringify(serializable));
    } catch {}
  },

  // Load playlist from localStorage — re-validates & reads SYLT for each track
  loadPlaylist: async () => {
    try {
      const raw = localStorage.getItem('submaker-playlist');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved) || saved.length === 0) return;

      for (const item of saved) {
        if (!item.path) continue;
        await get().addToPlaylist(item.path);
      }
    } catch {}
  },
  
  // ==========================================================================
  // Batch Processing Actions
  // ==========================================================================

  addToBatchQueue: (filePaths) => {
    const isAbs = (p) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\') || p.startsWith('/');
    const validPaths = filePaths.filter(fp => {
      if (!fp || typeof fp !== 'string') {
        console.warn('[Batch] Rejected invalid path:', fp);
        return false;
      }
      if (!isAbs(fp)) {
        console.warn('[Batch] Rejected non-absolute path:', fp);
        return false;
      }
      return true;
    });
    if (!validPaths.length) {
      console.warn('[Batch] No valid absolute paths to add');
      return;
    }
    console.log('[Batch] Adding', validPaths.length, 'files:', validPaths);
    const items = validPaths.map(fp => ({
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      filePath: fp,
      fileName: fp.split(/[\\/]/).pop(),
      status: 'pending',
      progress: 0,
      step: '',
      error: null,
      results: { subtitles: [], outputPaths: [], exportPaths: [], karaokePath: null },
    }));
    set(s => ({ batch: { ...s.batch, queue: [...s.batch.queue, ...items] } }));
  },

  removeFromBatchQueue: (id) => set(s => ({
    batch: { ...s.batch, queue: s.batch.queue.filter(q => q.id !== id) }
  })),

  reorderBatchQueue: (fromIdx, toIdx) => set(s => {
    const q = [...s.batch.queue];
    const [item] = q.splice(fromIdx, 1);
    q.splice(toIdx, 0, item);
    return { batch: { ...s.batch, queue: q } };
  }),

  clearBatchQueue: () => set(s => ({
    batch: { ...s.batch, queue: [], currentIndex: -1 }
  })),

  updateBatchItem: (id, updates) => set(s => ({
    batch: {
      ...s.batch,
      queue: s.batch.queue.map(q => q.id === id ? { ...q, ...updates } : q),
    }
  })),

  // Capture current store settings as a batch profile
  captureBatchProfile: () => {
    const s = get();
    return {
      steps: {
        vocalSeparation: true,
        transcription: true,
        translation: s.secondarySubtitle.targetLanguage !== 'none',
        render: true,
        exportLyrics: false,
        embedId3: get().batch.embedId3 || false,
        createKaraoke: false,
      },
      sourceLanguage: s.sourceLanguage,
      secondaryLanguage: s.secondarySubtitle.targetLanguage,
      modelSettings: { ...s.modelSettings },
      whisperParams: { ...s.whisperParams },
      vocalIsolation: s.vocalIsolation,
      vocalSelectedStems: [...s.vocalSelectedStems],
      style: { ...s.style },
      animation: { ...s.animation, type: get().batch.animationType || s.animation.type },
      secondaryStyle: { ...s.secondarySubtitle.style },
      videoFormat: s.videoFormat,
      selectedFormats: [...s.selectedFormats],
      outputFormat: s.outputFormat,
      quality: s.quality,
      renderResolution: s.renderResolution,
      background: { ...s.background },
      visualizer: { ...s.visualizer },
      logos: s.logos.map(l => ({ ...l })),
      exportFormats: [...s.exportFormats],
      dualSubtitleEnabled: s.settings.dualSubtitleEnabled,
      audioSource: s.batch.audioSource || 'original',
    };
  },

  saveBatchProfile: (name) => {
    // Save the active batch profile (with user's current toggle states)
    const active = get().batch.profile || get().captureBatchProfile();
    const entry = { name, profile: { ...active }, createdAt: new Date().toISOString() };
    const saved = get().batch.savedProfiles.filter(p => p.name !== name);
    saved.push(entry);
    set(s => ({ batch: { ...s.batch, savedProfiles: saved } }));
    try { localStorage.setItem('submaker-batch-profiles', JSON.stringify(saved)); } catch {}
  },

  loadBatchProfiles: () => {
    try {
      const raw = localStorage.getItem('submaker-batch-profiles');
      if (raw) {
        const profiles = JSON.parse(raw);
        set(s => ({ batch: { ...s.batch, savedProfiles: profiles } }));
      }
    } catch {}
  },

  loadBatchProfile: (name) => {
    const entry = get().batch.savedProfiles.find(p => p.name === name);
    if (entry) {
      set(s => ({ batch: { ...s.batch, profile: entry.profile } }));
    }
  },

  deleteBatchProfile: (name) => {
    const saved = get().batch.savedProfiles.filter(p => p.name !== name);
    set(s => ({ batch: { ...s.batch, savedProfiles: saved } }));
    try { localStorage.setItem('submaker-batch-profiles', JSON.stringify(saved)); } catch {}
  },

  setBatchProfile: (profile) => set(s => ({ batch: { ...s.batch, profile } })),

  setBatchStepEnabled: (stepKey, enabled) => set(s => {
    const profile = s.batch.profile || get().captureBatchProfile();
    return {
      batch: {
        ...s.batch,
        profile: { ...profile, steps: { ...profile.steps, [stepKey]: enabled } },
      }
    };
  }),

  // Apply a batch profile to the store (restore settings before processing)
  _applyBatchProfile: (profile) => {
    // Ensure instrumental stem is included when audioSource is instrumental
    let stems = [...profile.vocalSelectedStems];
    if (profile.audioSource === 'instrumental' && !stems.includes('instrumental')) {
      stems.push('instrumental');
    }

    set({
      sourceLanguage: profile.sourceLanguage,
      detectedLanguage: null, // Reset so previous item's detected language doesn't leak
      modelSettings: { ...profile.modelSettings },
      whisperParams: { ...profile.whisperParams },
      vocalIsolation: true, // Always enable in batch — vocal isolation is mandatory
      vocalSelectedStems: stems,
      style: { ...profile.style },
      animation: { ...profile.animation },
      videoFormat: profile.videoFormat || 'horizontal',
      selectedFormats: [...profile.selectedFormats],
      outputFormat: profile.outputFormat,
      quality: profile.quality,
      renderResolution: profile.renderResolution,
      background: { ...profile.background },
      visualizer: { ...profile.visualizer },
      logos: profile.logos.map(l => ({ ...l })),
      exportFormats: [...profile.exportFormats],
    });
    set(s => ({
      settings: { ...s.settings, dualSubtitleEnabled: profile.secondaryLanguage !== 'none' },
      secondarySubtitle: {
        ...s.secondarySubtitle,
        enabled: profile.secondaryLanguage !== 'none',
        targetLanguage: profile.secondaryLanguage,
        style: { ...profile.secondaryStyle },
        subtitles: [],
      },
    }));
  },

  // Main batch orchestrator
  startBatch: async () => {
    const state = get();
    const queue = state.batch.queue.filter(q => q.status === 'pending' || q.status === 'failed');
    if (!queue.length) return;

    // Snapshot all current settings directly from the main UI
    const profile = state.captureBatchProfile();
    console.log('[Batch] Captured profile steps:', JSON.stringify(profile.steps));
    console.log('[Batch] vocalIsolation:', profile.vocalIsolation, '| secondaryLanguage:', profile.secondaryLanguage);
    const abortController = new AbortController();

    set(s => ({
      batch: {
        ...s.batch,
        isRunning: true,
        abortController,
        profile,
        // Reset failed items to pending
        queue: s.batch.queue.map(q =>
          q.status === 'failed' ? { ...q, status: 'pending', error: null, progress: 0, step: '' } : q
        ),
      }
    }));

    const pendingIds = get().batch.queue.filter(q => q.status === 'pending').map(q => q.id);

    for (let i = 0; i < pendingIds.length; i++) {
      if (abortController.signal.aborted) break;

      const itemId = pendingIds[i];
      const item = get().batch.queue.find(q => q.id === itemId);
      if (!item || item.status !== 'pending') continue;

      set(s => ({ batch: { ...s.batch, currentIndex: i } }));
      get().updateBatchItem(itemId, { status: 'processing', progress: 0, step: 'Preparing...' });

      try {
        // 1. Reset project and apply profile
        get().resetProject();
        get()._applyBatchProfile(profile);

        // 2. Load file — validate absolute path
        const isAbsPath = /^[a-zA-Z]:[\\/]/.test(item.filePath) || item.filePath.startsWith('\\') || item.filePath.startsWith('/');
        if (!isAbsPath) {
          throw new Error(`Invalid path (not absolute): ${item.filePath}`);
        }
        get().updateBatchItem(itemId, { step: 'Loading file...', progress: 5 });
        console.log('[Batch] Loading file:', item.filePath);
        get().setMediaFile(item.filePath, 'audio', item.filePath);
        set({ originalFileName: item.fileName });

        // Re-apply language settings after setMediaFile (which resets some state)
        set({
          sourceLanguage: profile.sourceLanguage,
        });
        set(s => ({
          secondarySubtitle: {
            ...s.secondarySubtitle,
            enabled: profile.secondaryLanguage !== 'none',
            targetLanguage: profile.secondaryLanguage,
          },
          settings: { ...s.settings, dualSubtitleEnabled: profile.secondaryLanguage !== 'none' },
        }));
        console.log('[Batch] Language settings applied — source:', profile.sourceLanguage, '| secondary:', profile.secondaryLanguage);

        const results = { subtitles: [], outputPaths: [], exportPaths: [], karaokePath: null };

        // Global progress forwarder — maps processingProgress to batch item progress
        // Phase ranges in batch item: vocal=5-20, transcribe=20-50, translate=50-55, render=55-85
        let currentPhase = 'idle';
        let lastForwardedProg = 0;
        const unsubProgress = useAppStore.subscribe((state) => {
          const pp = state.processingProgress;
          const ps = state.processingStep;
          if (pp <= 0) return;

          let batchProg = 0;
          if (currentPhase === 'vocal') {
            batchProg = 5 + Math.round(pp * 0.15); // 5-20
          } else if (currentPhase === 'transcribe') {
            batchProg = 20 + Math.round(pp * 0.30); // 20-50
          } else if (currentPhase === 'render') {
            batchProg = 55 + Math.round(pp * 0.30); // 55-85
          } else {
            return;
          }

          if (batchProg > lastForwardedProg) {
            lastForwardedProg = batchProg;
            const step = ps || (currentPhase === 'vocal' ? 'Vocal isolation...' :
              currentPhase === 'transcribe' ? 'Transcribing...' : 'Rendering...');
            get().updateBatchItem(itemId, { progress: Math.min(batchProg, 85), step });
          }
        });

        try {
        // 3. Vocal separation (mandatory in batch)
        if (profile.steps.vocalSeparation) {
          if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          currentPhase = 'vocal';
          get().updateBatchItem(itemId, { step: 'Vocal isolation...', progress: 5 });
          await get().separateVocals(abortController.signal);
          currentPhase = 'idle';

          // Vocal separation is mandatory — if it failed, abort this item
          const sepResult = get().vocalSeparation;
          if (!sepResult) {
            throw new Error('Vocal separation failed — cannot continue without clean vocals');
          }
        }

        // 4. Transcription
        if (profile.steps.transcription) {
          if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          currentPhase = 'transcribe';
          get().updateBatchItem(itemId, { step: 'Transcribing...', progress: 20 });
          await get().transcribe();
          currentPhase = 'idle';
          results.subtitles = [...get().subtitles];
        }

        // 4b. Step Mode — pause for user review after transcription
        if (get().batch.stepMode) {
          if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          get().updateBatchItem(itemId, { step: 'Waiting for review...', progress: 50 });
          // Switch UI to edit step so user can see/edit subtitles
          set({ currentStep: 'edit' });
          await new Promise((resolve) => {
            set(s => ({
              batch: { ...s.batch, pausedForReview: true, pausedItemId: itemId, _reviewResolve: resolve }
            }));
          });
          // User clicked "Continue" — refresh subtitles in case they edited
          if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          results.subtitles = [...get().subtitles];
        }

        // 5. Translation (secondary subtitle) — only if a target language is selected
        if (profile.secondaryLanguage && profile.secondaryLanguage !== 'none') {
          if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          get().updateBatchItem(itemId, { step: 'Translating...', progress: 50 });
          await get().translateToSecondary();
        }

        // 6. Render video
        if (profile.steps.render) {
          if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          currentPhase = 'render';
          get().updateBatchItem(itemId, { step: 'Rendering...', progress: 55 });

          // Disable audio mixer for batch render — vocal separation enables it
          // automatically via initAudioMixer(), but batch should use explicit audio source
          set({ audioMixer: { enabled: false, tracks: {}, masterVolume: 1.0, masterMuted: false } });

          if (profile.audioSource === 'instrumental') {
            // Karaoke mode: render with instrumental stem audio, save as -krk
            let instrumentalPath = get().vocalSeparation?.stemPaths?.instrumental;

            // If instrumental stem missing, re-run vocal separation with instrumental included
            if (!instrumentalPath) {
              console.warn('[Batch] Instrumental stem missing — re-running vocal separation with instrumental stem');
              const curStems = get().vocalSelectedStems;
              if (!curStems.includes('instrumental')) {
                set({ vocalSelectedStems: [...curStems, 'instrumental'] });
              }
              get().updateBatchItem(itemId, { step: 'Extracting instrumental...', progress: 56 });
              currentPhase = 'vocal';
              await get().separateVocals(abortController.signal);
              currentPhase = 'render';
              instrumentalPath = get().vocalSeparation?.stemPaths?.instrumental;
            }

            if (!instrumentalPath) {
              throw new Error('Instrumental stem not available — vocal isolation may have failed');
            }

            const originalDir = item.filePath.replace(/[\\/][^\\/]+$/, '');
            const originalNameNoExt = item.fileName.replace(/\.[^.]+$/, '');

            console.log('[Batch] Karaoke render with instrumental:', instrumentalPath);
            console.log('[Batch] Output dir:', originalDir, 'name:', originalNameNoExt);

            const renderResult = await get().render({
              audioPath: instrumentalPath,
              originalName: originalNameNoExt,
              outputDir: originalDir,
              isKaraoke: true,
            });
            currentPhase = 'idle';
            if (renderResult) {
              const arr = Array.isArray(renderResult) ? renderResult : [renderResult];
              results.outputPaths = arr.filter(r => r.success).map(r => r.outputPath);
            }
          } else {
            // Normal mode: render with original media
            console.log('[Batch] Rendering with original audio:', get().originalMediaPath);
            const renderResult = await get().render();
            currentPhase = 'idle';
            if (renderResult) {
              const arr = Array.isArray(renderResult) ? renderResult : [renderResult];
              results.outputPaths = arr.filter(r => r.success).map(r => r.outputPath);
            }
          }
        }

        // 7. Export lyrics
        if (profile.steps.exportLyrics && profile.exportFormats?.length) {
          if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          get().updateBatchItem(itemId, { step: 'Exporting lyrics...', progress: 85 });
          for (const fmt of profile.exportFormats) {
            try {
              const expResult = await get().exportLyrics(fmt);
              if (expResult?.output_path) results.exportPaths.push(expResult.output_path);
            } catch (e) { console.warn(`[Batch] Export ${fmt} failed:`, e.message); }
          }
        }

        // 8. Embed ID3
        if (profile.steps.embedId3) {
          if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          get().updateBatchItem(itemId, { step: 'Embedding ID3 lyrics...', progress: 90 });
          try {
            const idResult = await get().exportLyrics('id3');
            if (idResult?.output_path) results.exportPaths.push(idResult.output_path);
          } catch (e) { console.warn('[Batch] ID3 embed failed:', e.message); }
        }

        // 9. Create karaoke MP3
        if (profile.steps.createKaraoke) {
          if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          get().updateBatchItem(itemId, { step: 'Creating karaoke MP3...', progress: 95 });
          try {
            const karResult = await get().createKaraokeMp3();
            if (karResult?.karaoke_path) results.karaokePath = karResult.karaoke_path;
          } catch (e) { console.warn('[Batch] Karaoke creation failed:', e.message); }
        }

        get().updateBatchItem(itemId, { status: 'completed', progress: 100, step: 'Done', results });

        } finally {
          unsubProgress();
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          get().updateBatchItem(itemId, { status: 'pending', progress: 0, step: 'Cancelled' });
          break;
        }
        console.error(`[Batch] Item ${item.fileName} failed:`, err);
        get().updateBatchItem(itemId, {
          status: 'failed',
          step: 'Failed',
          error: err.message || 'Unknown error',
        });
      }
    }

    // Batch complete — clean up
    get().resetProject();
    set(s => ({
      batch: { ...s.batch, isRunning: false, currentIndex: -1, abortController: null, pausedForReview: false, pausedItemId: null, _reviewResolve: null }
    }));
  },

  cancelBatch: () => {
    const { batch } = get();
    // If paused for review, resolve the pause promise so the loop can exit
    if (batch._reviewResolve) batch._reviewResolve();
    if (batch.abortController) batch.abortController.abort();
    // Also cancel any in-flight render/transcription
    get().cancelRender();
    set(s => ({
      batch: { ...s.batch, isRunning: false, currentIndex: -1, abortController: null, pausedForReview: false, pausedItemId: null, _reviewResolve: null }
    }));
  },

  setStepMode: (enabled) => set(s => ({
    batch: { ...s.batch, stepMode: enabled }
  })),

  setBatchAudioSource: (source) => set(s => ({
    batch: { ...s.batch, audioSource: source }
  })),

  setBatchEmbedId3: (enabled) => set(s => ({
    batch: { ...s.batch, embedId3: enabled }
  })),

  setBatchAnimationType: (type) => set(s => ({
    batch: { ...s.batch, animationType: type }
  })),

  resumeBatch: () => {
    const { batch } = get();
    if (batch._reviewResolve) {
      batch._reviewResolve();
      set(s => ({ batch: { ...s.batch, pausedForReview: false, pausedItemId: null, _reviewResolve: null } }));
    }
  },

  // Reset project
  resetProject: () => {
    // Clean up any running intervals/controllers before resetting
    const { renderPolling, renderTimer } = get();
    if (renderPolling) clearInterval(renderPolling);
    if (renderTimer) clearInterval(renderTimer);

    set({
      currentStep: 'upload',
      mediaFile: null,
      mediaFileType: null,
      mediaDuration: 0,
      subtitles: [],
      selectedSubtitleId: null,
      outputPath: null,
      error: null,
      isProcessing: false,
      processingProgress: 0,
      processingStep: '',
      currentTranscriptText: '',
      renderJobId: null,
      renderPolling: null,
      renderTimer: null,
      renderAbortController: null,
      renderElapsedTime: 0,
      batchRenderActive: false,
      background: { type: 'color', value: '#000000', imagePath: null },
      vocalSeparation: null,
      vocalSeparating: false,
      vocalSeparationProgress: 0,
      vocalSeparationMessage: '',
      initialMediaPath: null,
      originalMediaFile: null,
      originalMediaPath: null,
      originalFileName: null,
      audioMixer: { enabled: false, tracks: {}, masterVolume: 1.0, masterMuted: false },
      detectedLanguage: null,
      secondarySubtitle: {
        enabled: false,
        targetLanguage: 'none',
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
      playlist: {
        tracks: [],
        currentTrackIndex: -1,
        isActive: false,
        isPlaying: false,
        playbackTime: 0,
      },
    });
  },
}));

// ============================================================================
// Persistence — save UI preferences to localStorage, restore on startup
// ============================================================================
const STORAGE_KEY = 'submaker-ui-preferences';

/** Extract only the UI-related state worth persisting (no files, no transient flags). */
function pickPersistState(s) {
  return {
    settings: s.settings,
    modelSettings: s.modelSettings,
    whisperParams: s.whisperParams,
    style: s.style,
    animation: s.animation,
    secondarySubtitle: {
      targetLanguage: s.secondarySubtitle.targetLanguage,
      style: s.secondarySubtitle.style,
    },
    vocalIsolation: s.vocalIsolation,
    vocalSelectedStems: s.vocalSelectedStems,
    videoFormat: s.videoFormat,
    selectedFormats: s.selectedFormats,
    outputFormat: s.outputFormat,
    quality: s.quality,
    renderResolution: s.renderResolution,
    sourceLanguage: s.sourceLanguage,
    background: { type: s.background.type, value: s.background.value },
    visualizer: {
      enabled: s.visualizer.enabled,
      presetName: s.visualizer.presetName,
      opacity: s.visualizer.opacity,
      autoCycle: s.visualizer.autoCycle,
      autoCycleInterval: s.visualizer.autoCycleInterval,
      sensitivity: s.visualizer.sensitivity,
    },
    previewMode: s.previewMode,
    batch: {
      stepMode: s.batch.stepMode,
      audioSource: s.batch.audioSource,
      embedId3: s.batch.embedId3,
      animationType: s.batch.animationType,
    },
  };
}

/** Debounced save (300ms) */
let _saveTimer = null;
function debouncedSave(state) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pickPersistState(state)));
    } catch { /* quota exceeded — ignore */ }
  }, 300);
}

// Subscribe to store changes and persist
useAppStore.subscribe((state) => debouncedSave(state));

// Hydrate on first load
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const saved = JSON.parse(raw);
    const cur = useAppStore.getState();
    useAppStore.setState({
      settings: { ...cur.settings, ...saved.settings,
        audioVisualization: { ...cur.settings.audioVisualization, ...(saved.settings?.audioVisualization || {}) },
      },
      modelSettings: { ...cur.modelSettings, ...saved.modelSettings },
      whisperParams: { ...cur.whisperParams, ...saved.whisperParams },
      style: { ...cur.style, ...saved.style },
      animation: { ...cur.animation, ...saved.animation },
      secondarySubtitle: {
        ...cur.secondarySubtitle,
        targetLanguage: saved.secondarySubtitle?.targetLanguage ?? cur.secondarySubtitle.targetLanguage,
        style: { ...cur.secondarySubtitle.style, ...(saved.secondarySubtitle?.style || {}) },
      },
      vocalIsolation: saved.vocalIsolation ?? cur.vocalIsolation,
      vocalSelectedStems: saved.vocalSelectedStems ?? cur.vocalSelectedStems,
      videoFormat: saved.videoFormat ?? cur.videoFormat,
      selectedFormats: saved.selectedFormats ?? cur.selectedFormats,
      outputFormat: saved.outputFormat ?? cur.outputFormat,
      quality: saved.quality ?? cur.quality,
      renderResolution: saved.renderResolution ?? cur.renderResolution,
      sourceLanguage: saved.sourceLanguage ?? cur.sourceLanguage,
      background: { ...cur.background, ...(saved.background || {}) },
      visualizer: { ...cur.visualizer, ...(saved.visualizer || {}) },
      previewMode: saved.previewMode ?? cur.previewMode,
      batch: {
        ...cur.batch,
        stepMode: saved.batch?.stepMode ?? cur.batch.stepMode,
        audioSource: saved.batch?.audioSource ?? cur.batch.audioSource,
        embedId3: saved.batch?.embedId3 ?? cur.batch.embedId3,
        animationType: saved.batch?.animationType ?? cur.batch.animationType,
      },
    });
  }
} catch { /* corrupted data — start fresh */ }

// Debug: Access store from console
if (typeof window !== 'undefined') {
  window.appStore = useAppStore;
}