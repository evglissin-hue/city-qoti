import type { BuildingDef } from './types';

// I2 buildings (docs/spec/13-ledger.md, Goods, Services, Population tiers; C4C). The Village chains
// with their numbers, the services, the Trading Post, the cart shed, the Craftsfolk townhouse and
// the grown defs that C4B plants on zoned lots.
//
// Numbers per work day (the nine hours from 08:00, full crew, Content workers) at base prices:
//
//   clay pit        18 clay                          (2 diggers)
//   brick kiln      18 clay + 4.5 firewood -> 13.5 bricks  (one pit feeds one kiln)
//   sheep pasture   6 wool                           (1 shepherd)
//   spinner         6 wool -> 6 yarn                 (one pasture feeds one spinner)
//   weaver          6 yarn -> 6 cloth                (one spinner feeds one weaver)
//   dairy farm      18 milk                          (2 hands)
//   cheesemaker     13.5 milk -> 9 cheese            (skilled)
//   orchard         18 apples                        (2 pickers)
//   cider press     18 apples -> 9 cider
//   chopping shed   9 logs -> 18 firewood
//   herb garden     9 herbs
//   smithy          9 firewood + 4.5 stone -> 4.5 tools (skilled)
//   tavern          2 cider poured                   (social cover, 10 tiles, 60 residents)
//   herbalist       6 herbs brewed                   (health cover, 12 tiles, 60 residents)
//
// Forty Craftsfolk (ten households) use about 10 firewood, 4 cloth, 12 bread and 8 treats a day;
// ten townhouse upgrades take 100 bricks and 60 planks. Each chain turns its inputs into more
// value than it takes in wages (basic 6 coins, skilled 10) and upkeep, so the profit line in the
// inspector reads positive at base prices; C4A's market moves the prices from there.
//
// Art: C4E draws these. Until its kits land each def names an existing kit as a stand-in and puts
// the kit it should use in `params.kit`, with the details the kit can read (walls, roof, piles,
// animals, signs).

/** Clay dug from the riverbank deposits. A pit worked for two days brings the Brick Kiln. */
export const clayPit: BuildingDef = {
  id: 'clay-pit',
  name: 'Clay pit',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  placement: [{ kind: 'deposit', deposit: 'clay', minTiles: 2 }],
  cost: { coins: 20, goods: [['planks', 10]] },
  upkeep: 1,
  jobs: { count: 2, role: 'worker' },
  methods: [
    {
      id: 'dig-clay',
      name: 'Dig clay',
      kind: 'gather',
      inputs: [],
      outputs: [['clay', 2]],
      hours: 2,
      workers: 2,
      perWorker: true,
    },
  ],
  work: 8,
  charm: [{ category: 'noise', value: -4, radius: 2 }],
  tags: ['workshop', 'clay'],
  art: { kit: 'quarry', params: { kit: 'clay-pit', pile: 'clay', water: true } },
};

export const brickKiln: BuildingDef = {
  id: 'brick-kiln',
  name: 'Brick kiln',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  cost: {
    coins: 40,
    goods: [
      ['planks', 12],
      ['stone', 16],
    ],
  },
  upkeep: 2,
  jobs: { count: 2, role: 'worker' },
  methods: [
    {
      id: 'fire-bricks',
      name: 'Fire bricks',
      kind: 'craft',
      inputs: [
        ['clay', 4],
        ['firewood', 1],
      ],
      outputs: [['bricks', 3]],
      hours: 2,
      workers: 2,
    },
  ],
  work: 12,
  charm: [{ category: 'noise', value: -6, radius: 3 }],
  tags: ['workshop', 'kiln'],
  requires: { innovation: 'brick-kiln' },
  art: {
    kit: 'bakery',
    params: { kit: 'brick-kiln', wall: 'brick', chimney: true, smoke: true, pile: 'bricks' },
  },
};

export const sheepPasture: BuildingDef = {
  id: 'sheep-pasture',
  name: 'Sheep pasture',
  lane: 'ledger',
  category: 'production',
  size: [3, 3],
  entrance: [1, 2],
  placement: [{ kind: 'fertility', min: 30 }],
  cost: { coins: 20, goods: [['planks', 12]] },
  upkeep: 1,
  jobs: { count: 1, role: 'worker' },
  methods: [
    {
      id: 'shear-sheep',
      name: 'Shear the sheep',
      kind: 'gather',
      inputs: [],
      outputs: [['wool', 2]],
      hours: 3,
      workers: 1,
    },
  ],
  work: 8,
  charm: [{ category: 'nature', value: 3, radius: 2 }],
  tags: ['farm', 'pasture', 'animals'],
  requires: { rank: 'village' },
  art: { kit: 'vegetable-plot', params: { kit: 'sheep-pasture', animals: 'sheep', count: 5, fence: true } },
};

export const spinner: BuildingDef = {
  id: 'spinner',
  name: "Spinner's cottage",
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  cost: {
    coins: 25,
    goods: [
      ['planks', 14],
      ['stone', 6],
    ],
  },
  upkeep: 1,
  jobs: { count: 1, role: 'worker' },
  methods: [
    {
      id: 'spin-yarn',
      name: 'Spin yarn',
      kind: 'craft',
      inputs: [['wool', 2]],
      outputs: [['yarn', 2]],
      hours: 3,
      workers: 1,
    },
  ],
  work: 10,
  tags: ['workshop', 'textile'],
  requires: { rank: 'village' },
  art: { kit: 'cottage', params: { kit: 'spinner', wheel: true, sign: 'yarn' } },
};

export const weaver: BuildingDef = {
  id: 'weaver',
  name: "Weaver's shop",
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  cost: {
    coins: 30,
    goods: [
      ['planks', 16],
      ['stone', 8],
    ],
  },
  upkeep: 1,
  jobs: { count: 1, role: 'worker' },
  methods: [
    {
      id: 'weave-cloth',
      name: 'Weave cloth',
      kind: 'craft',
      inputs: [['yarn', 2]],
      outputs: [['cloth', 2]],
      hours: 3,
      workers: 1,
    },
  ],
  work: 12,
  charm: [{ category: 'noise', value: -3, radius: 2 }],
  tags: ['workshop', 'textile'],
  requires: { rank: 'village' },
  art: { kit: 'bakery', params: { kit: 'weaver', loom: true, sign: 'cloth', awning: true } },
};

export const dairy: BuildingDef = {
  id: 'dairy',
  name: 'Dairy farm',
  lane: 'ledger',
  category: 'production',
  size: [3, 3],
  entrance: [1, 2],
  placement: [{ kind: 'fertility', min: 30 }],
  cost: {
    coins: 30,
    goods: [
      ['planks', 16],
      ['stone', 6],
    ],
  },
  upkeep: 1,
  jobs: { count: 2, role: 'worker' },
  methods: [
    {
      id: 'milk-cows',
      name: 'Milk the cows',
      kind: 'gather',
      inputs: [],
      outputs: [['milk', 2]],
      hours: 2,
      workers: 2,
      perWorker: true,
    },
  ],
  work: 12,
  charm: [{ category: 'noise', value: -4, radius: 2 }],
  tags: ['farm', 'animals', 'smelly'],
  requires: { rank: 'village' },
  art: { kit: 'farmhouse', params: { kit: 'dairy', animals: 'cows', count: 3, churns: true } },
};

export const cheesemaker: BuildingDef = {
  id: 'cheesemaker',
  name: 'Cheesemaker',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  cost: {
    coins: 40,
    goods: [
      ['planks', 14],
      ['stone', 12],
    ],
  },
  upkeep: 2,
  jobs: { count: 2, role: 'worker', tier: 'craftsfolk' },
  methods: [
    {
      id: 'make-cheese',
      name: 'Make cheese',
      kind: 'craft',
      inputs: [['milk', 3]],
      outputs: [['cheese', 2]],
      hours: 2,
      workers: 2,
    },
  ],
  work: 12,
  charm: [{ category: 'noise', value: -2, radius: 2 }],
  tags: ['workshop', 'cheese'],
  requires: { rank: 'village' },
  art: { kit: 'bakery', params: { kit: 'cheesemaker', wall: 'stone', sign: 'cheese', wheels: true } },
};

export const orchard: BuildingDef = {
  id: 'orchard',
  name: 'Orchard',
  lane: 'shared',
  category: 'production',
  size: [3, 3],
  entrance: [1, 2],
  placement: [{ kind: 'fertility', min: 40 }],
  cost: { coins: 25, goods: [['planks', 8]] },
  upkeep: 1,
  jobs: { count: 2, role: 'worker' },
  methods: [
    {
      id: 'pick-apples',
      name: 'Pick apples',
      kind: 'gather',
      inputs: [],
      outputs: [['apples', 2]],
      hours: 2,
      workers: 2,
      perWorker: true,
    },
  ],
  work: 8,
  charm: [{ category: 'nature', value: 5, radius: 2 }],
  tags: ['farm', 'orchard', 'garden'],
  requires: { rank: 'village' },
  art: { kit: 'vegetable-plot', params: { kit: 'orchard', trees: 6, fruit: 'apple', ladder: true } },
};

export const ciderPress: BuildingDef = {
  id: 'cider-press',
  name: 'Cider press',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  cost: {
    coins: 40,
    goods: [
      ['planks', 16],
      ['stone', 8],
    ],
  },
  upkeep: 2,
  jobs: { count: 1, role: 'worker' },
  methods: [
    {
      id: 'press-cider',
      name: 'Press cider',
      kind: 'craft',
      inputs: [['apples', 4]],
      outputs: [['cider', 2]],
      hours: 2,
      workers: 1,
    },
  ],
  work: 12,
  charm: [{ category: 'comfort', value: 2, radius: 2 }],
  tags: ['workshop', 'cider'],
  requires: { rank: 'village' },
  art: { kit: 'bakery', params: { kit: 'cider-press', barrels: 4, sign: 'cider' } },
};

/** Firewood for the townhouses now and every hearth in winter [I3]. */
export const choppingShed: BuildingDef = {
  id: 'chopping-shed',
  name: 'Chopping shed',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  cost: { coins: 15, goods: [['logs', 12]] },
  upkeep: 1,
  jobs: { count: 1, role: 'worker' },
  methods: [
    {
      id: 'chop-firewood',
      name: 'Chop firewood',
      kind: 'craft',
      inputs: [['logs', 1]],
      outputs: [['firewood', 2]],
      hours: 1,
      workers: 1,
    },
  ],
  work: 6,
  charm: [{ category: 'noise', value: -4, radius: 2 }],
  tags: ['workshop', 'forestry'],
  art: { kit: 'woodcutter', params: { kit: 'chopping-shed', pile: 'firewood', block: true } },
};

export const herbGarden: BuildingDef = {
  id: 'herb-garden',
  name: 'Herb garden',
  lane: 'shared',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  placement: [{ kind: 'fertility', min: 30 }],
  cost: { coins: 8, goods: [['planks', 4]] },
  upkeep: 0,
  jobs: { count: 1, role: 'worker' },
  methods: [
    {
      id: 'grow-herbs',
      name: 'Grow herbs',
      kind: 'gather',
      inputs: [],
      outputs: [['herbs', 2]],
      hours: 2,
      workers: 1,
    },
  ],
  work: 4,
  charm: [{ category: 'nature', value: 3, radius: 2 }],
  tags: ['plot', 'garden', 'herb'],
  requires: { rank: 'village' },
  art: { kit: 'vegetable-plot', params: { kit: 'herb-garden', crop: 'herbs', bees: true } },
};

/** Tools until iron comes over the hill [I4]: hard stone, hot fires and a patient smith. */
export const smithy: BuildingDef = {
  id: 'smithy',
  name: 'Smithy',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  cost: {
    coins: 45,
    goods: [
      ['planks', 12],
      ['stone', 16],
    ],
  },
  upkeep: 2,
  jobs: { count: 1, role: 'worker', tier: 'craftsfolk' },
  methods: [
    {
      id: 'forge-tools',
      name: 'Forge tools',
      kind: 'craft',
      inputs: [
        ['firewood', 2],
        ['stone', 1],
      ],
      outputs: [['tools', 1]],
      hours: 2,
      workers: 1,
    },
  ],
  work: 12,
  charm: [{ category: 'noise', value: -8, radius: 3 }],
  tags: ['workshop', 'smithy'],
  requires: { rank: 'village' },
  art: { kit: 'sawpit', params: { kit: 'smithy', wall: 'stone', chimney: true, glow: true, anvil: true } },
};

/** Planks by the river (the Water Wheel innovation): 80% more than a sawpit's crew, and louder. */
export const sawmill: BuildingDef = {
  id: 'sawmill',
  name: 'Water sawmill',
  lane: 'ledger',
  category: 'production',
  size: [2, 3],
  entrance: [1, 2],
  placement: [{ kind: 'waterEdge' }],
  cost: {
    coins: 60,
    goods: [
      ['planks', 20],
      ['stone', 12],
      ['tools', 4],
    ],
  },
  upkeep: 2,
  jobs: { count: 2, role: 'worker' },
  methods: [
    {
      id: 'saw-planks-water',
      name: 'Saw planks by water',
      kind: 'craft',
      inputs: [['logs', 9]],
      outputs: [['planks', 18]],
      hours: 5,
      workers: 2,
    },
  ],
  outputBuffer: 30,
  work: 16,
  charm: [{ category: 'noise', value: -10, radius: 4 }],
  tags: ['workshop', 'mill'],
  requires: { innovation: 'water-wheel' },
  art: { kit: 'sawpit', params: { kit: 'sawmill', wheel: 'water', pile: 'planks' } },
};

// --- Services ----------------------------------------------------------------------------------

/** Children within reach learn their letters (and can be taken on as apprentices). */
export const school: BuildingDef = {
  id: 'school',
  name: 'School',
  lane: 'shared',
  category: 'service',
  size: [3, 3],
  entrance: [1, 2],
  cost: {
    coins: 60,
    goods: [
      ['planks', 24],
      ['stone', 12],
      ['bricks', 12],
    ],
  },
  upkeep: 3,
  jobs: { count: 2, role: 'worker', tier: 'craftsfolk' },
  coverage: [{ kind: 'education', radius: 12, capacity: 24 }],
  work: 20,
  charm: [{ category: 'comfort', value: 4, radius: 3 }],
  tags: ['school', 'civic'],
  requires: { rank: 'village' },
  art: { kit: 'house', params: { kit: 'school', bell: true, wall: 'brick', yard: true } },
};

/** Social cover for 60 residents within 10 tiles; pours cider of an evening. */
export const tavern: BuildingDef = {
  id: 'tavern',
  name: 'Tavern',
  lane: 'shared',
  category: 'service',
  size: [3, 2],
  entrance: [1, 1],
  cost: {
    coins: 50,
    goods: [
      ['planks', 24],
      ['stone', 12],
      ['bricks', 6],
    ],
  },
  upkeep: 2,
  jobs: { count: 2, role: 'worker' },
  coverage: [{ kind: 'social', radius: 10, capacity: 60 }],
  methods: [
    {
      id: 'pour-cider',
      name: 'Pour cider',
      kind: 'craft',
      inputs: [['cider', 1]],
      outputs: [],
      hours: 4,
      workers: 2,
    },
  ],
  work: 16,
  charm: [
    { category: 'comfort', value: 4, radius: 3 },
    { category: 'light', value: 1, radius: 3, nightValue: 5 },
  ],
  tags: ['tavern', 'cafe'],
  requires: { rank: 'village' },
  art: { kit: 'house', params: { kit: 'tavern', sign: 'tavern', benches: true, lamps: true } },
};

/** Health cover for 60 residents within 12 tiles; brews remedies from herbs. */
export const herbalist: BuildingDef = {
  id: 'herbalist',
  name: 'Herbalist',
  lane: 'shared',
  category: 'service',
  size: [2, 2],
  entrance: [1, 1],
  cost: {
    coins: 35,
    goods: [
      ['planks', 14],
      ['stone', 8],
    ],
  },
  upkeep: 2,
  jobs: { count: 1, role: 'worker' },
  coverage: [{ kind: 'health', radius: 12, capacity: 60 }],
  methods: [
    {
      id: 'brew-remedies',
      name: 'Brew remedies',
      kind: 'craft',
      inputs: [['herbs', 2]],
      outputs: [],
      hours: 3,
      workers: 1,
    },
  ],
  work: 10,
  charm: [{ category: 'nature', value: 2, radius: 2 }],
  tags: ['herbalist', 'garden'],
  requires: { rank: 'village' },
  art: { kit: 'cottage', params: { kit: 'herbalist', drying: true, sign: 'mortar', pots: 4 } },
};

// --- Trade and carts ---------------------------------------------------------------------------

/**
 * Where caravans load and unload (C4A runs the trade; `tradeView` finds it by its tag). It is a
 * small storehouse too, with porters of its own, so imports reach the town.
 */
export const tradingPost: BuildingDef = {
  id: 'trading-post',
  name: 'Trading post',
  lane: 'ledger',
  category: 'storage',
  size: [4, 3],
  entrance: [1, 2],
  cost: {
    coins: 60,
    goods: [
      ['planks', 30],
      ['stone', 16],
      ['bricks', 8],
    ],
  },
  upkeep: 3,
  jobs: { count: 2, role: 'porter' },
  storage: 200,
  coverage: [{ kind: 'logistics', radius: 16 }],
  work: 20,
  charm: [{ category: 'noise', value: -4, radius: 3 }],
  tags: ['trading-post', 'storehouse', 'outlet'],
  requires: { rank: 'village' },
  art: { kit: 'storehouse', params: { kit: 'trading-post', flags: true, scales: true, crates: 6 } },
};

/** One cart and its pony: 16 units a trip on lanes and streets (the Carts innovation). */
export const cartShed: BuildingDef = {
  id: 'cart-shed',
  name: 'Cart shed',
  lane: 'ledger',
  category: 'storage',
  size: [2, 3],
  entrance: [1, 2],
  cost: {
    coins: 40,
    goods: [
      ['planks', 16],
      ['stone', 6],
      ['tools', 2],
    ],
  },
  upkeep: 2,
  jobs: { count: 1, role: 'worker' },
  work: 10,
  charm: [{ category: 'noise', value: -3, radius: 2 }],
  tags: ['cart-shed'],
  requires: { innovation: 'carts' },
  art: { kit: 'shed', params: { kit: 'cart-shed', doors: 'wide', hay: true } },
};

// --- Homes and grown buildings -----------------------------------------------------------------

/**
 * A Craftsfolk home: a cottage upgrades into one in place (10 bricks and 6 planks by porter), and
 * townhouse lots grow them outright. A household that slides back keeps the house.
 */
export const townhouse: BuildingDef = {
  id: 'townhouse',
  name: 'Townhouse',
  lane: 'hearth',
  category: 'home',
  size: [2, 2],
  entrance: [1, 1],
  cost: {
    coins: 30,
    goods: [
      ['planks', 16],
      ['stone', 6],
      ['bricks', 10],
    ],
  },
  upkeep: 0,
  housing: { households: 1, residents: 5 },
  work: 12,
  tags: ['home'],
  tier: 'craftsfolk',
  grows: { zone: 'homes-medium' },
  requires: { rank: 'village' },
  art: { kit: 'house', params: { kit: 'townhouse', storeys: 2, wall: 'brick', chimney: true } },
};

/** A shop with a flat above: a food outlet on the ground floor and a household upstairs. */
export const cornerShop: BuildingDef = {
  id: 'corner-shop',
  name: 'Corner shop',
  lane: 'ledger',
  category: 'service',
  size: [2, 3],
  entrance: [1, 2],
  cost: {
    coins: 30,
    goods: [
      ['planks', 18],
      ['stone', 8],
    ],
  },
  upkeep: 1,
  jobs: { count: 1, role: 'vendor' },
  housing: { households: 1, residents: 4 },
  storage: 40,
  coverage: [{ kind: 'food', radius: 14 }],
  work: 12,
  charm: [{ category: 'comfort', value: 2, radius: 2 }],
  tags: ['outlet', 'market', 'shop', 'cafe'],
  grows: { zone: 'shops' },
  requires: { rank: 'village' },
  art: { kit: 'house', params: { kit: 'corner-shop', awning: true, shopfront: true, storeys: 2 } },
};

/** A small workshop on a crafts lot that takes up whatever the market is short of. */
export const workshop: BuildingDef = {
  id: 'workshop',
  name: 'Workshop',
  lane: 'ledger',
  category: 'production',
  size: [3, 3],
  entrance: [1, 2],
  cost: {
    coins: 30,
    goods: [
      ['planks', 16],
      ['stone', 8],
    ],
  },
  upkeep: 1,
  jobs: { count: 2, role: 'worker' },
  methods: [
    {
      id: 'chop-firewood',
      name: 'Chop firewood',
      kind: 'craft',
      inputs: [['logs', 1]],
      outputs: [['firewood', 2]],
      hours: 1,
      workers: 1,
    },
    {
      id: 'spin-yarn',
      name: 'Spin yarn',
      kind: 'craft',
      inputs: [['wool', 2]],
      outputs: [['yarn', 2]],
      hours: 3,
      workers: 1,
    },
    {
      id: 'weave-cloth',
      name: 'Weave cloth',
      kind: 'craft',
      inputs: [['yarn', 2]],
      outputs: [['cloth', 2]],
      hours: 3,
      workers: 1,
    },
    {
      id: 'press-cider',
      name: 'Press cider',
      kind: 'craft',
      inputs: [['apples', 4]],
      outputs: [['cider', 2]],
      hours: 2,
      workers: 1,
    },
    {
      id: 'make-cheese',
      name: 'Make cheese',
      kind: 'craft',
      inputs: [['milk', 3]],
      outputs: [['cheese', 2]],
      hours: 2,
      workers: 2,
    },
  ],
  work: 12,
  charm: [{ category: 'noise', value: -4, radius: 3 }],
  tags: ['workshop', 'grown'],
  grows: { zone: 'crafts' },
  requires: { rank: 'village' },
  art: { kit: 'bakery', params: { kit: 'workshop', yard: true, sign: 'method' } },
};

/** A farmstead on a farms lot: pasture, cows, apples, herbs or vegetables, by what is short. */
export const farmstead: BuildingDef = {
  id: 'farmstead',
  name: 'Farmstead',
  lane: 'ledger',
  category: 'production',
  size: [3, 3],
  entrance: [1, 2],
  placement: [{ kind: 'fertility', min: 30 }],
  cost: {
    coins: 25,
    goods: [
      ['planks', 14],
      ['stone', 4],
    ],
  },
  upkeep: 1,
  jobs: { count: 2, role: 'worker' },
  methods: [
    {
      id: 'grow-vegetables',
      name: 'Grow vegetables',
      kind: 'gather',
      inputs: [],
      outputs: [['vegetables', 3]],
      hours: 4,
      workers: 2,
      perWorker: true,
    },
    {
      id: 'pick-apples',
      name: 'Pick apples',
      kind: 'gather',
      inputs: [],
      outputs: [['apples', 2]],
      hours: 2,
      workers: 2,
      perWorker: true,
    },
    {
      id: 'shear-sheep',
      name: 'Shear the sheep',
      kind: 'gather',
      inputs: [],
      outputs: [['wool', 2]],
      hours: 3,
      workers: 2,
      perWorker: true,
    },
    {
      id: 'milk-cows',
      name: 'Milk the cows',
      kind: 'gather',
      inputs: [],
      outputs: [['milk', 2]],
      hours: 2,
      workers: 2,
      perWorker: true,
    },
    {
      id: 'grow-herbs',
      name: 'Grow herbs',
      kind: 'gather',
      inputs: [],
      outputs: [['herbs', 2]],
      hours: 3,
      workers: 2,
      perWorker: true,
    },
  ],
  work: 10,
  charm: [{ category: 'nature', value: 2, radius: 2 }],
  tags: ['farm', 'grown'],
  grows: { zone: 'farms' },
  requires: { rank: 'village' },
  art: { kit: 'farmhouse', params: { kit: 'farmstead', yard: true, crop: 'method' } },
};
