import type { GoodDef } from './types';

// I3 goods (docs/spec/13-ledger.md, Goods), added in C5.0 so every I3 track agrees on their indexes:
// the registry in index.ts appends them after the I2 goods, in this order, forever. Base prices in
// pennies are first guesses; C5B tunes the trades (tailor, carpenter, pie shop, chandler) and C5C
// the apiary.

export const coats: GoodDef = {
  id: 'coats',
  name: 'Coats',
  label: 'coats',
  category: 'crafted',
  basePrice: 900,
  carry: 2,
};

export const furniture: GoodDef = {
  id: 'furniture',
  name: 'Furniture',
  label: 'furniture',
  category: 'crafted',
  basePrice: 1200,
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
};

export const candles: GoodDef = {
  id: 'candles',
  name: 'Candles',
  label: 'candles',
  category: 'crafted',
  basePrice: 200,
  carry: 6,
};
