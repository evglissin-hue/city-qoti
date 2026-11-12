// R1E: the six farm trades (kits/farms.ts) at every level, in every district style and season.
import { describe, expect, it } from 'vitest';
import { kitById } from './kits';
import { businessParams } from './kits/business';
import { FARM_LOOKS } from './kits/farms';

const TRADES = [
  ['farmhouse', 'wheat'],
  ['vegetable-plot', 'vegetables'],
  ['orchard', 'apples'],
  ['dairy', 'milk'],
  ['sheep-pasture', 'wool'],
  ['apiary', 'honey'],
] as const;
const LEVELS = [1, 2, 3] as const;
const STYLES = ['brick', 'stone', 'timber', 'plaster'];

function opts(look: string, make: string, level: number, extra: Record<string, unknown> = {}, lod?: 'low') {
  const { seed = 3, season = 1, style = 'brick', ...rest } = extra;
  return {
    seed: seed as number,
    size: [3, 3] as [number, number],
    entrance: [1, 2] as [number, number],
    params: { style, season, ...businessParams(look, make, level), ...rest } as Record<
      string,
      string | number | boolean
    >,
    ...(lod ? { lod } : {}),
  };
}

const farmstead = kitById.get('farmstead')!;

function tris(o: ReturnType<typeof opts>): number {
  return farmstead.build(o).getAttribute('position').count / 3;
}

/** A fingerprint of a build's positions and colors. */
function sig(o: ReturnType<typeof opts>): string {
  const g = farmstead.build(o);
  let a = 0;
  let b = 0;
  const p = g.getAttribute('position').array;
  const c = g.getAttribute('color').array;
  for (let i = 0; i < p.length; i++) a += p[i]! * ((i % 7) + 1);
  for (let i = 0; i < c.length; i++) b += c[i]! * ((i % 5) + 1);
  return `${p.length}:${a.toFixed(3)}:${b.toFixed(3)}`;
}

describe('R1E farm trades', () => {
  it('has a draw for every farm look', () => {
    for (const [look] of TRADES) expect(FARM_LOOKS[look], look).toBeTypeOf('function');
  });

  describe.each(TRADES)('%s', (look, make) => {
    it('stays in budget at every level, style and season, near and far', () => {
      for (const level of LEVELS)
        for (const style of STYLES)
          for (const seed of [1, 2, 3]) {
            const near = tris(opts(look, make, level, { style, seed }));
            const far = tris(opts(look, make, level, { style, seed }, 'low'));
            const tag = `${look} L${level} ${style} seed ${seed}`;
            expect(near, tag).toBeLessThanOrEqual(level === 1 ? 3000 : 4000);
            expect(far, tag).toBeGreaterThan(50);
            expect(far, tag).toBeLessThanOrEqual(250);
          }
      for (const season of [0, 2, 3])
        for (const level of LEVELS) {
          const tag = `${look} L${level} season ${season}`;
          expect(tris(opts(look, make, level, { season })), tag).toBeLessThanOrEqual(
            level === 1 ? 3000 : 4000,
          );
          expect(tris(opts(look, make, level, { season }, 'low')), tag).toBeLessThanOrEqual(250);
        }
    });

    it('grows with its level: the sign from level 2, more land and stock', () => {
      // Level 3 may use lighter trees and fences, so compare the far level, where every part counts once.
      const [t1, t2] = LEVELS.map((l) => tris(opts(look, make, l)));
      expect(t2!).toBeGreaterThan(t1!);
      const [f1, f2, f3] = LEVELS.map((l) => tris(opts(look, make, l, {}, 'low')));
      expect(f2!).toBeGreaterThan(f1!);
      expect(f3!).toBeGreaterThan(f2!);
      expect(farmstead.anchors!(opts(look, make, 1)).sign).toBeUndefined();
      for (const l of [2, 3] as const) {
        const sign = farmstead.anchors!(opts(look, make, l)).sign;
        expect(sign, `${look} L${l}`).toBeDefined();
        expect(sign!.normal).toEqual([0, 0, 1]);
      }
    });

    it('is not the plain farmstead any more', () => {
      expect(sig(opts(look, make, 1))).not.toBe(sig({ ...opts(look, make, 1), params: { style: 'brick' } }));
    });
  });

  it('animals grow with the level: cows 2, 3, 4 and sheep 3, 5, 7, inside their pen', () => {
    for (const [look, make, kind, counts] of [
      ['dairy', 'milk', 'cow', [2, 3, 4]],
      ['sheep-pasture', 'wool', 'sheep', [3, 5, 7]],
    ] as const)
      LEVELS.forEach((level, i) => {
        const animals = farmstead.anchors!(opts(look, make, level)).animals;
        expect(animals?.length, look).toBe(1);
        expect(animals![0]!.kind).toBe(kind);
        expect(animals![0]!.count).toBe(counts[i]);
        const [x0, z0, x1, z1] = animals![0]!.pen;
        expect(x1 - x0).toBeGreaterThan(0.4);
        expect(z1 - z0).toBeGreaterThan(0.4);
        expect(x0).toBeGreaterThanOrEqual(0);
        expect(x1).toBeLessThanOrEqual(3);
        expect(z1).toBeLessThanOrEqual(3);
      });
    expect(farmstead.anchors!(opts('orchard', 'apples', 3)).animals).toBeUndefined();
  });

  it('the seasons show: crops by season, orchard trees by season', () => {
    const garden = (season: number) => sig(opts('vegetable-plot', 'vegetables', 2, { season }));
    expect(garden(0)).not.toBe(garden(1));
    expect(garden(1)).not.toBe(garden(2));
    expect(garden(2)).not.toBe(garden(3));
    const orchard = (season: number) => sig(opts('orchard', 'apples', 2, { season }));
    expect(orchard(1)).not.toBe(orchard(3));
    expect(orchard(0)).not.toBe(orchard(1));
    const grain = (season: number) => sig(opts('farmhouse', 'wheat', 2, { season }));
    expect(grain(0)).not.toBe(grain(1));
  });

  it('the far level still reads: the signature masses draw outside the detail', () => {
    for (const [look, make] of TRADES) {
      const near = tris(opts(look, make, 3));
      const far = tris(opts(look, make, 3, {}, 'low'));
      expect(far, look).toBeLessThan(near / 8);
      expect(far, look).toBeGreaterThan(100);
    }
  });

  it('the old kits still build', () => {
    for (const id of ['farmhouse', 'vegetable-plot', 'orchard', 'dairy', 'sheep-pasture', 'apiary']) {
      const kit = kitById.get(id)!;
      expect(kit, id).toBeDefined();
      expect(kit.build({ seed: 3 }).getAttribute('position').count, id).toBeGreaterThan(0);
      expect(kit.build({ seed: 3, lod: 'low' }).getAttribute('position').count, id).toBeGreaterThan(0);
    }
  });
});
