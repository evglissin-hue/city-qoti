import type { DecorDef } from './types';

// I0 decor. Radii are in sub-tile fixed point (1 tile = 256).

export const appleTree: DecorDef = {
  id: 'apple-tree',
  name: 'Apple tree',
  lane: 'hearth',
  radius: 96,
  blocksWalking: true,
  tags: ['tree', 'fruit'],
  art: { kit: 'apple-tree' },
};

export const barrels: DecorDef = {
  id: 'barrels',
  name: 'Barrels',
  lane: 'ledger',
  radius: 40,
  onRoad: true,
  blocksWalking: true,
  tags: ['barrels', 'storage'],
  art: { kit: 'barrels' },
};

export const bench: DecorDef = {
  id: 'bench',
  name: 'Bench',
  lane: 'hearth',
  radius: 48,
  onRoad: true,
  tags: ['bench', 'seat'],
  art: { kit: 'bench' },
};

export const cherryTree: DecorDef = {
  id: 'cherry-tree',
  name: 'Cherry tree',
  lane: 'hearth',
  radius: 96,
  blocksWalking: true,
  tags: ['tree', 'blossom'],
  art: { kit: 'cherry-tree' },
};

export const crates: DecorDef = {
  id: 'crates',
  name: 'Crates',
  lane: 'ledger',
  radius: 40,
  onRoad: true,
  blocksWalking: true,
  tags: ['crates', 'storage'],
  art: { kit: 'crates' },
};

export const fence: DecorDef = {
  id: 'fence',
  name: 'Fence',
  lane: 'hearth',
  radius: 24,
  linear: true,
  blocksWalking: true,
  tags: ['fence'],
  art: { kit: 'fence' },
};

export const flowerBed: DecorDef = {
  id: 'flower-bed',
  name: 'Flower bed',
  lane: 'hearth',
  radius: 64,
  tags: ['flower'],
  art: { kit: 'flower-bed' },
};

export const hedge: DecorDef = {
  id: 'hedge',
  name: 'Hedge',
  lane: 'hearth',
  radius: 32,
  linear: true,
  blocksWalking: true,
  tags: ['hedge'],
  art: { kit: 'hedge' },
};

export const lantern: DecorDef = {
  id: 'lantern',
  name: 'Lantern',
  lane: 'hearth',
  radius: 24,
  onRoad: true,
  tags: ['lantern', 'light'],
  art: { kit: 'lantern' },
};

export const lowWall: DecorDef = {
  id: 'low-wall',
  name: 'Low wall',
  lane: 'ledger',
  radius: 32,
  linear: true,
  blocksWalking: true,
  tags: ['wall'],
  art: { kit: 'low-wall' },
};

export const planter: DecorDef = {
  id: 'planter',
  name: 'Planter',
  lane: 'hearth',
  radius: 40,
  onRoad: true,
  tags: ['flower', 'planter'],
  art: { kit: 'planter' },
};

export const signpost: DecorDef = {
  id: 'signpost',
  name: 'Signpost',
  lane: 'shared',
  radius: 24,
  onRoad: true,
  tags: ['sign'],
  art: { kit: 'signpost' },
};
