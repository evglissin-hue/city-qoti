// V3.0: where a plot's dressing goes (docs/spec/20-architecture.md, V3 contracts). Every building kit
// has a doorstep, a yard, walls, sills, a shop front, a garden and eaves: the kit's own anchors where
// it gives them, otherwise derived here from its footprint and entrance, so no kit needs an edit.
// A kit overrides one only where the derived place is wrong, and each override is a carve-out in the
// V3 wave notes (docs/build/v3-wave-notes.md). Anchor names are append-only.
import type { AnchorPoint, AnchorRect, AnchorRun, Kit, KitAnchors, KitBuildOptions } from './kits/types';

/** The plot anchors V3 adds to `KitAnchors`, in the order they were added. Append-only. */
export const ANCHOR_NAMES = ['door', 'yard', 'walls', 'sills', 'front', 'garden', 'eaves'] as const;
export type AnchorName = (typeof ANCHOR_NAMES)[number];

/**
 * How far a building kit's walls usually stand inside its plot, in tiles (the cottage's `fitRow`
 * margins): the derived anchors take the house to be the plot less these, since a kit's real walls
 * are only known to the kit. The street face is at +z.
 */
export const BODY_INSET = { side: 0.22, back: 0.3, front: 0.26 } as const;

/** Ground rectangle [x0, z0, x1, z1] in kit-local tiles. */
export type GroundBox = [number, number, number, number];

export interface AnchorOptions extends KitBuildOptions {
  /**
   * The lot round the building in kit-local space [x0, z0, x1, z1], when it is larger than the
   * footprint (a side garden where the house is narrower than its lot, a back garden behind it).
   * Defaults to the plot itself, [0, 0, w, d]. It moves only the derived yard, garden and walls.
   */
  lot?: GroundBox;
}

/** The house the derived anchors assume: the plot less `BODY_INSET`. */
export function plotBody(size: readonly [number, number]): GroundBox {
  const [w, d] = size;
  return [BODY_INSET.side, BODY_INSET.back, w - BODY_INSET.side, d - BODY_INSET.front];
}

/** The seven plot anchors for a footprint, entrance and lot, from no kit at all. */
export type DerivedAnchors = Required<Pick<KitAnchors, AnchorName>>;

const FRONT: [number, number] = [0, 1];
const EPS = 1e-6;

function rect(box: GroundBox, facing: [number, number] = FRONT): AnchorRect {
  const [x0, z0, x1, z1] = box;
  const across = facing[0] === 0 ? x1 - x0 : z1 - z0;
  const along = facing[0] === 0 ? z1 - z0 : x1 - x0;
  return { center: [(x0 + x1) / 2, 0, (z0 + z1) / 2], size: [across, along], facing };
}

function area(b: GroundBox): number {
  return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
}

/**
 * Derives the plot anchors (kit-local, the street face at +z):
 * - `door`: on the plot's front edge in front of the entrance tile, facing the street.
 * - `front`: the strip between the house's front wall and the plot's front edge.
 * - `yard`: the largest of the lot's ground beside the house (left or right) and the front strip on
 *   the wider side of the door; never under the house.
 * - `garden`: the lot's ground behind the house, its whole width.
 * - `walls`: the lot's left side, back and right side, front to back, facing out.
 * - `sills`: under the kit's lit ground-floor windows on the street face (`lights` below 0.9 tiles
 *   up), else either side of the door.
 * - `eaves`: against the middle of each side wall, facing out.
 */
export function deriveAnchors(
  size: readonly [number, number],
  entrance: readonly [number, number],
  lights: readonly (readonly [number, number, number])[] = [],
  lot?: GroundBox,
): DerivedAnchors {
  const [w, d] = size;
  const [lx0, lz0, lx1, lz1] = lot ?? [0, 0, w, d];
  const body = plotBody(size);
  const [bx0, bz0, bx1, bz1] = body;
  const doorX = Math.min(Math.max(entrance[0], 0), w - 1) + 0.5;
  const door: AnchorPoint = { at: [doorX, 0, d], facing: FRONT };
  const front = rect([bx0, bz1, bx1, d]);

  // The yard: beside the house (front to the back wall's line) or the front strip beside the door.
  const halfDoor = 0.3;
  const leftStrip: GroundBox = [bx0, bz1, doorX - halfDoor, d];
  const rightStrip: GroundBox = [doorX + halfDoor, bz1, bx1, d];
  const candidates: GroundBox[] = [
    [bx1, bz0, lx1, lz1],
    [lx0, bz0, bx0, lz1],
    area(rightStrip) >= area(leftStrip) ? rightStrip : leftStrip,
  ];
  let best = candidates[0]!;
  for (const c of candidates) if (area(c) > area(best) + 1e-9) best = c;
  const yard = rect(best);

  const garden = rect([lx0, lz0, lx1, Math.max(lz0, bz0)]);
  const walls: AnchorRun[] = [
    { start: [lx0, 0, lz1], end: [lx0, 0, lz0], facing: [-1, 0] },
    { start: [lx0, 0, lz0], end: [lx1, 0, lz0], facing: [0, -1] },
    { start: [lx1, 0, lz0], end: [lx1, 0, lz1], facing: [1, 0] },
  ];

  const cx = (bx0 + bx1) / 2;
  const cz = (bz0 + bz1) / 2;
  const sills: AnchorPoint[] = [];
  for (const [x, y, z] of lights) {
    if (y >= 0.9) continue;
    // Street face only: measured against the house's half width and half depth, the light is
    // further toward the front than toward either side.
    const dx = Math.abs(x - cx) / Math.max(EPS, (bx1 - bx0) / 2);
    const dz = (z - cz) / Math.max(EPS, (bz1 - bz0) / 2);
    if (dz <= 0 || dx > dz) continue;
    sills.push({ at: [x, Math.max(0.18, y - 0.12), z + 0.04], facing: FRONT });
  }
  if (!sills.length)
    for (const x of [doorX - 0.6, doorX + 0.6])
      if (x > bx0 + 0.1 && x < bx1 - 0.1) sills.push({ at: [x, 0.36, bz1 + 0.03], facing: FRONT });

  const eaves: AnchorPoint[] = [
    { at: [bx0, 0, cz], facing: [-1, 0] },
    { at: [bx1, 0, cz], facing: [1, 0] },
  ];
  return { door, yard, walls, sills, front, garden, eaves };
}

const cache = new Map<string, KitAnchors>();
/** Cached anchor sets at most; the cache is cleared past this (kits times params times lots is small). */
const CACHE_MAX = 4096;

/**
 * A kit's anchors with V3's plot anchors filled in: whatever the kit's own `anchors()` returns
 * (smoke, lights, sign and animals untouched, so `layers/lights.ts` sees the same), plus the derived
 * door, yard, walls, sills, front, garden and eaves for any of them a building kit leaves out.
 * Non-building kits get their own anchors only. Cached per kit, size, entrance, params and lot, as
 * `lights.ts` caches `anchorsForBuilding` per def: anchors never depend on the seed or the level of
 * detail, so neither is passed to the kit. Treat the result as read-only.
 */
export function anchorsFor(kit: Kit, opts: AnchorOptions = {}): KitAnchors {
  const size = opts.size ?? kit.footprint?.size ?? [2, 2];
  const entrance = opts.entrance ?? kit.footprint?.entrance ?? [Math.floor(size[0] / 2), size[1] - 1];
  const key = `${kit.id}|${size.join(',')}|${entrance.join(',')}|${opts.lot?.join(',') ?? ''}|${
    opts.params ? JSON.stringify(opts.params) : ''
  }`;
  const hit = cache.get(key);
  if (hit) return hit;
  const own =
    kit.anchors?.({ size, entrance, ...(opts.params ? { params: opts.params } : {}) }) ?? ({} as KitAnchors);
  let out: KitAnchors = own;
  if (kit.kind === 'building') {
    const derived = deriveAnchors(size, entrance, own.lights, opts.lot);
    out = { ...own };
    for (const name of ANCHOR_NAMES)
      if (out[name] === undefined) (out as Record<string, unknown>)[name] = derived[name];
  }
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, out);
  return out;
}

/** Empties the anchor cache (tests, or a kit hot-reloaded in the gallery). */
export function clearAnchorCache(): void {
  cache.clear();
}
