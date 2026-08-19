// Walkable scenes test (jsdom): hub/camp/town maps, keyboard movement,
// collision, NPC adjacency + E interact, auto-walk on NPC click, Dante starting
// the run, Beatrice's shop, Virgil's records + starting-equipment persistence.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"><div id="ui"></div></div></body></html>', {
  url: 'http://localhost:8080/index.html',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.navigator = dom.window.navigator;
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
const { makeRng } = await import('../src/rng.js');
const { createCharacter } = await import('../src/5e/rules.js');
const { RACES } = await import('../src/data/races.js');
const { CLASS_MAP } = await import('../src/data/classes.js');
const { LOCATION_MAP } = await import('../src/data/locations.js');

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = (k) => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const clickBtn = (labelPart) => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(labelPart));
  if (!b) throw new Error('no button ' + labelPart);
  b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
};
const clickCard = (labelPart) => {
  const c = [...document.querySelectorAll('.card')].find(x => x.textContent.includes(labelPart));
  if (!c) throw new Error('no card ' + labelPart);
  c.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
};
const npcEl = (namePart) => [...document.querySelectorAll('.walk-npc')].find(n => n.textContent.includes(namePart));
const waitDialog = async (namePart) => {
  for (let i = 0; i < 200; i++) {
    await sleep(25);
    const dlg = document.querySelector('.npc-dialog');
    if (dlg && (!namePart || dlg.textContent.includes(namePart))) return dlg;
  }
  throw new Error('dialog never opened: ' + namePart);
};

// ---- create hero ----
const rng = makeRng(777);
const meta = { shards: 5000, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
const fcls = CLASS_MAP.fighter;
const hero = createCharacter({ raceId: RACES[0].id, classId: 'fighter', name: 'Walker', subclassId: 'champion', scoreAssign: Run.autoAssignScores(fcls, RACES[0], rng), level: 1, hero: true, rng });
meta.hero = hero;
const G = { meta, hero, run: null, combat: null, walk: null, walkInstant: true, debugUnlocked: false };
ui.setG(G);

// ============ 1. HUB WALK SCENE ============
ui.hubScreen();
assert(G.walk && G.walk.mapId === 'hub', 'hub walk state created');
assert(!!npcEl('Dante Alighieri'), 'Dante present');
assert(!!npcEl('Beatrice'), 'Beatrice present');
assert(!!npcEl('Virgil'), 'Virgil present');
assert(!!document.querySelector('#walk-canvas'), 'walk canvas rendered');
step('hub walk scene renders with Dante, Beatrice and Virgil');

// keyboard movement + collision
const startPos = { x: G.walk.x, y: G.walk.y };
key('ArrowUp');
assert(G.walk.y === startPos.y - 1, 'arrow key should move up');
for (let i = 0; i < 40; i++) key('ArrowLeft');
assert(G.walk.x >= 1, 'walls should block movement (x never below 1)');
step('arrow-key movement works and walls block');

// E near an NPC opens their dialog: teleport next to Dante for the test
G.walk.x = 11; G.walk.y = 4; // adjacent to Dante at (12,4)
ui.renderWalk();
key('e');
await waitDialog('Dante');
assert(document.querySelector('.npc-dialog').textContent.includes('Begin the Descent'), 'Dante offers to begin the run');
step('E near an NPC opens their dialog');

// ============ 2. DANTE STARTS THE RUN ============
clickBtn('Begin the Descent');
const introText = document.querySelector('#ui').textContent;
assert(introText.includes('Floor') || introText.includes('To Battle'), 'Dante should start the run (floor intro): ' + introText.slice(0, 80));
step('Dante begins the descent');

// ============ 3. BEATRICE'S SHOP ============
ui.hubScreen();
G.walkInstant = true;
npcEl('Beatrice').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
await waitDialog('Beatrice');
const dlgText = document.querySelector('.npc-dialog').textContent;
assert(dlgText.includes('Soul Shards'), 'Beatrice shows shards');
assert(dlgText.includes("Alchemist's Belt"), 'Beatrice lists shop items');
const shardsBefore = meta.shards;
clickBtn('Buy');
assert(meta.shards < shardsBefore, 'buying from Beatrice should spend shards');
step("Beatrice's shop: shards shown, buying works");

// ============ 4. VIRGIL'S RECORDS + STARTING GEAR ============
ui.hubScreen();
G.walkInstant = true;
npcEl('Virgil').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
await waitDialog('Virgil');
const vText = document.querySelector('.npc-dialog').textContent;
assert(vText.includes('Runs') && vText.includes('Best Floor'), 'Virgil shows run records');
clickBtn('Character Sheet & Starting Equipment');
const sheet = document.querySelector('.hub-sheet');
if (!sheet) fail('Virgil should open the hero sheet');
assert(sheet.textContent.includes('Equipment'), 'sheet has equipment section');
// change starting weapon via the sheet: take off the longsword
const takeOff = [...sheet.querySelectorAll('.gear-row button')].find(b => b.textContent.includes('Take off'));
if (!takeOff) fail('sheet should allow unequipping');
takeOff.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
assert(hero.weapon.base === 'fists', 'hub sheet can unequip the weapon');
assert(hero.hubGear && hero.hubGear.weapon.base === 'fists', 'hub gear config persisted');
// a new run must start with the configured fists
const run = Run.newRun(meta, hero);
assert(hero.weapon.base === 'fists', 'new run applies the hub-configured starting weapon');
step("Virgil's records + starting equipment changes persist into new runs");

// ============ 5. CAMP WALK ============
run.location = LOCATION_MAP.tavern;
G.run = run;
G.walk = null;
ui.campScreen();
assert(G.walk && G.walk.mapId === 'camp', 'camp walk state created');
const members = [...document.querySelectorAll('.walk-npc')].filter(n => !n.textContent.includes('Road Ahead'));
assert(members.length >= 1, 'camp has party member NPCs');
assert(!!npcEl('The Road Ahead'), 'camp exit NPC present');
// member dialog → sheet
const comp = run.roster.find(c => !c.hero);
npcEl(comp.name).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
await waitDialog(comp.name);
clickBtn('Character Sheet');
assert(!!document.querySelector('.camp-sheet'), 'member sheet opens from the camp walk');
document.querySelectorAll('.overlay').forEach(o => o.remove());
step('camp walk: party members talkable, sheet opens');

// ============ 6. CAMP EXIT → NEXT FLOOR ============
const floorBefore = run.floor;
npcEl('The Road Ahead').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
await waitDialog('Road Ahead');
clickBtn('Descend Further');
assert(run.floor === floorBefore + 1, 'exit should advance the floor');
assert(document.querySelector('#ui').textContent.includes('Floor'), 'floor intro shows');
step('camp exit advances to the next floor');

// ============ 7. TOWN WALK ============
run.floorsCleared = 3;
run.floor = 4;
ui.townScreen();
assert(G.walk && G.walk.mapId === 'town', 'town walk state created');
assert(!!npcEl('Shopkeeper'), 'town shopkeeper present');
assert(!!npcEl('City Gate'), 'town gate present');
const townNpcs = document.querySelectorAll('.walk-npc').length;
assert(townNpcs >= 4, `town should have several NPCs (got ${townNpcs})`);
// shop dialog
npcEl('Shopkeeper').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
await waitDialog('Shopkeeper');
assert(document.querySelector('.npc-dialog').textContent.includes('run gold'), 'shop dialog shows gold pricing');
document.querySelectorAll('.overlay').forEach(o => o.remove());
step('town walk: shopkeeper, gate, mercenaries and townsfolk present');

// ============ 8. AUTO-WALK ON NPC CLICK ============
ui.hubScreen();
G.walkInstant = false; // real-time walking for this check
G.walk.x = 8; G.walk.y = 8; // spawn
const dante = npcEl('Dante Alighieri');
const distBefore = Math.max(Math.abs(G.walk.x - 12), Math.abs(G.walk.y - 4));
dante.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
await waitDialog('Dante');
const distAfter = Math.max(Math.abs(G.walk.x - 12), Math.abs(G.walk.y - 4));
assert(distAfter <= 1, 'auto-walk should bring the hero adjacent to the NPC');
assert(distAfter < distBefore, 'hero should have moved toward the NPC');
step('clicking a distant NPC auto-walks to them and opens the dialog');

console.log('errors captured:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
