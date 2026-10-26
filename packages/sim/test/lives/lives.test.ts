// Life events on the village fixture (C4D): couples and moving in together, weddings at the
// festival or on a chosen day, births, apprenticeships, retiring and the seaside. Nobody dies.
// The life passes are called directly (lifeMorning, lifeEvening) with the clock moved by hand, so
// no other system runs; the walk to the gate uses the residents and movement systems with the
// Ledger's systems off (the residents runner's default).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import {
  APPRENTICE_DAYS,
  DAYS_PER_SEASON,
  DAYS_PER_YEAR,
  FESTIVAL,
  PENNIES_PER_COIN,
  SEASIDE_YEARS,
  TICKS_PER_DAY,
} from '../../src/constants';
import type { Resident, SimEvent, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { morningPass, settleHousehold } from '../../src/systems/residents/lifecycle';
import {
  isApprentice,
  isTrained,
  lifeEvening,
  lifeMorning,
  rotation,
} from '../../src/systems/residents/life';
import { dayIndex } from '../../src/systems/residents/time';
import { createTickCtx, type SimCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { runner, ticks, until } from '../residents/helpers';
import { befriend, eventsOf, placeTest, resident, skip, testDef, withTestBuilding } from './helpers';

/** Member k (0, 1 adults; 2 young; 3 child) of fixture household n. */
function member(f: ReturnType<typeof villageFixture>, n: number, k: number): Resident {
  const h = findById(f.state.households, f.households[n]!)!;
  return resident(f.state, h.members[k]!);
}

/** Runs the morning life pass once a day until `done` holds (at most `days`); returns the days run. */
function mornings(state: WorldState, ctx: SimCtx, done: () => boolean, days: number): number {
  for (let d = 1; d <= days; d++) {
    skip(state, TICKS_PER_DAY);
    lifeMorning(state, ctx);
    if (done()) return d;
  }
  return -1;
}

function lifeEvents(ctx: SimCtx, kind: string): Extract<SimEvent, { e: 'life.event' }>[] {
  return eventsOf(ctx.events, 'life.event').filter((e) => e.kind === kind);
}

describe('couples', () => {
  it('close friends become a couple and take a vacant home together', () => {
    const f = villageFixture();
    const s = f.state;
    const before = moneySnapshot(s);
    const a = member(f, 7, 2);
    const b = member(f, 8, 2);
    befriend(a, b, 5);
    const households = s.households.length;
    const ctx = createTickCtx(s);
    expect(mornings(s, ctx, () => !!a.partner, 12)).toBeGreaterThan(0);
    expect(a.partner).toBe(b.id);
    expect(b.partner).toBe(a.id);
    // The only vacant home in the fixture is the grown cottage.
    expect(a.householdId).toBe(b.householdId);
    const h = findById(s.households, a.householdId)!;
    expect(h.homeId).toBe(f.b.grown);
    expect(h.family).toBe(`${a.family}-${b.family}`);
    expect(h.savings).toBeGreaterThan(0);
    expect(s.households).toHaveLength(households + 1);
    expect(s.village.couples).toBe(1);
    const [event] = lifeEvents(ctx, 'couple');
    expect(event!.residents).toEqual([a.id, b.id]);
    expect(event!.text).toContain(a.given);
    expect(event!.text).toContain('cottage');
    expectMoneyInvariant(before, s);
  });

  it('needs closeness, compatibility and no family ties', () => {
    const f = villageFixture();
    const s = f.state;
    const a = member(f, 7, 2);
    const b = member(f, 8, 2);
    befriend(a, b, 2); // neither is Romantic, so plain friends are not enough
    const sibling = member(f, 7, 3);
    befriend(a, sibling, 5);
    const ctx = createTickCtx(s);
    expect(mornings(s, ctx, () => !!a.partner, 10)).toBe(-1);
  });

  it('a resident living alone moves into their partner home when there is a bed', () => {
    const f = villageFixture();
    const s = f.state;
    const ctx = createTickCtx(s);
    const single = settleHousehold(s, ctx, f.b.grown, 'fox', ['adult']);
    single.savings = 10 * PENNIES_PER_COIN;
    const before = moneySnapshot(s);
    const loner = resident(s, single.members[0]!);
    loner.traits = ['cheerful', 'generous'];
    const romantic = member(f, 9, 2); // the fixture gives this one Romantic
    expect(romantic.traits).toContain('romantic');
    befriend(loner, romantic, 4);
    const house = findById(s.households, romantic.householdId)!;
    const savings = house.savings;
    expect(mornings(s, ctx, () => !!loner.partner, 12)).toBeGreaterThan(0);
    expect(loner.householdId).toBe(house.id);
    expect(house.members).toContain(loner.id);
    expect(house.members).toHaveLength(5);
    expect(findById(s.households, single.id)).toBeUndefined();
    expect(house.savings).toBe(savings + 10 * PENNIES_PER_COIN);
    expect(eventsOf(ctx.events, 'household.removed').map((e) => e.id)).toContain(single.id);
    expectMoneyInvariant(before, s);
  });

  it('households arrive with their grown-ups already married', () => {
    const f = villageFixture();
    const ctx = createTickCtx(f.state);
    const h = settleHousehold(f.state, ctx, f.b.grown, 'otter', ['adult', 'adult', 'child']);
    const [a, b, c] = h.members.map((id) => resident(f.state, id));
    expect(a!.partner).toBe(b!.id);
    expect(b!.partner).toBe(a!.id);
    expect(a!.marriedDay).toBeGreaterThan(0);
    expect(c!.partner).toBeUndefined();
  });
});

describe('weddings', () => {
  function couple(romantic: boolean) {
    const f = villageFixture();
    const s = f.state;
    const a = member(f, romantic ? 9 : 7, 2);
    const b = member(f, romantic ? 7 : 8, 2);
    befriend(a, b, 5);
    const ctx = createTickCtx(s);
    mornings(s, ctx, () => !!a.partner, 12);
    expect(a.partner).toBe(b.id);
    return { f, s, a, b, ctx };
  }

  it('a Romantic couple marries on a day of their own choosing', () => {
    const { s, a, b, ctx } = couple(true);
    lifeEvening(s, ctx);
    expect(a.marriedDay).toBeUndefined();
    skip(s, 2 * TICKS_PER_DAY);
    lifeEvening(s, ctx);
    expect(a.marriedDay).toBe(dayIndex(s.tick));
    expect(b.marriedDay).toBe(a.marriedDay);
    expect(s.village.weddings).toBe(1);
    const entry = s.chronicle.find((c) => c.kind === 'wedding')!;
    expect(entry.text).toContain(a.given);
    expect(entry.text).toContain(b.given);
    expect(lifeEvents(ctx, 'wedding')[0]!.text).toBe(entry.text);
    expect(a.modifiers.some((m) => m.kind === 'wedding')).toBe(true);
  });

  it('everyone else waits for the festival', () => {
    const { s, a, ctx } = couple(false);
    // Walk the evenings until the season's festival day; the wedding is that evening, not before.
    let married = -1;
    for (let d = 0; d < 2 * DAYS_PER_SEASON && married < 0; d++) {
      skip(s, TICKS_PER_DAY);
      lifeEvening(s, ctx);
      if (a.marriedDay) married = dayIndex(s.tick);
    }
    expect(married % DAYS_PER_SEASON).toBe(FESTIVAL.day - 1);
    expect(s.chronicle.find((c) => c.kind === 'wedding')!.text).not.toContain('{');
  });
});

describe('births', () => {
  it('a married couple with a spare bed and a good mood has a child', () => {
    const f = villageFixture();
    const s = f.state;
    const a = member(f, 10, 0);
    const b = member(f, 10, 1);
    a.partner = b.id;
    b.partner = a.id;
    a.marriedDay = b.marriedDay = 1;
    a.mood = b.mood = 75;
    const h = findById(s.households, a.householdId)!;
    const ctx = createTickCtx(s);
    expect(mornings(s, ctx, () => s.village.births > 0, 200)).toBeGreaterThan(0);
    const child = s.residents.find((r) => r.parents?.includes(a.id))!;
    expect(child.stage).toBe('child');
    expect(child.parents).toEqual([a.id, b.id]);
    expect(child.bornDay).toBe(dayIndex(s.tick));
    expect(h.members).toContain(child.id);
    expect(child.family).toBe(a.family);
    expect(child.traits.length).toBeGreaterThanOrEqual(1);
    const entry = s.chronicle.find((c) => c.kind === 'birth')!;
    expect(entry.text).toContain(child.given);
    expect(eventsOf(ctx.events, 'resident.added').some((e) => e.r.id === child.id)).toBe(true);
    // The house is full now (five beds): no second child.
    const births = s.village.births;
    mornings(s, ctx, () => false, 30);
    expect(s.village.births).toBe(births);
  });

  it('nobody has a child without a spare bed', () => {
    const f = villageFixture();
    const s = f.state;
    const a = member(f, 0, 0); // a cottage of four: full
    const b = member(f, 0, 1);
    a.partner = b.id;
    b.partner = a.id;
    a.marriedDay = b.marriedDay = 1;
    const ctx = createTickCtx(s);
    expect(mornings(s, ctx, () => s.village.births > 0, 60)).toBe(-1);
  });
});

describe('work: apprentices and retiring', () => {
  it('young residents apprentice at a workshop once a school is open, then finish a season later', () => {
    const school = testDef('test-school', ['school']);
    const restore = withTestBuilding(school);
    try {
      const f = villageFixture();
      const s = f.state;
      const ctx = createTickCtx(s);
      lifeMorning(s, ctx);
      expect(s.residents.some((r) => r.apprentice)).toBe(false);
      placeTest(s, school, 88, 60);
      // A woodcutter with two open jobs, so a young porter can move to a workshop.
      placeTest(s, content.buildingById.get('woodcutter')!, 88, 64);
      skip(s, TICKS_PER_DAY);
      lifeMorning(s, ctx);
      const learners = s.residents.filter((r) => r.apprentice);
      expect(learners.length).toBeGreaterThanOrEqual(1);
      for (const r of learners) {
        expect(r.stage).toBe('young');
        expect(r.jobId).toBe(r.apprentice!.at);
        expect(content.buildingById.get(r.apprentice!.trade)!.tags).toContain('workshop');
        expect(isApprentice(s, r)).toBe(true);
      }
      expect(lifeEvents(ctx, 'apprentice')).toHaveLength(learners.length);
      skip(s, APPRENTICE_DAYS * TICKS_PER_DAY);
      lifeMorning(s, ctx);
      for (const r of learners) {
        expect(isTrained(s, r)).toBe(true);
        expect(r.history.some((h) => h.kind === 'trained')).toBe(true);
      }
    } finally {
      restore();
    }
  });

  it('a worker who becomes an elder retires from their job', () => {
    const f = villageFixture();
    const s = f.state;
    const worker = member(f, 0, 0);
    expect(worker.jobId).toBe(f.b.townHall);
    worker.bornDay = dayIndex(s.tick) + 1 - 15 * DAYS_PER_YEAR;
    const ctx = createTickCtx(s);
    skip(s, TICKS_PER_DAY);
    morningPass(s);
    lifeMorning(s, ctx);
    expect(worker.stage).toBe('elder');
    expect(worker.retired).toBe(true);
    expect(worker.jobId).toBe(0);
    expect(findById(s.buildings, f.b.townHall)!.rt!.workers).not.toContain(worker.id);
    expect(lifeEvents(ctx, 'retired')[0]!.text).toContain('town hall');
  });
});

describe('the seaside', () => {
  it('elders past twenty years go to live by the sea together, savings and all', () => {
    const f = villageFixture();
    const s = f.state;
    const a = member(f, 0, 0);
    const b = member(f, 0, 1);
    for (const r of [a, b]) {
      r.stage = 'elder';
      r.bornDay = -SEASIDE_YEARS * DAYS_PER_YEAR - 10;
    }
    a.partner = b.id;
    b.partner = a.id;
    const h = findById(s.households, a.householdId)!;
    const savings = h.savings;
    const before = moneySnapshot(s);
    const ctx = createTickCtx(s);
    expect(mornings(s, ctx, () => s.village.seaside > 0, 60)).toBeGreaterThan(0);
    expect(s.village.seaside).toBe(2);
    expect(a.activity.kind).toBe('leave');
    expect(b.activity.kind).toBe('leave');
    expect(h.savings).toBe(savings - Math.floor(savings / 2));
    expectMoneyInvariant(before, s);
    const entry = s.chronicle.find((c) => c.kind === 'seaside')!;
    expect(entry.text).toContain(`${a.given} and ${b.given} ${a.family}`);
    expect(lifeEvents(ctx, 'seaside')[0]!.residents).toEqual([a.id, b.id]);

    // They walk out through the valley gate; the young ones stay at home.
    const run = runner(s);
    expect(until(run, () => !findById(s.residents, a.id) && !findById(s.residents, b.id), 4000)).toBe(true);
    expect(findById(s.households, h.id)!.members).toHaveLength(2);
  });

  it('nobody dies: a village runs four days and only ever loses residents to the road', () => {
    const f = villageFixture();
    const s = f.state;
    const run = runner(s, { all: true });
    const start = s.residents.length;
    ticks(run, 4 * TICKS_PER_DAY);
    const removed = eventsOf(run.events, 'resident.removed').length;
    const left = eventsOf(run.events, 'life.event')
      .filter((e) => e.kind === 'seaside')
      .reduce((n, e) => n + e.residents.length, 0);
    const departed = s.stats.departures;
    expect(removed === 0 || left > 0 || departed > 0).toBe(true);
    expect(s.residents.length).toBeGreaterThanOrEqual(start - left - 4 * departed);
  });
});

describe('words', () => {
  it('rotate through every variant before repeating', () => {
    const s = villageFixture().state;
    for (let len = 1; len <= 9; len++) {
      const seen = new Set<number>();
      for (let n = 0; n < len; n++) seen.add(rotation(s, n, len));
      expect(seen.size, String(len)).toBe(len);
    }
  });
});
