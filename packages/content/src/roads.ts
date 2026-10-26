import type { RoadDef } from './types';

export const lane: RoadDef = {
  id: 'lane',
  name: 'Lane',
  lane: 'ledger',
  layerValue: 2,
  cost: { coins: 2 },
};

export const path: RoadDef = {
  id: 'path',
  name: 'Path',
  lane: 'hearth',
  layerValue: 1,
  cost: { coins: 1 },
};
