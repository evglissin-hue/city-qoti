// R3B: masters over a year, from a real version 8 valley (packages/sim/test/golden/v8-willow-day70.json:
// willow after 70 autoplayed days, a Village with three keepered level 3 businesses, migrated on load).
// The money invariant holds through the year; the year hashes the same twice and for a seat that joins
// halfway from a snapshot; no business loses a level to the masters' rule when the valley is migrated;
// and the masters' day stays well inside the shared hour budget (22-quality.md: gaps, supplies,
// masters and the Town Book under 1 ms an hour together).
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { base64ToBytes } from '../../src/state/base64';
import { hashState } from '../../src/state/hash';
import { deserialize, serialize } from '../../src/state/serialize';
import { levelOf } from '../../src/state/zones';
import { masterOf, mastersCount } from '../../src/systems/masters/api';
import { masters, MASTERS_OFFSET } from '../../src/systems/masters';
import { advanceTo, createTickCtx } from '../../src/turn';
import v8 from '../golden/v8-willow-day70.json';
import { expectMoneyInvariant, moneySnapshot } from '../money';

const YEAR_DAYS = 24;
// The sim package has no DOM or Node types (determinism): the clock and the log come off globalThis,
// as the gaps budget test does.
const clock = (globalThis as unknown as { performance: { now(): number } }).performance;
const log = (globalThis as unknown as { console: { log(s: string): void } }).console;

function loadV8(): WorldState {
  const state = deserialize(base64ToBytes(v8.save));
  state.time.connected = [0, 1];
  return state;
}

function runDays(state: WorldState, days: number, each?: (s: WorldState) => void): void {
  const ctx = createTickCtx(state);
  const target = state.tick + days * TICKS_PER_DAY;
  let next = state.tick + TICKS_PER_DAY;
  let guard = 0;
  while (state.tick < target) {
    advanceTo(state, state.lastTurn + 1, ctx);
    if (each && state.tick >= next) {
      each(state);
      next += TICKS_PER_DAY;
    }
    if (++guard > 2_000_000) throw new Error('time does not pass');
  }
}

describe('masters over a year from a version 8 valley', () => {
  it(
    'keeps the money invariant, and hashes the same twice and for a seat joining halfway',
    { timeout: 600_000 },
    () => {
      const a = loadV8();
      const before = moneySnapshot(a);
      const made0 = a.masters.made;
      runDays(a, YEAR_DAYS / 2);
      const half = serialize(a);
      runDays(a, YEAR_DAYS / 2);
      expectMoneyInvariant(before, a);

      const b = loadV8();
      runDays(b, YEAR_DAYS);
      expect(hashState(b)).toBe(hashState(a));

      const c = deserialize(half);
      c.time.connected = [0, 1];
      runDays(c, YEAR_DAYS / 2);
      expect(hashState(c)).toBe(hashState(a));

      // The year did something: the migration's masters stand, and the masters' day ran.
      expect(a.masters.made).toBeGreaterThanOrEqual(made0);
      expect(mastersCount(a)).toBeGreaterThan(0);
      const crafted = a.residents.filter((r) => (r.craft?.length ?? 0) > 0).length;
      expect(crafted).toBeGreaterThan(0);
    },
  );

  it(
    'loses no level to the masters rule when migrated: a level 3 business keeps it while kept or mastered',
    { timeout: 300_000 },
    () => {
      const state = loadV8();
      const level3 = state.buildings.filter((b) => b.trade && levelOf(b) === 3);
      expect(level3.length).toBeGreaterThan(0);
      // Each one holds level 3 by the migration's `levelKept` or by a master on its crew.
      for (const b of level3) {
        const held = !!b.counters?.levelKept || masterOf(state, b) !== 0;
        expect(held, `${b.def}/${b.trade} ${b.id}`).toBe(true);
      }
      // A week past the grace, none has slid for want of a master: any that left level 3 had neither a
      // kept level nor a master's grace running out (its slide was the other rules', four failing days).
      const graced = new Map<number, number>();
      runDays(state, 8, (s) => {
        for (const b of level3) {
          const live = s.buildings.find((x) => x.id === b.id) as Building | undefined;
          if (live?.counters?.masterGone !== undefined) graced.set(b.id, live.counters.masterGone);
        }
      });
      expect([...graced.keys()], 'a migrated level 3 business started a master grace').toEqual([]);
    },
  );
});

describe('the masters day budget', () => {
  it('runs a grown Village masters day well inside the shared hour budget', () => {
    const state = loadV8();
    const ctx = createTickCtx(state);
    // Run it at its own hour, as the scheduler would.
    state.tick = Math.floor(state.tick / TICKS_PER_DAY) * TICKS_PER_DAY + MASTERS_OFFSET;
    const runs = 40;
    masters.tick(state, ctx);
    const t0 = clock.now();
    for (let i = 0; i < runs; i++) masters.tick(state, ctx);
    const ms = (clock.now() - t0) / runs;
    log.log(
      `[r3b] masters day on ${state.residents.length} residents: ${ms.toFixed(3)} ms (an hour's share ${(ms / 24).toFixed(4)} ms)`,
    );
    // Once a day; the shared row is 1 ms an hour for gaps, supplies, masters and the Town Book.
    expect(ms).toBeLessThan(2);
  });
});
