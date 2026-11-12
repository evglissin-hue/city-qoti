import type { BuildingDef } from './types';

// Village buildings. R1.0 (docs/spec/13-ledger.md, Land and specialized buildings): the chains of
// C4C are gone; what stays is the Village's specialized buildings (the Brickworks, the Sawmill, the
// Trading Post, the Market Square, the Cart Shed), the services (school, tavern, herbalist), the
// Craftsfolk townhouse and the three business defs a trade grows as (workshop, farmstead, shop).
// Costs convert planks to timber and bricks to brick one for one; R1X tunes them.

/**
 * R1: the clay pit and kiln in one, on its own clay. Fires brick, burning a firewood for six
 * (the Brick Kiln innovation opens it).
 */
export const brickworks: BuildingDef = {
  id: 'brickworks',
  name: 'Brickworks',
  lane: 'ledger',
  category: 'production',
  size: [3, 3],
  entrance: [1, 2],
  placement: [{ kind: 'deposit', deposit: 'clay', minTiles: 2 }],
  cost: {
    coins: 40,
    goods: [
      ['timber', 12],
      ['stone', 16],
    ],
  },
  upkeep: 2,
  jobs: { count: 3, role: 'worker' },
  methods: [
    {
      id: 'fire-brick',
      name: 'Fire brick',
      kind: 'craft',
      inputs: [['firewood', 1]],
      outputs: [['brick', 6]],
      hours: 4,
      workers: 3,
    },
  ],
  work: 14,
  charm: [{ category: 'noise', value: -6, radius: 3 }],
  tags: ['workshop', 'kiln'],
  requires: { innovation: 'brick-kiln' },
  specialized: true,
  art: { kit: 'brick-kiln', params: { kit: 'brickworks' } },
};

/**
 * R1: the water sawmill lets carpenters set up in its reach (three of them); it no longer saws for
 * the town. While the river is frozen it saws by hand, for one carpenter fewer (R1B).
 */
export const sawmill: BuildingDef = {
  id: 'sawmill',
  name: 'Sawmill',
  lane: 'ledger',
  category: 'production',
  size: [2, 3],
  entrance: [1, 2],
  placement: [{ kind: 'river' }],
  cost: {
    coins: 60,
    goods: [
      ['timber', 20],
      ['stone', 12],
    ],
  },
  upkeep: 2,
  jobs: { count: 2, role: 'worker' },
  work: 16,
  charm: [{ category: 'noise', value: -10, radius: 4 }],
  tags: ['workshop', 'mill'],
  requires: { innovation: 'water-wheel' },
  specialized: true,
  reach: 24,
  capacity: 3,
  enables: ['carpenter'],
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
      ['timber', 24],
      ['stone', 12],
      ['brick', 12],
    ],
  },
  upkeep: 3,
  jobs: { count: 2, role: 'worker', tier: 'craftsfolk' },
  coverage: [{ kind: 'education', radius: 12, capacity: 24 }],
  work: 20,
  charm: [{ category: 'comfort', value: 4, radius: 3 }],
  tags: ['school', 'civic'],
  requires: { rank: 'village' },
  art: { kit: 'school' },
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
      ['timber', 24],
      ['stone', 12],
      ['brick', 6],
    ],
  },
  upkeep: 2,
  jobs: { count: 2, role: 'worker' },
  // C4X: a tavern serves a whole quarter (14 tiles, 100 residents); at 10 and 60 most homes waited
  // on a tavern of their own before anyone could become Craftsfolk.
  coverage: [{ kind: 'social', radius: 14, capacity: 100 }],
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
  // C5C: a porch or arcade, a bay window, flower boxes.
  moduleSlots: [
    ['front', 1],
    ['side', 1],
    ['wall', 1],
  ],
  requires: { rank: 'village' },
  art: { kit: 'tavern' },
};

/** Health cover for 60 residents within 12 tiles; brews from her own garden, so it needs no supply (R1). */
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
      ['timber', 14],
      ['stone', 8],
    ],
  },
  upkeep: 2,
  jobs: { count: 1, role: 'worker' },
  // C4X: like the tavern, a herbalist serves a quarter (14 tiles, 100 residents).
  coverage: [{ kind: 'health', radius: 14, capacity: 100 }],
  work: 10,
  charm: [{ category: 'nature', value: 2, radius: 2 }],
  tags: ['herbalist', 'garden'],
  requires: { rank: 'village' },
  art: { kit: 'herbalist' },
};

// --- Trade and carts ---------------------------------------------------------------------------

/**
 * Where caravans load and unload (C4A runs the trade; `tradeView` finds it by its tag). It is a
 * small storehouse too, with porters of its own, so imports reach the town.
 */
/**
 * R1: the carrier's depot by the valley road: more carried each day and better terms (R1A). A small
 * store too, with porters of its own, so what the carrier brings reaches the town.
 */
export const tradingPost: BuildingDef = {
  id: 'trading-post',
  name: 'Trading post',
  lane: 'ledger',
  category: 'storage',
  size: [4, 3],
  entrance: [1, 2],
  placement: [{ kind: 'valleyRoad', within: 6 }],
  cost: {
    coins: 60,
    goods: [
      ['timber', 30],
      ['stone', 20],
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
  specialized: true,
  art: { kit: 'trading-post' },
};

/**
 * R1: the town's main outlet, six stalls in one place selling every family, where the carrier sets
 * out what it brought and market day is held. Odette Fenwick's finale roofs it into the Market Hall.
 */
export const marketSquare: BuildingDef = {
  id: 'market-square',
  name: 'Market square',
  lane: 'shared',
  category: 'service',
  size: [3, 3],
  entrance: [1, 2],
  placement: [{ kind: 'road', roads: ['lane', 'street'] }],
  cost: {
    coins: 50,
    goods: [
      ['timber', 20],
      ['stone', 20],
    ],
  },
  upkeep: 2,
  jobs: { count: 3, role: 'vendor' },
  // Six stalls of 40, one for each family: no `stores`, so it takes every good.
  storage: 240,
  coverage: [{ kind: 'food', radius: 20 }],
  work: 16,
  charm: [{ category: 'comfort', value: 5, radius: 4 }],
  tags: ['outlet', 'market', 'square'],
  requires: { rank: 'village' },
  specialized: true,
  reach: 20,
  art: { kit: 'market-stall', params: { kit: 'market-square' } },
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
      ['timber', 16],
      ['stone', 6],
    ],
  },
  upkeep: 2,
  jobs: { count: 1, role: 'worker' },
  work: 10,
  charm: [{ category: 'noise', value: -3, radius: 2 }],
  tags: ['cart-shed'],
  requires: { innovation: 'carts' },
  placement: [{ kind: 'road', roads: ['lane', 'street'] }],
  specialized: true,
  art: { kit: 'cart-shed' },
};

// --- Homes and grown buildings -----------------------------------------------------------------

/**
 * A Craftsfolk home: a cottage upgrades into one in place (10 brick and 6 timber by porter), and
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
      ['timber', 16],
      ['stone', 6],
      ['brick', 10],
    ],
  },
  upkeep: 0,
  housing: { households: 1, residents: 5 },
  work: 12,
  tags: ['home'],
  // C5C: customization phase 2.
  moduleSlots: [
    ['front', 1],
    ['roof', 1],
    ['side', 1],
    ['top', 1],
    ['wall', 1],
  ],
  tier: 'craftsfolk',
  grows: { zone: 'homes-medium' },
  requires: { rank: 'village' },
  art: { kit: 'townhouse' },
};

/** A shop with a flat above: a food outlet on the ground floor and a household upstairs. */
export const cornerShop: BuildingDef = {
  id: 'corner-shop',
  name: 'Shop',
  lane: 'ledger',
  category: 'service',
  size: [2, 3],
  entrance: [1, 2],
  cost: {
    coins: 30,
    goods: [
      ['timber', 18],
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
  art: { kit: 'shop' },
};

/** A small workshop on a crafts lot that takes up whatever the market is short of. */
/**
 * R1: a workshop business, grown on a Workshops lot; its trade (content trades: baker, weaver,
 * carpenter, chandler, cider maker) says what it makes. Hands come from the trade's crew by level
 * (level 1: one, the def's jobs). Open from founding.
 */
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
      ['timber', 16],
      ['stone', 8],
    ],
  },
  upkeep: 1,
  jobs: { count: 1, role: 'worker' },
  work: 12,
  charm: [{ category: 'noise', value: -4, radius: 3 }],
  tags: ['workshop', 'grown'],
  grows: { zone: 'crafts' },
  art: { kit: 'workshop' },
};

/** A farmstead on a farms lot: pasture, cows, apples, herbs or vegetables, by what is short. */
/**
 * R1: a farmstead business, grown on a Farmland lot; its trade (grain farm, market garden, orchard,
 * dairy, sheep run, hives) says what it grows. Level 1 has two hands (the def's jobs). Open from founding.
 */
export const farmstead: BuildingDef = {
  id: 'farmstead',
  name: 'Farmstead',
  lane: 'ledger',
  category: 'production',
  size: [3, 3],
  entrance: [1, 2],
  cost: {
    coins: 25,
    goods: [
      ['timber', 14],
      ['stone', 4],
    ],
  },
  upkeep: 1,
  jobs: { count: 2, role: 'worker' },
  work: 10,
  charm: [{ category: 'nature', value: 2, radius: 2 }],
  tags: ['farm', 'grown', 'soil'],
  grows: { zone: 'farms' },
  art: { kit: 'farmstead' },
};
