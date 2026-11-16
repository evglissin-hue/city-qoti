// I0 contract (docs/spec/20-architecture.md). Additive changes only during parallel waves.

export type SeatId = 0 | 1 | 2 | 3;
/** Positive, never reused. */
export type EntityId = number;
export type Rot4 = 0 | 1 | 2 | 3;
export type Speed = 0 | 1 | 2 | 3;
export type Lens = 'hearth' | 'ledger';
/** 'street' arrives in I2 (C4.0: the kind exists; C4B gates painting behind Cobbles). */
export type RoadKind = 'path' | 'lane' | 'street';
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
  | 'crop'
  // I2 (C4.0)
  | 'lot'
  | 'traffic'
  | 'wear';
/**
 * R2 (R2.0): the footfall layers (19-evenings.md, Footfall), 16 bits a tile. Saved and hashed with the
 * map but kept out of LayerName: they never travel as layer patches or in ViewSnapshot.layers (every
 * step would dirty a chunk); the client reads them through FootfallView.
 */
export type Uint16LayerName = 'footfallDay' | 'footfallEve';
