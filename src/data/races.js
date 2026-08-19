// D&D 5e (2014 PHB) playable races. Each gives ability score increases,
// speed, size, and a couple of combat-relevant features.

export const RACES = [
  {
    id: 'human', name: 'Human', hpMult: 1.0,
    asi: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 },
    speed: 30, size: 'Medium', darkvision: false,
    desc: 'Versatile and ambitious. +1 to every ability score.',
    features: [{ name: 'Human Versatility', text: '+1 to all ability scores.' }],
  },
  {
    id: 'elf', name: 'High Elf', hpMult: 1.0,
    asi: { DEX: 2, INT: 1 },
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'Graceful and keen-eyed. +2 DEX, +1 INT.',
    features: [
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
      { name: 'Keen Senses', text: 'Proficiency in Perception.' },
      { name: 'Fey Ancestry', text: 'Advantage on saves vs. being charmed.' },
    ],
    bonusSkills: ['Perception'],
  },
  {
    id: 'dwarf', name: 'Dwarf', hpMult: 1.0,
    asi: { CON: 2, WIS: 1 },
    speed: 25, size: 'Medium', darkvision: true,
    desc: 'Stout and unyielding. +2 CON, +1 WIS.',
    features: [
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
      { name: 'Dwarven Resilience', text: 'Advantage on saves vs. poison; resistance to poison damage.' },
    ],
    resist: ['poison'],
  },
  {
    id: 'halfling', name: 'Halfling', hpMult: 1.0,
    asi: { DEX: 2, CHA: 1 },
    speed: 25, size: 'Small', darkvision: false,
    desc: 'Lucky and nimble. +2 DEX, +1 CHA.',
    naturallyStealthy: true,
    features: [
      { name: 'Lucky', text: 'When you roll a 1 on an attack, ability check or save, you may reroll the die once.' },
      { name: 'Brave', text: 'Advantage on saves vs. being frightened.' },
      { name: 'Naturally Stealthy', text: 'You can attempt to hide even when you are obscured only by a creature that is at least one size larger than you.' },
    ],
  },
  {
    id: 'halfelf', name: 'Half-Elf', hpMult: 1.0,
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
    id: 'half_orc', name: 'Half-Orc', hpMult: 1.0,
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
    id: 'tiefling', name: 'Tiefling', hpMult: 1.0,
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
    id: 'gnome', name: 'Gnome', hpMult: 1.0,
    asi: { INT: 2, CON: 1 },
    speed: 25, size: 'Small', darkvision: true,
    desc: 'Clever tinkerers. +2 INT, +1 CON.',
    features: [
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
      { name: 'Gnome Cunning', text: 'Advantage on INT, WIS and CHA saves vs. magic.' },
    ],
  },
  {
    id: 'dragonborn', name: 'Dragonborn', hpMult: 1.0,
    asi: { STR: 2, CHA: 1 },
    speed: 30, size: 'Medium', darkvision: false,
    desc: 'Draconic warriors. +2 STR, +1 CHA.',
    features: [
      { name: 'Breath Weapon', text: 'Once per floor, exhale a 3-tile cone of elemental damage (fire, cold, acid, or lightning).' },
      { name: 'Draconic Resistance', text: 'Resistance to the damage type of your draconic ancestry.' },
    ],
  },
  {
    id: 'wood_elf', name: 'Wood Elf', hpMult: 1.0,
    asi: { DEX: 2, WIS: 1 },
    speed: 35, size: 'Medium', darkvision: true,
    maskOfTheWild: true,
    desc: 'Wild and fleet-footed. +2 DEX, +1 WIS.',
    features: [
      { name: 'Mask of the Wild', text: 'You can attempt to hide even when you are only lightly obscured by foliage, mist, or other natural phenomena.' },
      { name: 'Fleet of Foot', text: 'Your base walking speed is 35 feet.' },
      { name: 'Darkvision', text: 'You see perfectly in dim light and darkness.' },
      { name: 'Keen Senses', text: 'Proficiency in Perception.' },
      { name: 'Fey Ancestry', text: 'Advantage on saves vs. being charmed.' },
    ],
    bonusSkills: ['Perception'],
  },
];

export const RACE_MAP = Object.fromEntries(RACES.map(r => [r.id, r]));

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
