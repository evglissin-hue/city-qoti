// Render contract (docs/spec/20-architecture.md, I0 contracts). Additive changes only during waves.
import type { RoadKind, Rot4, SeatId, TreeSpecies } from '@qoti/sim';

export interface TilePick {
  x: number;
  z: number;
  /** Fixed point position of the hit (1 tile = 256). */
  fx: number;
  fz: number;
  /** Height level of the tile. */
  h: number;
}

export interface EntityPick {
  kind: 'building' | 'decor' | 'note' | 'tree';
  /** Entity id, or the tile index (z * size + x) for trees. */
  id: number;
}

export interface GhostSegment {
  fx: number;
  fz: number;
  rot: number;
}

/** A translucent preview of what a tool would place, tinted valid or invalid. */
export type Ghost =
  | { kind: 'building'; def: string; x: number; z: number; rot: Rot4; valid: boolean }
  | { kind: 'decor'; def: string; fx: number; fz: number; rot: number; valid: boolean }
  | { kind: 'decorRun'; def: string; segments: GhostSegment[]; valid: boolean }
  | { kind: 'road'; road: RoadKind; tiles: [number, number][]; valid: boolean; badTile?: [number, number] }
  | { kind: 'tree'; species: TreeSpecies; x: number; z: number; valid: boolean }
  /** C1 addition: highlighted tiles (erase and inspect hover). */
  | { kind: 'tiles'; tiles: [number, number][]; valid: boolean };

export interface RenderApi {
  pickTile(clientX: number, clientY: number): TilePick | null;
  pickEntity(clientX: number, clientY: number): EntityPick | null;
  setGhost(g: Ghost | null): void;
  setOverlay(kind: string | null): void;
  setPresence(seat: SeatId, p: { x: number; z: number; tool?: string } | null): void;
  ping(seat: SeatId, x: number, z: number, kind: 'look' | 'help' | 'build'): void;
  focus(x: number, z: number, distance?: number): void;
  setQuality(q: 'low' | 'medium' | 'high'): void;
}
