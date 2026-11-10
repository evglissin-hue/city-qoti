import type { BuildingDef } from './types';

// I3 building stubs (C5.0): ids, names, footprints and lanes so every I3 track agrees on them.
// Owners: the new trades and the River Dock C5B, the apiary C5C, the bath house C5A, defenses and
// the Watch House C5D. C5X: every stub now has its owner's numbers, so none is hidden from the
// build picker any more. Stand-in kits until C5E draws them.

/**
 * C5C: a row of hives and a keeper. Honey comes in as fast as the flowers around it allow: the
 * pollinator score of its chunk sets the yield (a quarter with none, the full rate at 200), and
 * honeybees are only ever sighted near one.
 */
export const apiary: BuildingDef = {
  id: 'apiary',
  name: 'Apiary',
  lane: 'hearth',
  category: 'production',
  size: [2, 2],
  entrance: [0, 1],
  cost: { coins: 20, goods: [['timber', 8]] },
  upkeep: 1,
  jobs: { count: 1, role: 'worker' },
  methods: [
    {
      id: 'keep-bees',
      name: 'Keep bees',
      kind: 'gather',
      inputs: [],
      outputs: [['honey', 2]],
      hours: 6,
      workers: 1,
    },
  ],
  work: 6,
  charm: [{ category: 'nature', value: 3, radius: 2 }],
  art: { kit: 'shed', params: { kit: 'apiary' } },
  tags: ['hive', 'farm'],
  requires: { rank: 'village' },
};

/**
 * C5A: hot water and a warm bench all year (health cover like a herbalist's), and in winter the
 * households in reach feel the cold far less (systems/warmth). It heats its water with firewood and
 * pays its way from a small daily fee from each household it serves (half a coin), which covers its
 * bath-keeper's wage, the firewood and the upkeep at base prices with about twenty households.
 */
export const bathHouse: BuildingDef = {
  id: 'bath-house',
  name: 'Bath House',
  lane: 'shared',
  category: 'service',
  size: [3, 2],
  entrance: [1, 1],
  cost: {
    coins: 45,
    goods: [
      ['timber', 18],
      ['stone', 12],
    ],
  },
  upkeep: 2,
  jobs: { count: 1, role: 'worker' },
  coverage: [{ kind: 'health', radius: 12, capacity: 80 }],
  methods: [
    {
      id: 'heat-baths',
      name: 'Heat the baths',
      kind: 'craft',
      inputs: [['firewood', 1]],
      outputs: [],
      hours: 4,
      workers: 1,
    },
  ],
  work: 12,
  charm: [{ category: 'comfort', value: 3, radius: 3 }],
  art: { kit: 'house', params: { kit: 'bath-house' } },
  tags: ['bath-house', 'warm'],
  requires: { rank: 'village' },
};

export const bellTower: BuildingDef = {
  id: 'bell-tower',
  name: 'Bell Tower',
  lane: 'shared',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  cost: {
    coins: 15,
    goods: [
      ['timber', 6],
      ['stone', 4],
    ],
  },
  work: 6,
  art: { kit: 'shed', params: { kit: 'bell-tower' } },
  tags: ['bell'],
  requires: { rank: 'village' },
  defense: {},
};

export const gate: BuildingDef = {
  id: 'gate',
  name: 'Gate',
  lane: 'shared',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  cost: {
    coins: 4,
    goods: [
      ['timber', 3],
      ['timber', 2],
    ],
  },
  work: 3,
  art: { kit: 'shed', params: { kit: 'gate' } },
  tags: ['gate', 'wall'],
  requires: { rank: 'village' },
  defense: { hp: 100, passable: 'gate' },
};

export const netTrap: BuildingDef = {
  id: 'net-trap',
  name: 'Net Trap',
  lane: 'ledger',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  cost: { coins: 4, goods: [['timber', 1]] },
  work: 1,
  art: { kit: 'shed', params: { kit: 'net-trap' } },
  tags: ['trap'],
  requires: { rank: 'village' },
  defense: { trap: 'net' },
};

export const palisade: BuildingDef = {
  id: 'palisade',
  name: 'Palisade',
  lane: 'ledger',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  cost: { coins: 1, goods: [['timber', 3]] },
  work: 2,
  art: { kit: 'shed', params: { kit: 'palisade' } },
  tags: ['wall'],
  requires: { rank: 'village' },
  defense: { hp: 100, blocks: true },
};

export const pitTrap: BuildingDef = {
  id: 'pit-trap',
  name: 'Pit Trap',
  lane: 'ledger',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  cost: { coins: 3 },
  work: 1,
  art: { kit: 'shed', params: { kit: 'pit-trap' } },
  tags: ['trap'],
  requires: { rank: 'village' },
  defense: { trap: 'pit' },
};

/**
 * C5B: boats to Millhaven downstream, on the dock's own standing orders: bigger, cheaper loads than
 * the caravans (systems/dock). No boats while the river is frozen. Village rank and renown 1.
 */
export const riverDock: BuildingDef = {
  id: 'river-dock',
  name: 'River Dock',
  lane: 'ledger',
  category: 'service',
  size: [2, 2],
  entrance: [0, 1],
  placement: [{ kind: 'river' }],
  cost: {
    coins: 60,
    goods: [
      ['timber', 24],
      ['stone', 8],
    ],
  },
  upkeep: 2,
  storage: 80,
  work: 14,
  charm: [{ category: 'noise', value: -2, radius: 2 }],
  art: { kit: 'fishers-hut', params: { kit: 'river-dock' } },
  tags: ['dock'],
  requires: { rank: 'village', renown: 1 },
  specialized: true,
};

export const stoneWall: BuildingDef = {
  id: 'stone-wall',
  name: 'Stone Wall',
  lane: 'ledger',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  cost: { coins: 2, goods: [['stone', 4]] },
  work: 4,
  art: { kit: 'shed', params: { kit: 'stone-wall' } },
  tags: ['wall'],
  // Town rank, or earlier once Barnaby Ashcombe's arc unlocks it (hearth.unlocked; wall.paint).
  requires: { rank: 'town' },
  defense: { hp: 400, blocks: true },
  moduleSlots: [['wall', 1]],
};

export const watchHouse: BuildingDef = {
  id: 'watch-house',
  name: 'Watch House',
  lane: 'ledger',
  category: 'defense',
  size: [2, 2],
  entrance: [0, 1],
  cost: {
    coins: 30,
    goods: [
      ['timber', 10],
      ['stone', 6],
    ],
  },
  upkeep: 1,
  work: 12,
  art: { kit: 'house', params: { kit: 'watch-house' } },
  tags: ['watch-house'],
  requires: { rank: 'village' },
  defense: {},
};

export const watchtower: BuildingDef = {
  id: 'watchtower',
  name: 'Watchtower',
  lane: 'ledger',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  cost: {
    coins: 12,
    goods: [
      ['timber', 6],
      ['timber', 4],
    ],
  },
  work: 8,
  art: { kit: 'shed', params: { kit: 'watchtower' } },
  tags: ['tower'],
  requires: { rank: 'village' },
  defense: { towerRange: 6, warningDays: 1 },
};
