// Tests for: (1) new-run readiness — hero fully healed with all resources
// after hub gear + pre-run level-ups; (2) clickable character sheet — spells,
// class features, conditions/statuses, ability scores and skills open detail modals.
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

const ui = await import('../src/ui.js');
const Run = await import('../src/game/run.js');
const Combat = await import('../src/5e/combat.js');
const { makeRng } = await import('../src/rng.js');
const { createCharacter, levelUpCharacter, mod } = await import('../src/5e/rules.js');
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
// close a specific stacked overlay by its class
function closeOverlay(cls) {
  const ov = document.querySelector(cls);
  if (!ov) throw new Error('no overlay ' + cls);
  const b = [...ov.querySelectorAll('button')].find(x => x.textContent.includes('Close'));
  b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
}
const clickCard = (labelPart) => {
  const c = [...document.querySelectorAll('.card')].find(x => x.textContent.includes(labelPart));
  if (!c) throw new Error('no card ' + labelPart);
  c.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
};

// ============ 1. NEW-RUN READINESS (engine) ============
{
  const rng = makeRng(12345);
  const meta = { shards: 0, shopItems: { veterans_manual: 1 }, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
  const cls = CLASS_MAP.wizard;
  const hero = createCharacter({ raceId: RACES[0].id, classId: 'wizard', name: 'ReadyWiz', subclassId: 'evocation', scoreAssign: Run.autoAssignScores(cls, RACES[0], rng), level: 1, hero: true, rng });
  meta.hero = hero;
  // simulate the reported bug: mid-run hero state (damaged, resources used, temp HP, high level)
  while (hero.level < 6) levelUpCharacter(hero, rng, null);
  hero.hp = 7;                        // badly damaged
  hero.tempHp = 3;                    // leftover temp hp
  hero.spellSlotsUsed = hero.spellSlots.map((_, i) => i); // every slot used
  if (hero.resources.arcaneRecovery) hero.resources.arcaneRecovery.cur = 0;
  // and a CON-boosting hub trinket (changes maxHp AFTER the level-1 reset)
  hero.hubGear = {
    weapon: hero.weapon, armor: hero.armor, armorEnchant: null, shield: hero.shield,
    trinkets: [{ id: 'amulet_of_health', name: 'Amulet of Health', desc: '', conSet: 19 }],
    gearBag: [],
  };

  const run = Run.newRun(meta, hero);
  assert(hero.level === 3, 'Veteran\'s Manual: run starts at level 3');
  assert(hero.hp === hero.maxHp, `hero must start FULLY HEALED (${hero.hp}/${hero.maxHp})`);
  assert(hero.tempHp === 0, 'temp HP must be cleared at run start');
  assert(hero.spellSlotsUsed.every(u => u === 0), 'all spell slots must be unused at run start');
  if (hero.resources.arcaneRecovery) assert(hero.resources.arcaneRecovery.cur === hero.resources.arcaneRecovery.max, 'arcane recovery must be full');
  assert(hero.hitDiceLeft === hero.level, 'hit dice should be full');
  step('new run: hero fully healed, temp HP cleared, all resources & slots full (level 3 via Manual)');

  // same for a character WITHOUT the Manual (plain level 1)
  const meta2 = { shards: 0, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
  const hero2 = createCharacter({ raceId: RACES[0].id, classId: 'fighter', name: 'ReadyF', subclassId: 'champion', scoreAssign: Run.autoAssignScores(CLASS_MAP.fighter, RACES[0], rng), level: 1, hero: true, rng });
  meta2.hero = hero2;
  while (hero2.level < 5) levelUpCharacter(hero2, rng, null);
  hero2.hp = 1;
  hero2.resources.secondWind.cur = 0;
  hero2.resources.actionSurge.cur = 0;
  Run.newRun(meta2, hero2);
  assert(hero2.level === 1, 'without the Manual the hero starts at level 1');
  assert(hero2.hp === hero2.maxHp, `fighter hero must start healed (${hero2.hp}/${hero2.maxHp})`);
  assert(hero2.resources.secondWind.cur === hero2.resources.secondWind.max, 'second wind must be full');
  step('new run (no Manual): level 1, healed, second wind/action surge full');
}

// ============ 2. CLICKABLE CHARACTER SHEET (jsdom) ============
{
  const rng = makeRng(777);
  const meta = { shards: 0, shopItems: {}, runs: 0, wins: 0, bestFloor: 0, deaths: 0, hero: null };
  const cls = CLASS_MAP.cleric;
  const hero = createCharacter({ raceId: RACES[0].id, classId: 'cleric', name: 'Clicky', subclassId: 'life', scoreAssign: Run.autoAssignScores(cls, RACES[0], rng), level: 1, hero: true, rng });
  meta.hero = hero;
  const run = Run.newRun(meta, hero);
  run.location = LOCATION_MAP.tavern;
  const G = { meta, hero, run, combat: null, walk: null, walkInstant: true };
  ui.setG(G);
  ui.campScreen();

  // open the hero sheet via the HUD button
  clickBtn('Your Sheet');
  const sheet = document.querySelector('.camp-sheet');
  if (!sheet) fail('camp sheet modal missing');

  // ---- spell chip → full spell detail ----
  const cureChip = [...sheet.querySelectorAll('.chip.spell')].find(ch => ch.textContent.includes('Cure Wounds'));
  if (!cureChip) fail('Cure Wounds spell chip missing');
  cureChip.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const spellDetail = document.querySelector('.spell-detail');
  if (!spellDetail) fail('clicking a spell chip should open the spell detail modal');
  const sdText = spellDetail.textContent;
  assert(sdText.includes('Cure Wounds'), 'spell detail should name Cure Wounds');
  assert(sdText.includes('1d8'), 'spell detail should show the healing dice');
  closeOverlay('.spell-detail');
  if (document.querySelector('.spell-detail')) fail('spell detail should close');
  step('spell chip → full spell detail modal (Cure Wounds, 1d8 + WIS)');

  // ---- class feature chip → feature description ----
  const featChip = [...sheet.querySelectorAll('.chip.feature')].find(ch => ch.textContent.includes('Divine Domain'));
  if (!featChip) fail('Divine Domain feature chip missing');
  featChip.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const infoModal = document.querySelector('.info-modal');
  if (!infoModal) fail('clicking a feature chip should open an info modal');
  assert(infoModal.textContent.includes('domain'), 'feature modal should describe the Divine Domain');
  closeOverlay('.info-modal');
  step('class feature chip → feature description modal');

  // ---- ability score card → ability description ----
  const strCard = [...sheet.querySelectorAll('.sheet-ab.clickable')].find(c => c.textContent.startsWith('STR'));
  if (!strCard) fail('STR ability card missing');
  strCard.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const abModal = document.querySelector('.info-modal');
  assert(abModal && abModal.textContent.includes('Strength'), 'ability modal should describe Strength');
  closeOverlay('.info-modal');
  step('ability score card → ability description modal');

  // ---- skill chip → skill description ----
  const skillChip = [...sheet.querySelectorAll('.chip.info')].find(ch => ch.textContent.includes('Insight') || ch.textContent.includes('Religion'));
  if (!skillChip) fail('skill chip missing');
  skillChip.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const skModal = document.querySelector('.info-modal');
  assert(skModal && /Wisdom|Intelligence/.test(skModal.textContent), 'skill modal should mention the governing ability');
  closeOverlay('.info-modal');
  document.querySelectorAll('.overlay').forEach(o => o.remove());
  step('skill chip → skill description modal');

  // ---- status chip (in combat) → condition description ----
  const combat = Combat.generateCombatMap(LOCATION_MAP.tavern, 1, rng, { revealed: true });
  Combat.spawnEncounter(combat, Run.activeFighters(run), 1, rng, {});
  G.combat = combat;
  const heroU = combat.units.find(u => u.char.hero);
  Combat.addStatus(heroU, 'poisoned', 'Poisoned', 3);
  Combat.addStatus(heroU, 'charmed', 'Charmed', 2);
  ui.showInspectModal(heroU.x, heroU.y);
  const inspect = document.querySelector('.inspect-panel');
  if (!inspect) fail('inspect modal missing');
  const poisonedChip = [...inspect.querySelectorAll('.chip')].find(ch => ch.textContent.includes('Poisoned'));
  if (!poisonedChip) fail('Poisoned chip missing in the inspect sheet');
  poisonedChip.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const stModal = document.querySelector('.info-modal');
  assert(stModal && stModal.textContent.includes('disadvantage'), 'status modal should explain the poisoned condition');
  closeOverlay('.info-modal');
  const charmedChip = [...inspect.querySelectorAll('.chip')].find(ch => ch.textContent.includes('Charmed'));
  charmedChip.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const stModal2 = document.querySelector('.info-modal');
  assert(stModal2 && stModal2.textContent.includes('cannot attack'), 'status modal should explain the charmed condition');
  closeOverlay('.info-modal');
  step('condition chips (Poisoned / Charmed) → condition description modals');
}

console.log('errors captured:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
