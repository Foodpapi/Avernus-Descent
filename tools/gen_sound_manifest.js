#!/usr/bin/env node
// Generates assets/sounds/manifest.json (machine-readable list of every sound
// slot) and assets/sounds/README.md (the human drop-list), straight from the
// registry in src/data/sounds.js — the single source of truth.
// Also scans assets/sounds/ and marks which slots already have files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOUND_SLOTS, SOUND_BASE, SOUND_EXTENSIONS } from '../src/data/sounds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const soundDir = path.join(root, 'assets', 'sounds');

// ---- scan the disk ---------------------------------------------------------
function scanPresent() {
  const found = new Map(); // slot path -> first existing file
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else {
        const ext = path.extname(e.name).toLowerCase();
        if (!SOUND_EXTENSIONS.includes(ext)) continue;
        const rel = path.relative(soundDir, full).replace(/\\/g, '/').replace(/\.[^.]+$/, '');
        if (!found.has(rel)) found.set(rel, e.name);
      }
    }
  };
  walk(soundDir);
  return found;
}

const present = scanPresent();
const slots = Object.values(SOUND_SLOTS).sort((a, b) => a.path.localeCompare(b.path));

// ---- manifest.json ---------------------------------------------------------
const manifest = {
  generated: new Date().toISOString(),
  base: SOUND_BASE,
  extensions: SOUND_EXTENSIONS,
  note: 'Each slot lists the path without extension; drop any of the supported extensions. Missing slots are silent at runtime.',
  totalSlots: slots.length,
  presentCount: slots.filter(s => present.has(s.path)).length,
  slots: slots.map(s => ({
    path: s.path,
    desc: s.desc,
    optional: !!s.optional,
    file: present.get(s.path) || null,
  })),
};
fs.mkdirSync(soundDir, { recursive: true });
fs.writeFileSync(path.join(soundDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest.json: ${manifest.totalSlots} slots, ${manifest.presentCount} present on disk`);

// ---- README.md (the drop-list) ---------------------------------------------
const GROUP_ORDER = ['ui', 'combat', 'weapons', 'spells', 'footsteps', 'units', 'items', 'music', 'ambience'];
const byFolder = {};
for (const s of slots) {
  const folder = s.path.split('/')[0];
  (byFolder[folder] ||= []).push(s);
}

const lines = [];
lines.push('# Avernus Descent — Sound Drop List');
lines.push('');
lines.push('Everything the game can play, in one list. Drop your files into the folders below and the game picks them up automatically. **Missing files are silently skipped** — the game stays fully playable no matter how few (or how many) sounds you add.');
lines.push('');
lines.push('## Where do files go?');
lines.push('');
lines.push('```');
lines.push('assets/sounds/');
lines.push('├── music/      looping background tracks          (.ogg preferred)');
lines.push('├── ambience/   looping background beds (optional)');
lines.push('├── ui/         menu clicks, opens, errors…');
lines.push('├── combat/     hits, misses, crits, hazards…');
lines.push('├── weapons/    swings & impacts per damage type (+ per-weapon overrides)');
lines.push('├── spells/     one file per spell + shared fallbacks');
lines.push('├── footsteps/  per-surface footsteps (+ per-location overrides)');
lines.push('├── units/      grunts, deaths, roars, shapeshifts');
lines.push('└── items/      potions, glass breaks, gold, chests…');
lines.push('```');
lines.push('');
lines.push('## Formats');
lines.push('');
lines.push('- **`.ogg` is preferred** (small, loops cleanly). The engine also accepts `.mp3` and `.wav`.');
lines.push('- Tries `.ogg` → `.mp3` → `.wav` per slot — drop one file per slot, any of these formats.');
lines.push('- **Music/ambience**: short seamless loops (30 s – 2 min) work best.');
lines.push('- **One-shots**: keep them tight (0.2 – 2 s). The game adds slight random pitch variation to footsteps and swings so repeats don\'t feel robotic.');
lines.push('- Loudness: keep peaks around -6 to -12 dB. The game mixes SFX at ~80%, music at ~50%.');
lines.push('');
lines.push('## Fallback chains (why you don\'t need every file)');
lines.push('');
lines.push('| Event | Played in order (first file that exists wins) |');
lines.push('| --- | --- |');
lines.push('| Weapon swing | `weapons/{weapon}.ogg` → `weapons/swing_{slash\|stab\|blunt}.ogg` |');
lines.push('| Weapon hit | `weapons/hit_{slash\|stab\|blunt}.ogg` → `combat/hit_flesh.ogg` |');
lines.push('| Spell cast | `spells/{spell}.ogg` → `spells/{damage type}.ogg` → `spells/{heal\|buff\|debuff\|utility}.ogg` → `spells/cast_generic.ogg` |');
lines.push('| Footsteps | `footsteps/{location or scene}.ogg` → `footsteps/{surface}.ogg` → `footsteps/generic.ogg` |');
lines.push('| Combat music | `music/combat_{location}.ogg` → `music/combat.ogg` (bosses: `music/combat_boss.ogg` first) |');
lines.push('');
lines.push(`**Recommended starter pack (14 files)** — the core experience: `);
lines.push('');
lines.push('```');
for (const key of ['ui/click', 'ui/open', 'ui/error', 'combat/miss', 'combat/hit_flesh', 'weapons/swing_slash', 'weapons/hit_slash', 'weapons/swing_stab', 'weapons/hit_stab', 'weapons/swing_blunt', 'weapons/hit_blunt', 'items/potion_drink', 'items/potion_throw', 'items/glass_break']) {
  lines.push(`assets/sounds/${key}.ogg`);
}
lines.push('```');
lines.push('');
lines.push('## The complete list');
lines.push('');
lines.push(`**${slots.length} slots total** — ★ = core (drop these first), · = optional (nice-to-have, the game falls back without them).`);
lines.push('');

const formatSlot = (s) => `- \`${s.path}\` ${s.optional ? '·' : '★'} — ${s.desc}${present.has(s.path) ? ` **→ present (${present.get(s.path)})**` : ''}`;

for (const folder of GROUP_ORDER) {
  const group = byFolder[folder] || [];
  if (!group.length) continue;
  lines.push(`### ${folder}/ (${group.length})`);
  lines.push('');
  for (const s of group) lines.push(formatSlot(s));
  lines.push('');
}
const leftovers = Object.keys(byFolder).filter(f => !GROUP_ORDER.includes(f));
for (const folder of leftovers) {
  const group = byFolder[folder];
  lines.push(`### ${folder}/ (${group.length})`);
  lines.push('');
  for (const s of group) lines.push(formatSlot(s));
  lines.push('');
}

lines.push('## Checking your coverage');
lines.push('');
lines.push('```');
lines.push('node tools/check_sounds.mjs   # summary of what is present / missing');
lines.push('node tools/gen_sound_manifest.js  # regenerate manifest.json + this README');
lines.push('```');
lines.push('');
lines.push('> After dropping files in, refresh the game tab (Ctrl+Shift+R). The game remembers 404s, so new files need a reload to be picked up.');
lines.push('');
lines.push('## How it sounds in-game');
lines.push('');
lines.push('- **M** key or the 🔊 button (top-right) toggles all sound.');
lines.push('- Volumes persist between sessions (music ≈ 50%, SFX ≈ 80%, ambience ≈ 40% of master).');
lines.push('- Music crossfades between title → hub → camp/town → combat; ambience layers underneath.');
lines.push('- Spell SFX chain: drop a handful of per-spell files and every other spell still gets its damage-type or role sound.');

fs.writeFileSync(path.join(soundDir, 'README.md'), lines.join('\n') + '\n');
console.log('README.md written');
