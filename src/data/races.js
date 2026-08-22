// D&D 5e playable races (2014 PHB + SCAG lineages).
// Families appear in character creation; a lineage/subrace is chosen next
// when one exists. Engine lookups still key off the specific playable id.

const F = (name, text) => ({ name, text });

export const RACE_FAMILIES = [
  {
    id: 'human', name: 'Human',
    choiceLabel: 'heritage',
    speed: 30, size: 'Medium', darkvision: false,
    desc: 'Versatile and ambitious. Choose a standard human or the Variant Human.',
    features: [F('Human Versatility', 'Humans adapt faster than any other folk.')],
    lineageNote: '2 heritages',
  },
  {
    id: 'dwarf', name: 'Dwarf',
    choiceLabel: 'subrace',
    speed: 25, size: 'Medium', darkvision: true,
    desc: 'Stout and unyielding. Hill and mountain dwarves walk different paths.',
    features: [
      F('Darkvision', 'You see perfectly in dim light and darkness.'),
      F('Dwarven Resilience', 'Advantage on saves vs. poison; resistance to poison damage.'),
    ],
    lineageNote: '2 subraces',
  },
  {
    id: 'elf', name: 'Elf',
    choiceLabel: 'subrace',
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'Graceful and long-lived. High elves, wood elves and drow each claim a different birthright.',
    features: [
      F('Darkvision', 'You see perfectly in dim light and darkness.'),
      F('Keen Senses', 'Proficiency in Perception.'),
      F('Fey Ancestry', 'Advantage on saves vs. being charmed.'),
    ],
    lineageNote: '3 subraces',
  },
  {
    id: 'halfling', name: 'Halfling',
    choiceLabel: 'subrace',
    speed: 25, size: 'Small', darkvision: false,
    desc: 'Lucky and nimble. Lightfoot and stout halflings hide — or endure — in different ways.',
    features: [
      F('Lucky', 'When you roll a 1 on an attack, ability check or save, you may reroll the die once.'),
      F('Brave', 'Advantage on saves vs. being frightened.'),
    ],
    lineageNote: '2 subraces',
  },
  {
    id: 'dragonborn', name: 'Dragonborn',
    choiceLabel: 'draconic ancestry',
    speed: 30, size: 'Medium', darkvision: false,
    desc: 'Draconic warriors. Your ancestry decides the element of your breath and your hide.',
    features: [
      F('Breath Weapon', 'Once per floor, exhale a 3-tile cone of your ancestral element.'),
      F('Draconic Resistance', 'Resistance to the damage type of your draconic ancestry.'),
    ],
    lineageNote: '10 ancestries',
  },
  {
    id: 'gnome', name: 'Gnome',
    choiceLabel: 'subrace',
    speed: 25, size: 'Small', darkvision: true,
    desc: 'Clever tinkerers. Forest gnomes weave illusions; rock gnomes invent.',
    features: [
      F('Darkvision', 'You see perfectly in dim light and darkness.'),
      F('Gnome Cunning', 'Advantage on INT, WIS and CHA saves vs. magic.'),
    ],
    lineageNote: '2 subraces',
  },
  {
    id: 'halfelf', name: 'Half-Elf',
    choiceLabel: 'heritage',
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'Charming and adaptable. Standard half-elves, or a high, wood or drow heritage.',
    features: [
      F('Darkvision', 'You see perfectly in dim light and darkness.'),
      F('Fey Ancestry', 'Advantage on saves vs. being charmed.'),
      F('Skill Versatility', 'Proficiency in two skills of your choice (simplified: +1 to two skills).'),
    ],
    lineageNote: '4 heritages',
  },
  {
    id: 'half_orc', name: 'Half-Orc',
    choiceLabel: null,
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'Fierce survivors. +2 STR, +1 CON.',
    features: [
      F('Darkvision', 'You see perfectly in dim light and darkness.'),
      F('Relentless Endurance', 'Once per floor, when you would drop to 0 HP, drop to 1 HP instead.'),
      F('Savage Attacks', 'Critical hits deal one extra weapon die.'),
    ],
    lineageNote: null,
  },
  {
    id: 'tiefling', name: 'Tiefling',
    choiceLabel: 'infernal bloodline',
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'Infernal-blooded outcasts. The nine archdevils each leave a different mark.',
    features: [
      F('Darkvision', 'You see perfectly in dim light and darkness.'),
      F('Hellish Resistance', 'Resistance to fire damage.'),
    ],
    lineageNote: '9 bloodlines',
  },
];

export const RACE_FAMILY_MAP = Object.fromEntries(RACE_FAMILIES.map(f => [f.id, f]));

function playable(def) {
  return {
    hpMult: 1.0,
    darkvision: false,
    features: [],
    ...def,
  };
}

const ELF_CORE = [
  F('Darkvision', 'You see perfectly in dim light and darkness.'),
  F('Keen Senses', 'Proficiency in Perception.'),
  F('Fey Ancestry', 'Advantage on saves vs. being charmed.'),
];

const DWARF_CORE = [
  F('Darkvision', 'You see perfectly in dim light and darkness.'),
  F('Dwarven Resilience', 'Advantage on saves vs. poison; resistance to poison damage.'),
];

const HALFLING_CORE = [
  F('Lucky', 'When you roll a 1 on an attack, ability check or save, you may reroll the die once.'),
  F('Brave', 'Advantage on saves vs. being frightened.'),
];

const GNOME_CORE = [
  F('Darkvision', 'You see perfectly in dim light and darkness.'),
  F('Gnome Cunning', 'Advantage on INT, WIS and CHA saves vs. magic.'),
];

const HALFELF_CORE = [
  F('Darkvision', 'You see perfectly in dim light and darkness.'),
  F('Fey Ancestry', 'Advantage on saves vs. being charmed.'),
  F('Skill Versatility', 'Proficiency in two skills of your choice (simplified: +1 to two skills).'),
];

const TIEFLING_CORE = [
  F('Darkvision', 'You see perfectly in dim light and darkness.'),
  F('Hellish Resistance', 'Resistance to fire damage.'),
];

// PHB: acid & lightning ancestries breathe a 5×30 ft line; the rest a 15-ft cone.
const LINE_BREATH_TYPES = new Set(['acid', 'lightning']);

function dragonbornAncestry(id, name, type, colorWord) {
  const shape = LINE_BREATH_TYPES.has(type) ? 'line' : 'cone';
  const shapeText = shape === 'line' ? '6-tile line' : '3-tile cone';
  return playable({
    id, family: 'dragonborn', name,
    asi: { STR: 2, CHA: 1 },
    speed: 30, size: 'Medium', darkvision: false,
    dragonType: type,
    breathShape: shape,
    resist: [type],
    desc: `${colorWord} dragonborn. +2 STR, +1 CHA. Breath and resistance: ${type} (${shapeText}).`,
    features: [
      F('Breath Weapon', `Once per floor, exhale a ${shapeText} of ${type} (DEX save vs 8 + CON + prof for half).`),
      F('Draconic Resistance', `Resistance to ${type} damage.`),
    ],
  });
}

export function dragonBreathFor(char) {
  const race = (char && char.race) || (char && char.raceId && RACE_MAP[char.raceId]);
  const type = (char && char.dragonType) || (race && race.dragonType) || 'fire';
  const shape = (char && char.breathShape) || (race && race.breathShape) || (LINE_BREATH_TYPES.has(type) ? 'line' : 'cone');
  return { type, shape };
}

function tieflingBloodline(id, name, asi, extraFeature, opts = {}) {
  return playable({
    id, family: 'tiefling', name,
    asi,
    speed: 30, size: 'Medium', darkvision: true,
    resist: ['fire'],
    desc: opts.desc,
    bonusCantrips: opts.bonusCantrips || [],
    racialSpells: opts.racialSpells || [],
    features: [...TIEFLING_CORE, extraFeature],
  });
}

export const RACES = [
  // ---- Human ----
  playable({
    id: 'human', family: 'human', name: 'Human',
    asi: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 },
    speed: 30, size: 'Medium', darkvision: false,
    desc: 'Versatile and ambitious. +1 to every ability score.',
    features: [F('Human Versatility', '+1 to all ability scores.')],
  }),
  playable({
    id: 'human_variant', family: 'human', name: 'Variant Human',
    asi: {},
    variantHuman: true,
    speed: 30, size: 'Medium', darkvision: false,
    desc: '+1 to two abilities, one skill proficiency, and a feat at 1st level.',
    features: [
      F('Ability Increase', '+1 to two different ability scores of your choice.'),
      F('Skills', 'Proficiency in one skill of your choice.'),
      F('Feat', 'You gain one feat of your choice.'),
    ],
  }),

  // ---- Dwarf ----
  playable({
    id: 'dwarf', family: 'dwarf', name: 'Hill Dwarf',
    asi: { CON: 2, WIS: 1 },
    speed: 25, size: 'Medium', darkvision: true,
    resist: ['poison'],
    hpPerLevel: 1,
    desc: 'Stout and wise. +2 CON, +1 WIS. +1 HP per level.',
    features: [
      ...DWARF_CORE,
      F('Dwarven Toughness', '+1 hit point per level.'),
    ],
  }),
  playable({
    id: 'mountain_dwarf', family: 'dwarf', name: 'Mountain Dwarf',
    asi: { CON: 2, STR: 2 },
    speed: 25, size: 'Medium', darkvision: true,
    resist: ['poison'],
    armorProf: ['light', 'medium'],
    desc: 'Broad and battle-ready. +2 CON, +2 STR. Light and medium armor training.',
    features: [
      ...DWARF_CORE,
      F('Dwarven Armor Training', 'You have proficiency with light and medium armor.'),
    ],
  }),

  // ---- Elf ----
  playable({
    id: 'elf', family: 'elf', name: 'High Elf',
    asi: { DEX: 2, INT: 1 },
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'Graceful and keen-eyed. +2 DEX, +1 INT. A wizard cantrip.',
    bonusSkills: ['Perception'],
    bonusCantrips: ['fire_bolt'],
    features: [
      ...ELF_CORE,
      F('Cantrip', 'You know one wizard cantrip (Fire Bolt). Intelligence is your spellcasting ability for it.'),
    ],
  }),
  playable({
    id: 'wood_elf', family: 'elf', name: 'Wood Elf',
    asi: { DEX: 2, WIS: 1 },
    speed: 35, size: 'Medium', darkvision: true,
    maskOfTheWild: true,
    desc: 'Wild and fleet-footed. +2 DEX, +1 WIS. Speed 35. Mask of the Wild.',
    bonusSkills: ['Perception'],
    features: [
      F('Mask of the Wild', 'You can attempt to hide even when you are only lightly obscured by foliage, mist, or other natural phenomena.'),
      F('Fleet of Foot', 'Your base walking speed is 35 feet.'),
      ...ELF_CORE,
    ],
  }),
  playable({
    id: 'drow', family: 'elf', name: 'Dark Elf (Drow)',
    asi: { DEX: 2, CHA: 1 },
    speed: 30, size: 'Medium', darkvision: true,
    superiorDarkvision: true,
    desc: 'Underdark-born. +2 DEX, +1 CHA. Superior darkvision and drow magic.',
    bonusSkills: ['Perception'],
    racialSpells: ['faerie_fire', 'darkness'],
    features: [
      F('Superior Darkvision', 'Your darkvision has a range of 120 feet.'),
      F('Sunlight Sensitivity', 'In bright light you have disadvantage on attack rolls and Perception checks that rely on sight (simplified in Avernus).'),
      F('Drow Magic', 'You can cast Faerie Fire and Darkness once per floor each (no slot).'),
      ...ELF_CORE,
    ],
  }),

  // ---- Halfling ----
  playable({
    id: 'halfling', family: 'halfling', name: 'Lightfoot Halfling',
    asi: { DEX: 2, CHA: 1 },
    speed: 25, size: 'Small', darkvision: false,
    naturallyStealthy: true,
    desc: 'Lucky and nimble. +2 DEX, +1 CHA. Naturally Stealthy.',
    features: [
      ...HALFLING_CORE,
      F('Naturally Stealthy', 'You can attempt to hide even when you are obscured only by a creature that is at least one size larger than you.'),
    ],
  }),
  playable({
    id: 'stout_halfling', family: 'halfling', name: 'Stout Halfling',
    asi: { DEX: 2, CON: 1 },
    speed: 25, size: 'Small', darkvision: false,
    resist: ['poison'],
    desc: 'Hardy as a hill dwarf. +2 DEX, +1 CON. Stout Resilience.',
    features: [
      ...HALFLING_CORE,
      F('Stout Resilience', 'Advantage on saves vs. poison; resistance to poison damage.'),
    ],
  }),

  // ---- Dragonborn ancestries (PHB) ----
  dragonbornAncestry('dragonborn', 'Red Dragonborn', 'fire', 'Red'),
  dragonbornAncestry('dragonborn_black', 'Black Dragonborn', 'acid', 'Black'),
  dragonbornAncestry('dragonborn_blue', 'Blue Dragonborn', 'lightning', 'Blue'),
  dragonbornAncestry('dragonborn_brass', 'Brass Dragonborn', 'fire', 'Brass'),
  dragonbornAncestry('dragonborn_bronze', 'Bronze Dragonborn', 'lightning', 'Bronze'),
  dragonbornAncestry('dragonborn_copper', 'Copper Dragonborn', 'acid', 'Copper'),
  dragonbornAncestry('dragonborn_gold', 'Gold Dragonborn', 'fire', 'Gold'),
  dragonbornAncestry('dragonborn_green', 'Green Dragonborn', 'poison', 'Green'),
  dragonbornAncestry('dragonborn_silver', 'Silver Dragonborn', 'cold', 'Silver'),
  dragonbornAncestry('dragonborn_white', 'White Dragonborn', 'cold', 'White'),

  // ---- Gnome ----
  playable({
    id: 'gnome', family: 'gnome', name: 'Rock Gnome',
    asi: { INT: 2, CON: 1 },
    speed: 25, size: 'Small', darkvision: true,
    desc: 'Clever tinkerers. +2 INT, +1 CON. Artificer\'s Lore.',
    features: [
      ...GNOME_CORE,
      F('Artificer\'s Lore', 'History checks about magic items, alchemical objects or technological devices add twice your proficiency (simplified: you are trained).'),
      F('Tinker', 'You can cobble together tiny clockwork devices given time and tools (flavor).'),
    ],
  }),
  playable({
    id: 'forest_gnome', family: 'gnome', name: 'Forest Gnome',
    asi: { INT: 2, DEX: 1 },
    speed: 25, size: 'Small', darkvision: true,
    desc: 'Quiet woodland folk. +2 INT, +1 DEX. Natural Illusionist.',
    features: [
      ...GNOME_CORE,
      F('Natural Illusionist', 'You know the Minor Illusion cantrip (flavor — a trick of light and sound).'),
      F('Speak with Small Beasts', 'Through sounds and gestures you can communicate simple ideas with Small or smaller beasts.'),
    ],
  }),

  // ---- Half-Elf ----
  playable({
    id: 'halfelf', family: 'halfelf', name: 'Half-Elf',
    asi: { CHA: 2, DEX: 1, CON: 1 },
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'Charming and adaptable. +2 CHA, +1 DEX, +1 CON.',
    features: HALFELF_CORE,
  }),
  playable({
    id: 'halfelf_high', family: 'halfelf', name: 'High Half-Elf',
    asi: { CHA: 2, DEX: 1, INT: 1 },
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'High-elven blood. +2 CHA, +1 DEX, +1 INT. A wizard cantrip.',
    bonusCantrips: ['fire_bolt'],
    features: [
      ...HALFELF_CORE,
      F('Cantrip', 'You know one wizard cantrip (Fire Bolt).'),
    ],
  }),
  playable({
    id: 'halfelf_wood', family: 'halfelf', name: 'Wood Half-Elf',
    asi: { CHA: 2, DEX: 1, WIS: 1 },
    speed: 35, size: 'Medium', darkvision: true,
    maskOfTheWild: true,
    desc: 'Wood-elven blood. +2 CHA, +1 DEX, +1 WIS. Fleet of Foot and Mask of the Wild.',
    features: [
      ...HALFELF_CORE,
      F('Fleet of Foot', 'Your base walking speed is 35 feet.'),
      F('Mask of the Wild', 'You can attempt to hide even when you are only lightly obscured by foliage, mist, or other natural phenomena.'),
    ],
  }),
  playable({
    id: 'halfelf_drow', family: 'halfelf', name: 'Drow Half-Elf',
    asi: { CHA: 2, DEX: 1, CON: 1 },
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'Drow blood. +2 CHA, +1 DEX, +1 CON. Drow Magic.',
    racialSpells: ['faerie_fire', 'darkness'],
    features: [
      ...HALFELF_CORE,
      F('Drow Magic', 'You can cast Faerie Fire and Darkness once per floor each (no slot).'),
    ],
  }),

  // ---- Half-Orc (no subrace) ----
  playable({
    id: 'half_orc', family: 'half_orc', name: 'Half-Orc',
    asi: { STR: 2, CON: 1 },
    speed: 30, size: 'Medium', darkvision: true,
    desc: 'Fierce survivors. +2 STR, +1 CON.',
    features: [
      F('Darkvision', 'You see perfectly in dim light and darkness.'),
      F('Relentless Endurance', 'Once per floor, when you would drop to 0 HP, drop to 1 HP instead.'),
      F('Savage Attacks', 'Critical hits deal one extra weapon die.'),
    ],
  }),

  // ---- Tiefling bloodlines (PHB Asmodeus + SCAG) ----
  tieflingBloodline('tiefling', 'Asmodeus Tiefling', { CHA: 2, INT: 1 },
    F('Infernal Legacy', 'You can cast Hellish Rebuke and Darkness once per floor each (no slot).'),
    { desc: 'Blood of Asmodeus. +2 CHA, +1 INT. Infernal Legacy.', racialSpells: ['hellish_rebuke', 'darkness'] }),
  tieflingBloodline('tiefling_baalzebul', 'Baalzebul Tiefling', { CHA: 2, INT: 1 },
    F('Legacy of Maladomini', 'A silver tongue wrapped around a rotting core. Infernal magic of sickness and deceit.'),
    { desc: 'Blood of Baalzebul. +2 CHA, +1 INT.', racialSpells: ['hex'] }),
  tieflingBloodline('tiefling_dispater', 'Dispater Tiefling', { CHA: 2, DEX: 1 },
    F('Legacy of Dis', 'Paranoid iron. You lean on disguise and second thoughts.'),
    { desc: 'Blood of Dispater. +2 CHA, +1 DEX.', racialSpells: ['invisibility'] }),
  tieflingBloodline('tiefling_fierna', 'Fierna Tiefling', { CHA: 2, WIS: 1 },
    F('Legacy of Phlegethos', 'Charm drips from every word.'),
    { desc: 'Blood of Fierna. +2 CHA, +1 WIS.', racialSpells: ['bless'] }),
  tieflingBloodline('tiefling_glasya', 'Glasya Tiefling', { CHA: 2, DEX: 1 },
    F('Legacy of Malbolge', 'Illusion and stealth — the daughter of Asmodeus taught you well.'),
    { desc: 'Blood of Glasya. +2 CHA, +1 DEX.', racialSpells: ['invisibility'] }),
  tieflingBloodline('tiefling_levistus', 'Levistus Tiefling', { CHA: 2, CON: 1 },
    F('Legacy of Stygia', 'Ice in the veins. Armor of Agathys and a killing frost.'),
    { desc: 'Blood of Levistus. +2 CHA, +1 CON.', bonusCantrips: ['ray_of_frost'], racialSpells: ['armor_of_agathys'] }),
  tieflingBloodline('tiefling_mammon', 'Mammon Tiefling', { CHA: 2, INT: 1 },
    F('Legacy of Minauros', 'Greed given form. Coin and contract are your native tongue.'),
    { desc: 'Blood of Mammon. +2 CHA, +1 INT.', racialSpells: ['hex'] }),
  tieflingBloodline('tiefling_mephistopheles', 'Mephistopheles Tiefling', { CHA: 2, INT: 1 },
    F('Legacy of Cania', 'Hellfire scholarship. Burning Hands is in your blood.'),
    { desc: 'Blood of Mephistopheles. +2 CHA, +1 INT.', racialSpells: ['burning_hands'] }),
  tieflingBloodline('tiefling_zariel', 'Zariel Tiefling', { CHA: 2, STR: 1 },
    F('Legacy of Avernus', 'War-born. Searing Smite and Branding Smite once per floor each.'),
    { desc: 'Blood of Zariel. +2 CHA, +1 STR. Avernus itself is in your blood.', racialSpells: ['searing_smite', 'branding_smite'] }),
];

export const RACE_MAP = Object.fromEntries(RACES.map(r => [r.id, r]));

export function racesForFamily(familyId) {
  return RACES.filter(r => r.family === familyId);
}

export function raceFamilyOf(who) {
  if (!who) return null;
  const char = who.char || who;
  if (char.race && char.race.family) return char.race.family;
  const id = char.raceId || char.id;
  if (id && RACE_MAP[id] && RACE_MAP[id].family) return RACE_MAP[id].family;
  if (id === 'wood_elf') return 'elf';
  if (RACE_FAMILY_MAP[id]) return id;
  return id || null;
}

export function isRaceFamily(who, family) {
  return raceFamilyOf(who) === family;
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
