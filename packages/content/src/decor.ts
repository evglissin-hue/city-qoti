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
  charm: [{ category: 'nature', value: 5, radius: 2 }],
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
  charm: [{ category: 'comfort', value: 3, radius: 2 }],
};

export const cherryTree: DecorDef = {
  id: 'cherry-tree',
  name: 'Cherry tree',
  lane: 'hearth',
  radius: 96,
  blocksWalking: true,
  tags: ['tree', 'blossom'],
  art: { kit: 'cherry-tree' },
  charm: [{ category: 'nature', value: 5, radius: 2 }],
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
  charm: [{ category: 'nature', value: 4, radius: 2 }],
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
  charm: [{ category: 'nature', value: 2, radius: 1 }],
};

export const lantern: DecorDef = {
  id: 'lantern',
  name: 'Lantern',
  lane: 'hearth',
  radius: 24,
  onRoad: true,
  tags: ['lantern', 'light'],
  art: { kit: 'lantern' },
  charm: [{ category: 'light', value: 2, radius: 3, nightValue: 6 }],
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
  charm: [{ category: 'nature', value: 4, radius: 2 }],
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

// I1 decor (C3.0): pieces the Pattern Book unlocks. Placeholder art until C3D draws them.

export const birdbath: DecorDef = {
  id: 'birdbath',
  name: 'Birdbath',
  lane: 'hearth',
  radius: 48,
  blocksWalking: true,
  tags: ['birdbath', 'water-feature'],
  art: { kit: 'birdbath' },
  charm: [{ category: 'comfort', value: 6, radius: 3 }],
  locked: true,
};

export const curvedBench: DecorDef = {
  id: 'curved-bench',
  name: 'Curved bench',
  lane: 'hearth',
  radius: 72,
  onRoad: true,
  tags: ['bench', 'seat'],
  art: { kit: 'curved-bench' },
  charm: [{ category: 'comfort', value: 4, radius: 2 }],
  locked: true,
};

export const hangingLantern: DecorDef = {
  id: 'hanging-lantern',
  name: 'Hanging lantern',
  lane: 'hearth',
  radius: 32,
  onRoad: true,
  tags: ['lantern', 'light'],
  art: { kit: 'hanging-lantern' },
  charm: [{ category: 'light', value: 3, radius: 3, nightValue: 7 }],
  locked: true,
};

export const herbPlanter: DecorDef = {
  id: 'herb-planter',
  name: 'Herb planter',
  lane: 'hearth',
  radius: 48,
  tags: ['flower', 'planter', 'herb', 'garden'],
  art: { kit: 'herb-planter' },
  charm: [{ category: 'nature', value: 3, radius: 2 }],
  locked: true,
};

export const mooringPost: DecorDef = {
  id: 'mooring-post',
  name: 'Mooring post',
  lane: 'hearth',
  radius: 32,
  onWater: true,
  tags: ['mooring'],
  art: { kit: 'mooring-post' },
  charm: [{ category: 'view', value: 2, radius: 2 }],
  locked: true,
};

export const planterWall: DecorDef = {
  id: 'planter-wall',
  name: 'Planter wall',
  lane: 'hearth',
  radius: 64,
  linear: true,
  blocksWalking: true,
  tags: ['wall', 'flower', 'seat'],
  art: { kit: 'planter-wall' },
  charm: [{ category: 'nature', value: 3, radius: 2 }],
  locked: true,
};

export const ringBench: DecorDef = {
  id: 'ring-bench',
  name: 'Ring bench',
  lane: 'hearth',
  radius: 96,
  tags: ['bench', 'seat', 'ring-bench'],
  art: { kit: 'ring-bench' },
  charm: [{ category: 'comfort', value: 5, radius: 2 }],
  locked: true,
};

export const wildflowerVerge: DecorDef = {
  id: 'wildflower-verge',
  name: 'Wildflower verge',
  lane: 'hearth',
  radius: 64,
  linear: true,
  tags: ['flower', 'verge'],
  art: { kit: 'wildflower-verge' },
  charm: [{ category: 'nature', value: 4, radius: 2 }],
  locked: true,
};
