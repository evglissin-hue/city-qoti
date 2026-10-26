// Extra shapes on top of ShapeBuilder for the hamlet kits (C3D): horizontal cylinders for logs
// and wheels, beams between two points, wedges and simple prisms.
import type { ShapeBuilder, V3 } from './geometry';

/** A closed cylinder lying along x from x0 to x1, centered on (y, z). */
export function cylX(
  s: ShapeBuilder,
  x0: number,
  x1: number,
  y: number,
  z: number,
  r: number,
  hex: number,
  seg = 6,
  capHex = hex,
): void {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const p = (x: number, a: number): V3 => [x, y + Math.cos(a) * r, z + Math.sin(a) * r];
    s.quad(p(x0, a0), p(x1, a0), p(x1, a1), p(x0, a1), hex, [0, Math.cos(am), Math.sin(am)]);
    s.tri([x0, y, z], p(x0, a0), p(x0, a1), capHex, [-1, 0, 0]);
    s.tri([x1, y, z], p(x1, a0), p(x1, a1), capHex, [1, 0, 0]);
  }
}

/** A closed cylinder lying along z from z0 to z1, centered on (x, y). */
export function cylZ(
  s: ShapeBuilder,
  z0: number,
  z1: number,
  x: number,
  y: number,
  r: number,
  hex: number,
  seg = 6,
  capHex = hex,
): void {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const p = (z: number, a: number): V3 => [x + Math.sin(a) * r, y + Math.cos(a) * r, z];
    s.quad(p(z0, a0), p(z1, a0), p(z1, a1), p(z0, a1), hex, [Math.sin(am), Math.cos(am), 0]);
    s.tri([x, y, z0], p(z0, a0), p(z0, a1), capHex, [0, 0, -1]);
    s.tri([x, y, z1], p(z1, a0), p(z1, a1), capHex, [0, 0, 1]);
  }
}

/** A square beam of half-width `t` from a to b (posts, braces, rafters, poles). */
export function beam(s: ShapeBuilder, a: V3, b: V3, t: number, hex: number): void {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  if (len < 1e-6) return;
  const f: V3 = [d[0] / len, d[1] / len, d[2] / len];
  const ref: V3 = Math.abs(f[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u: V3 = [f[1] * ref[2] - f[2] * ref[1], f[2] * ref[0] - f[0] * ref[2], f[0] * ref[1] - f[1] * ref[0]];
  const ul = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]);
  u = [(u[0] / ul) * t, (u[1] / ul) * t, (u[2] / ul) * t];
  let v: V3 = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
  const vl = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  v = [(v[0] / vl) * t, (v[1] / vl) * t, (v[2] / vl) * t];
  const c = (p: V3, su: number, sv: number): V3 => [
    p[0] + u[0] * su + v[0] * sv,
    p[1] + u[1] * su + v[1] * sv,
    p[2] + u[2] * su + v[2] * sv,
  ];
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (let i = 0; i < 4; i++) {
    const [s0, t0] = corners[i]!;
    const [s1, t1] = corners[(i + 1) % 4]!;
    const out: V3 = [
      u[0] * (s0 + s1) + v[0] * (t0 + t1),
      u[1] * (s0 + s1) + v[1] * (t0 + t1),
      u[2] * (s0 + s1) + v[2] * (t0 + t1),
    ];
    s.quad(c(a, s0, t0), c(a, s1, t1), c(b, s1, t1), c(b, s0, t0), hex, out);
  }
  s.quad(c(b, -1, -1), c(b, 1, -1), c(b, 1, 1), c(b, -1, 1), hex, f);
  s.quad(c(a, -1, -1), c(a, 1, -1), c(a, 1, 1), c(a, -1, 1), hex, [-f[0], -f[1], -f[2]]);
}

/** A flat panel (both faces) through four points, for cloth, signs and awnings. */
export function panel(s: ShapeBuilder, a: V3, b: V3, c: V3, d: V3, hex: number, back = hex): void {
  const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: V3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  s.quad(a, b, c, d, hex, n);
  s.quad(a, b, c, d, back, [-n[0], -n[1], -n[2]]);
}
