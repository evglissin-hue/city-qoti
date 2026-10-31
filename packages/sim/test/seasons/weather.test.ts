// C5A: the season's turn, the frozen river, the weather and its events (docs/spec/14-challenge.md,
// Seasons, Weather and events). Odds, effects and event numbers are read from content.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import {
  AGENT_STRIDE,
  AgentAnim,
  AgentFlags,
  DAYS_PER_SEASON,
  MAP_SIZE,
  RIVER_FREEZE_DAY,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
} from '../../src/constants';
import type { Resident, SimEvent, WorldState } from '../../src/contracts';
import { Flags } from '../../src/map/layers';
import { createTickCtx } from '../../src/turn';
import { walkPermille } from '../../src/systems/movement/factors';
import { yieldPermille } from '../../src/systems/production/modifiers';
import { scheduleOverride } from '../../src/systems/residents/overrides';
import { isFlooded, isFrozen } from '../../src/systems/seasons/api';
import { seasons, turnDay } from '../../src/systems/seasons';
import { trees } from '../../src/systems/trees';
import { handSawPermille } from '../../src/systems/seasons/river';
import { skatingSpots } from '../../src/systems/seasons/place';
import { recomputeDirty } from '../../src/systems/hearth/charm';
import { wellPermille } from '../../src/systems/weather/effects';
import {
  dayTick,
  eventBlocked,
  eventChance,
  flood,
  FLOOD_GOODS_CAP,
  forecastDays,
  rollWeather,
  weatherDay,
} from '../../src/systems/weather';
import { dayIndex } from '../../src/systems/economy/time';
import { agentFrame } from '../../src/view/agents';
import { visitorCount, VISITOR_ID_BASE } from '../../src/view/season/visitors';
import { placeFree, tickAt } from '../fixtures/seasonsPlace';
import { villageFixture } from '../fixtures/village';
import { expectMoneyInvariant, moneySnapshot } from '../money';

const H = TICKS_PER_HOUR;

function method(def: string) {
  return content.buildingById.get(def)!.methods![0]!;
}

function farmAt(state: WorldState, x: number, z: number) {
  return placeFree(state, 'farmhouse', x, z);
}

function resident(state: WorldState): Resident {
  return state.residents.find((r) => r.stage === 'adult')!;
}

describe('the season turns', () => {
  it('sends the season card on day 1 and the report on the last evening', () => {
    const { state } = villageFixture();
    state.tick = tickAt(0, 1, 1, 0) + 2;
    const ctx = createTickCtx(state);
    seasons.tick(state, ctx);
    expect(ctx.events.some((e) => e.e === 'season.started' && e.c.season === 1)).toBe(true);
    state.tick = tickAt(0, 1, DAYS_PER_SEASON, 23) + 2;
    const late = createTickCtx(state);
    seasons.tick(state, late);
    expect(late.events.some((e) => e.e === 'season.report' && e.r.season === 1)).toBe(true);
  });

  it('freezes the river on Winter day 2 and thaws it on Spring day 1', () => {
    const { state } = villageFixture();
    state.tick = tickAt(0, 3, 1, 0) + 2;
    turnDay(state, createTickCtx(state));
    expect(isFrozen(state)).toBe(false);
    state.tick = tickAt(0, 3, RIVER_FREEZE_DAY, 0) + 2;
    turnDay(state, createTickCtx(state));
    expect(isFrozen(state)).toBe(true);
    expect(state.weather.river.frozenTick).toBe(state.tick);
    state.tick = tickAt(1, 0, 1, 0) + 2;
    turnDay(state, createTickCtx(state));
    expect(isFrozen(state)).toBe(false);
  });

  it('gives the bank by each skating spot a little comfort while the ice holds', () => {
    const { state } = villageFixture();
    const comfortAt = (t: number) => state.map.charmComfort[t]!;
    state.tick = tickAt(0, 3, RIVER_FREEZE_DAY, 0) + 2;
    recomputeDirty(state, null);
    const spot = skatingSpots(state)[0]!;
    const before = comfortAt(spot);
    turnDay(state, createTickCtx(state));
    expect(isFrozen(state)).toBe(true);
    expect(state.hearth.dirtyChunks.length).toBeGreaterThan(0);
    recomputeDirty(state, null);
    expect(comfortAt(spot)).toBeGreaterThan(before);
    state.tick = tickAt(1, 0, 1, 0) + 2;
    turnDay(state, createTickCtx(state));
    recomputeDirty(state, null);
    expect(comfortAt(spot)).toBe(before);
  });

  it('writes the first winter into the Chronicle', () => {
    const { state } = villageFixture();
    state.tick = tickAt(0, 3, 1, 0) + 2;
    const ctx = createTickCtx(state);
    turnDay(state, ctx);
    expect(state.chronicle.some((c) => c.kind === 'first-winter')).toBe(true);
    expect(state.warmth.winter).toBe(0);
  });

  it('stops fishing and turns the water sawmill to hand sawing while the river is frozen', () => {
    const { state } = villageFixture();
    const hut = placeFree(state, 'fishers-hut', 97, 80);
    const mill = placeFree(state, 'sawmill', 97, 90);
    const hutDef = content.buildingById.get('fishers-hut')!;
    const millDef = content.buildingById.get('sawmill')!;
    state.tick = tickAt(0, 1, 2, 10);
    expect(yieldPermille(state, hut, hutDef, method('fishers-hut'))).toBe(1000);
    state.weather.river = { frozen: true, frozenTick: state.tick };
    expect(yieldPermille(state, hut, hutDef, method('fishers-hut'))).toBe(0);
    const hand = handSawPermille(method('sawmill'));
    expect(hand).toBeGreaterThan(0);
    expect(hand).toBeLessThan(1000);
    expect(yieldPermille(state, mill, millDef, method('sawmill'))).toBe(hand);
    // Hand sawing at sawpit rate: planks an hour match the sawpit's.
    const pit = method('sawpit');
    const water = method('sawmill');
    const pitRate = pit.outputs[0]![1] / pit.hours;
    const waterRate = ((water.outputs[0]![1] / water.hours) * hand) / 1000;
    expect(Math.abs(waterRate - pitRate)).toBeLessThan(0.05);
  });

  it('sends some folk skating by the bank on a frozen evening', () => {
    const { state } = villageFixture();
    state.tick = tickAt(1, 3, 3, 18);
    state.weather.river = { frozen: true, frozenTick: state.tick - TICKS_PER_DAY };
    const picks = state.residents
      .filter((r) => r.stage !== 'elder')
      .map((r) => scheduleOverride(state, r, 18))
      .filter((a) => a?.kind === 'leisure');
    expect(picks.length).toBeGreaterThan(0);
    for (const a of picks) {
      const t = (a as { tile: number }).tile;
      const x = t % MAP_SIZE;
      expect(Math.abs(x - 100.5)).toBeLessThan(3);
      expect(state.map.water[t]).toBe(0);
    }
    expect(scheduleOverride(state, resident(state), 12)).toBeNull();
  });

  it('rests the trees in winter', () => {
    const { state } = villageFixture();
    const i = 30 * MAP_SIZE + 30;
    state.map.tree[i] = 1 * 8 + 0;
    state.tick = tickAt(0, 3, 3, 10);
    trees.tick(state, createTickCtx(state));
    expect(state.map.tree[i]).toBe(8);
    state.tick = tickAt(1, 0, 3, 10);
    trees.tick(state, createTickCtx(state));
    expect(state.map.tree[i]).toBe(9);
  });
});

describe('daily weather', () => {
  it('has odds for every season that add up to a whole day, snow only in winter, heat only in summer', () => {
    for (let s = 0; s < 4; s++) {
      let total = 0;
      for (const w of content.weather) total += w.odds.find(([q]) => q === s)?.[1] ?? 0;
      expect(total).toBe(1000);
    }
    const { state } = villageFixture();
    const rng = createTickCtx(state).rng('weather');
    const seen = new Set<string>();
    for (let k = 0; k < 400; k++) seen.add(`${0}:${rollWeather(rng, 0)}`);
    for (let k = 0; k < 400; k++) seen.add(`${3}:${rollWeather(rng, 3)}`);
    expect(seen.has('3:snow')).toBe(true);
    expect(seen.has('0:snow')).toBe(false);
    expect(seen.has('0:rain')).toBe(true);
  });

  it('forecasts a day ahead, two with the Barometer, and keeps its word', () => {
    const { state } = villageFixture();
    state.tick = dayTick(8);
    weatherDay(state, createTickCtx(state));
    expect(forecastDays(state)).toBe(1);
    expect(state.weather.forecast).toHaveLength(1);
    const promised = state.weather.forecast[0]!;
    expect(promised.day).toBe(9);
    state.tick = dayTick(9);
    weatherDay(state, createTickCtx(state));
    expect(state.weather.today).toBe(promised.kind);
    state.innovations.find((i) => i.id === 'barometer')!.unlockedTick = 1;
    expect(forecastDays(state)).toBe(2);
    state.tick = dayTick(10);
    weatherDay(state, createTickCtx(state));
    expect(state.weather.forecast.map((d) => d.day)).toEqual([11, 12]);
  });

  it('applies each kind through the hooks: rain, snow, heat, storm', () => {
    const { state } = villageFixture();
    const farm = farmAt(state, 60, 90);
    const def = content.buildingById.get('farmhouse')!;
    const m = method('farmhouse');
    state.weather.today = 'rain';
    expect(yieldPermille(state, farm, def, m)).toBe(
      content.weatherById.get('rain')!.effects.find(([n]) => n === 'farm')![1],
    );
    const r = resident(state);
    const evening = state.residents.map((x) => scheduleOverride(state, x, 19));
    const home = evening.filter((a) => a?.kind === 'home').length;
    expect(home).toBeGreaterThan(state.residents.length / 4);
    expect(home).toBeLessThan((state.residents.length * 3) / 4);
    state.weather.today = 'snow';
    expect(walkPermille(state, { kind: 'resident', id: r.id }, 0)).toBe(1300);
    expect(walkPermille(state, { kind: 'cart', id: 1 }, 0)).toBe(1300);
    state.weather.today = 'heat';
    expect(wellPermille(state)).toBe(800);
    state.weather.today = 'storm';
    expect(scheduleOverride(state, r, 19)).toEqual({ kind: 'home' });
    expect(scheduleOverride(state, r, 12)).toBeNull();
    // A storm wears some roofs.
    state.tick = dayTick(30);
    state.weather.forecast = [{ day: 30, kind: 'storm' }];
    const before = state.buildings.reduce((n, b) => n + (b.rt?.condition ?? 0), 0);
    weatherDay(state, createTickCtx(state));
    const after = state.buildings.reduce((n, b) => n + (b.rt?.condition ?? 0), 0);
    expect(after).toBeLessThan(before);
  });

  it('a drought slows the fields far from a well, not those beside one', () => {
    const f = villageFixture();
    const state = f.state;
    const def = content.buildingById.get('farmhouse')!;
    const m = method('farmhouse');
    const near = farmAt(state, 150, 150);
    const far = farmAt(state, 150, 160);
    far.x = 170;
    far.z = 170;
    const well = state.buildings.find((b) => b.id === f.b.wells[0])!;
    near.x = well.x + 3;
    near.z = well.z;
    state.weather.today = 'clear';
    state.weather.events.push({
      id: 1,
      event: 'drought',
      start: state.tick - 1,
      end: state.tick + TICKS_PER_DAY,
      forecastTick: state.tick - 1,
    });
    expect(yieldPermille(state, far, def, m)).toBe(600);
    expect(yieldPermille(state, near, def, m)).toBe(1000);
  });
});

describe('events', () => {
  it('follows the dial: gentle x0.7, standard x1, thoughtful x1.3', () => {
    const { state } = villageFixture();
    const def = content.eventById.get('flood')!;
    state.settings.economy = 'gentle';
    const gentle = eventChance(state, def);
    state.settings.economy = 'standard';
    expect(eventChance(state, def)).toBe(def.odds);
    state.settings.economy = 'thoughtful';
    const thoughtful = eventChance(state, def);
    expect(gentle).toBe(Math.round(def.odds * 0.7));
    expect(thoughtful).toBe(Math.min(1000, Math.round(def.odds * 1.3)));
    // Over many springs, the dial shows in how often the river rises.
    const count = (dial: 'gentle' | 'thoughtful') => {
      let n = 0;
      for (let y = 0; y < 60; y++) {
        const s = villageFixture().state;
        s.seed = `dial-${y}`;
        s.settings.economy = dial;
        s.rng = new Uint32Array(s.rng.map((v, k) => (v + y * 2654435761 + k) >>> 0));
        s.tick = dayTick(24 * 2);
        weatherDay(s, createTickCtx(s));
        if (s.weather.events.some((v) => v.event === 'flood')) n++;
      }
      return n;
    };
    expect(count('thoughtful')).toBeGreaterThan(count('gentle'));
  });

  it('forecasts each event before it comes, and never twice in a row', () => {
    const { state } = villageFixture();
    let found = false;
    for (let y = 0; y < 30 && !found; y++) {
      state.weather.events = [];
      state.rng = new Uint32Array(state.rng.map((v, k) => (v * 7 + y + k) >>> 0));
      state.tick = dayTick(24 * 2);
      weatherDay(state, createTickCtx(state));
      for (const v of state.weather.events) {
        found = true;
        const def = content.eventById.get(v.event)!;
        const lead = dayIndex(v.start) - dayIndex(v.forecastTick);
        expect(lead).toBeGreaterThanOrEqual(def.forecastDays[0]);
        expect(lead).toBeLessThanOrEqual(def.forecastDays[1]);
        expect(content.seasons[0]!.events).toContain(v.event);
      }
    }
    expect(found).toBe(true);
    // A flood last spring: none this spring.
    const s = villageFixture().state;
    s.tick = dayTick(24 * 3);
    s.weather.events = [
      {
        id: 5,
        event: 'flood',
        start: dayTick(24 * 2 + 3),
        end: dayTick(24 * 2 + 4),
        forecastTick: dayTick(24 * 2 + 2),
      },
    ];
    expect(eventBlocked(s, content.eventById.get('flood')!)).toBe('again');
    s.tick = dayTick(24 * 4);
    expect(eventBlocked(s, content.eventById.get('flood')!)).toBeNull();
  });

  it('a flood soaks the floodplain: condition and some goods, capped, and the water stands until it ends', () => {
    const { state } = villageFixture();
    const store = placeFree(state, 'storehouse', 150, 150);
    store.x = 96;
    store.z = 130;
    for (let z = 130; z < 134; z++)
      for (let x = 94; x < 100; x++) state.map.flags[z * MAP_SIZE + x]! |= Flags.floodplain;
    const wheat = content.goodIndex.get('wheat')!;
    const fish = content.goodIndex.get('fish')!;
    store.rt!.store[wheat] = 300;
    store.rt!.store[fish] = 10;
    store.rt!.condition = 100;
    const v = {
      id: 77,
      event: 'flood',
      start: state.tick,
      end: state.tick + TICKS_PER_DAY,
      forecastTick: state.tick - TICKS_PER_DAY,
    };
    state.weather.events.push(v);
    const ctx = createTickCtx(state);
    flood(state, ctx, v);
    expect(store.rt!.condition).toBe(80);
    expect(store.rt!.store[wheat]).toBe(300 - FLOOD_GOODS_CAP);
    expect(store.rt!.store[fish]).toBe(8);
    expect(isFlooded(state, store.id)).toBe(true);
    state.tick += TICKS_PER_DAY;
    expect(isFlooded(state, store.id)).toBe(false);
    expect(state.chronicle.some((c) => c.kind === 'flood')).toBe(true);
    expect(ctx.events.some((e: SimEvent) => e.e === 'chronicle.added' && !!e.snapshot)).toBe(true);
  });

  it("the circus wants a Village and a Village Green, and books the visitors' coins", () => {
    const { state } = villageFixture();
    const def = content.eventById.get('circus')!;
    state.hearth.sites = state.hearth.sites.filter((s) => s.pattern !== 'village-green');
    expect(eventBlocked(state, def)).toBe('no-green');
    state.hearth.sites.push({
      pattern: 'village-green',
      anchor: 60 * MAP_SIZE + 60,
      members: [],
      tiles: [],
      seats: [0],
      tick: 0,
    });
    expect(eventBlocked(state, def)).toBeNull();
    const before = moneySnapshot(state);
    const treasury = state.economy.treasury;
    state.tick = dayTick(24 + 8);
    state.weather.events.push({
      id: 90,
      event: 'circus',
      start: state.tick,
      end: state.tick + TICKS_PER_DAY,
      forecastTick: state.tick - 2 * TICKS_PER_DAY,
    });
    weatherDay(state, createTickCtx(state));
    expect(state.economy.treasury).toBeGreaterThan(treasury);
    expect(state.chronicle.some((c) => c.kind === 'circus')).toBe(true);
    expect(state.residents[0]!.modifiers.some((m) => m.kind === 'circus')).toBe(true);
    expectMoneyInvariant(before, state);
  });

  it('circus visitors walk in from the gate for the evening and home again (view only)', () => {
    const { state } = villageFixture();
    state.hearth.sites = state.hearth.sites.filter((s) => s.pattern !== 'village-green');
    const green = 60 * MAP_SIZE + 60;
    state.hearth.sites.push({
      pattern: 'village-green',
      anchor: green,
      members: [],
      tiles: [],
      seats: [0],
      tick: 0,
    });
    const start = dayTick(24 + 8);
    state.weather.events.push({
      id: 90,
      event: 'circus',
      start,
      end: start + TICKS_PER_DAY,
      forecastTick: start,
    });
    const visitors = (hour: number) => {
      state.tick = dayIndex(start) * TICKS_PER_DAY + Math.round((hour - START_HOUR) * TICKS_PER_HOUR);
      const f = agentFrame(state);
      const rows: number[][] = [];
      for (let o = 0; o < f.length; o += AGENT_STRIDE)
        if (f[o + 7]! & AgentFlags.visitor) rows.push([...f.subarray(o, o + AGENT_STRIDE)]);
      return rows;
    };
    const [gx, gz] = state.meta.valleyGate;
    expect(visitors(12)).toHaveLength(0);
    // The first sets off from the gate in the afternoon, in time for the show at seven.
    let first: number[][] = [];
    for (let hour = 14; hour < 19 && first.length === 0; hour += 0.05) first = visitors(hour);
    expect(first.length).toBeGreaterThan(0);
    expect(Math.abs(first[0]![1]! - (gx + 0.5)) + Math.abs(first[0]![2]! - (gz + 0.5))).toBeLessThan(3);
    // By half past eight they all stand round the green, a few tiles from its middle.
    const show = visitors(20.5);
    expect(show).toHaveLength(visitorCount(state.residents.length));
    for (const r of show) {
      expect(Math.abs(r[1]! - 60.5) + Math.abs(r[2]! - 60.5)).toBeLessThan(5);
      expect(r[5]).toBe(AgentAnim.idle);
      expect(r[0]).toBeGreaterThanOrEqual(VISITOR_ID_BASE);
    }
    // Gone by midnight, and nothing about the state changed.
    expect(visitors(23.9)).toHaveLength(0);
    expect(state.residents.every((r) => r.id < VISITOR_ID_BASE)).toBe(true);
  });

  it('an early frost halves the standing wheat when it starts', () => {
    const { state } = villageFixture();
    const farm = farmAt(state, 60, 90);
    const i = 92 * MAP_SIZE + 64;
    state.map.fieldOwner[i] = farm.id;
    state.map.crop[i] = 255;
    state.tick = dayTick(24 + 12 + 1);
    state.weather.events.push({
      id: 91,
      event: 'early-frost',
      start: state.tick,
      end: state.tick + TICKS_PER_DAY,
      forecastTick: state.tick - TICKS_PER_DAY,
    });
    weatherDay(state, createTickCtx(state));
    expect(state.map.crop[i]).toBeLessThan(255);
    expect(state.chronicle.some((c) => c.kind === 'first-frost')).toBe(true);
  });

  it('a cold snap is forecast with an alert', () => {
    const { state } = villageFixture();
    state.tick = dayTick(24 + 18 + 1);
    state.weather.events.push({
      id: 92,
      event: 'cold-snap',
      start: dayTick(24 + 18 + 2),
      end: dayTick(24 + 18 + 4),
      forecastTick: state.tick,
    });
    const ctx = createTickCtx(state);
    weatherDay(state, ctx);
    expect(ctx.events.some((e) => e.e === 'event.forecast' && e.v.event === 'cold-snap')).toBe(true);
    expect(ctx.events.some((e) => e.e === 'notify' && e.kind === 'event')).toBe(true);
    state.tick += TICKS_PER_DAY;
    const next = createTickCtx(state);
    weatherDay(state, next);
    expect(next.events.some((e) => e.e === 'event.started' && e.v.event === 'cold-snap')).toBe(true);
    void H;
  });
});
