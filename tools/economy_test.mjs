// Action-economy test (headless): verifies the integer point system —
// 1 action + 1 bonus per turn, Dash spends a point and doubles movement,
// Action Surge adds a point, Thief rogues get 2 bonus points, Haste adds a
// point, and zero points blocks further actions.
import { makeRng } from '../src/rng.js';
import { createCharacter, computeSpeed } from '../src/5e/rules.js';
import { autoAssignScores, generateCompanion } from '../src/game/run.js';
import {
  generateCombatMap, spawnEncounter, startOfTurnReset, currentUnit, hasAction, hasBonus,
  spendAction, spendBonus, unitAt,
} from '../src/5e/combat.js';
import { performAction } from '../src/5e/turn.js';
import { addStatus } from '../src/5e/combat.js';
import { RACES } from '../src/data/races.js';
import { CLASS_MAP } from '../src/data/classes.js';

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); };

function makeUnitOf(clsId, level, subclassId) {
  const rng = makeRng(1234 + level);
  const cls = CLASS_MAP[clsId];
  const race = RACES[0]; // human
  const c = createCharacter({
    raceId: race.id, classId: clsId, name: 'Test' + clsId,
    subclassId: subclassId || Object.keys(cls.subclasses)[0],
    scoreAssign: autoAssignScores(cls, race, rng),
    level, hero: false, rng,
  });
  return c;
}

// Build one real combat containing: fighter(2) with action surge, rogue(3) thief
const rng = makeRng(555);
const fighter = makeUnitOf('fighter', 2);
const thief = makeUnitOf('rogue', 3, 'thief');
const party = [fighter, thief, generateCompanion(rng, 2, ['fighter', 'rogue'])];

const { LOCATION_MAP } = await import('../src/data/locations.js');
const combat = generateCombatMap(LOCATION_MAP.tavern, 1, rng, { revealed: true });
spawnEncounter(combat, party, 1, rng, {});

const fighterU = combat.units.find(u => u.char.classId === 'fighter');
const thiefU = combat.units.find(u => u.char.classId === 'rogue');

// ---- 1. baseline points at turn start ----
startOfTurnReset(combat, fighterU);
assert(fighterU.actionPoints === 1, `fighter should start with 1 action point, got ${fighterU.actionPoints}`);
assert(fighterU.bonusPoints === 1, `fighter should start with 1 bonus point, got ${fighterU.bonusPoints}`);
step('baseline: 1 action point + 1 bonus point per turn');

// ---- 2. Dash: spends an action point and doubles movement ----
const speedBefore = fighterU.moveRemaining;
performAction(combat, fighterU.id, { type: 'dash' });
assert(fighterU.actionPoints === 0, `dash should spend the action point, got ${fighterU.actionPoints}`);
assert(fighterU.moveRemaining === speedBefore + computeSpeed(fighterU.char), `dash should add speed (${speedBefore} -> ${fighterU.moveRemaining})`);
assert(!hasAction(fighterU), 'hasAction should be false after dash');
step(`Dash works: action point 1→0, movement ${speedBefore}→${fighterU.moveRemaining}`);

// ---- 3. second dash is now impossible ----
performAction(combat, fighterU.id, { type: 'dash' });
assert(fighterU.moveRemaining === speedBefore + computeSpeed(fighterU.char), 'second dash must NOT grant movement (no points left)');
step('second Dash blocked: no action points');

// ---- 4. Action Surge: +1 action point ----
startOfTurnReset(combat, fighterU);
const surgeRes = fighterU.char.resources.actionSurge;
assert(surgeRes && surgeRes.cur > 0, 'fighter lvl 2 should have action surge available');
performAction(combat, fighterU.id, { type: 'ability', ability: 'action_surge' });
assert(fighterU.actionPoints === 2, `action surge should grant 2 total action points, got ${fighterU.actionPoints}`);
assert(surgeRes.cur === 0, 'action surge resource should be consumed');
step('Action Surge: action points 1→2 (no wasted surge)');

// ---- 5. two actions spendable back-to-back ----
performAction(combat, fighterU.id, { type: 'dash' });
assert(fighterU.actionPoints === 1, `first dash should leave 1 point, got ${fighterU.actionPoints}`);
performAction(combat, fighterU.id, { type: 'dash' });
assert(fighterU.actionPoints === 0, `second dash should leave 0 points, got ${fighterU.actionPoints}`);
step('Both action points usable iteratively (action-- each time)');

// ---- 6. Thief: 2 bonus points ----
startOfTurnReset(combat, thiefU);
assert(thiefU.bonusPoints === 2, `level 3 thief should have 2 bonus points, got ${thiefU.bonusPoints}`);
assert(thiefU.actionPoints === 1, 'thief should have 1 action point');
spendBonus(thiefU);
assert(thiefU.bonusPoints === 1 && hasBonus(thiefU), 'first bonus spend should leave 1');
spendBonus(thiefU);
assert(thiefU.bonusPoints === 0 && !hasBonus(thiefU), 'second bonus spend should leave 0');
step('Thief (Fast Hands): 2 bonus points per turn');

// ---- 7. Haste: +1 action point + doubled movement ----
const other = combat.units.find(u => u.team === 'player' && u.char.classId !== 'fighter' && u.char.classId !== 'rogue');
addStatus(other, 'hasted', 'Hasted', 10);
startOfTurnReset(combat, other);
assert(other.actionPoints === 2, `haste should grant 2 action points, got ${other.actionPoints}`);
assert(other.moveRemaining === 2 * computeSpeed(other.char), `haste should double movement, got ${other.moveRemaining}/${computeSpeed(other.char)}`);
step('Haste: +1 action point and doubled movement');

console.log('ECONOMY TEST OK');
process.exit(0);
