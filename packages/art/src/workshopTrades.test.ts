// R1E: the five workshop trades and the shop at levels 1 to 3 (kits/workshops.ts, kits/grown.ts).
import { describe, expect, it } from 'vitest';
import { businessParams } from './kits/business';
import { kitById } from './kits';
import { shopOf } from './kits/grown';
import type { KitBuildOptions } from './kits/types';
import { WORKSHOP_LOOKS } from './kits/workshops';

/** Triangles per cell: near at most 3,000 at level 1 and 4,000 at level 3; far at most 250. */
const NEAR = [3000, 4000, 4000] as const;
const FAR = 250;
const STYLES = ['', 'timber', 'stone', 'brick', 'plaster'];
const TRADES: [look: string, good: string][] = [
  ['bakery', 'bread'],
  ['carpenter', 'furniture'],
  ['chandler', 'candles'],
  ['cider-press', 'cider'],
  ['weaver', 'cloth'],
];

function opts(
  look: string,
  good: string | null,
  level: number,
  style: string,
  seed: number,
): KitBuildOptions {
  return {
    seed,
    size: look === 'shop' ? [2, 3] : [3, 3],
    entrance: [1, 2],
    params: { ...(style ? { style } : {}), ...businessParams(look, good, level) },
  };
}

const tris = (kit: string, o: KitBuildOptions): number =>
  kitById.get(kit)!.build(o).getAttribute('position').count / 3;

describe('workshop trades', () => {
  it('has a look for every trade the content names', () => {
    expect(Object.keys(WORKSHOP_LOOKS).sort()).toEqual(TRADES.map(([l]) => l).sort());
  });

  for (const [look, good] of TRADES) {
    it(`${look} builds at levels 1 to 3, near and far, within the budgets`, { timeout: 60000 }, () => {
      for (const style of STYLES)
        for (let seed = 1; seed <= 4; seed++) {
          const near: number[] = [];
          for (const level of [1, 2, 3]) {
            const o = opts(look, good, level, style, seed);
            const n = tris('workshop', o);
            const f = tris('workshop', { ...o, lod: 'low' });
            const tag = `${look} ${style} seed ${seed} level ${level}`;
            expect(n, `${tag} near`).toBeLessThanOrEqual(NEAR[level - 1]!);
            expect(f, `${tag} far`).toBeLessThanOrEqual(FAR);
            expect(f, `${tag} far is not empty`).toBeGreaterThan(40);
            expect(f, `${tag} far is lighter`).toBeLessThan(n);
            near.push(n);
          }
          expect(near[1]!, `${look} ${style} ${seed} level 2 is bigger`).toBeGreaterThan(near[0]!);
          expect(near[2]!, `${look} ${style} ${seed} level 3 is bigger`).toBeGreaterThan(near[1]!);
        }
    });

    it(`${look} gets its painted sign at level 2 and up, not at level 1`, () => {
      const draw = WORKSHOP_LOOKS[look]!;
      expect(draw(opts(look, good, 1, '', 1)).anchors.sign).toBeUndefined();
      for (const level of [2, 3]) {
        const a = draw(opts(look, good, level, '', 1)).anchors;
        expect(a.sign, `${look} level ${level}`).toBeDefined();
        expect(a.sign!.normal).toEqual([0, 0, 1]);
        expect(a.sign!.width).toBeGreaterThan(0.3);
      }
    });

    it(`${look} smokes or lights something`, () => {
      for (const level of [1, 2, 3]) {
        const a = WORKSHOP_LOOKS[look]!(opts(look, good, level, 'brick', 2)).anchors;
        expect((a.smoke?.length ?? 0) + (a.lights?.length ?? 0)).toBeGreaterThan(1);
      }
    });
  }

  it('the old trade kits still build', () => {
    for (const id of ['bakery', 'weaver', 'carpenter', 'chandler', 'cider-press']) {
      const kit = kitById.get(id)!;
      const size = kit.footprint?.size ?? [2, 2];
      const o: KitBuildOptions = { seed: 3, size, entrance: kit.footprint?.entrance ?? [1, 1] };
      expect(tris(id, o), id).toBeGreaterThan(200);
      expect(tris(id, { ...o, lod: 'low' }), id).toBeGreaterThan(20);
    }
  });

  it('a workshop without a look draws the plain grown workshop', () => {
    const o: KitBuildOptions = { seed: 1, size: [3, 3], entrance: [1, 2], params: {} };
    expect(tris('workshop', o)).toBeGreaterThan(500);
  });
});

describe('shop levels', () => {
  const shopOpts = (level: number | null, style = 'brick', seed = 1): KitBuildOptions => ({
    seed,
    size: [2, 3],
    entrance: [1, 2],
    params: { style, ...(level ? businessParams('shop', null, level) : {}) },
  });

  it('level 1 has no fascia name, level 2 and 3 set the fascia sign', () => {
    for (const style of STYLES)
      for (let seed = 1; seed <= 4; seed++) {
        expect(shopOf(shopOpts(1, style, seed)).anchors.sign, `${style} ${seed} level 1`).toBeUndefined();
        for (const level of [2, 3]) {
          const sign = shopOf(shopOpts(level, style, seed)).anchors.sign;
          expect(sign, `${style} ${seed} level ${level}`).toBeDefined();
          expect(sign!.normal).toEqual([0, 0, 1]);
          expect(sign!.width).toBeGreaterThan(0.4);
        }
      }
  });

  it('grows with its level within the budgets, near and far', { timeout: 60000 }, () => {
    for (const style of STYLES)
      for (let seed = 1; seed <= 4; seed++) {
        const n = [1, 2, 3].map((l) => tris('shop', shopOpts(l, style, seed)));
        for (const l of [1, 2, 3]) {
          expect(n[l - 1]!, `${style} ${seed} level ${l}`).toBeLessThanOrEqual(NEAR[l - 1]!);
          expect(
            tris('shop', { ...shopOpts(l, style, seed), lod: 'low' }),
            `${style} ${seed} far`,
          ).toBeLessThanOrEqual(FAR);
        }
        expect(n[1]!).toBeGreaterThan(n[0]!);
        expect(n[2]!).toBeGreaterThan(n[1]!);
      }
  });

  it('without a level it draws as before, with gilt letters and no fascia sign', () => {
    for (let seed = 1; seed <= 4; seed++)
      expect(shopOf(shopOpts(null, 'brick', seed)).anchors.sign).toBeUndefined();
  });
});
