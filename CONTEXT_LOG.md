# AVERNUS DESCENT — PROJECT CONTEXT LOG
**Last updated:** 2026-08-19 (projectile blocking + object HP, `index.html` at **v=44**)
**Purpose:** This file is the complete hand-off document for continuing development.
A new chat can restore full context by reading this file (it lives in the workspace at
`/home/user/avernus-descent/CONTEXT_LOG.md`). Keep it updated at the end of every workstream.

---

## 0. The Project (one paragraph)

**Avernus Descent** is a complete 2D top-down, turn-based tactical roguelike (Baldur's Gate 3-style,
D&D 5e rules) built as a self-contained browser game at `/home/user/avernus-descent`. No build
framework — pure ES modules served statically by a zero-dependency Node server. Procedural
pixel-art with an optional drop-in art pipeline. It is **feature-complete** across ~11 major
workstreams; current mode is **polish / bugfix / content-drop mode**. The user play-tests the live
preview and reports bugs with exact details (tile coordinates, spells, classes).

## 1. The User's Core Spec (verbatim requirements — never regress these)

- Create a main character, pick a D&D 5e class, get 3 random party members, fight random battles.
- Any character that dies **stays dead**; if the main character dies you lose and restart with the
  character you already made.
- Meta progression via hub-world shop — gain shop money (**soul shards**) each floor cleared; shop
  sells persistent items you can bring on runs. **ALL run items are erased from inventory after the
  run**; items carry `persistent` flags (true = hub shop, false = run loot, RUN badge in UI).
- Topographic advantages: high ground bonuses, terrain cover.
- Floor locations: mountain pass, tavern, ship, town, depths of Avernus, etc. (9 total).
- Party levels up every 2 floors per 5e. Win a floor → loot random items.
- Win condition: survive 12 floors.

## 2. Communication Conventions (important for replies)

- The user is friendly/collaborative ("Awesome, thank you", "my friend", "you feel me?").
- They test by **playing the live preview** and report precise bugs (exact tile coords, exact
  spells/classes). Give **root-cause explanations** + bulleted "what changed" summaries.
- **Every ship message must end with a "hard-refresh (Ctrl+Shift+R)" reminder.**
- The user is a **5e rules stickler** — they asked twice to "double-check the rules of 5e just in
  case." When a mechanic is wrong, fix it to RAW and say so explicitly.
- The user will drop in **art assets and sound files** themselves; we provide slots, docs, tools.

## 3. Architecture (exact file map)

- `index.html` — only file with version stamp; `<script type="module" src="src/main.js?v=44"></script>` (**currently v=44** — bump each ship).
- `style.css` — theme + `#sound-toggle` (mute button, fixed top-right, M key).
- `tools/serve.js` — static server on port 8080, binds 0.0.0.0, sends `Cache-Control: no-store,
  no-cache, must-revalidate`; MIME map includes `.ogg/.mp3/.wav/.m4a/.flac` audio types (added in
  the sound workstream — do NOT remove them).
- `src/main.js` — boot: `G = {meta, hero, run, combat, debugUnlocked}` (debugUnlocked from
  `localStorage.getItem('avernus_debug')`), MutationObserver wires `combatScreenInputs()`. **Audio
  wiring lives here**: first-gesture `Audio.unlock()`, global click/hover/overlay-close/Escape-close
  sounds, mute button + M key.
- `src/rng.js` — `makeRng` (mulberry32), `uid`, `clamp`, `ordinal`, `weighted`, `sample`, `deepClone`.
- `src/data/`:
  - `races.js` — 9 races, `SKILL_LIST`, `SKILL_ABILITY`.
  - `classes.js` — 12 classes; `AST_LEVELS=[4,8,12,16,19]`; **`extraAsi: [6,14]` on fighter, `[10]`
    on rogue**; slot tables `FULL_CASTER_SLOTS`/`HALF_CASTER_SLOTS`/`WARLOCK_SLOTS`; `CANTRIP_COUNTS`.
  - `spells.js` — **101 spells**, `SPELL_MAP`, `SPELL_LISTS`, `cantripDmg`, ~35 `concentration: true`
    flags. (README says ~90; actual count is 101.)
  - `monsters.js` — 38 monsters keyed `goblin: {...}` with `id:'goblin'`, `shape` in `sprite`;
    `ELITE_TRAITS`, `XP_BY_CR`.
  - `items.js` — `WEAPONS` (33 incl. fists), `ARMORS`, `SHIELDS`, `ENCHANTMENTS` (tier field),
    `CONSUMABLES`, `SHOP_ITEMS` (10 relics, `persistent:true`), legendary `orin_dagger` /
    `blade_of_avernus` / `hellforged_plate`. All definitions stamped with `.id` at file end
    (lines ~220-224).
  - `locations.js` — 9 locations: `mountain_pass/tavern/ship/town/forest/dungeon/ruins/fey/avernus`,
    each with `ground` 3-palette, wall/cliff/obstacles/hazard (`fire/lava/water/brambles/grease/
    darkness/none`), monster tiers, bossPool, lootTable, flavor. `OBSTACLES` map (35 objects) with
    solid/tall/cover/hp/difficult/elevation flags.
  - `town.js` — `SHOP_TYPES` (weights + `pools` + martial category weighting `{weapon:5, armor:5,...}`,
    rare mindflayer/baal shops with `special` stock); 18 `TOWN_EVENTS` each with id/skill/dc/title/
    passText/failText/buff `{kind,name}` (kinds: speed/initiative/spellDC/damage/saves/attack/hp);
    `SPECIAL_GOODS.mindflayer_worm` transformation.
  - `hub.js` — `HUB_MAP`/`CAMP_MAP`/`TOWN_MAP` (rows legend: `#` wall, T tree, H house, F hearth,
    S statue, f fountain, ...), `spawn`, `exit`, `shopSpot`, `mercSpots`, `eventSpots`,
    `memberSpots`; NPCs dante/beatrice/virgil.
  - `features.js` — `FEATURE_DESCRIPTIONS`, `SUBCLASS_DESCRIPTIONS`, `STATUS_DESCRIPTIONS` (~55),
    `ABILITY_DESCRIPTIONS`, `SKILL_DESCRIPTIONS`, `featureDescription` with `normalizeFeatureName`.
  - `feats.js` — 29 feats, `FEAT_MAP`, `ELEMENT_CHOICES` (6 types), fields `halfAsi`,
    `choice: 'element'|'class'|'ability'|'skills'|null`.
  - **`sounds.js` — NEW (sound workstream):** `SOUND_SLOTS` (242 slots, registry = single source of
    truth), `SOUND_BASE='assets/sounds/'`, `SOUND_EXTENSIONS=['.ogg','.mp3','.wav']`,
    `DAMAGE_TYPES` (11 incl. `physical`), `SURFACES` (10), `surfaceForWalk`/`surfaceForLocation`,
    resolvers: `attackSoundClass` (slash/stab/blunt by dmgType), `weaponSwingCandidates` /
    `weaponHitCandidates` (per-weapon slot first, then shared by class; bows/crossbows/sling
    special-cased; fists→unarmed), `monsterSwingCandidates`/`monsterHitCandidates`, `spellCategory`
    (heal/buff/debuff/utility regexes incl. `UTILITY_SPELL_RE`), `spellCastCandidates` (per-spell →
    dmgType → role → cast_generic, deduped), `footstepCandidates`, `footstepsForWalk`/
    `footstepsForLocation`, `sceneSoundtrack(screenName, locId, isBoss)` → `{music, ambience}`
    candidate lists (returns `null` for overlay screens = keep current music).
- `src/5e/`:
  - `rules.js` — character math: `mod`, `effectiveAbility` (conSet/strSet/intSet trinkets),
    `classLevel(char)` vs `char.level` (total) — **classLevel/level split added for multiclassing**,
    `computeMaxHp`, `computeAc`, `computeSpeed`, `attackBonusFor`, `savingThrowMod`, `skillMod`,
    `canCastSpell` (prepared check; any slot ≥ spell level = upcastable; `char.featCasts[spellId]`
    free casts), `levelUpCharacter` (ASI gate `asiAtLevel(char, char.level, {primaryOnly:true})`),
    `asiLevelsForClass`, `asiAtLevel(char, level, opts)` (primaryOnly/secondaryOnly — **ASIs/feats
    are CLASS-level, never character-level**), `multiclassInto` (`{secondaryOnly:true}`),
    `grantFeat` (Fey/Shadow Touched → featCasts map + `featCastAbility`; Magic Initiate →
    featCantrips), `WILD_SHAPES` (bear/dire_wolf/wolf/giant_spider/badger/cat/rat),
    `wildShapeFormsFor`, `changeGearChar`/`gearInstanceOf`, `resetHeroBaseline`, `townMod`/
    `applyTownBuff`/`clearTownBuffs`.
  - `combat.js` — `makeUnit` (actionPoints/bonusPoints int economy, reactionUsed, martialArts,
    pamAttack, gwmOn/ssOn, movedTiles, attackedThisTurn, per-turn charger/piercer/savage/
    crusher/slasher flags), `hasAction/hasBonus/spendAction/spendBonus`, `startOfTurnReset`
    (refresh + haste + thief 2 bonus), `findPath` (clips to maxCost, partial path), `hasLOS`,
    `unitAc` (wildshape AC, cover, dodge), `coverFor` (opts.ignoreCover for Spell Sniper),
    `traceLine`/`firstProjectileBlocker`/`stampObstacleHp` (projectiles hit first body/object),
    `generateCombatMap` (18x12, elevation plateaus, hazards; scattered obstacles stamp HP), `spawnEncounter` (boss CR cap
    `crCap = 1.5*floor - 1`; boss `maxHp*1.5`), `attackRoll` (adv/dis, Halfling reroll 1s, Lucky
    reroll ≤10 spending luck), `pushPopup`, `pushFx`, `updateVision`. Combat object carries
    `locId`, `loc`, `floor`.
  - `combat_actions.js` — `applyDamage` (resist/vuln/immune; Elemental Adept pierces matching
    `featChoices.elemental_adept` at mult 0.5; Heavy Armor Master −3 nonmagical B/P/S in heavy
    armor; wild-shape HP pool with overflow revert; `opts.popupDelay` forwarded; regenSuppressed on
    fire/acid), `handleZeroHp` (Death Ward, Ring of Second Chances, dying: 2 saves stabilize at 1
    HP / 2 fails death; hit-while-down auto-fail), `weaponAttack` (hex rider split: hexBonus
    separate necrotic `applyDamage` with `{magical:true, popupDelay:1150}`), `castSpell` (upcast
    slot spend with fallback; featCasts; **null-target guard**; Eldritch Blast 1d10/ray, rays by
    level; Scorching Ray 2d6/ray), `tickStartOfTurn`, `tickStatuses` (fire/lava hazard damage),
    `healUnit` (ends dying), `endTurn` (**round-wrap via `wrapped` flag**, not turnIndex===0),
    `finishCombat` (stabilize downed at 1 HP), `wildShapeInto/attachWildShape/revertWildShape/
    wildShapeAttack`, `recastHex`, `recastMoonbeam` (`MOONBEAM_MOVE_TILES=12`), `scheduleSpellFx`, `enemyOpportunityAttack`, `pushUnit`
    (shove off cliffs/overboard), `overboard()`.
  - `turn.js` — `performAction` (wait/move/moveTo/dash/dodge/hide/attack/cast/useItem/ability/
    power/shove/recast_hex/recast_moonbeam/equip_weapon/unequip_weapon/equip_armor/unequip_armor/equip_trinket/
    unequip_trinket; `ABILITY_COST` map + dynamic `abilityCost()` for wild_shape; guards log "No
    action points left..." and return; `noCost` bypass for reactions; wild-shaped blocks cast/items;
    monk martial_arts; PAM pamAttack), `useAbility` (rage/second_wind/action_surge +1 point/
    flurry/patient_defense/step_of_wind/lay_on_hands/channel_divinity/bardic_inspiration/
    wild_shape/revert_wild_shape/mind_blast/divine_smite with **slot refund on miss**/
    stunning_strike/trip_attack/martial_arts/pam_butt/shield_shove/toggle_gwm/toggle_sharpshooter/
    breath_weapon), `monsterAttack` (feat riders crusher/slasher, Defensive Duelist +3AC reaction),
    `useMonsterPower` (fire_breath/acid_breath/mind_blast/petrifying_gaze...).
  - `ai.js` — `chooseEnemyAction` (flee if frightened, breath when 2+ in cone, powers, ranged kite
    + high-ground `bestRangedSpot`), `planEnemySteps`/`performEnemyStep`/`executeEnemyTurn`
    (synchronous fallback for tests), `reactionPromptsForStep` (PAM entering-reach; Sentinel
    ignores disengage; War Caster cantrip), `reactionPromptsAfterStep` (Hellish Rebuke),
    `playerMeleeReach` (fists = 1).
- `src/game/`:
  - `run.js` — `newRun` (resetHeroBaseline → applyHubGear → level to startLevel (Veteran's
    Manual=3) → clearPendingChoices → **FULLY READY block**), `levelUpParty`, pending chooser
    helpers, `rollTown`/`generateTownStock`, `buyTownItem`, `hireRecruit`,
    `transformIntoMindFlayer`, `doLongRest`, `rollTownEvent`/`bestForSkill`, `togglePrepared`,
    `activeFighters`/`toggleActive` (4 cap), `tradeGear`, `saveHubGear`/`applyHubGear`, `endRun`
    (wipes non-persistent inventory/trinkets/armorEnchant; resetHeroBaseline sets level=1,
    classLevel=1, feats=[], featChoices={}, featSaves=[], featSpells=[], featCantrips=[],
    featCasts={}, featCastAbility=null, gearBag=[], secondClass=null, transformed=null),
    `shortRestParty` (Durable min-heal), `SAVE_KEY`, memStore localStorage fallback.
  - `walk.js` — walkable scene state machine (`createWalk`, `addNpc`, `isWalkable`, `tryMove`,
    `npcNear`, `findWalkPath`, `findWalkPathToNpc`). **Footstep sound on successful `tryMove`**
    (sound workstream).
  - **`audio.js` — NEW (sound workstream):** Web Audio engine. `play(candidates, opts)` — candidate
    list, first file that exists wins (.ogg→.mp3→.wav), 404-cached as missing, silent no-op
    without window/AudioContext/fetch. Channels sfx/music/ambience → master. Throttle per slot
    (default 40ms, footsteps 95ms). Jitter (pitch), delay(ms), vol, rate, loop, fade.
    `setScene(screenName, locId, isBoss)` crossfades looping music/ambience (1.1s fades) — called
    from `ui.js screen()`. `sting()` = one-shot through music channel (victory/defeat).
    Semantic helpers: `footstep/footstepWalk/footstepCombat`, `weaponSwing/weaponHit`,
    `spellCast`, `grunt()` (grunt_1-3 random). `unlock()` (first gesture), `init()`,
    `muted()/toggleMute()/setVolume()/getVolume()`, `preloadCommon(screen, locId, isBoss)`,
    `slotCount()`. Prefs in `localStorage['avernus_audio']`; defaults master 0.9 / sfx 0.8 /
    music 0.5 / ambience 0.4. FADE_MS = 1.1.
- `src/render/`:
  - `sprites.js` — `TILE_SIZE=28`, `SPRITE_W=20`, `SPRITE_H=24`; `UNIT_DISP_W = {tiny:18,
    small:21, medium:24, large:31, huge:35}`; `UNIT_ART_MAX_H` (18→1.6, 21→1.7, 24→1.8, 31→2.1,
    35→2.4 — was 3.2×, caused "wolf hat" bug); `UNIT_ART_RES=2`; `drawImageCover` (smooth when
    scale<0.75); `drawUnitArt` (bottom-anchored contain with trimBounds source rect); `drawTile`
    (3 layers: tiles/* art, objects/* art replaces procedural obstacle, hazard art overlays; border
    walls procedural unless wall art); sprite cache key includes artId; `_isArt/_hasArt/_dispW/_dispH`.
  - `assets.js` — `BASE='assets/'`; imageCache/pending/trimCache; `loadAsset` (cache-backs 404 as
    null, `onAssetsChanged` notifies live re-render); `assetStatus(path)`; `tileAssetPaths(locId,
    tile, loc)` with `pick()` primary (`loc.artId||locId`) vs `fallbackArtId`, house/wall special
    cases; `unitAssetPaths` uses `char.templateId||char.monsterId||char.id` (**no shape fallback**);
    `trimBounds` (alpha scan, 4M px cap, tainted-canvas tolerant); `preloadAll`/`preloadPaths`/
    `hasUncachedAssets` (manifest fetch).
- `src/ui.js` (~4200+ lines) — `screen()` (clears overlays + **ui/close sound if overlays were
  open** + **routes `Audio.setScene`**), `titleScreen` (primary long-press → `unlockDebugConsole()`;
  quick click → `enterHubWithArt()` with loading screen + progress bar, which also calls
  `Audio.preloadCommon('hub',...)`), `hubScreen/campScreen/townScreen` → `walkScene()` (D-pad/E
  interact/click auto-walk; **footstep on each auto-walk step**), `combatScreen`/`render`
  (painter's algorithm `sortedUnitsForRender`, popups `popupAge`, spell fx beams/proj/rings/cones),
  radial menus (`openRadial('root'|'actions'|'bonus')`, `closeRadial(silent)` — **open/close
  sounds**), `openSpellbook` (upcast `<select>`, long-press `showSpellDetail`, recast-hex row, recast-moonbeam row),
  `showInspectModal`, `buildEquipmentUI` (combat equip costs action via `doGearAction`; camp free +
  Give-to trade), `campfireSheetModal`, `openFeatPicker`/`buildFeatGrid`, `levelUpScreen`
  (**ui/levelup sound**), debug console (Tab; skip floor/win/heal/gold/shards/level up/clear/close),
  `victoryScreen` (**music/victory sting + items/chest_open + items/gold**), `defeatScreen`
  (**music/defeat sting**), `showOverlay(overlay)` helper (**ui/open sound** — used by ALL 20
  modal append sites), `sortedUnitsForRender`, `popupAge`, `openLineupOverlay`,
  `showReactionModal` + `driveEnemySteps`, `startCombat` (**combat/start sound**), `toast`.
  ⚠ **LESSON LEARNED:** never blanket-`sed` `document.body.appendChild(overlay)` → it rewrote the
  new `showOverlay` helper itself (infinite recursion). When sed-editing ui.js, always verify the
  helper body afterwards. The fix: `showOverlay(overlay) { document.body.appendChild(overlay); Audio.play('ui/open', ...); }`.

## 4. Assets (drop-in pipelines — the user supplies files)

### Art (`assets/`, user drops PNGs)
- `assets/manifest.json` (278 slots), `node tools/gen_manifest.js` regenerates.
- Folders: `assets/tiles|objects|units/` (e.g. `assets/units/goblin.png`). Drop-in loader replaces
  procedural art; missing = procedural fallback; 404s remembered (refresh to pick up new files).
- Master generation prompt: **`ASSET_PROMPT.md`** (every filename listed) — give this to the user
  if they need to (re)generate art.
- `assets/README.md` documents the slots.

### Sound (`assets/sounds/`, user drops audio files) — NEW
- **242 named slots** across 9 folders: `music/ ambience/ ui/ combat/ weapons/ spells/ footsteps/
  units/ items/`. `.ogg` preferred; `.mp3`/`.wav` also accepted.
- **`assets/sounds/README.md`** = the human drop-list (folder tree, formats, fallback chains,
  starter pack of 14 core files, the full 242-file list with ★core/·optional markers). This is the
  file to present when the user asks about sounds.
- `assets/sounds/manifest.json` = machine-readable (paths + descriptions + optional flags).
- Tooling: `node tools/gen_sound_manifest.js` (regenerate both), `node tools/check_sounds.mjs`
  (coverage report + orphan-file detection).
- Engine tries candidate chains: per-weapon → shared swing/hit by damage class → combat/hit_flesh;
  per-spell → damage-type → role (heal/buff/debuff/utility) → cast_generic; per-location footsteps
  → surface → generic; music per-location → generic, boss first.
- Sound triggers wired: all UI clicks/hovers/panel open-close, weapon swings/hits/misses/crits,
  every spell cast (players, enemies, scrolls, reactions), hex tick (delayed 1150ms, synced with
  popup), potion drink/throw + glass break (+fire/acid/radiant burst), footsteps (walk + combat,
  throttled), grunts (≥5 dmg hits), deaths, rages (roar), breath weapons (roar + element),
  wild shape (shapeshift), shove/fall/prone, hazards (fire/lava/brambles/grease/water), combat
  start, victory/defeat stings, level-up fanfare, loot chest + coins, equip/error sounds.

## 5. Completed Workstreams (chronological arc — all verified by tests)

1. **Founding spec**: hero creation (race/class/subclass/standard array), 3 random companions,
   permadeath + hero-death ends run, soul-shard hub shop (10 `persistent:true` relics), run items
   `persistent:false` (RUN badge, wiped at run end), terrain (high ground +1/level to-hit, +2 AC
   defend; low cover +2; hazards), 9 themed locations incl. Avernus (floor 6+), level-up every 2
   floors, loot after each floor (boss floors better), 12-floor win.
2. **Bugfixes**: New Hero crash (createTextNode); `HD undefined`; monster HP parser NaN; findPath
   partial-path clipping; `unitAc` monster branch; map round-wrap (`wrapped` flag); `CS.mode` stale
   'enemy' → dead clicks; inverted fire-bolt enemy validation; prepared-spells wipe of feat spells;
   ASI by total level → **by class level**; new-run hero starting damaged (FULLY READY block);
   multiclass double-leveling (pending-level consumption + classLevel split); meta-test troll
   stalemate via missing round wrap; Eldritch Blast 2d6→1d10/ray; hex missing on spell attacks;
   Misty Step fizzle (null-target guard); castSpell slot-spend in canCastSpell (upcasting).
3. **Systems**: long-press inspect modal; radial menu (green/orange/grey + int action economy);
   spellbook (inline dice, long-press dictionary for all ~101 spells, upcast selector with dice
   previews); floating damage numbers (type colors, immune/heal/miss, **sequential delayed popups**
   via popupAge/popupDelay); campfire sheets + level-up notifications + multiclass + subclass-at-3
   + prepared spells (cleric/druid/wizard) + equipment management (equip/unequip costs action in
   combat, free at camp, Give-to trading) + trade; reactions (OA prompts pausing enemy turns,
   Hellish Rebuke, War Caster cantrip, PAM entering-reach, Sentinel anti-disengage + freeze, auto
   enemy OAs); walkable hub/camp/town (Dante/Beatrice/Virgil; WASD/E/click-to-walk); town every 3
   floors (long rest, hire mercs, 9 biased shop types incl. rare mindflayer/baal, 18 skill-check
   events with ±1 buffs until long rest); lineup management (4 active); hub gear persistence via
   Virgil; debug console; 29 feats with real mechanics (GWM/SS toggles, PAM, Sentinel, War Caster,
   EA, HAM, Lucky, Charger, Mobile, Resilient, Magic Initiate/Fey/Shadow Touched free casts); hex
   recast ("Recast Hex" bonus action, no slot) + hex 1d6 necrotic on ANY attack roll as separate
   delayed event; feats/ASI by class level; wild shape (form modal, separate HP pool, sprites,
   revert).
4. **Art pipeline**: ASSET_PROMPT.md, manifest (278 slots), drop-in loader, cover-fit/trim/
   bottom-anchor/2× res/size-category display, bandit-art bug (templateId + cache key artId),
   walk-scene fallback tilesets (hub→town, camp→forest), loading screen (preloadAll, progress bar,
   enterHubWithArt gate), live re-render via onAssetsChanged.
5. **Sound system (NEWEST)**: everything in sections 3–4 above. Version bumped to v=39.

## 6. Key Timings / Constants (don't break these)

- Long-press threshold 550 ms; popup dur 1100; hex `popupDelay: 1150` (sound synced to it);
  enemy turn 480 ms delay + 200 ms step gap; debug console key `avernus_debug`.
- Damage popup colors (`POPUP_STYLES` in ui.js): fire `#ff6a2a`🔥, cold `#6ac2ff`❄,
  acid `#7ae05a`🧪, lightning `#ffe83c`⚡, thunder `#f0a848`💥, poison `#c87ae8`☠,
  radiant `#fff2a0`✨, necrotic `#a06ae8`💀, psychic `#f07ad8`🧠, force `#5ae0e8`💫,
  slashing `#e8e8f0`⚔, piercing `#c8d0e0`🗡, bludgeoning `#c8b898`⚒; miss `#d8d8e0`;
  heal `#6ae08a`💚; immune `#9a9aa8`.
- Action economy: 1 action + 1 bonus per turn; Action Surge `actionPoints += 1`; Haste +1 point &
  doubled move; Thief (rogue 3+) `bonusPoints = 2`.
- Death saves: 2 fails = death, 2 successes = stabilize at 1 HP; healing ends dying; all-down ends
  combat in defeat.
- 5e milestones: ASI/feat by CLASS level — base 4/8/12/16/19, fighter +6/14, rogue +10;
  `asiAtLevel(char, level, {primaryOnly|secondaryOnly})`.
- Audio: fade 1.1s; default vols master .9/sfx .8/music .5/ambience .4; footstep throttle 95ms.

## 7. Data Counts to Preserve (tests partially enforce these)

9 locations · 35 objects (OBSTACLES) · 38 monsters · 12 classes · 29 feats · 18 town events ·
10 shop items · 101 spells · 33 weapons + fists · **242 sound slots** · 278 art slots.

## 8. Deploy Ritual (EVERY ship — never skip)

1. Fix code.
2. Run the **full battery** (below) — all must exit 0. Reinstall jsdom first if the suites fail
   with `ERR_MODULE_NOT_FOUND: Cannot find package 'jsdom'` → `npm install jsdom@24 --no-audit
   --no-fund` (jsdom does NOT persist across turns; this is expected nearly every turn).
3. Bump `index.html` version stamp (`?v=N` → `?v=N+1`). Currently v=44 → next is v=45.
4. `node tools/build.js` (regenerates dist/; it also runs a 40-battle headless sim).
5. Restart server if dead (server processes do NOT persist across turns): use the process tool,
   cwd `/home/user/avernus-descent`, command `node tools/serve.js`, port 8080. Kill old:
   `pkill -f "tools/serve.js"` if it's stale (it can be stale because serve.js code changes — e.g.
   MIME map — require a restart).
6. Verify: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/index.html` → 200.
7. Reply with root-cause + "what changed" bullets + **hard-refresh (Ctrl+Shift+R)** reminder.

### Full test battery (27 suites)
```bash
cd /home/user/avernus-descent
fails=0; for t in meta_test dom_test flow_test inspect_test radial_test economy_test spellbook_test popup_test reaction_test campfire_test features_test console_test fixes_test spellfx_test gear_test walk_test sheetclick_test feats_test asset_test loading_test layering_test hex_test sounds_test moonbeam_test projectile_test hide_test; do node tools/$t.mjs >/tmp/t_out.txt 2>&1; c=$?; if [ $c -ne 0 ]; then fails=$((fails+1)); echo "FAIL $t"; grep -v "scrollTo\|not-implemented\|at \|module.exports" /tmp/t_out.txt | tail -4; fi; done; node tools/headless.js >/tmp/h_out.txt 2>&1; hc=$?; echo "27 suites: $fails failures · headless exit $hc"
```
(jsdom suites print harmless `window.scrollTo` not-implemented warnings — ignore those; only exit
codes matter. Do NOT run suites through `headless.js` — that file is its own suite.)

## 9. Known Pitfalls & Lessons (avoid re-learning)

- jsdom doesn't persist across turns (see ritual).
- Server doesn't persist across turns (see ritual). Also kill stale servers before starting a new
  one, or serve.js changes won't be live.
- `screen()` in ui.js is the single choke point for music routing — any new screen gets music for
  free; overlay screens return `null` from `sceneSoundtrack` and keep current music.
- Audio engine is fully no-op safe in node/tests (no window/fetch/AudioContext) — never let an
  audio call throw outside `audioAvailable()` guards.
- `weapons/{id}` slot exists for every WEAPONS key + `fists`; per-spell slot exists for all 101
  spells; per-location footsteps/music/ambience slots exist for all 9 locations. Tests enforce
  these — if you add a weapon/spell/location, add its sound slot (the registry generates them
  automatically from data files, so just regenerate the manifest).
- `spells/heal` is BOTH the level-6 Heal spell's slot and the shared heal fallback — shared
  fallback slots are registered BEFORE per-spell slots so the per-spell description wins; chains
  are deduped.
- Blanket sed edits on ui.js are dangerous (see showOverlay recursion incident).
- The user hard-refreshes after every ship; they WILL report stale-UI bugs if the cache bump or
  server restart was missed.

## 10. Current State / Next Steps

- **Where we are:** Hide LOS + physical projectile FX shipped at v=44. All 27 suites green.
- **Hide / LOS (v=44):** Hide fails if a foe can see you clearly (5e). Hidden units keep stealth while moving out of sight; stepping into a revealed enemy's vision (or an enemy walking into a viewing angle) spots them. While hidden, revealed enemies paint their line of sight. Rogue 2+ Cunning Action Hide is a bonus action. Tests: `tools/hide_test.mjs`.
- **Weapon projectiles (v=44):** Bows/crossbows/slings fly as arrow darts; javelins and thrown weapons as thrown shafts — same FX system as spells.
- **Title screen (v=42):** Full-bleed `assets/ui/title_screen.png` + veil + ember motes + gold gradient wordmark. Existing title buttons (Continue / New Hero, long-press debug unlock, How to Play, reset) are unchanged — only restyled.
- **Projectiles / objects (v=43):** Ranged weapons, thrown weapons (dist > 1), thrown items, spell attacks, magic missile, and AoE-on-a-path now hit the first living body or blocking object (friendly fire). Mental/save spells (Hex, Hold Person, Sacred Flame, Vicious Mockery, Toll the Dead) are not projectiles. Destroyable objects stamp HP from `OBSTACLES`, have material resist/vuln/immune, sized HP bars, and inspect details. Walls/rifts/cliffs/flowers stay special-cased. AI skips shots that would hit an ally or object first. Tests: `tools/projectile_test.mjs`.
- **Moonbeam recast (v=40/v=41):** While concentrating, **Recast Moonbeam** is an action with
  **no spell slot**. Moves the beam up to 12 tiles (60 ft). Newly covered creatures take the
  radiant save. v=41 adds the same hover AoE circle (plus tile fill) the first cast uses.
  Engine: `recastMoonbeam` + `MOONBEAM_MOVE_TILES`; turn action `recast_moonbeam`; UI row +
  `drawAimOverlay` recast branch. Tests: `tools/moonbeam_test.mjs`.
- **Expected next requests:** new bug reports (with exact coordinates/classes/spells), requests to
  adjust sound slots/volumes/wiring, possibly art refinements, or new feature ideas. Follow the
  ritual + conventions above.
- **When the user drops sound files:** run `node tools/check_sounds.mjs` to confirm coverage;
  remind them to hard-refresh so the 404 cache clears.
- **End of every workstream:** update THIS file (date + version bump + what changed), then ship.

## 11. How to Resume in a New Chat

Start a new conversation and say something like:
"Continue the Avernus Descent project at /home/user/avernus-descent. Read CONTEXT_LOG.md first.
Here's the new issue: ..."
The workspace (including this file) persists across chats, so the next agent has everything it
needs: architecture, conventions, ritual, pitfalls, and current state.
