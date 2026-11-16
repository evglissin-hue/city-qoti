// R2A: the round (docs/spec/19-evenings.md, The round): planning, arrivals, seats and standing, the
// tally, the weather, the shop first, afternoons, and a seat joining mid-evening planning exactly what
// its partner plans.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { RoundFlags, TICKS_PER_DAY, TICKS_PER_HOUR, TILE_FP } from '../../src/constants';
import type { Resident, WorldState } from '../../src/contracts';
import { hashState } from '../../src/state/hash';
import { deserialize, serialize } from '../../src/state/serialize';
import { placeIndex } from '../../src/systems/places';
import { occupancy } from '../../src/systems/places/occupancy';
import { tickOfDay } from '../../src/systems/residents/time';
import { advanceTo, createTickCtx, executeCommand, type SimCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';

const H = TICKS_PER_HOUR;
const P = content.places;

/** Benches with a flower bed and a lantern beside each, between lane A and street B. */
const SPOTS: readonly [number, number][] = [
  [44, 58],
  [50, 58],
  [56, 58],
  [44, 63],
  [50, 63],
  [56, 63],
];

function town(spots: readonly [number, number][] = SPOTS): { s: WorldState; ctx: SimCtx } {
  const { state: s } = villageFixture();
  const ctx = createTickCtx(s);
  for (const [x, z] of spots) {
    for (const [def, dx] of [
      ['bench', 0],
      ['flower-bed', 1],
      ['lantern', -1],
    ] as const) {
      const ok = executeCommand(
        s,
        {
          seat: 0,
          seq: 1,
          cmd: { t: 'decor.place', def, fx: (x + dx) * TILE_FP + 128, fz: z * TILE_FP + 128, rot: 0 },
        },
        ctx,
      );
      expect(ok, `${def} at ${x + dx},${z}`).toBe(true);
    }
  }
  return { s, ctx };
}

/** Runs the sim (empty turns) until tick `t`, dropping events. */
function runTo(s: WorldState, ctx: SimCtx, t: number, each?: () => void): void {
  while (s.tick < t) {
    advanceTo(s, s.lastTurn + 1, ctx);
    ctx.events.length = 0;
    each?.();
  }
}

/** Tick of `hour`:00 on day `day` (tick 0 is 06:00 on day 0). */
function at(day: number, hour: number): number {
  return day * TICKS_PER_DAY + (hour - 6) * H;
}

const grownUps = (s: WorldState) => s.residents.filter((r) => r.stage === 'young' || r.stage === 'adult');
const went = (r: Resident) =>
  r.roundEvening !== undefined &&
  (r.round ?? [])
    .slice(r.roundEvening)
    .some((x) => x.kind !== 'shop' && x.kind !== 'visit' && x.flags & RoundFlags.arrived);

describe('the round', () => {
  it('a town with no places worth the walk stays in', { timeout: 60_000 }, () => {
    const { s, ctx } = town([]);
    runTo(s, ctx, at(1, 22));
    const t = s.evenings.tonight;
    expect(t.day).toBe(1);
    expect(t.grownups).toBeGreaterThan(30);
    expect(t.out).toBe(0);
    if (t.weather !== 'storm') expect(t.nowhere).toBeGreaterThan(0);
    for (const r of grownUps(s)) expect(went(r), r.given).toBe(false);
  });

  it(
    'folk go out, places fill to their room and no further, and the tally counts them',
    { timeout: 60_000 },
    () => {
      const { s, ctx } = town();
      s.weather.today = 'clear';
      runTo(s, ctx, at(1, 16));
      s.weather.today = 'clear';
      let peak = 0;
      runTo(s, ctx, at(1, 22), () => {
        for (const p of placeIndex(s).places) {
          const o = occupancy(s, p.id);
          expect(o.seated, p.id).toBeLessThanOrEqual(p.seats - p.childSeats);
          expect(o.standing, p.id).toBeLessThanOrEqual(p.standing);
          peak = Math.max(peak, o.seated + o.standing);
        }
      });
      const t = s.evenings.tonight;
      expect(t.weather).toBe('fair');
      expect(t.out).toBeGreaterThan(5);
      expect(peak).toBeGreaterThan(1);
      const out = grownUps(s).filter(went).length;
      expect(out).toBe(t.out);
      // Every arrival at a place counts on its row; a seated arrival has a draw as found.
      let visits = 0;
      for (const r of s.residents) {
        for (const x of (r.round ?? []).slice(r.roundEvening ?? (r.round ?? []).length)) {
          if (!(x.flags & (RoundFlags.seated | RoundFlags.standing))) continue;
          expect(x.draw).toBeGreaterThan(0);
          visits++;
        }
      }
      const rows = s.places.reduce((n, row) => n + row.visitors[row.visitors.length - 1]!, 0);
      expect(rows).toBe(visits);
      // Nobody sets off before the hour they planned, and a seat serves more than one resident an
      // evening (the hours spread them).
      for (const r of s.residents) {
        for (const x of (r.round ?? []).slice(r.roundEvening ?? (r.round ?? []).length)) {
          if (x.arrived < 0 || x.at === undefined) continue;
          expect(tickOfDay(x.arrived), `${r.given} at ${x.place}`).toBeGreaterThanOrEqual(x.at);
        }
      }
      const busiest = Math.max(...s.places.map((row) => row.visitors[row.visitors.length - 1]!));
      const seatsThere = placeIndex(s).places.find(
        (p) => p.id === s.places.find((row) => row.visitors[row.visitors.length - 1] === busiest)!.id,
      )!;
      expect(busiest).toBeGreaterThan(seatsThere.seats - seatsThere.childSeats);
    },
  );

  it(
    'spreads a town over the evening and over places (the second-best rule, set-off hours)',
    { timeout: 60_000 },
    () => {
      const { s, ctx } = town();
      runTo(s, ctx, at(1, 16));
      s.weather.today = 'clear';
      runTo(s, ctx, at(1, 21));
      const firstStops = new Map<string, number>();
      const hours = new Set<number>();
      for (const r of grownUps(s)) {
        const k = r.roundEvening ?? 0;
        const first = r.round?.[k];
        if (!first || first.kind === 'shop' || first.kind === 'visit') continue;
        firstStops.set(first.place, (firstStops.get(first.place) ?? 0) + 1);
        hours.add(Math.floor((first.at ?? 0) / H));
      }
      expect(firstStops.size).toBeGreaterThan(2);
      expect(hours.size).toBeGreaterThan(1);
    },
  );

  it('a storm keeps everyone in; rain sends the rain-shy to shelter only', { timeout: 60_000 }, () => {
    const { s, ctx } = town();
    runTo(s, ctx, at(1, 16));
    s.weather.today = 'storm';
    runTo(s, ctx, at(1, 22));
    expect(s.evenings.tonight.weather).toBe('storm');
    expect(s.evenings.tonight.out).toBe(0);
    expect(s.evenings.tonight.nowhere).toBe(0);
    expect(s.evenings.tonight.grownups).toBeGreaterThan(30);
    for (const r of grownUps(s)) expect(went(r)).toBe(false);

    const b = town();
    runTo(b.s, b.ctx, at(1, 16));
    b.s.weather.today = 'rain';
    runTo(b.s, b.ctx, at(1, 22));
    expect(b.s.evenings.tonight.weather).toBe('rain');
    const day = 1;
    for (const r of grownUps(b.s)) {
      const shy = (r.id + day) % Math.round(100 / P.rainSkipPercent) === 0;
      if (!shy) continue;
      for (const x of (r.round ?? []).slice(r.roundEvening ?? (r.round ?? []).length)) {
        if (x.kind === 'shop' || x.kind === 'visit') continue;
        expect(placeIndex(b.s).byId.get(x.place)?.sheltered ?? true, r.given).toBe(true);
      }
    }
  });

  it(
    'starts the evening at 17:00: the tally rolls and every row gets a fresh evening',
    { timeout: 60_000 },
    () => {
      const { s, ctx } = town();
      runTo(s, ctx, at(1, 16));
      const rows = s.places.map((r) => r.visitors.length);
      const before = s.evenings.tonight;
      expect(before.day).toBe(0);
      runTo(s, ctx, at(1, 17) + 1);
      expect(s.evenings.tonight.day).toBe(1);
      expect(s.evenings.history[s.evenings.history.length - 1]).toBe(before);
      s.places.forEach((r, i) => expect(r.visitors.length).toBe(Math.min(6, rows[i]! + 1)));
    },
  );

  it('builders and porters plan at 19:00; elders plan an afternoon round', { timeout: 60_000 }, () => {
    const { s, ctx } = town();
    s.weather.today = 'clear';
    runTo(s, ctx, at(1, 16));
    s.weather.today = 'clear';
    runTo(s, ctx, at(1, 21));
    for (const r of grownUps(s)) {
      const job = s.buildings.find((b) => b.id === r.jobId);
      const role = job ? content.buildingById.get(job.def)?.jobs?.role : undefined;
      if (role !== 'builder' && role !== 'porter') continue;
      for (const x of (r.round ?? []).slice(r.roundEvening ?? 0)) {
        expect(x.at ?? 0, r.given).toBeGreaterThanOrEqual(P.latePlanHour * H);
      }
    }
    const elders = s.residents.filter((r) => r.stage === 'elder');
    for (const r of elders) expect(r.roundEvening).toBeUndefined();
  });

  it(
    'a seat joining from a snapshot mid-evening plans and walks exactly as its partner',
    { timeout: 120_000 },
    () => {
      const { s, ctx } = town();
      runTo(s, ctx, at(1, 17) + 37);
      const copy = deserialize(serialize(s));
      const cctx = createTickCtx(copy);
      expect(hashState(copy)).toBe(hashState(s));
      const end = at(1, 22);
      while (s.tick < end) {
        advanceTo(s, s.lastTurn + 1, ctx);
        advanceTo(copy, copy.lastTurn + 1, cctx);
        ctx.events.length = 0;
        cctx.events.length = 0;
        if (tickOfDay(s.tick) % H === 0) expect(hashState(copy), `tick ${s.tick}`).toBe(hashState(s));
      }
      expect(JSON.stringify(copy.residents.map((r) => r.round))).toBe(
        JSON.stringify(s.residents.map((r) => r.round)),
      );
      expect(hashState(copy)).toBe(hashState(s));
    },
  );

  it('two runs of a week hash the same', { timeout: 120_000 }, () => {
    const a = town();
    const b = town();
    runTo(a.s, a.ctx, 7 * TICKS_PER_DAY);
    runTo(b.s, b.ctx, 7 * TICKS_PER_DAY);
    expect(hashState(a.s)).toBe(hashState(b.s));
    expect(a.s.evenings.history.length).toBeGreaterThan(4);
  });

  it('children play at a swing near home as well as on the grass', { timeout: 60_000 }, () => {
    const { s, ctx } = town([]);
    const kids = s.residents.filter((r) => r.stage === 'child');
    expect(kids.length).toBeGreaterThan(0);
    // A swing beside the first child's home.
    const home = s.buildings.find(
      (b) => b.id === s.households.find((h) => h.id === kids[0]!.householdId)!.homeId,
    )!;
    const ok = executeCommand(
      s,
      {
        seat: 0,
        seq: 1,
        cmd: {
          t: 'decor.place',
          def: 'swing',
          fx: home.x * TILE_FP + 128,
          fz: (home.z + 4) * TILE_FP + 128,
          rot: 0,
        },
      },
      ctx,
    );
    expect(ok).toBe(true);
    const swingPlace = placeIndex(s).places.find((p) => p.childSeats > 0)!;
    let there = 0;
    runTo(s, ctx, at(1, 21), () => {
      for (const k of kids)
        if (k.activity.kind === 'play' && swingPlace.tiles.includes(k.activity.tile)) there++;
    });
    expect(there).toBeGreaterThan(0);
  });

  it("a Night Owl's evening starts later and an Early Bird's ends sooner", { timeout: 60_000 }, () => {
    const { s, ctx } = town();
    const grown = grownUps(s);
    const owl = grown[0]!;
    const lark = grown[1]!;
    owl.traits = ['night-owl', owl.traits.find((t) => t !== 'early-bird' && t !== 'night-owl') ?? 'cheerful'];
    lark.traits = [
      'early-bird',
      lark.traits.find((t) => t !== 'early-bird' && t !== 'night-owl') ?? 'cheerful',
    ];
    runTo(s, ctx, at(1, 16));
    s.weather.today = 'clear';
    runTo(s, ctx, at(1, 21));
    for (const x of (owl.round ?? []).slice(owl.roundEvening ?? 0)) {
      if (x.kind !== 'shop') expect(x.at ?? 0, owl.given).toBeGreaterThanOrEqual(18 * H);
    }
    for (const x of (lark.round ?? []).slice(lark.roundEvening ?? 0)) {
      expect(x.at ?? 0, lark.given).toBeLessThan(19 * H);
    }
  });

  it(
    'a pantry that runs low in the evening is still fetched for (shopping as built)',
    { timeout: 60_000 },
    () => {
      const { s, ctx } = town();
      runTo(s, ctx, at(1, 18) + 50);
      const long = (r: Resident) => {
        const job = s.buildings.find((b) => b.id === r.jobId);
        const role = job ? content.buildingById.get(job.def)?.jobs?.role : undefined;
        return role === 'builder' || role === 'porter';
      };
      const h = s.households.find((x) =>
        x.members.some((id) => {
          const r = s.residents.find((y) => y.id === id)!;
          return r.stage === 'adult' && !long(r) && r.activity.kind === 'home';
        }),
      )!;
      // Food on the stalls, none at home.
      const bread = content.goodIndex.get('bread')!;
      for (const b of s.buildings) if (b.def === 'market-stall' || b.def === 'granary') b.rt!.store[bread] = 30;
      h.pantry.fill(0);
      let shopped = false;
      runTo(s, ctx, at(1, 20), () => {
        if (h.members.some((id) => s.residents.find((y) => y.id === id)!.activity.kind === 'shop'))
          shopped = true;
      });
      expect(shopped).toBe(true);
    },
  );
});
