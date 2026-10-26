import type { RoadDef } from './types';

export const lane: RoadDef = {
  id: 'lane',
  name: 'Lane',
  lane: 'ledger',
  layerValue: 2,
  cost: { coins: 2 },
  carts: true,
  capacity: 30,
};

export const path: RoadDef = {
  id: 'path',
  name: 'Path',
  lane: 'hearth',
  layerValue: 1,
  cost: { coins: 1 },
};

/** I2 (C4.0): cobbled streets for carts, once the Cobbles innovation is in (C4B gates painting). */
export const street: RoadDef = {
  id: 'street',
  name: 'Street',
  lane: 'ledger',
  layerValue: 3,
  cost: { coins: 4, goods: [['stone', 1]] },
  carts: true,
  capacity: 80,
  requires: { innovation: 'cobbles' },
};
