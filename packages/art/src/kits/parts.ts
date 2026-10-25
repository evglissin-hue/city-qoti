// Modular building parts: foundations, plaster walls with timber framing, windows with shutters and
// flower boxes, round-topped doors, chimneys and chunky roofs. Faces are addressed in a local frame
// (u along the face, y up, o outward from the wall plane) so one part works on any of the four sides.
import type { ShapeBuilder } from '../geometry';
import { type V3 } from '../geometry';
import { palette } from '../palette';

export type FaceDir = 'z+' | 'z-' | 'x+' | 'x-';

export interface Face {
  dir: FaceDir;
  /** The wall plane coordinate (z for z faces, x for x faces). */
  plane: number;
}

export function facePoint(f: Face, u: number, y: number, o: number): V3 {
  switch (f.dir) {
    case 'z+':
      return [u, y, f.plane + o];
    case 'z-':
      return [u, y, f.plane - o];
    case 'x+':
      return [f.plane + o, y, u];
    case 'x-':
      return [f.plane - o, y, u];
  }
}

/** An axis-aligned box given in face-local coordinates. */
export function faceBox(
  s: ShapeBuilder,
  f: Face,
  u0: number,
  y0: number,
  o0: number,
  u1: number,
  y1: number,
  o1: number,
  hex: number,
): void {
  const a = facePoint(f, u0, y0, o0);
  const b = facePoint(f, u1, y1, o1);
  s.box(
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.max(a[2], b[2]),
    hex,
  );
}

function outwardOf(f: Face): V3 {
  switch (f.dir) {
    case 'z+':
      return [0, 0, 1];
    case 'z-':
      return [0, 0, -1];
    case 'x+':
      return [1, 0, 0];
    case 'x-':
      return [-1, 0, 0];
  }
}

export interface WindowStyle {
  frame: number;
  shutter: number | null;
  box: boolean;
  flowers: readonly number[];
}

/** A window centered at (u, y) on a face: frame, glowing pane, mullions, shutters and a flower box. */
export function windowPart(
  s: ShapeBuilder,
  f: Face,
  u: number,
  y: number,
  w: number,
  h: number,
  style: WindowStyle,
  rnd: () => number,
  lights?: V3[],
): void {
  const fw = 0.035;
  faceBox(s, f, u - w / 2 - fw, y - h / 2 - fw, 0, u + w / 2 + fw, y + h / 2 + fw, 0.02, style.frame);
  s.glow(1);
  faceBox(s, f, u - w / 2, y - h / 2, 0.02, u + w / 2, y + h / 2, 0.028, palette.windowDay);
  s.glow(0);
  faceBox(s, f, u - 0.012, y - h / 2, 0.028, u + 0.012, y + h / 2, 0.038, style.frame);
  faceBox(s, f, u - w / 2, y - 0.012, 0.028, u + w / 2, y + 0.012, 0.038, style.frame);
  // Sill.
  faceBox(s, f, u - w / 2 - 0.05, y - h / 2 - 0.05, 0, u + w / 2 + 0.05, y - h / 2 - 0.02, 0.05, style.frame);
  if (style.shutter !== null) {
    const sw = w * 0.42;
    faceBox(s, f, u - w / 2 - fw - sw, y - h / 2, 0.005, u - w / 2 - fw, y + h / 2, 0.03, style.shutter);
    faceBox(s, f, u + w / 2 + fw, y - h / 2, 0.005, u + w / 2 + fw + sw, y + h / 2, 0.03, style.shutter);
  }
  if (style.box) {
    const by = y - h / 2 - 0.05;
    faceBox(s, f, u - w / 2 - 0.02, by - 0.07, 0.02, u + w / 2 + 0.02, by, 0.1, palette.wood);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const fu = u - w / 2 + (w * (i + 0.5)) / n;
      const p = facePoint(f, fu, by + 0.02, 0.06);
      s.blob(p[0], p[1], p[2], 0.045, 0.035, 0.045, palette.leaf, 0);
      const c = style.flowers[Math.floor(rnd() * style.flowers.length)] ?? palette.flowerA;
      const q = facePoint(f, fu + (rnd() - 0.5) * 0.03, by + 0.05, 0.07);
      s.blob(q[0], q[1], q[2], 0.028, 0.024, 0.028, c, 0);
    }
  }
  lights?.push(facePoint(f, u, y, 0.05));
}

/** A round-topped plank door with a stone step and a little lamp-free frame. */
export function doorPart(
  s: ShapeBuilder,
  f: Face,
  u: number,
  w: number,
  h: number,
  hex: number,
  frame: number,
): void {
  const r = w / 2;
  const yr = h - r;
  const out = outwardOf(f);
  // Frame and step.
  faceBox(s, f, u - r - 0.04, 0, 0, u + r + 0.04, yr, 0.02, frame);
  faceBox(s, f, u - r - 0.06, 0, 0, u + r + 0.06, 0.035, 0.12, palette.stone);
  faceBox(s, f, u - r, 0.035, 0.02, u + r, yr, 0.035, hex);
  // Arched top: a fan of segments for the door and a slightly larger fan for the frame.
  const seg = 5;
  for (const [rad, o0, o1, col] of [
    [r + 0.04, 0, 0.02, frame],
    [r, 0.02, 0.035, hex],
  ] as const) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI;
      const a1 = ((i + 1) / seg) * Math.PI;
      const p0f = facePoint(f, u + Math.cos(a0) * rad, yr + Math.sin(a0) * rad, o1);
      const p1f = facePoint(f, u + Math.cos(a1) * rad, yr + Math.sin(a1) * rad, o1);
      const cf = facePoint(f, u, yr, o1);
      s.tri(cf, p0f, p1f, col, out);
      const p0b = facePoint(f, u + Math.cos(a0) * rad, yr + Math.sin(a0) * rad, o0);
      const p1b = facePoint(f, u + Math.cos(a1) * rad, yr + Math.sin(a1) * rad, o0);
      const mid = (a0 + a1) / 2;
      const rim = facePoint(f, u + Math.cos(mid), yr + Math.sin(mid), 0);
      const c = facePoint(f, u, yr, 0);
      s.quad(p0b, p1b, p1f, p0f, col, [rim[0] - c[0], rim[1] - c[1], rim[2] - c[2]]);
    }
  }
  // Knob.
  const k = facePoint(f, u + r * 0.55, yr * 0.55, 0.045);
  s.blob(k[0], k[1], k[2], 0.015, 0.015, 0.015, palette.mustard, 0);
}

/** A chunky brick chimney with a cap; returns the smoke anchor at its top. */
export function chimneyPart(s: ShapeBuilder, x: number, z: number, y0: number, y1: number, hex: number): V3 {
  s.rbox(x - 0.1, y0, z - 0.1, x + 0.1, y1, z + 0.1, hex, 0.015);
  s.rbox(x - 0.13, y1, z - 0.13, x + 0.13, y1 + 0.06, z + 0.13, palette.stone, 0.015);
  return [x, y1 + 0.08, z];
}

/** A low stone foundation, slightly wider than the walls. */
export function foundationPart(
  s: ShapeBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  h: number,
): void {
  s.rbox(x0, 0, z0, x1, h, z1, palette.foundation, 0.035);
}

/** Plaster walls from y0 to y1 with timber corner posts and an optional beam at `beamY`. */
export function wallsPart(
  s: ShapeBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y0: number,
  y1: number,
  plaster: number,
  timber: number,
  beamY: number | null,
): void {
  s.box(x0, y0, z0, x1, y1, z1, plaster);
  const p = 0.05;
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ] as const) {
    s.box(x - p, y0, z - p, x + p, y1, z + p, timber);
  }
  // Top plate.
  s.box(x0 - 0.035, y1 - 0.06, z0 - 0.035, x1 + 0.035, y1, z1 + 0.035, timber);
  if (beamY !== null) s.box(x0 - 0.03, beamY - 0.035, z0 - 0.03, x1 + 0.03, beamY + 0.035, z1 + 0.03, timber);
}
