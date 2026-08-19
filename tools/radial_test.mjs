// Radial action menu test (jsdom): boot → combat → player turn → verify the
// radial appears over the hero with green/orange/grey color coding, navigate
// the Actions submenu, use Dash, and end the turn from the radial.
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

const radialBtns = () => [...document.querySelectorAll('.radial .radial-btn')];
const radialBtn = (labelPart) => radialBtns().find(b => b.textContent.includes(labelPart));

// ---- boot into combat ----
ui.titleScreen();
clickBtn('New Hero');
clickCard('Dwarf');
clickCard('Fighter');
clickCard('Champion');
for (let i = 0; i < 6; i++) {
  const card = [...document.querySelectorAll('.score-card')].find(c => c.textContent.includes('click to assign'));
  if (card) card.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
}
clickBtn('Continue');
const input = document.querySelector('.name-input');
input.value = 'Radial';
input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
clickBtn('Descend');
await walkToNpc('Dante');
clickBtn('Begin the Descent');
clickBtn('To Battle');
ui.combatScreenInputs();
step('booted into combat');

// ---- wait for the HERO's turn (the fighter; initiative order is random) ----
// Skip any companion turns by clicking End Turn (the game waits for human input).
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
if (!heroTurn && !G.combat.over) fail('never reached the hero\'s turn');

// ---- 1. radial root appears with correct color coding (fighter has Surge) ----
const btns = radialBtns();
if (btns.length !== 5) fail(`radial root for a fighter should have 5 buttons (incl. Surge), got ${btns.length}`);
const labels = btns.map(b => b.textContent).join('|');
if (!labels.includes('Actions') || !labels.includes('Bonus Actions') || !labels.includes('Surge') || !labels.includes('End Turn') || !labels.includes('Retreat')) fail('radial root missing a menu item: ' + labels);
const actionsBtn = radialBtn('Actions');
const bonusBtn = radialBtn('Bonus Actions');
const surgeBtn = radialBtn('Surge');
const endBtn = radialBtn('End Turn');
const retreatBtn = radialBtn('Retreat');
if (!actionsBtn.classList.contains('radial-green')) fail('Actions button is not green');
if (!bonusBtn.classList.contains('radial-orange')) fail('Bonus Actions button is not orange');
if (!surgeBtn.classList.contains('radial-grey')) fail('Surge button is not grey');
if (!endBtn.classList.contains('radial-grey')) fail('End Turn button is not grey');
if (!retreatBtn.classList.contains('radial-grey')) fail('Retreat button is not grey');
const heroUnit = G.combat.units.find(x => x.char.hero);
if (heroUnit.actionPoints !== 1 || heroUnit.bonusPoints !== 1) fail('turn should start with 1 action + 1 bonus point');
step('radial root: green Actions, orange Bonus Actions, grey Surge/End Turn/Retreat (1/1 points)');

// ---- 1b. Action Surge grants a point instead of wasting the surge ----
surgeBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
if (heroUnit.actionPoints !== 2) fail(`Surge should give 2 action points, got ${heroUnit.actionPoints}`);
if (!radialBtn('Actions') || radialBtn('Actions').classList.contains('radial-disabled')) fail('Actions should be enabled with 2 points');
if (!radialBtn('Actions').textContent.includes('×2')) fail('Actions should show ×2 after surge: ' + radialBtn('Actions').textContent);
step('Action Surge: 1→2 action points, counter shown, no wasted surge');

// ---- 2. Actions submenu is all green (Back is grey) ----
actionsBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
let sub = radialBtns();
const subLabels = sub.map(b => b.textContent).join('|');
if (!subLabels.includes('Attack') || !subLabels.includes('Dash') || !subLabels.includes('Back')) fail('actions submenu missing items: ' + subLabels);
for (const b of sub) {
  const isBack = b.textContent.includes('Back');
  if (isBack && !b.classList.contains('radial-grey')) fail('Back button should be grey');
  if (!isBack && !b.classList.contains('radial-green')) fail(`actions submenu item "${b.textContent}" should be green`);
}
step('Actions submenu: Dash/Dodge/Attack/etc are green, Back is grey');

// ---- 3. Dash spends a point, doubles movement, returns to root ----
const dashBtn = radialBtn('Dash');
if (!dashBtn) fail('no Dash button');
const u = heroUnit;
const speedBefore = u.moveRemaining;
dashBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
if (u.actionPoints !== 1) fail(`first dash should leave 1 action point (of 2), got ${u.actionPoints}`);
if (u.moveRemaining <= speedBefore) fail(`Dash did not add movement (${speedBefore} -> ${u.moveRemaining})`);
if (radialBtn('Actions').classList.contains('radial-disabled')) fail('Actions should still be enabled (1 point left)');
step('Dash: spent 1 of 2 action points, movement increased, Actions still live');

// ---- 3b. second Dash spends the last point and disables Actions ----
radialBtn('Actions').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const dashBtn2 = radialBtn('Dash');
dashBtn2.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
if (u.actionPoints !== 0) fail(`second dash should leave 0 action points, got ${u.actionPoints}`);
if (!radialBtn('Actions').classList.contains('radial-disabled')) fail('Actions should be disabled at 0 points');
step('Second Dash: 0 action points left, Actions dimmed (action-- works)');

// ---- 4. End Turn from the radial ----
const beforeId = G.combat.order[G.combat.turnIndex];
const endBtn2 = radialBtn('End Turn');
endBtn2.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
if (G.combat.order[G.combat.turnIndex] === beforeId && !G.combat.over) fail('End Turn did not advance the turn');
// note: if the next unit is another player, their own radial legitimately opens
step('End Turn from radial advanced the turn');
if (!G.combat.over) {
  // let enemies resolve if it's their turn now
  await sleep(1200);
}
if (!G.combat.over) {
  const cur = G.combat.units.find(x => x.id === G.combat.order[G.combat.turnIndex]);
  if (cur && cur.team === 'player') {
    if (!document.querySelector('.radial')) fail('radial missing for the next player turn');
    step('radial appears for the next player turn');
  }
}

console.log('errors captured:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
