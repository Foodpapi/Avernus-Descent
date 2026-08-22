// D&D 5e (2014 PHB) playable races and subraces. Creation shows the nine
// PHB races first; Elf / Dwarf / Halfling / Gnome then open a subrace picker.
// Subraces keep shared family traits and stamp the flags combat/rules read.

export const RACES = [
  {
    id: 'human', name: 'Human', family: 'human', hpMult: 1.0,
    asi: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 },
    speed: 30, size: 'Medium', darkvision: false,
    desc: 'Versatile and ambitious. +1 to every ability score.',
    features: [{ name: 'Human Versatility', text: '+1 to all ability scores.' }],
  },
  {
    id: 'elf', name: 'High Elf', family: 'elf', hpMult: 1.0,
    asi: { DEX: 2, INT: 1 },
    speed: 30, size: 'Medium', darkvision: true,
    cantrip: 'fire_bolt',
    weaponProf: ['longsword', 'shortsword', 'shortbow', 'longbow'],
    desc: 'Graceful scholars of the old kingdoms. +2 DEX, +1 INT.',
    features: [
      { name: 'Cantrip', text: 'You know one wizard cantrip (Fire Bolt). Intelligence is your spellcasting ability for it.' },
      { name: 'Elf Weapon Training', text: 'Proficient with the longsword, shortsword, shortbow, and longbow.' },
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
      { name: 'Keen Senses', text: 'Proficiency in Perception.' },
      { name: 'Fey Ancestry', text: 'Advantage on saves vs. being charmed.' },
    ],
    bonusSkills: ['Perception'],
  },
  {
    id: 'wood_elf', name: 'Wood Elf', family: 'elf', hpMult: 1.0,
    asi: { DEX: 2, WIS: 1 },
    speed: 35, size: 'Medium', darkvision: true,
    maskOfTheWild: true,
    weaponProf: ['longsword', 'shortsword', 'shortbow', 'longbow'],
    desc: 'Wild and fleet-footed. +2 DEX, +1 WIS.',
    features: [
      { name: 'Mask of the Wild', text: 'You can attempt to hide even when you are only lightly obscured by foliage, mist, or other natural phenomena.' },
      { name: 'Fleet of Foot', text: 'Your base walking speed is 35 feet.' },
      { name: 'Elf Weapon Training', text: 'Proficient with the longsword, shortsword, shortbow, and longbow.' },
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
      { name: 'Keen Senses', text: 'Proficiency in Perception.' },
      { name: 'Fey Ancestry', text: 'Advantage on saves vs. being charmed.' },
    ],
    bonusSkills: ['Perception'],
  },
  {
    id: 'drow', name: 'Drow', family: 'elf', hpMult: 1.0,
    asi: { DEX: 2, CHA: 1 },
    speed: 30, size: 'Medium', darkvision: true, vision: 24,
    sunlightSensitivity: true,
    featCastAbility: 'CHA',
    innate: { faerie_fire: 3, darkness: 5 },
    weaponProf: ['rapier', 'shortsword', 'hand_crossbow'],
    desc: 'Underdark elves of keen senses and cruel magic. +2 DEX, +1 CHA.',
    features: [
      { name: 'Superior Darkvision', text: 'Your darkvision has a range of 120 feet (24 tiles).' },
      { name: 'Sunlight Sensitivity', text: 'Disadvantage on attack rolls in sunlit locations (open sky, town, forest, ship deck).' },
      { name: 'Drow Magic', text: 'At 3rd level you can cast Faerie Fire once per floor; at 5th, Darkness. Charisma is your spellcasting ability.' },
      { name: 'Drow Weapon Training', text: 'Proficient with the rapier, shortsword, and hand crossbow.' },
      { name: 'Keen Senses', text: 'Proficiency in Perception.' },
      { name: 'Fey Ancestry', text: 'Advantage on saves vs. being charmed.' },
    ],
    bonusSkills: ['Perception'],
  },
  {
    id: 'dwarf', name: 'Hill Dwarf', family: 'dwarf', hpMult: 1.0,
    asi: { CON: 2, WIS: 1 },
    speed: 25, size: 'Medium', darkvision: true,
    resist: ['poison'],
    poisonSaveAdv: true,
    dwarvenToughness: true,
    weaponProf: ['battleaxe', 'handaxe', 'light_hammer', 'warhammer'],
    desc: 'Stout and unyielding. +2 CON, +1 WIS.',
    features: [
      { name: 'Dwarven Toughness', text: 'Your hit point maximum increases by 1, and it increases by 1 every time you gain a level.' },
      { name: 'Dwarven Resilience', text: 'Advantage on saves vs. poison; resistance to poison damage.' },
      { name: 'Dwarven Combat Training', text: 'Proficient with the battleaxe, handaxe, light hammer, and warhammer.' },
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
    ],
  },
  {
    id: 'mountain_dwarf', name: 'Mountain Dwarf', family: 'dwarf', hpMult: 1.0,
    asi: { STR: 2, CON: 2 },
    speed: 25, size: 'Medium', darkvision: true,
    resist: ['poison'],
    poisonSaveAdv: true,
    armorProf: ['light', 'medium'],
    weaponProf: ['battleaxe', 'handaxe', 'light_hammer', 'warhammer'],
    desc: 'Broad-shouldered warriors of the high holds. +2 STR, +2 CON.',
    features: [
      { name: 'Dwarven Armor Training', text: 'Proficient with light and medium armor.' },
      { name: 'Dwarven Resilience', text: 'Advantage on saves vs. poison; resistance to poison damage.' },
      { name: 'Dwarven Combat Training', text: 'Proficient with the battleaxe, handaxe, light hammer, and warhammer.' },
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
    ],
  },
  {
    id: 'halfling', name: 'Lightfoot Halfling', family: 'halfling', hpMult: 1.0,
    asi: { DEX: 2, CHA: 1 },
    speed: 25, size: 'Small', darkvision: false,
    lucky: true, brave: true, naturallyStealthy: true,
    desc: 'Lucky, nimble, and easy to overlook. +2 DEX, +1 CHA.',
    features: [
      { name: 'Naturally Stealthy', text: 'You can attempt to hide even when you are obscured only by a creature that is at least one size larger than you.' },
      { name: 'Lucky', text: 'When you roll a 1 on an attack, ability check or save, you may reroll the die once.' },
      { name: 'Brave', text: 'Advantage on saves vs. being frightened.' },
    ],
  },
  {
    id: 'stout_halfling', name: 'Stout Halfling', family: 'halfling', hpMult: 1.0,
    asi: { DEX: 2, CON: 1 },
    speed: 25, size: 'Small', darkvision: false,
    lucky: true, brave: true,
    resist: ['poison'],
    poisonSaveAdv: true,
    desc: 'Hardier kin of the lightfoots. +2 DEX, +1 CON.',
    features: [
      { name: 'Stout Resilience', text: 'Advantage on saves vs. poison; resistance to poison damage.' },
      { name: 'Lucky', text: 'When you roll a 1 on an attack, ability check or save, you may reroll the die once.' },
      { name: 'Brave', text: 'Advantage on saves vs. being frightened.' },
      { name: 'Naturally Stealthy', text: 'You can attempt to hide even when you are obscured only by a creature that is at least one size larger than you.' },
    ],
  },
  {
    id: 'gnome', name: 'Rock Gnome', family: 'gnome', hpMult: 1.0,
    asi: { INT: 2, CON: 1 },
    speed: 25, size: 'Small', darkvision: true,
    gnomeCunning: true,
    desc: 'Clever tinkerers. +2 INT, +1 CON.',
    features: [
      { name: 'Artificer\'s Lore', text: 'Your tinkering mind is represented by Gnome Cunning and a sturdy constitution.' },
      { name: 'Gnome Cunning', text: 'Advantage on INT, WIS and CHA saves vs. magic.' },
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
    ],
  },
  {
    id: 'forest_gnome', name: 'Forest Gnome', family: 'gnome', hpMult: 1.0,
    asi: { INT: 2, DEX: 1 },
    speed: 25, size: 'Small', darkvision: true,
    gnomeCunning: true,
    desc: 'Quiet folk of the deep woods. +2 INT, +1 DEX.',
    features: [
      { name: 'Natural Illusionist', text: 'You know minor tricks of illusion (no combat cantrip in this game — the woods themselves hide you).' },
      { name: 'Speak with Small Beasts', text: 'You can communicate simple ideas with Small or smaller beasts.' },
      { name: 'Gnome Cunning', text: 'Advantage on INT, WIS and CHA saves vs. magic.' },
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
    ],
  },
  {
    id: 'halfelf', name: 'Half-Elf', family: 'halfelf', hpMult: 1.0,
    asi: { CHA: 2, DEX: 1, CON: 1 },
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'Charming and adaptable. +2 CHA, +1 DEX, +1 CON.',
    features: [
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
      { name: 'Fey Ancestry', text: 'Advantage on saves vs. being charmed.' },
      { name: 'Skill Versatility', text: 'Proficiency in two skills of your choice (simplified: +1 to two skills).' },
    ],
  },
  {
    id: 'half_orc', name: 'Half-Orc', family: 'halforc', hpMult: 1.0,
    asi: { STR: 2, CON: 1 },
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'Fierce survivors. +2 STR, +1 CON.',
    features: [
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
      { name: 'Relentless Endurance', text: 'Once per floor, when you would drop to 0 HP, drop to 1 HP instead.' },
      { name: 'Savage Attacks', text: 'Critical hits deal one extra weapon die.' },
    ],
  },
  {
    id: 'tiefling', name: 'Tiefling', family: 'tiefling', hpMult: 1.0,
    asi: { CHA: 2, INT: 1 },
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'Infernal-blooded outcasts. +2 CHA, +1 INT.',
    features: [
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
      { name: 'Hellish Resistance', text: 'Resistance to fire damage.' },
    ],
    resist: ['fire'],
  },
  {
    id: 'dragonborn', name: 'Dragonborn', family: 'dragonborn', hpMult: 1.0,
    asi: { STR: 2, CHA: 1 },
    speed: 30, size: 'Medium', darkvision: false,
    desc: 'Draconic warriors. +2 STR, +1 CHA.',
    features: [
      { name: 'Breath Weapon', text: 'Once per floor, exhale a 3-tile cone of elemental damage (fire, cold, acid, or lightning).' },
      { name: 'Draconic Resistance', text: 'Resistance to the damage type of your draconic ancestry.' },
    ],
  },
];

export const RACE_MAP = Object.fromEntries(RACES.map(r => [r.id, r]));

// Creation step 1: one card per PHB race. Families with more than one
// playable entry (Elf, Dwarf, Halfling, Gnome) open a subrace picker.
export const RACE_FAMILIES = [
  {
    id: 'human', name: 'Human',
    speed: 30, size: 'Medium', darkvision: false,
    desc: 'Versatile and ambitious. +1 to every ability score.',
    features: [{ name: 'Human Versatility', text: '+1 to all ability scores.' }],
  },
  {
    id: 'dwarf', name: 'Dwarf',
    speed: 25, size: 'Medium', darkvision: true,
    desc: 'Stout folk of the mountain halls. +2 CON, darkvision, and poison-hardy.',
    features: [
      { name: 'Dwarven Resilience', text: 'Advantage on saves vs. poison; resistance to poison damage.' },
      { name: 'Dwarven Combat Training', text: 'Proficient with the battleaxe, handaxe, light hammer, and warhammer.' },
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
    ],
  },
  {
    id: 'elf', name: 'Elf',
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'Graceful and long-lived. +2 DEX, darkvision, Keen Senses, and Fey Ancestry.',
    features: [
      { name: 'Keen Senses', text: 'Proficiency in Perception.' },
      { name: 'Fey Ancestry', text: 'Advantage on saves vs. being charmed.' },
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
    ],
  },
  {
    id: 'halfling', name: 'Halfling',
    speed: 25, size: 'Small', darkvision: false,
    desc: 'Small, lucky, and brave. +2 DEX. Choose Lightfoot or Stout.',
    features: [
      { name: 'Lucky', text: 'When you roll a 1 on an attack, ability check or save, you may reroll the die once.' },
      { name: 'Brave', text: 'Advantage on saves vs. being frightened.' },
    ],
  },
  {
    id: 'gnome', name: 'Gnome',
    speed: 25, size: 'Small', darkvision: true,
    desc: 'Clever Small folk. +2 INT, darkvision, and Gnome Cunning.',
    features: [
      { name: 'Gnome Cunning', text: 'Advantage on INT, WIS and CHA saves vs. magic.' },
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
    ],
  },
  {
    id: 'halfelf', name: 'Half-Elf',
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'Charming and adaptable. +2 CHA, +1 DEX, +1 CON.',
    features: [
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
      { name: 'Fey Ancestry', text: 'Advantage on saves vs. being charmed.' },
      { name: 'Skill Versatility', text: 'Proficiency in two skills of your choice (simplified: +1 to two skills).' },
    ],
  },
  {
    id: 'halforc', name: 'Half-Orc',
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'Fierce survivors. +2 STR, +1 CON.',
    features: [
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
      { name: 'Relentless Endurance', text: 'Once per floor, when you would drop to 0 HP, drop to 1 HP instead.' },
      { name: 'Savage Attacks', text: 'Critical hits deal one extra weapon die.' },
    ],
  },
  {
    id: 'tiefling', name: 'Tiefling',
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'Infernal-blooded outcasts. +2 CHA, +1 INT.',
    features: [
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
      { name: 'Hellish Resistance', text: 'Resistance to fire damage.' },
    ],
  },
  {
    id: 'dragonborn', name: 'Dragonborn',
    speed: 30, size: 'Medium', darkvision: false,
    desc: 'Draconic warriors. +2 STR, +1 CHA.',
    features: [
      { name: 'Breath Weapon', text: 'Once per floor, exhale a 3-tile cone of elemental damage (fire, cold, acid, or lightning).' },
      { name: 'Draconic Resistance', text: 'Resistance to the damage type of your draconic ancestry.' },
    ],
  },
];

export const RACE_FAMILY_MAP = Object.fromEntries(RACE_FAMILIES.map(f => [f.id, f]));

export function racesInFamily(familyId) {
  return RACES.filter(r => r.family === familyId);
}

export function raceOf(char) {
  if (!char) return null;
  return char.race || RACE_MAP[char.raceId] || null;
}

export function raceFlag(char, key) {
  const r = raceOf(char);
  return !!(r && r[key]);
}

export function baseAbilityScores() {
  return { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
}

export const SKILL_LIST = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival',
];

export const SKILL_ABILITY = {
  'Acrobatics': 'DEX', 'Animal Handling': 'WIS', 'Arcana': 'INT',
  'Athletics': 'STR', 'Deception': 'CHA', 'History': 'INT',
  'Insight': 'WIS', 'Intimidation': 'CHA', 'Investigation': 'INT',
  'Medicine': 'WIS', 'Nature': 'INT', 'Perception': 'WIS',
  'Performance': 'CHA', 'Persuasion': 'CHA', 'Religion': 'INT',
  'Sleight of Hand': 'DEX', 'Stealth': 'DEX', 'Survival': 'WIS',
};
