// PHB 2014 subraces: catalog, creation cards, and the flags combat/rules read.
import { JSDOM } from 'jsdom';
import { makeRng } from '../src/rng.js';
import { createCharacter, computeMaxHp, isProficientWithWeapon, levelUpCharacter } from '../src/5e/rules.js';
import * as Combat from '../src/5e/combat.js';
import { RACES, RACE_MAP, RACE_FAMILIES, racesInFamily, raceFlag, raceOf } from '../src/data/races.js';
import { CLASS_MAP } from '../src/data/classes.js';

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); };

const rng = makeRng(47);
const FLAT = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };

function mk(raceId, classId = 'fighter', level = 1, subclassId) {
  const cls = CLASS_MAP[classId];
  return createCharacter({
    raceId, classId, name: raceId, subclassId: subclassId || Object.keys(cls.subclasses)[0],
    scoreAssign: { ...FLAT }, level, hero: false, rng,
  });
}

function seqRng(seq) {
  let i = 0;
  return { int: () => seq[Math.min(i++, seq.length - 1)] };
}

// ---- catalog ----
{
  assert(RACES.length === 14, `expected 14 playable races, got ${RACES.length}`);
  const ids = RACES.map(r => r.id);
  assert(new Set(ids).size === 14, 'race ids must be unique');
  for (const need of ['human', 'elf', 'wood_elf', 'drow', 'dwarf', 'mountain_dwarf', 'halfling', 'stout_halfling', 'gnome', 'forest_gnome', 'halfelf', 'half_orc', 'tiefling', 'dragonborn']) {
    assert(RACE_MAP[need], `missing race ${need}`);
  }
  assert(RACE_MAP.elf.name === 'High Elf', 'id elf stays High Elf');
  assert(RACE_MAP.dwarf.name === 'Hill Dwarf', 'id dwarf stays Hill Dwarf');
  assert(RACE_MAP.halfling.name === 'Lightfoot Halfling', 'id halfling stays Lightfoot');
  assert(RACE_MAP.gnome.name === 'Rock Gnome', 'id gnome stays Rock Gnome');
  assert(RACE_FAMILIES.length === 9, `expected 9 PHB race families, got ${RACE_FAMILIES.length}`);
  assert(racesInFamily('elf').length === 3, 'Elf has High / Wood / Drow');
  assert(racesInFamily('dwarf').length === 2, 'Dwarf has Hill / Mountain');
  assert(racesInFamily('halfling').length === 2, 'Halfling has Lightfoot / Stout');
  assert(racesInFamily('gnome').length === 2, 'Gnome has Rock / Forest');
  assert(racesInFamily('human').length === 1, 'Human has no PHB subrace picker');
  step('14 PHB races with stable legacy ids');
}

// ---- Lightfoot vs Stout ----
{
  assert(RACE_MAP.halfling.naturallyStealthy, 'Lightfoot has Naturally Stealthy');
  assert(!RACE_MAP.stout_halfling.naturallyStealthy, 'Stout does NOT have Naturally Stealthy (RAW)');
  assert(RACE_MAP.halfling.lucky && RACE_MAP.stout_halfling.lucky, 'both halflings are Lucky');
  assert(RACE_MAP.halfling.brave && RACE_MAP.stout_halfling.brave, 'both halflings are Brave');
  assert((RACE_MAP.stout_halfling.resist || []).includes('poison'), 'Stout has poison resistance');
  assert(RACE_MAP.stout_halfling.poisonSaveAdv, 'Stout has poison-save advantage');
  assert(!(RACE_MAP.halfling.resist || []).includes('poison'), 'Lightfoot has no poison resist');
  const light = mk('halfling', 'rogue');
  const stout = mk('stout_halfling', 'rogue');
  assert(light.naturallyStealthy && Combat.hasNaturallyStealthy({ char: light }), 'Lightfoot unit is Naturally Stealthy');
  assert(!stout.naturallyStealthy && !Combat.hasNaturallyStealthy({ char: stout }), 'Stout unit is not Naturally Stealthy');
  assert(raceFlag(stout, 'lucky') && raceFlag(light, 'lucky'), 'Lucky flag on both via raceFlag');
  step('Lightfoot Naturally Stealthy; Stout Resilience; shared Lucky/Brave');
}

// ---- Hill vs Mountain dwarf ----
{
  const hill = mk('dwarf', 'fighter');
  const mountain = mk('mountain_dwarf', 'fighter');
  assert(hill.abilities.CON === 12 && hill.abilities.WIS === 11, 'Hill Dwarf +2 CON +1 WIS');
  assert(mountain.abilities.STR === 12 && mountain.abilities.CON === 12, 'Mountain Dwarf +2 STR +2 CON');
  assert(hill.maxHp === mountain.maxHp + 1, `Hill Dwarven Toughness +1 HP (hill ${hill.maxHp} vs mountain ${mountain.maxHp})`);
  assert(raceFlag(hill, 'dwarvenToughness') && !raceFlag(mountain, 'dwarvenToughness'), 'toughness is Hill-only');
  assert((RACE_MAP.mountain_dwarf.armorProf || []).includes('medium'), 'Mountain Dwarf light+medium armor training');
  assert(isProficientWithWeapon(hill, 'battleaxe'), 'Hill Dwarf racial battleaxe');
  assert(isProficientWithWeapon(mountain, 'warhammer'), 'Mountain Dwarf racial warhammer');
  const hill2 = mk('dwarf', 'fighter', 2);
  assert(computeMaxHp(hill2) === computeMaxHp(mk('mountain_dwarf', 'fighter', 2)) + 2, 'toughness scales +1/level');
  step('Hill toughness + Mountain ASI/armor');
}

// ---- Elves ----
{
  const high = mk('elf', 'fighter');
  const wood = mk('wood_elf', 'ranger');
  const drow = mk('drow', 'fighter');
  assert(high.spellsKnown.includes('fire_bolt'), 'High Elf knows Fire Bolt (wizard cantrip, INT)');
  assert(high.featCastAbility === 'INT', 'High Elf cantrip uses INT');
  assert(isProficientWithWeapon(high, 'longsword'), 'High Elf weapon training');
  assert(wood.race.speed === 35 && wood.maskOfTheWild, 'Wood Elf Fleet of Foot + Mask of the Wild');
  assert(Combat.hasMaskOfTheWild({ char: wood }), 'wood elf unit has Mask of the Wild');
  assert(drow.vision === 24, `Drow Superior Darkvision is 24 tiles, got ${drow.vision}`);
  assert(raceFlag(drow, 'sunlightSensitivity'), 'Drow Sunlight Sensitivity flag');
  assert(!drow.spellsKnown.includes('faerie_fire'), 'Drow Magic Faerie Fire unlocks at 3');
  const drow3 = mk('drow', 'fighter', 3);
  assert(drow3.spellsKnown.includes('faerie_fire') && drow3.featCasts.faerie_fire, 'Drow 3 knows Faerie Fire (CHA, 1/floor)');
  const drow5 = mk('drow', 'fighter', 5);
  assert(drow5.spellsKnown.includes('darkness') && drow5.featCasts.darkness, 'Drow 5 knows Darkness');
  assert(drow5.featCastAbility === 'CHA', 'Drow Magic uses Charisma');
  assert(isProficientWithWeapon(drow, 'rapier') && isProficientWithWeapon(drow, 'hand_crossbow'), 'Drow weapon training');
  step('High Elf cantrip, Wood Elf mask, Drow magic + 120 ft vision');
}

// ---- Gnomes ----
{
  const rock = mk('gnome', 'wizard');
  const forest = mk('forest_gnome', 'wizard');
  assert(rock.abilities.INT === 12 && rock.abilities.CON === 11, 'Rock Gnome +2 INT +1 CON');
  assert(forest.abilities.INT === 12 && forest.abilities.DEX === 11, 'Forest Gnome +2 INT +1 DEX');
  assert(raceFlag(rock, 'gnomeCunning') && raceFlag(forest, 'gnomeCunning'), 'both gnomes have Gnome Cunning');
  step('Rock + Forest Gnome ASIs and Gnome Cunning');
}

// ---- Lucky reroll is flag-based (Stout, not just id=halfling) ----
{
  const stout = mk('stout_halfling', 'fighter');
  const human = mk('human', 'fighter');
  const dummy = { statuses: [] };
  const combat = { locId: 'dungeon' };
  const stoutRoll = Combat.attackRoll(seqRng([1, 15]), combat, { char: stout, statuses: [] }, dummy, 0, {});
  const humanRoll = Combat.attackRoll(seqRng([1, 15]), combat, { char: human, statuses: [] }, dummy, 0, {});
  assert(stoutRoll.result === 15, `Stout Lucky rerolls nat 1 → 15, got ${stoutRoll.result}`);
  assert(humanRoll.result === 1, `Human keeps nat 1, got ${humanRoll.result}`);
  step('Stout Lucky rerolls nat 1 on attacks');
}

// ---- Sunlight Sensitivity (RAW: disadvantage in direct sunlight) ----
{
  const drow = mk('drow', 'fighter');
  const dummy = { statuses: [] };
  assert(Combat.isSunlit({ locId: 'forest' }) && Combat.isSunlit({ locId: 'town' }), 'outdoor locs are sunlit');
  assert(!Combat.isSunlit({ locId: 'dungeon' }) && !Combat.isSunlit({ locId: 'avernus' }), 'interiors / Avernus are not sunlit');
  const sun = Combat.attackRoll(seqRng([20, 5]), { locId: 'forest' }, { char: drow, statuses: [] }, dummy, 0, {});
  const dark = Combat.attackRoll(seqRng([20, 5]), { locId: 'dungeon' }, { char: drow, statuses: [] }, dummy, 0, {});
  assert(sun.result === 5, `Drow in sunlight takes the lower die (disadvantage), got ${sun.result}`);
  assert(dark.result === 20, `Drow underground has no sunlight disad, got ${dark.result}`);
  step('Drow Sunlight Sensitivity is location-based disadvantage');
}

// ---- innate copies through non-caster level-up ----
{
  const drow = mk('drow', 'fighter', 2);
  levelUpCharacter(drow, rng, {});
  assert(drow.level === 3 && drow.spellsKnown.includes('faerie_fire'), 'level-up grants Drow Faerie Fire to a fighter');
  step('racial innate survives non-caster level-up');
}

// ---- creation screen lists every race ----
{
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"><div id="ui"></div></div></body></html>', {
    url: 'http://localhost:8080/index.html',
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  globalThis.requestAnimationFrame = fn => setTimeout(fn, 16);
  globalThis.confirm = () => true;
  globalThis.alert = () => {};
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    const store = {};
    return new Proxy(store, {
      get: (t, p) => {
        if (p === 'measureText') return () => ({ width: 20 });
        if (p in t) return t[p];
        return () => {};
      },
      set: (t, p, v) => { t[p] = v; return true; },
    });
  };
  const ui = await import('../src/ui.js');
  const Run = await import('../src/game/run.js');
  const G = { meta: { ...Run.defaultMeta() }, hero: null, run: null, combat: null };
  ui.setG(G);
  ui.creationScreen();
  const titles = () => [...document.querySelectorAll('.card-title')].map(el => el.textContent.trim());
  const familyTitles = titles();
  assert(familyTitles.length === 9, `creation shows 9 race families, got ${familyTitles.length}: ${familyTitles.join(', ')}`);
  for (const fam of RACE_FAMILIES) {
    assert(familyTitles.includes(fam.name), `creation missing family card for ${fam.name}`);
  }
  assert(!familyTitles.includes('Rock Gnome'), 'Rock Gnome is not a top-level race card');
  assert(!familyTitles.includes('Lightfoot Halfling'), 'Lightfoot is not a top-level race card');
  assert(!familyTitles.includes('Hill Dwarf'), 'Hill Dwarf is not a top-level race card');
  assert(!familyTitles.includes('Wood Elf'), 'Wood Elf is not a top-level race card');
  const gnomeCard = [...document.querySelectorAll('.card')].find(c => c.querySelector('.card-title')?.textContent.trim() === 'Gnome');
  assert(gnomeCard, 'Gnome family card exists');
  gnomeCard.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const subTitles = titles();
  assert(subTitles.includes('Rock Gnome') && subTitles.includes('Forest Gnome'), `Gnome subraces listed, got ${subTitles.join(', ')}`);
  assert(subTitles.length === 2, `Gnome picker shows 2 subraces, got ${subTitles.length}`);
  const back = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Back'));
  assert(back, 'subrace picker has Back');
  back.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert(titles().includes('Elf'), 'Back returns to the race list');
  const elfCard = [...document.querySelectorAll('.card')].find(c => c.querySelector('.card-title')?.textContent.trim() === 'Elf');
  elfCard.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const elfSubs = titles();
  assert(elfSubs.includes('High Elf') && elfSubs.includes('Wood Elf') && elfSubs.includes('Drow'), 'Elf opens High / Wood / Drow');
  step('creation: 9 races, then subrace picker');
}

assert(raceOf({ raceId: 'drow' }).id === 'drow', 'raceOf falls back to RACE_MAP');
console.log('race_test: all good');
process.exit(0);
