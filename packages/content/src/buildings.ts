import type { BuildingDef } from './types';

// Buildings. Sandbox valleys ignore costs, jobs and production; standard valleys [I1] use them.
// Numbers follow docs/spec/13-ledger.md (I1 buildings) and are marked (tune) there.
// Coin costs and upkeep are in coins; the sim keeps money in pennies.

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
      ['timber', 20],
      ['stone', 10],
    ],
  },
  upkeep: 2,
  jobs: { count: 3, role: 'builder' },
  work: 12,
  charm: [{ category: 'noise', value: -4, radius: 3 }],
  tags: ['builders', 'workshop'],
  requires: { built: [['cottage', 4]] },
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
      ['timber', 16],
      ['stone', 6],
    ],
  },
  // Homes pay their way in taxes (C3X tuning: no upkeep).
  upkeep: 0,
  housing: { households: 1, residents: 4 },
  work: 8,
  tags: ['home'],
  // A porch, ivy or flower boxes fit by module. P1: window boxes are added, by the players in
  // Customize (in a color of their choosing) or by the household as its street grows pleasant.
  moduleSlots: [
    ['front', 1],
    ['wall', 1],
  ],
  // I2 (C4C): grows on low-density home lots, and becomes a townhouse when its household reaches
  // the Craftsfolk (materials by porter).
  grows: { zone: 'homes-low', handPlaced: true },
  upgradesTo: {
    def: 'townhouse',
    goods: [
      ['brick', 10],
      ['timber', 6],
    ],
  },
  art: { kit: 'cottage' },
};

export const fishery: BuildingDef = {
  id: 'fishery',
  name: 'Fishery',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  placement: [{ kind: 'waterEdge' }],
  cost: { coins: 20, goods: [['timber', 14]] },
  upkeep: 1,
  jobs: { count: 3, role: 'worker' },
  methods: [
    {
      id: 'fish',
      name: 'Fish the river',
      kind: 'gather',
      inputs: [],
      outputs: [['fish', 2]],
      hours: 2,
      workers: 3,
      perWorker: true,
    },
  ],
  work: 12,
  charm: [{ category: 'noise', value: -6, radius: 3 }],
  tags: ['smelly', 'workshop', 'fishery'],
  specialized: true,
  art: { kit: 'fishers-hut' },
};

export const forestersLodge: BuildingDef = {
  id: 'foresters-lodge',
  name: "Forester's lodge",
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  placement: [{ kind: 'woods', trees: 12, within: 8 }],
  cost: {
    coins: 20,
    goods: [
      ['timber', 12],
      ['stone', 6],
    ],
  },
  upkeep: 1,
  jobs: { count: 3, role: 'worker' },
  // Each felled tree gives timber, or firewood while the town is under its Fuel target; the lodge
  // plants a sapling in its range for every tree it takes. A cycle makes one of the two outputs.
  methods: [
    {
      id: 'fell-trees',
      name: 'Fell trees',
      kind: 'fell',
      inputs: [],
      outputs: [
        ['timber', 4],
        ['firewood', 6],
      ],
      hours: 3,
      workers: 3,
      perWorker: true,
      range: 8,
    },
  ],
  work: 12,
  charm: [{ category: 'noise', value: -6, radius: 3 }],
  tags: ['workshop', 'forestry'],
  specialized: true,
  reach: 8,
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
  lane: 'shared',
  category: 'service',
  size: [1, 2],
  entrance: [0, 1],
  placement: [{ kind: 'road' }],
  cost: { coins: 10, goods: [['timber', 8]] },
  upkeep: 1,
  jobs: { count: 1, role: 'vendor' },
  storage: 40,
  coverage: [{ kind: 'food', radius: 14 }],
  work: 6,
  charm: [{ category: 'comfort', value: 2, radius: 2 }],
  tags: ['outlet', 'market'],
  specialized: true,
  reach: 14,
  stores: ['food', 'treats'],
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
  cost: { coins: 40, goods: [['timber', 12]] },
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
  specialized: true,
  art: { kit: 'quarry' },
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
  placement: [{ kind: 'road' }],
  cost: {
    coins: 40,
    goods: [
      ['timber', 30],
      ['stone', 10],
    ],
  },
  upkeep: 2,
  jobs: { count: 4, role: 'porter' },
  storage: 800,
  coverage: [{ kind: 'logistics', radius: 24 }],
  work: 16,
  charm: [{ category: 'noise', value: -3, radius: 2 }],
  tags: ['storehouse', 'outlet'],
  specialized: true,
  reach: 24,
  stores: ['fuel', 'materials', 'wares', 'treats'],
  art: { kit: 'storehouse' },
};

/**
 * R1: the Food store. Keeps 1,200 Food, which spoils half as fast in store; homes and shops in
 * reach draw on it (docs/spec/13-ledger.md, Land and specialized buildings).
 */
export const granary: BuildingDef = {
  id: 'granary',
  name: 'Granary',
  lane: 'ledger',
  category: 'storage',
  size: [3, 3],
  entrance: [1, 2],
  placement: [{ kind: 'road' }],
  cost: {
    coins: 40,
    goods: [
      ['timber', 30],
      ['stone', 10],
    ],
  },
  upkeep: 2,
  jobs: { count: 2, role: 'porter' },
  storage: 1200,
  coverage: [{ kind: 'logistics', radius: 24 }],
  work: 16,
  charm: [{ category: 'noise', value: -2, radius: 2 }],
  tags: ['storehouse', 'outlet', 'granary'],
  specialized: true,
  reach: 24,
  stores: ['food'],
  art: { kit: 'storehouse', params: { kit: 'granary' } },
};

/** Standard valleys start with one; only sandbox valleys offer it in the toolbar. */
export const townHall: BuildingDef = {
  id: 'town-hall',
  name: 'Town hall',
  lane: 'shared',
  category: 'civic',
  size: [4, 4],
  entrance: [2, 3],
  jobs: { count: 4, role: 'builder' },
  storage: 0,
  charm: [{ category: 'comfort', value: 8, radius: 4 }],
  tags: ['civic', 'builders'],
  modes: ['sandbox'],
  // C5C: an arcade along the front, a clock tower, ivy.
  moduleSlots: [
    ['front', 1],
    ['top', 1],
    ['wall', 1],
  ],
  art: { kit: 'town-hall' },
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

/**
 * R1: the windmill no longer grinds; it lets bakers set up in its reach (2, or 4 when it stands 4+
 * levels above the ground around it). Its miller keeps it turning.
 */
export const windmill: BuildingDef = {
  id: 'windmill',
  name: 'Windmill',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  placement: [{ kind: 'openGround', clear: 2 }],
  cost: {
    coins: 50,
    goods: [
      ['timber', 24],
      ['stone', 8],
    ],
  },
  upkeep: 2,
  jobs: { count: 1, role: 'worker' },
  work: 20,
  charm: [{ category: 'view', value: 2, radius: 2 }],
  tags: ['mill'],
  specialized: true,
  reach: 24,
  capacity: 2,
  raisedCapacity: [4, 4],
  enables: ['baker'],
  art: { kit: 'windmill' },
};
