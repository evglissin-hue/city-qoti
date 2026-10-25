import type { BuildingDef } from './types';

// I0 buildings. Sandbox valleys have no costs; numbers arrive with the economy in I1.

export const cottage: BuildingDef = {
  id: 'cottage',
  name: 'Cottage',
  lane: 'hearth',
  category: 'home',
  size: [2, 2],
  entrance: [1, 1],
  art: { kit: 'cottage' },
};

export const house: BuildingDef = {
  id: 'house',
  name: 'House',
  lane: 'hearth',
  category: 'home',
  size: [2, 3],
  entrance: [1, 2],
  art: { kit: 'house' },
};

export const shed: BuildingDef = {
  id: 'shed',
  name: 'Shed',
  lane: 'ledger',
  category: 'storage',
  size: [1, 2],
  entrance: [0, 1],
  art: { kit: 'shed' },
};

export const townHall: BuildingDef = {
  id: 'town-hall',
  name: 'Town hall',
  lane: 'shared',
  category: 'civic',
  size: [4, 4],
  entrance: [2, 3],
  art: { kit: 'town-hall' },
};

export const well: BuildingDef = {
  id: 'well',
  name: 'Well',
  lane: 'shared',
  category: 'service',
  size: [1, 1],
  entrance: [0, 0],
  art: { kit: 'well' },
};

/** Decorative in I0; it starts grinding grain when production arrives. */
export const windmill: BuildingDef = {
  id: 'windmill',
  name: 'Windmill',
  lane: 'ledger',
  category: 'production',
  size: [2, 2],
  entrance: [1, 1],
  art: { kit: 'windmill' },
};
