import type { GoodDef } from './types';

// The sixteen goods of the zones-first Ledger (docs/spec/13-ledger.md, Goods: families and flavors),
// written in R1.0. The registry in index.ts lists them in the spec's order, and that order is a good's
// index in every per-good array in saved state: append-only from here, never reordered. Base prices
// in pennies carry over from the chain economy where the good existed (grain takes wheat's, timber
// planks', brick bricks'); all are to tune in R1X.

// --- Food ---------------------------------------------------------------------------------------

/** Eaten as porridge, the plainest flavor; the baker's raw good. Sown in spring, cut when golden. */
export const grain: GoodDef = {
  id: 'grain',
  name: 'Grain',
  label: 'grain',
  family: 'food',
  raw: true,
  basePrice: 100,
  carry: 4,
};

export const vegetables: GoodDef = {
  id: 'vegetables',
  name: 'Vegetables',
  label: 'veg',
  family: 'food',
  raw: true,
  basePrice: 100,
  carry: 4,
  // Nothing grows in winter; summer makes up some of it.
  seasons: [1000, 1300, 1000, 0],
};

/** The orchard's crop and the cider maker's raw good. */
export const fruit: GoodDef = {
  id: 'fruit',
  name: 'Fruit',
  label: 'fruit',
  family: 'food',
  raw: true,
  basePrice: 100,
  carry: 4,
  spoilsDays: 4,
  // Blossom in spring, the crop in summer and autumn, bare boughs in winter.
  seasons: [400, 1000, 2600, 0],
};

export const fish: GoodDef = {
  id: 'fish',
  name: 'Fish',
  label: 'fish',
  family: 'food',
  raw: true,
  basePrice: 200,
  carry: 4,
  spoilsDays: 2,
};

/** From the dairy on Farmland: raw in the Ledger's sense (land gives it), and it keeps. */
export const cheese: GoodDef = {
  id: 'cheese',
  name: 'Cheese',
  label: 'cheese',
  family: 'food',
  raw: true,
  basePrice: 500,
  carry: 4,
};

/** Made by a baker from grain (2 grain to 3 bread), in a windmill's reach. */
export const bread: GoodDef = {
  id: 'bread',
  name: 'Bread',
  label: 'bread',
  family: 'food',
  raw: false,
  basePrice: 200,
  carry: 4,
  spoilsDays: 3,
};

// --- Fuel ---------------------------------------------------------------------------------------

/** From the Forester's Lodge; warmth in winter and the Brickworks' kiln. */
export const firewood: GoodDef = {
  id: 'firewood',
  name: 'Firewood',
  label: 'firewood',
  family: 'fuel',
  raw: true,
  basePrice: 100,
  carry: 4,
};

// --- Materials ----------------------------------------------------------------------------------

/** From the Forester's Lodge: what logs and planks were. */
export const timber: GoodDef = {
  id: 'timber',
  name: 'Timber',
  label: 'timber',
  family: 'materials',
  raw: true,
  basePrice: 300,
  carry: 4,
};

export const stone: GoodDef = {
  id: 'stone',
  name: 'Stone',
  label: 'stone',
  family: 'materials',
  raw: true,
  basePrice: 200,
  carry: 4,
};

/** Fired at the Brickworks from its own clay with firewood (1 firewood to 6 brick). */
export const brick: GoodDef = {
  id: 'brick',
  name: 'Brick',
  label: 'brick',
  family: 'materials',
  raw: false,
  basePrice: 400,
  carry: 4,
};

// --- Wares --------------------------------------------------------------------------------------

/** From the sheep run; only ever an input (the weaver's), so it is a Wares raw good on no shelf. */
export const wool: GoodDef = {
  id: 'wool',
  name: 'Wool',
  label: 'wool',
  family: 'wares',
  raw: true,
  basePrice: 200,
  carry: 4,
};

export const cloth: GoodDef = {
  id: 'cloth',
  name: 'Cloth',
  label: 'cloth',
  family: 'wares',
  raw: false,
  basePrice: 600,
  carry: 4,
};

export const furniture: GoodDef = {
  id: 'furniture',
  name: 'Furniture',
  label: 'furniture',
  family: 'wares',
  raw: false,
  basePrice: 1500,
  carry: 1,
};

/** Beeswax, from honey (1 honey to 3 candles); from R3 they light windows and lanterns. */
export const candles: GoodDef = {
  id: 'candles',
  name: 'Candles',
  label: 'candles',
  family: 'wares',
  raw: false,
  basePrice: 200,
  carry: 6,
};

// --- Treats -------------------------------------------------------------------------------------

/** From hives on Farmland or the Hearth's Apiary; the chandler's raw good too. */
export const honey: GoodDef = {
  id: 'honey',
  name: 'Honey',
  label: 'honey',
  family: 'treats',
  raw: true,
  basePrice: 300,
  carry: 4,
  // The bees rest in winter.
  seasons: [800, 1000, 600, 0],
};

/** Pressed from fruit (1 fruit to 2 cider). */
export const cider: GoodDef = {
  id: 'cider',
  name: 'Cider',
  label: 'cider',
  family: 'treats',
  raw: false,
  basePrice: 400,
  carry: 4,
};

// --- R3.0: the masters' goods (docs/spec/19-evenings.md, Masters), appended after cider ------------

/** A master baker's, from grain; sold by the slice of an evening. */
export const pies: GoodDef = {
  id: 'pies',
  name: 'Pies',
  label: 'pies',
  family: 'treats',
  raw: false,
  basePrice: 400,
  carry: 4,
  spoilsDays: 3,
};

/** The dairy's land gives it like cheese, once a master cheesemaker is on the crew. */
export const butter: GoodDef = {
  id: 'butter',
  name: 'Butter',
  label: 'butter',
  family: 'food',
  raw: true,
  basePrice: 400,
  carry: 4,
  spoilsDays: 4,
};

/** A master orchardist's, from fruit at the orchard. */
export const jam: GoodDef = {
  id: 'jam',
  name: 'Jam',
  label: 'jam',
  family: 'treats',
  raw: false,
  basePrice: 400,
  carry: 4,
};

/** A master cider maker's, from fruit at the cider maker's. */
export const cordial: GoodDef = {
  id: 'cordial',
  name: 'Cordial',
  label: 'cordial',
  family: 'treats',
  raw: false,
  basePrice: 400,
  carry: 4,
};

/** A master beekeeper's, from honey at the hives. */
export const mead: GoodDef = {
  id: 'mead',
  name: 'Mead',
  label: 'mead',
  family: 'treats',
  raw: false,
  basePrice: 600,
  carry: 4,
};

/** A master weaver's, from wool at the weaver's. */
export const coats: GoodDef = {
  id: 'coats',
  name: 'Coats',
  label: 'coats',
  family: 'wares',
  raw: false,
  basePrice: 1200,
  carry: 2,
};

/** A master carpenter's, from timber at the carpenter's. */
export const toys: GoodDef = {
  id: 'toys',
  name: 'Toys',
  label: 'toys',
  family: 'wares',
  raw: false,
  basePrice: 800,
  carry: 4,
};

/** A master chandler's, from honey at the chandler's. */
export const soap: GoodDef = {
  id: 'soap',
  name: 'Soap',
  label: 'soap',
  family: 'wares',
  raw: false,
  basePrice: 300,
  carry: 6,
};

/** A master fisher's, from fish at the Fishery; it keeps. */
export const smokedFish: GoodDef = {
  id: 'smoked-fish',
  name: 'Smoked fish',
  label: 'smoked fish',
  family: 'food',
  raw: false,
  basePrice: 400,
  carry: 4,
};
