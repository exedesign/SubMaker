/**
 * Keyboard shortcut matching utility.
 * Shortcut format: "Ctrl+Shift+ArrowUp", "Space", "S", etc.
 */

/**
 * Check if a KeyboardEvent matches a shortcut string.
 * @param {KeyboardEvent} e
 * @param {string} shortcutStr e.g. "Ctrl+Shift+ArrowUp"
 * @returns {boolean}
 */
export function matchesShortcut(e, shortcutStr) {
  if (!shortcutStr) return false;
  const parts = shortcutStr.split('+');
  const needCtrl = parts.includes('Ctrl');
  const needShift = parts.includes('Shift');
  const needAlt = parts.includes('Alt');
  // The actual key is the last part (or the part that isn't a modifier)
  const keyPart = parts.filter(p => !['Ctrl', 'Shift', 'Alt'].includes(p)).pop();

  if (e.ctrlKey !== needCtrl) return false;
  if (e.shiftKey !== needShift) return false;
  if (e.altKey !== needAlt) return false;

  // Match by e.key or e.code
  if (e.key === keyPart) return true;
  if (e.code === keyPart) return true;
  // Case-insensitive single char match
  if (keyPart.length === 1 && e.key.toLowerCase() === keyPart.toLowerCase()) return true;
  // "Key" prefix match: "S" → "KeyS"
  if (keyPart.length === 1 && e.code === `Key${keyPart.toUpperCase()}`) return true;

  return false;
}

/**
 * Pretty-print a shortcut string for display.
 * e.g. "Ctrl+ArrowUp" → "Ctrl + ↑"
 */
const KEY_DISPLAY = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
  Home: 'Home',
  End: 'End',
  Delete: 'Del',
  Backspace: '⌫',
  Tab: 'Tab',
};

export function displayShortcut(shortcutStr) {
  if (!shortcutStr) return '';
  return shortcutStr.split('+').map(p => KEY_DISPLAY[p] || p).join(' + ');
}

/**
 * Capture a keyboard event as a shortcut string.
 * @param {KeyboardEvent} e
 * @returns {string|null} shortcut string or null if only modifier pressed
 */
export function captureShortcut(e) {
  // Ignore lone modifier keys
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;

  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');

  // Normalize key name
  let key = e.key;
  // For single printable chars, uppercase
  if (key.length === 1 && /^[a-z]$/i.test(key)) {
    key = key.toUpperCase();
  }
  parts.push(key);
  return parts.join('+');
}
