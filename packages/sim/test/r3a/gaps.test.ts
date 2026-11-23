// R3A: the fourth gap, a place short of supplies. It opens after two fair evenings of resting lanterns,
// closes after two supplied ones, credits the seat that kept the place (or switched the places on),
// holds in the rain, skips a place set to let rest, drops with its place, and the audit's two rules
// (gap-unmeetable, gap-dead-end) never flag it where the town could meet it.
import { content } from '@qoti/content';
import { afterEach, describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import type { EntityId, WorldState } from '../../src/contracts';
import { emptyTally, newPlaceState, placeState } from '../../src/state/evenings';
import { worldIndex } from '../../src/state/worldIndex';
import { gapAchievable } from '../../src/systems/gaps/achievable';
import { findGap } from '../../src/systems/gaps/api';
import { GAPS_OFFSET, gaps } from '../../src/systems/gaps';
import { placeIndex } from '../../src/systems/places';
import { bumpPlaceInputs } from '../../src/systems/places/inputs';
import { shortGapAchievable, shortGapClosable, shortGapWords } from '../../src/systems/supplies/gapChecks';
import { createTickCtx, type SimCtx } from '../../src/turn';
import { gapClosedText, gapsView } from '../../src/view/gaps';
import { HealthWatch } from '../../src/view/health';
import { villageFixture } from '../fixtures/village';
import { decor } from '../hearth/helpers';

const KIND = 'shortOfSupplies' as const;
const def = content.gapByKind.get(KIND)!;
const CANDLES = content.goodIndex.get('candles')!;
const NAME = 'the bench by the oak';

interface Town {
  s: WorldState;
  ctx: SimCtx;
  place: string;
  lanterns: EntityId[];
  bench: EntityId;
}

/** A Village with a bench and six lanterns round it (two candles a night). */
function town(): Town {
  const s = villageFixture().state;
  for (const fam of s.carrier.families) fam.reserve = 0;
  const bench = decor(s, 'bench', 64, 40);
  const lanterns: EntityId[] = [];
  for (const [x, z] of [
    [63, 40],
    [65, 40],
    [64, 39],
    [64, 41],
    [63, 39],
    [65, 41],
  ])
    lanterns.push(decor(s, 'lantern', x!, z!));
  bumpPlaceInputs(s);
  const place = placeIndex(s).places.find((p) => p.members.includes(bench))!.id;
  const row = newPlaceState(place, NAME, 0);
  s.places.push(row);
  s.places.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { s, ctx: createTickCtx(s), place, lanterns, bench };
}

/**
 * One fair (or other) evening: the night settled with the lanterns resting or lit, `visitors` at the
 * place (the gap's threshold unless given), then the gaps pass.
 */
function evening(
  t: Town,
  day: number,
  rests: boolean,
  weather: 'fair' | 'rain' | 'storm' = 'fair',
  visitors: number = def.threshold,
): void {
  const { s } = t;
  const row = s.places.find((p) => p.id === t.place);
  if (row) row.visitors = [visitors];
  s.supplies.night = day;
  s.supplies.lamps = rests ? [] : t.lanterns.map((id) => ({ id, reach: 0 }));
  const tally = emptyTally(day);
  tally.weather = weather;
  s.evenings.tonight = tally;
  s.tick = day * TICKS_PER_DAY + GAPS_OFFSET;
  t.ctx.events.length = 0;
  gaps.tick(s, t.ctx);
}

/** The fourth gap's streaks (R2's rules keep their own beside them once a place draws 8). */
function fourth(t: Town) {
  return t.s.gaps.streaks.filter((x) => x.kind === KIND);
}

function open(t: Town) {
  return findGap(t.s, KIND, t.place);
}

/** Runs the evenings that open the gap and returns the next day index. */
function openIt(t: Town): number {
  let day = 0;
  for (let i = 0; i < def.openAfter; i++) evening(t, day++, true);
  expect(open(t)).toBeDefined();
  return day;
}

// The town without anyone to make or sell candles: the unmeetable case, put back afterward.
const saved = { trades: [...content.trades], sells: content.neighbors.map((n) => n.sells) };
function withoutCandleSources(): void {
  const keep = content.trades.filter((x) => x.makes !== 'candles');
  (content.trades as unknown as unknown[]).splice(0, content.trades.length, ...keep);
  for (const n of content.neighbors) n.sells = n.sells.filter(([g]) => g !== 'candles');
}
afterEach(() => {
  (content.trades as unknown as unknown[]).splice(0, content.trades.length, ...saved.trades);
  content.neighbors.forEach((n, i) => (n.sells = saved.sells[i]!));
});

describe('the fourth gap opens and closes', () => {
  it('opens after two fair evenings of resting lanterns and reads like a request', () => {
    const t = town();
    evening(t, 0, true);
    expect(open(t)).toBeUndefined();
    expect(fourth(t)).toEqual([{ kind: KIND, subject: t.place, n: 1 }]);
    evening(t, 1, true);
    const gap = open(t)!;
    expect(gap.n).toBe(2);
    expect(gap.tile).toBe(placeIndex(t.s).byId.get(t.place)!.tile);
    expect(fourth(t)).toEqual([]);
    expect(t.ctx.events.map((e) => e.e)).toContain('gaps.updated');
    expect(shortGapWords(t.s, gap)).toEqual({ good: 'candles', when: 'a night', makes: 0 });
    const text = gapsView(t.s).open.find((g) => g.id === gap.id)!.text;
    expect(text).toContain('The bench by the oak');
    expect(text).toContain('2 candles a night');
    expect(text).toMatch(/the town makes 0/);
    expect(text).not.toMatch(/[{}]/);
  });

  it('opens only for a place folk came to, and a quiet evening does not close it', () => {
    const t = town();
    let day = 0;
    for (let i = 0; i < def.openAfter + 1; i++) evening(t, day++, true, 'fair', def.threshold - 1);
    expect(open(t)).toBeUndefined();
    day = openIt(t) + day;
    for (let i = 0; i < def.closeAfter + 1; i++) evening(t, day++, true, 'fair', 0);
    expect(open(t)).toBeDefined();
  });

  it('every variant fills every placeholder', () => {
    const t = town();
    openIt(t);
    const gap = open(t)!;
    for (let id = 0; id < def.text.length; id++) {
      gap.id = id;
      const text = gapsView(t.s).open[0]!.text;
      expect(text, def.text[id]).not.toMatch(/[{}]/);
      expect(text).toContain('2 candles a night');
    }
  });

  it('refreshes n while it rests, and the words quote what the town made yesterday', () => {
    const t = town();
    const day = openIt(t);
    t.s.economy.yesterday.produced[CANDLES] = 3;
    const extra = decor(t.s, 'lantern', 63, 41);
    t.lanterns.push(extra);
    bumpPlaceInputs(t.s);
    evening(t, day, true);
    expect(open(t)!.n).toBe(2);
    for (const [x, z] of [
      [65, 39],
      [64, 40],
      [64, 40],
    ])
      t.lanterns.push(decor(t.s, 'lantern', x!, z!));
    bumpPlaceInputs(t.s);
    evening(t, day + 1, true);
    const gap = open(t)!;
    expect(gap.n).toBe(Math.ceil(placeCount(t) / 4));
    expect(shortGapWords(t.s, gap).makes).toBe(3);
  });

  it('closes after two supplied evenings and credits the Ledger seats when no one set anything', () => {
    const t = town();
    let day = openIt(t);
    evening(t, day++, false);
    expect(open(t)).toBeDefined();
    evening(t, day, false);
    expect(open(t)).toBeUndefined();
    const closed = t.s.gaps.closed[0]!;
    expect(closed.closers).toEqual(t.s.seats.filter((x) => x.lens === 'ledger').map((x) => x.seat));
    expect(closed.closers!.length).toBeGreaterThan(0);
    const words = gapClosedText(t.s, closed);
    expect(words).toContain('is supplied again');
    expect(words).not.toMatch(/[{}]/);
  });

  it('credits the seat that kept the place since the gap opened, not one that kept it before', () => {
    const t = town();
    const row = placeState(t.s, t.place)!;
    row.priority = 'keep';
    row.prioritySet = { seat: 0, tick: 0 };
    let day = openIt(t);
    // A keep set before the gap opened earns nothing: the Ledger's seats are credited.
    evening(t, day++, false);
    evening(t, day, false);
    expect(t.s.gaps.closed[0]!.closers).toEqual([1]);

    const u = town();
    const r2 = placeState(u.s, u.place)!;
    let d2 = openIt(u);
    r2.priority = 'keep';
    r2.prioritySet = { seat: 0, tick: d2 * TICKS_PER_DAY + 5 };
    evening(u, d2++, false);
    evening(u, d2, false);
    expect(u.s.gaps.closed[0]!.closers).toEqual([0]);
  });

  it('credits the seat that switched the places on, the later of the two when both were set', () => {
    const t = town();
    let day = openIt(t);
    const fuel = t.s.carrier.families[0]!;
    // The candles' family is Wares.
    const wares = t.s.carrier.families[3]!;
    expect(content.goods[CANDLES]!.family).toBe('wares');
    wares.places = true;
    wares.placesSet = { seat: 0, tick: day * TICKS_PER_DAY + 10 };
    expect(fuel.places).toBeFalsy();
    evening(t, day++, false);
    evening(t, day, false);
    expect(t.s.gaps.closed[0]!.closers).toEqual([0]);
  });

  it('rain and storm hold the streaks as they are', () => {
    const t = town();
    evening(t, 0, true);
    evening(t, 1, true, 'rain');
    evening(t, 2, true, 'storm');
    expect(open(t)).toBeUndefined();
    expect(fourth(t)).toEqual([{ kind: KIND, subject: t.place, n: 1 }]);
    evening(t, 3, true);
    expect(open(t)).toBeDefined();
    // And an open gap holds through rain as well.
    evening(t, 4, false);
    evening(t, 5, false, 'rain');
    expect(open(t)).toBeDefined();
    evening(t, 6, false);
    expect(open(t)).toBeUndefined();
  });

  it('a night supplied in between resets the opening streak', () => {
    const t = town();
    evening(t, 0, true);
    evening(t, 1, false);
    evening(t, 2, true);
    expect(open(t)).toBeUndefined();
  });

  it('a place set to let rest opens nothing and loses its open gap without credit', () => {
    const t = town();
    placeState(t.s, t.place)!.priority = 'rest';
    for (let day = 0; day < 4; day++) evening(t, day, true);
    expect(open(t)).toBeUndefined();
    expect(fourth(t)).toEqual([]);

    const u = town();
    const day = openIt(u);
    const before = u.s.gaps.closedCount;
    placeState(u.s, u.place)!.priority = 'rest';
    evening(u, day, true);
    expect(open(u)).toBeUndefined();
    expect(u.s.gaps.closed).toEqual([]);
    expect(u.s.gaps.closedCount).toBe(before);
  });

  it('a gone place drops its gap with no credit', () => {
    const t = town();
    const day = openIt(t);
    const grid = worldIndex(t.s).decorGrid;
    for (const id of [t.bench, ...t.lanterns]) {
      const d = t.s.decor.find((x) => x.id === id)!;
      grid.remove(d);
      t.s.decor.splice(t.s.decor.indexOf(d), 1);
    }
    bumpPlaceInputs(t.s);
    evening(t, day, true);
    expect(open(t)).toBeUndefined();
    expect(t.s.gaps.closed).toEqual([]);
    expect(t.s.gaps.closedCount).toBe(0);
  });

  it('opens nothing in a town with no pieces that draw goods', () => {
    const t = town();
    const bare: Town = { ...t, s: villageFixture().state, lanterns: [] };
    bare.ctx = createTickCtx(bare.s);
    for (let day = 0; day < 4; day++) evening(bare, day, true);
    expect(bare.s.gaps.open.filter((g) => g.kind === KIND)).toEqual([]);
  });
});

function placeCount(t: Town): number {
  return t.lanterns.length;
}

describe('the fourth gap and the audit', () => {
  it('shortGapAchievable is true where a chandler could grow or a neighbor sells, false where neither', () => {
    const t = town();
    expect(shortGapAchievable(t.s)).toBe(true);
    expect(gapAchievable(t.s, KIND)).toBe(true);
    withoutCandleSources();
    expect(shortGapAchievable(t.s)).toBe(false);
    expect(gapAchievable(t.s, KIND)).toBe(false);
  });

  it('shortGapAchievable is true with no pieces that draw goods', () => {
    const s = villageFixture().state;
    withoutCandleSources();
    expect(shortGapAchievable(s)).toBe(true);
  });

  it('with no source the gap never opens (the pass keeps the streak)', () => {
    const t = town();
    withoutCandleSources();
    for (let day = 0; day < 4; day++) evening(t, day, true);
    expect(open(t)).toBeUndefined();
  });

  it('shortGapClosable is true while a neighbor sells the good, false when nothing could', () => {
    const t = town();
    openIt(t);
    const gap = open(t)!;
    expect(shortGapClosable(t.s, gap)).toBe(true);
    withoutCandleSources();
    expect(shortGapClosable(t.s, gap)).toBe(false);
    // The town holds some, or places drew some elsewhere last night: a lower reserve or a priority helps.
    t.s.economy.yesterday.produced[CANDLES] = 1;
    expect(shortGapClosable(t.s, gap)).toBe(true);
  });

  it('an open fourth gap in a town the audit can meet is neither unmeetable nor a dead end', () => {
    const t = town();
    openIt(t);
    const watch = new HealthWatch();
    watch.check(t.s);
    t.s.tick += TICKS_PER_DAY;
    const flags = watch.check(t.s).filter((i) => i.kind === 'gap-unmeetable' || i.kind === 'gap-dead-end');
    expect(flags).toEqual([]);
  });

  it('the audit does flag it where nothing could make or sell the good', () => {
    const t = town();
    openIt(t);
    withoutCandleSources();
    const watch = new HealthWatch();
    watch.check(t.s);
    t.s.tick += TICKS_PER_DAY;
    const kinds = watch.check(t.s).map((i) => i.kind);
    expect(kinds).toContain('gap-unmeetable');
  });
});
