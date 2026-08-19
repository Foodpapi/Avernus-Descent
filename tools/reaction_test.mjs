// Reaction system test (jsdom + engine):
// 1. Opportunity-attack prompt: enemy moves away from a player → modal pauses
//    the turn, lists the OA option, and the choice resolves before continuing.
// 2. Hellish Rebuke prompt: enemy hits a warlock → modal offers the reaction.
// 3. Enemy auto-OA: a PLAYER moving out of an enemy's reach is attacked by the
//    engine automatically (no prompt needed for monsters).
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

const ui = await import('../src/ui.js');
const Combat = await import('../src/5e/combat.js');
const Actions = await import('../src/5e/combat_actions.js');
const ai = await import('../src/5e/ai.js');
const { makeRng } = await import('../src/rng.js');
const { createCharacter } = await import('../src/5e/rules.js');
const { autoAssignScores, generateCompanion } = await import('../src/game/run.js');
const { RACES } = await import('../src/data/races.js');
const { CLASS_MAP } = await import('../src/data/classes.js');
const { LOCATION_MAP } = await import('../src/data/locations.js');
const { performAction } = await import('../src/5e/turn.js');

ui.setG({ meta: null, hero: null, run: null, combat: null });

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const modalBtn = (labelPart) => [...document.querySelectorAll('.reaction-overlay button')].find(b => b.textContent.includes(labelPart));
const waitFor = async (fn, ms = 2500, interval = 50) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await sleep(interval);
  }
  return false;
};

// ---- build a combat ----
const rng = makeRng(4242);
const race = RACES[0];
const fighterCls = CLASS_MAP.fighter;
const hero = createCharacter({ raceId: race.id, classId: 'fighter', name: 'ReactHero', subclassId: 'champion', scoreAssign: autoAssignScores(fighterCls, race, rng), level: 2, hero: true, rng });
const party = [hero];
const used = new Set(['fighter']);
for (let i = 0; i < 3; i++) { const c = generateCompanion(rng, 2, [...used]); used.add(c.classId); party.push(c); }
const combat = Combat.generateCombatMap(LOCATION_MAP.tavern, 1, rng, { revealed: true });
Combat.spawnEncounter(combat, party, 1, rng, {});
G_combat(combat);
function G_combat(c) { ui.setG({ meta: null, hero: null, run: null, combat: c }); }

const heroU = combat.units.find(u => u.char.hero);
const enemy = combat.units.find(u => u.team === 'enemy');

// ---- 1. opportunity attack prompt ----
// Place the enemy adjacent to the hero, then drive a move step away.
function clearTile(x, y) {
  const t = combat.grid[y][x];
  if (!t) return false;
  if (t.obstacle || t.hazard === 'water' || t.hazard === 'lava') return false;
  const occ = Combat.unitAtAny(combat, x, y);
  if (occ) return false;
  return true;
}
const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: heroU.x + dx, y: heroU.y + dy })).find(p => clearTile(p.x, p.y));
const away = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [-2, 1], [1, 2], [1, -2]].map(([dx, dy]) => ({ x: heroU.x + dx, y: heroU.y + dy })).find(p => clearTile(p.x, p.y));
if (!adj || !away) fail('could not set up the scenario tiles');
enemy.x = adj.x; enemy.y = adj.y;
heroU.reactionUsed = false;
const enemyHpBefore = enemy.hp;

const steps = [{ type: 'move', x: away.x, y: away.y, disengage: false }];
const driverPromise = ui.driveEnemySteps(combat, enemy, steps, 0);

const modalAppeared = await waitFor(() => !!document.querySelector('.reaction-overlay'));
if (!modalAppeared) fail('no reaction modal when the enemy moved out of reach');
const modalText = document.querySelector('.reaction-overlay').textContent;
if (!modalText.includes('Opportunity Attack')) fail('modal missing the Opportunity Attack option: ' + modalText);
if (!modalText.includes('ReactHero')) fail('modal missing the reactor name');
step('OA prompt: modal pauses the enemy turn when it leaves melee reach');

// resolve the OA and wait for the driver to finish
modalBtn('Opportunity Attack').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await driverPromise;
assert(heroU.reactionUsed === true, 'hero reaction should be consumed');
const oaLogged = combat.log.some(l => l.includes('opportunity attack'));
assert(oaLogged, 'the OA should appear in the log');
step('chose OA: reaction consumed, turn resumed and completed');

// ---- 2. Hellish Rebuke prompt ----
const warlockCls = CLASS_MAP.warlock;
const warlock = createCharacter({ raceId: race.id, classId: 'warlock', name: 'Rebukey', subclassId: 'fiend', scoreAssign: autoAssignScores(warlockCls, race, rng), level: 2, hero: false, rng });
const wu = Combat.makeUnit(warlock, 'player', adj.x, adj.y + 0); // adjacent to enemy
if (!clearTile(wu.x, wu.y)) { const alt = adj.x > 0 ? { x: adj.x - 1, y: adj.y } : { x: adj.x + 1, y: adj.y }; if (clearTile(alt.x, alt.y)) { wu.x = alt.x; wu.y = alt.y; } }
combat.units.push(wu);
wu.reactionUsed = false;
enemy.x = adj.x; enemy.y = adj.y; // back adjacent to warlock
const wuHpBefore = wu.hp;
const eHpBefore2 = enemy.hp;
const atkSteps = [{ type: 'attack', targetId: wu.id, attackDef: { name: 'Claw', toHit: 8, dmg: '1d8+2', dmgType: 'slashing', range: 'melee' } }];
const driver2 = ui.driveEnemySteps(combat, enemy, atkSteps, 0);
const modal2 = await waitFor(() => !!document.querySelector('.reaction-overlay'), 3000);
if (!modal2) fail('no reaction modal after the warlock took damage');
const text2 = document.querySelector('.reaction-overlay').textContent;
if (!text2.includes('Hellish Rebuke')) fail('modal missing Hellish Rebuke: ' + text2);
step('Hellish Rebuke prompt appears after the warlock is struck');
const wuDamaged = wu.hp < wuHpBefore;
assert(wuDamaged, 'warlock should have taken the hit first');
modalBtn('Hellish Rebuke').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await driver2;
assert(wu.reactionUsed === true, 'warlock reaction should be consumed');
const rebuked = combat.log.some(l => l.includes('Hellish Rebuke scorches') || l.includes('Hellish Rebuke'));
assert(rebuked, 'Hellish Rebuke should appear in the log');
step('cast Hellish Rebuke: reaction consumed, enemy took fire');

// ---- 3. enemy auto-OA when a player moves away ----
const e2 = combat.units.find(u => u.team === 'enemy' && !u.dead && u !== enemy);
if (e2) {
  const adj2 = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: heroU.x + dx, y: heroU.y + dy })).find(p => clearTile(p.x, p.y));
  const away2 = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [-2, 1], [1, 2], [1, -2]].map(([dx, dy]) => ({ x: heroU.x + dx, y: heroU.y + dy })).find(p => clearTile(p.x, p.y) && Math.abs(p.x - adj2.x) <= 2 && Math.abs(p.y - adj2.y) <= 2);
  if (adj2 && away2) {
    e2.x = adj2.x; e2.y = adj2.y;
    e2.reactionUsed = false;
    const hpBefore3 = heroU.hp;
    const logBefore3 = combat.log.length;
    performAction(combat, heroU.id, { type: 'move', path: [{ x: away2.x, y: away2.y }] });
    const oaAuto = combat.log.slice(logBefore3).some(l => l.includes('opportunity-attacks') || l.includes('opportunity attack'));
    assert(e2.reactionUsed === true, 'enemy should spend its reaction on the auto-OA');
    assert(oaAuto, 'auto-OA should be logged');
    step('enemy auto-opportunity-attacks a player who moves away (no prompt needed)');
  } else {
    step('(auto-OA scenario skipped — no clear tiles)');
  }
}

console.log('REACTION TEST OK');
process.exit(0);
