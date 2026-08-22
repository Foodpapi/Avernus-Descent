// Core 5e rules: ability modifiers, proficiency, character creation,
// AC, HP, leveling, gear. Combat resolution lives in combat.js.

import { RACE_MAP, baseAbilityScores, SKILL_ABILITY, isRaceFamily } from '../data/races.js';
import { CLASS_MAP, PROF_BY_LEVEL, ASI_LEVELS, attacksPerAction, spellSlotsAt, pactSlotsAt, CANTRIP_COUNTS } from '../data/classes.js';
import { SPELL_MAP, SPELL_LISTS, cantripDmg } from '../data/spells.js';
import { WEAPONS, ARMORS, SHIELDS, FISTS } from '../data/items.js';
import { FEAT_MAP } from '../data/feats.js';
import { clamp, uid, deepClone } from '../rng.js';

export const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
export const ABILITY_FULL = {
  STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution', INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma',
};
export const SAVE_DC_BASE = 8;

// Town blessings/penalties last until the next long rest (every 3rd floor).
export function townMod(char, kind) {
  return (char.townBuffs || []).reduce((sum, b) => sum + (b.kind === kind ? (b.value || 0) : 0), 0);
}
export function applyTownBuff(char, buff) {
  char.townBuffs = char.townBuffs || [];
  char.townBuffs.push(buff);
}
export function clearTownBuffs(char) { char.townBuffs = []; }

export const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

export function mod(score) { return Math.floor((score - 10) / 2); }

// Does this character earn an ASI (or feat) at the given TOTAL level?
// Base ASI levels are 4/8/12/16/19; fighters add 6 & 14, rogues add 10.
// ASI/feat milestones per class (5e: tied to CLASS level, never character
// level). Everyone: 4/8/12/16/19. Fighters add 6 & 14. Rogues add 10.
export function asiLevelsForClass(classId) {
  const cls = CLASS_MAP[classId];
  const out = ASI_LEVELS.slice();
  if (cls && cls.extraAsi) for (const l of cls.extraAsi) if (!out.includes(l)) out.push(l);
  return out.sort((a, b) => a - b);
}

// Does this character earn an ASI/feat when reaching `level` (projected total
// level)? 5e: only the CLASS that actually levels up can hit ITS milestones.
//   primaryOnly    → the primary class is leveling (normal level-up)
//   secondaryOnly  → the second class is leveling (multiclass level-up)
export function asiAtLevel(char, level, opts = {}) {
  const delta = Math.max(0, level - char.level);
  const checkPrimary = opts.secondaryOnly !== true;
  const checkSecondary = opts.primaryOnly !== true;
  if (checkPrimary && asiLevelsForClass(char.classId).includes(classLevel(char) + delta)) return true;
  if (checkSecondary && char.secondClass && asiLevelsForClass(char.secondClass.classId).includes(char.secondClass.level + delta)) return true;
  return false;
}

export function hasFeat(char, id) {
  return !!(char && char.feats && char.feats.includes(id));
}

// Effective range of a spell for this caster (Spell Sniper extends ranged attack spells)
export function spellRangeFor(char, sp) {
  let r = sp.range || 0;
  if (hasFeat(char, 'spell_sniper') && sp.attack && sp.mode === 'ranged') r = Math.ceil(r * 1.5);
  return r;
}

// Ability score AFTER stat-setting magic items (Amulet of Health, Gauntlets of
// Ogre Power, Headband of Intellect).
export function effectiveAbility(char, ab) {
  if (!char || !char.trinkets) return char ? char.abilities[ab] : 10;
  let v = char.abilities[ab];
  for (const t of char.trinkets) {
    if (t.conSet && ab === 'CON') v = Math.max(v, t.conSet);
    if (t.strSet && ab === 'STR') v = Math.max(v, t.strSet);
    if (t.intSet && ab === 'INT') v = Math.max(v, t.intSet);
  }
  return v;
}
export function proficiency(level) { return PROF_BY_LEVEL[clamp(level, 1, 20)] || 6; }
// Main-class level (char.level = total character level when multiclassed)
export function classLevel(char) { return char.classLevel || char.level; }
export function levelFromXp(xp) {
  let lvl = 1;
  for (let i = 1; i < XP_THRESHOLDS.length; i++) if (xp >= XP_THRESHOLDS[i]) lvl = i + 1;
  return lvl;
}

// ---- Names ----
const FIRST = ['Aldric', 'Bram', 'Cora', 'Dain', 'Elara', 'Fenwick', 'Greta', 'Haldor', 'Isolde', 'Jorund', 'Kael', 'Lyra', 'Maren', 'Nyx', 'Orin', 'Petra', 'Quill', 'Rowan', 'Sable', 'Thorin', 'Ulric', 'Vesper', 'Wren', 'Xara', 'Yorick', 'Zephyr', 'Asha', 'Belthar', 'Cedric', 'Drusilla', 'Ember', 'Faye', 'Garrick', 'Helga', 'Ivar', 'Juniper', 'Kestrel', 'Lucian', 'Mira', 'Nadia', 'Oswald', 'Percival', 'Rhea', 'Sigrid', 'Tamsin', 'Ursula', 'Viktor', 'Willow', 'Ysolde'];
const LAST = ['Ashwood', 'Blackthorn', 'Coppervein', 'Duskwalker', 'Emberfall', 'Frost', 'Greyhawk', 'Hollow', 'Ironfoot', 'Jade', 'Kettle', 'Lowhill', 'Mistral', 'Nettle', 'Oakhollow', 'Proudmore', 'Quick', 'Redmantle', 'Storm', 'Thistle', 'Underhill', 'Vale', 'Whitlock', 'Yellowleaf', 'Zabruder'];

export function randomName(rng) {
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}

export const PERSONALITIES = ['Bold', 'Cautious', 'Greedy', 'Noble', 'Sarcastic', 'Doomed', 'Cheerful', 'Grim', 'Curious', 'Vengeful'];

// ---- Character creation ----
// scorePool: array of 6 values (standard array) to be placed on abilities.
export function applyRacialMagic(char) {
  const race = char.race || RACE_MAP[char.raceId];
  if (!race) return;
  char.featCantrips = char.featCantrips || [];
  char.featSpells = char.featSpells || [];
  char.featCasts = char.featCasts || {};
  char.spellsKnown = char.spellsKnown || [];
  for (const sid of (race.bonusCantrips || [])) {
    if (!SPELL_MAP[sid]) continue;
    if (!char.spellsKnown.includes(sid)) char.spellsKnown.push(sid);
    if (!char.featCantrips.includes(sid)) char.featCantrips.push(sid);
  }
  for (const sid of (race.racialSpells || [])) {
    if (!SPELL_MAP[sid]) continue;
    if (!char.spellsKnown.includes(sid)) char.spellsKnown.push(sid);
    if (!char.featSpells.includes(sid)) char.featSpells.push(sid);
    if (char.featCasts[sid] !== false) char.featCasts[sid] = true;
  }
  if (race.dragonType) char.dragonType = race.dragonType;
  if (race.breathShape) char.breathShape = race.breathShape;
  if (race.naturallyStealthy) char.naturallyStealthy = true;
  if (race.maskOfTheWild) char.maskOfTheWild = true;
}

export function createCharacter({ raceId, classId, name, subclassId, scoreAssign, level = 1, hero = false, rng, racialChoices = null }) {
  const race = RACE_MAP[raceId];
  const cls = CLASS_MAP[classId];
  const abilities = baseAbilityScores();
  // scoreAssign holds FINAL ability scores (standard array values)
  for (const ab of ABILITIES) abilities[ab] = scoreAssign[ab] || 10;

  const char = {
    id: uid(),
    name, raceId, classId, subclassId: subclassId === undefined ? Object.keys(cls.subclasses)[0] : subclassId,
    hero,
    level,
    classLevel: level, // level in the primary class (level = total)
    xp: XP_THRESHOLDS[Math.min(level, 20) - 1] || 0,
    abilities,
    race,
    cls,
    skills: [],
    skillExpertise: [],
    features: [],
    spellsKnown: [],
    spellSlots: [],
    pactSlots: [],
    spellSlotsUsed: [],
    pactSlotsUsed: 0,
    resources: {},       // per-floor resources: rage, secondWind, etc.
    weapon: { base: 'dagger', enchant: null },
    offhand: null,
    armor: 'none',
    shield: false,
    trinkets: [],        // equipped magic trinkets
    gearBag: [],         // carried-but-not-equipped gear (weapons/armor/trinkets)
    inventory: [],       // temporary (run) items
    persistentItems: [], // persistent items brought into the run
    gold: 0,
    hp: 1, maxHp: 1, tempHp: 0,
    statuses: [],        // conditions with durations
    buffs: [],           // floor/duration-long effects
    dead: false, deathRound: null, deathSpot: null,
    rested: true,
    personality: hero ? 'The Hero' : rng.pick(PERSONALITIES),
    wildShaped: false,
    size: race.size || 'Medium',
    vision: race.superiorDarkvision ? 24 : (race.darkvision ? 12 : 8),
  };

  // Racial ASIs
  for (const [ab, val] of Object.entries(race.asi || {})) abilities[ab] += val;
  const choices = racialChoices || {};
  if (race.variantHuman) {
    let asiPicks = Array.isArray(choices.asi) ? choices.asi.filter(a => ABILITIES.includes(a)) : [];
    asiPicks = [...new Set(asiPicks)].slice(0, 2);
    if (asiPicks.length < 2) {
      const leftover = ABILITIES.filter(a => !asiPicks.includes(a));
      while (asiPicks.length < 2 && leftover.length) asiPicks.push(leftover.shift());
    }
    for (const ab of asiPicks) abilities[ab] += 1;
    char.racialChoices = {
      asi: asiPicks,
      skill: choices.skill || null,
      featId: choices.featId || null,
      featChoice: choices.featChoice || null,
    };
  }
  char.baseAbilities = { ...abilities };

  // Skills
  const skillChoices = (cls.skillChoices && cls.skillChoices.length) ? cls.skillChoices : Object.keys(SKILL_ABILITY);
  const nSkills = cls.skills || 2;
  const picks = rng.shuffle(skillChoices).slice(0, nSkills);
  char.skills = picks;
  if (race.bonusSkills) for (const s of race.bonusSkills) if (!char.skills.includes(s)) char.skills.push(s);
  if (race.variantHuman) {
    const sk = (char.racialChoices && char.racialChoices.skill) || rng.pick(Object.keys(SKILL_ABILITY));
    if (char.racialChoices) char.racialChoices.skill = sk;
    if (!char.skills.includes(sk)) char.skills.push(sk);
  }
  if (classId === 'rogue') {
    const exp = rng.shuffle(Object.keys(SKILL_ABILITY)).slice(0, 2);
    char.skillExpertise = exp;
  }

  // Features from class table up to level
  for (let l = 1; l <= level; l++) {
    const feats = cls.features[l];
    if (feats) for (const f of feats) char.features.push(f);
  }

  // Racial cantrips / once-per-floor spells (High Elf, Drow, Tiefling bloodlines…)
  applyRacialMagic(char);

  // HP
  recomputeDerived(char);

  // Gear by class
  equipClassGear(char);

  // Spellcasting
  initSpellcasting(char);

  // Resources per floor
  initResources(char);

  // Variant Human feat — after the sheet exists so grantFeat can mutate it
  if (race.variantHuman) {
    const featId = (char.racialChoices && char.racialChoices.featId) || 'tough';
    const featChoice = char.racialChoices ? char.racialChoices.featChoice : null;
    if (char.racialChoices) char.racialChoices.featId = featId;
    grantFeat(char, featId, featChoice, rng);
  }

  char.maxHp = computeMaxHp(char);
  char.hp = char.maxHp;
  return char;
}

export function recomputeDerived(char) {
  char.prof = proficiency(char.level);
  char.spellAbility = char.cls.spellAbility;
  const castAbility = char.cls.spellAbility || char.featCastAbility || null;
  char.spellSaveDC = castAbility
    ? SAVE_DC_BASE + char.prof + mod(effectiveAbility(char, castAbility)) + townMod(char, 'spellDC')
    : 0;
  char.spellAttack = castAbility
    ? char.prof + mod(effectiveAbility(char, castAbility)) + townMod(char, 'attack')
    : 0;
  // Monster-style toHit not needed for players
  const cls = char.cls;
  char.attackAbility = cls.id === 'ranger' || cls.id === 'rogue' || cls.id === 'monk' || cls.id === 'bard'
    ? 'DEX' : (['barbarian', 'fighter', 'paladin'].includes(cls.id) ? 'STR' : 'DEX');
}

export function computeMaxHp(char) {
  const cls = char.cls;
  const die = cls.hitDie;
  const conModHere = mod(effectiveAbility(char, 'CON'));
  const avg = Math.ceil(die / 2) + 1;
  let hp = die + conModHere + (classLevel(char) - 1) * (avg + conModHere);
  if (cls.id === 'sorcerer' && char.subclassId === 'draconic') hp += classLevel(char);
  if (hasFeat(char, 'tough')) hp += char.level * 2;
  if (char.race && char.race.hpPerLevel) hp += char.level * char.race.hpPerLevel;
  hp += townMod(char, 'hp') * 5;
  const aid = char.buffs.find(b => b.id === 'aid');
  if (aid) hp += aid.value || 5;
  return Math.max(1, hp);
}

// AC = armor + DEX + shield + class features + items + buffs (no cover; cover added at attack time)
export function computeAc(char, combat) {
  let ac = 10;
  const dex = mod(effectiveAbility(char, 'DEX'));
  const armor = ARMORS[char.armor] || ARMORS.none;
  const armorEnch = char.armorEnchant ? (char.armorEnchant.bonus || 0) : 0;

  const unarmored = !char.armor || char.armor === 'none';
  if (char.cls.id === 'monk' && unarmored && !char.shield) ac = 10 + dex + mod(effectiveAbility(char, 'WIS'));
  else if (char.cls.id === 'barbarian' && unarmored) ac = 10 + dex + mod(effectiveAbility(char, 'CON'));
  else if (char.cls.id === 'sorcerer' && char.subclassId === 'draconic' && unarmored && !char.shield) ac = 13 + dex;
  else {
    ac = armor.ac.base;
    if (armor.ac.dex) ac += Math.min(dex, armor.ac.dexMax);
    if (char.shield) ac += (SHIELDS.shield.acBonus || 2);
  }
  ac += armorEnch;

  // Mage armor overrides when cast and better
  const mageArmor = char.buffs.find(b => b.id === 'mage_armor');
  if (mageArmor && unarmored) ac = Math.max(ac, 13 + dex + armorEnch);

  // Trinkets
  for (const t of char.trinkets) {
    if (t.acBonus) ac += t.acBonus;
  }
  // Buffs
  const haste = char.buffs.find(b => b.id === 'haste');
  if (haste) ac += 2;
  const sof = char.buffs.find(b => b.id === 'shield_of_faith');
  if (sof) ac += 2;
  const slow = char.statuses.find(s => s.id === 'slowed');
  if (slow) ac -= 2;
  if (char.wildShapeForm) ac = char.wildShapeForm.ac; // beast form armor
  // Dual Wielder: +1 AC with a melee weapon and no shield
  if (hasFeat(char, 'dual_wielder') && !char.shield && char.weapon && char.weapon.base !== 'fists') {
    const wd = WEAPONS[char.weapon.base];
    if (wd && wd.range === 'melee') ac += 1;
  }
  ac += townMod(char, 'ac');
  return Math.max(6, ac);
}

export function computeSpeed(char) {
  if (char.stats) return Math.max(1, Math.round((char.speed || 30) / 5) + (char.speedBonus || 0)); // monsters
  if (char.wildShapeForm) return char.wildShapeForm.speed + townMod(char, 'speed');
  let speed = char.race.speed / 5; // feet -> tiles
  if (char.cls.id === 'monk' && classLevel(char) >= 2) speed += 2;
  if (char.cls.id === 'barbarian' && classLevel(char) >= 5) speed += 2;
  if (hasFeat(char, 'mobile')) speed += 2;
  const boots = char.trinkets.find(t => t.speedBonus);
  if (boots) speed += boots.speedBonus;
  const slowed = char.statuses.find(s => s.id === 'slowed');
  if (slowed) speed = Math.max(1, Math.floor(speed / 2));
  if (char.statuses.some(s => s.id === 'restrained' || s.id === 'paralyzed' || s.id === 'stunned' || s.id === 'unconscious')) speed = 0;
  const ray = char.statuses.find(s => s.id === 'slowed_ray');
  if (ray) speed -= 2;
  const entangled = char.statuses.find(s => s.id === 'entangled');
  if (entangled) speed = 0;
  return Math.max(0, speed);
}

export function equipClassGear(char) {
  const c = char.cls.id;
  char.weapon = { base: 'dagger', enchant: null };
  char.armor = 'none';
  char.shield = false;
  char.trinkets = [];
  char.armorEnchant = null;

  const canWear = t => char.cls.armor.includes(t);
  const dex = mod(char.abilities.DEX), str = mod(char.abilities.STR);

  switch (c) {
    case 'barbarian':
      char.weapon = { base: 'greataxe', enchant: null };
      char.armor = 'none'; break;
    case 'fighter': case 'paladin': {
      const useStr = str >= dex;
      char.weapon = { base: useStr ? (c === 'paladin' ? 'longsword' : 'longsword') : 'longsword', enchant: null };
      if (c === 'paladin') char.shield = true;
      char.armor = canWear('heavy') ? 'chain_mail' : (canWear('medium') ? 'scale_mail' : 'leather');
      break;
    }
    case 'ranger':
      char.weapon = { base: 'longbow', enchant: null };
      char.armor = canWear('medium') ? 'scale_mail' : 'leather';
      break;
    case 'rogue':
      char.weapon = { base: 'rapier', enchant: null };
      char.armor = 'leather';
      break;
    case 'monk':
      char.weapon = { base: 'quarterstaff', enchant: null };
      char.armor = 'none';
      break;
    case 'bard': case 'warlock':
      char.weapon = { base: 'rapier', enchant: null };
      char.armor = 'leather';
      break;
    case 'cleric':
      char.weapon = { base: 'mace', enchant: null };
      char.armor = 'scale_mail';
      char.shield = true;
      break;
    case 'druid':
      char.weapon = { base: 'quarterstaff', enchant: null };
      char.armor = 'leather';
      char.shield = true;
      break;
    case 'sorcerer': case 'wizard':
      char.weapon = { base: 'dagger', enchant: null };
      char.armor = 'none';
      break;
  }
  // Swap melee for finesse if DEX higher for melee classes
  const dexMelee = ['rogue', 'ranger', 'bard', 'warlock'];
  if (dexMelee.includes(c) && char.weapon.base !== 'rapier') {
    char.weapon = { base: 'rapier', enchant: null };
  }
}

export function initSpellcasting(char) {
  // feat-granted spells survive spell-list rebuilds (level-ups etc.)
  const featSpells = char.featSpells || [];
  const featCantrips = char.featCantrips || [];
  char.spellsKnown = [];
  char.spellSlots = [];
  char.pactSlots = [];
  char.spellSlotsUsed = [];
  char.pactSlotsUsed = 0;
  for (const sid of [...featCantrips, ...featSpells]) {
    if (SPELL_MAP[sid] && !char.spellsKnown.includes(sid)) char.spellsKnown.push(sid);
  }

  if (!char.cls.spellAbility) return;
  const list = SPELL_LISTS[char.cls.id] || {};
  // cantrips
  const cantrips = (list[1] || []).filter(id => SPELL_MAP[id] && SPELL_MAP[id].level === 0);
  const cantripN = CANTRIP_COUNTS[char.cls.id] ? CANTRIP_COUNTS[char.cls.id](classLevel(char)) : 0;
  char.spellsKnown.push(...cantrips.slice(0, cantripN));

  // leveled spells up to castable level
  const maxLvl = highestSpellLevel(char);
  for (const [lvlStr, ids] of Object.entries(list)) {
    const lvl = Number(lvlStr);
    if (lvl < 1 || lvl > maxLvl) continue;
    for (const id of ids) {
      const sp = SPELL_MAP[id];
      if (sp && sp.level > 0 && sp.level <= maxLvl && !char.spellsKnown.includes(id)) char.spellsKnown.push(id);
    }
  }
  // prepared casters (cleric/druid/wizard) pick their daily list
  if (['cleric', 'druid', 'wizard'].includes(char.cls.id)) {
    const cap = Math.max(1, classLevel(char) + mod(char.abilities[char.cls.spellAbility]));
    char.preparedSpells = char.spellsKnown
      .filter(id => SPELL_MAP[id] && SPELL_MAP[id].level > 0)
      .slice(0, cap);
  }
  // slot tracking
  if (char.cls.warlock) {
    char.pactSlots = pactSlotsAt(classLevel(char)).filter((v, i) => v > 0).map((count, i) => ({ level: i + 1, max: count }));
    char.pactSlotsUsed = 0;
    char.spellSlots = [];
    char.spellSlotsUsed = [];
  } else {
    char.spellSlots = spellSlotsAt(char.cls.id, classLevel(char));
    char.spellSlotsUsed = char.spellSlots.map(() => 0);
  }
}

export function highestSpellLevel(char) {
  if (!char.cls.spellAbility) return 0;
  if (char.cls.warlock) {
    const arr = pactSlotsAt(classLevel(char));
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] > 0) return i + 1;
    return 0;
  }
  const arr = char.cls.fullCaster ? spellSlotsAt('sorcerer', classLevel(char)) : spellSlotsAt(char.cls.id, classLevel(char));
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] > 0) return i + 1;
  return 0;
}

export function initResources(char) {
  const lvl = classLevel(char);
  char.resources = {};
  switch (char.cls.id) {
    case 'barbarian':
      char.resources.rage = { max: lvl >= 20 ? 99 : lvl >= 17 ? 6 : lvl >= 12 ? 5 : lvl >= 6 ? 4 : lvl >= 3 ? 3 : 2, cur: 0 };
      char.resources.rage.cur = char.resources.rage.max;
      break;
    case 'fighter':
      char.resources.secondWind = { max: 1, cur: 1 };
      char.resources.actionSurge = { max: lvl >= 17 ? 2 : 1, cur: lvl >= 17 ? 2 : 1 };
      if (char.subclassId === 'battle_master') char.resources.superiority = { max: 4, cur: 4 };
      break;
    case 'monk':
      char.resources.ki = { max: lvl >= 2 ? lvl : 0, cur: lvl >= 2 ? lvl : 0 };
      break;
    case 'paladin':
      char.resources.layOnHands = { max: lvl * 5, cur: lvl * 5 };
      char.resources.channelDivinity = { max: 1, cur: 1 };
      break;
    case 'cleric':
      char.resources.channelDivinity = { max: 1, cur: 1 };
      break;
    case 'sorcerer':
      char.resources.sorceryPoints = { max: lvl, cur: lvl };
      if (char.subclassId === 'wild') char.resources.tidesOfChaos = { max: 1, cur: 1 };
      break;
    case 'druid':
      char.resources.wildShape = { max: 2, cur: 2 };
      if (char.subclassId === 'land') char.resources.naturalRecovery = { max: 1, cur: 1 };
      break;
    case 'wizard':
      char.resources.arcaneRecovery = { max: 1, cur: 1 };
      break;
    case 'ranger':
      break;
    case 'rogue':
      break;
    case 'bard':
      char.resources.bardicInspiration = { max: clamp(mod(char.abilities.CHA), 1, 5), cur: clamp(mod(char.abilities.CHA), 1, 5) };
      break;
    case 'warlock':
      break;
  }
  // racial once-per-floor
  if (isRaceFamily(char, 'dragonborn')) char.resources.breathWeapon = { max: 1, cur: 1 };
  if (isRaceFamily(char, 'half_orc')) char.resources.relentlessEndurance = { max: 1, cur: 1 };
  // multiclass resources
  initMulticlassResources(char);
  // feat resources
  if (hasFeat(char, 'lucky')) char.resources.luck = { max: 3, cur: 3 };
}

// ---- Leveling ----
export function levelUpCharacter(char, rng, choices) {
  if (char.level >= 20) return [];
  char.level += 1;
  char.classLevel = (char.classLevel || char.level - 1) + 1;
  const gained = [];
  const cls = char.cls;
  const cl = classLevel(char);
  const feats = cls.features[cl];
  if (feats) { for (const f of feats) char.features.push(f); gained.push(...feats); }

  if (asiAtLevel(char, char.level, { primaryOnly: true })) {
    if (choices && choices.feat) {
      // a feat was taken instead of the ASI — nothing to allocate
    } else if (choices && choices.asi) {
      const targets = choices.asi;
      if (targets.length === 1) {
        char.abilities[targets[0]] += 2;
        gained.push(`Ability Score Increase (+2 ${targets[0]})`);
      } else {
        for (const t of targets) char.abilities[t] += 1;
        gained.push(`Ability Score Increase (+1 ${targets.join(', +1 ')})`);
      }
    } else {
      char.pendingAsi = true; // the player allocates it later
      gained.push('Ability Score Increase (points to allocate)');
    }
  }

  if (char.cls.spellAbility) {
    const before = char.spellsKnown.slice();
    initSpellcasting(char);
    // allow picking one extra spell if choices provide it
    if (choices && choices.spell && !char.spellsKnown.includes(choices.spell)) {
      char.spellsKnown.push(choices.spell);
      gained.push(`Learned: ${SPELL_MAP[choices.spell].name}`);
    } else {
      char.pendingSpellChoice = true; // a bonus spell the player may select
      const newly = char.spellsKnown.filter(s => !before.includes(s));
      if (newly.length) gained.push(`New spells: ${newly.map(s => SPELL_MAP[s].name).join(', ')}`);
    }
  }
  // subclass path opens at level 3 (unless already chosen at level 1)
  if (classLevel(char) >= 3 && !char.subclassId) char.pendingSubclass = true;
  initResources(char);
  recomputeDerived(char);
  char.maxHp = computeMaxHp(char);
  return gained;
}

export function clearPendingChoices(char) {
  char.pendingAsi = false;
  char.pendingSpellChoice = false;
  char.pendingSubclass = false;
  char.pendingLevelUp = false;
}

// Highest castable spell level for a class at the given class level
export function spellMaxLevelFor(cls, lvl) {
  if (cls.fullCaster) return [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9][lvl - 1] || 0;
  if (cls.halfCaster) return [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5][lvl - 1] || 0;
  if (cls.warlock) return [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5][lvl - 1] || 0;
  return 0;
}

// Grant a secondary class's basic kit (used by multiclassing)
export function initMulticlassResources(char) {
  if (!char.secondClass) return;
  const cls = CLASS_MAP[char.secondClass.classId];
  const lvl = char.secondClass.level;
  const res = char.resources || (char.resources = {});
  if (cls.id === 'fighter') {
    res.secondWind = { max: 1, cur: 1 };
    res.actionSurge = { max: lvl >= 17 ? 2 : 1, cur: lvl >= 17 ? 2 : 1 };
  } else if (cls.id === 'barbarian') {
    res.rage = { max: lvl >= 3 ? 3 : 2, cur: lvl >= 3 ? 3 : 2 };
  } else if (cls.id === 'monk' && lvl >= 2) {
    res.ki = { max: lvl, cur: lvl };
  } else if (cls.id === 'paladin') {
    res.layOnHands = { max: lvl * 5, cur: lvl * 5 };
  } else if (cls.id === 'cleric' && lvl >= 2) {
    res.channelDivinity = { max: 1, cur: 1 };
  } else if (cls.id === 'sorcerer') {
    res.sorceryPoints = { max: lvl, cur: lvl };
  } else if (cls.id === 'bard') {
    res.bardicInspiration = { max: clamp(mod(char.abilities.CHA), 1, 5), cur: clamp(mod(char.abilities.CHA), 1, 5) };
  } else if (cls.id === 'wizard') {
    res.arcaneRecovery = { max: 1, cur: 1 };
  }
}

function mergeMulticlassSpellSlots(char, cls) {
  if (cls.warlock) {
    if (!char.pactSlots || !char.pactSlots.length) {
      char.pactSlots = pactSlotsAt(char.secondClass.level).filter((v, i) => v > 0).map((count, i) => ({ level: i + 1, max: count }));
      char.pactSlotsUsed = 0;
    }
    return;
  }
  const other = cls.fullCaster
    ? spellSlotsAt('sorcerer', char.secondClass.level)
    : spellSlotsAt(cls.id, char.secondClass.level);
  for (let i = 0; i < other.length; i++) {
    char.spellSlots[i] = Math.max(char.spellSlots[i] || 0, other[i]);
  }
  char.spellSlotsUsed = char.spellSlots.map(() => 0);
}

// Take a level in another class (simplified 5e multiclassing).
export function multiclassInto(char, classId, rng) {
  const cls = CLASS_MAP[classId];
  if (!cls || char.level >= 20) return false;
  if (char.secondClass && char.secondClass.classId === classId) {
    char.secondClass.level += 1;
  } else {
    char.secondClass = { classId, level: 1 };
  }
  char.level += 1; // total character level
  // HP: average of the new class's hit die + CON
  const avg = Math.ceil(cls.hitDie / 2) + 1;
  const gain = avg + mod(char.abilities.CON);
  char.maxHp += gain;
  char.hp = Math.min(char.hp + gain, char.maxHp);
  // features of the secondary class at its level
  const feats = cls.features[char.secondClass.level];
  if (feats) for (const f of feats) char.features.push(`[${cls.name}] ${f}`);
  initMulticlassResources(char);
  // spellcasting from the secondary class
  if (cls.spellAbility && SPELL_LISTS[classId]) {
    const maxLvl = spellMaxLevelFor(cls, char.secondClass.level);
    for (const [lvlStr, ids] of Object.entries(SPELL_LISTS[classId])) {
      const lvl = Number(lvlStr);
      if (lvl >= 1 && lvl <= maxLvl) {
        for (const id of ids) {
          const sp = SPELL_MAP[id];
          if (sp && sp.level > 0 && sp.level <= maxLvl && !char.spellsKnown.includes(id)) char.spellsKnown.push(id);
        }
      }
    }
    mergeMulticlassSpellSlots(char, cls);
  }
  if (asiAtLevel(char, char.level, { secondaryOnly: true })) char.pendingAsi = true;
  recomputeDerived(char);
  return true;
}

export function defaultAsiTargets(char) {
  if (char.cls.spellAbility) {
    const sa = char.cls.spellAbility;
    const others = ABILITIES.filter(a => a !== sa && a !== 'CON');
    return [sa, 'CON'];
  }
  const primary = ['barbarian', 'fighter', 'paladin', 'ranger'].includes(char.cls.id) ? 'STR' : 'DEX';
  return [primary, 'CON'];
}

// ---- Attack / damage helpers ----
export function weaponIsFinesse(weaponId) { return (WEAPONS[weaponId] || FISTS).properties.includes('finesse'); }
export function weaponIsRanged(weaponId) { return (WEAPONS[weaponId] || FISTS).range.startsWith('ranged'); }
export function weaponIsThrown(weaponId) {
  const w = WEAPONS[weaponId]; if (!w) return false;
  return w.properties.some(p => p.startsWith('thrown'));
}

export function weaponStatFor(char, weaponId) {
  const w = WEAPONS[weaponId] || FISTS;
  if (w.range.startsWith('ranged')) return 'DEX';
  if (w.properties.includes('finesse')) return mod(char.abilities.DEX) >= mod(char.abilities.STR) ? 'DEX' : 'STR';
  return 'STR';
}

export function attackBonusFor(char, weaponId, combat) {
  const w = WEAPONS[weaponId] || FISTS;
  let stat = weaponStatFor(char, weaponId);
  // Martial Arts: monks may use DEX for unarmed strikes
  if (char.cls && char.cls.id === 'monk' && weaponId === 'fists') stat = 'DEX';
  let bonus = char.prof + mod(effectiveAbility(char, stat)) + townMod(char, 'attack');
  const enchant = char.weapon && char.weapon.base === weaponId ? char.weapon.enchant : null;
  if (enchant && enchant.bonus) bonus += enchant.bonus;
  const wdef = WEAPONS[weaponId];
  if (wdef && wdef.legendary && wdef.bonus) bonus += wdef.bonus;
  // proficiency with the weapon?
  if (!isProficientWithWeapon(char, weaponId)) bonus -= char.prof;
  if (char.subclassId === 'devotion' && combat && combat.sacredWeaponActive && combat.sacredWeaponActive.has(char.id)) bonus += mod(char.abilities.CHA);
  const bless = char.buffs.find(b => b.id === 'bless'); // applied as die at roll time
  return bonus;
}

export function isProficientWithWeapon(char, weaponId) {
  const w = WEAPONS[weaponId] || FISTS;
  if (weaponId === 'fists') return true;
  const cls = char.cls;
  if (cls.weapons.includes('martial')) return true;
  if (cls.weapons.includes('simple') && w.type === 'simple') return true;
  if (cls.weapons.includes('shortsword') && (weaponId === 'shortsword' || w.properties.includes('finesse') && w.properties.includes('light'))) return true;
  // monk simple weapons + shortsword
  if (cls.id === 'monk' && (w.type === 'simple' || weaponId === 'shortsword')) return true;
  // rogue: simple + hand crossbow, longsword, rapier, shortsword
  if (cls.id === 'rogue' && (w.type === 'simple' || ['rapier', 'shortsword', 'longsword', 'hand_crossbow'].includes(weaponId))) return true;
  // druid: club dagger dart javelin mace quarterstaff scimitar sickle sling spear
  if (cls.id === 'druid' && ['club', 'dagger', 'dart', 'javelin', 'mace', 'quarterstaff', 'scimitar', 'sickle', 'sling', 'spear'].includes(weaponId)) return true;
  // wizard: dagger dart sling quarterstaff light crossbow
  if (cls.id === 'wizard' && ['dagger', 'dart', 'sling', 'quarterstaff', 'light_crossbow'].includes(weaponId)) return true;
  return false;
}

export function weaponDiceFor(char, weaponId) {
  let dice = (WEAPONS[weaponId] || FISTS).dmg;
  if (char.cls.id === 'monk' && weaponId === 'fists') {
    dice = classLevel(char) >= 17 ? '1d10' : classLevel(char) >= 11 ? '1d8' : classLevel(char) >= 5 ? '1d6' : '1d4';
  }
  // Tavern Brawler: unarmed strikes hit at least as hard as a d4
  if (hasFeat(char, 'tavern_brawler') && weaponId === 'fists' && dice === '1') dice = '1d4';
  return dice;
}

export function sneakAttackDice(char) {
  if (char.cls.id !== 'rogue') return 0;
  return Math.ceil(classLevel(char) / 2);
}

export function isFinesseOrRanged(char, weaponId) {
  const w = WEAPONS[weaponId] || FISTS;
  return w.properties.includes('finesse') || w.range.startsWith('ranged');
}

// 5e Passive score = 10 + skill modifier. Observant adds +5 to passive
// Perception and Investigation only (not to the active check).
export function passiveScore(char, skill) {
  let score = 10;
  try { score += skillMod(char, skill); } catch (e) {
    const ab = SKILL_ABILITY[skill];
    if (char && char.abilities && ab) score += mod(char.abilities[ab]);
  }
  if (hasFeat(char, 'observant') && (skill === 'Perception' || skill === 'Investigation')) score += 5;
  return score;
}

export function passivePerception(who) {
  const c = who && who.char ? who.char : who;
  if (!c) return 10;
  if (c.stats) {
    let pp = 10 + mod(c.stats.WIS || 10);
    if ((c.powers || []).includes('keen_senses')) pp += 5;
    return pp;
  }
  let pp = 10;
  try { pp = passiveScore(c, 'Perception'); } catch (e) {
    if (c.abilities) pp = 10 + mod(c.abilities.WIS || 10);
  }
  if ((c.powers || []).includes('keen_senses')) pp += 5;
  return pp;
}

export function skillMod(char, skill) {
  const ab = SKILL_ABILITY[skill];
  let m = mod(effectiveAbility(char, ab));
  if (char.skills.includes(skill)) m += char.prof;
  if (char.skillExpertise.includes(skill)) m += char.prof;
  if (char.cls.id === 'bard' && classLevel(char) >= 2 && !char.skills.includes(skill)) m += Math.floor(char.prof / 2); // Jack of All Trades
  return m;
}

export function savingThrowMod(char, ability) {
  let m = mod(effectiveAbility(char, ability));
  if (char.cls.saves.includes(ability)) m += char.prof;
  const cloak = char.trinkets.find(t => t.saveBonus);
  if (cloak) m += cloak.saveBonus;
  if (char.featSaves && char.featSaves.includes(ability)) m += char.prof; // Resilient
  m += townMod(char, 'saves');
  if (char.saveBonus) m += char.saveBonus; // Tymora's Lucky Coin (persistent relic)
  if (char.statuses.some(s => s.id === 'paralyzed' || s.id === 'stunned')) m = -99; // auto-fail STR/DEX in 5e; simplified to all
  return m;
}

// Short rest: spend hit dice
export function shortRest(char, rng, log) {
  let healed = 0;
  if (char.dead) return 0;
  const conMod = mod(char.abilities.CON);
  for (let i = 0; i < Math.min(char.level, char.hitDiceLeft || char.level); i++) {
    const roll = rng.int(1, char.cls.hitDie);
    healed += roll + conMod;
  }
  char.hitDiceLeft = Math.max(0, (char.hitDiceLeft || char.level) - char.level);
  const before = char.hp;
  char.hp = clamp(char.hp + healed, 0, char.maxHp);
  if (log) log(`${char.name} rests briefly and recovers ${char.hp - before} HP.`);
  return char.hp - before;
}

export function longRestParty(party, rng, log) {
  for (const c of party) {
    if (c.dead) continue;
    c.hp = c.maxHp;
    c.tempHp = 0;
    c.statuses = [];
    c.buffs = [];
    c.spellSlotsUsed = c.spellSlots.map(() => 0);
    c.pactSlotsUsed = 0;
    c.hitDiceLeft = c.level;
    initResources(c);
    c.wildShaped = false;
    if (log) log(`${c.name} is fully rested.`);
  }
}

export function listCantripsKnown(char) {
  return char.spellsKnown.filter(id => SPELL_MAP[id] && SPELL_MAP[id].level === 0);
}
export function listLeveledSpellsKnown(char) {
  return char.spellsKnown.filter(id => SPELL_MAP[id] && SPELL_MAP[id].level > 0);
}

export function canCastSpell(char, spellId) {
  const sp = SPELL_MAP[spellId];
  if (!sp) return false;
  if (!char.spellsKnown.includes(spellId)) return false;
  if (char.preparedSpells && sp.level > 0 && !char.preparedSpells.includes(spellId)) return false;
  // feat-granted spells can be cast once per floor without a slot
  if (char.featCasts && char.featCasts[spellId]) return true;
  if (sp.level === 0) return true;
  if (char.cls.warlock) {
    if (char.pactSlotsUsed >= char.pactSlots.length) return false;
    return highestSpellLevel(char) >= sp.level;
  }
  if (!char.spellSlots || char.spellSlots.length < sp.level) return false;
  // any slot of the spell's level OR HIGHER counts (upcasting)
  for (let i = sp.level - 1; i < char.spellSlots.length; i++) {
    if (char.spellSlots[i] > (char.spellSlotsUsed[i] || 0)) return true;
  }
  return false;
}

export function spellSlotSummary(char) {
  if (char.cls.warlock) {
    const lvl = highestSpellLevel(char);
    const used = char.pactSlotsUsed;
    const max = char.pactSlots.length;
    return lvl ? `${max - used}/${max} × ${ord(lvl)}` : '—';
  }
  const parts = [];
  for (let i = 0; i < char.spellSlots.length; i++) {
    const max = char.spellSlots[i];
    if (!max) continue;
    const used = char.spellSlotsUsed[i] || 0;
    parts.push(`${i + 1}:[${max - used}]`);
  }
  return parts.join(' ') || '—';
}

function ord(n) { return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th'); }

// ---- Monster instantiation ----
export function buildMonster(template, elite) {
  const m = deepClone(template);
  m.id = uid(); // unique instance id (used by combat targeting)
  m.templateId = template.id; // canonical monster id (used by the ART loader!)
  m.acBonus = 0; m.toHitBonus = 0; m.dmgBonus = 0; m.speedBonus = 0; m.critRange = 20; m.maxHpMult = 1;
  m.eliteTrait = null;
  if (elite) {
    m.eliteTrait = elite;
    elite.apply(m);
  }
  m.hpMult = m.hpMult || 1;
  return m;
}

export function rollMonsterHp(m, rng) {
  const match = m.hp.match(/^(\d+)d(\d+)(?:\+(\d+))?$/);
  let hp = 0;
  if (match) {
    const n = Number(match[1]), d = Number(match[2]), bonus = Number(match[3] || 0);
    for (let i = 0; i < n; i++) hp += rng.int(1, d);
    hp += bonus;
  } else {
    hp = 10; // fallback
  }
  hp = Math.max(1, Math.round(hp * (m.hpMult || 1)));
  m.maxHp = hp;
  m.hp = hp;
  return hp;
}

export function monsterMod(m, ab) { return mod(m.stats[ab]); }

// ---------------- WILD SHAPE ----------------
export const WILD_SHAPES = {
  bear: {
    id: 'bear', name: 'Brown Bear', hp: 34, ac: 11, speed: 6, cr: 1,
    sprite: 'bear',
    attacks: [
      { name: 'Bite', toHit: 5, dmg: '1d8+4', dmgType: 'piercing', range: 1 },
      { name: 'Claws', toHit: 5, dmg: '2d6+4', dmgType: 'slashing', range: 1 },
    ],
    multi: 2,
    desc: 'A hulking brown bear. Powerful claws and a crushing bite.',
  },
  dire_wolf: {
    id: 'dire_wolf', name: 'Dire Wolf', hp: 37, ac: 14, speed: 8, cr: 1,
    sprite: 'wolf',
    attacks: [
      { name: 'Bite', toHit: 5, dmg: '2d6+3', dmgType: 'piercing', range: 1, fx: 'trip_dc13' },
    ],
    multi: 1,
    desc: 'A wolf the size of a horse. Its bite can knock a foe prone.',
  },
  wolf: {
    id: 'wolf', name: 'Wolf', hp: 11, ac: 13, speed: 8, cr: 0.25,
    sprite: 'wolf',
    attacks: [
      { name: 'Bite', toHit: 4, dmg: '2d4+2', dmgType: 'piercing', range: 1, fx: 'trip_dc11' },
    ],
    multi: 1,
    desc: 'A swift grey wolf with a tripping bite.',
  },
  giant_spider: {
    id: 'giant_spider', name: 'Giant Spider', hp: 26, ac: 14, speed: 6, cr: 1,
    sprite: 'spider',
    attacks: [
      { name: 'Bite', toHit: 5, dmg: '1d8+3', dmgType: 'piercing', range: 1, fx: 'poison_dc11' },
    ],
    multi: 1,
    desc: 'A venomous spider the size of a wolf.',
  },
  badger: {
    id: 'badger', name: 'Giant Badger', hp: 13, ac: 10, speed: 6, cr: 0.25,
    sprite: 'badger',
    attacks: [
      { name: 'Bite', toHit: 3, dmg: '1d6+1', dmgType: 'piercing', range: 1 },
    ],
    multi: 1,
    desc: 'A ferocious burrowing badger. Small but furious.',
  },
  cat: {
    id: 'cat', name: 'Cat', hp: 2, ac: 12, speed: 8, cr: 0,
    sprite: 'cat',
    attacks: [
      { name: 'Claws', toHit: 0, dmg: '1', dmgType: 'slashing', range: 1 },
    ],
    multi: 1,
    desc: 'A common house cat. For scouting, not fighting.',
  },
  rat: {
    id: 'rat', name: 'Giant Rat', hp: 7, ac: 12, speed: 6, cr: 0.125,
    sprite: 'rat',
    attacks: [
      { name: 'Bite', toHit: 4, dmg: '1d4+2', dmgType: 'piercing', range: 1 },
    ],
    multi: 1,
    desc: 'A cunning sewer rat. Good for slipping through tight spaces.',
  },
};

export function wildShapeFormsFor(char) {
  if (char.subclassId === 'moon') {
    const forms = ['bear', 'wolf', 'giant_spider', 'badger'];
    if (classLevel(char) >= 6) forms.unshift('dire_wolf');
    return forms;
  }
  // Circle of the Land: weaker forms
  if (classLevel(char) >= 4) return ['wolf', 'badger', 'cat'];
  return ['badger', 'cat', 'rat'];
}


// ============================== EQUIPMENT MANAGEMENT ==============================
function namedGear(def, enchant) {
  if (!enchant) return def.name;
  const m = enchant.name.match(/^\+(\d+)\s+(\w+)$/);
  if (m) return `+${m[1]} ${def.name}`;
  return `${enchant.name} ${def.name}`;
}

// Turn an equipped slot into a carryable gear instance (null if empty).
export function gearInstanceOf(char, slot, index = 0) {
  if (slot === 'weapon') {
    if (!char.weapon || char.weapon.base === 'fists') return null;
    const def = WEAPONS[char.weapon.base];
    if (!def) return null;
    const en = char.weapon.enchant || null;
    return { uid: uid(), id: def.id, kind: 'weapon', persistent: false, name: namedGear(def, en), desc: '', def, enchant: en };
  }
  if (slot === 'armor') {
    if (!char.armor || char.armor === 'none') return null;
    const def = ARMORS[char.armor];
    if (!def) return null;
    const en = char.armorEnchant || null;
    return { uid: uid(), id: def.id, kind: 'armor', persistent: false, name: namedGear(def, en), desc: '', def, enchant: en };
  }
  if (slot === 'trinket') {
    const t = char.trinkets[index];
    if (!t) return null;
    return { uid: uid(), id: t.id, kind: 'trinket', persistent: false, name: t.name, desc: t.desc || '', def: t, enchant: null };
  }
  return null;
}

// Equip / unequip gear. Pure character-sheet mutation (no combat cost here —
// the turn executor spends the action point). Returns {ok, msg, old, item}.
export function changeGearChar(char, type, action = {}) {
  const bag = char.gearBag || (char.gearBag = []);
  const findBag = (uid2, kind) => bag.findIndex(i => i.uid === uid2 && i.kind === kind);
  switch (type) {
    case 'equip_weapon': {
      const idx = findBag(action.itemUid, 'weapon');
      if (idx < 0) return { ok: false, msg: 'Weapon not in your pack.' };
      const item = bag.splice(idx, 1)[0];
      const old = gearInstanceOf(char, 'weapon');
      if (old) bag.push(old);
      char.weapon = { base: item.id, enchant: item.enchant ? deepClone(item.enchant) : null };
      recomputeDerived(char);
      return { ok: true, msg: `Equipped ${item.name}.`, old, item };
    }
    case 'unequip_weapon': {
      const old = gearInstanceOf(char, 'weapon');
      if (!old) return { ok: false, msg: 'No weapon equipped.' };
      bag.push(old);
      char.weapon = { base: 'fists', enchant: null };
      recomputeDerived(char);
      return { ok: true, msg: `Took off ${old.name}.`, old, item: null };
    }
    case 'equip_armor': {
      const idx = findBag(action.itemUid, 'armor');
      if (idx < 0) return { ok: false, msg: 'Armor not in your pack.' };
      const item = bag.splice(idx, 1)[0];
      const old = gearInstanceOf(char, 'armor');
      if (old) bag.push(old);
      char.armor = item.id;
      char.armorEnchant = item.enchant ? deepClone(item.enchant) : null;
      recomputeDerived(char);
      return { ok: true, msg: `Donned ${item.name}.`, old, item };
    }
    case 'unequip_armor': {
      const old = gearInstanceOf(char, 'armor');
      if (!old) return { ok: false, msg: 'No armor equipped.' };
      bag.push(old);
      char.armor = 'none';
      char.armorEnchant = null;
      recomputeDerived(char);
      return { ok: true, msg: `Removed ${old.name}.`, old, item: null };
    }
    case 'equip_trinket': {
      const idx = findBag(action.itemUid, 'trinket');
      if (idx < 0) return { ok: false, msg: 'Trinket not in your pack.' };
      const item = bag.splice(idx, 1)[0];
      if (char.trinkets.length >= 3) {
        const out = gearInstanceOf(char, 'trinket', 0);
        if (out) bag.push(out);
        char.trinkets.shift();
      }
      char.trinkets.push(deepClone(item.def));
      recomputeDerived(char);
      return { ok: true, msg: `Attuned to ${item.name}.`, old: null, item };
    }
    case 'unequip_trinket': {
      const i = action.index !== undefined ? action.index : 0;
      const out = gearInstanceOf(char, 'trinket', i);
      if (!out) return { ok: false, msg: 'No trinket there.' };
      char.trinkets.splice(i, 1);
      bag.push(out);
      recomputeDerived(char);
      return { ok: true, msg: `Removed ${out.name}.`, old: out, item: null };
    }
  }
  return { ok: false, msg: 'Unknown gear action.' };
}


// ============================== FEATS ==============================
// Take a feat (replaces an ASI). choice: ability for half-feats, element for
// Elemental Adept, class id for Magic Initiate, or a skill array for Skilled.
export function grantFeat(char, featId, choice, rng) {
  const feat = FEAT_MAP[featId];
  if (!feat || hasFeat(char, featId)) return false;
  char.feats = char.feats || [];
  char.featChoices = char.featChoices || {};
  char.feats.push(featId);
  char.featChoices[featId] = choice || null;

  // half-feats: +1 to the chosen ability
  if (feat.halfAsi && choice && feat.halfAsi.includes(choice)) {
    char.abilities[choice] += 1;
  }
  // Resilient: +1 AND save proficiency
  if (featId === 'resilient' && choice) {
    char.abilities[choice] += 1;
    char.featSaves = char.featSaves || [];
    if (!char.featSaves.includes(choice)) char.featSaves.push(choice);
  }
  // Skilled: three skill proficiencies
  if (featId === 'skilled') {
    const options = Object.keys(SKILL_ABILITY).filter(sk => !char.skills.includes(sk));
    let picks;
    if (Array.isArray(choice) && choice.length === 3) picks = choice;
    else picks = (rng ? rng.shuffle(options) : options.slice().sort(() => Math.random() - 0.5)).slice(0, 3);
    for (const sk of picks) if (!char.skills.includes(sk)) char.skills.push(sk);
    char.featChoices[featId] = picks.join(', ');
  }
  // Magic Initiate: 2 cantrips + 1 first-level spell from the chosen class
  if (featId === 'magic_initiate' && choice) {
    const cls2 = CLASS_MAP[choice];
    if (cls2) char.featCastAbility = cls2.spellAbility || char.featCastAbility || 'INT';
    const list = SPELL_LISTS[choice] || {};
    const pool = (list[1] || []);
    const cants = pool.filter(id => SPELL_MAP[id] && SPELL_MAP[id].level === 0).slice(0, 2);
    const lvl1 = pool.find(id => SPELL_MAP[id] && SPELL_MAP[id].level === 1);
    char.featCantrips = char.featCantrips || [];
    for (const cid of cants) {
      if (!char.spellsKnown.includes(cid)) char.spellsKnown.push(cid);
      if (!char.featCantrips.includes(cid)) char.featCantrips.push(cid);
    }
    if (lvl1) {
      if (!char.spellsKnown.includes(lvl1)) char.spellsKnown.push(lvl1);
      char.featCasts = char.featCasts || {};
      char.featCasts[lvl1] = true; // once per floor, no slot
      char.featSpells = char.featSpells || [];
      if (!char.featSpells.includes(lvl1)) char.featSpells.push(lvl1);
    }
  }
  // Fey Touched: Misty Step + Bless, each free once per floor
  if (featId === 'fey_touched') {
    if (choice) char.featCastAbility = choice || char.featCastAbility;
    for (const sid of ['misty_step', 'bless']) if (!char.spellsKnown.includes(sid)) char.spellsKnown.push(sid);
    char.featCasts = char.featCasts || {};
    char.featCasts.misty_step = true;
    char.featCasts.bless = true;
    char.featSpells = char.featSpells || [];
    for (const sid of ['misty_step', 'bless']) if (!char.featSpells.includes(sid)) char.featSpells.push(sid);
  }
  // Shadow Touched: Invisibility + Hex, each free once per floor
  if (featId === 'shadow_touched') {
    if (choice) char.featCastAbility = choice || char.featCastAbility;
    for (const sid of ['invisibility', 'hex']) if (!char.spellsKnown.includes(sid)) char.spellsKnown.push(sid);
    char.featCasts = char.featCasts || {};
    char.featCasts.invisibility = true;
    char.featCasts.hex = true;
    char.featSpells = char.featSpells || [];
    for (const sid of ['invisibility', 'hex']) if (!char.featSpells.includes(sid)) char.featSpells.push(sid);
  }
  initResources(char);
  recomputeDerived(char);
  char.maxHp = computeMaxHp(char);
  char.hp = Math.min(char.hp, char.maxHp);
  return true;
}
