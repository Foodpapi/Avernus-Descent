// Turn-based 5e grid combat. 1 tile = 5 ft.
// Topographical depth: elevation (high ground), cover objects, hazards
// (fire/lava/water/darkness/brambles/grease), and LOS blockers.

import { mod, computeAc, computeSpeed, weaponDiceFor, weaponStatFor, attackBonusFor, isProficientWithWeapon, sneakAttackDice, isFinesseOrRanged, savingThrowMod, buildMonster, rollMonsterHp, monsterMod, hasFeat, passivePerception } from './rules.js';
import { WEAPONS, FISTS, ARMORS, ENCHANTMENTS, CONSUMABLES } from '../data/items.js';
import { SPELL_MAP, cantripDmg } from '../data/spells.js';
import { MONSTERS, ELITE_TRAITS, xpForCr } from '../data/monsters.js';
import { LOCATION_MAP, OBSTACLES, obstacleBlocksProjectile } from '../data/locations.js';
import { RACE_MAP } from '../data/races.js';
import { clamp, uid } from '../rng.js';

export const DMG_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];

// Floating combat text: the UI renders these as rising, fading numbers.
export function pushPopup(combat, x, y, data) {
  if (!combat.popups) combat.popups = [];
  const t = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  combat.popups.push({ x, y, born: t, dur: 1100, jx: Math.round(Math.random() * 16 - 8), ...data });
  if (combat.popups.length > 80) combat.popups.splice(0, combat.popups.length - 80);
}

// Spell visual effects: the UI renders these (beams, projectiles, rings…).
export function pushFx(combat, fx) {
  if (!combat.fx) combat.fx = [];
  fx.born = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  combat.fx.push(fx);
  if (combat.fx.length > 80) combat.fx.splice(0, combat.fx.length - 80);
}

// ============================== UNIT ==============================
export function makeUnit(char, team, x, y) {
  return {
    id: char.id,
    name: char.name,
    team, // 'player' | 'enemy'
    char, // reference to character sheet
    x, y,
    hp: char.hp, maxHp: char.maxHp, tempHp: char.tempHp || 0,
    statuses: [], // battle conditions [{id, name, rounds, source, data}]
    concentration: null, // {spellId, sourceUnitId, data}
    dead: false, deathRound: null,
    // Action economy: iterative integer points, refreshed each turn.
    // Classes/abilities/items can add more (Action Surge +1, Haste +1,
    // Thief's Fast Hands grants a second bonus point...).
    actionPoints: 1,
    bonusPoints: 1,
    reactionUsed: false,
    moveRemaining: 0,
    dodging: false,
    hidden: false,
    invisibleRounds: 0,
    // feat state (per-turn counters refreshed each turn)
    gwmOn: false, ssOn: false, pamAttack: false,
    movedTiles: 0, attackedThisTurn: [],
    chargerUsed: false, piercerUsed: false, savageUsed: false, crusherUsed: false, slasherUsed: false,
    initiative: 0,
    ai: null,
    overboardRounds: 0,
    wildShaped: false,
    sprite: char.sprite || null,
  };
}

// ---- Action economy helpers ----
export function hasAction(u) { return u.actionPoints > 0; }
export function hasBonus(u) { return u.bonusPoints > 0; }
export function spendAction(u) {
  if (u.actionPoints > 0) u.actionPoints -= 1;
  return u.actionPoints;
}
export function spendBonus(u) {
  if (u.bonusPoints > 0) u.bonusPoints -= 1;
  return u.bonusPoints;
}

export function unitAt(combat, x, y) {
  return combat.units.find(u => !u.dead && !u.overboard && u.x === x && u.y === y);
}

export function getStatus(u, id) { return u.statuses.find(s => s.id === id); }
export function addStatus(u, id, name, rounds, data) {
  const ex = getStatus(u, id);
  if (ex) { ex.rounds = Math.max(ex.rounds, rounds); if (data) Object.assign(ex, { data }); return ex; }
  const s = { id, name, rounds, data };
  u.statuses.push(s);
  return s;
}
export function removeStatus(u, id) { u.statuses = u.statuses.filter(s => s.id !== id); }

export function unitAc(u, combat, vsRanged = false, attacker = null, opts = null) {
  const char = u.char;
  let ac;
  if (u.wildShaped && u.form) {
    ac = u.form.ac; // beast form hide
  } else if (char.stats) {
    // monster stat block
    ac = (char.ac || 10) + (char.acBonus || 0);
    if (char.powers && char.powers.includes('parry')) ac += 2;
  } else {
    ac = computeAc(char, combat);
  }
  const cover = coverFor(u, combat, attacker, vsRanged, opts);
  ac += cover;
  if (u.dodging) ac += 5; // disadvantage instead, but +5 approximates Dodge for AI math
  return ac;
}

export function elevationAt(combat, x, y) {
  const t = combat.grid[y] && combat.grid[y][x];
  return t ? (t.elevation || 0) : 0;
}

export function inBounds(combat, x, y) {
  return x >= 0 && y >= 0 && x < combat.w && y < combat.h;
}

export function isPassable(combat, x, y) {
  if (!inBounds(combat, x, y)) return false;
  const t = combat.grid[y][x];
  if (!t) return false;
  if (t.obstacle && OBSTACLES[t.obstacle].solid) return false;
  if (t.obstacle && t.obstacle.startsWith('wall')) return false;
  if (combat.effects.some(e => e.type === 'wall' && e.x === x && e.y === y)) return false;
  if (unitAt(combat, x, y)) return false;
  if (t.hazard === 'water' || t.hazard === 'lava') return false; // impassable
  return true;
}

export function moveCost(combat, x, y, fromElevation = 0) {
  const t = combat.grid[y][x];
  let cost = 1;
  if (t.obstacle) {
    const ob = OBSTACLES[t.obstacle];
    if (ob && ob.difficult) cost = 2;
  }
  const elev = t.elevation || 0;
  cost += Math.max(0, elev - fromElevation) * 2;
  if (t.hazard === 'brambles' || t.hazard === 'grease' || t.hazard === 'fire') cost += 1;
  return cost;
}

// BFS path with movement points
export function findPath(combat, u, tx, ty, maxCost) {
  const start = { x: u.x, y: u.y };
  if (!isPassable(combat, tx, ty)) {
    // allow moving onto a dead enemy's tile or into melee target tile (occupied)
    const occ = unitAt(combat, tx, ty);
    if (!occ) return null;
  }
  const key = (x, y) => y * combat.w + x;
  const dist = new Map();
  const prev = new Map();
  const pq = [];
  const push = (x, y, d, px, py) => {
    const k = key(x, y);
    if (dist.has(k) && dist.get(k) <= d) return;
    dist.set(k, d);
    prev.set(k, { x: px, y: py });
    pq.push({ x, y, d });
  };
  push(start.x, start.y, 0, start.x, start.y);
  const startElev = elevationAt(combat, start.x, start.y);
  while (pq.length) {
    pq.sort((a, b) => a.d - b.d);
    const cur = pq.shift();
    if (cur.x === tx && cur.y === ty) break;
    const ce = elevationAt(combat, cur.x, cur.y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!inBounds(combat, nx, ny)) continue;
      const blocked = !isPassable(combat, nx, ny);
      if (blocked) continue;
      const cost = moveCost(combat, nx, ny, ce);
      push(nx, ny, cur.d + cost, cur.x, cur.y);
    }
  }
  if (!dist.has(key(tx, ty))) return null;
  // rebuild full path
  const full = [];
  let cx = tx, cy = ty;
  let guard = 0;
  while (!(cx === start.x && cy === start.y) && guard++ < 500) {
    full.push({ x: cx, y: cy });
    const p = prev.get(key(cx, cy));
    if (!p) return null;
    cx = p.x; cy = p.y;
  }
  full.reverse();
  // clip to available movement (return partial path)
  let total = 0;
  let ex = start.x, ey = start.y;
  const path = [];
  for (const step of full) {
    const cost = moveCost(combat, step.x, step.y, elevationAt(combat, ex, ey));
    if (total + cost > maxCost) break;
    total += cost;
    path.push(step);
    ex = step.x; ey = step.y;
  }
  if (!path.length) return null;
  return { path, cost: total };
}

// ============================== LINE OF SIGHT ==============================
export function hasLOS(combat, x0, y0, x1, y1) {
  if (x0 === x1 && y0 === y1) return true;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  while (true) {
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    let nx = x, ny = y;
    if (e2 > -dy) { err -= dy; nx = x + sx; }
    if (e2 < dx) { err += dx; ny = y + sy; }
    x = nx; y = ny;
    if (!inBounds(combat, x, y)) return false;
    const t = combat.grid[y][x];
    if (t.obstacle) {
      const ob = OBSTACLES[t.obstacle];
      if (ob && ob.tall) return false;
    }
    const elev = t.elevation || 0;
    const elevHere = elevationAt(combat, x0, y0);
    // elevation blocks LOS to lower ground on the far side (cliffs)
    if (elev > elevHere + 0) {
      // you can see onto higher ground, but not over a tall cliff from below
      const targetElev = elevationAt(combat, x1, y1);
      if (elev > Math.max(elevHere, targetElev)) return false;
    }
    if (combat.effects.some(e => e.type === 'wall' && e.x === x && e.y === y)) return false;
    if (t.smokeRounds > 0 && Math.max(Math.abs(x - x0), Math.abs(y - y0)) > 0) return false;
  }
}

// Copy catalog HP onto a map tile so objects can be damaged in combat.
export function stampObstacleHp(tile) {
  if (!tile || !tile.obstacle) return tile;
  const ob = OBSTACLES[tile.obstacle];
  if (!ob || ob.hp == null) return tile;
  if (tile.maxHp == null) tile.maxHp = ob.hp;
  if (tile.hp == null) tile.hp = tile.maxHp;
  return tile;
}

// Bresenham line matching the UI ray preview: exclude start, include dest.
export function traceLine(x0, y0, x1, y1) {
  const tiles = [];
  if (x0 === x1 && y0 === y1) return tiles;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  let guard = 0;
  while ((x !== x1 || y !== y1) && guard++ < 100) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    tiles.push({ x, y });
  }
  return tiles;
}

// First living creature or projectile-blocking object on the flight path.
// `early` is true when the blocker is not the destination tile.
export function firstProjectileBlocker(combat, x0, y0, x1, y1) {
  const tiles = traceLine(x0, y0, x1, y1);
  for (const step of tiles) {
    const { x, y } = step;
    const early = !(x === x1 && y === y1);
    const u = unitAt(combat, x, y);
    if (u) return { kind: 'unit', early, x, y, name: u.name, unit: u };
    if (combat.effects && combat.effects.some(e => (e.type === 'stone_wall' || e.type === 'wall') && e.x === x && e.y === y)) {
      return { kind: 'block', early, x, y, name: 'Wall of Stone' };
    }
    const t = combat.grid[y] && combat.grid[y][x];
    if (t && t.obstacle) {
      const ob = OBSTACLES[t.obstacle];
      if (obstacleBlocksProjectile(ob)) {
        const destructible = (t.maxHp != null) || (ob && ob.hp);
        if (destructible) {
          if (t.maxHp == null) stampObstacleHp(t);
          return { kind: 'object', early, x, y, name: ob.name, tile: t, ob };
        }
        return { kind: 'block', early, x, y, name: (ob && ob.name) || t.obstacle, tile: t, ob };
      }
    }
  }
  return { kind: 'clear', early: false, x: x1, y: y1 };
}

export function canSee(combat, u, tx, ty) {
  return observerCanSeeTile(combat, u, tx, ty);
}

function hasDarkvision(u) {
  if (!u || !u.char) return false;
  if (u.char.darkvision) return true;
  if (u.char.race && u.char.race.darkvision) return true;
  if (u.char.raceId && RACE_MAP[u.char.raceId] && RACE_MAP[u.char.raceId].darkvision) return true;
  return false;
}

// 5e: you can't see through magical darkness / heavy smoke, and a blinded
// creature sees nothing. Vision range is already stored on the unit.
export function observerCanSeeTile(combat, observer, tx, ty) {
  if (!observer || observer.dead || observer.overboard || observer.hp <= 0) return false;
  if (getStatus(observer, 'blinded')) return false;
  const vis = observer.vision || 8;
  const d = Math.abs(observer.x - tx) + Math.abs(observer.y - ty);
  if (d > vis) return false;
  if (!inBounds(combat, tx, ty)) return false;
  const t = combat.grid[ty] && combat.grid[ty][tx];
  if (t && t.smokeRounds > 0 && d > 0) return false;
  if (combat.effects && combat.effects.some(e => {
    if (e.type !== 'fog' && e.type !== 'darkness') return false;
    return Math.max(Math.abs(e.x - tx), Math.abs(e.y - ty)) <= (e.r || 0);
  })) {
    // Fog / magical darkness = heavily obscured. Darkvision pierces fog, not magical darkness.
    const inDark = combat.effects.some(e => e.type === 'darkness' && Math.max(Math.abs(e.x - tx), Math.abs(e.y - ty)) <= (e.r || 0));
    if (inDark || !hasDarkvision(observer)) return false;
  }
  return hasLOS(combat, observer.x, observer.y, tx, ty);
}

// 5e: an invisible creature can't be seen; otherwise this is "can you see them clearly?"
export function canSeeUnit(combat, observer, target) {
  if (!target || target.dead || target.overboard) return false;
  if (getStatus(target, 'invisible')) return false;
  return observerCanSeeTile(combat, observer, target.x, target.y);
}

export const SIZE_RANK = { tiny: 0, small: 1, medium: 2, large: 3, huge: 4, gargantuan: 5 };
export const HEARING_RANGE = 12; // 60 ft

export function sizeRank(size) {
  return SIZE_RANK[String(size || 'Medium').toLowerCase()] ?? 2;
}

export function unitSize(u) {
  if (!u) return 'Medium';
  if (u.form && u.form.size) return u.form.size;
  const c = u.char;
  if (!c) return 'Medium';
  if (c.size) return c.size;
  if (c.race && c.race.size) return c.race.size;
  return 'Medium';
}

export function hasNaturallyStealthy(u) {
  const c = u && u.char;
  if (!c) return false;
  if (c.naturallyStealthy) return true;
  if (c.race && c.race.naturallyStealthy) return true;
  return c.raceId === 'halfling';
}

export function hasMaskOfTheWild(u) {
  const c = u && u.char;
  if (!c) return false;
  if (c.maskOfTheWild) return true;
  if (c.race && c.race.maskOfTheWild) return true;
  return c.raceId === 'wood_elf';
}

export function isObscuredByLargerCreature(combat, hider, observer) {
  if (!combat || !hider) return false;
  const need = sizeRank(unitSize(hider)) + 1;
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const dHO = observer ? dist(hider, observer) : 99;
  for (const c of combat.units) {
    if (c === hider || c === observer) continue;
    if (c.dead || c.overboard || c.hp <= 0) continue;
    if (Math.max(Math.abs(c.x - hider.x), Math.abs(c.y - hider.y)) !== 1) continue;
    if (sizeRank(unitSize(c)) < need) continue;
    if (!observer || dist(c, observer) <= dHO) return true;
  }
  return false;
}

export function isLightlyObscuredByNature(combat, u) {
  if (!combat || !u) return false;
  const naturalHere = (t) => {
    if (!t) return false;
    if (t.hazard === 'brambles') return true;
    if (t.obstacle && OBSTACLES[t.obstacle] && OBSTACLES[t.obstacle].natural) return true;
    if (t.smokeRounds > 0) return true;
    return false;
  };
  const here = combat.grid[u.y] && combat.grid[u.y][u.x];
  if (naturalHere(here)) return true;
  if (combat.effects) {
    for (const e of combat.effects) {
      if (e.type !== 'fog' && e.type !== 'smoke') continue;
      if (Math.max(Math.abs((e.x || 0) - u.x), Math.abs((e.y || 0) - u.y)) <= (e.r || 0)) return true;
    }
  }
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = u.x + dx, ny = u.y + dy;
    if (!inBounds(combat, nx, ny)) continue;
    if (naturalHere(combat.grid[ny][nx])) return true;
  }
  return false;
}

// 5e: you can't hide from a creature that can see you *clearly*. Racial
// exceptions (Naturally Stealthy / Mask of the Wild) mean the observer
// does not see you clearly even if they have LOS.
export function seesClearly(combat, observer, target) {
  if (!canSeeUnit(combat, observer, target)) return false;
  if (hasNaturallyStealthy(target) && isObscuredByLargerCreature(combat, target, observer)) return false;
  if (hasMaskOfTheWild(target) && isLightlyObscuredByNature(combat, target)) return false;
  return true;
}

export function whoCanSee(combat, unit) {
  if (!unit) return [];
  const foes = unit.team === 'player' ? 'enemy' : 'player';
  return combat.units.filter(o => o.team === foes && !o.dead && o.hp > 0 && !o.overboard && seesClearly(combat, o, unit));
}

export function isClearlySeen(combat, unit) {
  return whoCanSee(combat, unit).length > 0;
}

export function isHiddenUnit(u) {
  return !!(u && (u.hidden || (u.statuses || []).some(s => s.id === 'hidden')));
}

// Tiles to paint while a player is Hidden: every living enemy's visual cone,
// clipped to the map the party has already discovered (so ducking behind a
// wall does not erase the overlay — that was the v=44 planning tool).
export function sightOverlayTiles(combat) {
  const out = [];
  const seen = new Set();
  if (!combat || !combat.units) return out;
  for (const e of combat.units) {
    if (e.team !== 'enemy' || e.dead || e.overboard || e.hp <= 0) continue;
    for (const t of tilesSeenBy(combat, e)) {
      const tile = combat.grid[t.y] && combat.grid[t.y][t.x];
      if (!combat.revealed && tile && !tile.discovered && !tile.visible) continue;
      const k = t.y * combat.w + t.x;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ x: t.x, y: t.y });
    }
  }
  return out;
}

export function canHear(combat, observer, target) {
  if (!observer || !target) return false;
  if (observer.dead || observer.overboard || observer.hp <= 0) return false;
  if (getStatus(observer, 'deafened')) return false;
  const d = Math.abs(observer.x - target.x) + Math.abs(observer.y - target.y);
  if (d > HEARING_RANGE) return false;
  if (target.stealthScore == null) return false;
  // Hide DC = Passive Perception. Stealth >= PP stays hidden; PP > Stealth hears you.
  return passivePerception(observer) > target.stealthScore;
}

export function whoCanHear(combat, unit) {
  if (!unit || unit.stealthScore == null) return [];
  const foes = unit.team === 'player' ? 'enemy' : 'player';
  return combat.units.filter(o => o.team === foes && canHear(combat, o, unit));
}

export function tilesSeenBy(combat, observer) {
  const out = [];
  if (!observer) return out;
  const vis = observer.vision || 8;
  for (let y = Math.max(0, observer.y - vis); y <= Math.min(combat.h - 1, observer.y + vis); y++) {
    for (let x = Math.max(0, observer.x - vis); x <= Math.min(combat.w - 1, observer.x + vis); x++) {
      if (observerCanSeeTile(combat, observer, x, y)) out.push({ x, y });
    }
  }
  return out;
}

// find any unit (including dead/overboard) at a position
export function unitAtAny(combat, x, y) {
  return combat.units.find(u => u.x === x && u.y === y && !u.overboard);
}

// ============================== COVER ==============================
export function coverFor(defender, combat, attacker, vsRanged, opts = null) {
  if (opts && opts.ignoreCover) return 0; // Spell Sniper etc.
  if (!vsRanged || !attacker) return 0;
  // high ground vs lower attacker
  const de = elevationAt(combat, defender.x, defender.y);
  const ae = elevationAt(combat, attacker.x, attacker.y);
  let cover = 0;
  if (de > ae) cover += 2;
  // low cover objects adjacent to defender
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = defender.x + dx, ny = defender.y + dy;
    if (!inBounds(combat, nx, ny)) continue;
    const t = combat.grid[ny][nx];
    if (t.obstacle) {
      const ob = OBSTACLES[t.obstacle];
      if (ob && ob.cover && !ob.solid) {
        // obstacle between attacker and defender?
        const between = isBetween(attacker, defender, nx, ny);
        // attacker adjacent to the obstacle? then no cover
        const attAdj = Math.abs(attacker.x - nx) <= 1 && Math.abs(attacker.y - ny) <= 1;
        if (between && !attAdj) cover = Math.max(cover, ob.cover);
      }
    }
    // solid low obstacle also gives cover if LOS passes over it (low walls)
    if (t.obstacle) {
      const ob = OBSTACLES[t.obstacle];
      if (ob && ob.solid && !ob.tall) {
        const between = isBetween(attacker, defender, nx, ny);
        if (between) cover = Math.max(cover, 2);
      }
    }
  }
  // smoke gives cover
  if (combat.effects.some(e => e.type === 'smoke' && Math.abs(e.x - defender.x) <= e.r && Math.abs(e.y - defender.y) <= e.r)) cover += 2;
  return Math.min(cover, 5);
}

function isBetween(attacker, defender, tx, ty) {
  const minX = Math.min(attacker.x, defender.x), maxX = Math.max(attacker.x, defender.x);
  const minY = Math.min(attacker.y, defender.y), maxY = Math.max(attacker.y, defender.y);
  return tx >= minX && tx <= maxX && ty >= minY && ty <= maxY;
}

// ============================== DICE ==============================
export function roll(rng, dice, bonus = 0) {
  // dice: '2d6+3' or '2d8+4d6'
  let total = bonus;
  const parts = dice.split('+');
  for (let part of parts) {
    part = part.trim();
    const m = part.match(/^(\d*)d(\d+)$/);
    if (m) {
      const n = m[1] ? Number(m[1]) : 1;
      const d = Number(m[2]);
      for (let i = 0; i < n; i++) total += rng.int(1, d);
    } else if (/^\d+$/.test(part)) {
      total += Number(part);
    }
  }
  return total;
}

export function d20(rng) { return rng.int(1, 20); }

// advantage/disadvantage resolution
export function attackRoll(rng, combat, u, target, bonus, opts = {}) {
  let adv = false, dis = false;
  const s = u.statuses;
  if (opts.advantage || s.some(st => st.id === 'hidden' || st.id === 'invisible')) adv = true;
  if (target && target.statuses.some(st => st.id === 'prone') && opts.melee) adv = true;
  if (target && target.statuses.some(st => st.id === 'restrained' || st.id === 'paralyzed' || st.id === 'stunned' || st.id === 'unconscious' || st.id === 'faerie_fired')) adv = true;
  if (target && getStatus(target, 'guiding')) adv = true;
  if (opts.reckless) adv = true;
  if (opts.vow) adv = true;
  if (opts.assassin && target && !target.hasActedThisCombat) adv = true;
  if (opts.pack && target) adv = true;
  if (target && target.dodging) dis = true;
  if (target && target.statuses.some(st => st.id === 'invisible') && !s.some(st => st.id === 'invisible')) dis = true;
  if (s.some(st => st.id === 'poisoned')) dis = true;
  if (s.some(st => st.id === 'frightened')) dis = true;
  if (s.some(st => st.id === 'mocked')) { dis = true; }
  if (opts.disadvantage) dis = true;
  if (opts.rangedInMelee) dis = true;
  if (opts.obscured) dis = true;
  if (opts.bane) dis = true;
  if (opts.bless) adv = false; // handled as die below

  let result = d20(rng);
  let second = null;
  if (adv && !dis) { const a = d20(rng), b = d20(rng); result = Math.max(a, b); second = Math.min(a, b); }
  else if (dis && !adv) { const a = d20(rng), b = d20(rng); result = Math.min(a, b); second = Math.max(a, b); }

  // Halfling Lucky: reroll nat 1 once
  if (u.char && u.char.raceId === 'halfling' && result === 1) result = d20(rng);
  // Lucky feat: poor natural rolls automatically reroll (3 points per floor)
  if (u.char && hasFeat(u.char, 'lucky') && u.char.resources && u.char.resources.luck && u.char.resources.luck.cur > 0 && result <= 10) {
    u.char.resources.luck.cur--;
    result = Math.max(result, d20(rng));
  }

  const rolls = { result, natural: result, bonus, blessed: 0, baned: 0, crit: false, fumble: false };
  if (opts.blessDie) rolls.blessed = rng.int(1, 4);
  if (opts.baneDie) rolls.baned = rng.int(1, 4);
  if (result === 20) rolls.crit = true;
  if (result === 1) rolls.fumble = true;
  return rolls;
}

// ============================== MAP GENERATION ==============================
export function generateCombatMap(loc, floor, rng, opts = {}) {
  const w = 18, h = 12;
  const grid = [];
  for (let y = 0; y < h; y++) {
    grid.push([]);
    for (let x = 0; x < w; x++) {
      grid[y].push({
        ground: rng.pick(loc.ground),
        obstacle: null, elevation: 0, hazard: null,
        visible: false, discovered: false, smokeRounds: 0,
        fx: null,
      });
    }
  }
  // walls (tall)
  for (let x = 0; x < w; x++) { grid[0][x].obstacle = 'wall'; grid[h - 1][x].obstacle = 'wall'; }
  for (let y = 0; y < h; y++) { grid[y][0].obstacle = 'wall'; grid[y][w - 1].obstacle = 'wall'; }

  // scatter obstacles
  const obstacleIds = loc.obstacles || ['rock', 'boulder'];
  const nObs = rng.int(6, 10) + Math.floor(floor / 3);
  for (let i = 0; i < nObs; i++) {
    const x = rng.int(2, w - 3), y = rng.int(2, h - 3);
    if (grid[y][x].obstacle) continue;
    if ((x < 5 && y < 4) || (x > w - 6 && y > h - 5)) continue; // keep spawn corners clear
    const ob = rng.pick(obstacleIds);
    grid[y][x].obstacle = ob;
    stampObstacleHp(grid[y][x]);
  }

  // elevation plateaus
  const plateaus = rng.int(1, 2 + (floor > 2 ? 1 : 0));
  for (let p = 0; p < plateaus; p++) {
    const px = rng.int(4, w - 8), py = rng.int(2, h - 6);
    const pw = rng.int(3, 5), ph = rng.int(2, 3);
    const elev = rng.chance(0.5) ? 1 : 2;
    for (let y = py; y < py + ph && y < h - 2; y++) {
      for (let x = px; x < px + pw && x < w - 2; x++) {
        if (grid[y][x].obstacle) continue;
        const border = x === px || y === py || x === px + pw - 1 || y === py + ph - 1;
        grid[y][x].elevation = elev;
        // cliff tiles on the rim for visual (walkable)
        if (border && rng.chance(0.8)) grid[y][x].obstacle = `cliff_${elev}`;
      }
    }
    // ensure ramp: make one rim tile same elevation as neighbor (slope)
  }

  // hazards
  const hazard = loc.hazard;
  if (hazard === 'lava' || hazard === 'water') {
    const pools = rng.int(1, 2);
    for (let i = 0; i < pools; i++) {
      const px = rng.int(3, w - 7), py = rng.int(2, h - 5);
      const pw = rng.int(3, 4), ph = rng.int(2, 3);
      for (let y = py; y < py + ph && y < h - 1; y++)
        for (let x = px; x < px + pw && x < w - 1; x++)
          if (!grid[y][x].obstacle && grid[y][x].elevation === 0) grid[y][x].hazard = hazard;
    }
  } else if (hazard === 'fire') {
    const n = rng.int(3, 6);
    for (let i = 0; i < n; i++) {
      const x = rng.int(3, w - 4), y = rng.int(2, h - 3);
      if (!grid[y][x].obstacle && grid[y][x].elevation === 0) grid[y][x].hazard = 'fire';
    }
  } else if (hazard === 'brambles') {
    const n = rng.int(4, 8);
    for (let i = 0; i < n; i++) {
      const x = rng.int(3, w - 4), y = rng.int(2, h - 3);
      if (!grid[y][x].obstacle && grid[y][x].elevation === 0) grid[y][x].hazard = 'brambles';
    }
  } else if (hazard === 'grease') {
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const x = rng.int(3, w - 4), y = rng.int(2, h - 3);
      if (!grid[y][x].obstacle && grid[y][x].elevation === 0) grid[y][x].hazard = 'grease';
    }
  }

  const combat = {
    id: uid(), locId: loc.id, loc, floor, rng, w, h, grid,
    units: [], effects: [], round: 0, turnIndex: 0, order: [],
    log: [], over: false, won: false, revealed: !!opts.revealed,
    popups: [], // floating damage/heal numbers rendered by the UI
    fx: [],     // spell visual effects (beams, rings, projectiles…)
    darkness: hazard === 'darkness',
    surprise: !!opts.surprise,
    firstRound: true,
    loot: [], gold: 0, xp: 0,
  };
  return combat;
}

export function updateVision(combat) {
  for (let y = 0; y < combat.h; y++)
    for (let x = 0; x < combat.w; x++) {
      const t = combat.grid[y][x];
      t.visible = false;
      if (t.discovered || combat.revealed) { /* stays discovered */ }
    }
  for (const u of combat.units) {
    if (u.dead || u.overboard) continue;
    if (u.team !== 'player') continue;
    const vis = u.char && u.char.raceId && RACE_MAP[u.char.raceId].darkvision ? 8 : u.vision;
    for (let y = Math.max(0, u.y - vis); y <= Math.min(combat.h - 1, u.y + vis); y++)
      for (let x = Math.max(0, u.x - vis); x <= Math.min(combat.w - 1, u.x + vis); x++) {
        const d = Math.abs(u.x - x) + Math.abs(u.y - y);
        if (d > vis) continue;
        const t = combat.grid[y][x];
        t.discovered = true;
        if (hasLOS(combat, u.x, u.y, x, y)) t.visible = true;
      }
  }
  // enemies visible only if on visible tiles
}

export function enemyVisible(combat, u) {
  return combat.grid[u.y] && combat.grid[u.y][u.x] && combat.grid[u.y][u.x].visible;
}

// ============================== ENCOUNTER BUILDING ==============================
export function spawnEncounter(combat, party, floor, rng, opts = {}) {
  const units = [];
  // players
  const sx = 2, sy0 = Math.floor(combat.h / 2) - Math.floor(party.length / 2);
  party.forEach((char, i) => {
    if (char.dead) return;
    const u = makeUnit(char, 'player', sx, sy0 + i);
    u.vision = char.race && char.race.darkvision ? 12 : (combat.darkness ? 4 : 8);
    units.push(u);
  });

  // enemies
  const count = clamp(2 + Math.floor(floor / 3), 2, 5) + (opts.extraEnemies || 0);
  const tier = Math.min(4, 1 + Math.floor(floor / 3));
  const isBoss = opts.boss;
  let pool = combat.loc.monsters[tier] || combat.loc.monsters[4];
  if (isBoss && combat.loc.bossPool) {
    // bosses scale with floor: cap CR so floor 3 isn't a Beholder
    const crCap = 1.5 * floor - 1;
    const candidates = combat.loc.bossPool.map(id => MONSTERS[id]).filter(m => m.cr <= crCap);
    pool = candidates.length ? candidates.map(m => m.id) : combat.loc.bossPool;
  }

  const enemies = [];
  const n = isBoss ? clamp(2 + Math.floor(floor / 3), 2, 4) : count;
  for (let i = 0; i < n; i++) {
    const tpl = MONSTERS[rng.pick(pool)];
    const elite = isBoss ? rng.pick(ELITE_TRAITS) : (floor > 4 && rng.chance(0.2 + floor * 0.02) ? rng.pick(ELITE_TRAITS) : null);
    const m = buildMonster(tpl, elite);
    rollMonsterHp(m, rng);
    enemies.push(m);
  }
  if (isBoss) {
    const boss = enemies[0];
    boss.maxHp = Math.round(boss.maxHp * 1.5);
    boss.hp = boss.maxHp;
    boss.boss = true;
  }
  // place enemies on right side
  const ex = combat.w - 3, ey0 = Math.floor(combat.h / 2) - Math.floor(enemies.length / 2);
  enemies.forEach((m, i) => {
    let x = ex, y = ey0 + i;
    if (y < 1) y = 1; if (y > combat.h - 2) y = combat.h - 2;
    while (unitAt(combat, x, y) || !isPassable(combat, x, y)) { y += 1; if (y > combat.h - 2) { y = 1; x -= 1; } if (x < combat.w - 6) break; }
    const u = makeUnit(m, 'enemy', x, y);
    u.vision = m.darkvision ? 12 : 8;
    u.hasActedThisCombat = false;
    u.ai = { breathUsed: false, fearUsed: false, targetedId: null };
    units.push(u);
  });

  combat.units = units;

  // initiative
  for (const u of units) {
    const dex = u.char.stats ? u.char.stats.DEX : u.char.abilities.DEX;
    const iniBonus = (opts.initiativeBonus || 0);
    const townInit = (u.team === 'player' && u.char.townBuffs) ? u.char.townBuffs.reduce((s2, b) => s2 + (b.kind === 'initiative' ? (b.value || 0) : 0), 0) : 0;
    const alertBonus = (u.team === 'player' && u.char && hasFeat(u.char, 'alert')) ? 5 : 0;
    u.initiative = d20(rng) + mod(dex) + iniBonus + townInit + alertBonus + (u.team === 'player' ? 0 : 0);
    if (u.char.id && opts.alertBonus) u.initiative += opts.alertBonus;
    u.hasActedThisCombat = false;
  }
  units.sort((a, b) => b.initiative - a.initiative || (a.team === 'player' ? -1 : 1));
  combat.order = units.map(u => u.id);
  combat.turnIndex = 0;
  combat.round = 1;
  combat.over = false;
  combat.won = false;
  combat.firstRound = true;
  combat.surprise = !!opts.surprise;

  for (const u of units) startOfTurnReset(combat, u);
  updateVision(combat);

  // surprise round: enemies act, players skip
  if (combat.surprise) {
    combat.log.push('AMBUSH! The enemy catches you off guard — they act first!');
  }
  return combat;
}

export function startOfTurnReset(combat, u) {
  u.reactionUsed = false;
  u.dodging = false;
  u.martialArts = false; // monk: refreshed each turn
  u.pamAttack = false;
  u.movedTiles = 0;
  u.attackedThisTurn = [];
  u.chargerUsed = false; u.piercerUsed = false; u.savageUsed = false;
  u.crusherUsed = false; u.slasherUsed = false;
  // movement
  let speed = computeSpeed(u.char);
  u.moveRemaining = speed;
  const haste = u.statuses.find(s => s.id === 'hasted');
  if (haste) u.moveRemaining += speed; // Haste doubles movement
  if (u.char.stats) u.moveRemaining = Math.max(1, Math.round((u.char.speed || 30) / 5) + (u.char.speedBonus || 0)); // monsters: speed in ft
  // action economy: integers, so abilities can add points
  u.actionPoints = 1;
  if (haste) u.actionPoints += 1; // Haste: one extra action per turn
  const c = u.char;
  if (!c.stats && c.cls && c.cls.id === 'rogue' && c.subclassId === 'thief' && c.level >= 3) {
    u.bonusPoints = 2; // Fast Hands: a second bonus action
  } else {
    u.bonusPoints = 1;
  }
}

export function currentUnit(combat) {
  return combat.units.find(u => u.id === combat.order[combat.turnIndex] && !u.dead) ||
    combat.units.find(u => u.id === combat.order[combat.turnIndex]);
}

export function aliveEnemies(combat) { return combat.units.filter(u => u.team === 'enemy' && !u.dead); }
export function alivePlayers(combat) { return combat.units.filter(u => u.team === 'player' && !u.dead); }
export function livingPlayers(combat) { return alivePlayers(combat).filter(u => u.hp > 0 || !u.dead); }
