// Dragonborn breath: ancestry damage type, 5e DC, cone vs line, actual HP loss.
import { makeRng } from '../src/rng.js';
import { createCharacter, skillMod, savingThrowMod, mod } from '../src/5e/rules.js';
import { dragonBreathFor, RACE_MAP } from '../src/data/races.js';
import * as Combat from '../src/5e/combat.js';
import { performAction } from '../src/5e/turn.js';
import { CLASS_MAP } from '../src/data/classes.js';
import * as Run from '../src/game/run.js';

const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (c, m) => { if (!c) fail(m); };
const step = (m) => console.log('✔', m);

function mkDragon(raceId, level = 1, rng = makeRng(1)) {
  const cls = CLASS_MAP.fighter;
  return createCharacter({
    raceId, classId: 'fighter', name: 'Drake', subclassId: Object.keys(cls.subclasses)[0],
    scoreAssign: Run.autoAssignScores(cls, RACE_MAP[raceId], rng),
    level, hero: true, rng,
  });
}

function emptyBattle(hero, foeX, foeY) {
  const rng = makeRng(42);
  const combat = {
    popups: [], fx: [], log: [], rng, round: 1, effects: [], units: [], w: 12, h: 10, grid: [], over: false, won: false,
  };
  for (let y = 0; y < 10; y++) combat.grid.push(Array.from({ length: 12 }, () => ({ obstacle: null, elevation: 0, hazard: null })));
  const u = Combat.makeUnit(hero, 'player', 3, 4);
  u.actionPoints = 1;
  const foe = Combat.makeUnit({
    id: 'gob', name: 'Goblin Dummy', ac: 10, hp: 40, maxHp: 40,
    stats: { STR: 8, DEX: 8, CON: 10, INT: 8, WIS: 8, CHA: 8 },
    attacks: [], powers: [], resist: [], immunities: [],
  }, 'enemy', foeX, foeY);
  foe.hp = 40; foe.maxHp = 40;
  combat.units = [u, foe];
  return { combat, u, foe };
}

// Ancestry types + shapes (PHB)
const expect = {
  dragonborn: { type: 'fire', shape: 'cone' },
  dragonborn_black: { type: 'acid', shape: 'line' },
  dragonborn_blue: { type: 'lightning', shape: 'line' },
  dragonborn_brass: { type: 'fire', shape: 'cone' },
  dragonborn_bronze: { type: 'lightning', shape: 'line' },
  dragonborn_copper: { type: 'acid', shape: 'line' },
  dragonborn_gold: { type: 'fire', shape: 'cone' },
  dragonborn_green: { type: 'poison', shape: 'cone' },
  dragonborn_silver: { type: 'cold', shape: 'cone' },
  dragonborn_white: { type: 'cold', shape: 'cone' },
};
for (const [id, exp] of Object.entries(expect)) {
  const b = dragonBreathFor(mkDragon(id));
  assert(b.type === exp.type && b.shape === exp.shape, `${id} should be ${exp.type} ${exp.shape}, got ${b.type} ${b.shape}`);
}
step('all 10 ancestries map to PHB damage type + cone/line');

// Cone hits off-axis tile (was a 3-tile line — this was the no-damage bug)
{
  const hero = mkDragon('dragonborn_green');
  const { combat, u, foe } = emptyBattle(hero, 5, 5); // 2 east, 1 south — in a 3-tile cone, not on the axis
  const hp0 = foe.hp;
  performAction(combat, u.id, { type: 'ability', ability: 'breath_weapon', direction: { dx: 1, dy: 0 }, aim: { x: 6, y: 4 } });
  assert(foe.hp < hp0, `green cone should damage off-axis foe (hp ${foe.hp} vs ${hp0})`);
  assert(combat.log.some(l => l.includes('poison')), 'log should mention poison');
  step(`green dragonborn cone hits off-axis foe (${hp0} → ${foe.hp} poison)`);
}

// Line ancestry: acid, 6 tiles, not cone
{
  const hero = mkDragon('dragonborn_black');
  const { combat, u, foe } = emptyBattle(hero, 8, 4); // 5 tiles east — beyond old 3-tile line
  const hp0 = foe.hp;
  performAction(combat, u.id, { type: 'ability', ability: 'breath_weapon', direction: { dx: 1, dy: 0 }, aim: { x: 9, y: 4 } });
  assert(foe.hp < hp0, `black line should reach 5 tiles (hp ${foe.hp} vs ${hp0})`);
  assert(combat.log.some(l => l.includes('acid')), 'log should mention acid');
  step(`black dragonborn line reaches 5 tiles (${hp0} → ${foe.hp} acid)`);
}

// DC is CON-based, not spell DC
{
  const hero = mkDragon('dragonborn');
  hero.spellSaveDC = 99; // casters used to wrongly use this
  const { combat, u } = emptyBattle(hero, 4, 4);
  performAction(combat, u.id, { type: 'ability', ability: 'breath_weapon', direction: { dx: 1, dy: 0 }, aim: { x: 5, y: 4 } });
  const line = combat.log.find(l => l.includes('DC'));
  const want = 8 + hero.prof + mod(hero.abilities.CON);
  assert(line && line.includes(`DC ${want}`), `DC should be ${want} CON-based, log: ${line}`);
  step(`breath DC is 8+CON+prof (${want}), not spell DC`);
}

// skillMod: expertise doubles proficiency; Jack of All Trades
{
  const rng = makeRng(3);
  const bard = createCharacter({
    raceId: 'human', classId: 'bard', name: 'Song', subclassId: Object.keys(CLASS_MAP.bard.subclasses)[0],
    scoreAssign: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 13, CHA: 15 },
    level: 2, hero: false, rng,
  });
  bard.skills = ['Persuasion'];
  bard.skillExpertise = [];
  const pers = skillMod(bard, 'Persuasion');
  assert(pers === mod(bard.abilities.CHA) + bard.prof, `proficient Persuasion ${pers}`);
  const ath = skillMod(bard, 'Athletics');
  assert(ath === mod(bard.abilities.STR) + Math.floor(bard.prof / 2), `Jack of All Trades Athletics ${ath}`);
  const rogue = createCharacter({
    raceId: 'human', classId: 'rogue', name: 'Sneak', subclassId: Object.keys(CLASS_MAP.rogue.subclasses)[0],
    scoreAssign: { STR: 8, DEX: 15, CON: 12, INT: 13, WIS: 10, CHA: 14 },
    level: 1, hero: false, rng,
  });
  rogue.skills = ['Stealth'];
  rogue.skillExpertise = ['Stealth'];
  const st = skillMod(rogue, 'Stealth');
  assert(st === mod(rogue.abilities.DEX) + rogue.prof * 2, `expertise Stealth ${st}`);
  const dexSave = savingThrowMod(rogue, 'DEX');
  assert(dexSave === mod(rogue.abilities.DEX) + rogue.prof, `rogue DEX save proficiency ${dexSave}`);
  step('skillMod: proficiency, expertise (×2), Jack of All Trades; DEX save proficiency');
}

console.log('breath_test: all good');
