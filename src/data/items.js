// Items. EVERY item carries `persistent` (true = bought in the hub shop with
// soul shards, kept between runs; false = found during a run, wiped when the
// run ends). Weapon/armor stats follow 5e.

// ---------------- WEAPONS ----------------
export const WEAPONS = {
  // Simple melee
  club: { name: 'Club', dmg: '1d4', dmgType: 'bludgeoning', type: 'simple', range: 'melee', properties: ['light'], value: 1 },
  dagger: { name: 'Dagger', dmg: '1d4', dmgType: 'piercing', type: 'simple', range: 'melee', properties: ['finesse', 'light', 'thrown(2)'], value: 2 },
  greatclub: { name: 'Greatclub', dmg: '1d8', dmgType: 'bludgeoning', type: 'simple', range: 'melee', properties: ['two-handed'], value: 2 },
  handaxe: { name: 'Handaxe', dmg: '1d6', dmgType: 'slashing', type: 'simple', range: 'melee', properties: ['light', 'thrown(2)'], value: 5 },
  javelin: { name: 'Javelin', dmg: '1d6', dmgType: 'piercing', type: 'simple', range: 'thrown(6)', properties: ['thrown(6)'], value: 1 },
  mace: { name: 'Mace', dmg: '1d6', dmgType: 'bludgeoning', type: 'simple', range: 'melee', properties: [], value: 5 },
  quarterstaff: { name: 'Quarterstaff', dmg: '1d6', dmgType: 'bludgeoning', type: 'simple', range: 'melee', properties: ['versatile(1d8)'], value: 2 },
  spear: { name: 'Spear', dmg: '1d6', dmgType: 'piercing', type: 'simple', range: 'melee', properties: ['thrown(2)', 'versatile(1d8)'], value: 1 },
  sickle: { name: 'Sickle', dmg: '1d4', dmgType: 'slashing', type: 'simple', range: 'melee', properties: ['light'], value: 1 },
  light_crossbow: { name: 'Light Crossbow', dmg: '1d8', dmgType: 'piercing', type: 'simple', range: 'ranged(8)', properties: ['two-handed', 'loading'], value: 25 },
  shortbow: { name: 'Shortbow', dmg: '1d6', dmgType: 'piercing', type: 'simple', range: 'ranged(8)', properties: ['two-handed'], value: 25 },
  sling: { name: 'Sling', dmg: '1d4', dmgType: 'bludgeoning', type: 'simple', range: 'ranged(3)', properties: [], value: 1 },
  // Martial melee
  battleaxe: { name: 'Battleaxe', dmg: '1d8', dmgType: 'slashing', type: 'martial', range: 'melee', properties: ['versatile(1d10)'], value: 10 },
  flail: { name: 'Flail', dmg: '1d8', dmgType: 'bludgeoning', type: 'martial', range: 'melee', properties: [], value: 10 },
  glaive: { name: 'Glaive', dmg: '1d10', dmgType: 'slashing', type: 'martial', range: 'melee', properties: ['heavy', 'reach', 'two-handed'], value: 20 },
  greataxe: { name: 'Greataxe', dmg: '1d12', dmgType: 'slashing', type: 'martial', range: 'melee', properties: ['heavy', 'two-handed'], value: 30 },
  greatsword: { name: 'Greatsword', dmg: '2d6', dmgType: 'slashing', type: 'martial', range: 'melee', properties: ['heavy', 'two-handed'], value: 50 },
  halberd: { name: 'Halberd', dmg: '1d10', dmgType: 'slashing', type: 'martial', range: 'melee', properties: ['heavy', 'reach', 'two-handed'], value: 20 },
  longsword: { name: 'Longsword', dmg: '1d8', dmgType: 'slashing', type: 'martial', range: 'melee', properties: ['versatile(1d10)'], value: 15 },
  maul: { name: 'Maul', dmg: '2d6', dmgType: 'bludgeoning', type: 'martial', range: 'melee', properties: ['heavy', 'two-handed'], value: 10 },
  morningstar: { name: 'Morningstar', dmg: '1d8', dmgType: 'piercing', type: 'martial', range: 'melee', properties: [], value: 15 },
  pike: { name: 'Pike', dmg: '1d10', dmgType: 'piercing', type: 'martial', range: 'melee', properties: ['heavy', 'reach', 'two-handed'], value: 5 },
  rapier: { name: 'Rapier', dmg: '1d8', dmgType: 'piercing', type: 'martial', range: 'melee', properties: ['finesse'], value: 25 },
  scimitar: { name: 'Scimitar', dmg: '1d6', dmgType: 'slashing', type: 'martial', range: 'melee', properties: ['finesse', 'light'], value: 25 },
  shortsword: { name: 'Shortsword', dmg: '1d6', dmgType: 'piercing', type: 'martial', range: 'melee', properties: ['finesse', 'light'], value: 10 },
  warhammer: { name: 'Warhammer', dmg: '1d8', dmgType: 'bludgeoning', type: 'martial', range: 'melee', properties: ['versatile(1d10)'], value: 15 },
  whip: { name: 'Whip', dmg: '1d4', dmgType: 'slashing', type: 'martial', range: 'melee', properties: ['finesse', 'reach'], value: 2 },
  // Martial ranged
  hand_crossbow: { name: 'Hand Crossbow', dmg: '1d6', dmgType: 'piercing', type: 'martial', range: 'ranged(3)', properties: ['light', 'loading'], value: 75 },
  heavy_crossbow: { name: 'Heavy Crossbow', dmg: '1d10', dmgType: 'piercing', type: 'martial', range: 'ranged(10)', properties: ['heavy', 'two-handed', 'loading'], value: 50 },
  longbow: { name: 'Longbow', dmg: '1d8', dmgType: 'piercing', type: 'martial', range: 'ranged(15)', properties: ['heavy', 'two-handed'], value: 50 },
  // Legendary (town rare-shop only; never from random loot)
  orin_dagger: { name: "Orin's Dagger", dmg: '2d4', dmgType: 'piercing', type: 'martial', range: 'melee', properties: ['finesse', 'light'], legendary: true, bonus: 3, extraDmg: '2d6', extraType: 'necrotic', value: 12000 },
  blade_of_avernus: { name: 'Blade of Avernus', dmg: '2d6', dmgType: 'slashing', type: 'martial', range: 'melee', properties: ['heavy', 'two-handed'], legendary: true, bonus: 3, extraDmg: '2d6', extraType: 'fire', value: 16000 },
};

// Unarmed / natural attacks
export const FISTS = { name: 'Unarmed Strike', dmg: '1', dmgType: 'bludgeoning', type: 'simple', range: 'melee', properties: [], value: 0 };

// ---------------- ARMOR ----------------
// AC formula: {base: 10, dex: true, dexMax: 2} -> AC = base + min(dexMod, dexMax)
export const ARMORS = {
  none: { name: 'No Armor', ac: { base: 10, dex: true, dexMax: 99 }, stealth: false, type: 'none', value: 0 },
  padded: { name: 'Padded', ac: { base: 11, dex: true, dexMax: 99 }, stealth: true, type: 'light', value: 5 },
  leather: { name: 'Leather', ac: { base: 11, dex: true, dexMax: 99 }, stealth: false, type: 'light', value: 10 },
  studded_leather: { name: 'Studded Leather', ac: { base: 12, dex: true, dexMax: 99 }, stealth: false, type: 'light', value: 45 },
  hide: { name: 'Hide', ac: { base: 12, dex: true, dexMax: 2 }, stealth: false, type: 'medium', value: 10 },
  chain_shirt: { name: 'Chain Shirt', ac: { base: 13, dex: true, dexMax: 2 }, stealth: false, type: 'medium', value: 50 },
  scale_mail: { name: 'Scale Mail', ac: { base: 14, dex: true, dexMax: 2 }, stealth: true, type: 'medium', value: 50 },
  breastplate: { name: 'Breastplate', ac: { base: 14, dex: true, dexMax: 2 }, stealth: false, type: 'medium', value: 400 },
  half_plate: { name: 'Half Plate', ac: { base: 15, dex: true, dexMax: 2 }, stealth: true, type: 'medium', value: 750 },
  ring_mail: { name: 'Ring Mail', ac: { base: 14, dex: false, dexMax: 0 }, stealth: true, type: 'heavy', value: 30 },
  chain_mail: { name: 'Chain Mail', ac: { base: 16, dex: false, dexMax: 0 }, stealth: true, type: 'heavy', value: 75 },
  splint: { name: 'Splint', ac: { base: 17, dex: false, dexMax: 0 }, stealth: true, type: 'heavy', value: 200 },
  plate: { name: 'Plate', ac: { base: 18, dex: false, dexMax: 0 }, stealth: true, type: 'heavy', value: 1500 },
  hellforged_plate: { name: 'Hellforged Plate', ac: { base: 20, dex: false, dexMax: 0 }, stealth: true, type: 'heavy', legendary: true, value: 20000 },
};

export const SHIELDS = { shield: { name: 'Shield', acBonus: 2, value: 10 } };

// ---------------- MAGIC ENCHANTMENTS ----------------
export const ENCHANTMENTS = {
  weapon_plus1: { name: '+1 Weapon', tier: 1, slot: 'weapon', bonus: 1, value: 1000, desc: '+1 to attack and damage rolls.' },
  weapon_plus2: { name: '+2 Weapon', tier: 2, slot: 'weapon', bonus: 2, value: 4000, desc: '+2 to attack and damage rolls.' },
  weapon_plus3: { name: '+3 Weapon', tier: 3, slot: 'weapon', bonus: 3, value: 12000, desc: '+3 to attack and damage rolls.' },
  flaming: { name: 'Flaming', tier: 2, slot: 'weapon', extraDmg: '2d6', extraType: 'fire', value: 2500, desc: 'Deals +2d6 fire damage on a hit.' },
  frost: { name: 'Frost Brand', tier: 2, slot: 'weapon', extraDmg: '1d6', extraType: 'cold', value: 2200, desc: 'Deals +1d6 cold damage on a hit.' },
  shocking: { name: 'Shocking', tier: 2, slot: 'weapon', extraDmg: '1d6', extraType: 'lightning', value: 2200, desc: 'Deals +1d6 lightning damage on a hit.' },
  vicious: { name: 'Vicious', tier: 1, slot: 'weapon', vicious: true, value: 350, desc: 'Deals +2d6 extra damage on a critical hit.' },
  wounding: { name: 'Wounding', tier: 2, slot: 'weapon', wounding: true, value: 2000, desc: 'On a hit, the target bleeds for 1d4 damage at the start of its turns.' },
  armor_plus1: { name: '+1 Armor', tier: 1, slot: 'armor', bonus: 1, value: 1500, desc: '+1 AC.' },
  armor_plus2: { name: '+2 Armor', tier: 2, slot: 'armor', bonus: 2, value: 6000, desc: '+2 AC.' },
  armor_plus3: { name: '+3 Armor', tier: 3, slot: 'armor', bonus: 3, value: 16000, desc: '+3 AC.' },
  cloak_of_protection: { name: 'Cloak of Protection', tier: 2, slot: 'trinket', acBonus: 1, saveBonus: 1, value: 3500, desc: '+1 AC and +1 to all saving throws.' },
  ring_of_protection: { name: 'Ring of Protection', tier: 1, slot: 'trinket', acBonus: 1, saveBonus: 1, value: 3500, desc: '+1 AC and +1 to all saving throws.' },
  ring_of_evasion: { name: 'Ring of Evasion', tier: 2, slot: 'trinket', evade: true, value: 5000, desc: 'Once per floor, automatically succeed on a DEX save.' },
  ring_of_regen: { name: 'Ring of Regeneration', tier: 3, slot: 'trinket', regen: '1d6', value: 8000, desc: 'Regain 1d6 HP at the start of each of your turns.' },
  amulet_of_health: { name: 'Amulet of Health', tier: 3, slot: 'trinket', conSet: 19, value: 8000, desc: 'Your CON score becomes 19 while worn.' },
  gauntlets_ogre: { name: 'Gauntlets of Ogre Power', tier: 2, slot: 'trinket', strSet: 19, value: 4000, desc: 'Your STR score becomes 19 while worn.' },
  headband_intellect: { name: 'Headband of Intellect', tier: 2, slot: 'trinket', intSet: 19, value: 4000, desc: 'Your INT score becomes 19 while worn.' },
  boots_speed: { name: 'Boots of Speed', tier: 2, slot: 'trinket', speedBonus: 1, value: 4000, desc: '+1 tile of movement.' },
  boots_elvenkind: { name: 'Boots of Elvenkind', tier: 1, slot: 'trinket', stealthAdv: true, value: 2500, desc: 'Advantage on Stealth checks.' },
  bracers_archery: { name: 'Bracers of Archery', tier: 1, slot: 'trinket', archery: true, value: 1500, desc: '+2 damage with ranged weapon attacks.' },
};

// ---------------- CONSUMABLES (always temporary) ----------------
export const CONSUMABLES = {
  healing_potion: {
    name: 'Potion of Healing', kind: 'potion', heal: '2d4+2', value: 50, rarity: 'Common', useText: 'Drink to regain 2d4+2 HP.',
    desc: 'A shimmering red liquid. Bonus action to drink, restores 2d4+2 HP.',
  },
  greater_healing: {
    name: 'Potion of Greater Healing', kind: 'potion', heal: '4d4+4', value: 150, rarity: 'Uncommon', useText: 'Drink to regain 4d4+4 HP.',
    desc: 'Restores 4d4+4 HP.',
  },
  superior_healing: {
    name: 'Potion of Superior Healing', kind: 'potion', heal: '8d4+8', value: 450, rarity: 'Rare', useText: 'Drink to regain 8d4+8 HP.',
    desc: 'Restores 8d4+8 HP.',
  },
  supreme_healing: {
    name: 'Potion of Supreme Healing', kind: 'potion', heal: '10d4+20', value: 1350, rarity: 'Very Rare', useText: 'Drink to regain 10d4+20 HP.',
    desc: 'Restores 10d4+20 HP.',
  },
  potion_giant_strength: {
    name: 'Potion of Hill Giant Strength', kind: 'potion', buff: { str: 21 }, duration: 'floor', value: 250, rarity: 'Uncommon', useText: 'Set STR to 21 for this floor.',
    desc: 'Your Strength becomes 21 until the end of the floor.',
  },
  potion_speed: {
    name: 'Potion of Speed', kind: 'potion', buff: { haste: true }, duration: 10, value: 400, rarity: 'Very Rare', useText: 'Gain the effects of Haste for 10 rounds.',
    desc: 'Haste for 10 rounds: +2 AC, advantage on DEX saves, one extra action per turn.',
  },
  potion_resistance: {
    name: 'Potion of Resistance', kind: 'potion', buff: { resistAll: true }, duration: 10, value: 300, rarity: 'Uncommon', useText: 'Resist all damage for 10 rounds.',
    desc: 'Resistance to all damage for 10 rounds.',
  },
  potion_fire_breath: {
    name: 'Potion of Fire Breath', kind: 'potion', buff: { breath: 'fire' }, duration: 10, value: 250, rarity: 'Uncommon', useText: 'Gain a 3-tile fire breath (4d6) for 10 rounds.',
    desc: 'Gain a fire breath attack (4d6, 3-tile cone) for 10 rounds.',
  },
  alchemists_fire: {
    name: "Alchemist's Fire", kind: 'throw', dmg: '2d4', dmgType: 'fire', fx: 'burning', value: 50, rarity: 'Common', useText: 'Throw: 2d4 fire + burning.',
    desc: 'Throw at a foe: 2d4 fire damage and the target catches fire (burning, DEX save ends).',
  },
  acid_vial: {
    name: 'Vial of Acid', kind: 'throw', dmg: '2d6', dmgType: 'acid', value: 25, rarity: 'Common', useText: 'Throw: 2d6 acid.',
    desc: 'Throw at a foe: 2d6 acid damage.',
  },
  holy_water: {
    name: 'Holy Water', kind: 'throw', dmg: '2d6', dmgType: 'radiant', value: 25, rarity: 'Common', useText: 'Throw: 2d6 radiant (double vs fiends/undead).',
    desc: '2d6 radiant damage; fiends and undead take double.',
  },
  antitoxin: {
    name: 'Antitoxin', kind: 'potion', buff: { poisonImmune: true }, duration: 10, value: 50, rarity: 'Common', useText: 'Immune to poison for 10 rounds.',
    desc: 'Immunity to the poisoned condition and poison damage for 10 rounds.',
  },
  scroll_revivify: {
    name: 'Scroll of Revivify', kind: 'scroll', casts: 'revivify', value: 450, rarity: 'Rare', useText: 'Cast Revivify on a dead ally (same battle).',
    desc: 'A single-use scroll. Brings a dead ally back to 1 HP if used within 3 rounds of their death, during the same battle.',
  },
  scroll_fireball: {
    name: 'Scroll of Fireball', kind: 'scroll', casts: 'fireball', value: 300, rarity: 'Uncommon', useText: 'Cast Fireball once (uses a spell slot if you have one; otherwise free).',
    desc: 'A single-use scroll of Fireball. Anyone can use it; casters cast it at their normal DC, others at DC 13.',
  },
  scroll_lightning: {
    name: 'Scroll of Lightning Bolt', kind: 'scroll', casts: 'lightning_bolt', value: 300, rarity: 'Uncommon', useText: 'Cast Lightning Bolt once.',
    desc: 'A single-use scroll of Lightning Bolt.',
  },
  smoke_bomb: {
    name: 'Smoke Bomb', kind: 'throw', fx: 'smoke', value: 40, rarity: 'Common', useText: 'Throw: heavy smoke in a 2-tile radius (grants cover vs ranged attacks).',
    desc: 'Fills a 2-tile radius with smoke for 3 rounds: attacks through it have disadvantage.',
  },
};

// ---------------- HUB SHOP (persistent relics) ----------------
// These are the ONLY persistent items. Effect ids are implemented in run.js.
export const SHOP_ITEMS = [
  {
    id: 'potion_belt', name: "Alchemist's Belt", cost: 150, icon: 'potion', persistent: true, owned: 0,
    desc: 'Start every run with 2 Potions of Healing in your pack.',
    effect: 'start_potions', effectText: '+2 Potions of Healing at the start of each run',
  },
  {
    id: 'lucky_coin', name: "Tymora's Lucky Coin", cost: 250, icon: 'coin', persistent: true, owned: 0,
    desc: 'A coin blessed by the goddess of luck. +1 to all of your party\'s saving throws.',
    effect: 'save_bonus', effectText: 'Party +1 on all saving throws',
  },
  {
    id: 'banner_dawn', name: 'Banner of Dawn', cost: 300, icon: 'banner', persistent: true, owned: 0,
    desc: 'The sight of this banner quickens your step. +3 to your party\'s initiative rolls.',
    effect: 'initiative_bonus', effectText: 'Party +3 initiative',
  },
  {
    id: 'ring_second_chances', name: 'Ring of Second Chances', cost: 400, icon: 'ring', persistent: true, owned: 0, oncePerRun: true,
    desc: 'Once per run, when your hero would die, they are instead left at 1 HP. The ring crumbles to ash until the next run.',
    effect: 'death_ward_hero', effectText: 'Hero survives one death per run at 1 HP',
  },
  {
    id: 'veterans_manual', name: "Veteran's Manual", cost: 500, icon: 'book', persistent: true, owned: 0,
    desc: 'Hard-won lessons from a hundred battles. Your party starts at level 3.',
    effect: 'start_level', effectText: 'Party starts runs at level 3',
  },
  {
    id: 'enchanted_compass', name: 'Enchanted Compass', cost: 350, icon: 'compass', persistent: true, owned: 0,
    desc: 'Reveals the whole floor map at the start of every battle.',
    effect: 'reveal_map', effectText: 'Full map reveal at combat start',
  },
  {
    id: 'pouch_plenty', name: 'Pouch of Plenty', cost: 450, icon: 'pouch', persistent: true, owned: 0,
    desc: 'More gold, more loot. +1 loot choice after every floor you clear, and +25% soul shards.',
    effect: 'loot_bonus', effectText: '+1 loot choice and +25% shards',
  },
  {
    id: 'wayfarers_map', name: "Wayfarer's Map", cost: 300, icon: 'map', persistent: true, owned: 0,
    desc: 'Choose 1 of 3 destinations when you clear a floor, instead of one.',
    effect: 'map_choice', effectText: 'Pick 1 of 3 next-floor locations',
  },
  {
    id: 'helm_vigilance', name: 'Helm of Vigilance', cost: 400, icon: 'helm', persistent: true, owned: 0,
    desc: 'You cannot be surprised. Enemies never gain the advantage of surprise rounds.',
    effect: 'no_surprise', effectText: 'Immune to surprise rounds',
  },
  {
    id: 'infernal_contract', name: 'Infernal Contract', cost: 250, icon: 'contract', persistent: true, owned: 0,
    desc: 'Signed in blood: +50% soul shards earned, but every floor spawns one extra enemy. Some prices are paid in blood.',
    effect: 'infernal_contract', effectText: '+50% shards, +1 enemy per floor',
  },
];

export const SHOP_ITEM_MAP = Object.fromEntries(SHOP_ITEMS.map(i => [i.id, i]));

// stamp ids onto every definition for loot/lookup convenience
for (const [id, def] of Object.entries(WEAPONS)) def.id = id;
for (const [id, def] of Object.entries(ARMORS)) def.id = id;
for (const [id, def] of Object.entries(SHIELDS)) def.id = id;
for (const [id, def] of Object.entries(ENCHANTMENTS)) def.id = id;
for (const [id, def] of Object.entries(CONSUMABLES)) def.id = id;
