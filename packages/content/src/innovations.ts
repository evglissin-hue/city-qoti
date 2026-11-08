import type { InnovationDef } from './types';

// The I2 innovations (docs/spec/15-progression.md, Innovations). Conditions use named code
// predicates and measures implemented in packages/sim/src/systems/innovations/measures.ts (C4C).
// `storyStep` names its arc by id in `ref` (C5.0: the story list is append-only, but ids never move).

export const brickKiln: InnovationDef = {
  id: 'brick-kiln',
  name: 'Brick Kiln',
  blurb: 'Fire the clay hot enough and it comes out as bricks. Townhouses will thank you.',
  condition: { code: 'clayPitWorked', params: [['days', 2]] },
  measure: 'clayPitDays',
  unlocks: ['brick-kiln'],
  rank: 'hamlet',
};

export const carts: InnovationDef = {
  id: 'carts',
  name: 'Carts',
  blurb: 'Four wheels and a patient pony carry sixteen loads where a porter carries four.',
  condition: {
    all: [
      { code: 'rankAtLeast', params: [['rank', 1]] },
      { code: 'plankRate', params: [['perDay', 20]] },
    ],
  },
  measure: 'plankRate',
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
  blurb: 'Let the river turn the saw. Louder, and a great deal faster.',
  condition: {
    all: [
      { code: 'sawpitByRiver', params: [['within', 3]] },
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
  blurb: 'A wheel, two handles, and suddenly every porter carries six.',
  condition: {
    code: 'portersBusy',
    params: [
      ['percent', 80],
      ['days', 3],
    ],
  },
  measure: 'portersBusyDays',
  unlocks: ['porter-carry-6'],
  // C4C: from Village rank, so a Hamlet's porters (always busy early on) play as in I1.
  rank: 'village',
};

// --- I3 (C5.0). Stubs: conditions stay unreachable (rank 99) and `rank: 'town'` keeps them out of
// the Village notebook until their owners write them (Barometer C5A, Seed Drill C5A).

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

// C5A: three farms and a smithy to make the drills.
export const seedDrill: InnovationDef = {
  id: 'seed-drill',
  name: 'Seed Drill',
  blurb: 'Seeds in straight rows, at the right depth, and no more feeding the crows.',
  condition: {
    all: [
      { count: { what: 'buildings', ref: 'farmhouse', atLeast: 3 } },
      { count: { what: 'buildings', ref: 'smithy', atLeast: 1 } },
    ],
  },
  unlocks: ['wheat-yield-120'],
  rank: 'village',
};
