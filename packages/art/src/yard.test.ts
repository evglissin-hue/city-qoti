// V3A: the yard and goods pieces (kits/yard.ts, and the goods pieces at the end of kits/goods.ts).
import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { kitById, kits } from './kits';
import { DISPLAY_GOODS } from './kits/goods';
import { SIGN_EMBLEMS } from './kits/yard';

interface Spec {
  id: string;
  big?: boolean;
  /** Rough size target in tiles: width (x), depth (z), height (y); the box may be 30 percent over. */
  size?: { w?: number; d?: number; h?: number };
}

const SPECS: Spec[] = [
  { id: 'yard-woodpile', size: { w: 0.21, d: 0.18, h: 0.25 } },
  { id: 'yard-nets', big: true, size: { w: 0.7, h: 0.5 } },
  { id: 'yard-loaf-tray', size: { w: 0.3, d: 0.12 } },
  { id: 'yard-cloth-frame', big: true, size: { w: 0.6, h: 0.55 } },
  { id: 'yard-chair-half', size: { w: 0.3 } },
  { id: 'yard-skep', size: { w: 0.16, h: 0.22 } },
  { id: 'yard-pram', size: { d: 0.3 } },
  { id: 'yard-boots', size: { w: 0.12 } },
  { id: 'yard-cat', size: { w: 0.14, d: 0.14 } },
  { id: 'yard-washing-line', big: true, size: { w: 0.9, h: 0.5 } },
  { id: 'yard-sign', size: { h: 0.5 } },
  { id: 'yard-awning', big: true, size: { w: 0.9, d: 0.42 } },
  { id: 'yard-lamp', size: { h: 0.45 } },
  { id: 'yard-sill-lamp', size: { w: 0.08 } },
  { id: 'yard-chopping-block', size: { w: 0.35, h: 0.32 } },
  { id: 'yard-water-butt', size: { w: 0.16, h: 0.24 } },
  { id: 'yard-wheelbarrow', size: { d: 0.35 } },
  { id: 'goods-sacks', size: { w: 0.3 } },
  { id: 'goods-display', big: true, size: { w: 0.55, h: 0.3 } },
  { id: 'goods-churns', size: { w: 0.25 } },
  { id: 'goods-apple-crate', size: { w: 0.22 } },
  { id: 'goods-candle-rack', size: { w: 0.3 } },
  { id: 'goods-fleece', size: { w: 0.3 } },
  { id: 'goods-fish-rack', size: { w: 0.4 } },
];

const tris = (g: BufferGeometry): number => g.getAttribute('position').count / 3;

function bounds(g: BufferGeometry): number[] {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z];
}

const positions = (g: BufferGeometry): number[] => Array.from(g.getAttribute('position').array);

describe('yard and goods pieces (V3A)', () => {
  it('are registered as decor kits', () => {
    for (const { id } of SPECS) {
      const kit = kitById.get(id);
      expect(kit, id).toBeDefined();
      expect(kit!.kind, id).toBe('decor');
    }
  });

  it('keep the registry sorted and unique', () => {
    const ids = kits.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
  });

  for (const spec of SPECS) {
    describe(spec.id, () => {
      const kit = (): NonNullable<ReturnType<typeof kitById.get>> => kitById.get(spec.id)!;
      const variants = (): { seed: number; good?: string; emblem?: string }[] => {
        if (spec.id === 'goods-display') return DISPLAY_GOODS.map((good, i) => ({ seed: i % 4, good }));
        if (spec.id === 'yard-sign') return SIGN_EMBLEMS.map((emblem, i) => ({ seed: i % 4, emblem }));
        return [0, 1, 2, 3, 4, 5, 6, 7].map((seed) => ({ seed }));
      };

      it('builds near and far within the triangle budgets, far lighter than near', () => {
        for (const v of variants()) {
          const params = { ...(v.good ? { good: v.good } : {}), ...(v.emblem ? { emblem: v.emblem } : {}) };
          const near = tris(kit().build({ seed: v.seed, params }));
          const far = tris(kit().build({ seed: v.seed, params, lod: 'low' }));
          const label = `${spec.id} ${v.seed} ${v.good ?? v.emblem ?? ''}`;
          expect(near, label).toBeGreaterThan(0);
          expect(near, `${label} near`).toBeLessThanOrEqual(spec.big ? 320 : 160);
          expect(far, `${label} far`).toBeGreaterThan(0);
          expect(far, `${label} far`).toBeLessThanOrEqual(spec.big ? 40 : 24);
          expect(far, label).toBeLessThan(near);
        }
      });

      it('rests on the ground and fits its size target', () => {
        for (const v of variants()) {
          const params = { ...(v.good ? { good: v.good } : {}), ...(v.emblem ? { emblem: v.emblem } : {}) };
          for (const lod of ['high', 'low'] as const) {
            const b = bounds(kit().build({ seed: v.seed, params, lod }));
            const label = `${spec.id} ${v.seed} ${lod}`;
            expect(b[1]!, label).toBeGreaterThanOrEqual(-0.001);
            expect(b[1]!, label).toBeLessThan(0.01);
            const t = spec.size ?? {};
            if (t.w) expect(b[3]! - b[0]!, `${label} w`).toBeLessThanOrEqual(t.w * 1.3);
            if (t.d) expect(b[5]! - b[2]!, `${label} d`).toBeLessThanOrEqual(t.d * 1.3);
            if (t.h) expect(b[4]!, `${label} h`).toBeLessThanOrEqual(t.h * 1.3);
          }
        }
      });

      it('is deterministic from its options and builds with none', () => {
        const a = positions(kit().build({ seed: 3 }));
        expect(positions(kit().build({ seed: 3 }))).toEqual(a);
        expect(positions(kit().build({ seed: 3, lod: 'low' }))).toEqual(
          positions(kit().build({ seed: 3, lod: 'low' })),
        );
        expect(tris(kit().build())).toBeGreaterThan(0);
      });
    });
  }

  it('keeps a woodpile inside x -0.105 to 0.105 so repeats at 0.22 tile cleanly', () => {
    for (let seed = 0; seed < 8; seed++)
      for (const lod of ['high', 'low'] as const) {
        const b = bounds(kitById.get('yard-woodpile')!.build({ seed, lod }));
        expect(b[0]!).toBeGreaterThanOrEqual(-0.105);
        expect(b[3]!).toBeLessThanOrEqual(0.105);
      }
  });

  it('keeps a goods table a trestle: under half a tile wide and 0.14 deep, to fit a shop front', () => {
    for (const good of DISPLAY_GOODS)
      for (let seed = 0; seed < 4; seed++)
        for (const lod of ['high', 'low'] as const) {
          const b = bounds(kitById.get('goods-display')!.build({ seed, params: { good }, lod }));
          expect(b[3]! - b[0]!, `${good} w`).toBeLessThanOrEqual(0.5);
          expect(b[5]! - b[2]!, `${good} d`).toBeLessThanOrEqual(0.14);
        }
  });

  it('winds every triangle to agree with its vertex normals, so none is culled from its good side', () => {
    const bad: string[] = [];
    for (const { id } of SPECS) {
      const kit = kitById.get(id)!;
      for (const lod of ['high', 'low'] as const)
        for (let seed = 0; seed < 4; seed++) {
          const params =
            id === 'goods-display'
              ? { good: DISPLAY_GOODS[seed % DISPLAY_GOODS.length]! }
              : id === 'yard-sign'
                ? { emblem: SIGN_EMBLEMS[seed % SIGN_EMBLEMS.length]! }
                : {};
          const g = kit.build({ seed, params, lod });
          const pos = g.getAttribute('position');
          const nor = g.getAttribute('normal');
          let flipped = 0;
          for (let t = 0; t < pos.count; t += 3) {
            const [a, b, c] = [t, t + 1, t + 2].map(
              (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)] as [number, number, number],
            ) as [number[], number[], number[]];
            const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
            const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
            const n = [
              u[1]! * v[2]! - u[2]! * v[1]!,
              u[2]! * v[0]! - u[0]! * v[2]!,
              u[0]! * v[1]! - u[1]! * v[0]!,
            ];
            let dot = 0;
            for (let k = 0; k < 3; k++)
              dot +=
                n[0]! * (nor.getX(t + k) / 3) + n[1]! * (nor.getY(t + k) / 3) + n[2]! * (nor.getZ(t + k) / 3);
            if (dot <= 0) flipped++;
          }
          if (flipped > 0)
            bad.push(`${id} ${lod} seed ${seed}: ${flipped} of ${pos.count / 3} triangles flipped`);
        }
    }
    expect(bad).toEqual([]);
  });

  it('lights the lamps: a flame anchor inside the bounding box', () => {
    for (const id of ['yard-lamp', 'yard-sill-lamp']) {
      const kit = kitById.get(id)!;
      for (let seed = 0; seed < 4; seed++) {
        const lights = kit.anchors!({ seed }).lights!;
        expect(lights.length, id).toBe(1);
        const b = bounds(kit.build({ seed }));
        const [x, y, z] = lights[0]!;
        expect(x).toBeGreaterThanOrEqual(b[0]!);
        expect(x).toBeLessThanOrEqual(b[3]!);
        expect(y).toBeGreaterThanOrEqual(b[1]!);
        expect(y).toBeLessThanOrEqual(b[4]!);
        expect(z).toBeGreaterThanOrEqual(b[2]!);
        expect(z).toBeLessThanOrEqual(b[5]!);
        // The flame is lit: some vertex carries glow 2 near that height.
        const g = kit.build({ seed }).getAttribute('glow');
        expect(
          Array.from(g.array).some((v) => v === 2),
          id,
        ).toBe(true);
      }
    }
  });

  it('reads an unknown emblem or good as sundries', () => {
    const sign = kitById.get('yard-sign')!;
    expect(positions(sign.build({ seed: 1, params: { emblem: 'nonsense' } }))).toEqual(
      positions(sign.build({ seed: 1, params: { emblem: 'sundries' } })),
    );
    const display = kitById.get('goods-display')!;
    expect(positions(display.build({ seed: 1, params: { good: 'nonsense' } }))).toEqual(
      positions(display.build({ seed: 1, params: { good: 'sundries' } })),
    );
  });

  it('paints every emblem and stocks every good the rules name', () => {
    for (const g of [
      'bread',
      'cloth',
      'candles',
      'cheese',
      'apples',
      'cider',
      'honey',
      'wool',
      'chair',
      'veg',
      'fish',
      'grain',
      'sundries',
    ]) {
      expect(SIGN_EMBLEMS, g).toContain(g);
      expect(DISPLAY_GOODS, g).toContain(g);
    }
  });
});
