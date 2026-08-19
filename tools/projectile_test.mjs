// Projectile blocking + object HP: shots/rays/thrown items hit the first
// body or blocking object on the flight path (friendly fire included).
// Melee and mental spells are NOT intercepted.
import { makeRng } from '../src/rng.js';
import { createCharacter } from '../src/5e/rules.js';
import * as Combat from '../src/5e/combat.js';
import * as Actions from '../src/5e/combat_actions.js';
import { performAction, monsterAttack } from '../src/5e/turn.js';
import { RACES } from '../src/data/races.js';
import { CLASS_MAP } from '../src/data/classes.js';
import { OBSTACLES } from '../src/data/locations.js';
import { autoAssignScores } from '../src/game/run.js';

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); };

const rng = makeRng(4242);
const race = RACES[0];

function mkChar(classId, name, subclassId) {
  const cls = CLASS_MAP[classId];
  return createCharacter({
    raceId: race.id, classId, name, subclassId,
    scoreAssign: autoAssignScores(cls, race, rng),
    level: 1, hero: false, rng,
  });
}

function emptyGrid(w, h) {
  const grid = [];
  for (let y = 0; y < h; y++) {
    grid.push(Array.from({ length: w }, () => ({
      obstacle: null, elevation: 0, hazard: null, visible: true, discovered: true, smokeRounds: 0,
    })));
  }
  return grid;
}

function placeCrate(battle, x, y, id = 'crate') {
  const t = battle.grid[y][x];
  t.obstacle = id;
  Combat.stampObstacleHp(t);
  return t;
}

function battleOf(units) {
  const battle = {
    popups: [], fx: [], log: [], rng: makeRng(7), round: 1, effects: [],
    units, w: 14, h: 10, grid: emptyGrid(14, 10),
    over: false, won: false, turnIndex: 0, order: units.map(u => u.id),
  };
  return battle;
}

// Catalog still has 35 named obstacles
assert(Object.keys(OBSTACLES).length === 35, `OBSTACLES must stay at 35 (got ${Object.keys(OBSTACLES).length})`);
step('catalog: 35 obstacles');

// Materials / projectile flags
assert(OBSTACLES.crate.material === 'wood' && OBSTACLES.crate.vuln.includes('fire'), 'crate is wood, vuln fire');
assert(OBSTACLES.pillar.material === 'stone' && OBSTACLES.pillar.vuln.includes('thunder'), 'pillar is stone');
assert(OBSTACLES.cliff_1.blocksProjectile === false, 'cliffs do not block projectiles');
assert(OBSTACLES.rift.blocksProjectile === false, 'rifts do not block projectiles');
assert(OBSTACLES.wall.hp === null && OBSTACLES.wall.blocksProjectile === true, 'border-style walls are indestructible blockers');
step('materials + projectile flags');

// ============ 1. TRACE / BLOCKER ============
{
  const ranger = Combat.makeUnit(mkChar('ranger', 'Trace', 'hunter'), 'player', 2, 5);
  const foe = Combat.makeUnit(mkChar('fighter', 'Foe', 'champion'), 'enemy', 8, 5);
  const battle = battleOf([ranger, foe]);
  const line = Combat.traceLine(2, 5, 8, 5);
  assert(line[0].x === 3 && line[0].y === 5, 'trace excludes start');
  assert(line[line.length - 1].x === 8 && line[line.length - 1].y === 5, 'trace includes dest');
  const clear = Combat.firstProjectileBlocker(battle, 2, 5, 8, 5);
  assert(clear.kind === 'unit' && clear.unit === foe && clear.early === false, 'dest unit is not early');
  placeCrate(battle, 5, 5);
  const blocked = Combat.firstProjectileBlocker(battle, 2, 5, 8, 5);
  assert(blocked.kind === 'object' && blocked.early === true && blocked.name === 'Crate', 'crate intercepts early');
  battle.grid[5][5].obstacle = 'cliff_1';
  battle.grid[5][5].hp = null; battle.grid[5][5].maxHp = null;
  const overCliff = Combat.firstProjectileBlocker(battle, 2, 5, 8, 5);
  assert(overCliff.kind === 'unit' && overCliff.unit === foe, 'projectiles fly over cliffs');
  step('traceLine + firstProjectileBlocker');
}

// ============ 2. ALLY INTERCEPT (friendly fire) ============
{
  const ranger = Combat.makeUnit(mkChar('ranger', 'Archer', 'hunter'), 'player', 2, 5);
  const ally = Combat.makeUnit(mkChar('fighter', 'Buddy', 'champion'), 'player', 5, 5);
  const foe = Combat.makeUnit(mkChar('fighter', 'Target', 'champion'), 'enemy', 8, 5);
  const battle = battleOf([ranger, ally, foe]);
  const foeHp = foe.hp, allyHp = ally.hp;
  Actions.weaponAttack(battle, ranger, foe, { weaponId: 'longbow' });
  assert(battle.log.some(l => /Friendly fire/.test(l)), 'friendly fire is logged');
  assert(foe.hp === foeHp, 'intended target is untouched when an ally is in the way');
  // ally may be hit or missed — either way the shot was redirected
  const redirected = ally.hp < allyHp || battle.popups.some(p => p.kind === 'miss' && p.x === ally.x && p.y === ally.y);
  assert(redirected, 'the ally received the attack roll');
  step('ally intercepts a longbow shot (friendly fire)');
}

// ============ 3. CRATE INTERCEPT (weapon) ============
{
  const ranger = Combat.makeUnit(mkChar('ranger', 'Archer2', 'hunter'), 'player', 2, 5);
  const foe = Combat.makeUnit(mkChar('fighter', 'Target2', 'champion'), 'enemy', 8, 5);
  const battle = battleOf([ranger, foe]);
  const crate = placeCrate(battle, 5, 5);
  const foeHp = foe.hp;
  const res = Actions.weaponAttack(battle, ranger, foe, { weaponId: 'longbow' });
  assert(res.blocked === true && res.object === true, 'weaponAttack reports object block');
  assert(crate.hp < crate.maxHp, `crate took damage (hp ${crate.hp}/${crate.maxHp})`);
  assert(foe.hp === foeHp, 'foe behind the crate is untouched');
  assert(battle.log.some(l => /Crate/.test(l)), 'crate hit is logged');
  step('crate intercepts a longbow shot');
}

// ============ 4. FIRE BOLT INTERCEPT ============
{
  const wiz = Combat.makeUnit(mkChar('wizard', 'Bolt', 'evocation'), 'player', 2, 5);
  const foe = Combat.makeUnit(mkChar('fighter', 'Target3', 'champion'), 'enemy', 8, 5);
  const battle = battleOf([wiz, foe]);
  const crate = placeCrate(battle, 5, 5);
  const foeHp = foe.hp;
  Actions.castSpell(battle, wiz, 'fire_bolt', { target: foe });
  assert(crate.hp < crate.maxHp, 'fire bolt damaged the crate');
  assert(foe.hp === foeHp, 'fire bolt never reached the intended target');
  assert(battle.log.some(l => /slams into the Crate|hits the Crate|vulnerable/.test(l)), 'fire bolt intercept logged');
  step('fire bolt slams into the crate');
}

// ============ 5. THROWN ITEM INTERCEPT ============
{
  const thrower = Combat.makeUnit(mkChar('fighter', 'Toss', 'champion'), 'player', 2, 5);
  const foe = Combat.makeUnit(mkChar('fighter', 'Target4', 'champion'), 'enemy', 8, 5);
  thrower.char.inventory = [{ id: 'alchemists_fire', uid: 'af1', name: "Alchemist's Fire" }];
  const battle = battleOf([thrower, foe]);
  const crate = placeCrate(battle, 5, 5);
  const foeHp = foe.hp;
  const before = crate.hp;
  Actions.useItem(battle, thrower, 'af1', foe);
  assert(thrower.char.inventory.length === 0, 'flask is consumed');
  assert(crate.hp < before, 'alchemist fire hit the crate');
  assert(foe.hp === foeHp, 'foe behind the crate is untouched');
  step('thrown flask hits the crate');
}

// ============ 6. WOOD + FIRE VULN / DESTROY → PASSABLE ============
{
  const dummy = Combat.makeUnit(mkChar('fighter', 'Dummy', 'champion'), 'player', 1, 1);
  const battle = battleOf([dummy]);
  const crate = placeCrate(battle, 4, 4);
  const r = Actions.applyObjectDamage(battle, 4, 4, 4, 'fire', dummy);
  assert(r.vulnerable === true && r.dealt === 8, `wood vuln fire doubles 4 → 8 (got dealt=${r.dealt})`);
  assert(crate.hp === 2, `crate 10-8=2 (got ${crate.hp})`);
  const chair = placeCrate(battle, 6, 6, 'chair');
  assert(Combat.isPassable(battle, 6, 6) === false, 'chair blocks movement before it is destroyed');
  const smash = Actions.applyObjectDamage(battle, 6, 6, 20, 'slashing', dummy);
  assert(smash.destroyed === true, 'chair is destroyed');
  assert(battle.grid[6][6].obstacle == null, 'destroyed object is cleared');
  assert(Combat.isPassable(battle, 6, 6) === true, 'destroyed object becomes passable');
  step('wood fire vuln + destroy → passable');
}

// ============ 7. MELEE IS NOT INTERCEPTED ============
{
  const fighter = Combat.makeUnit(mkChar('fighter', 'Slash', 'champion'), 'player', 4, 5);
  fighter.char.weapon = { base: 'longsword', enchant: null };
  const foe = Combat.makeUnit(mkChar('fighter', 'Adjacent', 'champion'), 'enemy', 6, 5);
  const battle = battleOf([fighter, foe]);
  const crate = placeCrate(battle, 5, 5);
  const crateHp = crate.hp;
  // Longsword is melee — even with a crate on the line, the swing is not a projectile.
  Actions.weaponAttack(battle, fighter, foe, { weaponId: 'longsword' });
  assert(crate.hp === crateHp, 'melee does not damage objects on the line');
  assert(!battle.log.some(l => /Friendly fire|slams into the Crate/.test(l)), 'melee is not intercepted');
  step('melee is not intercepted');
}

// ============ 8. MENTAL / SAVE SPELLS ARE NOT PROJECTILES ============
{
  const cleric = Combat.makeUnit(mkChar('cleric', 'Flame', 'life'), 'player', 2, 5);
  const foe = Combat.makeUnit(mkChar('fighter', 'Sinner', 'champion'), 'enemy', 8, 5);
  const battle = battleOf([cleric, foe]);
  const crate = placeCrate(battle, 5, 5);
  const crateHp = crate.hp;
  Actions.castSpell(battle, cleric, 'sacred_flame', { target: foe });
  assert(crate.hp === crateHp, 'Sacred Flame ignores cover / bodies (vertical column, 5e)');
  step('Sacred Flame is not a projectile');
}

{
  const lock = Combat.makeUnit(mkChar('warlock', 'Hexer', 'fiend'), 'player', 2, 5);
  const ally = Combat.makeUnit(mkChar('fighter', 'Pal', 'champion'), 'player', 5, 5);
  const foe = Combat.makeUnit(mkChar('fighter', 'Marked', 'champion'), 'enemy', 8, 5);
  const battle = battleOf([lock, ally, foe]);
  Actions.castSpell(battle, lock, 'hex', { target: foe });
  assert(foe.statuses.some(s => s.id === 'hexed'), 'Hex still lands on the intended target');
  assert(!ally.statuses.some(s => s.id === 'hexed'), 'Hex does not bounce onto the ally in the way');
  step('Hex is not a projectile');
}

// ============ 9. AIM AT OBJECT VIA performAction ============
{
  const ranger = Combat.makeUnit(mkChar('ranger', 'Aim', 'hunter'), 'player', 2, 5);
  ranger.actionPoints = 1;
  const battle = battleOf([ranger]);
  const crate = placeCrate(battle, 6, 5);
  performAction(battle, ranger.id, { type: 'attack', aim: { x: 6, y: 5 }, opts: { weaponId: 'longbow' } });
  assert(crate.hp < crate.maxHp, 'aiming at a crate with a bow damages it');
  assert(ranger.actionPoints === 0, 'object attack spends the action');
  step('performAction({aim}) shoots a destroyable object');
}

// ============ 10. MONSTER RANGED INTERCEPT ============
{
  const hero = Combat.makeUnit(mkChar('fighter', 'Hero', 'champion'), 'player', 8, 5);
  const gob = Combat.makeUnit({
    id: 'gob1', name: 'Goblin Archer', stats: { STR: 8, DEX: 14, CON: 10, INT: 8, WIS: 8, CHA: 8 },
    ac: 13, hp: 7, maxHp: 7, attacks: [{ name: 'Shortbow', toHit: 4, dmg: '1d6+2', dmgType: 'piercing', range: 8 }],
    cr: 0.25, type: 'humanoid',
  }, 'enemy', 2, 5);
  gob.char.hp = 7; gob.char.maxHp = 7;
  const battle = battleOf([hero, gob]);
  const crate = placeCrate(battle, 5, 5);
  const heroHp = hero.hp;
  monsterAttack(battle, gob, hero, gob.char.attacks[0]);
  assert(hero.hp === heroHp, 'monster arrow is stopped by the crate');
  assert(crate.hp < crate.maxHp, 'crate took the monster shot');
  step('monster ranged attack intercepts on a crate');
}

console.log('projectile_test: all good');
process.exit(0);
