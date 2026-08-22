# Avernus Descent — Sound Drop List

Everything the game can play, in one list. Drop your files into the folders below and the game picks them up automatically. **Missing files are silently skipped** — the game stays fully playable no matter how few (or how many) sounds you add.

## Where do files go?

```
assets/sounds/
├── music/      looping background tracks          (.ogg preferred)
├── ambience/   looping background beds (optional)
├── ui/         menu clicks, opens, errors…
├── combat/     hits, misses, crits, hazards…
├── weapons/    swings & impacts per damage type (+ per-weapon overrides)
├── spells/     one file per spell + shared fallbacks
├── footsteps/  per-surface footsteps (+ per-location overrides)
├── units/      grunts, deaths, roars, shapeshifts
└── items/      potions, glass breaks, gold, chests…
```

## Formats

- **`.ogg` is preferred** (small, loops cleanly). The engine also accepts `.mp3` and `.wav`.
- Tries `.ogg` → `.mp3` → `.wav` per slot — drop one file per slot, any of these formats.
- **Music/ambience**: short seamless loops (30 s – 2 min) work best.
- **One-shots**: keep them tight (0.2 – 2 s). The game adds slight random pitch variation to footsteps and swings so repeats don't feel robotic.
- Loudness: keep peaks around -6 to -12 dB. The game mixes SFX at ~80%, music at ~50%.

## Fallback chains (why you don't need every file)

| Event | Played in order (first file that exists wins) |
| --- | --- |
| Weapon swing | `weapons/{weapon}.ogg` → `weapons/swing_{slash|stab|blunt}.ogg` |
| Weapon hit | `weapons/hit_{slash|stab|blunt}.ogg` → `combat/hit_flesh.ogg` |
| Spell cast | `spells/{spell}.ogg` → `spells/{damage type}.ogg` → `spells/{heal|buff|debuff|utility}.ogg` → `spells/cast_generic.ogg` |
| Footsteps | `footsteps/{location or scene}.ogg` → `footsteps/{surface}.ogg` → `footsteps/generic.ogg` |
| Combat music | `music/combat_{location}.ogg` → `music/combat.ogg` (bosses: `music/combat_boss.ogg` first) |

**Recommended starter pack (14 files)** — the core experience: 

```
assets/sounds/ui/click.ogg
assets/sounds/ui/open.ogg
assets/sounds/ui/error.ogg
assets/sounds/combat/miss.ogg
assets/sounds/combat/hit_flesh.ogg
assets/sounds/weapons/swing_slash.ogg
assets/sounds/weapons/hit_slash.ogg
assets/sounds/weapons/swing_stab.ogg
assets/sounds/weapons/hit_stab.ogg
assets/sounds/weapons/swing_blunt.ogg
assets/sounds/weapons/hit_blunt.ogg
assets/sounds/items/potion_drink.ogg
assets/sounds/items/potion_throw.ogg
assets/sounds/items/glass_break.ogg
```

## The complete list

**242 slots total** — ★ = core (drop these first), · = optional (nice-to-have, the game falls back without them).

### ui/ (8)

- `ui/click` ★ — Generic menu click — plays on every button press **→ present (click.mp3)**
- `ui/close` ★ — Panel / modal / radial menu closes **→ present (close.mp3)**
- `ui/equip` · — Weapon or armor equipped / unequipped
- `ui/error` ★ — Invalid action — no points left, bad target, can't cast **→ present (error.mp3)**
- `ui/gold` ★ — Coins — buying, selling, looting gold **→ present (gold.mp3)**
- `ui/hover` · — Soft hover blip when mousing over menu options
- `ui/levelup` ★ — Level-up / new ability fanfare **→ present (levelup.mp3)**
- `ui/open` ★ — Panel / modal / radial menu opens **→ present (open.mp3)**

### combat/ (11)

- `combat/crit` ★ — Heavy critical-hit impact **→ present (crit.mp3)**
- `combat/fall` ★ — Body hits the ground (prone, grease slip) **→ present (fall.mp3)**
- `combat/hazard_brambles` ★ — Thorns rustle and tear (brambles damage) **→ present (hazard_brambles.mp3)**
- `combat/hazard_fire` ★ — Flames crackle (fire hazard damage) **→ present (hazard_fire.mp3)**
- `combat/hazard_grease` ★ — Slippery splat (grease slip) **→ present (hazard_grease.mp3)**
- `combat/hazard_lava` ★ — Lava sizzle (lava hazard damage) **→ present (hazard_lava.mp3)**
- `combat/hazard_water` ★ — Splash (water hazard) **→ present (hazard_water.mp3)**
- `combat/hit_flesh` · — Generic flesh impact (fallback for weapon hits)
- `combat/miss` ★ — Attack swings through empty air **→ present (miss.mp3)**
- `combat/shove` ★ — Shove / shove-aside thud and scuffle **→ present (shove.mp3)**
- `combat/start` ★ — Encounter start sting (floor intro → first round) **→ present (start.mp3)**

### weapons/ (45)

- `weapons/arrow_hit` ★ — Arrow / bolt strikes a target **→ present (arrow_hit.mp3)**
- `weapons/battleaxe` · — Unique attack sound for Battleaxe (replaces the shared slashing swing)
- `weapons/blade_of_avernus` · — Unique attack sound for Blade of Avernus (replaces the shared slashing swing)
- `weapons/bow_shot` ★ — Bowstring twang + arrow release **→ present (bow_shot.mp3)**
- `weapons/club` · — Unique attack sound for Club (replaces the shared bludgeoning swing)
- `weapons/crossbow_shot` ★ — Crossbow thunk + bolt release **→ present (crossbow_shot.mp3)**
- `weapons/dagger` · — Unique attack sound for Dagger (replaces the shared piercing swing)
- `weapons/fists` · — Unique attack sound for unarmed strikes
- `weapons/flail` · — Unique attack sound for Flail (replaces the shared bludgeoning swing)
- `weapons/glaive` · — Unique attack sound for Glaive (replaces the shared slashing swing)
- `weapons/greataxe` · — Unique attack sound for Greataxe (replaces the shared slashing swing)
- `weapons/greatclub` · — Unique attack sound for Greatclub (replaces the shared bludgeoning swing)
- `weapons/greatsword` · — Unique attack sound for Greatsword (replaces the shared slashing swing)
- `weapons/halberd` · — Unique attack sound for Halberd (replaces the shared slashing swing)
- `weapons/hand_crossbow` · — Unique attack sound for Hand Crossbow (replaces the shared piercing swing)
- `weapons/handaxe` · — Unique attack sound for Handaxe (replaces the shared slashing swing)
- `weapons/heavy_crossbow` · — Unique attack sound for Heavy Crossbow (replaces the shared piercing swing)
- `weapons/hit_blunt` ★ — Crunching bludgeoning impact **→ present (hit_blunt.mp3)**
- `weapons/hit_slash` ★ — Blade bites flesh (slashing impact) **→ present (hit_slash.mp3)**
- `weapons/hit_stab` ★ — Point sinks in (piercing impact) **→ present (hit_stab.mp3)**
- `weapons/javelin` · — Unique attack sound for Javelin (replaces the shared piercing swing)
- `weapons/light_crossbow` · — Unique attack sound for Light Crossbow (replaces the shared piercing swing)
- `weapons/longbow` · — Unique attack sound for Longbow (replaces the shared piercing swing)
- `weapons/longsword` · — Unique attack sound for Longsword (replaces the shared slashing swing)
- `weapons/mace` · — Unique attack sound for Mace (replaces the shared bludgeoning swing)
- `weapons/maul` · — Unique attack sound for Maul (replaces the shared bludgeoning swing)
- `weapons/morningstar` · — Unique attack sound for Morningstar (replaces the shared piercing swing)
- `weapons/orin_dagger` · — Unique attack sound for Orin's Dagger (replaces the shared piercing swing)
- `weapons/pike` · — Unique attack sound for Pike (replaces the shared piercing swing)
- `weapons/quarterstaff` · — Unique attack sound for Quarterstaff (replaces the shared bludgeoning swing)
- `weapons/rapier` · — Unique attack sound for Rapier (replaces the shared piercing swing)
- `weapons/scimitar` · — Unique attack sound for Scimitar (replaces the shared slashing swing)
- `weapons/shortbow` · — Unique attack sound for Shortbow (replaces the shared piercing swing)
- `weapons/shortsword` · — Unique attack sound for Shortsword (replaces the shared piercing swing)
- `weapons/sickle` · — Unique attack sound for Sickle (replaces the shared slashing swing)
- `weapons/sling` · — Unique attack sound for Sling (replaces the shared bludgeoning swing)
- `weapons/sling_shot` ★ — Sling whirl and release **→ present (sling_shot.mp3)**
- `weapons/spear` · — Unique attack sound for Spear (replaces the shared piercing swing)
- `weapons/swing_blunt` ★ — Heavy club / hammer swing **→ present (swing_blunt.mp3)**
- `weapons/swing_slash` ★ — Sword / axe whoosh through air **→ present (swing_slash.mp3)**
- `weapons/swing_stab` ★ — Stabbing lunge whoosh **→ present (swing_stab.mp3)**
- `weapons/unarmed_hit` ★ — Bare-knuckle punch lands **→ present (unarmed_hit.mp3)**
- `weapons/unarmed_swing` ★ — Fist / paw swipes air **→ present (unarmed_swing.mp3)**
- `weapons/warhammer` · — Unique attack sound for Warhammer (replaces the shared bludgeoning swing)
- `weapons/whip` · — Unique attack sound for Whip (replaces the shared slashing swing)

### spells/ (117)

- `spells/acid` ★ — Shared acid spell sound (fallback for spells of this damage type) **→ present (acid.mp3)**
- `spells/acid_splash` · — Acid Splash — cast sound
- `spells/aid` · — Aid — cast sound
- `spells/armor_of_agathys` · — Armor of Agathys — cast sound
- `spells/aura_of_vitality` · — Aura of Vitality — cast sound
- `spells/bane` · — Bane — cast sound
- `spells/banishment` · — Banishment — cast sound
- `spells/bestow_curse` · — Bestow Curse — cast sound
- `spells/bless` · — Bless — cast sound **→ present (bless.wav)**
- `spells/blight` · — Blight — cast sound
- `spells/blink` · — Blink — cast sound
- `spells/branding_smite` · — Branding Smite — cast sound
- `spells/buff` ★ — Empowering shimmer (bless, haste, mage armor…) **→ present (buff.mp3)**
- `spells/burning_hands` · — Burning Hands — cast sound
- `spells/call_lightning` · — Call Lightning — cast sound **→ present (call_lightning.wav)**
- `spells/cast_generic` ★ — Generic spell-cast whoosh (last-resort fallback) **→ present (cast_generic.mp3)**
- `spells/chain_lightning` · — Chain Lightning — cast sound
- `spells/chill_touch` · — Chill Touch — cast sound
- `spells/chromatic_orb` · — Chromatic Orb — cast sound
- `spells/cloud_of_daggers` · — Cloud of Daggers — cast sound
- `spells/cloudkill` · — Cloudkill — cast sound
- `spells/cold` ★ — Shared cold spell sound (fallback for spells of this damage type) **→ present (cold.mp3)**
- `spells/cone_of_cold` · — Cone of Cold — cast sound
- `spells/crown_of_stars` · — Crown of Stars — cast sound
- `spells/cure_wounds` · — Cure Wounds — cast sound
- `spells/darkness` · — Darkness — cast sound
- `spells/death_ward` · — Death Ward — cast sound
- `spells/debuff` ★ — Cursed chime (bane, hold person, slow…) **→ present (debuff.mp3)**
- `spells/dimension_door` · — Dimension Door — cast sound
- `spells/disintegrate` · — Disintegrate — cast sound
- `spells/dissonant_whispers` · — Dissonant Whispers — cast sound
- `spells/divine_favor` · — Divine Favor — cast sound
- `spells/dragon_breath` · — Dragon's Breath — cast sound
- `spells/eldritch_blast` · — Eldritch Blast — cast sound **→ present (eldritch_blast.wav)**
- `spells/entangle` · — Entangle — cast sound **→ present (entangle.wav)**
- `spells/expeditious_retreat` · — Expeditious Retreat — cast sound
- `spells/faerie_fire` · — Faerie Fire — cast sound
- `spells/fear` · — Fear — cast sound
- `spells/finger_of_death` · — Finger of Death — cast sound
- `spells/fire` ★ — Shared fire spell sound (fallback for spells of this damage type) **→ present (fire.mp3)**
- `spells/fire_bolt` · — Fire Bolt — cast sound
- `spells/fire_shield` · — Fire Shield — cast sound
- `spells/fire_storm` · — Fire Storm — cast sound
- `spells/fireball` · — Fireball — cast sound **→ present (fireball.wav)**
- `spells/flame_strike` · — Flame Strike — cast sound
- `spells/flaming_sphere` · — Flaming Sphere — cast sound
- `spells/fog_cloud` · — Fog Cloud — cast sound **→ present (fog_cloud.wav)**
- `spells/force` ★ — Shared force spell sound (fallback for spells of this damage type) **→ present (force.mp3)**
- `spells/grease` · — Grease — cast sound
- `spells/greater_invisibility` · — Greater Invisibility — cast sound
- `spells/guiding_bolt` · — Guiding Bolt — cast sound
- `spells/haste` · — Haste — cast sound
- `spells/heal` ★ — Heal — cast sound **→ present (heal.mp3)**
- `spells/healing_word` · — Healing Word — cast sound
- `spells/hellish_rebuke` · — Hellish Rebuke — cast sound
- `spells/heroism` · — Heroism — cast sound
- `spells/hex` · — Hex — cast sound
- `spells/hold_monster` · — Hold Monster — cast sound
- `spells/hold_person` · — Hold Person — cast sound
- `spells/hunters_mark` · — Hunter's Mark — cast sound
- `spells/hypnotic_pattern` · — Hypnotic Pattern — cast sound
- `spells/ice_storm` · — Ice Storm — cast sound
- `spells/impact` ★ — Magic impact on a target (spell attack lands / save failed) **→ present (impact.mp3)**
- `spells/inflict_wounds` · — Inflict Wounds — cast sound
- `spells/invisibility` · — Invisibility — cast sound **→ present (invisibility.wav)**
- `spells/lesser_restoration` · — Lesser Restoration — cast sound
- `spells/lightning` ★ — Shared lightning spell sound (fallback for spells of this damage type) **→ present (lightning.mp3)**
- `spells/lightning_bolt` · — Lightning Bolt — cast sound
- `spells/mage_armor` · — Mage Armor — cast sound
- `spells/magic_missile` · — Magic Missile — cast sound **→ present (magic_missile.wav)**
- `spells/mass_cure_wounds` · — Mass Cure Wounds — cast sound
- `spells/mass_healing_word` · — Mass Healing Word — cast sound
- `spells/meteor_swarm` · — Meteor Swarm — cast sound
- `spells/mind_spike` · — Mind Spike — cast sound **→ present (mind_spike.wav)**
- `spells/mirror_image` · — Mirror Image — cast sound
- `spells/misty_step` · — Misty Step — cast sound **→ present (misty_step.wav)**
- `spells/moonbeam` · — Moonbeam — cast sound
- `spells/necrotic` ★ — Shared necrotic spell sound (fallback for spells of this damage type) **→ present (necrotic.mp3)**
- `spells/pass_without_trace` · — Pass Without Trace — cast sound
- `spells/physical` ★ — Shared physical spell sound (fallback for spells of this damage type) **→ present (physical.mp3)**
- `spells/poison` ★ — Shared poison spell sound (fallback for spells of this damage type) **→ present (poison.mp3)**
- `spells/polymorph` · — Polymorph — cast sound
- `spells/power_word_kill` · — Power Word Kill — cast sound
- `spells/produce_flame` · — Produce Flame — cast sound
- `spells/protection_from_energy` · — Protection from Energy — cast sound
- `spells/psychic` ★ — Shared psychic spell sound (fallback for spells of this damage type) **→ present (psychic.mp3)**
- `spells/radiant` ★ — Shared radiant spell sound (fallback for spells of this damage type) **→ present (radiant.mp3)**
- `spells/ray_of_frost` · — Ray of Frost — cast sound **→ present (ray_of_frost.wav)**
- `spells/revivify` · — Revivify — cast sound
- `spells/sacred_flame` · — Sacred Flame — cast sound **→ present (sacred_flame.wav)**
- `spells/scorching_ray` · — Scorching Ray — cast sound **→ present (scorching_ray.wav)**
- `spells/searing_smite` · — Searing Smite — cast sound
- `spells/shatter` · — Shatter — cast sound
- `spells/shield_of_faith` · — Shield of Faith — cast sound
- `spells/shocking_grasp` · — Shocking Grasp — cast sound
- `spells/sleep` · — Sleep — cast sound **→ present (sleep.wav)**
- `spells/slow` · — Slow — cast sound
- `spells/spike_growth` · — Spike Growth — cast sound
- `spells/spirit_guardians` · — Spirit Guardians — cast sound
- `spells/spiritual_weapon` · — Spiritual Weapon — cast sound
- `spells/stoneskin` · — Stoneskin — cast sound
- `spells/sunbeam` · — Sunbeam — cast sound
- `spells/sunburst` · — Sunburst — cast sound
- `spells/synaptic_static` · — Synaptic Static — cast sound
- `spells/tashas_hideous_laughter` · — Tasha's Hideous Laughter — cast sound
- `spells/thorn_whip` · — Thorn Whip — cast sound
- `spells/thunder` ★ — Shared thunder spell sound (fallback for spells of this damage type) **→ present (thunder.mp3)**
- `spells/thunder_step` · — Thunder Step — cast sound
- `spells/thunderwave` · — Thunderwave — cast sound
- `spells/toll_the_dead` · — Toll the Dead — cast sound
- `spells/utility` ★ — Utility magic murmur (misty step, darkness…) **→ present (utility.mp3)**
- `spells/vampiric_touch` · — Vampiric Touch — cast sound
- `spells/vicious_mockery` · — Vicious Mockery — cast sound **→ present (vicious_mockery.wav)**
- `spells/wall_of_fire` · — Wall of Fire — cast sound
- `spells/wall_of_stone` · — Wall of Stone — cast sound
- `spells/web` · — Web — cast sound **→ present (web.wav)**
- `spells/wrathful_smite` · — Wrathful Smite — cast sound

### footsteps/ (21)

- `footsteps/avernus` · — Footstep override for The Depths of Avernus (replaces the surface sound)
- `footsteps/camp` · — Footstep override for the camp walk scene (replaces the surface sound)
- `footsteps/dirt` ★ — Footstep on dirt — packed earth **→ present (dirt.mp3)**
- `footsteps/dungeon` · — Footstep override for Sunken Crypt (replaces the surface sound)
- `footsteps/fey` · — Footstep override for Faerie Glade (replaces the surface sound)
- `footsteps/forest` · — Footstep override for Whispering Woods (replaces the surface sound)
- `footsteps/generic` · — Generic footstep (fallback when no surface sound exists)
- `footsteps/grass` ★ — Footstep on grass — soft turf **→ present (grass.mp3)**
- `footsteps/hub` · — Footstep override for the hub walk scene (replaces the surface sound)
- `footsteps/lava` ★ — Footstep on lava — sizzling hell-rock **→ present (lava.mp3)**
- `footsteps/metal` ★ — Footstep on metal — clanking grating **→ present (metal.mp3)**
- `footsteps/mountain_pass` · — Footstep override for Mountain Pass (replaces the surface sound)
- `footsteps/ruins` · — Footstep override for Crumbling Ruins (replaces the surface sound)
- `footsteps/sand` ★ — Footstep on sand — loose sand **→ present (sand.mp3)**
- `footsteps/ship` · — Footstep override for Sea of Swords (replaces the surface sound)
- `footsteps/snow` ★ — Footstep on snow — crunched snow **→ present (snow.mp3)**
- `footsteps/stone` ★ — Footstep on stone — cobbles, rock, flagstone **→ present (stone.mp3)**
- `footsteps/tavern` · — Footstep override for Brawling Tavern (replaces the surface sound)
- `footsteps/town` · — Footstep override for Burning Town (replaces the surface sound)
- `footsteps/water` ★ — Footstep on water — wading splash **→ present (water.mp3)**
- `footsteps/wood` ★ — Footstep on wood — planks, decking, floorboards **→ present (wood.mp3)**

### units/ (6)

- `units/death` ★ — Creature dies — death rattle / collapse **→ present (death.mp3)**
- `units/grunt_1` · — Creature takes a hit — grunt A (randomized with 2 & 3)
- `units/grunt_2` · — Creature takes a hit — grunt B
- `units/grunt_3` · — Creature takes a hit — grunt C
- `units/roar` · — Large monster roars (rage, boss powers)
- `units/shapeshift` ★ — Wild shape / transformation whoosh **→ present (shapeshift.mp3)**

### items/ (6)

- `items/chest_open` ★ — Victory loot chest creaks open **→ present (chest_open.mp3)**
- `items/glass_break` ★ — Glass shatters on impact **→ present (glass_break.mp3)**
- `items/gold` ★ — Coins jingle (loot screen) **→ present (gold.mp3)**
- `items/potion_drink` ★ — Gulp — cork pop and swallow **→ present (potion_drink.mp3)**
- `items/potion_throw` ★ — Flask flies through the air **→ present (potion_throw.mp3)**
- `items/scroll` · — Paper unrolls / scroll read

### music/ (17)

- `music/camp` ★ — Campfire rest theme
- `music/combat` ★ — Generic combat music (fallback)
- `music/combat_avernus` · — Combat music for The Depths of Avernus (falls back to music/combat)
- `music/combat_boss` ★ — Boss battle music (floors 3, 6, 9, 12)
- `music/combat_dungeon` · — Combat music for Sunken Crypt (falls back to music/combat)
- `music/combat_fey` · — Combat music for Faerie Glade (falls back to music/combat)
- `music/combat_forest` · — Combat music for Whispering Woods (falls back to music/combat)
- `music/combat_mountain_pass` · — Combat music for Mountain Pass (falls back to music/combat)
- `music/combat_ruins` · — Combat music for Crumbling Ruins (falls back to music/combat)
- `music/combat_ship` · — Combat music for Sea of Swords (falls back to music/combat)
- `music/combat_tavern` · — Combat music for Brawling Tavern (falls back to music/combat)
- `music/combat_town` · — Combat music for Burning Town (falls back to music/combat)
- `music/defeat` ★ — Defeat sting (run over — plays once)
- `music/hub` ★ — The Hub — Dante's emporium theme
- `music/title` ★ — Main menu theme **→ present (title.mp3)**
- `music/town` ★ — Town between floors
- `music/victory` ★ — Victory sting (floor cleared — plays once)

### ambience/ (11)

- `ambience/avernus` · — Background ambience for The Depths of Avernus
- `ambience/camp` · — Camp background bed (crackling fire, crickets)
- `ambience/dungeon` · — Background ambience for Sunken Crypt
- `ambience/fey` · — Background ambience for Faerie Glade
- `ambience/forest` · — Background ambience for Whispering Woods
- `ambience/hub` · — Hub background bed (braziers, distant chatter)
- `ambience/mountain_pass` · — Background ambience for Mountain Pass
- `ambience/ruins` · — Background ambience for Crumbling Ruins
- `ambience/ship` · — Background ambience for Sea of Swords
- `ambience/tavern` · — Background ambience for Brawling Tavern
- `ambience/town` · — Background ambience for Burning Town

## Checking your coverage

```
node tools/check_sounds.mjs   # summary of what is present / missing
node tools/gen_sound_manifest.js  # regenerate manifest.json + this README
```

> After dropping files in, refresh the game tab (Ctrl+Shift+R). The game remembers 404s, so new files need a reload to be picked up.

## How it sounds in-game

- **M** key or the 🔊 button (top-right) toggles all sound.
- Volumes persist between sessions (music ≈ 50%, SFX ≈ 80%, ambience ≈ 40% of master).
- Music crossfades between title → hub → camp/town → combat; ambience layers underneath.
- Spell SFX chain: drop a handful of per-spell files and every other spell still gets its damage-type or role sound.
