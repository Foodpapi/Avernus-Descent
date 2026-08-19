// Run & meta progression: floors, locations, loot, hub shop, party levels,
// permadeath, and persistence.

import { makeRng, uid, deepClone, clamp, ordinal, hashString } from '../rng.js';
import { createCharacter, randomName, levelUpCharacter, defaultAsiTargets, recomputeDerived, computeMaxHp, initResources, initSpellcasting, longRestParty, equipClassGear, multiclassInto, clearPendingChoices, skillMod, classLevel, gearInstanceOf, mod, hasFeat, asiAtLevel } from '../5e/rules.js';
export { multiclassInto, clearPendingChoices };
import { RACES, RACE_MAP } from '../data/races.js';
import { CLASSES, CLASS_MAP, ASI_LEVELS } from '../data/classes.js';
import { SPELLS, SPELL_MAP, SPELL_LISTS, cantripDmg } from '../data/spells.js';
import { WEAPONS, ARMORS, ENCHANTMENTS, CONSUMABLES, SHOP_ITEMS, SHOP_ITEM_MAP } from '../data/items.js';
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js';
import { SHOP_TYPES, TOWN_NAMES, TOWN_EVENTS, SPECIAL_GOODS } from '../data/town.js';
import { MONSTERS } from '../data/monsters.js';

export const SAVE_KEY = 'avernus_descent_save_v1';
export const SHARDS_PER_FLOOR = 60;

// ---------- Save / Load ----------
export function defaultMeta() {
  return {
    shards: 80, // starting gift
    shopItems: {}, // id -> owned count
    runs: 0,
    wins: 0,
    bestFloor: 0,
    deaths: 0,
    hero: null,
  };
}

// In-memory fallback for environments where localStorage is unavailable
// (e.g. sandboxed preview iframes) so saves still work within the session.
const memStore = new Map();
function storage() {
  try {
    const k = '__ad_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch (e) {
    return {
      getItem: k => memStore.has(k) ? memStore.get(k) : null,
      setItem: (k, v) => memStore.set(k, String(v)),
      removeItem: k => memStore.delete(k),
    };
  }
}

export function loadSave() {
  try {
    const raw = storage().getItem(SAVE_KEY);
    if (raw) {
      const save = JSON.parse(raw);
      const meta = { ...defaultMeta(), ...(save.meta || {}) };
      return meta;
    }
  } catch (e) { /* ignore */ }
  return defaultMeta();
}

export function persistSave(meta) {
  try {
    storage().setItem(SAVE_KEY, JSON.stringify({ meta }));
  } catch (e) { /* ignore */ }
}

// ---------- Party / companions ----------
export function generateCompanion(rng, level, partyClasses) {
  const usedClasses = new Set(partyClasses);
  const available = CLASSES.filter(c => !usedClasses.has(c.id));
  const cls = available.length ? rng.pick(available) : rng.pick(CLASSES);
  const race = rng.pick(RACES);
  const name = randomName(rng);
  const scoreAssign = autoAssignScores(cls, race, rng);
  // classes whose subclass arrives at level 3 wait for the player's choice
  const level1Subclass = ['cleric', 'sorcerer', 'warlock'].includes(cls.id);
  const sub = level1Subclass ? rng.pick(Object.keys(cls.subclasses)) : null;
  const comp = createCharacter({
    raceId: race.id, classId: cls.id, name,
    subclassId: sub, scoreAssign, level, hero: false, rng,
  });
  if (level >= 3 && !level1Subclass) comp.pendingSubclass = true;
  comp.personality = rng.pick(['Bold', 'Cautious', 'Greedy', 'Noble', 'Sarcastic', 'Doomed', 'Cheerful', 'Grim', 'Curious', 'Vengeful']);
  return comp;
}

export function autoAssignScores(cls, race, rng) {
  const arr = [15, 14, 13, 12, 10, 8];
  const order = [];
  if (cls.spellAbility) order.push(cls.spellAbility);
  else order.push(cls.id === 'rogue' || cls.id === 'monk' || cls.id === 'ranger' || cls.id === 'bard' ? 'DEX' : 'STR');
  order.push('CON');
  const rest = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].filter(a => !order.includes(a));
  order.push(...rest);
  const assign = {};
  order.forEach((ab, i) => { assign[ab] = arr[i]; });
  return assign;
}

export function heroScoreRecommendation(clsId) {
  const cls = CLASS_MAP[clsId];
  const arr = [15, 14, 13, 12, 10, 8];
  const order = [];
  if (cls.spellAbility) order.push(cls.spellAbility);
  else order.push(['rogue', 'monk', 'ranger', 'bard'].includes(clsId) ? 'DEX' : 'STR');
  order.push('CON');
  for (const a of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) if (!order.includes(a)) order.push(a);
  const assign = {};
  order.forEach((ab, i) => { assign[ab] = arr[i]; });
  return assign;
}

// ---------- Runs ----------
export function newRun(meta, hero) {
  const rng = makeRng();
  // ALWAYS reset to the creation baseline first — then apply persistent bonuses
  resetHeroBaseline(hero);
  applyHubGear(hero); // Virgil's configured starting equipment
  const startLevel = meta.shopItems['veterans_manual'] ? 3 : 1;
  // apply the persistent start-level bonus (Veteran's Manual) on the clean level-1 base
  while (hero.level < startLevel) {
    levelUpCharacter(hero, rng, null);
  }
  clearPendingChoices(hero); // pre-run levels need no allocation
  // FULLY READY the hero: hub gear and pre-run level-ups can change max HP and
  // stats, so top up HP, clear temp HP, and refresh every resource & spell slot.
  initResources(hero);
  recomputeDerived(hero);
  hero.maxHp = computeMaxHp(hero);
  hero.hp = hero.maxHp;
  hero.tempHp = 0;
  hero.hitDiceLeft = hero.level;
  const party = [hero];
  const classes = [hero.classId];
  for (let i = 0; i < 3; i++) {
    const comp = generateCompanion(rng, startLevel, classes);
    classes.push(comp.classId);
    party.push(comp);
  }
  // persistent item effects at run start
  const effects = applyPersistentEffects(meta, party);

  const run = {
    id: uid(),
    floor: 1,
    floorsCleared: 0,
    location: null,
    locationHistory: [],
    party,
    roster: party.slice(),      // may grow via town hires (cap 6)
    active: party.map(c => c.id), // lineup that fights (max 4)
    runGold: 60,
    runItems: [], // temporary items shared pool (assigned to heroes' inventories)
    combat: null,
    shardsEarned: 0,
    rng,
    log: [],
    lastLevel: startLevel,
    effects,
    usedTownEvents: new Set(),
    townShop: null,
    townOffers: null,
  };
  for (const c of party) c.townBuffs = [];
  // Alchemist's belt: starting potions
  if (meta.shopItems['potion_belt']) {
    for (let i = 0; i < 2; i++) {
      hero.inventory.push(makeItemInstance('healing_potion', 'consumable'));
    }
  }
  meta.runs++;
  return run;
}

export function applyPersistentEffects(meta, party) {
  const owned = meta.shopItems || {};
  const effects = [];
  const has = id => owned[id] && owned[id] > 0;
  if (has('lucky_coin')) {
    for (const p of party) p.saveBonus = 1;
    effects.push({ id: 'save_bonus', text: "+1 party saves (Tymora's Coin)" });
  }
  if (has('banner_dawn')) effects.push({ id: 'initiative_bonus', text: '+3 initiative (Banner of Dawn)' });
  if (has('enchanted_compass')) effects.push({ id: 'reveal_map', text: 'Maps fully revealed (Compass)' });
  if (has('helm_vigilance')) effects.push({ id: 'no_surprise', text: 'No surprise rounds (Helm of Vigilance)' });
  if (has('pouch_plenty')) effects.push({ id: 'loot_bonus', text: '+1 loot option, +25% shards (Pouch of Plenty)' });
  if (has('wayfarers_map')) effects.push({ id: 'map_choice', text: 'Choose 1 of 3 next locations (Map)' });
  if (has('infernal_contract')) effects.push({ id: 'infernal_contract', text: '+50% shards, +1 enemy per floor (Contract)' });
  if (has('ring_second_chances')) {
    for (const p of party) if (p.hero) { p.hasRingOfSecondChances = true; p.ringUsed = false; }
    effects.push({ id: 'ring_second_chances', text: 'Hero survives one death (Ring)' });
  }
  return effects;
}

export function pickNextLocation(run, meta, forcedId) {
  const has = id => meta.shopItems[id];
  const pool = LOCATIONS.filter(l => {
    if (forcedId) return l.id === forcedId;
    if (run.floor < 6 && l.id === 'avernus') return false;
    if (run.floor < 2 && l.id === 'fey') return false;
    return !run.locationHistory.slice(-2).includes(l.id);
  });
  const candidates = pool.length ? pool : LOCATIONS.filter(l => l.id !== run.location);
  if (has('wayfarers_map') && !forcedId) {
    const picks = run.rng.sample(candidates, 3);
    return { choices: picks, chosen: null };
  }
  const loc = run.rng.pick(candidates);
  return { choices: null, chosen: loc };
}

export function startFloor(run, meta, locId) {
  const loc = LOCATION_MAP[locId];
  run.floor = run.floorsCleared + 1;
  run.location = loc;
  run.locationHistory.push(loc.id);
  return loc;
}

export function floorIsBoss(floor) { return floor % 3 === 0; }

export function shardsForFloor(floor, meta) {
  let s = SHARDS_PER_FLOOR + floor * 10;
  if (meta.shopItems['pouch_plenty']) s = Math.round(s * 1.25);
  if (meta.shopItems['infernal_contract']) s = Math.round(s * 1.5);
  return s;
}

export function levelUpParty(run, meta, choices) {
  const rng = run.rng;
  const results = [];
  for (const c of run.party) {
    if (c.dead) continue;
    if (c.hero) {
      // the hero levels up immediately (multiclass or plain class level)
      if (choices && choices[c.id] && choices[c.id].skip) {
        // already leveled via multiclass — do NOT level the main class too
      } else if (choices && choices[c.id] && choices[c.id].multiclass) {
        multiclassInto(c, choices[c.id].multiclass, rng);
      } else {
        levelUpCharacter(c, rng, choices ? choices[c.id] : null);
      }
      results.push({ char: c, level: c.level });
    } else {
      // companions queue their level-up for the campfire screen
      c.pendingLevelUp = true;
      results.push({ char: c, level: c.level, pending: true });
    }
  }
  run.lastLevel = run.party.filter(c => !c.dead).reduce((mx, c) => Math.max(mx, c.level), 1);
  return results;
}

// ---- Campfire level-up resolution ----
export function hasPendingChoices(c) {
  return !!(c.pendingLevelUp || c.pendingAsi || c.pendingSpellChoice || c.pendingSubclass);
}

export function describePending(c) {
  const parts = [];
  if (c.pendingLevelUp) parts.push('1 level-up to apply');
  if (c.pendingAsi) parts.push('ability score points to allocate');
  if (c.pendingSpellChoice) parts.push('a bonus spell to select');
  if (c.pendingSubclass) parts.push('a new subclass path');
  return parts.join(' · ');
}

export function applyPendingLevelUp(run, charId, choice = {}) {
  const c = run.party.find(x => x.id === charId);
  if (!c || !c.pendingLevelUp || c.level >= 20) return false;
  if (choice.type === 'multiclass' && choice.classId) {
    multiclassInto(c, choice.classId, run.rng);
  } else {
    levelUpCharacter(c, run.rng, { asi: choice.asi, spell: choice.spell });
  }
  c.pendingLevelUp = false;
  if (classLevel(c) >= 3 && !c.subclassId) c.pendingSubclass = true;
  return true;
}

export function applyPendingAsi(run, charId, targets) {
  const c = run.party.find(x => x.id === charId);
  if (!c || !c.pendingAsi || !targets || !targets.length) return false;
  if (targets.length === 1) c.abilities[targets[0]] += 2;
  else targets.forEach(t => { c.abilities[t] += 1; });
  c.pendingAsi = false;
  recomputeDerived(c);
  c.maxHp = computeMaxHp(c);
  c.hp = Math.min(c.hp, c.maxHp);
  return true;
}

export function applyPendingSpell(run, charId, spellId) {
  const c = run.party.find(x => x.id === charId);
  if (!c || !c.pendingSpellChoice || !spellId) return false;
  const sp = SPELL_MAP[spellId];
  if (!sp || c.spellsKnown.includes(spellId)) return false;
  c.spellsKnown.push(spellId);
  c.pendingSpellChoice = false;
  return true;
}

export function applyPendingSubclass(run, charId, subclassId) {
  const c = run.party.find(x => x.id === charId);
  if (!c || !c.pendingSubclass) return false;
  if (!c.cls.subclasses[subclassId]) return false;
  c.subclassId = subclassId;
  c.pendingSubclass = false;
  c.features.push(c.cls.subclasses[subclassId].name);
  initResources(c);
  return true;
}

// Candidate bonus spells for a pending spell choice
export function spellOptionsFor(c, rng) {
  const cls = c.cls;
  if (!cls.spellAbility) return [];
  const maxLvl = c.cls.warlock ? Math.min(5, highestSpellLevelFor(c)) : highestSpellLevelFor(c);
  const candidates = SPELLS.filter(sp =>
    sp.level >= 1 && sp.level <= maxLvl &&
    sp.classes.includes(cls.id) && !c.spellsKnown.includes(sp.id)
  ).map(sp => sp.id);
  return rng.sample(candidates, Math.min(3, candidates.length));
}

function highestSpellLevelFor(c) {
  const cl = classLevel(c);
  if (c.cls.warlock) return cl >= 17 ? 5 : cl >= 13 ? 4 : cl >= 9 ? 3 : cl >= 5 ? 2 : 1;
  return Math.min(9, Math.max(1, Math.ceil(cl / 2)));
}

export function partyLevel(run) {
  return run.party.filter(c => !c.dead).reduce((mx, c) => Math.max(mx, c.level), 1);
}

export function levelUpChoicesFor(char, rng) {
  const newLevel = char.level + 1;
  const newClassLevel = classLevel(char) + 1;
  // class-aware: base 4/8/12/16/19 + fighter 6/14 + rogue 10 — and only the
  // PRIMARY class is leveling here (multiclassing goes through multiclassInto)
  if (asiAtLevel(char, newLevel, { primaryOnly: true })) {
    return { type: 'asi', level: newLevel };
  }
  if (char.cls.spellAbility) {
    const maxLvl = char.cls.fullCaster
      ? [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9][newClassLevel - 1]
      : char.cls.halfCaster ? [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5][newClassLevel - 1]
      : char.cls.warlock ? [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5][newClassLevel - 1]
      : 0;
    const list = SPELL_LISTS[char.cls.id] || {};
    let candidates = [];
    for (const [lvlStr, ids] of Object.entries(list)) {
      const lvl = Number(lvlStr);
      if (lvl >= 1 && lvl <= maxLvl) {
        for (const id of ids) {
          const sp = SPELL_MAP[id];
          if (sp && sp.level > 0 && sp.level <= maxLvl && !char.spellsKnown.includes(id)) candidates.push(id);
        }
      }
    }
    candidates = rng.sample(candidates, Math.min(3, candidates.length));
    return { type: 'spell', level: newLevel, options: candidates };
  }
  return { type: 'none', level: newLevel };
}

// ---------- Loot ----------
export function makeItemInstance(itemId, kind, enchantId) {
  let def = null;
  if (kind === 'weapon') def = WEAPONS[itemId];
  else if (kind === 'armor') def = ARMORS[itemId];
  else if (kind === 'trinket') def = ENCHANTMENTS[itemId];
  else def = CONSUMABLES[itemId];
  if (!def) return null;
  const inst = {
    uid: uid(),
    id: itemId,
    kind,
    persistent: false, // <-- TEMPORARY: wiped when the run ends
    name: def.name,
    desc: def.desc || '',
    def,
    enchant: enchantId ? ENCHANTMENTS[enchantId] : null,
  };
  if (enchantId) {
    const en = ENCHANTMENTS[enchantId];
    const plus = en.name.match(/^\+(\d+)\s+(\w+)$/);
    if (plus) inst.name = `+${plus[1]} ${def.name}`;
    else inst.name = `${en.name} ${def.name}`;
    inst.desc = en.desc;
  }
  return inst;
}

export function rollLoot(run, count, opts = {}) {
  const rng = run.rng;
  const loc = run.location;
  const floor = run.floor;
  const tier = clamp(Math.floor(floor / 3) + 1, 1, 4);
  const boss = opts.boss || floorIsBoss(floor);
  const items = [];
  const n = boss ? count + 1 : count;

  for (let i = 0; i < n; i++) {
    const roll = rng.rand();
    if (roll < 0.4) {
      // consumable
      const rarityPool = floor < 3 ? ['Common', 'Common', 'Uncommon']
        : floor < 6 ? ['Common', 'Uncommon', 'Uncommon', 'Rare']
        : ['Uncommon', 'Uncommon', 'Rare', 'Rare', 'Very Rare'];
      const candidates = Object.values(CONSUMABLES).filter(c => rarityPool.includes(c.rarity));
      const c = rng.pick(candidates);
      items.push(makeItemInstance(c.id, 'consumable'));
    } else if (roll < 0.75) {
      // weapon
      const type = rng.chance(0.5) ? 'simple' : 'martial';
      const wpool = Object.values(WEAPONS).filter(w => w.type === type && !w.legendary);
      let w = rng.pick(wpool);
      // enchant chance
      let enchant = null;
      const enchChance = boss ? 0.8 : 0.15 + floor * 0.06;
      if (rng.chance(Math.min(enchChance, 0.8))) {
        const enchs = Object.values(ENCHANTMENTS).filter(e => e.slot === 'weapon' && e.tier <= Math.min(tier + (boss ? 1 : 0), 3));
        if (enchs.length) enchant = rng.pick(enchs).id;
      }
      items.push(makeItemInstance(w.id, 'weapon', enchant));
    } else {
      // armor or trinket
      if (rng.chance(0.7)) {
        const tiers = floor < 3 ? ['light', 'light', 'medium'] : floor < 6 ? ['light', 'medium', 'medium', 'heavy'] : ['medium', 'heavy', 'heavy'];
        const apool = Object.values(ARMORS).filter(a => a.type !== 'none' && tiers.includes(a.type));
        let a = rng.pick(apool);
        let enchant = null;
        if (rng.chance(Math.min(0.1 + floor * 0.05, 0.6))) {
          const enchs = Object.values(ENCHANTMENTS).filter(e => e.slot === 'armor' && e.tier <= Math.min(tier, 3));
          if (enchs.length) enchant = rng.pick(enchs).id;
        }
        items.push(makeItemInstance(a.id, 'armor', enchant));
      } else {
        const trinkets = Object.values(ENCHANTMENTS).filter(e => e.slot === 'trinket' && e.tier <= Math.min(tier + (boss ? 1 : 0), 3));
        if (trinkets.length) {
          const t = rng.pick(trinkets);
          items.push(makeItemInstance(t.id, 'trinket'));
        } else {
          const c = rng.pick(Object.values(CONSUMABLES).filter(x => x.rarity === 'Uncommon'));
          items.push(makeItemInstance(c.id, 'consumable'));
        }
      }
    }
  }
  // gold
  const gold = 15 + floor * 8 + rng.int(0, 20 + floor * 6);
  return { items, gold };
}

export function applyLoot(run, itemInst, charId) {
  const char = run.party.find(c => c.id === charId) || run.roster.find(c => c.id === charId);
  if (!char) return false;
  const bag = char.gearBag || (char.gearBag = []);
  if (itemInst.kind === 'weapon') {
    // the replaced weapon goes into the gear pack, not the void
    const old = gearInstanceOf(char, 'weapon');
    if (old) bag.push(old);
    char.weapon = { base: itemInst.id, enchant: itemInst.enchant ? deepClone(itemInst.enchant) : null };
  } else if (itemInst.kind === 'armor') {
    const old = gearInstanceOf(char, 'armor');
    if (old) bag.push(old);
    char.armor = itemInst.id;
    char.armorEnchant = itemInst.enchant ? deepClone(itemInst.enchant) : null;
  } else if (itemInst.kind === 'trinket') {
    if (char.trinkets.length >= 3) {
      const out = gearInstanceOf(char, 'trinket', 0);
      if (out) bag.push(out);
      char.trinkets.shift();
    }
    char.trinkets.push(deepClone(itemInst.def));
  } else {
    char.inventory.push(deepClone(itemInst));
  }
  recomputeDerived(char);
  char.maxHp = computeMaxHp(char);
  char.hp = Math.min(char.hp, char.maxHp);
  return true;
}

// Trade gear between party members (campfire/town — free of cost).
// spec: {slot:'bag', uid} | {slot:'weapon'} | {slot:'armor'} | {slot:'trinket', index}
export function tradeGear(run, fromId, toId, spec) {
  const from = run.roster.find(c => c.id === fromId);
  const to = run.roster.find(c => c.id === toId);
  if (!from || !to || from.id === to.id || to.dead) return { ok: false, msg: 'Invalid trade.' };
  const bag = from.gearBag || (from.gearBag = []);
  const toBag = to.gearBag || (to.gearBag = []);
  let item = null;
  if (spec.slot === 'bag') {
    const idx = bag.findIndex(i => i.uid === spec.uid);
    if (idx < 0) return { ok: false, msg: 'Item not in the pack.' };
    item = bag.splice(idx, 1)[0];
  } else if (spec.slot === 'weapon') {
    item = gearInstanceOf(from, 'weapon');
    if (!item) return { ok: false, msg: 'No weapon equipped.' };
    from.weapon = { base: 'fists', enchant: null };
  } else if (spec.slot === 'armor') {
    item = gearInstanceOf(from, 'armor');
    if (!item) return { ok: false, msg: 'No armor equipped.' };
    from.armor = 'none';
    from.armorEnchant = null;
  } else if (spec.slot === 'trinket') {
    const i = spec.index !== undefined ? spec.index : 0;
    const t = from.trinkets[i];
    if (!t) return { ok: false, msg: 'No trinket there.' };
    from.trinkets.splice(i, 1);
    item = { uid: uid(), id: t.id, kind: 'trinket', persistent: false, name: t.name, desc: t.desc || '', def: t, enchant: null };
  }
  if (!item) return { ok: false, msg: 'Nothing to give.' };
  toBag.push(item);
  recomputeDerived(from);
  recomputeDerived(to);
  from.maxHp = computeMaxHp(from);
  to.maxHp = computeMaxHp(to);
  return { ok: true, msg: `${item.name} given to ${to.name}.` };
}

export function equipWeaponOn(char, weaponId) {
  char.weapon = { base: weaponId, enchant: null };
}

// ---------- Run end ----------
// Rebuild the hero at their true creation baseline (level 1, no ASIs, no
// multiclass, no transformations). Called at every run end AND at run start so
// persistent bonuses (e.g. Veteran's Manual) apply AFTER the reset, never stack.
// Virgil's vestments: gear configured at the hub becomes the hero's starting
// equipment for every future run.
export function saveHubGear(hero) {
  hero.hubGear = {
    weapon: deepClone(hero.weapon),
    armor: hero.armor,
    armorEnchant: hero.armorEnchant ? deepClone(hero.armorEnchant) : null,
    shield: hero.shield,
    trinkets: deepClone(hero.trinkets || []),
    gearBag: deepClone(hero.gearBag || []),
  };
}

export function applyHubGear(hero) {
  if (!hero.hubGear) return;
  hero.weapon = deepClone(hero.hubGear.weapon);
  hero.armor = hero.hubGear.armor;
  hero.armorEnchant = hero.hubGear.armorEnchant;
  hero.shield = hero.hubGear.shield;
  hero.trinkets = deepClone(hero.hubGear.trinkets || []);
  hero.gearBag = deepClone(hero.hubGear.gearBag || []);
  recomputeDerived(hero);
  hero.maxHp = computeMaxHp(hero); // CON trinkets (e.g. Amulet of Health) change max HP
}

export function resetHeroBaseline(hero) {
  hero.level = 1;
  hero.classLevel = 1;
  hero.xp = 0;
  hero.statuses = [];
  hero.buffs = [];
  hero.townBuffs = [];
  hero.secondClass = null;
  hero.ringUsed = false;
  hero.hasRingOfSecondChances = false;
  hero.transformed = null;
  hero.dead = false;
  hero.gearBag = [];
  hero.feats = [];
  hero.featChoices = {};
  hero.featSaves = [];
  hero.featSpells = [];
  hero.featCantrips = [];
  hero.featCasts = {};
  hero.featCastAbility = null;
  clearPendingChoices(hero);
  // creation-time abilities only (run ASIs are wiped)
  if (hero.baseAbilities) hero.abilities = { ...hero.baseAbilities };
  const cls = hero.cls;
  hero.features = [];
  const feats1 = cls.features[1];
  if (feats1) hero.features.push(...feats1);
  equipClassGear(hero);
  initSpellcasting(hero);
  initResources(hero);
  recomputeDerived(hero);
  hero.maxHp = computeMaxHp(hero);
  hero.hp = hero.maxHp;
}

export function endRun(meta, run, won, heroDied) {
  // NOTE: shards are banked live at each floor clear (see combatEnded).
  if (won) {
    meta.wins++;
    meta.bestFloor = Math.max(meta.bestFloor, run.floorsCleared);
  } else {
    meta.deaths++;
    meta.bestFloor = Math.max(meta.bestFloor, run.floorsCleared);
  }
  // wipe temporary items from hero
  const hero = meta.hero;
  if (hero) {
    if (hero.transformed && hero.preTransformWeapon) hero.weapon = hero.preTransformWeapon;
    hero.inventory = hero.inventory.filter(i => i.persistent);
    hero.trinkets = [];
    hero.armorEnchant = null;
    resetHeroBaseline(hero); // level 1, classLevel 1, creation abilities/gear
  }
  persistSave(meta);
  return meta;
}

export function shortRestParty(run) {
  const rng = run.rng;
  for (const c of run.party) {
    if (c.dead) continue;
    const dice = Math.max(0, Math.min(c.level, Math.floor(c.level / 2) + 1));
    let healed = 0;
    const minPerDie = hasFeat(c, 'durable') ? Math.max(2, 2 * mod(c.abilities.CON)) : 0;
    for (let i = 0; i < dice; i++) {
      const roll = rng.int(1, c.cls.hitDie);
      healed += Math.max(roll, minPerDie);
    }
    c.hp = clamp(c.hp + healed, 0, c.maxHp);
    // per-floor resources refresh between floors
    initResources(c);
    c.wildShaped = false;
    c.statuses = [];
    c.buffs = (c.buffs || []).filter(b => b.rounds === 999 || b.id === 'protection_from_energy');
  }
}

// ---------- Shop ----------
export function buyShopItem(meta, itemId) {
  const item = SHOP_ITEM_MAP[itemId];
  if (!item) return { ok: false, msg: 'Unknown item.' };
  if (meta.shards < item.cost) return { ok: false, msg: `Not enough soul shards (need ${item.cost}).` };
  meta.shards -= item.cost;
  meta.shopItems[itemId] = (meta.shopItems[itemId] || 0) + 1;
  persistSave(meta);
  return { ok: true, msg: `Bought ${item.name}!` };
}

export function ownedShopItems(meta) {
  return SHOP_ITEMS.filter(i => meta.shopItems[i.id] > 0);
}


// ============================== LINEUP / ROSTER ==============================
export function activeFighters(run) {
  return run.roster
    .filter(c => run.active.includes(c.id) && !c.dead)
    .slice(0, 4);
}

export function toggleActive(run, charId, forceOn = null) {
  const c = run.roster.find(x => x.id === charId);
  if (!c || c.dead) return { ok: false, msg: 'Unavailable.' };
  if (c.hero) return { ok: false, msg: 'Your hero must fight.' };
  const on = forceOn !== null ? forceOn : !run.active.includes(charId);
  if (on) {
    if (run.active.length >= 4) return { ok: false, msg: 'The party is full (4). Stand someone down first.' };
    if (!run.active.includes(charId)) run.active.push(charId);
  } else {
    run.active = run.active.filter(id => id !== charId);
  }
  return { ok: true };
}

// ============================== TOWN ==============================
export function rollTown(run) {
  run.usedTownEvents = new Set();
  run.townName = run.rng.pick(TOWN_NAMES);
  // shop
  const type = run.rng.weighted(SHOP_TYPES.map(t => [t, t.weight]));
  run.townShop = { type: type.id, name: type.name, items: generateTownStock(run, type) };
  // hire offers (2-3 recruits)
  const n = run.rng.int(2, 3);
  const rosterClasses = run.roster.map(c => c.classId);
  run.townOffers = [];
  for (let i = 0; i < n; i++) {
    const rec = generateCompanion(run.rng, partyLevelFor(run), rosterClasses);
    rec.hireCost = 100 + partyLevelFor(run) * 40;
    run.townOffers.push(rec);
  }
  // townspeople events (2 random)
  const events = run.rng.sample(TOWN_EVENTS, 2);
  for (const e of events) e.dc = 10 + run.rng.int(0, 3);
  run.townEvents = events;
  return run.townShop;
}

function partyLevelFor(run) {
  return run.roster.filter(c => !c.dead).reduce((mx, c) => Math.max(mx, c.level), 1);
}

function generateTownStock(run, type) {
  const items = [];
  const count = run.rng.int(5, 7);
  const pool = type.pools;
  const general = SHOP_TYPES.find(t => t.id === 'general').pools;
  for (let i = 0; i < count; i++) {
    const biased = run.rng.chance(0.65);
    const src = biased ? pool : general;
    const cats = ['weapon', 'armor', 'trinket', 'consumable', 'special'].filter(k => src[k] && src[k].length);
    // martial shops weight their steel heavily; others roll categories evenly
    const catWeights = (type.id === 'blacksmith' || type.id === 'armorer')
      ? { weapon: 5, armor: 5, trinket: 1, consumable: 2, special: 2 }
      : (type.id === 'archery' ? { weapon: 6, trinket: 2, consumable: 2 } : null);
    const cat = catWeights
      ? run.rng.weighted(cats.map(c => [c, catWeights[c] || 1]))
      : run.rng.pick(cats);
    if (cat === 'special') {
      const spId = run.rng.pick(src.special);
      items.push(makeSpecialTownItem(spId));
      continue;
    }
    const id = run.rng.pick(src[cat]);
    let inst = null;
    if (cat === 'weapon') {
      const ench = run.rng.chance(pool.enchChance || 0.2) ? rollEnchant(run, 'weapon') : null;
      inst = makeItemInstance(id, 'weapon', ench);
    } else if (cat === 'armor') {
      const ench = run.rng.chance(pool.enchChance || 0.2) ? rollEnchant(run, 'armor') : null;
      inst = makeItemInstance(id, 'armor', ench);
    } else if (cat === 'trinket') {
      inst = makeItemInstance(id, 'trinket');
    } else {
      inst = makeItemInstance(id, 'consumable');
    }
    if (inst) {
      inst.price = Math.max(10, Math.round((WEAPONS[id]?.value || ARMORS[id]?.value || CONSUMABLES[id]?.value || 300) * 1.4));
      items.push(inst);
    }
  }
  return items;
}

function rollEnchant(run, slot) {
  const tier = Math.min(3, 1 + Math.floor(partyLevelFor(run) / 4));
  const candidates = Object.values(ENCHANTMENTS).filter(e => e.slot === slot && e.tier <= tier);
  if (!candidates.length) return null;
  return run.rng.pick(candidates).id;
}

function makeSpecialTownItem(spId) {
  if (spId === 'mindflayer_worm') {
    const d = SPECIAL_GOODS.mindflayer_worm;
    return { uid: uid(), id: spId, kind: 'transformation', persistent: false, name: d.name, desc: d.desc, price: d.price };
  }
  if (spId === 'orin_dagger') {
    const inst = makeItemInstance('orin_dagger', 'weapon');
    inst.price = 12000;
    return inst;
  }
  if (spId === 'blade_of_avernus') {
    const inst = makeItemInstance('blade_of_avernus', 'weapon');
    inst.price = 16000;
    return inst;
  }
  if (spId === 'hellforged_plate') {
    const inst = makeItemInstance('hellforged_plate', 'armor');
    inst.price = 15000;
    return inst;
  }
  return null;
}

export function buyTownItem(run, itemUid, charId) {
  const idx = run.townShop.items.findIndex(i => i.uid === itemUid);
  if (idx < 0) return { ok: false, msg: 'Item not in stock.' };
  const item = run.townShop.items[idx];
  if (run.runGold < (item.price || 0)) return { ok: false, msg: `Not enough gold (need ${item.price}).` };
  const char = run.roster.find(c => c.id === charId);
  if (!char || char.dead) return { ok: false, msg: 'Pick a living party member.' };
  run.runGold -= item.price;
  if (item.kind === 'transformation') {
    transformIntoMindFlayer(char);
    run.townShop.items.splice(idx, 1);
    return { ok: true, msg: `${char.name} becomes a Mind Flayer!` };
  }
  applyLoot(run, item, charId);
  run.townShop.items.splice(idx, 1);
  return { ok: true, msg: `${item.name} bought for ${char.name}.` };
}

export function transformIntoMindFlayer(char) {
  if (!char.transformed) char.preTransformWeapon = deepClone(char.weapon);
  char.transformed = { type: 'mind_flayer' };
  char.abilities.INT = Math.max(char.abilities.INT, 19);
  char.maxHp += 20;
  char.hp += 20;
  recomputeDerived(char);
}

export function hireRecruit(run, recruitId) {
  if (run.roster.length >= 6) return { ok: false, msg: 'Your band is full (6).' };
  const rec = (run.townOffers || []).find(r => r.id === recruitId);
  if (!rec) return { ok: false, msg: 'That mercenary has moved on.' };
  if (run.runGold < (rec.hireCost || 0)) return { ok: false, msg: `Not enough gold (need ${rec.hireCost}).` };
  run.runGold -= rec.hireCost;
  run.roster.push(rec);
  run.party.push(rec);
  run.townOffers = run.townOffers.filter(r => r.id !== recruitId);
  return { ok: true, msg: `${rec.name} joins your band!` };
}

// ---- Long rest (every 3rd floor, at the town) ----
export function doLongRest(run) {
  longRestParty(run.roster.filter(c => !c.dead), run.rng, null);
  for (const c of run.roster) {
    c.townBuffs = []; // blessings AND penalties end
    if (c.transformed) { /* transformation lasts the run */ }
  }
}

// ---- Town events ----
export function bestForSkill(party, skill) {
  let best = null;
  for (const c of party) {
    if (c.dead) continue;
    const m = skillMod(c, skill);
    if (!best || m > best.mod) best = { char: c, mod: m };
  }
  return best;
}

export function rollTownEvent(run, eventId) {
  const ev = (run.townEvents || []).find(e => e.id === eventId);
  if (!ev || run.usedTownEvents.has(ev.id)) return null;
  const alive = run.roster.filter(c => !c.dead);
  const best = bestForSkill(alive, ev.skill);
  const roll = run.rng.int(1, 20);
  const total = roll + (best ? best.mod : 0);
  const success = total >= ev.dc;
  run.usedTownEvents.add(ev.id);
  // party-wide blessing or penalty until next long rest
  const value = success ? 1 : -1;
  const name = `${ev.buff.name} (${success ? 'blessing' : 'penalty'})`;
  for (const c of alive) {
    c.townBuffs = c.townBuffs || [];
    c.townBuffs.push({ id: ev.id, name, kind: ev.buff.kind, value });
    if (ev.buff.kind === 'hp') {
      c.maxHp += value * 5;
      if (value > 0) c.hp += 5;
    }
  }
  recomputeParty(alive);
  return { ev, best, roll, total, success };
}

function recomputeParty(alive) {
  for (const c of alive) {
    recomputeDerived(c);
    c.maxHp = computeMaxHp(c);
    c.hp = Math.min(c.hp, c.maxHp);
  }
}

// ---- Prepared spells (cleric/druid/wizard at camp) ----
export function togglePrepared(c, spellId, on) {
  if (!c.preparedSpells) return false;
  const cap = Math.max(1, classLevel(c) + Math.floor((c.abilities[c.cls.spellAbility] - 10) / 2));
  if (on) {
    if (c.preparedSpells.length >= cap) return false;
    if (c.preparedSpells.includes(spellId)) return true;
    c.preparedSpells.push(spellId);
  } else {
    c.preparedSpells = c.preparedSpells.filter(s => s !== spellId);
  }
  return true;
}
