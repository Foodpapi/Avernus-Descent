// Regression tests for: (1) death saving throws on reaching 0 HP,
// (2) fire bolt / chromatic orb enemy-click casting, (3) monk Martial Arts
// bonus action, (4) hero level reset + persistent start-level bonus.
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
const errors = [];
dom.window.addEventListener('error', e => errors.push(e.message));

const ui = await import('../src/ui.js');
const Run = await import('../src/game/run.js');
const Combat = await import('../src/5e/combat.js');
const Actions = await import('../src/5e/combat_actions.js');
const { makeRng } = await import('../src/rng.js');
const { createCharacter, levelUpCharacter } = await import('../src/5e/rules.js');
const { performAction } = await import('../src/5e/turn.js');
const { RACES } = await import('../src/data/races.js');
const { CLASS_MAP } = await import('../src/data/classes.js');
const { LOCATION_MAP } = await import('../src/data/locations.js');

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getStatus = (u, id) => u.statuses.find(s => s.id === id);

function mkChar(clsId, level, subclassId, rng) {
  const cls = CLASS_MAP[clsId];
  const race = RACES[0];
  return createCharacter({ raceId: race.id, classId: clsId, name: 'FixTest' + clsId, subclassId: subclassId || Object.keys(cls.subclasses)[0], scoreAssign: Run.autoAssignScores(cls, race, rng), level, hero: false, rng });
}

function mkBattle(units) {
  const b = { popups: [], log: [], rng: makeRng(5), round: 1, effects: [], units, w: 12, h: 10, grid: [], over: false, won: false };
  for (let y = 0; y < 10; y++) b.grid.push(Array.from({ length: 12 }, () => ({ obstacle: null, elevation: 0, hazard: null, visible: true, discovered: true })));
  return b;
}

// ============ 1. DEATH SAVING THROWS ============
{
  const rng = makeRng(21);
  const fighter = Combat.makeUnit(mkChar('fighter', 1, null, rng), 'player', 1, 1);
  const gob = Combat.makeUnit(mkChar('barbarian', 1, null, rng), 'enemy', 3, 3);
  gob.char.stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  const battle = mkBattle([fighter, gob]);

  // drop to 0 → DYING, not dead
  Actions.applyDamage(battle, fighter, gob, 999, 'slashing');
  assert(fighter.hp === 0, 'hp should be 0');
  assert(fighter.dead === false, 'character must NOT die instantly at 0 HP');
  assert(!!getStatus(fighter, 'dying'), 'should enter death saving throw mode');
  step('0 HP → death saving throw mode (not instant death)');

  // damage while down = one automatic failed save
  Actions.applyDamage(battle, fighter, gob, 3, 'piercing');
  assert(getStatus(fighter, 'dying').fails === 1, 'a hit while down should fail one save');
  step('hit while down → automatic failed save (1/2)');

  // two failed saves (seeded) → real death
  let died = false;
  for (let seed = 0; seed < 800 && !died; seed++) {
    const probe = Combat.makeUnit(mkChar('fighter', 1, null, makeRng(seed)), 'player', 1, 1);
    probe.hp = 0;
    Combat.addStatus(probe, 'dying', 'Dying', 5);
    getStatus(probe, 'dying').fails = 1;
    const lb = mkBattle([probe, gob]);
    lb.rng = makeRng(seed);
    Actions.tickStartOfTurn(lb, probe);
    if (probe.dead) died = true;
  }
  assert(died, 'two failed saves should kill for real');
  step('two failed saves → real death');

  // two successful saves (seeded) → stabilize at 1 HP
  let stabilized = false;
  for (let seed = 0; seed < 800 && !stabilized; seed++) {
    const probe = Combat.makeUnit(mkChar('fighter', 1, null, makeRng(seed)), 'player', 1, 1);
    probe.hp = 0;
    Combat.addStatus(probe, 'dying', 'Dying', 5);
    getStatus(probe, 'dying').successes = 1;
    const lb = mkBattle([probe, gob]);
    lb.rng = makeRng(seed);
    Actions.tickStartOfTurn(lb, probe);
    if (probe.hp === 1 && !probe.dead) stabilized = true;
  }
  assert(stabilized, 'two successes should stabilize at 1 HP');
  step('two successful saves → stabilize at 1 HP');

  // healing ends the dying count
  const healer = Combat.makeUnit(mkChar('cleric', 1, 'life', rng), 'player', 2, 2);
  const victim = Combat.makeUnit(mkChar('rogue', 1, null, rng), 'player', 4, 4);
  battle.units.push(healer, victim);
  Actions.applyDamage(battle, victim, gob, 999, 'bludgeoning');
  assert(!!getStatus(victim, 'dying'), 'victim should be dying');
  Actions.healUnit(battle, healer, victim, 6);
  assert(victim.hp >= 6 && !getStatus(victim, 'dying'), 'healing should end death saving throw mode');
  step('healing ends death saving throw mode');

  // whole party down → defeat (not an infinite waiting loop)
  for (const u of battle.units) if (u.team === 'player') { u.hp = 0; if (!getStatus(u, 'dying')) Combat.addStatus(u, 'dying', 'Dying', 5); }
  Actions.endTurn(battle);
  assert(battle.over === true && battle.won === false, 'all-down should end combat in defeat');
  step('whole party down → defeat');
}

// ============ 2. FIRE BOLT / CHROMATIC ORB CLICK-CASTING ============
{
  const rng = makeRng(31337);
  const meta = { shards: 0, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
  const sorcCls = CLASS_MAP.sorcerer;
  const hero = createCharacter({ raceId: RACES[0].id, classId: 'sorcerer', name: 'Clicker', subclassId: 'draconic', scoreAssign: Run.autoAssignScores(sorcCls, RACES[0], rng), level: 1, hero: true, rng });
  meta.hero = hero;
  const run = Run.newRun(meta, hero);
  run.location = LOCATION_MAP.tavern;
  const combat = Combat.generateCombatMap(LOCATION_MAP.tavern, 1, rng, { revealed: true });
  Combat.spawnEncounter(combat, Run.activeFighters(run), 1, rng, {});
  ui.setG({ meta, hero, run, combat });
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

  // reach the hero's turn
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
  if (!heroTurn) fail('never reached the hero turn');

  // move the hero next to an enemy so the spells are in range
  const heroU = combat.units.find(x => x.char.hero);
  const enemy = combat.units.find(x => x.team === 'enemy');
  heroU.x = 5; heroU.y = 3;
  enemy.x = 6; enemy.y = 3;
  heroU.actionPoints = 2; heroU.bonusPoints = 1; heroU.reactionUsed = false;
  const enemyHpBefore = enemy.hp;

  // cast FIRE BOLT by clicking the enemy
  radialBtn('Actions').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  radialBtn('Spells').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const fbRow = [...document.querySelectorAll('.spellbook .spell-row')].find(r => r.textContent.includes('Fire Bolt'));
  fbRow.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  await sleep(60);
  fbRow.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  const logBefore = combat.log.length;
  canvas.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, ...tileXY(enemy.x, enemy.y) }));
  await sleep(60);
  canvas.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, ...tileXY(enemy.x, enemy.y) }));
  const newLog = combat.log.slice(logBefore);
  assert(newLog.some(l => l.includes('Fire Bolt')), 'Fire Bolt should actually cast on an enemy click: ' + newLog.join(' | '));
  assert(!newLog.some(l => l.includes('Click an enemy')), 'must not complain "click an enemy" when one was clicked');
  assert(heroU.actionPoints === 1, 'casting should spend an action point (2 → 1)');
  step('Fire Bolt casts when an enemy is clicked');

  // cast CHROMATIC ORB (leveled slot) — still has 1 action point left
  const slotsBefore = hero.spellSlotsUsed[0];
  radialBtn('Actions').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  radialBtn('Spells').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const coRow = [...document.querySelectorAll('.spellbook .spell-row')].find(r => r.textContent.includes('Chromatic Orb'));
  if (!coRow) fail('sorcerer should know Chromatic Orb');
  coRow.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  await sleep(60);
  coRow.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  const logBefore2 = combat.log.length;
  canvas.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, ...tileXY(enemy.x, enemy.y) }));
  await sleep(60);
  canvas.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, ...tileXY(enemy.x, enemy.y) }));
  const newLog2 = combat.log.slice(logBefore2);
  assert(newLog2.some(l => l.includes('Chromatic Orb')), 'Chromatic Orb should actually cast on an enemy click: ' + newLog2.join(' | '));
  assert(hero.spellSlotsUsed[0] === slotsBefore + 1, 'Chromatic Orb should consume a spell slot');
  step('Chromatic Orb casts and consumes its slot');
}

// ============ 3. MONK MARTIAL ARTS ============
{
  const rng = makeRng(77);
  const monk = Combat.makeUnit(mkChar('monk', 2, null, rng), 'player', 2, 2);
  const gob = Combat.makeUnit(mkChar('barbarian', 1, null, rng), 'enemy', 3, 2);
  gob.char.stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  const battle = mkBattle([monk, gob]);
  monk.actionPoints = 1; monk.bonusPoints = 1;

  performAction(battle, monk.id, { type: 'attack', targetId: gob.id, opts: { weaponId: 'quarterstaff' } });
  assert(monk.martialArts === true, 'attacking with a monk weapon should enable Martial Arts');
  assert(monk.bonusPoints === 1, 'the attack must not consume the bonus action');
  step('monk attack with a monk weapon enables Martial Arts (bonus still free)');

  const hpBefore = gob.hp;
  performAction(battle, monk.id, { type: 'ability', ability: 'martial_arts', targetId: gob.id });
  assert(monk.bonusPoints === 0, 'Martial Arts should spend the bonus action');
  assert(monk.martialArts === false, 'flag cleared after use');
  assert(battle.log.some(l => l.includes('Martial Arts')), 'Martial Arts logged');
  assert(gob.hp < hpBefore || battle.log.some(l => l.includes('misses')), 'bonus strike resolves against the target');
  step('Martial Arts bonus-action unarmed strike works');

  // non-monks never get the flag
  const fighter = Combat.makeUnit(mkChar('fighter', 1, null, rng), 'player', 4, 2);
  fighter.actionPoints = 1; fighter.bonusPoints = 1;
  battle.units.push(fighter);
  performAction(battle, fighter.id, { type: 'attack', targetId: gob.id, opts: { weaponId: 'longsword' } });
  assert(!fighter.martialArts, 'non-monks should not gain Martial Arts');
  step('non-monks do not gain Martial Arts');
}

// ============ 4. LEVEL RESET + PERSISTENT START-LEVEL ============
{
  const rng = makeRng(9999);
  const meta = { shards: 0, shopItems: { veterans_manual: 1 }, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
  const cls = CLASS_MAP.wizard;
  const hero = createCharacter({ raceId: RACES[0].id, classId: 'wizard', name: 'ResetTest', subclassId: 'evocation', scoreAssign: Run.autoAssignScores(cls, RACES[0], rng), level: 1, hero: true, rng });
  meta.hero = hero;
  // simulate an old leveled-up hero (the stale state users hit)
  for (let i = 0; i < 5; i++) levelUpCharacter(hero, rng, null);
  assert(hero.level === 6, 'precondition: hero leveled to 6');
  Run.endRun(meta, { floorsCleared: 2, shardsEarned: 0, runGold: 0 }, false, false);
  assert(hero.level === 1, `endRun must reset level to 1 (got ${hero.level})`);
  assert(hero.classLevel === 1, `endRun must reset classLevel to 1 (got ${hero.classLevel})`);
  step('run end resets the hero to level 1 (level AND class level)');

  const run = Run.newRun(meta, hero);
  assert(hero.level === 3, `Veteran's Manual should start the run at 3 (got ${hero.level})`);
  assert(hero.classLevel === 3, `classLevel should match at 3 (got ${hero.classLevel})`);
  step("persistent bonus applies AFTER the reset: run starts at 3, not 6");
}

console.log('errors captured:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
