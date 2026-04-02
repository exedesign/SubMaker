/**
 * Unified Butterchurn Preset Loader
 * Loads and merges presets from multiple sources:
 * - butterchurn-presets (v3 official: base, extra, image)
 * - butterchurn-presets-baron (~762 curated Milkdrop presets)
 */

let allPresetsCache = null;
let presetKeysCache = null;
let categoriesCache = null;

function extractPresets(mod) {
  const src = mod.default || mod;
  if (typeof src.getPresets === 'function') return src.getPresets();
  if (typeof src === 'function') {
    try { return src(); } catch { return src; }
  }
  return src;
}

/**
 * Load all presets from all sources, merged and deduplicated.
 * Returns { presets, keys, categories }
 */
export async function loadAllPresets() {
  if (allPresetsCache) {
    return { presets: allPresetsCache, keys: presetKeysCache, categories: categoriesCache };
  }

  const merged = {};
  const categories = {
    base: [],
    extra: [],
    image: [],
    baron: [],
  };

  // Load official butterchurn-presets (base = default import)
  try {
    const baseMod = await import('butterchurn-presets');
    const basePresets = extractPresets(baseMod);
    const baseKeys = Object.keys(basePresets);
    for (const key of baseKeys) {
      merged[key] = basePresets[key];
      categories.base.push(key);
    }
    console.log(`[PresetLoader] Base presets: ${baseKeys.length}`);
  } catch (e) {
    console.error('[PresetLoader] Failed to load base presets:', e);
  }

  // Load official extra presets
  try {
    const extraMod = await import('butterchurn-presets/dist/extra.js');
    const extraPresets = extractPresets(extraMod);
    const extraKeys = Object.keys(extraPresets);
    for (const key of extraKeys) {
      if (!merged[key]) {
        merged[key] = extraPresets[key];
        categories.extra.push(key);
      }
    }
    console.log(`[PresetLoader] Extra presets: ${extraKeys.length}`);
  } catch (e) {
    console.warn('[PresetLoader] Failed to load extra presets:', e.message);
  }

  // Skip image presets — they require external textures via loadExtraImages()
  // which we don't provide. Without textures, they produce broken equations
  // (SyntaxError: Unexpected token 'return') or render incorrectly.

  // Load baron curated presets (~762)
  try {
    const baronMod = await import('butterchurn-presets-baron');
    const baronPresets = extractPresets(baronMod);
    const baronKeys = Object.keys(baronPresets);
    for (const key of baronKeys) {
      if (!merged[key]) {
        merged[key] = baronPresets[key];
        categories.baron.push(key);
      }
    }
    console.log(`[PresetLoader] Baron presets: ${baronKeys.length} (${categories.baron.length} unique)`);
  } catch (e) {
    console.warn('[PresetLoader] Failed to load baron presets:', e.message);
  }

  allPresetsCache = merged;
  presetKeysCache = Object.keys(merged).sort();
  categoriesCache = categories;

  console.log(`[PresetLoader] Total unique presets: ${presetKeysCache.length}`);

  return { presets: allPresetsCache, keys: presetKeysCache, categories: categoriesCache };
}

/**
 * Get sorted list of all preset keys
 */
export async function getPresetKeys() {
  const { keys } = await loadAllPresets();
  return keys;
}

/**
 * Get a random preset name
 */
export async function getRandomPresetName() {
  const { keys } = await loadAllPresets();
  return keys[Math.floor(Math.random() * keys.length)];
}

/**
 * Get preset categories with their keys
 */
export async function getPresetCategories() {
  const { categories } = await loadAllPresets();
  return categories;
}
