# 🎨 MASTER ASSET-GENERATION PROMPT — Avernus Descent

*Hand this entire document (or one section at a time) to an image-generation AI. Generate each asset as its own PNG using the exact filenames below. Drop the files into the game's `assets/` folder and they replace the placeholder art automatically — no renaming, no cropping, no code changes.*

---

## 1 · ROLE & STYLE BRIEF

You are the lead pixel artist for **Avernus Descent**, a dark-fantasy, 2D top-down, turn-based tactical RPG (D&D 5e, Baldur's Gate 3-inspired). The mood is grim: dying torchlight, deep shadows, gold accents, infernal heat.

**Style rules — apply to EVERY asset:**

1. **Pixel art**, consistent pixel grid — no mixed resolutions within a sheet.
2. **Top-down floor tiles** (viewed straight down). **Characters, creatures and objects are "billboard" style** — viewed from a ~¾ top-down angle, facing the camera, with a subtle dark drop shadow beneath them, like classic tactical RPGs (Baldur's Gate 1/2, Divinity, Tactics Ogre).
3. **Dark outlines** (1px, near-black) around all sprites and objects so they read against any floor.
4. **Palette discipline**: no more than 4–5 shades per material; colors must harmonize across ALL assets (global accent colors: ember-orange `#ff7a2a`, cold-ice `#6ac2ff`, gold `#c9a227`, blood-red `#b3201f`).
5. **Transparent backgrounds** (PNG, alpha) on every file. No margins, no baked-in grid lines, no baked-in health bars, selection rings or UI — the game draws those itself.
6. **Lighting consistent per location**: each location has a mood (given in its section). Match it.
7. Assets may be generated at **2× resolution** (tiles 56×56 px, units 40×48 px) for crispness — the game scales them to fit. Keep the extra resolution "pixel-perfect" (each 2×2 block acts as one pixel; no smooth/blurry upscaling artifacts).
8. **Sizes and aspect ratios are flexible**: the game **cover-fits** floor tiles (fills the tile, crops overflow, never squishes) and renders **characters and creatures bottom-anchored at their TRUE aspect ratio** — transparent padding is auto-trimmed, the figure is contain-fitted (never stretched, never cropped), and it rises naturally above its tile with its feet on the ground. Square, portrait or full-body images all work. Keep the subject **centered in the canvas**; a little transparent padding is fine (it gets trimmed automatically), but avoid text, frames, or watermarks.

**CRITICAL — File naming:** each asset must be exported with the **exact filename** written next to it. The game's engine looks up these names directly. A wrong name = the game falls back to its placeholder art.

---

## 2 · OUTPUT FORMAT

For every asset below, produce:

```
filename.png — the exact name shown in the list
```

- One PNG per asset (individual files, NOT a sprite sheet).
- 56×56 px for tiles and objects, 40×48 px for units (or exact 2× multiples of the game's 28×28 / 20×24 grid).
- Transparent background, asset centered, touching no edges.
- No text, no watermark, no border in the image itself.

---

## 3 · LOCATION TILESETS

Nine locations. For EACH location generate the tiles listed. Every location gets 3 ground variants (subtle variation of the same terrain — not different biomes), a border wall, and two high-ground elevation tiles. Some locations also need hazard tiles (listed).

**Ground tile rules:** seamless tiling in all 4 directions; no obvious repeating details; ~60% plain walkable surface.

**Wall tile rule:** the wall occupies the tile viewed from above with a strong top-down silhouette (stone/brick/wood), slightly darker than the floor, reading as "impassable".

**Elevation tile rule:** the tile looks like raised terrain with a visible cliff face on its SOUTH edge (the game places these as ledges/bluffs of high ground). `_elevation_1` is a low ledge, `_elevation_2` a higher bluff with a taller cliff face.

### 3a · `mountain_pass` — Mountain Pass ⛰
*Mood: windswept grey stone, cold alpine light, clouds below.*
```
tiles/mountain_pass_ground_1.png
tiles/mountain_pass_ground_2.png
tiles/mountain_pass_ground_3.png
tiles/mountain_pass_wall.png
tiles/mountain_pass_elevation_1.png
tiles/mountain_pass_elevation_2.png
```

### 3b · `tavern` — Brawling Tavern 🍺
*Mood: warm candlelit wood, sticky floorboards, cozy but rowdy.*
```
tiles/tavern_ground_1.png
tiles/tavern_ground_2.png
tiles/tavern_ground_3.png
tiles/tavern_wall.png
tiles/tavern_elevation_1.png
tiles/tavern_elevation_2.png
tiles/tavern_hazard_grease.png        ← spilled ale, slippery sheen
```

### 3c · `ship` — Sea of Swords ⛵
*Mood: salt-bleached deck planks, spray, ropes, dark sea all around.*
```
tiles/ship_ground_1.png
tiles/ship_ground_2.png
tiles/ship_ground_3.png
tiles/ship_wall.png                    ← ship railing / hull edge
tiles/ship_elevation_1.png
tiles/ship_elevation_2.png
tiles/ship_hazard_water.png            ← deep black water (overboard = deadly)
```

### 3d · `town` — Burning Town 🏘
*Mood: cobblestones, ash in the air, ember glow at the edges.*
```
tiles/town_ground_1.png
tiles/town_ground_2.png
tiles/town_ground_3.png
tiles/town_wall.png
tiles/town_elevation_1.png
tiles/town_elevation_2.png
tiles/town_hazard_fire.png             ← burning rubble patches
```

### 3e · `forest` — Whispering Woods 🌲
*Mood: deep green, dappled shadow, roots, fireflies.*
```
tiles/forest_ground_1.png
tiles/forest_ground_2.png
tiles/forest_ground_3.png
tiles/forest_wall.png                  ← dense treeline
tiles/forest_elevation_1.png
tiles/forest_elevation_2.png
tiles/forest_hazard_brambles.png       ← thorny undergrowth
```

### 3f · `dungeon` — Sunken Crypt 💀
*Mood: cold stone, torchlight pools, dust, silence.*
```
tiles/dungeon_ground_1.png
tiles/dungeon_ground_2.png
tiles/dungeon_ground_3.png
tiles/dungeon_wall.png
tiles/dungeon_elevation_1.png
tiles/dungeon_elevation_2.png
```

### 3g · `ruins` — Crumbling Ruins 🏛
*Mood: weathered marble, weeds through cracks, fallen empire.*
```
tiles/ruins_ground_1.png
tiles/ruins_ground_2.png
tiles/ruins_ground_3.png
tiles/ruins_wall.png
tiles/ruins_elevation_1.png
tiles/ruins_elevation_2.png
```

### 3h · `fey` — Faerie Glade 🧚
*Mood: impossibly green, glowing, strange colors, dreamlike.*
```
tiles/fey_ground_1.png
tiles/fey_ground_2.png
tiles/fey_ground_3.png
tiles/fey_wall.png
tiles/fey_elevation_1.png
tiles/fey_elevation_2.png
tiles/fey_hazard_water.png             ← luminous fey pond
tiles/fey_hazard_brambles.png          ← grasping fey thorns
```

### 3i · `avernus` — The Depths of Avernus 🔥
*Mood: cracked black-red rock, rivers of fire, the sky itself is burning.*
```
tiles/avernus_ground_1.png
tiles/avernus_ground_2.png
tiles/avernus_ground_3.png
tiles/avernus_wall.png
tiles/avernus_elevation_1.png
tiles/avernus_elevation_2.png
tiles/avernus_hazard_lava.png          ← molten lava (deadly to stand in)
```

### 3j · Walkable scene tilesets (OPTIONAL — hub & camp)

The walkable hub and campfire scenes use these dedicated tilesets **if you provide them**; otherwise they automatically reuse the town and forest tiles (respectively). Generate only if you want the scenes visually distinct.

```
tiles/hub_ground_1.png
tiles/hub_ground_2.png
tiles/hub_ground_3.png
tiles/hub_wall.png
tiles/hub_elevation_1.png
tiles/hub_elevation_2.png
tiles/camp_ground_1.png
tiles/camp_ground_2.png
tiles/camp_ground_3.png
tiles/camp_wall.png
tiles/camp_elevation_1.png
tiles/camp_elevation_2.png
```

### 3k · Generic hazard fallbacks (used anywhere)

```
tiles/hazard_fire.png
tiles/hazard_lava.png
tiles/hazard_water.png
tiles/hazard_brambles.png
tiles/hazard_grease.png
```

---

## 4 · OBJECTS (obstacles, 35 files)

One PNG each, top-down/¾ view, dark outline, casting a small shadow. Destructible ones (noted) should look flimsier than solid ones.

```
objects/pillar.png          — stone column (blocks movement & sight)
objects/tree.png            — big old tree (blocks movement & sight)
objects/house.png           — small town house (blocks movement & sight)
objects/wall.png            — freestanding wall segment (blocks sight)
objects/statue.png          — weathered statue (blocks sight)
objects/mast.png            — ship's mast with rigging (blocks sight)
objects/rock.png            — large rock (low cover)
objects/boulder.png         — huge boulder (low cover)
objects/spike.png           — obsidian spike, Avernus (impassable)
objects/rift.png            — glowing chasm crack, Avernus (impassable)
objects/sarcophagus.png     — stone coffin (low cover)
objects/crate.png           — wooden crate (low cover, destructible)
objects/cannon.png          — ship cannon (low cover)
objects/hearth.png          — tavern fireplace (impassable, warm glow)
objects/fountain.png        — stone fountain (low cover)
objects/cart.png            — wooden cart (low cover, destructible)
objects/stone_circle.png    — standing stones (low cover)
objects/mushroom.png        — giant mushroom, fey (low cover, destructible)
objects/vine.png            — hanging vines (low cover, destructible)
objects/bone_pile.png       — heap of bones, Avernus (low cover)
objects/chain.png           — hanging chains (low cover)
objects/brazier.png         — iron brazier with fire (low cover)
objects/table.png           — wooden tavern table (LOW COVER: +2 AC)
objects/barrel.png          — barrel (LOW COVER, destructible)
objects/chair.png           — tavern chair (LOW COVER, destructible)
objects/bush.png            — leafy bush (LOW COVER, destructible)
objects/log.png             — fallen log (LOW COVER)
objects/stump.png           — tree stump (LOW COVER)
objects/rubble.png          — rubble pile (LOW COVER, destructible)
objects/arch.png            — fallen arch (LOW COVER)
objects/rope_coil.png       — coiled rope, ship (LOW COVER)
objects/flower.png          — fey flowers (walkable decoration)
objects/cliff_1.png         — high-ground ledge edge (walkable)
objects/cliff_2.png         — high-ground bluff edge (walkable)
objects/gravel.png          — scree / difficult ground
```

---

## 5 · CREATURES (monsters, 38 files)

Each monster: billboard-style sprite, facing the camera, dark outline, drop shadow, menacing but readable at small size. Big creatures (noted) may fill more of the 40×48 frame.

```
units/monster_goblin.png           — small green goblin with a scimitar
units/monster_rat.png              — giant rat
units/monster_bat.png              — giant bat, wings spread
units/monster_bandit.png           — scruffy human bandit with sword
units/monster_cultist.png          — robed cultist with dagger
units/monster_thug.png             — burly thug with mace
units/monster_wolf.png             — grey wolf, hackles up
units/monster_skeleton.png         — animated skeleton with sword & bow
units/monster_zombie.png           — shambling zombie
units/monster_giant_spider.png     — LARGE wolf-sized spider, dripping fangs
units/monster_hobgoblin.png        — armored hobgoblin with sword
units/monster_orc.png              — orc with greataxe
units/monster_ogre.png             — LARGE hulking ogre with club
units/monster_wererat.png          — rat-like humanoid with dagger
units/monster_ghoul.png            — gaunt clawed ghoul
units/monster_wight.png            — armored undead warrior
units/monster_minotaur.png         — LARGE horned minotaur with axe
units/monster_harpy.png            — winged harpy
units/monster_pirate.png           — pirate with cutlass
units/monster_sahuagin.png         — fish-like sea raider with spear
units/monster_imp.png              — small red devil with wings
units/monster_spined_devil.png     — small spiky devil, spines along back
units/monster_bearded_devil.png    — devil with writhing beard-tendrils & glaive
units/monster_hell_hound.png       — black hound wreathed in embers
units/monster_barbed_devil.png     — devil covered in barbs
units/monster_erinyes.png          — fallen-angel devil with wings & longsword
units/monster_bone_devil.png       — LARGE skeletal devil with wings & scorpion tail
units/monster_balor.png            — HUGE flaming demon lord with whip & lightning sword
units/monster_owlbear.png          — LARGE bear-owl hybrid
units/monster_troll.png            — LARGE green regenerating troll
units/monster_basilisk.png         — lizard with petrifying gaze
units/monster_mimic.png            — chest with teeth and tongue
units/monster_gelatinous_cube.png  — translucent green ooze cube
units/monster_flameskull.png       — floating burning skull
units/monster_mind_flayer.png      — illithid, tentacled face, robes
units/monster_beholder.png         — LARGE floating eye-tyrant with eye stalks
units/monster_dragon_young_red.png — LARGE young red dragon, wings spread
units/monster_kraken_spawn.png     — HUGE tentacled sea horror
```

---

## 6 · WILD SHAPE FORMS (7 files)

Beast forms druids transform into — same style rules as creatures.

```
units/form_bear.png
units/form_dire_wolf.png
units/form_wolf.png
units/form_giant_spider.png
units/form_badger.png
units/form_cat.png
units/form_rat.png
```

---

## 7 · PLAYER CHARACTERS (12 class sprites + optional race skins)

Each class sprite: an adventurer in class-appropriate gear, billboard-style, facing the camera, with the class's signature weapon visible. Neutral heroic pose. Use these exact palettes for class identity:

```
units/class_barbarian.png   — fur & leather, greataxe, war paint, warm browns/reds
units/class_bard.png        — flamboyant, lute, purple & gold
units/class_cleric.png      — chain mail, mace & shield, white & gold holy symbols
units/class_druid.png       — hide armor, quarterstaff, greens & browns, leaves
units/class_fighter.png     — plate armor, longsword & shield, steel & crimson
units/class_monk.png        — simple robes, bare fists, ochre & red sash
units/class_paladin.png     — full plate, glowing sword, gold & steel
units/class_ranger.png      — hooded, longbow, forest greens & leather
units/class_rogue.png       — dark leathers, rapier & daggers, hood
units/class_sorcerer.png    — elegant robes, arcane energy, purple
units/class_warlock.png     — shadowy robes, eldritch green energy
units/class_wizard.png      — pointed hat, staff & spellbook, deep blue & gold
```

**Optional race skins** (36 files — generate only if you want distinct looks per race; the game falls back to the class sprite otherwise). Same gear as the class sprite, but with the race's features:

```
units/race_{race}_{class}.png
```

…where `{race}` is one of: `human, elf, dwarf, halfling, halfelf, half_orc, tiefling, gnome, dragonborn`
and `{class}` is one of: `barbarian, bard, cleric, druid, fighter, monk, paladin, ranger, rogue, sorcerer, warlock, wizard`.

Examples: `units/race_dwarf_fighter.png`, `units/race_dragonborn_sorcerer.png`, `units/race_tiefling_warlock.png`.

---

## 8 · GENERATION WORKFLOW (recommended order)

1. **One location at a time** (Section 3): paste the location's block plus Sections 1–2 as the style rules. Verify the 6–8 tiles look consistent together.
2. **Objects** (Section 4) in batches of 6–8 that share a location (tavern: table/barrel/chair/hearth; ship: mast/cannon/crate/rope_coil; avernus: spike/rift/bone_pile/chain).
3. **Creatures** (Section 5) in theme batches: goblinoids (goblin/hobgoblin/orc/ogre), undead (skeleton/zombie/ghoul/wight/flameskull), devils (imp→balor), aberrations (mimic/cube/flameskull/mind_flayer/beholder), beasts & giants.
4. **Classes** (Section 7) — the 12 class sprites are the highest-impact single batch.
5. Drop everything into the game's `assets/` folder, refresh, and the game renders the new art automatically. Anything you haven't generated yet keeps the old procedural placeholder.
