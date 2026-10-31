// I3 contracts (C5.0): the winter and threat fixtures, save version 4, the three shared hooks, the
// cross-track APIs and the command baselines every I3 track builds on.
import { content } from '@qoti/content';
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { LEDGER_CATEGORIES, MAP_SIZE, RIVER_FREEZE_DAY, TICKS_PER_HOUR } from '../src/constants';
import type { WorldState } from '../src/contracts';
import { Flags, Road, Water } from '../src/map/layers';
import { RNG_STREAMS } from '../src/rng/streams';
import { base64ToBytes, bytesToBase64 } from '../src/state/base64';
import { createValley, defaultSettings } from '../src/state/create';
import { findById } from '../src/state/entities';
import { deserialize, serialize } from '../src/state/serialize';
import { markFloodplain, seasonAt } from '../src/state/seasons';
import { MIGRATION_FIREWOOD, SAVE_VERSION } from '../src/state/version';
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
import { advanceTo, createTickCtx } from '../src/turn';
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

const standard = () => ({ ...defaultSettings(), mode: 'standard' as const });

describe('I3 fixtures', () => {
  it('builds a village in winter: frozen river, snow, two cold households, a feast planned, the trial running', () => {
    const f = winterFixture();
    const s = f.state;
    expect(seasonAt(s.tick)).toEqual({ season: 3, year: 1, day: 2 });
    expect(isFrozen(s)).toBe(true);
    expect(weatherView(s).today).toBe('snow');
    expect(warmthReport(s)).toEqual({ cold: 2, householdDays: 2 });
    for (const h of f.cold) expect(isCold(s, h)).toBe(true);
    expect(festivalView(s).plan?.menu).toEqual([
      ['pies', 20, 10],
      ['cider', 16, 8],
    ]);
    expect(trialView(s)).toMatchObject({ kind: 'winter', status: 'running', name: 'The First Winter' });
    expect(watchView(s).members).toHaveLength(4);
    expect(hasSpecies(s, 'kingfisher')).toBe(true);
    expect(seasonCardView(s)).toMatchObject({ season: 3, year: 1, festival: { id: 'hearth-feast' } });
    // C5A: the trial's line first, then the winter stores.
    expect(seasonCardView(s).steps[0]).toBe(content.charterById.get('village')!.trial!.blurb);
    expect(renownView(s)).toMatchObject({ level: 1, next: 30 });
    expect(festivalMorale(s)).toBe(5);
    // Smoke: it builds every view and keeps going for a few hours.
    expect(buildView(s).buildings.length).toBeGreaterThan(25);
    advanceTo(s, s.tick + 3 * TICKS_PER_HOUR, createTickCtx(s));
  });

  it('builds a valley under threat, and the same valley at dusk with raiders on the map', () => {
    const f = threatFixture();
    const t = threatView(f.state);
    expect(t).toMatchObject({ band: 'medium', side: 'n', daysLeft: 2, signs: ['tracks', 'crows'] });
    expect(isRaidActive(f.state)).toBe(false);
    expect(watchStrength(f.state)).toBeGreaterThan(0);
    expect(lanternLit(f.state, 51 * S + 36)).toBe(true);
    expect(lanternLit(f.state, 20 * S + 20)).toBe(false);
    expect(wealth(f.state)).toBeGreaterThan(f.state.economy.treasury);
    advanceTo(f.state, f.state.tick + 2 * TICKS_PER_HOUR, createTickCtx(f.state));

    const d = raidAtDusk();
    expect(isRaidActive(d.state)).toBe(true);
    expect(raidView(d.state)).toMatchObject({ band: 'medium', raiders: 6, bell: true, lanterns: false });
    advanceTo(d.state, d.state.tick + TICKS_PER_HOUR, createTickCtx(d.state));
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
    const method = def.methods![0]!;
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
    expect(dockView(s)).toEqual({ boats: [], frozen: false });
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
      twist: 'pie-contest',
      music: 'none',
    });
    expect(rejection(ok)).toBeUndefined();
    expect(s.festival.plan).toMatchObject({
      festival: 'blossom-fair',
      season: 0,
      twist: 'pie-contest',
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

  it('gates open and close; walls wait for C5D; modules need a slot', () => {
    const f = threatFixture();
    expect(rejection(run(f.state, { t: 'gate.set', id: f.gate, open: false }))).toBeUndefined();
    expect(findById(f.state.buildings, f.gate)!.rt!.open).toBe(false);
    expect(rejection(run(f.state, { t: 'wall.paint', def: 'palisade', tiles: [[20, 60]] }))).toBe('LOCKED');
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

describe('save version 4', () => {
  /** An I2 (v3) save from a current one: drop the I3 slices, trim the I3 goods and categories. */
  function shrinkToV3(state: WorldState): Record<string, unknown> {
    const raw = JSON.parse(strFromU8(gunzipSync(serialize(state)))) as Record<string, unknown>;
    const goods = 20;
    const cats = 17;
    const trim = (v: unknown, n: number) => (Array.isArray(v) ? v.slice(0, n) : v);
    for (const k of ['weather', 'warmth', 'festival', 'renown', 'commissions', 'dock', 'nature'])
      delete raw[k];
    for (const k of ['threats', 'watch', 'raid', 'trial', 'guide', 'seasons']) delete raw[k];
    raw.rng = bytesToBase64(base64ToBytes(raw.rng as string).subarray(0, 6 * 16));
    const e = raw.economy as Record<string, unknown>;
    e.forSale = trim(e.forSale, goods);
    e.everProduced = trim(e.everProduced, goods);
    for (const k of ['today', 'yesterday', 'season', 'lastSeason']) {
      const p = e[k] as Record<string, unknown> | null;
      if (!p) continue;
      p.money = trim(p.money, cats);
      p.produced = trim(p.produced, goods);
      p.consumed = trim(p.consumed, goods);
    }
    e.stockHistory = (e.stockHistory as unknown[]).map((d) => trim(d, goods));
    for (const b of raw.buildings as Record<string, Record<string, unknown> | undefined>[]) {
      const rt = b.rt;
      if (!rt) continue;
      for (const k of ['input', 'output', 'store', 'reservedIn', 'reservedOut', 'producedToday'])
        rt[k] = trim(rt[k], goods);
    }
    for (const h of raw.households as Record<string, unknown>[]) h.pantry = trim(h.pantry, goods);
    const m = raw.market as Record<string, unknown>;
    for (const k of ['prices', 'demand', 'demandToday', 'cover']) m[k] = trim(m[k], goods);
    m.history = (m.history as unknown[]).map((d) => trim(d, goods));
    const l = raw.levers as Record<string, unknown>;
    for (const k of ['priceCaps', 'subsidies', 'exportBans']) l[k] = trim(l[k], goods);
    raw.stories = (raw.stories as { arc: string }[]).filter(
      (x) => x.arc !== 'herbalist' && x.arc !== 'stonemason',
    );
    raw.innovations = (raw.innovations as { id: string }[]).filter(
      (x) => x.id !== 'barometer' && x.id !== 'seed-drill',
    );
    // An I2 valley never had the floodplain flag.
    const map = raw.map as Record<string, string>;
    const flags = base64ToBytes(map.flags!);
    for (let i = 0; i < flags.length; i++) flags[i]! &= ~Flags.floodplain;
    map.flags = bytesToBase64(flags);
    raw.saveVersion = 3;
    return raw;
  }

  for (const [season, name] of [
    [0, 'spring'],
    [1, 'summer'],
    [2, 'autumn'],
    [3, 'winter'],
  ] as const) {
    it(`migrates an I2 village in ${name}: neutral slices, grown arrays, a gentle winter, the trial next winter`, () => {
      const f = villageFixture();
      f.state.tick = (season * 6 + RIVER_FREEZE_DAY - 1) * 24 * TICKS_PER_HOUR + 4 * TICKS_PER_HOUR;
      // Low ground by the river, so the migration has a floodplain to find.
      for (let z = 0; z < S; z++) for (let x = 97; x <= 99; x++) f.state.map.height[z * S + x] = 1;
      const firewood = content.goodIndex.get('firewood')!;
      const before = f.state.households.map((h) => h.pantry[firewood] ?? 0);
      const s = deserialize(gzipSync(strToU8(JSON.stringify(shrinkToV3(f.state)))));
      expect(s.saveVersion).toBe(SAVE_VERSION);
      expect(SAVE_VERSION).toBe(4);
      expect(s.rng.length).toBe(RNG_STREAMS.length * 4);
      expect(s.economy.forSale).toHaveLength(content.goods.length);
      expect(s.economy.today.money).toHaveLength(LEDGER_CATEGORIES.length);
      expect(s.market.prices).toHaveLength(content.goods.length);
      expect(s.market.prices.at(-1)).toBe(content.goods.at(-1)!.basePrice);
      expect(s.levers.exportBans).toHaveLength(content.goods.length);
      expect(s.weather.today).toBe('clear');
      expect(s.weather.river.frozen).toBe(season === 3);
      expect(s.guide.over).toBe(true);
      expect(s.stories.map((x) => x.arc)).toContain('herbalist');
      expect(s.innovations.map((x) => x.id)).toContain('seed-drill');
      expect(s.trial).toMatchObject({
        kind: 'winter',
        charter: 'village',
        season: 3,
        year: season === 3 ? 1 : 0,
      });
      const gift = season >= 2 ? MIGRATION_FIREWOOD : 0;
      s.households.forEach((h, i) => expect(h.pantry[firewood]).toBe(before[i]! + gift));
      expect(s.map.flags[10 * S + 98]! & Flags.floodplain).toBe(Flags.floodplain);
      expect(s.map.flags[10 * S + 90]! & Flags.floodplain).toBe(0);
      // It keeps playing.
      advanceTo(s, s.tick + 2 * TICKS_PER_HOUR, createTickCtx(s));
    });
  }
});
