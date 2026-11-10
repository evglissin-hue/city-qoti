import type { TradeDef } from './types';

// The trades of the zones-first Ledger (docs/spec/13-ledger.md, Zoning and growth: Trades), written
// in R1.0. A business on a Farmland, Workshops or Shops lot takes one; R1B's trade score picks it.
// Rule 2 holds here: a workshop's `from` is raw goods only, which a content test checks for every
// trade and method. Numbers (hours, outputs, crews, wants) are R1B's and R1X's to tune. Looks name
// the building kits that exist today; R1E draws each trade and level from them.

// --- Farmland (the farmstead: hands 2, 3 and 4) -------------------------------------------------

export const dairy: TradeDef = {
  id: 'dairy',
  name: 'Dairy',
  blurb: 'Cheese from a herd on good grass.',
  zone: 'farms',
  building: 'farmstead',
  makes: 'cheese',
  from: [],
  method: {
    id: 'make-cheese',
    name: 'Make cheese',
    kind: 'gather',
    inputs: [],
    outputs: [['cheese', 1]],
    hours: 3,
    workers: 2,
    perWorker: true,
  },
  wants: { fertility: 30 },
  crew: [2, 3, 4],
  look: { kit: 'dairy' },
};

export const grainFarm: TradeDef = {
  id: 'grain-farm',
  name: 'Grain farm',
  blurb: 'Grain from fields sown in spring and cut when golden.',
  zone: 'farms',
  building: 'farmstead',
  makes: 'grain',
  from: [],
  method: {
    id: 'tend-grain',
    name: 'Tend the grain',
    kind: 'farm',
    inputs: [],
    outputs: [['grain', 1]],
    hours: 24,
    workers: 2,
    range: 6,
  },
  wants: { fertility: 15 },
  crew: [2, 3, 4],
  look: { kit: 'farmhouse' },
};

export const hives: TradeDef = {
  id: 'hives',
  name: 'Hives',
  blurb: 'Honey, where the flowers are thick enough for the bees.',
  zone: 'farms',
  building: 'farmstead',
  makes: 'honey',
  from: [],
  method: {
    id: 'keep-bees',
    name: 'Keep bees',
    kind: 'gather',
    inputs: [],
    outputs: [['honey', 2]],
    hours: 6,
    workers: 2,
    perWorker: true,
  },
  wants: { pollinators: 100 },
  crew: [2, 3, 4],
  look: { kit: 'apiary' },
  keepers: ['curious'],
};

export const marketGarden: TradeDef = {
  id: 'market-garden',
  name: 'Market garden',
  blurb: 'Vegetables in rows, on any soil, the better the soil the better the crop.',
  zone: 'farms',
  building: 'farmstead',
  makes: 'vegetables',
  from: [],
  method: {
    id: 'grow-vegetables',
    name: 'Grow vegetables',
    kind: 'gather',
    inputs: [],
    outputs: [['vegetables', 3]],
    hours: 4,
    workers: 2,
    perWorker: true,
  },
  wants: {},
  crew: [2, 3, 4],
  look: { kit: 'vegetable-plot' },
  keepers: ['green-fingered'],
};

export const orchard: TradeDef = {
  id: 'orchard',
  name: 'Orchard',
  blurb: 'Fruit from trees on rich soil, once they bear.',
  zone: 'farms',
  building: 'farmstead',
  makes: 'fruit',
  from: [],
  method: {
    id: 'pick-fruit',
    name: 'Pick fruit',
    kind: 'gather',
    inputs: [],
    outputs: [['fruit', 2]],
    hours: 2,
    workers: 2,
    perWorker: true,
  },
  wants: { fertility: 40 },
  crew: [2, 3, 4],
  look: { kit: 'orchard' },
  keepers: ['green-fingered'],
};

export const sheepRun: TradeDef = {
  id: 'sheep-run',
  name: 'Sheep run',
  blurb: 'Wool for the weavers, from sheep on good grass.',
  zone: 'farms',
  building: 'farmstead',
  makes: 'wool',
  from: [],
  method: {
    id: 'shear-sheep',
    name: 'Shear the sheep',
    kind: 'gather',
    inputs: [],
    outputs: [['wool', 2]],
    hours: 3,
    workers: 2,
    perWorker: true,
  },
  wants: { fertility: 30 },
  crew: [2, 3, 4],
  look: { kit: 'sheep-pasture' },
};

// --- Workshops (the workshop: hands 1, 2 and 4) -------------------------------------------------

export const baker: TradeDef = {
  id: 'baker',
  name: 'Baker',
  blurb: "Bread from grain, in a windmill's reach.",
  zone: 'crafts',
  building: 'workshop',
  makes: 'bread',
  from: ['grain'],
  method: {
    id: 'bake-bread',
    name: 'Bake bread',
    kind: 'craft',
    inputs: [['grain', 2]],
    outputs: [['bread', 3]],
    hours: 2,
    workers: 1,
  },
  wants: { reach: 'windmill' },
  crew: [1, 2, 4],
  look: { kit: 'bakery' },
  keepers: ['sweet-tooth'],
};

export const carpenter: TradeDef = {
  id: 'carpenter',
  name: 'Carpenter',
  blurb: "Furniture from timber, in a sawmill's reach.",
  zone: 'crafts',
  building: 'workshop',
  makes: 'furniture',
  from: ['timber'],
  method: {
    id: 'make-furniture',
    name: 'Make furniture',
    kind: 'craft',
    inputs: [['timber', 3]],
    outputs: [['furniture', 1]],
    hours: 3,
    workers: 1,
  },
  wants: { reach: 'sawmill' },
  crew: [1, 2, 4],
  look: { kit: 'carpenter' },
  keepers: ['practical'],
};

export const chandler: TradeDef = {
  id: 'chandler',
  name: 'Chandler',
  blurb: 'Beeswax candles from honey.',
  zone: 'crafts',
  building: 'workshop',
  makes: 'candles',
  from: ['honey'],
  method: {
    id: 'dip-candles',
    name: 'Dip candles',
    kind: 'craft',
    inputs: [['honey', 1]],
    outputs: [['candles', 3]],
    hours: 1,
    workers: 1,
  },
  wants: {},
  crew: [1, 2, 4],
  look: { kit: 'chandler' },
  keepers: ['bookish'],
};

export const ciderMaker: TradeDef = {
  id: 'cider-maker',
  name: 'Cider maker',
  blurb: 'Cider pressed from fruit, and rested while the boughs are bare.',
  zone: 'crafts',
  building: 'workshop',
  makes: 'cider',
  from: ['fruit'],
  method: {
    id: 'press-cider',
    name: 'Press cider',
    kind: 'craft',
    inputs: [['fruit', 1]],
    outputs: [['cider', 2]],
    hours: 1,
    workers: 1,
  },
  wants: {},
  crew: [1, 2, 4],
  look: { kit: 'cider-press' },
  keepers: ['cheerful'],
};

export const weaver: TradeDef = {
  id: 'weaver',
  name: 'Weaver',
  blurb: 'Cloth from wool, spun and woven under one roof.',
  zone: 'crafts',
  building: 'workshop',
  makes: 'cloth',
  from: ['wool'],
  method: {
    id: 'weave-cloth',
    name: 'Weave cloth',
    kind: 'craft',
    inputs: [['wool', 2]],
    outputs: [['cloth', 2]],
    hours: 3,
    workers: 1,
  },
  wants: {},
  crew: [1, 2, 4],
  look: { kit: 'weaver' },
  keepers: ['artistic'],
};

// --- Shops (the shop: hands 1, 2 and 3) ---------------------------------------------------------

export const shop: TradeDef = {
  id: 'shop',
  name: 'Shop',
  blurb: 'Food and wares for the homes around it; treats and tables out front from level 2.',
  zone: 'shops',
  building: 'corner-shop',
  makes: null,
  from: [],
  method: null,
  sells: [
    ['food', 'wares'],
    ['food', 'wares', 'treats'],
    ['food', 'wares', 'treats'],
  ],
  wants: { households: 2 },
  crew: [1, 2, 3],
  look: { kit: 'shop' },
  requires: { rank: 'village' },
  keepers: ['cheerful', 'generous', 'thrifty'],
};
