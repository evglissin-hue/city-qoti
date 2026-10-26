// C3D: ground-draped overlay geometry (charm, coverage, highlights). Overlays are their own
// transparent meshes laid just above the ground, never edits to the terrain shader. Heights follow
// the drawn ground (render/surface.ts): each sheet corner takes the highest of a few samples around
// it, so a sheet never dips under the smooth slopes between corners.
import { MAP_SIZE, type MapReader } from '@qoti/sim';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { groundY as surfaceGroundY } from './surface';

/** Lift above the ground for overlay sheets. */
export const DRAPE_LIFT = 0.045;

const SAMPLES: readonly [number, number][] = [
  [0, 0],
  [-0.35, -0.35],
  [0.35, -0.35],
  [-0.35, 0.35],
  [0.35, 0.35],
];

/** Height for a sheet corner (x, z are corner coordinates 0..MAP_SIZE): the highest ground nearby. */
export function cornerY(reader: MapReader, x: number, z: number): number {
  let h = -Infinity;
  for (const [dx, dz] of SAMPLES) {
    const px = Math.min(MAP_SIZE, Math.max(0, x + dx));
    const pz = Math.min(MAP_SIZE, Math.max(0, z + dz));
    h = Math.max(h, surfaceGroundY(reader, px, pz));
  }
  return h;
}

/** Ground height at any point, as drawn. */
export function groundY(reader: MapReader, x: number, z: number): number {
  return surfaceGroundY(reader, x, z);
}

export type Rgba = [number, number, number, number];

/**
 * A draped grid over tiles [x0, x1) x [z0, z1) with one RGBA color per corner (smooth between
 * tiles). Corners whose alpha and neighbors' alphas are all 0 still emit, so keep rects tight.
 */
export function drapeGrid(
  reader: MapReader,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  color: (cx: number, cz: number) => Rgba,
  lift = DRAPE_LIFT,
  step = 1,
): BufferGeometry {
  x0 = Math.max(0, x0);
  z0 = Math.max(0, z0);
  x1 = Math.min(MAP_SIZE, x1);
  z1 = Math.min(MAP_SIZE, z1);
  const nx = Math.max(1, Math.ceil((x1 - x0) / step));
  const nz = Math.max(1, Math.ceil((z1 - z0) / step));
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = Math.min(x1, x0 + i * step);
      const z = Math.min(z1, z0 + j * step);
      pos.push(x, cornerY(reader, x, z) + lift, z);
      col.push(...color(x, z));
    }
  }
  const row = nx + 1;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      // Skip fully transparent cells.
      if (col[a * 4 + 3]! + col[b * 4 + 3]! + col[c * 4 + 3]! + col[d * 4 + 3]! <= 0.001) continue;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

/** A ring (or arc) ribbon on the ground around (cx, cz). */
export function drapeRing(
  reader: MapReader,
  cx: number,
  cz: number,
  radius: number,
  width: number,
  rgba: Rgba,
  lift = DRAPE_LIFT + 0.01,
  dash = 0,
): BufferGeometry {
  const seg = Math.max(24, Math.round(radius * 10));
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    for (const r of [radius - width / 2, radius + width / 2]) {
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      pos.push(x, groundY(reader, x, z) + lift, z);
      col.push(...rgba);
    }
    if (i < seg && (dash === 0 || Math.floor(i / dash) % 2 === 0)) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}
