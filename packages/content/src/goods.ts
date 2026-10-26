import type { GoodDef } from './types';

// I1 goods (docs/spec/13-ledger.md). Base prices in pennies. The registry in index.ts is
// APPEND-ONLY, not alphabetical: a good's position there is its index in every per-good array
// in saved state.

export const bread: GoodDef = {
  id: 'bread',
  name: 'Bread',
  label: 'bread',
  category: 'food',
  basePrice: 200,
  carry: 4,
  food: true,
  spoilsDays: 3,
};

export const fish: GoodDef = {
  id: 'fish',
  name: 'Fish',
  label: 'fish',
  category: 'food',
  basePrice: 200,
  carry: 4,
  food: true,
  spoilsDays: 2,
};

export const flour: GoodDef = {
  id: 'flour',
  name: 'Flour',
  label: 'flour',
  category: 'processed',
  basePrice: 200,
  carry: 4,
};

export const logs: GoodDef = {
  id: 'logs',
  name: 'Logs',
  label: 'logs',
  category: 'material',
  basePrice: 100,
  carry: 4,
};

export const planks: GoodDef = {
  id: 'planks',
  name: 'Planks',
  label: 'planks',
  category: 'material',
  basePrice: 300,
  carry: 4,
};

export const stone: GoodDef = {
  id: 'stone',
  name: 'Stone',
  label: 'stone',
  category: 'material',
  basePrice: 200,
  carry: 4,
};

export const vegetables: GoodDef = {
  id: 'vegetables',
  name: 'Vegetables',
  label: 'veg',
  category: 'food',
  basePrice: 100,
  carry: 4,
  food: true,
};

export const wheat: GoodDef = {
  id: 'wheat',
  name: 'Wheat',
  label: 'wheat',
  category: 'rawFood',
  basePrice: 100,
  carry: 4,
};
