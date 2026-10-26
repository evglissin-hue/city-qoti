import type { DistrictStyleDef } from './types';

// District styles (docs/spec/12-hearth.md, District styles): the four starter styles. The growth
// pass (C4B) picks one per lot from `suits`; C4E draws the walls, roofs and details. Ids are what
// Building.style and Lot.style store, so they never change once shipped.

export const brick: DistrictStyleDef = {
  id: 'brick',
  name: 'Market Brick',
  blurb: 'Warm red brick, painted signs and tall chimneys, for streets that mean business.',
  suits: { street: true, zones: ['homes-medium', 'shops'] },
};

export const plaster: DistrictStyleDef = {
  id: 'plaster',
  name: 'Garden Plaster',
  blurb: 'Soft limewash in butter and rose, with window boxes that never quite stay tidy.',
  suits: { nature: true, zones: ['homes-low'] },
};

export const stone: DistrictStyleDef = {
  id: 'stone',
  name: 'Hill Stone',
  blurb: 'Rough grey stone under slate, built to shrug off whatever the hill throws at it.',
  suits: { high: true, zones: ['crafts'] },
};

export const timber: DistrictStyleDef = {
  id: 'timber',
  name: 'Riverside Timber',
  blurb: 'Dark beams, pale infill and mossy thatch, leaning comfortably toward the water.',
  suits: { water: true, zones: ['farms'] },
};
