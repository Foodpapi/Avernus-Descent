// UI: screens + combat HUD. All DOM built programmatically. Dark fantasy theme.

import { makeRng, uid, clamp, ordinal, titleCase } from './rng.js';
import { createCharacter, mod, computeAc, computeMaxHp, recomputeDerived, initResources, initSpellcasting, skillMod, savingThrowMod, attackBonusFor, spellSlotSummary, listCantripsKnown, listLeveledSpellsKnown, canCastSpell, highestSpellLevel, levelUpCharacter, computeSpeed, ABILITIES, ABILITY_FULL, WILD_SHAPES, wildShapeFormsFor, changeGearChar, weaponStatFor, hasFeat, grantFeat, spellRangeFor } from './5e/rules.js';
import { RACE_MAP, RACE_FAMILIES, racesInFamily, SKILL_ABILITY } from './data/races.js';
import { CLASSES, CLASS_MAP, ASI_LEVELS } from './data/classes.js';
import { SPELLS, SPELL_MAP, cantripDmg } from './data/spells.js';
import { CONSUMABLES, WEAPONS, ARMORS, SHOP_ITEMS } from './data/items.js';
import { TOWN_EVENTS } from './data/town.js';
import { FEATURE_DESCRIPTIONS, SUBCLASS_DESCRIPTIONS, STATUS_DESCRIPTIONS, ABILITY_DESCRIPTIONS, SKILL_DESCRIPTIONS, featureDescription } from './data/features.js';
import { HUB_MAP, CAMP_MAP, TOWN_MAP } from './data/hub.js';
import { createWalk, addNpc, isWalkable, tryMove as walkTryMove, npcAt, npcNear, findWalkPath, findWalkPathToNpc } from './game/walk.js';
import { onAssetsChanged, preloadAll, hasUncachedAssets } from './render/assets.js';
import { LOCATIONS, LOCATION_MAP, OBSTACLES, obstacleBlocksProjectile } from './data/locations.js';
import { FEATS, FEAT_MAP, ELEMENT_CHOICES } from './data/feats.js';
import { drawTile, drawUnitSprite, TILE_SIZE, SPRITE_W, SPRITE_H } from './render/sprites.js';
import * as Combat from './5e/combat.js';
import * as Actions from './5e/combat_actions.js';
import { performAction } from './5e/turn.js';
import { chooseEnemyAction, executeEnemyTurn, planEnemySteps, performEnemyStep, reactionPromptsForStep, reactionPromptsAfterStep } from './5e/ai.js';
import * as Run from './game/run.js';
import * as Audio from './game/audio.js';

export let G = null; // global state set by main
export function setG(g) { G = g; }

const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (html !== undefined) d.innerHTML = html;
  return d;
};

export function screen(name, content, opts = {}) {
  // remove any open overlays (inspection, spellbook, ...) so they can't linger
  const hadOverlays = document.querySelectorAll('.overlay').length > 0;
  document.querySelectorAll('.overlay').forEach(o => o.remove());
  if (hadOverlays) Audio.play('ui/close', { vol: 0.5, throttle: 80 });
  if (G && name !== 'combat') G.walk = null;
  const ui = $('#ui');
  ui.innerHTML = '';
  ui.className = opts.cls || name;
  if (content) ui.appendChild(content);
  window.scrollTo(0, 0);
  // Route background music/ambience to this screen (no-op if disabled/missing).
  const locId = (G && G.combat && G.combat.locId) || (G && G.run && G.run.locId) || null;
  const boss = !!(G && G.combat && G.combat.floor && G.combat.floor % 3 === 0);
  Audio.setScene(name, locId, boss);
}

function btn(label, onClick, cls = '') {
  const b = el('button', `btn ${cls}`, label);
  b.addEventListener('click', onClick);
  return b;
}

// Append a modal overlay to the page (plays the panel-open sound).
function showOverlay(overlay) {
  document.body.appendChild(overlay);
  Audio.play('ui/open', { vol: 0.7, throttle: 80 });
}

function div(cls, ...children) {
  const d = el('div', cls);
  for (const c of children) {
    if (c == null) continue;
    if (typeof c === 'string' || typeof c === 'number') {
      d.appendChild(document.createTextNode(String(c)));
    } else {
      d.appendChild(c);
    }
  }
  return d;
}

function h(tag, cls, text) { return el(tag, cls, text); }

export function toast(msg) {
  let t = $('#toast');
  if (!t) { t = el('div', ''); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('show'), 2200);
}

// ============================== TITLE ==============================
export function titleScreen() {
  const hasSave = !!G.meta.hero;
  const root = div('title-screen cinematic-title');
  root.appendChild(div('title-art'));
  root.appendChild(div('title-veil'));

  const stage = div('title-stage');
  stage.appendChild(h('div', 'title-kicker', 'The Nine Hells Await'));
  stage.appendChild(h('div', 'game-title', 'AVERNUS<br>DESCENT'));
  stage.appendChild(h('div', 'game-subtitle', 'Isekai’d. Trapped. The only way out is down.'));
  stage.appendChild(div('title-rule'));
  stage.appendChild(h('p', 'game-flavor', 'You woke in a world that is not your own, at the edge of the First Layer, where the sky burns and the ground remembers fire. The portal home is closed — its key was forged in the deepest dark. Descend through Avernus, and claw your way back.'));

  const btns = div('title-btns');
  // Primary button: quick press/click continues; LONG-PRESS unlocks the debug console
  let longFired = false;
  const primary = btn(hasSave ? '⚔ Continue — The Hub' : '⚔ New Hero', () => {
    if (longFired) { longFired = false; return; } // the click after a long-press
    if (hasSave) enterHubWithArt(); else creationScreen();
  }, 'primary');
  attachLongPress(primary, () => {
    longFired = true;
    unlockDebugConsole();
  }, null);
  btns.appendChild(primary);
  btns.appendChild(btn('📜 How to Play', () => helpScreen(), ''));
  if (hasSave) btns.appendChild(btn('🗑 New Hero (reset)', () => confirmReset(), 'danger'));
  stage.appendChild(btns);
  stage.appendChild(h('div', 'title-footer', 'A D&D 5e Tactical RPG · High ground, cover & hazards matter · Death is permanent'));
  root.appendChild(stage);

  const embers = div('title-embers');
  for (let i = 0; i < 22; i++) {
    const e = el('div', 'title-ember');
    const s = (3 + Math.random() * 5).toFixed(1);
    const drift = (Math.random() * 160 - 80).toFixed(0);
    const dur = (7 + Math.random() * 9).toFixed(1);
    const delay = (-Math.random() * 12).toFixed(1);
    e.setAttribute('style', `width:${s}px;height:${s}px;left:${(Math.random() * 100).toFixed(1)}%;--drift:${drift}px;animation-duration:${dur}s;animation-delay:${delay}s`);
    embers.appendChild(e);
  }
  root.appendChild(embers);
  screen('title', root);
}

// ============================== DEBUG CONSOLE ==============================
export function unlockDebugConsole() {
  if (!G) return;
  G.debugUnlocked = true;
  try { localStorage.setItem('avernus_debug', '1'); } catch (e) { /* sandboxed */ }
  toast('🛠 Debug console unlocked — press TAB during a run');
}

export function openConsole() {
  if (document.querySelector('.console-overlay')) return;
  const overlay = div('overlay console-overlay');
  const panel = div('overlay-panel console-panel');
  panel.appendChild(h('h3', 'accent', '🛠 Debug Console'));
  panel.appendChild(h('div', 'muted', 'Type a command — "help" lists everything. Tab or Esc to close.'));
  const out = div('console-out');
  panel.appendChild(out);
  const row = div('console-row');
  const input = el('input');
  input.className = 'console-in';
  input.placeholder = 'e.g. skip floor';
  const runBtn = btn('Run', runCmd);
  row.appendChild(input);
  row.appendChild(runBtn);
  panel.appendChild(row);
  panel.appendChild(div('row-center', btn('Close', () => overlay.remove(), 'subtle')));
  overlay.appendChild(panel);
  showOverlay(overlay);

  function consolePrint(text, cls) {
    out.appendChild(h('div', 'console-line ' + (cls || ''), text));
    out.scrollTop = out.scrollHeight;
  }
  function runCmd() {
    const cmd = input.value;
    if (!cmd.trim()) return;
    executeConsole(cmd, consolePrint);
    input.value = '';
    input.focus();
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') runCmd();
    if (e.key === 'Escape') overlay.remove();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  consolePrint('Console active. "help" for commands.');
  setTimeout(() => input.focus(), 0);
}

function executeConsole(cmd, print) {
  const raw = cmd.trim();
  print('> ' + raw, 'console-cmd');
  const parts = raw.toLowerCase().split(/\s+/);
  const head = parts[0];
  switch (head) {
    case 'help': {
      print('skip floor / win — auto-win the current floor');
      print('heal — fully heal the whole party');
      print('gold <n> — add run gold');
      print('shards <n> — add soul shards (banked)');
      print('level up — level the whole party');
      print('clear — wipe this output');
      print('close — close the console');
      break;
    }
    case 'skip': {
      if (parts[1] !== 'floor') { print('Unknown — try "skip floor".', 'console-err'); break; }
      /* falls through to win */
    }
    case 'win': {
      const combat = G.combat;
      if (combat && !combat.over) {
        if (enemyTimer) { clearTimeout(enemyTimer); enemyTimer = null; }
        for (const e of Combat.aliveEnemies(combat)) { e.hp = 0; e.dead = true; }
        Actions.log(combat, '🛠 DEBUG: floor skipped.');
        combat.over = true;
        combat.won = true;
        print('✔ Floor skipped — victory flow starting.');
        combatEnded();
      } else if (G.run) {
        G.pendingLoot = null;
        G.run.floor++;
        print('✔ Floor skipped (camp/town) — heading to the next floor.');
        floorIntroScreen();
      } else {
        print('✖ Not in a run.', 'console-err');
      }
      break;
    }
    case 'heal': {
      if (!G.run) { print('✖ Not in a run.', 'console-err'); break; }
      for (const c of G.run.roster) { c.hp = c.maxHp; c.tempHp = 0; }
      if (G.combat) {
        for (const u of G.combat.units) {
          if (u.team === 'player') {
            u.hp = u.maxHp; u.dead = false; u.statuses = [];
            if (u.char) u.char.dead = false;
          }
        }
      }
      print('✔ Party fully healed.');
      break;
    }
    case 'gold': {
      const n = parseInt(parts[1], 10);
      if (!G.run || !Number.isFinite(n)) { print('✖ Usage: gold <number>', 'console-err'); break; }
      G.run.runGold += n;
      print(`✔ +${n} gold (now ${G.run.runGold}).`);
      break;
    }
    case 'shards': {
      const n = parseInt(parts[1], 10);
      if (!G.meta || !Number.isFinite(n)) { print('✖ Usage: shards <number>', 'console-err'); break; }
      G.meta.shards += n;
      Run.persistSave(G.meta);
      print(`✔ +${n} soul shards (now ${G.meta.shards}).`);
      break;
    }
    case 'level': {
      if (!G.run) { print('✖ Not in a run.', 'console-err'); break; }
      Run.levelUpParty(G.run, G.meta, {});
      for (const c of G.run.roster) {
        if (!c.dead && c.pendingLevelUp) Run.applyPendingLevelUp(G.run, c.id, {});
      }
      print('✔ Party leveled: ' + G.run.roster.filter(c => !c.dead).map(c => `${c.name} ${c.level}`).join(', '));
      break;
    }
    case 'clear': {
      const out = document.querySelector('.console-out');
      if (out) out.innerHTML = '';
      break;
    }
    case 'close': case 'exit': {
      document.querySelectorAll('.console-overlay').forEach(o => o.remove());
      break;
    }
    default:
      print(`✖ Unknown command "${raw}" — type "help".`, 'console-err');
  }
}

function confirmReset() {
  if (confirm('Start a brand new hero? Your current hero and shop purchases will be erased.')) {
    G.meta.hero = null;
    Run.persistSave(G.meta);
    titleScreen();
  }
}

export function helpScreen() {
  const root = div('screen-center help-screen');
  root.appendChild(h('h2', '', 'How to Play'));
  const items = [
    ['⚔ The Run', 'You and 3 random companions fight through floors of increasing danger. Clear a floor → earn soul shards & loot. Every 2 floors your party levels up (5e rules).'],
    ['💀 Permadeath', 'Any character that dies stays dead — no resurrection (except Revivify, cast within 3 rounds of death, mid-battle). If your hero dies, the run is over. You keep your hero build, persistent shop items, and banked shards.'],
    ['🏪 The Hub Shop', 'Soul shards (earned per floor cleared) buy PERMANENT relics that apply to every future run. Items found during a run are TEMPORARY — they are erased when the run ends, win or lose.'],
    ['🏘 The Town (every 3rd floor)', 'A long rest restores everything and resets blessings. Hire mercenaries (fight any 4 of your roster), browse a themed shop (blacksmiths skew to steel, archers to bows, rare Mind Flayer & Bhaal shops sell strange things), and try townspeople skill checks — pass for a party-wide +1 blessing until the next long rest, fail for a −1. Clerics, druids and wizards prepare their daily spells at camp.'],

    ['⛰ Terrain', 'High ground gives +1 to ranged attacks per elevation. Low cover (tables, crates, logs) gives +2 AC vs ranged. Tall obstacles block sight. Destroyable objects have HP bars, materials, and resistances (wood hates fire, stone hates thunder…). Hazards hurt: fire, lava, brambles, grease, deep water (don\'t fall in!).'],
    ['🎲 Combat', '5e rules: action + bonus action + movement. Attack rolls vs AC, saving throws, advantage/disadvantage, critical hits, spell slots, concentration, conditions, death saves (fail two → death; any heal revives). Damage numbers float up color-coded by type — red fire 🔥, blue cold ❄, green acid 🧪, ⚔ slashing, ⚒ bludgeoning (✨ prefix = magical), 💚 healing. Ranged attacks, rays, magic missile and thrown items hit the FIRST body or object on the flight path — including allies (friendly fire). Mental spells (Hex, Hold Person, Sacred Flame, Vicious Mockery) are not projectiles. Objects are auto-hit; creatures still require an attack roll. Hide: you cannot hide while clearly seen (5e). Your Stealth check is contested by each foe\'s Passive Perception — they can hear you even without line of sight. Lightfoot Halflings can hide behind a larger creature (Naturally Stealthy); Wood Elves can hide in foliage or mist (Mask of the Wild). While hidden, enemy line of sight is painted red on the map — step into it or get too close and you are spotted. Rogues 2+ can Hide as a bonus action (Cunning Action). Bows and thrown weapons fly as on-screen projectiles.'],
    ['🎖 Feats', 'ASIs and feats follow CLASS level (5e rules): at class levels 4, 8, 12, 16 and 19 — plus 6 & 14 for fighters and 10 for rogues — you may take a FEAT instead of the ability score increase. Multiclassing does not change your class-level milestones: a Wizard 3 / Barbarian 1 gets no ASI until one of those classes reaches its milestone. 29 feats with real mechanics: Great Weapon Master & Sharpshooter (toggleable -5/+10), Polearm Master, Sentinel, War Caster, Elemental Adept, Lucky, Mobile, Charger, Tough, Resilient, Magic Initiate and more.'],

    ['🎁 Loot', 'After each victory choose loot: weapons (possibly enchanted), armor, potions, scrolls. Boss floors (every 3rd) drop better loot.'],
    ['🎮 Controls', 'A radial menu appears around your hero each turn: ⚔ Actions (green), ⚡ Bonus Actions (orange), End Turn & Retreat (grey). Everyone gets 1 action point + 1 bonus action point per turn; Action Surge adds an action point, Haste adds one, Thief rogues get 2 bonus points, and Druids can Wild Shape into beasts (separate form HP, no spells while shaped). Click a tile to move; hold-click to inspect. Right-click / Esc cancels; Space ends turn. ⚑ Retreat keeps your hero alive but ends the run.'],
    ['🛠 Debug Console (secret)', 'Long-press the title screen\'s main button to unlock it, then press TAB during a run. Commands include "skip floor" (auto-win the floor), "heal", "gold <n>", "shards <n>", "level up".'],

  ];
  for (const [t, d] of items) {
    root.appendChild(div('help-item', h('b', '', t), h('span', '', d)));
  }
  root.appendChild(btn('Back', () => titleScreen(), 'primary'));
  screen('help', root);
}

// ============================== CHARACTER CREATION ==============================
export function creationScreen() {
  const state = {
    step: 0,
    raceFamily: null, raceId: null, classId: null, subclassId: null,
    scores: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
    name: '',
  };
  renderCreation(state);
}

function renderCreation(state) {
  const root = div('screen-center creation');
  root.appendChild(h('h2', '', 'Forge Your Hero'));
  const steps = div('steps');
  ['1 · Race', '2 · Class', '3 · Path', '4 · Scores', '5 · Name'].forEach((s, i) => {
    steps.appendChild(div('step' + (i === state.step ? ' active' : ' done'), s));
  });
  root.appendChild(steps);

  if (state.step === 0) {
    const familyMembers = state.raceFamily ? racesInFamily(state.raceFamily) : null;
    const pickingSubrace = !!(familyMembers && familyMembers.length > 1 && !state.raceId);
    if (pickingSubrace) {
      const fam = RACE_FAMILIES.find(f => f.id === state.raceFamily);
      root.appendChild(h('p', 'center', `Choose your ${fam ? fam.name : 'racial'} subrace:`));
      const grid = div('grid race-grid');
      for (const r of familyMembers) {
        const card = div('card' + (state.raceId === r.id ? ' selected' : ''));
        card.appendChild(h('div', 'card-title', r.name));
        card.appendChild(h('div', 'card-sub', `Speed ${r.speed} ft · ${r.size}` + (r.darkvision ? ' · Darkvision' : '')));
        card.appendChild(h('div', 'card-desc', r.desc));
        const feats = div('card-feats');
        r.features.slice(0, 3).forEach(f => feats.appendChild(h('span', 'feat', f.name)));
        card.appendChild(feats);
        card.addEventListener('click', () => { state.raceId = r.id; state.step = 1; renderCreation(state); });
        grid.appendChild(card);
      }
      root.appendChild(grid);
      root.appendChild(btn('← Back', () => { state.raceFamily = null; state.raceId = null; renderCreation(state); }));
    } else {
      const grid = div('grid race-grid');
      for (const fam of RACE_FAMILIES) {
        const members = racesInFamily(fam.id);
        const card = div('card' + (state.raceFamily === fam.id ? ' selected' : ''));
        card.appendChild(h('div', 'card-title', fam.name));
        const nSub = members.length;
        card.appendChild(h('div', 'card-sub', `Speed ${fam.speed} ft · ${fam.size}` + (fam.darkvision ? ' · Darkvision' : '') + (nSub > 1 ? ` · ${nSub} subraces` : '')));
        card.appendChild(h('div', 'card-desc', fam.desc));
        const feats = div('card-feats');
        (fam.features || []).slice(0, 3).forEach(f => feats.appendChild(h('span', 'feat', f.name)));
        card.appendChild(feats);
        card.addEventListener('click', () => {
          state.raceFamily = fam.id;
          if (members.length === 1) {
            state.raceId = members[0].id;
            state.step = 1;
          } else {
            state.raceId = null;
          }
          renderCreation(state);
        });
        grid.appendChild(card);
      }
      root.appendChild(grid);
    }
  } else if (state.step === 1) {
    const grid = div('grid class-grid');
    for (const c of CLASSES) {
      const card = div('card' + (state.classId === c.id ? ' selected' : ''));
      card.appendChild(h('div', 'card-title', c.name));
      card.appendChild(h('div', 'card-sub', `HD ${c.hdLabel || 'd' + c.hitDie} · Saves ${c.saves.join('/')}${c.spellAbility ? ` · ${c.spellAbility} caster` : ''}`));
      card.appendChild(h('div', 'card-desc', c.desc));
      card.addEventListener('click', () => { state.classId = c.id; state.subclassId = Object.keys(c.subclasses)[0]; state.step = 2; renderCreation(state); });
      grid.appendChild(card);
    }
    root.appendChild(grid);
    root.appendChild(btn('← Back', () => {
      const members = racesInFamily(state.raceFamily || (RACE_MAP[state.raceId] && RACE_MAP[state.raceId].family));
      if (members.length > 1) {
        state.raceId = null;
        state.raceFamily = members[0].family;
      } else {
        state.raceFamily = null;
        state.raceId = null;
      }
      state.step = 0;
      renderCreation(state);
    }));
  } else if (state.step === 2) {
    const cls = CLASS_MAP[state.classId];
    root.appendChild(h('p', 'center', `Choose your ${cls.name} specialization:`));
    const grid = div('grid sub-grid');
    for (const [id, sub] of Object.entries(cls.subclasses)) {
      const card = div('card' + (state.subclassId === id ? ' selected' : ''));
      card.appendChild(h('div', 'card-title', sub.name));
      card.appendChild(h('div', 'card-desc', sub.desc));
      card.addEventListener('click', () => { state.subclassId = id; state.step = 3; state.scores = Run.heroScoreRecommendation(state.classId); renderCreation(state); });
      grid.appendChild(card);
    }
    root.appendChild(grid);
    root.appendChild(btn('← Back', () => { state.step = 1; renderCreation(state); }));
  } else if (state.step === 3) {
    root.appendChild(h('p', 'center', 'Place your six scores. Click an ability to assign the next highest value.'));
    root.appendChild(h('p', 'center', 'Scores: ' + remainingScores(state.scores).sort((a, b) => b - a).join(' · ')));
    const grid = div('grid score-grid');
    for (const ab of ABILITIES) {
      const card = div('card score-card' + (state.scores[ab] ? ' assigned' : ''));
      card.appendChild(h('div', 'card-title', ab));
      card.appendChild(h('div', 'score-value', state.scores[ab] ? String(state.scores[ab]) : '—'));
      card.appendChild(h('div', 'score-mod', state.scores[ab] ? `Modifier ${mod(state.scores[ab]) >= 0 ? '+' : ''}${mod(state.scores[ab])}` : 'click to assign'));
      card.addEventListener('click', () => {
        const rem = remainingScores(state.scores).sort((a, b) => b - a);
        if (state.scores[ab]) {
          state.scores[ab] = 0;
        } else if (rem.length) {
          state.scores[ab] = rem[0];
        }
        renderCreation(state);
      });
      grid.appendChild(card);
    }
    root.appendChild(grid);
    const row = div('row-center');
    row.appendChild(btn('✨ Recommended', () => { state.scores = Run.heroScoreRecommendation(state.classId); renderCreation(state); }));
    row.appendChild(btn('🎲 Random', () => {
      const vals = [15, 14, 13, 12, 10, 8];
      const rng = makeRng();
      for (const ab of ABILITIES) state.scores[ab] = 0;
      for (const ab of rng.shuffle(ABILITIES)) state.scores[ab] = vals.shift();
      renderCreation(state);
    }));
    row.appendChild(btn('← Back', () => { state.step = 2; renderCreation(state); }));
    root.appendChild(row);
    if (remainingScores(state.scores).length === 0) {
      root.appendChild(btn('Continue →', () => { state.step = 4; renderCreation(state); }, 'primary'));
    }
  } else if (state.step === 4) {
    root.appendChild(h('p', 'center', 'What is your name, hero?'));
    const input = el('input', 'name-input');
    input.placeholder = 'e.g. Kaelen Stormblade';
    input.maxLength = 24;
    input.value = state.name;
    input.addEventListener('input', () => { state.name = input.value; });
    root.appendChild(div('row-center', input));
    const summary = div('summary');
    summary.appendChild(h('div', '', `${RACE_MAP[state.raceId].name} ${CLASS_MAP[state.classId].name} (${CLASS_MAP[state.classId].subclasses[state.subclassId].name})`));
    summary.appendChild(h('div', 'muted', ABILITIES.map(a => `${a} ${state.scores[a]} (${mod(state.scores[a]) >= 0 ? '+' : ''}${mod(state.scores[a])})`).join(' · ')));
    root.appendChild(summary);
    const row = div('row-center');
    row.appendChild(btn('← Back', () => { state.step = 3; renderCreation(state); }));
    row.appendChild(btn('⚔ Descend!', () => {
      if (!state.name.trim()) { toast('Give your hero a name first!'); return; }
      createHero(state);
    }, 'primary'));
    root.appendChild(row);
  }
  screen('creation', root);
}

function remainingScores(scores) {
  const used = Object.values(scores);
  return [15, 14, 13, 12, 10, 8].filter(v => !used.includes(v));
}

function createHero(state) {
  const rng = makeRng();
  const hero = createCharacter({
    raceId: state.raceId,
    classId: state.classId,
    name: state.name.trim(),
    subclassId: state.subclassId,
    scoreAssign: state.scores,
    level: 1,
    hero: true,
    rng,
  });
  hero.personality = 'The Hero';
  G.meta.hero = hero;
  Run.persistSave(G.meta);
  enterHubWithArt();
}

// ============================== ASSET LOADING GATE ==============================
// Preloads every manifest asset BEFORE the hub appears (with a loading bar on
// first visit). Later entries are instant because assets stay cached.
function enterHubWithArt() {
  // Only real browsers have both fetch AND location — headless/test
  // environments enter the hub directly (no manifest to preload there).
  if (typeof fetch === 'undefined' || typeof location === 'undefined') { hubScreen(); return; }
  hasUncachedAssets()
    .then((missing) => {
      if (!missing) { hubScreen(); return; }
      showLoadingScreen(() => hubScreen());
    })
    .catch(() => hubScreen()); // any manifest hiccup must never block the hub
}

function showLoadingScreen(onDone) {
  document.querySelectorAll('.overlay').forEach(o => o.remove());
  const uiEl = $('#ui');
  uiEl.innerHTML = '';
  uiEl.className = 'loading';
  const root = div('screen-center title-screen');
  root.appendChild(h('div', 'game-title loading-title', 'AVERNUS DESCENT'));
  root.appendChild(h('div', 'game-subtitle', 'Conjuring the art of the descent…'));
  const wrap = div('loading-bar-wrap');
  const fill = div('loading-bar-fill');
  wrap.appendChild(fill);
  root.appendChild(wrap);
  root.appendChild(h('div', 'loading-label', '…'));
  uiEl.appendChild(root);

  let finished = false;
  const finish = () => { if (!finished) { finished = true; onDone(); } };
  const started = Date.now();
  // Kick off audio preloads (ui click + hub music) in parallel with the art.
  Audio.preloadCommon('hub', null, false);
  preloadAll((frac, done, total) => {
    const f = document.querySelector('.loading-bar-fill');
    const l = document.querySelector('.loading-label');
    if (f) f.style.width = `${Math.round(frac * 100)}%`;
    if (l) l.textContent = `${done}/${total} assets`;
  }, () => {
    // keep the bar visible for a beat so it never blinks for cached loads
    setTimeout(finish, Math.max(0, 250 - (Date.now() - started)));
  });
  setTimeout(finish, 20000); // safety: never trap the player on the loading screen
}

// ============================== HUB ==============================
export function hubScreen() {
  walkScene('hub');
}

// ============================== WALKABLE SCENES (Hub / Camp / Town) ==============================
const WALK_TILE = 32;
const CLASS_EMOJI = {
  barbarian: '💪', bard: '🎵', cleric: '✨', druid: '🌿', fighter: '⚔', monk: '👊',
  paladin: '🛡', ranger: '🏹', rogue: '🗡', sorcerer: '🔮', warlock: '😈', wizard: '🧙',
};

function walkLoc(state) {
  // Walk scenes prefer their own optional tileset (tiles/hub_*, tiles/camp_*)
  // and fall back to reusing an existing location's tiles (hub→town, camp→forest)
  // so the scenes are never stuck with procedural placeholders.
  const FALLBACK = { hub: 'town', camp: 'forest', town: 'town' };
  return {
    id: 'walk-' + state.mapId,
    artId: state.mapId,
    fallbackArtId: FALLBACK[state.mapId] || null,
    ground: state.base.ground,
    wall: state.base.wall,
    cliff: state.base.wall,
  };
}

function walkScene(kind) {
  closeRadial();
  document.querySelectorAll('.overlay').forEach(o => o.remove());
  G.combat = null;
  const prev = G.walk;
  G.walk = createWalk(kind);
  const walk = G.walk;
  if (prev && prev.mapId === kind) {
    walk.x = prev.x; walk.y = prev.y; walk.facing = prev.facing;
  }
  const run = G.run;
  const meta = G.meta;

  // ---- NPCs per scene ----
  if (kind === 'hub') {
    for (const n of HUB_MAP.npcs) addNpc(walk, { ...n });
  } else if (kind === 'camp') {
    addNpc(walk, { key: 'camp_exit', kind: 'camp_exit', name: 'The Road Ahead', emoji: '🚩', x: CAMP_MAP.exit.x, y: CAMP_MAP.exit.y,
      lines: ['The embers die down. The Descent waits for no one.', 'Press on — every floor cleared is another fistful of soul shards.'] });
    let spot = 0;
    for (const c of run.roster) {
      if (c.dead || c.hero) continue;
      const [mx, my] = CAMP_MAP.memberSpots[spot % CAMP_MAP.memberSpots.length];
      if (!walk.grid[my] || walk.grid[my][mx].obstacle) { spot++; continue; }
      addNpc(walk, { key: 'member_' + c.id, kind: 'camp_member', name: c.name, emoji: CLASS_EMOJI[c.classId] || '👤', x: mx, y: my, char: c,
        lines: [`${c.personality || ''} — ${c.cls.name} ${c.classLevel || c.level}.`, 'We should go over our gear before we move on.'] });
      spot++;
    }
  } else if (kind === 'town') {
    addNpc(walk, { key: 'town_exit', kind: 'town_exit', name: 'City Gate', emoji: '🏛', x: TOWN_MAP.exit.x, y: TOWN_MAP.exit.y,
      lines: ['The road out of town leads down, always down.', 'Next floor whenever you are ready.'] });
    if (run.townShop) {
      addNpc(walk, { key: 'shop', kind: 'town_shop', name: 'Shopkeeper', emoji: '🛒', x: TOWN_MAP.shopSpot.x, y: TOWN_MAP.shopSpot.y, shop: run.townShop,
        lines: ['Step right up! Fresh steel, fine bows, stranger things.', 'Everything in town is bought with run gold — and lost when the run ends.'] });
    }
    (run.townOffers || []).forEach((rec, i) => {
      const [mx, my] = TOWN_MAP.mercSpots[i % TOWN_MAP.mercSpots.length];
      if (walk.grid[my][mx].obstacle) return;
      addNpc(walk, { key: 'merc_' + rec.id, kind: 'town_merc', name: rec.name, emoji: '⚔', x: mx, y: my, rec,
        lines: [`${rec.race.name} ${rec.cls.name}, level ${rec.level} — "${rec.personality}."`, `I fight for ${rec.hireCost} gold. Fair?`] });
    });
    const events = (run.townEvents || []).filter(e => !run.usedTownEvents.has(e.id));
    events.forEach((ev, i) => {
      const [mx, my] = TOWN_MAP.eventSpots[i % TOWN_MAP.eventSpots.length];
      if (walk.grid[my][mx].obstacle) return;
      addNpc(walk, { key: 'ev_' + ev.id, kind: 'town_event', name: ev.npc, emoji: '🗣', x: mx, y: my, ev });
    });
    let spot = 0;
    for (const c of run.roster) {
      if (c.dead || c.hero) continue;
      const [mx, my] = TOWN_MAP.memberSpots[spot % TOWN_MAP.memberSpots.length];
      if (walk.grid[my][mx].obstacle) { spot++; continue; }
      addNpc(walk, { key: 'tmember_' + c.id, kind: 'town_member', name: c.name, emoji: CLASS_EMOJI[c.classId] || '👤', x: mx, y: my, char: c });
      spot++;
    }
  }

  buildWalkDom(kind);
  renderWalk();
}

function buildWalkDom(kind) {
  const ui = $('#ui');
  ui.innerHTML = '';
  ui.className = 'walk';
  const walk = G.walk;
  const run = G.run;

  const root = div('walk-root');
  // banner
  const banner = div('walk-banner');
  if (kind === 'hub') {
    banner.appendChild(h('div', 'walk-title', `🏛 The Crossroads — Hub · 💎 ${G.meta.shards} shards`));
    banner.appendChild(h('div', 'muted', 'Walk to an NPC and press E (or click them). Dante begins the run · Beatrice sells · Virgil keeps the records.'));
  } else if (kind === 'camp') {
    banner.appendChild(h('div', 'walk-title', `🏕 ${run.location ? run.location.icon + ' ' + run.location.name : 'The Campfire'} — after floor ${run.floorsCleared}`));
    banner.appendChild(h('div', 'muted', 'Talk to your party to manage sheets, gear, spells and level-ups. The road continues east.'));
  } else {
    banner.appendChild(h('div', 'walk-title', `🏘 ${run.townName || 'Town'} · 💰 ${run.runGold} gold carried`));
    banner.appendChild(h('div', 'muted', 'Long rest complete. Shopkeepers, mercenaries and townsfolk await — and your party needs looking after.'));
  }
  const pending = run && run.roster ? run.roster.filter(c => !c.dead && Run.hasPendingChoices(c)) : [];
  if (pending.length) {
    banner.appendChild(h('div', 'walk-warn', `⚠ ${pending.length} party member${pending.length > 1 ? 's have' : ' has'} pending level-up choices — talk to them!`));
  }
  root.appendChild(banner);

  // canvas + npc layer
  const wrap = div('walk-canvas-wrap');
  const canvas = el('canvas');
  canvas.id = 'walk-canvas';
  canvas.width = walk.w * WALK_TILE;
  canvas.height = walk.h * WALK_TILE;
  wrap.appendChild(canvas);
  const npcLayer = div('walk-npc-layer');
  npcLayer.style.width = (walk.w * WALK_TILE) + 'px';
  npcLayer.style.height = (walk.h * WALK_TILE) + 'px';
  wrap.appendChild(npcLayer);
  root.appendChild(wrap);

  // hud prompt
  const hud = div('walk-hud');
  hud.id = 'walk-hud';
  hud.appendChild(h('span', 'walk-prompt', '🕹 WASD / arrows to move · click a tile to walk there · [E] interact'));
  if (kind === 'camp' || kind === 'town') {
    hud.appendChild(btn('📜 Your Sheet', () => { if (G.meta.hero) campfireSheetModal(G.meta.hero); }, 'subtle'));
    hud.appendChild(btn('⚔ Lineup', () => openLineupOverlay(), 'subtle'));
  }
  root.appendChild(hud);
  ui.appendChild(root);

  // canvas click = move (or talk via npc click)
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const tx = Math.floor((e.clientX - rect.left) / WALK_TILE);
    const ty = Math.floor((e.clientY - rect.top) / WALK_TILE);
    if (!isWalkable(walk, tx, ty)) return;
    const npc = npcAt(walk, tx, ty);
    if (npc) { npcClick(npc); return; }
    cancelAutoWalk();
    const path = findWalkPath(walk, tx, ty);
    if (path && path.length) startAutoWalk(path, null);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function renderWalk() {
  const walk = G.walk;
  if (!walk) return;
  const canvas = $('#walk-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const loc = walkLoc(walk);
  for (let y = 0; y < walk.h; y++) {
    for (let x = 0; x < walk.w; x++) {
      const t = walk.grid[y][x];
      const ground = loc.ground[(x * 7 + y * 13) % loc.ground.length];
      const tile = { ground, obstacle: t.obstacle, elevation: 0, hazard: null };
      const sprite = drawTile(tile, loc);
      ctx.drawImage(sprite, x * WALK_TILE, y * WALK_TILE);
    }
  }
  // hero
  const hero = G.meta && G.meta.hero;
  if (hero) {
    const sp = drawUnitSprite({ char: hero });
    // bottom-anchored at the unit's display size (art may rise above the tile)
    const spw = sp._dispW || sp.width;
    const sph = sp._dispH || sp.height;
    const spx = walk.x * WALK_TILE + (WALK_TILE - spw) / 2;
    const spy = (walk.y + 1) * WALK_TILE - sph;
    if (sp._isArt) ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sp, spx, spy, spw, sph);
    if (sp._isArt) ctx.imageSmoothingEnabled = false;
    // facing ring
    ctx.strokeStyle = 'rgba(255,232,60,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(walk.x * WALK_TILE + 2, walk.y * WALK_TILE + 2, WALK_TILE - 4, WALK_TILE - 4);
  }
  syncNpcDom();
}

function syncNpcDom() {
  const walk = G.walk;
  const layer = document.querySelector('.walk-npc-layer');
  if (!walk || !layer) return;
  // remove stale
  for (const el of [...layer.querySelectorAll('.walk-npc')]) {
    const npc = walk.npcs.find(n => n.uid === el.dataset.uid);
    if (!npc) el.remove();
  }
  for (const npc of walk.npcs) {
    if (!npc.active) continue;
    let elNode = layer.querySelector(`[data-uid="${npc.uid}"]`);
    if (!elNode) {
      elNode = div('walk-npc');
      elNode.dataset.uid = npc.uid;
      elNode.innerHTML = `<div class="walk-npc-emoji">${npc.emoji}</div><div class="walk-npc-name">${npc.name}</div>`;
      elNode.addEventListener('click', () => npcClick(npc));
      layer.appendChild(elNode);
    }
    elNode.style.left = (npc.x * WALK_TILE + WALK_TILE / 2) + 'px';
    elNode.style.top = (npc.y * WALK_TILE + 4) + 'px';
    elNode.classList.toggle('walk-near', npcNear(walk) === npc);
  }
  // prompt
  const hud = $('#walk-hud');
  if (hud) {
    const near = npcNear(walk);
    const prompt = hud.querySelector('.walk-prompt');
    if (prompt) prompt.textContent = near
      ? `[E] Talk to ${near.name} · WASD / arrows to move`
      : '🕹 WASD / arrows to move · click a tile to walk there · [E] interact';
  }
}

// ---------- interaction ----------
function cancelAutoWalk() {
  const w = G.walk;
  if (!w) return;
  if (w.autoTimer) { clearTimeout(w.autoTimer); w.autoTimer = null; }
  w.autoPath = null;
  w.autoNpc = null;
}

function startAutoWalk(path, targetNpc) {
  const w = G.walk;
  if (!w) return;
  w.autoPath = path.slice();
  w.autoNpc = targetNpc;
  walkTick();
}

function walkTick() {
  const w = G.walk;
  if (!w || !w.autoPath) return;
  if (document.querySelector('.overlay')) { cancelAutoWalk(); return; }
  const step = w.autoPath.shift();
  if (step && isWalkable(w, step.x, step.y)) {
    w.x = step.x; w.y = step.y;
    Audio.footstepWalk(w.mapId);
  }
  renderWalk();
  if (!w.autoPath.length) {
    const n = w.autoNpc;
    w.autoNpc = null;
    // open the TARGETED npc's dialog if in range (even if another npc is nearby)
    if (n && Math.max(Math.abs(n.x - w.x), Math.abs(n.y - w.y)) <= 1) openNpcDialog(n);
    return;
  }
  w.autoTimer = setTimeout(walkTick, G.walkInstant ? 0 : 140);
}

function npcClick(npc) {
  if (!npc || npc.used) return;
  const w = G.walk;
  // check distance to THIS npc (another nearby npc must not steal the click)
  if (Math.max(Math.abs(npc.x - w.x), Math.abs(npc.y - w.y)) <= 1) {
    cancelAutoWalk();
    openNpcDialog(npc);
    return;
  }
  cancelAutoWalk();
  const path = findWalkPathToNpc(w, npc);
  if (path && path.length) startAutoWalk(path, npc);
}

// ---------- NPC dialogs ----------
function openNpcDialog(npc) {
  document.querySelectorAll('.overlay').forEach(o => o.remove());
  const overlay = div('overlay npc-dialog');
  const panel = div('overlay-panel npc-dialog-panel');
  panel.appendChild(h('div', 'npc-portrait', npc.emoji));
  panel.appendChild(h('h3', 'accent', npc.name));
  if (npc.lines && npc.lines.length) panel.appendChild(h('p', 'flavor', `“${npc.lines[0]}”`));
  const content = div('npc-content');
  panel.appendChild(content);
  buildNpcContent(content, npc, overlay);
  panel.appendChild(div('row-center', btn('Leave', () => overlay.remove(), 'subtle')));
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

function buildNpcContent(content, npc, overlay) {
  const meta = G.meta, run = G.run;
  switch (npc.kind) {
    case 'dante': {
      content.appendChild(h('p', 'muted', 'Dante Alighieri guards the gate. Speak the word and the descent begins — the party is gathered at random, and death is forever.'));
      content.appendChild(div('row-center', btn('⚔ Begin the Descent', () => { overlay.remove(); startRun(); }, 'primary huge')));
      break;
    }
    case 'beatrice': {
      const shardLabel = h('p', 'center', `💎 Soul Shards: ${meta.shards}`);
      content.appendChild(shardLabel);
      content.appendChild(h('p', 'muted', 'Beatrice\'s Emporium — everything here is PERSISTENT and survives every run and every death.'));
      const grid = div('grid shop-grid');
      const renderShop = () => {
        grid.innerHTML = '';
        shardLabel.textContent = `💎 Soul Shards: ${meta.shards}`;
        for (const item of SHOP_ITEMS) {
          const ownedCount = meta.shopItems[item.id] || 0;
          const card = div('card shop-card' + (ownedCount ? ' owned' : ''));
          card.appendChild(h('div', 'card-title', `${item.icon} ${item.name}`));
          card.appendChild(h('div', 'card-cost', ownedCount ? `✔ Owned${ownedCount > 1 ? ` ×${ownedCount}` : ''}` : `💎 ${item.cost}`));
          card.appendChild(h('div', 'card-desc', item.desc));
          card.appendChild(h('div', 'card-effect', `⚡ ${item.effectText}`));
          if (!ownedCount) {
            card.appendChild(btn('Buy', (e) => {
              e.stopPropagation();
              const res = Run.buyShopItem(meta, item.id);
              toast(res.msg);
              renderShop();
            }, meta.shards >= item.cost ? 'primary' : 'disabled'));
          }
          grid.appendChild(card);
        }
      };
      renderShop();
      content.appendChild(grid);
      break;
    }
    case 'virgil': {
      const rows = div('sheet-rows');
      rows.appendChild(sheetRow('Runs', String(meta.runs)));
      rows.appendChild(sheetRow('Wins', String(meta.wins)));
      rows.appendChild(sheetRow('Best Floor', String(meta.bestFloor)));
      rows.appendChild(sheetRow('Hero Deaths', String(meta.deaths)));
      rows.appendChild(sheetRow('Soul Shards', String(meta.shards)));
      content.appendChild(rows);
      content.appendChild(h('p', 'muted', 'All your deeds, glorious and grim, are inscribed here.'));
      content.appendChild(div('row-center', btn('📜 Character Sheet & Starting Equipment', () => { overlay.remove(); hubHeroSheet(); }, 'primary')));
      break;
    }
    case 'camp_member': case 'town_member': {
      const c = npc.char;
      content.appendChild(h('p', 'muted', `${c.cls.name} ${c.classLevel || c.level} · HP ${c.hp}/${c.maxHp}${Run.hasPendingChoices(c) ? ` · ⚠ ${Run.describePending(c)}` : ''}`));
      content.appendChild(div('row-center', btn('📜 Character Sheet', () => { overlay.remove(); campfireSheetModal(c); }, 'primary')));
      break;
    }
    case 'camp_exit': case 'town_exit': {
      content.appendChild(h('p', 'muted', npc.kind === 'town_exit'
        ? 'The gate leads out of town and down into the next floor.'
        : 'Pack up the camp and march on to the next floor.'));
      content.appendChild(div('row-center', btn('⛰ Descend Further', () => { overlay.remove(); run.floor++; floorIntroScreen(); }, 'primary huge')));
      break;
    }
    case 'town_shop': {
      content.appendChild(h('p', 'muted', `${npc.shop.name} — run gold only; stock vanishes with the run.`));
      const grid = div('grid shop-grid');
      for (const item of npc.shop.items) {
        const icon = item.kind === 'weapon' ? '⚔' : item.kind === 'armor' ? '🛡' : item.kind === 'trinket' ? '💍' : item.kind === 'transformation' ? '🧠' : '🧪';
        const card = div('card');
        card.appendChild(h('div', 'card-title', `${icon} ${item.name} <span class="badge run">RUN</span>`));
        if (item.kind === 'weapon') card.appendChild(h('div', 'card-sub', `dmg ${item.def.dmg} ${item.def.dmgType}${item.enchant ? ` · ${item.enchant.name}` : ''}`));
        if (item.kind === 'armor') card.appendChild(h('div', 'card-sub', `AC ${item.def.ac.base}${item.enchant ? ` · ${item.enchant.name}` : ''}`));
        card.appendChild(h('div', 'card-desc', item.desc || ''));
        card.appendChild(h('div', 'card-cost', `💰 ${item.price} gold`));
        card.appendChild(btn('Buy', () => { overlay.remove(); chooseMemberForTownItem(item); }, run.runGold >= (item.price || 0) ? 'primary' : 'disabled'));
        grid.appendChild(card);
      }
      content.appendChild(grid);
      break;
    }
    case 'town_merc': {
      const rec = npc.rec;
      const hired = run.roster.some(c => c.id === rec.id);
      content.appendChild(h('p', 'muted', `${rec.race.name} ${rec.cls.name}, level ${rec.level} — "${rec.personality}"`));
      content.appendChild(h('p', 'center', `💰 ${rec.hireCost} gold`));
      content.appendChild(div('row-center', btn(hired || run.roster.length >= 6 ? 'Not available' : 'Hire', () => {
        if (hired || run.roster.length >= 6) return;
        const res = Run.hireRecruit(run, rec.id);
        toast(res.msg);
        overlay.remove();
        if (res.ok) walkScene('town');
      }, (hired || run.roster.length >= 6) ? 'disabled' : 'primary')));
      break;
    }
    case 'town_event': {
      const ev = npc.ev;
      content.appendChild(h('p', '', ev.title));
      content.appendChild(h('p', 'muted', ev.text));
      content.appendChild(h('p', 'center', `Skill check: ${ev.skill} (DC ${ev.dc})`));
      content.appendChild(div('row-center', btn(`🎲 Attempt (${ev.skill} DC ${ev.dc})`, () => { overlay.remove(); openTownEventModal(ev); }, 'primary')));
      break;
    }
    default:
      content.appendChild(h('p', 'muted', '…'));
  }
}

// Virgil's record-keeping: hero sheet + starting equipment in the hub.
function hubHeroSheet() {
  const hero = G.meta.hero;
  if (!hero) return;
  document.querySelectorAll('.overlay').forEach(o => o.remove());
  const overlay = div('overlay hub-sheet');
  const panel = div('overlay-panel camp-sheet-panel');
  panel.appendChild(h('h3', 'accent', `📜 ${hero.name} 👑`));
  panel.appendChild(h('div', 'muted', `${hero.cls.name} ${hero.classLevel || hero.level} · ${hero.race.name} · HP ${hero.hp}/${hero.maxHp}`));
  panel.appendChild(buildCharSheetFromChar(hero));
  panel.appendChild(h('h3', '', '⚒ Starting Equipment'));
  panel.appendChild(buildEquipmentUI(hero, {
    mode: 'camp',
    onEquip: (item) => {
      const r = changeGearChar(hero, 'equip_' + item.kind, { itemUid: item.uid });
      Run.saveHubGear(hero); Run.persistSave(G.meta);
      toast(r.msg); hubHeroSheet();
    },
    onUnequip: (eq) => {
      const r = changeGearChar(hero, 'unequip_' + eq.slot, { index: eq.index });
      Run.saveHubGear(hero); Run.persistSave(G.meta);
      toast(r.msg); hubHeroSheet();
    },
  }));
  panel.appendChild(h('p', 'muted', 'Changes here become your starting equipment on every future run.'));
  const owned = Run.ownedShopItems(G.meta);
  panel.appendChild(h('h3', '', '✦ Persistent Relics'));
  if (!owned.length) panel.appendChild(h('p', 'muted', 'None yet — visit Beatrice.'));
  else {
    const list = div('spell-list');
    for (const i of owned) {
      const row = div('spell-row');
      row.appendChild(h('div', 'spell-name', `${i.icon} ${i.name} <span class="badge persistent">PERSISTENT</span>`));
      row.appendChild(h('div', 'spell-desc', i.desc));
      list.appendChild(row);
    }
    panel.appendChild(list);
  }
  panel.appendChild(div('row-center', btn('Close', () => overlay.remove())));
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

function statBox(label, value) {
  return div('stat-box', h('div', 'stat-value', String(value)), h('div', 'stat-label', label));
}

function startRun() {
  const hero = G.meta.hero;
  G.run = Run.newRun(G.meta, hero);
  G.run.location = null;
  floorIntroScreen();
}

// ============================== FLOOR INTRO ==============================
export function floorIntroScreen() {
  const run = G.run;
  const meta = G.meta;
  const floor = run.floor;
  const boss = Run.floorIsBoss(floor);

  const picked = Run.pickNextLocation(run, meta);
  if (picked.choices) {
    // map choice
    const root = div('screen-center floor-intro');
    root.appendChild(h('h2', 'accent', `🗺 Floor ${ordinal(floor)} — Choose Your Path`));
    root.appendChild(h('p', 'center muted', "The Wayfarer's Map unfolds. Where will you descend?"));
    const grid = div('grid loc-grid');
    for (const loc of picked.choices) {
      const card = div('card' + (boss ? ' boss' : ''));
      card.appendChild(h('div', 'card-title', `${loc.icon} ${loc.name}`));
      card.appendChild(h('div', 'card-desc', loc.desc));
      card.appendChild(h('div', 'card-sub', boss ? '☠ BOSS FLOOR — greater danger, greater loot' : `Danger: ${dangerStars(floor)}`));
      card.addEventListener('click', () => beginFloor(loc.id));
      grid.appendChild(card);
    }
    root.appendChild(grid);
    screen('floor-intro', root);
    return;
  }

  const loc = picked.chosen;
  const root = div('screen-center floor-intro');
  if (boss) root.appendChild(h('div', 'boss-banner', '☠ BOSS FLOOR ☠'));
  root.appendChild(h('h2', 'accent', `Floor ${ordinal(floor)} — ${loc.icon} ${loc.name}`));
  root.appendChild(h('p', 'flavor', `“${run.rng.pick(loc.flavor)}”`));
  root.appendChild(h('p', 'center', loc.desc));
  root.appendChild(h('p', 'center muted', `Party level ${Run.partyLevel(run)} · Danger ${dangerStars(floor)}`));
  const row = div('row-center');
  row.appendChild(btn('⚔ To Battle!', () => beginFloor(loc.id), 'primary huge'));
  root.appendChild(row);
  screen('floor-intro', root);
}

function dangerStars(floor) {
  return '★'.repeat(Math.min(5, 1 + Math.floor(floor / 2))) + '☆'.repeat(Math.max(0, 5 - Math.min(5, 1 + Math.floor(floor / 2))));
}

function beginFloor(locId) {
  const run = G.run;
  Run.startFloor(run, G.meta, locId);
  startCombat();
}

// ============================== COMBAT ==============================
export function startCombat() {
  const run = G.run;
  G.walk = null;
  const meta = G.meta;
  const effects = run.effects || [];

  const rng = makeRng(Math.floor(Math.random() * 1e9));
  const combat = Combat.generateCombatMap(run.location, run.floor, rng, {
    revealed: effects.some(e => e.id === 'reveal_map'),
  });
  // surprise
  let surprise = run.floor > 1 && rng.chance(0.18);
  if (effects.some(e => e.id === 'no_surprise')) surprise = false;

  Combat.spawnEncounter(combat, Run.activeFighters(run), run.floor, rng, {
    boss: Run.floorIsBoss(run.floor),
    extraEnemies: effects.some(e => e.id === 'infernal_contract') ? 1 : 0,
    initiativeBonus: effects.some(e => e.id === 'banner_dawn') ? 3 : 0,
    surprise,
  });
  // lucky coin: +1 saves (handled in savingThrowMod via char flag)
  if (effects.some(e => e.id === 'save_bonus')) {
    for (const p of run.party) { p.saveBonus = 1; }
  }
  G.combat = combat;
  Audio.play('combat/start', { vol: 0.9, delay: 250 });
  combatScreen();
}

// ------- Combat screen -------
let CS = null; // combat screen state

export function combatScreen() {
  const ui = $('#ui');
  ui.innerHTML = '';
  const root = div('combat-root');
  const wrap = div('canvas-wrap');
  const canvas = el('canvas');
  canvas.id = 'combat-canvas';
  wrap.appendChild(canvas);
  root.appendChild(wrap);
  const hud = el('div');
  hud.className = 'combat-hud';
  root.appendChild(hud);
  ui.appendChild(root);
  ui.className = 'combat';

  CS = {
    canvas,
    ctx: canvas.getContext('2d'),
    mode: 'idle',
    pending: null,
    hover: null,
    reachable: null,
    flash: {},
    scale: 2,
    radial: null,
  };

  buildHud(CS);
  setupTurn();
}

function buildHud(cs) {
  const hud = $('.combat-hud');
  hud.innerHTML = '';
  const combat = G.combat;
  const loc = combat.loc;

  // top bar
  const top = div('hud-top');
  const left = div('hud-top-left');
  left.appendChild(h('div', 'hud-loc', `${loc.icon} ${loc.name} — Floor ${combat.floor} · Round ${combat.round}`));
  left.appendChild(h('div', 'hud-weather', `⛰ High ground +1 per level · 🛡 Low cover +2 AC vs ranged · ${loc.hazard === 'lava' ? '🌋 Lava burns!' : loc.hazard === 'water' ? '🌊 Deep water!' : loc.hazard === 'fire' ? '🔥 Fires burn!' : loc.hazard === 'darkness' ? '🌑 Darkness limits sight' : loc.hazard === 'brambles' ? '🌿 Brambles slow & cut' : loc.hazard === 'grease' ? '🫧 Grease is slippery' : ''}`));
  const actor = currentPlayerUnit();
  if (actor && Combat.isHiddenUnit(actor)) {
    left.appendChild(h('div', 'hud-hide', '🙈 Hidden — red tiles are enemy line of sight. A green ring means you are unseen; amber means you are in a cone but still hidden (racial). Step into a red tile or get too close and you are spotted.'));
  }
  top.appendChild(left);
  const portraits = div('hud-portraits');
  for (const u of combat.units.filter(u => u.team === 'player')) {
    const p = div('portrait' + (u.dead ? ' dead' : '') + (u.id === currentPlayerUnit()?.id ? ' active' : ''));
    p.appendChild(h('div', 'portrait-name', u.name.split(' ')[0]));
    const bar = div('hp-bar');
    const fill = div('hp-fill');
    fill.style.width = `${clamp((u.hp / u.maxHp) * 100, 0, 100)}%`;
    bar.appendChild(fill);
    p.appendChild(bar);
    p.appendChild(h('div', 'portrait-hp', `${u.hp}/${u.maxHp}${u.dead ? ' 💀' : ''}`));
    portraits.appendChild(p);
  }
  top.appendChild(portraits);
  hud.appendChild(top);

  // log
  const log = div('hud-log');
  for (const line of combat.log.slice(-50)) {
    log.appendChild(h('div', 'log-line', line));
  }
  hud.appendChild(log);

  // unit panel
  const panel = div('hud-panel');
  hud.appendChild(panel);
  buildUnitPanel(panel);

  // action bar
  const bar = div('hud-actions');
  hud.appendChild(bar);
  buildActionBar(bar);
}

function currentPlayerUnit() {
  const combat = G.combat;
  if (combat.over) return null;
  const u = Combat.currentUnit(combat);
  return u && u.team === 'player' ? u : null;
}

function buildUnitPanel(panel) {
  panel.innerHTML = '';
  const u = currentPlayerUnit();
  const combat = G.combat;
  if (!u || combat.over) {
    panel.appendChild(h('div', 'muted', ''));
    return;
  }
  const char = u.char;
  const ac = Combat.unitAc(u, combat);
  const info = div('panel-info');
  info.appendChild(h('div', 'panel-name', `${u.name}${char.hero ? ' 👑' : ''} — ${char.cls.name} ${char.classLevel || char.level}${char.secondClass ? ' / ' + CLASS_MAP[char.secondClass.classId].name + ' ' + char.secondClass.level : ''} · Lv${char.level}`));
  info.appendChild(h('div', 'panel-stats', `HP ${u.hp}/${u.maxHp}${u.tempHp ? ` (+${u.tempHp})` : ''} · AC ${ac} · Moves ${u.moveRemaining}/${computeSpeed(u.char)} · ⚔ ${u.actionPoints} · ⚡ ${u.bonusPoints}`));
  panel.appendChild(info);
  const bars = div('panel-bars');
  const hp = div('hp-bar big');
  const hpFill = div('hp-fill');
  hpFill.style.width = `${clamp((u.hp / u.maxHp) * 100, 0, 100)}%`;
  hp.appendChild(hpFill);
  bars.appendChild(hp);
  panel.appendChild(bars);
  // resources
  const res = char.resources || {};
  const resText = Object.entries(res).map(([k, v]) => `${titleCase(k)} ${v.cur}/${v.max}`).join(' · ');
  if (resText) panel.appendChild(h('div', 'panel-res', resText));
  if (char.cls.spellAbility || (char.featSpells && char.featSpells.length)) {
    panel.appendChild(h('div', 'panel-res', `Spell DC ${char.spellSaveDC || '—'} · Slots ${spellSlotSummary(char)}${char.featCasts && Object.keys(char.featCasts).some(k => char.featCasts[k]) ? ' · 🎖 feat cast ready' : ''}${u.concentration ? ` · Concentrating: ${SPELL_MAP[u.concentration.spellId]?.name || ''}` : ''}`));
  }
  // statuses
  if (u.statuses.length) {
    const chips = div('status-chips');
    for (const s of u.statuses) chips.appendChild(h('span', 'chip', `${s.name} (${s.rounds})`));
    panel.appendChild(chips);
  }
  if (u.char.buffs && u.char.buffs.length) {
    const chips = div('status-chips');
    for (const b of u.char.buffs) chips.appendChild(h('span', 'chip buff', `${b.name}${b.rounds && b.rounds < 999 ? ` (${b.rounds})` : ''}`));
    panel.appendChild(chips);
  }
}

function buildActionBar(bar) {
  bar.innerHTML = '';
  const u = currentPlayerUnit();
  if (!u || G.combat.over) {
    // enemy turn: no actions, but retreat is always an option
    if (!G.combat.over) bar.appendChild(btn('⚑ Retreat', () => confirmRetreat(), 'subtle'));
    return;
  }
  const bA = btn(`⚔ Actions${u.actionPoints > 1 ? ` (${u.actionPoints})` : ''}`, () => openRadial('actions'), 'green');
  const bB = btn(`⚡ Bonus Actions${u.bonusPoints > 1 ? ` (${u.bonusPoints})` : ''}`, () => openRadial('bonus'), 'orange');
  if (!Combat.hasAction(u)) bA.disabled = true;
  if (!Combat.hasBonus(u)) bB.disabled = true;
  bar.appendChild(bA);
  bar.appendChild(bB);
  bar.appendChild(btn('✅ End Turn', () => endPlayerTurn()));
  bar.appendChild(btn('⚑ Retreat', () => confirmRetreat(), 'subtle'));
  bar.appendChild(h('span', 'hint', 'Radial menu around your hero · click a tile to move · hold to inspect · Space ends turn'));
}

function confirmRetreat() {
  const overlay = div('overlay');
  const panel = div('overlay-panel');
  panel.appendChild(h('h3', 'accent', '🏳 Retreat from the Descent?'));
  panel.appendChild(h('p', 'muted', 'Your hero survives, but the run ends here — everything looted on this run is lost. The shop will still be there.'));
  const row = div('row-center');
  row.appendChild(btn('Yes, flee', () => { overlay.remove(); retreatRun(); }, 'danger'));
  row.appendChild(btn('Stay and fight', () => overlay.remove(), 'primary'));
  panel.appendChild(row);
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

function retreatRun() {
  const combat = G.combat;
  if (!combat || combat.over) return;
  if (enemyTimer) { clearTimeout(enemyTimer); enemyTimer = null; }
  Actions.log(combat, '🏳 The party retreats! The Descent claims its tribute.');
  G.lastRetreat = true;
  combat.over = true;
  combat.won = false;
  combatEnded();
}

// Ability metadata: which abilities exist, whether they cost a bonus action,
// and how they're aimed. Green = action, orange = bonus action.
const ABILITY_META = {
  rage: { label: '💢 Rage', bonus: true, target: null },
  reckless: { label: '😤 Reckless', bonus: false, target: null },
  second_wind: { label: '💨 Second Wind', bonus: true, target: null },
  action_surge: { label: '⚡ Action Surge', bonus: false, target: null, free: true },
  flurry: { label: '👊 Flurry of Blows', bonus: true, target: 'enemy' },
  patient_defense: { label: '🛡 Patient Defense', bonus: true, target: null },
  step_of_wind: { label: '🌪 Step of the Wind', bonus: true, target: null },
  lay_on_hands: { label: '🤲 Lay on Hands', bonus: false, target: 'ally' },
  channel_divinity: { label: '📿 Channel Divinity', bonus: false, target: 'cone' },
  bardic_inspiration: { label: '🎵 Bardic Inspiration', bonus: true, target: 'ally' },
  wild_shape: { label: '🐻 Wild Shape', bonus: true, target: null },
  vow_of_enmity: { label: '⚔ Vow of Enmity', bonus: true, target: 'enemy' },
  sacred_weapon: { label: '✨ Sacred Weapon', bonus: false, target: null },
  divine_smite: { label: '⚜ Divine Smite', bonus: false, target: 'enemy' },
  stunning_strike: { label: '⚡ Stunning Strike', bonus: false, target: 'enemy' },
  trip_attack: { label: '🎯 Trip Attack', bonus: false, target: 'enemy' },
  breath_weapon: { label: '🐉 Breath Weapon', bonus: false, target: 'cone' },
  arcane_recovery: { label: '🔮 Arcane Recovery', bonus: false, target: null },
  natural_recovery: { label: '🌿 Natural Recovery', bonus: false, target: null },
  wild_shape: { label: '🐻 Wild Shape', bonus: true, target: 'wildshape' },
  revert_wild_shape: { label: '🐾 Revert Form', bonus: false, target: null, free: true },
  mind_blast: { label: '🧠 Mind Blast', bonus: false, target: 'cone' },
  martial_arts: { label: '👊 Martial Arts Strike', bonus: true, target: 'enemy' },
  pam_butt: { label: '🪓 Butt Strike (PAM)', bonus: true, target: 'enemy' },
  shield_shove: { label: '🛡 Shield Shove', bonus: true, target: 'enemy' },
  toggle_gwm: { label: '💥 GWM Power Attack', bonus: false, target: null, free: true },
  toggle_sharpshooter: { label: '🎯 Sharpshooter Shot', bonus: false, target: null, free: true },
};

function abilityIsBonus(u, abId) {
  if (abId === 'wild_shape') return u.char.subclassId === 'moon'; // Moon = bonus action
  return !!(ABILITY_META[abId] && ABILITY_META[abId].bonus);
}

function getAbilities(u) {
  const char = u.char;
  const res = char.resources || {};
  const out = [];
  const add = (id, cond = true) => { if (cond) out.push(id); };
  if (char.cls.id === 'barbarian') { add('rage', res.rage && res.rage.cur > 0); add('reckless'); }
  if (char.cls.id === 'fighter') { add('second_wind', res.secondWind && res.secondWind.cur > 0 && Combat.hasBonus(u)); }
  if (char.cls.id === 'monk' && res.ki && res.ki.cur > 0) { add('flurry', Combat.hasBonus(u)); add('patient_defense', Combat.hasBonus(u)); add('step_of_wind', Combat.hasBonus(u)); }
  if (char.cls.id === 'paladin') { add('lay_on_hands', res.layOnHands && res.layOnHands.cur > 0); add('channel_divinity', res.channelDivinity && res.channelDivinity.cur > 0); }
  if (char.cls.id === 'paladin' && Combat.hasAction(u) && (char.cls.warlock ? char.pactSlotsUsed < char.pactSlots.length : char.spellSlots.some((s, i) => s > (char.spellSlotsUsed[i] || 0)))) add('divine_smite');
  if (char.cls.id === 'cleric' && res.channelDivinity && res.channelDivinity.cur > 0) add('channel_divinity');
  if (char.cls.id === 'bard') add('bardic_inspiration', res.bardicInspiration && res.bardicInspiration.cur > 0 && Combat.hasBonus(u));
  if (char.cls.id === 'druid') {
    const moon = char.subclassId === 'moon';
    add('wild_shape', res.wildShape && res.wildShape.cur > 0 && !u.wildShaped && (moon ? Combat.hasBonus(u) : Combat.hasAction(u)));
  }
  if (u.wildShaped) add('revert_wild_shape');
  if (char.transformed && char.transformed.type === 'mind_flayer') add('mind_blast', Combat.hasAction(u));
  if (char.cls.id === 'paladin' && char.subclassId === 'vengeance' && Combat.hasBonus(u)) add('vow_of_enmity');
  if (char.cls.id === 'paladin' && char.subclassId === 'devotion') add('sacred_weapon');
  if (char.cls.id === 'monk' && Combat.hasAction(u) && res.ki && res.ki.cur > 0) add('stunning_strike');
  if (char.cls.id === 'monk') add('martial_arts', u.martialArts && Combat.hasBonus(u));
  if (char.cls.id === 'fighter' && char.subclassId === 'battle_master' && Combat.hasAction(u) && res.superiority && res.superiority.cur > 0) add('trip_attack');
  if (char.raceId === 'dragonborn') add('breath_weapon', res.breathWeapon && res.breathWeapon.cur > 0);
  if (char.cls.id === 'wizard') add('arcane_recovery');
  if (char.cls.id === 'druid' && char.subclassId === 'land') add('natural_recovery');
  // feat abilities
  if (hasFeat(char, 'polearm_master')) add('pam_butt', u.pamAttack && Combat.hasBonus(u));
  if (hasFeat(char, 'shield_master')) add('shield_shove', char.shield && Combat.hasBonus(u) && !u.actionUsed);
  return out;
}

// Activate a class ability (shared by radial menu + ability list)
function activateAbility(abId, closeFirst = true) {
  const u = currentPlayerUnit();
  if (!u) return;
  const meta = ABILITY_META[abId] || { target: null };
  if (closeFirst) closeRadial();
  if (meta.target === 'wildshape') {
    openWildShapeModal();
    return;
  }
  if (meta.target === 'ally') {
    CS.mode = 'ally';
    CS.pending = { type: 'ability', ability: abId };
    toast('Click an ally');
  } else if (meta.target === 'enemy') {
    CS.mode = 'ability_target';
    CS.pending = { type: 'ability', ability: abId };
    toast('Click an enemy');
  } else if (meta.target === 'cone') {
    CS.mode = 'ability_cone';
    CS.pending = { type: 'ability', ability: abId };
    toast('Click a tile to aim (or an enemy)');
  } else {
    performAction(G.combat, u.id, { type: 'ability', ability: abId });
    afterPlayerAction();
    openRadial('root');
  }
}

// ============================== RADIAL MENU ==============================
function closeRadial(silent = false) {
  if (!silent && document.querySelector('.radial')) Audio.play('ui/close', { vol: 0.5, throttle: 60 });
  document.querySelectorAll('.radial').forEach(r => r.remove());
  if (CS) CS.radial = null;
}

function openRadial(level) {
  const u = currentPlayerUnit();
  if (!u || !G.combat || G.combat.over) return;
  closeRadial(true);
  Audio.play('ui/open', { vol: 0.7, throttle: 60 });
  CS.radial = { level };
  buildRadialDom();
}

function radialItems(level) {
  const u = currentPlayerUnit();
  if (!u) return [];
  const char = u.char;
  const usedAction = !Combat.hasAction(u), usedBonus = !Combat.hasBonus(u);

  if (level === 'root') {
    const items = [
      { id: 'actions', icon: '⚔', label: `Actions${u.actionPoints > 1 ? ` ×${u.actionPoints}` : ''}`, cls: 'radial-green', disabled: usedAction, fn: () => openRadial('actions') },
      { id: 'bonus', icon: '⚡', label: `Bonus Actions${u.bonusPoints > 1 ? ` ×${u.bonusPoints}` : ''}`, cls: 'radial-orange', disabled: usedBonus, fn: () => openRadial('bonus') },
    ];
    // Action Surge grants +1 action point — a free activation, always reachable
    const surge = char.resources && char.resources.actionSurge && char.resources.actionSurge.cur > 0;
    if (surge) {
      items.push({ id: 'surge', icon: '⚡', label: 'Surge', cls: 'radial-grey', disabled: false, fn: () => { performAction(G.combat, u.id, { type: 'ability', ability: 'action_surge' }); afterPlayerAction(); openRadial('root'); } });
    }
    if (u.wildShaped) {
      items.push({ id: 'revert', icon: '🐾', label: 'Revert Form', cls: 'radial-grey', disabled: false, fn: () => { activateAbility('revert_wild_shape', true); } });
    }
    // feat toggles (free)
    const w = char.weapon && char.weapon.base ? WEAPONS[char.weapon.base] : null;
    if (hasFeat(char, 'great_weapon_master') && w && w.properties.includes('heavy') && w.range === 'melee') {
      items.push({ id: 'gwm', icon: '💥', label: u.gwmOn ? 'GWM: ON' : 'GWM: Off', cls: 'radial-grey', disabled: false, fn: () => { performAction(G.combat, u.id, { type: 'ability', ability: 'toggle_gwm' }); afterPlayerAction(); openRadial('root'); } });
    }
    if (hasFeat(char, 'sharpshooter') && w && w.range.startsWith('ranged')) {
      items.push({ id: 'ss', icon: '🎯', label: u.ssOn ? 'Sharp: ON' : 'Sharp: Off', cls: 'radial-grey', disabled: false, fn: () => { performAction(G.combat, u.id, { type: 'ability', ability: 'toggle_sharpshooter' }); afterPlayerAction(); openRadial('root'); } });
    }
    items.push({ id: 'end', icon: '⏭', label: 'End Turn', cls: 'radial-grey', disabled: false, fn: () => { closeRadial(); endPlayerTurn(); } });
    items.push({ id: 'retreat', icon: '⚑', label: 'Retreat', cls: 'radial-grey', disabled: false, fn: () => { closeRadial(); confirmRetreat(); } });
    return items;
  }
  if (level === 'actions') {
    const items = [];
    // feat-granted spells count too (a monk with Fey Touched CAN cast)
    const hasActionSpells = char.spellsKnown.some(id => {
      const sp = SPELL_MAP[id];
      return sp && sp.castTime !== 'bonus' && sp.castTime !== 'reaction';
    }) || canRecastMoonbeam(u); // Moonbeam recast stays reachable even with no slots
    const hasActionAbils = getAbilities(u).some(id => !abilityIsBonus(u, id));
    const hasItems = char.inventory.some(i => CONSUMABLES[i.id] && CONSUMABLES[i.id].kind !== 'potion');
    const dis = usedAction;

    items.push({ id: 'attack', icon: '🗡', label: 'Attack', cls: 'radial-green', disabled: dis, fn: () => { closeRadial(); enterAttackMode(); } });
    items.push({ id: 'dash', icon: '🏃', label: 'Dash', cls: 'radial-green', disabled: dis, fn: () => { performAction(G.combat, u.id, { type: 'dash' }); afterPlayerAction(); openRadial('root'); } });
    items.push({ id: 'dodge', icon: '🛡', label: 'Dodge', cls: 'radial-green', disabled: dis, fn: () => { performAction(G.combat, u.id, { type: 'dodge' }); afterPlayerAction(); openRadial('root'); } });
    items.push({ id: 'hide', icon: '🙈', label: 'Hide', cls: 'radial-green', disabled: dis, fn: () => { performAction(G.combat, u.id, { type: 'hide' }); toastHideResult(u); afterPlayerAction(); openRadial('root'); } });
    if (hasActionSpells) items.push({ id: 'spells', icon: '✨', label: 'Spells', cls: 'radial-green', disabled: dis, fn: () => { closeRadial(); openSpellbook('action'); } });
    if (hasItems) items.push({ id: 'items', icon: '🎒', label: 'Items', cls: 'radial-green', disabled: dis, fn: () => { closeRadial(); openInventory(); } });
    if (hasActionAbils) items.push({ id: 'abilities', icon: '⚡', label: 'Abilities', cls: 'radial-green', disabled: dis, fn: () => { closeRadial(); openAbilities(getAbilities(u).filter(id => !abilityIsBonus(u, id))); } });
    items.push({ id: 'back', icon: '↩', label: 'Back', cls: 'radial-grey', disabled: false, fn: () => openRadial('root') });
    return items;
  }
  if (level === 'bonus') {
    const items = [];
    const bonusAbils = getAbilities(u).filter(id => abilityIsBonus(u, id));
    for (const ab of bonusAbils) {
      items.push({ id: 'ab_' + ab, icon: '', label: ABILITY_META[ab].label, cls: 'radial-orange', disabled: usedBonus, fn: () => activateAbility(ab, true) });
    }
    const hasBonusSpells = char.spellsKnown.some(id => {
      const sp = SPELL_MAP[id];
      return sp && sp.castTime === 'bonus' && canCastSpell(char, id);
    }) || canRecastHex(u); // Hex re-cast stays reachable even with no slots
    if (hasBonusSpells) items.push({ id: 'bonus_spells', icon: '✨', label: 'Bonus Spells', cls: 'radial-orange', disabled: usedBonus, fn: () => { closeRadial(); openSpellbook('bonus'); } });
    const potion = char.inventory.find(i => CONSUMABLES[i.id] && CONSUMABLES[i.id].kind === 'potion');
    if (potion) items.push({ id: 'potion', icon: '🧪', label: 'Potion', cls: 'radial-orange', disabled: usedBonus, fn: () => { performAction(G.combat, u.id, { type: 'useItem', itemUid: potion.uid }); afterPlayerAction(); openRadial('root'); } });
    // 5e Cunning Action: Rogue 2+ may Hide as a bonus action
    const classLv = char.classLevel || char.level || 1;
    if (char.cls && char.cls.id === 'rogue' && classLv >= 2) {
      items.push({ id: 'cunning_hide', icon: '🙈', label: 'Hide (Cunning)', cls: 'radial-orange', disabled: usedBonus, fn: () => { performAction(G.combat, u.id, { type: 'hide', asBonus: true }); toastHideResult(u); afterPlayerAction(); openRadial('root'); } });
    }
    items.push({ id: 'back', icon: '↩', label: 'Back', cls: 'radial-grey', disabled: false, fn: () => openRadial('root') });
    return items;
  }
  return [];
}

function buildRadialDom() {
  document.querySelectorAll('.radial').forEach(r => r.remove());
  if (!CS || !CS.radial) return;
  const items = radialItems(CS.radial.level);
  if (!items.length) { CS.radial = null; return; }
  const wrap = document.querySelector('.canvas-wrap');
  if (!wrap) { CS.radial = null; return; }
  const radial = div('radial');
  const ring = div('radial-ring');
  radial.appendChild(ring);
  for (const it of items) {
    const b = el('button', `radial-btn ${it.cls}${it.disabled ? ' radial-disabled' : ''}`);
    b.title = it.label;
    b.innerHTML = `<span class="radial-icon">${it.icon || '•'}</span><span class="radial-label">${it.label}</span>`;
    if (!it.disabled) b.addEventListener('click', (e) => { e.stopPropagation(); it.fn(); });
    radial.appendChild(b);
  }
  wrap.appendChild(radial);
  positionRadial();
}

function positionRadial() {
  if (!CS || !CS.radial) return;
  const radialEl = document.querySelector('.radial');
  if (!radialEl) return;
  const u = currentPlayerUnit();
  const combat = G.combat;
  if (!u || combat.over) { closeRadial(); return; }
  const wrap = document.querySelector('.canvas-wrap');
  if (!wrap) return;
  const scale = CS.scale || 1;
  const tilePx = TILE_SIZE * scale;
  const cx = (u.x + 0.5) * tilePx;
  const cy = (u.y + 0.5) * tilePx;
  const btnSize = Math.max(46, Math.round(tilePx * 1.15));
  const R = btnSize * 1.45;
  const wrapW = wrap.clientWidth || (CS.canvas && CS.canvas.width) || 800;
  const wrapH = wrap.clientHeight || (CS.canvas && CS.canvas.height) || 600;
  const ccx = Math.min(Math.max(cx, R + btnSize / 2 + 4), Math.max(R + btnSize / 2 + 4, wrapW - R - btnSize / 2 - 4));
  const ccy = Math.min(Math.max(cy, R + btnSize / 2 + 4), Math.max(R + btnSize / 2 + 4, wrapH - R - btnSize / 2 - 4));
  radialEl.style.left = ccx + 'px';
  radialEl.style.top = ccy + 'px';
  const btns = radialEl.querySelectorAll('.radial-btn');
  const n = btns.length;
  btns.forEach((b, i) => {
    const ang = ((-90 + (360 / n) * i) * Math.PI) / 180;
    b.style.left = Math.round(Math.cos(ang) * R) + 'px';
    b.style.top = Math.round(Math.sin(ang) * R) + 'px';
    b.style.width = btnSize + 'px';
    b.style.height = btnSize + 'px';
  });
  const ring = radialEl.querySelector('.radial-ring');
  if (ring) {
    ring.style.width = (R * 2 + btnSize) + 'px';
    ring.style.height = (R * 2 + btnSize) + 'px';
  }
}

// ------- Action modes -------
function toastHideResult(u) {
  if (u && Combat.isHiddenUnit(u)) toast('🙈 Hidden — enemy sightlines shown in red');
}

function enterAttackMode() {
  const u = currentPlayerUnit();
  if (!u || !Combat.hasAction(u)) return;
  CS.mode = 'attack';
  CS.pending = { type: 'attack' };
  toast('Click an enemy — or a destroyable object — to attack');
}

// ============================== WILD SHAPE ==============================
export function openWildShapeModal() {
  const u = currentPlayerUnit();
  if (!u || u.wildShaped) return;
  const char = u.char;
  const forms = wildShapeFormsFor(char);
  const overlay = div('overlay');
  const panel = div('overlay-panel');
  panel.appendChild(h('h3', 'accent', `🐻 Wild Shape — ${char.name}`));
  panel.appendChild(h('div', 'muted', char.subclassId === 'moon'
    ? 'Circle of the Moon: powerful combat forms, usable as a bonus action.'
    : 'Circle of the Land: smaller forms, usable as an action. While shaped you cannot cast spells or use items — fight with claws and teeth. Form HP is a separate pool; when it hits 0 you revert to your normal form.'));
  const grid = div('grid loot-grid');
  for (const fid of forms) {
    const form = WILD_SHAPES[fid];
    const card = div('card');
    card.appendChild(h('div', 'card-title', `${form.name} (CR ${form.cr})`));
    card.appendChild(h('div', 'card-sub', `Form HP ${form.hp} · AC ${form.ac} · Speed ${form.speed} tiles`));
    card.appendChild(h('div', 'card-desc', form.desc));
    card.appendChild(h('div', 'card-desc', form.attacks.map(a => `${a.name} +${a.toHit}, ${a.dmg} ${a.dmgType}${a.fx ? ' (rider)' : ''}`).join(' · ')));
    card.appendChild(btn('Take Shape', () => {
      overlay.remove();
      performAction(G.combat, u.id, { type: 'ability', ability: 'wild_shape', formId: fid });
      afterPlayerAction();
      openRadial('root');
    }));
    grid.appendChild(card);
  }
  panel.appendChild(grid);
  panel.appendChild(div('row-center', btn('Cancel', () => overlay.remove())));
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

// ============================== SPELLBOOK + SPELL DETAILS ==============================
function spellCostBadgeHtml(sp) {
  return sp.castTime === 'bonus'
    ? '<span class="badge cost-bonus">BONUS ACTION</span>'
    : sp.castTime === 'reaction'
    ? '<span class="badge cost-reaction">REACTION</span>'
    : '<span class="badge cost-action">ACTION</span>';
}

function spellLevelLabel(sp) {
  return sp.level === 0 ? '✦ Cantrip' : `${ordinal(sp.level)} level`;
}

function spellRangeText(sp) {
  if (sp.mode === 'cone') return `Self (${sp.coneSize}-tile cone)`;
  if (sp.mode === 'line') return `Self (${sp.lineLen}-tile line)`;
  if (sp.mode === 'self') return sp.range > 0 ? `Self (within ${sp.range} tiles)` : 'Self';
  if (sp.mode === 'melee') return 'Touch (5 ft)';
  if (sp.range === 1) return 'Touch (5 ft)';
  return `${sp.range} tiles (${sp.range * 5} ft)`;
}

function spellModText(char) {
  const ab = char.cls.spellAbility || char.featCastAbility || 'INT';
  const m = mod(char.abilities[ab]);
  return `${ab} ${m >= 0 ? '+' : ''}${m}`;
}

function currentSpellDice(sp, char) {
  if (typeof sp.dmg === 'string') return sp.dmg;
  if (sp.dmg && typeof sp.dmg === 'object') return cantripDmg(sp, char.level);
  return null;
}

function spellDamageTypeText(sp) {
  if (sp.dmgTypes && sp.dmgTypes.length) return sp.dmgTypes.join(' + ');
  return sp.dmgType || '';
}

// Inline dice line for the spell list rows
function spellDiceLine(sp, char) {
  if (sp.id === 'magic_missile') return '✨ auto-hit · 3d4+3 force (no roll!)';
  if (sp.heal) return `💚 heal ${sp.heal} + ${spellModText(char)} HP`;
  if (!sp.dmg) return null;
  const dice = currentSpellDice(sp, char);
  const typeStr = spellDamageTypeText(sp);
  if (sp.attack) return `🎯 d20 vs AC · ${dice} ${typeStr}`;
  if (sp.save) return `🛡 ${sp.save} save DC ${char.spellSaveDC} · ${dice} ${typeStr}${sp.halfOnSave ? ' · half on save' : ''}`;
  return `${dice} ${typeStr}`;
}

const SPELL_DURATIONS = {
  mage_armor: 'Whole floor', aid: 'Whole floor', death_ward: 'Whole floor',
  protection_from_energy: 'Whole floor', fire_shield: 'Whole floor', pass_without_trace: 'Whole floor',
  mirror_image: '3 rounds', blink: '10 rounds', crown_of_stars: '7 rounds (7 motes)',
  armor_of_agathys: '10 rounds, or until the temp HP is gone', grease: '10 rounds',
  fog_cloud: '10 rounds', sleep: 'Until the HP pool is spent (up to 5 rounds)',
  wall_of_stone: 'Permanent', smite: 'Until your next weapon hit',
};

function spellDurationText(sp) {
  if (sp.concentration) return 'Concentration, up to 10 rounds';
  if (SPELL_DURATIONS[sp.id]) return SPELL_DURATIONS[sp.id];
  if (sp.dmg || sp.heal || sp.attack || sp.save) return 'Instantaneous';
  return '10 rounds';
}

function spellMechanicsLines(sp, char) {
  if (sp.id === 'magic_missile') {
    return [
      'No attack roll and no saving throw — the darts strike unerringly.',
      'Each dart deals 1d4+1 force damage (3 darts, +1 dart per spell level above 1st).',
    ];
  }
  if (sp.fx === 'sleep') {
    return [
      'No roll to hit and no saving throw.',
      'Rolls 5d8: creatures in the area fall unconscious in order of lowest current HP until the pool is spent.',
      'Damage wakes a sleeper immediately.',
    ];
  }
  if (sp.attack) {
    const lines = [
      `Attack roll: roll a d20 and add your spell attack bonus (+${char.spellAttack}).`,
      `Compare the result against the target's AC. Natural 20 = critical hit (double dice); natural 1 = automatic miss.`,
    ];
    if (sp.fx === 'scorching_ray') lines.push('Fires 3 rays (+1 ray per spell level above 2nd); each ray is a separate attack roll.');
    if (sp.fx === 'eldritch_blast') lines.push(`Fires ${char.level >= 17 ? 4 : char.level >= 11 ? 3 : char.level >= 5 ? 2 : 1} beams at your level, each a separate attack roll.`);
    return lines;
  }
  if (sp.save) {
    const lines = [
      `Saving throw: the target rolls d20 + its ${sp.save} modifier vs your spell save DC (${char.spellSaveDC}).`,
      sp.halfOnSave ? 'On a success the target takes half damage.' : 'On a success the target takes no damage.',
    ];
    return lines;
  }
  if (sp.heal) {
    return [`No roll needed — the target regains ${sp.heal} + ${spellModText(char)} hit points.`];
  }
  return ['No attack roll or saving throw — the effect applies immediately.'];
}

function attachLongPress(el, onLong, onQuick, opts = {}) {
  const press = { t: null, x: 0, y: 0 };
  const isForm = (e) => opts.ignoreForms && e.target && ['SELECT', 'INPUT', 'TEXTAREA', 'OPTION', 'BUTTON'].includes(e.target.tagName);
  el.addEventListener('pointerdown', (e) => {
    if (isForm(e)) return; // let selects/buttons handle themselves
    press.x = e.clientX; press.y = e.clientY;
    press.t = setTimeout(() => {
      press.t = null;
      onLong(e);
    }, 550);
  });
  el.addEventListener('pointermove', (e) => {
    if (!press.t) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (dx * dx + dy * dy > 64) { clearTimeout(press.t); press.t = null; }
  });
  el.addEventListener('pointerup', (e) => {
    if (isForm(e)) return;
    if (!press.t) return;
    clearTimeout(press.t);
    press.t = null;
    if (onQuick) onQuick(e);
  });
  el.addEventListener('pointercancel', () => {
    if (press.t) { clearTimeout(press.t); press.t = null; }
  });
}

// Full dictionary entry for a spell (opened by long-pressing a spell row).
function showSpellDetail(sp, char, castFilter) {
  document.querySelectorAll('.spell-detail').forEach(o => o.remove());
  const overlay = div('overlay spell-detail');
  const panel = div('overlay-panel spell-detail-panel');
  panel.appendChild(h('h3', 'accent', `✨ ${sp.name} — ${spellLevelLabel(sp)}`));
  panel.appendChild(h('div', 'muted', `${sp.school} · ${sp.castTime}${sp.concentration ? ' · concentration' : ''}`));

  // --- facts ---
  const facts = div('sheet-section');
  facts.appendChild(h('h4', '', 'At a Glance'));
  const rows = div('sheet-rows');
  rows.appendChild(sheetRow('Level', sp.level === 0
    ? 'Cantrip — never costs a spell slot; scales with character level'
    : `${ordinal(sp.level)} level — costs one spell slot of this level or higher`));
  rows.appendChild(sheetRow('School', sp.school));
  rows.appendChild(sheetRow('Casting Time', `${sp.castTime} — costs ${sp.castTime === 'bonus' ? 'a BONUS action point' : sp.castTime === 'reaction' ? 'your reaction' : 'an action point'}`));
  rows.appendChild(sheetRow('Range', spellRangeText(sp)));
  if (sp.mode === 'aoe' && sp.aoeRadius) rows.appendChild(sheetRow('Area', `Radius ${sp.aoeRadius} tiles (${sp.aoeRadius * 2 + 1}×${sp.aoeRadius * 2 + 1} square)`));
  if (sp.mode === 'cone') rows.appendChild(sheetRow('Area', `${sp.coneSize}-tile cone`));
  if (sp.mode === 'line') rows.appendChild(sheetRow('Area', `${sp.lineLen}-tile line`));
  rows.appendChild(sheetRow('Duration', spellDurationText(sp)));
  if (sp.concentration) rows.appendChild(sheetRow('Concentration', 'Yes — if you take damage you must make a CON save (DC 10 or half the damage) or the spell ends. Casting another concentration spell ends this one.'));
  rows.appendChild(sheetRow('Classes', sp.classes.map(c => titleCase(c)).join(', ')));
  facts.appendChild(rows);
  panel.appendChild(facts);

  // --- how it resolves ---
  const mech = div('sheet-section');
  mech.appendChild(h('h4', '', 'How It Resolves'));
  const mrows = div('sheet-rows');
  for (const l of spellMechanicsLines(sp, char)) mrows.appendChild(sheetLine(l));
  mech.appendChild(mrows);
  panel.appendChild(mech);

  // --- dice ---
  if (sp.dmg || sp.heal) {
    const dice = div('sheet-section');
    dice.appendChild(h('h4', '', 'Dice'));
    const drows = div('sheet-rows');
    if (sp.dmg) {
      const typeStr = spellDamageTypeText(sp);
      drows.appendChild(sheetRow('Damage', `${currentSpellDice(sp, char)} ${typeStr}`));
      if (sp.chooseType) drows.appendChild(sheetRow('Damage Type', `Choose: ${sp.chooseType.join(', ')}`));
      if (sp.level === 0 && typeof sp.dmg === 'object') {
        const tiers = Object.keys(sp.dmg).map(Number).sort((a, b) => a - b);
        drows.appendChild(sheetRow('Cantrip Scaling', tiers.map(t => `level ${t}: ${sp.dmg[t]}`).join(' · ')));
      } else if (sp.dmg && typeof sp.dmg === 'string') {
        if (sp.id === 'magic_missile') drows.appendChild(sheetRow('At Higher Levels', '+1 dart per spell level above 1st.'));
        else if (sp.id === 'scorching_ray') drows.appendChild(sheetRow('At Higher Levels', '+1 ray per spell level above 2nd.'));
        else if (/\d+d\d+/.test(sp.dmg)) drows.appendChild(sheetRow('At Higher Levels', '+1 damage die per spell level above its base.'));
      }
    }
    if (sp.heal) drows.appendChild(sheetRow('Healing', `${sp.heal} + ${spellModText(char)} HP`));
    if (sp.id === 'toll_the_dead') drows.appendChild(sheetRow('Note', 'd12 if the target is missing any HP, otherwise d8.'));
    dice.appendChild(drows);
    panel.appendChild(dice);
  }

  // --- description ---
  const descSec = div('sheet-section');
  descSec.appendChild(h('h4', '', 'Description'));
  descSec.appendChild(sheetLine(sp.desc));
  panel.appendChild(descSec);

  // --- back / close ---
  const row = div('row-center');
  row.appendChild(btn('↩ Back to Spells', () => overlay.remove(), 'primary'));
  row.appendChild(btn('Close', () => overlay.remove()));
  panel.appendChild(row);
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

function upcastLevelsFor(char, sp) {
  if (!char.cls || char.cls.warlock || sp.level === 0) return [];
  const out = [];
  for (let i = sp.level - 1; i < char.spellSlots.length; i++) {
    if (char.spellSlots[i] > (char.spellSlotsUsed[i] || 0)) out.push(i + 1);
  }
  return out;
}
function upcastPreviewDmg(sp, castLevel) {
  if (!sp.dmg) return '';
  if (typeof sp.dmg === 'string') {
    const m = sp.dmg.match(/^(\d+)d(\d+)(.*)$/);
    if (!m) return sp.dmg;
    const n = Number(m[1]) + (castLevel - sp.level);
    return `${n}d${m[2]}${m[3]}`;
  }
  return '';
}
function upcastPreviewHeal(sp, castLevel) {
  if (!sp.heal) return '';
  const m = sp.heal.match(/^(\d+)d(\d+)(.*)$/);
  if (!m) return sp.heal;
  const n = Number(m[1]) + (castLevel - sp.level);
  return `${n}d${m[2]}${m[3]}`;
}

// 5e Hex re-targeting: once the cursed target falls, the warlock may move the
// Hex to a new victim as a bonus action — no spell slot spent.
function canRecastHex(u) {
  if (!u || !G.combat || !u.concentration || u.concentration.spellId !== 'hex') return false;
  const oldId = u.concentration.data && u.concentration.data.target;
  const oldUnit = G.combat.units.find(x => x.id === oldId);
  return !!(oldUnit && oldUnit.dead);
}

// 5e Moonbeam: while concentrating, recast/move the beam as an action — no slot.
function canRecastMoonbeam(u) {
  if (!u || !G.combat || !u.concentration || u.concentration.spellId !== 'moonbeam') return false;
  return G.combat.effects.some(e => e.type === 'moonbeam' && e.source === u.id);
}

function openSpellbook(castFilter = null) {
  const u = currentPlayerUnit();
  if (!u) return;
  if (castFilter === 'action' && !Combat.hasAction(u)) return;
  if (castFilter === 'bonus' && !Combat.hasBonus(u)) return;
  const char = u.char;
  const overlay = div('overlay spellbook-overlay');
  const panel = div('overlay-panel spellbook');
  const title = castFilter === 'bonus' ? `✨ ${char.name}'s Bonus Action Spells`
    : castFilter === 'action' ? `✨ ${char.name}'s Action Spells`
    : `✨ ${char.name}'s Spells`;
  panel.appendChild(h('h3', '', title));
  panel.appendChild(h('div', 'muted', `Spell save DC ${char.spellSaveDC} · Spell attack +${char.spellAttack} · Slots: ${spellSlotSummary(char)}`));
  panel.appendChild(h('div', 'hint-line', 'Click a spell to cast it · hold for its full entry · pick a level to upcast'));
  const list = div('spell-list');
  let ids = [...listCantripsKnown(char), ...listLeveledSpellsKnown(char).sort((a, b) => SPELL_MAP[a].level - SPELL_MAP[b].level)];
  if (castFilter) {
    ids = ids.filter(id => {
      const sp = SPELL_MAP[id];
      if (!sp) return false;
      if (castFilter === 'bonus') return sp.castTime === 'bonus';
      return sp.castTime !== 'bonus' && sp.castTime !== 'reaction';
    });
  }
  if (!ids.length) panel.appendChild(h('p', 'muted', 'No spells of this kind known.'));
  // ---- Moonbeam re-cast: free action while concentrating (5e move-the-beam) ----
  if (castFilter === 'action' && canRecastMoonbeam(u)) {
    const recastMb = div('spell-row recast-row');
    recastMb.appendChild(h('div', 'spell-name', `Recast Moonbeam <span class="badge cost-action">ACTION</span><span class="badge concentration">CONCENTRATION</span>`));
    recastMb.appendChild(h('div', 'spell-sub', 'Evocation · action · you are concentrating on Moonbeam'));
    recastMb.appendChild(h('div', 'spell-dice', '✨ No spell slot needed — move the beam up to 12 tiles (60 ft)'));
    recastMb.appendChild(h('div', 'spell-desc', 'Relocate the silvery beam. Creatures it newly covers take 2d10 radiant (CON save for half).'));
    attachLongPress(recastMb,
      () => openInfoModal('Recast Moonbeam', '5e concentration recast', [
        'On each of your turns after you cast Moonbeam, you can use an action to move the beam up to 60 feet (12 tiles) in any direction.',
        'Re-casting in this way costs no spell slot and does not break your concentration.',
        'A creature the relocated beam newly covers enters the area and must save against the radiant damage.',
      ]),
      () => {
        overlay.remove();
        CS.mode = 'recast_moonbeam';
        CS.pending = { type: 'recast_moonbeam' };
        toast('Click a tile to recast Moonbeam (free — no slot)');
      },
      { ignoreForms: true }
    );
    list.appendChild(recastMb);
  }
  // ---- Hex re-cast: free bonus action when the cursed target has fallen ----
  if (castFilter === 'bonus' && canRecastHex(u)) {
    const recast = div('spell-row recast-row');
    recast.appendChild(h('div', 'spell-name', `Recast Hex <span class="badge cost-bonus">BONUS ACTION</span><span class="badge concentration">CONCENTRATION</span>`));
    recast.appendChild(h('div', 'spell-sub', 'Necromancy · bonus action · the cursed target has fallen'));
    recast.appendChild(h('div', 'spell-dice', '🎯 No spell slot needed — move the curse to a new foe'));
    recast.appendChild(h('div', 'spell-desc', 'Shift your Hex to a living enemy. Your attacks against the new target deal +1d6 necrotic damage.'));
    attachLongPress(recast,
      () => openInfoModal('Recast Hex', '5e re-targeting rule', [
        'When the target of your Hex drops to 0 hit points, you can use a bonus action on a subsequent turn to curse a new creature.',
        'Re-casting in this way costs no spell slot and does not break your concentration.',
        'The new target must be alive, an enemy, and within 9 tiles.',
      ]),
      () => {
        overlay.remove();
        CS.mode = 'recast_hex';
        CS.pending = { type: 'recast_hex' };
        toast('Click a living enemy to move your Hex');
      },
      { ignoreForms: true }
    );
    list.appendChild(recast);
  }
  for (const id of ids) {
    const sp = SPELL_MAP[id];
    const avail = canCastSpell(char, id);
    const row = div('spell-row' + (avail ? '' : ' exhausted'));
    row.appendChild(h('div', 'spell-name', `${sp.name}${sp.level ? ` (${ordinal(sp.level)})` : ' ✦cantrip'} ${spellCostBadgeHtml(sp)}${sp.concentration ? ' <span class="badge concentration">CONCENTRATION</span>' : ''}`));
    row.appendChild(h('div', 'spell-sub', `${sp.school} · ${sp.castTime} · ${spellRangeText(sp)}${avail ? '' : ' · NO SLOTS'}`));
    const dice = spellDiceLine(sp, char);
    if (dice) row.appendChild(h('div', 'spell-dice', dice));
    row.appendChild(h('div', 'spell-desc', sp.desc));
    // upcast control: pick a higher spell level when slots allow
    let upcastSel = null;
    if (avail && sp.level > 0 && char.cls && !char.cls.warlock && (sp.dmg || sp.heal)) {
      const levels = upcastLevelsFor(char, sp);
      if (levels.length > 1) {
        const wrapSel = div('upcast-row');
        wrapSel.appendChild(h('span', 'upcast-label', 'Cast at:'));
        upcastSel = el('select');
        upcastSel.className = 'upcast-select';
        for (const lvl of levels) {
          const opt = el('option');
          opt.value = String(lvl);
          const preview = sp.dmg ? upcastPreviewDmg(sp, lvl) : upcastPreviewHeal(sp, lvl);
          opt.textContent = `${ordinal(lvl)}${preview ? ' · ' + preview : ''}`;
          upcastSel.appendChild(opt);
        }
        upcastSel.addEventListener('pointerdown', (e) => e.stopPropagation());
        upcastSel.addEventListener('click', (e) => e.stopPropagation());
        wrapSel.appendChild(upcastSel);
        row.appendChild(wrapSel);
      }
    }
    const teleportFx = sp.fx === 'misty_step' || sp.fx === 'dimension_door' || sp.fx === 'thunder_step';
    attachLongPress(row,
      () => showSpellDetail(sp, char, castFilter), // long-press: full entry
      avail ? () => { // quick click: cast
        overlay.remove();
        CS.mode = 'spell';
        CS.pending = { type: 'cast', spellId: id, level: upcastSel ? parseInt(upcastSel.value, 10) : undefined };
        toast(teleportFx
          ? `Cast ${sp.name}: click a free tile within ${sp.range} tiles to teleport`
          : `Cast ${sp.name}: click ${sp.mode === 'ally' ? 'an ally' : sp.mode === 'self' ? 'a tile' : 'a target or area'}`);
      } : null,
      { ignoreForms: true }
    );
    list.appendChild(row);
  }
  panel.appendChild(list);
  const close = btn('Close', () => overlay.remove());
  panel.appendChild(close);
  overlay.appendChild(panel);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

function openInventory() {
  const u = currentPlayerUnit();
  if (!u || !Combat.hasAction(u)) return;
  const char = u.char;
  const overlay = div('overlay');
  const panel = div('overlay-panel');
  panel.appendChild(h('h3', '', `🎒 ${char.name}'s Pack`));
  panel.appendChild(h('div', 'muted', 'Run items — everything here is lost when the run ends. Potions cost a bonus action; thrown items and scrolls cost an action.'));
  if (!char.inventory.length) panel.appendChild(h('p', '', 'Empty.'));
  for (const item of char.inventory) {
    const def = CONSUMABLES[item.id];
    const isPotion = def && def.kind === 'potion';
    const row = div('spell-row');
    const costTag = isPotion
      ? '<span class="badge cost-bonus">BONUS ACTION</span>'
      : '<span class="badge cost-action">ACTION</span>';
    row.appendChild(h('div', 'spell-name', `${item.name} <span class="badge run">RUN</span> ${costTag}`));
    row.appendChild(h('div', 'spell-desc', def ? def.desc : item.desc));
    row.addEventListener('click', () => {
      overlay.remove();
      if (def && (def.kind === 'throw' || def.kind === 'scroll')) {
        CS.mode = 'item';
        CS.pending = { type: 'useItem', itemUid: item.uid };
        toast(`Click a target for ${item.name}`);
      } else {
        performAction(G.combat, u.id, { type: 'useItem', itemUid: item.uid });
        afterPlayerAction();
        openRadial('root');
      }
    });
    panel.appendChild(row);
  }
  const close = btn('Close', () => overlay.remove());
  panel.appendChild(close);
  overlay.appendChild(panel);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

function openAbilities(abils) {
  const u = currentPlayerUnit();
  if (!u || !Combat.hasAction(u)) return;
  const overlay = div('overlay');
  const panel = div('overlay-panel');
  panel.appendChild(h('h3', '', `⚔ ${u.char.name}'s Actions — Abilities`));
  panel.appendChild(h('div', 'muted', 'These cost your action this turn.'));
  for (const ab of abils) {
    const meta = ABILITY_META[ab];
    if (!meta) continue;
    const row = div('spell-row');
    row.appendChild(h('div', 'spell-name', `${meta.label} <span class="badge cost-action">ACTION</span>`));
    row.addEventListener('click', () => {
      overlay.remove();
      activateAbility(ab, false);
    });
    panel.appendChild(row);
  }
  const close = btn('Close', () => overlay.remove());
  panel.appendChild(close);
  overlay.appendChild(panel);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

// ------- Turn driver -------
function setupTurn() {
  const combat = G.combat;
  const u = Combat.currentUnit(combat);
  if (!u) return combatEnded();
  if (combat.surprise && u.team === 'player') {
    // players cannot act during a surprise round
    Actions.endTurn(combat);
    if (combat.over) { combatEnded(); return; }
    setupTurn();
    return;
  }
  if (u.team === 'player') {
    // player's turn: compute reachable + show the radial action menu
    closeRadial();
    CS.mode = 'idle';
    CS.pending = null;
    computeReachable();
    updateHud();
    render();
    openRadial('root');
  } else {
    closeRadial();
    CS.mode = 'enemy';
    updateHud();
    render();
    runEnemyTurns();
  }
}

function computeReachable() {
  const combat = G.combat;
  const u = Combat.currentUnit(combat);
  if (!u || u.team !== 'player') { CS.reachable = null; return; }
  const reach = new Map();
  const key = (x, y) => y * combat.w + x;
  const startElev = Combat.elevationAt(combat, u.x, u.y);
  const pq = [{ x: u.x, y: u.y, cost: 0 }];
  reach.set(key(u.x, u.y), 0);
  while (pq.length) {
    pq.sort((a, b) => a.cost - b.cost);
    const cur = pq.shift();
    if (cur.cost > u.moveRemaining) continue;
    const ce = Combat.elevationAt(combat, cur.x, cur.y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!Combat.isPassable(combat, nx, ny)) continue;
      const cost = cur.cost + Combat.moveCost(combat, nx, ny, ce);
      if (cost > u.moveRemaining) continue;
      const k = key(nx, ny);
      if (!reach.has(k) || reach.get(k) > cost) {
        reach.set(k, cost);
        pq.push({ x: nx, y: ny, cost });
      }
    }
  }
  CS.reachable = reach;
}

function afterPlayerAction() {
  computeReachable();
  updateHud();
  render();
}

function endPlayerTurn() {
  const combat = G.combat;
  const u = currentPlayerUnit();
  if (!u) return;
  closeRadial();
  if (Combat.hasAction(u)) Actions.log(combat, `${u.name} holds their action.`);
  Actions.endTurn(combat);
  CS.mode = 'idle';
  CS.pending = null;
  if (combat.over) { combatEnded(); return; }
  setupTurn();
}

function updateHud() {
  const hud = $('.combat-hud');
  if (hud) buildHud(CS);
}

let enemyTimer = null;

// Reaction modal: pauses the enemy turn until the player chooses.
function showReactionModal(prompts) {
  return new Promise((resolve) => {
    const overlay = div('overlay reaction-overlay');
    const panel = div('overlay-panel');
    panel.appendChild(h('h3', 'accent', '⚡ Reaction!'));
    for (const p of prompts) {
      if (p.title) panel.appendChild(h('p', 'center', p.title));
    }
    panel.appendChild(h('div', 'muted', 'Pick a reaction (uses your reaction for this round), or pass.'));
    for (const p of prompts) {
      for (const opt of p.options) {
        const b = btn(opt.label, () => { overlay.remove(); resolve(opt); }, 'primary');
        b.style.margin = '4px 0';
        panel.appendChild(b);
      }
    }
    const pass = btn('Pass', () => { overlay.remove(); resolve(null); }, 'subtle');
    panel.appendChild(div('row-center', pass));
    overlay.appendChild(panel);
    showOverlay(overlay);
  });
}

function applyReactionChoice(combat, choice) {
  const u = combat.units.find(x => x.id === choice.unitId);
  if (!u || u.dead) return;
  if (choice.kind === 'oa') {
    const target = combat.units.find(x => x.id === choice.targetId);
    if (!target || target.dead) return;
    performAction(combat, u.id, { type: 'attack', targetId: target.id, opts: { weaponId: choice.weaponId, noCost: true } });
    u.reactionUsed = true;
    Actions.log(combat, `⚡ ${u.name} takes an opportunity attack at ${target.name}!`);
  } else if (choice.kind === 'hellish') {
    const target = combat.units.find(x => x.id === choice.targetId);
    if (!target || target.dead) return;
    performAction(combat, u.id, { type: 'cast', spellId: 'hellish_rebuke', targetId: target.id, noCost: true });
    u.reactionUsed = true;
  } else if (choice.kind === 'warcaster') {
    const target = combat.units.find(x => x.id === choice.targetId);
    if (!target || target.dead) return;
    performAction(combat, u.id, { type: 'cast', spellId: choice.spellId, targetId: target.id, noCost: true });
    u.reactionUsed = true;
  }
  // Sentinel: a successful opportunity attack stops the enemy in their tracks
  if (choice.kind === 'oa' && hasFeat(u.char, 'sentinel') && combat.lastActionResult && combat.lastActionResult.hit) {
    combat._sentinelStop = true;
  }
}

// Drive an enemy's turn step-by-step, pausing for reaction prompts.
export function driveEnemySteps(combat, u, steps, i = 0) {
  return new Promise((resolve) => {
    const stepDone = () => {
      if (G.combat !== combat || combat.over || u.dead || i + 1 >= steps.length) {
        resolve();
        return;
      }
      enemyTimer = setTimeout(() => {
        if (G.combat !== combat) { resolve(); return; }
        driveEnemySteps(combat, u, steps, i + 1).then(resolve);
      }, 200);
    };
    if (combat.over || u.dead) { resolve(); return; }
    if (combat._sentinelStop) { combat._sentinelStop = false; resolve(); return; }
    const refresh = () => {
      try { if (document.querySelector('.combat-hud')) updateHud(); } catch (e) {}
      try { if (document.querySelector('#combat-canvas')) render(); } catch (e) {}
    };
    const step = steps[i];
    // pre-step reactions (opportunity attacks)
    const pre = reactionPromptsForStep(combat, u, step);
    if (pre.length) {
      showReactionModal(pre).then((choice) => {
        if (choice) applyReactionChoice(combat, choice);
        if (combat.over || u.dead) { resolve(); return; }
        if (combat._sentinelStop) { combat._sentinelStop = false; resolve(); return; } // Sentinel froze the enemy
        performEnemyStep(combat, u, step);
        refresh();
        const post = reactionPromptsAfterStep(combat, u, step, null);
        if (post.length && !combat.over && !u.dead) {
          showReactionModal(post).then((choice2) => {
            if (choice2) applyReactionChoice(combat, choice2);
            refresh();
            stepDone();
          });
        } else {
          stepDone();
        }
      });
      return;
    }
    // no pre-prompt: capture HP, perform, then check post-step reactions
    const hpBefore = new Map(Combat.alivePlayers(combat).map(p => [p.id, p.hp]));
    performEnemyStep(combat, u, step);
    refresh();
    const post = reactionPromptsAfterStep(combat, u, step, hpBefore);
    if (post.length && !combat.over && !u.dead) {
      showReactionModal(post).then((choice) => {
        if (choice) applyReactionChoice(combat, choice);
        refresh();
        stepDone();
      });
    } else {
      stepDone();
    }
  });
}

function runEnemyTurns() {
  const combat = G.combat;
  if (enemyTimer) { clearTimeout(enemyTimer); enemyTimer = null; }
  if (combat.over) { combatEnded(); return; }
  const u = Combat.currentUnit(combat);
  if (!u) { combatEnded(); return; }
  if (u.team === 'player') {
    setupTurn();
    return;
  }
  render();
  enemyTimer = setTimeout(() => {
    if (G.combat !== combat) return;
    if (combat.over) { combatEnded(); return; }
    const action = chooseEnemyAction(combat, u);
    const steps = planEnemySteps(combat, u, action);
    driveEnemySteps(combat, u, steps, 0).then(() => {
      if (G.combat !== combat) return;
      updateHud();
      render();
      if (combat.over) { combatEnded(); return; }
      // advance past this unit's turn
      const cur = Combat.currentUnit(combat);
      if (cur && cur.id === u.id) Actions.endTurn(combat);
      updateHud();
      render();
      if (combat.over) { combatEnded(); return; }
      runEnemyTurns();
    });
  }, 480);
}

function combatEnded() {
  if (enemyTimer) { clearTimeout(enemyTimer); enemyTimer = null; }
  closeRadial();
  const combat = G.combat;
  if (!combat || combat._ended) return; // guard: console skip + timers can race
  combat._ended = true;
  Actions.finishCombat(combat);
  render();
  const run = G.run;
  if (combat.won) {
    run.floorsCleared++;
    const shards = Run.shardsForFloor(run.floorsCleared, G.meta);
    run.shardsEarned += shards;
    G.meta.shards += shards;
    Run.persistSave(G.meta);
    run.runGold += combat.gold || 0;
    setTimeout(() => victoryScreen(shards), 700);
  } else {
    setTimeout(() => defeatScreen(), 700);
  }
}

// Painter's-algorithm layering for units: a unit further DOWN the screen
// (higher Y) is "closer to the camera" and must draw on top of units above
// it. X breaks same-row ties so the order stays stable.
export function sortedUnitsForRender(units) {
  return [...units].sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

// ------- Canvas render -------
function render() {
  const cs = CS;
  const combat = G.combat;
  if (!cs || !combat) return;
  const canvas = cs.canvas;
  const ctx = cs.ctx;
  const cw = canvas.parentElement.clientWidth || 800;
  const ch = canvas.parentElement.clientHeight || 500;
  const scale = Math.min(cw / (combat.w * TILE_SIZE), ch / (combat.h * TILE_SIZE));
  cs.scale = scale;
  canvas.width = combat.w * TILE_SIZE * scale;
  canvas.height = combat.h * TILE_SIZE * scale;
  canvas.style.width = canvas.width + 'px';
  canvas.style.height = canvas.height + 'px';
  ctx.imageSmoothingEnabled = false;

  // tiles
  for (let y = 0; y < combat.h; y++) {
    for (let x = 0; x < combat.w; x++) {
      const t = combat.grid[y][x];
      const dx = x * TILE_SIZE * scale, dy = y * TILE_SIZE * scale;
      if (!t.discovered && !combat.revealed) {
        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(dx, dy, TILE_SIZE * scale, TILE_SIZE * scale);
        continue;
      }
      const sprite = drawTile(t, combat.loc);
      if (sprite._hasArt) ctx.imageSmoothingEnabled = true;
      ctx.drawImage(sprite, dx, dy, TILE_SIZE * scale, TILE_SIZE * scale);
      if (sprite._hasArt) ctx.imageSmoothingEnabled = false;
      if (!t.visible && !combat.revealed) {
        ctx.fillStyle = 'rgba(8,8,16,0.55)';
        ctx.fillRect(dx, dy, TILE_SIZE * scale, TILE_SIZE * scale);
      }
      // Object HP bars — scaled to the object's footprint (a chair isn't a full-width bar).
      if (t.maxHp && t.hp != null && (t.visible || combat.revealed || t.discovered)) {
        const ob = t.obstacle ? OBSTACLES[t.obstacle] : null;
        const barScale = (ob && ob.barScale) || 0.55;
        const bw = TILE_SIZE * scale * barScale;
        const bh = 2 * scale;
        const bx = dx + (TILE_SIZE * scale - bw) / 2;
        const by = dy + TILE_SIZE * scale - 5 * scale;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(bx, by, bw, bh);
        const ratio = clamp(t.hp / t.maxHp, 0, 1);
        ctx.fillStyle = ratio > 0.5 ? '#c9a227' : ratio > 0.25 ? '#e8c33c' : '#e84a3c';
        ctx.fillRect(bx, by, bw * ratio, bh);
      }
    }
  }

  // effects
  for (const e of combat.effects || []) {
    drawEffect(ctx, e, combat, scale);
  }

  // reachable overlay
  if (CS.reachable && CS.mode === 'idle') {
    const u = currentPlayerUnit();
    if (u && u.team === 'player') {
      for (const [k] of CS.reachable) {
        const y = Math.floor(k / combat.w), x = k % combat.w;
        ctx.fillStyle = 'rgba(80,180,255,0.22)';
        ctx.fillRect(x * TILE_SIZE * scale, y * TILE_SIZE * scale, TILE_SIZE * scale, TILE_SIZE * scale);
        ctx.strokeStyle = 'rgba(120,200,255,0.5)';
        ctx.strokeRect(x * TILE_SIZE * scale + 1, y * TILE_SIZE * scale + 1, TILE_SIZE * scale - 2, TILE_SIZE * scale - 2);
      }
    }
  }

  // While hidden: paint every revealed enemy's line of sight (5e "clearly seen").
  drawEnemySight(ctx, combat, scale);

  // path preview
  if (CS.hover && CS.hoverPath) {
    for (const p of CS.hoverPath) {
      ctx.fillStyle = 'rgba(255,220,80,0.35)';
      ctx.fillRect(p.x * TILE_SIZE * scale, p.y * TILE_SIZE * scale, TILE_SIZE * scale, TILE_SIZE * scale);
    }
  }

  // aiming overlays
  drawAimOverlay(ctx, combat, scale);

  // units — painter's algorithm: higher Y draws later (on top), X breaks ties
  const cur = Combat.currentUnit(combat);
  for (const u of sortedUnitsForRender(combat.units)) {
    if (u.overboard) continue;
    const t = combat.grid[u.y] && combat.grid[u.y][u.x];
    if (!t || (!t.visible && u.team === 'enemy' && !combat.revealed)) continue;
    const dx = u.x * TILE_SIZE * scale, dy = u.y * TILE_SIZE * scale;
    // selection ring
    if (cur && cur.id === u.id && !u.dead) {
      ctx.strokeStyle = '#ffe83c';
      ctx.lineWidth = 2 * scale;
      ctx.strokeRect(dx + 1, dy + 1, TILE_SIZE * scale - 2, TILE_SIZE * scale - 2);
    }
    const sp = drawUnitSprite(u, { selected: CS.mode !== 'enemy' && cur && cur.id === u.id });
    // bottom-anchored at the unit's display size; feet on the tile's bottom edge
    const spw = (sp._dispW || sp.width) * scale;
    const sph = (sp._dispH || sp.height) * scale;
    const spx = dx + (TILE_SIZE * scale - spw) / 2;
    const spy = dy + TILE_SIZE * scale - sph;
    if (sp._isArt) ctx.imageSmoothingEnabled = true; // 2x canvas downscales to screen
    const hiddenNow = Combat.isHiddenUnit(u);
    if (hiddenNow) ctx.globalAlpha = 0.55;
    ctx.drawImage(sp, spx, spy, spw, sph);
    if (hiddenNow) ctx.globalAlpha = 1;
    if (sp._isArt) ctx.imageSmoothingEnabled = false;
    // dead
    if (u.dead) {
      ctx.fillStyle = 'rgba(120,0,0,0.5)';
      ctx.fillRect(dx, dy, TILE_SIZE * scale, TILE_SIZE * scale);
      ctx.font = `${Math.round(12 * scale)}px Georgia`;
      ctx.fillStyle = '#ff5540';
      ctx.fillText('💀', dx + 4 * scale, dy + 12 * scale);
      continue;
    }
    // hit flash
    if (cs.flash[u.id] && performance.now() - cs.flash[u.id] < 350) {
      ctx.fillStyle = 'rgba(255,40,40,0.35)';
      ctx.fillRect(dx, dy, TILE_SIZE * scale, TILE_SIZE * scale);
    }
    // hp bar
    const w = TILE_SIZE * scale * 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(dx + TILE_SIZE * scale * 0.1, dy + TILE_SIZE * scale - 6 * scale, w, 3 * scale);
    ctx.fillStyle = u.hp / u.maxHp > 0.5 ? '#4ac24a' : u.hp / u.maxHp > 0.25 ? '#e8c33c' : '#e84a3c';
    ctx.fillRect(dx + TILE_SIZE * scale * 0.1, dy + TILE_SIZE * scale - 6 * scale, w * clamp(u.hp / u.maxHp, 0, 1), 3 * scale);
    if (u.tempHp > 0) {
      ctx.fillStyle = '#5ab8e8';
      ctx.fillRect(dx + TILE_SIZE * scale * 0.1, dy + TILE_SIZE * scale - 6 * scale, w * clamp(u.tempHp / u.maxHp, 0, 1), 3 * scale);
    }
    // status chips
    const chips = u.statuses.slice(0, 3);
    let cx = dx + 2 * scale;
    for (const s of chips) {
      ctx.font = `${Math.round(8 * scale)}px sans-serif`;
      ctx.fillStyle = 'rgba(20,20,30,0.85)';
      const tw = ctx.measureText(s.name).width + 4 * scale;
      ctx.fillRect(cx, dy, tw, 8 * scale);
      ctx.fillStyle = '#e8d8a0';
      ctx.fillText(s.name, cx + 2 * scale, dy + 6 * scale);
      cx += tw + 2 * scale;
    }
    // elevation marker
    const elev = Combat.elevationAt(combat, u.x, u.y);
    if (elev > 0) {
      ctx.font = `${Math.round(7 * scale)}px sans-serif`;
      ctx.fillStyle = '#ffe83c';
      ctx.fillText('▲'.repeat(elev), dx + TILE_SIZE * scale - 12 * scale, dy + 8 * scale);
    }
  }

  // floating combat numbers (damage/heals)
  drawPopups(ctx, combat, scale);

  // spell visual effects (beams, projectiles, rings…)
  drawSpellFx(ctx, combat, scale);

  // hover info
  drawHoverInfo(ctx, combat, scale);

  // keep the radial menu glued to the active unit
  positionRadial();

  // keep animating while popups are on screen
  schedulePopupLoop();
}

function drawEffect(ctx, e, combat, scale) {
  const px0 = e.x * TILE_SIZE * scale, py0 = e.y * TILE_SIZE * scale;
  if (e.type === 'wall_of_fire' || e.type === 'stone_wall') {
    ctx.fillStyle = e.type === 'wall_of_fire' ? 'rgba(255,90,20,0.85)' : 'rgba(120,110,100,0.95)';
    ctx.fillRect(px0, py0, TILE_SIZE * scale, TILE_SIZE * scale);
    if (e.type === 'wall_of_fire') {
      ctx.fillStyle = 'rgba(255,200,60,0.9)';
      ctx.fillRect(px0 + 4 * scale, py0 + 2 * scale, TILE_SIZE * scale - 8 * scale, 4 * scale);
    }
    return;
  }
  if (e.type === 'fog' || e.type === 'darkness') {
    ctx.fillStyle = e.type === 'darkness' ? 'rgba(5,5,12,0.75)' : 'rgba(200,210,220,0.55)';
    const r = (e.r * 2 + 1) * TILE_SIZE * scale;
    ctx.beginPath();
    ctx.arc(px0 + TILE_SIZE * scale / 2, py0 + TILE_SIZE * scale / 2, r / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (e.type === 'web') {
    ctx.fillStyle = 'rgba(220,220,230,0.3)';
    const r = (e.r * 2 + 1) * TILE_SIZE * scale;
    ctx.beginPath();
    ctx.arc(px0 + TILE_SIZE * scale / 2, py0 + TILE_SIZE * scale / 2, r / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,240,250,0.5)';
    ctx.stroke();
    return;
  }
  if (e.type === 'spike_growth' || e.type === 'ice') {
    ctx.fillStyle = e.type === 'spike_growth' ? 'rgba(90,110,70,0.45)' : 'rgba(150,200,240,0.4)';
    const r = (e.r * 2 + 1) * TILE_SIZE * scale;
    ctx.beginPath();
    ctx.arc(px0 + TILE_SIZE * scale / 2, py0 + TILE_SIZE * scale / 2, r / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (e.type === 'grease') {
    ctx.fillStyle = 'rgba(170,160,90,0.4)';
    const r = (e.r * 2 + 1) * TILE_SIZE * scale;
    ctx.beginPath();
    ctx.arc(px0 + TILE_SIZE * scale / 2, py0 + TILE_SIZE * scale / 2, r / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (e.type === 'cloudkill') {
    ctx.fillStyle = 'rgba(90,140,60,0.55)';
    const r = (e.r * 2 + 1) * TILE_SIZE * scale;
    ctx.beginPath();
    ctx.arc(px0 + TILE_SIZE * scale / 2, py0 + TILE_SIZE * scale / 2, r / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (e.type === 'spirit_guardians') {
    ctx.strokeStyle = 'rgba(255,230,150,0.5)';
    const r = (e.r * 2 + 1) * TILE_SIZE * scale;
    ctx.beginPath();
    ctx.arc(px0 + TILE_SIZE * scale / 2, py0 + TILE_SIZE * scale / 2, r / 2, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  if (e.type === 'moonbeam') {
    ctx.fillStyle = 'rgba(230,240,255,0.4)';
    const r = (e.r * 2 + 1) * TILE_SIZE * scale;
    ctx.beginPath();
    ctx.arc(px0 + TILE_SIZE * scale / 2, py0 + TILE_SIZE * scale / 2, r / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (e.type === 'cloud_of_daggers') {
    ctx.fillStyle = 'rgba(200,200,210,0.5)';
    const r = (e.r * 2 + 1) * TILE_SIZE * scale;
    ctx.beginPath();
    ctx.arc(px0 + TILE_SIZE * scale / 2, py0 + TILE_SIZE * scale / 2, r / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (e.type === 'flaming_sphere') {
    ctx.fillStyle = 'rgba(255,120,30,0.8)';
    ctx.beginPath();
    ctx.arc(px0 + TILE_SIZE * scale / 2, py0 + TILE_SIZE * scale / 2, 6 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  if (e.type === 'smoke') {
    ctx.fillStyle = 'rgba(120,120,130,0.5)';
    const r = (e.r * 2 + 1) * TILE_SIZE * scale;
    ctx.beginPath();
    ctx.arc(px0 + TILE_SIZE * scale / 2, py0 + TILE_SIZE * scale / 2, r / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (e.type === 'entangle' || e.type === 'aura_of_vitality' || e.type === 'call_lightning' || e.type === 'sunbeam') {
    ctx.strokeStyle = e.type === 'aura_of_vitality' ? 'rgba(120,255,160,0.5)' : 'rgba(120,200,120,0.5)';
    const r = (e.r * 2 + 1) * TILE_SIZE * scale;
    ctx.beginPath();
    ctx.arc(px0 + TILE_SIZE * scale / 2, py0 + TILE_SIZE * scale / 2, r / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawEnemySight(ctx, combat, scale) {
  const u = currentPlayerUnit();
  if (!u || !Combat.isHiddenUnit(u)) return;
  const tilePx = TILE_SIZE * scale;
  const tiles = Combat.sightOverlayTiles(combat);
  const seen = new Set();
  for (const t of tiles) {
    const k = t.y * combat.w + t.x;
    seen.add(k);
    const dx = t.x * tilePx, dy = t.y * tilePx;
    ctx.fillStyle = 'rgba(210, 32, 24, 0.34)';
    ctx.fillRect(dx, dy, tilePx, tilePx);
    ctx.strokeStyle = 'rgba(255, 90, 70, 0.55)';
    ctx.lineWidth = Math.max(1, 1.25 * scale);
    ctx.strokeRect(dx + 0.5, dy + 0.5, tilePx - 1, tilePx - 1);
  }
  if (tiles.length) {
    ctx.save();
    ctx.beginPath();
    for (const t of tiles) ctx.rect(t.x * tilePx, t.y * tilePx, tilePx, tilePx);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 70, 50, 0.22)';
    ctx.lineWidth = 1;
    const step = Math.max(4, 5.5 * scale);
    const w = combat.w * tilePx, h = combat.h * tilePx;
    for (let i = -h; i < w + h; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Ring on the hider: green = unseen, amber = in a cone but still hidden
  // (Naturally Stealthy / Mask of the Wild), red = clearly seen.
  const inSight = seen.has(u.y * combat.w + u.x);
  const clearly = Combat.isClearlySeen(combat, u);
  ctx.lineWidth = 2.6 * scale;
  if (clearly) ctx.strokeStyle = 'rgba(255, 70, 50, 0.95)';
  else if (inSight) ctx.strokeStyle = 'rgba(255, 196, 60, 0.95)';
  else ctx.strokeStyle = 'rgba(80, 220, 120, 0.95)';
  ctx.strokeRect(u.x * tilePx + 2, u.y * tilePx + 2, tilePx - 4, tilePx - 4);
}

function tilesOnLine(x0, y0, x1, y1) {
  const tiles = [];
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

// Skill-shot line: shows the flight path of ranged attacks & ray spells.
function drawRayPreview(ctx, combat, u, aim, scale, range, opts = {}) {
  const tiles = tilesOnLine(u.x, u.y, aim.x, aim.y);
  const dist = Math.max(Math.abs(aim.x - u.x), Math.abs(aim.y - u.y));
  const inRange = dist <= range;
  let blocked = false;
  for (const t of tiles) {
    const tx = t.x * TILE_SIZE * scale, ty = t.y * TILE_SIZE * scale;
    const isLast = t.x === aim.x && t.y === aim.y;
    const occ = Combat.unitAtAny(combat, t.x, t.y);
    const gr = combat.grid[t.y] && combat.grid[t.y][t.x];
    const wall = gr && gr.obstacle && ['wall'].includes(gr.obstacle);
    const blocksShot = gr && gr.obstacle && obstacleBlocksProjectile(OBSTACLES[gr.obstacle]);
    const effectWall = combat.effects.some(e => e.type === 'stone_wall' && e.x === t.x && e.y === t.y);
    if (!blocked) {
      if (wall || blocksShot || effectWall) {
        blocked = true;
        ctx.fillStyle = 'rgba(255,60,60,0.30)';
      } else if (!inRange) {
        ctx.fillStyle = 'rgba(140,140,150,0.14)';
      } else {
        ctx.fillStyle = 'rgba(140,255,120,0.16)';
      }
      ctx.fillRect(tx, ty, TILE_SIZE * scale, TILE_SIZE * scale);
    }
    if (!isLast && occ && !blocked) {
      // a unit stands in the flight path — mark who'd take the hit by mistake
      ctx.strokeStyle = occ.team === 'player' ? 'rgba(255,220,80,0.9)' : 'rgba(255,80,60,0.9)';
      ctx.lineWidth = 2 * scale;
      ctx.strokeRect(tx + 2, ty + 2, TILE_SIZE * scale - 4, TILE_SIZE * scale - 4);
    }
  }
  // reticle at the cursor
  const rx = aim.x * TILE_SIZE * scale, ry = aim.y * TILE_SIZE * scale;
  ctx.strokeStyle = inRange && !blocked ? 'rgba(140,255,120,0.9)' : 'rgba(255,60,60,0.9)';
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.arc(rx + TILE_SIZE * scale / 2, ry + TILE_SIZE * scale / 2, 7 * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rx + TILE_SIZE * scale / 2 - 9 * scale, ry + TILE_SIZE * scale / 2);
  ctx.lineTo(rx + TILE_SIZE * scale / 2 + 9 * scale, ry + TILE_SIZE * scale / 2);
  ctx.moveTo(rx + TILE_SIZE * scale / 2, ry + TILE_SIZE * scale / 2 - 9 * scale);
  ctx.lineTo(rx + TILE_SIZE * scale / 2, ry + TILE_SIZE * scale / 2 + 9 * scale);
  ctx.stroke();
}

function drawAimOverlay(ctx, combat, scale) {
  if (!CS.pending) return;
  const u = currentPlayerUnit();
  if (!u) return;
  const hov = CS.hover;
  if (!hov) return;

  // skill-shot line for ranged attacks (bows etc.)
  if (CS.mode === 'attack' && !u.wildShaped) {
    const w = u.char.weapon ? u.char.weapon.base : 'fists';
    const range = attackRange(u, w);
    if (range > 1) {
      drawRayPreview(ctx, combat, u, hov, scale, range);
    }
  }

  if (CS.mode === 'recast_hex') {
    for (const e of combat.units) {
      if (e.team !== 'enemy' || e.dead) continue;
      const d = Math.max(Math.abs(e.x - u.x), Math.abs(e.y - u.y));
      if (d <= 9) {
        ctx.strokeStyle = 'rgba(200,120,255,0.8)';
        ctx.lineWidth = 2 * scale;
        ctx.strokeRect(e.x * TILE_SIZE * scale + 2, e.y * TILE_SIZE * scale + 2, TILE_SIZE * scale - 4, TILE_SIZE * scale - 4);
      }
    }
  }
  // Recast Moonbeam: same AoE circle the first cast uses, plus a tile fill
  // so you can see who the relocated beam will cover.
  if (CS.mode === 'recast_moonbeam') {
    const beam = combat.effects.find(e => e.type === 'moonbeam' && e.source === u.id);
    const origin = beam || { x: u.x, y: u.y };
    const moveLimit = Actions.MOONBEAM_MOVE_TILES || 12;
    const aoeR = (beam && beam.r !== undefined) ? beam.r : ((SPELL_MAP.moonbeam && SPELL_MAP.moonbeam.aoeRadius) || 1);
    const dist = Math.max(Math.abs(hov.x - origin.x), Math.abs(hov.y - origin.y));
    const inRange = dist <= moveLimit;
    ctx.fillStyle = inRange ? 'rgba(140,120,255,0.22)' : 'rgba(255,60,60,0.18)';
    for (let dy = -aoeR; dy <= aoeR; dy++) {
      for (let dx = -aoeR; dx <= aoeR; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) > aoeR) continue;
        const tx = hov.x + dx, ty = hov.y + dy;
        if (!Combat.inBounds(combat, tx, ty)) continue;
        ctx.fillRect(tx * TILE_SIZE * scale, ty * TILE_SIZE * scale, TILE_SIZE * scale, TILE_SIZE * scale);
      }
    }
    ctx.strokeStyle = inRange ? 'rgba(140,120,255,0.8)' : 'rgba(255,60,60,0.8)';
    ctx.lineWidth = 2 * scale;
    const r = (aoeR * 2 + 1) * TILE_SIZE * scale;
    ctx.beginPath();
    ctx.arc((hov.x + 0.5) * TILE_SIZE * scale, (hov.y + 0.5) * TILE_SIZE * scale, r / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (CS.mode === 'attack' || CS.mode === 'ability_target') {
    for (const e of combat.units) {
      if (e.team !== 'enemy' || e.dead || e.overboard) continue;
      const dist = Math.max(Math.abs(e.x - u.x), Math.abs(e.y - u.y));
      const w = u.char.weapon ? u.char.weapon.base : 'fists';
      const range = attackRange(u, w);
      if (dist <= range) {
        ctx.strokeStyle = 'rgba(255,80,60,0.8)';
        ctx.lineWidth = 2 * scale;
        ctx.strokeRect(e.x * TILE_SIZE * scale + 2, e.y * TILE_SIZE * scale + 2, TILE_SIZE * scale - 4, TILE_SIZE * scale - 4);
      }
    }
    if (CS.mode === 'attack') {
      const w = u.char.weapon ? u.char.weapon.base : 'fists';
      const range = attackRange(u, w);
      if (range > 1) {
        for (let y = 0; y < combat.h; y++) for (let x = 0; x < combat.w; x++) {
          const t = combat.grid[y][x];
          if (!t || !t.maxHp) continue;
          const dist = Math.max(Math.abs(x - u.x), Math.abs(y - u.y));
          if (dist > range || dist === 0) continue;
          ctx.strokeStyle = 'rgba(201,162,39,0.75)';
          ctx.lineWidth = 1.5 * scale;
          ctx.strokeRect(x * TILE_SIZE * scale + 3, y * TILE_SIZE * scale + 3, TILE_SIZE * scale - 6, TILE_SIZE * scale - 6);
        }
      }
    }
  } else if (CS.mode === 'ally') {
    for (const p of combat.units) {
      if (p.team !== 'player' || p.dead) continue;
      ctx.strokeStyle = 'rgba(80,255,140,0.8)';
      ctx.lineWidth = 2 * scale;
      ctx.strokeRect(p.x * TILE_SIZE * scale + 2, p.y * TILE_SIZE * scale + 2, TILE_SIZE * scale - 4, TILE_SIZE * scale - 4);
    }
  } else if (CS.mode === 'spell') {
    const sp = SPELL_MAP[CS.pending.spellId];
    const dist = Math.max(Math.abs(hov.x - u.x), Math.abs(hov.y - u.y));
    const inRange = sp.mode === 'self' || dist <= sp.range;
    ctx.strokeStyle = inRange ? 'rgba(140,120,255,0.8)' : 'rgba(255,60,60,0.8)';
    ctx.lineWidth = 2 * scale;
    // teleport spells: highlight every legal destination tile in range
    if (sp.fx === 'misty_step' || sp.fx === 'dimension_door' || sp.fx === 'thunder_step') {
      const R = sp.range;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > R) continue;
          const tx2 = u.x + dx, ty2 = u.y + dy;
          if (!Combat.inBounds(combat, tx2, ty2)) continue;
          if (!Combat.isPassable(combat, tx2, ty2)) continue;
          if (Combat.unitAtAny(combat, tx2, ty2)) continue;
          ctx.fillStyle = 'rgba(138,208,255,0.20)';
          ctx.fillRect(tx2 * TILE_SIZE * scale, ty2 * TILE_SIZE * scale, TILE_SIZE * scale, TILE_SIZE * scale);
        }
      }
    }
    // ray spells (fire bolt, chromatic orb, scorching ray, guiding bolt…) show
    // their flight path, obstacles and any unit they'd cross
    if (sp.mode === 'ranged' || sp.mode === 'aoe') {
      drawRayPreview(ctx, combat, u, hov, scale, spellRangeFor(u.char, sp), { spell: sp });
    }
    if (sp.mode === 'aoe') {
      const r = (sp.aoeRadius * 2 + 1) * TILE_SIZE * scale;
      ctx.beginPath();
      ctx.arc((hov.x + 0.5) * TILE_SIZE * scale, (hov.y + 0.5) * TILE_SIZE * scale, r / 2, 0, Math.PI * 2);
      ctx.stroke();
    } else if (sp.mode === 'cone') {
      drawConePreview(ctx, u, hov, sp.coneSize, scale, inRange);
    } else if (sp.mode === 'line') {
      drawLinePreview(ctx, u, hov, sp.lineLen, scale, inRange);
    } else {
      ctx.strokeRect(hov.x * TILE_SIZE * scale + 2, hov.y * TILE_SIZE * scale + 2, TILE_SIZE * scale - 4, TILE_SIZE * scale - 4);
    }
  } else if (CS.mode === 'ability_cone') {
    drawConePreview(ctx, u, hov, 3, scale, true);
  }
}

function drawConePreview(ctx, u, aim, size, scale, ok) {
  const dx = Math.sign(aim.x - u.x) || (u.team === 'player' ? 1 : -1);
  const dy = Math.sign(aim.y - u.y);
  ctx.fillStyle = ok ? 'rgba(140,120,255,0.25)' : 'rgba(255,60,60,0.25)';
  ctx.strokeStyle = ok ? 'rgba(140,120,255,0.7)' : 'rgba(255,60,60,0.7)';
  for (let i = 1; i <= size; i++) {
    const x = u.x + dx * i, y = u.y + dy * i;
    ctx.fillRect(x * TILE_SIZE * scale, y * TILE_SIZE * scale, TILE_SIZE * scale, TILE_SIZE * scale);
    const width = Math.min(i, Math.floor(size / 2));
    for (let w = 1; w <= width; w++) {
      if (dx !== 0) {
        ctx.fillRect(x * TILE_SIZE * scale, (y + w) * TILE_SIZE * scale, TILE_SIZE * scale, TILE_SIZE * scale);
        ctx.fillRect(x * TILE_SIZE * scale, (y - w) * TILE_SIZE * scale, TILE_SIZE * scale, TILE_SIZE * scale);
      } else {
        ctx.fillRect((x + w) * TILE_SIZE * scale, y * TILE_SIZE * scale, TILE_SIZE * scale, TILE_SIZE * scale);
        ctx.fillRect((x - w) * TILE_SIZE * scale, y * TILE_SIZE * scale, TILE_SIZE * scale, TILE_SIZE * scale);
      }
    }
  }
}

function drawLinePreview(ctx, u, aim, len, scale, ok) {
  const dx = Math.sign(aim.x - u.x) || 1;
  const dy = Math.sign(aim.y - u.y);
  ctx.fillStyle = ok ? 'rgba(140,120,255,0.25)' : 'rgba(255,60,60,0.25)';
  for (let i = 1; i <= len; i++) {
    const x = u.x + dx * i, y = u.y + dy * i;
    if (!Combat.inBounds(G.combat, x, y)) break;
    ctx.fillRect(x * TILE_SIZE * scale, y * TILE_SIZE * scale, TILE_SIZE * scale, TILE_SIZE * scale);
  }
}

function drawHoverInfo(ctx, combat, scale) {
  if (!CS.hover) return;
  const { x, y } = CS.hover;
  if (!Combat.inBounds(combat, x, y)) return;
  const t = combat.grid[y][x];
  if (!t) return;
  const u = Combat.unitAt(combat, x, y);
  if (u) {
    const lines = [];
    const char = u.char;
    lines.push(`${u.name}${char.hero ? ' 👑' : ''}`);
    if (char.stats) {
      lines.push(`${char.name} · AC ${u.char.ac + (u.char.acBonus || 0)} · HP ${u.hp}/${u.maxHp}`);
    } else {
      lines.push(`Lv${char.level} ${char.cls.name} · AC ${Combat.unitAc(u, combat)} · HP ${u.hp}/${u.maxHp}`);
    }
    if (u.statuses.length) lines.push(u.statuses.map(s => s.name).join(', '));
    drawTooltip(ctx, lines, x, y, combat, scale);
    return;
  }
  const parts = [];
  if (t.obstacle && t.obstacle !== 'wall') parts.push(`${titleCase(t.obstacle.replace(/_/g, ' '))}`);
  if (t.maxHp) parts.push(`HP ${t.hp}/${t.maxHp}`);
  if (t.elevation > 0) parts.push(`High ground +${t.elevation}`);
  if (t.hazard) parts.push(titleCase(t.hazard));
  if (parts.length) drawTooltip(ctx, parts, x, y, combat, scale);
}

function drawTooltip(ctx, lines, x, y, combat, scale) {
  ctx.font = `${Math.round(9 * scale)}px sans-serif`;
  let w = 0;
  for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
  w += 8 * scale;
  const h = lines.length * 10 * scale + 4 * scale;
  let tx = x * TILE_SIZE * scale + TILE_SIZE * scale / 2;
  let ty = y * TILE_SIZE * scale - h - 4 * scale;
  if (tx + w > combat.w * TILE_SIZE * scale) tx -= w;
  if (ty < 0) ty = (y + 1) * TILE_SIZE * scale + 2;
  ctx.fillStyle = 'rgba(10,10,18,0.92)';
  ctx.fillRect(tx, ty, w, h);
  ctx.strokeStyle = '#c9a227';
  ctx.strokeRect(tx, ty, w, h);
  ctx.fillStyle = '#e8e0c8';
  lines.forEach((l, i) => ctx.fillText(l, tx + 4 * scale, ty + (i + 1) * 10 * scale - 1));
}

function attackRange(u, weaponId) {
  const w = WEAPONS[weaponId] || { range: 'melee', properties: [] };
  if (w.range.startsWith('ranged(')) return parseInt(w.range.replace('ranged(', ''));
  if (w.properties.some(p => p.startsWith('thrown'))) return parseInt(w.properties.find(p => p.startsWith('thrown')).split('(')[1]);
  return w.properties.includes('reach') ? 2 : 1;
}

// ============================== INSPECTION MODAL (long-press) ==============================
function sheetRow(label, value) {
  return div('sheet-row', h('span', 'sheet-k', label), h('span', 'sheet-v', value));
}
function sheetLine(text) { return h('div', 'sheet-line', text); }

// Generic drill-down modal for sheet entries (features, statuses, abilities…)
function openInfoModal(title, subtitle, lines) {
  document.querySelectorAll('.info-modal').forEach(o => o.remove());
  const overlay = div('overlay info-modal');
  const panel = div('overlay-panel info-panel');
  panel.appendChild(h('h3', 'accent', title));
  if (subtitle) panel.appendChild(h('div', 'muted', subtitle));
  const rows = div('sheet-rows');
  for (const l of lines) rows.appendChild(sheetLine(l));
  panel.appendChild(rows);
  panel.appendChild(div('row-center', btn('Close', () => overlay.remove())));
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

function infoChip(text, cls, onClick) {
  const ch = h('span', cls || 'chip info');
  ch.textContent = text;
  if (onClick) ch.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return ch;
}

function clickableSheetRow(label, value, onClick) {
  const row = sheetRow(label, value);
  row.classList.add('sheet-clickable');
  row.addEventListener('click', onClick);
  return row;
}

function openAbilityInfo(ab, char) {
  const m = mod(char.abilities[ab]);
  openInfoModal(`${ABILITY_FULL[ab]} (${ab})`,
    `${ab} ${char.abilities[ab]} · modifier ${m >= 0 ? '+' : ''}${m}`,
    [ABILITY_DESCRIPTIONS[ab] || 'One of the six ability scores.']);
}
function openSkillInfo(skill, char) {
  openInfoModal(skill, `${skill} +${skillMod(char, skill)} · governed by ${SKILL_ABILITY[skill] || '—'}`,
    [SKILL_DESCRIPTIONS[skill] || 'A trained skill check.', char.skills.includes(skill) ? 'You are proficient (+' + char.prof + ').' : 'Not proficient.']);
}
function openSaveInfo(ab, char) {
  openInfoModal(`${ABILITY_FULL[ab]} Saving Throw`,
    `${ab} ${savingThrowMod(char, ab) >= 0 ? '+' : ''}${savingThrowMod(char, ab)}${char.cls.saves.includes(ab) ? ' · proficient' : ''}`,
    [ABILITY_DESCRIPTIONS[ab] || 'One of the six saving throws.']);
}
function openFeatureInfo(name) {
  const desc = featureDescription(name);
  openInfoModal(name, desc ? 'Class feature / path' : 'Class feature',
    [desc || 'A class feature from your level progression.']);
}
function openStatusInfo(status, isBuff) {
  const id = status.id || status;
  const desc = STATUS_DESCRIPTIONS[id];
  const title = status.name || titleCase(String(id).replace(/_/g, ' '));
  const lines = [desc || 'An ongoing effect from a spell, ability or attack.'];
  if (status.rounds !== undefined && status.rounds < 999) lines.push(`Remaining: ${status.rounds} round${status.rounds === 1 ? '' : 's'}.`);
  openInfoModal(title, isBuff ? 'Buff' : 'Condition', lines);
}

function buildUnitSheet(unit) {
  const combat = G.combat;
  const c = unit.char;
  const isMonster = !!c.stats;
  const wrap = div('sheet-section');

  // ---- identity ----
  const ident = div('sheet-rows');
  if (isMonster) {
    ident.appendChild(sheetRow('Creature', `${c.name}${unit.dead ? ' 💀' : ''}${c.boss ? ' ☠ Boss' : ''}${c.eliteTrait ? ` · ${c.eliteTrait.name}` : ''}`));
    ident.appendChild(sheetRow('Type', `${titleCase(c.size)} ${titleCase(c.type)} · CR ${c.cr}`));
    if (unit.dead) ident.appendChild(sheetRow('Status', `Slain on round ${unit.deathRound ?? '—'}`));
  } else if (unit.wildShaped && unit.form) {
    const form = unit.form;
    ident.appendChild(sheetRow('Identity', `${c.name}${c.hero ? ' 👑' : ''} — ${c.cls.name} (Wild Shaped: ${form.name})`));
    ident.appendChild(sheetRow('Form Vitals', `Form HP ${form.hp}/${WILD_SHAPES[form.id].hp} · Form AC ${form.ac} · Speed ${form.speed} tiles · ${c.name}'s HP ${unit.hp}/${unit.maxHp}`));
    ident.appendChild(sheetRow('Note', 'While shaped: no spells, no items — only beast attacks, movement and Revert Form.'));
  } else if (c.transformed && c.transformed.type === 'mind_flayer') {
    const sub = c.cls.subclasses[c.subclassId]?.name || '';
    ident.appendChild(sheetRow('Identity', `${c.name}${c.hero ? ' 👑' : ''} — ${c.race.name} ${c.cls.name}${sub ? ' · ' + sub : ''}`));
    ident.appendChild(sheetRow('Status', `🧠 Transformed: Mind Flayer · INT ${c.abilities.INT}`));
    ident.appendChild(sheetRow('Level', `${c.cls.name} ${c.classLevel || c.level}${c.secondClass ? ' / ' + CLASS_MAP[c.secondClass.classId].name + ' ' + c.secondClass.level : ''} · Total Lv${c.level} · ${c.personality || ''}`));
  } else {
    const sub = c.cls.subclasses[c.subclassId]?.name || '';
    ident.appendChild(sheetRow('Identity', `${c.name}${c.hero ? ' 👑 The Hero' : ''} — ${c.race.name} ${c.cls.name}${sub ? ' · ' + sub : ''}`));
    ident.appendChild(sheetRow('Level', `${c.cls.name} ${c.classLevel || c.level}${c.secondClass ? ' / ' + CLASS_MAP[c.secondClass.classId].name + ' ' + c.secondClass.level : ''} · Total Lv${c.level} · ${c.personality || ''}`));
    if (unit.dead) ident.appendChild(sheetRow('Status', `Fell on round ${unit.deathRound ?? '—'} 💀`));
  }
  const baseAc = unit.wildShaped && unit.form
    ? unit.form.ac
    : isMonster
    ? (c.ac + (c.acBonus || 0) + ((c.powers || []).includes('parry') ? 2 : 0))
    : computeAc(c, combat);
  ident.appendChild(sheetRow('Vitals', `HP ${unit.hp}/${unit.maxHp}${unit.tempHp ? ` (+${unit.tempHp} temp)` : ''} · AC ${baseAc} · Speed ${computeSpeed(c)} tiles${unit.wildShaped ? ' · 🐻 Wild Shaped' : ''}`));
  wrap.appendChild(ident);

  // ---- abilities (click for details) ----
  wrap.appendChild(h('h4', '', 'Ability Scores'));
  const abGrid = div('sheet-abilities');
  const abs = isMonster ? Object.entries(c.stats) : ABILITIES.map(a => [a, c.abilities[a]]);
  for (const [ab, score] of abs) {
    const m = mod(score);
    const card = div('sheet-ab clickable');
    card.appendChild(h('span', 'sheet-abk', ab));
    card.appendChild(h('span', 'sheet-abv', `${score} (${m >= 0 ? '+' : ''}${m})`));
    card.addEventListener('click', () => openAbilityInfo(ab, c));
    abGrid.appendChild(card);
  }
  wrap.appendChild(abGrid);

  // ---- attacks ----
  wrap.appendChild(h('h4', '', 'Attacks'));
  const atkRows = div('sheet-rows');
  if (isMonster) {
    for (const a of (c.attacks || [])) {
      const rngTxt = typeof a.range === 'number' ? `${a.range} tiles` : 'melee';
      const label = a.name;
      const val = `+${(a.toHit || 0) + (c.toHitBonus || 0)} to hit · ${a.dmg}${a.dmgTypes ? ' + ' + a.dmgTypes.join(' + ') : ''} ${a.dmgType || ''} · ${rngTxt}${a.fx ? ' · on hit: ' + titleCase(a.fx) : ''}`;
      atkRows.appendChild(clickableSheetRow(label, val, () => openInfoModal(label, 'Attack', [
        `Attack bonus: +${(a.toHit || 0) + (c.toHitBonus || 0)} (d20 + bonus vs the target's AC).`,
        `Damage: ${a.dmg}${a.dmgTypes ? ' + ' + a.dmgTypes.join(' + ') : ''} ${a.dmgType || ''}.`,
        `Range: ${rngTxt}.`,
        a.fx ? `On hit: ${titleCase(a.fx)}.` : null,
      ].filter(Boolean))));
    }
  } else if (unit.wildShaped && unit.form) {
    for (const a of unit.form.attacks) {
      const label = a.name;
      const val = `+${a.toHit} to hit · ${a.dmg} ${a.dmgType} · melee${a.fx ? ' · on hit: special' : ''}`;
      atkRows.appendChild(clickableSheetRow(label, val, () => openInfoModal(label, 'Beast form attack', [
        `Attack bonus: +${a.toHit} (d20 + bonus vs the target's AC).`,
        `Damage: ${a.dmg} ${a.dmgType}.`,
        a.fx ? 'Has a special on-hit effect.' : null,
      ].filter(Boolean))));
    }
  } else if (c.transformed && c.transformed.type === 'mind_flayer') {
    atkRows.appendChild(clickableSheetRow('Tentacles', '+7 to hit · 2d10+4 psychic · melee · grapples', () => openInfoModal('Tentacles', 'Mind Flayer attack', ['Attack bonus +7 vs AC, 2d10+4 psychic damage, and the target is grappled.'])));
    atkRows.appendChild(clickableSheetRow('Mind Blast', 'Cone 3 · INT save DC ' + (8 + c.prof + Math.max(mod(c.abilities.INT), 4)) + ' · 4d8 psychic + stun', () => openInfoModal('Mind Blast', 'Mind Flayer attack', ['A 3-tile cone: INT save or 4d8 psychic damage and stunned for a round (half damage on a success).'])));
  } else {
    const wId = c.weapon?.base || 'fists';
    const w = WEAPONS[wId] || { name: 'Unarmed Strike', dmg: '1', dmgType: 'bludgeoning', properties: [], range: 'melee' };
    let rngTxt = 'melee';
    if (w.range?.startsWith('ranged(')) rngTxt = `${parseInt(w.range)} tiles`;
    else if (w.properties?.some(p => p.startsWith('thrown'))) rngTxt = `thrown ${w.properties.find(p => p.startsWith('thrown')).split('(')[1].replace(')', '')} tiles`;
    else if (w.properties?.includes('reach')) rngTxt = 'melee (reach)';
    const wdef = WEAPONS[wId];
    const plus = wdef && wdef.legendary ? `+${wdef.bonus}` : '';
    const wLabel = `${c.weapon?.enchant?.name ? c.weapon.enchant.name + ' ' : ''}${w.name}${plus ? ' ' + plus : ''}`;
    const wVal = `+${attackBonusFor(c, wId, combat)} to hit · ${w.dmg} ${w.dmgType}${wdef && wdef.extraDmg ? ` + ${wdef.extraDmg} ${wdef.extraType}` : ''} · ${rngTxt}${w.properties?.length ? ' · ' + w.properties.join(', ') : ''}`;
    atkRows.appendChild(clickableSheetRow(wLabel, wVal, () => openInfoModal(wLabel, 'Weapon attack', [
      `Attack bonus: +${attackBonusFor(c, wId, combat)} (d20 + bonus vs the target's AC; critical on a natural 20).`,
      `Damage: ${w.dmg} + ${mod(c.abilities[weaponStatFor(c, wId)]) >= 0 ? '+' : ''}${mod(c.abilities[weaponStatFor(c, wId)])} ${w.dmgType}${wdef && wdef.extraDmg ? ` + ${wdef.extraDmg} ${wdef.extraType}` : ''}.`,
      `Range: ${rngTxt}.`,
      w.properties?.length ? `Properties: ${w.properties.join(', ')}.` : null,
      c.weapon?.enchant?.name ? `Enchantment: ${c.weapon.enchant.name} — ${c.weapon.enchant.desc}` : null,
    ].filter(Boolean))));
    if (c.cls.spellAbility) atkRows.appendChild(clickableSheetRow('Spellcasting', `Save DC ${c.spellSaveDC} · Attack +${c.spellAttack}`, () => openInfoModal('Spellcasting', `${c.cls.name} (${c.cls.spellAbility} caster)`, [
      `Spell save DC ${c.spellSaveDC} = 8 + proficiency (${c.prof}) + ${c.cls.spellAbility} modifier (${mod(c.abilities[c.cls.spellAbility]) >= 0 ? '+' : ''}${mod(c.abilities[c.cls.spellAbility])}).`,
      `Spell attack +${c.spellAttack} = proficiency + ${c.cls.spellAbility} modifier.`,
      'Enemies must roll a d20 + their save modifier against your DC to resist your spells.',
    ])));
  }
  wrap.appendChild(atkRows);

  // ---- defenses / traits ----
  if (isMonster) {
    const defs = [];
    if (c.resist?.length) defs.push(`Resist: ${c.resist.join(', ')}`);
    if (c.immunities?.length) defs.push(`Immune: ${c.immunities.join(', ')}`);
    if (c.vuln?.length) defs.push(`Vulnerable: ${c.vuln.join(', ')}`);
    if (c.darkvision) defs.push('Darkvision');
    if (c.fly) defs.push('Flying');
    if (c.powers?.length) defs.push(`Powers: ${c.powers.map(p => titleCase(p)).join(', ')}`);
    if (c.eliteTrait) defs.push(`Elite: ${c.eliteTrait.name} — ${c.eliteTrait.text}`);
    if (defs.length) {
      wrap.appendChild(h('h4', '', 'Traits (click for details)'));
      const rows = div('sheet-rows');
      for (const d of defs) {
        let title = d, lines = ['A creature trait.'];
        if (d.startsWith('Resist: ')) { const t = d.slice(8); title = 'Resistance'; lines = [`Resists ${t} — takes half damage from it.`]; }
        else if (d.startsWith('Immune: ')) { const t = d.slice(8); title = 'Immunity'; lines = [`Immune to ${t} — takes no damage from it.`]; }
        else if (d.startsWith('Vulnerable: ')) { const t = d.slice(12); title = 'Vulnerability'; lines = [`Vulnerable to ${t} — takes double damage from it.`]; }
        else if (d === 'Darkvision') lines = ['Sees perfectly in darkness within its vision range.'];
        else if (d === 'Flying') lines = ['A flying creature — it moves above the ground.'];
        else if (d.startsWith('Powers: ')) { title = 'Powers'; lines = [`Special abilities: ${d.slice(8)}.`]; }
        else if (d.startsWith('Elite: ')) { title = 'Elite trait'; lines = [d.slice(7)]; }
        rows.appendChild(clickableSheetRow(title, d.length > 40 ? d.slice(0, 40) + '…' : d, () => openInfoModal(title, c.name, lines)));
      }
      wrap.appendChild(rows);
    }
  } else {
    // saves (click for details)
    wrap.appendChild(h('h4', '', 'Saving Throws'));
    const saveChips = div('status-chips');
    for (const a of ABILITIES) {
      const m = savingThrowMod(c, a);
      saveChips.appendChild(infoChip(`${a} ${m >= 0 ? '+' : ''}${m}${c.cls.saves.includes(a) ? '*' : ''}`, 'chip info', () => openSaveInfo(a, c)));
    }
    wrap.appendChild(saveChips);
    // skills (click for details)
    if (c.skills?.length) {
      wrap.appendChild(h('h4', '', 'Skills'));
      const skillChips = div('status-chips');
      for (const sk of c.skills) {
        skillChips.appendChild(infoChip(`${sk} +${skillMod(c, sk)}`, 'chip info', () => openSkillInfo(sk, c)));
      }
      wrap.appendChild(skillChips);
    }
    // spells
    const cantrips = listCantripsKnown(c);
    const leveled = listLeveledSpellsKnown(c);
    if (unit.wildShaped) {
      wrap.appendChild(h('h4', '', 'Spells'));
      wrap.appendChild(sheetLine('🚫 Unavailable while wild shaped.'));
    } else if (cantrips.length || leveled.length) {
      wrap.appendChild(h('h4', '', 'Spells (click for the full entry)'));
      const spChips = div('status-chips');
      if (cantrips.length) {
        spChips.appendChild(h('span', 'muted', 'Cantrips:'));
        for (const id of cantrips) {
          const sp = SPELL_MAP[id];
          if (!sp) continue;
          spChips.appendChild(infoChip(sp.name, 'chip spell', () => showSpellDetail(sp, c, null)));
        }
      }
      if (leveled.length) {
        spChips.appendChild(h('span', 'muted', 'Leveled:'));
        const mark = id => c.preparedSpells && SPELL_MAP[id]?.level > 0 && !c.preparedSpells.includes(id) ? ' *' : '';
        for (const id of leveled) {
          const sp = SPELL_MAP[id];
          if (!sp) continue;
          spChips.appendChild(infoChip(`${sp.name}${mark(id)} (${ordinal(sp.level)})`, 'chip spell', () => showSpellDetail(sp, c, null)));
        }
      }
      wrap.appendChild(spChips);
      if (c.preparedSpells) wrap.appendChild(sheetLine(`* = not prepared (${c.preparedSpells.length}/${Math.max(1, c.level + mod(c.abilities[c.cls.spellAbility]))} prepared)`));
    }
    // features (click for descriptions)
    if (c.features?.length) {
      wrap.appendChild(h('h4', '', 'Class Features (click for details)'));
      const featChips = div('status-chips');
      for (const f of c.features) {
        featChips.appendChild(infoChip(f, 'chip feature', () => openFeatureInfo(f)));
      }
      wrap.appendChild(featChips);
    }
    if (c.feats?.length) {
      wrap.appendChild(h('h4', '', 'Feats (click for details)'));
      const featChips2 = div('status-chips');
      for (const fid of c.feats) {
        const feat = FEAT_MAP[fid];
        const choice = c.featChoices && c.featChoices[fid];
        featChips2.appendChild(infoChip(feat ? feat.name : fid, 'chip feature', () => openInfoModal(feat ? feat.name : fid, 'Feat', [
          feat ? feat.desc : 'A feat.',
          choice ? `Choice: ${Array.isArray(choice) ? choice.join(', ') : titleCase(choice)}.` : null,
        ].filter(Boolean))));
      }
      wrap.appendChild(featChips2);
    }
    if (c.race?.features?.length) {
      wrap.appendChild(h('h4', '', 'Racial Traits (click for details)'));
      const raceChips = div('status-chips');
      for (const rf of c.race.features) {
        raceChips.appendChild(infoChip(rf.name, 'chip feature', () => openInfoModal(rf.name, `${c.race.name} trait`, [rf.text || 'A racial trait.'])));
      }
      wrap.appendChild(raceChips);
    }
    // equipment
    const arm = ARMORS[c.armor];
    const eq = [
      `Armor: ${arm?.name || 'None'}${c.shield ? ' + Shield' : ''}`,
      `Weapon: ${c.weapon?.enchant?.name ? c.weapon.enchant.name + ' ' : ''}${WEAPONS[c.weapon?.base]?.name || c.weapon?.base || '—'}`,
      c.trinkets?.length ? `Trinkets: ${c.trinkets.map(t => t.name).join(', ')}` : null,
      `Pack: ${c.inventory?.length || 0} items`,
    ].filter(Boolean);
    wrap.appendChild(h('h4', '', 'Equipment'));
    wrap.appendChild(sheetLine(eq.join(' · ')));
  }

  // ---- conditions (click for descriptions) ----
  if (unit.statuses?.length || c.buffs?.length) {
    wrap.appendChild(h('h4', '', 'Conditions (click for details)'));
    const chips = div('status-chips');
    for (const st of unit.statuses) chips.appendChild(infoChip(`${st.name}${st.rounds !== undefined ? ` (${st.rounds})` : ''}`, 'chip', () => openStatusInfo(st, false)));
    for (const b of c.buffs || []) chips.appendChild(infoChip(`${b.name}${b.rounds && b.rounds < 999 ? ` (${b.rounds})` : ''}`, 'chip buff', () => openStatusInfo(b, true)));
    wrap.appendChild(chips);
  }
  wrap.appendChild(h('div', 'muted', 'Click any entry above — spells, features, conditions, abilities — for a detailed view.'));
  return wrap;
}

const HAZARD_INFO = {
  fire: 'Fire — creatures standing here take 1d4 fire damage each round, and moving through costs +1 movement.',
  lava: 'Lava — 2d10 fire damage per round. Impassable.',
  water: 'Deep water — impassable. Creatures shoved in are thrown overboard for 3 rounds.',
  brambles: 'Brambles — 1 piercing damage when moving through; +1 movement cost.',
  grease: 'Grease — DEX save or fall prone when moving through.',
};

const EFFECT_INFO = {
  wall_of_fire: 'Wall of Fire — 5d8 fire to creatures within 1 tile each round.',
  stone_wall: 'Wall of Stone — full cover; 36 HP per segment.',
  web: 'Web — DEX save or restrained.',
  fog: 'Fog — heavily obscured; attacks through it have disadvantage.',
  darkness: 'Magical Darkness — blocks sight through the area.',
  grease: 'Grease (spell) — DEX save or prone.',
  spike_growth: 'Spike Growth — 2d4 piercing per tile moved inside.',
  cloudkill: 'Cloudkill — 5d8 poison per round inside.',
  moonbeam: 'Moonbeam — 2d10 radiant per round inside.',
  cloud_of_daggers: 'Cloud of Daggers — 4d4 slashing per round inside.',
  spirit_guardians: 'Spirit Guardians — 3d8 radiant to enemies inside each round.',
  ice: 'Ice Storm aftermath — difficult terrain.',
  entangle: 'Entangle — STR save or restrained.',
  smoke: 'Smoke — attacks through it have disadvantage.',
  call_lightning: 'Call Lightning — bolts may strike here each round.',
  flaming_sphere: 'Flaming Sphere — rammed creatures take 2d6 fire.',
  aura_of_vitality: 'Aura of Vitality — a healing aura.',
  sunbeam: 'Sunbeam — a radiant line may fire each round.',
};

function buildTileSheet(tile, tx, ty) {
  const combat = G.combat;
  const wrap = div('sheet-section');
  wrap.appendChild(h('h4', '', `🗺 Tile (${tx}, ${ty}) — ${combat.loc.icon} ${combat.loc.name}`));
  const rows = div('sheet-rows');
  if (!tile.discovered && !combat.revealed) {
    rows.appendChild(sheetLine('Unexplored...'));
    wrap.appendChild(rows);
    return wrap;
  }
  rows.appendChild(sheetRow('Terrain', tile.elevation > 0 ? 'High ground' : (tile.hazard ? 'Hazardous ground' : 'Open ground')));
  if (tile.elevation > 0) {
    rows.appendChild(sheetRow('Elevation', `+${tile.elevation} — +${tile.elevation} to attack rolls against lower ground; +2 AC vs ranged attackers below. Falling off is painful.`));
  }
  if (tile.obstacle) {
    const ob = OBSTACLES[tile.obstacle];
    if (ob) {
      const parts = [];
      if (ob.solid) parts.push('blocks movement');
      if (ob.tall) parts.push('blocks line of sight');
      if (ob.cover) parts.push(`low cover: +${ob.cover} AC vs ranged`);
      if (obstacleBlocksProjectile(ob)) parts.push('blocks projectiles');
      else parts.push('projectiles fly over');
      if (ob.difficult) parts.push('difficult terrain');
      rows.appendChild(sheetRow('Obstacle', `${ob.name}${parts.length ? ' — ' + parts.join(', ') : ''}`));
      if (tile.maxHp != null) rows.appendChild(sheetRow('Hit Points', `${tile.hp}/${tile.maxHp}`));
      else if (ob.hp) rows.appendChild(sheetRow('Hit Points', `${ob.hp} (undamaged)`));
      else if (ob.hp === null) rows.appendChild(sheetRow('Hit Points', 'Indestructible'));
      if (ob.material) rows.appendChild(sheetRow('Material', titleCase(ob.material)));
      if (ob.resist && ob.resist.length) rows.appendChild(sheetRow('Resistances', ob.resist.join(', ')));
      if (ob.vuln && ob.vuln.length) rows.appendChild(sheetRow('Vulnerabilities', ob.vuln.join(', ')));
      if (ob.immune && ob.immune.length) rows.appendChild(sheetRow('Immunities', ob.immune.join(', ')));
    }
  }
  if (tile.hazard && HAZARD_INFO[tile.hazard]) rows.appendChild(sheetRow('Hazard', HAZARD_INFO[tile.hazard]));
  if (combat.darkness) rows.appendChild(sheetRow('Darkness', 'This floor is dark — sight is limited unless you have darkvision.'));
  if (tile.smokeRounds > 0) rows.appendChild(sheetRow('Smoke', `Heavy smoke (${tile.smokeRounds} rounds) — attacks through it have disadvantage.`));
  for (const e of combat.effects || []) {
    let here = false;
    if (e.type === 'wall_of_fire' || e.type === 'stone_wall') here = e.x === tx && e.y === ty;
    else if (e.r !== undefined) here = Math.max(Math.abs(e.x - tx), Math.abs(e.y - ty)) <= e.r;
    if (here && EFFECT_INFO[e.type]) rows.appendChild(sheetRow('Spell effect', EFFECT_INFO[e.type]));
  }
  wrap.appendChild(rows);
  return wrap;
}

// ============================== EQUIPMENT MANAGEMENT UI ==============================
function gearLabel(item) {
  if (item.kind === 'weapon') return `⚔ ${item.name} · ${item.def.dmg} ${item.def.dmgType}`;
  if (item.kind === 'armor') return `🛡 ${item.name} · AC ${item.def.ac.base}${item.enchant && item.enchant.bonus ? ' +' + item.enchant.bonus : ''}`;
  return `💍 ${item.name}${item.desc ? ' · ' + item.desc : ''}`;
}

// Interactive equipped/unequipped gear list. mode 'camp' = free changes & trading;
// mode 'combat' = costs an action point (enforced by the engine).
function buildEquipmentUI(char, opts) {
  const wrap = div('sheet-section');
  wrap.appendChild(h('h4', '', 'Equipment'));
  const rows = div('sheet-rows');

  const equipped = [];
  if (char.weapon && char.weapon.base && char.weapon.base !== 'fists' && WEAPONS[char.weapon.base]) {
    equipped.push({ slot: 'weapon', label: gearLabel({ kind: 'weapon', name: (char.weapon.enchant ? char.weapon.enchant.name + ' ' : '') + WEAPONS[char.weapon.base].name, def: WEAPONS[char.weapon.base], enchant: char.weapon.enchant }) });
  }
  if (char.armor && char.armor !== 'none' && ARMORS[char.armor]) {
    equipped.push({ slot: 'armor', label: gearLabel({ kind: 'armor', name: (char.armorEnchant ? char.armorEnchant.name + ' ' : '') + ARMORS[char.armor].name, def: ARMORS[char.armor], enchant: char.armorEnchant }) });
  }
  if (char.shield) equipped.push({ slot: 'shield', label: '🛡 Shield · +2 AC' });
  (char.trinkets || []).forEach((t, i) => equipped.push({ slot: 'trinket', index: i, label: gearLabel({ kind: 'trinket', name: t.name, desc: t.desc, def: t }) }));

  for (const eq of equipped) {
    const row = div('gear-row');
    row.appendChild(h('span', 'gear-label', eq.label));
    if (eq.slot !== 'shield') row.appendChild(btn('Take off', () => opts.onUnequip(eq), 'subtle'));
    if (opts.mode === 'camp' && opts.onGive) row.appendChild(btn('Give to…', () => opts.onGive(eq), 'subtle'));
    rows.appendChild(row);
  }
  if (!equipped.length) rows.appendChild(h('div', 'muted', 'Nothing equipped.'));

  const bag = char.gearBag || [];
  if (bag.length) {
    wrap.appendChild(h('h4', '', 'Gear Pack'));
    for (const item of bag) {
      const row = div('gear-row');
      row.appendChild(h('span', 'gear-label', gearLabel(item)));
      row.appendChild(btn('Equip', () => opts.onEquip(item)));
      if (opts.mode === 'camp' && opts.onGive) row.appendChild(btn('Give to…', () => opts.onGive({ slot: 'bag', uid: item.uid }), 'subtle'));
      rows.appendChild(row);
    }
  }
  wrap.appendChild(rows);
  if (opts.mode === 'combat') wrap.appendChild(h('div', 'muted', 'Equipping or removing gear costs 1 action point.'));
  return wrap;
}

// Perform a gear change in combat and refresh the sheet + HUD + radial.
function doGearAction(unit, type, action) {
  performAction(G.combat, unit.id, { type, ...action });
  updateHud();
  closeRadial();
  openRadial('root');
  if (CS.inspectPos) showInspectModal(CS.inspectPos.x, CS.inspectPos.y);
}

// Campfire trade: pick which member receives the item.
function chooseTradeTarget(from, spec) {
  const run = G.run;
  const overlay = div('overlay');
  const panel = div('overlay-panel');
  panel.appendChild(h('h3', 'accent', 'Give to…'));
  const grid = div('grid loot-grid');
  for (const c of run.roster) {
    if (c.dead || c.id === from.id) continue;
    const card = div('card');
    card.appendChild(h('div', 'card-title', `${c.name}${c.hero ? ' 👑' : ''}`));
    card.appendChild(h('div', 'card-sub', `${c.cls.name} ${c.classLevel || c.level}`));
    card.appendChild(btn('Hand over', () => {
      const res = Run.tradeGear(run, from.id, c.id, spec);
      toast(res.msg);
      overlay.remove();
      campfireSheetModal(from);
    }));
    grid.appendChild(card);
  }
  panel.appendChild(grid);
  panel.appendChild(div('row-center', btn('Cancel', () => overlay.remove())));
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

export function showInspectModal(tx, ty) {
  const combat = G.combat;
  if (!combat || combat.over) return;
  if (!Combat.inBounds(combat, tx, ty)) return;
  const tile = combat.grid[ty][tx];
  if (!tile || (!tile.discovered && !combat.revealed)) return;

  const unit = Combat.unitAtAny(combat, tx, ty);
  document.querySelectorAll('.inspect-overlay').forEach(o => o.remove());
  if (!CS) CS = { mode: 'idle', pending: null, hover: null, radial: null, scale: 1, flash: {}, reachable: null };
  CS.inspectPos = { x: tx, y: ty };

  const overlay = div('overlay inspect-overlay');
  const panel = div('overlay-panel inspect-panel');
  panel.appendChild(h('h3', 'accent', unit ? `📜 ${unit.name}${unit.dead ? ' 💀' : ''}` : '🗺 Terrain Inspection'));
  panel.appendChild(h('div', 'muted', unit ? 'Character sheet · hold-click on any tile to inspect' : 'Hold-click on a tile to inspect it'));
  if (unit) panel.appendChild(buildUnitSheet(unit));
  // equipment management for the ACTING player unit (costs an action point)
  if (unit && unit.team === 'player' && !unit.dead) {
    const cur = currentPlayerUnit();
    if (cur && cur.id === unit.id && CS.mode !== 'enemy') {
      panel.appendChild(buildEquipmentUI(unit.char, {
        mode: 'combat',
        onEquip: (item) => doGearAction(unit, 'equip_' + item.kind, { itemUid: item.uid }),
        onUnequip: (eq) => doGearAction(unit, 'unequip_' + eq.slot, { index: eq.index }),
      }));
    } else {
      const note = div('sheet-section');
      note.appendChild(h('h4', '', 'Equipment'));
      note.appendChild(h('div', 'muted', 'Gear can only be changed during this character\'s own turn (costs 1 action point). Between floors it\'s free.'));
      panel.appendChild(note);
    }
  }
  panel.appendChild(buildTileSheet(tile, tx, ty));
  panel.appendChild(btn('Close', () => overlay.remove()));
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

// ============================== FLOATING COMBAT NUMBERS ==============================
// Damage-type → color + icon for the rising damage/heal popups.
export const POPUP_STYLES = {
  fire: { color: '#ff6a2a', icon: '🔥' },       // red
  cold: { color: '#6ac2ff', icon: '❄' },       // blue
  acid: { color: '#7ae05a', icon: '🧪' },      // green
  lightning: { color: '#ffe83c', icon: '⚡' },
  thunder: { color: '#f0a848', icon: '💥' },
  poison: { color: '#c87ae8', icon: '☠' },
  radiant: { color: '#fff2a0', icon: '✨' },
  necrotic: { color: '#a06ae8', icon: '💀' },
  psychic: { color: '#f07ad8', icon: '🧠' },
  force: { color: '#5ae0e8', icon: '💫' },
  slashing: { color: '#e8e8f0', icon: '⚔' },
  piercing: { color: '#c8d0e0', icon: '🗡' },
  bludgeoning: { color: '#c8b898', icon: '⚒' },
};

function popupsAlive() {
  if (!G || !G.combat) return false;
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const p = (G.combat.popups || []).some(p => now - p.born < p.dur);
  const f = (G.combat.fx || []).some(f => now - f.born < f.dur);
  return p || f;
}

let popupRaf = null;
function schedulePopupLoop() {
  if (popupRaf) return;
  if (!popupsAlive()) return;
  popupRaf = requestAnimationFrame(() => {
    popupRaf = null;
    if (popupsAlive()) render();
  });
}

// Visibility math for a floating number: age 0..1 while animating, <0 before
// its (optional) delay elapses, >=1 after it finishes. Pure so it can be tested.
export function popupAge(p, now) {
  const start = (p.born || 0) + (p.delay || 0);
  return (now - start) / p.dur;
}

function drawPopups(ctx, combat, scale) {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const tilePx = TILE_SIZE * scale;
  for (const p of combat.popups || []) {
    const age = popupAge(p, now);
    if (age >= 1 || age < 0) continue;
    let text, color, size = 13;
    if (p.kind === 'immune') {
      text = 'IMMUNE'; color = '#9a9aa8';
    } else if (p.kind === 'miss') {
      text = 'Miss'; color = '#d8d8e0';
    } else if (p.kind === 'heal') {
      text = `+${p.amount} 💚`; color = '#6ae08a';
    } else {
      const st = POPUP_STYLES[p.type] || { color: '#ffffff', icon: '' };
      const phys = ['bludgeoning', 'piercing', 'slashing'].includes(p.type);
      const pre = p.magical && phys ? '✨' : '';
      text = `${pre}${p.amount}${st.icon}`;
      color = st.color;
      if (p.crit) { size = 19; text = `💥 ${text}`; }
    }
    const px = (p.x + 0.5) * tilePx + (p.jx || 0);
    const py = (p.y + 0.5) * tilePx - 8 - age * 36;
    ctx.globalAlpha = Math.max(0, 1 - age * age);
    ctx.font = `bold ${Math.round(size * Math.max(scale, 0.75))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, px, py);
    ctx.fillStyle = color;
    ctx.fillText(text, px, py);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}

// Spell visual effects: beams, projectiles, expanding rings, cone/line flashes,
// glows and teleport puffs. All are short-lived and driven by the rAF loop.
function drawSpellFx(ctx, combat, scale) {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const tilePx = TILE_SIZE * scale;
  const tc = (tx, ty) => ({ x: (tx + 0.5) * tilePx, y: (ty + 0.5) * tilePx });
  const lerp = (a, b, t) => a + (b - a) * t;
  for (const f of combat.fx || []) {
    const age = (now - f.born) / f.dur;
    if (age < 0 || age >= 1) continue;
    const alpha = 1 - age;
    const from = tc(f.x0 !== undefined ? f.x0 : f.x, f.y0 !== undefined ? f.y0 : f.y);
    const to = f.x1 !== undefined ? tc(f.x1, f.y1) : from;
    ctx.save();
    switch (f.type) {
      case 'beam': {
        // forceful ray: shoots across quickly, bright core with colored glow
        const t = Math.min(age / 0.35, 1);
        const ex = lerp(from.x, to.x, t), ey = lerp(from.y, to.y, t);
        ctx.lineCap = 'round';
        ctx.globalAlpha = alpha * 0.55;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 11 * scale * (1 - age * 0.5);
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3 * scale;
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(ex, ey); ctx.stroke();
        // impact burst at the tip
        if (age > 0.35) {
          const ia = (age - 0.35) / 0.65;
          ctx.globalAlpha = (1 - ia) * 0.9;
          ctx.fillStyle = f.color;
          ctx.beginPath(); ctx.arc(to.x, to.y, (3 + ia * 9) * scale, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'proj': {
        const isBolt = f.kind === 'arrow' || f.kind === 'thrown';
        const t = Math.min(age / (isBolt ? 0.42 : 0.55), 1);
        const px = lerp(from.x, to.x, t), py = lerp(from.y, to.y, t);
        ctx.globalAlpha = alpha;
        if (isBolt) {
          const dx = to.x - from.x, dy = to.y - from.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len, uy = dy / len;
          const body = (f.kind === 'thrown' ? 11 : 9) * scale;
          ctx.lineCap = 'round';
          ctx.strokeStyle = f.color || '#e8d8a0';
          ctx.lineWidth = (f.kind === 'thrown' ? 3.4 : 2.1) * scale;
          ctx.beginPath();
          ctx.moveTo(px - ux * body, py - uy * body);
          ctx.lineTo(px + ux * body * 0.35, py + uy * body * 0.35);
          ctx.stroke();
          ctx.strokeStyle = f.kind === 'thrown' ? '#8a6230' : '#c45a3c';
          ctx.lineWidth = 1.6 * scale;
          ctx.beginPath();
          ctx.moveTo(px - ux * body, py - uy * body);
          ctx.lineTo(px - ux * body + (-uy) * 3 * scale, py - uy * body + ux * 3 * scale);
          ctx.moveTo(px - ux * body, py - uy * body);
          ctx.lineTo(px - ux * body - (-uy) * 3 * scale, py - uy * body - ux * 3 * scale);
          ctx.stroke();
          if (t >= 1 || age > 0.42) {
            const ia = Math.min(1, Math.max(0, (age - 0.42) / 0.58));
            ctx.globalAlpha = (1 - ia) * 0.8;
            ctx.strokeStyle = f.color;
            ctx.lineWidth = 2 * scale;
            ctx.beginPath(); ctx.arc(to.x, to.y, (3 + ia * 10) * scale, 0, Math.PI * 2); ctx.stroke();
          }
        } else {
          // thrown orb / bolt arcing to its target
          ctx.fillStyle = f.color;
          ctx.beginPath(); ctx.arc(px, py, Math.max(3, 7 * scale * (1 - age * 0.4)), 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(px, py, Math.max(1.5, 3 * scale), 0, Math.PI * 2); ctx.fill();
          if (age > 0.55) {
            const ia = (age - 0.55) / 0.45;
            ctx.globalAlpha = (1 - ia) * 0.85;
            ctx.strokeStyle = f.color;
            ctx.lineWidth = 2 * scale;
            ctx.beginPath(); ctx.arc(to.x, to.y, (4 + ia * 12) * scale, 0, Math.PI * 2); ctx.stroke();
          }
        }
        break;
      }
      case 'ring': {
        const r = (age * (f.radius * 2 + 1) * tilePx) / 2 + tilePx * 0.4;
        ctx.globalAlpha = alpha * 0.85;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 4 * scale * (1 - age * 0.6);
        ctx.beginPath(); ctx.arc(from.x, from.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = alpha * 0.22;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(from.x, from.y, r * 0.85, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'cone': {
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillStyle = f.color;
        for (const t of f.tiles || []) ctx.fillRect(t.x * tilePx, t.y * tilePx, tilePx, tilePx);
        break;
      }
      case 'line': {
        ctx.globalAlpha = alpha * 0.35;
        ctx.fillStyle = f.color;
        for (const t of f.tiles || []) ctx.fillRect(t.x * tilePx, t.y * tilePx, tilePx, tilePx);
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * scale;
        for (const t of f.tiles || []) ctx.strokeRect(t.x * tilePx + 2, t.y * tilePx + 2, tilePx - 4, tilePx - 4);
        break;
      }
      case 'flash': {
        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(from.x, from.y, 10 * scale * (1 - age), 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'glow': {
        const a = Math.sin(Math.PI * age);
        ctx.globalAlpha = a * 0.45;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(from.x, from.y, (6 + 10 * age) * scale, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5 * scale;
        ctx.beginPath(); ctx.arc(from.x, from.y, (5 + 8 * age) * scale, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'teleport': {
        for (const pt of [from, to]) {
          const rr = (2 + 10 * age) * scale;
          ctx.globalAlpha = alpha * 0.8;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 3 * scale;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, rr, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = alpha * 0.22;
          ctx.fillStyle = f.color;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, rr, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
    }
    ctx.restore();
  }
}

// ------- input handling -------
export function handleCombatClick(canvas, evt) {
  const cs = CS;
  const combat = G.combat;
  if (!cs || !combat || combat.over) return;
  if (cs.mode === 'enemy') return;
  const rect = canvas.getBoundingClientRect();
  const sx = (evt.clientX - rect.left) / cs.scale;
  const sy = (evt.clientY - rect.top) / cs.scale;
  const tx = Math.floor(sx / TILE_SIZE), ty = Math.floor(sy / TILE_SIZE);
  if (!Combat.inBounds(combat, tx, ty)) return;
  cs.hover = { x: tx, y: ty };
  // live path preview while hovering in idle mode
  cs.hoverPath = null;
  const u = currentPlayerUnit();
  if (u && cs.mode === 'idle' && cs.reachable && cs.reachable.has(ty * combat.w + tx)) {
    const res = Combat.findPath(combat, u, tx, ty, u.moveRemaining);
    cs.hoverPath = res ? res.path : null;
  }
  render();
}

export function handleCombatTileClick(tx, ty, button) {
  const cs = CS;
  const combat = G.combat;
  if (!cs || !combat || combat.over || cs.mode === 'enemy') return;
  const u = currentPlayerUnit();
  if (!u) return;

  if (button === 2) { // right click cancels
    cs.mode = 'idle';
    cs.pending = null;
    render();
    return;
  }

  const unitHere = Combat.unitAt(combat, tx, ty);

  switch (cs.mode) {
    case 'attack': {
      if (!Combat.hasAction(u)) { toast('No action points left.'); return; }
      const w = u.char.weapon ? u.char.weapon.base : 'fists';
      const dist = Math.max(Math.abs(tx - u.x), Math.abs(ty - u.y));
      const range = attackRange(u, w);
      if (unitHere && unitHere.team === 'enemy') {
        if (dist <= range) {
          const opts = { weaponId: w };
          performAction(combat, u.id, { type: 'attack', targetId: unitHere.id, opts });
          cs.flash[unitHere.id] = performance.now();
          cs.mode = 'idle';
          cs.pending = null;
          afterPlayerAction();
          openRadial('root');
        } else {
          toast('Out of range.');
        }
      } else if (!unitHere && range > 1 && dist <= range) {
        const tile = combat.grid[ty] && combat.grid[ty][tx];
        if (tile && tile.maxHp) {
          performAction(combat, u.id, { type: 'attack', aim: { x: tx, y: ty }, opts: { weaponId: w, aim: { x: tx, y: ty } } });
          cs.mode = 'idle';
          cs.pending = null;
          afterPlayerAction();
          openRadial('root');
        }
      }
      break;
    }
    case 'spell': {
      const sp = SPELL_MAP[cs.pending.spellId];
      const dist = Math.max(Math.abs(tx - u.x), Math.abs(ty - u.y));
      const range = spellRangeFor(u.char, sp);
      if (!['self', 'aoe', 'cone', 'line'].includes(sp.mode) && dist > range) { toast('Out of range.'); return; }
      let target = unitHere;
      if (sp.fx === 'revivify') {
        const deadAlly = Combat.unitAtAny(combat, tx, ty);
        if (deadAlly && deadAlly.team === 'player' && deadAlly.dead) target = deadAlly;
      }
      const dir = { dx: Math.sign(tx - u.x) || (u.team === 'player' ? 1 : -1), dy: Math.sign(ty - u.y) };
      if (sp.mode === 'ally' && (!target || target.team !== 'player' || target.dead) && sp.fx !== 'revivify') { toast('Click an ally.'); return; }
      if (sp.fx === 'revivify' && (!target || !target.dead)) { toast('Click a fallen ally.'); return; }
      if ((sp.mode === 'ranged' || sp.mode === 'melee') && sp.heal && (!target || target.team !== 'player')) { toast('Click an ally to heal.'); return; }
      // anything that shoots a single target must actually have an enemy under the cursor
      if ((sp.mode === 'ranged' || sp.mode === 'melee') && !sp.heal && (!target || target.dead || target.team === 'player')) { toast('Click an enemy.'); return; }
      // teleports: destination must be a free tile in range
      if (sp.fx === 'misty_step' || sp.fx === 'dimension_door' || sp.fx === 'thunder_step') {
        if (dist > range) { toast(`Out of range (${range} tiles).`); return; }
        const free = Combat.isPassable(combat, tx, ty) && !Combat.unitAtAny(combat, tx, ty);
        if (!free) { toast('Cannot teleport there — the space is blocked.'); return; }
      }
      performAction(combat, u.id, {
        type: 'cast',
        spellId: cs.pending.spellId,
        targetId: target ? target.id : null,
        aim: { x: tx, y: ty },
        direction: dir,
        level: cs.pending.level,
      });
      cs.mode = 'idle';
      cs.pending = null;
      afterPlayerAction();
      openRadial('root');
      break;
    }
    case 'recast_hex': {
      if (!unitHere || unitHere.dead || unitHere.team !== 'enemy') { toast('Click a living enemy to curse.'); return; }
      const dist2 = Math.max(Math.abs(tx - u.x), Math.abs(ty - u.y));
      if (dist2 > 9) { toast('Out of reach (9 tiles).'); return; }
      performAction(combat, u.id, { type: 'recast_hex', targetId: unitHere.id });
      cs.mode = 'idle';
      cs.pending = null;
      afterPlayerAction();
      openRadial('root');
      break;
    }
    case 'recast_moonbeam': {
      const beam = combat.effects.find(e => e.type === 'moonbeam' && e.source === u.id);
      if (!beam) { toast('The moonbeam has faded.'); cs.mode = 'idle'; cs.pending = null; return; }
      const moveLimit = Actions.MOONBEAM_MOVE_TILES || 12;
      const moveDist = Math.max(Math.abs(tx - beam.x), Math.abs(ty - beam.y));
      if (moveDist > moveLimit) { toast(`The beam can only move ${moveLimit} tiles (60 ft).`); return; }
      if (moveDist === 0) { toast('Pick a new tile for the beam.'); return; }
      performAction(combat, u.id, { type: 'recast_moonbeam', aim: { x: tx, y: ty } });
      cs.mode = 'idle';
      cs.pending = null;
      afterPlayerAction();
      openRadial('root');
      break;
    }
    case 'item': {
      if (unitHere && unitHere.team === 'enemy') {
        performAction(combat, u.id, { type: 'useItem', itemUid: cs.pending.itemUid, targetId: unitHere.id });
        cs.mode = 'idle';
        cs.pending = null;
        afterPlayerAction();
        openRadial('root');
      } else if (!unitHere && cs.pending) {
        // smoke bomb on tile
        const def = CONSUMABLES[cs.pending.itemId];
        if (def && def.fx === 'smoke') {
          performAction(combat, u.id, { type: 'useItem', itemUid: cs.pending.itemUid, targetId: null });
          cs.mode = 'idle';
          cs.pending = null;
          afterPlayerAction();
          openRadial('root');
        }
      }
      break;
    }
    case 'ability_target': {
      if (unitHere && unitHere.team === 'enemy') {
        performAction(combat, u.id, { type: 'ability', ability: cs.pending.ability, targetId: unitHere.id });
        cs.mode = 'idle';
        cs.pending = null;
        afterPlayerAction();
        openRadial('root');
      }
      break;
    }
    case 'ability_cone': {
      const dir = { dx: Math.sign(tx - u.x) || 1, dy: Math.sign(ty - u.y) };
      performAction(combat, u.id, { type: 'ability', ability: cs.pending.ability, targetId: unitHere ? unitHere.id : null, direction: dir });
      cs.mode = 'idle';
      cs.pending = null;
      afterPlayerAction();
      openRadial('root');
      break;
    }
    case 'ally': {
      if (unitHere && unitHere.team === 'player') {
        performAction(combat, u.id, { type: 'ability', ability: cs.pending.ability, targetId: unitHere.id, amount: 15 });
        cs.mode = 'idle';
        cs.pending = null;
        afterPlayerAction();
        openRadial('root');
      }
      break;
    }
    case 'idle': {
      // movement
      if (cs.reachable) {
        const key = ty * combat.w + tx;
        if (cs.reachable.has(key)) {
          const res = Combat.findPath(combat, u, tx, ty, u.moveRemaining);
          if (res) {
            performAction(combat, u.id, { type: 'move', path: res.path });
            cs.hoverPath = null;
            afterPlayerAction();
          }
        }
      }
      break;
    }
  }
}

export function combatScreenInputs() {
  const canvas = $('#combat-canvas');
  if (!canvas || canvas._inputsWired) return;
  canvas._inputsWired = true;
  const press = { active: false, x: 0, y: 0, tx: 0, ty: 0, timer: null, suppressed: false };
  const clearPress = () => {
    if (press.timer) { clearTimeout(press.timer); press.timer = null; }
    press.active = false;
  };

  canvas.addEventListener('pointermove', (e) => handleCombatClick(canvas, e));
  canvas.addEventListener('pointerleave', () => {
    if (CS) { CS.hover = null; CS.hoverPath = null; render(); }
  });
  canvas.addEventListener('pointercancel', () => clearPress());
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    if (!CS || !G.combat || G.combat.over) return;
    if (e.button === 2) {
      // right-click cancels the current targeting mode
      e.preventDefault();
      CS.mode = 'idle';
      CS.pending = null;
      render();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / CS.scale;
    const sy = (e.clientY - rect.top) / CS.scale;
    const tx = Math.floor(sx / TILE_SIZE), ty = Math.floor(sy / TILE_SIZE);
    if (!Combat.inBounds(G.combat, tx, ty)) return;
    press.active = true;
    press.x = e.clientX; press.y = e.clientY;
    press.tx = tx; press.ty = ty;
    press.suppressed = false;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* unsupported */ }
    // LONG-PRESS: hold ~0.55s to inspect the tile instead of acting on it
    press.timer = setTimeout(() => {
      press.timer = null;
      press.suppressed = true;
      showInspectModal(press.tx, press.ty);
    }, 550);
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!press.active) return;
    if (press.timer) { clearTimeout(press.timer); press.timer = null; }
    const { tx, ty, suppressed } = press;
    press.active = false;
    if (suppressed) { press.suppressed = false; return; } // inspection opened; don't act
    handleCombatTileClick(tx, ty, 0);
  });

  // dragging cancels the long-press (it would be a move, not an inspect)
  canvas.addEventListener('pointermove', (e) => {
    if (!press.active || !press.timer) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (dx * dx + dy * dy > 64) {
      clearTimeout(press.timer);
      press.timer = null;
    }
  });
}

if (typeof window !== 'undefined') {
  // As soon as any asset finishes loading, re-render the active scene so the
  // new art appears immediately (no need to move or wait for the next frame).
  onAssetsChanged(() => {
    if (!G) return;
    try {
      if (G.walk && !G.combat) {
        renderWalk();
      } else if (G.combat && CS && document.querySelector('#combat-canvas')) {
        render();
      }
    } catch (e) { /* noop */ }
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    // debug console: Tab toggles it (only when unlocked & in a run)
    const consoleEl = document.querySelector('.console-overlay');
    if (consoleEl && e.key === 'Escape') {
      consoleEl.remove();
      return;
    }
    if (e.key === 'Tab') {
      if (G && G.debugUnlocked && G.run) {
        e.preventDefault();
        if (consoleEl) consoleEl.remove();
        else openConsole();
      }
      return;
    }
    const spellDetail = document.querySelector('.spell-detail');
    if (spellDetail && e.key === 'Escape') {
      spellDetail.remove();
      return;
    }
    const inspect = document.querySelector('.inspect-overlay');
    if (inspect && e.key === 'Escape') {
      inspect.remove();
      return;
    }
    // walkable scenes: WASD/arrows move, E interacts
    if (G && G.walk && !G.combat && !document.querySelector('.overlay')) {
      const dirMap = {
        ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
        w: [0, -1], W: [0, -1], a: [-1, 0], A: [-1, 0],
        s: [0, 1], S: [0, 1], d: [1, 0], D: [1, 0],
      };
      const dir = dirMap[e.key];
      if (dir) {
        e.preventDefault();
        cancelAutoWalk();
        walkTryMove(G.walk, dir[0], dir[1]);
        renderWalk();
        return;
      }
      if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') {
        e.preventDefault();
        const n = npcNear(G.walk);
        if (n) npcClick(n);
        return;
      }
    }

    if (!CS || !G || !G.combat || G.combat.over) return;
    if (e.key === 'Escape') {
      if (CS.radial) {
        closeRadial();
        return;
      }
      CS.mode = 'idle';
      CS.pending = null;
      render();
    } else if (e.key === ' ' && !inspect) {
      e.preventDefault();
      const u = currentPlayerUnit();
      if (u && CS.mode === 'idle') endPlayerTurn();
    }
  });
}

// ============================== VICTORY / LOOT ==============================
export function victoryScreen(shards) {
  const run = G.run;
  const combat = G.combat;
  const boss = Run.floorIsBoss(run.floor);
  const loot = Run.rollLoot(run, G.meta.shopItems['pouch_plenty'] ? 4 : 3, { boss });
  G.pendingLoot = { loot, picked: false };

  // Victory fanfare: music sting + loot chest + coins.
  Audio.sting('music/victory', { vol: 0.85 });
  Audio.play('items/chest_open', { vol: 0.8, delay: 400 });
  Audio.play('items/gold', { vol: 0.7, delay: 800 });

  const root = div('screen-center victory');
  root.appendChild(h('h2', 'accent', '⚔ VICTORY!'));
  root.appendChild(h('p', 'center', `Floor ${run.floorsCleared} cleared! The field is yours.`));
  root.appendChild(h('p', 'center muted', `💎 +${shards} soul shards (banked) · 💰 +${combat.gold || 0} gold`));

  root.appendChild(h('h3', '', boss ? '☠ BOSS LOOT — choose 1 treasure' : '🎁 Loot the fallen — choose 1 treasure'));
  const grid = div('grid loot-grid');
  for (const item of loot.items) {
    const card = div('card loot-card');
    const badge = div('badge run', 'TEMPORARY · lost at run end');
    card.appendChild(badge);
    card.appendChild(h('div', 'card-title', item.kind === 'consumable' ? `🧪 ${item.name}` : item.kind === 'weapon' ? `⚔ ${item.name}` : item.kind === 'armor' ? `🛡 ${item.name}` : `💍 ${item.name}`));
    if (item.kind === 'weapon') card.appendChild(h('div', 'card-sub', `dmg ${item.def.dmg} ${item.def.dmgType}${item.enchant ? ` · ${item.enchant.name}` : ''}`));
    if (item.kind === 'armor') card.appendChild(h('div', 'card-sub', `AC ${item.def.ac.base}${item.enchant ? ` · ${item.enchant.name}` : ''}`));
    card.appendChild(h('div', 'card-desc', item.desc || ''));
    card.appendChild(btn('Take it', () => pickLoot(item, root)));
    grid.appendChild(card);
  }
  root.appendChild(grid);

  const skip = btn('Skip (keep gold only)', () => continueAfterLoot(), 'subtle');
  root.appendChild(div('row-center', skip));
  screen('victory', root);
}

function pickLoot(item, root) {
  if (G.pendingLoot.picked) return;
  G.pendingLoot.picked = true;
  const run = G.run;
  // choose who gets it
  const alive = run.party.filter(c => !c.dead);
  root.innerHTML = '';
  root.appendChild(h('h2', 'accent', `Give ${item.name} to...`));
  const grid = div('grid loot-grid');
  for (const c of alive) {
    const card = div('card');
    card.appendChild(h('div', 'card-title', `${c.name}${c.hero ? ' 👑' : ''}`));
    card.appendChild(h('div', 'card-sub', `Lv${c.level} ${c.cls.name} · ${c.cls.subclasses[c.subclassId]?.name || 'Undeclared Path'}`));
    card.appendChild(btn('Give', () => {
      Run.applyLoot(run, item, c.id);
      toast(`${item.name} → ${c.name}`);
      continueAfterLoot();
    }));
    grid.appendChild(card);
  }
  root.appendChild(grid);
  screen('victory', root);
}

function continueAfterLoot() {
  const run = G.run;
  // WIN CONDITION: survive 12 floors
  if (run.floorsCleared >= 12) {
    winRunScreen();
    return;
  }
  // short rest
  Run.shortRestParty(run);
  // level up every 2 floors
  if (run.floorsCleared % 2 === 0) {
    levelUpScreen();
  } else {
    afterFloorRest();
  }
}

function winRunScreen() {
  const run = G.run;
  const meta = G.meta;
  const bonus = 300 + run.floorsCleared * 25;
  Run.endRun(meta, run, true, false);
  const root = div('screen-center victory');
  root.appendChild(h('h2', 'accent', '🏆 THE DESCENT IS CONQUERED!'));
  root.appendChild(h('p', 'flavor', `“Twelve floors deep, ${meta.hero.name} walks out of the smoke — scarred, rich, and already planning the next descent.”`));
  const stats = div('stat-row');
  stats.appendChild(statBox('⛰ Floors Cleared', run.floorsCleared));
  stats.appendChild(statBox('💎 Shards Banked', run.shardsEarned));
  stats.appendChild(statBox('🎉 Victory Bonus', bonus));
  root.appendChild(stats);
  const note = div('note');
  note.innerHTML = 'Your hero returns to the hub at level 1 to descend again. Persistent relics and banked shards remain. Run items are gone — such is the way of the Descent.';
  root.appendChild(note);
  root.appendChild(div('row-center', btn('🏛 Return to the Hub', () => hubScreen(), 'primary huge')));
  screen('victory', root);
}

// ============================== LEVEL UP ==============================
export function levelUpScreen() {
  Audio.play('ui/levelup', { vol: 0.85 });
  const run = G.run;
  const hero = G.meta.hero;
  const newLevel = Run.partyLevel(run) + 1;
  const choices = Run.levelUpChoicesFor(hero, run.rng);

  const root = div('screen-center levelup');
  root.appendChild(h('h2', 'accent', `🎉 PARTY LEVEL UP → Level ${newLevel}`));
  root.appendChild(h('p', 'center muted', 'Two more floors conquered. Experience settles into your bones.'));

  // NPC preview
  const npcs = run.party.filter(c => !c.dead && !c.hero);
  const npcList = div('npc-list');
  for (const c of npcs) {
    npcList.appendChild(h('span', 'badge', `${c.name} → Lv${newLevel} ${c.cls.name}`));
  }
  root.appendChild(npcList);

  if (choices.type === 'asi') {
    root.appendChild(h('h3', '', 'Ability Score Increase — choose how to grow'));
    root.appendChild(h('p', 'center muted', 'Pick +2 to one ability, or +1 to two different abilities.'));
    const state = { picks: [] };
    const grid = div('grid score-grid');
    const render = () => {
      grid.innerHTML = '';
      for (const ab of ABILITIES) {
        const picked = state.picks.filter(p => p === ab).length;
        const card = div('card score-card' + (picked ? ' selected' : ''));
        card.appendChild(h('div', 'card-title', `${ab} ${hero.abilities[ab]}${picked ? ` → ${hero.abilities[ab] + picked}` : ''}`));
        card.addEventListener('click', () => {
          if (state.picks.includes(ab)) {
            state.picks = state.picks.filter(p => p !== ab);
          } else if (state.picks.length < 2) {
            state.picks.push(ab);
          } else {
            state.picks = [ab];
          }
          render();
        });
        grid.appendChild(card);
      }
    };
    render();
    root.appendChild(grid);
    root.appendChild(div('row-center', btn('Confirm', () => {
      if (!state.picks.length) { toast('Pick an ability first.'); return; }
      finishLevelUp({ asi: state.picks });
    }, 'primary')));
    // ---- feats, inline: pick a feat INSTEAD of the ASI ----
    root.appendChild(h('h3', 'accent', '🎖 …or take a FEAT instead'));
    root.appendChild(h('p', 'center muted', 'Feats replace the ability score increase. Each can only be taken once.'));
    root.appendChild(buildFeatGrid(hero, { rng: run.rng, onDone: () => finishLevelUp({ feat: true }) }));
  } else if (choices.type === 'spell') {
    root.appendChild(h('h3', '', 'Learn a new spell'));
    const grid = div('grid loot-grid');
    for (const sid of choices.options) {
      const sp = SPELL_MAP[sid];
      const card = div('card');
      card.appendChild(h('div', 'card-title', `✨ ${sp.name}`));
      card.appendChild(h('div', 'card-sub', `${sp.school} · level ${sp.level} · ${sp.castTime}`));
      card.appendChild(h('div', 'card-desc', sp.desc));
      card.appendChild(btn('Learn', () => finishLevelUp({ spell: sid })));
      grid.appendChild(card);
    }
    root.appendChild(grid);
    root.appendChild(div('row-center', btn('Skip', () => finishLevelUp({}), 'subtle')));
  } else {
    root.appendChild(btn('Continue', () => finishLevelUp({}), 'primary'));
  }
  // multiclass option — always available at level-up
  root.appendChild(h('div', 'center muted', '— or —'));
  root.appendChild(div('row-center', btn('🎭 Multiclass into another class instead', () => multiclassScreen(hero), 'subtle')));
  screen('levelup', root);
}

function multiclassScreen(char) {
  const run = G.run;
  const excluded = new Set([char.cls.id, char.secondClass && char.secondClass.classId]);
  const root = div('screen-center levelup');
  root.appendChild(h('h2', 'accent', '🎭 Multiclass'));
  root.appendChild(h('p', 'center muted', `Instead of leveling ${char.cls.name}, ${char.name} takes a level in another class.`));
  const grid = div('grid class-grid');
  for (const cls of CLASSES) {
    if (excluded.has(cls.id)) continue;
    const card = div('card');
    card.appendChild(h('div', 'card-title', cls.name));
    card.appendChild(h('div', 'card-sub', `HD d${cls.hitDie} · Saves ${cls.saves.join('/')}`));
    card.appendChild(h('div', 'card-desc', cls.desc));
    card.appendChild(btn('Take a level', () => {
      Run.multiclassInto(char, cls.id, run.rng);
      // companions still get their level-up; the hero's is consumed by the multiclass
      Run.levelUpParty(run, G.meta, { [char.id]: { skip: true } });
      run.lastLevel = Math.max(run.lastLevel, char.level);
      toast(`${char.name} is now ${char.cls.name} ${char.classLevel || (char.level - char.secondClass.level)} / ${cls.name} ${char.secondClass.level}!`);
      afterFloorRest();
    }));
    grid.appendChild(card);
  }
  root.appendChild(grid);
  root.appendChild(div('row-center', btn('↩ Back', () => levelUpScreen())));
  screen('levelup', root);
}

function finishLevelUp(heroChoices) {
  const run = G.run;
  const hero = G.meta.hero;
  const choices = { [hero.id]: heroChoices };
  Run.levelUpParty(run, G.meta, choices);
  Run.persistSave(G.meta);
  toast('The party has leveled up!');
  afterFloorRest();
}

function afterFloorRest() {
  const run = G.run;
  if (run.floorsCleared % 3 === 0) townScreen();
  else campScreen();
}

// ============================== CAMP ==============================
export function campScreen() {
  walkScene('camp');
}

function openLineupOverlay() {
  const run = G.run;
  const overlay = div('overlay');
  const panel = div('overlay-panel camp-sheet-panel');
  panel.appendChild(h('h3', 'accent', '⚔ Fighting Lineup (4)'));
  panel.appendChild(h('div', 'muted', 'Your hero must fight. Everyone else can be stood down or brought in.'));
  buildLineupSection(panel, run);
  panel.appendChild(div('row-center', btn('Close', () => overlay.remove())));
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

function buildLineupSection(root, run) {
  const grid = div('grid lineup-grid');
  for (const c of run.roster) {
    if (c.dead) continue;
    const active = run.active.includes(c.id);
    const card = div('card lineup-card' + (active ? ' selected' : ''));
    card.appendChild(h('div', 'card-title', `${c.name}${c.hero ? ' 👑' : ''}`));
    card.appendChild(h('div', 'card-sub', `${c.cls.name} ${c.classLevel || c.level}${c.secondClass ? ' / ' + CLASS_MAP[c.secondClass.classId].name + ' ' + c.secondClass.level : ''}${c.transformed ? ' · 🧠' : ''} · Total Lv${c.level}`));
    if (c.hero) {
      card.appendChild(h('div', 'card-desc', 'Your hero must fight.'));
    } else {
      card.appendChild(btn(active ? '✓ In Party (stand down)' : '+ Add to Party', () => {
        const res = Run.toggleActive(run, c.id, active ? false : true);
        if (!res.ok) toast(res.msg);
        else { if (active) toast(`${c.name} stands by.`); else toast(`${c.name} joins the lineup.`); }
        // re-render the walk scene behind the overlay
        if (G.walk) {
          document.querySelectorAll('.overlay').forEach(o => o.remove());
          walkScene(G.walk.mapId);
        }
      }, 'subtle'));
    }
    grid.appendChild(card);
  }
  root.appendChild(grid);
}

// ============================== TOWN (every 3rd floor) ==============================
export function townScreen() {
  const run = G.run;
  // generate town content + long rest once per visit
  if (run.lastTownFloor !== run.floorsCleared) {
    Run.rollTown(run);
    Run.doLongRest(run);
    run.lastTownFloor = run.floorsCleared;
    toast('A long rest in town: fully restored. Blessings & penalties reset.');
  }
  walkScene('town');
}

function chooseMemberForTownItem(item) {
  const run = G.run;
  const overlay = div('overlay');
  const panel = div('overlay-panel');
  panel.appendChild(h('h3', 'accent', `Buy ${item.name} for...`));
  const grid = div('grid loot-grid');
  for (const c of run.roster) {
    if (c.dead) continue;
    const card = div('card');
    card.appendChild(h('div', 'card-title', `${c.name}${c.hero ? ' 👑' : ''}`));
    card.appendChild(h('div', 'card-sub', `Lv${c.level} ${c.cls.name}`));
    card.appendChild(btn('Buy for them', () => {
      const res = Run.buyTownItem(run, item.uid, c.id);
      toast(res.msg);
      overlay.remove();
      if (res.ok) townScreen();
    }));
    grid.appendChild(card);
  }
  panel.appendChild(grid);
  panel.appendChild(div('row-center', btn('Cancel', () => overlay.remove())));
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

function openTownEventModal(ev) {
  const run = G.run;
  const overlay = div('overlay');
  const panel = div('overlay-panel');
  panel.appendChild(h('h3', 'accent', ev.title));
  panel.appendChild(h('div', 'muted', `${ev.npc}`));
  panel.appendChild(h('p', '', ev.text));
  panel.appendChild(h('p', 'center', `Skill check: ${ev.skill} (DC ${ev.dc})`));
  const attempt = btn(`🎲 Roll ${ev.skill}`, () => {
    const res = Run.rollTownEvent(run, ev.id);
    panel.innerHTML = '';
    panel.appendChild(h('h3', 'accent', ev.title));
    if (res.best) {
      panel.appendChild(h('div', 'muted', `${res.best.char.name} steps forward (${ev.skill} +${res.best.mod})`));
    }
    const rollLine = div('row-center');
    rollLine.appendChild(h('div', 'dice-line', `d20 = ${res.roll} + ${res.best ? res.best.mod : 0} = ${res.total} vs DC ${ev.dc}`));
    panel.appendChild(rollLine);
    if (res.success) {
      panel.appendChild(h('p', 'center', '✨ SUCCESS! ' + ev.passText));
      panel.appendChild(h('p', 'center blessing', `Blessing: ${ev.buff.name} (+1, party-wide, until next long rest)`));
    } else {
      panel.appendChild(h('p', 'center', '💀 FAILURE! ' + ev.failText));
      panel.appendChild(h('p', 'center penalty', `Penalty: ${ev.buff.name} (−1, party-wide, until next long rest)`));
    }
    panel.appendChild(div('row-center', btn('Continue', () => { overlay.remove(); townScreen(); }, 'primary')));
  }, 'primary');
  panel.appendChild(div('row-center', attempt));
  panel.appendChild(div('row-center', btn('Walk away', () => overlay.remove(), 'subtle')));
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

// ---------- Campfire character sheet + pending choice allocation ----------
export function buildCharSheetFromChar(char) {
  const fakeUnit = {
    char,
    hp: char.hp, maxHp: char.maxHp, tempHp: char.tempHp || 0,
    statuses: [], dead: char.dead, wildShaped: false, deathRound: null,
  };
  return buildUnitSheet(fakeUnit);
}

export function campfireSheetModal(c) {
  const run = G.run;
  document.querySelectorAll('.overlay').forEach(o => o.remove());
  const overlay = div('overlay camp-sheet');
  const panel = div('overlay-panel camp-sheet-panel');
  panel.appendChild(h('h3', 'accent', `📜 ${c.name}${c.hero ? ' 👑' : ''}`));
  panel.appendChild(h('div', 'muted', `${c.cls.name} ${c.classLevel || c.level}${c.secondClass ? ` / ${CLASS_MAP[c.secondClass.classId].name} ${c.secondClass.level}` : ''} · Total Lv${c.level} · ${c.race.name} · HP ${c.hp}/${c.maxHp}`));

  // ===== pending choices =====
  if (Run.hasPendingChoices(c)) {
    const pend = div('sheet-section');
    pend.appendChild(h('h4', '', '⚠ Pending Level-Up Choices'));

    if (c.pendingLevelUp) {
      const lvRow = div('row-center');
      lvRow.appendChild(btn(`⬆ Level Up (${c.cls.name})`, () => { Run.applyPendingLevelUp(run, c.id, {}); campfireSheetModal(c); }, 'primary'));
      lvRow.appendChild(btn('🎭 Multiclass…', () => multiclassPickerInModal(c)));
      pend.appendChild(lvRow);
    }
    if (c.pendingSubclass) {
      pend.appendChild(h('div', 'muted', `Choose a ${c.cls.name} path (level 3):`));
      const grid = div('grid sub-grid');
      for (const [id, sub] of Object.entries(c.cls.subclasses)) {
        const card = div('card');
        card.appendChild(h('div', 'card-title', sub.name));
        card.appendChild(h('div', 'card-desc', sub.desc));
        card.appendChild(btn('Choose', () => { Run.applyPendingSubclass(run, c.id, id); campfireSheetModal(c); }));
        grid.appendChild(card);
      }
      pend.appendChild(grid);
    }
    if (c.pendingAsi) {
      pend.appendChild(h('div', 'muted', 'Ability Score Increase — pick one ability (+2) or two (+1 each):'));
      const state = { picks: [] };
      const grid = div('grid score-grid');
      const renderAsi = () => {
        grid.innerHTML = '';
        for (const ab of ABILITIES) {
          const picked = state.picks.filter(p => p === ab).length;
          const card = div('card score-card' + (picked ? ' selected' : ''));
          card.appendChild(h('div', 'card-title', `${ab} ${c.abilities[ab]}${picked ? ` → ${c.abilities[ab] + (state.picks.length === 1 ? 2 : 1)}` : ''}`));
          card.addEventListener('click', () => {
            if (state.picks.includes(ab)) state.picks = state.picks.filter(p => p !== ab);
            else if (state.picks.length < 2) state.picks.push(ab);
            else state.picks = [ab];
            renderAsi();
          });
          grid.appendChild(card);
        }
      };
      renderAsi();
      pend.appendChild(grid);
      pend.appendChild(div('row-center', btn('Confirm', () => {
        if (!state.picks.length) { toast('Pick an ability first.'); return; }
        Run.applyPendingAsi(run, c.id, state.picks);
        campfireSheetModal(c);
      }, 'primary')));
      pend.appendChild(h('h4', 'accent', '🎖 …or take a FEAT instead'));
      pend.appendChild(buildFeatGrid(c, { rng: run.rng, onDone: () => { c.pendingAsi = false; campfireSheetModal(c); } }));
    }
    if (c.pendingSpellChoice) {
      pend.appendChild(h('div', 'muted', 'Pick one bonus spell to learn:'));
      const opts = Run.spellOptionsFor(c, run.rng);
      const grid = div('grid loot-grid');
      for (const sid of opts) {
        const sp = SPELL_MAP[sid];
        const card = div('card');
        card.appendChild(h('div', 'card-title', `✨ ${sp.name}`));
        card.appendChild(h('div', 'card-sub', `${sp.school} · level ${sp.level} · ${sp.castTime}`));
        card.appendChild(h('div', 'card-desc', sp.desc));
        card.appendChild(btn('Learn', () => { Run.applyPendingSpell(run, c.id, sid); campfireSheetModal(c); }));
        grid.appendChild(card);
      }
      if (!opts.length) pend.appendChild(h('div', 'muted', 'No extra spells available right now.'));
      pend.appendChild(grid);
    }
    panel.appendChild(pend);
  }

  // ===== character sheet =====
  panel.appendChild(h('h3', '', 'Character Sheet'));
  panel.appendChild(buildCharSheetFromChar(c));

  // ===== inventory =====
  panel.appendChild(h('h3', '', '🎒 Inventory'));
  if (!c.inventory.length) {
    panel.appendChild(h('p', 'muted', 'Empty.'));
  } else {
    const list = div('spell-list');
    for (const item of c.inventory) {
      const row = div('spell-row');
      const badge = item.persistent ? '<span class="badge persistent">PERSISTENT</span>' : '<span class="badge run">RUN</span>';
      row.appendChild(h('div', 'spell-name', `${item.name} ${badge}`));
      row.appendChild(h('div', 'spell-desc', item.desc || CONSUMABLES[item.id]?.desc || ''));
      list.appendChild(row);
    }
    panel.appendChild(list);
  }

  // ===== prepared spells (cleric / druid / wizard) =====
  if (c.preparedSpells) {
    const cap = Math.max(1, c.level + mod(c.abilities[c.cls.spellAbility]));
    panel.appendChild(h('h3', '', `📖 Prepare Spells (${c.preparedSpells.length}/${cap} prepared)`));
    const preplist = div('spell-list');
    for (const id of listLeveledSpellsKnown(c)) {
      const sp = SPELL_MAP[id];
      const on = c.preparedSpells.includes(id);
      const row = div('spell-row' + (on ? '' : ' unprepared'));
      row.appendChild(h('div', 'spell-name', `${sp.name} (${ordinal(sp.level)}) ${on ? '<span class="badge cost-action">PREPARED</span>' : ''}`));
      const b = btn(on ? 'Unprepare' : 'Prepare', () => {
        if (Run.togglePrepared(c, id, !on)) campfireSheetModal(c);
        else toast('Preparation slots are full — unprepare something first.');
      }, on ? 'subtle' : 'green');
      row.appendChild(b);
      preplist.appendChild(row);
    }
    panel.appendChild(preplist);
  }

  // ===== equipment (free to manage between floors) =====
  panel.appendChild(h('h3', '', '⚒ Equipment'));
  panel.appendChild(buildEquipmentUI(c, {
    mode: 'camp',
    onEquip: (item) => {
      const res = changeGearChar(c, 'equip_' + item.kind, { itemUid: item.uid });
      toast(res.msg);
      campfireSheetModal(c);
    },
    onUnequip: (eq) => {
      const res = changeGearChar(c, 'unequip_' + eq.slot, { index: eq.index });
      toast(res.msg);
      campfireSheetModal(c);
    },
    onGive: (spec) => chooseTradeTarget(c, spec),
  }));

  // ===== spellbook =====
  if (c.cls.spellAbility || (c.spellsKnown && c.spellsKnown.length)) {
    panel.appendChild(h('h3', '', '📖 Spellbook'));
    const known = [...listCantripsKnown(c), ...listLeveledSpellsKnown(c).sort((a, b) => SPELL_MAP[a].level - SPELL_MAP[b].level)];
    if (!known.length) {
      panel.appendChild(h('p', 'muted', 'No spells known.'));
    } else {
      const list = div('spell-list');
      for (const id of known) {
        const sp = SPELL_MAP[id];
        const row = div('spell-row');
        row.appendChild(h('div', 'spell-name', `${sp.name}${sp.level ? ` (${ordinal(sp.level)})` : ' ✦cantrip'} ${spellCostBadgeHtml(sp)}${sp.concentration ? ' <span class="badge concentration">CONCENTRATION</span>' : ''}`));
        const dice = spellDiceLine(sp, c);
        if (dice) row.appendChild(h('div', 'spell-dice', dice));
        row.appendChild(h('div', 'spell-desc', sp.desc));
        attachLongPress(row, () => showSpellDetail(sp, c, null), null, { ignoreForms: true });
        list.appendChild(row);
      }
      panel.appendChild(list);
    }
  }

  panel.appendChild(div('row-center', btn('Close', () => overlay.remove())));
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

// ============================== FEATS ==============================
// Build the feat card grid (used inline on level-up screens AND in the modal).
function buildFeatGrid(char, opts = {}) {
  const rng = opts.rng || (G && G.run && G.run.rng) || makeRng();
  const grid = div('grid class-grid feat-grid');
  const eligible = FEATS.filter(f => !(char.feats || []).includes(f.id));
  for (const f of eligible) {
    const card = div('card');
    card.appendChild(h('div', 'card-title', `🎖 ${f.name}`));
    card.appendChild(h('div', 'card-sub', f.source));
    card.appendChild(h('div', 'card-desc', f.desc));
    card.appendChild(btn('Take', () => {
      const need = f.halfAsi ? 'ability' : (f.choice || null);
      if (need) { showFeatChoice(char, f, need, rng, opts); return; }
      finishFeatPick(char, f.id, null, opts);
    }));
    grid.appendChild(card);
  }
  if (!eligible.length) grid.appendChild(h('p', 'muted', 'You have taken every feat.'));
  return grid;
}

export function openFeatPicker(char, opts = {}) {
  const overlay = div('overlay feat-picker');
  const panel = div('overlay-panel camp-sheet-panel');
  panel.appendChild(h('h3', 'accent', `🎖 Choose a Feat — ${char.name}`));
  panel.appendChild(h('div', 'muted', 'Feats replace an Ability Score Improvement. Each can only be taken once.'));
  panel.appendChild(buildFeatGrid(char, opts));
  panel.appendChild(div('row-center', btn('Cancel', () => overlay.remove(), 'subtle')));
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

function showFeatChoice(char, feat, kind, rng, opts) {
  const overlay = div('overlay');
  const panel = div('overlay-panel');
  panel.appendChild(h('h3', 'accent', `🎖 ${feat.name} — make a choice`));
  if (kind === 'ability') {
    const options = feat.halfAsi || ABILITIES;
    panel.appendChild(h('div', 'muted', 'Choose an ability to increase by 1:'));
    const grid = div('grid score-grid');
    for (const ab of options) {
      const card = div('card score-card');
      card.appendChild(h('div', 'card-title', ab));
      card.appendChild(h('div', 'score-value', `${char.abilities[ab]} → ${char.abilities[ab] + 1}`));
      card.addEventListener('click', () => { overlay.remove(); finishFeatPick(char, feat.id, ab, opts); });
      grid.appendChild(card);
    }
    panel.appendChild(grid);
  } else if (kind === 'element') {
    panel.appendChild(h('div', 'muted', 'Choose the element your magic pierces:'));
    const grid = div('grid score-grid');
    for (const el of ELEMENT_CHOICES) {
      const card = div('card score-card');
      card.appendChild(h('div', 'card-title', titleCase(el)));
      card.appendChild(h('div', 'score-value', { acid: '🧪', cold: '❄', fire: '🔥', lightning: '⚡', poison: '☠', thunder: '💥' }[el] || '✨'));
      card.addEventListener('click', () => { overlay.remove(); finishFeatPick(char, feat.id, el, opts); });
      grid.appendChild(card);
    }
    panel.appendChild(grid);
  } else if (kind === 'class') {
    panel.appendChild(h('div', 'muted', 'Learn from another class\'s spell list:'));
    const grid = div('grid class-grid');
    for (const cls of CLASSES) {
      if (!cls.spellAbility) continue;
      const card = div('card');
      card.appendChild(h('div', 'card-title', cls.name));
      card.appendChild(h('div', 'card-sub', `${cls.spellAbility} caster`));
      card.appendChild(btn('Learn from them', () => { overlay.remove(); finishFeatPick(char, feat.id, cls.id, opts); }));
      grid.appendChild(card);
    }
    panel.appendChild(grid);
  } else if (kind === 'skills') {
    panel.appendChild(h('div', 'muted', 'Pick three skills to become proficient in:'));
    const state = { picks: [] };
    const grid = div('grid loot-grid');
    const renderSk = () => {
      grid.innerHTML = '';
      for (const sk of Object.keys(SKILL_ABILITY)) {
        if (char.skills.includes(sk)) continue;
        const on = state.picks.includes(sk);
        const card = div('card' + (on ? ' selected' : ''));
        card.appendChild(h('div', 'card-title', sk));
        card.appendChild(h('div', 'card-sub', SKILL_ABILITY[sk]));
        card.addEventListener('click', () => {
          if (on) state.picks = state.picks.filter(s2 => s2 !== sk);
          else if (state.picks.length < 3) state.picks.push(sk);
          renderSk();
        });
        grid.appendChild(card);
      }
    };
    renderSk();
    panel.appendChild(grid);
    panel.appendChild(div('row-center', btn('Confirm', () => {
      if (state.picks.length !== 3) { toast('Pick exactly three skills.'); return; }
      overlay.remove();
      finishFeatPick(char, feat.id, state.picks, opts);
    }, 'primary')));
  }
  panel.appendChild(div('row-center', btn('Cancel', () => overlay.remove(), 'subtle')));
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

function finishFeatPick(char, featId, choice, opts) {
  if (!grantFeat(char, featId, choice, opts.rng || (G.run && G.run.rng))) {
    toast('That feat is already taken.');
    return;
  }
  document.querySelectorAll('.overlay').forEach(o => o.remove());
  toast(`🎖 ${char.name} takes ${FEAT_MAP[featId].name}!`);
  if (char.hero) Run.persistSave(G.meta);
  if (opts.onDone) opts.onDone(char);
}

function multiclassPickerInModal(c) {
  const run = G.run;
  const overlay = div('overlay');
  const panel = div('overlay-panel');
  panel.appendChild(h('h3', 'accent', `🎭 Multiclass ${c.name}`));
  panel.appendChild(h('div', 'muted', 'Take a level in another class. You keep your primary class features and gain the new class\'s kit.'));
  const excluded = new Set([c.cls.id, c.secondClass && c.secondClass.classId]);
  const grid = div('grid class-grid');
  for (const cls of CLASSES) {
    if (excluded.has(cls.id)) continue;
    const card = div('card');
    card.appendChild(h('div', 'card-title', cls.name));
    card.appendChild(h('div', 'card-sub', `HD d${cls.hitDie} · Saves ${cls.saves.join('/')}`));
    card.appendChild(h('div', 'card-desc', cls.desc));
    card.appendChild(btn('Take a level', () => {
      // consuming the PENDING level-up: the main class does not also level
      Run.applyPendingLevelUp(run, c.id, { type: 'multiclass', classId: cls.id });
      toast(`${c.name} is now ${c.cls.name} ${c.classLevel || (c.level - c.secondClass.level)} / ${cls.name} ${c.secondClass.level}!`);
      overlay.remove();
      campfireSheetModal(c);
    }));
    grid.appendChild(card);
  }
  panel.appendChild(grid);
  panel.appendChild(div('row-center', btn('Cancel', () => overlay.remove())));
  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  showOverlay(overlay);
}

// ============================== DEFEAT ==============================
export function defeatScreen() {
  const run = G.run;
  const meta = G.meta;
  const heroDead = run.party.find(c => c.hero && c.dead);
  const fled = !!G.lastRetreat;
  G.lastRetreat = false;
  const shards = run.shardsEarned;
  Run.endRun(meta, run, false, !!heroDead);

  const root = div('screen-center defeat');
  root.appendChild(h('h2', 'danger-title', heroDead ? '☠ THE HERO HAS FALLEN' : fled ? '🏳 RETREATED' : '💀 DEFEAT'));
  root.appendChild(h('p', 'flavor', heroDead
    ? `“In Avernus, death is the only certainty. ${meta.hero.name} joins the countless fallen.”`
    : fled
    ? `“Discretion is the better part of valor. ${meta.hero.name} lives to descend another day.”`
    : `“The party fought well, but the ${run.location ? run.location.name : 'depths'} claimed them all.”`));
  const stats = div('stat-row');
  stats.appendChild(statBox('⛰ Floors Cleared', run.floorsCleared));
  stats.appendChild(statBox('💎 Shards Banked', shards));
  stats.appendChild(statBox('💰 Gold Lost', run.runGold));
  root.appendChild(stats);
  const note = div('note');
  note.innerHTML = 'Everything looted on this run has been <b>erased</b>. Your hero build, shop relics and banked shards remain. Death is a lesson, not an ending.';
  root.appendChild(note);
  root.appendChild(div('row-center', btn('🏛 Return to the Hub', () => hubScreen(), 'primary huge')));
  Audio.sting('music/defeat', { vol: 0.85 });
  screen('defeat', root, { cls: 'defeat' });
}
