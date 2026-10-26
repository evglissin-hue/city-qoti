import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { ResidentFlags, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import { createValley, defaultSettings } from '../../src/state/create';
import { findById } from '../../src/state/entities';
import { doorTile } from '../../src/systems/movement/api';
import { homeDesirability } from '../../src/systems/residents/desirability';
import { pickTraits, stageForAge, stagesFor } from '../../src/systems/residents/generate';
import {
  arrivals,
  attractiveness,
  departureThreshold,
  gateTile,
  settleHousehold,
} from '../../src/systems/residents/lifecycle';
import { traitsCompatible } from '../../src/systems/residents/traits';
import { rngFromSeed } from '../../src/rng/streams';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { rejection, run } from '../helpers';
import { eventsOf, placeBuilding, resident, runner, ticks, tileOf, until, untilHour } from './helpers';

const standard = () => ({ ...defaultSettings(), mode: 'standard' as const });

describe('day one in a standard valley', () => {
  it('brings two families of four through the valley gate at 08:00, into the two cottages', () => {
    const w = createValley('meadow', standard());
    const r = runner(w);
    untilHour(r, 7.9);
    expect(w.residents).toHaveLength(0);
    untilHour(r, 8.01);
    expect(w.households).toHaveLength(2);
    expect(w.residents).toHaveLength(8);
    const gate = gateTile(w);
    for (const p of w.residents) {
      expect(p.activity.kind === 'arrive' || p.move).toBeTruthy();
      expect(p.inside).toBe(0);
    }
    expect(w.residents.filter((p) => p.tile === gate || p.move?.path.length).length).toBe(8);
    expect(eventsOf(r, 'resident.added')).toHaveLength(8);
    expect(eventsOf(r, 'household.added')).toHaveLength(2);
    const lines = eventsOf(r, 'chronicle.added').map((e) => e.c.text);
    expect(lines.filter((t) => t.includes('arrived through the valley gate'))).toHaveLength(2);
    expect(eventsOf(r, 'town.updated').length).toBeGreaterThan(0);
    const cottages = w.buildings.filter((b) => b.def === 'cottage').map((b) => b.id);
    expect(w.households.map((h) => h.homeId).sort()).toEqual(cottages.sort());
    // Names unique, two compatible traits each, a mix of ages, distinct looks.
    const names = new Set(w.residents.map((p) => `${p.given} ${p.family}`));
    expect(names.size).toBe(8);
    for (const p of w.residents) {
      expect(p.traits).toHaveLength(2);
      expect(traitsCompatible(p.traits[0]!, p.traits[1]!)).toBe(true);
      expect(content.speciesById.get(p.species)!.givenNames).toContain(p.given);
    }
    expect(new Set(w.residents.map((p) => p.look)).size).toBe(8);
    expect(w.residents.filter((p) => p.stage === 'child')).toHaveLength(2);

    // They walk in, move in, and find work at the town hall and the storehouse.
    expect(until(r, () => w.residents.every((p) => p.activity.kind !== 'arrive'), 6 * TICKS_PER_HOUR)).toBe(
      true,
    );
    const jobs = w.residents.filter((p) => p.jobId).length;
    expect(jobs).toBe(6);
    for (const p of w.residents) expect(p.history.map((h) => h.kind)).toContain('moved-in');
    const hall = w.buildings.find((b) => b.def === 'town-hall')!;
    expect(hall.rt!.workers).toHaveLength(2);
  });

  it('is the same day on every machine', () => {
    const a = createValley('meadow', standard());
    const b = createValley('meadow', standard());
    const ra = runner(a);
    const rb = runner(b);
    ticks(ra, 1000);
    ticks(rb, 1000);
    expect(JSON.stringify(a.residents)).toBe(JSON.stringify(b.residents));
  });
});

describe('arrivals', () => {
  it('scores homes by species taste: otters want the river, squirrels want trees', () => {
    const f = hamletFixture();
    const riverside = placeBuilding(f.state, 'cottage', 97, 46);
    const inland = placeBuilding(f.state, 'cottage', 80, 46);
    expect(homeDesirability(f.state, riverside, 'otter')).toBeGreaterThan(
      homeDesirability(f.state, inland, 'otter'),
    );
    for (let x = 76; x <= 84; x += 2) f.state.map.tree[tileOf(x, 44)] = 3 * 8 + 3;
    f.state.networkVersion += 1;
    expect(homeDesirability(f.state, inland, 'squirrel')).toBeGreaterThan(
      homeDesirability(f.state, riverside, 'squirrel'),
    );
  });

  it('comes only when the town is attractive enough, at most 1 + vacancies / 4 households a day', () => {
    const f = hamletFixture();
    const ctx = createTickCtx(f.state);
    for (let i = 0; i < 6; i++) placeBuilding(f.state, 'cottage', 76 + 3 * i, 52 + (i % 2) * 6);
    f.state.stats.attractiveness = 10;
    expect(arrivals(f.state, ctx, rngFromSeed('a'))).toBe(0);
    f.state.stats.attractiveness = attractiveness(f.state);
    expect(f.state.stats.attractiveness).toBeGreaterThanOrEqual(40);
    const before = f.state.households.length;
    expect(arrivals(f.state, ctx, rngFromSeed('a'))).toBe(2);
    expect(f.state.households.length).toBe(before + 2);
    // Each household took the best vacant home for its species at the time.
    for (const h of f.state.households.slice(before)) {
      const species = findById(f.state.residents, h.members[0]!)!.species;
      const home = findById(f.state.buildings, h.homeId)!;
      for (const other of f.state.buildings.filter((b) => b.def === 'cottage')) {
        const taken = f.state.households.some(
          (x) => x.homeId === other.id && x.arrivedDay <= h.arrivedDay && x.id < h.id,
        );
        if (taken || other.id === home.id) continue;
        expect(homeDesirability(f.state, home, species)).toBeGreaterThanOrEqual(
          homeDesirability(f.state, other, species) - 0.001,
        );
      }
    }
  });

  it('follows the makeup table and fits the home', () => {
    const rng = rngFromSeed('makeup');
    for (let i = 0; i < 200; i++) {
      const stages = stagesFor('family', rng, 4);
      expect(stages.length).toBeLessThanOrEqual(4);
      expect(stages.filter((s) => s === 'adult')).toHaveLength(2);
    }
    expect(stagesFor('elders', rng, 4)).toEqual(['elder', 'elder']);
    expect(stagesFor('couple', rng, 1)).toEqual(['adult']);
    expect(stageForAge(10)).toBe('child');
    expect(stageForAge(24 * 4)).toBe('young');
    expect(stageForAge(24 * 6)).toBe('adult');
    expect(stageForAge(24 * 16)).toBe('elder');
    for (let i = 0; i < 300; i++) {
      const [a, b] = pickTraits(rng);
      expect(traitsCompatible(a, b)).toBe(true);
    }
  });

  it('never repeats a full name among current residents', () => {
    const f = hamletFixture();
    const ctx = createTickCtx(f.state);
    for (let i = 0; i < 40; i++) {
      const home = placeBuilding(f.state, 'house', 20 + (i % 10) * 4, 100 + Math.floor(i / 10) * 6);
      settleHousehold(f.state, ctx, home.id, 'rabbit', ['adult', 'adult', 'child', 'child', 'young']);
    }
    const names = f.state.residents.map((p) => `${p.given} ${p.family}`);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('departures', () => {
  it('leaves at 09:00 after three miserable days, with a Chronicle line and a note', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    f.state.settings.economy = 'standard';
    const quills = findById(f.state.households, f.households[2])!;
    const members = [...quills.members];
    // A miserable night before each of three mornings.
    const gloom = () => {
      for (const id of members) {
        const p = findById(f.state.residents, id);
        if (!p) continue;
        p.needs = [0, 0, 0, 0, 0];
        p.mood = 10;
        p.modifiers = [];
      }
    };
    for (let day = 0; day < 3; day++) {
      untilHour(r, 5.99);
      gloom();
      ticks(r, 2);
    }
    expect(quills.lowMoodDays).toBe(3);
    for (const id of members) expect(resident(f.state, id).flags & ResidentFlags.leaving).toBeTruthy();
    untilHour(r, 9.01);
    expect(eventsOf(r, 'chronicle.added').some((e) => e.c.text.includes('The Quill family packed up'))).toBe(
      true,
    );
    expect(eventsOf(r, 'notify').some((e) => e.kind === 'letter' && e.text.includes('Quill'))).toBe(true);
    expect(f.state.stats.departures).toBe(1);
    for (const id of members) expect(resident(f.state, id).activity.kind).toBe('leave');
    const stall = findById(f.state.buildings, f.b.stall)!;
    expect(stall.rt!.workers).toHaveLength(0);
    // They walk to the gate and are gone.
    expect(until(r, () => !findById(f.state.households, f.households[2]), TICKS_PER_DAY)).toBe(true);
    for (const id of members) expect(findById(f.state.residents, id)).toBeUndefined();
    expect(
      eventsOf(r, 'resident.removed')
        .map((e) => e.id)
        .sort(),
    ).toEqual([...members].sort());
    expect(eventsOf(r, 'household.removed')).toHaveLength(1);
    for (const p of f.state.residents) for (const fr of p.friends) expect(members).not.toContain(fr.id);
  });

  it('uses the economy dial for the threshold', () => {
    const f = hamletFixture();
    expect(f.state.settings.economy).toBe('gentle');
    expect(departureThreshold(f.state)).toBe(15);
    f.state.settings.economy = 'standard';
    expect(departureThreshold(f.state)).toBe(25);
    f.state.settings.economy = 'thoughtful';
    expect(departureThreshold(f.state)).toBe(35);
  });
});

describe('homes and jobs that disappear', () => {
  it('moves a household into a vacant home when theirs is removed, or sees them off', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    const spare = placeBuilding(f.state, 'cottage', 80, 46);
    expect(rejection(run(f.state, { t: 'build.remove', ids: [f.b.cottages[0]] }))).toBeUndefined();
    ticks(r, 40);
    const th = findById(f.state.households, f.households[0])!;
    expect(th.homeId).toBe(spare.id);
    for (const id of th.members) {
      const p = resident(f.state, id);
      expect(p.inside).not.toBe(f.b.cottages[0]);
      expect(p.history.map((h) => h.kind)).toContain('moved');
    }
    // No spare home this time: the Underbanks leave.
    expect(rejection(run(f.state, { t: 'build.remove', ids: [f.b.cottages[1]] }))).toBeUndefined();
    ticks(r, 40);
    expect(eventsOf(r, 'chronicle.added').some((e) => e.c.text.includes('Underbank'))).toBe(true);
    for (const id of f.residents[1]!) {
      const p = findById(f.state.residents, id);
      if (p) expect(p.activity.kind).toBe('leave');
    }
  });

  it('releases jobs when a workplace is removed, and hires the jobless into open ones', () => {
    const f = hamletFixture();
    const r = runner(f.state);
    const hazel = resident(f.state, f.residents[0]![1]!);
    expect(hazel.jobId).toBe(f.b.bakery);
    expect(rejection(run(f.state, { t: 'build.remove', ids: [f.b.bakery] }))).toBeUndefined();
    ticks(r, 25);
    expect(hazel.history.map((h) => h.kind)).toContain('job-lost');
    // The next hourly pass finds Hazel (and jobless Crumb) somewhere else to work.
    ticks(r, TICKS_PER_HOUR);
    expect(hazel.jobId).not.toBe(0);
    expect(hazel.jobId).not.toBe(f.b.bakery);
    const crumb = resident(f.state, f.residents[2]![2]!);
    expect(crumb.jobId).not.toBe(0);
    const tansy = resident(f.state, f.residents[2]![1]!);
    expect(tansy.jobId).toBe(0);
    const pip = resident(f.state, f.residents[0]![2]!);
    expect(pip.jobId).toBe(0);
    for (const b of f.state.buildings) {
      if (!b.rt) continue;
      const inside = b.rt.workers.filter((id) => resident(f.state, id).inside === b.id).length;
      expect(b.rt.present).toBe(inside);
    }
  });

  it('keeps the door tile of a home for arrivals walking in', () => {
    const f = hamletFixture();
    const c = findById(f.state.buildings, f.b.cottages[0])!;
    expect(doorTile(c)).toBe(tileOf(54, 50));
  });
});
