// Sound-system regression suite: registry integrity, resolution helpers,
// scene routing, engine no-op safety, and manifest generation.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

import {
  SOUND_SLOTS, SOUND_EXTENSIONS, DAMAGE_TYPES, SURFACES,
  attackSoundClass, weaponSwingCandidates, weaponHitCandidates,
  monsterSwingCandidates, monsterHitCandidates,
  spellCategory, spellCastCandidates,
  surfaceForWalk, surfaceForLocation,
  footstepsForWalk, footstepsForLocation,
  sceneSoundtrack,
} from '../src/data/sounds.js';
import { WEAPONS, FISTS } from '../src/data/items.js';
import { SPELLS, SPELL_MAP } from '../src/data/spells.js';
import { LOCATIONS, LOCATION_MAP } from '../src/data/locations.js';

let failed = 0;
const ok = (cond, msg, quiet = false) => {
  if (cond) { if (!quiet) console.log(`  ✔ ${msg}`); }
  else { failed++; console.error(`  ✘ ${msg}`); }
};
const section = (t) => console.log(`\n— ${t}`);

// ---- 1. Registry integrity ----
section('Registry integrity');
const paths = Object.values(SOUND_SLOTS).map(s => s.path);
ok(paths.length >= 240, `registry has a full slot table (${paths.length} slots)`);
ok(new Set(paths).size === paths.length, 'every slot path is unique');
ok(paths.every(p => /^[a-z0-9_/]+$/.test(p)), 'slot paths are extension-free snake_case');
ok(paths.every(p => p.split('/').length === 2), 'every slot is exactly folder/file');
ok(Object.values(SOUND_SLOTS).every(s => typeof s.desc === 'string' && s.desc.length > 3), 'every slot has a description');
ok(SOUND_EXTENSIONS.length === 3 && SOUND_EXTENSIONS[0] === '.ogg', 'extension order is .ogg → .mp3 → .wav');

const FOLDERS = ['ui', 'combat', 'weapons', 'spells', 'footsteps', 'units', 'items', 'music', 'ambience'];
ok(paths.every(p => FOLDERS.includes(p.split('/')[0])), 'all slots live in the 9 documented folders');
const core = Object.values(SOUND_SLOTS).filter(s => !s.optional);
ok(core.length >= 40, `core (non-optional) slots exist (${core.length})`);

// ---- 2. Weapons ----
section('Weapon sounds');
const allWeaponIds = Object.keys(WEAPONS).concat(['fists']);
let before = failed;
for (const wid of allWeaponIds) {
  const def = WEAPONS[wid] || FISTS;
  const swing = weaponSwingCandidates(def);
  const hit = weaponHitCandidates(def);
  ok(swing.length >= 1 && swing.every(c => SOUND_SLOTS[c]), `swing chain resolves for ${wid} (${swing.join(' → ')})`, true);
  ok(hit.length >= 1 && hit.every(c => SOUND_SLOTS[c]), `hit chain resolves for ${wid}`, true);
  ok(swing[0] === `weapons/${wid}` || wid === 'fists', `per-weapon slot is first candidate for ${wid}`, true);
}
if (failed === before) console.log(`  ✔ swing + hit chains resolve for all ${allWeaponIds.length} weapons (${allWeaponIds.length * 3} checks)`);
ok(attackSoundClass({ dmgType: 'slashing' }) === 'slash', 'slashing → slash class');
ok(attackSoundClass({ dmgType: 'piercing' }) === 'stab', 'piercing → stab class');
ok(attackSoundClass({ dmgType: 'bludgeoning' }) === 'blunt', 'bludgeoning → blunt class');
ok(attackSoundClass({ dmgType: 'fire' }) === 'blunt', 'unknown types default to blunt');
const sword = weaponSwingCandidates('longsword');
ok(sword[1] === 'weapons/swing_slash', 'longsword falls back to slash swing');
const spear = weaponSwingCandidates('spear');
ok(spear[1] === 'weapons/swing_stab', 'spear falls back to stab swing');
const maul = weaponSwingCandidates('maul');
ok(maul[1] === 'weapons/swing_blunt', 'maul falls back to blunt swing');
ok(weaponSwingCandidates('longbow').includes('weapons/bow_shot'), 'bows twang');
ok(weaponSwingCandidates('heavy_crossbow').includes('weapons/crossbow_shot'), 'crossbows thunk');
ok(weaponHitCandidates('longbow')[0] === 'weapons/arrow_hit', 'ranged hits use arrow_hit');
ok(weaponSwingCandidates('fists')[0] === 'weapons/unarmed_swing', 'fists swing unarmed');

// monster defs
const mswing = monsterSwingCandidates({ dmgType: 'slashing', range: 'melee' });
ok(mswing[0] === 'weapons/swing_slash' && mswing[1] === 'weapons/unarmed_swing', 'monster claws use slash swing fallback');
ok(monsterHitCandidates({ dmgType: 'piercing', range: 'melee' })[0] === 'weapons/hit_stab', 'monster bites use stab hit');

// ---- 3. Spells ----
section('Spell sounds');
ok(SPELLS.length >= 90, `spell data intact (${SPELLS.length} spells)`);
before = failed;
for (const sp of SPELLS) {
  ok(SOUND_SLOTS[`spells/${sp.id}`], `per-spell slot exists: spells/${sp.id}`, true);
  const chain = spellCastCandidates(sp);
  ok(chain[0] === `spells/${sp.id}`, `spell chain starts with per-spell file (${sp.id})`, true);
  ok(chain.every(c => SOUND_SLOTS[c]), `spell chain all valid (${sp.id}): ${chain.join(' → ')}`, true);
  ok(chain[chain.length - 1] === 'spells/cast_generic', `spell chain ends in cast_generic (${sp.id})`, true);
}
if (failed === before) console.log(`  ✔ per-spell slots + fallback chains valid for all ${SPELLS.length} spells`);
ok(spellCategory(SPELL_MAP.fireball) === null, 'damage spells skip role sounds (use damage type)');
ok(spellCastCandidates(SPELL_MAP.fireball).includes('spells/fire'), 'fireball falls back to fire sound');
ok(spellCastCandidates(SPELL_MAP.cure_wounds).includes('spells/heal'), 'cure wounds falls back to heal sound');
ok(spellCastCandidates(SPELL_MAP.bless).includes('spells/buff'), 'bless falls back to buff sound');
ok(spellCastCandidates(SPELL_MAP.bane).includes('spells/debuff'), 'bane falls back to debuff sound');
ok(spellCastCandidates(SPELL_MAP.misty_step).includes('spells/utility'), 'misty step falls back to utility sound');
ok(spellCastCandidates(SPELL_MAP.hex).includes('spells/hex'), 'hex resolves to its own slot');
ok(spellCastCandidates(SPELL_MAP.eldritch_blast).includes('spells/force'), 'eldritch blast falls back to force');
ok(spellCastCandidates(SPELL_MAP.thorn_whip).includes('spells/physical'), 'thorn whip (piercing) falls back to physical');
for (const t of DAMAGE_TYPES) ok(SOUND_SLOTS[`spells/${t}`], `damage-type slot exists: spells/${t}`);

// ---- 4. Footsteps / surfaces ----
section('Footsteps & surfaces');
before = failed;
for (const loc of LOCATIONS) {
  ok(typeof surfaceForLocation(loc.id) === 'string', `location ${loc.id} has a surface (${surfaceForLocation(loc.id)})`, true);
  ok(SOUND_SLOTS[`footsteps/${loc.id}`], `per-location footstep slot: footsteps/${loc.id}`, true);
  const chain = footstepsForLocation(loc.id);
  ok(chain.every(c => SOUND_SLOTS[c]), `location footstep chain valid (${loc.id})`, true);
}
for (const mapId of ['hub', 'camp', 'town']) {
  const chain = footstepsForWalk(mapId);
  ok(chain.every(c => SOUND_SLOTS[c]) && chain[0] === `footsteps/${mapId}`, `walk scene chain valid (${mapId})`, true);
}
if (failed === before) console.log(`  ✔ footstep chains valid for all ${LOCATIONS.length} locations + 3 walk scenes`);
ok(SURFACES.includes(surfaceForWalk('hub')) && SURFACES.includes(surfaceForWalk('camp')), 'walk maps map to real surfaces');
ok(SOUND_SLOTS['footsteps/generic'], 'generic footstep fallback exists');

// ---- 5. Scene soundtrack routing ----
section('Scene routing');
ok(sceneSoundtrack('title', null, false).music[0] === 'music/title', 'title → title theme');
ok(sceneSoundtrack('hub', null, false).music[0] === 'music/hub', 'hub → hub theme');
ok(sceneSoundtrack('camp', null, false).music[0] === 'music/camp', 'camp → camp theme');
ok(sceneSoundtrack('town', null, false).music[0] === 'music/town', 'town → town theme');
const forest = sceneSoundtrack('combat', 'forest', false);
ok(forest.music[0] === 'music/combat_forest' && forest.music[1] === 'music/combat', 'combat → location track with generic fallback');
const boss = sceneSoundtrack('combat', 'forest', true);
ok(boss.music[0] === 'music/combat_boss', 'boss floors play the boss theme first');
ok(sceneSoundtrack('combat', null, false).music[0] === 'music/combat', 'unknown location → generic combat music');
ok(sceneSoundtrack('victory', null, false).music.length === 0, 'victory screen silences loops (sting handles it)');
ok(sceneSoundtrack('defeat', null, false).music.length === 0, 'defeat screen silences loops');
ok(sceneSoundtrack('levelup', null, false) === null, 'overlay screens keep current music');
for (const loc of LOCATIONS) {
  ok(SOUND_SLOTS[`music/combat_${loc.id}`], `combat music slot exists for ${loc.id}`);
  ok(SOUND_SLOTS[`ambience/${loc.id}`], `ambience slot exists for ${loc.id}`);
}
for (const m of ['music/title', 'music/hub', 'music/camp', 'music/town', 'music/combat', 'music/combat_boss', 'music/victory', 'music/defeat']) {
  ok(SOUND_SLOTS[m], `core music slot exists: ${m}`);
}

// ---- 6. Audio engine: safe no-op without a browser ----
section('Engine no-op safety (node)');
const Audio = await import('../src/game/audio.js');
let threw = false;
try {
  Audio.play('ui/click');
  Audio.play(['spells/fireball', 'spells/fire', 'spells/cast_generic']);
  Audio.play('ui/click', { vol: 0.5, delay: 100, throttle: 0 });
  Audio.setScene('combat', 'forest', false);
  Audio.setScene('title', null, false);
  Audio.sting('music/victory');
  Audio.footstep(footstepsForLocation('forest'));
  Audio.footstepWalk('hub');
  Audio.footstepCombat('dungeon');
  Audio.weaponSwing(weaponSwingCandidates('longsword'));
  Audio.weaponHit(weaponHitCandidates('longsword'));
  Audio.spellCast(spellCastCandidates(SPELL_MAP.fireball));
  Audio.grunt();
  Audio.unlock();
  Audio.init();
  Audio.toggleMute();
  Audio.toggleMute();
  Audio.setVolume('music', 0.25);
  Audio.preloadCommon('combat', 'forest', false);
  Audio.slotCount();
} catch (e) {
  threw = true;
  console.error('   engine threw:', e);
}
ok(!threw, 'every engine call no-ops without throwing in node (no window/AudioContext)');
ok(!Audio.muted(), 'toggleMute twice returns to unmuted');

// ---- 7. Music requested at boot (before the first gesture) must still play ----
// Regression: titleScreen() → screen('title') → setScene('title') runs at boot,
// BEFORE the AudioContext exists (created on the first user gesture). The old
// code called ctx.decodeAudioData with ctx === null, caught the TypeError and
// cached assets/sounds/music/title.mp3 as "missing" forever — so the title
// track was silently dead even after the user clicked. SFX worked because they
// are all triggered post-gesture.
section('Music at boot → plays after first gesture');
const fakeDecoded = [];
const fakeStarted = [];
class FakeGain {
  constructor() {
    this.gain = { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} };
  }
  connect() {}
  disconnect() {}
}
class FakeSrc {
  constructor() { this.buffer = null; this.loop = false; this.playbackRate = { value: 1 }; this.onended = null; }
  connect(n) { return n; }
  start() { fakeStarted.push(true); }
  stop() {}
}
class FakeCtx {
  constructor() { this.currentTime = 0; this.destination = {}; this.state = 'suspended'; }
  createGain() { return new FakeGain(); }
  createBufferSource() { return new FakeSrc(); }
  resume() { this.state = 'running'; }
  decodeAudioData(ab) { fakeDecoded.push(ab); return Promise.resolve({ fake: true }); }
}
globalThis.window = { AudioContext: FakeCtx };
globalThis.fetch = async (url) => {
  const s = String(url);
  if (s.endsWith('music/title.mp3')) return { ok: true, arrayBuffer: async () => new ArrayBuffer(16) };
  return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
};
globalThis.window.fetch = globalThis.fetch;
Audio.init();                           // boot (main.js) — no gesture yet
Audio.setScene('title', null, false);   // titleScreen() — music requested early
await new Promise(r => setTimeout(r, 40));
ok(fakeDecoded.length === 0 && fakeStarted.length === 0, 'no playback before the first gesture (autoplay policy)');
Audio.unlock();                         // first pointerdown/keydown
await new Promise(r => setTimeout(r, 40));
ok(fakeDecoded.length === 1, 'title buffer decodes after unlock — NOT cached as missing');
ok(fakeStarted.length === 1, 'title music starts after unlock');
delete globalThis.window;
delete globalThis.fetch;

// ---- 8. Manifest generation matches the registry ----
section('Manifest generation');
try {
  execSync('node tools/gen_sound_manifest.js', { cwd: root, stdio: 'pipe' });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/sounds/manifest.json'), 'utf8'));
  ok(manifest.totalSlots === paths.length, `manifest lists all ${paths.length} slots`);
  ok(manifest.slots.every(s => s.path && s.desc), 'manifest slots carry path + description');
  ok(manifest.slots.map(s => s.path).sort().join('|') === paths.slice().sort().join('|'), 'manifest slot set === registry set');
  const readme = fs.readFileSync(path.join(root, 'assets/sounds/README.md'), 'utf8');
  ok(readme.includes('assets/sounds/'), 'README documents the folder tree');
  ok(readme.includes('Recommended starter pack'), 'README lists the starter pack');
  ok(readme.includes('spells/fireball'), 'README lists per-spell slots');
  const total = manifest.slots.length;
  console.log(`   manifest: ${manifest.presentCount}/${total} files present on disk (expected 0 until you drop sounds)`);
} catch (e) {
  failed++;
  console.error('   manifest generation failed:', e.message);
}

// ---- 9. Location data still intact (no accidental regressions) ----
section('Data counts unchanged');
ok(LOCATIONS.length === 9, `9 locations (${LOCATIONS.length})`);
ok(Object.keys(WEAPONS).length >= 32, `weapons table intact (${Object.keys(WEAPONS).length})`);

console.log(failed ? `\n✘ ${failed} FAILURES` : '\n✔ all sound-system checks passed');
process.exit(failed ? 1 : 0);
