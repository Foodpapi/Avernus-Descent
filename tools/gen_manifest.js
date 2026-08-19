#!/usr/bin/env node
// Regenerates /assets/manifest.json from the game's own data files, so the
// asset manifest always matches the IDs the loader looks for.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const src = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const grab = (txt, re) => [...txt.matchAll(re)].map(m => m[1]);

const locations = grab(src('src/data/locations.js'), /id: '([a-z_]+)', name: '([^']+)'/g);
const obstacles = [...src('src/data/locations.js').matchAll(/^\s{2}(\w+): \{ name: '([^']+)'/gm)].map(m => ({ id: m[1], name: m[2] }));
const monsters = [...src('src/data/monsters.js').matchAll(/^  (\w+): \{\n    id: '([a-z_0-9]+)', name: '([^']+)'/gm)].map(m => ({ id: m[2], name: m[3] }));
const classes = grab(src('src/data/classes.js'), /id: '([a-z_]+)', name: '([^']+)'/g);
const races = grab(src('src/data/races.js'), /id: '([a-z_]+)', name: '([^']+)'/g);
const forms = ['bear', 'dire_wolf', 'wolf', 'giant_spider', 'badger', 'cat', 'rat'];

const files = [];
const add = (file, kind, desc, w, h) => files.push({ file, kind, desc, w, h });

// ---- tiles ----
for (const loc of locations) {
  add(`tiles/${loc}_ground_1.png`, 'tile', `${loc} ground variant A`, 56, 56);
  add(`tiles/${loc}_ground_2.png`, 'tile', `${loc} ground variant B`, 56, 56);
  add(`tiles/${loc}_ground_3.png`, 'tile', `${loc} ground variant C`, 56, 56);
  add(`tiles/${loc}_wall.png`, 'tile', `${loc} border wall`, 56, 56);
  add(`tiles/${loc}_elevation_1.png`, 'tile', `${loc} high ground (ledge)`, 56, 56);
  add(`tiles/${loc}_elevation_2.png`, 'tile', `${loc} high ground (bluff)`, 56, 56);
}
// hazards per location (what each location actually uses)
const locHazards = {
  mountain_pass: [], tavern: ['grease'], ship: ['water'], town: ['fire'],
  forest: ['brambles'], dungeon: [], ruins: [], fey: ['water', 'brambles'],
  avernus: ['lava'],
};
for (const loc of locations) {
  for (const hz of locHazards[loc] || []) add(`tiles/${loc}_hazard_${hz}.png`, 'tile', `${loc} hazard: ${hz}`, 56, 56);
}
for (const hz of ['fire', 'lava', 'water', 'brambles', 'grease']) {
  add(`tiles/hazard_${hz}.png`, 'tile', `generic hazard: ${hz} (fallback)`, 56, 56);
}

// ---- optional dedicated tilesets for the walkable hub & camp scenes ----
// (fall back to town/forest tiles if these files are absent)
for (const scene of ['hub', 'camp']) {
  for (const g of [1, 2, 3]) add(`tiles/${scene}_ground_${g}.png`, 'tile', `${scene} scene ground variant ${g} (optional — falls back to another tileset)`, 56, 56);
  add(`tiles/${scene}_wall.png`, 'tile', `${scene} scene border wall (optional)`, 56, 56);
  add(`tiles/${scene}_elevation_1.png`, 'tile', `${scene} scene high ground ledge (optional)`, 56, 56);
  add(`tiles/${scene}_elevation_2.png`, 'tile', `${scene} scene high ground bluff (optional)`, 56, 56);
}

// ---- objects ----
for (const o of obstacles) add(`objects/${o.id}.png`, 'object', o.name, 56, 56);

// ---- units ----
for (const m of monsters) add(`units/monster_${m.id}.png`, 'unit', m.name, 40, 48);
for (const f of forms) add(`units/form_${f}.png`, 'unit', `Wild Shape: ${f}`, 40, 48);
for (const c of classes) add(`units/class_${c}.png`, 'unit', `PC class: ${c}`, 40, 48);
for (const r of races) for (const c of classes) {
  add(`units/race_${r}_${c}.png`, 'unit', `PC skin: ${r} ${c} (optional — falls back to class sprite)`, 40, 48);
}

fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.writeFileSync(path.join(root, 'assets', 'manifest.json'), JSON.stringify({ version: 1, files }, null, 2));
console.log(`manifest.json written: ${files.length} asset slots`);
