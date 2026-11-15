// P2-E1: a roof reads as one solid roof from every side. At a gable the verge of both slopes is as
// far past the wall as the other and no more than a little, it has thickness, and every face that
// looks down (the soffit) is a deep shade, never the pale color of the top.
import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { seeded, ShapeBuilder, type Lod } from './geometry';
import { shell } from './kits/buildings';
import { roofPart, type RoofMaterial, type RoofShape, type RoofSpec } from './kits/roofs';

const SHAPES: RoofShape[] = ['gable', 'halfHip', 'gambrel', 'lean'];
const MATERIALS: RoofMaterial[] = ['tile', 'slate', 'thatch', 'shingle'];
const LODS: Lod[] = ['high', 'low'];
/** The most any roof reaches past its gable wall, tiles: about 0.08, plus the width of a hip's rolled cap. */
const MAX_VERGE = 0.09;
/** The darkest a face under an overhang may be not to be, and the least thickness a verge may have. */
const SOFFIT_LUMINANCE = 0.045;
const MIN_EDGE = 0.07;

interface Tri {
  p: [number, number, number][];
  n: [number, number, number];
  rgb: [number, number, number];
}

function trisOf(g: BufferGeometry): Tri[] {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const col = g.getAttribute('color');
  const out: Tri[] = [];
  for (let i = 0; i + 2 < pos.count; i += 3)
    out.push({
      p: [0, 1, 2].map((k) => [pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)]) as Tri['p'],
      n: [nor.getX(i), nor.getY(i), nor.getZ(i)],
      rgb: [col.getX(i), col.getY(i), col.getZ(i)],
    });
  return out;
}

function roofSpec(shape: RoofShape, material: RoofMaterial, ridgeAlongX: boolean, plain = false): RoofSpec {
  return {
    shape,
    material,
    x0: 0,
    z0: 0,
    x1: ridgeAlongX ? 4.4 : 3.2,
    z1: ridgeAlongX ? 3.2 : 4.4,
    y0: 2,
    y1: 3.4,
    color: 0xc8a060,
    trim: vary5(),
    ridgeAlongX,
    plain,
    rnd: seeded(7),
  };
}

/** A light timber, as the palette's, so a pale soffit would show. */
function vary5(): number {
  return 0x5a4434;
}

function lum([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function build(spec: RoofSpec, lod: Lod, ao = false): BufferGeometry {
  const s = new ShapeBuilder(lod);
  roofPart(s, spec);
  return s.build(ao);
}

describe('roof verges and soffits (P2-E1)', () => {
  it('reach past a gable wall as far on both slopes, and only a little', () => {
    for (const shape of SHAPES)
      for (const material of MATERIALS)
        for (const ridgeAlongX of [true, false])
          for (const lod of LODS) {
            const label = `${shape} ${material} ${ridgeAlongX ? 'x' : 'z'} ${lod}`;
            const s = new ShapeBuilder(lod);
            const sh = shell(s, {
              x0: 0.4,
              z0: 0.4,
              x1: ridgeAlongX ? 4.4 : 3.2,
              z1: ridgeAlongX ? 3.2 : 4.4,
              base: 0,
              wallH: 1.6,
              wall: 'plaster',
              wallColor: 0xe0d0b0,
              trim: 0x5a4434,
              roof: { shape, material, color: 0xc8a060, rise: 1.1, overhang: 0.3, ridgeAlongX },
              rnd: seeded(3),
            });
            const [wx0, wz0, wx1, wz1] = sh.outer;
            const [w0, w1] = ridgeAlongX ? [wx0, wx1] : [wz0, wz1];
            const cm = ridgeAlongX ? (wz0 + wz1) / 2 : (wx0 + wx1) / 2;
            const r = new ShapeBuilder(lod);
            roofPart(r, sh.roof);
            let past0 = [0, 0];
            let past1 = [0, 0];
            const worst = { all: 0 };
            for (const t of trisOf(r.build(false))) {
              const a = t.p.map((v) => (ridgeAlongX ? v[0] : v[2]));
              const c = t.p.reduce((m, v) => m + (ridgeAlongX ? v[2] : v[0]), 0) / 3;
              const lo = w0 - Math.min(...a);
              const hi = Math.max(...a) - w1;
              worst.all = Math.max(worst.all, lo, hi);
              if (Math.abs(c - cm) < 0.12) continue;
              const side = c < cm ? 0 : 1;
              past0[side] = Math.max(past0[side]!, lo);
              past1[side] = Math.max(past1[side]!, hi);
            }
            expect(worst.all, label).toBeLessThanOrEqual(MAX_VERGE + 1e-6);
            expect(past0[0]!, label).toBeCloseTo(past0[1]!, 6);
            expect(past1[0]!, label).toBeCloseTo(past1[1]!, 6);
            past0 = past1 = [];
          }
  });

  it('shade every face that looks down: the soffit is never the pale color of the top', () => {
    for (const shape of SHAPES)
      for (const material of MATERIALS)
        for (const ridgeAlongX of [true, false])
          for (const lod of LODS)
            for (const plain of [false, true]) {
              const label = `${shape} ${material} ${ridgeAlongX ? 'x' : 'z'} ${lod}${plain ? ' plain' : ''}`;
              // Broad faces only: the thin strips (course risers, the eave fascia) face down the slope
              // and are the roof's own lips, lit like the top on purpose.
              const down = trisOf(build(roofSpec(shape, material, ridgeAlongX, plain), lod)).filter(
                (t) => t.n[1] < -0.2 && altitude(t) > 0.3,
              );
              // The far level leaves out the soffit (nothing sees it from above); it must not draw a pale one.
              if (lod === 'high') expect(down.length, label).toBeGreaterThan(0);
              for (const t of down) expect(lum(t.rgb), label).toBeLessThanOrEqual(SOFFIT_LUMINANCE);
            }
  });

  it('give the verge thickness on both slopes, at both ends, on both levels', () => {
    for (const shape of SHAPES)
      for (const material of MATERIALS)
        for (const ridgeAlongX of [true, false])
          for (const lod of LODS) {
            const spec = roofSpec(shape, material, ridgeAlongX);
            const label = `${shape} ${material} ${ridgeAlongX ? 'x' : 'z'} ${lod}`;
            const tris = trisOf(build(spec, lod));
            const A = (v: number[]): number => (ridgeAlongX ? v[0]! : v[2]!);
            const C = (v: number[]): number => (ridgeAlongX ? v[2]! : v[0]!);
            const [a0, a1] = ridgeAlongX ? [spec.x0, spec.x1] : [spec.z0, spec.z1];
            const [c0, c1] = ridgeAlongX ? [spec.z0, spec.z1] : [spec.x0, spec.x1];
            // A lean-to has one slope, but its two ends are edged like a gable's.
            for (const ae of [a0, a1])
              for (const cs of [c0 + 0.12 * (c1 - c0), c1 - 0.12 * (c1 - c0)]) {
                const faces = tris.filter((t) => t.p.every((v) => Math.abs(A(v) - ae) < 0.02));
                let covered = 0;
                const step = 0.004;
                for (let y = 1; y < 4.5; y += step) {
                  const hit = faces.some((t) => inside(t, cs, y, C));
                  if (hit) covered += step;
                }
                expect(covered, `${label} at ${ae} across ${cs.toFixed(2)}`).toBeGreaterThanOrEqual(MIN_EDGE);
              }
          }
  });
});

/** The triangle's smallest height: its area over its longest edge. */
function altitude(t: Tri): number {
  const [p, q, r] = t.p;
  const e = (a: number[], b: number[]): number[] => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
  const len = (v: number[]): number => Math.hypot(v[0]!, v[1]!, v[2]!);
  const u = e(q!, p!);
  const v = e(r!, p!);
  const area =
    0.5 * len([u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]);
  return (2 * area) / Math.max(len(u), len(v), len(e(r!, q!)));
}

/** Is (c, y) inside the triangle's shadow on the plane across the ridge? */
function inside(t: Tri, c: number, y: number, C: (v: number[]) => number): boolean {
  const [p, q, r] = t.p.map((v) => [C(v), v[1]]) as [number, number][];
  const d = (a: [number, number], b: [number, number]): number =>
    (c - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (y - b[1]);
  const d1 = d(p!, q!);
  const d2 = d(q!, r!);
  const d3 = d(r!, p!);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
