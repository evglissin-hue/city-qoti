import type { BuildingDef } from './types';

// I3 building stubs (C5.0): ids, names, footprints and lanes so every I3 track agrees on them.
// `modes: []` keeps each out of the build picker until its owner writes the numbers and the art
// (then drop `modes`). Owners: the new trades and the River Dock C5B, the apiary C5C, the bath
// house C5A, defenses and the Watch House C5D. Stand-in kits until C5E draws them.

const HIDDEN = { modes: [] as BuildingDef['modes'] };

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
  cost: { coins: 20, goods: [['planks', 8]] },
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
      ['planks', 18],
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
  art: { kit: 'shed', params: { kit: 'bell-tower' } },
  tags: ['bell'],
  requires: { rank: 'village' },
  defense: {},
  ...HIDDEN,
};

/**
 * C5B: planks into furniture. Three planks (9 coins at base) make a piece worth 15 over four hours,
 * so a full day of one carpenter clears about 13 coins on a 3.50 wage. Millhaven buys it, and
 * commissions ask for it, until the Merchants want it at home in I4.
 */
export const carpenter: BuildingDef = {
  id: 'carpenter',
  name: 'Carpenter',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [0, 1],
  cost: {
    coins: 35,
    goods: [
      ['planks', 18],
      ['stone', 6],
    ],
  },
  upkeep: 1,
  jobs: { count: 2, role: 'worker' },
  methods: [
    {
      id: 'make-furniture',
      name: 'Make furniture',
      kind: 'craft',
      inputs: [['planks', 3]],
      outputs: [['furniture', 1]],
      hours: 2,
      workers: 2,
    },
  ],
  work: 12,
  charm: [{ category: 'noise', value: -3, radius: 2 }],
  art: { kit: 'workshop', params: { kit: 'carpenter' } },
  tags: ['workshop', 'timber'],
  requires: { rank: 'village' },
};

/**
 * C5B: candles. Rushlights first, from herbs (rushes and a dip of tallow, which the herb garden's
 * reed beds and the kitchens supply between them), so a Village without bees still has light; and
 * beeswax candles from honey once the apiary hums (C5C). Recipes per the ledger spec.
 */
export const chandler: BuildingDef = {
  id: 'chandler',
  name: 'Chandler',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [0, 1],
  cost: {
    coins: 30,
    goods: [
      ['planks', 14],
      ['stone', 6],
    ],
  },
  upkeep: 1,
  jobs: { count: 1, role: 'worker' },
  methods: [
    {
      id: 'dip-rushlights',
      name: 'Dip rushlights',
      kind: 'craft',
      inputs: [['herbs', 2]],
      outputs: [['candles', 2]],
      hours: 1,
      workers: 1,
    },
    {
      id: 'pour-beeswax',
      name: 'Pour beeswax candles',
      kind: 'craft',
      inputs: [['honey', 1]],
      outputs: [['candles', 3]],
      hours: 1,
      workers: 1,
    },
  ],
  work: 10,
  charm: [{ category: 'comfort', value: 2, radius: 2 }],
  art: { kit: 'workshop', params: { kit: 'chandler' } },
  tags: ['workshop', 'candles'],
  requires: { rank: 'village' },
};

export const gate: BuildingDef = {
  id: 'gate',
  name: 'Gate',
  lane: 'shared',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  art: { kit: 'shed', params: { kit: 'gate' } },
  tags: ['gate', 'wall'],
  requires: { rank: 'village' },
  defense: { passable: 'gate' },
  ...HIDDEN,
};

export const netTrap: BuildingDef = {
  id: 'net-trap',
  name: 'Net Trap',
  lane: 'ledger',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  art: { kit: 'shed', params: { kit: 'net-trap' } },
  tags: ['trap'],
  requires: { rank: 'village' },
  defense: { trap: 'net' },
  ...HIDDEN,
};

export const palisade: BuildingDef = {
  id: 'palisade',
  name: 'Palisade',
  lane: 'ledger',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  art: { kit: 'shed', params: { kit: 'palisade' } },
  tags: ['wall'],
  requires: { rank: 'village' },
  defense: { hp: 100, blocks: true },
  ...HIDDEN,
};

/**
 * C5B: pies, a festival's favorite treat. Apple pies from flour and apples; honey pies from flour and
 * honey once there is an apiary. Two bakers bake three pies from a flour and two apples (6 coins of
 * goods for 10.50 at base) every two hours.
 */
export const pieShop: BuildingDef = {
  id: 'pie-shop',
  name: 'Pie Shop',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [0, 1],
  cost: {
    coins: 35,
    goods: [
      ['planks', 14],
      ['stone', 10],
    ],
  },
  upkeep: 1,
  jobs: { count: 2, role: 'worker' },
  methods: [
    {
      id: 'bake-apple-pies',
      name: 'Bake apple pies',
      kind: 'craft',
      inputs: [
        ['flour', 1],
        ['apples', 2],
      ],
      outputs: [['pies', 3]],
      hours: 1,
      workers: 2,
    },
    {
      id: 'bake-honey-pies',
      name: 'Bake honey pies',
      kind: 'craft',
      inputs: [
        ['flour', 1],
        ['honey', 1],
      ],
      outputs: [['pies', 3]],
      hours: 1,
      workers: 2,
    },
  ],
  work: 12,
  charm: [{ category: 'comfort', value: 3, radius: 3 }],
  art: { kit: 'bakery', params: { kit: 'pie-shop' } },
  tags: ['workshop', 'bakery', 'pies'],
  requires: { rank: 'village' },
};

export const pitTrap: BuildingDef = {
  id: 'pit-trap',
  name: 'Pit Trap',
  lane: 'ledger',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  art: { kit: 'shed', params: { kit: 'pit-trap' } },
  tags: ['trap'],
  requires: { rank: 'village' },
  defense: { trap: 'pit' },
  ...HIDDEN,
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
  placement: [{ kind: 'waterEdge' }],
  cost: {
    coins: 60,
    goods: [
      ['planks', 24],
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
};

export const stoneWall: BuildingDef = {
  id: 'stone-wall',
  name: 'Stone Wall',
  lane: 'ledger',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  art: { kit: 'shed', params: { kit: 'stone-wall' } },
  tags: ['wall'],
  requires: { rank: 'town' },
  defense: { hp: 400, blocks: true },
  moduleSlots: [['wall', 1]],
  ...HIDDEN,
};

/** C5B: cloth into coats. A bolt of cloth (6 coins) makes a coat worth 12 in three hours. */
export const tailor: BuildingDef = {
  id: 'tailor',
  name: 'Tailor',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [0, 1],
  cost: {
    coins: 30,
    goods: [
      ['planks', 14],
      ['stone', 6],
    ],
  },
  upkeep: 1,
  jobs: { count: 1, role: 'worker' },
  methods: [
    {
      id: 'sew-coats',
      name: 'Sew coats',
      kind: 'craft',
      inputs: [['cloth', 1]],
      outputs: [['coats', 1]],
      hours: 3,
      workers: 1,
    },
  ],
  work: 12,
  charm: [{ category: 'comfort', value: 1, radius: 2 }],
  art: { kit: 'workshop', params: { kit: 'tailor' } },
  tags: ['workshop', 'textile'],
  requires: { rank: 'village' },
};

export const watchHouse: BuildingDef = {
  id: 'watch-house',
  name: 'Watch House',
  lane: 'ledger',
  category: 'defense',
  size: [2, 2],
  entrance: [0, 1],
  art: { kit: 'house', params: { kit: 'watch-house' } },
  tags: ['watch-house'],
  requires: { rank: 'village' },
  defense: {},
  ...HIDDEN,
};

export const watchtower: BuildingDef = {
  id: 'watchtower',
  name: 'Watchtower',
  lane: 'ledger',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  art: { kit: 'shed', params: { kit: 'watchtower' } },
  tags: ['tower'],
  requires: { rank: 'village' },
  defense: { towerRange: 6, warningDays: 1 },
  ...HIDDEN,
};
