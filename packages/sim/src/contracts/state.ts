// World state (docs/spec/20-architecture.md, Simulation). Later iterations add per-system
// slices; any change to the saved shape bumps SAVE_VERSION and adds a migration.
import type { EntityId, Lens, Rect, Rot4, SeatId, Speed } from './ids';
import type { ValleySettings } from './settings';

/** Typed arrays of length size * size, index i = z * size + x (docs/spec/10-world-and-building.md). */
export interface MapLayers {
  height: Uint8Array;
  terrain: Uint8Array;
  water: Uint8Array;
  fertility: Uint8Array;
  deposit: Uint8Array;
  road: Uint8Array;
  tree: Uint8Array;
  occupant: Int32Array;
  zone: Uint8Array;
  parcel: Uint8Array;
  flags: Uint8Array;
}

export interface WorldMeta {
  startArea: Rect;
  valleyGate: [number, number];
  flow: 'ns' | 'we';
}

export interface SeatState {
  seat: SeatId;
  name: string;
  color: number;
  lens: Lens;
  lastSeenTick: number;
}

export interface Building {
  id: EntityId;
  def: string;
  x: number;
  z: number;
  rot: Rot4;
  builtBy: SeatId;
  handmade: boolean;
  stage: 'construction' | 'built';
  foundation: boolean;
  custom?: Record<string, string | boolean>;
}

export interface Decor {
  id: EntityId;
  def: string;
  fx: number;
  fz: number;
  rot: number;
  builtBy: SeatId;
}

export interface Note {
  id: EntityId;
  x: number;
  z: number;
  text: string;
  by: SeatId;
  tick: number;
}

export interface WorldState {
  saveVersion: number;
  seed: string;
  settings: ValleySettings;
  /** Last applied turn number. */
  lastTurn: number;
  /** Total ticks elapsed. */
  tick: number;
  /** desired: speed per seat, indexed by seat. connected: sorted seat ids. */
  time: { desired: Speed[]; connected: SeatId[] };
  /** 4 words per RngStream. */
  rng: Uint32Array;
  nextId: EntityId;
  map: MapLayers;
  meta: WorldMeta;
  /** Sorted by seat. */
  seats: SeatState[];
  /** Sorted by id. */
  buildings: Building[];
  /** Sorted by id. */
  decor: Decor[];
  /** Sorted by id. */
  notes: Note[];
}
