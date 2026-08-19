// Full user-flow click-through in jsdom: title → creation (all steps) → hub
// → floor intro → combat screen → combat interactions.
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

const errors = [];
dom.window.addEventListener('error', e => errors.push(e.message));

const ui = await import('../src/ui.js');
const Run = await import('../src/game/run.js');
const G = { meta: { ...Run.defaultMeta(), shards: 5000 }, hero: null, run: null, combat: null };
ui.setG(G);

const step = (msg) => console.log('✔', msg);
const sleep = ms => new Promise(r => setTimeout(r, ms));
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

// 1. title
ui.titleScreen();
step('title screen');
clickBtn('New Hero');
step('clicked New Hero → creation (race step)');

// 2. pick race
clickCard('Dwarf');
step('picked race → class step');

// 3. pick class
clickCard('Paladin');
step('picked class → subclass step');

// 4. pick subclass
clickCard('Oath of Devotion');
step('picked subclass → scores step');

// 5. assign scores (click each score card once to assign descending)
for (let i = 0; i < 6; i++) {
  const card = [...document.querySelectorAll('.score-card')].find(c => c.textContent.includes('click to assign'));
  if (!card) break;
  card.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
}
step('assigned scores → name step');

// click Continue to reach the naming step
clickBtn('Continue');
step('continued to naming step');

// 6. name + descend
const input = document.querySelector('.name-input');
if (!input) throw new Error('name input missing');
input.value = 'Testadin';
input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
clickBtn('Descend');
step('created hero → hub screen');

// 7. buy a shop item from Beatrice's walk-in shop
await walkToNpc('Beatrice');
const shardsBefore = G.meta.shards;
clickBtn('Buy');
if (G.meta.shards >= shardsBefore) throw new Error('buying did not spend shards');
document.querySelectorAll('.overlay').forEach(o => o.remove());
step('bought shop item');
await walkToNpc('Dante');
clickBtn('Begin the Descent');
step('began run → floor intro');
clickBtn('To Battle');
step('entered combat screen');

// 8. verify combat HUD exists
const canvas = document.querySelector('#combat-canvas');
if (!canvas) throw new Error('combat canvas missing');
const hud = document.querySelector('.combat-hud');
if (!hud) throw new Error('hud missing');
step('combat canvas + HUD rendered');

// 9. wait until a player's turn comes up (enemies may act first via timers)
let playerTurn = false;
for (let i = 0; i < 60 && !playerTurn; i++) {
  await new Promise(r => setTimeout(r, 700));
  const combat = G.combat;
  if (!combat) break;
  if (combat.over) break;
  const cur = combat.units.find(u => u.id === combat.order[combat.turnIndex]);
  if (cur && cur.team === 'player' && !cur.dead) playerTurn = true;
}
if (G.combat.over) {
  console.log('  combat already over (fast win/loss) — still fine');
  step('combat played through enemy turns');
} else if (playerTurn) {
  step('reached a player turn');
  clickBtn('End Turn');
  step('clicked End Turn');
  console.log('  combat state: round', G.combat.round);
} else {
  throw new Error('never reached a player turn');
}

console.log('errors captured:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
