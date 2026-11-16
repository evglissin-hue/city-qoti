/* eslint-disable no-restricted-syntax -- vi.mock factories are async */
// R2C: the evenings' runs (outRun, allOut, stoodThisSeason, seatedSeasons) and the evening.closed event.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldState } from '../../src/contracts';
import { eveningView } from '../../src/view/evening';
import { hamletFixture } from '../fixtures/hamlet';
import { villageFixture } from '../fixtures/village';
import { newCtx, night, resetInjected, type Night } from './harness';

vi.mock('../../src/systems/places/index', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const h = await import('./injected');
  return { ...actual, placeIndex: () => ({ places: h.injected.places, byId: h.injected.byId }) };
});

describe('the evenings runs', () => {
  let state: WorldState;
  let ctx: ReturnType<typeof newCtx>;
  beforeEach(() => {
    resetInjected();
    state = hamletFixture().state;
    ctx = newCtx(state);
  });

  it('counts fair half-out evenings, breaks on a fair evening below half, holds on rain and storm', () => {
    night(state, ctx, { day: 0, grownups: 10, out: 5 });
    night(state, ctx, { day: 1, grownups: 10, out: 9 });
    expect(state.evenings.outRun).toBe(2);
    // A rain evening with nobody out neither counts nor breaks.
    night(state, ctx, { day: 2, weather: 'rain', grownups: 10, out: 0 });
    night(state, ctx, { day: 3, weather: 'storm', grownups: 10, out: 0 });
    expect(state.evenings.outRun).toBe(2);
    // No grown-ups: holds.
    night(state, ctx, { day: 4, grownups: 0, out: 0 });
    expect(state.evenings.outRun).toBe(2);
    night(state, ctx, { day: 5, grownups: 10, out: 4 });
    expect(state.evenings.outRun).toBe(0);
    night(state, ctx, { day: 6, grownups: 10, out: 6 });
    expect(state.evenings.outRun).toBe(1);
  });

  it('counts allOut on fair evenings where every grown-up went out', () => {
    night(state, ctx, { day: 0, grownups: 4, out: 4 });
    night(state, ctx, { day: 1, grownups: 4, out: 3 });
    night(state, ctx, { day: 2, weather: 'rain', grownups: 4, out: 4 });
    night(state, ctx, { day: 3, grownups: 4, out: 4 });
    expect(state.evenings.allOut).toBe(2);
  });

  it('counts evenings someone stood this season, except in a storm, and resets on the last day', () => {
    night(state, ctx, { day: 6, out: 6, stood: 2 });
    night(state, ctx, { day: 7, weather: 'rain', out: 6, stood: 1 });
    night(state, ctx, { day: 8, weather: 'storm', out: 0, stood: 3 });
    night(state, ctx, { day: 9, out: 6, stood: 0 });
    expect(state.evenings.stoodThisSeason).toBe(2);
    night(state, ctx, { day: 10, out: 6 });
    night(state, ctx, { day: 11, out: 6 });
    expect(state.evenings.stoodThisSeason).toBe(0);
    expect(state.evenings.seatedSeasons).toBe(0);
  });

  function season(first: number, each: (day: number) => Night | null): void {
    for (let d = first; d < first + 6; d++) {
      const n = each(d);
      if (n) night(state, ctx, n);
    }
  }

  it('gives a seated season only for six evenings, nobody standing, someone out each non-storm evening', () => {
    season(0, (d) => ({ day: d, out: 5 }));
    expect(state.evenings.seatedSeasons).toBe(1);
    // A storm evening with nobody out does not spoil it.
    season(6, (d) => ({ day: d, out: d === 8 ? 0 : 5, weather: d === 8 ? 'storm' : 'fair' }));
    expect(state.evenings.seatedSeasons).toBe(2);
    // Rain with someone standing spoils it.
    season(12, (d) => ({ day: d, out: 5, stood: d === 14 ? 1 : 0, weather: d === 14 ? 'rain' : 'fair' }));
    expect(state.evenings.seatedSeasons).toBe(2);
    // A fair evening with nobody out spoils it.
    season(18, (d) => ({ day: d, out: d === 19 ? 0 : 5 }));
    expect(state.evenings.seatedSeasons).toBe(2);
    // A missing evening spoils it.
    season(24, (d) => (d === 26 ? null : { day: d, out: 5 }));
    expect(state.evenings.seatedSeasons).toBe(2);
    // The next season starts clean.
    season(30, (d) => ({ day: d, out: 5 }));
    expect(state.evenings.seatedSeasons).toBe(3);
  });

  it('counts nothing when no evening happened today', () => {
    night(state, ctx, { day: 0, grownups: 10, out: 10 });
    expect(state.evenings.allOut).toBe(1);
    const ev = night(state, ctx, { day: 1, noEvening: true });
    expect(ev).toEqual([]);
    expect(state.evenings.outRun).toBe(1);
    expect(state.evenings.allOut).toBe(1);
  });

  it('counts in a Village as in a Hamlet', () => {
    const v = villageFixture().state;
    night(v, newCtx(v), { day: 0, grownups: 10, out: 6 });
    expect(v.evenings.outRun).toBe(1);
  });
});

describe('evening.closed', () => {
  it('goes out once with the edition after an evening, and not before the first', () => {
    resetInjected();
    const state = hamletFixture().state;
    const ctx = newCtx(state);
    expect(state.evenings.tonight.day).toBe(-1);
    expect(night(state, ctx, { day: 0, noEvening: true })).toEqual([]);
    const ev = night(state, ctx, { day: 1, grownups: 8, out: 3 });
    const closed = ev.filter((e: { e: string }) => e.e === 'evening.closed');
    expect(closed.length).toBe(1);
    expect(closed[0]).toEqual({ e: 'evening.closed', v: eveningView(state) });
    expect(eveningView(state)!.tally.out).toBe(3);
  });
});
