import type { BuildingDef } from './types';

// I3 building stubs (C5.0): ids, names, footprints and lanes so every I3 track agrees on them.
// `modes: []` keeps each out of the build picker until its owner writes the numbers and the art
// (then drop `modes`). Owners: the new trades and the River Dock C5B, the apiary C5C, the bath
// house C5A, defenses and the Watch House C5D. Stand-in kits until C5E draws them.

const HIDDEN = { modes: [] as BuildingDef['modes'] };

export const apiary: BuildingDef = {
  id: 'apiary',
  name: 'Apiary',
  lane: 'hearth',
  category: 'production',
  size: [2, 2],
  entrance: [0, 1],
  art: { kit: 'shed', params: { kit: 'apiary' } },
  tags: ['hive', 'farm'],
  requires: { rank: 'village' },
  ...HIDDEN,
};

export const bathHouse: BuildingDef = {
  id: 'bath-house',
  name: 'Bath House',
  lane: 'shared',
  category: 'service',
  size: [3, 2],
  entrance: [1, 1],
  art: { kit: 'house', params: { kit: 'bath-house' } },
  tags: ['bath-house', 'warm'],
  requires: { rank: 'village' },
  ...HIDDEN,
};

export const bellTower: BuildingDef = {
  id: 'bell-tower',
  name: 'Bell Tower',
  lane: 'shared',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  art: { kit: 'shed', params: { kit: 'bell-tower' } },
  tags: ['bell'],
  requires: { rank: 'village' },
  defense: {},
  ...HIDDEN,
};

export const carpenter: BuildingDef = {
  id: 'carpenter',
  name: 'Carpenter',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [0, 1],
  art: { kit: 'workshop', params: { kit: 'carpenter' } },
  tags: ['workshop'],
  requires: { rank: 'village' },
  ...HIDDEN,
};

export const chandler: BuildingDef = {
  id: 'chandler',
  name: 'Chandler',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [0, 1],
  art: { kit: 'workshop', params: { kit: 'chandler' } },
  tags: ['workshop'],
  requires: { rank: 'village' },
  ...HIDDEN,
};

export const gate: BuildingDef = {
  id: 'gate',
  name: 'Gate',
  lane: 'shared',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  art: { kit: 'shed', params: { kit: 'gate' } },
  tags: ['gate', 'wall'],
  requires: { rank: 'village' },
  defense: { passable: 'gate' },
  ...HIDDEN,
};

export const netTrap: BuildingDef = {
  id: 'net-trap',
  name: 'Net Trap',
  lane: 'ledger',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  art: { kit: 'shed', params: { kit: 'net-trap' } },
  tags: ['trap'],
  requires: { rank: 'village' },
  defense: { trap: 'net' },
  ...HIDDEN,
};

export const palisade: BuildingDef = {
  id: 'palisade',
  name: 'Palisade',
  lane: 'ledger',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  art: { kit: 'shed', params: { kit: 'palisade' } },
  tags: ['wall'],
  requires: { rank: 'village' },
  defense: { hp: 100, blocks: true },
  ...HIDDEN,
};

export const pieShop: BuildingDef = {
  id: 'pie-shop',
  name: 'Pie Shop',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [0, 1],
  art: { kit: 'bakery', params: { kit: 'pie-shop' } },
  tags: ['workshop', 'bakery'],
  requires: { rank: 'village' },
  ...HIDDEN,
};

export const pitTrap: BuildingDef = {
  id: 'pit-trap',
  name: 'Pit Trap',
  lane: 'ledger',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  art: { kit: 'shed', params: { kit: 'pit-trap' } },
  tags: ['trap'],
  requires: { rank: 'village' },
  defense: { trap: 'pit' },
  ...HIDDEN,
};

export const riverDock: BuildingDef = {
  id: 'river-dock',
  name: 'River Dock',
  lane: 'ledger',
  category: 'service',
  size: [2, 2],
  entrance: [0, 1],
  placement: [{ kind: 'waterEdge' }],
  art: { kit: 'fishers-hut', params: { kit: 'river-dock' } },
  tags: ['dock'],
  requires: { rank: 'village' },
  ...HIDDEN,
};

export const stoneWall: BuildingDef = {
  id: 'stone-wall',
  name: 'Stone Wall',
  lane: 'ledger',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  art: { kit: 'shed', params: { kit: 'stone-wall' } },
  tags: ['wall'],
  requires: { rank: 'town' },
  defense: { hp: 400, blocks: true },
  moduleSlots: [['wall', 1]],
  ...HIDDEN,
};

export const tailor: BuildingDef = {
  id: 'tailor',
  name: 'Tailor',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [0, 1],
  art: { kit: 'workshop', params: { kit: 'tailor' } },
  tags: ['workshop'],
  requires: { rank: 'village' },
  ...HIDDEN,
};

export const watchHouse: BuildingDef = {
  id: 'watch-house',
  name: 'Watch House',
  lane: 'ledger',
  category: 'defense',
  size: [2, 2],
  entrance: [0, 1],
  art: { kit: 'house', params: { kit: 'watch-house' } },
  tags: ['watch-house'],
  requires: { rank: 'village' },
  defense: {},
  ...HIDDEN,
};

export const watchtower: BuildingDef = {
  id: 'watchtower',
  name: 'Watchtower',
  lane: 'ledger',
  category: 'defense',
  size: [1, 1],
  entrance: [0, 0],
  art: { kit: 'shed', params: { kit: 'watchtower' } },
  tags: ['tower'],
  requires: { rank: 'village' },
  defense: { towerRange: 6, warningDays: 1 },
  ...HIDDEN,
};
