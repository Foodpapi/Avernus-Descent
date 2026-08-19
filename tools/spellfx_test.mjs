// Tests for: Misty Step actually teleporting, self-mode utility spells no longer
// fizzling, upcasting (engine + UI selector), and the spell FX animation queue.
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
const { makeRng } = await import('../src/rng.js');
const { createCharacter, canCastSpell } = await import('../src/5e/rules.js');
const { performAction } = await import('../src/5e/turn.js');
const { RACES } = await import('../src/data/races.js');
const { CLASS_MAP } = await import('../src/data/classes.js');
const { LOCATION_MAP } = await import('../src/data/locations.js');

const step = (m) => console.log('✔', m);
const fail = (m) => { console.log('✘ FAIL:', m); process.exit(1); };
const assert = (cond, m) => { if (!cond) fail(m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function mkChar(clsId, level, subclassId, rng) {
  const cls = CLASS_MAP[clsId];
  const race = RACES[0];
  return createCharacter({ raceId: race.id, classId: clsId, name: 'FxTest' + clsId, subclassId: subclassId || Object.keys(cls.subclasses)[0], scoreAssign: Run.autoAssignScores(cls, race, rng), level, hero: false, rng });
}

function mkBattle(units) {
  const b = { popups: [], fx: [], log: [], rng: makeRng(5), round: 1, effects: [], units, w: 12, h: 10, grid: [], over: false, won: false };
  for (let y = 0; y < 10; y++) b.grid.push(Array.from({ length: 12 }, () => ({ obstacle: null, elevation: 0, hazard: null, visible: true, discovered: true })));
  return b;
}

const rng = makeRng(5150);

// ============ 1. MISTY STEP TELEPORTS ============
{
  const sorc = Combat.makeUnit(mkChar('sorcerer', 3, null, rng), 'player', 2, 3);
  const enemy = Combat.makeUnit(mkChar('barbarian', 1, null, rng), 'enemy', 9, 3);
  const battle = mkBattle([sorc, enemy]);
  sorc.bonusPoints = 1; sorc.actionPoints = 1;
  const start = { x: sorc.x, y: sorc.y };
  const slotsBefore = sorc.char.spellSlotsUsed[1];
  const dest = { x: sorc.x + 2, y: sorc.y };
  performAction(battle, sorc.id, { type: 'cast', spellId: 'misty_step', aim: dest });
  assert(sorc.x === dest.x && sorc.y === dest.y, `Misty Step must move the caster (${start.x},${start.y}) -> (${dest.x},${dest.y}), got (${sorc.x},${sorc.y})`);
  assert(sorc.char.spellSlotsUsed[1] === slotsBefore + 1, 'Misty Step should consume a 2nd-level slot');
  assert(sorc.bonusPoints === 0, 'Misty Step should consume the bonus action');
  step('Misty Step teleports the caster and spends bonus action + slot');
}

// ============ 2. SELF-MODE UTILITY SPELLS NO LONGER FIZZLE ============
{
  const cleric = Combat.makeUnit(mkChar('cleric', 1, 'life', rng), 'player', 2, 3);
  const ally = Combat.makeUnit(mkChar('fighter', 1, null, rng), 'player', 3, 3);
  const battle = mkBattle([cleric, ally]);
  // Bless is mode:self and previously fizzled on the null-target guard
  performAction(battle, cleric.id, { type: 'cast', spellId: 'bless', aim: { x: cleric.x, y: cleric.y } });
  const blessed = battle.units.filter(u => u.char.buffs && u.char.buffs.some(b => b.id === 'bless'));
  assert(blessed.length >= 1, `Bless should apply its buff (${blessed.length} blessed)`);
  assert(cleric.concentration && cleric.concentration.spellId === 'bless', 'Bless should start concentration');
  step('self-mode utility spells (Bless) resolve without a clicked target');
}

// ============ 3. UPCASTING (engine) ============
{
  const wiz = Combat.makeUnit(mkChar('wizard', 7, null, rng), 'player', 2, 3);
  const gob = Combat.makeUnit(mkChar('barbarian', 1, null, rng), 'enemy', 6, 3);
  const battle = mkBattle([wiz, gob]);
  const c = wiz.char;
  if (c.preparedSpells && !c.preparedSpells.includes('fireball')) c.preparedSpells.push('fireball');
  assert(canCastSpell(c, 'fireball'), 'level 7 wizard can cast fireball (prepared)');
  // exhaust ALL 3rd-level slots: casting must still work via a 4th-level slot (upcast)
  c.spellSlotsUsed[2] = c.spellSlots[2];
  assert(canCastSpell(c, 'fireball'), 'upcast-only casting should be allowed when base slots are empty');
  performAction(battle, wiz.id, { type: 'cast', spellId: 'fireball', targetId: gob.id, aim: { x: gob.x, y: gob.y }, level: 4 });
  assert(c.spellSlotsUsed[3] === 1, 'a 4th-level slot should be spent (got ' + JSON.stringify(c.spellSlotsUsed) + ')');
  assert(c.spellSlotsUsed[2] === c.spellSlots[2], '3rd-level slots must stay exhausted');
  step('upcasting: fireball cast with a 4th-level slot when 3rd-level slots are empty');
}

// ============ 4. SPELL FX QUEUE ============
{
  const sorc = Combat.makeUnit(mkChar('sorcerer', 3, null, rng), 'player', 2, 3);
  const gob = Combat.makeUnit(mkChar('barbarian', 1, null, rng), 'enemy', 6, 3);
  const battle = mkBattle([sorc, gob]);
  sorc.actionPoints = 3; sorc.bonusPoints = 2; // several spells in a row
  const fxOf = (type) => battle.fx.filter(f => f.type === type);
  const cast = (id, opts) => performAction(battle, sorc.id, { type: 'cast', spellId: id, ...opts });

  cast('eldritch_blast', { targetId: gob.id, aim: { x: gob.x, y: gob.y } });
  const beam = fxOf('beam').pop();
  assert(beam && beam.color === '#ff2a4d', 'Eldritch Blast should queue a RED beam');
  assert(beam.x0 === sorc.x && beam.y0 === sorc.y && beam.x1 === gob.x && beam.y1 === gob.y, 'beam should run caster → target');
  step('Eldritch Blast → red beam from caster to target');

  cast('burning_hands', { aim: { x: sorc.x + 1, y: sorc.y }, direction: { dx: 1, dy: 0 } });
  assert(fxOf('cone').length >= 1, 'Burning Hands should queue a cone flash');
  step('cone spells → cone flash');

  cast('misty_step', { aim: { x: sorc.x + 2, y: sorc.y } });
  assert(fxOf('teleport').length >= 1, 'Misty Step should queue a teleport puff');
  step('teleports → twin teleport puffs');

  const wiz = Combat.makeUnit(mkChar('wizard', 5, null, rng), 'player', 8, 3);
  wiz.actionPoints = 2; wiz.bonusPoints = 1;
  if (wiz.char.preparedSpells && !wiz.char.preparedSpells.includes('fireball')) wiz.char.preparedSpells.push('fireball');
  battle.units.push(wiz);
  performAction(battle, wiz.id, { type: 'cast', spellId: 'fireball', targetId: gob.id, aim: { x: gob.x, y: gob.y } });
  assert(fxOf('ring').length >= 1, 'Fireball should queue an expanding ring');
  step('AoE spells → expanding ring');

  const cleric = Combat.makeUnit(mkChar('cleric', 1, 'life', rng), 'player', 9, 3);
  battle.units.push(cleric);
  performAction(battle, cleric.id, { type: 'cast', spellId: 'healing_word', targetId: sorc.id });
  assert(fxOf('glow').length >= 1, 'heals should queue a green glow');
  step('healing → green glow pulse');
}

// ============ 5. UPCAST UI SELECTOR (jsdom) ============
{
  const rng2 = makeRng(9090);
  const meta = { shards: 0, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
  const wizCls = CLASS_MAP.wizard;
  const hero = createCharacter({ raceId: RACES[0].id, classId: 'wizard', name: 'Upcaster', subclassId: 'evocation', scoreAssign: Run.autoAssignScores(wizCls, RACES[0], rng2), level: 7, hero: true, rng: rng2 });
  meta.hero = hero;
  const run = Run.newRun(meta, hero);
  // level the hero to 7 INSIDE the run (newRun resets to level 1 by design)
  const { levelUpCharacter, clearPendingChoices } = await import('../src/5e/rules.js');
  while (hero.level < 7) levelUpCharacter(hero, rng2, null);
  clearPendingChoices(hero);
  if (hero.preparedSpells && !hero.preparedSpells.includes('fireball')) hero.preparedSpells.push('fireball');
  run.location = LOCATION_MAP.tavern;
  const combat = Combat.generateCombatMap(LOCATION_MAP.tavern, 1, rng2, { revealed: true });
  Combat.spawnEncounter(combat, Run.activeFighters(run), 1, rng2, {});
  ui.setG({ meta, hero, run, combat });
  ui.combatScreen();
  ui.combatScreenInputs();

  const clickBtn = (labelPart) => {
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
      clickBtn('End Turn');
    }
  }
  if (!heroTurn) fail('never reached the hero turn');
  const heroU = combat.units.find(x => x.char.hero);
  const enemy = combat.units.find(x => x.team === 'enemy');
  heroU.x = 5; heroU.y = 3; enemy.x = 9; enemy.y = 3;
  heroU.actionPoints = 1; heroU.bonusPoints = 1;

  radialBtn('Actions').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  radialBtn('Spells').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const fbRow = [...document.querySelectorAll('.spellbook .spell-row')].find(r => r.textContent.includes('Fireball'));
  if (!fbRow) fail('wizard should know Fireball');
  const sel = fbRow.querySelector('.upcast-select');
  if (!sel) fail('Fireball row should have an upcast selector');
  const options = [...sel.options].map(o => o.textContent);
  assert(options.some(o => o.includes('3rd')), 'selector should offer 3rd level: ' + options.join(' | '));
  assert(options.some(o => o.includes('4th')), 'selector should offer 4th level (upcast): ' + options.join(' | '));
  assert(options.some(o => o.includes('5d6') || o.includes('9d6')), 'selector should preview dice: ' + options.join(' | '));
  step('upcast selector lists 3rd/4th with dice previews');

  sel.value = '4';
  sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  fbRow.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  await sleep(60);
  fbRow.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  canvas.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, ...tileXY(enemy.x, enemy.y) }));
  await sleep(60);
  canvas.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, ...tileXY(enemy.x, enemy.y) }));
  assert(hero.spellSlotsUsed[3] === 1, `casting Fireball at 4th should spend a 4th-level slot (got ${JSON.stringify(hero.spellSlotsUsed)})`);
  step('selecting 4th level and clicking an enemy upcasts Fireball');
}

// ============ 6. MISTY STEP UI (jsdom): invalid tile rejected ============
{
  const meta = { shards: 0, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
  const rng3 = makeRng(1234);
  const sorcCls = CLASS_MAP.sorcerer;
  const hero = createCharacter({ raceId: RACES[0].id, classId: 'sorcerer', name: 'Misty', subclassId: 'draconic', scoreAssign: Run.autoAssignScores(sorcCls, RACES[0], rng3), level: 3, hero: true, rng: rng3 });
  meta.hero = hero;
  const run = Run.newRun(meta, hero);
  const { levelUpCharacter: lvlUp2, clearPendingChoices: clearPend2 } = await import('../src/5e/rules.js');
  while (hero.level < 3) lvlUp2(hero, rng3, null);
  clearPend2(hero);
  run.location = LOCATION_MAP.tavern;
  const combat2 = Combat.generateCombatMap(LOCATION_MAP.tavern, 1, rng3, { revealed: true });
  Combat.spawnEncounter(combat2, Run.activeFighters(run), 1, rng3, {});
  ui.setG({ meta, hero, run, combat: combat2 });
  ui.combatScreen();
  ui.combatScreenInputs();
  const canvas2 = document.querySelector('#combat-canvas');
  const tileXY2 = (tx, ty) => ({ clientX: ((tx + 0.5) / combat2.w) * canvas2.width, clientY: ((ty + 0.5) / combat2.h) * canvas2.height, button: 0 });
  const clickBtn2 = (labelPart) => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(labelPart));
    if (!b) throw new Error('no button ' + labelPart);
    b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  };
  const radialBtn2 = (labelPart) => [...document.querySelectorAll('.radial .radial-btn')].find(b => b.textContent.includes(labelPart));
  let heroTurn2 = false;
  for (let i = 0; i < 160 && !heroTurn2 && !combat2.over; i++) {
    await sleep(300);
    const cur = combat2.units.find(x => x.id === combat2.order[combat2.turnIndex]);
    if (!cur) continue;
    if (cur.team === 'player' && !cur.dead) {
      if (cur.char.hero) { heroTurn2 = true; break; }
      clickBtn2('End Turn');
    }
  }
  if (!heroTurn2) fail('never reached hero turn in misty-step UI test');
  const heroU2 = combat2.units.find(x => x.char.hero);
  heroU2.x = 5; heroU2.y = 3;
  heroU2.bonusPoints = 1; heroU2.actionPoints = 1;
  radialBtn2('Bonus Actions').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  radialBtn2('Bonus Spells').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const msRow = [...document.querySelectorAll('.spellbook .spell-row')].find(r => r.textContent.includes('Misty Step'));
  if (!msRow) fail('sorcerer should know Misty Step');
  msRow.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  await sleep(60);
  msRow.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  // clicking the hero's own tile (occupied) must be rejected
  canvas2.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, ...tileXY2(5, 3) }));
  await sleep(60);
  canvas2.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, ...tileXY2(5, 3) }));
  const toastText = document.querySelector('#toast')?.textContent || '';
  assert(toastText.includes('Cannot teleport') || toastText.includes('blocked'), 'occupied tile should be rejected: ' + toastText);
  assert(heroU2.bonusPoints === 1, 'rejected teleport must not spend the bonus action');
  // a free tile within range teleports
  const dest = { x: 5, y: 1 };
  canvas2.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, ...tileXY2(dest.x, dest.y) }));
  await sleep(60);
  canvas2.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, ...tileXY2(dest.x, dest.y) }));
  assert(heroU2.x === dest.x && heroU2.y === dest.y, `UI teleport should move the hero to (${dest.x},${dest.y}), got (${heroU2.x},${heroU2.y})`);
  assert(heroU2.bonusPoints === 0, 'successful teleport spends the bonus action');
  step('Misty Step UI: occupied tile rejected, free tile teleports');
}

console.log('errors captured:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
