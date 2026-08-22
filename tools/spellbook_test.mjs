// Spellbook test (jsdom): boot a wizard, open the spellbook from the radial,
// verify inline dice info on rows, long-press a spell for its full dictionary
// entry, navigate Back to the spell list, and quick-cast a spell.
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
const G = { meta: Run.defaultMeta(), hero: null, run: null, combat: null };
ui.setG(G);

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
// walk-scene helper: click an NPC (auto-walk + talk) and return the dialog
async function walkToNpc(namePart) {
  G.walkInstant = true;
  const npc = [...document.querySelectorAll('.walk-npc')].find(n => n.textContent.includes(namePart));
  if (!npc) throw new Error('no walk npc: ' + namePart);
  npc.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  for (let i = 0; i < 200; i++) {
    await sleep(25);
    const dlg = document.querySelector('.npc-dialog');
    if (dlg) return dlg;
  }
  throw new Error('dialog never opened for ' + namePart);
}

const pressEl = (el) => el.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
const releaseEl = (el) => el.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
const spellRow = (namePart) => [...document.querySelectorAll('.spellbook .spell-row')].find(r => r.textContent.includes(namePart));
const toastText = () => document.querySelector('#toast')?.textContent || '';

// ---- boot a WIZARD hero into combat ----
ui.titleScreen();
clickBtn('New Hero');
clickCard('Dwarf');
clickCard('Hill Dwarf');
clickCard('Wizard');
clickCard('School of Evocation');
for (let i = 0; i < 6; i++) {
  const card = [...document.querySelectorAll('.score-card')].find(c => c.textContent.includes('click to assign'));
  if (card) card.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
}
clickBtn('Continue');
const input = document.querySelector('.name-input');
input.value = 'Gandalf';
input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
clickBtn('Descend');
await walkToNpc('Dante');
clickBtn('Begin the Descent');
clickBtn('To Battle');
ui.combatScreenInputs();
step('booted wizard into combat');

// ---- reach the hero's turn ----
let heroTurn = false;
for (let i = 0; i < 160 && !heroTurn && !G.combat.over; i++) {
  await sleep(300);
  const cur = G.combat.units.find(u => u.id === G.combat.order[G.combat.turnIndex]);
  if (!cur) continue;
  if (cur.team === 'player' && !cur.dead) {
    if (cur.char.hero) { heroTurn = true; break; }
    clickBtn('End Turn');
  }
}
if (!heroTurn && !G.combat.over) fail('never reached the hero turn');
step('reached the hero turn');

// ---- open the spellbook via the radial ----
const radialBtn = (labelPart) => [...document.querySelectorAll('.radial .radial-btn')].find(b => b.textContent.includes(labelPart));
radialBtn('Actions').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
radialBtn('Spells').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
if (!document.querySelector('.spellbook-overlay')) fail('spellbook did not open');
step('spellbook opened from radial');

// ---- 1. inline dice info on the Fire Bolt row ----
const fireBolt = spellRow('Fire Bolt');
if (!fireBolt) fail('no Fire Bolt row');
const fbText = fireBolt.textContent;
if (!fbText.includes('Evocation · action ·') || !fbText.includes('60 ft')) fail('Fire Bolt row missing school/cast/range: ' + fbText);
if (!fbText.includes('1d10')) fail('Fire Bolt row missing its dice');
if (!fbText.includes('d20 vs AC')) fail('Fire Bolt row missing attack-roll info');
if (!fbText.includes('ACTION')) fail('Fire Bolt row missing cost badge');
step('Fire Bolt row shows: Evocation · action · 12 tiles (60 ft) · d20 vs AC · 1d10 fire');

// ---- 2. long-press opens the full dictionary entry ----
pressEl(fireBolt);
await sleep(700);
releaseEl(fireBolt);
const detail = document.querySelector('.spell-detail');
if (!detail) fail('long-press did not open the spell detail modal');
const dText = detail.textContent;
for (const needle of ['Cantrip', 'Evocation', 'Attack roll', 'd20', 'spell attack bonus', 'Cantrip Scaling', 'level 5: 2d10', 'critical hit', '60 ft']) {
  if (!dText.includes(needle)) fail(`detail missing "${needle}"`);
}
if (toastText().includes('Fire Bolt')) fail('long-press should NOT trigger casting');
step('long-press: full dictionary entry (level, school, attack roll vs AC, scaling, crits)');

// ---- 3. Back returns to the spell list ----
clickBtn('Back to Spells');
if (document.querySelector('.spell-detail')) fail('detail modal did not close on Back');
if (!document.querySelector('.spellbook-overlay')) fail('spellbook should still be open after Back');
step('Back returns to the previous spells menu');

// ---- 4. concentration badge (open Sleep — not concentration; check via Mage Armor for floor dur) ----
const sleepRow = spellRow('Sleep');
if (sleepRow) {
  pressEl(sleepRow);
  await sleep(700);
  releaseEl(sleepRow);
  const d2 = document.querySelector('.spell-detail');
  if (!d2) fail('Sleep detail did not open');
  if (!d2.textContent.includes('HP pool')) fail('Sleep detail missing its no-save mechanic');
  if (!d2.textContent.includes('Radius 2 tiles')) fail('Sleep detail missing area');
  clickBtn('Back to Spells');
  step('Sleep entry: area + no-save HP-pool mechanics shown');
}

// ---- 5. quick click still casts ----
const mm = spellRow('Magic Missile');
if (!mm) fail('no Magic Missile row');
pressEl(mm);
await sleep(60);
releaseEl(mm);
if (document.querySelector('.spellbook-overlay')) fail('spellbook should close when casting');
if (!toastText().includes('Magic Missile')) fail('quick click did not start casting: ' + toastText());
step('quick click casts: targeting mode with toast prompt');

console.log('errors captured:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
