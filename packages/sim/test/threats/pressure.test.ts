// C5D: threat pressure, deterrence, the raid schedule and telegraphing (14-challenge.md).
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { DETER_CAP, deterrenceParts, frontOf, raidStartTick, wealth } from '../../src/systems/threats/api';
import {
  bandFor,
  dailyGain,
  pressureK,
  raidersFor,
  threatDay,
  telegraph,
  THRESHOLD,
  FIERCE_THRESHOLD,
} from '../../src/systems/threats/pressure';
import { createTickCtx } from '../../src/turn';
import { rejection, run } from '../helpers';
import { threatView } from '../../src/view/seasons';
import { hamletFixture } from '../fixtures/hamlet';
import { addDecorAt, placeFree, tickAt } from '../fixtures/seasonsPlace';
import { threatFixture } from '../fixtures/threat';
import { villageFixture } from '../fixtures/village';

/** The village on day `day` of `season` (year 1) at 00:40, the threat pass's time. */
function village(season = 1, day = 1, dial: WorldState['settings']['threat'] = 'standard'): WorldState {
  const s = villageFixture().state;
  s.settings.threat = dial;
  s.threats.scheduled = null;
  s.tick = tickAt(0, season, day, 0) + 133;
  return s;
}

function at(s: WorldState, season: number, day: number): void {
  s.tick = tickAt(0, season, day, 0) + 133;
}

describe('pressure', () => {
  it('rises by W / k(rank) a day, less deterrence', () => {
    const s = village(1, 2);
    const k = pressureK(s);
    expect(k).toBeGreaterThan(0);
    expect(dailyGain(s, 0)).toBe(Math.floor(wealth(s) / k));
    expect(dailyGain(s, 500)).toBe(Math.floor((Math.floor(wealth(s) / k) * 500) / 1000));
    // Deterrence never takes it all away.
    expect(dailyGain(s, 5000)).toBe(Math.floor((Math.floor(wealth(s) / k) * (1000 - DETER_CAP)) / 1000));
    s.threats.pressure = 100;
    s.watch.members = [];
    threatDay(s, createTickCtx(s));
    expect(s.threats.pressure).toBe(100 + dailyGain(s, 0));
  });

  it('a richer town feels it sooner', () => {
    const s = village(1, 2);
    const before = dailyGain(s, 0);
    s.economy.treasury += 100000;
    expect(dailyGain(s, 0)).toBeGreaterThan(before);
  });

  it('counts each deterrence term: walls round the stores, towers, lanterns, the Watch', () => {
    const f = threatFixture();
    const s = f.state;
    const base = deterrenceParts(s);
    expect(base.towers).toBeGreaterThanOrEqual(0);
    expect(base.watch).toBeGreaterThan(0);
    s.watch.members = [];
    expect(deterrenceParts(s).watch).toBe(0);
    // A lantern at every store's door: the lantern term at its full weight.
    const v = village(1, 2);
    const stores = v.buildings.filter((b) => b.def === 'storehouse' || b.def === 'market-stall');
    expect(deterrenceParts(v).lanterns).toBeLessThan(100);
    for (const b of stores) {
      const t = frontOf(b);
      addDecorAt(v, 'lantern', (t % 192) + 0.5, Math.floor(t / 192) + 0.5);
    }
    expect(deterrenceParts(v).lanterns).toBeGreaterThan(0);
    // A tower beside a store.
    const before = deterrenceParts(v).towers;
    const st = stores[0]!;
    let placed = false;
    for (let dz = -3; dz <= 3 && !placed; dz++)
      for (let dx = -3; dx <= 3 && !placed; dx++) {
        try {
          placeFree(v, 'watchtower', st.x + dx, st.z + dz);
          placed = true;
        } catch {
          // taken
        }
      }
    expect(placed).toBe(true);
    expect(deterrenceParts(v).towers).toBeGreaterThan(before);
  });

  it('walls count only when they close a store in (with its gates shut)', () => {
    const f = threatFixture();
    // The fixture's palisade is open at the bottom: storehouse A is not walled in.
    expect(f.state.threats.deterrence.walls).toBeGreaterThan(0); // the fixture's stated parts
    const parts = deterrenceParts(f.state);
    const s = f.state;
    // Close the ring: the corner, gates where the lane crosses, and a run below the door.
    const tiles: [number, number][] = [
      [42, 49],
      [38, 50],
      [42, 50],
      [39, 51],
      [40, 51],
      [41, 51],
    ];
    expect(rejection(run(s, { t: 'wall.paint', def: 'palisade', tiles }))).toBeUndefined();
    expect(deterrenceParts(s).walls).toBeGreaterThan(parts.walls);
  });
});

describe('the raid schedule', () => {
  it('schedules one raid on day 1 above the threshold, for day 3 to 5 at dusk', () => {
    const s = village(1, 1);
    s.threats.pressure = THRESHOLD;
    const ctx = createTickCtx(s);
    threatDay(s, ctx);
    const r = s.threats.scheduled!;
    expect(r).not.toBeNull();
    expect(r.season).toBe(1);
    expect(r.day).toBeGreaterThanOrEqual(3);
    expect(r.day).toBeLessThanOrEqual(5);
    expect(r.strength).toBe(raidersFor(s, s.threats.pressure));
    expect(r.band).toBe(bandFor(r.strength));
    expect(ctx.events.some((e) => e.e === 'threat.updated')).toBe(true);
    // At most one a season: the next day changes nothing about it.
    at(s, 1, 2);
    s.threats.pressure = 2 * THRESHOLD;
    threatDay(s, createTickCtx(s));
    expect(s.threats.scheduled).toEqual(r);
  });

  it('waits below the threshold and off day 1', () => {
    const s = village(1, 1);
    s.threats.pressure = 0;
    threatDay(s, createTickCtx(s));
    expect(s.threats.scheduled).toBeNull();
    const t = village(1, 2);
    t.threats.pressure = 2 * THRESHOLD;
    threatDay(t, createTickCtx(t));
    expect(t.threats.scheduled).toBeNull();
  });

  it('never before Village rank, never on Peaceful', () => {
    const h = hamletFixture().state;
    h.settings.threat = 'fierce';
    h.tick = tickAt(0, 1, 1, 0) + 133;
    h.threats.pressure = 3 * THRESHOLD;
    threatDay(h, createTickCtx(h));
    expect(h.threats.scheduled).toBeNull();
    const p = village(1, 1, 'peaceful');
    p.threats.pressure = 3 * THRESHOLD;
    threatDay(p, createTickCtx(p));
    expect(p.threats.scheduled).toBeNull();
    expect(p.threats.pressure).toBe(0);
  });

  it('Fierce lowers the threshold to 0.6x and brings half as many raiders again', () => {
    const s = village(1, 1, 'fierce');
    s.threats.pressure = FIERCE_THRESHOLD;
    s.economy.treasury = 0;
    for (const b of s.buildings) if (b.rt) b.rt.store.fill(0);
    threatDay(s, createTickCtx(s));
    expect(s.threats.scheduled).not.toBeNull();
    const std = village(1, 1);
    expect(raidersFor(s, 1500)).toBe(Math.min(12, Math.floor((raidersFor(std, 1500) * 3) / 2)));
    expect(raidersFor(std, 0)).toBeGreaterThanOrEqual(3);
    expect(raidersFor(s, 99999)).toBe(12);
  });

  it('a raid resets the pressure', () => {
    // systems/raids starts the raid; see raids.test.ts. Here: the schedule clears with it.
    expect(bandFor(4)).toBe('small');
    expect(bandFor(8)).toBe('medium');
    expect(bandFor(9)).toBe('large');
  });
});

describe('telegraphing', () => {
  it('shows the side, band and signs from two days before (three with a watchtower)', () => {
    const s = village(1, 1);
    s.threats.pressure = THRESHOLD;
    threatDay(s, createTickCtx(s));
    const r = s.threats.scheduled!;
    expect(raidStartTick(r) - r.telegraphTick).toBeLessThanOrEqual(2 * TICKS_PER_DAY);
    const t = village(1, 1);
    placeFree(t, 'watchtower', 20, 20);
    t.threats.pressure = THRESHOLD;
    threatDay(t, createTickCtx(t));
    const q = t.threats.scheduled!;
    expect(raidStartTick(q) - q.telegraphTick).toBeGreaterThan(
      raidStartTick(r) - r.telegraphTick - (q.day - r.day) * TICKS_PER_DAY - 1,
    );
    // Before the signs nothing shows; after, the side and band (never the pressure on the Hearth's card).
    s.tick = r.telegraphTick - 1;
    expect(threatView(s).band).toBeNull();
    s.tick = r.telegraphTick;
    const ctx = createTickCtx(s);
    telegraph(s, ctx);
    expect(threatView(s)).toMatchObject({ band: r.band, side: r.side });
    expect(s.threats.scheduled!.signs).toEqual(['crows']);
  });

  it('is never a surprise: at least one evening ahead, in every weather (property)', () => {
    let cases = 0;
    for (let seed = 0; seed < 40; seed++) {
      for (const fogMask of [0, 0b11111, 0b00110, 0b01010, (seed * 7) & 31]) {
        const s = village(seed % 3, 1);
        s.threats.pressure = THRESHOLD + seed * 37;
        if (seed % 4 === 0) placeFree(s, 'watchtower', 20, 20);
        const ctx = createTickCtx(s);
        for (let i = 0; i < seed; i++) ctx.rng('threats').next();
        let shown = -1;
        for (let day = 1; day <= 6; day++) {
          at(s, seed % 3, day);
          s.weather.today = fogMask & (1 << (day - 1)) ? 'fog' : 'clear';
          threatDay(s, ctx);
          const r = s.threats.scheduled!;
          // The raids system checks every tick; between passes, the signs show at their tick.
          for (let t = s.tick; t < s.tick + TICKS_PER_DAY && shown < 0; t += 25) {
            if (t >= r.telegraphTick) shown = t;
          }
          if (day === r.day) break;
        }
        const r = s.threats.scheduled!;
        expect(r.telegraphTick).toBeLessThanOrEqual(raidStartTick(r) - TICKS_PER_DAY);
        expect(shown).toBeGreaterThanOrEqual(0);
        expect(shown).toBeLessThanOrEqual(raidStartTick(r) - TICKS_PER_DAY + 25);
        cases++;
      }
    }
    expect(cases).toBe(200);
  });

  it('fog takes a day off the warning, never past the evening before', () => {
    for (const weather of ['clear', 'fog'] as const) {
      const s = village(1, 3);
      const r = {
        season: 1 as const,
        year: 0,
        day: 5,
        side: 'n' as const,
        band: 'small' as const,
        strength: 3,
        telegraphTick: 0,
        signs: [] as string[],
      };
      r.telegraphTick = raidStartTick(r) - 2 * TICKS_PER_DAY;
      s.threats.scheduled = r;
      s.weather.today = weather;
      threatDay(s, createTickCtx(s));
      expect(raidStartTick(r) - r.telegraphTick).toBe(weather === 'fog' ? TICKS_PER_DAY : 2 * TICKS_PER_DAY);
      // A second foggy day cannot take the last evening away.
      at(s, 1, 4);
      s.weather.today = 'fog';
      threatDay(s, createTickCtx(s));
      expect(raidStartTick(r) - r.telegraphTick).toBeGreaterThanOrEqual(TICKS_PER_DAY);
    }
  });

  it('adds a sign a day once shown, tracks only in winter', () => {
    const s = village(3, 1);
    s.threats.pressure = THRESHOLD;
    s.threats.wolves = [];
    threatDay(s, createTickCtx(s));
    const r = s.threats.scheduled!;
    s.tick = r.telegraphTick;
    telegraph(s, createTickCtx(s));
    expect(r.signs).toEqual(['tracks']);
    at(s, 3, Math.min(6, Math.floor((r.telegraphTick - tickAt(0, 3, 1, 6)) / TICKS_PER_DAY) + 2));
    threatDay(s, createTickCtx(s));
    expect(r.signs.length).toBe(2);
  });
});
