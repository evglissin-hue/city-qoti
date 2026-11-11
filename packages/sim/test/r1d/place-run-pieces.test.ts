// R1D T2: decor.placeRun with `pieces` places exactly those pieces, all or nothing.
import { describe, expect, it } from 'vitest';
import { DECOR_CAP, TILE_FP } from '../../src/constants';
import { rejection, run } from '../helpers';
import { content } from '@qoti/content';
import { build, standardWorld } from '../hearth/helpers';

const c = (t: number) => t * TILE_FP + TILE_FP / 2;
const gesture = { from: [c(40), c(40)] as [number, number], to: [c(44), c(40)] as [number, number] };

describe('decor.placeRun with pieces', () => {
  it('places mixed point and linear pieces as one command', () => {
    const w = standardWorld();
    const ctx = run(w, {
      t: 'decor.placeRun',
      def: 'lantern',
      ...gesture,
      pieces: [
        { def: 'lantern', fx: c(40), fz: c(40), rot: 0 },
        { def: 'flower-bed', fx: c(42), fz: c(40), rot: 0 },
        { def: 'fence', fx: c(44), fz: c(40), rot: 16 },
      ],
    });
    expect(rejection(ctx)).toBeUndefined();
    expect(w.decor.map((d) => d.def)).toEqual(['lantern', 'flower-bed', 'fence']);
    expect(ctx.events.filter((e) => e.e === 'decor.added')).toHaveLength(3);
  });

  it('is all or nothing: one bad piece places none', () => {
    const w = standardWorld();
    const ctx = run(w, {
      t: 'decor.placeRun',
      def: 'lantern',
      ...gesture,
      pieces: [
        { def: 'lantern', fx: c(40), fz: c(40), rot: 0 },
        { def: 'lantern', fx: c(100), fz: c(40), rot: 0 }, // the river
      ],
    });
    expect(rejection(ctx)).toBe('WATER');
    expect(w.decor).toHaveLength(0);
  });

  it('refuses pieces that crowd each other', () => {
    const w = standardWorld();
    const ctx = run(w, {
      t: 'decor.placeRun',
      def: 'bench',
      ...gesture,
      pieces: [
        { def: 'bench', fx: c(40), fz: c(40), rot: 0 },
        { def: 'bench', fx: c(40) + 20, fz: c(40), rot: 0 },
      ],
    });
    expect(rejection(ctx)).toBe('OCCUPIED');
    expect(w.decor).toHaveLength(0);
  });

  it('refuses unknown defs, empty lists and more than the run limit', () => {
    const w = standardWorld();
    expect(rejection(run(w, { t: 'decor.placeRun', def: 'lantern', ...gesture, pieces: [] }))).toBe(
      'INVALID',
    );
    const unknown = [{ def: 'nope', fx: c(40), fz: c(40), rot: 0 }];
    expect(rejection(run(w, { t: 'decor.placeRun', def: 'lantern', ...gesture, pieces: unknown }))).toBe(
      'INVALID',
    );
    const many = Array.from({ length: 65 }, (_, i) => ({
      def: 'lantern',
      fx: c(2 + (i % 30)),
      fz: c(2 + 2 * Math.floor(i / 30)),
      rot: 0,
    }));
    expect(rejection(run(w, { t: 'decor.placeRun', def: 'lantern', ...gesture, pieces: many }))).toBe(
      'TOO_MANY',
    );
  });

  it('respects the decor cap', () => {
    const w = standardWorld();
    for (let i = 0; i < DECOR_CAP; i++)
      w.decor.push({ id: 5000 + i, def: 'bench', fx: 10, fz: 10, rot: 0, builtBy: 0 });
    const ctx = run(w, {
      t: 'decor.placeRun',
      def: 'lantern',
      ...gesture,
      pieces: [{ def: 'lantern', fx: c(40), fz: c(40), rot: 0 }],
    });
    expect(rejection(ctx)).toBe('TOO_MANY');
  });

  it('charges what the same pieces would cost placed one by one, and refuses when poor', () => {
    const pieces = [
      { def: 'lantern', fx: c(40), fz: c(40), rot: 0 },
      { def: 'lantern', fx: c(42), fz: c(40), rot: 0 },
    ];
    const w = standardWorld();
    const before = w.economy.treasury;
    run(w, { t: 'decor.placeRun', def: 'lantern', ...gesture, pieces });
    const w2 = standardWorld();
    for (const p of pieces) run(w2, { t: 'decor.place', ...p });
    expect(w.economy.treasury).toBe(w2.economy.treasury);
    expect(w.decor).toHaveLength(2);
    if (w.economy.treasury < before) {
      const poor = standardWorld();
      poor.economy.treasury = 0;
      expect(rejection(run(poor, { t: 'decor.placeRun', def: 'lantern', ...gesture, pieces }))).toBeDefined();
      expect(poor.decor).toHaveLength(0);
    }
  });

  it('without pieces behaves as before', () => {
    const w = standardWorld();
    run(w, { t: 'decor.placeRun', def: 'fence', from: [c(30), c(60)], to: [c(30), c(64)] });
    expect(w.decor.length).toBe(4);
    expect(w.decor.every((d) => d.def === 'fence')).toBe(true);
  });

  it('counts the cost of mixed pieces together', () => {
    const w = standardWorld();
    const store = build(w, 'storehouse', 20, 20);
    store.rt!.store[content.goodIndex.get('timber')!] = 6;
    const one = (def: string, x: number) => ({ def, fx: c(x), fz: c(40), rot: 0 });
    const cmd = (pieces: ReturnType<typeof one>[]) => ({
      t: 'decor.placeRun' as const,
      def: pieces[0]!.def,
      ...gesture,
      pieces,
    });
    // Four timber each: either alone fits in six, both together do not.
    expect(rejection(run(standardWorld(), cmd([one('flower-trellis', 40)])))).toBe('CANNOT_AFFORD');
    expect(rejection(run(w, cmd([one('flower-trellis', 40), one('painted-shop-sign', 42)])))).toBe(
      'CANNOT_AFFORD',
    );
    expect(rejection(run(w, cmd([one('flower-trellis', 40)])))).toBeUndefined();
  });
});
