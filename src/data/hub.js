// Walkable scene maps for the Hub, Campfire and Town.
// Legend: '#' wall · '.' floor · T tree · B bush · t table · F hearth · S statue
//         f fountain · H house · c crate · r rock · b barrel

export const HUB_MAP = {
  id: 'hub', name: 'The Crossroads', w: 16, h: 10,
  ground: ['#8a7a68', '#847463', '#7d6d5c'],
  wall: '#4a3a2c',
  spawn: { x: 8, y: 8 },
  rows: [
    '################',
    '#..............#',
    '#...b....S.....#',
    '#......t.......#',
    '#.f............#',
    '#......H.......#',
    '#.T.........r..#',
    '#............T.#',
    '#......f.......#',
    '################',
  ],
  npcs: [
    {
      key: 'dante', kind: 'dante', name: 'Dante Alighieri', emoji: '🧙', x: 12, y: 4,
      lines: [
        'Midway upon the journey of our life, I found myself within a forest dark… shall we descend?',
        'Through me you pass into the city of woe. The gate is ready when you are.',
      ],
    },
    {
      key: 'beatrice', kind: 'beatrice', name: 'Beatrice', emoji: '🛒', x: 3, y: 2,
      lines: [
        'The love that moves the sun and the other stars also moves a fair price.',
        'What is bought with soul shards, death itself cannot take.',
      ],
    },
    {
      key: 'virgil', kind: 'virgil', name: 'Virgil', emoji: '📜', x: 12, y: 1,
      lines: [
        'I shall be thy guide. Your deeds — glorious and grim — are all recorded here.',
        'Check your records, or ready your starting equipment before you descend.',
      ],
    },
  ],
};

export const CAMP_MAP = {
  id: 'camp', name: 'The Campfire', w: 14, h: 9,
  ground: ['#4a6a3c', '#52743f', '#44632f'],
  wall: '#2c4426',
  spawn: { x: 7, y: 7 },
  rows: [
    '##############',
    '#............#',
    '#...T....T...#',
    '#.....FF.....#',
    '#...T..T..T..#',
    '#.....T......#',
    '#............#',
    '#.......T....#',
    '##############',
  ],
  exit: { x: 12, y: 4 },
  memberSpots: [[5, 4], [6, 6], [8, 6], [4, 6], [9, 2], [2, 6]],
};

export const TOWN_MAP = {
  id: 'town', name: 'Town', w: 18, h: 12,
  ground: ['#8a8a82', '#7d7d76', '#948e84'],
  wall: '#5a5248',
  spawn: { x: 2, y: 10 },
  rows: [
    '##################',
    '#................#',
    '#..H......H......#',
    '#..H......H..f...#',
    '#...............H#',
    '#....t...........#',
    '#................#',
    '#..f.........S...#',
    '#................#',
    '#.......b........#',
    '#................#',
    '##################',
  ],
  exit: { x: 15, y: 6 },
  shopSpot: { x: 5, y: 2 },
  mercSpots: [[8, 1], [9, 1], [8, 3]],
  eventSpots: [[13, 3], [13, 8]],
  memberSpots: [[3, 6], [5, 8], [7, 9], [4, 9], [10, 8], [11, 3]],
};
