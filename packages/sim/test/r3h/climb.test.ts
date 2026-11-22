// R3H: a specialized building climbs after LEVEL_UP_DAYS good days and slides after LEVEL_DOWN_DAYS
// failing ones (levels/specialized.ts, run through the levels pass at its day end), trimming the
// crew on the way down, resting days holding the run, the Chronicle and the events hearing of both.
import { describe, expect, it } from 'vitest';
import type { Building, BusinessCounters, SimEvent, WorldState } from '../../src/contracts';
import { emptyCounters, jobsOf } from '../../src/state/zones';
import { levels, LEVEL_DOWN_DAYS, LEVEL_UP_DAYS } from '../../src/systems/levels';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { hire } from '../ledger/helpers';
import { spot } from './helpers';

/** A day's counters, then the 23:30 pass; the events it pushed. */
function endDay(state: WorldState, b: Building, counters: Partial<BusinessCounters>): SimEvent[] {
  Object.assign((b.counters ??= emptyCounters()), {
    madeToday: 0,
    soldToday: 0,
    customersToday: 0,
    shortToday: false,
    ...counters,
  });
  const ctx = createTickCtx(state);
  levels.tick(state, ctx);
  return ctx.events;
}

const GOOD = { madeToday: 10, soldToday: 9 };
const FAILING = { madeToday: 10, soldToday: 0 };

describe('climbing', () => {
  it('LEVEL_UP_DAYS good days in a row climb one level, and one fewer does not', () => {
    const { state } = hamletFixture();
    const q = spot(state, 'quarry', 120, 100);
    for (let d = 1; d < LEVEL_UP_DAYS; d++) endDay(state, q, GOOD);
    expect(q.level ?? 1).toBe(1);
    expect(q.counters!.levelDays).toBe(LEVEL_UP_DAYS - 1);
    endDay(state, q, GOOD);
    expect(q.level).toBe(2);
    expect(q.counters!.levelDays).toBe(0);
  });

  it('a quiet day resets a run, and so does a failing day at level 1', () => {
    const { state } = hamletFixture();
    const q = spot(state, 'quarry', 120, 100);
    endDay(state, q, GOOD);
    endDay(state, q, GOOD);
    endDay(state, q, {});
    expect(q.counters!.levelDays).toBe(0);
    endDay(state, q, GOOD);
    endDay(state, q, FAILING);
    expect(q.counters!.levelDays).toBe(0);
    expect(q.level ?? 1).toBe(1);
  });

  it('climbs to the top level and no further', () => {
    const { state } = hamletFixture();
    const q = spot(state, 'quarry', 120, 100);
    for (let d = 0; d < 4 * LEVEL_UP_DAYS; d++) endDay(state, q, GOOD);
    expect(q.level).toBe(3);
    expect(q.counters!.levelDays).toBe(0);
  });

  it('a climb pushes building.updated and a specialized-grew entry in the Chronicle', () => {
    const { state } = hamletFixture();
    const q = spot(state, 'quarry', 120, 100);
    let events: SimEvent[] = [];
    for (let d = 0; d < LEVEL_UP_DAYS; d++) events = endDay(state, q, GOOD);
    expect(events.some((e) => e.e === 'building.updated' && e.b.id === q.id)).toBe(true);
    // The fixture's own Windmill serves its baker and climbs beside it: look at the Quarry's entry.
    const grew = state.chronicle.filter((c) => c.kind === 'specialized-grew' && c.refs?.includes(q.id));
    expect(grew).toHaveLength(1);
    expect(grew[0]!.text.toLowerCase()).toContain('quarry');
    expect(state.chronicle.some((c) => c.kind === 'specialized-shrank')).toBe(false);
  });

  it('a day with no climb pushes no building.updated', () => {
    const { state } = hamletFixture();
    const q = spot(state, 'quarry', 120, 100);
    const events = endDay(state, q, GOOD);
    expect(events.some((e) => e.e === 'building.updated' && e.b.id === q.id)).toBe(false);
  });
});

describe('sliding', () => {
  it('LEVEL_DOWN_DAYS failing days in a row slide one level, keeping its walls and trimming the crew', () => {
    const { state } = hamletFixture();
    const lodge = spot(state, 'foresters-lodge', 120, 80, 2);
    hire(state, lodge.id, 4);
    expect(lodge.rt!.workers).toHaveLength(4);
    for (let d = 1; d < LEVEL_DOWN_DAYS; d++) endDay(state, lodge, FAILING);
    expect(lodge.level).toBe(2);
    expect(lodge.counters!.levelDays).toBe(-(LEVEL_DOWN_DAYS - 1));
    const events = endDay(state, lodge, FAILING);
    expect(lodge.level).toBe(1);
    expect(lodge.counters!.levelDays).toBe(0);
    expect(lodge.rt!.workers).toHaveLength(jobsOf(lodge));
    expect(lodge.stage).toBe('built');
    expect(events.some((e) => e.e === 'building.updated' && e.b.id === lodge.id)).toBe(true);
    const shrank = state.chronicle.filter((c) => c.kind === 'specialized-shrank');
    expect(shrank).toHaveLength(1);
    expect(shrank[0]!.refs).toContain(lodge.id);
  });

  it('a quiet day breaks a failing run', () => {
    const { state } = hamletFixture();
    const q = spot(state, 'quarry', 120, 100, 2);
    for (let d = 1; d < LEVEL_DOWN_DAYS; d++) endDay(state, q, FAILING);
    endDay(state, q, {});
    expect(q.counters!.levelDays).toBe(0);
    endDay(state, q, FAILING);
    expect(q.level).toBe(2);
  });

  it('never below level 1', () => {
    const { state } = hamletFixture();
    const q = spot(state, 'quarry', 120, 100);
    for (let d = 0; d < 3 * LEVEL_DOWN_DAYS; d++) endDay(state, q, FAILING);
    expect(q.level ?? 1).toBe(1);
    expect(q.counters!.levelDays).toBe(0);
  });

  it('a level 3 slides to 2, then to 1, a run of failing days at a time', () => {
    const { state } = hamletFixture();
    const q = spot(state, 'quarry', 120, 100, 3);
    for (let d = 0; d < LEVEL_DOWN_DAYS; d++) endDay(state, q, FAILING);
    expect(q.level).toBe(2);
    for (let d = 0; d < LEVEL_DOWN_DAYS; d++) endDay(state, q, FAILING);
    expect(q.level).toBe(1);
  });
});

describe('resting days', () => {
  it('a Fishery while the river is frozen holds its run, either way', () => {
    const { state } = hamletFixture();
    const f = spot(state, 'fishery', 120, 100, 2);
    f.counters!.levelDays = -3;
    state.weather.river.frozen = true;
    for (let d = 0; d < 6; d++) endDay(state, f, { madeToday: 4, soldToday: 0, shortToday: true });
    expect(f.level).toBe(2);
    expect(f.counters!.levelDays).toBe(-3);
    // The counters still reset each night.
    expect(f.counters!.madeToday).toBe(0);
    expect(f.counters!.shortToday).toBe(false);
    // The thaw: the same days count again.
    state.weather.river.frozen = false;
    endDay(state, f, FAILING);
    expect(f.level).toBe(1);

    const g = spot(state, 'fishery', 120, 106);
    g.counters!.levelDays = LEVEL_UP_DAYS - 1;
    state.weather.river.frozen = true;
    endDay(state, g, GOOD);
    expect(g.level ?? 1).toBe(1);
    expect(g.counters!.levelDays).toBe(LEVEL_UP_DAYS - 1);
  });

  it('a Sawmill with its river wheel frozen holds its run', () => {
    const { state } = hamletFixture();
    const mill = spot(state, 'sawmill', 120, 100, 2);
    mill.counters!.levelDays = -2;
    state.weather.river.frozen = true;
    for (let d = 0; d < 6; d++) endDay(state, mill, {});
    expect(mill.level).toBe(2);
    expect(mill.counters!.levelDays).toBe(-2);
  });
});

describe('the counters', () => {
  it('reset after each day end, for every good', () => {
    const { state } = hamletFixture();
    for (const [def, x] of [
      ['quarry', 120],
      ['market-stall', 126],
      ['granary', 132],
      ['windmill', 138],
    ] as const) {
      const b = spot(state, def, x, 100);
      endDay(state, b, { madeToday: 5, soldToday: 5, customersToday: 9, shortToday: true });
      expect(b.counters!.madeToday).toBe(0);
      expect(b.counters!.soldToday).toBe(0);
      expect(b.counters!.customersToday).toBe(0);
      expect(b.counters!.shortToday).toBe(false);
    }
  });
});
