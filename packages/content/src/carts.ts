import type { CartDef } from './types';

// Carts (docs/spec/13-ledger.md, Streets and traffic): 16 units, lanes at 4 ticks per tile, streets
// at 3. C4C runs them from the cart shed; C4B moves them and counts traffic.

export const cart: CartDef = {
  id: 'cart',
  name: 'Cart',
  capacity: 16,
  ticksPerTile: [
    ['lane', 4],
    ['street', 3],
  ],
  art: { kit: 'cart' },
};
