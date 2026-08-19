// Combat action resolution: attacks, spells, items, class abilities,
// status effects, death, and round management.

import { mod, attackBonusFor, weaponDiceFor, weaponStatFor, isProficientWithWeapon, sneakAttackDice, isFinesseOrRanged, savingThrowMod, spellSlotSummary, canCastSpell, computeSpeed, WILD_SHAPES, townMod, hasFeat, skillMod, passivePerception } from './rules.js';
import { WEAPONS, FISTS, CONSUMABLES, ENCHANTMENTS, ARMORS } from '../data/items.js';
import { SPELL_MAP, cantripDmg } from '../data/spells.js';
import { RACE_MAP } from '../data/races.js';
import { OBSTACLES, obstacleBlocksProjectile } from '../data/locations.js';
import { clamp } from '../rng.js';
import * as Audio from '../game/audio.js';
import {
  weaponSwingCandidates, weaponHitCandidates, spellCastCandidates,
  monsterSwingCandidates, monsterHitCandidates, footstepsForLocation,
} from '../data/sounds.js';
import {
  unitAt, getStatus, addStatus, removeStatus, unitAc, elevationAt, inBounds, isPassable, moveCost, findPath,
  hasLOS, canSee, coverFor, roll, d20, attackRoll, updateVision, enemyVisible, startOfTurnReset, currentUnit,
  aliveEnemies, alivePlayers, DMG_TYPES, pushPopup, pushFx, firstProjectileBlocker, stampObstacleHp,
  canSeeUnit, whoCanSee, isClearlySeen, whoCanHear,
} from './combat.js';

export function log(combat, msg) {
  combat.log.push(msg);
  if (combat.log.length > 200) combat.log.splice(0, combat.log.length - 200);
}

// ============================== HIDE / SIGHT ==============================
// 5e PHB: "You can't hide from a creature that can see you clearly."
// Hide is a Dexterity (Stealth) check contested by Passive Perception (hearing
// or otherwise noticing you) of any foe in earshot. Racial exceptions:
// Lightfoot Naturally Stealthy, Wood Elf Mask of the Wild.
function stealthBonusFor(u) {
  const c = u.char;
  if (!c) return 0;
  let bonus = 0;
  if (c.abilities && c.skills) {
    try { bonus = skillMod(c, 'Stealth'); } catch (e) {
      bonus = c.abilities ? mod(c.abilities.DEX) : 0;
    }
  } else if (c.abilities) bonus = mod(c.abilities.DEX);
  else if (c.stats) bonus = mod(c.stats.DEX);
  if (c.buffs && c.buffs.some(b => b.id === 'pass_without_trace')) bonus += 10;
  return bonus;
}

function rollStealth(combat, u) {
  const bonus = stealthBonusFor(u);
  const rollOnce = () => {
    let n = d20(combat.rng);
    if (u.char && u.char.raceId === 'halfling' && n === 1) n = d20(combat.rng);
    return n;
  };
  let a = rollOnce();
  const armor = u.char && ARMORS[u.char.armor];
  const dis = !!(armor && armor.stealth);
  const adv = !!(u.char && (u.char.trinkets || []).some(t => t.stealthAdv));
  let die = a;
  if (adv && !dis) die = Math.max(a, rollOnce());
  else if (dis && !adv) die = Math.min(a, rollOnce());
  return die + bonus;
}

export function clearHidden(combat, u, reason) {
  const was = !!(u.hidden || getStatus(u, 'hidden'));
  u.hidden = false;
  removeStatus(u, 'hidden');
  u.stealthScore = null;
  if (was && reason) log(combat, reason);
  return was;
}

export function revealIfSeen(combat, u) {
  if (!u || (!u.hidden && !getStatus(u, 'hidden'))) return false;
  const watchers = whoCanSee(combat, u);
  if (watchers.length) {
    clearHidden(combat, u, `👁 ${watchers[0].name} spots ${u.name} — they are no longer hidden!`);
    return true;
  }
  const hearers = whoCanHear(combat, u);
  if (hearers.length) {
    const pp = passivePerception(hearers[0]);
    const stealth = u.stealthScore;
    clearHidden(combat, u, `👂 ${hearers[0].name} hears ${u.name} (Passive Perception ${pp} vs Stealth ${stealth}) — they are no longer hidden!`);
    return true;
  }
  return false;
}

export function tryHide(combat, u) {
  if (!getStatus(u, 'invisible')) {
    const watchers = whoCanSee(combat, u);
    if (watchers.length) {
      log(combat, `${u.name} can't hide — ${watchers[0].name} can see them clearly!`);
      return false;
    }
  }
  const total = rollStealth(combat, u);
  u.stealthScore = total;
  const hearers = whoCanHear(combat, u);
  if (hearers.length) {
    const pp = passivePerception(hearers[0]);
    log(combat, `${u.name} tries to hide (Stealth ${total}) — ${hearers[0].name} hears them (Passive Perception ${pp})!`);
    u.stealthScore = null;
    return false;
  }
  u.hidden = true;
  addStatus(u, 'hidden', 'Hidden', 99);
  log(combat, `🙈 ${u.name} hides (Stealth ${total}). Enemy sightlines are revealed.`);
  return true;
}

export function scheduleWeaponFx(combat, attacker, dest, weapon, opts = {}) {
  if (!attacker || !dest) return;
  const thrown = (weapon && weapon.properties || []).some(p => typeof p === 'string' && p.startsWith('thrown'));
  const ranged = !!(weapon && typeof weapon.range === 'string' && weapon.range.startsWith('ranged')) || !!opts.ranged;
  if (!ranged && !thrown && !opts.force) return;
  const kind = ranged ? 'arrow' : 'thrown';
  const color = ranged ? '#e8d8a0' : '#c8a070';
  pushFx(combat, {
    type: 'proj', kind, color,
    x0: attacker.x, y0: attacker.y, x1: dest.x, y1: dest.y,
    dur: ranged ? 380 : 460,
  });
}

// ============================== PROJECTILES / OBJECTS ==============================
// A shot, ray, or thrown item hits the FIRST living creature or blocking
// object on its flight path — including allies (friendly fire).
export function isProjectileWeapon(weapon, attacker, target) {
  if (!weapon) return false;
  const ranged = typeof weapon.range === 'string' && weapon.range.startsWith('ranged');
  const thrown = (weapon.properties || []).some(p => typeof p === 'string' && p.startsWith('thrown'));
  if (!target || !attacker) return ranged || thrown;
  const dist = Math.max(Math.abs(attacker.x - target.x), Math.abs(attacker.y - target.y));
  return ranged || (thrown && dist > 1);
}

export function isProjectileSpell(sp) {
  if (!sp) return false;
  if (sp.mode === 'melee') return false; // shocking grasp / inflict wounds are not flight-path shots
  if (sp.attack) return true;
  if (sp.fx === 'magic_missile') return true;
  return false;
}

function rollProjectileSpellDamage(combat, caster, sp, upcast) {
  if (sp.fx === 'magic_missile') {
    const n = 3 + upcast;
    let dmg = 0;
    for (let i = 0; i < n; i++) dmg += roll(combat.rng, '1d4') + 1;
    return { dmg, type: 'force' };
  }
  let rays = 1;
  if (sp.fx === 'scorching_ray') rays = 3 + upcast;
  if (sp.fx === 'eldritch_blast') {
    const lvl = caster.char.level || 1;
    rays = lvl >= 17 ? 4 : lvl >= 11 ? 3 : lvl >= 5 ? 2 : 1;
  }
  let dmg = 0;
  if (sp.fx === 'eldritch_blast') {
    for (let i = 0; i < rays; i++) dmg += roll(combat.rng, '1d10');
  } else if (sp.fx === 'scorching_ray') {
    for (let i = 0; i < rays; i++) dmg += roll(combat.rng, '2d6');
  } else if (sp.dmg) {
    const dmgStr = typeof sp.dmg === 'string' ? upcastDmg(sp.dmg, upcast) : cantripDmg(sp, caster.char.level);
    dmg = roll(combat.rng, dmgStr);
  }
  return { dmg, type: sp.dmgType || 'force' };
}

export function applyObjectDamage(combat, x, y, amount, type, source, opts = {}) {
  const t = combat.grid[y] && combat.grid[y][x];
  if (!t || !t.obstacle) return { dealt: 0, destroyed: false };
  const ob = OBSTACLES[t.obstacle];
  if (!ob) return { dealt: 0, destroyed: false };
  if (t.maxHp == null && ob.hp) stampObstacleHp(t);
  if (t.maxHp == null || t.hp == null) {
    log(combat, `The shot slams into the ${ob.name} and does nothing.`);
    if (!opts.quiet) pushPopup(combat, x, y, { kind: 'immune', type });
    return { dealt: 0, destroyed: false, immune: true };
  }
  let mult = 1;
  if ((ob.immune || []).includes(type)) {
    log(combat, `The ${ob.name} is immune to ${type} damage.`);
    if (!opts.quiet) pushPopup(combat, x, y, { kind: 'immune', type });
    return { dealt: 0, destroyed: false, immune: true };
  }
  if ((ob.resist || []).includes(type)) mult = 0.5;
  if ((ob.vuln || []).includes(type)) mult = 2;
  if (source && source.char && hasFeat(source.char, 'elemental_adept')
      && source.char.featChoices && source.char.featChoices.elemental_adept === type && mult === 0.5) {
    mult = 1;
  }
  let dealt = Math.floor(amount * mult);
  if (dealt < 0) dealt = 0;
  if (mult < 1) log(combat, `The ${ob.name} resists ${type} damage.`);
  if (mult > 1) log(combat, `The ${ob.name} is vulnerable to ${type} damage!`);
  t.hp -= dealt;
  if (t.hp < 0) t.hp = 0;
  if (dealt > 0 && !opts.quiet) {
    pushPopup(combat, x, y, { kind: 'dmg', amount: dealt, type, delay: opts.popupDelay || 0 });
  }
  const destroyed = t.hp <= 0;
  if (destroyed) {
    log(combat, `💥 The ${ob.name} is destroyed!`);
    t.obstacle = null;
    t.hp = null;
    t.maxHp = null;
    Audio.play('combat/hit_flesh', { vol: 0.55, throttle: 80 });
    updateVision(combat);
  } else {
    const who = source && source.name ? source.name + ' hits' : 'The hit lands on';
    log(combat, `${who} the ${ob.name} for ${dealt} ${type} (${t.hp}/${t.maxHp}).`);
  }
  return { dealt, destroyed, resisted: mult < 1, vulnerable: mult > 1 };
}

// If a projectile is intercepted early, retarget the unit or mark the shot as spent.
// Callers apply object damage themselves (they know the dice).
export function interceptProjectile(combat, attacker, intended, opts = {}) {
  if (!intended) return { target: null };
  const tx = intended.x, ty = intended.y;
  const block = firstProjectileBlocker(combat, attacker.x, attacker.y, tx, ty);
  if (!block.early) return { target: intended && intended.id ? intended : null, block };
  if (block.kind === 'unit') {
    if (block.unit.team === attacker.team) {
      log(combat, `⚠ Friendly fire! The ${opts.label || 'shot'} is intercepted by ${block.unit.name}!`);
    } else {
      log(combat, `⚠ The ${opts.label || 'shot'} is intercepted by ${block.unit.name}!`);
    }
    return { target: block.unit, block, redirected: true };
  }
  if (block.kind === 'object') {
    log(combat, `⚠ The ${opts.label || 'shot'} slams into the ${block.name} instead!`);
    return { target: null, block, stopped: true, object: true };
  }
  log(combat, `⚠ The ${opts.label || 'shot'} slams into the ${block.name} and stops.`);
  pushPopup(combat, block.x, block.y, { kind: 'miss' });
  return { target: null, block, stopped: true };
}

// ============================== MOVEMENT ==============================
export function moveUnit(combat, u, path) {
  let moved = 0;
  const steps = [];
  for (const step of path) {
    if (u.moveRemaining <= 0) break;
    if (u.hp <= 0) break; // dying units stop moving
    if (!isPassable(combat, step.x, step.y)) break;
    const cost = moveCost(combat, step.x, step.y, elevationAt(combat, u.x, u.y));
    if (cost > u.moveRemaining) break;
    const fromX = u.x, fromY = u.y;
    // Opportunity attacks: leaving an enemy's reach provokes (enemies act automatically)
    if (u.team === 'player') {
      for (const e of combat.units) {
        if (e.team !== 'enemy' || e.dead || e.reactionUsed) continue;
        // Mobile: enemies you attacked this turn can't make OAs against you
        if (hasFeat(u.char, 'mobile') && (u.attackedThisTurn || []).includes(e.id)) continue;
        const was = Math.max(Math.abs(e.x - fromX), Math.abs(e.y - fromY)) <= 1;
        const will = Math.max(Math.abs(e.x - step.x), Math.abs(e.y - step.y)) <= 1;
        if (was && !will) {
          e.reactionUsed = true;
          enemyOpportunityAttack(combat, e, u);
          if (u.hp <= 0) break;
        }
      }
    }
    if (u.hp <= 0) break;
    u.moveRemaining -= cost;
    u.x = step.x; u.y = step.y;
    moved++;
    steps.push({ x: step.x, y: step.y });
    Audio.footstep(footstepsForLocation(combat.locId));
    // hazard triggers
    const t = combat.grid[step.y][step.x];
    if (t.hazard === 'brambles') {
      Audio.play('combat/hazard_brambles', { vol: 0.5, throttle: 450 });
      applyDamage(combat, u, null, 1, 'piercing', { noCrit: true, quiet: true });
    } else if (t.hazard === 'grease') {
      const dex = u.char.stats ? mod(u.char.stats.DEX) : savingThrowMod(u.char, 'DEX');
      const save = d20(combat.rng) + dex;
      if (save < 10) {
        addStatus(u, 'prone', 'Prone', 1);
        Audio.play('combat/hazard_grease', { vol: 0.6 });
        Audio.play('combat/fall', { vol: 0.6, delay: 120 });
        log(combat, `${u.name} slips on the grease and falls prone!`);
      }
    }
    const spike = combat.effects.find(e => e.type === 'spike_growth' && Math.abs(e.x - step.x) <= e.r && Math.abs(e.y - step.y) <= e.r);
    if (spike) {
      applyDamage(combat, u, null, roll(combat.rng, '2d4'), 'piercing', { noCrit: true, quiet: true });
    }
    // 5e: moving does not break Hide unless a foe can now see or hear you.
    if (u.hidden || getStatus(u, 'hidden')) revealIfSeen(combat, u);
    for (const o of combat.units) {
      if (o === u || o.dead || o.overboard) continue;
      if (o.hidden || getStatus(o, 'hidden')) revealIfSeen(combat, o);
    }
  }
  if (moved) {
    u.movedTiles = (u.movedTiles || 0) + moved;
    // break invisibility handled on attack
    const inv = getStatus(u, 'invisible');
    if (inv && u.char && moved > 0) { /* movement does not break */ }
    if (u.dodging) u.dodging = false;
  }
  updateVision(combat);
  return steps;
}

// An enemy strikes a creature that leaves its reach (no prompt — automatic).
function enemyOpportunityAttack(combat, enemy, mover) {
  const atk = (enemy.char.attacks || []).find(a => a.range === 'melee') || (enemy.char.attacks || [])[0];
  if (!atk) return;
  Audio.weaponSwing(monsterSwingCandidates(atk));
  const toHit = (atk.toHit || 0) + (enemy.char.toHitBonus || 0);
  const rr = attackRoll(combat.rng, combat, enemy, mover, toHit, { melee: true });
  const total = rr.result + rr.bonus;
  const ac = unitAc(mover, combat, false, enemy);
  if (rr.fumble || (total < ac && !rr.crit)) {
    log(combat, `⚡ ${enemy.name} misses its opportunity attack on ${mover.name} (${total} vs AC ${ac}).`);
    pushPopup(combat, mover.x, mover.y, { kind: 'miss' });
    Audio.play('combat/miss', { vol: 0.6, delay: 80 });
    return;
  }
  let dmg = roll(combat.rng, atk.dmg, enemy.char.dmgBonus || 0);
  if (rr.crit) dmg += roll(combat.rng, atk.dmg);
  log(combat, `⚡ ${enemy.name} opportunity-attacks ${mover.name} for ${dmg} ${atk.dmgType || 'bludgeoning'} damage!`);
  Audio.weaponHit(monsterHitCandidates(atk), { delay: 80 });
  applyDamage(combat, mover, enemy, dmg, atk.dmgType || 'bludgeoning', { crit: rr.crit });
}

// ============================== DAMAGE ==============================
export function applyDamage(combat, target, source, amount, type, opts = {}) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    console.error('!!! NaN damage:', target.name, type, 'from', source && source.name, 'opts', JSON.stringify(opts));
    amount = 0;
  }
  if (target.dead || amount <= 0) return { dealt: 0, resisted: false, vulnerable: false, immune: false };

  // resistances / vulnerabilities / immunities
  let mult = 1;
  let immune = false;
  const def = target.char;
  const resistList = (def.resist || []).concat(def.immunities || []);
  const vulnList = def.vuln || [];
  const immunities = def.immunities || [];

  const rage = getStatus(target, 'raging');
  if (rage && ['bludgeoning', 'piercing', 'slashing'].includes(type)) {
    if (target.char.subclassId === 'totem') {
      if (type !== 'psychic') mult = 0.5;
    } else mult = 0.5;
  }
  if (resistList.includes(type)) mult = 0.5;
  if (immunities.includes(type)) { mult = 0; immune = true; }
  if (vulnList.includes(type)) mult = 2;
  // Elemental Adept: the caster's chosen element ignores resistance
  if (source && hasFeat(source.char, 'elemental_adept') && source.char.featChoices && source.char.featChoices.elemental_adept === type && mult === 0.5) {
    mult = 1;
    log(combat, `${source.name}'s Elemental Adept pierces the target's resistance to ${type}!`);
  }
  // Heavy Armor Master: heavy armor soaks 3 from nonmagical B/P/S
  if (target.char && hasFeat(target.char, 'heavy_armor_master') && !opts.magical
      && ['bludgeoning', 'piercing', 'slashing'].includes(type)
      && target.char.armor && ARMORS[target.char.armor] && ARMORS[target.char.armor].type === 'heavy') {
    amount -= 3;
  }
  if (target.char.stats && target.char.stats.resist) { /* handled above via resist */ }

  // character-level resistances from race/buffs
  if (target.char.race && target.char.race.resist && target.char.race.resist.includes(type)) mult = 0.5;
  const prot = target.char.buffs && target.char.buffs.find(b => b.id === 'protection_from_energy' && b.type === type);
  if (prot) mult = 0.5;
  const stone = target.char.buffs && target.char.buffs.find(b => b.id === 'stoneskin' && ['bludgeoning', 'piercing', 'slashing'].includes(type));
  if (stone) mult = 0.5;
  const resistAll = getStatus(target, 'resist_all');
  if (resistAll) mult = 0.5;
  const fireShieldCold = target.char.buffs && target.char.buffs.find(b => b.id === 'fire_shield' && type === 'cold');
  if (fireShieldCold) mult = 0.5;
  const draconic = target.char.cls && target.char.cls.id === 'sorcerer' && target.char.subclassId === 'draconic';
  if (draconic && target.char.draconicResist === type) mult = 0.5;

  if (immune && !opts.ignoreImmunity) {
    log(combat, `${target.name} is immune to ${type} damage.`);
    if (!opts.quiet) pushPopup(combat, target.x, target.y, { kind: 'immune', type });
    return { dealt: 0, immune: true };
  }

  let dealt = Math.floor(amount * mult);
  if (source && source.char && source.char.townBuffs) dealt += townMod(source.char, 'damage');
  if (dealt < 0) dealt = 0;
  if (mult < 1) log(combat, `${target.name} resists ${type} damage.`);
  if (mult > 1) log(combat, `${target.name} is vulnerable to ${type} damage!`);

  // Mirror image
  const mirror = getStatus(target, 'mirror_image');
  if (mirror && !opts.aoe && source && !opts.noMirror) {
    const shatters = (opts.mirrorCheck === undefined ? d20(combat.rng) <= 12 : opts.mirrorCheck);
    if (shatters) {
      mirror.rounds -= 1;
      log(combat, `An illusory duplicate of ${target.name} shatters instead!`);
      if (mirror.rounds <= 0) removeStatus(target, 'mirror_image');
      return { dealt: 0, mirrored: true };
    }
  }

  // Wild shape form HP pool: overflow carries to the druid
  if (target.wildShaped && target.form && !opts.noForm) {
    target.form.hp -= dealt;
    if (target.form.hp <= 0) {
      const overflow = -target.form.hp;
      revertWildShape(combat, target);
      log(combat, `🐾 ${target.name} is knocked out of their beast form!`);
      if (overflow <= 0) return { dealt, wildShaped: true };
      dealt = overflow;
    } else {
      return { dealt, wildShaped: true };
    }
  }

  // Ward (abjuration wizard)
  const ward = target.char.buffs && target.char.buffs.find(b => b.id === 'arcane_ward' && b.value > 0);
  if (ward && !opts.noWard) {
    const absorbed = Math.min(ward.value, dealt);
    ward.value -= absorbed;
    dealt -= absorbed;
    log(combat, `${target.name}'s Arcane Ward absorbs ${absorbed} damage.`);
  }

  // Temp HP first
  if (target.tempHp > 0) {
    const absorbed = Math.min(target.tempHp, dealt);
    target.tempHp -= absorbed;
    dealt -= absorbed;
  }

  target.hp -= dealt;
  if (target.hp < 0) target.hp = 0;

  // floating damage number (type-colored in the UI); popupDelay queues it
  // after other numbers already on screen have faded
  if (dealt > 0 && !opts.quiet) {
    pushPopup(combat, target.x, target.y, { kind: 'dmg', amount: dealt, type, magical: !!opts.magical, crit: !!opts.crit, delay: opts.popupDelay || 0 });
  }

  // Fire/acid suppresses regeneration (5e troll rules)
  if (dealt > 0 && target.char.powers && target.char.powers.includes('regeneration') && (type === 'fire' || type === 'acid')) {
    target.regenSuppressed = combat.round + 1;
    log(combat, `🔥 ${target.name}'s regeneration is suppressed!`);
  }

  // Armor of Agathys retaliation
  const agathys = getStatus(target, 'armor_of_agathys');
  if (agathys && source && !opts.aoe && dealt > 0) {
    const dmg = agathys.data;
    log(combat, `The frost armor of ${target.name} lashes out!`);
    applyDamage(combat, source, target, dmg, 'cold', { quiet: true, noRetaliate: true });
  }
  // Fire Shield retaliation
  const fshield = target.char.buffs && target.char.buffs.find(b => b.id === 'fire_shield');
  if (fshield && source && !opts.aoe && dealt > 0 && !opts.noRetaliate) {
    log(combat, `${target.name}'s fire shield burns ${source.name}!`);
    applyDamage(combat, source, target, roll(combat.rng, '2d8'), 'fire', { quiet: true, noRetaliate: true });
  }
  // Tempest cleric wrath of the storm
  if (target.char.cls && target.char.cls.id === 'cleric' && target.char.subclassId === 'tempest' && source && !opts.aoe && dealt > 0 && !opts.noRetaliate && !target.reactionUsed && target.char.level >= 1) {
    const dex = source.char.stats ? mod(source.char.stats.DEX) : savingThrowMod(source.char, 'DEX');
    const save = d20(combat.rng) + dex;
    const dc = target.char.spellSaveDC;
    const dmg = roll(combat.rng, '2d8');
    if (save >= dc) {
      log(combat, `${source.name} dodges the storm (${dmg} thunder → ${Math.floor(dmg / 2)}).`);
      applyDamage(combat, source, target, Math.floor(dmg / 2), 'thunder', { quiet: true, noRetaliate: true });
    } else {
      log(combat, `Wrath of the Storm! ${source.name} takes ${dmg} thunder.`);
      applyDamage(combat, source, target, dmg, 'thunder', { quiet: true, noRetaliate: true });
    }
    target.reactionUsed = true;
  }
  // Barbed hide
  if (target.char.powers && target.char.powers.includes('barbed_hide') && source && !opts.aoe && dealt > 0 && !opts.noRetaliate) {
    if (d20(combat.rng) <= 10) {
      const dmg = roll(combat.rng, '1d10');
      log(combat, `${source.name} is pierced by the barbs of ${target.name} (${dmg}).`);
      applyDamage(combat, source, target, dmg, 'piercing', { quiet: true, noRetaliate: true });
    }
  }

  // Concentration check
  if (target.concentration && dealt > 0) {
    const con = target.char.stats ? mod(target.char.stats.CON) : savingThrowMod(target.char, 'CON');
    const dc = Math.max(10, Math.floor(dealt / 2));
    let save = d20(combat.rng) + con;
    if (hasFeat(target.char, 'war_caster')) save = Math.max(save, d20(combat.rng) + con); // advantage
    if (save < dc) {
      log(combat, `${target.name} loses concentration on ${SPELL_MAP[target.concentration.spellId]?.name || 'their spell'}!`);
      endConcentration(combat, target);
    } else {
      log(combat, `${target.name} maintains concentration (${save} vs DC ${dc}).`);
    }
  }

  // polymorph breaks on damage
  if (getStatus(target, 'polymorphed') && dealt > 0) {
    removeStatus(target, 'polymorphed');
    log(combat, `${target.name} reverts from sheep form!`);
  }
  // hypnotic pattern breaks on damage
  if (getStatus(target, 'hypnotized') && dealt > 0) {
    removeStatus(target, 'hypnotized');
    log(combat, `${target.name} snaps out of the trance!`);
  }
  // sleep breaks on damage
  if (getStatus(target, 'asleep') && dealt > 0) {
    removeStatus(target, 'asleep');
    log(combat, `${target.name} wakes up!`);
  }

  if (target.hp <= 0 && !target.dead) {
    handleZeroHp(combat, target, source);
  }
  // Pain grunts on meaningful hits (randomized 1–3, throttled so multi-hits
  // and AoEs don't machine-gun the player).
  if (dealt >= 5 && !opts.quiet && !target.dead) {
    Audio.grunt();
  }
  return { dealt, immune: false, resisted: mult < 1, vulnerable: mult > 1 };
}

export function handleZeroHp(combat, target, source) {
  if (target.team === 'player') {
    const deathWard = target.char.buffs && target.char.buffs.find(b => b.id === 'death_ward');
    if (deathWard) {
      target.hp = 1;
      target.char.buffs = target.char.buffs.filter(b => b.id !== 'death_ward');
      log(combat, `⚜ DEATH WARD! ${target.name} is wreathed in light and clings to life at 1 HP!`);
      return;
    }
    // hero's Ring of Second Chances
    if (target.char.hero && target.char.ringUsed === false && target.char.hasRingOfSecondChances) {
      target.hp = 1;
      target.char.ringUsed = true;
      log(combat, `⚜ The Ring of Second Chances flares! ${target.name} is pulled back from the brink at 1 HP!`);
      return;
    }
    // Already down? Damage while dying = one automatic failed death save.
    const already = getStatus(target, 'dying');
    if (already) {
      already.fails = (already.fails || 0) + 1;
      log(combat, `💔 ${target.name} is hit while down — automatic death save failure (${already.fails}/2)!`);
      if (already.fails >= 2) {
        target.dead = true;
        target.deathRound = combat.round;
        removeStatus(target, 'dying');
        log(combat, `💀 ${target.name} dies from their wounds.`);
        Audio.play('units/death', { vol: 0.85 });
        if (target.char.hero) log(combat, '☠ THE HERO HAS FALLEN. The run is over...');
      }
      return;
    }
    // First time dropping to 0: enter DEATH SAVING THROW mode (do NOT die yet)
    target.hp = 0;
    addStatus(target, 'dying', 'Dying', 5);
    Audio.play('combat/fall', { vol: 0.7 });
    log(combat, `💔 ${target.name} collapses at 0 HP! Death saving throws begin — 2 successes stabilize, 2 failures kill.`);
    if (target.char.hero) log(combat, '☠ The Hero is down! Stabilize them or heal them before they fail twice!');
  } else {
    target.dead = true;
    target.deathRound = combat.round;
    log(combat, `☠ ${target.name} is slain!`);
    Audio.play('units/death', { vol: 0.85 });
    // Dark One's Blessing
    if (source && source.char.cls && source.char.cls.id === 'warlock' && source.char.subclassId === 'fiend') {
      const thp = source.char.level + mod(source.char.abilities.CHA);
      source.tempHp = Math.max(source.tempHp, thp);
      log(combat, `Dark One's Blessing: ${source.name} gains ${thp} temp HP.`);
    }
    // gold drop
    const m = target.char;
    if (m.cr !== undefined) {
      const g = Math.max(1, Math.round(m.cr * 10) + combat.rng.int(0, Math.max(1, Math.round(m.cr * 15))));
      combat.gold += g;
    }
  }
}

// ============================== ATTACKS ==============================
export function weaponAttack(combat, attacker, target, opts = {}) {
  const char = attacker.char;
  const weaponId = opts.weaponId || (char.weapon ? char.weapon.base : 'fists');
  const weapon = WEAPONS[weaponId] || FISTS;
  Audio.weaponSwing(weaponSwingCandidates(weapon));
  const isRanged = (typeof weapon.range === 'string' && weapon.range.startsWith('ranged')) || opts.ranged;
  const reach = (weapon.properties || []).includes('reach') ? 2 : 1;
  const thrownProp = (weapon.properties || []).find(p => typeof p === 'string' && p.startsWith('thrown'));
  const rangeTiles = isRanged ? parseInt(weapon.range.replace('ranged(', '').replace(')', '')) : (thrownProp ? parseInt(thrownProp.split('(')[1]) : reach);

  // Allow firing at a bare tile (destroyable object) via opts.aim
  if (!target && opts.aim) target = { x: opts.aim.x, y: opts.aim.y, id: null, name: 'the obstacle', char: {}, hp: 1, maxHp: 1, dead: false, statuses: [], team: 'object' };

  const dist = Math.max(Math.abs(attacker.x - (target ? target.x : attacker.x)), Math.abs(attacker.y - (target ? target.y : attacker.y)));

  // Projectiles hit the first body or object on the line (friendly fire included).
  let inter = null;
  if (target && isProjectileWeapon(weapon, attacker, target) && !opts.noIntercept) {
    inter = interceptProjectile(combat, attacker, target, { label: weapon.name });
    if (inter.stopped) {
      const impact = inter.block || target;
      scheduleWeaponFx(combat, attacker, impact, weapon, { ranged: isRanged });
      if (inter.object && inter.block) {
        let dice = opts.dice || weaponDiceFor(char, weaponId);
        let statBonus = char.abilities ? mod(char.abilities[weaponStatFor(char, weaponId)]) : 0;
        const dmg = roll(combat.rng, dice, statBonus);
        applyObjectDamage(combat, inter.block.x, inter.block.y, dmg, weapon.dmgType || 'piercing', attacker);
      }
      return { hit: !!inter.object, object: true, blocked: true };
    }
    if (inter.target) target = inter.target;
  }
  if (target && isProjectileWeapon(weapon, attacker, target)) {
    scheduleWeaponFx(combat, attacker, target, weapon, { ranged: isRanged });
  }
  if (!target || !target.id) {
    const aim = (opts.aim) || target;
    if (aim && combat.grid[aim.y] && combat.grid[aim.y][aim.x] && combat.grid[aim.y][aim.x].maxHp) {
      scheduleWeaponFx(combat, attacker, aim, weapon, { ranged: isRanged });
      let dice = opts.dice || weaponDiceFor(char, weaponId);
      let statBonus = char.abilities ? mod(char.abilities[weaponStatFor(char, weaponId)]) : 0;
      const dmg = roll(combat.rng, dice, statBonus);
      applyObjectDamage(combat, aim.x, aim.y, dmg, weapon.dmgType || 'piercing', attacker);
      return { hit: true, object: true };
    }
    return { hit: false, blocked: true };
  }

  // 5e: making an attack gives away your position, hit or miss.
  if (attacker.hidden || getStatus(attacker, 'hidden')) {
    clearHidden(combat, attacker, `${attacker.name} gives away their position!`);
  }

  let bonus = attackBonusFor(char, weaponId, combat);
  if (opts.flatBonus) bonus += opts.flatBonus;
  // High ground: +1 per elevation level above the target
  const elevDiff = elevationAt(combat, attacker.x, attacker.y) - elevationAt(combat, target.x, target.y);
  if (elevDiff > 0) bonus += elevDiff;
  // Great Weapon Master / Sharpshooter power attacks (-5 to hit / +10 damage)
  const isHeavy = weapon.properties.includes('heavy');
  const powerAttack = (attacker.gwmOn && hasFeat(char, 'great_weapon_master') && isHeavy && !isRanged)
    || (attacker.ssOn && hasFeat(char, 'sharpshooter') && isRanged);
  if (powerAttack) bonus -= 5;
  const enchant = char.weapon && char.weapon.base === weaponId ? char.weapon.enchant : null;

  const obsc = !hasLOS(combat, attacker.x, attacker.y, target.x, target.y) || isSmoked(combat, attacker, target);
  const rangedInMelee = isRanged && adjacentEnemyOf(combat, attacker, target);

  const blessed = attacker.char.buffs && attacker.char.buffs.find(b => b.id === 'bless');
  const baned = getStatus(attacker, 'baned');
  const vow = getStatus(attacker, 'vow_of_enmity') && getStatus(attacker, 'vow_of_enmity').data === target.id;
  const packAdj = getStatus(attacker, 'pack');

  const rr = attackRoll(combat.rng, combat, attacker, target, bonus, {
    melee: !isRanged,
    reckless: getStatus(attacker, 'reckless'),
    vow,
    assassin: char.subclassId === 'assassin' && combat.firstRound,
    pack: packAdj,
    disadvantage: obsc,
    rangedInMelee,
    blessDie: !!blessed,
    baneDie: !!baned,
  });
  rr.blessed += blessed ? blessed.value || 0 : 0;

  let total = rr.result + rr.bonus + rr.blessed - rr.baned;
  const crit = rr.crit || (enchant && enchant.vicious && rr.natural >= 19) || (char.subclassId === 'champion' && rr.natural >= 19) || (attacker.char.critRange && rr.natural >= attacker.char.critRange);
  const fumble = rr.fumble;

  if (fumble) {
    log(combat, `${attacker.name} fumbles the attack (natural 1)!`);
    pushPopup(combat, target.x, target.y, { kind: 'miss' });
    Audio.play('combat/miss', { vol: 0.65, delay: 60 });
    return { hit: false, fumble: true, crit: false };
  }

  // AC with cover
  const ac = unitAc(target, combat, isRanged, attacker);
  if (total < ac && !(crit)) {
    const missMsg = `${attacker.name} misses ${target.name} with ${weapon.name} (${total} vs AC ${ac}).`;
    log(combat, missMsg);
    pushPopup(combat, target.x, target.y, { kind: 'miss' });
    Audio.play('combat/miss', { vol: 0.65, delay: 60 });
    // riposte for battle master
    battleMasterRiposte(combat, target, attacker);
    return { hit: false, crit: false, total, ac };
  }

  // damage
  let dice = opts.dice || weaponDiceFor(char, weaponId);
  let statBonus = mod(char.abilities[weaponStatFor(char, weaponId)]);
  if (char.wildShaped) { dice = '2d6'; statBonus = 4; }
  if (char.subclassId === 'monk' && weaponId === 'fists') statBonus = Math.max(statBonus, mod(char.abilities.DEX));
  let dmg = roll(combat.rng, dice, statBonus);
  // Savage Attacker: once per turn reroll the weapon dice and keep the better
  if (hasFeat(char, 'savage_attacker') && !attacker.savageUsed && !opts.noReroll) {
    attacker.savageUsed = true;
    dmg = Math.max(dmg, roll(combat.rng, dice, statBonus));
  }
  // Piercer: once per turn reroll piercing dice; crits add an extra die
  if (hasFeat(char, 'piercer') && weapon.dmgType === 'piercing' && !attacker.piercerUsed) {
    attacker.piercerUsed = true;
    dmg = Math.max(dmg, roll(combat.rng, dice, statBonus));
  }
  if (powerAttack) dmg += 10;
  // Charger: +5 damage after moving 2+ tiles (once per turn)
  if (hasFeat(char, 'charger') && attacker.movedTiles >= 2 && !attacker.chargerUsed && dist <= reach) {
    attacker.chargerUsed = true;
    dmg += 5;
    log(combat, `🏃 ${attacker.name} charges in for +5 damage!`);
  }
  if (enchant && enchant.bonus) dmg += enchant.bonus;
  if (enchant && enchant.extraDmg) dmg += roll(combat.rng, enchant.extraDmg);
  const wdef = WEAPONS[weaponId];
  if (wdef && wdef.legendary) {
    if (wdef.bonus) dmg += wdef.bonus;
    if (wdef.extraDmg) dmg += roll(combat.rng, wdef.extraDmg);
  }
  if (opts.extraDmg) dmg += roll(combat.rng, opts.extraDmg);
  if (opts.flatDmg) dmg += opts.flatDmg;

  // crit: double weapon dice
  if (crit) {
    let extra = roll(combat.rng, dice, 0);
    if (hasFeat(char, 'piercer') && weapon.dmgType === 'piercing') extra += roll(combat.rng, dice, 0); // Piercer: +1 die on crits
    dmg += extra;
    if (enchant && enchant.vicious) dmg += roll(combat.rng, '2d6');
    log(combat, `💥 CRITICAL HIT! ${attacker.name} strikes ${target.name} for ${dmg} ${weapon.dmgType || opts.dmgType} damage!`);
    Audio.weaponHit(weaponHitCandidates(weapon), { delay: 90, vol: 1.05 });
    Audio.play('combat/crit', { vol: 0.95, delay: 150 });
  } else {
    log(combat, `${attacker.name} hits ${target.name} with ${weapon.name} for ${dmg} ${weapon.dmgType || opts.dmgType} damage (${total} vs AC ${ac}).`);
    Audio.weaponHit(weaponHitCandidates(weapon), { delay: 90 });
  }

  // class damage riders
  const riders = [];
  const rage = getStatus(attacker, 'raging');
  if (rage && weaponStatFor(char, weaponId) === 'STR') dmg += 2;
  const hunter = char.subclassId === 'hunter' && target.hp < target.maxHp;
  if (hunter) dmg += 2;
  const gloom = char.subclassId === 'gloom' && combat.firstRound;
  if (gloom) dmg += roll(combat.rng, '1d8');
  const df = attacker.char.buffs && attacker.char.buffs.find(b => b.id === 'divine_favor');
  if (df) dmg += roll(combat.rng, '1d4');
  // Hex: +1d6 necrotic vs the cursed target — applied as a SEPARATE damage
  // event so its popup can display after the weapon's number fades (and so
  // necrotic resistance applies only to the curse, per 5e).
  let hexBonus = 0;
  const hex = getStatus(target, 'hexed');
  if (hex && hex.data === attacker.id) hexBonus = roll(combat.rng, '1d6');
  const hm = getStatus(target, 'hunters_marked');
  if (hm && hm.data === attacker.id) dmg += roll(combat.rng, '1d6');
  const smite = getStatus(attacker, 'wrathful_smite');
  if (smite) { dmg += roll(combat.rng, '1d6'); }
  const ssmite = getStatus(attacker, 'searing_smite');
  if (ssmite) { dmg += roll(combat.rng, '1d6'); }
  const bsmite = getStatus(attacker, 'branding_smite');
  if (bsmite) { dmg += roll(combat.rng, '2d6'); }

  // Sneak attack
  if (char.cls.id === 'rogue' && isFinesseOrRanged(char, weaponId)) {
    const allyAdj = alivePlayers(combat).some(p => p.id !== attacker.id && Math.max(Math.abs(p.x - target.x), Math.abs(p.y - target.y)) <= 1);
    const hasAdv = rr.natural === 20 ? true : (vow || getStatus(attacker, 'reckless') || getStatus(attacker, 'hidden') || (char.subclassId === 'assassin' && combat.firstRound && !target.hasActedThisCombat) || target.statuses.some(s => ['restrained', 'paralyzed', 'stunned', 'unconscious', 'prone'].includes(s.id) && !isRanged) || (target.statuses.some(s => s.id === 'prone') && !isRanged));
    if (allyAdj || hasAdv) {
      const nd = sneakAttackDice(char);
      const sdmg = roll(combat.rng, `${nd}d6`);
      dmg += sdmg;
      riders.push(`Sneak Attack +${sdmg}`);
      log(combat, `🗡 Sneak Attack! ${attacker.name} adds ${sdmg} damage.`);
    }
  }

  const dmgType = weapon.dmgType || 'bludgeoning';
  const magicHit = !!(smite || ssmite || bsmite || df || enchant);
  // weapon damage first (its own popup)…
  const res = applyDamage(combat, target, attacker, dmg - hexBonus, dmgType, { noRetaliate: false, crit, magical: magicHit });
  // …then the Hex curse burns — delayed so "5⚔" fades before "1💀" appears
  if (hexBonus > 0 && !target.dead && target.hp > 0) {
    log(combat, `🔮 ${attacker.name}'s Hex burns ${target.name} for ${hexBonus} necrotic damage.`);
    applyDamage(combat, target, attacker, hexBonus, 'necrotic', { magical: true, popupDelay: 1150 });
    Audio.play('spells/hex', { vol: 0.8, delay: 1150 });
  }
  // secondary enchant type
  if (enchant && enchant.extraType && res.dealt > 0) {
    applyDamage(combat, target, attacker, Math.floor(res.dealt === 0 ? 0 : 0), enchant.extraType, { quiet: true });
  }

  // Smite riders (paladin)
  if (smite) {
    const save = d20(combat.rng) + (target.char.stats ? mod(target.char.stats.WIS) : savingThrowMod(target.char, 'WIS'));
    if (save < char.spellSaveDC) {
      addStatus(target, 'frightened', 'Frightened', 2, { source: attacker.id });
      log(combat, `${target.name} is frightened by the Wrathful Smite!`);
    }
    removeStatus(attacker, 'wrathful_smite');
  }
  if (ssmite) {
    addStatus(target, 'burning', 'Burning', 3);
    removeStatus(attacker, 'searing_smite');
  }
  if (bsmite) {
    addStatus(target, 'faerie_fired', 'Revealed', 3);
    removeStatus(attacker, 'branding_smite');
  }
  // Stunning strike
  if (opts.stunningStrike && char.resources.ki && char.resources.ki.cur > 0) {
    char.resources.ki.cur--;
    const save = d20(combat.rng) + (target.char.stats ? mod(target.char.stats.CON) : savingThrowMod(target.char, 'CON'));
    if (save < char.spellSaveDC) {
      addStatus(target, 'stunned', 'Stunned', 1);
      log(combat, `⚡ Stunning Strike! ${target.name} is stunned!`);
    } else {
      log(combat, `${target.name} resists the Stunning Strike.`);
    }
  }
  // Trip attack (battle master)
  if (opts.tripAttack) {
    if (attacker.char.resources.superiority && attacker.char.resources.superiority.cur > 0) {
      attacker.char.resources.superiority.cur--;
      dmg += roll(combat.rng, '1d8');
      const save = d20(combat.rng) + (target.char.stats ? mod(target.char.stats.STR) : savingThrowMod(target.char, 'STR'));
      if (save < attacker.char.spellSaveDC || save < 8 + attacker.char.prof + mod(attacker.char.abilities.STR)) {
        addStatus(target, 'prone', 'Prone', 1);
        log(combat, `Trip Attack! ${target.name} is knocked prone!`);
      }
    }
  }

  // break invisibility of attacker
  if (getStatus(attacker, 'invisible')) {
    removeStatus(attacker, 'invisible');
    log(combat, `${attacker.name} becomes visible!`);
  }
  if (attacker.hidden || getStatus(attacker, 'hidden')) {
    clearHidden(combat, attacker, `${attacker.name} gives away their position!`);
  }

  // weapon fx (monster attacks)
  if (opts.fx) applyMonsterAttackFx(combat, attacker, target, opts.fx);

  // feat riders after a hit
  if (res.hit) {
    if (hasFeat(char, 'crusher') && weapon.dmgType === 'bludgeoning' && !attacker.crusherUsed && !target.dead) {
      attacker.crusherUsed = true;
      pushUnit(combat, attacker, target, 1);
      log(combat, `💥 ${attacker.name}'s Crusher knocks ${target.name} back!`);
    }
    if (hasFeat(char, 'slasher') && weapon.dmgType === 'slashing' && !attacker.slasherUsed && !target.dead) {
      attacker.slasherUsed = true;
      addStatus(target, 'slowed_ray', 'Hobbled', 1);
      log(combat, `🗡 ${attacker.name}'s Slasher hobbles ${target.name}!`);
    }
  }
  // Mobile: track who was attacked this turn (they can't make OAs against you)
  attacker.attackedThisTurn = attacker.attackedThisTurn || [];
  if (!attacker.attackedThisTurn.includes(target.id)) attacker.attackedThisTurn.push(target.id);

  // consume one-attack statuses
  removeStatus(attacker, 'mocked');
  removeStatus(target, 'guiding');

  return { hit: true, crit, total, ac, dmg: res.dealt, riders };
}

function adjacentEnemyOf(combat, u, exceptTarget) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const e = unitAt(combat, u.x + dx, u.y + dy);
    if (e && e.team !== u.team && e !== exceptTarget) return e;
  }
  return null;
}

export function isSmoked(combat, a, b) {
  const x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  let guard = 0;
  while (guard++ < 100) {
    if (x === x1 && y === y1) break;
    const t = combat.grid[y] && combat.grid[y][x];
    if (t && t.smokeRounds > 0) return true;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return false;
}

function battleMasterRiposte(combat, target, attacker) {
  if (target.team !== 'player') return;
  const c = target.char;
  if (c.cls.id !== 'fighter' || c.subclassId !== 'battle_master') return;
  if (target.reactionUsed) return;
  if (!c.resources.superiority || c.resources.superiority.cur <= 0) return;
  const dist = Math.max(Math.abs(target.x - attacker.x), Math.abs(target.y - attacker.y));
  if (dist > 1) return;
  c.resources.superiority.cur--;
  target.reactionUsed = true;
  log(combat, `Riposte! ${target.name} strikes back at ${attacker.name}.`);
  const bonus = attackBonusFor(c, c.weapon.base, combat) + roll(combat.rng, '1d8');
  const r = d20(combat.rng) + bonus;
  const ac = unitAc(attacker, combat, false, target);
  if (r >= ac) {
    const dmg = roll(combat.rng, weaponDiceFor(c, c.weapon.base), mod(c.abilities[weaponStatFor(c, c.weapon.base)])) + roll(combat.rng, '1d8');
    applyDamage(combat, attacker, target, dmg, 'slashing', { noRetaliate: true });
    log(combat, `${target.name}'s riposte hits for ${dmg}!`);
  } else {
    log(combat, `${target.name}'s riposte misses.`);
    pushPopup(combat, attacker.x, attacker.y, { kind: 'miss' });
  }
}

export function applyMonsterAttackFx(combat, attacker, target, fx) {
  const m = attacker.char;
  switch (fx) {
    case 'trip': {
      const save = d20(combat.rng) + (target.char.stats ? mod(target.char.stats.STR) : savingThrowMod(target.char, 'STR'));
      if (save < 11) { addStatus(target, 'prone', 'Prone', 1); log(combat, `${target.name} is knocked prone!`); }
      break;
    }
    case 'poison_dc11': case 'poison_dc12': case 'poison_dc14': {
      const dc = Number(fx.split('dc')[1]);
      const save = d20(combat.rng) + (target.char.stats ? mod(target.char.stats.CON) : savingThrowMod(target.char, 'CON'));
      if (save < dc) {
        const dmg = roll(combat.rng, fx === 'poison_dc14' ? '3d6' : '2d6');
        addStatus(target, 'poisoned', 'Poisoned', 3);
        log(combat, `${target.name} is poisoned (${dmg} poison)!`);
        applyDamage(combat, target, attacker, dmg, 'poison', { noRetaliate: true });
      }
      break;
    }
    case 'paralyze_dc10': {
      const save = d20(combat.rng) + (target.char.stats ? mod(target.char.stats.CON) : savingThrowMod(target.char, 'CON'));
      if (save < 10) { addStatus(target, 'paralyzed', 'Paralyzed', 2); log(combat, `${target.name} is paralyzed!`); }
      break;
    }
    case 'charge': {
      // minotaur charge: if moved at least 2 tiles, bonus gore already handled; knock prone
      const save = d20(combat.rng) + (target.char.stats ? mod(target.char.stats.STR) : savingThrowMod(target.char, 'STR'));
      if (save < 14) { addStatus(target, 'prone', 'Prone', 1); log(combat, `${target.name} is gored and knocked prone!`); }
      break;
    }
    case 'infernal_wound': {
      addStatus(target, 'bleeding', 'Bleeding', 3);
      break;
    }
    case 'life_drain': {
      if (!target.dead) { addStatus(target, 'max_hp_drain', 'Life Drained', 3); }
      break;
    }
    case 'pull': {
      // pull target 1 tile toward attacker
      const dx = Math.sign(attacker.x - target.x), dy = Math.sign(attacker.y - target.y);
      const nx = target.x + dx, ny = target.y + dy;
      if (isPassable(combat, nx, ny) && !unitAt(combat, nx, ny)) {
        target.x = nx; target.y = ny;
        log(combat, `${target.name} is dragged toward ${attacker.name}!`);
      }
      break;
    }
    case 'engulf': {
      addStatus(target, 'engulfed', 'Engulfed', 3);
      break;
    }
    case 'grapple': {
      addStatus(target, 'grappled', 'Grappled', 2);
      break;
    }
    case 'reload': break;
    case 'spine_fire': break;
  }
}

// ============================== SPELLS ==============================
export function castSpell(combat, caster, spellId, opts = {}) {
  const sp = SPELL_MAP[spellId];
  const char = caster.char;
  if (!canCastSpell(char, spellId) && sp.level > 0 && !opts.scroll) {
    Audio.play('ui/error', { vol: 0.5, throttle: 120 });
    return { ok: false, msg: 'No spell slots left.' };
  }

  // Wild magic surge
  if (char.cls.id === 'sorcerer' && char.subclassId === 'wild' && sp.level > 0 && d20(combat.rng) === 1) {
    log(combat, '🎲 WILD MAGIC SURGE! Chaos erupts around the battlefield!');
    wildSurge(combat, caster);
  }

  // Slot spending: casters prefer real slots; feat-granted spells fall back to
  // their once-per-floor free cast (the only way non-casters can cast them).
  if (sp.level > 0 && !opts.scroll) {
    const freeAvail = !!(char.featCasts && char.featCasts[spellId]);
    if (char.cls.warlock) {
      if (char.pactSlotsUsed < char.pactSlots.length) char.pactSlotsUsed++;
      else if (freeAvail) {
        char.featCasts[spellId] = false;
        log(combat, `🎖 ${caster.name} casts ${sp.name} through their feat (no slot spent).`);
      } else {
        Audio.play('ui/error', { vol: 0.5, throttle: 120 });
        return { ok: false, msg: 'No spell slots left.' };
      }
    } else {
      let spent = false;
      if (char.cls.spellAbility) {
        const want = Math.max(sp.level, opts.level || sp.level);
        let lvl = Math.min(want, char.spellSlots.length);
        while (lvl >= sp.level && lvl > 0 && char.spellSlots[lvl - 1] <= (char.spellSlotsUsed[lvl - 1] || 0)) lvl--;
        if (lvl >= sp.level && lvl > 0) {
          char.spellSlotsUsed[lvl - 1]++;
          opts.level = lvl; // upcast math must use the level actually spent
          spent = true;
        }
      }
      if (!spent) {
        if (freeAvail) {
          char.featCasts[spellId] = false;
          log(combat, `🎖 ${caster.name} casts ${sp.name} through their feat (no slot spent).`);
        } else {
          Audio.play('ui/error', { vol: 0.5, throttle: 120 });
          return { ok: false, msg: 'No spell slots left.' };
        }
      }
    }
  }
  if (opts.consumeItem) {
    const idx = char.inventory.findIndex(i => i.uid === opts.consumeItem);
    if (idx >= 0) char.inventory.splice(idx, 1);
  }

  // The spell's voice: per-spell file → damage-type → role → generic.
  Audio.spellCast(spellCastCandidates(sp));

  const dc = char.spellSaveDC;
  const atk = char.spellAttack + (char.subclassId === 'old_one' ? 1 : 0);

  let targets = [];
  if (opts.target) targets = [opts.target];
  const result = { ok: true, dmg: 0 };

  const getSaveMod = (target, ab) => target.char.stats ? mod(target.char.stats[ab]) : savingThrowMod(target.char, ab);
  const rollSave = (target, ab, adv) => {
    let s = d20(combat.rng);
    if (target.char && hasFeat(target.char, 'lucky') && target.char.resources && target.char.resources.luck && target.char.resources.luck.cur > 0 && s <= 10) {
      target.char.resources.luck.cur--;
      s = Math.max(s, d20(combat.rng));
    }
    const gnome = target.char.raceId === 'gnome' && ['INT', 'WIS', 'CHA'].includes(ab);
    const dwarf = target.char.raceId === 'dwarf' && ab === 'CON' && (target.char.stats && false); // only for PC saves
    const brave = target.char.raceId === 'halfling' && ab === 'WIS';
    if (gnome || brave || adv) s = Math.max(s, d20(combat.rng));
    const bane = getStatus(target, 'baned');
    if (bane) s -= combat.rng.int(1, 4);
    const blessed = target.char.buffs && target.char.buffs.find(b => b.id === 'bless');
    if (blessed) s += combat.rng.int(1, 4);
    const curse = getStatus(target, 'bestow_curse');
    if (curse) s = Math.min(s, d20(combat.rng));
    const slow = getStatus(target, 'slowed');
    if (slow && ab === 'DEX') s = Math.min(s, d20(combat.rng));
    return s + getSaveMod(target, ab);
  };

  const upcast = (opts.level || sp.level) - sp.level;

  // Projectiles (rays, bolts, magic missile) and thrown AoE (fireball etc.)
  // slam into the first body or blocking object on the path. Mental / save
  // cantrips like Sacred Flame, Hex, Hold Person are NOT projectiles.
  const aoeFlight = sp.mode === 'aoe' && (opts.aim || opts.target);
  if (!opts.noIntercept && (isProjectileSpell(sp) || aoeFlight)) {
    const intended = opts.target || opts.aim;
    if (intended && (intended.x !== undefined)) {
      const inter = interceptProjectile(combat, caster, intended, { label: sp.name });
      if (inter.redirected && inter.target) {
        opts.target = inter.target;
        opts.aim = { x: inter.target.x, y: inter.target.y };
        targets = [inter.target];
      } else if (inter.stopped && inter.block) {
        opts.aim = { x: inter.block.x, y: inter.block.y };
        opts.target = null;
        targets = [];
        if (isProjectileSpell(sp)) {
          if (inter.object) {
            const rolled = rollProjectileSpellDamage(combat, caster, sp, upcast);
            if (rolled.dmg) {
              log(combat, `✨ ${caster.name}'s ${sp.name} slams into the ${inter.block.name}!`);
              applyObjectDamage(combat, inter.block.x, inter.block.y, rolled.dmg, rolled.type, caster);
            }
          }
          scheduleSpellFx(combat, caster, sp, opts);
          updateVision(combat);
          return { ok: true, blocked: true, object: !!inter.object };
        }
        // AoE detonates early at the blocker (handled by resolveGenericSpell via opts.aim)
      }
    }
  }

  // Dispatch by targeting mode first
  if (sp.mode === 'cone') {
    resolveCone(combat, caster, sp, opts, dc, rollSave, result);
  } else if (sp.mode === 'line') {
    resolveLine(combat, caster, sp, opts, dc, rollSave, result);
  } else if (sp.mode === 'aoe') {
    resolveGenericSpell(combat, caster, sp, opts, targets, dc, atk, upcast, rollSave, result);
  } else {
    // targeted: ranged / melee / ally / self
    if (sp.fx === 'magic_missile') {
      const n = 3 + upcast;
      let dmg = 0;
      for (let i = 0; i < n; i++) dmg += roll(combat.rng, '1d4') + 1;
      log(combat, `✨ ${caster.name} casts ${sp.name}: ${n} darts strike ${targets[0].name} for ${dmg} force damage!`);
      result.dmg = applyDamage(combat, targets[0], caster, dmg, 'force', { noMirror: true, magical: true }).dealt;
    } else {
      resolveGenericSpell(combat, caster, sp, opts, targets, dc, atk, upcast, rollSave, result);
    }
  }
  // spell visuals (beams, projectiles, rings — rendered by the UI)
  scheduleSpellFx(combat, caster, sp, opts);
  updateVision(combat);
  return result;
}

function resolveCone(combat, caster, sp, opts, dc, rollSave, result) {
  const tiles = coneTilesFor(combat, caster, opts.aim || { x: caster.x, y: caster.y }, sp.coneSize || 3, opts.direction);
  log(combat, `✨ ${caster.name} casts ${sp.name}!`);
  let total = 0;
  for (const t of tiles) {
    const u = unitAt(combat, t.x, t.y);
    if (!u || u.dead) continue;
    const friendly = u.team === caster.team;
    const sculpt = caster.char.subclassId === 'evocation' && sp.school === 'Evocation';
    if (friendly && !sculpt && sp.fx !== 'fear') continue; // most cones don't hit allies
    if (sp.dmg) {
      const dmg = roll(combat.rng, upcastDmg(sp.dmg, upcastDmgLevel(sp)));
      const save = rollSave(u, sp.save);
      if (save >= dc) {
        const half = sp.halfOnSave ? Math.floor(dmg / 2) : 0;
        log(combat, `${u.name} saves vs ${sp.name} (${half} ${sp.dmgType}).`);
        total += applyDamage(combat, u, caster, half, sp.dmgType, { aoe: true, magical: true }).dealt;
      } else {
        log(combat, `${u.name} fails the save vs ${sp.name} (${dmg} ${sp.dmgType})!`);
        total += applyDamage(combat, u, caster, dmg, sp.dmgType, { aoe: true, magical: true }).dealt;
        if (sp.id === 'thunderwave') pushUnit(combat, caster, u, 2);
      }
    }
    if (sp.fx === 'fear') {
      if (!friendly) {
        const save = rollSave(u, 'WIS');
        if (save < dc) { addStatus(u, 'frightened', 'Frightened', 3, { source: caster.id }); log(combat, `😱 ${u.name} is frightened!`); }
      }
      startConcentration(combat, caster, sp.id, null);
    }
  }
  result.dmg = total;
  return result;
}

function upcastDmgLevel(sp) { return 0; }

function resolveLine(combat, caster, sp, opts, dc, rollSave, result) {
  const dir = opts.direction || { dx: caster.team === 'player' ? 1 : -1, dy: 0 };
  const len = sp.lineLen;
  log(combat, `⚡ ${caster.name} casts ${sp.name}!`);
  let total = 0;
  for (let i = 1; i <= len; i++) {
    const x = caster.x + dir.dx * i, y = caster.y + dir.dy * i;
    if (!inBounds(combat, x, y)) break;
    const t = combat.grid[y][x];
    const ob = t.obstacle ? OBSTACLES[t.obstacle] : null;
    if (ob && ob.tall) break;
    const u = unitAt(combat, x, y);
    if (!u) continue;
    const dmg = roll(combat.rng, sp.dmg);
    const save = rollSave(u, sp.save);
    if (save >= dc) total += applyDamage(combat, u, caster, Math.floor(dmg / 2), sp.dmgType, { aoe: true, magical: true }).dealt;
    else total += applyDamage(combat, u, caster, dmg, sp.dmgType, { aoe: true, magical: true }).dealt;
  }
  if (sp.fx === 'sunbeam') {
    addEffect(combat, { type: 'sunbeam', x: caster.x, y: caster.y, rounds: 10, source: caster.id, spellId: sp.id, dir, dc });
    startConcentration(combat, caster, sp.id, null);
  }
  result.dmg = total;
  return result;
}

function upcastDmg(dmg, upcast) {
  // approximate upcasting: +1 die per level for common spells
  if (typeof dmg !== 'string') return dmg;
  const m = dmg.match(/^(\d+)d(\d+)(.*)$/);
  if (!m) return dmg;
  const n = Number(m[1]) + Math.max(0, upcast);
  return `${n}d${m[2]}${m[3]}`;
}

export function coneTilesFor(combat, caster, aim, size, direction) {
  // direction: {dx, dy} pointing away from caster
  const tiles = [];
  let dir = direction;
  if (!dir) {
    if (optsDir(aim, caster)) dir = optsDir(aim, caster);
  }
  if (!dir) dir = { dx: caster.team === 'player' ? 1 : -1, dy: 0 };
  const primary = Math.abs(dir.dx) >= Math.abs(dir.dy) ? 'x' : 'y';
  const sx = caster.x, sy = caster.y;
  for (let i = 1; i <= size; i++) {
    const x = sx + dir.dx * i, y = sy + dir.dy * i;
    if (!inBounds(combat, x, y)) break;
    const t = combat.grid[y][x];
    const obDef = t.obstacle ? OBSTACLES[t.obstacle] : null;
    if (obDef && obDef.tall) break;
    tiles.push({ x, y });
    const width = Math.min(i, Math.floor(size / 2));
    for (let w = 1; w <= width; w++) {
      if (primary === 'x') {
        if (inBounds(combat, x, y + w)) tiles.push({ x, y: y + w });
        if (inBounds(combat, x, y - w)) tiles.push({ x, y: y - w });
      } else {
        if (inBounds(combat, x + w, y)) tiles.push({ x: x + w, y });
        if (inBounds(combat, x - w, y)) tiles.push({ x: x - w, y });
      }
    }
  }
  return tiles;
}

function optsDir(aim, caster) {
  if (aim.x === caster.x && aim.y === caster.y) return null;
  const dx = Math.sign(aim.x - caster.x), dy = Math.sign(aim.y - caster.y);
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(aim.x - caster.x) >= Math.abs(aim.y - caster.y)) return { dx, dy: 0 };
  return { dx: 0, dy };
}

export function pushUnit(combat, caster, target, distance) {
  Audio.play('combat/shove', { vol: 0.75 });
  const dx = Math.sign(target.x - caster.x) || 0, dy = Math.sign(target.y - caster.y) || 0;
  for (let i = 0; i < distance; i++) {
    const nx = target.x + dx, ny = target.y + dy;
    const t = combat.grid[ny] && combat.grid[ny][nx];
    const water = t && (t.hazard === 'water' || t.hazard === 'lava');
    if (water) {
      log(combat, `🌊 ${target.name} is thrown overboard!`);
      overboard(combat, target);
      return;
    }
    if (!isPassable(combat, nx, ny) && !(t && t.elevation > elevationAt(combat, target.x, target.y) + 0 && t.elevation > elevationAt(combat, target.x, target.y) - 2 && t.elevation > 0)) {
      // fall from height if pushed off a cliff
      if (t && t.elevation === 0 && elevationAt(combat, target.x, target.y) >= 1) {
        target.x = nx; target.y = ny;
        const fall = roll(combat.rng, '1d6') * elevationAt(combat, target.x, target.y);
        log(combat, `${target.name} is shoved off the high ground and falls (${fall} bludgeoning)!`);
        addStatus(target, 'prone', 'Prone', 1);
        applyDamage(combat, target, caster, fall, 'bludgeoning', { noCrit: true });
        return;
      }
      // blocked
      log(combat, `${target.name} slams into an obstacle (1d6 bludgeoning).`);
      applyDamage(combat, target, caster, roll(combat.rng, '1d6'), 'bludgeoning', { noCrit: true, quiet: true });
      return;
    }
    if (unitAt(combat, nx, ny)) {
      log(combat, `${target.name} collides with another creature (1d6).`);
      applyDamage(combat, target, caster, roll(combat.rng, '1d6'), 'bludgeoning', { noCrit: true, quiet: true });
      return;
    }
    target.x = nx; target.y = ny;
    log(combat, `${target.name} is pushed back!`);
  }
  updateVision(combat);
}

function overboard(combat, u) {
  u.overboard = true;
  u.overboardRounds = 3;
  addStatus(u, 'overboard', 'Overboard', 3);
  Audio.play('combat/hazard_water', { vol: 0.8 });
  log(combat, `${u.name} splashes into the deep...`);
}

// resolve the bulk of spells generically
function resolveGenericSpell(combat, caster, sp, opts, targets, dc, atk, upcast, rollSave, result) {
  const c = caster;
  const sculpt = c.char.subclassId === 'evocation' && sp.school === 'Evocation';
  const dmgStr = sp.dmg ? upcastDmg(sp.dmg, upcast) : null;
  const target = targets[0];

  // area spells
  if (sp.mode === 'aoe' && (opts.aim || opts.targetArea || opts.target)) {
    const center = opts.aim || (opts.targetArea ? opts.targetArea : { x: target ? target.x : c.x, y: target ? target.y : c.y });
    const r = sp.aoeRadius;
    log(combat, `✨ ${c.name} casts ${sp.name}!`);
    const inArea = (u) => Math.max(Math.abs(u.x - center.x), Math.abs(u.y - center.y)) <= r;

    switch (sp.fx) {
      case 'fog_cloud': case 'darkness': {
        addEffect(combat, { type: sp.fx === 'darkness' ? 'darkness' : 'fog', x: center.x, y: center.y, r, rounds: 10, source: c.id });
        if (sp.fx === 'darkness') startConcentration(combat, c, sp.id, null);
        log(combat, sp.fx === 'darkness' ? 'Magical darkness blankets the area!' : 'A bank of fog rolls in!');
        return { ok: true };
      }
      case 'web': {
        addEffect(combat, { type: 'web', x: center.x, y: center.y, r, rounds: 10, source: c.id });
        for (const u of combat.units) {
          if (u.dead || !inArea(u)) continue;
          const save = rollSave(u, 'DEX');
          if (save < dc) { addStatus(u, 'restrained', 'Restrained', 2); log(combat, `${u.name} is stuck in the web!`); }
        }
        startConcentration(combat, c, sp.id, null);
        return { ok: true };
      }
      case 'grease': {
        addEffect(combat, { type: 'grease', x: center.x, y: center.y, r, rounds: 10 });
        for (const u of combat.units) {
          if (u.dead || !inArea(u)) continue;
          const save = rollSave(u, 'DEX');
          if (save < dc) { addStatus(u, 'prone', 'Prone', 1); log(combat, `${u.name} slips in the grease!`); }
        }
        return { ok: true };
      }
      case 'spike_growth': {
        addEffect(combat, { type: 'spike_growth', x: center.x, y: center.y, r, rounds: 10, source: c.id });
        startConcentration(combat, c, sp.id, null);
        log(combat, 'The ground erupts with spikes!');
        return { ok: true };
      }
      case 'sleep': {
        const pool = roll(combat.rng, upcastDmg('5d8', upcast));
        const sorted = combat.units.filter(u => !u.dead && u.team !== c.team && inArea(u)).sort((a, b) => a.hp - b.hp);
        let left = pool;
        for (const o of sorted) {
          if (left >= o.hp) { left -= o.hp; addStatus(o, 'asleep', 'Asleep', 5); log(combat, `😴 ${o.name} falls asleep!`); }
        }
        log(combat, `💤 Sleep consumes ${pool - left} of the ${pool} HP pool.`);
        return { ok: true };
      }
      case 'entangle': {
        addEffect(combat, { type: 'entangle', x: center.x, y: center.y, r, rounds: 10, source: c.id });
        for (const u of combat.units) {
          if (u.dead || !inArea(u)) continue;
          const save = rollSave(u, 'STR');
          if (save < dc) { addStatus(u, 'entangled', 'Entangled', 2); log(combat, `🌿 ${u.name} is entangled!`); }
        }
        startConcentration(combat, c, sp.id, null);
        return { ok: true };
      }
      case 'hypnotic_pattern': {
        for (const u of combat.units) {
          if (u.dead || !inArea(u)) continue;
          const save = rollSave(u, 'WIS');
          if (save < dc) { addStatus(u, 'hypnotized', 'Hypnotized', 5); log(combat, `🌀 ${u.name} is transfixed!`); }
        }
        startConcentration(combat, c, sp.id, null);
        return { ok: true };
      }
      case 'slow': {
        for (const u of combat.units) {
          if (u.dead || !inArea(u) || u.team === c.team) continue;
          const save = rollSave(u, 'WIS');
          if (save < dc) { addStatus(u, 'slowed', 'Slowed', 3); log(combat, `🐌 ${u.name} is slowed!`); }
        }
        startConcentration(combat, c, sp.id, null);
        return { ok: true };
      }
      case 'cloudkill': {
        addEffect(combat, { type: 'cloudkill', x: center.x, y: center.y, r, rounds: 10, source: c.id });
        startConcentration(combat, c, sp.id, null);
        applyAreaDamage(combat, c, sp, center, r, dc, rollSave, { hitAllies: true });
        return { ok: true };
      }
      case 'moonbeam': case 'cloud_of_daggers': {
        addEffect(combat, { type: sp.fx, x: center.x, y: center.y, r, rounds: 10, source: c.id, spellId: sp.id, dc, dmg: dmgStr || sp.dmg, dmgType: sp.dmgType });
        startConcentration(combat, c, sp.id, null);
        applyAreaDamage(combat, c, sp, center, r, dc, rollSave, { hitAllies: true });
        return { ok: true };
      }
      case 'flaming_sphere': {
        addEffect(combat, { type: 'flaming_sphere', x: center.x, y: center.y, r: 0, rounds: 10, source: c.id, spellId: sp.id, dc, dmg: sp.dmg });
        startConcentration(combat, c, sp.id, null);
        return { ok: true };
      }
      case 'call_lightning': {
        addEffect(combat, { type: 'call_lightning', x: center.x, y: center.y, r, rounds: 10, source: c.id, spellId: sp.id, dc, dmg: sp.dmg });
        startConcentration(combat, c, sp.id, null);
        applyAreaDamage(combat, c, sp, center, r, dc, rollSave, {});
        return { ok: true };
      }
      case 'ice_storm': {
        addEffect(combat, { type: 'ice', x: center.x, y: center.y, r, rounds: 3 });
        for (const u of combat.units) {
          if (u.dead || !inArea(u)) continue;
          const dmg = roll(combat.rng, '2d8') + roll(combat.rng, '4d6');
          const save = rollSave(u, 'DEX');
          if (save >= dc) applyDamage(combat, u, c, Math.floor(dmg / 2), 'cold', { aoe: true, magical: true });
          else applyDamage(combat, u, c, dmg, 'cold', { aoe: true, magical: true });
        }
        return { ok: true };
      }
      case 'faerie_fire': {
        for (const u of combat.units) {
          if (u.dead || !inArea(u)) continue;
          const save = rollSave(u, 'DEX');
          if (save < dc) { addStatus(u, 'faerie_fired', 'Faerie Fired', 5); log(combat, `✨ ${u.name} is outlined in faerie fire!`); }
        }
        return { ok: true };
      }
      case 'bane': {
        for (const u of combat.units) {
          if (u.dead || !inArea(u) || u.team === c.team) continue;
          const save = rollSave(u, 'CHA');
          if (save < dc) { addStatus(u, 'baned', 'Baned', 5); log(combat, `😖 ${u.name} is baned!`); }
        }
        startConcentration(combat, c, sp.id, null);
        return { ok: true };
      }
      case 'synaptic_static': {
        for (const u of combat.units) {
          if (u.dead || !inArea(u)) continue;
          const dmg = roll(combat.rng, sp.dmg);
          const save = rollSave(u, 'INT');
          if (save >= dc) { applyDamage(combat, u, c, Math.floor(dmg / 2), sp.dmgType, { aoe: true, magical: true }); }
          else { applyDamage(combat, u, c, dmg, sp.dmgType, { aoe: true, magical: true }); addStatus(u, 'synaptic', 'Synaptic Static', 3); }
        }
        return { ok: true };
      }
      case 'sunburst': {
        for (const u of combat.units) {
          if (u.dead || !inArea(u)) continue;
          const dmg = roll(combat.rng, sp.dmg);
          const save = rollSave(u, 'CON');
          if (save >= dc) { applyDamage(combat, u, c, Math.floor(dmg / 2), sp.dmgType, { aoe: true, magical: true }); }
          else { applyDamage(combat, u, c, dmg, sp.dmgType, { aoe: true, magical: true }); addStatus(u, 'blinded', 'Blinded', 2); }
        }
        return { ok: true };
      }
      default: {
        // generic damaging AoE (fireball, shatter, acid splash, flame strike, fire storm, meteor swarm)
        applyAreaDamage(combat, c, sp, center, r, dc, rollSave, { sculpt });
        return { ok: true };
      }
    }
  }

  // targeted spells — but self-mode utility spells (Misty Step, Bless, Aid…)
  // resolve from the AIM point, not a clicked unit, so don't bail here
  if (!target && sp.mode !== 'self') return { ok: true };
  const u = target;

  // attack-roll spells
  if (sp.attack) {
    const obsc = !hasLOS(combat, c.x, c.y, u.x, u.y) || isSmoked(combat, c, u);
    const rr = attackRoll(combat.rng, combat, c, u, atk, { disadvantage: obsc });
    const blessed = c.char.buffs && c.char.buffs.find(b => b.id === 'bless');
    const baned = getStatus(c, 'baned');
    const total = rr.result + rr.bonus + (blessed ? combat.rng.int(1, 4) : 0) - (baned ? combat.rng.int(1, 4) : 0);
    const crit = rr.crit;
    const ac = unitAc(u, combat, true, c, hasFeat(c.char, 'spell_sniper') ? { ignoreCover: true } : null);
    if (total < ac && !crit) {
      log(combat, `${c.name}'s ${sp.name} misses ${u.name} (${total} vs AC ${ac}).`);
      pushPopup(combat, u.x, u.y, { kind: 'miss' });
      return { ok: true, hit: false };
    }
    let rays = 1;
    if (sp.fx === 'scorching_ray') rays = 3 + upcast;
    if (sp.fx === 'eldritch_blast') rays = c.char.level >= 17 ? 4 : c.char.level >= 11 ? 3 : c.char.level >= 5 ? 2 : 1;
    let dmg = 0;
    // per-ray damage: Eldritch Blast 1d10 force each, Scorching Ray 2d6 fire each
    if (sp.fx === 'eldritch_blast') {
      for (let i = 0; i < rays; i++) dmg += roll(combat.rng, '1d10');
    } else if (sp.fx === 'scorching_ray') {
      for (let i = 0; i < rays; i++) dmg += roll(combat.rng, '2d6');
    } else {
      dmg = roll(combat.rng, cantripDmg(sp, c.char.level));
    }
    if (crit) {
      // crits double ONE ray/die, not the whole volley
      if (sp.fx === 'eldritch_blast') dmg += roll(combat.rng, '1d10');
      else if (sp.fx === 'scorching_ray') dmg += roll(combat.rng, '2d6');
      else dmg += roll(combat.rng, cantripDmg(sp, c.char.level) || sp.dmg);
    }
    log(combat, `✨ ${c.name} hits ${u.name} with ${sp.name} for ${dmg} ${sp.dmgType || 'force'} damage${crit ? ' (CRIT!)' : ''}!`);
    result.dmg = applyDamage(combat, u, c, dmg, sp.dmgType || 'force', { magical: true }).dealt;
    // Hex: per 5e it triggers on ANY attack that hits — spell attacks included.
    // Eldritch Blast, Fire Bolt, etc. all deal the warlock's +1d6 necrotic to
    // the cursed target, as a separate (delayed) damage event + popup.
    if (result.dmg > 0 && !u.dead && u.hp > 0) {
      const hexSt = getStatus(u, 'hexed');
      if (hexSt && hexSt.data === c.id) {
        const hexBonus = roll(combat.rng, '1d6');
        log(combat, `🔮 ${c.name}'s Hex burns ${u.name} for ${hexBonus} necrotic damage.`);
        applyDamage(combat, u, c, hexBonus, 'necrotic', { magical: true, popupDelay: 1150 });
      }
    }
    if (sp.fx === 'ray_of_frost') addStatus(u, 'slowed_ray', 'Slowed', 1);
    if (sp.fx === 'shocking_grasp') { u.reactionUsed = true; }
    if (sp.fx === 'chill_touch') addStatus(u, 'no_healing', 'No Healing', 1);
    if (sp.fx === 'thorn_whip') {
      const dx = Math.sign(c.x - u.x), dy = Math.sign(c.y - u.y);
      const nx = u.x + dx, ny = u.y + dy;
      if (inBounds(combat, nx, ny) && isPassable(combat, nx, ny) && !unitAt(combat, nx, ny)) { u.x = nx; u.y = ny; }
    }
    if (sp.fx === 'guiding_bolt' || sp.id === 'guiding_bolt') {
      addStatus(u, 'guiding', 'Guiding Bolt', 2);
      log(combat, 'The next attack against the target has advantage!');
    }
    if (sp.fx === 'vampiric_touch') {
      const heal = Math.floor(result.dmg / 2);
      c.hp = clamp(c.hp + heal, 0, c.maxHp);
      log(combat, `${c.name} drains ${heal} life!`);
    }
    if (sp.fx === 'chain_lightning') {
      const others = aliveEnemies(combat).filter(e => e.id !== u.id).slice(0, 2);
      for (const o of others) {
        const save = rollSave(o, 'DEX');
        const dd = roll(combat.rng, sp.dmg);
        if (save >= dc) { applyDamage(combat, o, c, Math.floor(dd / 2), sp.dmgType, { aoe: true, magical: true }); log(combat, `Lightning arcs to ${o.name}!`); }
        else { applyDamage(combat, o, c, dd, sp.dmgType, { aoe: true, magical: true }); log(combat, `Lightning arcs to ${o.name}!`); }
      }
    }
    return { ok: true, hit: true };
  }

  // saving-throw spells
  if (sp.save && (sp.dmg || sp.fx)) {
    if (!u) return { ok: true };
    const save = rollSave(u, sp.save);
    if (sp.dmg) {
      const dmgStr = typeof sp.dmg === 'string' ? sp.dmg : cantripDmg(sp, c.char.level);
      const dmg = roll(combat.rng, dmgStr);
      if (save >= dc) {
        const half = sp.halfOnSave ? Math.floor(dmg / 2) : 0;
        log(combat, `${u.name} saves vs ${sp.name}${sp.halfOnSave ? ` (${half} ${sp.dmgType})` : ' (no damage)'}.`);
        result.dmg = applyDamage(combat, u, c, half, sp.dmgType, { magical: true }).dealt;
      } else {
        log(combat, `${u.name} fails the save vs ${sp.name} (${dmg} ${sp.dmgType})!`);
        result.dmg = applyDamage(combat, u, c, dmg, sp.dmgType, { magical: true }).dealt;
        if (sp.fx === 'toll_the_dead') addStatus(u, 'tolled', 'Tolled', 1);
        if (sp.fx === 'vicious_mockery') { addStatus(u, 'mocked', 'Mocked', 1); log(combat, `${u.name} has disadvantage on its next attack!`); }
        if (sp.fx === 'dissonant_whispers') fleeUnit(combat, u, c);
        if (sp.fx === 'mind_spike') { /* no extra */ }
        if (sp.fx === 'disintegrate') { /* handled by dmg */ }
      }
      if (sp.fx === 'synaptic_static' && save < dc) addStatus(u, 'synaptic', 'Synaptic Static', 3);
      return { ok: true };
    }
    // fx-only save spells
    switch (sp.fx) {
      case 'hideous_laughter': {
        if (save < dc) { addStatus(u, 'hideous_laughter', 'Laughing', 3); addStatus(u, 'prone', 'Prone', 3); log(combat, `😂 ${u.name} collapses in laughter!`); }
        else log(combat, `${u.name} shrugs off the laughter.`);
        startConcentration(combat, c, sp.id, { target: u.id });
        return { ok: true };
      }
      case 'hold_person': case 'hold_monster': {
        if (save < dc) { addStatus(u, 'paralyzed', 'Paralyzed', 3); log(combat, `⛓ ${u.name} is held!`); }
        else log(combat, `${u.name} resists being held.`);
        startConcentration(combat, c, sp.id, { target: u.id });
        return { ok: true };
      }
      case 'polymorph': {
        if (save < dc) { addStatus(u, 'polymorphed', 'Polymorphed', 4); log(combat, `🐑 ${u.name} is turned into a sheep!`); }
        startConcentration(combat, c, sp.id, { target: u.id });
        return { ok: true };
      }
      case 'banishment': {
        if (save < dc) { addStatus(u, 'banished', 'Banished', 2); log(combat, `🌀 ${u.name} is banished!`); }
        startConcentration(combat, c, sp.id, { target: u.id });
        return { ok: true };
      }
      case 'bestow_curse': {
        if (save < dc) { addStatus(u, 'bestow_curse', 'Cursed', 5); log(combat, `☠ ${u.name} is cursed!`); }
        startConcentration(combat, c, sp.id, { target: u.id });
        return { ok: true };
      }
      case 'power_word_kill': {
        if (u.hp < 100) {
          log(combat, `💀 ${c.name} speaks a word of death. ${u.name} dies instantly!`);
          u.hp = 0;
          applyDamage(combat, u, c, 999, 'force', { ignoreImmunity: true, quiet: true });
        } else log(combat, `${u.name} is too powerful for Power Word Kill.`);
        return { ok: true };
      }
      case 'hellish_rebuke': {
        const dmg = roll(combat.rng, upcastDmg(sp.dmg, upcast));
        if (save >= dc) { applyDamage(combat, u, c, Math.floor(dmg / 2), sp.dmgType, { magical: true }); }
        else applyDamage(combat, u, c, dmg, sp.dmgType, { magical: true });
        log(combat, `🔥 Hellish Rebuke scorches ${u.name}!`);
        return { ok: true };
      }
      default: {
        if (sp.dmg) {
          const dmg = roll(combat.rng, sp.dmg);
          const half = save >= dc ? Math.floor(dmg / 2) : dmg;
          result.dmg = applyDamage(combat, u, c, half, sp.dmgType, { magical: true }).dealt;
        }
        return { ok: true };
      }
    }
  }

  // buffs & utility
  switch (sp.fx) {
    case 'cure_wounds_effect': case undefined: {
      if (sp.heal) {
        const amount = roll(combat.rng, upcastHeal(sp.heal, upcast)) + mod(c.char.abilities[c.char.spellAbility]);
        healUnit(combat, c, u, amount);
        return { ok: true };
      }
      break;
    }
    case 'bless': {
      const allies = alivePlayers(combat).slice(0, 3);
      for (const a of allies) { a.char.buffs.push({ id: 'bless', name: 'Bless', rounds: 10 }); }
      log(combat, `🙏 ${c.name} blesses ${allies.map(a => a.name).join(', ')}.`);
      startConcentration(combat, c, sp.id, null);
      return { ok: true };
    }
    case 'shield_of_faith': {
      u.char.buffs.push({ id: 'shield_of_faith', name: 'Shield of Faith', rounds: 10 });
      log(combat, `🛡 ${u.name} is warded by faith (+2 AC).`);
      startConcentration(combat, c, sp.id, { target: u.id });
      return { ok: true };
    }
    case 'mage_armor': {
      c.char.buffs.push({ id: 'mage_armor', name: 'Mage Armor', rounds: 999 });
      log(combat, `🧙 ${c.name} is armored by magic.`);
      return { ok: true };
    }
    case 'heroism': {
      addStatus(u, 'heroism', 'Heroism', 10);
      log(combat, `🦁 ${u.name} is filled with courage.`);
      startConcentration(combat, c, sp.id, { target: u.id });
      return { ok: true };
    }
    case 'hex': {
      addStatus(u, 'hexed', 'Hexed', 10, c.id);
      log(combat, `🔮 ${u.name} is hexed.`);
      startConcentration(combat, c, sp.id, { target: u.id });
      return { ok: true };
    }
    case 'hunters_mark': {
      addStatus(u, 'hunters_marked', "Hunter's Mark", 10, c.id);
      log(combat, `🎯 ${u.name} is marked.`);
      startConcentration(combat, c, sp.id, { target: u.id });
      return { ok: true };
    }
    case 'divine_favor': {
      c.char.buffs.push({ id: 'divine_favor', name: 'Divine Favor', rounds: 10 });
      startConcentration(combat, c, sp.id, null);
      return { ok: true };
    }
    case 'armor_of_agathys': {
      const amount = 5 + upcast * 5;
      c.tempHp = Math.max(c.tempHp, amount);
      addStatus(c, 'armor_of_agathys', 'Armor of Agathys', 10, amount);
      log(combat, `❄ ${c.name} is cloaked in frost armor (${amount} temp HP).`);
      return { ok: true };
    }
    case 'wrathful_smite': case 'searing_smite': case 'branding_smite': {
      addStatus(c, sp.fx, sp.name, 10);
      log(combat, `${c.name}'s weapon hums with ${sp.name} energy.`);
      return { ok: true };
    }
    case 'expeditious_retreat': {
      c.char.buffs.push({ id: 'expeditious_retreat', name: 'Expeditious Retreat', rounds: 10 });
      startConcentration(combat, c, sp.id, null);
      return { ok: true };
    }
    case 'misty_step': {
      if (opts.aim) {
        const d = Math.max(Math.abs(opts.aim.x - c.x), Math.abs(opts.aim.y - c.y));
        if (d <= 3 && isPassable(combat, opts.aim.x, opts.aim.y) && !unitAt(combat, opts.aim.x, opts.aim.y)) {
          c.x = opts.aim.x; c.y = opts.aim.y;
          log(combat, `💨 ${c.name} teleports!`);
        }
      }
      return { ok: true };
    }
    case 'mirror_image': {
      addStatus(c, 'mirror_image', 'Mirror Image', 3);
      log(combat, `👥 ${c.name} conjures illusory duplicates.`);
      return { ok: true };
    }
    case 'invisibility': {
      addStatus(u, 'invisible', 'Invisible', 10);
      log(combat, `👻 ${u.name} fades from sight!`);
      startConcentration(combat, c, sp.id, { target: u.id });
      return { ok: true };
    }
    case 'greater_invisibility': {
      addStatus(u, 'invisible', 'Invisible', 10);
      log(combat, `👻 ${u.name} vanishes entirely!`);
      startConcentration(combat, c, sp.id, { target: u.id });
      return { ok: true };
    }
    case 'aid': {
      const allies = alivePlayers(combat).slice(0, 3);
      for (const a of allies) {
        const v = 5 + upcast * 5;
        a.char.buffs.push({ id: 'aid', name: 'Aid', rounds: 999, value: v });
        a.maxHp = a.char.maxHp + v;
        a.hp += v;
      }
      log(combat, `💖 ${c.name} bolsters the party with Aid!`);
      return { ok: true };
    }
    case 'lesser_restoration': {
      u.statuses = u.statuses.filter(s => !['poisoned', 'paralyzed', 'blinded', 'stunned', 'burning', 'bleeding'].includes(s.id));
      log(combat, `🌿 ${u.name} is cleansed.`);
      return { ok: true };
    }
    case 'spiritual_weapon': {
      addEffect(combat, { type: 'spiritual_weapon', x: c.x, y: c.y, rounds: 10, source: c.id, spellId: sp.id });
      log(combat, `⚔ ${c.name} summons a spiritual weapon!`);
      return { ok: true };
    }
    case 'haste': {
      addStatus(u, 'hasted', 'Hasted', 10);
      u.moveRemaining += computeSpeed(u.char);
      log(combat, `⚡ ${u.name} is hasted!`);
      startConcentration(combat, c, sp.id, { target: u.id });
      return { ok: true };
    }
    case 'spirit_guardians': {
      addEffect(combat, { type: 'spirit_guardians', x: c.x, y: c.y, r: 2, rounds: 10, source: c.id, spellId: sp.id, dc });
      startConcentration(combat, c, sp.id, null);
      log(combat, `✨ ${c.name} is wreathed in spirit guardians!`);
      applyAreaDamage(combat, c, { dmg: '3d8', dmgType: 'radiant', save: 'WIS' }, { x: c.x, y: c.y }, 2, dc, rollSave, { excludeTeam: 'player' });
      return { ok: true };
    }
    case 'revivify': {
      if (u.dead && u.deathRound !== null && combat.round - u.deathRound <= 3) {
        u.dead = false;
        u.hp = 1;
        u.statuses = [];
        u.char.dead = false;
        log(combat, `🌟 REVIVIFY! ${u.name} gasps back to life with 1 HP!`);
      } else {
        log(combat, 'Too late — the soul has departed.');
      }
      return { ok: true };
    }
    case 'mass_healing_word': case 'mass_cure_wounds': {
      const allies = alivePlayers(combat).filter(a => a.hp < a.maxHp).slice(0, 3);
      const amount = roll(combat.rng, upcastHeal(sp.heal, upcast)) + mod(c.char.abilities[c.char.spellAbility]);
      for (const a of allies) healUnit(combat, c, a, amount);
      log(combat, `💖 ${c.name} heals ${allies.length} allies for ${amount} each.`);
      return { ok: true };
    }
    case 'protection_from_energy': {
      const type = opts.element || 'fire';
      u.char.buffs.push({ id: 'protection_from_energy', name: `Protection from ${type}`, rounds: 999, type });
      log(combat, `🛡 ${u.name} resists ${type}.`);
      return { ok: true };
    }
    case 'bestow_curse_done': break;
    case 'blink': {
      addStatus(c, 'blink', 'Blink', 10);
      log(combat, `🌀 ${c.name} flickers between planes.`);
      return { ok: true };
    }
    case 'thunder_step': {
      const dmg = roll(combat.rng, '3d10');
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const u2 = unitAt(combat, c.x + dx, c.y + dy);
        if (u2 && u2.team !== c.team) {
          const save = rollSave(u2, 'CON');
          if (save >= dc) applyDamage(combat, u2, c, Math.floor(dmg / 2), 'thunder', { aoe: true, magical: true });
          else applyDamage(combat, u2, c, dmg, 'thunder', { aoe: true, magical: true });
        }
      }
      if (opts.aim) {
        const d = Math.max(Math.abs(opts.aim.x - c.x), Math.abs(opts.aim.y - c.y));
        if (d <= 6 && isPassable(combat, opts.aim.x, opts.aim.y) && !unitAt(combat, opts.aim.x, opts.aim.y)) {
          c.x = opts.aim.x; c.y = opts.aim.y;
        }
      }
      log(combat, `⚡ ${c.name} vanishes in a thunderclap!`);
      return { ok: true };
    }
    case 'aura_of_vitality': {
      addEffect(combat, { type: 'aura_of_vitality', x: c.x, y: c.y, rounds: 10, source: c.id, spellId: sp.id });
      startConcentration(combat, c, sp.id, null);
      return { ok: true };
    }
    case 'wall_of_fire': {
      if (opts.wall) {
        for (const t of opts.wall) addEffect(combat, { type: 'wall_of_fire', x: t.x, y: t.y, rounds: 10, source: c.id, spellId: sp.id });
        startConcentration(combat, c, sp.id, null);
        log(combat, `🔥 ${c.name} conjures a wall of fire!`);
        // damage adjacent now
        for (const t of opts.wall) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const u2 = unitAt(combat, t.x + dx, t.y + dy);
            if (u2 && u2.team !== c.team) applyDamage(combat, u2, c, roll(combat.rng, '5d8'), 'fire', { aoe: true, magical: true });
          }
        }
      }
      return { ok: true };
    }
    case 'wall_of_stone': {
      if (opts.wall) {
        for (const t of opts.wall) addEffect(combat, { type: 'stone_wall', x: t.x, y: t.y, hp: 36, rounds: 999 });
        log(combat, `🧱 ${c.name} raises a wall of stone!`);
      }
      return { ok: true };
    }
    case 'heal': {
      healUnit(combat, c, u, 70);
      u.statuses = [];
      return { ok: true };
    }
    case 'death_ward': {
      u.char.buffs.push({ id: 'death_ward', name: 'Death Ward', rounds: 999 });
      log(combat, `⚜ ${u.name} is warded against death.`);
      return { ok: true };
    }
    case 'stoneskin': {
      u.char.buffs.push({ id: 'stoneskin', name: 'Stoneskin', rounds: 10 });
      log(combat, `🗿 ${u.name}'s skin hardens.`);
      startConcentration(combat, c, sp.id, { target: u.id });
      return { ok: true };
    }
    case 'fire_shield': {
      c.char.buffs.push({ id: 'fire_shield', name: 'Fire Shield', rounds: 999 });
      log(combat, `🔥 ${c.name} is wreathed in flames.`);
      return { ok: true };
    }
    case 'dimension_door': {
      if (opts.aim) {
        const d = Math.max(Math.abs(opts.aim.x - c.x), Math.abs(opts.aim.y - c.y));
        if (d <= 10 && isPassable(combat, opts.aim.x, opts.aim.y) && !unitAt(combat, opts.aim.x, opts.aim.y)) {
          c.x = opts.aim.x; c.y = opts.aim.y;
          log(combat, `🚪 ${c.name} steps through a door of light!`);
        }
      }
      return { ok: true };
    }
    case 'crown_of_stars': {
      addStatus(c, 'crown_of_stars', 'Crown of Stars', 7, 7);
      log(combat, `⭐ ${c.name} is crowned with seven stars.`);
      return { ok: true };
    }
    case 'dragon_breath': {
      addStatus(u, 'dragon_breath', "Dragon's Breath", 10);
      log(combat, `🐲 ${u.name} gains a breath weapon!`);
      startConcentration(combat, c, sp.id, { target: u.id });
      return { ok: true };
    }
    case 'pass_without_trace': {
      for (const p of alivePlayers(combat)) p.char.buffs.push({ id: 'pass_without_trace', rounds: 999 });
      log(combat, '🌫 The party is veiled in shadow.');
      return { ok: true };
    }
    default: {
      // heal by default for healer spells without fx
      if (sp.heal) {
        const amount = roll(combat.rng, upcastHeal(sp.heal, upcast)) + mod(c.char.abilities[c.char.spellAbility]);
        healUnit(combat, c, u, amount);
        return { ok: true };
      }
      return { ok: true };
    }
  }
  return { ok: true };
}

function upcastHeal(heal, upcast) {
  const m = heal.match(/^(\d+)d(\d+)(.*)$/);
  if (!m) return heal;
  const n = Number(m[1]) + Math.max(0, upcast);
  return `${n}d${m[2]}${m[3]}`;
}

export function applySpellDamage(combat, c, u, sp, dc, rollSave, result, total) {
  const dmgStr = typeof sp.dmg === 'string' ? sp.dmg : cantripDmg(sp, c.char.level);
  const dmg = roll(combat.rng, dmgStr);
  const save = rollSave(u, sp.save);
  if (save >= dc) {
    const half = sp.halfOnSave ? Math.floor(dmg / 2) : 0;
    if (half > 0) Audio.play('spells/impact', { vol: 0.7, throttle: 120 });
    return applyDamage(combat, u, c, half, sp.dmgType, { aoe: true, magical: true }).dealt;
  } else {
    Audio.play('spells/impact', { vol: 0.85, throttle: 120 });
    return applyDamage(combat, u, c, dmg, sp.dmgType, { aoe: true, magical: true }).dealt;
  }
}

export function applyAreaDamage(combat, c, sp, center, r, dc, rollSave, opts = {}) {
  let total = 0;
  for (const u of combat.units) {
    if (u.dead) continue;
    const d = Math.max(Math.abs(u.x - center.x), Math.abs(u.y - center.y));
    if (d > r) continue;
    if (opts.excludeTeam && u.team === opts.excludeTeam) continue;
    if (opts.team && u.team !== opts.team) continue;
    const sculpt = opts.sculpt && sp.school === 'Evocation' && u.team === c.team;
    if (u.team === c.team && !sculpt && !opts.hitAllies) continue;
    total += applySpellDamage(combat, c, u, sp, dc, rollSave, null, total);
  }
  return total;
}

export function healUnit(combat, healer, u, amount, opts = {}) {
  if (u.dead) return 0;
  const noHeal = getStatus(u, 'no_healing');
  if (noHeal) {
    log(combat, `${u.name} cannot be healed right now!`);
    return 0;
  }
  let amt = amount;
  if (healer.char.cls.id === 'cleric' && healer.char.subclassId === 'life' && !opts.noDisciple) amt += 2 + (opts.spellLevel || 0);
  const before = u.hp;
  u.hp = clamp(u.hp + amt, 0, u.maxHp);
  const healed = u.hp - before;
  if (u.hp > 0 && u.statuses.some(s => s.id === 'dying')) {
    u.statuses = u.statuses.filter(s => s.id !== 'dying');
  }
  log(combat, `💚 ${u.name} recovers ${healed} HP (${u.hp}/${u.maxHp}).`);
  if (healed > 0) pushPopup(combat, u.x, u.y, { kind: 'heal', amount: healed });
  return healed;
}

function fleeUnit(combat, u, from) {
  const dx = u.x > from.x ? 1 : -1, dy = u.y > from.y ? 1 : -1;
  let nx = u.x + dx, ny = u.y + dy;
  if (!isPassable(combat, nx, ny) || unitAt(combat, nx, ny)) { nx = u.x + (dx === 1 ? -1 : 1); ny = u.y; }
  if (!isPassable(combat, nx, ny) || unitAt(combat, nx, ny)) { nx = u.x; ny = u.y + (dy === 1 ? -1 : 1); }
  if (isPassable(combat, nx, ny) && !unitAt(combat, nx, ny)) {
    u.x = nx; u.y = ny;
    log(combat, `${u.name} flees in terror!`);
  }
  addStatus(u, 'frightened', 'Frightened', 2, { source: from.id });
}

export function startConcentration(combat, caster, spellId, data) {
  if (caster.concentration) {
    log(combat, `${caster.name} drops ${SPELL_MAP[caster.concentration.spellId]?.name || 'their spell'} to concentrate on a new one.`);
    endConcentration(combat, caster, true);
  }
  caster.concentration = { spellId, data };
}

export function endConcentration(combat, caster, quiet) {
  const conc = caster.concentration;
  caster.concentration = null;
  if (!conc) return;
  // remove related effects
  combat.effects = combat.effects.filter(e => !(e.source === caster.id && e.spellId === conc.spellId && e.rounds < 100));
  const sp = SPELL_MAP[conc.spellId];
  if (!sp) return;
  switch (sp.fx) {
    case 'bless': {
      for (const u of combat.units) u.char.buffs = (u.char.buffs || []).filter(b => b.id !== 'bless');
      break;
    }
    case 'shield_of_faith': {
      if (conc.data && conc.data.target) {
        const t = combat.units.find(u => u.id === conc.data.target);
        if (t) t.char.buffs = (t.char.buffs || []).filter(b => b.id !== 'shield_of_faith');
      }
      break;
    }
    case 'hex': {
      if (conc.data && conc.data.target) {
        const t = combat.units.find(u => u.id === conc.data.target);
        if (t) removeStatus(t, 'hexed');
      }
      break;
    }
    case 'hunters_mark': {
      if (conc.data && conc.data.target) {
        const t = combat.units.find(u => u.id === conc.data.target);
        if (t) removeStatus(t, 'hunters_marked');
      }
      break;
    }
    case 'divine_favor': caster.char.buffs = (caster.char.buffs || []).filter(b => b.id !== 'divine_favor'); break;
    case 'haste': {
      if (conc.data && conc.data.target) {
        const t = combat.units.find(u => u.id === conc.data.target);
        if (t) { removeStatus(t, 'hasted'); if (!quiet) log(combat, `${t.name} is lethargic after Haste fades!`); }
      }
      break;
    }
    case 'polymorph': case 'banishment': case 'bestow_curse': case 'hold_person': case 'hold_monster': case 'hideous_laughter': {
      if (conc.data && conc.data.target) {
        const t = combat.units.find(u => u.id === conc.data.target);
        if (t) {
          for (const id of ['polymorphed', 'banished', 'bestow_curse', 'paralyzed', 'hideous_laughter', 'prone']) {
            if (id === 'paralyzed') {
              if (sp.fx === 'hold_person' || sp.fx === 'hold_monster') removeStatus(t, 'paralyzed');
            } else if (id === 'prone') {
              if (sp.fx === 'hideous_laughter') removeStatus(t, 'prone');
            } else removeStatus(t, id);
          }
          if (!quiet) log(combat, `${t.name} is freed as concentration breaks!`);
        }
      }
      break;
    }
    case 'invisibility': case 'greater_invisibility': {
      if (conc.data && conc.data.target) {
        const t = combat.units.find(u => u.id === conc.data.target);
        if (t) removeStatus(t, 'invisible');
      }
      break;
    }
    case 'spirit_guardians': case 'moonbeam': case 'cloud_of_daggers': case 'flaming_sphere': case 'call_lightning': case 'wall_of_fire': case 'cloudkill': {
      combat.effects = combat.effects.filter(e => e.source !== caster.id || e.spellId !== conc.spellId);
      break;
    }
    case 'entangle': {
      for (const u of combat.units) removeStatus(u, 'entangled');
      break;
    }
    case 'hypnotic_pattern': {
      for (const u of combat.units) removeStatus(u, 'hypnotized');
      break;
    }
    case 'slow': {
      for (const u of combat.units) removeStatus(u, 'slowed');
      break;
    }
    case 'stoneskin': {
      if (conc.data && conc.data.target) {
        const t = combat.units.find(u => u.id === conc.data.target);
        if (t) t.char.buffs = (t.char.buffs || []).filter(b => b.id !== 'stoneskin');
      }
      break;
    }
    case 'aura_of_vitality': {
      combat.effects = combat.effects.filter(e => e.type !== 'aura_of_vitality' || e.source !== caster.id);
      break;
    }
    default: break;
  }
}

function wildSurge(combat, caster) {
  const effects = [
    () => { log(combat, 'A cloud of butterflies erupts — all creatures within 3 tiles are healed 2d6!');
      for (const u of combat.units) if (Math.max(Math.abs(u.x - caster.x), Math.abs(u.y - caster.y)) <= 3) healUnit(combat, caster, u, roll(combat.rng, '2d6')); },
    () => { log(combat, `A fireball explodes centered on ${caster.name}!`);
      for (const u of combat.units) if (Math.max(Math.abs(u.x - caster.x), Math.abs(u.y - caster.y)) <= 2) {
        const dmg = roll(combat.rng, '8d6');
        const save = d20(combat.rng) + (u.char.stats ? mod(u.char.stats.DEX) : savingThrowMod(u.char, 'DEX'));
        if (save < caster.char.spellSaveDC) applyDamage(combat, u, caster, dmg, 'fire', { aoe: true, magical: true });
        else applyDamage(combat, u, caster, Math.floor(dmg / 2), 'fire', { aoe: true, magical: true });
      } },
    () => { log(combat, `${caster.name} turns invisible!`); addStatus(caster, 'invisible', 'Invisible', 3); },
    () => { log(combat, `${caster.name} is surrounded by protective spirits (+2 AC)!`); caster.char.buffs.push({ id: 'wild_ward', rounds: 10 }); },
  ];
  combat.rng.pick(effects)();
}

// ============================== ITEMS ==============================
export function useItem(combat, user, itemUid, target) {
  const char = user.char;
  const idx = char.inventory.findIndex(i => i.uid === itemUid);
  if (idx < 0) return { ok: false, msg: 'Item not found.' };
  const item = char.inventory[idx];
  const def = CONSUMABLES[item.id] || null;
  if (!def) return { ok: false, msg: 'Unknown item.' };

  switch (def.kind) {
    case 'potion': {
      Audio.play('items/potion_drink', { vol: 0.85 });
      if (def.heal) {
        const amt = roll(combat.rng, def.heal);
        healUnit(combat, user, user, amt);
      }
      if (def.buff) {
        if (def.buff.str) { user.char.buffs.push({ id: 'str_potion', rounds: 999, value: def.buff.str }); }
        if (def.buff.haste) addStatus(user, 'hasted', 'Hasted', 10);
        if (def.buff.resistAll) addStatus(user, 'resist_all', 'Resistant', 10);
        if (def.buff.breath) addStatus(user, 'dragon_breath', 'Fire Breath', 10);
        if (def.buff.poisonImmune) addStatus(user, 'poison_immune', 'Antitoxin', 10);
      }
      log(combat, `🧪 ${user.name} uses ${def.name}.`);
      char.inventory.splice(idx, 1);
      return { ok: true };
    }
    case 'throw': {
      if (!target) return { ok: false, msg: 'Need a target.' };
      Audio.play('items/potion_throw', { vol: 0.8 });
      const inter = interceptProjectile(combat, user, target, { label: def.name });
      if (inter.redirected && inter.target) target = inter.target;
      const impact = (inter.stopped && inter.block) ? inter.block : target;
      if (def.fx === 'smoke') {
        addEffect(combat, { type: 'smoke', x: impact.x, y: impact.y, r: 2, rounds: 3 });
        log(combat, `💨 ${user.name} hurls a smoke bomb!`);
        Audio.play('items/glass_break', { vol: 0.7, delay: 140 });
        char.inventory.splice(idx, 1);
        return { ok: true, blocked: !!inter.stopped };
      }
      let dmg = roll(combat.rng, def.dmg);
      let type = def.dmgType;
      const foeType = target.char && target.char.type;
      if (def.id === 'holy_water' && (foeType === 'fiend' || foeType === 'undead') && !inter.stopped) dmg *= 2;
      const hitName = (inter.stopped && inter.block) ? inter.block.name : target.name;
      scheduleWeaponFx(combat, user, impact, { name: def.name, range: 'ranged(6)', properties: ['thrown(6)'], dmgType: type }, { force: true });
      log(combat, `${user.name} hurls ${def.name} at ${hitName} (${dmg} ${type})!`);
      // flask arcs through the air… glass shatters on impact…
      Audio.play('items/glass_break', { vol: 0.8, delay: 140 });
      if (type === 'fire') Audio.play('spells/fire', { vol: 0.7, delay: 260 });
      else if (type === 'acid') Audio.play('spells/acid', { vol: 0.7, delay: 260 });
      else if (type === 'radiant') Audio.play('spells/radiant', { vol: 0.7, delay: 260 });
      if (inter.stopped && inter.object && inter.block) {
        applyObjectDamage(combat, inter.block.x, inter.block.y, dmg, type, user);
      } else if (inter.stopped) {
        // slammed into an indestructible wall
      } else if (target.id) {
        applyDamage(combat, target, user, dmg, type, { noRetaliate: true });
        if (def.fx === 'burning') addStatus(target, 'burning', 'Burning', 3);
      }
      char.inventory.splice(idx, 1);
      return { ok: true, blocked: !!inter.stopped };
    }
    case 'scroll': {
      const sp = SPELL_MAP[def.casts];
      if (!sp) return { ok: false };
      log(combat, `📜 ${user.name} reads a scroll of ${sp.name}!`);
      Audio.play('items/scroll', { vol: 0.7 });
      const ok = castSpell(combat, user, sp.id, { scroll: true, target, aim: target ? { x: target.x, y: target.y } : { x: user.x, y: user.y }, level: Math.max(sp.level, char.level >= 5 ? 3 : sp.level) });
      char.inventory.splice(idx, 1);
      return { ok: !!ok };
    }
  }
  return { ok: false };
}

export function addEffect(combat, e) {
  combat.effects.push(e);
  return e;
}

// ============================== STATUS TICKING ==============================
export function tickStatuses(combat, u) {
  if (u.dead) return;
  const char = u.char;

  // burning
  const burning = getStatus(u, 'burning');
  if (burning) {
    const dmg = roll(combat.rng, '1d4');
    log(combat, `🔥 ${u.name} burns (${dmg} fire).`);
    applyDamage(combat, u, null, dmg, 'fire', { noRetaliate: true, noCrit: true });
    const dex = char.stats ? mod(char.stats.DEX) : savingThrowMod(char, 'DEX');
    if (d20(combat.rng) + dex >= 10) {
      removeStatus(u, 'burning');
      log(combat, `${u.name} puts out the flames.`);
    }
  }
  // bleeding
  const bleeding = getStatus(u, 'bleeding');
  if (bleeding) {
    const dmg = roll(combat.rng, '1d4');
    applyDamage(combat, u, null, dmg, 'slashing', { noRetaliate: true, noCrit: true, quiet: true });
  }
  // engulfed
  const engulfed = getStatus(u, 'engulfed');
  if (engulfed) {
    const dmg = roll(combat.rng, '3d6');
    applyDamage(combat, u, null, dmg, 'acid', { noRetaliate: true, noCrit: true });
  }
  // ring of regeneration
  const regen = char.trinkets && char.trinkets.find(t => t.regen);
  if (regen && u.hp > 0) {
    healUnit(combat, u, u, roll(combat.rng, regen.regen), { noDisciple: true });
  }
  // heroism temp hp
  const heroism = getStatus(u, 'heroism');
  if (heroism) u.tempHp = Math.max(u.tempHp, 2);

  // hazard standing effects
  const t = combat.grid[u.y][u.x];
  if (t.hazard === 'fire' && u.hp > 0) {
    const dmg = roll(combat.rng, '1d4');
    log(combat, `🔥 ${u.name} stands in flames (${dmg} fire).`);
    Audio.play('combat/hazard_fire', { vol: 0.6, throttle: 600 });
    applyDamage(combat, u, null, dmg, 'fire', { noRetaliate: true, noCrit: true });
  } else if (t.hazard === 'lava' && u.hp > 0) {
    const dmg = roll(combat.rng, '2d10');
    log(combat, `🌋 ${u.name} stands in lava (${dmg} fire)!`);
    Audio.play('combat/hazard_lava', { vol: 0.6, throttle: 600 });
    applyDamage(combat, u, null, dmg, 'fire', { noRetaliate: true, noCrit: true });
  }

  // ongoing effects areas
  for (const e of combat.effects) {
    const inArea = e.r !== undefined && Math.max(Math.abs(u.x - e.x), Math.abs(u.y - e.y)) <= e.r;
    if (!inArea) continue;
    if (e.type === 'spirit_guardians' && u.team !== 'player') {
      const caster = combat.units.find(x => x.id === e.source);
      const dc = caster ? caster.char.spellSaveDC : e.dc;
      const save = d20(combat.rng) + (char.stats ? mod(char.stats.WIS) : savingThrowMod(char, 'WIS'));
      if (save >= dc) applyDamage(combat, u, caster, Math.floor(roll(combat.rng, '3d8') / 2), 'radiant', { aoe: true, quiet: true, magical: true });
      else applyDamage(combat, u, caster, roll(combat.rng, '3d8'), 'radiant', { aoe: true, quiet: true, magical: true });
    }
    if (e.type === 'cloudkill') {
      const caster = combat.units.find(x => x.id === e.source);
      const dc = caster ? caster.char.spellSaveDC : 15;
      const save = d20(combat.rng) + (char.stats ? mod(char.stats.CON) : savingThrowMod(char, 'CON'));
      if (save >= dc) applyDamage(combat, u, caster, Math.floor(roll(combat.rng, '5d8') / 2), 'poison', { aoe: true, quiet: true, magical: true });
      else applyDamage(combat, u, caster, roll(combat.rng, '5d8'), 'poison', { aoe: true, quiet: true, magical: true });
    }
    if (e.type === 'cloud_of_daggers' || e.type === 'moonbeam') {
      const caster = combat.units.find(x => x.id === e.source);
      const dc = caster ? caster.char.spellSaveDC : e.dc;
      const save = d20(combat.rng) + (char.stats ? mod(char.stats.CON) : savingThrowMod(char, 'CON'));
      const dmg = roll(combat.rng, e.dmg || '2d10');
      if (save >= dc) applyDamage(combat, u, caster, Math.floor(dmg / 2), e.dmgType || 'radiant', { aoe: true, quiet: true, magical: true });
      else applyDamage(combat, u, caster, dmg, e.dmgType || 'radiant', { aoe: true, quiet: true, magical: true });
    }
  }

  // decrement status rounds
  for (const s of u.statuses.slice()) {
    if (s.rounds !== undefined) s.rounds -= 1;
    if (s.rounds !== undefined && s.rounds <= 0 && !['dying', 'overboard'].includes(s.id)) {
      u.statuses = u.statuses.filter(x => x !== s);
      if (s.id === 'banished') log(combat, `${u.name} returns from banishment!`);
      if (s.id === 'paralyzed' && s.data !== 'concentration') log(combat, `${u.name} breaks free!`);
    }
  }
  // overboard recovery
  if (u.overboard) {
    u.overboardRounds -= 1;
    if (u.overboardRounds <= 0) {
      u.overboard = false;
      removeStatus(u, 'overboard');
      // wash ashore at nearest edge
      let best = null;
      for (let x = 0; x < combat.w; x++) for (let y = 0; y < combat.h; y++) {
        if (isPassable(combat, x, y) && !unitAt(combat, x, y)) {
          const d = Math.abs(x - u.x) + Math.abs(y - u.y);
          if (!best || d < best.d) best = { x, y, d };
        }
      }
      if (best) { u.x = best.x; u.y = best.y; }
      u.hp = Math.max(1, u.hp - roll(combat.rng, '2d6'));
      log(combat, `🌊 ${u.name} drags themselves back aboard, soaked and battered!`);
    }
  }
  // regenerate monsters (suppressed for a round after fire/acid damage)
  if (char.powers && char.powers.includes('regeneration') && u.hp > 0 && u.hp < u.maxHp) {
    if (!u.regenSuppressed || combat.round > u.regenSuppressed) {
      u.hp = clamp(u.hp + 10, 0, u.maxHp);
      log(combat, `${u.name} regenerates 10 HP.`);
    }
  }
}

export function tickStartOfTurn(combat, u) {
  // death saves for dying players
  const dying = getStatus(u, 'dying');
  if (u.hp <= 0 && u.team === 'player' && !u.dead) {
    if (!dying) addStatus(u, 'dying', 'Dying', 5);
    const s = getStatus(u, 'dying');
    s.fails = s.fails || 0;
    s.successes = s.successes || 0;
    const rollVal = d20(combat.rng);
    if (rollVal === 20) { s.successes += 2; log(combat, `🌟 ${u.name} makes a miraculous recovery (death save 20)!`); }
    else if (rollVal >= 10) { s.successes += 1; log(combat, `💗 ${u.name} succeeds a death save (${s.successes}/3).`); }
    else if (rollVal === 1) { s.fails += 2; log(combat, `💔 ${u.name} critically fails a death save (${s.fails}/3)!`); }
    else { s.fails += 1; log(combat, `💔 ${u.name} fails a death save (${s.fails}/3).`); }
    if (s.successes >= 2) {
      u.hp = 1;
      removeStatus(u, 'dying');
      addStatus(u, 'prone', 'Prone', 1);
      log(combat, `✨ ${u.name} stabilizes at 1 HP!`);
    } else if (s.fails >= 2) {
      u.dead = true;
      u.deathRound = combat.round;
      removeStatus(u, 'dying');
      log(combat, `💀 ${u.name} fails their second death save and dies.`);
      Audio.play('units/death', { vol: 0.85 });
      if (u.char.hero) log(combat, '☠ THE HERO HAS FALLEN. The run is over...');
    }
  }
  // overboard skip
  if (u.overboard) return;
}

export function canAct(u) {
  if (u.dead || u.overboard) return false;
  if (u.hp <= 0) return false;
  for (const id of ['paralyzed', 'stunned', 'unconscious', 'hypnotized', 'asleep', 'polymorphed', 'hideous_laughter', 'banished', 'incapacitated']) {
    if (u.statuses.some(s => s.id === id)) return false;
  }
  return true;
}

export function endTurn(combat) {
  // check end conditions
  if (!aliveEnemies(combat).length) {
    combat.over = true;
    combat.won = true;
    log(combat, '⚔ VICTORY! The last enemy falls!');
    return combat;
  }
  const alive = alivePlayers(combat);
  // the hero is the run: if they die, the run ends
  const heroUnit = combat.units.find(u => u.char && u.char.hero);
  if (heroUnit && heroUnit.dead) {
    combat.over = true;
    combat.won = false;
    log(combat, '☠ THE HERO HAS FALLEN. The run is over...');
    return combat;
  }
  // everybody down (0 HP, dying or dead) = defeat — no one can heal them
  if (!alive.length || alive.every(u => u.hp <= 0)) {
    combat.over = true;
    combat.won = false;
    log(combat, '💀 DEFEAT. The whole party is down...');
    return combat;
  }
  // tick current unit's end-of-turn statuses
  const cur = currentUnit(combat);
  if (cur) tickStatuses(combat, cur);
  // advance turn (wrapping past index 0 increments the round — works even
  // when early slots belong to dead units)
  const prevIdx = combat.turnIndex;
  let guard = 0;
  let wrapped = false;
  do {
    combat.turnIndex = (combat.turnIndex + 1) % combat.order.length;
    if (combat.turnIndex < prevIdx) wrapped = true;
    guard++;
    if (guard > combat.order.length * 2) break;
    const u = currentUnit(combat);
    if (!u) break;
    if (u.dead) continue;
    if (u.overboard) { tickStatuses(combat, u); continue; }
    // skip players during surprise round (Alert characters still act!)
    if (combat.surprise && u.team === 'player' && !(u.char && hasFeat(u.char, 'alert'))) continue;
    if (!canAct(u)) {
      tickStartOfTurn(combat, u);
      log(combat, `${u.name} is unable to act.`);
      if (combat.over) return combat;
      continue;
    }
    break;
  } while (true);
  if (wrapped) {
    combat.round++;
    combat.firstRound = false;
    combat.surprise = false;
    for (let y = 0; y < combat.h; y++)
      for (let x = 0; x < combat.w; x++) {
        const t = combat.grid[y][x];
        if (t.smokeRounds > 0) t.smokeRounds--;
      }
  }
  const u = currentUnit(combat);
  if (u && !u.dead) {
    startOfTurnReset(combat, u);
    u.hasActedThisCombat = true;
    tickStartOfTurn(combat, u);
  }
  updateVision(combat);
  return combat;
}

export function skipTurn(combat, u) {
  log(combat, `${u.name} waits.`);
  u.actionPoints = 0;
  u.bonusPoints = 0;
  u.moveRemaining = 0;
  return endTurn(combat);
}

// ============================== COMBAT END ==============================
export function finishCombat(combat) {
  // remove combat-only buffs, restore hp to characters
  const survivors = combat.units.filter(u => u.team === 'player' && !u.dead);
  for (const u of survivors) {
    const char = u.char;
    // dying but alive at the end of a battle = patched up at 1 HP
    if (u.hp <= 0) {
      u.hp = 1;
      log(combat, `🩹 ${u.name} is stabilized at 1 HP after the battle.`);
    }
    char.hp = u.hp;
    char.tempHp = u.tempHp;
    // combat statuses end
    u.statuses = [];
    // concentration ends
    if (u.concentration) endConcentration(combat, u, true);
    // drop battle-only buffs (bless etc.)
    char.buffs = (char.buffs || []).filter(b => ['mage_armor', 'aid', 'death_ward', 'protection_from_energy', 'fire_shield', 'pass_without_trace'].includes(b.id));
  }
  for (const u of combat.units) {
    if (u.team === 'player' && u.dead) {
      u.char.dead = true;
    }
  }
  // spend per-floor resources? (kept until next floor)
  combat.log.push('— Battle ends —');
  return combat;
}


// ============================== HEX RECAST ==============================
// 5e: "If the target drops to 0 hit points before this spell ends, you can use
// a bonus action on a subsequent turn of yours to curse a new creature." The
// re-cast costs NO spell slot — only the bonus action.
// 5e Moonbeam: "On each of your turns after you cast this spell, you can use
// an action to move the beam up to 60 feet in any direction." Recasting this
// way costs NO spell slot — only the action — and does not break concentration.
// Creatures the relocated beam newly covers enter its area and take the damage.
export const MOONBEAM_MOVE_TILES = 12; // 60 ft

export function recastMoonbeam(combat, caster, aim) {
  if (!caster.concentration || caster.concentration.spellId !== 'moonbeam') {
    log(combat, `${caster.name} is not concentrating on Moonbeam.`);
    return false;
  }
  if (!aim || !inBounds(combat, aim.x, aim.y)) {
    log(combat, 'The beam cannot be moved there.');
    return false;
  }
  const effect = combat.effects.find(e => e.type === 'moonbeam' && e.source === caster.id);
  if (!effect) {
    log(combat, 'The moonbeam has faded.');
    return false;
  }
  const r = effect.r !== undefined ? effect.r : 1;
  const moveDist = Math.max(Math.abs(aim.x - effect.x), Math.abs(aim.y - effect.y));
  if (moveDist > MOONBEAM_MOVE_TILES) {
    log(combat, `The beam can only move ${MOONBEAM_MOVE_TILES} tiles (60 feet).`);
    return false;
  }
  if (moveDist === 0) {
    log(combat, 'The moonbeam is already there.');
    return false;
  }
  const oldX = effect.x, oldY = effect.y;
  effect.x = aim.x;
  effect.y = aim.y;
  log(combat, `🌙 ${caster.name} recasts Moonbeam — no spell slot spent!`);
  const dc = (caster.char && caster.char.spellSaveDC) || effect.dc;
  const dmgDice = effect.dmg || '2d10';
  const dmgType = effect.dmgType || 'radiant';
  const inOld = (u) => Math.max(Math.abs(u.x - oldX), Math.abs(u.y - oldY)) <= r;
  const inNew = (u) => Math.max(Math.abs(u.x - aim.x), Math.abs(u.y - aim.y)) <= r;
  for (const u of combat.units) {
    if (u.dead) continue;
    if (!inNew(u) || inOld(u)) continue;
    const saveMod = u.char.stats ? mod(u.char.stats.CON) : savingThrowMod(u.char, 'CON');
    const save = d20(combat.rng) + saveMod;
    const dmg = roll(combat.rng, dmgDice);
    if (save >= dc) {
      applyDamage(combat, u, caster, Math.floor(dmg / 2), dmgType, { aoe: true, magical: true });
    } else {
      applyDamage(combat, u, caster, dmg, dmgType, { aoe: true, magical: true });
    }
  }
  const sp = SPELL_MAP.moonbeam;
  if (sp) {
    Audio.spellCast(spellCastCandidates(sp));
    scheduleSpellFx(combat, caster, sp, { aim });
  }
  return true;
}

export function recastHex(combat, caster, newTarget) {
  if (!caster.concentration || caster.concentration.spellId !== 'hex') {
    log(combat, `${caster.name} is not concentrating on Hex.`);
    return false;
  }
  if (!newTarget || newTarget.dead || newTarget.hp <= 0) {
    log(combat, 'The new target must be alive to receive the Hex.');
    return false;
  }
  if (newTarget.team === caster.team) {
    log(combat, 'You cannot Hex your own allies.');
    return false;
  }
  const oldId = caster.concentration.data && caster.concentration.data.target;
  const oldUnit = combat.units.find(u => u.id === oldId);
  if (oldUnit && oldUnit.hp > 0 && !oldUnit.dead) {
    log(combat, `${caster.name} may only shift the Hex after the cursed target falls.`);
    return false;
  }
  // strip the old curse wherever it lingers, then curse the new victim
  for (const u of combat.units) {
    if (u !== newTarget) removeStatus(u, 'hexed');
  }
  addStatus(newTarget, 'hexed', 'Hexed', 10, caster.id);
  caster.concentration.data = { target: newTarget.id };
  log(combat, `🎯 ${caster.name} shifts their Hex onto ${newTarget.name} — no spell slot spent!`);
  Audio.play('spells/hex', { vol: 0.8 });
  return true;
}

// ============================== WILD SHAPE ==============================
export function wildShapeInto(combat, u, formId) {
  const form = WILD_SHAPES[formId];
  if (!form || u.wildShaped) return false;
  const copy = JSON.parse(JSON.stringify(form));
  u.wildShaped = true;
  u.char.wildShaped = true;
  u.form = copy;
  u.char.wildShapeForm = copy;
  copy.hp = form.hp;
  Audio.play('units/shapeshift', { vol: 0.85 });
  log(combat, `🐻 ${u.name} wild shapes into a ${form.name} (${copy.hp} form HP, AC ${form.ac})! Spells are unavailable while shaped.`);
  return true;
}

export function revertWildShape(combat, u) {
  if (!u.wildShaped) return false;
  u.wildShaped = false;
  u.char.wildShaped = false;
  u.form = null;
  u.char.wildShapeForm = null;
  Audio.play('units/shapeshift', { vol: 0.85 });
  log(combat, `${u.name} reverts to their normal form.`);
  return true;
}

export function wildShapeAttack(combat, u, target, atkIndex = 0) {
  const form = u.form;
  const atk = form.attacks[atkIndex] || form.attacks[0];
  const dist = Math.max(Math.abs(u.x - target.x), Math.abs(u.y - target.y));
  if (dist > (atk.range || 1)) return { hit: false, outOfRange: true };
  Audio.weaponSwing(monsterSwingCandidates(atk));
  const toHit = (atk.toHit || 0) + townMod(u.char, 'attack');
  const rr = attackRoll(combat.rng, combat, u, target, toHit, { melee: true });
  const total = rr.result + rr.bonus;
  const ac = unitAc(target, combat, false, u);
  if (rr.fumble || (total < ac && !rr.crit)) {
    log(combat, `${u.name} (${form.name}) misses ${target.name} with ${atk.name} (${total} vs AC ${ac}).`);
    pushPopup(combat, target.x, target.y, { kind: 'miss' });
    Audio.play('combat/miss', { vol: 0.65, delay: 60 });
    return { hit: false };
  }
  let dmg = roll(combat.rng, atk.dmg) + townMod(u.char, 'damage');
  if (rr.crit) dmg += roll(combat.rng, atk.dmg);
  log(combat, `${u.name} (${form.name}) hits ${target.name} with ${atk.name} for ${dmg} ${atk.dmgType} damage${rr.crit ? ' (CRIT!)' : ''}.`);
  Audio.weaponHit(monsterHitCandidates(atk), { delay: 80 });
  applyDamage(combat, target, u, dmg, atk.dmgType, { crit: rr.crit });
  if (atk.fx) {
    const fxMap = { trip_dc13: 'trip', trip_dc11: 'trip', poison_dc11: 'poison' };
    const real = fxMap[atk.fx];
    if (real) {
      const saveAb = real === 'trip' ? 'STR' : 'CON';
      const dc = atk.fx === 'trip_dc13' ? 13 : 11;
      const save = d20(combat.rng) + savingThrowMod(target.char, saveAb);
      if (save < dc) {
        if (real === 'trip') { addStatus(target, 'prone', 'Prone', 1); log(combat, `${target.name} is knocked prone by the ${form.name}!`); }
        else { addStatus(target, 'poisoned', 'Poisoned', 3); applyDamage(combat, target, u, roll(combat.rng, '2d6'), 'poison', { noRetaliate: true, quiet: true }); }
      }
    }
  }
  return { hit: true, crit: rr.crit, dmg };
}


// ============================== SPELL VISUAL EFFECTS ==============================
const SPELL_FX_COLORS = {
  fire: '#ff7a2a', cold: '#6ac2ff', acid: '#7ae05a', lightning: '#ffe83c',
  thunder: '#f0a848', poison: '#c87ae8', radiant: '#fff2a0', necrotic: '#a06ae8',
  psychic: '#f07ad8', force: '#5ae0e8', slashing: '#e8e8f0', piercing: '#c8d0e0', bludgeoning: '#c8b898',
};

export function scheduleSpellFx(combat, caster, sp, opts) {
  const from = { x: caster.x, y: caster.y };
  const aim = opts.aim || (opts.target ? { x: opts.target.x, y: opts.target.y } : { x: caster.x, y: caster.y });
  const dmgType = sp.dmgType || (sp.dmgTypes && sp.dmgTypes[0]) || 'force';
  let color = SPELL_FX_COLORS[dmgType] || '#c9a2ff';

  switch (sp.id) {
    case 'eldritch_blast': {
      color = '#ff2a4d'; // forceful red beam (as requested)
      pushFx(combat, { type: 'beam', x0: from.x, y0: from.y, x1: aim.x, y1: aim.y, color, dur: 420 });
      break;
    }
    case 'fire_bolt': case 'guiding_bolt': case 'ray_of_frost': case 'chill_touch':
    case 'thorn_whip': case 'produce_flame': case 'chromatic_orb': case 'disintegrate':
    case 'finger_of_death': case 'sacred_flame': case 'inflict_wounds': case 'vampiric_touch':
    case 'toll_the_dead': case 'vicious_mockery': case 'dissonant_whispers': case 'mind_spike':
    case 'hex': case 'hunters_mark': case 'bestow_curse': case 'hold_person': case 'hold_monster':
    case 'hideous_laughter': case 'polymorph': case 'banishment': case 'power_word_kill':
    case 'chain_lightning': case 'scorching_ray': case 'magic_missile': case 'blight':
    case 'synaptic_static': case 'acid_splash': case 'guiding_bolt':
    {
      if (sp.id === 'chromatic_orb') color = SPELL_FX_COLORS[opts.element || sp.dmgType] || color;
      if (sp.id === 'magic_missile') color = SPELL_FX_COLORS.force;
      if (sp.mode === 'ranged' || sp.mode === 'aoe') {
        pushFx(combat, { type: 'proj', x0: from.x, y0: from.y, x1: aim.x, y1: aim.y, color, dur: 460 });
      } else if (sp.mode === 'melee') {
        pushFx(combat, { type: 'flash', x: aim.x, y: aim.y, color, dur: 320 });
      }
      break;
    }
  }

  // generic mode-based coverage for everything not specialized above
  if (sp.mode === 'aoe') {
    const r = sp.aoeRadius || 1;
    pushFx(combat, { type: 'ring', x: aim.x, y: aim.y, radius: r, color, dur: 520 });
    if (sp.fx === 'fireball') pushFx(combat, { type: 'flash', x: aim.x, y: aim.y, color: '#ffb03c', dur: 380 });
  } else if (sp.mode === 'cone') {
    const tiles = coneTilesFor(combat, caster, aim, sp.coneSize || 3, opts.direction);
    pushFx(combat, { type: 'cone', tiles, color, dur: 420 });
  } else if (sp.mode === 'line') {
    const dir = opts.direction || { dx: 1, dy: 0 };
    const tiles = [];
    for (let i = 1; i <= (sp.lineLen || 10); i++) {
      const x = from.x + dir.dx * i, y = from.y + dir.dy * i;
      if (!inBounds(combat, x, y)) break;
      tiles.push({ x, y });
    }
    pushFx(combat, { type: 'line', tiles, color, dur: 420 });
  } else if (sp.heal) {
    pushFx(combat, { type: 'glow', x: aim.x, y: aim.y, color: '#5ae08a', dur: 600 });
  } else if (sp.fx === 'misty_step' || sp.fx === 'dimension_door' || sp.fx === 'thunder_step') {
    pushFx(combat, { type: 'teleport', x0: from.x, y0: from.y, x1: aim.x, y1: aim.y, color: '#8ad0ff', dur: 500 });
    if (sp.fx === 'thunder_step') pushFx(combat, { type: 'ring', x: from.x, y: from.y, radius: 1, color: SPELL_FX_COLORS.thunder, dur: 450 });
  } else if (!sp.dmg) {
    // buffs & utility: a soft golden pulse
    pushFx(combat, { type: 'glow', x: aim.x, y: aim.y, color: '#ffd76a', dur: 520 });
  }
  return combat;
}
