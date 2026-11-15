// V2B: ivy, garden hedges and the reed bed laid in dabs (`kits/details.ts`, `kits/greens.ts`). The
// helpers run inside building kits that draw everything after them from the same random stream, so
// the hard constraint is that they draw exactly as many times as the code they replaced: the
// reference bodies below are copies of today's, and the tests compare draw counts and far levels.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Dabs from './dabs';
import { seeded, ShapeBuilder, vary, type Lod } from './geometry';
import { kitById } from './kits';
import { hedgeRun, ivyPart, IVY, IVY_LIGHT } from './kits/details';
import { facePoint, type Face } from './kits/parts';
import { SURFACE } from './surface';

const dabCalls: { size: number; lift?: number | undefined; count: number }[] = [];
vi.mock('./dabs', async (importOriginal) => {
  const real = await importOriginal<typeof Dabs>();
  return {
    ...real,
    brushDabs: (...args: Parameters<typeof real.brushDabs>) => {
      dabCalls.push({ size: args[2].size, lift: args[2].lift, count: args[2].count });
      return real.brushDabs(...args);
    },
  };
});
afterEach(() => (dabCalls.length = 0));

/** A random stream that counts its draws. */
function counted(seed: number): { rnd: () => number; draws: () => number } {
  const base = seeded(seed);
  let n = 0;
  return {
    rnd: () => {
      n++;
      return base();
    },
    draws: () => n,
  };
}

/** Today's ivy (before V2B), as the reference for draws and nothing else. */
function refIvy(s: ShapeBuilder, f: Face, u0: number, u1: number, top: number, rnd: () => number): void {
  s.nearOnly(() => {
    s.surface(SURFACE.leaf);
    const n = Math.max(4, Math.round((u1 - u0) * 9 + top * 7));
    for (let i = 0; i < n; i++) {
      const t = rnd();
      const y = 0.04 + Math.sqrt(t) * top;
      const spread = (1 - (y / top) * 0.6) * (u1 - u0);
      const u = u0 + (u1 - u0) * 0.5 + (rnd() - 0.5) * spread;
      const p = facePoint(f, u, y, 0.03);
      const r = 0.045 + rnd() * 0.04;
      s.blob(p[0], p[1], p[2], r, r * 0.9, r, vary(rnd() < 0.5 ? IVY : IVY_LIGHT, rnd, 0.8), 0);
    }
    s.surface(SURFACE.plain);
  });
}

/** Today's hedge run (before V2B). */
function refHedge(s: ShapeBuilder, a: [number, number], b: [number, number], rnd: () => number): void {
  const w = 0.075;
  const x0 = Math.min(a[0], b[0]) - (a[0] === b[0] ? w : 0);
  const x1 = Math.max(a[0], b[0]) + (a[0] === b[0] ? w : 0);
  const z0 = Math.min(a[1], b[1]) - (a[1] === b[1] ? w : 0);
  const z1 = Math.max(a[1], b[1]) + (a[1] === b[1] ? w : 0);
  s.rbox(x0, 0, z0, x1, 0.17, z1, vary(0x4f7d3a, rnd, 0.5), 0.04);
  const len = Math.max(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 0.14));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[1] + (b[1] - a[1]) * t;
    s.blob(x, 0.17, z, 0.07, 0.035, 0.07, vary(0x5f8c45, rnd, 0.7), 0, rnd, 0.2);
  }
}

const LODS: Lod[] = ['high', 'low'];
const FACES: Face[] = [
  { dir: 'z+', plane: 1.2 },
  { dir: 'x-', plane: 0.3 },
  { dir: 'x+', plane: 2 },
];
const RUNS: [[number, number], [number, number]][] = [
  [
    [0, 0],
    [0.3, 0],
  ],
  [
    [0.2, 1],
    [1.9, 1],
  ],
  [
    [0.5, 0.2],
    [0.5, 2.4],
  ],
];

function leafTriangles(b: ShapeBuilder): number {
  const surface = b.build(false).getAttribute('surface');
  let n = 0;
  for (let v = 0; v < surface.count; v += 3) if (surface.getX(v) === SURFACE.leaf) n++;
  return n;
}

describe('V2B ivy and hedge dabs', () => {
  it('ivyPart draws from the stream exactly as before, at both levels', () => {
    for (const lod of LODS) {
      for (const f of FACES) {
        for (const [u0, u1, top] of [
          [0.1, 0.4, 0.85],
          [0.2, 0.55, 1.3],
          [0.05, 0.95, 1.2],
          [0, 0.1, 0.2],
        ] as const) {
          const a = counted(5);
          const b = counted(5);
          ivyPart(new ShapeBuilder(lod), f, u0, u1, top, a.rnd);
          refIvy(new ShapeBuilder(lod), f, u0, u1, top, b.rnd);
          expect(a.draws(), `${lod} ${f.dir} ${u0}`).toBe(b.draws());
          expect(a.rnd()).toBe(b.rnd());
        }
      }
    }
  });

  it('hedgeRun draws from the stream exactly as before, at both levels', () => {
    for (const lod of LODS) {
      for (const [p, q] of RUNS) {
        const a = counted(9);
        const b = counted(9);
        hedgeRun(new ShapeBuilder(lod), p, q, a.rnd);
        refHedge(new ShapeBuilder(lod), p, q, b.rnd);
        expect(a.draws(), `${lod} ${p}`).toBe(b.draws());
        expect(a.rnd()).toBe(b.rnd());
      }
    }
  });

  it('the far hedge is byte for byte what it was', () => {
    for (const [p, q] of RUNS) {
      const a = new ShapeBuilder('low');
      const b = new ShapeBuilder('low');
      hedgeRun(a, p, q, seeded(3));
      refHedge(b, p, q, seeded(3));
      const ga = a.build(false);
      const gb = b.build(false);
      for (const name of ['position', 'normal', 'color', 'surface']) {
        expect(Array.from(ga.getAttribute(name).array), name).toEqual(
          Array.from(gb.getAttribute(name).array),
        );
      }
    }
  });

  it('the far ivy writes nothing, as before', () => {
    const s = new ShapeBuilder('low');
    ivyPart(s, FACES[0]!, 0.1, 0.4, 0.85, seeded(1));
    expect(s.triangles).toBe(0);
  });

  it('near, the ivy and the hedge add leaf dabs', () => {
    const ivyNow = new ShapeBuilder('high');
    ivyPart(ivyNow, FACES[0]!, 0.1, 0.5, 1, seeded(2));
    const ivyOld = new ShapeBuilder('high');
    refIvy(ivyOld, FACES[0]!, 0.1, 0.5, 1, seeded(2));
    expect(ivyNow.triangles).toBeGreaterThan(0);
    expect(leafTriangles(ivyNow)).toBe(ivyNow.triangles);
    const hedgeNow = new ShapeBuilder('high');
    hedgeRun(hedgeNow, [0, 0], [1.5, 0], seeded(2));
    const hedgeOld = new ShapeBuilder('high');
    refHedge(hedgeOld, [0, 0], [1.5, 0], seeded(2));
    expect(leafTriangles(hedgeNow)).toBeGreaterThan(leafTriangles(hedgeOld));
    expect(leafTriangles(hedgeNow)).toBeGreaterThan(20);
  });
});

describe('V2B grown homes with ivy and a hedge', () => {
  const SIZES: [number, number][] = [
    [3, 3],
    [2, 3],
    [3, 2],
    [2, 2],
  ];
  /** A home whose near build lays both ivy dabs (size 0.068) and hedge dabs (size 0.09). */
  function find(): { id: string; seed: number; size: [number, number]; style: string } | null {
    for (const id of ['cottage', 'townhouse']) {
      for (const style of ['stone', 'timber']) {
        for (const size of SIZES) {
          for (let seed = 1; seed < 300; seed++) {
            dabCalls.length = 0;
            kitById
              .get(id)!
              .build({ seed, lod: 'high', size, entrance: [1, size[1] - 1], params: { style } });
            const ivy = dabCalls.some((c) => c.size === 0.068);
            const hedge = dabCalls.some((c) => c.size === 0.09);
            dabCalls.length = 0;
            if (ivy && hedge) return { id, seed, size, style };
          }
        }
      }
    }
    return null;
  }

  it('builds at both levels with the same attributes, and the far level is unchanged', () => {
    // Found once with `find()` (a stone-district cottage with ivy and a garden hedge).
    const id = 'cottage';
    const style = 'stone';
    const seed = 12;
    const size: [number, number] = [3, 3];
    const kit = kitById.get(id)!;
    const opts = { seed, size, entrance: [1, size[1] - 1] as [number, number], params: { style } };
    const near = kit.build({ ...opts, lod: 'high' });
    const far = kit.build({ ...opts, lod: 'low' });
    const names = Object.keys(near.attributes).sort();
    expect(Object.keys(far.attributes).sort()).toEqual(names);
    expect(near.getAttribute('position').count).toBeGreaterThan(far.getAttribute('position').count);
    // The far level, as recorded before V2B: its size and a checksum of its positions.
    const pos = far.getAttribute('position').array;
    let sum = 0;
    for (let i = 0; i < pos.length; i++) sum += pos[i]! * ((i % 7) + 1);
    expect({
      id,
      style,
      seed,
      size,
      count: far.getAttribute('position').count,
      sum: Math.round(sum * 1000) / 1000,
    }).toEqual(FAR_SNAPSHOT);
    expect(find()).toEqual({ id, seed, size, style });
  });
});

describe('V2B reed bed', () => {
  it('keeps its far level and lays upright dabs near', () => {
    const kit = kitById.get('reed-bed')!;
    const near = kit.build({ lod: 'high', seed: 163 });
    const far = kit.build({ lod: 'low', seed: 163 });
    expect(Object.keys(near.attributes).sort()).toEqual(Object.keys(far.attributes).sort());
    expect(far.getAttribute('position').count).toBeLessThan(near.getAttribute('position').count);
    expect(dabCalls.some((c) => c.lift === 1 && c.count === 42)).toBe(true);
  });
});

const FAR_SNAPSHOT = { id: 'cottage', style: 'stone', seed: 12, size: [3, 3], count: 261, sum: 3592.158 };
