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
