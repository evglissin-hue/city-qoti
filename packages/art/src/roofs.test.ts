// P2-A: roofs have no loose slabs: a fascia belongs to a slope that starts at the eaves.
import { describe, expect, it } from 'vitest';
import { seeded, ShapeBuilder, type Lod, type V3 } from './geometry';
import { roofPart, type RoofMaterial, type RoofShape, type RoofSpec } from './kits/roofs';

const SHAPES: RoofShape[] = ['gable', 'hip', 'halfHip', 'gambrel', 'lean'];
const MATERIALS: RoofMaterial[] = ['tile', 'slate', 'thatch', 'shingle'];
const Y0 = 2;
const Y1 = 3.4;

/** Records the quads a roof draws (the near level draws them; the far level draws a plane each). */
class Recorder extends ShapeBuilder {
  readonly quads: V3[][] = [];
  override quad(a: V3, b: V3, c: V3, d: V3, hex: number, outward?: V3): this {
    this.quads.push([a, b, c, d]);
    return super.quad(a, b, c, d, hex, outward);
  }
}

function spec(shape: RoofShape, material: RoofMaterial, ridgeAlongX: boolean, plain: boolean): RoofSpec {
  return {
    shape,
    material,
    x0: 0,
    z0: 0,
    x1: ridgeAlongX ? 4.4 : 3.2,
    z1: ridgeAlongX ? 3.2 : 4.4,
    y0: Y0,
    y1: Y1,
    color: 0x886644,
    trim: 0x443322,
    ridgeAlongX,
    plain,
    rnd: seeded(7),
  };
}

function record(s: RoofSpec, lod: Lod): Recorder {
  const r = new Recorder(lod);
  roofPart(r, s);
  return r;
}

describe('roofs (P2-A)', () => {
  it('hang nothing below the break: no fascia sliver between the eave and the ridge', () => {
    for (const shape of SHAPES)
      for (const material of MATERIALS)
        for (const ridgeAlongX of [true, false])
          for (const plain of [false, true]) {
            const s = spec(shape, material, ridgeAlongX, plain);
            const label = `${shape} ${material} ${ridgeAlongX ? 'x' : 'z'}${plain ? ' plain' : ''}`;
            // A slope draws its underside and then its fascia, which shares the underside's two
            // eave corners. A fascia whose eave sits above the roof's eave line is a slab hanging at
            // a break (a half-hip's upper slopes and end triangles, a gambrel's upper slopes).
            const quads = record(s, 'high').quads;
            const same = (p: V3, q: V3): boolean => p[0] === q[0] && p[1] === q[1] && p[2] === q[2];
            const slivers = quads.filter((q, k) => {
              const prev = quads[k - 1];
              return !!prev && same(q[0]!, prev[0]!) && same(q[1]!, prev[1]!) && q[0]![1] > Y0 + 0.05;
            });
            expect(slivers.length, label).toBe(0);
            // And the near level never reaches lower than its own eave thickness below the eave.
            const near = record(s, 'high');
            let low = Infinity;
            for (const q of near.quads) for (const p of q) low = Math.min(low, p[1]);
            expect(low, label).toBeGreaterThan(Y0 - 0.35);
          }
  });
});
