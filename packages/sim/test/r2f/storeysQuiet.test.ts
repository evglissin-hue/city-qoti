// R2F: the hourly storeys refit on a quiet hour (the master's review: the full refit would not
// survive a Town's lot count). With nothing but tiers and levels moving, only the rows of the
// buildings that changed are refit, and the result is what a full refit finds, over the 40 grids.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { WorldState } from '../../src/contracts';
import { refitStoreys } from '../../src/systems/zoning/storeys';
import { createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { zoneNow } from '../growth/helpers';
import { scene } from './fuzzScene';
import { closedBlockRoads, growSome, paintBlockZones } from './helpers';

/** Every grown building's storeys, in building order. */
const storeys = (s: WorldState): (number | undefined)[] => s.buildings.map((b) => b.storeys);

/** A tiny seeded generator, test-side only. */
function lcg(seed: number): () => number {
  let a = seed * 2246822519 + 7;
  return () => {
    a = (Math.imul(a, 1103515245) + 12345) >>> 0;
    return (a >>> 8) / (1 << 24);
  };
}

describe('the storeys refit on a quiet hour', () => {
  it('refits nothing in a town where nothing changed', () => {
    const s = villageFixture().state;
    closedBlockRoads(s);
    paintBlockZones(s);
    zoneNow(s);
    growSome(s, 20, (l) => l.row !== 0);
    expect(refitStoreys(s, createTickCtx(s)).full).toBe(true);
    for (let hour = 0; hour < 3; hour++) {
      const ctx = createTickCtx(s);
      expect(refitStoreys(s, ctx)).toEqual({ full: false, refit: 0 });
      expect(ctx.events).toEqual([]);
    }
  });

  it('refits a changed building row and finds what a full refit finds, over 40 grids', () => {
    const homes = content.buildings.filter(
      (d) => d.grows?.zone === 'homes-medium' || d.grows?.zone === 'homes-low',
    );
    let touched = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = villageFixture().state;
      const sc = scene(seed, s);
      sc.roads.forEach((f) => f());
      sc.zones.forEach((f) => f());
      zoneNow(s);
      growSome(s, 60);
      refitStoreys(s, null);
      // Tiers and levels move, nothing else: a home swaps its def (as tiers does), a business levels.
      const rnd = lcg(seed);
      const grown = s.buildings.filter((b) => b.lot);
      for (let k = 0; k < 6 && grown.length > 0; k++) {
        const b = grown[Math.floor(rnd() * grown.length)]!;
        const def = content.buildingById.get(b.def);
        if (def?.housing && !content.trades.some((t) => t.building === def.id) && homes.length > 1) {
          const other = homes[Math.floor(rnd() * homes.length)]!;
          b.def = other.id;
        } else b.level = 1 + Math.floor(rnd() * 3);
      }
      const ctx = createTickCtx(s);
      const quick = refitStoreys(s, ctx);
      expect(quick.full, `seed ${seed}`).toBe(false);
      touched += quick.refit;
      const after = storeys(s);
      const fullCtx = createTickCtx(s);
      const full = refitStoreys(s, fullCtx, true);
      expect(full.full).toBe(true);
      expect(storeys(s), `seed ${seed}: the quick refit left a building off`).toEqual(after);
      expect(fullCtx.events, `seed ${seed}`).toEqual([]);
    }
    expect(touched).toBeGreaterThan(40);
  });

  it('refits everything after the lots or buildings moved', () => {
    const s = villageFixture().state;
    closedBlockRoads(s);
    paintBlockZones(s);
    zoneNow(s);
    growSome(s, 6, (l) => l.row !== 0);
    refitStoreys(s, null);
    growSome(s, 2, (l) => l.row !== 0);
    expect(refitStoreys(s, null).full).toBe(true);
    expect(refitStoreys(s, null).full).toBe(false);
  });
});
