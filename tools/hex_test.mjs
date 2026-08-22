// Hex re-cast tests: 5e re-targeting — when the hexed target dies, the warlock
// may shift the Hex to a new enemy as a bonus action with NO spell slot spent.
// Covers the engine function, the turn executor, and the Bonus Spells UI flow.
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
const Actions = await import('../src/5e/combat_actions.js');
const { makeRng } = await import('../src/rng.js');
const { createCharacter } = await import('../src/5e/rules.js');
const { performAction } = await import('../src/5e/turn.js');
const { RACES } = await import('../src/data/races.js');
const { CLASS_MAP } = await import('../src/data/classes.js');
const { LOCATION_MAP } = await import('../src/data/locations.js');

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getStatus = (u, id) => u.statuses.find(s => s.id === id);

const rng = makeRng(60606);
const wcls = CLASS_MAP.warlock;
const warlock = createCharacter({ raceId: RACES[0].id, classId: 'warlock', name: 'Cursemonger', subclassId: 'fiend', scoreAssign: Run.autoAssignScores(wcls, RACES[0], rng), level: 1, hero: true, rng });

// ============ 1. ENGINE: recast after the hexed target dies ============
{
  const u = Combat.makeUnit(warlock, 'player', 5, 5);
  const victimA = Combat.makeUnit(createCharacter({ raceId: RACES[0].id, classId: 'fighter', name: 'A', subclassId: 'champion', scoreAssign: Run.autoAssignScores(CLASS_MAP.fighter, RACES[0], rng), level: 1, hero: false, rng }), 'enemy', 6, 5);
  const victimB = Combat.makeUnit(createCharacter({ raceId: RACES[0].id, classId: 'fighter', name: 'B', subclassId: 'champion', scoreAssign: Run.autoAssignScores(CLASS_MAP.fighter, RACES[0], rng), level: 1, hero: false, rng }), 'enemy', 8, 5);
  const battle = {
    popups: [], fx: [], log: [], rng: makeRng(5), round: 1, effects: [], units: [u, victimA, victimB],
    w: 12, h: 10, grid: [], over: false, won: false, turnIndex: 0, order: [u.id, victimA.id, victimB.id],
  };
  for (let y = 0; y < 10; y++) battle.grid.push(Array.from({ length: 12 }, () => ({ obstacle: null, elevation: 0, hazard: null, visible: true, discovered: true })));

  // cast Hex on A
  performAction(battle, u.id, { type: 'cast', spellId: 'hex', targetId: victimA.id });
  assert(getStatus(victimA, 'hexed') && getStatus(victimA, 'hexed').data === u.id, 'A is hexed by the warlock');
  assert(u.concentration && u.concentration.spellId === 'hex', 'warlock concentrates on Hex');

  // recast while A still lives → blocked (5e: only after the target falls)
  const blocked = Actions.recastHex(battle, u, victimB);
  assert(blocked === false, 'recast must be blocked while the old target lives');
  step('recast blocked while the hexed target is alive');

  // A dies → recast onto B works, free of any slot
  victimA.hp = 0;
  victimA.dead = true;
  const pactUsedBefore = warlock.pactSlotsUsed;
  const ok = Actions.recastHex(battle, u, victimB);
  assert(ok === true, 'recast succeeds after the target dies');
  assert(getStatus(victimB, 'hexed') && getStatus(victimB, 'hexed').data === u.id, 'B is now hexed by the warlock');
  assert(u.concentration.data.target === victimB.id, 'concentration re-points at B');
  assert(warlock.pactSlotsUsed === pactUsedBefore, 'recast must NOT spend a pact slot');
  assert(battle.log.some(l => l.includes('shifts their Hex')), 'recast logged');
  step('engine: dead target → Hex shifts to a new enemy with no slot spent');
}

// ============ 2. TURN EXECUTOR: bonus point spent, blocked at 0 ============
{
  // The previous engine section intentionally consumed this shared test
  // character's pact slot. Reset it so this section independently verifies the
  // turn executor rather than accidentally testing slot exhaustion.
  warlock.pactSlotsUsed = 0;
  const u = Combat.makeUnit(warlock, 'player', 5, 5);
  const victimA = Combat.makeUnit(createCharacter({ raceId: RACES[0].id, classId: 'fighter', name: 'A2', subclassId: 'champion', scoreAssign: Run.autoAssignScores(CLASS_MAP.fighter, RACES[0], rng), level: 1, hero: false, rng }), 'enemy', 6, 5);
  const victimB = Combat.makeUnit(createCharacter({ raceId: RACES[0].id, classId: 'fighter', name: 'B2', subclassId: 'champion', scoreAssign: Run.autoAssignScores(CLASS_MAP.fighter, RACES[0], rng), level: 1, hero: false, rng }), 'enemy', 8, 5);
  const battle = { popups: [], fx: [], log: [], rng: makeRng(5), round: 1, effects: [], units: [u, victimA, victimB], w: 12, h: 10, grid: [], over: false, won: false, turnIndex: 0, order: [u.id, victimA.id, victimB.id] };
  for (let y = 0; y < 10; y++) battle.grid.push(Array.from({ length: 12 }, () => ({ obstacle: null, elevation: 0, hazard: null, visible: true, discovered: true })));
  performAction(battle, u.id, { type: 'cast', spellId: 'hex', targetId: victimA.id });
  victimA.hp = 0; victimA.dead = true;

  u.bonusPoints = 1;
  performAction(battle, u.id, { type: 'recast_hex', targetId: victimB.id });
  assert(getStatus(victimB, 'hexed') !== undefined || battle.log.some(l => l.includes('shifts their Hex')), 'turn executor recast applies');
  assert(u.bonusPoints === 0, 'recast spends the bonus action');
  step('turn executor: recast_hex spends the bonus action');

  // at 0 bonus points it's blocked
  const logBefore = battle.log.length;
  performAction(battle, u.id, { type: 'recast_hex', targetId: victimB.id });
  assert(battle.log.slice(logBefore).some(l => l.includes('no bonus points')), 'blocked at 0 bonus points');
  step('turn executor: recast blocked without a bonus action');
}

// ============ 3. UI: Bonus Spells shows "Recast Hex" after the target dies ============
{
  const rng3 = makeRng(9090);
  const meta = { shards: 0, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
  const hero = createCharacter({ raceId: RACES[0].id, classId: 'warlock', name: 'HexyUI', subclassId: 'fiend', scoreAssign: Run.autoAssignScores(wcls, RACES[0], rng3), level: 1, hero: true, rng: rng3 });
  meta.hero = hero;
  const run = Run.newRun(meta, hero);
  run.location = LOCATION_MAP.tavern;
  const combat = Combat.generateCombatMap(LOCATION_MAP.tavern, 1, rng3, { revealed: true });
  Combat.spawnEncounter(combat, Run.activeFighters(run), 1, rng3, {});
  const G = { meta, hero, run, combat, walk: null };
  ui.setG(G);
  ui.combatScreen();
  ui.combatScreenInputs();

  const clickBtn = (labelPart) => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(labelPart));
    if (!b) throw new Error('no button ' + labelPart);
    b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  };
  const radialBtn = (labelPart) => [...document.querySelectorAll('.radial .radial-btn')].find(b => b.textContent.includes(labelPart));
  const canvas = document.querySelector('#combat-canvas');
  const tileXY = (tx, ty) => ({ clientX: ((tx + 0.5) / combat.w) * canvas.width, clientY: ((ty + 0.5) / combat.h) * canvas.height, button: 0 });

  let heroTurn = false;
  for (let i = 0; i < 160 && !heroTurn && !combat.over; i++) {
    await sleep(300);
    const cur = combat.units.find(x => x.id === combat.order[combat.turnIndex]);
    if (!cur) continue;
    if (cur.team === 'player' && !cur.dead) {
      if (cur.char.hero) { heroTurn = true; break; }
      clickBtn('End Turn');
    }
  }
  if (!heroTurn) fail('never reached the warlock hero turn');
  const heroU = combat.units.find(x => x.char.hero);
  const enemies = combat.units.filter(x => x.team === 'enemy');
  heroU.x = 5; heroU.y = 5;
  enemies[0].x = 6; enemies[0].y = 5;
  enemies[1].x = 8; enemies[1].y = 5;
  heroU.bonusPoints = 1; heroU.actionPoints = 1; heroU.reactionUsed = false;

  // hex the first enemy (engine-level setup), then kill it
  performAction(combat, heroU.id, { type: 'cast', spellId: 'hex', targetId: enemies[0].id });
  const hexTarget = enemies[0];
  hexTarget.hp = 0; hexTarget.dead = true;
  heroU.bonusPoints = 1; // the recast happens on a subsequent turn

  // Bonus Actions → Bonus Spells: the recast row must be present
  radialBtn('Bonus Actions').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  radialBtn('Bonus Spells').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const recastRow = [...document.querySelectorAll('.spellbook .spell-row')].find(r => r.textContent.includes('Recast Hex'));
  if (!recastRow) fail('Recast Hex row missing from Bonus Spells after the target died');
  assert(recastRow.textContent.includes('BONUS ACTION'), 'recast row shows its cost badge');
  step('Bonus Spells lists "Recast Hex" when the cursed target has died');

  // click the row, then click the living enemy → hex moves, no slot spent
  const pactBefore = hero.pactSlotsUsed;
  const bonusBefore = heroU.bonusPoints;
  recastRow.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  await sleep(60);
  recastRow.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  canvas.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, ...tileXY(enemies[1].x, enemies[1].y) }));
  await sleep(60);
  canvas.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, ...tileXY(enemies[1].x, enemies[1].y) }));
  assert(getStatus(enemies[1], 'hexed') !== undefined, 'the clicked enemy is now hexed');
  assert(hero.pactSlotsUsed === pactBefore, 'no pact slot spent on the recast');
  assert(heroU.bonusPoints === bonusBefore - 1, 'recast spent the bonus action');
  step('UI: clicking the row + a living enemy moves the Hex for free');
}

// ============ 4. UI: row hidden while the hexed target still lives ============
{
  const rng4 = makeRng(7070);
  const meta = { shards: 0, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
  const hero = createCharacter({ raceId: RACES[0].id, classId: 'warlock', name: 'HexyAlive', subclassId: 'fiend', scoreAssign: Run.autoAssignScores(wcls, RACES[0], rng4), level: 1, hero: true, rng: rng4 });
  meta.hero = hero;
  const run = Run.newRun(meta, hero);
  run.location = LOCATION_MAP.tavern;
  const combat = Combat.generateCombatMap(LOCATION_MAP.tavern, 1, rng4, { revealed: true });
  Combat.spawnEncounter(combat, Run.activeFighters(run), 1, rng4, {});
  const G = { meta, hero, run, combat, walk: null };
  ui.setG(G);
  ui.combatScreen();
  ui.combatScreenInputs();
  const clickBtn = (labelPart) => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(labelPart));
    if (!b) throw new Error('no button ' + labelPart);
    b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  };
  const radialBtn = (labelPart) => [...document.querySelectorAll('.radial .radial-btn')].find(b => b.textContent.includes(labelPart));

  let heroTurn = false;
  for (let i = 0; i < 160 && !heroTurn && !combat.over; i++) {
    await sleep(300);
    const cur = combat.units.find(x => x.id === combat.order[combat.turnIndex]);
    if (!cur) continue;
    if (cur.team === 'player' && !cur.dead) {
      if (cur.char.hero) { heroTurn = true; break; }
      clickBtn('End Turn');
    }
  }
  if (!heroTurn) fail('never reached the warlock hero turn (alive-target case)');
  const heroU = combat.units.find(x => x.char.hero);
  const enemy = combat.units.find(x => x.team === 'enemy');
  heroU.x = 5; heroU.y = 5;
  enemy.x = 6; enemy.y = 5;
  heroU.bonusPoints = 1; heroU.actionPoints = 1;
  performAction(combat, heroU.id, { type: 'cast', spellId: 'hex', targetId: enemy.id }); // target ALIVE
  // Keep a regular bonus spell available so this UI assertion can open the
  // spellbook; Hex itself remains concentrated on a living target.
  hero.pactSlotsUsed = 0;
  heroU.bonusPoints = 1;

  radialBtn('Bonus Actions').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  radialBtn('Bonus Spells').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const recastRow = [...document.querySelectorAll('.spellbook .spell-row')].find(r => r.textContent.includes('Recast Hex'));
  assert(!recastRow, 'recast row must be hidden while the hexed target still lives');
  step('Bonus Spells hides "Recast Hex" while the target is alive');
}

// ============ 5. HEX DAMAGE + SEQUENTIAL POPUPS ============
{
  // fresh warlock (earlier sections exhausted the shared one's pact slots)
  const freshWarlock = createCharacter({ raceId: RACES[0].id, classId: 'warlock', name: 'FreshHex', subclassId: 'fiend', scoreAssign: Run.autoAssignScores(wcls, RACES[0], makeRng(123)), level: 1, hero: true, rng: makeRng(123) });
  // 5a. engine damage: hex + rapier hit deals weapon damage AND 1d6 necrotic
  const u = Combat.makeUnit(freshWarlock, 'player', 5, 5);
  const victim = Combat.makeUnit(createCharacter({ raceId: RACES[0].id, classId: 'fighter', name: 'V', subclassId: 'champion', scoreAssign: Run.autoAssignScores(CLASS_MAP.fighter, RACES[0], rng), level: 1, hero: false, rng }), 'enemy', 6, 5);
  const battle = { popups: [], fx: [], log: [], rng: makeRng(5), round: 1, effects: [], units: [u, victim], w: 12, h: 10, grid: [], over: false, won: false, turnIndex: 0, order: [u.id, victim.id] };
  for (let y = 0; y < 10; y++) battle.grid.push(Array.from({ length: 12 }, () => ({ obstacle: null, elevation: 0, hazard: null, visible: true, discovered: true })));
  performAction(battle, u.id, { type: 'cast', spellId: 'hex', targetId: victim.id });

  let hitFound = false;
  for (let seed = 0; seed < 1000 && !hitFound; seed++) {
    battle.rng = makeRng(seed);
    battle.popups = [];
    victim.hp = victim.maxHp;
    const res = Actions.weaponAttack(battle, u, victim, { weaponId: 'rapier' });
    if (!res.hit) continue;
    hitFound = true;
    const dmgPops = battle.popups.filter(p => p.kind === 'dmg');
    assert(dmgPops.length === 2, `hex hit must push TWO damage popups (got ${dmgPops.length})`);
    const weaponPop = dmgPops[0];
    const hexPop = dmgPops[1];
    assert((weaponPop.delay || 0) === 0, 'weapon popup shows immediately');
    assert(weaponPop.type === 'piercing', `weapon popup is the rapier damage (got ${weaponPop.type})`);
    assert(hexPop.type === 'necrotic', `second popup is necrotic (got ${hexPop.type})`);
    assert(hexPop.delay >= 1100, `hex popup is queued until the weapon number fades (delay ${hexPop.delay})`);
    assert(hexPop.magical === true, 'hex damage is magical');
    assert(hexPop.amount >= 1 && hexPop.amount <= 6, `hex roll is 1d6 (got ${hexPop.amount})`);
    assert(victim.hp === victim.maxHp - weaponPop.amount - hexPop.amount,
      `total damage = weapon + hex (${victim.maxHp - victim.hp} vs ${weaponPop.amount}+${hexPop.amount})`);
  }
  assert(hitFound, 'found a seeded hit');
  step('hex hit: two damage popups — weapon first, necrotic queued after it');

  // 5b. sequential visibility: the hex number stays hidden until the first fades
  {
    const now = 100000;
    const weaponPop = { kind: 'dmg', amount: 5, type: 'piercing', born: now - 100, dur: 1100, delay: 0 };
    const hexPop = { kind: 'dmg', amount: 1, type: 'necrotic', born: now - 100, dur: 1100, delay: 1150 };
    // right after the hit: weapon visible, hex still waiting
    assert(ui.popupAge(weaponPop, now) >= 0 && ui.popupAge(weaponPop, now) < 1, 'weapon number visible immediately');
    assert(ui.popupAge(hexPop, now) < 0, 'hex number hidden while the weapon number is up');
    // after the weapon fades (~1.15s): hex appears
    const later = now + 1150;
    assert(ui.popupAge(weaponPop, later) >= 1, 'weapon number finished');
    assert(ui.popupAge(hexPop, later) >= 0 && ui.popupAge(hexPop, later) < 1, 'hex number appears after the weapon fades');
    // after the hex duration: gone
    const end = later + 1100;
    assert(ui.popupAge(hexPop, end) >= 1, 'hex number finished');
  }
  step('popup sequencing: "5⚔" shows, fades, THEN "1💀" appears');
}

// ============ 6. HEX + ELDRITCH BLAST (spell attacks) ============
{
  const freshWarlock = createCharacter({ raceId: RACES[0].id, classId: 'warlock', name: 'BlastHex', subclassId: 'fiend', scoreAssign: Run.autoAssignScores(wcls, RACES[0], makeRng(321)), level: 1, hero: true, rng: makeRng(321) });
  const u = Combat.makeUnit(freshWarlock, 'player', 5, 5);
  const victim = Combat.makeUnit(createCharacter({ raceId: RACES[0].id, classId: 'fighter', name: 'BV', subclassId: 'champion', scoreAssign: Run.autoAssignScores(CLASS_MAP.fighter, RACES[0], rng), level: 1, hero: false, rng }), 'enemy', 6, 5);
  const battle = { popups: [], fx: [], log: [], rng: makeRng(5), round: 1, effects: [], units: [u, victim], w: 12, h: 10, grid: [], over: false, won: false, turnIndex: 0, order: [u.id, victim.id] };
  for (let y = 0; y < 10; y++) battle.grid.push(Array.from({ length: 12 }, () => ({ obstacle: null, elevation: 0, hazard: null, visible: true, discovered: true })));
  performAction(battle, u.id, { type: 'cast', spellId: 'hex', targetId: victim.id });

  // 6a. Eldritch Blast HIT on a hexed target → force popup + delayed necrotic
  let hitFound = false;
  for (let seed = 0; seed < 1000 && !hitFound; seed++) {
    battle.rng = makeRng(seed);
    battle.popups = [];
    battle.log = [];
    victim.hp = victim.maxHp;
    victim.dead = false;
    Actions.castSpell(battle, u, 'eldritch_blast', { target: victim });
    // castSpell has no hit flag — detect the hit via its damage popups
    const blastPop0 = battle.popups.find(p => p.kind === 'dmg' && p.type === 'force');
    if (!blastPop0 || victim.dead) continue;
    hitFound = true;
    const dmgPops = battle.popups.filter(p => p.kind === 'dmg');
    assert(dmgPops.length === 2, `EB hit on hexed target must push TWO popups (got ${dmgPops.length})`);
    const blastPop = dmgPops[0];
    const hexPop = dmgPops[1];
    assert(blastPop.amount <= 10, `EB base die is 1d10 per ray (got ${blastPop.amount})`);
    assert(blastPop.type === 'force' && (blastPop.delay || 0) === 0, `first popup is the blast force damage (got ${blastPop.type}, delay ${blastPop.delay})`);
    assert(hexPop.type === 'necrotic' && hexPop.delay >= 1100, `second popup is the delayed Hex necrotic (got ${hexPop.type}, delay ${hexPop.delay})`);
    assert(hexPop.amount >= 1 && hexPop.amount <= 6, `hex roll is 1d6 (got ${hexPop.amount})`);
    assert(victim.hp === victim.maxHp - blastPop.amount - hexPop.amount,
      `total damage = blast + hex (${victim.maxHp - victim.hp} vs ${blastPop.amount}+${hexPop.amount})`);
    assert(battle.log.some(l => l.includes('Hex burns')), 'hex burn logged');
  }
  assert(hitFound, 'found a seeded Eldritch Blast hit');
  step('Eldritch Blast hit applies the 1d6 Hex — "N⚡" then "1💀" sequentially');

  // 6b. 5e rule: saving-throw spells do NOT trigger Hex (attack rolls only).
  // Use a sorcerer who actually knows Burning Hands, with the same-caster
  // curse applied manually.
  const sorcCls = CLASS_MAP.sorcerer;
  const sorc = createCharacter({ raceId: RACES[0].id, classId: 'sorcerer', name: 'SaveSorc', subclassId: 'draconic', scoreAssign: Run.autoAssignScores(sorcCls, RACES[0], makeRng(456)), level: 1, hero: false, rng: makeRng(456) });
  const sc = Combat.makeUnit(sorc, 'player', 5, 5);
  battle.units = [sc, victim];
  Combat.addStatus(victim, 'hexed', 'Hexed', 10, sc.id);
  let saveCaseChecked = false;
  for (let seed = 0; seed < 600 && !saveCaseChecked; seed++) {
    battle.rng = makeRng(seed);
    battle.popups = [];
    battle.log = [];
    victim.hp = victim.maxHp;
    victim.dead = false;
    const res = Actions.castSpell(battle, sc, 'burning_hands', { target: victim, aim: { x: victim.x, y: victim.y }, direction: { dx: 1, dy: 0 } });
    if (!res.ok) continue;
    saveCaseChecked = true;
    const necrotic = battle.popups.filter(p => p.kind === 'dmg' && p.type === 'necrotic');
    assert(necrotic.length === 0, 'save-based spells must not trigger the Hex rider');
  }
  assert(saveCaseChecked, 'burning hands cast attempted');
  step('save-based spells (Burning Hands) do NOT trigger Hex — attack rolls only');
}

console.log('errors captured:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
