/* eslint-disable no-restricted-syntax -- vi.mock factories are async */
// R2C: the gaps pass is cheap (a village's worth of places in well under a millisecond) and
// deterministic (two identical states run through the same evenings end identical).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { villageFixture } from '../fixtures/village';
import { injected, mkPlace, newCtx, night, resetInjected, setPlaces, setRound, stockTreats } from './harness';

vi.mock('../../src/systems/places/index', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const h = await import('./injected');
  return { ...actual, placeIndex: () => ({ places: h.injected.places, byId: h.injected.byId }) };
});
vi.mock('../../src/systems/places/streets', async () => {
  const h = await import('./injected');
  return { streetTiles: (_s: unknown, street: { id: number }) => h.injected.streets.get(street.id) ?? [] };
});

const S = 192;
const clock = (globalThis as unknown as { performance: { now(): number } }).performance;

/** A village with 30 places near its shops, a street along lane A and every stall stocked. */
function town(): WorldState {
  resetInjected();
  const f = villageFixture();
  const state = f.state;
  state.charter.rank = 'village';
  for (const id of f.b.stalls) stockTreats(findById(state.buildings, id)!);
  const list: Place[] = [];
  for (let i = 0; i < 30; i++) {
    const outlets = i % 7 === 0 ? [f.b.stalls[i % 2]!] : [];
    list.push(mkPlace(`seats:${100 + i}`, (46 + (i % 6)) * S + 40 + i * 2, outlets));
  }
  setPlaces(list);
  const tiles: number[] = [];
  for (let x = 32; x <= 96; x++) tiles.push(50 * S + x);
  const id = state.nextId++;
  state.streets.push({ id, anchor: 50 * S + 64, name: 'Lane A' });
  injected.streets.set(id, tiles);
  return state;
}

function evenings(state: WorldState, days: number): void {
  const ctx = newCtx(state);
  const homes = state.households.slice(0, 8);
  for (let d = 0; d < days; d++) {
    const per: Record<string, { v: number; s?: number }> = {};
    for (let i = 0; i < 30; i++)
      per[`seats:${100 + i}`] = { v: (d + i * 3) % 14, s: (d + i) % 5 === 0 ? 1 : 0 };
    for (const h of homes) setRound(state, h.id, (d + h.id) % 3 === 0 ? 'seats:100' : null);
    night(state, ctx, {
      day: d,
      places: per,
      weather: d % 7 === 3 ? 'rain' : 'fair',
      grownups: 20,
      out: 8 + (d % 9),
      stood: d % 5 === 0 ? 1 : 0,
    });
  }
}

describe('the gaps pass', () => {
  let state: WorldState;
  beforeEach(() => {
    state = town();
  });

  it('runs well inside its budget at village scale', () => {
    const ctx = newCtx(state);
    const homes = state.households.slice(0, 8);
    for (const h of homes) setRound(state, h.id, null);
    const per: Record<string, { v: number }> = {};
    for (let i = 0; i < 30; i++) per[`seats:${100 + i}`] = { v: 9 };
    // The budget is well under 1 ms a pass. The bound is generous (2 ms on average, `night` itself
    // included) so a slow shared runner does not flake, and still catches an all-pairs walk.
    // Wall-clock swings by 1.6 to 1.9 times between CI hosts and under load, so one batch says little
    // about the code. Warm up (JIT, caches), then time 5 batches of 200 passes and hold the best
    // batch's per-pass average to the same bound: a real regression makes every batch slow.
    const passes = 200;
    for (let d = 0; d < passes; d++) night(state, ctx, { day: d, grownups: 20, out: 12, places: per });
    let avg = Infinity;
    for (let b = 0; b < 5; b++) {
      const t0 = clock.now();
      for (let d = 0; d < passes; d++) night(state, ctx, { day: d, grownups: 20, out: 12, places: per });
      avg = Math.min(avg, (clock.now() - t0) / passes);
    }
    expect(avg).toBeLessThan(2);
  });

  it('is deterministic: identical states through identical evenings end identical', () => {
    const a = town();
    const b = town();
    evenings(a, 40);
    evenings(b, 40);
    expect(JSON.stringify(a.gaps)).toBe(JSON.stringify(b.gaps));
    expect(JSON.stringify(a.evenings)).toBe(JSON.stringify(b.evenings));
    expect(a.gaps.streaks.length + a.gaps.open.length + a.gaps.closedCount).toBeGreaterThan(0);
  });
});
