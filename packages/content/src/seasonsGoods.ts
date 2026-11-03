import type { GoodDef } from './types';

// I3 goods (docs/spec/13-ledger.md, Goods), added in C5.0 so every I3 track agrees on their indexes:
// the registry in index.ts appends them after the I2 goods, in this order, forever. Base prices in
// pennies: C5B set the trades' goods to the ledger spec (coats 12, furniture 15, pies 4 less a
// little so a pie stays a treat a Settler can afford, candles 2) and C5C the apiary.

export const coats: GoodDef = {
  id: 'coats',
  name: 'Coats',
  label: 'coats',
  category: 'crafted',
  basePrice: 1200,
  carry: 2,
};

export const furniture: GoodDef = {
  id: 'furniture',
  name: 'Furniture',
  label: 'furniture',
  category: 'crafted',
  basePrice: 1500,
  carry: 1,
};

export const pies: GoodDef = {
  id: 'pies',
  name: 'Pies',
  label: 'pies',
  category: 'treat',
  basePrice: 350,
  carry: 4,
  food: true,
  spoilsDays: 3,
};

export const honey: GoodDef = {
  id: 'honey',
  name: 'Honey',
  label: 'honey',
  category: 'food',
  basePrice: 300,
  carry: 4,
  food: true,
  // C5C: the bees rest in winter.
  seasons: [800, 1000, 600, 0],
};

export const candles: GoodDef = {
  id: 'candles',
  name: 'Candles',
  label: 'candles',
  category: 'crafted',
  basePrice: 200,
  carry: 6,
};
