import type { DecorDef } from './types';

// Playtest round seven: pricier, prettier decor that helps the workplace beside it. `boost` is
// read by systems/production/decorBoost: buildings within `radius` tiles whose id or tag is listed
// work faster by `permille`, up to +150 for any one building. Nothing here names a woodcutter or a
// forester: felling and planting are never modified. All are open from the start.

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
    goods: [['planks', 4]],
  },
  boost: { radius: 2, permille: 60, tags: ['orchard', 'apiary', 'herb-garden'] },
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
    goods: [['planks', 4]],
  },
  boost: {
    radius: 1,
    permille: 60,
    tags: ['bakery', 'cheesemaker', 'cider-press', 'spinner', 'weaver', 'workshop'],
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
    goods: [['planks', 4]],
  },
  boost: { radius: 2, permille: 50, tags: ['vegetable-plot', 'farmhouse'] },
};

export const toolRack: DecorDef = {
  id: 'tool-rack',
  name: 'Tool rack',
  lane: 'ledger',
  radius: 40,
  onRoad: true,
  tags: ['tools', 'rack'],
  art: { kit: 'tool-rack' },
  charm: [{ category: 'comfort', value: 1, radius: 1 }],
  cost: {
    coins: 12,
    goods: [
      ['planks', 6],
      ['stone', 2],
    ],
  },
  boost: { radius: 2, permille: 60, tags: ['sawpit', 'quarry', 'smithy', 'chopping-shed'] },
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
  boost: { radius: 1, permille: 100, tags: ['windmill', 'sawmill'] },
};
