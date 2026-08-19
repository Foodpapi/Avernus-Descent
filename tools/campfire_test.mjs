// Campfire sheet test (jsdom): notifications for pending level-up choices,
// clickable party rows opening a character sheet with inventory + spellbook,
// ASI allocation, subclass selection, and multiclassing.
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
const { makeRng } = await import('../src/rng.js');
const { createCharacter } = await import('../src/5e/rules.js');
const { autoAssignScores } = await import('../src/game/run.js');
const { RACES } = await import('../src/data/races.js');
const { CLASS_MAP } = await import('../src/data/classes.js');
const { LOCATION_MAP } = await import('../src/data/locations.js');

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function talkToMember(name) {
  G.walkInstant = true;
  const npc = [...document.querySelectorAll('.walk-npc')].find(n => n.textContent.includes(name));
  if (!npc) throw new Error('no member npc ' + name);
  npc.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  for (let i = 0; i < 200; i++) {
    await sleep(25);
    const dlg = document.querySelector('.npc-dialog');
    if (dlg) return;
  }
  throw new Error('dialog never opened for ' + name);
}
const assert = (cond, m) => { if (!cond) fail(m); };
const clickBtn = (labelPart) => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(labelPart));
  if (!b) throw new Error(`Button not found: ${labelPart}`);
  b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
};
const clickCard = (labelPart) => {
  const c = [...document.querySelectorAll('.card')].find(x => x.textContent.includes(labelPart));
  if (!c) throw new Error(`Card not found: ${labelPart}`);
  c.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
};

// ---- set up a run with a wizard hero ----
const rng = makeRng(999);
const meta = { shards: 0, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
const race = RACES[2];
const wizCls = CLASS_MAP.wizard;
const hero = createCharacter({ raceId: race.id, classId: 'wizard', name: 'CampWiz', subclassId: 'evocation', scoreAssign: autoAssignScores(wizCls, race, rng), level: 1, hero: true, rng });
meta.hero = hero;
const run = Run.newRun(meta, hero);
run.location = LOCATION_MAP.tavern;
const G = { meta, hero, run, combat: null };
ui.setG(G);

// give a companion pending choices (guarantee a caster for the spellbook check)
let comp = run.party.find(c => !c.hero && c.cls.spellAbility);
if (!comp) {
  // craft a caster companion if the random party lacks one
  const bardCls = CLASS_MAP.bard;
  const bard = createCharacter({ raceId: RACES[0].id, classId: 'bard', name: 'Bardy', subclassId: 'lore', scoreAssign: autoAssignScores(bardCls, RACES[0], rng), level: 1, hero: false, rng });
  run.party.push(bard);
  comp = bard;
}
comp.pendingLevelUp = true;
comp.pendingAsi = true;
const compStrBefore = comp.abilities.STR;

// ---- campfire screen shows the notification ----
ui.campScreen();
const uiText = document.querySelector('#ui').textContent;
if (!uiText.includes('pending level-up choices')) fail('campfire missing the pending-choices banner');
if (!uiText.includes(comp.name)) fail('banner missing the member name');
step('campfire banner notifies pending level-up choices');

// ---- walk to the member and open their sheet ----
await talkToMember(comp.name);
clickBtn('Character Sheet');
const modal = document.querySelector('.camp-sheet');
if (!modal) fail('no character sheet modal');
const mText = modal.textContent;
if (!mText.includes('Level Up')) fail('modal missing Level Up option');
if (!mText.includes('Ability Score Increase')) fail('modal missing ASI allocation');
if (!mText.includes('Character Sheet')) fail('modal missing character sheet');
if (!mText.includes('Inventory')) fail('modal missing inventory section');
if (!mText.includes('Spellbook')) fail('modal missing spellbook section');
step('sheet modal opens: sheet + inventory + spellbook + pending choices');

// ---- apply the level-up ----
clickBtn('Level Up');
const lvlAfter = comp.level;
assert(lvlAfter === 2, `companion should be level 2, got ${lvlAfter}`);
step('Level Up applied in the modal (level 1→2)');

// ---- allocate ASI (+2 STR) ----
const strCard = [...document.querySelectorAll('.score-card')].find(c => c.textContent.startsWith('STR '));
if (!strCard) fail('no STR card in ASI UI');
strCard.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
clickBtn('Confirm');
assert(comp.abilities.STR === compStrBefore + 2, `STR should be +2 (${compStrBefore} → ${comp.abilities.STR})`);
assert(comp.pendingAsi === false, 'pendingAsi should be cleared');
step('ASI allocated: +2 STR confirmed');

// ---- multiclass into Barbarian ----
comp.pendingLevelUp = true;
ui.campScreen();
await talkToMember(comp.name);
clickBtn('Character Sheet');
clickBtn('Multiclass');
const barbCard = [...document.querySelectorAll('.class-grid .card')].find(c => c.textContent.includes('Barbarian'));
if (!barbCard) fail('no Barbarian card in the multiclass picker');
barbCard.querySelector('button').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
assert(comp.secondClass && comp.secondClass.classId === 'barbarian' && comp.secondClass.level === 1, 'multiclass should add Barbarian 1');
const multiText = document.querySelector('.camp-sheet').textContent;
if (!multiText.includes('Barbarian 1')) fail('sheet should show the multiclass');
step('multiclassed into Barbarian: sheet shows Wizard / Barbarian 1');

// ---- subclass selection at level 3 ----
const comp2 = run.party.find(c => !c.hero && c.id !== comp.id);
comp2.pendingSubclass = true;
comp2.pendingLevelUp = false; comp2.pendingAsi = false; comp2.pendingSpellChoice = false;
ui.campScreen();
await talkToMember(comp2.name);
clickBtn('Character Sheet');
const subText = document.querySelector('.camp-sheet').textContent;
if (!subText.includes('Choose')) fail('modal missing subclass choice');
const firstSubBtn = document.querySelector('.camp-sheet .sub-grid .card button');
if (!firstSubBtn) fail('no subclass buttons');
const subId = [...document.querySelectorAll('.camp-sheet .sub-grid .card')][0].textContent.trim();
firstSubBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
assert(comp2.subclassId !== null && comp2.subclassId !== undefined, 'subclass should be set');
assert(comp2.pendingSubclass === false, 'pendingSubclass cleared');
step(`subclass chosen for ${comp2.name}`);

console.log('errors captured:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
