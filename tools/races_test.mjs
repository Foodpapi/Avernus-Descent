// Race families + subrace data, Variant Human kit, and creation flow.
import { JSDOM } from 'jsdom';
import { makeRng } from '../src/rng.js';
import { createCharacter, computeMaxHp, computeSpeed } from '../src/5e/rules.js';
import {
  RACES, RACE_MAP, RACE_FAMILIES, racesForFamily, isRaceFamily, raceFamilyOf,
} from '../src/data/races.js';
import { CLASS_MAP } from '../src/data/classes.js';
import { autoAssignScores } from '../src/game/run.js';
import * as Combat from '../src/5e/combat.js';

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); };

const rng = makeRng(11);
function mk(raceId, classId = 'fighter', extra = {}) {
  const race = RACE_MAP[raceId];
  const cls = CLASS_MAP[classId];
  return createCharacter({
    raceId, classId, name: raceId, subclassId: Object.keys(cls.subclasses)[0],
    scoreAssign: autoAssignScores(cls, race, rng),
    level: 1, hero: false, rng, ...extra,
  });
}

assert(RACE_FAMILIES.length === 9, 'nine PHB families on the race menu');
assert(!RACE_FAMILIES.some(f => f.id === 'wood_elf' || f.name.includes('Lightfoot') || f.name.includes('Rock Gnome')),
  'subraces are not top-level family options');
assert(racesForFamily('gnome').map(r => r.id).sort().join(',') === 'forest_gnome,gnome',
  'Gnome lists Forest + Rock');
assert(racesForFamily('halfling').some(r => r.id === 'halfling' && r.naturallyStealthy),
  'Lightfoot stays id=halfling and Naturally Stealthy');
assert(racesForFamily('halfling').some(r => r.id === 'stout_halfling' && !r.naturallyStealthy),
  'Stout is a separate lineage without Naturally Stealthy');
assert(racesForFamily('elf').map(r => r.id).sort().join(',') === 'drow,elf,wood_elf',
  'Elf lists High, Wood, Drow');
assert(racesForFamily('tiefling').length === 9, 'nine Tiefling bloodlines');
assert(racesForFamily('dragonborn').length === 10, 'ten Dragonborn ancestries');
assert(racesForFamily('human').some(r => r.variantHuman), 'Variant Human is a human heritage');
assert(racesForFamily('half_orc').length === 1, 'Half-Orc has no extra subrace');
step('families nest every PHB/SCAG lineage');

const rock = mk('gnome');
assert(isRaceFamily(rock, 'gnome'), 'rock gnome is family gnome');
assert(rock.abilities.INT === autoAssignScores(CLASS_MAP.fighter, RACE_MAP.gnome, makeRng(11)).INT + 2, 'rock gnome +2 INT');
const forest = mk('forest_gnome');
assert(isRaceFamily(forest, 'gnome') && forest.race.name === 'Forest Gnome', 'forest gnome playable');
assert(forest.abilities.DEX === autoAssignScores(CLASS_MAP.fighter, RACE_MAP.forest_gnome, makeRng(11)).DEX + 1, 'forest gnome +1 DEX');

const hill = mk('dwarf');
assert(hill.race.hpPerLevel === 1, 'hill dwarf toughness stamp');
assert(computeMaxHp(hill) === computeMaxHp({ ...hill, race: { ...hill.race, hpPerLevel: 0 } }) + 1, 'hill dwarf +1 HP at 1');

const wood = mk('wood_elf', 'ranger');
assert(computeSpeed(wood) === 7, 'wood elf 35 ft = 7 tiles');
assert(Combat.hasMaskOfTheWild(Combat.makeUnit(wood, 'player', 0, 0)), 'wood elf Mask of the Wild');

const light = mk('halfling', 'rogue');
assert(Combat.hasNaturallyStealthy(Combat.makeUnit(light, 'player', 0, 0)), 'lightfoot Naturally Stealthy');
const stout = mk('stout_halfling', 'rogue');
assert(!Combat.hasNaturallyStealthy(Combat.makeUnit(stout, 'player', 0, 0)), 'stout is not Naturally Stealthy');
assert(stout.race.resist.includes('poison'), 'stout poison resist');
step('subrace traits apply');

const blue = mk('dragonborn_blue');
assert(isRaceFamily(blue, 'dragonborn'), 'blue dragonborn family');
assert(blue.dragonType === 'lightning', 'blue ancestry is lightning');
assert(blue.resources.breathWeapon && blue.resources.breathWeapon.cur === 1, 'non-red dragonborn still get a breath');

const zariel = mk('tiefling_zariel', 'paladin');
assert(zariel.spellsKnown.includes('searing_smite'), 'Zariel legacy grants Searing Smite');
assert(zariel.featCasts.searing_smite, 'racial spell is a free once-per-floor cast');
step('dragonborn ancestries + tiefling bloodlines');

const vh = mk('human_variant', 'fighter', {
  racialChoices: { asi: ['STR', 'CON'], skill: 'Athletics', featId: 'tough' },
});
assert(vh.feats.includes('tough'), 'variant human takes a feat');
assert(vh.skills.includes('Athletics'), 'variant human skill');
const base = autoAssignScores(CLASS_MAP.fighter, RACE_MAP.human_variant, makeRng(11));
assert(vh.abilities.STR === base.STR + 1 && vh.abilities.CON === base.CON + 1, 'variant +1/+1');
assert(vh.racialChoices.featId === 'tough', 'racialChoices persist for run reset');
step('Variant Human kit');

// Creation UI: families first, then lineages
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"><div id="ui"></div></div></body></html>', {
  url: 'http://localhost:8080/index.html', pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const ui = await import('../src/ui.js');
const Run = await import('../src/game/run.js');
ui.setG({ meta: Run.defaultMeta(), hero: null, run: null, combat: null });
ui.creationScreen();
const familyNames = [...document.querySelectorAll('.card-title')].map(n => n.textContent);
assert(familyNames.includes('Gnome') && familyNames.includes('Elf') && familyNames.includes('Human'), 'family menu lists parent races');
assert(!familyNames.includes('Rock Gnome') && !familyNames.includes('Lightfoot Halfling') && !familyNames.includes('Wood Elf'),
  'subraces are hidden until a family is picked');
const gnomeCard = [...document.querySelectorAll('.card')].find(c => c.querySelector('.card-title')?.textContent === 'Gnome');
assert(!!gnomeCard, 'Gnome family card is clickable');
gnomeCard.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const lineageNames = [...document.querySelectorAll('.card-title')].map(n => n.textContent);
assert(lineageNames.includes('Rock Gnome') && lineageNames.includes('Forest Gnome'), 'Gnome opens its subraces');
assert(!lineageNames.includes('Human'), 'family list is replaced by the lineage list');
step('creation: pick family → then subrace');

console.log('races_test: all good');
process.exit(0);
