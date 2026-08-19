// Floating combat numbers test: verifies the engine pushes type-tagged popup
// events (damage/heal/immune, magical, crit) and the UI color/icon mapping.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"><div id="ui"></div></div></body></html>', {
  url: 'http://localhost:8080/index.html',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.navigator = dom.window.navigator;
globalThis.requestAnimationFrame = fn => setTimeout(fn, 16);
globalThis.confirm = () => true;
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  const store = {};
  return new Proxy(store, {
    get: (t, p) => {
      if (p === 'measureText') return () => ({ width: 20 });
      if (p in t) return t[p];
      return () => {};
    },
    set: (t, p, v) => { t[p] = v; return true; },
  });
};

const ui = await import('../src/ui.js');
const Combat = await import('../src/5e/combat.js');
const Actions = await import('../src/5e/combat_actions.js');
const { makeRng } = await import('../src/rng.js');
ui.setG({ meta: null, hero: null, run: null, combat: null });

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); };

// ---- 1. UI color/icon mapping (user spec: fire red, ice blue, acid green, ⚔/⚒) ----
const S = ui.POPUP_STYLES;
assert(S.fire.color === '#ff6a2a', 'fire must be red');
assert(S.cold.color === '#6ac2ff', 'cold must be blue');
assert(S.acid.color === '#7ae05a', 'acid must be green');
assert(S.slashing.icon === '⚔', 'slashing icon must be ⚔');
assert(S.bludgeoning.icon === '⚒', 'bludgeoning icon must be ⚒');
assert(S.piercing.icon === '🗡', 'piercing icon must be 🗡');
step('POPUP_STYLES: fire red · cold blue · acid green · ⚔ ⚒ 🗡 icons');

// ---- 2. engine popup events ----
const rng = makeRng(7);
const combat = { popups: [], log: [], rng, round: 1, effects: [], units: [] };
const mkChar = (extra = {}) => ({ buffs: [], statuses: [], ...extra });
const attacker = Combat.makeUnit(mkChar({ cls: {} }), 'player', 1, 1);
const target = Combat.makeUnit(mkChar({ cls: {}, immunities: [] }), 'enemy', 5, 5);
combat.units.push(attacker, target);

const count = () => combat.popups.length;
const last = () => combat.popups[combat.popups.length - 1];

// slashing 10 → "10⚔"
Actions.applyDamage(combat, target, attacker, 10, 'slashing', {});
assert(last().kind === 'dmg' && last().amount === 10 && last().type === 'slashing' && !last().magical && !last().crit, 'slashing popup wrong: ' + JSON.stringify(last()));
step('10 slashing damage → popup with type=slashing');

// magical bludgeoning 5 → "5✨⚒"
Actions.applyDamage(combat, target, attacker, 5, 'bludgeoning', { magical: true });
assert(last().magical === true && last().type === 'bludgeoning', 'magical bludgeoning popup wrong');
step('5 magical bludgeoning → magical flag set (✨⚒)');

// fire crit 12
Actions.applyDamage(combat, target, attacker, 12, 'fire', { crit: true });
assert(last().crit === true && last().type === 'fire', 'fire crit popup wrong');
step('crit fire → crit flag set (bigger 💥 text)');

// quiet damage → no popup
const before = count();
Actions.applyDamage(combat, target, attacker, 2, 'piercing', { quiet: true });
assert(count() === before, 'quiet damage must not popup');
step('quiet damage (ticks) suppressed');

// immunity → IMMUNE popup
const immuneTarget = Combat.makeUnit(mkChar({ cls: {}, immunities: ['fire'] }), 'enemy', 4, 4);
Actions.applyDamage(combat, immuneTarget, attacker, 5, 'fire', {});
assert(last().kind === 'immune' && last().type === 'fire', 'immune popup wrong: ' + JSON.stringify(last()));
step('immune target → IMMUNE popup');

// heal → +N 💚
target.hp = 20; target.maxHp = 50;
Actions.healUnit(combat, attacker, target, 7);
assert(last().kind === 'heal' && last().amount === 7, 'heal popup wrong: ' + JSON.stringify(last()));
step('healing → +7 💚 popup');

// ---- 3. full battle integration: popups accumulate during real combat ----
const { generateCombatMap, spawnEncounter, currentUnit, aliveEnemies, unitAt, findPath, isPassable } = Combat;
const { createCharacter } = await import('../src/5e/rules.js');
const { generateCompanion, autoAssignScores } = await import('../src/game/run.js');
const { RACES } = await import('../src/data/races.js');
const { CLASSES, CLASS_MAP } = await import('../src/data/classes.js');
const { LOCATION_MAP } = await import('../src/data/locations.js');
const { performAction } = await import('../src/5e/turn.js');
const { chooseEnemyAction, executeEnemyTurn } = await import('../src/5e/ai.js');
const { endTurn, canAct } = await import('../src/5e/combat_actions.js');

const r2 = makeRng(31337);
const race = r2.pick(RACES), cls = CLASS_MAP.fighter;
const hero = createCharacter({ raceId: race.id, classId: 'fighter', name: 'PopHero', subclassId: 'champion', scoreAssign: autoAssignScores(cls, race, r2), level: 2, hero: true, rng: r2 });
const party = [hero];
const used = new Set(['fighter']);
for (let i = 0; i < 3; i++) { const c = generateCompanion(r2, 2, [...used]); used.add(c.classId); party.push(c); }
const battle = generateCombatMap(LOCATION_MAP.tavern, 1, r2, { revealed: true });
spawnEncounter(battle, party, 1, r2, {});
let guard = 0;
while (!battle.over && guard++ < 400) {
  const u = currentUnit(battle);
  if (!u) break;
  if (u.dead || !canAct(u)) { endTurn(battle); continue; }
  if (u.team === 'player') {
    const enemies = aliveEnemies(battle);
    const t = enemies.reduce((a, b) => (a.hp * 2 + Math.abs(a.x - u.x)) < (b.hp * 2 + Math.abs(b.x - u.x)) ? a : b);
    const dist = Math.max(Math.abs(t.x - u.x), Math.abs(t.y - u.y));
    if (dist <= 1) performAction(battle, u.id, { type: 'attack', targetId: t.id, opts: { weaponId: u.char.weapon.base } });
    else {
      let res = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cand = { x: t.x + dx, y: t.y + dy };
        if (isPassable(battle, cand.x, cand.y) && !unitAt(battle, cand.x, cand.y)) { const r = findPath(battle, u, cand.x, cand.y, u.moveRemaining); if (r) { res = r; break; } }
      }
      if (res) performAction(battle, u.id, { type: 'move', path: res.path });
    }
    endTurn(battle);
  } else {
    executeEnemyTurn(battle, u, chooseEnemyAction(battle, u));
    const cur = currentUnit(battle);
    if (cur && cur.id === u.id && !battle.over) endTurn(battle);
  }
}
assert((battle.popups || []).length > 0, 'a full battle should produce popups');
const dmgTypes = new Set((battle.popups || []).filter(p => p.kind === 'dmg').map(p => p.type));
assert(dmgTypes.size >= 1, 'popups carry damage types');
step(`full battle produced ${battle.popups.length} popups across types: ${[...dmgTypes].join(', ')}`);

// ---- 4. MISS POPUPS ----
{
  const { buildMonster } = await import('../src/5e/rules.js');
  const { MONSTERS } = await import('../src/data/monsters.js');
  const rng4 = makeRng(404);
  const mkHero = (clsId) => createCharacter({ raceId: RACES[0].id, classId: clsId, name: 'Miss' + clsId, subclassId: Object.keys(CLASS_MAP[clsId].subclasses)[0], scoreAssign: autoAssignScores(CLASS_MAP[clsId], RACES[0], rng4), level: 1, hero: false, rng: rng4 });
  const battle2 = Combat.generateCombatMap(LOCATION_MAP.tavern, 1, rng4, { revealed: true });

  // 4a. player weapon attack miss → Miss popup over the defender
  {
    const atk = Combat.makeUnit(mkHero('fighter'), 'player', 5, 5);
    const def = Combat.makeUnit(mkHero('rogue'), 'enemy', 6, 5);
    battle2.units = [atk, def];
    let missed = false;
    for (let seed = 0; seed < 600 && !missed; seed++) {
      battle2.rng = makeRng(seed);
      battle2.popups = [];
      const res = Actions.weaponAttack(battle2, atk, def, { weaponId: atk.char.weapon.base });
      if (!res.hit) {
        const p = battle2.popups.find(x => x.kind === 'miss');
        if (p && p.x === def.x && p.y === def.y) missed = true;
      }
    }
    assert(missed, 'weapon attack misses should push a Miss popup on the defender');
    step('player weapon miss → "Miss" over the defender');
  }

  // 4b. monster attack miss → Miss popup over the player
  {
    const goblin = buildMonster(MONSTERS.goblin, null);
    const atk = Combat.makeUnit(goblin, 'enemy', 5, 5);
    const def = Combat.makeUnit(mkHero('fighter'), 'player', 6, 5);
    battle2.units = [atk, def];
    let missed = false;
    for (let seed = 0; seed < 600 && !missed; seed++) {
      battle2.rng = makeRng(seed);
      battle2.popups = [];
      performAction(battle2, atk.id, { type: 'attack', targetId: def.id, attackDef: goblin.attacks[0] });
      const p = battle2.popups.find(x => x.kind === 'miss');
      if (p && p.x === def.x && p.y === def.y) missed = true;
    }
    assert(missed, 'monster attack misses should push a Miss popup on the player');
    step('monster attack miss → "Miss" over the player');
  }

  // 4c. spell attack-roll miss (Fire Bolt) → Miss popup over the target
  {
    const wiz = mkHero('wizard');
    const caster = Combat.makeUnit(wiz, 'player', 5, 5);
    const def = Combat.makeUnit(mkHero('rogue'), 'enemy', 6, 5);
    battle2.units = [caster, def];
    let missed = false;
    for (let seed = 0; seed < 600 && !missed; seed++) {
      battle2.rng = makeRng(seed);
      battle2.popups = [];
      Actions.castSpell(battle2, caster, 'fire_bolt', { target: def });
      const p = battle2.popups.find(x => x.kind === 'miss');
      if (p && p.x === def.x && p.y === def.y) missed = true;
    }
    assert(missed, 'spell attack misses should push a Miss popup on the target');
    step('spell attack miss → "Miss" over the target');
  }

  // 4d. hits must NOT push a Miss popup
  {
    const atk = Combat.makeUnit(mkHero('fighter'), 'player', 5, 5);
    const def = Combat.makeUnit(mkHero('rogue'), 'enemy', 6, 5);
    battle2.units = [atk, def];
    let hitWithMissPopup = false;
    for (let seed = 0; seed < 200 && !hitWithMissPopup; seed++) {
      battle2.rng = makeRng(seed);
      battle2.popups = [];
      const res = Actions.weaponAttack(battle2, atk, def, { weaponId: atk.char.weapon.base });
      if (res.hit && battle2.popups.some(x => x.kind === 'miss')) hitWithMissPopup = true;
    }
    assert(!hitWithMissPopup, 'hits must never show a Miss popup');
    step('hits never show a Miss popup');
  }
}

console.log('POPUP TEST OK');
process.exit(0);
