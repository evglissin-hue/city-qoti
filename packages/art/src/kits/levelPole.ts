// R3X: the level pole. A slim post near the door corner carrying one pennant per level, stacked, one hue
// for all, so the count is the signal from the default camera (a tile is about 20 px there). Drawn by
// the client beside the kit (`withLevelPole`) for every def with `levels`; the spot is found against
// the kit's own geometry, so the post and its cloth never pass through a roof, an eave or a wall.
import type { BufferGeometry } from 'three';
import { ShapeBuilder, type V3 } from '../geometry';
import { palette } from '../palette';
import { SURFACE } from '../surface';
import { mergeFlat } from './vehicles';

/** The pennants' cloth: the palette's sunny yellow, which reads on grass, stone, thatch, tile and slate. */
export const LEVEL_PENNANT = palette.flowerB;
/** The post's height, a little over the low roofs; the top pennant hangs from just under it. */
export const POLE_HEIGHT = 2.5;
/** A pennant's length out from the post and its height; the gap between two. */
export const PENNANT_LEN = 0.7;
export const PENNANT_H = 0.34;
export const PENNANT_GAP = 0.07;
/** The post's half width. */
export const POLE_HALF = 0.03;

/** Where a level pole stands (kit-local, ground plane) and which way its pennants stream. */
export interface PoleSpot {
  x: number;
  z: number;
  /** +1 streams toward +x, -1 toward -x. */
  dir: 1 | -1;
}

/** How far outside the footprint a post may stand when the lot is full inside. */
export const POLE_OUTSET = 0.2;

/** Triangles wholly below this are ground patches, steps and flagstones, not obstacles. */
const GROUND = 0.07;

/** One kit triangle as plain numbers: x, y, z of each corner. */
type Tri = [number, number, number, number, number, number, number, number, number];

/** The kit's triangles above the ground patches, for the clearance test. */
export function trisOf(g: BufferGeometry): Tri[] {
  const pos = g.getAttribute('position');
  const index = g.getIndex();
  const n = index ? index.count : pos.count;
  const at = (i: number): number => (index ? index.getX(i) : i);
  const out: Tri[] = [];
  for (let t = 0; t + 2 < n; t += 3) {
    const a = at(t);
    const b = at(t + 1);
    const c = at(t + 2);
    if (Math.max(pos.getY(a), pos.getY(b), pos.getY(c)) < GROUND) continue;
    out.push([
      pos.getX(a),
      pos.getY(a),
      pos.getZ(a),
      pos.getX(b),
      pos.getY(b),
      pos.getZ(b),
      pos.getX(c),
      pos.getY(c),
      pos.getZ(c),
    ]);
  }
  return out;
}

/**
 * True when the vertical line through (x, z) meets a kit triangle between `y0` and `y1`: a wall, a roof
 * or an eave in the way. A near-vertical triangle (a wall) counts when its footprint covers the point
 * within `pad`; a sloped or flat one when its projection holds the point and its plane crosses the span.
 */
export function columnHit(
  tris: readonly Tri[],
  x: number,
  z: number,
  y0: number,
  y1: number,
  pad: number,
): boolean {
  for (const t of tris) {
    const ymin = Math.min(t[1], t[4], t[7]);
    const ymax = Math.max(t[1], t[4], t[7]);
    if (ymax < y0 || ymin > y1) continue;
    const xmin = Math.min(t[0], t[3], t[6]) - pad;
    const xmax = Math.max(t[0], t[3], t[6]) + pad;
    const zmin = Math.min(t[2], t[5], t[8]) - pad;
    const zmax = Math.max(t[2], t[5], t[8]) + pad;
    if (x < xmin || x > xmax || z < zmin || z > zmax) continue;
    const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
    if (Math.abs(d) < 1e-6) return true; // a wall: its box held the point
    const l1 = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d;
    const l2 = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d;
    const l3 = 1 - l1 - l2;
    const e = -pad * 2;
    if (l1 < e || l2 < e || l3 < e) continue;
    const y = l1 * t[1] + l2 * t[4] + l3 * t[7];
    if (y >= y0 - pad && y <= y1 + pad) return true;
  }
  return false;
}

/** The lowest point of the cloth of a pole carrying `levels` pennants. */
const clothLow = (levels: number): number => POLE_HEIGHT - 0.04 - levels * (PENNANT_H + PENNANT_GAP);

/** The columns a pole and its cloth occupy, as [x, z] samples with the height span each must keep clear. */
export function poleColumns(spot: PoleSpot, levels = 3): [number, number, number, number][] {
  const top = POLE_HEIGHT + 0.07;
  const h = POLE_HALF + 0.03;
  const out: [number, number, number, number][] = [];
  for (const [dx, dz] of [
    [0, 0],
    [h, h],
    [-h, h],
    [h, -h],
    [-h, -h],
  ] as const)
    out.push([spot.x + dx, spot.z + dz, GROUND, top]);
  for (let i = 1; i <= 8; i++)
    out.push([
      spot.x + (spot.dir * i * (PENNANT_LEN + POLE_HALF)) / 8,
      spot.z,
      Math.max(GROUND, clothLow(levels)),
      top,
    ]);
  return out;
}

/** Whether a pole at `spot` is clear of the kit's triangles. */
export function poleClear(tris: readonly Tri[], spot: PoleSpot): boolean {
  for (const [x, z, y0, y1] of poleColumns(spot)) if (columnHit(tris, x, z, y0, y1, 0.02)) return false;
  return true;
}

/**
 * Where the level pole stands for a kit's geometry: inside the footprint, off the door tile and its
 * margin, at the nearest free spot to the door (the front edge first). Pure and deterministic.
 */
export function levelPoleSpot(
  kit: BufferGeometry,
  size: readonly [number, number],
  entrance: readonly [number, number],
): PoleSpot {
  const [w, d] = size;
  const tris = trisOf(kit);
  const inset = 0.16;
  const cands: { x: number; z: number; score: number }[] = [];
  const dc: [number, number] = [entrance[0] + 0.5, entrance[1] + 0.5];
  const nx = Math.round(w * 4);
  const nz = Math.round(d * 4);
  for (let xi = 0; xi <= nx; xi++)
    for (let zi = 0; zi <= nz; zi++) {
      const x = Math.min(w - inset, Math.max(inset, (xi * w) / nx));
      const z = Math.min(d - inset, Math.max(inset, (zi * d) / nz));
      // Off the door tile, with a margin round it and down its line to the front.
      if (x > entrance[0] - 0.3 && x < entrance[0] + 1.3 && z > entrance[1] - 0.3) continue;
      cands.push({ x, z, score: Math.hypot(x - dc[0], z - dc[1]) + (d - z) * 0.35 });
    }
  cands.sort((a, b) => a.score - b.score || a.z - b.z || a.x - b.x);
  // A lot a kit fills edge to edge (a stall, a mill's tower) has no free ground inside: the post then
  // stands just outside the footprint, on the side or the back, never in front of the door.
  const out = POLE_OUTSET;
  const rim: { x: number; z: number; score: number }[] = [];
  for (let zi = 0; zi <= nz; zi++) {
    const z = Math.min(d - inset, (zi * d) / nz);
    for (const x of [-out, w + out])
      rim.push({ x, z, score: Math.hypot(x - dc[0], z - dc[1]) + (d - z) * 0.35 });
  }
  for (let xi = 0; xi <= nx; xi++) {
    const x = (xi * w) / nx;
    if (x > entrance[0] - 0.3 && x < entrance[0] + 1.3) continue;
    rim.push({ x, z: d + out, score: Math.hypot(x - dc[0], d + out - dc[1]) });
  }
  rim.sort((a, b) => a.score - b.score || a.z - b.z || a.x - b.x);
  cands.push(...rim);
  const seen = new Set<string>();
  for (const c of cands) {
    const key = `${c.x.toFixed(3)},${c.z.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Stream toward the plot's middle first, so the cloth stays over the owner's own ground.
    const inward: 1 | -1 = c.x < w / 2 ? 1 : -1;
    for (const dir of [inward, inward === 1 ? -1 : 1] as const) {
      const spot: PoleSpot = { x: c.x, z: c.z, dir };
      if (poleClear(tris, spot)) return spot;
    }
  }
  const c = cands[0] ?? { x: inset, z: d - inset };
  return { x: c.x, z: c.z, dir: c.x < w / 2 ? 1 : -1 };
}

/** The pole and its `level` pennants (1 to 3), standing at `spot`, in the kit's space. */
export function levelPoleGeometry(
  spot: PoleSpot,
  level: number,
  lod: 'high' | 'low' = 'high',
): BufferGeometry {
  const s = new ShapeBuilder(lod);
  const { x, z, dir } = spot;
  const hw = POLE_HALF;
  s.surface(SURFACE.plain);
  s.box(x - hw, 0, z - hw, x + hw, POLE_HEIGHT, z + hw, palette.timber);
  s.box(
    x - hw * 1.8,
    POLE_HEIGHT,
    z - hw * 1.8,
    x + hw * 1.8,
    POLE_HEIGHT + 0.06,
    z + hw * 1.8,
    palette.darkWood,
  );
  s.surface(SURFACE.cloth);
  // Lit like a lantern pane at night (glow 2), so the count still reads in the dark; day is unchanged.
  s.glow(2);
  const n = Math.max(1, Math.min(3, Math.round(level)));
  for (let i = 0; i < n; i++) {
    const top = POLE_HEIGHT - 0.04 - i * (PENNANT_H + PENNANT_GAP);
    const bot = top - PENNANT_H;
    const a: V3 = [x + dir * hw, top, z];
    const b: V3 = [x + dir * hw, bot, z];
    // The tip droops a touch, as cloth hangs; two faces so it reads from both sides.
    const tip: V3 = [x + dir * (hw + PENNANT_LEN), bot + PENNANT_H * 0.42, z];
    s.tri(a, b, tip, LEVEL_PENNANT, [0, 0, 1]);
    s.tri(a, b, tip, LEVEL_PENNANT, [0, 0, -1]);
  }
  s.glow(0);
  s.surface(SURFACE.plain);
  return s.build(false);
}

/** A kit's geometry with its level pole added: the one place the client and the tests join them. */
export function withLevelPole(
  kit: BufferGeometry,
  size: readonly [number, number],
  entrance: readonly [number, number],
  level: number,
  lod: 'high' | 'low' = 'high',
): BufferGeometry {
  const pole = levelPoleGeometry(levelPoleSpot(kit, size, entrance), level, lod);
  const merged = mergeFlat([kit, pole]);
  pole.dispose();
  return merged;
}
