import type { DecorDef } from './types';

// R3B decor: the two pieces masters bring (docs/spec/19-evenings.md, Masters). Each is locked and
// opens with the first master of its kind: the quarry's master carves the stone, the forester's
// master lays out the ornamental trees (MasterDef.unlocks). They borrow existing kits until R3F gives
// them their own look (`params.kit` names it).

export const carvedStone: DecorDef = {
  id: 'carved-stone',
  name: 'Carved stone',
  lane: 'hearth',
  radius: 48,
  blocksWalking: true,
  tags: ['stone', 'carved'],
  art: { kit: 'millstone-bench', params: { kit: 'carved-stone' } },
  charm: [{ category: 'comfort', value: 4, radius: 2 }],
  cost: {
    coins: 24,
    goods: [['stone', 6]],
  },
  locked: true,
};

export const ornamentalTree: DecorDef = {
  id: 'ornamental-tree',
  name: 'Ornamental tree',
  lane: 'hearth',
  radius: 96,
  blocksWalking: true,
  tags: ['tree', 'blossom'],
  art: { kit: 'cherry-tree', params: { kit: 'ornamental-tree' } },
  charm: [{ category: 'nature', value: 6, radius: 2 }],
  cost: {
    coins: 20,
    goods: [['timber', 2]],
  },
  locked: true,
};
