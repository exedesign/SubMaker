/**
 * Export all valid butterchurn presets to resources/presets/ folder
 * Run once: node export-presets.js
 */
const fs = require('fs');
const path = require('path');

const presetsDir = path.resolve(__dirname, '..', 'resources', 'presets');
if (!fs.existsSync(presetsDir)) fs.mkdirSync(presetsDir, { recursive: true });

function isValid(preset) {
  try {
    const strs = [preset.init_eqs_str, preset.frame_eqs_str, preset.pixel_eqs_str];
    for (const s of strs) {
      if (s && s !== '') new Function('a', s + ' return a;');
    }
    if (preset.shapes) {
      for (const shape of preset.shapes) {
        if (shape.init_eqs_str) new Function('a', shape.init_eqs_str + ' return a;');
        if (shape.frame_eqs_str) new Function('a', shape.frame_eqs_str + ' return a;');
      }
    }
    if (preset.waves) {
      for (const wave of preset.waves) {
        if (wave.init_eqs_str) new Function('a', wave.init_eqs_str + ' return a;');
        if (wave.frame_eqs_str) new Function('a', wave.frame_eqs_str + ' return a;');
        if (wave.point_eqs_str && wave.point_eqs_str !== '') new Function('a', wave.point_eqs_str + ' return a;');
      }
    }
    return true;
  } catch { return false; }
}

function loadPack(p) {
  const m = require(p);
  const src = m.default || m;
  if (typeof src.getPresets === 'function') return src.getPresets();
  if (typeof src === 'function') { try { return src(); } catch { return src; } }
  return src;
}

function safeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

const allPresets = {};
const stats = { packs: 0, json: 0, invalid: 0, duplicate: 0 };

// Load from compiled packs
const packs = [
  'butterchurn-presets',
  './node_modules/butterchurn-presets/lib/butterchurnPresetsExtra.min.js',
  './node_modules/butterchurn-presets/lib/butterchurnPresetsExtra2.min.js',
  './node_modules/butterchurn-presets/lib/butterchurnPresetsNonMinimal.min.js',
];

for (const pack of packs) {
  try {
    const presets = loadPack(pack);
    for (const [name, preset] of Object.entries(presets)) {
      if (allPresets[name]) { stats.duplicate++; continue; }
      if (!isValid(preset)) { stats.invalid++; continue; }
      allPresets[name] = preset;
      stats.packs++;
    }
  } catch (e) {
    console.warn(`Pack ${pack} failed:`, e.message);
  }
}

// Load from converted JSON files
const convertedDir = './node_modules/butterchurn-presets/presets/converted';
if (fs.existsSync(convertedDir)) {
  const jsonFiles = fs.readdirSync(convertedDir).filter(f => f.endsWith('.json'));
  for (const file of jsonFiles) {
    try {
      const raw = fs.readFileSync(path.join(convertedDir, file), 'utf-8');
      const preset = JSON.parse(raw);
      const name = path.basename(file, '.json');
      if (allPresets[name]) { stats.duplicate++; continue; }
      if (!isValid(preset)) { stats.invalid++; continue; }
      allPresets[name] = preset;
      stats.json++;
    } catch { stats.invalid++; }
  }
}

// Write each preset as individual JSON
let written = 0;
for (const [name, preset] of Object.entries(allPresets)) {
  const safeName = safeFilename(name);
  const filePath = path.join(presetsDir, safeName + '.json');
  fs.writeFileSync(filePath, JSON.stringify(preset));
  written++;
}

console.log('=== Preset Export Complete ===');
console.log('From packs:', stats.packs);
console.log('From JSON:', stats.json);
console.log('Duplicates skipped:', stats.duplicate);
console.log('Invalid skipped:', stats.invalid);
console.log('Total written:', written);
