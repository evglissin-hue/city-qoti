// I0 contract (docs/spec/20-architecture.md). Additive changes only during parallel waves.

export type SeatId = 0 | 1 | 2 | 3;
/** Positive, never reused. */
export type EntityId = number;
export type Rot4 = 0 | 1 | 2 | 3;
export type Speed = 0 | 1 | 2 | 3;
export type Lens = 'hearth' | 'ledger';
/** 'street' arrives in I2. */
export type RoadKind = 'path' | 'lane';
export type TreeSpecies = 'oak' | 'birch' | 'pine';
/** Inclusive tile rectangle. */
export type Rect = [x0: number, z0: number, x1: number, z1: number];
export type LayerName =
  | 'height'
  | 'terrain'
  | 'water'
  | 'fertility'
  | 'deposit'
  | 'road'
  | 'tree'
  | 'occupant'
  | 'zone'
  | 'parcel'
  | 'flags'
  // I1 (C3.0)
  | 'charm'
  | 'charmNature'
  | 'charmComfort'
  | 'charmLight'
  | 'charmView'
  | 'charmNoise'
  | 'fieldOwner'
  | 'crop';
