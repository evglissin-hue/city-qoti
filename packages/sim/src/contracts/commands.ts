// I0 contract (docs/spec/20-architecture.md). Additive changes only during parallel waves:
// add a new command in its own commit so merges stay trivial.
import type { EntityId, Lens, RoadKind, Rot4, SeatId, Speed, TreeSpecies } from './ids';
import type { ValleySettings } from './settings';

export type Command =
  /** Max 256 tiles. */
  | { t: 'road.paint'; kind: RoadKind; tiles: [number, number][] }
  | { t: 'road.remove'; tiles: [number, number][] }
  /** x, z = footprint min corner. */
  | { t: 'build.place'; def: string; x: number; z: number; rot: Rot4 }
  | { t: 'build.remove'; ids: EntityId[] }
  /** Fixed point position (1 tile = 256), rotation 0 to 63. */
  | { t: 'decor.place'; def: string; fx: number; fz: number; rot: number }
  /** Linear decor, fixed point. */
  | { t: 'decor.placeRun'; def: string; from: [number, number]; to: [number, number] }
  | { t: 'decor.remove'; ids: EntityId[] }
  | { t: 'tree.plant'; species: TreeSpecies; x: number; z: number }
  | { t: 'tree.remove'; tiles: [number, number][] }
  /** Max 200 chars. */
  | { t: 'note.pin'; x: number; z: number; text: string }
  | { t: 'note.remove'; id: EntityId }
  | { t: 'time.setSpeed'; speed: Speed }
  | { t: 'seat.setProfile'; name: string; color: number; lens: Lens }
  | { t: 'valley.setSettings'; settings: Partial<ValleySettings> }
  /** sys.* commands come only from the room; the room drops any client-sent sys.*. */
  | { t: 'sys.seatJoined'; seat: SeatId }
  | { t: 'sys.seatLeft'; seat: SeatId };

export type CommandType = Command['t'];

/** seq: per-seat counter, echoed in command.rejected. */
export interface SeatedCommand {
  seat: SeatId;
  seq: number;
  cmd: Command;
}

export interface Turn {
  t: number;
  cmds: SeatedCommand[];
}

export type RejectReason =
  | 'OUT_OF_BOUNDS'
  | 'LOCKED_PARCEL'
  | 'WATER'
  | 'OCCUPIED'
  | 'TOO_STEEP'
  | 'NEEDS_DEPOSIT'
  | 'NEEDS_WATER_EDGE'
  | 'NEEDS_FERTILITY'
  | 'CANNOT_AFFORD'
  | 'NOT_FOUND'
  | 'NOT_ALLOWED'
  | 'TOGETHER_ONLY'
  | 'TOO_MANY'
  | 'INVALID';
