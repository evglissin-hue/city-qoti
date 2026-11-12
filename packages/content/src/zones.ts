import type { ZoneDef } from './types';

// Zones the Ledger paints (docs/spec/13-ledger.md, Zoning and growth). `layerValue` is what the
// `zone` map layer stores; it never changes once shipped. Lot sizes are (width along the road,
// depth away from it); C4B tunes them.

export const crafts: ZoneDef = {
  id: 'crafts',
  name: 'Workshops',
  layerValue: 4,
  density: 'low',
  blurb: 'Small workshops that take up whatever trade the town is short of.',
  // R1: every trade grows on the 3x3 workshop, so Workshops land is cut only into lots it fits.
  lots: [{ size: [3, 3], weight: 1 }],
  token: 'ochre',
};

export const farms: ZoneDef = {
  id: 'farms',
  name: 'Farmland',
  layerValue: 5,
  density: 'low',
  blurb: 'Farmsteads with fields, pastures, orchards or hives, wherever the soil is kind.',
  lots: [{ size: [3, 3], weight: 1 }],
  token: 'moss',
};

export const homesLow: ZoneDef = {
  id: 'homes-low',
  name: 'Homes',
  layerValue: 1,
  density: 'low',
  blurb: 'Cottages with gardens, for families who like a bit of elbow room.',
  // C4B: deep plots first (a back garden) where the zone allows, a wide one now and then.
  lots: [
    { size: [2, 3], weight: 3 },
    { size: [3, 3], weight: 1 },
    { size: [2, 2], weight: 2 },
    { size: [3, 2], weight: 1 },
  ],
  token: 'rose',
};

export const homesMedium: ZoneDef = {
  id: 'homes-medium',
  name: 'Townhouses',
  layerValue: 2,
  density: 'medium',
  blurb: 'Narrow houses shoulder to shoulder, for a busier street.',
  lots: [
    { size: [2, 3], weight: 2 },
    { size: [2, 2], weight: 1 },
  ],
  token: 'plum',
  requires: { rank: 'village' },
};

export const shops: ZoneDef = {
  id: 'shops',
  name: 'Shops',
  layerValue: 3,
  density: 'medium',
  blurb: 'Ground floor shops with flats above, where the foot traffic is.',
  lots: [
    { size: [2, 3], weight: 2 },
    { size: [3, 3], weight: 1 },
  ],
  token: 'teal',
  requires: { rank: 'village' },
};
