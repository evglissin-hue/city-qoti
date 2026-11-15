// V2C: far-level helpers for small decor. `box` and `cylinder` drop tiny primitives at the far level
// by themselves, which is right for knobs and wrong for a lantern flame or a barrel, so the far
// versions of those draw their faces directly. Call these from the far half of `s.levels(...)`.
import type { ShapeBuilder } from '../geometry';

type V3 = [number, number, number];

/** A far box: all faces except those named in `skip` (default: the bottom), minor or not. */
export function farBox(
  s: ShapeBuilder,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  hex: number,
  skip = 'b',
): void {
  if (!skip.includes('t')) s.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], hex, [0, 1, 0]);
  if (!skip.includes('b')) s.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], hex, [0, -1, 0]);
  if (!skip.includes('f')) s.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], hex, [0, 0, 1]);
  if (!skip.includes('k')) s.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], hex, [0, 0, -1]);
  if (!skip.includes('r')) s.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], hex, [1, 0, 0]);
  if (!skip.includes('l')) s.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], hex, [-1, 0, 0]);
}

/** A far cylinder or cone: sides and a top unless `cap` is false (never a bottom), few sides, minor or not. */
export function farCylinder(
  s: ShapeBuilder,
  cx: number,
  cz: number,
  rBottom: number,
  rTop: number,
  y0: number,
  y1: number,
  hex: number,
  segments = 6,
  phase = 0,
  cap = true,
): void {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2 + phase;
    const a1 = ((i + 1) / segments) * Math.PI * 2 + phase;
    const mid = (a0 + a1) / 2;
    const out: V3 = [Math.cos(mid), 0.3, Math.sin(mid)];
    const b0: V3 = [cx + Math.cos(a0) * rBottom, y0, cz + Math.sin(a0) * rBottom];
    const b1: V3 = [cx + Math.cos(a1) * rBottom, y0, cz + Math.sin(a1) * rBottom];
    const t0: V3 = [cx + Math.cos(a0) * rTop, y1, cz + Math.sin(a0) * rTop];
    const t1: V3 = [cx + Math.cos(a1) * rTop, y1, cz + Math.sin(a1) * rTop];
    if (rTop > 0) {
      s.quad(b0, b1, t1, t0, hex, out);
      if (cap) s.tri([cx, y1, cz], t0, t1, hex, [0, 1, 0]);
    } else s.tri(b0, b1, [cx, y1, cz], hex, out);
  }
}
