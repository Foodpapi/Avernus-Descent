// Turn executor: performs an action for the current unit (used by player UI
// and enemy AI alike), then advances the turn when the unit is done.

import { mod, computeSpeed, highestSpellLevel, wildShapeFormsFor, townMod, changeGearChar, hasFeat, savingThrowMod } from './rules.js';
import { OBSTACLES } from '../data/locations.js';
import { isRaceFamily } from '../data/races.js';
import { applyMonsterAttackFx, wildShapeInto, revertWildShape, wildShapeAttack, recastHex, recastMoonbeam } from './combat_actions.js';
import { WEAPONS, FISTS, CONSUMABLES } from '../data/items.js';
import { SPELL_MAP, cantripDmg } from '../data/spells.js';
import {
  unitAt, getStatus, addStatus, removeStatus, unitAc, findPath, isPassable, hasLOS, inBounds, elevationAt,
  startOfTurnReset, currentUnit, alivePlayers, aliveEnemies, attackRoll,
  hasAction, hasBonus, spendAction, spendBonus, pushPopup, pushFx,
} from './combat.js';
import {
  log, moveUnit, weaponAttack, castSpell, useItem, applyDamage, healUnit, endTurn, skipTurn,
  pushUnit, canAct, addEffect, interceptProjectile, applyObjectDamage, tryHide, scheduleWeaponFx,
} from './combat_actions.js';
import { roll, d20 } from './combat.js';
import * as Audio from '../game/audio.js';
import { monsterSwingCandidates, monsterHitCandidates } from '../data/sounds.js';

// Which point each ability costs. null = free activation (grants points etc).
const ABILITY_COST = {
  rage: 'bonus', reckless: null, second_wind: 'bonus', action_surge: null,
  flurry: 'bonus', patient_defense: 'bonus', step_of_wind: 'bonus',
  lay_on_hands: 'action', channel_divinity: 'action', bardic_inspiration: 'bonus',
  wild_shape: 'bonus', vow_of_enmity: 'bonus', sacred_weapon: 'action',
  divine_smite: 'action', stunning_strike: 'action', trip_attack: 'action',
  breath_weapon: 'action', arcane_recovery: null, natural_recovery: null,
  hurl_flame: 'action', wild_shape: 'action', revert_wild_shape: null,
  mind_blast: 'action', martial_arts: 'bonus',
  pam_butt: 'bonus', shield_shove: 'bonus',
  toggle_gwm: null, toggle_sharpshooter: null,
};

function abilityCost(u, abilityId) {
  if (abilityId === 'wild_shape') return u.char.subclassId === 'moon' ? 'bonus' : 'action';
  return ABILITY_COST[abilityId];
}

export function performAction(combat, unitId, action) {
  const u = combat.units.find(x => x.id === unitId);
  if (!u || u.dead || combat.over) return combat;
  const char = u.char;
  const rng = combat.rng;

  switch (action.type) {
    case 'wait': {
      skipTurn(combat, u);
      return combat;
    }
    case 'move': {
      const path = action.path || [];
      moveUnit(combat, u, path);
      if (action.endTurn) endTurn(combat);
      return combat;
    }
    case 'moveTo': {
      // auto-path with remaining movement
      const res = findPath(combat, u, action.x, action.y, u.moveRemaining);
      if (res) moveUnit(combat, u, res.path);
      if (action.endTurn) endTurn(combat);
      return combat;
    }
    case 'dash': {
      if (!hasAction(u)) { log(combat, `${u.name} has no action points left to Dash.`); Audio.play('ui/error', { vol: 0.5, throttle: 120 }); return combat; }
      spendAction(u);
      u.moveRemaining += computeSpeed(char);
      Audio.play('combat/miss', { vol: 0.4, jitter: 0.1 });
      log(combat, `${u.name} dashes (action spent, movement doubled).`);
      if (action.endTurn) endTurn(combat);
      return combat;
    }
    case 'dodge': {
      spendAction(u);
      u.dodging = true;
      Audio.play('ui/click', { vol: 0.5 });
      log(combat, `${u.name} takes the Dodge action.`);
      if (action.endTurn) endTurn(combat);
      return combat;
    }
    case 'hide': {
      // 5e Hide is an action. Rogue 2+ Cunning Action: Hide as a bonus action.
      const classLv = char.classLevel || char.level || 1;
      const cunning = !!(char.cls && char.cls.id === 'rogue' && classLv >= 2);
      const asBonus = !!(action.asBonus || action.bonus);
      if (asBonus) {
        if (!cunning) { log(combat, `${u.name} needs Cunning Action (Rogue 2+) to hide as a bonus action.`); return combat; }
        if (u.team === 'player' && !hasBonus(u)) { log(combat, `${u.name} has no bonus points left to hide.`); Audio.play('ui/error', { vol: 0.5, throttle: 120 }); return combat; }
      } else if (u.team === 'player' && !hasAction(u)) {
        log(combat, `${u.name} has no action points left to hide.`); Audio.play('ui/error', { vol: 0.5, throttle: 120 }); return combat;
      }
      Audio.play('ui/click', { vol: 0.5 });
      const ok = tryHide(combat, u);
      if (ok) {
        if (asBonus) spendBonus(u);
        else spendAction(u);
      } else if (!asBonus) {
        spendAction(u); // 5e: you still took the Hide action
      }
      if (action.endTurn) endTurn(combat);
      return combat;
    }
    case 'attack': {
      // Aim-only shots (destroyable objects) have no targetId. If targetId is
      // omitted entirely, keep the legacy find (some tests pass id:undefined).
      const target = (action.aim && action.targetId == null)
        ? null
        : combat.units.find(x => x.id === action.targetId);
      if (target && target.dead) return combat;
      if (!target && !action.aim) return combat;
      const noCost = !!(action.opts && action.opts.noCost); // reactions don't cost points
      if (!noCost && u.team === 'player' && !hasAction(u)) { log(combat, `${u.name} has no action points left to attack.`); Audio.play('ui/error', { vol: 0.5, throttle: 120 }); return combat; }
      // wild shaped units attack with their beast form
      if (u.wildShaped && u.form) {
        if (!target) return combat;
        const idx = action.opts && action.opts.attackIndex ? action.opts.attackIndex : 0;
        wildShapeAttack(combat, u, target, idx);
        const multi = (u.form.multi || 1) - 1;
        for (let i = 0; i < multi; i++) {
          if (target.dead) break;
          wildShapeAttack(combat, u, target, idx === 0 ? 1 : 0);
        }
        if (!noCost) spendAction(u);
        if (action.endTurn) endTurn(combat);
        return combat;
      }
      // mind flayer transformation: tentacle attack
      if (u.char.transformed && u.char.transformed.type === 'mind_flayer') {
        if (!target) return combat;
        monsterAttack(combat, u, target, { name: 'Tentacles', toHit: 7, dmg: '2d10+4', dmgType: 'psychic', range: 'melee', fx: 'grapple' });
        if (!noCost) spendAction(u);
        if (action.endTurn) endTurn(combat);
        return combat;
      }
      if (u.team === 'enemy') {
        if (!target) return combat;
        combat.lastActionResult = monsterAttack(combat, u, target, action.attackDef || u.char.attacks[0], action);
      } else {
        combat.lastActionResult = weaponAttack(combat, u, target, { ...(action.opts || {}), aim: action.aim || (action.opts && action.opts.aim) });
      }
      if (!noCost) spendAction(u);
      if (action.extraAttacks) {
        for (let i = 0; i < action.extraAttacks; i++) {
          const t2 = combat.units.find(x => x.id === (action.targetId2 || action.targetId));
          if (t2 && !t2.dead && !u.dead) {
            if (u.team === 'enemy') monsterAttack(combat, u, t2, u.char.attacks[0], {});
            else weaponAttack(combat, u, t2, action.opts || {});
          }
        }
      }
      // Monk Martial Arts: after attacking with a monk weapon or unarmed,
      // they may make one unarmed strike as a bonus action (5e).
      if (u.team === 'player' && !noCost && char.cls && char.cls.id === 'monk') {
        const wid = (action.opts && action.opts.weaponId) || (char.weapon && char.weapon.base) || 'fists';
        const w = WEAPONS[wid] || FISTS;
        const isMonkWeapon = wid === 'fists' || w.type === 'simple' || wid === 'shortsword';
        if (isMonkWeapon && (w.range === 'melee' || wid === 'fists')) u.martialArts = true;
      }
      // Polearm Master: attacking with a reach weapon unlocks the butt strike
      if (u.team === 'player' && !noCost && hasFeat(char, 'polearm_master')) {
        const wid = (action.opts && action.opts.weaponId) || (char.weapon && char.weapon.base) || 'fists';
        const w = WEAPONS[wid];
        if (w && w.range === 'melee' && w.properties.includes('reach')) u.pamAttack = true;
      }
      // auto end turn if no bonus action potential left — UI handles this instead
      if (action.endTurn) endTurn(combat);
      return combat;
    }
    case 'cast': {
      const sp = SPELL_MAP[action.spellId];
      if (u.wildShaped) { log(combat, `${u.name} cannot cast spells while wild shaped!`); return combat; }
      const noCost = !!action.noCost; // reaction spells don't cost points
      if (sp && u.team === 'player' && !noCost) {
        if (sp.castTime === 'bonus' && !hasBonus(u)) { log(combat, `${u.name} has no bonus points left to cast ${sp.name}.`); return combat; }
        if (sp.castTime !== 'bonus' && sp.castTime !== 'reaction' && !hasAction(u)) { log(combat, `${u.name} has no action points left to cast ${sp.name}.`); return combat; }
      }
      const target = action.targetId ? combat.units.find(x => x.id === action.targetId) : null;
      castSpell(combat, u, action.spellId, {
        target,
        aim: action.aim,
        direction: action.direction,
        element: action.element,
        level: action.level,
        wall: action.wall,
        scroll: action.scroll,
        consumeItem: action.consumeItem,
        twinned: action.twinned,
      });
      if (sp && !noCost) { if (sp.castTime === 'bonus') spendBonus(u); else spendAction(u); }
      if (action.endTurn) endTurn(combat);
      return combat;
    }
    case 'useItem': {
      const target = action.targetId ? combat.units.find(x => x.id === action.targetId) : null;
      if (u.wildShaped) { log(combat, `${u.name} has no hands for items while wild shaped!`); return combat; }
      // resolve the item def BEFORE useItem consumes it
      const item = char.inventory.find(i => i.uid === action.itemUid) || null;
      const def = item ? CONSUMABLES[item.id] : null;
      if (u.team === 'player' && def) {
        if (def.kind === 'potion' && !hasBonus(u)) { log(combat, `${u.name} has no bonus points left.`); return combat; }
        if (def.kind !== 'potion' && !hasAction(u)) { log(combat, `${u.name} has no action points left.`); return combat; }
      }
      useItem(combat, u, action.itemUid, target);
      // potions are a bonus action (common 5e house rule); thrown items & scrolls use the action
      if (def && def.kind === 'potion') spendBonus(u);
      else spendAction(u);
      if (action.endTurn) endTurn(combat);
      return combat;
    }
    case 'ability': {
      const cost = abilityCost(u, action.ability);
      if (u.team === 'player' && cost === 'action' && !hasAction(u)) { log(combat, `${u.name} has no action points left.`); return combat; }
      if (u.team === 'player' && cost === 'bonus' && !hasBonus(u)) { log(combat, `${u.name} has no bonus points left.`); return combat; }
      useAbility(combat, u, action.ability, action);
      if (action.endTurn) endTurn(combat);
      return combat;
    }
    case 'power': {
      useMonsterPower(combat, u, action.power, action);
      spendAction(u);
      if (action.endTurn) endTurn(combat);
      return combat;
    }
    case 'equip_weapon': case 'unequip_weapon':
    case 'equip_armor': case 'unequip_armor':
    case 'equip_trinket': case 'unequip_trinket': {
      // changing gear mid-fight costs an action point
      if (u.team === 'player' && !hasAction(u)) { log(combat, `${u.name} has no action points to change gear.`); Audio.play('ui/error', { vol: 0.5, throttle: 120 }); return combat; }
      const res = changeGearChar(char, action.type, action);
      if (res.ok) {
        spendAction(u);
        Audio.play('ui/equip', { vol: 0.7 });
        log(combat, `🎒 ${res.msg} (action spent).`);
      } else {
        Audio.play('ui/error', { vol: 0.5, throttle: 120 });
        log(combat, res.msg);
      }
      if (action.endTurn) endTurn(combat);
      return combat;
    }
    case 'toggle_gwm': {
      u.gwmOn = !u.gwmOn;
      log(combat, `💥 Great Weapon Master power attack ${u.gwmOn ? 'ON (-5 to hit, +10 damage)' : 'off'}.`);
      break;
    }
    case 'toggle_sharpshooter': {
      u.ssOn = !u.ssOn;
      log(combat, `🎯 Sharpshooter power shot ${u.ssOn ? 'ON (-5 to hit, +10 damage)' : 'off'}.`);
      break;
    }
    case 'pam_butt': {
      if (!u.pamAttack || !hasFeat(char, 'polearm_master')) { log(combat, `${u.name} must attack with a reach weapon first.`); return; }
      const target = combat.units.find(x => x.id === action.targetId);
      if (!target || target.dead) return;
      const dist = Math.max(Math.abs(u.x - target.x), Math.abs(u.y - target.y));
      if (dist > 1) { log(combat, 'Target too far for the butt strike.'); return; }
      weaponAttack(combat, u, target, { weaponId: 'club' }); // 1d4 bludgeoning butt
      spendBonus(u);
      u.pamAttack = false;
      log(combat, `🪓 ${u.name} follows up with a Polearm Master butt strike!`);
      break;
    }
    case 'shield_shove': {
      if (!hasFeat(char, 'shield_master') || !char.shield) { log(combat, `${u.name} needs a shield for Shield Master.`); return; }
      const target = combat.units.find(x => x.id === action.targetId);
      if (!target || target.dead) return;
      const dist = Math.max(Math.abs(u.x - target.x), Math.abs(u.y - target.y));
      if (dist > 1) { log(combat, 'Target too far to shove.'); return; }
      const dc = 8 + char.prof + Math.max(mod(char.abilities.STR), mod(char.abilities.DEX));
      const save = d20(rng) + (target.char.stats ? mod(target.char.stats.STR) : savingThrowMod(target.char, 'STR'));
      Audio.play('combat/shove', { vol: 0.75 });
      if (save < dc) { addStatus(target, 'prone', 'Prone', 1); Audio.play('combat/fall', { vol: 0.6, delay: 150 }); log(combat, `🛡 ${u.name} shield-shoves ${target.name} prone!`); }
      else { log(combat, `${target.name} resists the shield shove.`); }
      spendBonus(u);
      break;
    }
    case 'recast_hex': {
      // re-cursing a fallen Hex target: bonus action only, NO spell slot (5e)
      if (u.team === 'player' && !hasBonus(u)) { log(combat, `${u.name} has no bonus points left to recast Hex.`); return combat; }
      const target = combat.units.find(x => x.id === action.targetId);
      if (!target) return combat;
      const dist = Math.max(Math.abs(u.x - target.x), Math.abs(u.y - target.y));
      if (dist > 9) { log(combat, `${target.name} is beyond Hex's reach (9 tiles).`); return combat; }
      if (recastHex(combat, u, target)) spendBonus(u);
      if (action.endTurn) endTurn(combat);
      return combat;
    }
    case 'recast_moonbeam': {
      // 5e: action to move the beam up to 60 ft — NO spell slot
      if (u.team === 'player' && !hasAction(u)) { log(combat, `${u.name} has no action points left to recast Moonbeam.`); return combat; }
      const aim = action.aim || (action.x !== undefined ? { x: action.x, y: action.y } : null);
      if (recastMoonbeam(combat, u, aim)) spendAction(u);
      if (action.endTurn) endTurn(combat);
      return combat;
    }
    case 'shove': {
      if (u.team === 'player' && !hasAction(u)) { log(combat, `${u.name} has no action points left to shove.`); Audio.play('ui/error', { vol: 0.5, throttle: 120 }); return combat; }
      const target = combat.units.find(x => x.id === action.targetId);
      Audio.play('combat/shove', { vol: 0.75 });
      if (target) {
        const atkStr = u.char.stats ? mod(u.char.stats.STR) : mod(char.abilities.STR);
        const defStr = target.char.stats ? mod(target.char.stats.STR) : mod(target.char.abilities.STR);
        const r1 = d20(rng) + atkStr, r2 = d20(rng) + defStr;
        if (r1 >= r2) {
          const dx = Math.sign(target.x - u.x) || 1, dy = Math.sign(target.y - u.y);
          const nx = target.x + dx, ny = target.y + dy;
          const t = combat.grid[ny] && combat.grid[ny][nx];
          if (t && (t.hazard === 'water' || t.hazard === 'lava')) {
            log(combat, `🌊 ${u.name} shoves ${target.name} into the deep!`);
            Audio.play('combat/hazard_water', { vol: 0.8, delay: 120 });
            target.overboard = true; target.overboardRounds = 3;
            addStatus(target, 'overboard', 'Overboard', 3);
          } else if (isPassable(combat, nx, ny) && !unitAt(combat, nx, ny)) {
            target.x = nx; target.y = ny;
            log(combat, `${u.name} shoves ${target.name} back!`);
          } else {
            addStatus(target, 'prone', 'Prone', 1);
            Audio.play('combat/fall', { vol: 0.6, delay: 150 });
            log(combat, `${u.name} shoves ${target.name} to the ground!`);
          }
        } else {
          log(combat, `${target.name} resists the shove.`);
        }
      }
      spendAction(u);
      if (action.endTurn) endTurn(combat);
      return combat;
    }
    default:
      return combat;
  }
  return combat;
}

// ============================== MONSTER ATTACKS ==============================
export function monsterAttack(combat, u, target, def, opts = {}) {
  const rng = combat.rng;
  const m = u.char;
  const dist = Math.max(Math.abs(u.x - target.x), Math.abs(u.y - target.y));
  const rangeTiles = typeof def.range === 'number' ? def.range : (def.range === 'melee' ? 1 : 1);
  const isRanged = typeof def.range === 'number';
  if (dist > rangeTiles) return { hit: false, outOfRange: true };

  // Ranged monster shots hit the first body or object (friendly fire included).
  if (isRanged && target && !opts.noIntercept) {
    const inter = interceptProjectile(combat, u, target, { label: def.name });
    if (inter.stopped) {
      scheduleWeaponFx(combat, u, inter.block || target, { name: def.name, range: 'ranged(' + rangeTiles + ')', properties: [], dmgType: def.dmgType }, { ranged: true });
      if (inter.object && inter.block) {
        const dmg = roll(rng, def.dmg, (m.dmgBonus || 0));
        applyObjectDamage(combat, inter.block.x, inter.block.y, dmg, def.dmgType || 'piercing', u);
        return { hit: true, object: true, blocked: true };
      }
      return { hit: false, blocked: true };
    }
    if (inter.target) target = inter.target;
  }
  if (isRanged && target) {
    scheduleWeaponFx(combat, u, target, { name: def.name, range: 'ranged(' + rangeTiles + ')', properties: [], dmgType: def.dmgType }, { ranged: true });
  }

  Audio.weaponSwing(isRanged ? ['weapons/bow_shot'] : monsterSwingCandidates(def));

  const obsc = !hasLOS(combat, u.x, u.y, target.x, target.y);
  let toHit = (def.toHit || 0) + (m.toHitBonus || 0);
  // High ground: +1 per elevation level above the target
  const elevDiff = elevationAt(combat, u.x, u.y) - elevationAt(combat, target.x, target.y);
  if (elevDiff > 0) toHit += elevDiff;
  const reckless = getStatus(u, 'reckless');
  const pack = getStatus(u, 'pack');
  const rr = attackRoll(combat.rng, combat, u, target, toHit, {
    melee: !isRanged, reckless, pack, disadvantage: obsc || getStatus(u, 'frightened') || getStatus(u, 'poisoned') || getStatus(u, 'mocked'),
    rangedInMelee: isRanged && adjacentEnemy(combat, u),
  });
  const baned = getStatus(u, 'baned');
  const blessedTarget = target.char.buffs && target.char.buffs.find(b => b.id === 'bless');
  const total = rr.result + rr.bonus - (baned ? rng.int(1, 4) : 0) + (blessedTarget ? rng.int(1, 4) : 0);
  const crit = rr.crit || (m.critRange && rr.natural >= m.critRange);
  let ac = unitAc(target, combat, isRanged, u);
  // Defensive Duelist: +3 AC vs the first melee attack each round (reaction)
  if (!isRanged && target.team === 'player' && hasFeat(target.char, 'defensive_duelist') && !target.reactionUsed) {
    const wId = target.char.weapon && target.char.weapon.base;
    const wd = wId ? WEAPONS[wId] : null;
    if (wd && wd.properties.includes('finesse')) {
      ac += 3;
      target.reactionUsed = true;
      log(combat, `⚔ ${target.name} parries with Defensive Duelist (+3 AC)!`);
    }
  }

  if (rr.fumble) {
    log(combat, `${u.name} fumbles (natural 1)!`);
    pushPopup(combat, target.x, target.y, { kind: 'miss' });
    Audio.play('combat/miss', { vol: 0.65, delay: 60 });
    removeStatus(u, 'mocked');
    return { hit: false, fumble: true };
  }
  if (total < ac && !crit) {
    log(combat, `${u.name} misses ${target.name} with ${def.name} (${total} vs AC ${ac}).`);
    pushPopup(combat, target.x, target.y, { kind: 'miss' });
    Audio.play('combat/miss', { vol: 0.65, delay: 60 });
    removeStatus(u, 'mocked');
    return { hit: false };
  }

  let dmg = roll(rng, def.dmg, (m.dmgBonus || 0));
  if (crit) {
    dmg += roll(rng, def.dmg);
    log(combat, `💥 CRITICAL HIT! ${u.name} hits ${target.name} for ${dmg} ${def.dmgType} damage!`);
    Audio.weaponHit(isRanged ? ['weapons/arrow_hit', 'combat/hit_flesh'] : monsterHitCandidates(def), { delay: 90, vol: 1.05 });
    Audio.play('combat/crit', { vol: 0.95, delay: 150 });
  } else {
    log(combat, `${u.name} hits ${target.name} with ${def.name} for ${dmg} ${def.dmgType} damage (${total} vs AC ${ac}).`);
    Audio.weaponHit(isRanged ? ['weapons/arrow_hit', 'combat/hit_flesh'] : monsterHitCandidates(def), { delay: 90 });
  }
  // sneak-style ambusher bonus
  if (m.powers && m.powers.includes('sneaky') && combat.firstRound && getStatus(u, 'hidden')) dmg += roll(rng, '2d6');
  // big swing ogre
  if (m.powers && m.powers.includes('big_swing') && rr.natural >= 15) dmg += roll(rng, '1d6');
  // martial advantage hobgoblin
  if (m.powers && m.powers.includes('martial_advantage') && adjacentAlly(combat, u)) dmg += roll(rng, '2d6');
  // life drain
  if (m.powers && m.powers.includes('life_drain')) {
    dmg += roll(rng, '2d6');
    target.maxHp = Math.max(1, target.maxHp - Math.floor(dmg / 2));
  }
  const res = applyDamage(combat, target, u, dmg, def.dmgType || 'bludgeoning', { crit });
  if (def.fx) {
    applyAttackFx(combat, u, target, def.fx);
  }
  removeStatus(u, 'mocked');
  removeStatus(target, 'guiding');
  return { hit: true, crit, dmg: res.dealt };
}

function adjacentEnemy(combat, u) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const e = unitAt(combat, u.x + dx, u.y + dy);
    if (e && e.team !== u.team) return e;
  }
  return null;
}
function adjacentAlly(combat, u) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const e = unitAt(combat, u.x + dx, u.y + dy);
    if (e && e.team === u.team && e !== u) return e;
  }
  return null;
}

function applyAttackFx(combat, u, target, fx) {
  applyMonsterAttackFx(combat, u, target, fx);
}

// ============================== CLASS ABILITIES ==============================
export function useAbility(combat, u, abilityId, action) {
  const char = u.char;
  const rng = combat.rng;
  const res = char.resources;

  switch (abilityId) {
    case 'rage': {
      if (!res.rage || res.rage.cur <= 0) { log(combat, 'No rages left.'); Audio.play('ui/error', { vol: 0.5, throttle: 120 }); return; }
      res.rage.cur--;
      addStatus(u, 'raging', 'Raging', 10);
      spendBonus(u);
      Audio.play('units/roar', { vol: 0.85 });
      log(combat, `💢 ${u.name} flies into a RAGE! (resist B/P/S, +2 melee damage)`);
      break;
    }
    case 'reckless': {
      addStatus(u, 'reckless', 'Reckless', 1);
      log(combat, `${u.name} attacks recklessly!`);
      break;
    }
    case 'second_wind': {
      if (!res.secondWind || res.secondWind.cur <= 0) { log(combat, 'No Second Wind left.'); Audio.play('ui/error', { vol: 0.5, throttle: 120 }); return; }
      res.secondWind.cur--;
      const heal = roll(rng, '1d10') + char.level;
      healUnit(combat, u, u, heal);
      spendBonus(u);
      Audio.play('spells/heal', { vol: 0.8 });
      log(combat, `💨 ${u.name} uses Second Wind!`);
      break;
    }
    case 'action_surge': {
      if (!res.actionSurge || res.actionSurge.cur <= 0) { log(combat, 'No Action Surge left.'); Audio.play('ui/error', { vol: 0.5, throttle: 120 }); return; }
      res.actionSurge.cur--;
      u.actionPoints += 1; // +1 action point this turn
      Audio.play('ui/click', { vol: 0.6 });
      log(combat, `⚡ ACTION SURGE! ${u.name} gains an extra action point (${u.actionPoints} total)!`);
      break;
    }
    case 'flurry': {
      if (!res.ki || res.ki.cur <= 0) { log(combat, 'No ki left.'); return; }
      res.ki.cur--;
      spendBonus(u);
      const target = combat.units.find(x => x.id === action.targetId);
      if (target) {
        weaponAttack(combat, u, target, { weaponId: 'fists' });
        if (!target.dead) weaponAttack(combat, u, target, { weaponId: 'fists' });
        if (char.subclassId === 'open_hand' && !target.dead && d20(rng) + mod(target.char.stats ? target.char.stats.STR : target.char.abilities.STR) < char.spellSaveDC) {
          addStatus(target, 'prone', 'Prone', 1);
          log(combat, `Open Hand Technique: ${target.name} is knocked prone!`);
        }
      }
      log(combat, `👊 ${u.name} uses Flurry of Blows!`);
      break;
    }
    case 'patient_defense': {
      if (!res.ki || res.ki.cur <= 0) { log(combat, 'No ki left.'); Audio.play('ui/error', { vol: 0.5, throttle: 120 }); return; }
      res.ki.cur--;
      spendBonus(u);
      u.dodging = true;
      Audio.play('ui/click', { vol: 0.5 });
      log(combat, `🛡 ${u.name} takes Patient Defense.`);
      break;
    }
    case 'step_of_wind': {
      if (!res.ki || res.ki.cur <= 0) { log(combat, 'No ki left.'); Audio.play('ui/error', { vol: 0.5, throttle: 120 }); return; }
      res.ki.cur--;
      spendBonus(u);
      u.moveRemaining += computeSpeed(char);
      Audio.play('combat/miss', { vol: 0.4, jitter: 0.1 });
      log(combat, `🌪 ${u.name} moves like the wind.`);
      break;
    }
    case 'lay_on_hands': {
      if (!res.layOnHands || res.layOnHands.cur <= 0) { log(combat, 'No Lay on Hands left.'); Audio.play('ui/error', { vol: 0.5, throttle: 120 }); return; }
      const target = combat.units.find(x => x.id === action.targetId);
      if (!target) return;
      const amt = Math.min(res.layOnHands.cur, action.amount || 15);
      res.layOnHands.cur -= amt;
      healUnit(combat, u, target, amt);
      Audio.play('spells/heal', { vol: 0.8 });
      spendAction(u);
      break;
    }
    case 'channel_divinity': {
      if (!res.channelDivinity || res.channelDivinity.cur <= 0) { log(combat, 'No Channel Divinity left.'); Audio.play('ui/error', { vol: 0.5, throttle: 120 }); return; }
      res.channelDivinity.cur--;
      spendAction(u);
      Audio.play('spells/radiant', { vol: 0.8 });
      if (char.subclassId === 'life') {
        for (const p of alivePlayers(combat)) healUnit(combat, u, p, char.level * 5);
        log(combat, `✨ ${u.name} channels Preserve Life!`);
      } else if (char.subclassId === 'light') {
        const target = combat.units.find(x => x.id === action.targetId);
        if (target) {
          const dmg = roll(rng, '2d10') + char.level;
          applyDamage(combat, target, u, dmg, 'radiant');
          log(combat, `☀ ${u.name} channels Radiance of the Dawn (${dmg} radiant)!`);
        }
      } else if (char.subclassId === 'tempest') {
        const target = combat.units.find(x => x.id === action.targetId);
        if (target) {
          const dmg = roll(rng, '2d8');
          applyDamage(combat, target, u, dmg, 'thunder');
          log(combat, `⚡ ${u.name} channels Destructive Wrath (${dmg} thunder)!`);
        }
      } else if (char.subclassId === 'war') {
        addStatus(u, 'guided_strike', 'Guided Strike', 1);
        log(combat, `🎯 ${u.name} channels Guided Strike (+10 next attack).`);
      }
      break;
    }
    case 'bardic_inspiration': {
      if (!res.bardicInspiration || res.bardicInspiration.cur <= 0) { log(combat, 'No inspiration left.'); Audio.play('ui/error', { vol: 0.5, throttle: 120 }); return; }
      res.bardicInspiration.cur--;
      const target = combat.units.find(x => x.id === action.targetId);
      if (!target) return;
      addStatus(target, 'bardic_inspiration', 'Inspired', 5);
      spendBonus(u);
      Audio.play('spells/buff', { vol: 0.8 });
      log(combat, `🎵 ${u.name} inspires ${target.name} (+1d6 to next attack or save)!`);
      break;
    }
    case 'wild_shape': {
      if (!res.wildShape || res.wildShape.cur <= 0) { log(combat, 'No Wild Shape uses left.'); return; }
      const forms = wildShapeFormsFor(char);
      const formId = (action.formId && forms.includes(action.formId)) ? action.formId : forms[0];
      if (!wildShapeInto(combat, u, formId)) return;
      res.wildShape.cur--;
      break;
    }
    case 'revert_wild_shape': {
      revertWildShape(combat, u);
      break;
    }
    case 'martial_arts': {
      if (!u.martialArts) { log(combat, `${u.name} must attack with a monk weapon or unarmed strike first.`); return; }
      const target = combat.units.find(x => x.id === action.targetId);
      if (!target || target.dead) return;
      weaponAttack(combat, u, target, { weaponId: 'fists' });
      spendBonus(u);
      u.martialArts = false;
      log(combat, `👊 ${u.name} follows up with a Martial Arts unarmed strike!`);
      break;
    }
    case 'mind_blast': {
      if (!char.transformed || char.transformed.type !== 'mind_flayer') return;
      const dir = action.direction || { dx: 1, dy: 0 };
      const dc = 8 + char.prof + mod(char.abilities.INT);
      Audio.play('spells/psychic', { vol: 0.85 });
      log(combat, `🧠 ${u.name} unleashes a Mind Blast!`);
      const lineTiles = [];
      for (let i = 1; i <= 3; i++) {
        const x = u.x + dir.dx * i, y = u.y + dir.dy * i;
        if (!inBounds(combat, x, y)) break;
        const t = combat.grid[y][x];
        if (t.obstacle) { const ob = OBSTACLES[t.obstacle]; if (ob && ob.tall) break; }
        lineTiles.push({ x, y });
      }
      for (const tile of lineTiles) {
        const e = unitAt(combat, tile.x, tile.y);
        if (!e) continue;
        const save = d20(rng) + (e.char.stats ? mod(e.char.stats.INT) : savingThrowMod(e.char, 'INT'));
        if (save < dc) {
          addStatus(e, 'stunned', 'Stunned', 1);
          applyDamage(combat, e, u, roll(rng, '4d8'), 'psychic', { aoe: true, magical: true });
          log(combat, `${e.name} is stunned by the Mind Blast!`);
        } else {
          applyDamage(combat, e, u, Math.floor(roll(rng, '4d8') / 2), 'psychic', { aoe: true, magical: true });
        }
      }
      pushFx(combat, { type: 'line', tiles: lineTiles, color: '#f07ad8', dur: 420 });
      break;
    }
    case 'natural_recovery': case 'arcane_recovery': {
      if (char.cls.warlock) break;
      // regain one lowest-level spent slot
      for (let i = 0; i < char.spellSlotsUsed.length; i++) {
        if (char.spellSlotsUsed[i] > 0) { char.spellSlotsUsed[i]--; log(combat, `🔮 ${u.name} recovers a spell slot.`); break; }
      }
      break;
    }
    case 'vow_of_enmity': {
      const target = combat.units.find(x => x.id === action.targetId);
      if (!target) return;
      addStatus(u, 'vow_of_enmity', 'Vow of Enmity', 10, target.id);
      spendBonus(u);
      log(combat, `⚔ ${u.name} swears a Vow of Enmity against ${target.name} (advantage)!`);
      break;
    }
    case 'sacred_weapon': {
      addStatus(u, 'sacred_weapon', 'Sacred Weapon', 10);
      spendAction(u);
      log(combat, `✨ ${u.name}'s weapon glows with holy power (+CHA to attacks)!`);
      break;
    }
    case 'breath_weapon': {
      // Dragon's Breath (the spell) is reusable each round while its status is
      // active. Prefer it over a racial breath so casting the spell never burns
      // the dragonborn's once-per-floor resource.
      const borrowedBreath = getStatus(u, 'dragon_breath');
      const racialBreath = res.breathWeapon;
      if (!borrowedBreath && (!racialBreath || racialBreath.cur <= 0)) {
        log(combat, 'Breath weapon used.');
        Audio.play('ui/error', { vol: 0.5, throttle: 120 });
        return;
      }
      if (!borrowedBreath) racialBreath.cur--;
      spendAction(u);
      const breathData = borrowedBreath && borrowedBreath.data && typeof borrowedBreath.data === 'object'
        ? borrowedBreath.data : {};
      // Racial breath uses CON; the spell uses the original caster's spell DC
      // saved in its status data, as specified by Dragon's Breath.
      const type = breathData.element || char.dragonType || char.draconicResist || 'fire';
      const dmgDice = breathData.dmg || (char.level >= 16 ? '5d6' : char.level >= 11 ? '4d6' : char.level >= 6 ? '3d6' : '2d6');
      const dc = Number.isFinite(breathData.dc) ? breathData.dc : 8 + char.prof + mod(char.abilities.CON);
      Audio.play('units/roar', { vol: 0.8 });
      Audio.play(`spells/${type}`, { vol: 0.75, delay: 120 });
      const dir = action.direction || { dx: 1, dy: 0 };
      // Proper 3-tile cone (not just a line) — matches coneTilesFor and drawConePreview
      const size = 3;
      const primary = Math.abs(dir.dx) >= Math.abs(dir.dy) ? 'x' : 'y';
      const sx = u.x, sy = u.y;
      const coneTiles = [];
      for (let i = 1; i <= size; i++) {
        const x = sx + dir.dx * i, y = sy + dir.dy * i;
        if (!inBounds(combat, x, y)) break;
        const t = combat.grid[y][x];
        if (t.obstacle) { const ob = OBSTACLES[t.obstacle]; if (ob && ob.tall) break; }
        coneTiles.push({ x, y });
        const width = Math.min(i, Math.floor(size / 2));
        for (let w = 1; w <= width; w++) {
          if (primary === 'x') {
            if (inBounds(combat, x, y + w)) coneTiles.push({ x, y: y + w });
            if (inBounds(combat, x, y - w)) coneTiles.push({ x, y: y - w });
          } else {
            if (inBounds(combat, x + w, y)) coneTiles.push({ x: x + w, y });
            if (inBounds(combat, x - w, y)) coneTiles.push({ x: x - w, y });
          }
        }
      }
      // Deduplicate tiles (corners can overlap) and collect unique hit targets
      const seen = new Set();
      const hitTargets = [];
      for (const t of coneTiles) {
        const k = t.y * combat.w + t.x;
        if (seen.has(k)) continue;
        seen.add(k);
        const e = unitAt(combat, t.x, t.y);
        if (!e) continue;
        if (e.id === u.id) continue;
        if (hitTargets.find(h => h.id === e.id)) continue;
        hitTargets.push(e);
      }
      for (const e of hitTargets) {
        const dmg = roll(rng, dmgDice);
        const save = d20(rng) + (e.char.stats ? mod(e.char.stats.DEX) : savingThrowMod(e.char, 'DEX'));
        if (save >= dc) applyDamage(combat, e, u, Math.floor(dmg / 2), type, { aoe: true, magical: true });
        else applyDamage(combat, e, u, dmg, type, { aoe: true, magical: true });
      }
      // Visual cone flash
      if (combat) {
        const col = type === 'fire' ? '#ff7a2a' : type === 'cold' ? '#6ac2ff' : type === 'acid' ? '#7ae05a' : type === 'lightning' ? '#ffe83c' : type === 'poison' ? '#c87ae8' : '#ff7a2a';
        pushFx(combat, { type: 'cone', tiles: coneTiles, color: col, dur: 420 });
      }
      log(combat, `🐉 ${u.name} exhales a blast of ${type}!`);
      break;
    }
    case 'hurl_flame': {
      const target = combat.units.find(x => x.id === action.targetId);
      if (!target) return;
      const def = char.attacks.find(a => a.name === 'Hurl Flame');
      if (def) monsterAttack(combat, u, target, def);
      spendAction(u);
      break;
    }
    case 'divine_smite': {
      const target = combat.units.find(x => x.id === action.targetId);
      if (!target || target.dead) return;
      // find a usable slot (lowest first)
      let smiteLevel = 0;
      if (char.cls.warlock) {
        if (char.pactSlotsUsed < char.pactSlots.reduce((total, slot) => total + (slot.max || 0), 0)) { char.pactSlotsUsed++; smiteLevel = highestSpellLevel(char); }
      } else {
        for (let i = 0; i < char.spellSlots.length; i++) {
          if (char.spellSlots[i] > (char.spellSlotsUsed[i] || 0)) { char.spellSlotsUsed[i]++; smiteLevel = i + 1; break; }
        }
      }
      if (!smiteLevel) { log(combat, 'No spell slots to smite with.'); return; }
      const dist = Math.max(Math.abs(u.x - target.x), Math.abs(u.y - target.y));
      const w = char.weapon ? char.weapon.base : 'fists';
      const reach = WEAPONS[w] && WEAPONS[w].properties.includes('reach') ? 2 : 1;
      if (dist > reach) { log(combat, 'Target too far to smite.'); return; }
      let dice = `${2 + (smiteLevel - 1)}d8`;
      if (target.char.type === 'fiend' || target.char.type === 'undead') dice = `${3 + (smiteLevel - 1)}d8`;
      const res = weaponAttack(combat, u, target, { weaponId: w, extraDmg: dice });
      spendAction(u);
      if (!res.hit) {
        // 5e: the slot is only consumed on a hit — refund it
        if (char.cls.warlock) char.pactSlotsUsed--;
        else char.spellSlotsUsed[smiteLevel - 1]--;
        log(combat, `${u.name}'s smite fizzles on the miss — the slot is spared.`);
      } else {
        Audio.play('spells/radiant', { vol: 0.85, delay: 100 });
        log(combat, `⚜ DIVINE SMITE! ${u.name} channels holy fury (${dice} radiant)!`);
      }
      break;
    }
    case 'stunning_strike': {
      const target = combat.units.find(x => x.id === action.targetId);
      if (!target || target.dead) return;
      if (!char.resources.ki || char.resources.ki.cur <= 0) { log(combat, 'No ki left.'); return; }
      const w = char.weapon ? char.weapon.base : 'fists';
      const dist = Math.max(Math.abs(u.x - target.x), Math.abs(u.y - target.y));
      const reach = WEAPONS[w] && WEAPONS[w].properties.includes('reach') ? 2 : 1;
      if (dist > reach) { log(combat, 'Target too far.'); return; }
      weaponAttack(combat, u, target, { weaponId: w, stunningStrike: true });
      spendAction(u);
      break;
    }
    case 'trip_attack': {
      const target = combat.units.find(x => x.id === action.targetId);
      if (!target || target.dead) return;
      if (!char.resources.superiority || char.resources.superiority.cur <= 0) { log(combat, 'No superiority dice left.'); return; }
      const w = char.weapon ? char.weapon.base : 'fists';
      const dist = Math.max(Math.abs(u.x - target.x), Math.abs(u.y - target.y));
      const reach = WEAPONS[w] && WEAPONS[w].properties.includes('reach') ? 2 : 1;
      if (dist > reach) { log(combat, 'Target too far.'); return; }
      weaponAttack(combat, u, target, { weaponId: w, tripAttack: true });
      spendAction(u);
      break;
    }
    default:
      log(combat, `Unknown ability ${abilityId}.`);
  }
}

// ============================== MONSTER POWERS ==============================
export function useMonsterPower(combat, u, powerId, action) {
  const rng = combat.rng;
  const m = u.char;
  const targets = alivePlayers(combat);
  const inCone = (dir, size) => targets.filter(t => {
    const dx = t.x - u.x, dy = t.y - u.y;
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    if (d > size) return false;
    if (dir.dx !== 0) return Math.sign(dx) === dir.dx && Math.abs(dy) <= Math.min(d, 1 + Math.floor(Math.abs(dx) / 2));
    return Math.sign(dy) === dir.dy && Math.abs(dx) <= Math.min(d, 1 + Math.floor(Math.abs(dy) / 2));
  });

  switch (powerId) {
    case 'fire_breath': case 'acid_breath': {
      if (u.ai) u.ai.breathUsed = true;
      const dir = action.direction || { dx: Math.sign((targets[0] ? targets[0].x : 1) - u.x) || 1, dy: 0 };
      const size = 3;
      const type = powerId === 'fire_breath' ? 'fire' : 'acid';
      const dc = 8 + (m.cr >= 10 ? 6 : m.cr >= 4 ? 5 : 4);
      Audio.play('units/roar', { vol: 0.85 });
      Audio.play(`spells/${type}`, { vol: 0.75, delay: 120 });
      log(combat, `🔥 ${u.name} breathes a cone of ${type}!`);
      // Proper cone for monsters too
      const primary = Math.abs(dir.dx) >= Math.abs(dir.dy) ? 'x' : 'y';
      const coneTiles = [];
      for (let i = 1; i <= size; i++) {
        const x = u.x + dir.dx * i, y = u.y + dir.dy * i;
        if (!inBounds(combat, x, y)) break;
        const t = combat.grid[y][x];
        if (t.obstacle) { const ob = OBSTACLES[t.obstacle]; if (ob && ob.tall) break; }
        coneTiles.push({ x, y });
        const width = Math.min(i, Math.floor(size / 2));
        for (let w = 1; w <= width; w++) {
          if (primary === 'x') {
            if (inBounds(combat, x, y + w)) coneTiles.push({ x, y: y + w });
            if (inBounds(combat, x, y - w)) coneTiles.push({ x, y: y - w });
          } else {
            if (inBounds(combat, x + w, y)) coneTiles.push({ x: x + w, y });
            if (inBounds(combat, x - w, y)) coneTiles.push({ x: x - w, y });
          }
        }
      }
      const seenM = new Set();
      const hitM = [];
      for (const t of coneTiles) {
        const k = t.y * combat.w + t.x;
        if (seenM.has(k)) continue;
        seenM.add(k);
        const e = unitAt(combat, t.x, t.y);
        if (!e) continue;
        if (e.id === u.id) continue;
        if (hitM.find(h => h.id === e.id)) continue;
        hitM.push(e);
      }
      for (const e of hitM) {
        const dmg = roll(rng, m.cr >= 10 ? '12d6' : '4d6');
        const save = d20(rng) + (e.char.stats ? mod(e.char.stats.DEX) : savingThrowMod(e.char, 'DEX'));
        if (save >= dc) applyDamage(combat, e, u, Math.floor(dmg / 2), type, { aoe: true, magical: true });
        else applyDamage(combat, e, u, dmg, type, { aoe: true, magical: true });
      }
      const colM = type === 'fire' ? '#ff7a2a' : type === 'acid' ? '#7ae05a' : '#ff7a2a';
      pushFx(combat, { type: 'cone', tiles: coneTiles, color: colM, dur: 420 });
      break;
    }
    case 'mind_blast': {
      const dir = action.direction || { dx: Math.sign((targets[0] ? targets[0].x : 1) - u.x) || 1, dy: 0 };
      Audio.play('spells/psychic', { vol: 0.85 });
      log(combat, `🧠 ${u.name} unleashes a Mind Blast!`);
      // Proper line but with correct save mod
      const primary = Math.abs(dir.dx) >= Math.abs(dir.dy) ? 'x' : 'y';
      const lineTiles = [];
      for (let i = 1; i <= 3; i++) {
        const x = u.x + dir.dx * i, y = u.y + dir.dy * i;
        if (!inBounds(combat, x, y)) break;
        const t = combat.grid[y][x];
        if (t.obstacle) { const ob = OBSTACLES[t.obstacle]; if (ob && ob.tall) break; }
        lineTiles.push({ x, y });
      }
      for (const tile of lineTiles) {
        const e = unitAt(combat, tile.x, tile.y);
        if (!e) continue;
        const save = d20(rng) + (e.char.stats ? mod(e.char.stats.INT) : savingThrowMod(e.char, 'INT'));
        if (save < 15) {
          addStatus(e, 'stunned', 'Stunned', 1);
          applyDamage(combat, e, u, roll(rng, '4d8'), 'psychic', { aoe: true, magical: true });
          log(combat, `${e.name} is stunned!`);
        } else {
          applyDamage(combat, e, u, Math.floor(roll(rng, '4d8') / 2), 'psychic', { aoe: true, magical: true });
        }
      }
      pushFx(combat, { type: 'line', tiles: lineTiles, color: '#f07ad8', dur: 420 });
      break;
    }
    case 'petrifying_gaze': {
      const t = targets.find(t => Math.max(Math.abs(t.x - u.x), Math.abs(t.y - u.y)) <= 5 && hasLOS(combat, u.x, u.y, t.x, t.y));
      if (t) {
        const save = d20(rng) + (t.char.stats ? mod(t.char.stats.CON) : savingThrowMod(t.char, 'CON'));
        if (save < 12) {
          addStatus(t, 'stunned', 'Petrified', 2);
          log(combat, `🗿 ${t.name} begins turning to stone!`);
        } else {
          log(combat, `${t.name} averts their gaze in time.`);
        }
      }
      break;
    }
    case 'eye_rays': {
      log(combat, `👁 ${u.name} fires its eye rays!`);
      const rays = [
        { name: 'fire ray', type: 'fire', dmg: '4d6', save: 'DEX', dc: 16 },
        { name: 'necrotic ray', type: 'necrotic', dmg: '4d6', save: 'CON', dc: 16 },
        { name: 'charm ray', fx: 'charm', save: 'WIS', dc: 16 },
        { name: 'paralyzing ray', fx: 'paralyze', save: 'CON', dc: 16 },
        { name: 'fear ray', fx: 'fear', save: 'WIS', dc: 16 },
        { name: 'slowing ray', fx: 'slow', save: 'DEX', dc: 16 },
      ];
      for (let i = 0; i < 3; i++) {
        const t = combat.rng.pick(targets);
        if (!t) break;
        const ray = combat.rng.pick(rays);
        const save = d20(rng) + (t.char.stats ? mod(t.char.stats[ray.save]) : savingThrowMod(t.char, ray.save));
        if (ray.dmg) {
          if (save >= ray.dc) { applyDamage(combat, t, u, Math.floor(roll(rng, ray.dmg) / 2), ray.type, { aoe: true, magical: true }); log(combat, `${t.name} saves vs ${ray.name}.`); }
          else { applyDamage(combat, t, u, roll(rng, ray.dmg), ray.type, { aoe: true, magical: true }); log(combat, `${t.name} is hit by the ${ray.name}!`); }
        } else if (save < ray.dc) {
          if (ray.fx === 'charm') { addStatus(t, 'charmed', 'Charmed', 2); log(combat, `${t.name} is charmed!`); }
          else if (ray.fx === 'paralyze') { addStatus(t, 'paralyzed', 'Paralyzed', 2); log(combat, `${t.name} is paralyzed!`); }
          else if (ray.fx === 'fear') { addStatus(t, 'frightened', 'Frightened', 2, { source: u.id }); log(combat, `${t.name} is frightened!`); }
          else if (ray.fx === 'slow') { addStatus(t, 'slowed', 'Slowed', 2); log(combat, `${t.name} is slowed!`); }
        }
      }
      break;
    }
    case 'fireball_cast': {
      const t = action.targetId ? combat.units.find(x => x.id === action.targetId) : targets[0];
      if (!t) break;
      log(combat, `💥 ${u.name} hurls a fireball!`);
      const dc = 13;
      for (const e of combat.units) {
        if (e.team !== 'player') continue;
        const d = Math.max(Math.abs(e.x - t.x), Math.abs(e.y - t.y));
        if (d > 2) continue;
        const dmg = roll(rng, '8d6');
        const save = d20(rng) + (e.char.stats ? mod(e.char.stats.DEX) : savingThrowMod(e.char, 'DEX'));
        if (save >= dc) applyDamage(combat, e, u, Math.floor(dmg / 2), 'fire', { aoe: true, magical: true });
        else applyDamage(combat, e, u, dmg, 'fire', { aoe: true, magical: true });
      }
      break;
    }
    case 'luring_song': {
      log(combat, `🎶 ${u.name} sings a luring song!`);
      for (const t of targets) {
        const d = Math.max(Math.abs(t.x - u.x), Math.abs(t.y - u.y));
        if (d > 6) continue;
        const save = d20(rng) + (t.char.stats ? mod(t.char.stats.WIS) : savingThrowMod(t.char, 'WIS'));
        if (save < 11) {
          addStatus(t, 'charmed', 'Charmed', 2);
          log(combat, `${t.name} is lured by the song!`);
        }
      }
      break;
    }
    case 'aggressive': {
      // bonus move toward nearest player
      const t = combat.units.find(x => x.id === action.targetId) || targets[0];
      if (t) {
        const res = findPath(combat, u, t.x, t.y, computeSpeed(u.char) + 5);
        if (res) moveUnit(combat, u, res.path);
      }
      break;
    }
    case 'nimble_escape': {
      u.moveRemaining += computeSpeed(u.char);
      break;
    }
    case 'multiattack': {
      // handled in AI via extra attacks
      break;
    }
    default:
      log(combat, `${u.name} uses ${powerId}.`);
  }
}
