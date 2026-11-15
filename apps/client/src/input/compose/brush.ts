// The flower brush: a stroke becomes a drift of mixed flower pieces, scattered within about a tile
// of the stroke and chosen by a seed, so the same stroke over the same ground always paints the
// same drift (stable tests; the partner sees plain pieces either way).
import type { DecorDef } from '@qoti/content';
import { DECOR_ROTATIONS, MAX_RUN_SEGMENTS, TILE_FP, type MapReader } from '@qoti/sim';
import { tryAdd, type Piece } from './runs';

/**
 * A flower the brush may paint: a single piece (not a verge), a plain flower, not a festival piece,
 * and nothing that costs goods (the client cannot see the storehouses, so the brush keeps to coins).
 */
export function isBrushFlower(def: DecorDef): boolean {
  return def.tags.includes('flower') && !def.linear && !def.festival && !def.cost?.goods?.length;
}

/** A drift never holds more than this many pieces (and never more than a run may). */
export const BRUSH_MAX_PIECES = Math.min(24, MAX_RUN_SEGMENTS);
/** Scatter, as a fraction of a tile either side of a stroke point. */
const SCATTER = TILE_FP;
/** Tries per stroke tile. */
const TRIES = 3;

/** A small deterministic hash of the stroke's start tile. */
export function brushSeed(tx: number, tz: number): number {
  let h = Math.imul(tx + 1, 73856093) ^ Math.imul(tz + 1, 19349663);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32: a tiny seeded generator in [0, 1). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The stroke, as the distinct tile centers the pointer crossed, in order (fixed point). */
export function strokeTiles(points: readonly [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let last = '';
  for (const [fx, fz] of points) {
    const tx = Math.floor(fx / TILE_FP);
    const tz = Math.floor(fz / TILE_FP);
    const key = `${tx},${tz}`;
    if (key === last) continue;
    last = key;
    out.push([tx * TILE_FP + TILE_FP / 2, tz * TILE_FP + TILE_FP / 2]);
  }
  return out;
}

/**
 * A drift along the stroke: for each stroke tile a few scattered tries, each a flower picked from
 * `defs` by the seed. A try that cannot stand, or crowds a piece already chosen, is dropped.
 */
export function brushPieces(
  reader: MapReader,
  defs: readonly DecorDef[],
  stroke: readonly [number, number][],
  seed: number,
): Piece[] {
  const pieces: Piece[] = [];
  if (defs.length === 0) return pieces;
  const next = rng(seed);
  for (const [cx, cz] of stroke) {
    for (let i = 0; i < TRIES && pieces.length < BRUSH_MAX_PIECES; i++) {
      const def = defs[Math.floor(next() * defs.length)]!;
      const fx = cx + Math.round((next() * 2 - 1) * SCATTER);
      const fz = cz + Math.round((next() * 2 - 1) * SCATTER);
      const rot = Math.floor(next() * DECOR_ROTATIONS);
      if (fx < 0 || fz < 0) continue;
      tryAdd(reader, def, pieces, fx, fz, rot);
    }
    if (pieces.length >= BRUSH_MAX_PIECES) break;
  }
  return pieces;
}
