// Enemy AI: picks sensible 5e-ish actions — use special powers when they
// line up, attack the best target, move with terrain in mind, dash when
// needed, and avoid walking into obvious hazards.

import { mod, computeSpeed, canCastSpell, hasFeat } from './rules.js';
import { unitAt, getStatus, addStatus, hasLOS, isPassable, findPath, alivePlayers, inBounds, elevationAt, moveCost, canSee, firstProjectileBlocker } from './combat.js';
import { WEAPONS } from '../data/items.js';
import { SPELL_MAP } from '../data/spells.js';
import { log, tickStatuses } from './combat_actions.js';
import { performAction } from './turn.js';

export function chooseEnemyAction(combat, u) {
  const rng = combat.rng;
  const players = alivePlayers(combat).filter(p => !p.dead && p.hp > 0);
  if (!players.length) return { type: 'wait' };
  const m = u.char;

  // Frightened: flee from source
  const frightened = getStatus(u, 'frightened');
  if (frightened && frightened.data) {
    const src = combat.units.find(x => x.id === frightened.data);
    if (src && !src.dead) {
      return { type: 'flee', from: { x: src.x, y: src.y }, power: 'flee' };
    }
  }

  // Charmed: skip turn
  if (getStatus(u, 'charmed')) return { type: 'wait' };

  const visiblePlayers = players.filter(p => canSee(combat, u, p.x, p.y));
  const visibleOrNot = visiblePlayers.length ? visiblePlayers : players;

  // pick primary target: lowest HP among closest
  let target = null, bestScore = -Infinity;
  for (const p of visibleOrNot) {
    const d = Math.max(Math.abs(p.x - u.x), Math.abs(p.y - u.y));
    let score = -d * 10 + (p.maxHp - p.hp) * 2.5;
    if (p.char.hero) score += 2; // heroes draw attention, but not always
    if (p.hp <= 0) score -= 1000;
    if (score > bestScore) { bestScore = score; target = p; }
  }
  if (!target) return { type: 'wait' };

  const distToTarget = Math.max(Math.abs(target.x - u.x), Math.abs(target.y - u.y));

  // ---- Powers that dominate action choice ----
  if (m.powers) {
    // Breath weapons when 2+ players are in a cone
    if ((m.powers.includes('fire_breath') || m.powers.includes('acid_breath')) && !u.ai?.breathUsed) {
      for (const dir of [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
        const hit = players.filter(p => {
          const dx = p.x - u.x, dy = p.y - u.y;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          if (d > 3 || d === 0) return false;
          if (dir.dx !== 0) return Math.sign(dx) === dir.dx && Math.abs(dy) <= 1 + Math.floor(Math.abs(dx) / 2);
          return Math.sign(dy) === dir.dy && Math.abs(dx) <= 1 + Math.floor(Math.abs(dy) / 2);
        });
        if (hit.length >= 2 || (hit.length >= 1 && u.hp < u.maxHp / 2)) {
          return { type: 'power', power: m.powers.includes('fire_breath') ? 'fire_breath' : 'acid_breath', direction: dir, targetId: target.id };
        }
      }
    }
    // Mind blast
    if (m.powers.includes('mind_blast') && !u.ai?.blastUsed) {
      for (const dir of [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
        const hit = players.filter(p => {
          const dx = p.x - u.x, dy = p.y - u.y;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          if (d > 3 || d === 0) return false;
          if (dir.dx !== 0) return Math.sign(dx) === dir.dx && Math.abs(dy) <= 1 + Math.floor(Math.abs(dx) / 2);
          return Math.sign(dy) === dir.dy && Math.abs(dx) <= 1 + Math.floor(Math.abs(dy) / 2);
        });
        if (hit.length >= 2) {
          u.ai = u.ai || {}; u.ai.blastUsed = true;
          return { type: 'power', power: 'mind_blast', direction: dir, targetId: target.id };
        }
      }
    }
    // Fireball casters
    if (m.powers.includes('fireball_cast') && !u.ai?.fireballUsed) {
      const cluster = players.find(p => players.filter(q => Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) <= 2).length >= 2);
      if (cluster && Math.max(Math.abs(cluster.x - u.x), Math.abs(cluster.y - u.y)) <= 8) {
        u.ai = u.ai || {}; u.ai.fireballUsed = true;
        return { type: 'power', power: 'fireball_cast', targetId: cluster.id };
      }
      if (distToTarget <= 8 && !players.some(p => Math.max(Math.abs(p.x - target.x), Math.abs(p.y - target.y)) <= 2 && p !== target)) {
        u.ai = u.ai || {}; u.ai.fireballUsed = true;
        return { type: 'power', power: 'fireball_cast', targetId: target.id };
      }
    }
    // Petrifying gaze
    if (m.powers.includes('petrifying_gaze') && distToTarget <= 5 && hasLOS(combat, u.x, u.y, target.x, target.y)) {
      if (rng.chance(0.6)) return { type: 'power', power: 'petrifying_gaze', targetId: target.id };
    }
    // Eye rays
    if (m.powers.includes('eye_rays') && distToTarget <= 10 && rng.chance(0.7)) {
      return { type: 'power', power: 'eye_rays', targetId: target.id };
    }
    // Luring song
    if (m.powers.includes('luring_song') && players.some(p => Math.max(Math.abs(p.x - u.x), Math.abs(p.y - u.y)) <= 6) && rng.chance(0.5)) {
      return { type: 'power', power: 'luring_song', targetId: target.id };
    }
  }

  // ---- Attack choice ----
  const attacks = (m.attacks || []).filter(a => typeof a.range === 'number' || a.range === 'melee');
  const melee = attacks.find(a => a.range === 'melee');
  const ranged = attacks.find(a => typeof a.range === 'number');

  // Pack tactics / reckless before attacking
  let pack = false;
  if (m.powers && m.powers.includes('pack_tactics')) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ally = unitAt(combat, u.x + dx, u.y + dy);
      if (ally && ally.team === u.team) { pack = true; break; }
    }
    if (pack) addStatus(u, 'pack', 'Pack Tactics', 1);
  }
  if (m.powers && m.powers.includes('reckless') && rng.chance(0.5)) addStatus(u, 'reckless', 'Reckless', 1);

  // Blood frenzy (sahuagin): advantage vs wounded
  if (m.powers && m.powers.includes('blood_frenzy') && target.hp < target.maxHp) addStatus(u, 'pack', 'Blood Frenzy', 1);

  // Can we attack right now?
  const canMelee = melee && distToTarget <= 1;
  const canRanged = ranged && distToTarget <= ranged.range && hasLOS(combat, u.x, u.y, target.x, target.y) && shotClear(combat, u, target);
  const inMeleeOfEnemy = hasAdjacentEnemy(combat, u);

  if (canMelee) {
    const multi = m.powers && m.powers.includes('multiattack') ? 1 : 0;
    const def = melee;
    if (multi && m.powers.includes('charge') && u.moveRemaining >= 2) {
      // minotaur charge: use gore
      const gore = attacks.find(a => a.name === 'Gore') || def;
      return { type: 'attack', targetId: target.id, attackDef: gore, extraAttacks: 1, endTurn: true };
    }
    return { type: 'attack', targetId: target.id, attackDef: def, extraAttacks: multi, endTurn: true };
  }
  if (canRanged && !inMeleeOfEnemy) {
    return { type: 'attack', targetId: target.id, attackDef: ranged, endTurn: true };
  }
  // Ranged attacker engaged in melee: disengage and step back
  if (canRanged && inMeleeOfEnemy && u.moveRemaining >= 2) {
    const away = stepAway(combat, u);
    if (away) {
      return { type: 'move', path: away, disengage: true, then: { type: 'attack', targetId: target.id, attackDef: ranged }, endTurn: true };
    }
  }

  // ---- Movement ----
  // Ranged: keep distance, prefer high ground
  if (ranged && !melee && distToTarget > 1) {
    // find a good shooting spot within movement
    const spot = bestRangedSpot(combat, u, target, ranged.range);
    if (spot && (spot.x !== u.x || spot.y !== u.y)) {
      const res = findPath(combat, u, spot.x, spot.y, u.moveRemaining);
      if (res) return { type: 'move', path: res.path };
    }
    if (hasLOS(combat, u.x, u.y, target.x, target.y) && distToTarget <= ranged.range && shotClear(combat, u, target)) {
      return { type: 'attack', targetId: target.id, attackDef: ranged, endTurn: true };
    }
  }

  // Approach the target
  const dest = adjacentTo(combat, target);
  const moveCap = u.moveRemaining;
  let res = dest ? findPath(combat, u, dest.x, dest.y, moveCap) : null;
  if (!res) res = findPath(combat, u, target.x, target.y, moveCap);

  if (res && res.path.length) {
    // dash if we cannot reach this turn and it's worth it
    const reachable = res.path[res.path.length - 1];
    const dAfter = Math.max(Math.abs(reachable.x - target.x), Math.abs(reachable.y - target.y));
    if (dAfter > 1 && melee && !ranged) {
      return { type: 'dash', endTurn: false, thenMove: res.path };
    }
    return { type: 'move', path: res.path };
  }
  return { type: 'wait', endTurn: true };
}

// Prefer not to fire if the first body on the line is an ally or a blocking object.
function shotClear(combat, shooter, target) {
  const block = firstProjectileBlocker(combat, shooter.x, shooter.y, target.x, target.y);
  if (!block.early) return true;
  if (block.kind === 'unit' && block.unit && block.unit.team === shooter.team) return false;
  if (block.kind === 'object' || block.kind === 'block') return false;
  return true;
}

function hasAdjacentEnemy(combat, u) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const e = unitAt(combat, u.x + dx, u.y + dy);
    if (e && e.team !== u.team) return true;
  }
  return false;
}

function stepAway(combat, u) {
  const options = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = u.x + dx, y = u.y + dy;
    if (!isPassable(combat, x, y)) continue;
    const e = unitAt(combat, x, y);
    if (e) continue;
    if (hasAdjacentEnemyAt(combat, x, y, u)) continue;
    const elev = elevationAt(combat, x, y);
    options.push({ x, y, elev });
  }
  options.sort((a, b) => b.elev - a.elev);
  return options.length ? [options[0]] : null;
}

function hasAdjacentEnemyAt(combat, x, y, self) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const e = unitAt(combat, x + dx, y + dy);
    if (e && e.team !== self.team) return true;
  }
  return false;
}

function adjacentTo(combat, target) {
  let best = null, bestScore = -Infinity;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = target.x + dx, y = target.y + dy;
    if (!inBounds(combat, x, y)) continue;
    if (!isPassable(combat, x, y)) continue;
    const elev = elevationAt(combat, x, y);
    const t = combat.grid[y][x];
    let score = elev * 3;
    if (t.hazard === 'fire' || t.hazard === 'brambles') score -= 2;
    if (score > bestScore) { bestScore = score; best = { x, y }; }
  }
  return best;
}

function bestRangedSpot(combat, u, target, range) {
  const curElev = elevationAt(combat, u.x, u.y);
  let best = { x: u.x, y: u.y }, bestScore = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = u.x + dx, y = u.y + dy;
      if (!inBounds(combat, x, y) || (x === u.x && y === u.y)) continue;
      if (!isPassable(combat, x, y)) continue;
      const d = Math.max(Math.abs(x - target.x), Math.abs(y - target.y));
      if (d > range || d <= 1) continue;
      const elev = elevationAt(combat, x, y);
      if (!hasLOS(combat, x, y, target.x, target.y)) continue;
      if (!shotClear(combat, { x, y, team: u.team }, target)) continue;
      const score = elev * 4 - Math.abs(elev - curElev) * 2 + (d <= range - 1 ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
  }
  return best;
}

// Perform AI's chosen action (with the flee + dash-then-move handling)
// ---- Step-based enemy turns (so the UI can pause for reactions) ----
export function planEnemySteps(combat, u, action) {
  if (action.type === 'attack') {
    return [{ type: 'attack', targetId: action.targetId, attackDef: action.attackDef, extraAttacks: action.extraAttacks || 0 }];
  }
  if (action.type === 'power') {
    return [{ type: 'power', power: action.power, targetId: action.targetId, direction: action.direction }];
  }
  if (action.type === 'flee') {
    const dirx = Math.sign(u.x - action.from.x) || (u.x > 0 ? 1 : -1);
    const diry = Math.sign(u.y - action.from.y) || 0;
    let best = null;
    for (const [dx, dy] of [[dirx, 0], [0, diry], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = u.x + dx, y = u.y + dy;
      if (isPassable(combat, x, y) && !unitAt(combat, x, y)) {
        const score = Math.abs(x - action.from.x) + Math.abs(y - action.from.y);
        if (!best || score > best.score) best = { x, y, score };
      }
    }
    const steps = best ? [{ type: 'move', x: best.x, y: best.y, disengage: true }] : [];
    steps.push({ type: 'wait' });
    return steps;
  }
  if (action.type === 'dash' && action.thenMove) {
    const last = action.thenMove[action.thenMove.length - 1];
    const res = findPath(combat, u, last.x, last.y, u.moveRemaining + computeSpeed(u.char));
    const steps = [{ type: 'dash' }];
    if (res) for (const t of res.path) steps.push({ type: 'move', x: t.x, y: t.y });
    steps.push({ type: 'wait' });
    return steps;
  }
  if (action.type === 'move') {
    const steps = (action.path || []).map(t => ({ type: 'move', x: t.x, y: t.y, disengage: !!action.disengage }));
    if (action.then) steps.push({ type: 'attack', targetId: action.then.targetId, attackDef: action.then.attackDef });
    if (!steps.length) steps.push({ type: 'wait' });
    return steps;
  }
  if (action.type === 'wait') return [{ type: 'wait' }];
  return [{ type: 'wait' }];
}

export function performEnemyStep(combat, u, step) {
  switch (step.type) {
    case 'move':
      performAction(combat, u.id, { type: 'move', path: [{ x: step.x, y: step.y }] });
      break;
    case 'attack':
      performAction(combat, u.id, { type: 'attack', targetId: step.targetId, attackDef: step.attackDef, extraAttacks: step.extraAttacks || 0 });
      break;
    case 'power':
      performAction(combat, u.id, { type: 'power', power: step.power, targetId: step.targetId, direction: step.direction });
      break;
    case 'dash':
      performAction(combat, u.id, { type: 'dash' });
      break;
    case 'wait':
      performAction(combat, u.id, { type: 'wait' });
      break;
  }
}

// Headless/synchronous execution: run every step back-to-back (no prompts).
export function executeEnemyTurn(combat, u, action) {
  const steps = planEnemySteps(combat, u, action);
  for (const st of steps) {
    if (u.dead || combat.over) break;
    performEnemyStep(combat, u, st);
  }
}

// ---- Reaction triggers (opportunity attacks & reaction spells) ----
function playerMeleeReach(p) {
  const wId = p.char.weapon && p.char.weapon.base;
  if (!wId || wId === 'fists') return 1; // bare hands still threaten
  const def = WEAPONS[wId];
  if (!def || def.range.startsWith('ranged')) return null; // no OA with a bow
  return def.properties.includes('reach') ? 2 : 1;
}

// Reactions available BEFORE an enemy step (leaving reach, entering a
// polearm's reach, disengaging past a Sentinel, or War Caster cantrips).
export function reactionPromptsForStep(combat, mover, step) {
  if (step.type !== 'move') return [];
  if (mover.team !== 'enemy') return [];
  const base = alivePlayers(combat).filter(p => !p.reactionUsed && p.hp > 0 && !p.dead);

  // Leaving melee reach (disengage protects the enemy unless a Sentinel watches)
  const leaving = base.filter(p => {
    const reach = playerMeleeReach(p);
    if (reach == null) return false;
    const was = Math.max(Math.abs(p.x - mover.x), Math.abs(p.y - mover.y)) <= reach;
    const will = Math.max(Math.abs(p.x - step.x), Math.abs(p.y - step.y)) <= reach;
    return was && !will;
  });
  const leaveElig = step.disengage
    ? leaving.filter(p => hasFeat(p.char, 'sentinel'))
    : leaving;

  // Polearm Master: enemies ENTERING a reach weapon's range provoke
  const entering = base.filter(p => {
    if (!hasFeat(p.char, 'polearm_master')) return false;
    const reach = playerMeleeReach(p);
    if (reach == null || reach < 2) return false;
    const was = Math.max(Math.abs(p.x - mover.x), Math.abs(p.y - mover.y)) <= reach;
    const will = Math.max(Math.abs(p.x - step.x), Math.abs(p.y - step.y)) <= reach;
    return !was && will;
  });

  if (!leaveElig.length && !entering.length) return [];

  const prompts = [];
  if (leaveElig.length) {
    prompts.push({
      kind: 'oa', enemyId: mover.id, enemyName: mover.name,
      title: `${mover.name} is moving away from ${leaveElig.map(p => p.name).join(' and ')}!`,
      options: leaveElig.map(p => {
        const wId = p.char.weapon && p.char.weapon.base || 'fists';
        const w = WEAPONS[wId] || { name: 'Unarmed Strike' };
        return { kind: 'oa', unitId: p.id, name: p.name, weaponId: wId, targetId: mover.id, label: `⚔ Opportunity Attack — ${w.name} (${p.name})` };
      }),
    });
    // War Caster: cast a cantrip instead of a melee OA
    const warCasters = leaveElig.filter(p => hasFeat(p.char, 'war_caster'));
    const wcOptions = [];
    for (const p of warCasters) {
      const cant = (p.char.spellsKnown || []).find(id => {
        const sp = SPELL_MAP[id];
        return sp && sp.level === 0 && (sp.attack || sp.dmg) && canCastSpell(p.char, id);
      });
      if (cant) wcOptions.push({ kind: 'warcaster', unitId: p.id, name: p.name, targetId: mover.id, spellId: cant, label: `✨ War Caster: ${SPELL_MAP[cant].name} (${p.name})` });
    }
    if (wcOptions.length) prompts.push({ kind: 'warcaster', enemyId: mover.id, enemyName: mover.name, title: 'War Caster reaction available', options: wcOptions });
  }
  if (entering.length) {
    prompts.push({
      kind: 'oa', enemyId: mover.id, enemyName: mover.name,
      title: `${mover.name} moves into ${entering.map(p => p.name).join(' and ')}'s reach!`,
      options: entering.map(p => {
        const wId = p.char.weapon && p.char.weapon.base || 'fists';
        const w = WEAPONS[wId] || { name: 'Unarmed Strike' };
        return { kind: 'oa', unitId: p.id, name: p.name, weaponId: wId, targetId: mover.id, label: `⚔ Polearm Master — ${w.name} (${p.name})` };
      }),
    });
  }
  return prompts;
}

// Reactions available AFTER an enemy step (e.g. Hellish Rebuke on taking damage).
export function reactionPromptsAfterStep(combat, mover, step, hpBefore) {
  if (!hpBefore || step.type !== 'attack') return [];
  const out = [];
  for (const [pid, hp] of hpBefore) {
    const p = combat.units.find(x => x.id === pid);
    if (!p || p.dead || p.reactionUsed || p.hp >= hp || p.hp <= 0) continue;
    const c = p.char;
    if (c.cls && c.cls.id === 'warlock' && canCastSpell(c, 'hellish_rebuke')) {
      const dist = Math.max(Math.abs(p.x - mover.x), Math.abs(p.y - mover.y));
      if (dist <= 6) out.push({
        kind: 'hellish', enemyId: mover.id, enemyName: mover.name,
        title: `${mover.name} struck ${p.name}!`,
        options: [{ kind: 'hellish', unitId: p.id, name: p.name, targetId: mover.id, label: `🔥 Hellish Rebuke — 2d10 fire, DEX save (${p.name})` }],
      });
    }
  }
  return out;
}
