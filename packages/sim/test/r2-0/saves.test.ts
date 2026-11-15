// R2.0 saves (docs/spec/21-networking-and-saves.md, Version changes): the 6-to-7 migration run on a
// real version 6 save, and the evening round's new state surviving a round trip.
//
// The fixture packages/sim/test/golden/v6-hazel-day3.json (the save's bytes in base64) was written by the last commit before R2.0
// (ad9ca6f, "Merge pull request #42"), in a scratch worktree of it, with a tsx script:
//   const s = createWorld('hazel', { ...defaultSettings(), mode: 'standard' });
//   s.time.connected = [0, 1];
//   // turn 1: street on the middle row of meta.startArea (refused, OCCUPIED), zone.paint homes-low on
//   // the two rows above it (accepted; shops are LOCKED), both as seat 0;
//   then advanceTo(s, s.lastTurn + 1) one empty turn at a time until s.tick >= 3 * TICKS_PER_DAY;
//   writeFileSync(path, serialize(s));
// which gives 14 residents, 9 buildings (3 grown on lots) and 4 lots, at saveVersion 6.
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { base64ToBytes } from '../../src/state/base64';
import v6 from '../golden/v6-hazel-day3.json';
import { MAP_SIZE, NEED_IDS, TICKS_PER_DAY } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { RNG_STREAMS, seedStreams, streamIndex } from '../../src/rng/streams';
import { createWorld, defaultSettings } from '../../src/state/create';
import { hashState } from '../../src/state/hash';
import { deserialize, serialize } from '../../src/state/serialize';
import { migrateSave, SAVE_VERSION, type SaveObject } from '../../src/state/version';
import { advanceTo, createTickCtx } from '../../src/turn';
import { expectMoneyInvariant, moneySnapshot } from '../money';

function loadV6(): Uint8Array {
  return base64ToBytes(v6.save);
}

function parseV6(): SaveObject {
  return JSON.parse(strFromU8(gunzipSync(loadV6()))) as SaveObject;
}

/** Runs the world `days` in-game days forward on empty turns, both seats connected. */
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

describe('the version 6 fixture', () => {
  it('is a real version 6 save', () => {
    const raw = parseV6();
    expect(raw.saveVersion).toBe(6);
    expect((raw.residents as { needs: number[] }[])[0]!.needs.length).toBe(NEED_IDS.length - 1);
    expect(raw.places).toBeUndefined();
    expect(loadV6().length).toBeLessThanOrEqual(150 * 1024);
  });
});

describe('migration 6 to 7', () => {
  const raw = parseV6();
  const state = deserialize(loadV6());

  it('lands on version 7', () => {
    expect(SAVE_VERSION).toBe(7);
    expect(state.saveVersion).toBe(7);
  });

  it('gives every resident the evenings need at 50, last', () => {
    expect(state.residents.length).toBeGreaterThan(0);
    expect(NEED_IDS[NEED_IDS.length - 1]).toBe('evenings');
    for (const r of state.residents) {
      expect(r.needs.length).toBe(NEED_IDS.length);
      expect(r.needs[NEED_IDS.length - 1]).toBe(50);
    }
    // The nine needs before it are untouched.
    const before = raw.residents as { needs: number[] }[];
    state.residents.forEach((r, i) => expect(r.needs.slice(0, -1)).toEqual(before[i]!.needs));
  });

  it('makes every lot a plot in row 0', () => {
    expect(state.lots.length).toBeGreaterThan(0);
    for (const l of state.lots) {
      expect(l.row).toBe(0);
      expect(l.kind).toBe('plot');
    }
  });

  it('gives grown buildings their stand-in storeys and hand-placed ones none', () => {
    const grown = state.buildings.filter((b) => b.lot);
    const placed = state.buildings.filter((b) => !b.lot);
    expect(grown.length).toBeGreaterThan(0);
    expect(placed.length).toBeGreaterThan(0);
    for (const b of grown) {
      if (b.trade) expect(b.storeys).toBe([1, 1.5, 2][Math.max(0, Math.min(2, (b.level ?? 1) - 1))]);
      else if (b.def === 'cottage') expect(b.storeys).toBe(1.5);
      else if (b.def === 'townhouse') expect(b.storeys).toBe(2);
      else expect(b.storeys).toBe(1);
    }
    for (const b of placed) expect(b.storeys).toBeUndefined();
  });

  it('zeroes both footfall layers', () => {
    for (const name of ['footfallDay', 'footfallEve'] as const) {
      const layer = state.map[name];
      expect(layer).toBeInstanceOf(Uint16Array);
      expect(layer.length).toBe(MAP_SIZE * MAP_SIZE);
      expect(layer.every((v) => v === 0)).toBe(true);
    }
  });

  it('adds the round stream, freshly seeded, and leaves the others alone', () => {
    expect(state.rng.length).toBe(RNG_STREAMS.length * 4);
    const round = streamIndex('round') * 4;
    expect(RNG_STREAMS[RNG_STREAMS.length - 1]).toBe('round');
    expect(Array.from(state.rng.slice(round, round + 4))).toEqual(
      Array.from(seedStreams(state.seed).slice(round, round + 4)),
    );
    // The older streams' words match the version 6 save's bytes.
    const old = new Uint32Array(new Uint8Array(base64ToBytes(raw.rng as string)).buffer);
    expect(old.length).toBe(round);
    expect(Array.from(state.rng.slice(0, round))).toEqual(Array.from(old));
  });

  it('starts with no places, streets or gaps and an empty evening', () => {
    expect(state.places).toEqual([]);
    expect(state.streets).toEqual([]);
    expect(state.gaps).toEqual({
      open: [],
      closed: [],
      streaks: [],
      closedCount: 0,
      closedBySeat: [0, 0, 0, 0],
      credited: [],
    });
    expect(state.evenings.tonight.day).toBe(-1);
    expect(state.evenings.history).toEqual([]);
  });

  it('re-serializes and deserializes to an equal hash', () => {
    const again = deserialize(serialize(state));
    expect(again.saveVersion).toBe(7);
    expect(hashState(again)).toBe(hashState(state));
  });

  it(
    'runs 10 in-game days on the stand-ins, twice to the same hash, money intact',
    { timeout: 60_000 },
    () => {
      const hashes: string[] = [];
      for (let k = 0; k < 2; k++) {
        const s = deserialize(loadV6());
        const before = moneySnapshot(s);
        const day0 = s.tick;
        runDays(s, 10);
        expect(s.tick - day0).toBeGreaterThanOrEqual(10 * TICKS_PER_DAY);
        expectMoneyInvariant(before, s);
        hashes.push(hashState(s));
      }
      expect(hashes[0]).toBe(hashes[1]);
    },
  );
});

describe('a fresh valley', () => {
  it(
    'runs 10 days twice to the same hash, keeps the money invariant and survives a save',
    { timeout: 60_000 },
    () => {
      const hashes: string[] = [];
      let last: WorldState | null = null;
      for (let k = 0; k < 2; k++) {
        const s = createWorld('willow', { ...defaultSettings(), mode: 'standard' });
        const before = moneySnapshot(s);
        runDays(s, 10);
        expectMoneyInvariant(before, s);
        hashes.push(hashState(s));
        last = s;
      }
      expect(hashes[0]).toBe(hashes[1]);
      const back = deserialize(serialize(last!));
      expect(hashState(back)).toBe(hashes[0]);
    },
  );
});

describe('footfall layers', () => {
  it('round-trip through a save and are hashed', () => {
    const s = createWorld('willow', { ...defaultSettings(), mode: 'standard' });
    s.map.footfallDay[5] = 1;
    s.map.footfallDay[1000] = 65535;
    s.map.footfallEve[7] = 300;
    s.map.footfallEve[MAP_SIZE * MAP_SIZE - 1] = 65535;
    const back = deserialize(serialize(s));
    expect(back.map.footfallDay[5]).toBe(1);
    expect(back.map.footfallDay[1000]).toBe(65535);
    expect(back.map.footfallEve[7]).toBe(300);
    expect(back.map.footfallEve[MAP_SIZE * MAP_SIZE - 1]).toBe(65535);
    expect(back.map.footfallDay[6]).toBe(0);
    expect(hashState(back)).toBe(hashState(s));
    const h = hashState(s);
    s.map.footfallEve[7] = 301;
    expect(hashState(s)).not.toBe(h);
    s.map.footfallEve[7] = 300;
    s.map.footfallDay[5] = 2;
    expect(hashState(s)).not.toBe(h);
  });
});

describe('save versions', () => {
  it('leaves a version 7 save as it is and refuses version 8 as newer', () => {
    const save = parseV6();
    const seven = migrateSave(save);
    expect(seven.saveVersion).toBe(7);
    expect(migrateSave(seven)).toBe(seven);
    const bytes = serialize(deserialize(loadV6()));
    const parsed = JSON.parse(strFromU8(gunzipSync(bytes))) as { saveVersion: number };
    parsed.saveVersion = 8;
    const eight = gzipSync(strToU8(JSON.stringify(parsed)), { level: 6, mtime: 0 });
    expect(() => deserialize(eight)).toThrow(/newer than this game/);
  });
});
