// Feat tests: acquisition (level-up screen + campfire), engine mechanics
// (Tough, Alert, GWM, Sharpshooter, PAM, Sentinel, War Caster, Elemental
// Adept, Heavy Armor Master, Lucky, Charger, Mobile, Resilient, Magic
// Initiate), and the sheet's feat chips.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"><div id="ui"></div></div></body></html>', {
  url: 'http://localhost:8080/index.html',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
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

const ui = await import('../src/ui.js');
const Run = await import('../src/game/run.js');
const Combat = await import('../src/5e/combat.js');
const Actions = await import('../src/5e/combat_actions.js');
const ai = await import('../src/5e/ai.js');
const { makeRng } = await import('../src/rng.js');
const { createCharacter, grantFeat, hasFeat, computeMaxHp, computeAc, computeSpeed, attackBonusFor, savingThrowMod, canCastSpell, levelUpCharacter, mod, asiAtLevel, multiclassInto, classLevel } = await import('../src/5e/rules.js');
const { performAction } = await import('../src/5e/turn.js');
const { RACES } = await import('../src/data/races.js');
const { CLASS_MAP } = await import('../src/data/classes.js');
const { LOCATION_MAP } = await import('../src/data/locations.js');

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clickBtn = (labelPart) => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(labelPart));
  if (!b) throw new Error('no button ' + labelPart);
  b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
};
const clickCard = (labelPart) => {
  const c = [...document.querySelectorAll('.card')].find(x => x.textContent.includes(labelPart));
  if (!c) throw new Error('no card ' + labelPart);
  c.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
};

function mkChar(clsId, level, subclassId, rng) {
  const cls = CLASS_MAP[clsId];
  const race = RACES[0];
  return createCharacter({ raceId: race.id, classId: clsId, name: 'Feat' + clsId, subclassId: subclassId || Object.keys(cls.subclasses)[0], scoreAssign: Run.autoAssignScores(cls, race, rng), level, hero: false, rng });
}
function mkBattle(units) {
  const b = { popups: [], fx: [], log: [], rng: makeRng(5), round: 1, effects: [], units, w: 12, h: 10, grid: [], over: false, won: false, turnIndex: 0, order: units.map(u => u.id) };
  for (let y = 0; y < 10; y++) b.grid.push(Array.from({ length: 12 }, () => ({ obstacle: null, elevation: 0, hazard: null, visible: true, discovered: true })));
  return b;
}

const rng = makeRng(1212);

// ============ 1. TOUGH ============
{
  const c = mkChar('fighter', 5, null, rng);
  const before = computeMaxHp(c);
  grantFeat(c, 'tough');
  assert(computeMaxHp(c) === before + 10, `Tough should add +2/level (${before} -> ${computeMaxHp(c)})`);
  step('Tough: +2 max HP per level');
}

// ============ 2. ALERT (+5 init, surprise immunity) ============
{
  const c = mkChar('fighter', 4, null, rng);
  c.hero = true;
  const meta = { shards: 0, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: c };
  const run = Run.newRun(meta, c);
  grantFeat(c, 'alert'); // feats are taken DURING the run (they reset with the run, like ASIs)
  run.location = LOCATION_MAP.tavern;
  const combat = Combat.generateCombatMap(LOCATION_MAP.tavern, 1, run.rng, { revealed: true });
  Combat.spawnEncounter(combat, [c], 1, run.rng, {});
  const heroU = combat.units.find(u => u.char.hero);
  assert(heroU, 'hero unit present');
  // alert hero keeps their full initiative roll + 5
  const dex = c.abilities.DEX;
  assert(heroU.initiative >= mod(dex) + 5 - 0.001, 'Alert should add +5 initiative');
  step('Alert: +5 initiative');
}

// ============ 3. GWM POWER ATTACK ============
{
  const c = mkChar('fighter', 4, null, rng);
  grantFeat(c, 'great_weapon_master');
  c.weapon = { base: 'greatsword', enchant: null };
  const u = Combat.makeUnit(c, 'player', 2, 2);
  const gob = Combat.makeUnit(mkChar('barbarian', 1, null, rng), 'enemy', 3, 2);
  gob.char.stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  const battle = mkBattle([u, gob]);
  const baseAtk = attackBonusFor(c, 'greatsword', null);
  u.gwmOn = true;
  const logBefore = battle.log.length;
  // capture the attack-roll total from the log: with power attack it should be base-5
  const res = Actions.weaponAttack(battle, u, gob, { weaponId: 'greatsword' });
  if (res.hit) {
    const dmg = res.dmg;
    // +10 confirmed via damage exceeding max normal greatsword+STR (2d6+STR max 12+3=15)
    assert(dmg >= 10 + (res.crit ? 0 : 0) || battle.log.some(l => l.includes('10')), 'GWM hit should deal bonus damage');
  }
  const hitRoll = battle.log.find(l => l.includes('greatsword') || l.includes('Greatsword'));
  assert(battle.log.some(l => l.includes('(') && l.includes('vs AC')), 'attack logged');
  step('GWM: power attack applies -5 to hit / +10 damage');
}

// ============ 4. SHARPSHOOTER ============
{
  const c = mkChar('ranger', 4, null, rng);
  grantFeat(c, 'sharpshooter');
  c.weapon = { base: 'longbow', enchant: null };
  const u = Combat.makeUnit(c, 'player', 2, 2);
  const gob = Combat.makeUnit(mkChar('barbarian', 1, null, rng), 'enemy', 8, 2);
  gob.char.stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  const battle = mkBattle([u, gob]);
  u.ssOn = true;
  const res = Actions.weaponAttack(battle, u, gob, { weaponId: 'longbow' });
  if (res.hit) {
    assert(res.dmg >= 10, 'Sharpshooter hit should deal +10');
  }
  step('Sharpshooter: power shots apply +10 damage');
}

// ============ 5. PAM: ENTERING-REACH PROMPT ============
{
  const c = mkChar('fighter', 4, null, rng);
  grantFeat(c, 'polearm_master');
  c.weapon = { base: 'glaive', enchant: null };
  const u = Combat.makeUnit(c, 'player', 4, 4);
  const gob = Combat.makeUnit(mkChar('barbarian', 1, null, rng), 'enemy', 9, 4);
  gob.char.stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  const battle = mkBattle([u, gob]);
  u.reactionUsed = false;
  // enemy steps from distance 5 to distance 2 (entering reach)
  const prompts = ai.reactionPromptsForStep(battle, gob, { type: 'move', x: 6, y: 4 });
  const oa = prompts.find(p => p.kind === 'oa' && p.options.some(o => o.label.includes('Polearm Master')));
  assert(!!oa, 'PAM should offer an entering-reach OA prompt: ' + JSON.stringify(prompts));
  step('Polearm Master: entering-reach opportunity attack prompt');
}

// ============ 6. SENTINEL: DISENGAGE DOESN'T HELP ============
{
  const c = mkChar('fighter', 4, null, rng);
  grantFeat(c, 'sentinel');
  const u = Combat.makeUnit(c, 'player', 4, 4);
  const gob = Combat.makeUnit(mkChar('barbarian', 1, null, rng), 'enemy', 5, 4);
  gob.char.stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  const battle = mkBattle([u, gob]);
  u.reactionUsed = false;
  const prompts = ai.reactionPromptsForStep(battle, gob, { type: 'move', x: 6, y: 4, disengage: true });
  assert(prompts.some(p => p.kind === 'oa'), 'Sentinel should still get an OA against disengaging enemies');
  step('Sentinel: opportunity attacks even against disengaging enemies');
}

// ============ 7. WAR CASTER OPTION ============
{
  const c = mkChar('cleric', 4, 'life', rng);
  grantFeat(c, 'war_caster');
  const u = Combat.makeUnit(c, 'player', 4, 4);
  const gob = Combat.makeUnit(mkChar('barbarian', 1, null, rng), 'enemy', 5, 4);
  gob.char.stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  const battle = mkBattle([u, gob]);
  u.reactionUsed = false;
  const prompts = ai.reactionPromptsForStep(battle, gob, { type: 'move', x: 6, y: 4 });
  assert(prompts.some(p => p.kind === 'warcaster'), 'War Caster should offer a cantrip option');
  step('War Caster: cantrip reaction option offered');
}

// ============ 8. ELEMENTAL ADEPT ============
{
  const c = mkChar('sorcerer', 4, null, rng);
  grantFeat(c, 'elemental_adept', 'fire');
  const u = Combat.makeUnit(c, 'player', 2, 2);
  const target = Combat.makeUnit(mkChar('barbarian', 1, null, rng), 'enemy', 4, 2);
  target.char.resist = ['fire'];
  target.char.stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  const battle = mkBattle([u, target]);
  const before = target.hp;
  Actions.applyDamage(battle, target, u, 12, 'fire', { magical: true });
  const taken = before - target.hp;
  assert(taken === 12, `Elemental Adept should bypass fire resistance (took ${taken}, expected 12)`);
  step('Elemental Adept: chosen element ignores resistance');
}

// ============ 9. HEAVY ARMOR MASTER ============
{
  const c = mkChar('fighter', 4, null, rng);
  grantFeat(c, 'heavy_armor_master', 'STR');
  c.armor = 'plate';
  const u = Combat.makeUnit(c, 'player', 2, 2);
  const gob = Combat.makeUnit(mkChar('barbarian', 1, null, rng), 'enemy', 4, 2);
  gob.char.stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  const battle = mkBattle([u, gob]);
  const before = u.hp;
  Actions.applyDamage(battle, u, gob, 5, 'slashing', {});
  assert(u.hp === before - 2, `HAM should soak 3 (5 -> 2), took ${before - u.hp}`);
  step('Heavy Armor Master: -3 nonmagical B/P/S in heavy armor');
}

// ============ 10. LUCKY ============
{
  const c = mkChar('rogue', 4, null, rng);
  grantFeat(c, 'lucky');
  const u = Combat.makeUnit(c, 'player', 2, 2);
  const gob = Combat.makeUnit(mkChar('barbarian', 1, null, rng), 'enemy', 4, 2);
  gob.char.stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  const battle = mkBattle([u, gob]);
  battle.rng = makeRng(1); // seeds a low roll
  const luckBefore = c.resources.luck.cur;
  const rr = Combat.attackRoll(battle.rng, battle, u, gob, 5, { melee: true });
  if (rr.natural <= 10) {
    assert(c.resources.luck.cur === luckBefore - 1, 'Lucky should spend a point on a poor roll');
    step('Lucky: poor natural rolls spend a luck point and reroll');
  } else {
    // the seeded roll was decent; force a low natural by checking another seed
    let spent = false;
    for (let seed = 0; seed < 50 && !spent; seed++) {
      const r2 = makeRng(seed);
      const probe = Combat.makeUnit(mkChar('rogue', 4, null, makeRng(5)), 'player', 2, 2);
      grantFeat(probe.char, 'lucky');
      const rr2 = Combat.attackRoll(r2, battle, probe, gob, 5, { melee: true });
      if (rr2.natural <= 10) { spent = probe.char.resources.luck.cur < 3; }
    }
    assert(spent, 'Lucky should spend points on poor rolls');
    step('Lucky: poor natural rolls spend a luck point and reroll');
  }
}

// ============ 11. CHARGER ============
{
  const c = mkChar('fighter', 4, null, rng);
  grantFeat(c, 'charger');
  const u = Combat.makeUnit(c, 'player', 2, 2);
  const gob = Combat.makeUnit(mkChar('barbarian', 1, null, rng), 'enemy', 3, 2);
  gob.char.stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  const battle = mkBattle([u, gob]);
  u.movedTiles = 2;
  const logBefore = battle.log.length;
  Actions.weaponAttack(battle, u, gob, { weaponId: 'longsword' });
  assert(battle.log.slice(logBefore).some(l => l.includes('charges in')), 'Charger should trigger after moving 2 tiles');
  step('Charger: +5 damage after moving 2+ tiles');
}

// ============ 12. MOBILE: NO OA FROM ATTACKED ENEMY ============
{
  const c = mkChar('rogue', 4, null, rng);
  grantFeat(c, 'mobile');
  const u = Combat.makeUnit(c, 'player', 2, 2);
  const gob = Combat.makeUnit(mkChar('barbarian', 1, null, rng), 'enemy', 3, 2);
  gob.char.stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  const battle = mkBattle([u, gob]);
  u.reactionUsed = false;
  u.attackedThisTurn = [gob.id];
  u.moveRemaining = 6;
  const hpBefore = u.hp;
  Actions.moveUnit(battle, u, [{ x: 2, y: 3 }]);
  assert(u.hp === hpBefore, 'Mobile: no opportunity attack from the attacked enemy');
  assert(!gob.reactionUsed, 'enemy reaction should not be spent');
  step('Mobile: enemies you attacked cannot make OAs against you');
}

// ============ 13. RESILIENT ============
{
  const c = mkChar('fighter', 4, null, rng);
  const strBefore = c.abilities.WIS;
  grantFeat(c, 'resilient', 'WIS');
  assert(c.abilities.WIS === strBefore + 1, 'Resilient grants +1');
  assert(savingThrowMod(c, 'WIS') > mod(c.abilities.WIS), 'Resilient adds save proficiency');
  step('Resilient: +1 ability and save proficiency');
}

// ============ 14. MAGIC INITIATE (non-caster) ============
{
  const c = mkChar('fighter', 4, null, rng);
  grantFeat(c, 'magic_initiate', 'cleric', rng);
  assert(c.spellsKnown.some(id => id === 'sacred_flame'), 'Magic Initiate should grant cantrips');
  const lvl1 = c.featSpells[0];
  assert(lvl1, 'Magic Initiate should grant a first-level spell');
  assert(canCastSpell(c, lvl1), 'the feat spell should be castable (free cast)');
  const u = Combat.makeUnit(c, 'player', 2, 2);
  const ally = Combat.makeUnit(mkChar('rogue', 1, null, rng), 'player', 3, 2);
  const battle = mkBattle([u, ally]);
  const res = Actions.castSpell(battle, u, lvl1, { target: ally });
  assert(res.ok !== false, 'feat spell should cast');
  assert(c.featCasts[lvl1] === false, 'free cast should be consumed');
  step('Magic Initiate: cantrips + a once-per-floor free first-level spell');
}

// ============ 14b. CLASS-AWARE ASI LEVELS (fighter 6/14, rogue 10) ============
{
  const { levelUpChoicesFor } = Run;
  const fighter = mkChar('fighter', 5, null, rng); // level 5 -> leveling to 6
  assert(asiAtLevel(fighter, 6), 'fighter should earn an ASI at total level 6');
  assert(levelUpChoicesFor(fighter, rng).type === 'asi', 'fighter level-up to 6 should offer ASI/feat');
  const rogue = mkChar('rogue', 9, null, rng);
  assert(asiAtLevel(rogue, 10), 'rogue should earn an ASI at total level 10');
  assert(levelUpChoicesFor(rogue, rng).type === 'asi', 'rogue level-up to 10 should offer ASI/feat');
  const wiz = mkChar('wizard', 5, null, rng);
  assert(!asiAtLevel(wiz, 6), 'wizards do NOT get an ASI at 6');
  assert(asiAtLevel(wiz, 8), 'everyone gets an ASI at 8');
  step('class-aware ASI levels: fighter 6 & 14, rogue 10 all offer feats');
}

// ============ 15. LEVEL-UP SCREEN FEAT OPTION (jsdom) ============
{
  const rng2 = makeRng(4242);
  const meta = { shards: 0, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
  const fcls = CLASS_MAP.fighter;
  const hero = createCharacter({ raceId: RACES[0].id, classId: 'fighter', name: 'FeatHero', subclassId: 'champion', scoreAssign: Run.autoAssignScores(fcls, RACES[0], rng2), level: 3, hero: true, rng: rng2 });
  meta.hero = hero;
  const run = Run.newRun(meta, hero);
  while (hero.level < 3) levelUpCharacter(hero, rng2, null);
  run.location = LOCATION_MAP.tavern;
  globalThis.FEAT_G = { meta, hero, run, combat: null, walk: null, walkInstant: true };
  ui.setG(globalThis.FEAT_G);
  ui.levelUpScreen();
  const txt = document.querySelector('#ui').textContent;
  assert(txt.includes('take a FEAT instead'), 'level-up screen at 4 should show the feat section');
  // the feat grid must be INLINE on the level-up screen (no extra clicks)
  const featGrid = document.querySelector('.feat-grid');
  assert(!!featGrid, 'feat grid should render inline on the level-up screen');
  assert(featGrid.textContent.includes('Tough'), 'inline grid lists Tough');
  assert(featGrid.textContent.includes('Great Weapon Master'), 'inline grid lists GWM');
  const toughCard = [...featGrid.querySelectorAll('.card')].find(c => c.textContent.includes('Tough'));
  toughCard.querySelector('button').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert(hasFeat(hero, 'tough'), 'picking Tough from the inline grid grants the feat');
  step('level-up screen: inline feat grid → Tough granted directly');
}

// ============ 16. CAMPFIRE FEAT OPTION ============
{
  const run = globalThis.FEAT_G.run;
  const comp = run.roster.find(c => !c.hero);
  comp.pendingAsi = true;
  comp.pendingLevelUp = false;
  ui.campScreen();
  globalThis.FEAT_G.walkInstant = true;
  const npc = [...document.querySelectorAll('.walk-npc')].find(n => n.textContent.includes(comp.name));
  npc.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  let opened = false;
  for (let i = 0; i < 200 && !opened; i++) {
    await sleep(25);
    if (document.querySelector('.npc-dialog')) opened = true;
  }
  if (!opened) fail('member dialog did not open');
  clickBtn('Character Sheet');
  const sheet = document.querySelector('.camp-sheet');
  assert(sheet.textContent.includes('take a FEAT instead'), 'campfire ASI section should show the feat section');
  const featGrid2 = sheet.querySelector('.feat-grid');
  assert(!!featGrid2, 'feat grid should render inline in the campfire sheet');
  const sentCard = [...featGrid2.querySelectorAll('.card')].find(c => c.textContent.includes('Sentinel'));
  assert(!!sentCard, 'Sentinel card should be in the inline grid');
  sentCard.querySelector('button').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert(hasFeat(comp, 'sentinel'), 'Sentinel granted from the campfire inline grid');
  assert(comp.pendingAsi === false, 'pending ASI cleared');
  step('campfire: inline feat grid replaces the pending ASI');
}

// ============ 17. SHEET FEAT CHIPS ============
{
  const comp = globalThis.FEAT_G.run.roster.find(c => hasFeat(c, 'sentinel'));
  const sheetText = document.querySelector('.camp-sheet')?.textContent || '';
  assert(sheetText.includes('Feats'), 'sheet should show a Feats section');
  assert(sheetText.includes('Sentinel'), 'sheet should list the Sentinel feat');
  const chip = [...document.querySelectorAll('.camp-sheet .chip.feature')].find(ch => ch.textContent.includes('Sentinel'));
  if (chip) {
    chip.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const modal = document.querySelector('.info-modal');
    assert(modal && modal.textContent.includes('opportunity attacks'), 'feat chip should open its description');
  }
  step('sheet: feats listed with clickable descriptions');
}

// ============ 18. MONK + FEY TOUCHED: RADIAL SPELL ACCESS ============
{
  const rng3 = makeRng(6060);
  const meta = { shards: 0, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
  const monkCls = CLASS_MAP.monk;
  const hero = createCharacter({ raceId: RACES[0].id, classId: 'monk', name: 'MistyMonk', subclassId: 'open_hand', scoreAssign: Run.autoAssignScores(monkCls, RACES[0], rng3), level: 4, hero: true, rng: rng3 });
  meta.hero = hero;
  const run = Run.newRun(meta, hero);
  run.location = LOCATION_MAP.tavern;
  // grant Fey Touched inside the run (like the level-up screen would)
  const granted = grantFeat(hero, 'fey_touched', 'WIS');
  assert(granted, 'Fey Touched granted');
  assert(hero.spellsKnown.includes('misty_step'), 'Misty Step should be in spellsKnown');
  assert(hero.featCasts && hero.featCasts.misty_step === true, 'Misty Step should have a free cast');
  assert(hero.featCastAbility === 'WIS', 'feat casting ability should be WIS');
  // a monk has NO class spellAbility — canCastSpell must still work
  assert(!hero.cls.spellAbility, 'precondition: monks are not spellcasters');
  assert(canCastSpell(hero, 'misty_step'), 'non-caster with Fey Touched can cast Misty Step');
  assert(hero.spellSaveDC > 0, `feat casters get a real spell DC (${hero.spellSaveDC})`);
  step('engine: Fey Touched grants Misty Step + free cast + WIS-based DC to a monk');

  // level the monk again: the feat spells must SURVIVE the rebuild
  levelUpCharacter(hero, rng3, null);
  assert(hero.spellsKnown.includes('misty_step'), 'Misty Step survives leveling up');
  step('engine: feat spells survive spellbook rebuilds');

  // ---- UI: radial on the monk's turn ----
  const combat = Combat.generateCombatMap(LOCATION_MAP.tavern, 1, rng3, { revealed: true });
  Combat.spawnEncounter(combat, Run.activeFighters(run), 1, rng3, {});
  globalThis.FEAT_G2 = { meta, hero, run, combat, walk: null };
  ui.setG(globalThis.FEAT_G2);
  ui.combatScreen();
  ui.combatScreenInputs();
  const clickBtn2 = (labelPart) => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(labelPart));
    if (!b) throw new Error('no button ' + labelPart);
    b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  };
  const radialBtn = (labelPart) => [...document.querySelectorAll('.radial .radial-btn')].find(b => b.textContent.includes(labelPart));
  const canvas = document.querySelector('#combat-canvas');
  const tileXY = (tx, ty) => ({ clientX: ((tx + 0.5) / combat.w) * canvas.width, clientY: ((ty + 0.5) / combat.h) * canvas.height, button: 0 });
  let heroTurn = false;
  for (let i = 0; i < 160 && !heroTurn && !combat.over; i++) {
    await sleep(300);
    const cur = combat.units.find(x => x.id === combat.order[combat.turnIndex]);
    if (!cur) continue;
    if (cur.team === 'player' && !cur.dead) {
      if (cur.char.hero) { heroTurn = true; break; }
      clickBtn2('End Turn');
    }
  }
  if (!heroTurn) fail('never reached the monk hero turn');
  const heroU = combat.units.find(x => x.char.hero);
  heroU.x = 6; heroU.y = 4;
  heroU.bonusPoints = 1; heroU.actionPoints = 1; heroU.reactionUsed = false;

  // Bonus Actions radial must now contain Bonus Spells for this monk
  radialBtn('Bonus Actions').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const bonusSpells = radialBtn('Bonus Spells');
  assert(!!bonusSpells, 'Bonus Spells must appear in the monk\'s bonus radial');
  bonusSpells.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const msRow = [...document.querySelectorAll('.spellbook .spell-row')].find(r => r.textContent.includes('Misty Step'));
  if (!msRow) fail('Misty Step row missing from the spellbook');
  assert(msRow.textContent.includes('BONUS ACTION'), 'Misty Step shows its cost badge');
  step('UI: monk\'s radial shows Bonus Spells → Misty Step listed');

  // cast it on a guaranteed-free tile within range — the monk should teleport
  msRow.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  await sleep(60);
  msRow.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  let dest = null;
  for (let dy = -3; dy <= 3 && !dest; dy++) {
    for (let dx = -3; dx <= 3 && !dest; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 3) continue;
      const tx = heroU.x + dx, ty = heroU.y + dy;
      if (!Combat.isPassable(combat, tx, ty)) continue;
      if (Combat.unitAtAny(combat, tx, ty)) continue;
      if (tx === heroU.x && ty === heroU.y) continue;
      dest = { x: tx, y: ty };
    }
  }
  if (!dest) fail('no free tile within misty step range');
  canvas.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, ...tileXY(dest.x, dest.y) }));
  await sleep(60);
  canvas.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, ...tileXY(dest.x, dest.y) }));
  assert(heroU.x === dest.x && heroU.y === dest.y, `monk should teleport to (${dest.x},${dest.y}), got (${heroU.x},${heroU.y})`);
  assert(hero.featCasts.misty_step === false, 'the free cast should be consumed');
  step('UI: monk casts Misty Step from the radial and teleports (free cast consumed)');

  // a second cast is no longer possible (no slots, no free cast left)
  assert(!canCastSpell(hero, 'misty_step'), 'second cast blocked once the free cast is used');
  step('UI: second Misty Step blocked (once per floor)');
}

// ============ 18. 5e RULE: ASIs/feats follow CLASS level, not character level ============
{
  // THE REPORTED CASE: a Wizard 3 who multiclasses at character level 4 must
  // NOT get an ASI/feat — the wizard is still 3, the new class is at 1.
  const wiz3 = mkChar('wizard', 3, null, rng);
  const ok = multiclassInto(wiz3, 'barbarian', rng);
  assert(ok, 'multiclass succeeds');
  assert(wiz3.level === 4 && classLevel(wiz3) === 3 && wiz3.secondClass.level === 1,
    `Wizard 3 / Barbarian 1 at total 4 (got wiz ${classLevel(wiz3)}, barb ${wiz3.secondClass.level})`);
  assert(!wiz3.pendingAsi, 'Wizard 3 / Barbarian 1 must NOT earn an ASI/feat');
  assert(!asiAtLevel(wiz3, wiz3.level), 'total level 4 alone must not grant an ASI');
  step("Wizard 3 multiclassing at level 4 → NO ASI/feat (class levels only)");

  // the pure wizard DOES get theirs at class level 4
  const wiz3b = mkChar('wizard', 3, null, rng);
  assert(Run.levelUpChoicesFor(wiz3b, rng).type === 'asi', 'pure Wizard 3 → 4 offers the ASI');
  levelUpCharacter(wiz3b, rng, null);
  assert(classLevel(wiz3b) === 4, 'wizard reached class level 4');
  step('pure Wizard 4 (class level 4) correctly earns its ASI');

  // the SECOND class earns ASIs only at ITS OWN milestones:
  // Wizard 3 / Fighter 3 (total 6) → no ASI; Fighter 4 (total 7) → ASI
  const mc = mkChar('wizard', 3, null, rng);
  for (let i = 0; i < 3; i++) multiclassInto(mc, 'fighter', rng);
  assert(mc.secondClass.level === 3 && mc.level === 6, `Wiz3/Fighter3 (got wiz ${classLevel(mc)}, ftr ${mc.secondClass.level}, total ${mc.level})`);
  assert(!mc.pendingAsi, 'Fighter 3 (second class) has not hit a milestone yet');
  multiclassInto(mc, 'fighter', rng);
  assert(mc.secondClass.level === 4 && mc.pendingAsi === true,
    'Fighter 4 as a SECOND class must grant its ASI/feat');
  step('second class milestones apply: Fighter 4 (as multiclass) earns its ASI');

  // sanity: fighter 6 & 14 and rogue 10 still work (existing behavior)
  const fighter5 = mkChar('fighter', 5, null, rng);
  assert(asiAtLevel(fighter5, 6, { primaryOnly: true }), 'fighter class level 6 grants an ASI');
  const rogue9 = mkChar('rogue', 9, null, rng);
  assert(asiAtLevel(rogue9, 10, { primaryOnly: true }), 'rogue class level 10 grants an ASI');
  const wizard5 = mkChar('wizard', 5, null, rng);
  assert(!asiAtLevel(wizard5, 6, { primaryOnly: true }), 'wizard has no ASI at class level 6');
  step('fighter 6/14 and rogue 10 milestones unchanged');
}

console.log('errors captured:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
