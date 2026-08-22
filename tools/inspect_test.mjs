// Long-press inspection modal test (jsdom): boot → combat → hold-click a unit
// tile (sheet + terrain) → hold-click an empty tile (terrain only) → verify a
// quick click still moves normally and a held click never triggers actions.
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


// ---- boot into combat ----
ui.titleScreen();
clickBtn('New Hero');
clickCard('Dwarf');
clickCard('Hill Dwarf');
clickCard('Fighter');
clickCard('Champion');
for (let i = 0; i < 6; i++) {
  const card = [...document.querySelectorAll('.score-card')].find(c => c.textContent.includes('click to assign'));
  if (card) card.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
}
clickBtn('Continue');
const input = document.querySelector('.name-input');
input.value = 'Inspector';
input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
clickBtn('Descend');
await walkToNpc('Dante');
clickBtn('Begin the Descent');
clickBtn('To Battle');
// main.js wires canvas inputs via a MutationObserver; in this test we call it directly
ui.combatScreenInputs();
step('booted into combat');

const canvas = document.querySelector('#combat-canvas');
if (!canvas) fail('no combat canvas');
const W = G.combat.w, H = G.combat.h;
const clientXY = (tx, ty) => ({
  clientX: ((tx + 0.5) / W) * canvas.width,
  clientY: ((ty + 0.5) / H) * canvas.height,
  button: 0,
});
const press = (tx, ty) => {
  const ev = new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, ...clientXY(tx, ty) });
  canvas.dispatchEvent(ev);
};
const release = (tx, ty) => {
  const ev = new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, ...clientXY(tx, ty) });
  canvas.dispatchEvent(ev);
};

// ---- 1. long-press a tile with a unit ----
const unit = G.combat.units.find(u => u.team === 'player' && !u.dead);
press(unit.x, unit.y);
await sleep(700);
let modal = document.querySelector('.inspect-overlay');
if (!modal) fail('no inspect modal after long-press on a unit');
const modalText = modal.textContent;
if (!modalText.includes(unit.name)) fail('modal missing unit name');
if (!modalText.includes('Ability Scores')) fail('modal missing character sheet (abilities)');
if (!modalText.includes('Tile (')) fail('modal missing tile info');
step(`long-press on ${unit.name}: character sheet + tile info shown`);
const posBefore = { x: unit.x, y: unit.y };
release(unit.x, unit.y);
await sleep(50);
if (unit.x !== posBefore.x || unit.y !== posBefore.y) fail('long-press triggered a move (should be suppressed)');
step('release after long-press: no action triggered');
clickBtn('Close');
if (document.querySelector('.inspect-overlay')) fail('modal did not close');

// ---- 2. long-press an empty tile ----
let empty = null;
for (let y = 0; y < H && !empty; y++)
  for (let x = 0; x < W && !empty; x++) {
    const t = G.combat.grid[y][x];
    if ((t.discovered || G.combat.revealed) && !Combat.unitAtAny(G.combat, x, y)) empty = { x, y };
  }
if (!empty) fail('no empty tile found');
press(empty.x, empty.y);
await sleep(700);
modal = document.querySelector('.inspect-overlay');
if (!modal) fail('no inspect modal after long-press on empty tile');
const txt2 = modal.textContent;
if (!txt2.includes('Terrain Inspection')) fail('empty-tile modal missing terrain header');
if (!txt2.includes('Tile (')) fail('empty-tile modal missing tile coords');
if (txt2.includes('Ability Scores')) fail('empty-tile modal shows a character sheet');
const hasDetail = /Elevation|Hazard|Obstacle|Terrain|Darkness|Smoke/.test(txt2);
if (!hasDetail) fail('empty-tile modal has no topographical detail');
step('long-press on empty tile: terrain/hazard info only');
clickBtn('Close');

// ---- 3. quick click still moves (on a player turn) ----
let playerTurn = false;
for (let i = 0; i < 60 && !playerTurn && !G.combat.over; i++) {
  await sleep(600);
  const cur = G.combat.units.find(u => u.id === G.combat.order[G.combat.turnIndex]);
  if (cur && cur.team === 'player' && !cur.dead) playerTurn = true;
}
if (G.combat.over) {
  step('combat ended before movement check (fine)');
} else if (!playerTurn) {
  fail('never reached a player turn');
} else {
  const u = G.combat.units.find(x => x.id === G.combat.order[G.combat.turnIndex]);
  // find an adjacent passable empty tile
  let dest = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const tx = u.x + dx, ty = u.y + dy;
    if (Combat.isPassable(G.combat, tx, ty) && !Combat.unitAtAny(G.combat, tx, ty)) { dest = { tx, ty }; break; }
  }
  if (!dest) {
    step('no adjacent tile available; skipping quick-click move check');
  } else {
    press(dest.tx, dest.ty);
    await sleep(80); // quick release, under the long-press threshold
    release(dest.tx, dest.ty);
    await sleep(50);
    if (u.x !== dest.tx || u.y !== dest.ty) fail(`quick click did not move unit (${u.x},${u.y} -> ${dest.tx},${dest.ty})`);
    step('quick click still moves the unit normally');
  }
}

console.log('errors captured:', errors.length ? errors : 'none');
if (errors.length) process.exit(1);

// ---- 4. retreat flow ----
if (!G.combat.over) {
  clickBtn('Retreat');
  clickBtn('Yes, flee');
  await sleep(900);
  const uiText = document.querySelector('#ui')?.textContent || '';
  if (!uiText.includes('RETREATED')) fail('retreat did not end the run with RETREATED screen');
  if (G.meta.hero.dead) fail('retreating hero should still be alive');
  step('Retreat ends the run gracefully, hero alive');
  console.log('errors captured: none');
  process.exit(0);
} else {
  step('combat already over; retreat path not exercised');
  process.exit(0);
}
