// D&D 5e classes: hit dice, saving throws, spellcasting progression,
// class features by level, and one or two subclasses each.

export const PROF_BY_LEVEL = { 1: 2, 2: 2, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3, 8: 3, 9: 4, 10: 4, 11: 4, 12: 4, 13: 5, 14: 5, 15: 5, 16: 5, 17: 6, 18: 6, 19: 6, 20: 6 };

export const ASI_LEVELS = [4, 8, 12, 16, 19];

// Spell slots: [level][spellLevel 1..9]
export const FULL_CASTER_SLOTS = {
  1: [2, 0, 0, 0, 0, 0, 0, 0, 0], 2: [3, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [4, 2, 0, 0, 0, 0, 0, 0, 0], 4: [4, 3, 0, 0, 0, 0, 0, 0, 0],
  5: [4, 3, 2, 0, 0, 0, 0, 0, 0], 6: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  7: [4, 3, 3, 1, 0, 0, 0, 0, 0], 8: [4, 3, 3, 2, 0, 0, 0, 0, 0],
  9: [4, 3, 3, 3, 1, 0, 0, 0, 0], 10: [4, 3, 3, 3, 2, 0, 0, 0, 0],
  11: [4, 3, 3, 3, 2, 1, 0, 0, 0], 12: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  13: [4, 3, 3, 3, 2, 1, 1, 0, 0], 14: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  15: [4, 3, 3, 3, 2, 1, 1, 1, 0], 16: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1], 18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1], 20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};

export const HALF_CASTER_SLOTS = {
  1: [0, 0, 0, 0, 0], 2: [2, 0, 0, 0, 0], 3: [3, 0, 0, 0, 0], 4: [3, 0, 0, 0, 0],
  5: [4, 2, 0, 0, 0], 6: [4, 2, 0, 0, 0], 7: [4, 3, 0, 0, 0], 8: [4, 3, 0, 0, 0],
  9: [4, 3, 2, 0, 0], 10: [4, 3, 2, 0, 0], 11: [4, 3, 3, 0, 0], 12: [4, 3, 3, 0, 0],
  13: [4, 3, 3, 1, 0], 14: [4, 3, 3, 1, 0], 15: [4, 3, 3, 2, 0], 16: [4, 3, 3, 2, 0],
  17: [4, 3, 3, 3, 1], 18: [4, 3, 3, 3, 1], 19: [4, 3, 3, 3, 2], 20: [4, 3, 3, 3, 2],
};

export const WARLOCK_SLOTS = {
  1: [1], 2: [2], 3: [0, 2], 4: [0, 2], 5: [0, 0, 2], 6: [0, 0, 2],
  7: [0, 0, 0, 2], 8: [0, 0, 0, 2], 9: [0, 0, 0, 0, 2], 10: [0, 0, 0, 0, 2],
  11: [0, 0, 0, 0, 3], 12: [0, 0, 0, 0, 3], 13: [0, 0, 0, 0, 3],
  14: [0, 0, 0, 0, 3], 15: [0, 0, 0, 0, 3],
  16: [0, 0, 0, 0, 3], 17: [0, 0, 0, 0, 4],
  18: [0, 0, 0, 0, 4], 19: [0, 0, 0, 0, 4],
  20: [0, 0, 0, 0, 4],
};

export const SPELL_LEVEL_NAMES = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

export const CANTRIP_COUNTS = { // full casters by class level
  bard: l => l >= 10 ? 4 : l >= 4 ? 3 : 2,
  cleric: l => l >= 10 ? 5 : l >= 4 ? 4 : 3,
  druid: l => l >= 10 ? 4 : l >= 4 ? 3 : 2,
  sorcerer: l => l >= 10 ? 6 : l >= 4 ? 5 : 4,
  warlock: l => l >= 10 ? 4 : l >= 4 ? 3 : 2,
  wizard: l => l >= 10 ? 5 : l >= 4 ? 4 : 3,
};

export const CLASSES = [
  {
    id: 'barbarian', name: 'Barbarian', hitDie: 12, spellAbility: null,
    saves: ['STR', 'CON'], hdLabel: 'd12',
    armor: ['light', 'medium', 'shields'], weapons: ['simple', 'martial'], skills: 2,
    skillChoices: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'],
    desc: 'A fierce warrior of primal rage who excels in melee combat, shrugging off blows that would fell others.',
    features: {
      1: ['Rage (2/day)', 'Unarmored Defense'],
      2: ['Reckless Attack', 'Danger Sense'],
      3: ['Primal Path'],
      5: ['Extra Attack', 'Fast Movement'],
      7: ['Feral Instinct'],
      9: ['Brutal Critical'],
      11: ['Relentless Rage'],
      20: ['Unlimited Rage'],
    },
    subclasses: {
      berserker: { name: 'Path of the Berserker', desc: 'Frenzied rage for a bonus attack each turn while raging.' },
      totem: { name: 'Path of the Totem Warrior', desc: 'Bear totem: resistance to all damage except psychic while raging.' },
    },
  },
  {
    id: 'bard', name: 'Bard', hitDie: 8, spellAbility: 'CHA', fullCaster: true,
    saves: ['DEX', 'CHA'],
    armor: ['light'], weapons: ['simple'], skills: 3,
    skillChoices: [], // any
    desc: 'An inspiring magician whose words weave magic, empowering allies and confounding foes.',
    features: {
      1: ['Bardic Inspiration (d6)'],
      2: ['Jack of All Trades', 'Song of Rest (d6)'],
      3: ['Bard College'],
      5: ['Font of Inspiration'],
      6: ['Countercharm'],
    },
    subclasses: {
      lore: { name: 'College of Lore', desc: 'Cutting Words: spend inspiration to penalize enemy rolls.' },
      valor: { name: 'College of Valor', desc: 'Combat Inspiration: allies add inspiration to damage.' },
    },
  },
  {
    id: 'cleric', name: 'Cleric', hitDie: 8, spellAbility: 'WIS', fullCaster: true,
    saves: ['WIS', 'CHA'],
    armor: ['light', 'medium', 'shields'], weapons: ['simple'], skills: 2,
    skillChoices: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'],
    desc: 'A priestly champion who wields divine magic in service of a higher power.',
    features: {
      1: ['Divine Domain', 'Domain Spells'],
      2: ['Channel Divinity'],
      5: ['Destroy Undead (CR 1/2)'],
      8: ['Divine Strike / Potent Cantrip'],
      10: ['Divine Intervention'],
    },
    subclasses: {
      life: { name: 'Life Domain', desc: 'Disciple of Life: your healing spells heal +2 per spell level.' },
      light: { name: 'Light Domain', desc: 'Warding Flare: impose disadvantage on attacks against you.' },
      tempest: { name: 'Tempest Domain', desc: 'Wrath of the Storm: thunderous retaliation against attackers.' },
      war: { name: 'War Domain', desc: 'War Priest: bonus-action attack, guided strikes.' },
    },
  },
  {
    id: 'druid', name: 'Druid', hitDie: 8, spellAbility: 'WIS', fullCaster: true,
    saves: ['INT', 'WIS'],
    armor: ['light', 'medium', 'shields'], weapons: ['simple'], skills: 2,
    skillChoices: ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'],
    desc: 'A priest of the old faith, wielding the powers of nature and wild beasts.',
    features: {
      1: ['Druidic Spellcasting'],
      2: ['Wild Shape'],
      3: ['Druid Circle'],
      6: ['Circle Feature'],
      18: ['Timeless Body'],
    },
    subclasses: {
      moon: { name: 'Circle of the Moon', desc: 'Combat Wild Shape: transform into a bear as a bonus action (once per floor).' },
      land: { name: 'Circle of the Land', desc: 'Natural Recovery: regain a spell slot once per floor.' },
    },
  },
  {
    id: 'fighter', name: 'Fighter', hitDie: 10, spellAbility: null,
    saves: ['STR', 'CON'],
    armor: ['light', 'medium', 'heavy', 'shields'], weapons: ['simple', 'martial'], skills: 2,
    skillChoices: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival'],
    extraAsi: [6, 14], // fighters gain extra ASIs at class levels 6 and 14
    desc: 'A master of martial combat, skilled with a variety of weapons and armor.',
    features: {
      1: ['Fighting Style', 'Second Wind'],
      2: ['Action Surge'],
      3: ['Martial Archetype'],
      5: ['Extra Attack'],
      9: ['Indomitable'],
      11: ['Extra Attack (2)'],
    },
    subclasses: {
      champion: { name: 'Champion', desc: 'Improved Critical: your weapon attacks score a critical on 19-20.' },
      battle_master: { name: 'Battle Master', desc: 'Combat Superiority: four d8 superiority dice for maneuvers (Trip, Riposte, Precision).' },
    },
  },
  {
    id: 'monk', name: 'Monk', hitDie: 8, spellAbility: null,
    saves: ['STR', 'DEX'],
    armor: [], weapons: ['simple', 'shortsword'], skills: 2,
    skillChoices: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'],
    desc: 'A master of martial arts, harnessing the power of the body in pursuit of physical and spiritual perfection.',
    features: {
      1: ['Martial Arts (d4)', 'Unarmored Defense'],
      2: ['Ki (2 points)', 'Unarmored Movement +10ft'],
      3: ['Monastic Tradition', 'Deflect Missiles'],
      5: ['Extra Attack', 'Stunning Strike'],
      7: ['Evasion', 'Stillness of Mind'],
    },
    subclasses: {
      open_hand: { name: 'Way of the Open Hand', desc: 'Open Hand Technique: your Flurry of Blows can knock foes prone.' },
      shadow: { name: 'Way of Shadow', desc: 'Shadow Arts: spend ki to become invisible and reposition.' },
    },
  },
  {
    id: 'paladin', name: 'Paladin', hitDie: 10, spellAbility: 'CHA', halfCaster: true,
    saves: ['WIS', 'CHA'],
    armor: ['light', 'medium', 'heavy', 'shields'], weapons: ['simple', 'martial'], skills: 2,
    skillChoices: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'],
    desc: 'A holy warrior bound to a sacred oath, smiting evil with divine fury.',
    features: {
      1: ['Divine Sense', 'Lay on Hands'],
      2: ['Fighting Style', 'Divine Smite'],
      3: ['Sacred Oath', 'Divine Health'],
      5: ['Extra Attack'],
      6: ['Aura of Protection'],
      11: ['Improved Divine Smite'],
    },
    subclasses: {
      devotion: { name: 'Oath of Devotion', desc: 'Sacred Weapon: add your CHA to attack rolls for 1 minute (1/floor).' },
      vengeance: { name: 'Oath of Vengeance', desc: 'Vow of Enmity: gain advantage against one foe for 1 minute (1/floor).' },
    },
  },
  {
    id: 'ranger', name: 'Ranger', hitDie: 10, spellAbility: 'WIS', halfCaster: true,
    saves: ['STR', 'DEX'],
    armor: ['light', 'medium', 'shields'], weapons: ['simple', 'martial'], skills: 3,
    skillChoices: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'],
    desc: 'A warrior of the wilds who combines martial prowess with nature magic.',
    features: {
      1: ['Favored Enemy', 'Natural Explorer'],
      2: ['Fighting Style', 'Spellcasting'],
      3: ['Ranger Archetype'],
      5: ['Extra Attack'],
    },
    subclasses: {
      hunter: { name: 'Hunter', desc: "Hunter's Prey: +2 damage against wounded or isolated foes." },
      gloom: { name: 'Gloom Stalker', desc: 'Dread Ambusher: +1d8 damage and +1 attack on your first turn of combat.' },
    },
  },
  {
    id: 'rogue', name: 'Rogue', hitDie: 8, spellAbility: null,
    saves: ['DEX', 'INT'],
    armor: ['light'], weapons: ['simple', 'shortsword'], skills: 4,
    skillChoices: [], // any
    extraAsi: [10], // rogues gain an extra ASI at class level 10
    desc: 'A scoundrel who uses stealth and trickery to overcome obstacles and enemies.',
    features: {
      1: ['Sneak Attack (1d6)', 'Expertise'],
      2: ['Cunning Action'],
      3: ['Roguish Archetype'],
      5: ['Uncanny Dodge', 'Sneak Attack (3d6)'],
      7: ['Evasion'],
      11: ['Reliable Talent', 'Sneak Attack (6d6)'],
    },
    subclasses: {
      thief: { name: 'Thief', desc: 'Fast Hands: you gain a second bonus action each turn (2 bonus points); use items as a bonus action.' },
      assassin: { name: 'Assassin', desc: 'Assassinate: advantage on foes that have not acted; auto-crit surprised foes.' },
    },
  },
  {
    id: 'sorcerer', name: 'Sorcerer', hitDie: 6, spellAbility: 'CHA', fullCaster: true,
    saves: ['CON', 'CHA'],
    armor: [], weapons: ['simple'], skills: 2,
    skillChoices: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'],
    desc: 'A spellcaster who draws on inherent magic from a gift or bloodline.',
    features: {
      1: ['Sorcerous Origin'],
      2: ['Font of Magic', 'Metamagic (2 options)'],
      3: ['Metamagic'],
      6: ['Origin Feature'],
    },
    subclasses: {
      draconic: { name: 'Draconic Bloodline', desc: 'Draconic Resilience: +1 HP per level, natural armor, resistance matching your ancestry.' },
      wild: { name: 'Wild Magic', desc: 'Tides of Chaos: gain advantage on a roll (1/floor) at the risk of a wild surge.' },
    },
  },
  {
    id: 'warlock', name: 'Warlock', hitDie: 8, spellAbility: 'CHA', warlock: true,
    saves: ['WIS', 'CHA'],
    armor: ['light'], weapons: ['simple'], skills: 2,
    skillChoices: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'],
    desc: 'A wielder of magic that is derived from a bargain with an extraplanar entity.',
    features: {
      1: ['Otherworldly Patron', 'Pact Magic'],
      2: ['Eldritch Invocations'],
      3: ['Pact Boon'],
      11: ['Mystic Arcanum (6th level)'],
    },
    subclasses: {
      fiend: { name: 'The Fiend', desc: "Dark One's Blessing: gain temporary HP when you reduce a creature to 0 HP." },
      old_one: { name: 'The Great Old One', desc: 'Awakened Mind: telepathic insight grants +1 to spell attack and save DC.' },
    },
  },
  {
    id: 'wizard', name: 'Wizard', hitDie: 6, spellAbility: 'INT', fullCaster: true,
    saves: ['INT', 'WIS'],
    armor: [], weapons: ['simple'], skills: 2,
    skillChoices: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion'],
    desc: 'A scholarly magic-user capable of manipulating the structures of reality.',
    features: {
      1: ['Arcane Recovery', 'Spellbook'],
      2: ['Arcane Tradition'],
      3: ['Arcane Tradition Feature'],
      6: ['Arcane Tradition Feature'],
    },
    subclasses: {
      evocation: { name: 'School of Evocation', desc: 'Sculpt Spells: your allies automatically succeed on your evocation saves.' },
      abjuration: { name: 'School of Abjuration', desc: 'Arcane Ward: a magical ward absorbs damage equal to 2× level + INT.' },
    },
  },
];

export const CLASS_MAP = Object.fromEntries(CLASSES.map(c => [c.id, c]));

// Returns the number of attacks per Attack action at this class level
export function attacksPerAction(classId, level) {
  if (classId === 'fighter') return level >= 11 ? 3 : level >= 5 ? 2 : 1;
  if (['barbarian', 'monk', 'paladin', 'ranger'].includes(classId)) return level >= 5 ? 2 : 1;
  return 1;
}

export function spellSlotsAt(classId, level) {
  const cls = CLASS_MAP[classId];
  if (cls.fullCaster) return FULL_CASTER_SLOTS[level].slice();
  if (cls.halfCaster) return HALF_CASTER_SLOTS[level].slice();
  return [0, 0, 0, 0, 0];
}

export function pactSlotsAt(level) {
  return WARLOCK_SLOTS[level] ? WARLOCK_SLOTS[level].slice() : [0, 0, 0, 0, 0];
}
