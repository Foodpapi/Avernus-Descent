// Debug console test (jsdom): long-press the title button to unlock, Tab opens
// the console in-run, "skip floor" force-wins the combat, and the other debug
// commands behave.
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
const G = { meta: Run.defaultMeta(), hero: null, run: null, combat: null, debugUnlocked: false };
ui.setG(G);

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); };
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
const keyTab = () => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
const keyEsc = () => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
const consoleOpen = () => !!document.querySelector('.console-overlay');
const consoleOut = () => document.querySelector('.console-out')?.textContent || '';
const runCommand = (cmd) => {
  const input = document.querySelector('.console-in');
  if (!input) throw new Error('console input missing');
  input.value = cmd;
  clickBtn('Run');
};

// ============ 1. UNLOCK VIA LONG-PRESS ============
ui.titleScreen();
assert(!G.debugUnlocked, 'console should start locked');
const primary = [...document.querySelectorAll('.title-btns button')][0];
// quick press: navigates (creation screen) — but hold it long enough to unlock FIRST
primary.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
await sleep(700); // past the 550ms threshold
primary.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
primary.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); // the click a browser would fire
assert(G.debugUnlocked === true, 'long-press should unlock the console');
assert(localStorage.getItem('avernus_debug') === '1', 'unlock should persist to localStorage');
// long press must NOT navigate (the trailing click is suppressed)
if (document.querySelector('.game-title') === null) fail('long-press should not navigate away from the title');
step('long-press on title button unlocks the console (no navigation)');

// quick press navigates normally (pointer release → browser fires a click)
primary.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
await sleep(40);
primary.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
primary.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
assert(document.querySelector('.creation'), 'quick press should still navigate to creation');
step('quick press still navigates normally');

// ============ 2. BOOT INTO COMBAT ============
clickCard('Dwarf');
clickCard('Fighter');
clickCard('Champion');
for (let i = 0; i < 6; i++) {
  const card = [...document.querySelectorAll('.score-card')].find(c => c.textContent.includes('click to assign'));
  if (card) card.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
}
clickBtn('Continue');
const input = document.querySelector('.name-input');
input.value = 'Debugguy';
input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
clickBtn('Descend');
await walkToNpc('Dante');
clickBtn('Begin the Descent');
clickBtn('To Battle');
ui.combatScreenInputs();
step('booted into combat');

// ============ 3. TAB OPENS THE CONSOLE ============
assert(!consoleOpen(), 'console should be closed');
keyTab();
assert(consoleOpen(), 'Tab should open the console when unlocked & in a run');
step('Tab opens the console modal during a run');

// ============ 4. HELP ============
runCommand('help');
assert(consoleOut().includes('skip floor'), 'help should list skip floor');
assert(consoleOut().includes('heal'), 'help should list heal');
step('help lists the commands');

// ============ 5. GOLD / SHARDS / HEAL ============
const goldBefore = G.run.runGold;
runCommand('gold 500');
assert(G.run.runGold === goldBefore + 500, 'gold command should add gold');
const shardsBefore = G.meta.shards;
runCommand('shards 300');
assert(G.meta.shards === shardsBefore + 300, 'shards command should add shards');
runCommand('heal');
assert(G.run.roster.every(c => c.hp === c.maxHp), 'heal should max everyone');
runCommand('bogus command');
assert(consoleOut().includes('Unknown command'), 'unknown commands should report an error');
step('gold/shards/heal/unknown commands all behave');

// ============ 6. SKIP FLOOR ============
const combat = G.combat;
assert(combat && !combat.over, 'combat should be running');
const enemiesBefore = Combat.aliveEnemies(combat).length;
assert(enemiesBefore > 0, 'enemies should be present');
runCommand('skip floor');
assert(combat.over === true && combat.won === true, 'skip floor should win the combat');
assert(Combat.aliveEnemies(combat).length === 0, 'skip floor should kill all enemies');
assert(consoleOut().includes('Floor skipped'), 'console should confirm');
step('skip floor force-wins the combat (all enemies dead)');

// victory flow follows (loot screen)
await sleep(1000);
const uiText = document.querySelector('#ui').textContent;
assert(uiText.includes('VICTORY') || uiText.includes('Loot'), 'victory/loot screen should follow: ' + uiText.slice(0, 80));
step('victory flow proceeds after the skip');

// ============ 7. ESC CLOSES, TAB TOGGLES ============
keyTab();
assert(consoleOpen(), 'Tab should reopen the console');
keyEsc();
assert(!consoleOpen(), 'Escape should close the console');
keyTab();
assert(consoleOpen(), 'Tab toggles back open');
runCommand('close');
assert(!consoleOpen(), '"close" command closes the console');
step('Tab/Esc/close toggle the console');

// Tab does nothing while locked
G.debugUnlocked = false;
keyTab();
assert(!consoleOpen(), 'locked console must not open');
G.debugUnlocked = true;
step('locked console ignores Tab');

console.log('errors captured:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
