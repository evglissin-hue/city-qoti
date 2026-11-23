// R3H: the level-stuck health kind (view/health.ts). A specialized building with levels that failed
// its good day twice the slide's days running (it slid and still fails) and has no route the town can
// take is flagged; where a command could change the reason it stays quiet. Looked at once a game day
// at 23:00, before the day end resets the counters.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import type { Building, BusinessCounters, WorldState } from '../../src/contracts';
import { familyIndex } from '../../src/state/zones';
import { bumpPlaceInputs } from '../../src/systems/places/inputs';
import { dailyOffset } from '../../src/systems/economy/time';
import { LEVEL_DOWN_DAYS } from '../../src/systems/levels';
import { HealthWatch } from '../../src/view/health';
import { hamletFixture } from '../fixtures/hamlet';
import { building } from '../ledger/helpers';
import { place } from '../village/helpers';
import { spot, today } from './helpers';

const RUN = 2 * LEVEL_DOWN_DAYS;

/** Takes a building out of the town (a test's way of saying nobody built it). */
function remove(s: WorldState, id: number): void {
  s.buildings.splice(
    s.buildings.findIndex((b) => b.id === id),
    1,
  );
  bumpPlaceInputs(s);
}

/** The river freezes or thaws (the place index hears of the change). */
function freeze(s: WorldState, frozen: boolean): void {
  s.weather.river.frozen = frozen;
  bumpPlaceInputs(s);
}

/** Stops the carrier buying a good's family. */
function neverBuy(s: WorldState, good: string): void {
  s.carrier.families[familyIndex(content.goodById.get(good)!.family)]!.rule = 'never';
}

/** Day `n` at 23:00: sets the day's counters on the building, looks once, returns the level-stuck flags. */
function lookDay(
  w: HealthWatch,
  s: WorldState,
  n: number,
  b: Building,
  counters: Partial<BusinessCounters>,
  looks = 1,
) {
  s.tick = n * TICKS_PER_DAY + dailyOffset(23, 0);
  today(b, counters);
  const out = [];
  for (let i = 0; i < looks; i++) out.push(...w.check(s));
  return out.filter((i) => i.kind === 'level-stuck' && i.id === b.id);
}

/** Looks `days` days running from day `from`; returns the flags of the last look. */
function lookDays(
  w: HealthWatch,
  s: WorldState,
  from: number,
  days: number,
  b: Building,
  counters: Partial<BusinessCounters>,
) {
  let last: ReturnType<typeof lookDay> = [];
  for (let d = 0; d < days; d++) last = lookDay(w, s, from + d, b, counters);
  return last;
}

const SHORT = { shortToday: true };
const UNCARRIED = { madeToday: 10, soldToday: 0 };

describe('level-stuck: carried', () => {
  it('flags a Brickworks short of firewood a whole slide twice over, with no maker and the carrier on never', () => {
    const f = hamletFixture();
    const s = f.state;
    remove(s, f.b.sawpit);
    neverBuy(s, 'firewood');
    const works = spot(s, 'brickworks', 120, 100, 2);
    const w = new HealthWatch();
    expect(lookDays(w, s, 1, RUN - 1, works, SHORT)).toEqual([]);
    const flags = lookDay(w, s, RUN, works, SHORT);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.text).toContain('brickworks');
    expect(flags[0]!.text).toContain(`#${works.id}`);
    expect(flags[0]!.text).toContain('firewood');
  });

  it('is quiet where a built Lodge makes the firewood, however long it fails', () => {
    const f = hamletFixture();
    const s = f.state;
    neverBuy(s, 'firewood');
    const works = spot(s, 'brickworks', 120, 100, 2);
    const w = new HealthWatch();
    expect(lookDays(w, s, 1, 3 * RUN, works, SHORT)).toEqual([]);
  });

  it('is quiet where the carrier may buy the good', () => {
    const f = hamletFixture();
    const s = f.state;
    remove(s, f.b.sawpit);
    const fuel = s.carrier.families[familyIndex('fuel')]!;
    fuel.rule = 'always';
    const sold = content.neighbors.some((n) => n.sells.some(([x]) => x === 'firewood'));
    const works = spot(s, 'brickworks', 120, 100, 2);
    const w = new HealthWatch();
    // Whether a neighbor sells firewood decides it; where one does the carrier is a route.
    expect(lookDays(w, s, 1, RUN, works, SHORT).length).toBe(sold ? 0 : 1);
  });

  it('flags goods that are made and never carried when no built store takes them', () => {
    const f = hamletFixture();
    const s = f.state;
    const quarry = spot(s, 'quarry', 120, 100, 2);
    const w = new HealthWatch();
    // The hamlet's Storehouse takes stone: that is a route.
    expect(lookDays(w, s, 1, RUN, quarry, UNCARRIED)).toEqual([]);
    remove(s, f.b.storehouse);
    expect(lookDay(w, s, RUN + 1, quarry, UNCARRIED)).toHaveLength(1);
  });

  it('a quiet day, or one good one, starts the run again', () => {
    const f = hamletFixture();
    const s = f.state;
    remove(s, f.b.storehouse);
    const quarry = spot(s, 'quarry', 120, 100, 2);
    const w = new HealthWatch();
    expect(lookDays(w, s, 1, RUN - 1, quarry, UNCARRIED)).toEqual([]);
    expect(lookDay(w, s, RUN, quarry, {})).toEqual([]);
    expect(lookDays(w, s, RUN + 1, RUN - 1, quarry, UNCARRIED)).toEqual([]);
    expect(lookDay(w, s, 2 * RUN, quarry, { madeToday: 10, soldToday: 10 })).toEqual([]);
    expect(lookDays(w, s, 2 * RUN + 1, RUN - 1, quarry, UNCARRIED)).toEqual([]);
    expect(lookDay(w, s, 3 * RUN, quarry, UNCARRIED)).toHaveLength(1);
  });

  it('looks once a day however often it is called, and only at 23:00', () => {
    const f = hamletFixture();
    const s = f.state;
    remove(s, f.b.storehouse);
    const quarry = spot(s, 'quarry', 120, 100, 2);
    const w = new HealthWatch();
    for (let d = 1; d < RUN; d++) expect(lookDay(w, s, d, quarry, UNCARRIED, 5)).toEqual([]);
    // Noon looks do not count at all.
    s.tick = RUN * TICKS_PER_DAY + dailyOffset(12, 0);
    today(quarry, UNCARRIED);
    expect(w.check(s).filter((i) => i.kind === 'level-stuck')).toEqual([]);
    expect(lookDay(w, s, RUN, quarry, UNCARRIED, 3)).toHaveLength(1);
  });

  it('resting days hold the count: a frozen Fishery picks up where it was', () => {
    const f = hamletFixture();
    const s = f.state;
    // No store takes fish: nothing built keeps Food.
    remove(s, f.b.granary);
    remove(s, f.b.stall);
    const fishery = spot(s, 'fishery', 120, 100, 2);
    const w = new HealthWatch();
    expect(lookDays(w, s, 1, 5, fishery, UNCARRIED)).toEqual([]);
    freeze(s, true);
    expect(lookDays(w, s, 6, 6, fishery, UNCARRIED)).toEqual([]);
    freeze(s, false);
    expect(lookDays(w, s, 12, 2, fishery, UNCARRIED)).toEqual([]);
    expect(lookDay(w, s, 14, fishery, UNCARRIED)).toHaveLength(1);
  });
});

describe('level-stuck: customers', () => {
  it('flags a Stall with no home inside its food reach, quiet where homes stand near it', () => {
    const f = hamletFixture();
    const s = f.state;
    const far = spot(s, 'market-stall', 120, 100, 2);
    const w = new HealthWatch();
    const flags = lookDays(w, s, 1, RUN, far, {});
    expect(flags).toHaveLength(1);
    expect(flags[0]!.text).toContain('market-stall');
    expect(flags[0]!.text).toContain('18');

    const g = hamletFixture();
    const near = spot(g.state, 'market-stall', 50, 60, 2);
    expect(lookDays(new HealthWatch(), g.state, 1, 2 * RUN, near, {})).toEqual([]);
  });
});

describe('level-stuck: served', () => {
  it('flags a Windmill whose baker is short of grain no one makes, quiet where a farm is built', () => {
    const f = hamletFixture();
    const s = f.state;
    neverBuy(s, 'grain');
    const mill = building(s, f.b.windmill);
    mill.level = 2;
    const baker = building(s, f.b.bakery);
    const w = new HealthWatch();
    const brief = (n: number) => {
      s.tick = n * TICKS_PER_DAY + dailyOffset(23, 0);
      today(baker, SHORT);
      return w.check(s).filter((i) => i.kind === 'level-stuck' && i.id === mill.id);
    };
    for (let d = 1; d < RUN; d++) expect(brief(d)).toEqual([]);
    const flags = brief(RUN);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.text).toContain('grain');

    // A built grain farm is a route: the grain can be made.
    place(s, 'farmstead', 120, 100, 0, 'grain-farm');
    for (let d = RUN + 1; d < 2 * RUN + 2; d++) expect(brief(d)).toEqual([]);
  });
});

describe('level-stuck: full', () => {
  it('never flags a store: stores keep the room they earned and never fail (the ruling of 2026-11-22)', () => {
    const f = hamletFixture();
    const s = f.state;
    // Nothing in the hamlet but the bakery makes Food: an empty level 2 granary still is no dead end.
    remove(s, f.b.bakery);
    const granary = spot(s, 'granary', 120, 100, 2);
    expect(lookDays(new HealthWatch(), s, 1, 2 * RUN, granary, {})).toEqual([]);
  });
});

describe('level-stuck: the rest', () => {
  it('ignores a building without levels', () => {
    const f = hamletFixture();
    const s = f.state;
    const w = new HealthWatch();
    const well = building(s, f.b.well);
    expect(lookDays(w, s, 1, 3 * RUN, well, {})).toEqual([]);
  });
});
