// UI smoke test with a minimal DOM stub: imports ui.js, drives every screen,
// and simulates a short combat with canvas rendering.

// ---- DOM stubs ----
function makeCtx() {
  const fn = () => {};
  return new Proxy({}, {
    get(t, prop) {
      if (prop === 'measureText') return () => ({ width: 20 });
      if (prop in t) return t[prop];
      return fn;
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
}

const allElements = [];
const registry = new Map();
function findElement(sel) {
  if (sel.startsWith('#')) {
    const id = sel.slice(1);
    return allElements.find(e => e.id === id) || null;
  }
  if (sel.startsWith('.')) {
    const cls = sel.slice(1);
    return allElements.find(e => e.classList.contains(cls)) || null;
  }
  const tag = sel.toUpperCase();
  return allElements.find(e => e.tagName === tag) || null;
}
function makeElement(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    _listeners: {},
    className: '',
    id: '',
    value: '',
    placeholder: '',
    innerHTML: '',
    textContent: '',
    parentElement: null,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); },
    },
    appendChild(child) {
      if (typeof child === 'string') child = { textContent: child, tagName: '#text', children: [], style: {}, remove() {} };
      if (child) { child.parentElement = el; el.children.push(child); }
      return child;
    },
    removeChild(child) { const i = el.children.indexOf(child); if (i >= 0) el.children.splice(i, 1); },
    addEventListener(type, fn) { (el._listeners[type] = el._listeners[type] || []).push(fn); },
    dispatchEvent(ev) { (el._listeners[ev.type] || []).forEach(f => f(ev)); },
    remove() { const p = el.parentElement; if (p) p.removeChild(el); },
    setAttribute() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focus() {},
    click() { el.dispatchEvent({ type: 'click' }); },
    scrollTo() {},
  };
  if (tag === 'canvas') {
    el.width = 800; el.height = 600;
    el.getContext = () => makeCtx();
  }
  if (tag === 'input') el.focus = () => {};
  // className syncs with classList
  let _cls = '';
  Object.defineProperty(el, 'className', {
    get() { return _cls; },
    set(v) { _cls = String(v); el.classList._s = new Set(_cls.split(/\s+/).filter(Boolean)); },
  });
  allElements.push(el);
  return el;
}

const uiRoot = makeElement('div'); uiRoot.id = 'ui';
registry.set('#ui', uiRoot);
const body = makeElement('body');

globalThis.document = {
  createElement: (tag) => makeElement(tag),
  createTextNode: (text) => ({ tagName: '#text', textContent: String(text), children: [], style: {}, remove() {} }),
  querySelector: (sel) => findElement(sel),
  querySelectorAll: () => [],
  getElementById: (id) => findElement('#' + id),
  body,
  addEventListener() {},
};
globalThis.window = {
  addEventListener() {},
  scrollTo() {},
  innerWidth: 1280, innerHeight: 800,
};
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 16);
const store = new Map();
globalThis.localStorage = {
  getItem: k => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
globalThis.confirm = () => true;
globalThis.alert = () => {};

// ---- drive the UI ----
const ui = await import('../src/ui.js');
const { makeRng } = await import('../src/rng.js');
const { createCharacter } = await import('../src/5e/rules.js');
const { autoAssignScores, newRun, startFloor, buyShopItem } = await import('../src/game/run.js');
const { RACES } = await import('../src/data/races.js');
const { CLASSES } = await import('../src/data/classes.js');
const { endTurn } = await import('../src/5e/combat_actions.js');
const { SPELL_MAP } = await import('../src/data/spells.js');
const { performAction } = await import('../src/5e/turn.js');
const { currentUnit, aliveEnemies } = await import('../src/5e/combat.js');

const meta = { shards: 5000, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
const G = { meta, hero: null, run: null, combat: null, pendingLoot: null };
ui.setG(G);

ui.titleScreen();
console.log('ok: titleScreen');
ui.creationScreen();
console.log('ok: creationScreen');
ui.helpScreen?.();
console.log('ok: helpScreen');

// create hero
const rng = makeRng(99);
const race = RACES[2], cls = CLASSES[11]; // wizard for spell UI
const hero = createCharacter({
  raceId: race.id, classId: cls.id, name: 'SmokeTest',
  subclassId: 'evocation',
  scoreAssign: autoAssignScores(cls, race, rng),
  level: 1, hero: true, rng,
});
G.meta.hero = hero;
ui.hubScreen();
console.log('ok: hubScreen');
buyShopItem(meta, 'potion_belt');
buyShopItem(meta, 'wayfarers_map');
ui.hubScreen();
console.log('ok: hub after purchases');

// start a run
G.run = newRun(meta, hero);
startFloor(G.run, meta, 'tavern');
ui.floorIntroScreen();
console.log('ok: floorIntroScreen');

// simulate: begin combat (like beginFloor)
const locId = G.run.location.id;
const { generateCombatMap, spawnEncounter } = await import('../src/5e/combat.js');
const { LOCATION_MAP } = await import('../src/data/locations.js');
const { floorIsBoss } = await import('../src/game/run.js');
const combat = generateCombatMap(LOCATION_MAP[locId], G.run.floor, G.run.rng, {});
spawnEncounter(combat, G.run.party, G.run.floor, G.run.rng, { boss: floorIsBoss(G.run.floor) });
G.combat = combat;
ui.startCombat();
console.log('ok: combat screen built');

// drive a few player turns: move toward enemy & attack, then end turn
let guard = 0;
while (!combat.over && guard++ < 40) {
  const u = currentUnit(combat);
  if (!u) break;
  if (u.team === 'enemy') {
    // let the ui's enemy timer handle it; force one enemy action via AI
    const { chooseEnemyAction, executeEnemyTurn } = await import('../src/5e/ai.js');
    executeEnemyTurn(combat, u, chooseEnemyAction(combat, u));
    endTurn(combat);
    continue;
  }
  const enemies = aliveEnemies(combat);
  if (!enemies.length) break;
  const t = enemies[0];
  const dist = Math.max(Math.abs(t.x - u.x), Math.abs(t.y - u.y));
  if (dist > 1) {
    const { findPath } = await import('../src/5e/combat.js');
    let moved = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cand = { x: t.x + dx, y: t.y + dy };
      const res = findPath(combat, u, cand.x, cand.y, u.moveRemaining);
      if (res && res.path.length) { performAction(combat, u.id, { type: 'move', path: res.path }); moved = true; break; }
    }
    if (!moved) performAction(combat, u.id, { type: 'wait' });
  } else {
    performAction(combat, u.id, { type: 'attack', targetId: t.id, opts: { weaponId: u.char.weapon.base } });
  }
  endTurn(combat);
}
console.log('ok: combat simulation ran, result:', combat.won ? 'WIN' : 'LOSS', 'rounds', combat.round);

// exercise spell casting path
if (!combat.over) {
  const u = combat.units.find(x => x.team === 'player' && !x.dead);
  const sp = (u.char.spellsKnown || []).filter(id => {
    const s = SPELL_MAP[id];
    return s && s.level === 0 && s.dmg && s.mode !== 'aoe' && s.mode !== 'cone' && s.mode !== 'line' && s.mode !== 'self' && s.mode !== 'ally';
  })[0];
  if (sp) {
    const e = aliveEnemies(combat)[0];
    if (e) performAction(combat, u.id, { type: 'cast', spellId: sp, targetId: e.id });
    console.log('ok: cast spell', sp);
  }
}

// loot + level-up + defeat screens
const { rollLoot } = await import('../src/game/run.js');
const loot = rollLoot(G.run, 3, {});
console.log('ok: rollLoot ->', loot.items.filter(Boolean).map(i => i.name).join(', '));
ui.victoryScreen(60);
console.log('ok: victoryScreen');
ui.levelUpScreen();
console.log('ok: levelUpScreen');

// fresh run for defeat screen
G.run = newRun(meta, hero);
ui.defeatScreen?.();
console.log('ok: defeatScreen');

process.exit(0);
