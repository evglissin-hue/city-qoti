import type { GoodDef } from './types';

// I2 goods (docs/spec/13-ledger.md, Goods), added in C4.0 so every I2 track agrees on their
// indexes: the registry in index.ts appends them after the I1 goods, in this order, forever.
// Base prices in pennies; C4C tunes the chains around them, C4A the market. C4C: yarn 4 coins
// (spec 3), so spinning pays its way between the pasture and the loom.

export const apples: GoodDef = {
  id: 'apples',
  name: 'Apples',
  label: 'apples',
  category: 'food',
  basePrice: 100,
  carry: 4,
  food: true,
  // I3 (C5A): blossom in spring, the crop in summer and autumn, bare boughs in winter.
  seasons: [400, 1000, 2600, 0],
};

export const bricks: GoodDef = {
  id: 'bricks',
  name: 'Bricks',
  label: 'bricks',
  category: 'material',
  basePrice: 400,
  carry: 4,
};

export const cheese: GoodDef = {
  id: 'cheese',
  name: 'Cheese',
  label: 'cheese',
  category: 'food',
  basePrice: 500,
  carry: 4,
  food: true,
};

export const cider: GoodDef = {
  id: 'cider',
  name: 'Cider',
  label: 'cider',
  category: 'treat',
  basePrice: 400,
  carry: 4,
};

export const clay: GoodDef = {
  id: 'clay',
  name: 'Clay',
  label: 'clay',
  category: 'material',
  basePrice: 100,
  carry: 4,
};

export const cloth: GoodDef = {
  id: 'cloth',
  name: 'Cloth',
  label: 'cloth',
  category: 'crafted',
  basePrice: 600,
  carry: 4,
};

export const firewood: GoodDef = {
  id: 'firewood',
  name: 'Firewood',
  label: 'firewood',
  category: 'fuel',
  basePrice: 100,
  carry: 4,
};

export const herbs: GoodDef = {
  id: 'herbs',
  name: 'Herbs',
  label: 'herbs',
  category: 'material',
  basePrice: 100,
  carry: 4,
  // I3 (C5A): picked spring to autumn; a little under glass in winter.
  seasons: [1000, 1400, 1400, 200],
};

export const milk: GoodDef = {
  id: 'milk',
  name: 'Milk',
  label: 'milk',
  category: 'food',
  basePrice: 100,
  carry: 4,
  food: true,
  spoilsDays: 2,
};

export const tools: GoodDef = {
  id: 'tools',
  name: 'Tools',
  label: 'tools',
  category: 'crafted',
  basePrice: 800,
  carry: 4,
};

export const wool: GoodDef = {
  id: 'wool',
  name: 'Wool',
  label: 'wool',
  category: 'material',
  basePrice: 200,
  carry: 4,
};

export const yarn: GoodDef = {
  id: 'yarn',
  name: 'Yarn',
  label: 'yarn',
  category: 'crafted',
  basePrice: 400,
  carry: 4,
};
