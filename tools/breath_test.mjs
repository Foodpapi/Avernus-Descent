#!/usr/bin/env node
import { makeRng } from '../src/rng.js';
import { createCharacter } from '../src/5e/rules.js';
import { generateCombatMap, spawnEncounter, currentUnit, aliveEnemies, unitAt, makeUnit } from '../src/5e/combat.js';
import { performAction } from '../src/5e/turn.js';
import { LOCATION_MAP } from '../src/data/locations.js';
import { RACE_MAP } from '../src/data/races.js';
import { CLASS_MAP } from '../src/data/classes.js';

const rng = makeRng(12345);

// Test all dragonborn ancestries
const ancestries = [
  'dragonborn',
  'dragonborn_black',
  'dragonborn_blue',
  'dragonborn_brass',
  'dragonborn_bronze',
  'dragonborn_copper',
  'dragonborn_gold',
  'dragonborn_green',
  'dragonborn_silver',
  'dragonborn_white',
];

for (const raceId of ancestries) {
  const race = RACE_MAP[raceId];
  console.log(`\n=== Testing ${race.name} (${raceId}) dragonType=${race.dragonType} resist=${race.resist} ===`);
  const cls = CLASS_MAP['fighter'];
  const hero = createCharacter({
    raceId,
    classId: 'fighter',
    name: 'TestDragon',
    subclassId: 'champion',
    scoreAssign: { STR: 15, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    level: 1,
    hero: true,
    rng,
  });
  console.log(`  char.dragonType=${hero.dragonType} char.race.dragonType=${hero.race.dragonType} char.race.resist=${hero.race.resist}`);
  console.log(`  resources:`, hero.resources);

  // Setup combat
  const loc = LOCATION_MAP['tavern'];
  const combat = generateCombatMap(loc, 1, rng, {});
  // Spawn hero unit at 2,2
  const u = makeUnit(hero, 'player', 2, 5);
  u.vision = 12;
  combat.units = [u];
  // Add enemy at 3 tiles ahead: 5,5
  const { createCharacter: cc } = await import('../src/5e/rules.js');
  const enemyRace = RACE_MAP['human'];
  const enemyCls = CLASS_MAP['fighter'];
  const enemyChar = cc({
    raceId: 'human',
    classId: 'fighter',
    name: 'Goblin',
    subclassId: 'champion',
    scoreAssign: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    level: 1,
    hero: false,
    rng,
  });
  enemyChar.stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  enemyChar.ac = 10;
  enemyChar.maxHp = 20;
  enemyChar.hp = 20;
  const { makeUnit: mu } = await import('../src/5e/combat.js');
  const enemyUnit = mu(enemyChar, 'enemy', 5, 5);
  enemyUnit.maxHp = 20;
  enemyUnit.hp = 20;
  combat.units.push(enemyUnit);
  combat.order = [u.id, enemyUnit.id];
  combat.turnIndex = 0;
  combat.round = 1;
  combat.log = [];
  combat.rng = rng;
  combat.w = 18; combat.h = 12;
  // Ensure grid exists and is passable
  // Try breath weapon
  console.log(`  Enemy HP before: ${enemyUnit.hp}`);
  const dir = { dx: 1, dy: 0 };
  performAction(combat, u.id, { type: 'ability', ability: 'breath_weapon', direction: dir });
  console.log(`  Enemy HP after breath (dir 1,0): ${enemyUnit.hp} dead=${enemyUnit.dead}`);
  console.log(`  Combat log:`, combat.log.slice(-5));
  if (enemyUnit.hp === 20) {
    console.log(`  *** BUG: No damage dealt! ***`);
  } else {
    console.log(`  Damage dealt: ${20 - enemyUnit.hp} type=${hero.dragonType}`);
  }
}

console.log("\nDone");
