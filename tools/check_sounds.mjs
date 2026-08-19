#!/usr/bin/env node
// Prints sound coverage: which slots in the registry have files on disk.
// Always exits 0 — missing sounds are expected (the game is silent until the
// user drops files in).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOUND_SLOTS, SOUND_EXTENSIONS } from '../src/data/sounds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const soundDir = path.resolve(__dirname, '..', 'assets', 'sounds');

const present = new Set();
const walk = (dir) => {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (SOUND_EXTENSIONS.includes(path.extname(e.name).toLowerCase())) {
      present.add(path.relative(soundDir, full).replace(/\\/g, '/').replace(/\.[^.]+$/, ''));
    }
  }
};
walk(soundDir);

const slots = Object.values(SOUND_SLOTS);
const presentSlots = slots.filter(s => present.has(s.path));
const core = slots.filter(s => !s.optional);
const corePresent = core.filter(s => present.has(s.path));

// orphan files: on disk but not in the registry (typos!)
const orphans = [...present].filter(p => !SOUND_SLOTS[p]);

const byFolder = {};
for (const s of slots) {
  const f = s.path.split('/')[0];
  byFolder[f] = byFolder[f] || { total: 0, present: 0 };
  byFolder[f].total++;
  if (present.has(s.path)) byFolder[f].present++;
}

console.log(`\n🎵 SOUND COVERAGE — ${presentSlots.length}/${slots.length} slots have files`);
console.log(`   core slots: ${corePresent.length}/${core.length} · optional: ${presentSlots.length - corePresent.length}/${slots.length - core.length}\n`);
for (const [folder, stats] of Object.entries(byFolder).sort()) {
  const pct = stats.total ? Math.round((stats.present / stats.total) * 100) : 0;
  console.log(`   ${folder.padEnd(12)} ${String(stats.present).padStart(3)}/${String(stats.total).padEnd(3)} ${pct}%`);
}
if (orphans.length) {
  console.log('\n⚠ Files on disk that match NO registry slot (check spelling):');
  for (const o of orphans.sort()) console.log(`   - ${o}`);
}
if (presentSlots.length === 0) {
  console.log('\nNo sounds yet — the game runs silently until you drop files into assets/sounds/.\nSee assets/sounds/README.md for the full list.');
}
console.log('');
