import type { InnovationDef } from './types';

// The I2 innovations (docs/spec/15-progression.md, Innovations). Conditions use named code
// predicates and measures implemented in packages/sim/src/systems/innovations/measures.ts (C4C).
// `storyStep` names its arc by id in `ref` (C5.0: the story list is append-only, but ids never move).

export const brickKiln: InnovationDef = {
  id: 'brick-kiln',
  name: 'Brick Kiln',
  blurb: 'Fire the clay hot enough and it comes out as brick. Townhouses will thank you.',
  // R1: a quarry worked for two days opens the Brickworks (docs/spec/15-progression.md, R1 note).
  condition: { code: 'quarryWorked', params: [['days', 2]] },
  measure: 'quarryDays',
  unlocks: ['brickworks'],
  rank: 'hamlet',
};

export const carts: InnovationDef = {
  id: 'carts',
  name: 'Carts',
  blurb: 'Four wheels and a patient pony carry sixteen loads where a porter carries four.',
  condition: {
    all: [
      { code: 'rankAtLeast', params: [['rank', 1]] },
      { code: 'timberRate', params: [['perDay', 20]] },
    ],
  },
  measure: 'timberRate',
  unlocks: ['cart-shed'],
  rank: 'village',
};

export const cobbles: InnovationDef = {
  id: 'cobbles',
  name: 'Cobbles',
  blurb: 'Enough cut stone to pave a street that carts can rattle down all day.',
  condition: { code: 'stoneRate', params: [['perDay', 20]] },
  measure: 'stoneRate',
  unlocks: ['street'],
  rank: 'hamlet',
};

export const waterWheel: InnovationDef = {
  id: 'water-wheel',
  name: 'Water Wheel',
  blurb: 'Let the river turn the saw, and carpenters will come to work beside it.',
  // R1: a Forester's Lodge within 12 tiles of the river that has worked three days, or Pippa
  // Quill's second step at once; no innovation that opens a building waits on a story alone.
  condition: {
    any: [
      {
        code: 'lodgeByRiver',
        params: [
          ['within', 12],
          ['days', 3],
        ],
      },
      { code: 'storyStep', ref: 'inventor', params: [['step', 2]] },
    ],
  },
  measure: 'waterWheel',
  unlocks: ['sawmill'],
  rank: 'hamlet',
};

export const wheelbarrows: InnovationDef = {
  id: 'wheelbarrows',
  name: 'Wheelbarrows',
  blurb: 'A wheel, two handles, and suddenly every porter carries eight.',
  condition: {
    code: 'portersBusy',
    params: [
      ['percent', 80],
      ['days', 3],
    ],
  },
  measure: 'portersBusyDays',
  unlocks: ['porter-carry-8'],
  // C4C: from Village rank, so a Hamlet's porters (always busy early on) play as in I1.
  rank: 'village',
};

// --- I3 (C5.0). The Barometer and the Seed Drill have real conditions (C5A, R1B); both are in the
// Village notebook.

// C5A: a Watch House and a bell tower (the spec's "Town Hall upgrade", as the wave notes read it).
export const barometer: InnovationDef = {
  id: 'barometer',
  name: 'Barometer',
  blurb: 'A glass that knows the weather two days before the weather does.',
  condition: {
    all: [
      { count: { what: 'buildings', ref: 'watch-house', atLeast: 1 } },
      { count: { what: 'buildings', ref: 'bell-tower', atLeast: 1 } },
    ],
  },
  unlocks: ['forecast-days-2'],
  rank: 'village',
};

export const seedDrill: InnovationDef = {
  id: 'seed-drill',
  name: 'Seed Drill',
  blurb: 'Seeds in straight rows, at the right depth: a field cut in summer is sown again the same day.',
  // R1: three grain farms and a windmill; it lets a cut field be sown again the same day inside the
  // sowing window (R1B), in place of the old "+20% wheat" (an unlock is never a percentage, P6).
  condition: {
    all: [
      { count: { what: 'buildings', ref: 'grain-farm', atLeast: 3 } },
      { count: { what: 'buildings', ref: 'windmill', atLeast: 1 } },
    ],
  },
  unlocks: ['resow-same-day'],
  rank: 'village',
};
