// Floor location themes. Each defines a tile palette, terrain features
// (height, cover, hazards), monster pools by difficulty tier, loot tables,
// and flavor text.

export const LOCATIONS = [
  {
    id: 'mountain_pass', name: 'Mountain Pass', icon: '⛰',
    desc: 'A windswept pass high above the world. Cliffs grant deadly advantage to those who hold the high ground.',
    ground: ['#8a8a7a', '#9a9484', '#7d7d6f'],
    wall: '#4a4a44', cliff: '#5f5f57', water: null,
    obstacles: ['rock', 'boulder', 'cliff_2', 'cliff_1', 'gravel'],
    hazard: 'none',
    flavor: ['The wind howls through the pass, carrying the smell of snow.',
             'Below, a river of clouds hides the world from view.',
             'Loose scree rattles down the slope with every step.'],
    monsters: {
      1: ['goblin', 'wolf', 'bandit'], 2: ['hobgoblin', 'orc', 'harpy'], 3: ['ogre', 'owlbear', 'minotaur'],
      4: ['troll', 'dragon_young_red', 'flameskull'],
    },
    bossPool: ['dragon_young_red', 'troll', 'harpy'],
    lootTable: { weapons: 3, armor: 2, consumables: 3, gold: 1 },
  },
  {
    id: 'tavern', name: 'Brawling Tavern', icon: '🍺',
    desc: 'The Rusty Flagon — or whatever it\'s called this week. Tables provide cover; spilled ale makes the floor treacherous.',
    ground: ['#7a5c3c', '#8a6a44', '#6f5436'],
    wall: '#4a3524', cliff: null, water: null,
    obstacles: ['table', 'table', 'barrel', 'chair', 'hearth'],
    hazard: 'grease',
    flavor: ['The barkeep has already started sweeping up broken glass.',
             'Somewhere, a halfling is still playing the lute. Badly.',
             'The floor is sticky. You try not to think about why.'],
    monsters: {
      1: ['goblin', 'bandit', 'rat'], 2: ['thug', 'wererat', 'cultist'], 3: ['ogre', 'mimic', 'wight'],
      4: ['troll', 'mind_flayer', 'beholder'],
    },
    bossPool: ['thug', 'wererat', 'mimic', 'beholder'],
    lootTable: { weapons: 2, armor: 2, consumables: 4, gold: 2 },
  },
  {
    id: 'ship', name: 'Sea of Swords', icon: '⛵',
    desc: 'A pirate galley on black water. The decks roll; overboard lies the deep. Falling overboard is not recommended.',
    ground: ['#8a6a3c', '#7d5f35', '#95734a'],
    wall: '#5f4a2c', cliff: null, water: '#1a4a66',
    obstacles: ['barrel', 'crate', 'mast', 'cannon', 'rope_coil'],
    hazard: 'water',
    flavor: ['Salt spray stings your eyes as the deck heaves.',
             'Below decks, something large is chewing on the hull.',
             'The crew watches from the rigging. This is entertainment to them.'],
    monsters: {
      1: ['rat', 'sahuagin', 'cultist'], 2: ['pirate', 'sahuagin', 'giant_spider'], 3: ['pirate', 'wight', 'kraken_spawn'],
      4: ['kraken_spawn', 'mind_flayer', 'troll'],
    },
    bossPool: ['kraken_spawn', 'pirate', 'mind_flayer'],
    lootTable: { weapons: 2, armor: 2, consumables: 3, gold: 3 },
  },
  {
    id: 'town', name: 'Burning Town', icon: '🏘',
    desc: 'A town under siege. Rooftops and walls make for brutal street-to-street fighting.',
    ground: ['#8a8a82', '#7d7d76', '#948e84'],
    wall: '#5a5248', cliff: null, water: null,
    obstacles: ['house', 'wall', 'fountain', 'cart', 'barrel'],
    hazard: 'fire',
    flavor: ['Smoke drifts between the rooftops.',
             'A bell tolls somewhere. No one is coming to help.',
             'The cobblestones are warm underfoot.'],
    monsters: {
      1: ['goblin', 'bandit', 'cultist'], 2: ['orc', 'hobgoblin', 'ghoul'], 3: ['ogre', 'wight', 'flameskull'],
      4: ['troll', 'balor', 'beholder'],
    },
    bossPool: ['wight', 'flameskull', 'balor'],
    lootTable: { weapons: 2, armor: 3, consumables: 3, gold: 2 },
  },
  {
    id: 'forest', name: 'Whispering Woods', icon: '🌲',
    desc: 'Ancient trees crowd close. Their roots and hollows make for fine cover and finer ambushes.',
    ground: ['#4a6a3c', '#52743f', '#44632f'],
    wall: '#2c4426', cliff: null, water: null,
    obstacles: ['tree', 'tree', 'bush', 'log', 'stump'],
    hazard: 'brambles',
    flavor: ['The trees seem to lean in, listening.',
             'Something howls, far too close.',
             'Fireflies drift between the trunks. They do not look friendly.'],
    monsters: {
      1: ['wolf', 'goblin', 'bat'], 2: ['giant_spider', 'orc', 'owlbear'], 3: ['owlbear', 'troll', 'harpy'],
      4: ['troll', 'dragon_young_red', 'mind_flayer'],
    },
    bossPool: ['owlbear', 'troll', 'giant_spider'],
    lootTable: { weapons: 2, armor: 2, consumables: 4, gold: 1 },
  },
  {
    id: 'dungeon', name: 'Sunken Crypt', icon: '💀',
    desc: 'Stone halls where the dead do not rest. Dark corners hide horrors and treasure in equal measure.',
    ground: ['#6a6a72', '#5f5f66', '#73737c'],
    wall: '#3a3a42', cliff: null, water: null,
    obstacles: ['pillar', 'sarcophagus', 'rubble', 'brazier', 'chain'],
    hazard: 'darkness',
    flavor: ['Your torchlight pushes back the dark like a swimmer against a tide.',
             'Dust lies thick. Only one set of footprints is visible — and they are not yours.',
             'The carvings on the wall depict a feast. The guests are all screaming.'],
    monsters: {
      1: ['skeleton', 'zombie', 'rat'], 2: ['ghoul', 'giant_spider', 'mimic'], 3: ['wight', 'gelatinous_cube', 'basilisk'],
      4: ['mind_flayer', 'beholder', 'balor'],
    },
    bossPool: ['wight', 'mind_flayer', 'beholder', 'mimic'],
    lootTable: { weapons: 3, armor: 3, consumables: 2, gold: 2 },
  },
  {
    id: 'ruins', name: 'Crumbling Ruins', icon: '🏛',
    desc: 'The bones of a fallen empire. Half-fallen walls offer cover; nothing here is stable.',
    ground: ['#8a826a', '#7d7560', '#94886e'],
    wall: '#5a5345', cliff: null, water: null,
    obstacles: ['pillar', 'rubble', 'statue', 'arch', 'vine'],
    hazard: 'none',
    flavor: ['Weeds push through cracked marble.',
             'A statue watches you with no eyes. You watch it back.',
             'The wind moves through the colonnades like a sigh.'],
    monsters: {
      1: ['skeleton', 'bandit', 'bat'], 2: ['hobgoblin', 'ghoul', 'harpy'], 3: ['minotaur', 'basilisk', 'wight'],
      4: ['beholder', 'troll', 'dragon_young_red'],
    },
    bossPool: ['basilisk', 'minotaur', 'beholder'],
    lootTable: { weapons: 3, armor: 2, consumables: 3, gold: 2 },
  },
  {
    id: 'fey', name: 'Faerie Glade', icon: '🧚',
    desc: 'The Feywild bleeds through here. Nothing is as it seems, and the terrain itself seems to toy with you.',
    ground: ['#5a8a6a', '#64a073', '#549364'],
    wall: '#2f5c40', cliff: null, water: '#3a7a9a',
    obstacles: ['tree', 'mushroom', 'bush', 'stone_circle', 'flower'],
    hazard: 'brambles',
    flavor: ['The light here has a color you have no name for.',
             'You hear laughter, then the buzzing of a thousand wings.',
             'A deer with too many eyes watches you from the treeline.'],
    monsters: {
      2: ['giant_spider', 'harpy', 'wolf'], 3: ['owlbear', 'troll', 'harpy'],
      4: ['troll', 'mind_flayer', 'beholder'],
    },
    bossPool: ['owlbear', 'mind_flayer', 'harpy'],
    lootTable: { weapons: 2, armor: 2, consumables: 4, gold: 2 },
  },
  {
    id: 'avernus', name: 'The Depths of Avernus', icon: '🔥',
    desc: 'The first layer of the Nine Hells. Rivers of fire, screaming winds, and the armies of the Blood War. Good luck.',
    ground: ['#6a2a1f', '#5c241b', '#743022'],
    wall: '#3a140e', cliff: '#4a1c12', water: '#d84a1a',
    obstacles: ['rock', 'boulder', 'spike', 'bone_pile', 'rift'],
    hazard: 'lava',
    flavor: ['The sky is on fire. This is not a metaphor.',
             'Distant war horns echo across the wastes of the Blood War.',
             'The ground is warm. It will be warmer soon.'],
    monsters: {
      2: ['imp', 'cultist', 'spined_devil'], 3: ['spined_devil', 'bearded_devil', 'hell_hound'],
      4: ['barbed_devil', 'hell_hound', 'erinyes'], 5: ['bone_devil', 'erinyes', 'balor'],
    },
    bossPool: ['erinyes', 'bone_devil', 'balor'],
    lootTable: { weapons: 3, armor: 2, consumables: 3, gold: 3 },
  },
];

export const LOCATION_MAP = Object.fromEntries(LOCATIONS.map(l => [l.id, l]));

// Material kits for destroyable objects (5e object-vs-damage common sense).
const WOOD = { material: 'wood', resist: ['piercing', 'lightning'], vuln: ['fire', 'slashing'], immune: ['psychic', 'poison'] };
const STONE = { material: 'stone', resist: ['slashing', 'piercing', 'fire'], vuln: ['thunder', 'bludgeoning'], immune: ['psychic', 'poison'] };
const METAL = { material: 'metal', resist: ['slashing', 'piercing', 'fire'], vuln: ['lightning', 'thunder'], immune: ['psychic', 'poison'] };
const BONE = { material: 'bone', resist: ['piercing', 'slashing'], vuln: ['bludgeoning'], immune: ['psychic', 'poison'] };
const ORGANIC = { material: 'organic', resist: [], vuln: ['fire', 'slashing'], immune: ['psychic', 'poison'] };

// Obstacle definitions: what each named obstacle means in combat.
// blocksProjectile: the object stops arrows/rays/thrown items (then takes the hit if it has hp).
// barScale: width of the object's HP bar relative to a tile (so a chair isn't a full-width bar).
export const OBSTACLES = {
  // === Full cover (blocks movement & line of sight) ===
  pillar: { name: 'Pillar', solid: true, tall: true, hp: 24, sprite: 'pillar', blocksProjectile: true, barScale: 0.55, ...STONE },
  tree: { name: 'Tree', solid: true, tall: true, hp: 22, sprite: 'tree', blocksProjectile: true, barScale: 0.7, ...WOOD },
  house: { name: 'House', solid: true, tall: true, hp: 40, sprite: 'house', blocksProjectile: true, barScale: 0.95, ...STONE },
  wall: { name: 'Wall', solid: true, tall: true, hp: null, sprite: 'wall', blocksProjectile: true, barScale: 1, ...STONE },
  statue: { name: 'Statue', solid: true, tall: true, hp: 20, sprite: 'statue', blocksProjectile: true, barScale: 0.55, ...STONE },
  mast: { name: 'Mast', solid: true, tall: true, hp: 18, sprite: 'mast', blocksProjectile: true, barScale: 0.4, ...WOOD },
  rock: { name: 'Rock', solid: true, tall: false, hp: 16, sprite: 'rock', blocksProjectile: true, barScale: 0.5, ...STONE },
  boulder: { name: 'Boulder', solid: true, tall: false, hp: 22, sprite: 'boulder', blocksProjectile: true, barScale: 0.7, ...STONE },
  spike: { name: 'Obsidian Spike', solid: true, tall: false, hp: 14, sprite: 'spike', blocksProjectile: true, barScale: 0.35, ...STONE },
  rift: { name: 'Chasm', solid: true, tall: false, hp: null, sprite: 'rift', blocksProjectile: false },
  sarcophagus: { name: 'Sarcophagus', solid: true, tall: false, hp: 20, sprite: 'sarcophagus', blocksProjectile: true, barScale: 0.8, ...STONE },
  crate: { name: 'Crate', solid: true, tall: false, hp: 10, sprite: 'crate', blocksProjectile: true, barScale: 0.55, ...WOOD },
  cannon: { name: 'Cannon', solid: true, tall: false, hp: 15, sprite: 'cannon', blocksProjectile: true, barScale: 0.7, ...METAL },
  hearth: { name: 'Hearth', solid: true, tall: false, hp: 16, sprite: 'hearth', blocksProjectile: true, barScale: 0.7, ...STONE },
  fountain: { name: 'Fountain', solid: true, tall: false, hp: 18, sprite: 'fountain', blocksProjectile: true, barScale: 0.7, ...STONE },
  cart: { name: 'Cart', solid: true, tall: false, hp: 12, sprite: 'cart', blocksProjectile: true, barScale: 0.8, ...WOOD },
  stone_circle: { name: 'Standing Stones', solid: true, tall: false, hp: 28, sprite: 'stone_circle', blocksProjectile: true, barScale: 0.85, ...STONE },
  mushroom: { name: 'Giant Mushroom', solid: true, tall: false, hp: 8, sprite: 'mushroom', blocksProjectile: true, barScale: 0.6, ...ORGANIC },
  vine: { name: 'Vines', solid: true, tall: false, hp: 6, sprite: 'vine', blocksProjectile: true, barScale: 0.45, ...ORGANIC },
  bone_pile: { name: 'Bone Pile', solid: true, tall: false, hp: 10, sprite: 'bone_pile', blocksProjectile: true, barScale: 0.65, ...BONE },
  chain: { name: 'Chains', solid: true, tall: false, hp: 12, sprite: 'chain', blocksProjectile: true, barScale: 0.4, ...METAL },
  brazier: { name: 'Brazier', solid: true, tall: false, hp: 10, sprite: 'brazier', blocksProjectile: true, barScale: 0.4, ...METAL },
  // === Low cover (block movement; projectiles slam into them if they sit on the line) ===
  table: { name: 'Table', solid: true, tall: false, cover: 2, hp: 8, sprite: 'table', blocksProjectile: true, barScale: 0.75, ...WOOD },
  barrel: { name: 'Barrel', solid: true, tall: false, cover: 2, hp: 6, sprite: 'barrel', blocksProjectile: true, barScale: 0.5, ...WOOD },
  chair: { name: 'Chair', solid: true, tall: false, cover: 2, hp: 4, sprite: 'chair', blocksProjectile: true, barScale: 0.35, ...WOOD },
  bush: { name: 'Bush', solid: true, tall: false, cover: 2, hp: 4, sprite: 'bush', blocksProjectile: true, barScale: 0.5, ...ORGANIC },
  log: { name: 'Fallen Log', solid: true, tall: false, cover: 2, hp: 8, sprite: 'log', blocksProjectile: true, barScale: 0.8, ...WOOD },
  stump: { name: 'Stump', solid: true, tall: false, cover: 2, hp: 6, sprite: 'stump', blocksProjectile: true, barScale: 0.45, ...WOOD },
  rubble: { name: 'Rubble', solid: true, tall: false, cover: 2, hp: 10, sprite: 'rubble', blocksProjectile: true, barScale: 0.65, ...STONE },
  arch: { name: 'Fallen Arch', solid: true, tall: false, cover: 2, hp: 16, sprite: 'arch', blocksProjectile: true, barScale: 0.85, ...STONE },
  rope_coil: { name: 'Coiled Rope', solid: true, tall: false, cover: 2, hp: 5, sprite: 'rope', blocksProjectile: true, barScale: 0.4, ...WOOD },
  flower: { name: 'Fey Flowers', solid: false, tall: false, cover: 0, hp: null, sprite: 'flower', blocksProjectile: false },
  // === Height (elevation tiles) — projectiles fly over ===
  cliff_1: { name: 'Ledge (High Ground)', solid: false, elevation: 1, sprite: 'cliff1', blocksProjectile: false },
  cliff_2: { name: 'Bluff (High Ground)', solid: false, elevation: 2, sprite: 'cliff2', blocksProjectile: false },
  gravel: { name: 'Scree', solid: false, difficult: true, sprite: 'gravel', blocksProjectile: false },
};

export function obstacleBlocksProjectile(ob) {
  if (!ob) return false;
  if (ob.blocksProjectile === false) return false;
  if (ob.blocksProjectile === true) return true;
  return !!(ob.tall || (ob.solid && ob.hp));
}
