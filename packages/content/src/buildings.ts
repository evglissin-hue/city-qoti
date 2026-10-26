import type { BuildingDef } from './types';

// Buildings. Sandbox valleys ignore costs, jobs and production; standard valleys [I1] use them.
// Numbers follow docs/spec/13-ledger.md (I1 buildings) and are marked (tune) there.
// Coin costs and upkeep are in coins; the sim keeps money in pennies.

export const bakery: BuildingDef = {
  id: 'bakery',
  name: 'Bakery',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  cost: {
    coins: 50,
    goods: [
      ['planks', 20],
      ['stone', 16],
    ],
  },
  upkeep: 2,
  jobs: { count: 2, role: 'worker' },
  methods: [
    {
      id: 'bake-bread',
      name: 'Bake bread',
      kind: 'craft',
      inputs: [['flour', 2]],
      outputs: [['bread', 5]],
      hours: 2,
      workers: 2,
    },
  ],
  work: 12,
  charm: [{ category: 'comfort', value: 2, radius: 2 }],
  tags: ['bakery', 'workshop'],
  art: { kit: 'bakery' },
};

export const buildersYard: BuildingDef = {
  id: 'builders-yard',
  name: "Builder's yard",
  lane: 'ledger',
  category: 'service',
  size: [3, 3],
  entrance: [1, 2],
  cost: {
    coins: 30,
    goods: [
      ['logs', 20],
      ['stone', 10],
    ],
  },
  upkeep: 2,
  jobs: { count: 3, role: 'builder' },
  work: 12,
  charm: [{ category: 'noise', value: -4, radius: 3 }],
  tags: ['builders', 'workshop'],
  art: { kit: 'builders-yard' },
};

export const cottage: BuildingDef = {
  id: 'cottage',
  name: 'Cottage',
  lane: 'hearth',
  category: 'home',
  size: [2, 2],
  entrance: [1, 1],
  cost: {
    coins: 20,
    goods: [
      ['planks', 20],
      ['stone', 8],
    ],
  },
  upkeep: 1,
  housing: { households: 1, residents: 4 },
  work: 8,
  tags: ['home'],
  art: { kit: 'cottage' },
};

export const farmhouse: BuildingDef = {
  id: 'farmhouse',
  name: 'Farmhouse',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  cost: {
    coins: 30,
    goods: [
      ['planks', 16],
      ['stone', 6],
    ],
  },
  upkeep: 1,
  jobs: { count: 3, role: 'worker' },
  methods: [
    {
      id: 'tend-wheat',
      name: 'Tend wheat fields',
      kind: 'farm',
      inputs: [],
      outputs: [['wheat', 1]],
      hours: 24,
      workers: 3,
      range: 6,
    },
  ],
  outputBuffer: 30,
  work: 12,
  tags: ['farm'],
  art: { kit: 'farmhouse' },
};

export const fishersHut: BuildingDef = {
  id: 'fishers-hut',
  name: "Fisher's hut",
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  placement: [{ kind: 'waterEdge' }],
  cost: { coins: 20, goods: [['planks', 14]] },
  upkeep: 1,
  jobs: { count: 2, role: 'worker' },
  methods: [
    {
      id: 'fish',
      name: 'Fish the river',
      kind: 'gather',
      inputs: [],
      outputs: [['fish', 2]],
      hours: 2,
      workers: 2,
      perWorker: true,
    },
  ],
  work: 12,
  charm: [{ category: 'noise', value: -6, radius: 3 }],
  tags: ['smelly', 'workshop'],
  art: { kit: 'fishers-hut' },
};

export const forestersLodge: BuildingDef = {
  id: 'foresters-lodge',
  name: "Forester's lodge",
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  cost: {
    coins: 20,
    goods: [
      ['logs', 12],
      ['stone', 6],
    ],
  },
  upkeep: 1,
  jobs: { count: 1, role: 'worker' },
  methods: [
    {
      id: 'plant-saplings',
      name: 'Plant saplings',
      kind: 'plant',
      inputs: [],
      outputs: [],
      hours: 2,
      workers: 1,
      perWorker: true,
      range: 8,
    },
  ],
  work: 12,
  tags: ['forestry'],
  art: { kit: 'foresters-lodge' },
};

/** Sandbox only: standard valleys house everyone in cottages until homes upgrade [I2]. */
export const house: BuildingDef = {
  id: 'house',
  name: 'House',
  lane: 'hearth',
  category: 'home',
  size: [2, 3],
  entrance: [1, 2],
  housing: { households: 1, residents: 5 },
  tags: ['home'],
  modes: ['sandbox'],
  art: { kit: 'house' },
};

export const marketStall: BuildingDef = {
  id: 'market-stall',
  name: 'Market stall',
  lane: 'ledger',
  category: 'service',
  size: [1, 2],
  entrance: [0, 1],
  cost: { coins: 10, goods: [['planks', 8]] },
  upkeep: 1,
  jobs: { count: 1, role: 'vendor' },
  storage: 40,
  coverage: [{ kind: 'food', radius: 14 }],
  work: 6,
  charm: [{ category: 'comfort', value: 2, radius: 2 }],
  tags: ['outlet', 'market'],
  art: { kit: 'market-stall' },
};

export const quarry: BuildingDef = {
  id: 'quarry',
  name: 'Quarry',
  lane: 'ledger',
  category: 'production',
  size: [3, 3],
  entrance: [1, 2],
  placement: [{ kind: 'deposit', deposit: 'stone', minTiles: 4 }],
  cost: { coins: 40, goods: [['planks', 20]] },
  upkeep: 2,
  jobs: { count: 3, role: 'worker' },
  methods: [
    {
      id: 'cut-stone',
      name: 'Cut stone',
      kind: 'gather',
      inputs: [],
      outputs: [['stone', 2]],
      hours: 2,
      workers: 3,
      perWorker: true,
    },
  ],
  work: 12,
  charm: [{ category: 'noise', value: -10, radius: 4 }],
  tags: ['workshop'],
  art: { kit: 'quarry' },
};

export const sawpit: BuildingDef = {
  id: 'sawpit',
  name: 'Sawpit',
  lane: 'ledger',
  category: 'production',
  size: [2, 3],
  entrance: [1, 2],
  cost: {
    coins: 30,
    goods: [
      ['logs', 16],
      ['stone', 6],
    ],
  },
  upkeep: 1,
  jobs: { count: 2, role: 'worker' },
  methods: [
    {
      id: 'saw-planks',
      name: 'Saw planks',
      kind: 'craft',
      inputs: [['logs', 2]],
      outputs: [['planks', 3]],
      hours: 2,
      workers: 2,
    },
  ],
  work: 12,
  charm: [{ category: 'noise', value: -8, radius: 3 }],
  tags: ['workshop'],
  art: { kit: 'sawpit' },
};

/** Sandbox only. */
export const shed: BuildingDef = {
  id: 'shed',
  name: 'Shed',
  lane: 'ledger',
  category: 'storage',
  size: [1, 2],
  entrance: [0, 1],
  modes: ['sandbox'],
  art: { kit: 'shed' },
};

export const storehouse: BuildingDef = {
  id: 'storehouse',
  name: 'Storehouse',
  lane: 'ledger',
  category: 'storage',
  size: [3, 3],
  entrance: [1, 2],
  cost: {
    coins: 40,
    goods: [
      ['planks', 30],
      ['stone', 10],
    ],
  },
  upkeep: 2,
  jobs: { count: 4, role: 'porter' },
  storage: 400,
  coverage: [{ kind: 'logistics', radius: 20 }],
  work: 16,
  charm: [{ category: 'noise', value: -3, radius: 2 }],
  tags: ['storehouse', 'outlet'],
  art: { kit: 'storehouse' },
};

/** Standard valleys start with one; only sandbox valleys offer it in the toolbar. */
export const townHall: BuildingDef = {
  id: 'town-hall',
  name: 'Town hall',
  lane: 'shared',
  category: 'civic',
  size: [4, 4],
  entrance: [2, 3],
  jobs: { count: 2, role: 'builder' },
  storage: 0,
  charm: [{ category: 'comfort', value: 8, radius: 4 }],
  tags: ['civic', 'builders'],
  modes: ['sandbox'],
  art: { kit: 'town-hall' },
};

export const vegetablePlot: BuildingDef = {
  id: 'vegetable-plot',
  name: 'Vegetable plot',
  lane: 'shared',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  placement: [{ kind: 'fertility', min: 30 }],
  cost: { coins: 5, goods: [['planks', 4]] },
  upkeep: 0,
  jobs: { count: 1, role: 'worker' },
  methods: [
    {
      id: 'grow-vegetables',
      name: 'Grow vegetables',
      kind: 'gather',
      inputs: [],
      outputs: [['vegetables', 3]],
      hours: 4,
      workers: 1,
    },
  ],
  work: 4,
  charm: [{ category: 'nature', value: 2, radius: 1 }],
  tags: ['plot', 'garden'],
  art: { kit: 'vegetable-plot' },
};

export const well: BuildingDef = {
  id: 'well',
  name: 'Well',
  lane: 'shared',
  category: 'service',
  size: [1, 1],
  entrance: [0, 0],
  cost: { coins: 10, goods: [['stone', 6]] },
  upkeep: 0,
  coverage: [{ kind: 'water', radius: 8, capacity: 30 }],
  work: 4,
  charm: [{ category: 'comfort', value: 6, radius: 3 }],
  tags: ['well', 'water-feature'],
  art: { kit: 'well' },
};

export const windmill: BuildingDef = {
  id: 'windmill',
  name: 'Windmill',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  cost: {
    coins: 50,
    goods: [
      ['planks', 24],
      ['stone', 12],
    ],
  },
  upkeep: 2,
  jobs: { count: 1, role: 'worker' },
  methods: [
    {
      id: 'grind-flour',
      name: 'Grind flour',
      kind: 'craft',
      inputs: [['wheat', 3]],
      outputs: [['flour', 2]],
      hours: 1,
      workers: 1,
      heightBonus: { heightMin: 4, percent: 25 },
    },
  ],
  work: 20,
  charm: [{ category: 'view', value: 2, radius: 2 }],
  tags: ['mill', 'workshop'],
  art: { kit: 'windmill' },
};

export const woodcutter: BuildingDef = {
  id: 'woodcutter',
  name: "Woodcutter's hut",
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  cost: { coins: 20, goods: [['logs', 12]] },
  upkeep: 1,
  jobs: { count: 2, role: 'worker' },
  methods: [
    {
      id: 'fell-trees',
      name: 'Fell trees',
      kind: 'fell',
      inputs: [],
      outputs: [['logs', 4]],
      hours: 2,
      workers: 2,
      perWorker: true,
      range: 8,
    },
  ],
  work: 12,
  charm: [{ category: 'noise', value: -6, radius: 3 }],
  tags: ['workshop', 'forestry'],
  art: { kit: 'woodcutter' },
};
