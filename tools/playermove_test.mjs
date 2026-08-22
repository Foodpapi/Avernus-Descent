// Player tile-by-tile combat walk (jsdom):
// 1. drivePlayerSteps hops one tile at a time (does not warp to the dest).
// 2. Grease / opportunity attacks resolve on the tile the walker actually steps on.
// 3. handleCombatTileClick uses the stepped walk and ignores clicks mid-stride.
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

const ui = await import('../src/ui.js');
const Combat = await import('../src/5e/combat.js');
const { makeRng } = await import('../src/rng.js');
const { createCharacter } = await import('../src/5e/rules.js');
const { autoAssignScores, generateCompanion } = await import('../src/game/run.js');
const { RACES } = await import('../src/data/races.js');
const { CLASS_MAP } = await import('../src/data/classes.js');
const { LOCATION_MAP } = await import('../src/data/locations.js');
const { performAction } = await import('../src/5e/turn.js');

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function carve(combat, x, y) {
  const t = combat.grid[y][x];
  t.obstacle = null;
  t.hazard = null;
  t.elevation = 0;
  t.discovered = true;
  t.visible = true;
}

function occupyClear(combat, u, x, y) {
  carve(combat, x, y);
  const occ = Combat.unitAtAny(combat, x, y);
  if (occ && occ !== u) { occ.x = 16; occ.y = 1; }
  u.x = x; u.y = y;
}

const rng = makeRng(7777);
const race = RACES[0];
const fighterCls = CLASS_MAP.fighter;
const hero = createCharacter({
  raceId: race.id, classId: 'fighter', name: 'Walker',
  subclassId: 'champion', scoreAssign: autoAssignScores(fighterCls, race, rng),
  level: 2, hero: true, rng,
});
const party = [hero];
const used = new Set(['fighter']);
for (let i = 0; i < 3; i++) {
  const c = generateCompanion(rng, 2, [...used]);
  used.add(c.classId);
  party.push(c);
}
const combat = Combat.generateCombatMap(LOCATION_MAP.tavern, 1, rng, { revealed: true });
Combat.spawnEncounter(combat, party, 1, rng, {});
combat.surprise = false;
ui.setG({ meta: null, hero, run: null, combat, combatInstant: true });

const heroU = combat.units.find(u => u.char.hero);
assert(!!heroU, 'hero unit missing');
Combat.startOfTurnReset(combat, heroU);
heroU.moveRemaining = 12;

// Corridor at y=5, x=3..8
for (let x = 3; x <= 8; x++) carve(combat, x, 5);
for (const u of combat.units) {
  if (u.y === 5 && u.x >= 3 && u.x <= 8 && u !== heroU) { u.x = 16; u.y = 2; }
}
occupyClear(combat, heroU, 3, 5);

// ---- 1. stepped walk does not warp ----
const path = [{ x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }];
const walkP = ui.drivePlayerSteps(combat, heroU, path, 0);
assert(heroU.x === 4 && heroU.y === 5, `first hop should land on (4,5), got (${heroU.x},${heroU.y})`);
assert(heroU.x !== 6, 'must not warp to the destination on the first hop');
await walkP;
assert(heroU.x === 6 && heroU.y === 5, `should finish on (6,5), got (${heroU.x},${heroU.y})`);
step('drivePlayerSteps hops one tile at a time, then arrives');

// ---- 2. grease triggers on the tile they actually step on ----
occupyClear(combat, heroU, 3, 5);
heroU.moveRemaining = 12;
heroU.statuses = [];
carve(combat, 4, 5);
carve(combat, 5, 5);
combat.grid[5][5].hazard = 'grease';
const logBefore = combat.log.length;
await ui.drivePlayerSteps(combat, heroU, [{ x: 4, y: 5 }, { x: 5, y: 5 }], 0);
assert(heroU.x === 5 && heroU.y === 5, 'walker should be standing on the grease tile');
const greaseLog = combat.log.slice(logBefore).some(l => /grease/i.test(l) || /prone/i.test(l));
// DEX save may succeed; either they slipped (logged) or they stood on grease without falling.
// The important visual contract is that they are ON the grease tile, not past it.
step(greaseLog
  ? 'grease slip resolved while the walker stood on the grease tile'
  : 'walker finished standing on the grease tile (DEX save succeeded)');

// ---- 3. enemy auto-OA fires when the player leaves reach mid-path ----
occupyClear(combat, heroU, 4, 5);
heroU.moveRemaining = 12;
heroU.hp = heroU.maxHp;
const enemy = combat.units.find(u => u.team === 'enemy' && !u.dead);
assert(!!enemy, 'need an enemy for the OA check');
carve(combat, 4, 4);
occupyClear(combat, enemy, 4, 4);
enemy.reactionUsed = false;
carve(combat, 5, 5);
carve(combat, 6, 5);
const logBeforeOa = combat.log.length;
await ui.drivePlayerSteps(combat, heroU, [{ x: 5, y: 5 }, { x: 6, y: 5 }], 0);
const oaLogged = combat.log.slice(logBeforeOa).some(l => /opportunity-attack/i.test(l) || /opportunity attack/i.test(l));
assert(enemy.reactionUsed === true, 'enemy should spend its reaction on the auto-OA');
assert(oaLogged, 'auto-OA should be logged as the player stepped out of reach');
assert(heroU.x === 6 && heroU.y === 5, 'player should finish the walk after the OA');
step('enemy auto-OA fires on the step that leaves reach, walk continues');

// ---- 4. handleCombatTileClick drives the stepped walk ----
occupyClear(combat, heroU, 3, 5);
heroU.moveRemaining = 12;
combat.turnIndex = combat.order.indexOf(heroU.id);
Combat.startOfTurnReset(combat, heroU);
heroU.moveRemaining = 12;
ui.combatScreen();
ui.combatScreenInputs();
const destX = 6, destY = 5;
carve(combat, destX, destY);
ui.handleCombatTileClick(destX, destY, 0);
// first hop is sync; dest is 3 tiles away so they must not already be there
assert(heroU.x !== destX, `click-to-move must not warp instantly (at ${heroU.x},${heroU.y})`);
assert(heroU.x === 4 && heroU.y === 5, `first hop after click should be (4,5), got (${heroU.x},${heroU.y})`);
// mid-walk click must be ignored
ui.handleCombatTileClick(3, 5, 0);
assert(heroU.x === 4, 'clicks during the walk must be ignored');
await sleep(40);
assert(heroU.x === destX && heroU.y === destY, `walk should finish at (${destX},${destY}), got (${heroU.x},${heroU.y})`);
step('handleCombatTileClick walks the path tile-by-tile and ignores mid-walk clicks');

// ---- 5. engine still accepts a full path in one performAction (tests / AI) ----
occupyClear(combat, heroU, 3, 5);
heroU.moveRemaining = 12;
performAction(combat, heroU.id, { type: 'move', path: [{ x: 4, y: 5 }, { x: 5, y: 5 }] });
assert(heroU.x === 5 && heroU.y === 5, 'full-path performAction still resolves in one call');
step('engine move (full path) is unchanged for headless / tests');

console.log('PLAYERMOVE TEST OK');
process.exit(0);
