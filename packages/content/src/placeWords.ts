import type { PlaceWords } from './types';

// R2A: the words for place names and for what a place still wants (docs/spec/19-evenings.md, Places).
// Names read like the Chronicle's places: what stands there and the family nearest it. Wants are lower
// case clauses with no final period; the place card adds the punctuation.
export const placeWords: PlaceWords = {
  byFamily: 'by the {family} {home}',
  byWater: 'by the water',
  atEdge: 'at the edge of town',
  site: 'the {pattern}',
  seats: 'the {piece}',
  host: 'the {building}',
  fire: 'the {brazier}',
  ice: 'the ice',
  festival: 'the {festival} grounds',
  porch: "the {family}s' porch",
  other: 'the other {stem}',
  third: 'the third {stem}',
  onStreet: 'on {street}',
  ordinals: [
    'the second',
    'the third',
    'the fourth',
    'the fifth',
    'the sixth',
    'the seventh',
    'the eighth',
    'the ninth',
    'the tenth',
  ],
  again: ', again',
  wantStall: 'a stall would sell to the {n} who come',
  wantBench: 'a bench would seat the {n} who stand',
  wantSeats: 'more seats would keep the {n} who came off their feet',
  wantLantern: 'a lantern would see them home after dark',
  wantBrazier: 'a brazier would keep it warm in winter',
};
