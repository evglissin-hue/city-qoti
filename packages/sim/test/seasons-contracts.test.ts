// I3 contracts (C5.0): the winter and threat fixtures, the three shared hooks, the cross-track APIs
// and the command baselines every I3 track builds on. R1.0 dropped the save version 4 migration:
// version 6 refuses older valleys.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, TICKS_PER_HOUR } from '../src/constants';
import type { WorldState } from '../src/contracts';
import { Flags, Road, Water } from '../src/map/layers';
import { RNG_STREAMS } from '../src/rng/streams';
import { createValley, defaultSettings } from '../src/state/create';
import { findById } from '../src/state/entities';
import { markFloodplain, seasonAt } from '../src/state/seasons';
import { methodOf } from '../src/state/zones';
import { festivalMorale } from '../src/systems/festivals/api';
import { hasSpecies, habitatAt } from '../src/systems/habitats/api';
import { walkPermille, withWalkFactors } from '../src/systems/movement/factors';
import { movement } from '../src/systems/movement';
import { withYieldModifiers, yieldPermille } from '../src/systems/production/modifiers';
import { dailyRates } from '../src/systems/production/rates';
import { addRenown } from '../src/systems/renown/api';
import { scheduleOverride, withScheduleOverrides } from '../src/systems/residents/overrides';
import { think } from '../src/systems/residents/schedule';
import { isCold, isFrozen, seasonNow, warmthReport } from '../src/systems/seasons/api';
import { isRaidActive, lanternLit, watchStrength, wealth } from '../src/systems/threats/api';
import { createTickCtx, runTick } from '../src/turn';
import { buildView } from '../src/view';
import { seasonReportView } from '../src/view/season';
import {
  dockView,
  festivalView,
  guideView,
  raidView,
  renownView,
  seasonCardView,
  threatView,
  trialView,
  watchView,
  weatherView,
} from '../src/view/seasons';
import { raidAtDusk, threatFixture } from './fixtures/threat';
import { winterFixture } from './fixtures/winter';
import { villageFixture } from './fixtures/village';
import { flatWorld, rejection, run, S } from './helpers';

/** Runs `n` ticks (advanceTo counts turns, not ticks). */
function runTicks(state: WorldState, n: number): void {
  const ctx = createTickCtx(state);
  for (let i = 0; i < n; i++) runTick(state, ctx);
}

const standard = () => ({ ...defaultSettings(), mode: 'standard' as const });

describe('I3 fixtures', () => {
  // Builds and runs a whole Village into winter: about 12 s alone, so it gets room on a busy machine.
  it(
    'builds a village in winter: frozen river, snow, two cold households, a feast planned, the trial running',
    { timeout: 60_000 },
    () => {
      const f = winterFixture();
      const s = f.state;
      expect(seasonAt(s.tick)).toEqual({ season: 3, year: 1, day: 2 });
      expect(isFrozen(s)).toBe(true);
      expect(weatherView(s).today).toBe('snow');
      expect(warmthReport(s)).toEqual({ cold: 2, householdDays: 2 });
      for (const h of f.cold) expect(isCold(s, h)).toBe(true);
      expect(festivalView(s).plan?.menu).toEqual([
        ['bread', 20, 10],
        ['cider', 16, 8],
      ]);
      expect(trialView(s)).toMatchObject({ kind: 'winter', status: 'running', name: 'The First Winter' });
      expect(watchView(s).members).toHaveLength(4);
      expect(hasSpecies(s, 'kingfisher')).toBe(true);
      expect(seasonCardView(s)).toMatchObject({ season: 3, year: 1, festival: { id: 'hearth-feast' } });
      // C5A: the trial's line first, then the winter stores.
      expect(seasonCardView(s).steps[0]).toBe(content.charterById.get('village')!.trial!.blurb);
      expect(renownView(s)).toMatchObject({ level: 1, next: content.renown[2]!.points });
      expect(festivalMorale(s)).toBe(5);
      // Smoke: it builds every view and keeps going for a few hours.
      expect(buildView(s).buildings.length).toBeGreaterThan(25);
      runTicks(s, 3 * TICKS_PER_HOUR);
    },
  );

  it('builds a valley under threat, and the same valley at dusk with raiders on the map', () => {
    const f = threatFixture();
    const t = threatView(f.state);
    expect(t).toMatchObject({ band: 'medium', side: 'n', daysLeft: 2, signs: ['tracks', 'crows'] });
    expect(isRaidActive(f.state)).toBe(false);
    expect(watchStrength(f.state)).toBeGreaterThan(0);
    expect(lanternLit(f.state, 51 * S + 36)).toBe(true);
    expect(lanternLit(f.state, 20 * S + 20)).toBe(false);
    expect(wealth(f.state)).toBeGreaterThan(f.state.economy.treasury);
    runTicks(f.state, 2 * TICKS_PER_HOUR);

    const d = raidAtDusk();
    expect(isRaidActive(d.state)).toBe(true);
    expect(raidView(d.state)).toMatchObject({ band: 'medium', raiders: 6, bell: true, lanterns: false });
    runTicks(d.state, TICKS_PER_HOUR);
  });
});

describe('new valleys', () => {
  it('start with clear weather, calm threats, the guide open (standard) and the floodplain marked', () => {
    const w = createValley('meadow', standard());
    expect(w.weather).toMatchObject({ today: 'clear', river: { frozen: false } });
    expect(w.raid).toBeNull();
    expect(w.trial).toBeNull();
    expect(w.guide).toMatchObject({ step: 0, over: false });
    expect(createValley('meadow', { ...standard(), guide: false }).guide.over).toBe(true);
    expect(createValley('meadow', defaultSettings()).guide.over).toBe(true);
    let flood = 0;
    for (let i = 0; i < MAP_SIZE * MAP_SIZE; i++) {
      if (w.map.flags[i]! & Flags.floodplain) {
        flood++;
        expect(w.map.water[i]).toBe(Water.none);
        expect(w.map.height[i]).toBeLessThanOrEqual(1);
      }
    }
    expect(flood).toBeGreaterThan(0);
    expect(w.rng.length).toBe(RNG_STREAMS.length * 4);
    expect(seasonReportView(w)).toMatchObject({ season: 0, year: 0, hearth: [], ledger: [] });
    expect(guideView(w)).toMatchObject({ step: 0, of: content.guide.steps.length, over: false });
  });

  it('mark the floodplain within six tiles of the river and at height 1 or below', () => {
    const w = flatWorld();
    for (let i = 0; i < S * S; i++) if (!w.map.water[i]) w.map.height[i] = 1;
    markFloodplain(w.map);
    const at = (x: number) => (w.map.flags[50 * S + x]! & Flags.floodplain) !== 0;
    expect(at(94)).toBe(true);
    expect(at(93)).toBe(false);
    expect(at(107)).toBe(true);
    expect(at(108)).toBe(false);
    expect(at(100)).toBe(false);
  });
});

describe('the three hooks', () => {
  it('yield: registered modifiers scale farm, gather and craft output, and nothing else', () => {
    const f = villageFixture();
    const s = f.state;
    const bakery = findById(s.buildings, f.b.bakery)!;
    const def = content.buildingById.get(bakery.def)!;
    // R1: a business runs its trade's method (the baker's), not its def's.
    const method = methodOf(bakery)!;
    expect(yieldPermille(s, bakery, def, method)).toBe(1000);
    const plain = dailyRates(s, bakery, def)!.outputs[0]![1];
    withYieldModifiers([['half', () => 500]], () => {
      expect(yieldPermille(s, bakery, def, method)).toBe(500);
      expect(dailyRates(s, bakery, def)!.outputs[0]![1]).toBeCloseTo(plain / 2, 0);
      expect(yieldPermille(s, bakery, def, { ...method, kind: 'fell' })).toBe(1000);
    });
    expect(yieldPermille(s, bakery, def, method)).toBe(1000);
  });

  it('walk: registered factors stretch the ticks a resident needs to cross a tile', () => {
    const steps = (factor: number): number => {
      const s = flatWorld();
      s.settings.mode = 'standard';
      for (let x = 50; x <= 55; x++) s.map.road[50 * S + x] = Road.path;
      const f = villageFixture();
      const r = { ...f.state.residents[0]!, tile: 50 * S + 50, inside: 0 };
      r.move = {
        path: [50 * S + 51, 50 * S + 52, 50 * S + 53],
        step: 0,
        progress: 0,
        target: 50 * S + 53,
        reason: 'schedule',
        version: s.networkVersion,
      };
      s.residents = [r];
      const ctx = createTickCtx(s);
      const run = () => {
        let n = 0;
        while (r.move && n < 1000) {
          movement.tick(s, ctx);
          n++;
        }
        return n;
      };
      return factor === 1000 ? run() : withWalkFactors([['test', () => factor]], run);
    };
    const normal = steps(1000);
    expect(normal).toBeGreaterThan(0);
    expect(steps(2000)).toBeGreaterThanOrEqual(2 * normal - 3);
    expect(walkPermille(flatWorld(), { kind: 'cart', id: 1 }, 0)).toBe(1000);
  });

  it('schedule: the highest-priority override wins and the resident acts on it', () => {
    const f = villageFixture();
    const s = f.state;
    const r = s.residents.find((x) => x.inside !== 0 && x.stage === 'adult')!;
    expect(scheduleOverride(s, r, 12)).toBeNull();
    const target = 60 * S + 64;
    withScheduleOverrides(
      [
        { id: 'festival', priority: 50, pick: () => ({ kind: 'leisure', tile: target }) },
        { id: 'quiet', priority: 10, pick: () => ({ kind: 'home' }) },
      ],
      () => {
        expect(scheduleOverride(s, r, 19)).toEqual({ kind: 'leisure', tile: target });
        const ctx = createTickCtx(s);
        think(s, ctx, ctx.rng('residents'), r);
        expect(r.move?.target ?? r.tile).toBe(target);
      },
    );
  });
});

describe('cross-track APIs', () => {
  it('addRenown keeps the log, moves the level and tells both seats', () => {
    const s = villageFixture().state;
    const ctx = createTickCtx(s);
    addRenown(s, ctx, 12, 'festival');
    expect(s.renown).toMatchObject({ points: 12, level: 1 });
    expect(ctx.events.some((e) => e.e === 'renown.updated')).toBe(true);
    expect(seasonNow(s).season).toBe(0);
    expect(habitatAt(s, 10, 10, 'meadow')).toBe(0);
    expect(dockView(s)).toMatchObject({ boats: [], frozen: false });
  });

  it('names the Water Wheel story by arc id, wherever the arc sits in the list', () => {
    const ww = content.innovationById.get('water-wheel')!;
    expect(JSON.stringify(ww.condition)).toContain('"ref":"inventor"');
  });
});

describe('command baselines', () => {
  it('festival.plan checks the site, menu and twist, and keeps what is put by', () => {
    const s = villageFixture().state;
    const tiny = run(s, { t: 'festival.plan', site: { rect: [40, 55, 42, 57] }, menu: [] });
    expect(rejection(tiny)).toBe('INVALID');
    const bad = run(s, { t: 'festival.plan', site: null, menu: [['pebbles', 1]] });
    expect(rejection(bad)).toBe('INVALID');
    const winterOnly = run(s, { t: 'festival.plan', site: null, menu: [], twist: 'snow-sculptures' });
    expect(rejection(winterOnly)).toBe('NOT_ALLOWED');
    const ok = run(s, {
      t: 'festival.plan',
      site: { rect: [40, 55, 46, 61] },
      menu: [['bread', 10]],
      twist: 'lanterns-on-the-water',
      music: 'none',
    });
    expect(rejection(ok)).toBeUndefined();
    expect(s.festival.plan).toMatchObject({
      festival: 'blossom-fair',
      season: 0,
      twist: 'lanterns-on-the-water',
      by: 0,
    });
    expect(ok.events.some((e) => e.e === 'festival.updated')).toBe(true);
  });

  it('the Watch: target, budget and posture from Village rank; the bell and lanterns only in a raid', () => {
    const flat = flatWorld();
    flat.settings.mode = 'standard';
    expect(rejection(run(flat, { t: 'watch.setTarget', size: 4 }))).toBe('NOT_ALLOWED');
    const s = villageFixture().state;
    expect(rejection(run(s, { t: 'watch.setTarget', size: 4 }))).toBeUndefined();
    expect(s.watch.target).toBe(4);
    expect(rejection(run(s, { t: 'watch.setBudget', coins: 3 }))).toBeUndefined();
    expect(s.watch.budget).toBe(300);
    expect(
      rejection(
        run(s, {
          t: 'watch.setPosture',
          guards: [
            [1, 1],
            [2, 2],
            [3, 3],
            [4, 4],
          ],
        }),
      ),
    ).toBe('TOO_MANY');
    expect(rejection(run(s, { t: 'watch.ringBell' }))).toBe('NO_RAID');
    const d = raidAtDusk().state;
    expect(rejection(run(d, { t: 'watch.ringBell' }))).toBe('INVALID');
    expect(rejection(run(d, { t: 'watch.lightLanterns' }))).toBeUndefined();
    expect(d.raid!.lanterns).toBe(true);
  });

  it('bandit.decide: only the captives; sending one off earns renown', () => {
    const s = raidAtDusk().state;
    expect(rejection(run(s, { t: 'bandit.decide', id: 999, choice: 'send' }))).toBe('NOT_FOUND');
    s.threats.captives.push(s.raid!.raiders[0]!.id);
    expect(
      rejection(run(s, { t: 'bandit.decide', id: s.raid!.raiders[0]!.id, choice: 'send' })),
    ).toBeUndefined();
    expect(s.threats.captives).toEqual([]);
    expect(s.renown.points).toBe(1);
  });

  it('gates open and close; stone walls wait for Town or Barnaby; modules need a slot', () => {
    const f = threatFixture();
    expect(rejection(run(f.state, { t: 'gate.set', id: f.gate, open: false }))).toBeUndefined();
    expect(findById(f.state.buildings, f.gate)!.rt!.open).toBe(false);
    // C5D: walls are written; a sandbox-only or stone wall before its unlock stays LOCKED.
    expect(rejection(run(f.state, { t: 'wall.paint', def: 'stone-wall', tiles: [[20, 60]] }))).toBe('LOCKED');
    expect(rejection(run(f.state, { t: 'wall.paint', def: 'cottage', tiles: [[20, 60]] }))).toBe('INVALID');
    expect(rejection(run(f.state, { t: 'wall.remove', tiles: [[20, 60]] }))).toBe('NOT_FOUND');
    const cottage = f.village.b.cottages[0]!;
    expect(rejection(run(f.state, { t: 'build.setModule', id: cottage, slot: 'roof', module: null }))).toBe(
      'NOT_ALLOWED',
    );
  });

  it('ponds on open grass; market days and quiet hours; commissions; the guide per seat', () => {
    const s = villageFixture().state;
    expect(rejection(run(s, { t: 'terrain.pond', tiles: [[64, 60]] }))).toBe('OCCUPIED');
    // C5C: ponds go in fertile low ground.
    for (const x of [20, 21]) {
      s.map.height[90 * S + x] = 1;
      s.map.fertility[90 * S + x] = 60;
    }
    expect(
      rejection(
        run(s, {
          t: 'terrain.pond',
          tiles: [
            [20, 90],
            [21, 90],
          ],
        }),
      ),
    ).toBeUndefined();
    expect(s.map.water[90 * S + 20]).toBe(Water.pond);
    expect(rejection(run(s, { t: 'ledger.setMarketDay', day: 7 }))).toBe('INVALID');
    expect(rejection(run(s, { t: 'ledger.setMarketDay', day: 3 }))).toBeUndefined();
    expect(rejection(run(s, { t: 'ledger.setQuietHours', on: true }))).toBeUndefined();
    expect(s.levers).toMatchObject({ marketDay: 3, quietHours: true });
    expect(rejection(run(s, { t: 'commission.accept', id: 5 }))).toBe('NOT_FOUND');
    expect(rejection(run(s, { t: 'guide.setHidden', on: true }, 1))).toBeUndefined();
    expect(s.guide.hidden.slice(0, 2)).toEqual([false, true]);
  });

  it('the threat dial tells the partner and the Chronicle', () => {
    const s = villageFixture().state;
    const ctx = run(s, { t: 'valley.setSettings', settings: { threat: 'fierce' } });
    expect(rejection(ctx)).toBeUndefined();
    expect(ctx.events).toContainEqual(expect.objectContaining({ e: 'notify', seat: 1 }));
    expect(s.chronicle.at(-1)?.kind).toBe('threat-dial');
  });
});
