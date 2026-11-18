// R3D: Follow the thread's counts (systems/threads). recordThread keeps the door pairs sorted and
// bounded (THREAD_PAIRS_PER_DOOR of each good a door), the midnight halving fades them like the flows
// overlay's, and they are saved and hashed: a seat joining from a save reads the same pairs.
import { describe, expect, it } from 'vitest';
import { THREAD_PAIRS_PER_DOOR, TICKS_PER_DAY } from '../../src/constants';
import type { ThreadPair, WorldState } from '../../src/contracts';
import { base64ToBytes } from '../../src/state/base64';
import { createWorld, defaultSettings } from '../../src/state/create';
import { hashState } from '../../src/state/hash';
import { deserialize, serialize } from '../../src/state/serialize';
import { comparePairKey, recordThread } from '../../src/systems/threads/api';
import { decayThreads } from '../../src/systems/threads/index';
import { advanceTo, createTickCtx } from '../../src/turn';
import v8 from '../golden/v8-willow-day70.json';

function world(): WorldState {
  return createWorld('threads', { ...defaultSettings(), mode: 'standard' });
}

function sorted(pairs: readonly ThreadPair[]): boolean {
  for (let i = 1; i < pairs.length; i++) {
    const a = pairs[i - 1]!;
    const b = pairs[i]!;
    if (comparePairKey(a, b.from, b.to, b.place, b.good) >= 0) return false;
  }
  return true;
}

function boundedPerDoorAndGood(pairs: readonly ThreadPair[]): boolean {
  const n = new Map<string, number>();
  for (const p of pairs) n.set(`${p.from}:${p.good}`, (n.get(`${p.from}:${p.good}`) ?? 0) + 1);
  return [...n.values()].every((c) => c <= THREAD_PAIRS_PER_DOOR);
}

function runDays(state: WorldState, days: number): void {
  state.time.connected = [0, 1];
  const ctx = createTickCtx(state);
  const target = state.tick + days * TICKS_PER_DAY;
  while (state.tick < target) advanceTo(state, state.lastTurn + 1, ctx);
}

describe('recordThread', () => {
  it('adds units to a pair and keeps the table in key order', () => {
    const s = world();
    recordThread(s, 20, 31, 2, 3);
    recordThread(s, 10, 'site:lantern-walk:900', 15, 1);
    recordThread(s, 10, 31, 5, 2);
    recordThread(s, 10, 31, 2, 4);
    recordThread(s, 10, 'seats:44', 15, 2);
    recordThread(s, 20, 31, 2, 1);
    expect(sorted(s.threads.pairs)).toBe(true);
    expect(s.threads.pairs).toEqual([
      { from: 10, to: 0, place: 'seats:44', good: 15, units: 2 },
      { from: 10, to: 0, place: 'site:lantern-walk:900', good: 15, units: 1 },
      { from: 10, to: 31, good: 2, units: 4 },
      { from: 10, to: 31, good: 5, units: 2 },
      { from: 20, to: 31, good: 2, units: 4 },
    ]);
  });

  it('records nothing for no units, a door to itself, or in a sandbox valley', () => {
    const s = world();
    recordThread(s, 10, 31, 2, 0);
    recordThread(s, 10, 10, 2, 5);
    expect(s.threads.pairs).toEqual([]);
    const sandbox = createWorld('threads', { ...defaultSettings(), mode: 'sandbox' });
    recordThread(sandbox, 10, 31, 2, 5);
    expect(sandbox.threads.pairs).toEqual([]);
  });

  it('keeps the strongest pairs of each good a door, ties to the lower key', () => {
    const s = world();
    // Nine homes buy bread at one outlet; home 109 the least, homes 101 and 102 tie at the bottom otherwise.
    for (let h = 101; h <= 109; h++) recordThread(s, 50, h, 5, h === 109 ? 1 : 3);
    recordThread(s, 50, 101, 5, 2); // 101 now 5
    const bread = s.threads.pairs.filter((p) => p.from === 50 && p.good === 5);
    expect(bread).toHaveLength(THREAD_PAIRS_PER_DOOR);
    expect(bread.map((p) => p.to)).toEqual([101, 102, 103, 104, 105, 106, 107, 108]);
    // A tenth with as much as the weakest does not push in: of equals, the later key goes.
    recordThread(s, 50, 110, 5, 3);
    expect(s.threads.pairs.filter((p) => p.good === 5).map((p) => p.to)).toEqual([
      101, 102, 103, 104, 105, 106, 107, 108,
    ]);
    // One with more does, and the weakest of equals (the latest key) goes.
    recordThread(s, 50, 111, 5, 4);
    expect(s.threads.pairs.filter((p) => p.good === 5).map((p) => p.to)).toEqual([
      101, 102, 103, 104, 105, 106, 107, 111,
    ]);
    // A full good leaves the door's other goods alone.
    recordThread(s, 50, 101, 9, 1);
    expect(s.threads.pairs.filter((p) => p.from === 50)).toHaveLength(THREAD_PAIRS_PER_DOOR + 1);
    expect(sorted(s.threads.pairs)).toBe(true);
  });
});

describe('the midnight halving', () => {
  it('halves, drops the faded and the pairs whose door is gone, and keeps the order', () => {
    const s = deserialize(base64ToBytes(v8.save));
    const [a, b, c] = s.buildings.map((x) => x.id);
    s.threads.pairs = [];
    recordThread(s, a!, b!, 1, 5);
    recordThread(s, a!, c!, 1, 1);
    recordThread(s, b!, 999_999, 1, 8); // to a building that is not there
    recordThread(s, c!, 'site:nowhere:1', 3, 9); // to a place the town keeps no row for
    const row = s.places[0];
    if (row) recordThread(s, c!, row.id, 3, 3);
    decayThreads(s);
    expect(s.threads.pairs).toEqual([
      { from: a!, to: b!, good: 1, units: 2 },
      ...(row ? [{ from: c!, to: 0, place: row.id, good: 3, units: 1 }] : []),
    ]);
  });

  it('runs once a day at midnight, and the counts stay sorted and bounded in a real Village', () => {
    const s = deserialize(base64ToBytes(v8.save));
    runDays(s, 3);
    const pairs = s.threads.pairs;
    expect(pairs.length).toBeGreaterThan(20);
    expect(sorted(pairs)).toBe(true);
    expect(boundedPerDoorAndGood(pairs)).toBe(true);
    expect(pairs.every((p) => p.units > 0)).toBe(true);
    // Homes, stores and outlets all appear (the willow Village's porters and shoppers).
    const homes = new Set(s.households.map((h) => h.homeId));
    expect(pairs.some((p) => homes.has(p.to))).toBe(true);
    expect(pairs.some((p) => p.to !== 0 && !homes.has(p.to))).toBe(true);
  }, 120_000);

  it('is saved and hashed: a seat joining from a save reads the same pairs and stays in step', () => {
    const s = deserialize(base64ToBytes(v8.save));
    runDays(s, 2);
    const joined = deserialize(serialize(s));
    expect(joined.threads).toEqual(s.threads);
    expect(hashState(joined)).toBe(hashState(s));
    runDays(s, 1);
    runDays(joined, 1);
    expect(joined.threads).toEqual(s.threads);
    expect(hashState(joined)).toBe(hashState(s));
  }, 120_000);
});
