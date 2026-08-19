// Tests for: wild shape forms, 2-fail death saves, multiclass pending-consumption,
// prepared spells, town generation (shop bias, hire, lineup), and town events.
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
const errors = [];
dom.window.addEventListener('error', e => errors.push(e.message));

const Run = await import('../src/game/run.js');
const Combat = await import('../src/5e/combat.js');
const Actions = await import('../src/5e/combat_actions.js');
const { makeRng } = await import('../src/rng.js');
const { createCharacter, canCastSpell, WILD_SHAPES, wildShapeFormsFor, mod } = await import('../src/5e/rules.js');
const { performAction } = await import('../src/5e/turn.js');
const { RACES } = await import('../src/data/races.js');
const { CLASS_MAP } = await import('../src/data/classes.js');
const { LOCATION_MAP } = await import('../src/data/locations.js');
const { SHOP_TYPES } = await import('../src/data/town.js');
const ui = await import('../src/ui.js');

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); };

function mkChar(clsId, level, subclassId, rng) {
  const cls = CLASS_MAP[clsId];
  const race = RACES[0];
  return createCharacter({ raceId: race.id, classId: clsId, name: 'Test' + clsId, subclassId: subclassId || Object.keys(cls.subclasses)[0], scoreAssign: Run.autoAssignScores(cls, race, rng), level, hero: false, rng });
}

// ============ 1. WILD SHAPE ============
const rng = makeRng(11);
const druid = mkChar('druid', 2, 'moon', rng);
const enemy = Combat.makeUnit({ ...rng, attacks: [{ name: 'Claw', toHit: 4, dmg: '1d6+2', dmgType: 'slashing', range: 'melee' }], ac: 12, stats: { STR: 12, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 }, powers: [] }, 'enemy', 4, 4);
const du = Combat.makeUnit(druid, 'player', 3, 3);
const battle = {
  popups: [], log: [], rng: makeRng(5), round: 1, effects: [], units: [du, enemy], w: 10, h: 10, grid: [], over: false, won: false,
};
for (let y = 0; y < 10; y++) { battle.grid.push(Array.from({ length: 10 }, () => ({ obstacle: null, elevation: 0, hazard: null }))); }

const forms = wildShapeFormsFor(druid);
assert(forms.includes('bear'), 'moon druid should have bear form');
assert(druid.resources.wildShape.cur === 2, 'druid should have 2 wild shape uses');
step('wild shape: moon druid has bear form and 2 uses');

assert(Actions.wildShapeInto(battle, du, 'bear'), 'wild shape into bear');
assert(du.wildShaped && du.form && du.form.name === 'Brown Bear', 'unit should be wild shaped');
assert(du.form.hp === 34, 'bear form HP 34');
assert(druid.wildShapeForm, 'char should track the form');
step('wild shape into Bear: form HP pool + form state');

// spells blocked while shaped
const castResult = performAction(battle, du.id, { type: 'cast', spellId: 'entangle', targetId: enemy.id });
assert(battle.log.some(l => l.includes('cannot cast spells while wild shaped')), 'casting should be blocked while shaped');
step('spells are blocked while wild shaped');

// bear attack uses form dice
enemy.hp = 30; enemy.maxHp = 30;
performAction(battle, du.id, { type: 'attack', targetId: enemy.id });
const hitLog = battle.log.some(l => l.includes('Brown Bear') && l.includes('hits'));
assert(hitLog, 'bear attack should use form attack profile');
step('bear attacks with its own profile');

// form HP pool: damage hits the form first, revert at 0 with overflow
Actions.applyDamage(battle, du, enemy, 999, 'fire');
assert(!du.wildShaped, 'massive damage should revert the form');
assert(druid.wildShapeForm === null, 'char form cleared');
assert(du.hp < druid.maxHp, 'overflow damage should carry to the druid');
step('form HP 0 → revert, overflow carries to the druid');

// revert ability (heal first — the 999 test damage left the druid dying)
du.hp = Math.max(du.hp, 10); du.dead = false; du.statuses = [];
Actions.wildShapeInto(battle, du, 'wolf');
assert(du.wildShaped);
performAction(battle, du.id, { type: 'ability', ability: 'revert_wild_shape' });
assert(!du.wildShaped, 'revert ability should end the form');
step('Revert Form ability works');

// ============ 2. DEATH SAVES: TWO FAILS = DIE ============
{
  // find a seed whose first d20 roll is a fail (1-9) with one prior failure
  let seed = 0, killed = false;
  for (; seed < 500; seed++) {
    const probe = Combat.makeUnit(mkChar('fighter', 1, null, makeRng(seed)), 'player', 1, 1);
    probe.hp = 0;
    Combat.addStatus(probe, 'dying', 'Dying', 5);
    const s0 = Combat.getStatus(probe, 'dying');
    s0.fails = 1; s0.successes = 0;
    const localBattle = { ...battle, units: [probe], rng: makeRng(seed), popups: [], log: [], round: 1 };
    Actions.tickStartOfTurn(localBattle, probe);
    if (probe.dead) { killed = true; break; }
  }
  assert(killed, 'a unit with 1 prior fail should die on its second fail');
  step('death saves: two failed checks → death');
}

// healing ends dying
const hu2 = Combat.makeUnit(mkChar('cleric', 1, 'life', rng), 'player', 1, 1);
hu2.hp = 0;
Combat.addStatus(hu2, 'dying', 'Dying', 5);
const healer = Combat.makeUnit(mkChar('cleric', 1, 'life', rng), 'player', 2, 2);
Actions.healUnit(battle, healer, hu2, 5);
assert(hu2.hp >= 5 && !Combat.getStatus(hu2, 'dying'), 'healing should end death-save mode');
step('healing ends death saving throw mode');

// ============ 3. MULTICLASS CONSUMES THE PENDING LEVEL-UP ============
const meta = { shards: 0, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
const heroChar = mkChar('wizard', 2, 'evocation', rng);
heroChar.hero = true;
meta.hero = heroChar;
const run = Run.newRun(meta, heroChar);
run.location = LOCATION_MAP.tavern;
const comp = run.party.find(c => !c.hero);
comp.pendingLevelUp = true;
const mainLevelBefore = comp.classLevel;
const totalBefore = comp.level;
const ok = Run.applyPendingLevelUp(run, comp.id, { type: 'multiclass', classId: 'barbarian' });
assert(ok, 'multiclass level-up should apply');
assert(comp.classLevel === mainLevelBefore, `main class must NOT level up (was ${mainLevelBefore}, now ${comp.classLevel})`);
assert(comp.level === totalBefore + 1, 'total level +1 only');
assert(comp.secondClass && comp.secondClass.classId === 'barbarian' && comp.secondClass.level === 1, 'barbarian 1 granted');
assert(comp.pendingLevelUp === false, 'pending level-up consumed');
step('multiclass fix: multiclassing consumes the pending level (no double level-up)');

// ============ 4. PREPARED SPELLS ============
const wiz = mkChar('wizard', 1, 'evocation', rng);
assert(wiz.preparedSpells && wiz.preparedSpells.length > 0, 'wizard should have prepared spells');
const cap = 1 + mod(wiz.abilities.INT);
assert(wiz.preparedSpells.length <= cap, 'prepared count within level+INT mod');
const firstPrep = wiz.preparedSpells[0];
assert(canCastSpell(wiz, firstPrep) === true, 'prepared spell castable');
Run.togglePrepared(wiz, firstPrep, false);
assert(canCastSpell(wiz, firstPrep) === false, 'unprepared spell not castable');
Run.togglePrepared(wiz, firstPrep, true);
assert(canCastSpell(wiz, firstPrep) === true, 're-prepared spell castable');
step(`prepared spells: ${wiz.preparedSpells.length}/${cap} — toggle works`);

// ============ 5. TOWN ============
run.runGold = 5000;
const shop = Run.rollTown(run);
assert(shop && shop.items.length >= 5, 'town shop should stock 5+ items');
assert(run.townOffers.length >= 2, 'town should offer 2-3 mercenaries');
assert(run.townEvents.length === 2, 'town should have 2 events');
assert(run.townName, 'town has a name');
step(`town rolled: ${run.townName} — ${shop.name} with ${shop.items.length} items, ${run.townOffers.length} mercenaries, 2 events`);

// shop bias: roll many towns and verify martially-biased shops skew to gear
const MARTIAL = new Set(['blacksmith', 'armorer']);
let biasCount = 0, biasTotal = 0;
for (let i = 0; i < 80; i++) {
  const r2 = makeRng(1000 + i);
  const run2 = { rng: r2, roster: run.roster, townEvents: [], usedTownEvents: new Set() };
  const shop2 = Run.rollTown(run2);
  if (!MARTIAL.has(shop2.type)) continue;
  biasTotal++;
  const gear = shop2.items.filter(it => ['weapon', 'armor'].includes(it.kind)).length;
  if (gear >= Math.ceil(shop2.items.length * 0.6)) biasCount++;
}
assert(biasTotal >= 3, `expected several martial shops in 80 rolls (got ${biasTotal})`);
assert(biasCount >= Math.floor(biasTotal * 0.5), `martial shops should skew to gear (${biasCount}/${biasTotal})`);
step(`shop bias: ${biasCount}/${biasTotal} blacksmith/armorer shops skew to weapons & armor`);

// hire
const recruit = run.townOffers[0];
const beforeCount = run.roster.length;
const hireRes = Run.hireRecruit(run, recruit.id);
assert(hireRes.ok && run.roster.length === beforeCount + 1, 'hiring should add to the roster');
step('hired a mercenary — roster grew');

// lineup cap: only 4 fight
for (const c of run.roster) if (!c.hero && !run.active.includes(c.id) && run.active.length < 4) run.active.push(c.id);
assert(Run.activeFighters(run).length <= 4, 'active fighters capped at 4');
const extra = run.roster.find(c => !c.hero && !run.active.includes(c.id));
if (extra) {
  const res = Run.toggleActive(run, extra.id, true);
  assert(!res.ok || run.active.length <= 4, 'cannot exceed 4 in the lineup');
}
step('lineup capped at 4 active fighters');

// ============ 6. TOWN EVENTS ============
const ev = run.townEvents[0];
const result = Run.rollTownEvent(run, ev.id);
assert(result && result.success === (result.total >= ev.dc), 'event resolution consistent');
assert(result.best, 'best party member should roll the check');
const buff = run.roster.find(c => !c.dead).townBuffs.find(b => b.id === ev.id);
assert(buff, 'blessing/penalty applied');
assert(Math.abs(buff.value) === 1, 'buff value ±1');
assert(run.usedTownEvents.has(ev.id), 'event marked used');
step(`town event: ${ev.skill} DC ${ev.dc} → roll ${result.total} (${result.success ? 'success' : 'failure'}), party ${result.success ? 'blessed' : 'penalized'}`);

// town buffs actually modify rolls
const atkBefore = (() => { const c = run.roster.find(x => !x.dead); return c; })();
const { attackBonusFor } = await import('../src/5e/rules.js');
const w = atkBefore.weapon.base;
const baseAtk = attackBonusFor(atkBefore, w, null);
atkBefore.townBuffs.push({ id: 'x', kind: 'attack', name: 'test', value: 1 });
assert(attackBonusFor(atkBefore, w, null) === baseAtk + 1, 'attack blessing should add +1');
atkBefore.townBuffs.pop();
step('town blessing modifies attack rolls (+1)');

// long rest clears blessings
Run.doLongRest(run);
assert(run.roster.every(c => (c.townBuffs || []).length === 0), 'long rest clears town buffs');
step('long rest clears blessings & penalties');

// ============ 7. TOWN UI ============
ui.setG({ meta, hero: heroChar, run, combat: null });
ui.townScreen();
const townText = document.querySelector('#ui').textContent;
assert(townText.includes(run.townName), 'town screen shows the town name');
assert(document.querySelectorAll('.walk-npc').length >= 3, 'town walk scene should have NPCs (shop, mercenaries, townsfolk)');
assert(townText.includes('gold carried'), 'town banner shows carried gold');
assert([...document.querySelectorAll('.walk-npc-name')].some(n => n.textContent.includes('Shopkeeper')), 'shopkeeper NPC present');
step('town walk scene renders with shop, mercenaries, townsfolk and gold');

// ============ 8. WILD SHAPE UI FLOW (jsdom) ============
{
  const meta2 = { shards: 0, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
  const rng2 = makeRng(777);
  const druidCls = CLASS_MAP.druid;
  const druidHero = createCharacter({ raceId: RACES[0].id, classId: 'druid', name: 'Shapey', subclassId: 'moon', scoreAssign: Run.autoAssignScores(druidCls, RACES[0], rng2), level: 2, hero: true, rng: rng2 });
  meta2.hero = druidHero;
  const run2 = Run.newRun(meta2, druidHero);
  run2.location = LOCATION_MAP.tavern;
  const combat2 = Combat.generateCombatMap(LOCATION_MAP.tavern, 1, rng2, { revealed: true });
  Combat.spawnEncounter(combat2, Run.activeFighters(run2), 1, rng2, {});
  ui.setG({ meta: meta2, hero: druidHero, run: run2, combat: combat2 });
  ui.combatScreen();
  ui.combatScreenInputs();
  const clickBtn2 = (labelPart) => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(labelPart));
    if (!b) throw new Error('no button ' + labelPart);
    b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  };
  const radialBtn2 = (labelPart) => [...document.querySelectorAll('.radial .radial-btn')].find(b => b.textContent.includes(labelPart));
  // reach the hero's turn (skip others)
  let heroTurn2 = false;
  for (let i = 0; i < 160 && !heroTurn2 && !combat2.over; i++) {
    await new Promise(r => setTimeout(r, 300));
    const cur = combat2.units.find(x => x.id === combat2.order[combat2.turnIndex]);
    if (!cur) continue;
    if (cur.team === 'player' && !cur.dead) {
      if (cur.char.hero) { heroTurn2 = true; break; }
      clickBtn2('End Turn');
    }
  }
  if (!heroTurn2) fail('never reached the druid hero turn');
  const druidUnit = combat2.units.find(x => x.char.hero);
  // Bonus Actions → Wild Shape → modal → Bear
  radialBtn2('Bonus Actions').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const wsBtn = radialBtn2('Wild Shape');
  if (!wsBtn) fail('Wild Shape missing from the bonus radial (moon druid)');
  wsBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  if (!document.querySelector('.overlay') || !document.querySelector('.overlay').textContent.includes('Brown Bear')) fail('wild shape modal missing bear card');
  const bearCard = [...document.querySelectorAll('.overlay .card')].find(c => c.textContent.includes('Brown Bear'));
  bearCard.querySelector('button').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert(druidUnit.wildShaped && druidUnit.form && druidUnit.form.id === 'bear', 'UI flow should wild shape into the bear');
  // Revert via radial root → Actions → Abilities (or Bonus) contains Revert
  const anyRadial = [...document.querySelectorAll('.radial .radial-btn')].find(b => b.textContent.includes('Revert'));
  if (!anyRadial) fail('Revert Form missing from the radial while shaped');
  anyRadial.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert(!druidUnit.wildShaped, 'revert via radial should end the form');
  step('UI flow: radial → Wild Shape modal → Bear form → Revert Form');
}

console.log('errors captured:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
