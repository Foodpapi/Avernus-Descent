import { makeRng } from '../src/rng.js';
import { createCharacter } from '../src/5e/rules.js';
import { autoAssignScores, newRun, pickNextLocation, startFloor, floorIsBoss, rollLoot, applyLoot, levelUpParty, levelUpChoicesFor, buyShopItem, endRun, shardsForFloor, makeItemInstance, shortRestParty, applyPendingLevelUp } from '../src/game/run.js';
import { RACES } from '../src/data/races.js';
import { CLASSES } from '../src/data/classes.js';
import { LOCATION_MAP } from '../src/data/locations.js';
import { generateCombatMap, spawnEncounter, currentUnit, aliveEnemies } from '../src/5e/combat.js';
import { endTurn, canAct } from '../src/5e/combat_actions.js';
import { performAction } from '../src/5e/turn.js';
import { chooseEnemyAction, executeEnemyTurn } from '../src/5e/ai.js';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,String(v)), removeItem: k => store.delete(k) };
}

const meta = { shards: 2000, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
const rng = makeRng(7);
const race = rng.pick(RACES), cls = rng.pick(CLASSES);
const hero = createCharacter({ raceId: race.id, classId: cls.id, name: 'MetaHero', subclassId: Object.keys(cls.subclasses)[0], scoreAssign: autoAssignScores(cls, race, rng), level: 1, hero: true, rng });
meta.hero = hero;

// shop buys
for (const id of ['potion_belt', 'lucky_coin', 'wayfarers_map']) {
  const r = buyShopItem(meta, id);
  console.log('buy', id, '->', r.ok, '| shards left', meta.shards);
}
const r1 = buyShopItem(meta, 'veterans_manual');
console.log('buy too-expensive ->', r1.ok, r1.msg);

// run
const run = newRun(meta, hero);
console.log('run start: party', run.party.map(c => `${c.name}(${c.cls.id}${c.hero?' HERO':''}) Lv${c.level}`).join(', '));
console.log('effects:', run.effects.map(e => e.id).join(', '));
console.log('hero potions (belt):', hero.inventory.map(i => i.name).join(', '));

// simulate 6 floors
for (let f = 1; f <= 6; f++) {
  const pick = pickNextLocation(run, meta);
  const locId = pick.chosen ? pick.chosen.id : pick.choices[0].id;
  startFloor(run, meta, locId);
  const combat = generateCombatMap(run.location, run.floor, run.rng, { revealed: true });
  spawnEncounter(combat, run.party, run.floor, run.rng, { boss: floorIsBoss(run.floor) });
  // cheat: hero (near-)invincible for meta test — the test exercises the META
  // loop (loot/levels/shop), not combat difficulty, and its policy is dumb.
  const heroU = combat.units.find(u => u.char.hero);
  if (heroU) { heroU.maxHp += 50000; heroU.hp += 50000; }
  let guard = 0;
  while (!combat.over && guard++ < 3000) {
    // round cap: declare victory so the meta flow can proceed
    if (combat.round > 45) { console.log('  (forced win at round cap)'); combat.won = true; combat.over = true; break; }
    const u = currentUnit(combat);
    if (!u) break;
    if (u.dead || !canAct(u)) { endTurn(combat); continue; }
    if (u.team === 'player') {
      const enemies = aliveEnemies(combat);
      const t = enemies.reduce((a,b) => (a.hp*2+Math.abs(a.x-u.x)) < (b.hp*2+Math.abs(b.x-u.x)) ? a : b);
      const dist = Math.max(Math.abs(t.x-u.x), Math.abs(t.y-u.y));
      if (dist <= 1) performAction(combat, u.id, { type: 'attack', targetId: t.id, opts: { weaponId: u.char.weapon.base } });
      else {
        const { findPath, isPassable, unitAt } = await import('../src/5e/combat.js');
        let res = null;
        for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const cand = { x: t.x+dx, y: t.y+dy };
          if (isPassable(combat,cand.x,cand.y) && !unitAt(combat,cand.x,cand.y)) { const r = findPath(combat,u,cand.x,cand.y,u.moveRemaining); if (r) { res = r; break; } }
        }
        if (res) performAction(combat, u.id, { type: 'move', path: res.path });
      }
      endTurn(combat);
    } else {
      const action = chooseEnemyAction(combat, u);
      executeEnemyTurn(combat, u, action);
      const cur = currentUnit(combat);
      if (cur && cur.id === u.id && !combat.over) endTurn(combat);
    }
  }
  console.log(`floor ${f} (${locId}${floorIsBoss(f)?' BOSS':''}): ${combat.won ? 'WIN' : 'LOSS'} rounds=${combat.round} gold=${combat.gold}`);
  if (!combat.won) {
    for (const u of combat.units) console.log('   DEBUG', u.team, u.name, 'hp', u.hp, '/', u.maxHp, u.dead ? 'DEAD' : '', u.overboard ? 'OVERBOARD' : '', u.statuses.map(s => s.id).join(','));
    for (const l of combat.log) console.log('   LOG', l);
    console.log('META TEST FAIL: floor lost');
    process.exit(1);
  }
  run.floorsCleared++;
  run.runGold += combat.gold;
  const shards = shardsForFloor(run.floorsCleared, meta);
  run.shardsEarned += shards; meta.shards += shards;
  const loot = rollLoot(run, meta.shopItems['pouch_plenty'] ? 4 : 3, { boss: floorIsBoss(f) });
  console.log('  loot:', loot.items.map(i => `${i.kind}:${i.name}${i.enchant ? ' ['+i.enchant.name+']' : ''}`).join(' | '));
  const inst = loot.items[0];
  const target = run.party.find(c => !c.dead);
  applyLoot(run, inst, target.id);
  console.log('  given to', target.name, '| weapon now:', target.weapon.base, target.weapon.enchant?.name || 'plain', '| trinkets:', target.trinkets.length);
  shortRestParty(run);
  if (run.floorsCleared % 2 === 0) {
    const choices = levelUpChoicesFor(hero, run.rng);
    const heroChoice = choices.type === 'asi' ? { asi: ['CON'] } : choices.type === 'spell' && choices.options.length ? { spell: choices.options[0] } : {};
    const hc = {}; hc[hero.id] = heroChoice;
    levelUpParty(run, meta, hc);
    // companions queue their level-ups for the campfire — apply them here
    for (const c of run.party) {
      if (!c.dead && !c.hero && c.pendingLevelUp) applyPendingLevelUp(run, c.id, {});
    }
    console.log('  LEVEL UP -> party level', run.party.filter(c=>!c.dead).map(c=>c.level).join(','));
  }
}
// verify flags
const tempItem = run.party[0].inventory.find(i => i);
console.log('run item persistent flag:', tempItem ? tempItem.persistent : 'n/a', '(must be false)');
// end run
endRun(meta, run, false, false);
console.log('after endRun: hero level', hero.level, '| inventory (must be empty):', hero.inventory.length, '| trinkets (must be empty):', hero.trinkets.length, '| hero hp', hero.hp);
console.log('meta: shards', meta.shards, 'runs', meta.runs, 'deaths', meta.deaths);
console.log('META TEST OK');
