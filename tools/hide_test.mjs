// Hide + LOS spotting (5e), racial hide traits, Passive Perception contests,
// and physical weapon projectile FX.
import { makeRng } from '../src/rng.js';
import { createCharacter, passivePerception } from '../src/5e/rules.js';
import * as Combat from '../src/5e/combat.js';
import * as Actions from '../src/5e/combat_actions.js';
import { performAction } from '../src/5e/turn.js';
import { RACES, RACE_MAP } from '../src/data/races.js';
import { CLASS_MAP } from '../src/data/classes.js';
import { autoAssignScores } from '../src/game/run.js';

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); };

const rng = makeRng(77);
const race = RACES[0];

function mkChar(classId, name, subclassId, level = 1, raceId = race.id) {
  const cls = CLASS_MAP[classId];
  const r = RACE_MAP[raceId] || race;
  return createCharacter({
    raceId: r.id, classId, name, subclassId,
    scoreAssign: autoAssignScores(cls, r, rng),
    level, hero: false, rng,
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

function battleOf(units) {
  return {
    popups: [], fx: [], log: [], rng: makeRng(3), round: 1, effects: [],
    units, w: 14, h: 10, grid: emptyGrid(14, 10),
    over: false, won: false, turnIndex: 0, order: units.map(u => u.id),
    revealed: true,
  };
}

function wallColumn(battle, x) {
  for (let y = 1; y < battle.h - 1; y++) battle.grid[y][x].obstacle = 'pillar';
}

function deafen(u) {
  Combat.addStatus(u, 'deafened', 'Deafened', 99);
}

// ============ 1. Cannot hide while clearly seen ============
{
  const rogue = Combat.makeUnit(mkChar('rogue', 'Sneak', 'thief'), 'player', 3, 5);
  rogue.vision = 8;
  const foe = Combat.makeUnit(mkChar('fighter', 'Watcher', 'champion'), 'enemy', 8, 5);
  foe.vision = 8;
  const battle = battleOf([rogue, foe]);
  rogue.actionPoints = 1;
  performAction(battle, rogue.id, { type: 'hide' });
  assert(!rogue.hidden, 'hide must fail in the open');
  assert(battle.log.some(l => /can see them clearly/.test(l)), 'plain-sight hide is logged');
  assert(rogue.actionPoints === 0, 'failed hide still spends the action (5e: you took Hide)');
  step('cannot hide while clearly seen');
}

// ============ 2. Hide behind a tall wall succeeds + LOS overlay data ============
{
  const rogue = Combat.makeUnit(mkChar('rogue', 'Sneak2', 'thief'), 'player', 3, 5);
  rogue.vision = 8;
  const foe = Combat.makeUnit(mkChar('fighter', 'Watcher2', 'champion'), 'enemy', 10, 5);
  foe.vision = 8;
  deafen(foe);
  const battle = battleOf([rogue, foe]);
  wallColumn(battle, 6);
  assert(!Combat.hasLOS(battle, foe.x, foe.y, rogue.x, rogue.y), 'pillar column blocks LOS');
  rogue.actionPoints = 1;
  performAction(battle, rogue.id, { type: 'hide' });
  assert(rogue.hidden === true, 'hide succeeds behind total cover');
  assert(rogue.statuses.some(s => s.id === 'hidden'), 'Hidden status is applied');
  assert(battle.log.some(l => /hides \(Stealth/.test(l)), 'Stealth check is logged');
  const tiles = Combat.tilesSeenBy(battle, foe);
  assert(tiles.length > 0, 'enemy sight tiles exist for the overlay');
  assert(!tiles.some(t => t.x === rogue.x && t.y === rogue.y), 'hider is not in the watcher\'s sight');
  step('hide behind a pillar + enemy sight tiles');
}

// ============ 3. Moving into LOS breaks hide; staying hidden does not ============
{
  const rogue = Combat.makeUnit(mkChar('rogue', 'Sneak3', 'thief'), 'player', 3, 5);
  rogue.vision = 8;
  rogue.moveRemaining = 20;
  const foe = Combat.makeUnit(mkChar('fighter', 'Watcher3', 'champion'), 'enemy', 10, 5);
  foe.vision = 8;
  deafen(foe);
  const battle = battleOf([rogue, foe]);
  wallColumn(battle, 6);
  Actions.tryHide(battle, rogue);
  assert(rogue.hidden, 'starts hidden');
  Actions.moveUnit(battle, rogue, [{ x: 3, y: 4 }]);
  assert(rogue.hidden, 'moving while out of sight keeps hide');
  battle.grid[0][6].obstacle = null;
  Actions.moveUnit(battle, rogue, [{ x: 3, y: 3 }, { x: 3, y: 2 }, { x: 3, y: 1 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 0 }, { x: 7, y: 0 }]);
  assert(!rogue.hidden, 'stepping into LOS spots the hider');
  assert(battle.log.some(l => /spots/.test(l)), 'spotting is logged');
  step('move out of sight keeps hide; enter LOS and get spotted');
}

// ============ 4. Enemy walking around a corner spots a hidden rogue ============
{
  const rogue = Combat.makeUnit(mkChar('rogue', 'Sneak4', 'thief'), 'player', 3, 5);
  rogue.vision = 8;
  const foe = Combat.makeUnit(mkChar('fighter', 'Walker', 'champion'), 'enemy', 10, 5);
  foe.vision = 8;
  foe.moveRemaining = 20;
  deafen(foe);
  const battle = battleOf([rogue, foe]);
  wallColumn(battle, 6);
  Actions.tryHide(battle, rogue);
  assert(rogue.hidden, 'hidden before the walk');
  // enemy has come around the wall and takes one step into a viewing angle
  foe.x = 4; foe.y = 6;
  foe.moveRemaining = 4;
  Actions.moveUnit(battle, foe, [{ x: 4, y: 5 }]);
  assert(!rogue.hidden, 'enemy walking into a viewing angle spots the hider');
  step('enemy movement can break hide');
}

// ============ 5. Attack breaks hide ============
{
  const rogue = Combat.makeUnit(mkChar('rogue', 'Sneak5', 'thief'), 'player', 3, 5);
  const foe = Combat.makeUnit(mkChar('fighter', 'Victim', 'champion'), 'enemy', 4, 5);
  const battle = battleOf([rogue, foe]);
  battle.grid[5][8].obstacle = 'pillar'; // doesn't matter — we'll force hidden
  rogue.hidden = true;
  Combat.addStatus(rogue, 'hidden', 'Hidden', 99);
  Actions.weaponAttack(battle, rogue, foe, { weaponId: 'dagger' });
  assert(!rogue.hidden, 'attacking gives away the position');
  step('attacking breaks hide');
}

// ============ 6. Cunning Action hide is bonus-only at rogue 2+ ============
{
  const r1 = Combat.makeUnit(mkChar('rogue', 'Baby', 'thief', 1), 'player', 2, 2);
  r1.vision = 8;
  const r2 = Combat.makeUnit(mkChar('rogue', 'Pro', 'thief', 2), 'player', 2, 3);
  r2.vision = 8;
  const battle = battleOf([r1, r2]);
  r1.bonusPoints = 1; r1.actionPoints = 1;
  performAction(battle, r1.id, { type: 'hide', asBonus: true });
  assert(r1.bonusPoints === 1, 'level 1 rogue cannot cunning-hide');
  assert(battle.log.some(l => /Cunning Action/.test(l)), 'level 1 is blocked');
  r2.bonusPoints = 1; r2.actionPoints = 1;
  performAction(battle, r2.id, { type: 'hide', asBonus: true });
  assert(r2.hidden === true, 'rogue 2 hides as a bonus action');
  assert(r2.bonusPoints === 0 && r2.actionPoints === 1, 'cunning hide spends the bonus, not the action');
  step('Cunning Action hide is rogue 2+');
}

// ============ 7. Bow / javelin projectile FX ============
{
  const ranger = Combat.makeUnit(mkChar('ranger', 'Aim', 'hunter'), 'player', 2, 5);
  const foe = Combat.makeUnit(mkChar('fighter', 'Mark', 'champion'), 'enemy', 8, 5);
  const battle = battleOf([ranger, foe]);
  Actions.weaponAttack(battle, ranger, foe, { weaponId: 'longbow' });
  const arrow = (battle.fx || []).find(f => f.type === 'proj' && f.kind === 'arrow');
  assert(!!arrow, 'longbow pushes an arrow projectile FX');
  assert(arrow.x0 === ranger.x && arrow.y0 === ranger.y, 'arrow starts at the shooter');
  assert(arrow.x1 === foe.x && arrow.y1 === foe.y, 'arrow ends at the target');
  battle.fx = [];
  const tosser = Combat.makeUnit(mkChar('fighter', 'Toss', 'champion'), 'player', 2, 4);
  tosser.char.weapon = { base: 'javelin', enchant: null };
  const foe2 = Combat.makeUnit(mkChar('fighter', 'Mark2', 'champion'), 'enemy', 7, 4);
  battle.units.push(tosser, foe2);
  Actions.weaponAttack(battle, tosser, foe2, { weaponId: 'javelin' });
  const jav = (battle.fx || []).find(f => f.type === 'proj' && f.kind === 'thrown');
  assert(!!jav, 'javelin push a thrown projectile FX');
  step('bows and javelins spawn on-screen projectile FX');
}

// ============ 8. Naturally Stealthy: hide behind a larger creature ============
{
  assert(RACE_MAP.halfling.naturallyStealthy, 'halfling race is stamped Naturally Stealthy');
  const half = Combat.makeUnit(mkChar('rogue', 'Pip', 'thief', 1, 'halfling'), 'player', 3, 5);
  const ally = Combat.makeUnit(mkChar('fighter', 'Shield', 'champion'), 'player', 4, 5);
  const foe = Combat.makeUnit(mkChar('fighter', 'Lookout', 'champion'), 'enemy', 8, 5);
  foe.vision = 8; half.vision = 8;
  deafen(foe);
  const battle = battleOf([half, ally, foe]);
  assert(Combat.hasNaturallyStealthy(half), 'halfling unit has Naturally Stealthy');
  assert(Combat.sizeRank(Combat.unitSize(ally)) > Combat.sizeRank(Combat.unitSize(half)), 'ally is larger');
  assert(Combat.isObscuredByLargerCreature(battle, half, foe), 'ally obscures the halfling from the foe');
  assert(!Combat.seesClearly(battle, foe, half), 'foe does not see the hidden-capable halfling clearly');
  half.actionPoints = 1;
  performAction(battle, half.id, { type: 'hide' });
  assert(half.hidden === true, 'halfling hides behind a Medium ally');
  step('Naturally Stealthy: hide behind a larger creature');
}

// ============ 9. Naturally Stealthy does not apply without a larger body ============
{
  const half = Combat.makeUnit(mkChar('rogue', 'Pip2', 'thief', 1, 'halfling'), 'player', 3, 5);
  const foe = Combat.makeUnit(mkChar('fighter', 'Lookout2', 'champion'), 'enemy', 8, 5);
  foe.vision = 8; half.vision = 8;
  deafen(foe);
  const battle = battleOf([half, foe]);
  half.actionPoints = 1;
  performAction(battle, half.id, { type: 'hide' });
  assert(!half.hidden, 'halfling still cannot hide in the open alone');
  assert(battle.log.some(l => /can see them clearly/.test(l)), 'open-field Naturally Stealthy is refused');
  step('Naturally Stealthy still needs a larger creature');
}

// ============ 10. Humans cannot hide behind an ally ============
{
  const human = Combat.makeUnit(mkChar('rogue', 'Tall', 'thief'), 'player', 3, 5);
  const ally = Combat.makeUnit(mkChar('fighter', 'Buddy', 'champion'), 'player', 4, 5);
  const foe = Combat.makeUnit(mkChar('fighter', 'Lookout3', 'champion'), 'enemy', 8, 5);
  foe.vision = 8; human.vision = 8;
  deafen(foe);
  const battle = battleOf([human, ally, foe]);
  human.actionPoints = 1;
  performAction(battle, human.id, { type: 'hide' });
  assert(!human.hidden, 'a human cannot hide just by standing next to an ally');
  step('only Naturally Stealthy uses a larger creature as concealment');
}

// ============ 11. Mask of the Wild: hide next to foliage ============
{
  assert(RACE_MAP.wood_elf.maskOfTheWild, 'wood elf race is stamped Mask of the Wild');
  const we = Combat.makeUnit(mkChar('ranger', 'Leaf', 'hunter', 1, 'wood_elf'), 'player', 3, 5);
  const foe = Combat.makeUnit(mkChar('fighter', 'Scout', 'champion'), 'enemy', 8, 5);
  foe.vision = 8; we.vision = 8;
  deafen(foe);
  const battle = battleOf([we, foe]);
  battle.grid[5][4].obstacle = 'bush';
  assert(Combat.hasMaskOfTheWild(we), 'wood elf unit has Mask of the Wild');
  assert(Combat.isLightlyObscuredByNature(battle, we), 'adjacent bush is natural obscurement');
  we.actionPoints = 1;
  performAction(battle, we.id, { type: 'hide' });
  assert(we.hidden === true, 'wood elf hides next to a bush');
  step('Mask of the Wild: hide next to foliage');
}

// ============ 12. Mask of the Wild does not apply in the open ============
{
  const we = Combat.makeUnit(mkChar('ranger', 'Leaf2', 'hunter', 1, 'wood_elf'), 'player', 3, 5);
  const foe = Combat.makeUnit(mkChar('fighter', 'Scout2', 'champion'), 'enemy', 8, 5);
  foe.vision = 8; we.vision = 8;
  deafen(foe);
  const battle = battleOf([we, foe]);
  we.actionPoints = 1;
  performAction(battle, we.id, { type: 'hide' });
  assert(!we.hidden, 'wood elf cannot hide on bare stone');
  step('Mask of the Wild still needs foliage or mist');
}

// ============ 13. Hearing / Passive Perception contests hide ============
{
  const rogue = Combat.makeUnit(mkChar('rogue', 'Quiet', 'thief'), 'player', 3, 5);
  const foe = Combat.makeUnit(mkChar('fighter', 'Owl', 'champion'), 'enemy', 10, 5);
  foe.vision = 8;
  foe.char.abilities.WIS = 99; // Passive Perception 10 + 44 = 54, beats any d20
  const battle = battleOf([rogue, foe]);
  wallColumn(battle, 6);
  assert(!Combat.hasLOS(battle, foe.x, foe.y, rogue.x, rogue.y), 'wall still blocks sight');
  assert(passivePerception(foe) > 40, 'watcher has an absurd Passive Perception');
  rogue.actionPoints = 1;
  performAction(battle, rogue.id, { type: 'hide' });
  assert(!rogue.hidden, 'hide fails when Passive Perception beats Stealth');
  assert(battle.log.some(l => /hears them \(Passive Perception/.test(l)), 'failed hide is logged as heard');
  step('Passive Perception can hear a hide behind a wall');
}

// ============ 14. Walking into earshot of a keen observer reveals you ============
{
  const rogue = Combat.makeUnit(mkChar('rogue', 'Quiet2', 'thief'), 'player', 3, 5);
  const foe = Combat.makeUnit(mkChar('fighter', 'Owl2', 'champion'), 'enemy', 10, 5);
  foe.vision = 8;
  deafen(foe);
  const battle = battleOf([rogue, foe]);
  wallColumn(battle, 6);
  Actions.tryHide(battle, rogue);
  assert(rogue.hidden, 'hidden while the watcher is deaf');
  rogue.stealthScore = 8;
  Combat.removeStatus(foe, 'deafened');
  foe.char.abilities.WIS = 18; // PP 14 > stealth 8
  assert(passivePerception(foe) > rogue.stealthScore, 'watcher now out-hears the stealth total');
  foe.moveRemaining = 2;
  Actions.moveUnit(battle, foe, [{ x: 10, y: 4 }]);
  assert(!rogue.hidden, 'a high-PP foe hears the hider after stepping closer');
  assert(battle.log.some(l => /hears /.test(l)), 'hearing reveal is logged');
  step('Passive Perception can break hide without LOS');
}

console.log('hide_test: all good');
process.exit(0);
