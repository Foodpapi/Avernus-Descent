#!/usr/bin/env node
// Headless test harness: simulates full runs (hero + companions vs monsters)
// with random play and AI vs AI, to validate the 5e engine end-to-end.

import { makeRng } from '../src/rng.js';
import { createCharacter } from '../src/5e/rules.js';
import { generateCombatMap, spawnEncounter, currentUnit, aliveEnemies, alivePlayers, unitAt, findPath, canSee } from '../src/5e/combat.js';
import { endTurn, canAct } from '../src/5e/combat_actions.js';
import { performAction } from '../src/5e/turn.js';
import { chooseEnemyAction, executeEnemyTurn } from '../src/5e/ai.js';
import { generateCompanion, autoAssignScores, floorIsBoss } from '../src/game/run.js';
import { LOCATION_MAP } from '../src/data/locations.js';
import { RACES } from '../src/data/races.js';
import { CLASSES } from '../src/data/classes.js';
import { SPELL_MAP } from '../src/data/spells.js';

// localStorage stub
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
}

// Simple random player policy
function playerPolicy(combat, u) {
  const char = u.char;
  // self-preservation: hero backs off when hurt
  if (u.char.hero && u.hp < u.maxHp * 0.35) {
    const list = aliveEnemies(combat);
    const nearest = list.length ? list.reduce((a, b) => {
      const da = Math.max(Math.abs(a.x - u.x), Math.abs(a.y - u.y));
      const db = Math.max(Math.abs(b.x - u.x), Math.abs(b.y - u.y));
      return da < db ? a : b;
    }) : null;
    if (nearest) {
      const away = { x: u.x - Math.sign(nearest.x - u.x), y: u.y - Math.sign(nearest.y - u.y) };
      if (isPassable(combat, away.x, away.y) && !unitAt(combat, away.x, away.y)) {
        return { type: 'move', path: [away] };
      }
    }
  }
  // class survival abilities
  if (char.cls.id === 'fighter' && u.hp < u.maxHp * 0.6 && char.resources.secondWind && char.resources.secondWind.cur > 0) {
    return { type: 'ability', ability: 'second_wind' };
  }
  if (char.cls.id === 'paladin' && u.hp < u.maxHp * 0.5 && char.resources.layOnHands && char.resources.layOnHands.cur > 0) {
    return { type: 'ability', ability: 'lay_on_hands', targetId: u.id, amount: 15 };
  }
  const enemies = aliveEnemies(combat).filter(e => canSee(combat, u, e.x, e.y) || Math.max(Math.abs(e.x - u.x), Math.abs(e.y - u.y)) < 6);
  if (!enemies.length) {
    // move toward nearest enemy
    const all = aliveEnemies(combat);
    if (!all.length) return { type: 'wait' };
    const t = all.reduce((a, b) => Math.abs(a.x - u.x) + Math.abs(a.y - u.y) < Math.abs(b.x - u.x) + Math.abs(b.y - u.y) ? a : b);
    const dest = { x: t.x, y: t.y };
    let res = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cand = { x: t.x + dx, y: t.y + dy };
      if (combat.grid[cand.y] && combat.grid[cand.y][cand.x] && isPassable(combat, cand.x, cand.y) && !unitAt(combat, cand.x, cand.y)) {
        const r = findPath(combat, u, cand.x, cand.y, u.moveRemaining);
        if (r) { res = r; break; }
      }
    }
    if (res) return { type: 'move', path: res.path };
    return { type: 'dash' };
  }
  // focus fire: lowest HP, weighted by proximity
  const target = enemies.reduce((a, b) => {
    const da = Math.max(Math.abs(a.x - u.x), Math.abs(a.y - u.y));
    const db = Math.max(Math.abs(b.x - u.x), Math.abs(b.y - u.y));
    return (a.hp * 2 + da) < (b.hp * 2 + db) ? a : b;
  });
  const dist = Math.max(Math.abs(target.x - u.x), Math.abs(target.y - u.y));

  // HEALING: if an ally is badly hurt and this unit can heal, do it
  if (char.cls.spellAbility) {
    const hurtAllies = alivePlayers(combat).filter(p => p.hp < p.maxHp * 0.55 && p.hp > 0);
    const healers = char.spellsKnown.filter(id => {
      const sp = SPELL_MAP[id];
      return sp && sp.heal && canCast(char, id);
    });
    if (hurtAllies.length && healers.length && combat.rng.chance(0.8)) {
      const target = hurtAllies.sort((a, b) => a.hp - b.hp)[0];
      const spellId = healers.sort((a, b) => SPELL_MAP[a].level - SPELL_MAP[b].level)[0];
      return { type: 'cast', spellId, targetId: target.id };
    }
  }

  // try an attack if in range
  const weapon = char.weapon ? char.weapon.base : 'fists';
  const wdef = weaponDef(char, weapon);
  const range = wdef.rangeTiles;
  if (dist <= range) {
    // casters prefer damaging spells / cantrips
    const isWeakMartial = char.cls.spellAbility && ['wizard', 'sorcerer', 'warlock', 'bard', 'cleric', 'druid'].includes(char.cls.id);
    if (isWeakMartial) {
      const offensive = char.spellsKnown.filter(id => {
        const sp = SPELL_MAP[id];
        return sp && (sp.dmg || sp.fx === 'hold_person' || sp.fx === 'sleep' || sp.fx === 'hideous_laughter') && sp.mode !== 'self' && sp.mode !== 'ally' && sp.mode !== 'cone';
      });
      const castable = offensive.filter(id => canCast(char, id));
      // prefer fireball-like AoEs when 2+ enemies cluster
      const aoe = castable.filter(id => {
        const sp = SPELL_MAP[id];
        return sp.mode === 'aoe' && sp.dmg && aliveEnemies(combat).filter(e => Math.max(Math.abs(e.x - target.x), Math.abs(e.y - target.y)) <= sp.aoeRadius).length >= 2;
      });
      const pick = aoe.length ? aoe[0] : (castable.length && combat.rng.chance(0.8) ? combat.rng.pick(castable) : null);
      if (pick) {
        const sp = SPELL_MAP[pick];
        if (sp.mode === 'aoe') return { type: 'cast', spellId: pick, targetId: target.id, aim: { x: target.x, y: target.y } };
        return { type: 'cast', spellId: pick, targetId: target.id };
      }
    } else if (combat.rng.chance(0.4)) {
      const offensive = char.spellsKnown.filter(id => {
        const sp = SPELL_MAP[id];
        return sp && sp.dmg && sp.mode !== 'self' && sp.mode !== 'ally' && sp.mode !== 'cone' && canCast(char, id);
      });
      if (offensive.length) {
        const sid = combat.rng.pick(offensive);
        return { type: 'cast', spellId: sid, targetId: target.id };
      }
    }
    return { type: 'attack', targetId: target.id, opts: { weaponId: weapon } };
  }
  // move toward
  let res = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cand = { x: target.x + dx, y: target.y + dy };
    if (combat.grid[cand.y] && combat.grid[cand.y][cand.x] && isPassable(combat, cand.x, cand.y) && !unitAt(combat, cand.x, cand.y)) {
      const r = findPath(combat, u, cand.x, cand.y, u.moveRemaining);
      if (r) { res = r; break; }
    }
  }
  if (res) return { type: 'move', path: res.path };
  const r2 = findPath(combat, u, target.x, target.y, u.moveRemaining);
  if (r2) return { type: 'move', path: r2.path };
  return { type: 'dash' };
}

function isPassable(combat, x, y) {
  const t = combat.grid[y] && combat.grid[y][x];
  if (!t) return false;
  if (t.obstacle) {
    const OB = { pillar: true, tree: true, house: true, wall: true, statue: true, mast: true, rock: true, boulder: true, spike: true, rift: true, sarcophagus: true, crate: true, cannon: true, hearth: true, fountain: true, cart: true, stone_circle: true, mushroom: true, vine: true, bone_pile: true, chain: true, brazier: true, table: true, barrel: true, chair: true, bush: true, log: true, stump: true, rubble: true, arch: true, rope_coil: true };
    if (OB[t.obstacle]) return false;
  }
  if (t.hazard === 'water' || t.hazard === 'lava') return false;
  if (unitAt(combat, x, y)) return false;
  return true;
}

function weaponDef(char, weaponId) {
  const { WEAPONS, FISTS } = { WEAPONS: {}, FISTS: {} }; // placeholder
  const W = { dagger: 1, club: 1, mace: 1, quarterstaff: 1, spear: 1, sickle: 1, handaxe: 1, javelin: 6, light_crossbow: 8, shortbow: 8, sling: 3, battleaxe: 1, flail: 1, glaive: 2, greataxe: 1, greatsword: 1, halberd: 2, longsword: 1, maul: 1, morningstar: 1, pike: 2, rapier: 1, scimitar: 1, shortsword: 1, warhammer: 1, whip: 2, hand_crossbow: 3, heavy_crossbow: 10, longbow: 15, fists: 1 };
  return { rangeTiles: W[weaponId] || 1 };
}

function canCast(char, spellId) {
  const sp = SPELL_MAP[spellId];
  if (!sp || !char.spellsKnown.includes(spellId)) return false;
  if (sp.level === 0) return true;
  if (char.cls.warlock) return char.pactSlotsUsed < char.pactSlots.length;
  if (!char.spellSlots || char.spellSlots.length < sp.level) return false;
  return char.spellSlots[sp.level - 1] > (char.spellSlotsUsed[sp.level - 1] || 0);
}

function runBattle(combat, maxRounds = 60) {
  let rounds = 0;
  let guard = 0;
  while (!combat.over && guard++ < 4000 && rounds < maxRounds) {
    const u = currentUnit(combat);
    if (!u) break;
    if (u.dead) { endTurn(combat); continue; }
    if (!canAct(u)) { endTurn(combat); continue; }
    if (u.team === 'player') {
      const action = playerPolicy(combat, u);
      performAction(combat, u.id, action);
      endTurn(combat);
    } else {
      const action = chooseEnemyAction(combat, u);
      executeEnemyTurn(combat, u, action);
      // ensure turn advances even if AI move didn't end turn
      const stillCurrent = currentUnit(combat);
      if (stillCurrent && stillCurrent.id === u.id && !combat.over) {
        endTurn(combat);
      }
    }
    if (combat.round > rounds) rounds = combat.round;
  }
  return combat;
}

function makeParty(rng, level) {
  const race = rng.pick(RACES);
  const cls = rng.pick(CLASSES);
  const hero = createCharacter({
    raceId: race.id,
    classId: cls.id,
    name: 'TestHero',
    subclassId: Object.keys(cls.subclasses)[0],
    scoreAssign: autoAssignScores(cls, race, rng),
    level, hero: true, rng,
  });
  const party = [hero];
  const used = [hero.classId];
  for (let i = 0; i < 3; i++) {
    const c = generateCompanion(rng, level, used);
    used.push(c.classId);
    party.push(c);
  }
  return party;
}

// ---- run the simulation ----
console.log('=== AVERNUS DESCENT — headless battle sim ===');
let wins = 0, losses = 0;
const N = 40;
for (let battle = 0; battle < N; battle++) {
  const rng = makeRng(battle * 7919 + 13);
  const locId = ['tavern', 'mountain_pass', 'ship', 'town', 'forest', 'dungeon', 'ruins', 'fey', 'avernus'][battle % 9];
  const loc = LOCATION_MAP[locId];
  const floor = 1 + (battle % 10);
  // party level matches the real game: +1 every 2 floors
  const partyLevel = 1 + Math.floor((floor - 1) / 2);
  const party = makeParty(rng, partyLevel);
  // tank-hero experiment: hero cannot die, to measure party combat power
  if (process.env.TANK) { party[0].maxHp += 5000; party[0].hp += 5000; }
  const combat = generateCombatMap(loc, floor, rng, {});
  spawnEncounter(combat, party, floor, rng, { boss: floorIsBoss(floor) });
  runBattle(combat);
  if (combat.won) wins++;
  else losses++;
  const alive = alivePlayers(combat).length;
  const enemiesLeft = aliveEnemies(combat).length;
  const logTail = combat.log.slice(-2).join(' | ');
  console.log(`battle ${String(battle).padStart(2)}: ${combat.won ? 'WIN ' : 'LOSS'} floor=${floor} ${locId} rounds=${combat.round} playersAlive=${alive} enemiesLeft=${enemiesLeft} | ${logTail}`);
}
console.log(`\n${wins} wins / ${losses} losses out of ${N}`);
if (wins + losses !== N) { console.log('ERROR: some battles did not terminate'); process.exit(1); }
if (wins === 0) { console.log('ERROR: zero wins — engine likely broken'); process.exit(1); }
console.log('OK: engine terminates and wins battles.');
