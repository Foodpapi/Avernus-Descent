# Drop-in Art Folder

Put generated PNGs in this folder using the **exact filenames** listed in
[`manifest.json`](./manifest.json) — no renaming, no chopping, no code changes.

## How it works

- The game ships with fully procedural pixel art. When a PNG matching a
  manifest filename exists here, it **automatically replaces** the procedural
  version at render time.
- Missing files are fine: the game falls back to procedural art and never
  breaks. You can drop in a single tile or the entire set.
- Files are loaded lazily; after adding new art, just refresh the page.
  (No rebuild needed — these are static files served from `/assets`.)

## Folder layout

```
assets/
  manifest.json            ← the canonical list of every asset slot
  tiles/                   ← floor tiles, walls, elevation, hazards
    {location}_ground_1.png … _ground_3.png
    {location}_wall.png
    {location}_elevation_1.png / _elevation_2.png
    {location}_hazard_{fire|lava|water|brambles|grease}.png
    hazard_{type}.png      ← generic fallback used by any location
  objects/                 ← obstacles: table.png, boulder.png, tree.png …
  units/                   ← creatures & characters
    monster_{id}.png       ← every monster (goblin, balor, …)
    form_{id}.png          ← wild shapes (bear, wolf, …)
    class_{id}.png         ← the 12 classes (fighter.png, wizard.png, …)
    race_{race}_{class}.png ← optional per-race skins (fallback: class sprite)
  fx/                      ← (optional) spell effect sprites — not in the manifest
  ui/                      ← title splash (title_screen.png) — not in the combat manifest
```

## Walkable scenes (hub & camp)

The hub and campfire prefer dedicated tilesets (`tiles/hub_*`, `tiles/camp_*`)
and automatically fall back to the town and forest tiles if those files don't
exist — so the scenes always use generated art once any compatible tileset is
present. Objects (`objects/house.png`, `objects/pillar.png`, …) replace their
procedural placeholder sprites wherever they appear.
```

## Sizes

| Kind  | Canvas | Recommended PNG (2× for crispness) |
|-------|--------|-----------------------------------|
| Tiles & objects | 28 × 28 px | 56 × 56 px |
| Units           | 20 × 24 px | 40 × 48 px |

Transparent backgrounds, PNG, **no margins — fill the whole canvas**.

**Aspect ratios are flexible.** Floor tiles are **cover-fit** (fill the tile,
crop overflow, never squish). **Characters and creatures** are rendered
**bottom-anchored at their true aspect ratio**: transparent padding is
auto-trimmed, the figure is contain-fitted so nothing is ever stretched or
cropped, and it rises naturally above its tile with its feet on the ground.
**Heights are capped per size category** (mediums ≈1.5 tiles, large ≈2, huge
≈2.4) so units in adjacent rows don't stack into vertical totems — very tall
source images are scaled down to fit, never cropped. Square 512×512 or
1024×1024 outputs work fine — keep the subject centered and avoid frames or
watermarks.

## Regenerating the manifest

If new monsters/classes/locations are added to the game later:

```
node tools/gen_manifest.js
```
