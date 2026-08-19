# ⚔ Avernus Descent

A 2D top-down, turn-based tactical roguelike built on **D&D 5e rules** — inspired by Baldur's Gate 3 and classic roguelikes. You forge a hero, descend through random battle floors in ever-changing locations, loot what you can, and spend your soul shards on things death cannot take.

**Play it:** run `node tools/serve.js` and open `http://localhost:8080` — or just serve the folder with any static server (pure ES modules, zero dependencies, no build step).

---

## Core Loop

1. **Forge your hero** — pick a race and one of the **12 core 5e classes** (with subclasses), assign standard-array ability scores, name them.
2. **Recruit 3 random companions** — race, class and subclass rolled for you every run.
3. **Fight random battles** on a grid. 5e combat: actions, bonus actions, movement, attack rolls vs AC, saving throws, advantage/disadvantage, critical hits, spell slots, concentration, conditions, death saves.
4. **Every 2 floors, your party levels up** per 5e (features, spell slots, ASIs at 4/8/12/16/19).
5. **Win a floor → loot.** Choose 1 of 3 (or 4) random treasures: enchanted weapons, armor, trinkets, potions, scrolls. Boss floors (every 3rd) drop better loot.
6. **Survive 12 floors** to win the run.

## Permadeath & Meta Progression

- **Any character that dies stays dead.** Companions are gone for good. Downed heroes roll death saves (3 rounds to save them — *Revivify* works mid-battle!).
- **If your hero dies, the run is over.** You restart with the same hero build, level 1.
- **Soul shards** are banked every time you clear a floor — spend them in the **hub shop** on persistent relics that apply to every future run.
- **Every item carries a `persistent` flag:**
  - `persistent: true` → hub-shop relics (Alchemist's Belt, Tymora's Coin, Ring of Second Chances, Infernal Contract, …) survive everything.
  - `persistent: false` → **everything looted during a run is erased when the run ends**, win or lose. The UI marks run items with a `RUN` badge and shop items with a `PERSISTENT` badge.

## Spells: Upcasting & Animations

Every spell now has a **visual effect**: Eldritch Blast fires a red beam, rays and orbs arc to their targets with impact bursts, Fireballs expand in colored rings, cones and lines flash across their tiles, heals pulse green, buffs glow gold, and Misty Step puffs at both ends of the teleport. Leveled spells can be **upcast** from the spellbook — a "Cast at" selector lists every slot level you can afford with live dice previews (Fireball 3rd · 8d6 → 4th · 9d6). Self-mode utility spells (Misty Step, Bless, Aid…) now resolve properly, and teleport spells highlight every legal destination tile in range.

## Wild Shape, Death & the Town

**Wild Shape** turns druids into beasts with their own sprite, character sheet, form HP pool, stats and attacks — no spells while shaped, Revert Form any time, and when form HP hits 0 the druid reverts with overflow damage carrying over. **Death saves**: at 0 HP you roll saves each round — two failures and you die; any healing ends the count. **Every 3rd floor the campfire becomes a town**: long rest (resets blessings), hire mercenaries into a roster (fight any 4), themed shops (blacksmiths skew to steel, archery to bows, magic to scrolls; rare Mind Flayer and Bhaal shops sell a transformation worm, Orin's Dagger and legendary gear), and townspeople skill checks — 18 scenarios, pass for a party-wide +1 until the next long rest, fail for −1. Clerics/druids/wizards prepare spells at camp; anyone can multiclass on level-up.

## Walkable Hub, Camp & Town

The hub, campfire and town are now **walkable scenes**: move your hero with WASD/arrows or click-to-walk, then talk to NPCs with E (or click them). In the hub, **Dante Alighieri** begins the run, **Beatrice** runs the persistent soul-shard shop, and **Virgil** keeps your run records and lets you configure your **starting equipment** (saved for every future run). In towns, themed shopkeepers, mercenaries and townspeople await; your party members stand around at camp and in town for sheets, gear, prepared spells and trading — and a Lineup overlay manages who fights.

## Feats & ASIs Follow Class Level (5e)

Ability Score Increases and feats are class features keyed to **class level**, exactly as in 5e: every class earns them at class levels 4/8/12/16/19, fighters additionally at 6 & 14, rogues at 10. Multiclassing never changes those milestones — a Wizard 3 / Barbarian 1 (character level 4) earns nothing until one of those classes reaches its own milestone; a second-class Fighter still earns its ASI at Fighter 4.

## Feats 🎖

At ASI levels (4/8/12/16/19) you can take a **feat instead of the ability score increase** — on the hero's level-up screen and at the campfire for companions. 29 feats with real combat mechanics: **Great Weapon Master / Sharpshooter** (radial toggles for -5/+10 power attacks), **Polearm Master** (entering-reach opportunity attacks + butt strike), **Sentinel** (disengage-proof, movement-stopping OAs), **War Caster** (cantrip OAs, concentration advantage), **Elemental Adept** (pierce resistance), **Heavy Armor Master** (-3 B/P/S), **Lucky** (auto-rerolls), **Mobile**, **Charger**, **Tough**, **Resilient**, **Magic Initiate / Fey Touched / Shadow Touched** (spells with once-per-floor free casts) and more. Feats appear on character sheets as clickable chips with full descriptions.

## Interactive Character Sheets

Every character sheet is fully clickable: **spells** open their complete dictionary entry (dice, saves, scaling), **class features and subclasses** open their rules description, **conditions and buffs** explain exactly what they do (with remaining duration), and **ability scores and skills** show what they govern and your current bonus. New runs always start with your hero fully healed, temporary HP cleared, and every spell slot and resource point full.

## Equipment Management

Loot no longer destroys your old gear: picking up a new weapon/armor equips it and puts the replaced piece into your **gear pack**. Character sheets now have an interactive Equipment section — take gear on and off, and (at the campfire) **trade** it to any party member with Give-to. During a fight, equipping or removing gear costs **1 action point**; between floors it's free.

## Hex Damage & Display

Hex deals its **1d6 necrotic damage as its own separate hit** on ANY attack that lands — weapon strikes *and* spell attacks like Eldritch Blast and Fire Bolt (per 5e, Hex triggers on attack rolls; saving-throw spells are exempt). Strike a hexed foe and you'll see `5⚔` float up, fade, then `1💀` appear — one number at a time, with necrotic resistance applying separately.

## Hex Damage & Display

Hex now deals its **1d6 necrotic damage as its own separate hit**: strike a hexed foe with your rapier and you'll see `5⚔` float up, fade away, and *then* `1💀` appear — one number at a time, with the curse applying necrotic resistance separately, as in 5e.

## Hex Re-Casting

Warlocks (and anyone with Hex) follow the 5e re-targeting rule: once the cursed target drops, the spellbook's **Bonus Spells** list gains a **Recast Hex** entry — move the curse to a new living enemy as a bonus action with **no spell slot spent**, keeping your concentration.

## Reactions & Opportunity Attacks

When an enemy moves out of a character's melee reach, the enemy's turn **pauses** and a reaction popup lists every usable reaction at that moment (Opportunity Attack with the equipped weapon, Hellish Rebuke for struck warlocks, …). Pick one or pass, and the enemy turn resumes. Enemies also get automatic opportunity attacks when *you* leave their reach. Reactions refresh each round.

## Campfire & Leveling

At the campfire, click any party member for their full character sheet, inventory and spellbook. Level-ups queue as pending choices (ability score increases, bonus spell picks, subclass paths at level 3) with a notification banner — and any character can **multiclass** into another class instead of leveling their main one.

## Topography Matters

- **High ground**: +1 to ranged attack rolls and damage per elevation level; defenders on high ground get +2 AC vs attackers below.
- **Low cover** (tables, crates, logs, rubble): +2 AC vs ranged attacks when between you and the shooter.
- **Tall obstacles** (walls, trees, pillars): block movement and line of sight.
- **Hazards**: fire, lava, brambles, grease, smoke, deep water (you can be *shoved overboard*!), and darkness floors that limit vision.
- Spells interact with terrain: *Wall of Stone* raises real cover, *Wall of Fire* / *Spike Growth* / *Web* / *Grease* reshape the battlefield, *Thunderwave* pushes enemies into hazards.

## The 9 Locations

Mountain Pass ⛰ · Brawling Tavern 🍺 · Sea of Swords ⛵ · Burning Town 🏘 · Whispering Woods 🌲 · Sunken Crypt 💀 · Crumbling Ruins 🏛 · Faerie Glade 🧚 · **The Depths of Avernus** 🔥 (unlocks at floor 6).

## Debug Console (secret)

**Long-press** the title screen's main button to unlock a debug console (persists in localStorage). In a run, press **TAB** to open it. Commands: `skip floor` (auto-win the current floor), `heal`, `gold <n>`, `shards <n>`, `level up`, `help`, `clear`, `close`.

## Sound & Music 🔊

Full audio system with **242 named sound slots** across 9 folders — drop files into `assets/sounds/` and the game plays them automatically. **Missing files are skipped silently**, so the game runs fine with zero sounds, a handful, or everything.

- **UI**: click, hover, open/close, error, equip, gold, level-up
- **Weapons**: shared slash/stab/blunt swings & impacts + optional per-weapon files (33 weapons) + bow/crossbow/sling/arrow/unarmed
- **Spells**: one slot per spell (~101) with fallback chains (damage type → heal/buff/debuff/utility → generic)
- **Items**: potion drink, potion throw, glass break, scroll, chest, coins
- **Footsteps**: per-location override → per-surface (stone/wood/grass/…) → generic
- **Creatures**: grunts ×3, death, roar, shapeshift
- **Music**: title/hub/camp/town/combat + per-location combat themes + boss + victory/defeat stings, crossfading
- **Ambience**: optional per-scene looping beds layered under the music
- **Controls**: **M** key or the 🔊 button (top-right) toggles mute; volumes persist

The complete drop-list with every filename lives in **`assets/sounds/README.md`** (also generated into `assets/sounds/manifest.json`). Coverage report: `node tools/check_sounds.mjs`.

## Contents

```
index.html, style.css   — shell + dark-fantasy UI theme
src/
  rng.js                — seeded RNG utilities
  data/                 — races, 12 classes, ~90 spells, bestiary, items, locations, shop
  5e/
    rules.js            — 5e math: abilities, proficiency, AC, HP, leveling, gear
    combat.js           — grid, initiative, LOS, cover, elevation, pathfinding, encounters
    combat_actions.js   — attacks, spells, conditions, concentration, death, damage
    turn.js             — action executor (players & monsters share it)
    ai.js               — enemy AI: breath weapons, focus fire, kiting, powers
  game/run.js           — runs, floors, loot, hub shop, persistence
  game/audio.js         — Web Audio engine: SFX, crossfading music, mute, volumes
  game/walk.js          — walkable-scene state machine (hub/camp/town)
  data/sounds.js        — sound registry: all 242 slots + fallback chains
  render/sprites.js     — procedural pixel-art tiles & unit sprites (no assets)
  ui.js                 — every screen + combat HUD
  main.js               — boot
tools/
  serve.js              — zero-dependency static server
  headless.js           — engine battle simulation test
  meta_test.mjs         — meta loop test (runs/loot/levels/shop)
  dom_test.mjs          — UI smoke test with a DOM stub
  gen_sound_manifest.js — writes assets/sounds/manifest.json + the drop-list README
  check_sounds.mjs      — prints sound coverage (which slots have files)
  sounds_test.mjs       — sound registry + resolution + engine safety suite
```

## Tests

```bash
npm test            # 40 simulated battles across all locations & floors
node tools/meta_test.mjs
node tools/dom_test.mjs
```
