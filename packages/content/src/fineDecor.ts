import type { DecorDef } from './types';

// Playtest round seven: pricier, prettier decor for beside a workplace. R1 removed the yield
// registry's `decor` line (an unlock is never "+5%", P6), so these five stay as decor with their
// charm and cost, refunded in full when removed. All are open from the start.

export const flowerTrellis: DecorDef = {
  id: 'flower-trellis',
  name: 'Flower trellis',
  lane: 'hearth',
  radius: 40,
  onRoad: true,
  tags: ['flower', 'trellis'],
  art: { kit: 'flower-trellis' },
  charm: [{ category: 'nature', value: 3, radius: 2 }],
  cost: {
    coins: 10,
    goods: [['timber', 4]],
  },
};

export const paintedShopSign: DecorDef = {
  id: 'painted-shop-sign',
  name: 'Painted shop sign',
  lane: 'ledger',
  radius: 32,
  onRoad: true,
  tags: ['sign', 'shop-sign'],
  art: { kit: 'shop-sign' },
  charm: [{ category: 'comfort', value: 2, radius: 1 }],
  cost: {
    coins: 14,
    goods: [['timber', 4]],
  },
};

export const rainBarrel: DecorDef = {
  id: 'rain-barrel',
  name: 'Rain barrel',
  lane: 'ledger',
  radius: 40,
  onRoad: true,
  blocksWalking: true,
  tags: ['barrel', 'rain'],
  art: { kit: 'rain-barrel' },
  charm: [{ category: 'comfort', value: 1, radius: 1 }],
  cost: {
    coins: 8,
    goods: [['timber', 4]],
  },
};

export const toolRack: DecorDef = {
  id: 'tool-rack',
  name: 'Tool rack',
  lane: 'ledger',
  radius: 40,
  onRoad: true,
  tags: ['rack', 'garden-tools'],
  art: { kit: 'tool-rack' },
  charm: [{ category: 'comfort', value: 1, radius: 1 }],
  cost: {
    coins: 12,
    goods: [
      ['timber', 6],
      ['stone', 2],
    ],
  },
};

export const weathervane: DecorDef = {
  id: 'weathervane',
  name: 'Brass weathervane',
  lane: 'ledger',
  radius: 32,
  onRoad: true,
  tags: ['weathervane', 'brass'],
  art: { kit: 'weathervane' },
  charm: [{ category: 'view', value: 2, radius: 2 }],
  cost: {
    coins: 18,
    goods: [['stone', 2]],
  },
};
