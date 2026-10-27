import type { InnovationDef } from './types';

// The I2 innovations (docs/spec/15-progression.md, Innovations). Conditions use named code
// predicates and measures implemented in packages/sim/src/systems/innovations/measures.ts (C4C).
// `storyStep`'s arc is an index into content.stories (C4D's arcs).

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
      {
        code: 'storyStep',
        params: [
          ['arc', 0],
          ['step', 2],
        ],
      },
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
