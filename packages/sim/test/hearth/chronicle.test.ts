// The Chronicle: founding, season summaries, the weekly digest, place names, and the same words on
// every machine (two runs, and a run that saves and loads halfway).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { LEDGER_CATEGORIES, TICKS_PER_DAY, TICKS_PER_HOUR, TILE_FP } from '../../src/constants';
import type { Command, Turn, WorldState } from '../../src/contracts';
import { hashState } from '../../src/state/hash';
import { deserialize, serialize } from '../../src/state/serialize';
import { emptyPeriod } from '../../src/state/hamlet';
import { writeDigest, writeSeasonSummary } from '../../src/systems/chronicle';
import { placeName } from '../../src/systems/chronicle/text';
import { applyTurn, createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { events, runHours, S, standardWorld } from './helpers';

describe('founding', () => {
  it('is the first entry of a standard valley', () => {
    const w = standardWorld();
    const ctx = runHours(w, 1);
    expect(w.chronicle).toHaveLength(1);
    const c = w.chronicle[0]!;
    expect(c.kind).toBe('founding');
    expect(c.tick).toBe(1);
    expect(c.text).toMatch(/spring/);
    expect(c.text).toMatch(/Ada and Bo/);
    expect(c.text).not.toMatch(/[{}]/);
    expect(events(ctx, 'chronicle.added')).toHaveLength(1);
  });

  it('sandbox valleys keep no Chronicle', () => {
    const w = standardWorld();
    w.settings.mode = 'sandbox';
    runHours(w, 1);
    expect(w.chronicle).toHaveLength(0);
  });
});

describe('season summary', () => {
  function summary(money: [string, number][]): string {
    const f = hamletFixture();
    const ctx = createTickCtx(f.state);
    const p = emptyPeriod();
    for (const [cat, v] of money) p.money[LEDGER_CATEGORIES.findIndex((c) => c.id === cat)] = v;
    f.state.economy.lastSeason = money.length ? p : null;
    writeSeasonSummary(f.state, ctx, 6 * TICKS_PER_DAY - 6 * TICKS_PER_HOUR);
    return f.state.chronicle.at(-1)!.text;
  }

  it('sums up the season that ended, books and all', () => {
    const surplus = summary([
      ['taxes', 5000],
      ['upkeep', 1000],
    ]);
    expect(surplus).toMatch(/Spring/);
    expect(surplus).toMatch(/nine residents/);
    expect(surplus).toMatch(/500 coins/);
    expect(content.chronicle.length).toBeGreaterThan(0);
    const deficit = summary([['construction', 9000]]);
    const quiet = summary([]);
    expect(surplus).not.toBe(deficit);
    expect(deficit).not.toBe(quiet);
    for (const t of [surplus, deficit, quiet]) expect(t).not.toMatch(/[{}]/);
  });

  it('is written at midnight when a new season starts', () => {
    const w = standardWorld();
    w.tick = 6 * TICKS_PER_DAY - 6 * TICKS_PER_HOUR - 10;
    w.lastTurn = w.tick;
    runHours(w, 1);
    const entry = w.chronicle.find((c) => c.kind === 'season-summary')!;
    expect(entry.text).toMatch(/Spring/);
    expect(entry.text).toMatch(/year 1/);
  });
});

describe('weekly digest', () => {
  it('names a few granted wishes and counts the rest', () => {
    const f = hamletFixture();
    const s = f.state;
    const ids = s.residents.map((r) => r.id);
    s.stats.digest = [
      [ids[0]!, 'river-bench'],
      [ids[1]!, 'somewhere-to-sit'],
      [ids[3]!, 'tree-by-my-window'],
      [ids[4]!, 'neighbors'],
    ];
    writeDigest(s, createTickCtx(s));
    const entry = s.chronicle.at(-1)!;
    expect(entry.kind).toBe('wishes-digest');
    expect(entry.text).toMatch(/four wishes/);
    expect(entry.text).toMatch(/Clover/);
    expect(entry.text).toMatch(/Hazel/);
    expect(entry.text).not.toMatch(/[{}]/);
    expect(s.stats.digest).toHaveLength(0);
    writeDigest(s, createTickCtx(s));
    expect(s.chronicle.at(-1)).toBe(entry);
  });

  it('goes out on the evening of every seventh day', () => {
    const w = standardWorld();
    w.tick = 6 * TICKS_PER_DAY + 13 * TICKS_PER_HOUR - 5;
    w.lastTurn = w.tick;
    w.chronicle.push({ id: 1, tick: 0, kind: 'founding', text: 'x', refs: [], seats: [] });
    w.residents.push({ ...hamletFixture().state.residents[0]! });
    w.stats.digest = [[w.residents[0]!.id, 'river-bench']];
    runHours(w, 1);
    expect(w.chronicle.at(-1)!.kind).toBe('wishes-digest');
    expect(w.chronicle.at(-1)!.text).toMatch(/one wish/);
  });
});

describe('place names', () => {
  it('names the spot by its building and the nearest family', () => {
    const f = hamletFixture();
    const ctx = createTickCtx(f.state);
    const well = placeName(f.state, ctx, 52 * S + 57);
    expect(well).toMatch(/well/);
    expect(well).toMatch(/Underbank|Thistledown/);
    expect(placeName(f.state, ctx, 50 * S + 80)).toMatch(/lane/);
    expect(placeName(standardWorld(), ctx, 50 * S + 99)).toMatch(/river|water/);
  });
});

describe('the same words everywhere', () => {
  /** A few days in the hamlet with some building along the way. */
  function script(): Turn[] {
    const at = (x: number, z: number) => ({ fx: x * TILE_FP + 128, fz: z * TILE_FP + 128, rot: 0 });
    const cmds: [number, Command][] = [
      [300, { t: 'decor.place', def: 'bench', ...at(52, 51) }],
      [900, { t: 'tree.plant', species: 'oak', x: 55, z: 47 }],
      [1500, { t: 'decor.place', def: 'flower-bed', ...at(63, 47) }],
      [2600, { t: 'decor.place', def: 'bench', ...at(64, 51) }],
      [5100, { t: 'decor.place', def: 'planter', ...at(57, 47) }],
    ];
    return cmds.map(([t, cmd]) => ({ t, cmds: [{ seat: (t % 2) as 0 | 1, seq: t, cmd }] }));
  }

  function play(state: WorldState, until: number, turns: Turn[]): void {
    const ctx = createTickCtx(state);
    let k = 0;
    while (state.lastTurn < until) {
      const t = state.lastTurn + 1;
      const turn = turns[k]?.t === t ? turns[k++]! : { t, cmds: [] };
      applyTurn(state, turn, ctx);
      ctx.events.length = 0;
      ctx.dirty.clear();
    }
  }

  it('two runs write identical Chronicles, and so does a run saved and loaded halfway', () => {
    const turns = script();
    const end = 2 * TICKS_PER_DAY;
    const a = hamletFixture().state;
    const b = hamletFixture().state;
    play(a, end, turns);
    play(b, end, turns);
    expect(a.chronicle.length).toBeGreaterThan(3);
    expect(a.chronicle.map((c) => c.text)).toEqual(b.chronicle.map((c) => c.text));
    expect(hashState(a)).toBe(hashState(b));

    let c = hamletFixture().state;
    play(c, 1234, turns);
    c = deserialize(serialize(c));
    play(
      c,
      end,
      turns.filter((t) => t.t > 1234),
    );
    expect(c.chronicle.map((x) => x.text)).toEqual(a.chronicle.map((x) => x.text));
    expect(hashState(c)).toBe(hashState(a));
  }, 60_000);
});
