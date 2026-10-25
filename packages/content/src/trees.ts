import type { TreeDef } from './types';

// Forest trees live in the `tree` map layer. Ornamental trees are decor (see decor.ts).

export const birch: TreeDef = {
  id: 'birch',
  name: 'Birch',
  species: 2,
  deciduous: true,
  art: { kit: 'birch' },
};

export const oak: TreeDef = {
  id: 'oak',
  name: 'Oak',
  species: 1,
  deciduous: true,
  art: { kit: 'oak' },
};

export const pine: TreeDef = {
  id: 'pine',
  name: 'Pine',
  species: 3,
  deciduous: false,
  art: { kit: 'pine' },
};
