import type { DecorDef } from './types';

// I2 decor (C4C): the pieces the six Village patterns unlock. Each names an existing decor kit as a
// stand-in and the kit C4E should draw in `params.kit`.

export const cafeTable: DecorDef = {
  id: 'cafe-table',
  name: 'Cafe table',
  lane: 'hearth',
  radius: 56,
  onRoad: true,
  tags: ['seat', 'cafe'],
  art: { kit: 'bench', params: { kit: 'cafe-table', chairs: 2, cloth: true } },
  charm: [{ category: 'comfort', value: 4, radius: 2 }],
  locked: true,
};

export const flowerCart: DecorDef = {
  id: 'flower-cart',
  name: 'Flower cart',
  lane: 'hearth',
  radius: 64,
  onRoad: true,
  blocksWalking: true,
  tags: ['flower', 'cart'],
  art: { kit: 'planter', params: { kit: 'flower-cart', wheels: true } },
  charm: [{ category: 'nature', value: 5, radius: 2 }],
  locked: true,
};

export const fountain: DecorDef = {
  id: 'fountain',
  name: 'Fountain',
  lane: 'hearth',
  radius: 96,
  onRoad: true,
  blocksWalking: true,
  tags: ['fountain', 'water-feature'],
  art: { kit: 'birdbath', params: { kit: 'fountain', tiers: 2 } },
  charm: [{ category: 'comfort', value: 8, radius: 3 }],
  locked: true,
};

export const lampPost: DecorDef = {
  id: 'lamp-post',
  name: 'Lamp post',
  lane: 'hearth',
  radius: 32,
  onRoad: true,
  tags: ['lantern', 'light'],
  art: { kit: 'lantern', params: { kit: 'lamp-post', arms: 2 } },
  charm: [{ category: 'light', value: 3, radius: 3, nightValue: 8 }],
  locked: true,
};

export const maypole: DecorDef = {
  id: 'maypole',
  name: 'Maypole',
  lane: 'hearth',
  radius: 48,
  blocksWalking: true,
  tags: ['maypole', 'landmark'],
  art: { kit: 'signpost', params: { kit: 'maypole', ribbons: 6 } },
  charm: [{ category: 'comfort', value: 7, radius: 3 }],
  locked: true,
};

export const noticeBoard: DecorDef = {
  id: 'notice-board',
  name: 'Notice board',
  lane: 'shared',
  radius: 40,
  onRoad: true,
  tags: ['sign', 'notice'],
  art: { kit: 'signpost', params: { kit: 'notice-board', roof: true } },
  charm: [{ category: 'comfort', value: 3, radius: 2 }],
  locked: true,
};
