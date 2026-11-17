// R3.0 saves (docs/spec/21-networking-and-saves.md, Version changes): the 8-to-9 migration run on a
// real version 8 valley, and the version 6 fixture carried through every step to 9.
//
// The fixture packages/sim/test/golden/v8-willow-day70.json (the save's bytes in base64, same format
// as v6-hazel-day3.json) is a real version 8 valley, written at 19a031a (the last commit before R3.0)
// by the autoplayer's tune run, from a scratch worktree of that commit:
//   TUNE_SAVE=<file> npm run tune -w @qoti/bench 70 willow
// (seed willow, 70 days, then wrapped as { format, commit, save }). It is mid-winter with the river
// frozen, six level 3 businesses and no R3 state.
import { content } from '@qoti/content';
import { gunzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ResidentFlags, TICKS_PER_DAY } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { base64ToBytes } from '../../src/state/base64';
import { createWorld, defaultSettings } from '../../src/state/create';
import { hashState } from '../../src/state/hash';
import { migrate8to9 } from '../../src/state/migrate9';
import { deserialize, serialize } from '../../src/state/serialize';
import { SAVE_VERSION, type SaveObject } from '../../src/state/version';
import { findSkatingSpots, skatingSpots } from '../../src/systems/seasons/place';
import { advanceTo, createTickCtx } from '../../src/turn';
import v6 from '../golden/v6-hazel-day3.json';
import v8 from '../golden/v8-willow-day70.json';
import { expectMoneyInvariant, moneySnapshot } from '../money';

const V8 = 16;
const V9 = content.goods.length;
const NEW_BASE = [400, 400, 400, 400, 600, 1200, 800, 300, 400];

function bytes8(): Uint8Array {
  return base64ToBytes(v8.save);
}
function parse8(): SaveObject {
  return JSON.parse(strFromU8(gunzipSync(bytes8()))) as SaveObject;
}

function runDays(state: WorldState, days: number): void {
  state.time.connected = [0, 1];
  const ctx = createTickCtx(state);
  const target = state.tick + days * TICKS_PER_DAY;
  let guard = 0;
  while (state.tick < target) {
    advanceTo(state, state.lastTurn + 1, ctx);
    if (++guard > 1_000_000) throw new Error('time does not pass');
  }
}

describe('the version 8 fixture', () => {
  it('is a real version 8 save, 16 goods long, with no R3 state', () => {
    const raw = parse8();
    expect(raw.saveVersion).toBe(8);
    expect(V9).toBe(25);
    expect((raw.market as { prices: number[] }).prices).toHaveLength(V8);
    expect((raw.households as { pantry: number[] }[])[0]!.pantry).toHaveLength(V8);
    for (const k of ['supplies', 'masters', 'townBook', 'threads']) expect(raw[k]).toBeUndefined();
    expect((raw.weather as { river: { frozen: boolean } }).river.frozen).toBe(true);
    expect((raw.weather as { river: { spots?: number[] } }).river.spots).toBeUndefined();
    expect(bytes8().length).toBeLessThanOrEqual(200 * 1024);
  });
});

describe('migration 8 to 9 (R3.0) on the real valley', () => {
  const raw = parse8();
  const state = deserialize(bytes8());

  it('lands on version 9', () => {
    expect(SAVE_VERSION).toBe(9);
    expect(state.saveVersion).toBe(9);
  });

  it('pads every per-good array the header names to 25', () => {
    const allLong = (xs: unknown[]): void => {
      expect(xs.length).toBeGreaterThan(0);
      for (const x of xs) expect((x as number[]).length).toBe(V9);
    };
    let withRt = 0;
    for (const b of state.buildings) {
      if (!b.rt) continue;
      withRt++;
      const rt = b.rt;
      for (const a of [
        rt.input,
        rt.output,
        rt.store,
        rt.reservedIn,
        rt.reservedOut,
        rt.producedToday,
        rt.upgrade,
        rt.moduleWork,
      ])
        if (a) expect(a.length).toBe(V9);
      if (rt.construction) {
        expect(rt.construction.needs.length).toBe(V9);
        expect(rt.construction.delivered.length).toBe(V9);
      }
    }
    expect(withRt).toBeGreaterThan(0);
    for (const h of state.households) {
      expect(h.pantry).toHaveLength(V9);
      expect(h.seen).toHaveLength(V9);
      expect(h.seen!.slice(V8)).toEqual(new Array(V9 - V8).fill(-1));
      expect(h.pantry.slice(V8)).toEqual(new Array(V9 - V8).fill(0));
    }
    for (const k of ['today', 'yesterday', 'season', 'lastSeason'] as const) {
      expect(state.economy[k]!.produced).toHaveLength(V9);
      expect(state.economy[k]!.consumed).toHaveLength(V9);
    }
    allLong(state.economy.stockHistory as unknown[]);
    expect(state.economy.everProduced).toHaveLength(V9);
    expect(state.market.prices).toHaveLength(V9);
    expect(state.market.prices.slice(V8)).toEqual(NEW_BASE);
    expect(state.market.prices.slice(0, V8)).toEqual((raw.market as { prices: number[] }).prices);
    for (const k of ['demand', 'demandToday', 'cover', 'bought', 'boughtToday'] as const)
      expect(state.market[k], k).toHaveLength(V9);
    allLong(state.market.history as unknown[]);
    for (const day of state.market.history) expect(day.slice(V8)).toEqual(NEW_BASE);
    expect(state.levers.priceCaps).toHaveLength(V9);
    expect(state.levers.subsidies).toHaveLength(V9);
    expect(state.trade.neighbors.length).toBeGreaterThan(0);
    for (const nb of state.trade.neighbors) {
      expect(nb.drift).toHaveLength(V9);
      expect(nb.impact).toHaveLength(V9);
      expect(nb.drift.slice(V8)).toEqual(new Array(V9 - V8).fill(1000));
      expect(nb.impact.slice(V8)).toEqual(new Array(V9 - V8).fill(1000));
    }
    allLong(state.carrier.bought as unknown[]);
    allLong(state.carrier.sold as unknown[]);
  });

  it('keeps what the old goods held', () => {
    const before = raw.households as { pantry: number[]; seen: number[] }[];
    state.households.forEach((h, i) => {
      expect(h.pantry.slice(0, V8)).toEqual(before[i]!.pantry);
      expect(h.seen!.slice(0, V8)).toEqual(before[i]!.seen);
    });
  });

  it("gives a keeper's craft the days of their business's trade", () => {
    const byId = new Map(state.residents.map((r) => [r.id, r]));
    let checked = 0;
    for (const b of state.buildings) {
      const keeper = byId.get(b.keeperId ?? 0);
      if (!b.trade || !keeper || !b.counters || b.counters.keeperDays <= 0) continue;
      const row = keeper.craft?.find(([t]) => t === b.trade);
      expect(row, `${b.def}/${b.trade} keeper ${keeper.id}`).toBeDefined();
      expect(row![1]).toBeGreaterThanOrEqual(b.counters.keeperDays);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('flags a four-heart keeper of a level 3 business a master and counts them; the rest keep their level', () => {
    const byId = new Map(state.residents.map((r) => [r.id, r]));
    const level3 = state.buildings.filter((b) => b.trade && b.level === 3);
    expect(level3.length).toBeGreaterThan(0);
    let masters = 0;
    let kept = 0;
    for (const b of level3) {
      const keeper = byId.get(b.keeperId ?? 0);
      const isMaster = !!keeper && keeper.bond >= content.mastery.hearts;
      if (isMaster) {
        masters++;
        expect(keeper!.flags & ResidentFlags.master).toBe(ResidentFlags.master);
        expect(keeper!.mastery).toBe(b.trade);
        expect(b.counters!.levelKept).toBeUndefined();
        if (b.rt?.workers.includes(keeper!.id)) expect(b.masterId).toBe(keeper!.id);
        else expect(b.masterId).toBeUndefined();
      } else {
        kept++;
        expect(b.counters!.levelKept, `${b.def}/${b.trade}`).toBe(true);
        expect(b.masterId).toBeUndefined();
      }
    }
    expect(masters + kept).toBe(level3.length);
    expect(state.masters.made).toBe(masters);
    expect(state.residents.filter((r) => r.flags & ResidentFlags.master).length).toBe(masters);
    for (const r of state.residents) if (r.flags & ResidentFlags.master) expect(r.mastery).toBeDefined();
    if (masters > 0) expect(state.masters.lastMade.length).toBeGreaterThan(0);
  });

  it('loses no business level', () => {
    const before = new Map((raw.buildings as { id: number; level?: number }[]).map((b) => [b.id, b.level]));
    expect(state.buildings.length).toBe(before.size);
    for (const b of state.buildings) expect(b.level, `building ${b.id}`).toBe(before.get(b.id));
  });

  it('keeps the frozen river its skating spots, read once from the loaded map', () => {
    expect(state.weather.river.frozen).toBe(true);
    expect(state.weather.river.spots).toBeDefined();
    expect(state.weather.river.spots!.length).toBeGreaterThan(0);
    expect(state.weather.river.spots).toEqual(findSkatingSpots(state));
    expect([...skatingSpots(state)]).toEqual(findSkatingSpots(state));
  });

  it('starts the R3 slices empty', () => {
    expect(state.supplies).toEqual({
      night: -1,
      lamps: [],
      pieces: [],
      drawn: [],
      lamplighters: [],
      roundSeasons: 0,
      roundSeason: -1,
      roundBroken: false,
    });
    expect(state.townBook).toEqual({ pages: [], hints: [], callings: [] });
    expect(state.threads).toEqual({ pairs: [] });
  });

  it('pads idempotently', () => {
    const once = migrate8to9(parse8());
    const twice = migrate8to9(JSON.parse(JSON.stringify(once)) as SaveObject);
    for (const k of ['market', 'levers', 'carrier', 'trade', 'economy', 'households'] as const)
      expect(JSON.stringify(twice[k]), k).toBe(JSON.stringify(once[k]));
    const lens = (o: SaveObject): number[] =>
      (o.buildings as { rt?: { store: number[] } }[]).flatMap((b) => (b.rt ? [b.rt.store.length] : []));
    expect(lens(twice)).toEqual(lens(once));
    expect(new Set(lens(once))).toEqual(new Set([V9]));
    expect((twice.market as { prices: number[] }).prices).toHaveLength(V9);
  });

  it('re-serializes and deserializes to an equal hash', () => {
    const again = deserialize(serialize(state));
    expect(again.saveVersion).toBe(9);
    expect(hashState(again)).toBe(hashState(state));
  });
});

describe('the version 6 fixture, through every step to 9', () => {
  it('lands on 9 with the R3 slices empty and every per-good array 25 long', () => {
    const s = deserialize(base64ToBytes(v6.save));
    expect(s.saveVersion).toBe(9);
    expect(s.masters).toEqual({ lastMade: [], made: 0 });
    expect(s.supplies.night).toBe(-1);
    expect(s.townBook.pages).toEqual([]);
    expect(s.threads.pairs).toEqual([]);
    expect(s.market.prices).toHaveLength(V9);
    expect(s.market.prices.slice(V8)).toEqual(NEW_BASE);
    for (const h of s.households) expect(h.pantry).toHaveLength(V9);
    for (const b of s.buildings) if (b.rt) expect(b.rt.store).toHaveLength(V9);
    expect(s.weather.river.spots).toBeUndefined();
  });
});

describe('running on the migrated valley and on a fresh one', () => {
  it(
    'runs 10 days from the version 8 valley, no error, money intact, the same hash twice',
    { timeout: 600_000 },
    () => {
      const hashes: string[] = [];
      for (let k = 0; k < 2; k++) {
        const s = deserialize(bytes8());
        const before = moneySnapshot(s);
        const t0 = s.tick;
        runDays(s, 10);
        expect(s.tick - t0).toBeGreaterThanOrEqual(10 * TICKS_PER_DAY);
        expectMoneyInvariant(before, s);
        hashes.push(hashState(s));
      }
      expect(hashes[0]).toBe(hashes[1]);
    },
  );

  it(
    'runs 10 days from a fresh standard valley, money intact, the same hash twice',
    { timeout: 600_000 },
    () => {
      const hashes: string[] = [];
      for (let k = 0; k < 2; k++) {
        const s = createWorld('willow', { ...defaultSettings(), mode: 'standard' });
        const before = moneySnapshot(s);
        runDays(s, 10);
        expectMoneyInvariant(before, s);
        hashes.push(hashState(s));
      }
      expect(hashes[0]).toBe(hashes[1]);
    },
  );

  it(
    'two independent loads of the version 8 valley, run side by side, hash the same every day',
    { timeout: 600_000 },
    () => {
      const a = deserialize(bytes8());
      const b = deserialize(bytes8());
      a.time.connected = [0, 1];
      b.time.connected = [0, 1];
      const ca = createTickCtx(a);
      const cb = createTickCtx(b);
      for (let d = 0; d < 10; d++) {
        const target = a.tick + TICKS_PER_DAY;
        while (a.tick < target) {
          advanceTo(a, a.lastTurn + 1, ca);
          advanceTo(b, b.lastTurn + 1, cb);
        }
        expect(hashState(b), `day ${d}`).toBe(hashState(a));
      }
    },
  );
});
