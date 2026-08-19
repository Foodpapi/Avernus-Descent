// Equipment management tests:
// 1. Loot pickups stash replaced gear into the pack (nothing is lost).
// 2. Unequip/equip cost an action point in combat; blocked at 0 points.
// 3. Trinket cap (3) returns the oldest to the pack.
// 4. Campfire sheet: free equip/unequip + trading between members.
// 5. In-combat inspect modal: Take off spends the action point.
import { JSDOM } from 'jsdom';

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
const errors = [];
dom.window.addEventListener('error', e => errors.push(e.message));

const ui = await import('../src/ui.js');
const Run = await import('../src/game/run.js');
const Combat = await import('../src/5e/combat.js');
const Actions = await import('../src/5e/combat_actions.js');
const { makeRng } = await import('../src/rng.js');
const { createCharacter, changeGearChar } = await import('../src/5e/rules.js');
const { performAction } = await import('../src/5e/turn.js');
const { RACES } = await import('../src/data/races.js');
const { CLASS_MAP } = await import('../src/data/classes.js');
const { LOCATION_MAP } = await import('../src/data/locations.js');

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function mkChar(clsId, level, subclassId, rng) {
  const cls = CLASS_MAP[clsId];
  const race = RACES[0];
  return createCharacter({ raceId: race.id, classId: clsId, name: 'Gear' + clsId, subclassId: subclassId || Object.keys(cls.subclasses)[0], scoreAssign: Run.autoAssignScores(cls, race, rng), level, hero: false, rng });
}

function mkBattle(units) {
  const b = { popups: [], fx: [], log: [], rng: makeRng(5), round: 1, effects: [], units, w: 12, h: 10, grid: [], over: false, won: false };
  for (let y = 0; y < 10; y++) b.grid.push(Array.from({ length: 12 }, () => ({ obstacle: null, elevation: 0, hazard: null, visible: true, discovered: true })));
  return b;
}

const rng = makeRng(6060);

// ============ 1. LOOT STASHES THE OLD WEAPON ============
{
  const fighter = mkChar('fighter', 2, null, rng);
  const fakeRun = { party: [fighter], roster: [fighter], rng };
  const startWeapon = fighter.weapon.base; // longsword
  const greatsword = Run.makeItemInstance('greatsword', 'weapon');
  Run.applyLoot(fakeRun, greatsword, fighter.id);
  assert(fighter.weapon.base === 'greatsword', 'new weapon should be equipped');
  const stashed = fighter.gearBag.find(i => i.kind === 'weapon' && i.id === startWeapon);
  assert(!!stashed, `old weapon (${startWeapon}) should be in the gear pack`);
  assert(stashed.name === 'Longsword', 'stashed instance should keep its name');
  step('loot pickup equips the new weapon and stashes the old one');
}

// ============ 2. COMBAT GEAR ACTIONS COST AN ACTION POINT ============
{
  const fighter = Combat.makeUnit(mkChar('fighter', 2, null, rng), 'player', 2, 2);
  const gob = Combat.makeUnit(mkChar('barbarian', 1, null, rng), 'enemy', 6, 2);
  const battle = mkBattle([fighter, gob]);
  const char = fighter.char;
  const bag = char.gearBag || (char.gearBag = []);
  // give the pack a spare axe to equip later
  const axe = Run.makeItemInstance('battleaxe', 'weapon');
  bag.push(axe);

  Combat.startOfTurnReset(battle, fighter);
  assert(fighter.actionPoints === 1, 'turn starts with 1 action point');

  // unequip costs the action point
  const baseBefore = char.weapon.base;
  performAction(battle, fighter.id, { type: 'unequip_weapon' });
  assert(fighter.actionPoints === 0, 'unequipping should spend the action point');
  assert(char.weapon.base === 'fists', 'weapon should be unequipped to fists');
  assert(bag.some(i => i.kind === 'weapon' && i.id === baseBefore), 'unequipped weapon returns to the pack');
  step('unequipping a weapon in combat spends the action point (1→0)');

  // blocked at 0 points
  performAction(battle, fighter.id, { type: 'equip_weapon', itemUid: axe.uid });
  assert(char.weapon.base === 'fists', 'equipping with 0 action points must be blocked');
  assert(battle.log.some(l => l.includes('no action points')), 'blocked equip should be logged');
  step('gear changes blocked at 0 action points');

  // fresh turn: equip works and spends the point
  Combat.startOfTurnReset(battle, fighter);
  performAction(battle, fighter.id, { type: 'equip_weapon', itemUid: axe.uid });
  assert(fighter.actionPoints === 0, 'equipping should spend the action point');
  assert(char.weapon.base === 'battleaxe', 'battleaxe should be equipped');
  assert(!bag.some(i => i.uid === axe.uid), 'equipped item leaves the pack');
  step('equipping from the pack costs the action point and swaps correctly');
}

// ============ 3. ARMOR + TRINKET CAP ============
{
  const pal = mkChar('paladin', 2, null, rng);
  const fakeRun = { party: [pal], roster: [pal], rng };
  const startArmor = pal.armor;
  Run.applyLoot(fakeRun, Run.makeItemInstance('plate', 'armor'), pal.id);
  assert(pal.armor === 'plate', 'plate equipped');
  assert(pal.gearBag.some(i => i.kind === 'armor' && i.id === startArmor), 'old armor stashed');
  // free camp change: unequip then equip
  changeGearChar(pal, 'unequip_armor');
  assert(pal.armor === 'none', 'armor removed');
  changeGearChar(pal, 'equip_armor', { itemUid: pal.gearBag.find(i => i.kind === 'armor' && i.id === 'plate').uid });
  assert(pal.armor === 'plate', 'armor re-equipped freely at camp');
  step('armor stash/remove/don cycle works');

  // trinket cap: 4th trinket returns the oldest to the pack
  for (const t of ['ring_of_protection', 'boots_speed', 'cloak_of_protection']) {
    Run.applyLoot(fakeRun, Run.makeItemInstance(t, 'trinket'), pal.id);
  }
  assert(pal.trinkets.length === 3, '3 trinkets equipped');
  Run.applyLoot(fakeRun, Run.makeItemInstance('ring_of_evasion', 'trinket'), pal.id);
  assert(pal.trinkets.length === 3, 'cap stays at 3');
  assert(pal.trinkets[2].id === 'ring_of_evasion', 'newest trinket equipped');
  assert(pal.gearBag.some(i => i.kind === 'trinket' && i.id === 'ring_of_protection'), 'oldest trinket returned to the pack');
  step('trinket cap: the oldest trinket goes back to the pack');
}

// ============ 4. CAMPFIRE SHEET UI: EQUIP + TRADE ============
{
  const rng2 = makeRng(9090);
  const meta = { shards: 0, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
  const hero = mkChar('fighter', 1, 'champion', rng2);
  hero.hero = true;
  meta.hero = hero;
  const run = Run.newRun(meta, hero);
  run.location = LOCATION_MAP.tavern;
  const comp = run.roster.find(c => !c.hero);
  // give the hero a spare weapon in the pack
  const axe = Run.makeItemInstance('battleaxe', 'weapon');
  hero.gearBag.push(axe);
  ui.setG({ meta, hero, run, combat: null });
  ui.campScreen();

  const clickBtn = (labelPart) => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(labelPart));
    if (!b) throw new Error('no button ' + labelPart);
    b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  };

  // the HERO is the walk avatar — open their sheet via the HUD button
  const sheetBtn = [...document.querySelectorAll('.walk-hud button')].find(b => b.textContent.includes('Your Sheet'));
  if (!sheetBtn) fail('walk hud missing the Your Sheet button');
  sheetBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const modal = document.querySelector('.camp-sheet');
  if (!modal) fail('camp sheet modal missing');
  if (!modal.textContent.includes('Gear Pack')) fail('sheet should show the Gear Pack section');
  const equipBtn = [...modal.querySelectorAll('.gear-row button')].find(b => b.textContent.includes('Equip'));
  if (!equipBtn) fail('no Equip button in the gear pack');
  equipBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert(hero.weapon.base === 'battleaxe', 'camp Equip button should equip the item freely');
  assert(!hero.gearBag.some(i => i.uid === axe.uid), 'item should leave the pack');
  step('campfire sheet: Equip button equips gear freely (no action cost)');

  // trade the equipped battleaxe to the companion
  const giveBtn = [...document.querySelectorAll('.camp-sheet .gear-row button')].find(b => b.textContent.includes('Give to'));
  if (!giveBtn) fail('no Give to button on the equipped weapon');
  giveBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const targetCard = [...document.querySelectorAll('.overlay .card')].find(c => c.textContent.includes(comp.name));
  if (!targetCard) fail('trade target list missing the companion');
  targetCard.querySelector('button').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert(comp.gearBag.some(i => i.id === 'battleaxe'), "traded weapon should land in the companion's pack");
  assert(hero.weapon.base === 'fists', 'giving an equipped weapon unequips it');
  step('campfire trading: equipped weapon handed to another member');
}

// ============ 5. COMBAT INSPECT MODAL: TAKE OFF SPENDS THE ACTION ============
{
  const rng3 = makeRng(4242);
  const meta = { shards: 0, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
  const hero = mkChar('fighter', 2, 'champion', rng3);
  hero.hero = true;
  meta.hero = hero;
  const run = Run.newRun(meta, hero);
  run.location = LOCATION_MAP.tavern;
  const combat = Combat.generateCombatMap(LOCATION_MAP.tavern, 1, rng3, { revealed: true });
  Combat.spawnEncounter(combat, Run.activeFighters(run), 1, rng3, {});
  ui.setG({ meta, hero, run, combat });
  ui.combatScreen();
  ui.combatScreenInputs();

  const clickBtn = (labelPart) => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(labelPart));
    if (!b) throw new Error('no button ' + labelPart);
    b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  };
  let heroTurn = false;
  for (let i = 0; i < 160 && !heroTurn && !combat.over; i++) {
    await sleep(300);
    const cur = combat.units.find(x => x.id === combat.order[combat.turnIndex]);
    if (!cur) continue;
    if (cur.team === 'player' && !cur.dead) {
      if (cur.char.hero) { heroTurn = true; break; }
      clickBtn('End Turn');
    }
  }
  if (!heroTurn) fail('never reached the hero turn');
  const heroU = combat.units.find(x => x.char.hero);
  assert(heroU.actionPoints === 1, 'hero turn starts with 1 action point');
  const weaponBefore = heroU.char.weapon.base;

  ui.showInspectModal(heroU.x, heroU.y);
  const takeOff = [...document.querySelectorAll('.inspect-panel .gear-row button')].find(b => b.textContent.includes('Take off'));
  if (!takeOff) fail('inspect modal should show Take off for the acting unit');
  takeOff.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert(heroU.actionPoints === 0, 'in-combat Take off must spend the action point');
  assert(heroU.char.weapon.base === 'fists', 'weapon should be unequipped');
  assert(heroU.char.gearBag.some(i => i.kind === 'weapon' && i.id === weaponBefore), 'weapon returns to the pack');
  // sheet refreshed with the new state
  const sheetText = document.querySelector('.inspect-panel').textContent;
  assert(sheetText.includes('Gear Pack'), 'refreshed sheet should show the Gear Pack');
  step('combat inspect modal: Take off spends the action point and refreshes');
}

console.log('errors captured:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
