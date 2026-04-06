/**
 * Color theme definitions for SubMaker.
 * Each theme overrides the CSS custom properties defined in globals.css.
 */

const THEMES = {
  'default': {
    label: 'Midnight Blue / Purple',
    preview: ['#1a1a2e', '#e94560', '#0f3460'],
    vars: {
      '--bg-primary':      '#1a1a2e',
      '--bg-secondary':    '#16213e',
      '--bg-tertiary':     '#0f3460',
      '--bg-card':         '#1f2544',
      '--bg-hover':        '#2a3158',
      '--text-primary':    '#ffffff',
      '--text-secondary':  '#a0aec0',
      '--text-muted':      '#718096',
      '--accent-primary':  '#e94560',
      '--accent-secondary':'#0f4c75',
      '--border-color':    '#2d3748',
      '--border-light':    '#4a5568',
    },
  },
  'black-green': {
    label: 'Black / Green',
    preview: ['#0d0d0d', '#00e676', '#1a1a1a'],
    vars: {
      '--bg-primary':      '#0d0d0d',
      '--bg-secondary':    '#141414',
      '--bg-tertiary':     '#1a1a1a',
      '--bg-card':         '#171717',
      '--bg-hover':        '#222222',
      '--text-primary':    '#e0e0e0',
      '--text-secondary':  '#8a8a8a',
      '--text-muted':      '#5c5c5c',
      '--accent-primary':  '#00e676',
      '--accent-secondary':'#004d40',
      '--border-color':    '#2a2a2a',
      '--border-light':    '#3a3a3a',
    },
  },
  'black-red': {
    label: 'Black / Red',
    preview: ['#0d0d0d', '#ff1744', '#1a1a1a'],
    vars: {
      '--bg-primary':      '#0d0d0d',
      '--bg-secondary':    '#141414',
      '--bg-tertiary':     '#1a1a1a',
      '--bg-card':         '#171717',
      '--bg-hover':        '#222222',
      '--text-primary':    '#e0e0e0',
      '--text-secondary':  '#8a8a8a',
      '--text-muted':      '#5c5c5c',
      '--accent-primary':  '#ff1744',
      '--accent-secondary':'#4a0012',
      '--border-color':    '#2a2a2a',
      '--border-light':    '#3a3a3a',
    },
  },
  'anthracite-blue': {
    label: 'Anthracite / Blue',
    preview: ['#1c1f26', '#2196f3', '#252830'],
    vars: {
      '--bg-primary':      '#1c1f26',
      '--bg-secondary':    '#22252e',
      '--bg-tertiary':     '#2a2e38',
      '--bg-card':         '#252830',
      '--bg-hover':        '#2e323c',
      '--text-primary':    '#e8eaed',
      '--text-secondary':  '#9aa0a6',
      '--text-muted':      '#6b7280',
      '--accent-primary':  '#2196f3',
      '--accent-secondary':'#0d47a1',
      '--border-color':    '#363a44',
      '--border-light':    '#464b56',
    },
  },
};

export default THEMES;
