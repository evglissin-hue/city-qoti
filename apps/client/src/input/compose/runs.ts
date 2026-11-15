// Dragged runs that arrange themselves: lanterns every third tile on alternating sides, flowers
// along the drag, fences and hedges that leave an opening where they cross a road. Pure functions
// over a MapReader; each result goes out as one decor.placeRun with `pieces`.
import type { DecorDef } from '@qoti/content';
import {
  canPlaceDecor,
  canPlaceDecorPieces,
  canPlaceDecorRun,
  decorRadius,
  decorRunSegments,
  decorTooClose,
  MAX_RUN_SEGMENTS,
  TILE_FP,
  type MapReader,
  type Placement,
} from '@qoti/sim';

export interface Piece {
  def: string;
  fx: number;
  fz: number;
  rot: number;
}

/** A lantern stands this far (fixed point) to one side of the line: half a tile and a hair, so it clears the path tile. */
const SIDE_OFFSET = TILE_FP / 2 + 8;
/** Lanterns stand every this many tiles. */
export const LANTERN_EVERY = 3;

export const center = (t: number): number => t * TILE_FP + TILE_FP / 2;

export function isLanternDef(def: DecorDef): boolean {
  return !def.linear && def.tags.includes('lantern');
}

export function isFlowerDef(def: DecorDef): boolean {
  return !def.linear && def.tags.includes('flower');
}

/** Pieces a drag turns into: lanterns and flowers. */
export function isRunnable(def: DecorDef): boolean {
  return isLanternDef(def) || isFlowerDef(def);
}

/** The longest tile distance between two fixed-point points (a click is 0 or 1; a drag is 2 or more). */
export function dragTiles(from: [number, number], to: [number, number]): number {
  return Math.max(
    Math.abs(Math.floor(to[0] / TILE_FP) - Math.floor(from[0] / TILE_FP)),
    Math.abs(Math.floor(to[1] / TILE_FP) - Math.floor(from[1] / TILE_FP)),
  );
}

/** One point per tile step along the drag, both ends included (fixed point). */
export function dragPoints(from: [number, number], to: [number, number]): [number, number][] {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len === 0) return [[from[0], from[1]]];
  const n = Math.max(1, Math.round(len / TILE_FP));
  const pts: [number, number][] = [];
  for (let k = 0; k <= n; k++)
    pts.push([from[0] + Math.round((dx * k) / n), from[1] + Math.round((dz * k) / n)]);
  return pts;
}

/** Adds a piece when it can stand there and keeps its distance from the ones already chosen. */
export function tryAdd(
  reader: MapReader,
  def: DecorDef,
  pieces: Piece[],
  fx: number,
  fz: number,
  rot: number,
): boolean {
  if (!canPlaceDecor(reader, def, fx, fz, rot).ok) return false;
  for (const p of pieces) {
    if (decorTooClose(p.fx - fx, p.fz - fz, def.radius, decorRadius(p.def))) return false;
  }
  pieces.push({ def: def.id, fx, fz, rot });
  return true;
}

/**
 * Lanterns every third tile along the drag, on alternating sides of the line (half a tile to one
 * side, then the other, perpendicular to the drag). Spots that cannot hold a lantern are skipped.
 */
export function lanternPieces(
  reader: MapReader,
  def: DecorDef,
  from: [number, number],
  to: [number, number],
): Piece[] {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.sqrt(dx * dx + dz * dz);
  const pieces: Piece[] = [];
  if (len === 0) return pieces;
  const px = -dz / len;
  const pz = dx / len;
  const pts = dragPoints(from, to);
  let side = 1;
  for (let k = 0; k < pts.length && pieces.length < MAX_RUN_SEGMENTS; k += LANTERN_EVERY) {
    const [x, z] = pts[k]!;
    const fx = Math.round(x + px * SIDE_OFFSET * side);
    const fz = Math.round(z + pz * SIDE_OFFSET * side);
    side = -side;
    tryAdd(reader, def, pieces, fx, fz, 0);
  }
  return pieces;
}

/**
 * One flower piece on every tile of the drag (the player drags beside the wall, fence, hedge or
 * path they want it to follow). A tile that is road is nudged a tile to the side; spots that still
 * cannot hold one are skipped.
 */
export function flowerPieces(
  reader: MapReader,
  def: DecorDef,
  from: [number, number],
  to: [number, number],
): Piece[] {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.sqrt(dx * dx + dz * dz);
  const pieces: Piece[] = [];
  const px = len === 0 ? 0 : -dz / len;
  const pz = len === 0 ? 1 : dx / len;
  for (const [x, z] of dragPoints(from, to)) {
    if (pieces.length >= MAX_RUN_SEGMENTS) break;
    if (tryAdd(reader, def, pieces, x, z, 0)) continue;
    if (!reader.road(Math.floor(x / TILE_FP), Math.floor(z / TILE_FP))) continue;
    for (const side of [1, -1]) {
      const nx = Math.round(x + px * TILE_FP * side);
      const nz = Math.round(z + pz * TILE_FP * side);
      if (tryAdd(reader, def, pieces, nx, nz, 0)) break;
    }
  }
  return pieces;
}

/** The run a drag of a runnable piece makes (empty when it has no room anywhere). */
export function composedRun(
  reader: MapReader,
  def: DecorDef,
  from: [number, number],
  to: [number, number],
): Piece[] {
  return isLanternDef(def) ? lanternPieces(reader, def, from, to) : flowerPieces(reader, def, from, to);
}

export interface GappedRun {
  /** What would stand: the whole run, or the run without the road tiles. */
  segments: Piece[];
  /** Segments left out because they cross a road (an arch in a hedge, a gate in a fence). */
  dropped: number;
  check: Placement;
}

/**
 * A linear run that meets roads gracefully: segments on road tiles are left out. With none left
 * out this is exactly the plain run (the caller sends a plain decor.placeRun); otherwise the
 * caller sends the kept segments as `pieces`.
 */
export function runWithGaps(
  reader: MapReader,
  def: DecorDef,
  from: [number, number],
  to: [number, number],
): GappedRun {
  const all = decorRunSegments(from, to).map((s): Piece => ({ def: def.id, ...s }));
  const kept = def.onRoad
    ? all
    : all.filter((s) => !reader.road(Math.floor(s.fx / TILE_FP), Math.floor(s.fz / TILE_FP)));
  const dropped = all.length - kept.length;
  if (dropped === 0) return { segments: all, dropped, check: canPlaceDecorRun(reader, def, from, to) };
  if (all.length > MAX_RUN_SEGMENTS) return { segments: kept, dropped, check: fail('TOO_MANY') };
  if (kept.length === 0) return { segments: kept, dropped, check: fail('NOT_ALLOWED') };
  return { segments: kept, dropped, check: canPlaceDecorPieces(reader, kept) };
}

function fail(reason: 'TOO_MANY' | 'NOT_ALLOWED'): Placement {
  return { ok: false, reason };
}
