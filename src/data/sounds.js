// ============================================================================
// SOUND REGISTRY — the single source of truth for every sound in the game.
//
// Every playable sound has a slot listed in SOUND_SLOTS with a path relative
// to assets/sounds/ (no extension — the audio engine tries .ogg, .mp3 and
// .wav in that order). Files that are missing are silently skipped, so the
// game is fully playable before any sound is dropped in.
//
// Drop your files like this:
//   assets/sounds/ui/click.ogg
//   assets/sounds/spells/fireball.mp3
//   assets/sounds/music/combat.ogg
// ...then run `node tools/check_sounds.mjs` to see what you've covered.
// ============================================================================

import { WEAPONS, FISTS } from './items.js';
import { SPELLS } from './spells.js';
import { LOCATIONS } from './locations.js';

export const SOUND_BASE = 'assets/sounds/';
export const SOUND_EXTENSIONS = ['.ogg', '.mp3', '.wav'];

// The 13 damage types in 5e (plus a "physical" grab-bag for slashing /
// piercing / bludgeoning spell damage) get a shared fallback sound.
export const DAMAGE_TYPES = [
  'acid', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'poison', 'psychic', 'radiant', 'thunder', 'physical',
];

// Footstep surfaces (shared fallbacks for both walk scenes and combat).
export const SURFACES = [
  'stone', 'wood', 'grass', 'dirt', 'sand', 'snow',
  'water', 'metal', 'lava', 'generic',
];

// Which surface each walk-scene map sounds like.
const WALK_SURFACES = { hub: 'stone', camp: 'grass', town: 'stone' };

// Which surface each combat location sounds like.
const LOCATION_SURFACES = {
  mountain_pass: 'stone',
  tavern: 'wood',
  ship: 'wood',
  town: 'stone',
  forest: 'grass',
  dungeon: 'stone',
  ruins: 'dirt',
  fey: 'grass',
  avernus: 'lava',
};

export function surfaceForWalk(mapId) {
  return WALK_SURFACES[mapId] || 'stone';
}

export function surfaceForLocation(locId) {
  return LOCATION_SURFACES[locId] || 'stone';
}

// ---------------------------------------------------------------------------
// Slot table. Each entry: { path, desc, optional }
// path = file path under assets/sounds/ WITHOUT extension.
// optional = nice-to-have; the game has a working fallback if it's absent.
// ---------------------------------------------------------------------------
function buildSlots() {
  const slots = {};
  const add = (path, desc, optional = false) => {
    slots[path] = { path, desc, optional };
  };

  // ---- UI (menu & interface) ----
  add('ui/click', 'Generic menu click — plays on every button press', false);
  add('ui/hover', 'Soft hover blip when mousing over menu options', true);
  add('ui/open', 'Panel / modal / radial menu opens', false);
  add('ui/close', 'Panel / modal / radial menu closes', false);
  add('ui/error', 'Invalid action — no points left, bad target, can\'t cast', false);
  add('ui/equip', 'Weapon or armor equipped / unequipped', true);
  add('ui/gold', 'Coins — buying, selling, looting gold', false);
  add('ui/levelup', 'Level-up / new ability fanfare', false);

  // ---- Combat (generic one-shots) ----
  add('combat/start', 'Encounter start sting (floor intro → first round)', false);
  add('combat/miss', 'Attack swings through empty air', false);
  add('combat/hit_flesh', 'Generic flesh impact (fallback for weapon hits)', true);
  add('combat/crit', 'Heavy critical-hit impact', false);
  add('combat/shove', 'Shove / shove-aside thud and scuffle', false);
  add('combat/fall', 'Body hits the ground (prone, grease slip)', false);
  add('combat/hazard_fire', 'Flames crackle (fire hazard damage)', false);
  add('combat/hazard_lava', 'Lava sizzle (lava hazard damage)', false);
  add('combat/hazard_brambles', 'Thorns rustle and tear (brambles damage)', false);
  add('combat/hazard_grease', 'Slippery splat (grease slip)', false);
  add('combat/hazard_water', 'Splash (water hazard)', false);

  // ---- Weapons ----
  // Shared by damage class — the required core (slashing / stabbing / blunt).
  add('weapons/swing_slash', 'Sword / axe whoosh through air', false);
  add('weapons/hit_slash', 'Blade bites flesh (slashing impact)', false);
  add('weapons/swing_stab', 'Stabbing lunge whoosh', false);
  add('weapons/hit_stab', 'Point sinks in (piercing impact)', false);
  add('weapons/swing_blunt', 'Heavy club / hammer swing', false);
  add('weapons/hit_blunt', 'Crunching bludgeoning impact', false);
  // Ranged & unarmed shared sounds.
  add('weapons/bow_shot', 'Bowstring twang + arrow release', false);
  add('weapons/crossbow_shot', 'Crossbow thunk + bolt release', false);
  add('weapons/sling_shot', 'Sling whirl and release', false);
  add('weapons/arrow_hit', 'Arrow / bolt strikes a target', false);
  add('weapons/unarmed_swing', 'Fist / paw swipes air', false);
  add('weapons/unarmed_hit', 'Bare-knuckle punch lands', false);
  // Per-weapon unique override (optional — replaces the shared swing so you
  // can give each weapon its own voice).
  for (const wid of Object.keys(WEAPONS)) {
    add(`weapons/${wid}`, `Unique attack sound for ${WEAPONS[wid].name} (replaces the shared ${WEAPONS[wid].dmgType} swing)`, true);
  }
  add('weapons/fists', 'Unique attack sound for unarmed strikes', true);

  // ---- Spells ----
  // Shared fallbacks first so a per-spell file can override the shared slot
  // (e.g. the level-6 Heal spell IS the shared spells/heal fallback).
  for (const t of DAMAGE_TYPES) {
    add(`spells/${t}`, `Shared ${t} spell sound (fallback for spells of this damage type)`, false);
  }
  add('spells/heal', 'Gentle healing chime (cure wounds & friends)', false);
  add('spells/buff', 'Empowering shimmer (bless, haste, mage armor…)', false);
  add('spells/debuff', 'Cursed chime (bane, hold person, slow…)', false);
  add('spells/utility', 'Utility magic murmur (misty step, darkness…)', false);
  add('spells/cast_generic', 'Generic spell-cast whoosh (last-resort fallback)', false);
  add('spells/impact', 'Magic impact on a target (spell attack lands / save failed)', false);
  // One slot per spell (specific spell SFX you asked for).
  for (const sp of SPELLS) {
    const key = `spells/${sp.id}`;
    const existing = slots[key];
    add(key, `${sp.name} — cast sound`, existing ? existing.optional : true);
  }

  // ---- Footsteps ----
  // Per walk-scene override, then per combat location, then per surface.
  for (const mapId of ['hub', 'camp', 'town']) {
    add(`footsteps/${mapId}`, `Footstep override for the ${mapId} walk scene (replaces the surface sound)`, true);
  }
  for (const loc of LOCATIONS) {
    add(`footsteps/${loc.id}`, `Footstep override for ${loc.name} (replaces the surface sound)`, true);
  }
  for (const s of SURFACES) {
    const optional = s === 'generic';
    add(`footsteps/${s}`, optional
      ? 'Generic footstep (fallback when no surface sound exists)'
      : `Footstep on ${s} — ${s === 'stone' ? 'cobbles, rock, flagstone' : s === 'wood' ? 'planks, decking, floorboards' : s === 'grass' ? 'soft turf' : s === 'dirt' ? 'packed earth' : s === 'sand' ? 'loose sand' : s === 'snow' ? 'crunched snow' : s === 'water' ? 'wading splash' : s === 'metal' ? 'clanking grating' : 'sizzling hell-rock'}`, optional);
  }

  // ---- Units / creatures ----
  add('units/grunt_1', 'Creature takes a hit — grunt A (randomized with 2 & 3)', true);
  add('units/grunt_2', 'Creature takes a hit — grunt B', true);
  add('units/grunt_3', 'Creature takes a hit — grunt C', true);
  add('units/death', 'Creature dies — death rattle / collapse', false);
  add('units/roar', 'Large monster roars (rage, boss powers)', true);
  add('units/shapeshift', 'Wild shape / transformation whoosh', false);

  // ---- Items ----
  add('items/potion_drink', 'Gulp — cork pop and swallow', false);
  add('items/potion_throw', 'Flask flies through the air', false);
  add('items/glass_break', 'Glass shatters on impact', false);
  add('items/scroll', 'Paper unrolls / scroll read', true);
  add('items/chest_open', 'Victory loot chest creaks open', false);
  add('items/gold', 'Coins jingle (loot screen)', false);

  // ---- Music (looping tracks) ----
  add('music/title', 'Main menu theme', false);
  add('music/hub', 'The Hub — Dante\'s emporium theme', false);
  add('music/camp', 'Campfire rest theme', false);
  add('music/town', 'Town between floors', false);
  add('music/combat', 'Generic combat music (fallback)', false);
  add('music/combat_boss', 'Boss battle music (floors 3, 6, 9, 12)', false);
  for (const loc of LOCATIONS) {
    add(`music/combat_${loc.id}`, `Combat music for ${loc.name} (falls back to music/combat)`, true);
  }
  add('music/victory', 'Victory sting (floor cleared — plays once)', false);
  add('music/defeat', 'Defeat sting (run over — plays once)', false);

  // ---- Ambience (looping beds, layered under music) ----
  add('ambience/hub', 'Hub background bed (braziers, distant chatter)', true);
  add('ambience/camp', 'Camp background bed (crackling fire, crickets)', true);
  add('ambience/town', 'Town background bed (market bustle)', true);
  for (const loc of LOCATIONS) {
    add(`ambience/${loc.id}`, `Background ambience for ${loc.name}`, true);
  }

  return slots;
}

export const SOUND_SLOTS = buildSlots();

// ---------------------------------------------------------------------------
// Resolution helpers: map a game event to a list of candidate slots.
// The audio engine plays the FIRST candidate that exists on disk, so you can
// drop only the specific files you care about and fallbacks fill the rest.
// ---------------------------------------------------------------------------

// 'slash' | 'stab' | 'blunt' for any weapon definition (or weapon id).
export function attackSoundClass(weaponOrId) {
  const def = typeof weaponOrId === 'string'
    ? (WEAPONS[weaponOrId] || FISTS)
    : weaponOrId;
  const t = (def && def.dmgType) || 'bludgeoning';
  if (t === 'slashing') return 'slash';
  if (t === 'piercing') return 'stab';
  return 'blunt';
}

export function weaponSwingCandidates(weaponOrId) {
  const id = typeof weaponOrId === 'string' ? weaponOrId : weaponOrId && weaponOrId.id;
  const def = id ? (WEAPONS[id] || (id === 'fists' ? FISTS : null)) : FISTS;
  if (!id || id === 'fists' || !def) return ['weapons/unarmed_swing'];
  if (def.range && def.range.startsWith('ranged')) {
    if (id.includes('crossbow')) return [`weapons/${id}`, 'weapons/crossbow_shot', 'weapons/bow_shot'];
    if (id === 'sling') return [`weapons/${id}`, 'weapons/sling_shot'];
    return [`weapons/${id}`, 'weapons/bow_shot'];
  }
  return [`weapons/${id}`, `weapons/swing_${attackSoundClass(def)}`];
}

export function weaponHitCandidates(weaponOrId) {
  const id = typeof weaponOrId === 'string' ? weaponOrId : weaponOrId && weaponOrId.id;
  const def = id ? WEAPONS[id] : null;
  if (def && def.range && def.range.startsWith('ranged')) {
    return ['weapons/arrow_hit', 'combat/hit_flesh'];
  }
  if (!id || id === 'fists') return ['weapons/unarmed_hit', 'combat/hit_flesh'];
  return [`weapons/hit_${attackSoundClass(def)}`, 'combat/hit_flesh'];
}

// Monster attack defs ({ name, dmg, dmgType, range, fx }) map onto the shared
// weapon-class sounds (claws slash, bites stab, slams crush).
export function monsterSwingCandidates(atk) {
  if (!atk) return ['weapons/unarmed_swing'];
  if (atk.range === 'ranged') return ['weapons/bow_shot'];
  return [`weapons/swing_${attackSoundClass(atk)}`, 'weapons/unarmed_swing'];
}

export function monsterHitCandidates(atk) {
  if (!atk) return ['weapons/unarmed_hit', 'combat/hit_flesh'];
  if (atk.range === 'ranged') return ['weapons/arrow_hit', 'combat/hit_flesh'];
  return [`weapons/hit_${attackSoundClass(atk)}`, 'combat/hit_flesh'];
}

// Classify a spell's "role" for fallback sounds.
const UTILITY_SPELL_RE = /misty_step|blink|dimension_door|thunder_step|fog_cloud|darkness|pass_without_trace|invisibility|mirror_image|wall_|grease|web|spike_growth/;
export function spellCategory(sp) {
  if (sp.heal) return 'heal';
  if (/cure|heal|restoration|revivify|aid/i.test(sp.id)) return 'heal';
  if (sp.dmg || sp.dmgType) return null; // damage spells use the damage-type fallback
  if (UTILITY_SPELL_RE.test(sp.id)) return 'utility'; // teleports, terrain, illusions
  if (sp.save) return 'debuff';
  if (sp.mode === 'ally' || sp.mode === 'self') return 'buff';
  return 'utility';
}

export function spellCastCandidates(sp) {
  const list = [`spells/${sp.id}`];
  if (sp.dmgType && DAMAGE_TYPES.includes(sp.dmgType)) list.push(`spells/${sp.dmgType}`);
  else if (sp.dmgType && ['slashing', 'piercing', 'bludgeoning'].includes(sp.dmgType)) list.push('spells/physical');
  const cat = spellCategory(sp);
  if (cat) list.push(`spells/${cat}`);
  list.push('spells/cast_generic');
  return [...new Set(list)];
}

export function footstepCandidates(surface) {
  if (surface === 'generic') return ['footsteps/generic'];
  return [`footsteps/${surface}`, 'footsteps/generic'];
}

// Full footstep chain for a walk map or combat location (override → surface → generic).
export function footstepsForWalk(mapId) {
  return [`footsteps/${mapId}`, ...footstepCandidates(surfaceForWalk(mapId))];
}

export function footstepsForLocation(locId) {
  return [`footsteps/${locId}`, ...footstepCandidates(surfaceForLocation(locId))];
}

// What music + ambience should play for a given screen.
// Returns { music: [..candidates], ambience: [..candidates] } or null if the
// current scene should keep playing (level-up overlays etc.).
export function sceneSoundtrack(screenName, locId, isBoss) {
  switch (screenName) {
    case 'title':
    case 'creation':
    case 'help':
      return { music: ['music/title'], ambience: [] };
    case 'hub':
      return { music: ['music/hub'], ambience: ['ambience/hub'] };
    case 'camp':
      return { music: ['music/camp'], ambience: ['ambience/camp'] };
    case 'town':
      return { music: ['music/town'], ambience: ['ambience/town'] };
    case 'combat': {
      const music = isBoss
        ? ['music/combat_boss', 'music/combat', 'music/combat']
        : (locId ? [`music/combat_${locId}`] : []).concat(['music/combat']);
      const ambience = locId ? [`ambience/${locId}`] : [];
      return { music, ambience };
    }
    case 'victory':
    case 'defeat':
      return { music: [], ambience: [] };
    default:
      return null; // overlays (levelup, inspect, ...) keep current music
  }
}
