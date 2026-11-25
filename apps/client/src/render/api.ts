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
  | 'bubbles'
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
  | `deposit:${string}`
  // Playtest round three: soil quality everywhere, while placing a farmhouse or a plot.
  | 'soil'
  // C5E: habitats (all, by the strongest per chunk, or one), the floodplain, threat (the Watch's
  // reach and the raid's side) and warmth (cold homes).
  | 'habitats'
  | `habitat:${string}`
  | 'floodplain'
  | 'threat'
  | 'warmth';

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
  /** P2-D (additive): the waiting markers over construction sites, on in the Ledger lens. */
  setSiteMarkers?(on: boolean): void;
  /** A partner's cursor: the world point under it (tiles, fractional), or null when it is away. */
  setPresence(seat: SeatId, p: { x: number; z: number; tool?: string } | null): void;
  ping(seat: SeatId, x: number, z: number, kind: 'look' | 'help' | 'build'): void;
  focus(x: number, z: number, distance?: number): void;
  /** V1.0: `ultra` added (for the stronger laptop or a desktop; never auto-detected). */
  setQuality(q: 'low' | 'medium' | 'high' | 'ultra'): void;
  /**
   * C2 addition: a world point (tile units; y in world units) to canvas CSS pixels, for name labels
   * and off-screen arrows. `onScreen` is false when the point is outside the view or behind it.
   */
  project?(x: number, y: number, z: number): { x: number; y: number; onScreen: boolean } | null;
  /**
   * Where a partner's cursor is drawn this frame, smoothed (tiles; y on the ground), and how faded
   * in it is (0 to 1), so the interface's pointer and name tag move with it. Null when hidden.
   */
  presenceAt?(seat: SeatId): { x: number; y: number; z: number; alpha: number } | null;
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
      | { tiles: [number, number][]; tone?: 'hearth' | 'ledger'; outline?: boolean; path?: boolean }
      | null,
  ): void;
  /**
   * R3G (additive): the endpaper map as a still at print resolution (2048 px a side by default), a
   * PNG, or null; for the printed storybook's cover.
   */
  endpaperStill?(size?: number): Promise<Blob | null>;
}

/**
 * V4.0: how `capture` draws a picture: `plain` (C5E's, as the Chronicle has it) or `ink` (V4B's ink
 * and wash for the books: the developed still, ink lines where depth and facing break, paper grain
 * and a limited wash). Until V4B lands an `ink` capture returns the plain picture.
 */
export type CaptureStyle = 'plain' | 'ink';

/**
 * V4.0: a picture of the valley (the renderer's `capture`, read through the client's
 * `SeasonRender`). Book slots are landscape 4:3 (`docs/build/v4-wave-notes.md`, Pictures).
 */
export interface CaptureOptions {
  /** The point the picture looks at, in tiles. */
  focus: [number, number];
  /** About how many tiles across the picture shows. */
  radius: number;
  /** The picture's size in pixels. */
  size: [number, number];
  /** V4: `plain` when absent. */
  style?: CaptureStyle;
  /**
   * V4: samples to develop the picture to (V4A's refinement; `PHOTO_SAMPLES`, 64, for photo mode
   * and print). Absent or 0 is one plain pass, which is all V4.0 draws.
   */
  samples?: number;
}
