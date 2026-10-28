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
  /** I1 (C3.0): 'resident' picks walking residents from the agent frames. */
  kind: 'building' | 'decor' | 'note' | 'tree' | 'resident';
  /** Entity id, or the tile index (z * size + x) for trees. */
  id: number;
}

/**
 * Overlay kinds for setOverlay (I1, C3.0): 'charm' (and 'charm:nature' style category views),
 * 'coverage' (well water), 'flows' (porter deliveries), 'status' (building status icons),
 * 'fields' (farm reach while painting). null hides overlays. I2 (C4E): 'zones' (zone tints and lot
 * outlines), 'traffic' (cart passes against road capacity), 'land' (land value: lot desirability)
 * and 'needs' (homes by contentment, ringed by tier). 'deposit:clay' (and stone, sand, coal): where
 * that deposit lies, while placing a building that needs it.
 */
export type OverlayKind =
  | 'charm'
  | `charm:${string}`
  | 'coverage'
  | 'flows'
  | 'status'
  | 'fields'
  | 'zones'
  | 'traffic'
  | 'land'
  | 'needs'
  | `deposit:${string}`;

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
  /**
   * C2 addition: a world point (tile units; y in world units) to canvas CSS pixels, for name labels
   * and off-screen arrows. `onScreen` is false when the point is outside the view or behind it.
   */
  project?(x: number, y: number, z: number): { x: number; y: number; onScreen: boolean } | null;
  /** I1 (C3.0): follow a resident with the camera (null stops). Optional until C3D lands. */
  follow?(residentId: number | null): void;
  /** I1 (C3.0): mood and wish bubbles above heads. */
  setBubbles?(on: boolean): void;
  /**
   * I1 (C3.0): a soft highlight of an area (a wish's target area, a pattern site, a farm's reach),
   * drawn on the ground. null clears it.
   */
  highlight?(
    area:
      | { x: number; z: number; radius: number; tone?: 'hearth' | 'ledger' }
      | { tiles: [number, number][]; tone?: 'hearth' | 'ledger' }
      | null,
  ): void;
}
