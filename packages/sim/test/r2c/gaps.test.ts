/* eslint-disable no-restricted-syntax -- vi.mock factories are async */
// R2C: the three R2 gaps open and close by rule, credit the right seats once a season, hold on bad
// weather, never open in a Hamlet and drop a gap whose subject is gone.
import { content } from '@qoti/content';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Decor, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { findGap, openGap } from '../../src/systems/gaps/api';
import { gapAchievable } from '../../src/systems/gaps/achievable';
import { hamletFixture } from '../fixtures/hamlet';
import { villageFixture, type VillageFixture } from '../fixtures/village';
import {
  injected,
  mkPlace,
  newCtx,
  night,
  resetInjected,
  rowOf,
  setPlaces,
  setRound,
  stockTreats,
} from './harness';

vi.mock('../../src/systems/places/index', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const h = await import('./injected');
  return {
    ...actual,
    placeIndex: () => ({ places: h.injected.places, byId: h.injected.byId }),
  };
});
vi.mock('../../src/systems/places/streets', async () => {
  const h = await import('./injected');
  return { streetTiles: (_s: unknown, street: { id: number }) => h.injected.streets.get(street.id) ?? [] };
});

const S = 192;
const PROMENADE = 'seats:1';
const OPEN_AFTER = content.gapByKind.get('nothingToSell')!.openAfter;
const CLOSE_AFTER = content.gapByKind.get('nothingToSell')!.closeAfter;

function village(): VillageFixture {
  resetInjected();
  const f = villageFixture();
  f.state.charter.rank = 'village';
  return f;
}

function eventNames(events: { e: string }[]): string[] {
  return events.map((e) => e.e);
}

describe('a place with nothing to sell', () => {
  let f: VillageFixture;
  let state: WorldState;
  let stall: number;
  beforeEach(() => {
    f = village();
    state = f.state;
    stall = f.b.stalls[0];
    setPlaces([mkPlace(PROMENADE, 70 * S + 60, [stall])]);
  });

  it('opens after exactly openAfter qualifying evenings, refreshes n, and says so once', () => {
    const ctx = newCtx(state);
    let day = 0;
    for (let i = 0; i < OPEN_AFTER - 1; i++) {
      const ev = night(state, ctx, { day: day++, places: { [PROMENADE]: { v: 9 } } });
      expect(findGap(state, 'nothingToSell', PROMENADE)).toBeUndefined();
      expect(eventNames(ev)).not.toContain('gaps.updated');
    }
    expect(state.gaps.streaks).toEqual([{ kind: 'nothingToSell', subject: PROMENADE, n: OPEN_AFTER - 1 }]);
    const ev = night(state, ctx, { day: day++, places: { [PROMENADE]: { v: 9 } } });
    const gap = findGap(state, 'nothingToSell', PROMENADE)!;
    expect(gap.n).toBe(9);
    expect(gap.tile).toBe(70 * S + 60);
    expect(state.gaps.streaks).toEqual([]);
    expect(eventNames(ev)).toEqual(['gaps.updated', 'evening.closed']);
    // n refreshes while the rule still holds, and that is news too.
    const ev2 = night(state, ctx, { day: day++, places: { [PROMENADE]: { v: 12 } } });
    expect(gap.n).toBe(12);
    expect(eventNames(ev2)).toEqual(['gaps.updated', 'evening.closed']);
    // A quiet pass says nothing about gaps.
    const ev3 = night(state, ctx, { day, places: { [PROMENADE]: { v: 12 } } });
    expect(eventNames(ev3)).toEqual(['evening.closed']);
  });

  it('does not open when an evening breaks the run, or when something was sold', () => {
    const ctx = newCtx(state);
    night(state, ctx, { day: 0, places: { [PROMENADE]: { v: 9 } } });
    night(state, ctx, { day: 1, places: { [PROMENADE]: { v: 3 } } });
    night(state, ctx, { day: 2, places: { [PROMENADE]: { v: 9 } } });
    expect(state.gaps.open).toEqual([]);
    expect(state.gaps.streaks.length).toBe(1);
    night(state, ctx, { day: 3, places: { [PROMENADE]: { v: 9, s: 1 } } });
    expect(state.gaps.open).toEqual([]);
    expect(state.gaps.streaks).toEqual([]);
  });

  function openIt(ctx: ReturnType<typeof newCtx>, from = 0): number {
    let day = from;
    for (let i = 0; i < OPEN_AFTER; i++) night(state, ctx, { day: day++, places: { [PROMENADE]: { v: 9 } } });
    expect(findGap(state, 'nothingToSell', PROMENADE)).toBeDefined();
    return day;
  }

  it('closes after closeAfter serving evenings, crediting the outlet builder, and emits once', () => {
    const ctx = newCtx(state);
    let day = openIt(ctx);
    stockTreats(findById(state.buildings, stall)!);
    for (let i = 0; i < CLOSE_AFTER - 1; i++) {
      const ev = night(state, ctx, { day: day++, places: { [PROMENADE]: { v: 9, s: 1 } } });
      expect(state.gaps.open.length).toBe(1);
      expect(eventNames(ev)).not.toContain('gaps.updated');
    }
    const ev = night(state, ctx, { day, places: { [PROMENADE]: { v: 9, s: 1 } } });
    expect(state.gaps.open).toEqual([]);
    expect(state.gaps.closedCount).toBe(1);
    const closed = state.gaps.closed[0]!;
    expect(closed.closers).toEqual([findById(state.buildings, stall)!.builtBy]);
    expect(state.gaps.closedBySeat[closed.closers![0]!]).toBe(1);
    expect(state.gaps.streaks.filter((x) => x.kind === 'nothingToSell')).toEqual([]);
    expect(eventNames(ev)).toEqual(['gaps.updated', 'evening.closed']);
  });

  it('credits a grown outlet to the Ledger seats and a place laid by both seats to both', () => {
    const ctx = newCtx(state);
    const a = findById(state.buildings, f.b.stalls[0])!;
    const b = findById(state.buildings, f.b.stalls[1])!;
    // Hand-placed by seat 1 and by seat 0: both are credited when both serve.
    a.builtBy = 1;
    b.builtBy = 0;
    setPlaces([mkPlace(PROMENADE, 70 * S + 60, [a.id, b.id])]);
    let day = openIt(ctx);
    stockTreats(a);
    stockTreats(b);
    for (let i = 0; i < CLOSE_AFTER; i++)
      night(state, ctx, { day: day++, places: { [PROMENADE]: { v: 9, s: 2 } } });
    expect(state.gaps.closed[0]!.closers).toEqual([0, 1]);
  });

  it('credits a grown outlet (it has a lot) to the Ledger-lens seats, not its builtBy', () => {
    const ctx = newCtx(state);
    const a = findById(state.buildings, stall)!;
    a.builtBy = 0;
    a.lot = f.lots.shops[0]!;
    // Seat 1 plays the Ledger in the fixture.
    expect(state.seats.filter((s) => s.lens === 'ledger').map((s) => s.seat)).toEqual([1]);
    const day = openIt(ctx);
    stockTreats(a);
    for (let i = 0; i < CLOSE_AFTER; i++)
      night(state, ctx, { day: day + i, places: { [PROMENADE]: { v: 9, s: 1 } } });
    expect(state.gaps.closed[0]!.closers).toEqual([1]);
  });

  it('credits the same subject once a season, and again after a season turn clears it', () => {
    const ctx = newCtx(state);
    const a = findById(state.buildings, stall)!;
    stockTreats(a);
    // Days 0..5 are the first season; open, close, open, close inside it.
    let day = openIt(ctx);
    for (let i = 0; i < CLOSE_AFTER; i++)
      night(state, ctx, { day: day++, places: { [PROMENADE]: { v: 9, s: 1 } } });
    expect(state.gaps.closed[0]!.closers).toEqual([a.builtBy]);
    expect(state.gaps.credited).toEqual([`nothingToSell:${PROMENADE}`]);
    // Open it again by hand so the whole thing stays inside the season's six days.
    openGap(state, ctx, 'nothingToSell', PROMENADE, 70 * S + 60, 9);
    for (let i = 0; i < CLOSE_AFTER; i++)
      night(state, ctx, { day: day++, places: { [PROMENADE]: { v: 9, s: 1 } } });
    expect(state.gaps.closedCount).toBe(2);
    expect(state.gaps.closed[1]!.closers).toEqual([]);
    expect(state.gaps.closedBySeat[a.builtBy]).toBe(1);
    // The next season's day 1 clears the credits; then a close credits again.
    let next = Math.ceil(day / 6) * 6;
    night(state, ctx, { day: next++, places: { [PROMENADE]: { v: 9 } } });
    expect(state.gaps.credited).toEqual([]);
    next = openIt(ctx, next);
    for (let i = 0; i < CLOSE_AFTER; i++)
      night(state, ctx, { day: next++, places: { [PROMENADE]: { v: 9, s: 1 } } });
    expect(state.gaps.closed[state.gaps.closed.length - 1]!.closers).toEqual([a.builtBy]);
    expect(state.gaps.closedBySeat[a.builtBy]).toBe(2);
  });

  it('holds every streak and gap on a rain or storm evening', () => {
    const ctx = newCtx(state);
    night(state, ctx, { day: 0, places: { [PROMENADE]: { v: 9 } } });
    expect(state.gaps.streaks[0]!.n).toBe(1);
    const rain = night(state, ctx, { day: 1, weather: 'rain', places: { [PROMENADE]: { v: 0 } } });
    night(state, ctx, { day: 2, weather: 'storm', places: { [PROMENADE]: { v: 0 } } });
    expect(state.gaps.streaks[0]!.n).toBe(1);
    expect(state.gaps.open).toEqual([]);
    expect(eventNames(rain)).toEqual(['evening.closed']);
    night(state, ctx, { day: 3, places: { [PROMENADE]: { v: 9 } } });
    expect(findGap(state, 'nothingToSell', PROMENADE)).toBeDefined();
    stockTreats(findById(state.buildings, stall)!);
    night(state, ctx, { day: 4, weather: 'rain', places: { [PROMENADE]: { v: 9, s: 1 } } });
    night(state, ctx, { day: 5, weather: 'rain', places: { [PROMENADE]: { v: 9, s: 1 } } });
    expect(state.gaps.open.length).toBe(1);
  });

  it('drops a gap whose place is gone: no credit, not counted, not listed', () => {
    const ctx = newCtx(state);
    const day = openIt(ctx);
    setPlaces([]);
    const ev = night(state, ctx, { day });
    expect(state.gaps.open).toEqual([]);
    expect(state.gaps.closed).toEqual([]);
    expect(state.gaps.closedCount).toBe(0);
    expect(state.gaps.closedBySeat.reduce((a, c) => a + c, 0)).toBe(0);
    expect(eventNames(ev)).toEqual(['gaps.updated', 'evening.closed']);
  });

  it('opens nothing when the town cannot meet it, and holds its streaks', () => {
    const ctx = newCtx(state);
    night(state, ctx, { day: 0, places: { [PROMENADE]: { v: 9 } } });
    expect(gapAchievable(state, 'nothingToSell')).toBe(true);
    // No outlet stands and none can be placed: take the rule's one need away.
    const real = state.buildings.splice(0, state.buildings.length);
    const unlocked = vi.spyOn(content.buildings, 'some').mockReturnValue(false);
    expect(gapAchievable(state, 'nothingToSell')).toBe(false);
    night(state, ctx, { day: 1, places: { [PROMENADE]: { v: 9 } } });
    unlocked.mockRestore();
    state.buildings.push(...real);
    expect(state.gaps.open).toEqual([]);
    expect(state.gaps.streaks[0]!.n).toBe(1);
  });
});

describe('a shop nobody passes', () => {
  const kind = 'nobodyPasses';
  const d = content.gapByKind.get(kind)!;
  let f: VillageFixture;
  let state: WorldState;
  let shopId: number;
  let subject: string;
  beforeEach(() => {
    f = village();
    state = f.state;
    const shop = findById(state.buildings, f.b.stalls[0])!;
    shopId = shop.id;
    subject = `building:${shopId}`;
    stockTreats(shop);
    // One place two tiles away from the shop's tile.
    setPlaces([mkPlace('seats:9', shop.z * S + shop.x + 2)]);
  });

  /** One evening with `customers` sales at the shop (its own round counter, as `recordSale` writes it). */
  function evening(ctx: ReturnType<typeof newCtx>, day: number, customers: number, stale = false) {
    const shop = findById(state.buildings, shopId)!;
    shop.roundSales = customers > 0 || stale ? { day: stale ? day - 1 : day, customers } : undefined;
    return night(state, ctx, { day, places: { 'seats:9': { v: 0 } } });
  }

  it("opens after openAfter evenings under the threshold with n tonight's customers, refreshing it while open", () => {
    const ctx = newCtx(state);
    let day = 0;
    for (let i = 0; i < d.openAfter - 1; i++) {
      evening(ctx, day++, 1);
      expect(findGap(state, kind, subject)).toBeUndefined();
    }
    const ev = evening(ctx, day++, 2);
    const gap = findGap(state, kind, subject)!;
    expect(gap.n).toBe(2);
    const shop = findById(state.buildings, shopId)!;
    expect(gap.tile).toBe(shop.z * S + shop.x);
    expect(eventNames(ev)).toEqual(['gaps.updated', 'evening.closed']);
    // Refresh: the card says the latest evening, and a shelf that empties does not drop the gap.
    emptyShelfOf(shopId);
    const ev2 = evening(ctx, day++, 3);
    expect(gap.n).toBe(3);
    expect(eventNames(ev2)).toEqual(['gaps.updated', 'evening.closed']);
    expect(state.gaps.open.length).toBe(1);
  });

  it("closes on an evening with threshold customers, crediting the nearby place's seats", () => {
    const ctx = newCtx(state);
    let day = 0;
    for (let i = 0; i < d.openAfter; i++) evening(ctx, day++, 0);
    expect(findGap(state, kind, subject)!.n).toBe(0);
    const decor: Decor = { id: state.nextId++, def: 'bench', fx: 0, fz: 0, rot: 0, builtBy: 0 };
    state.decor.push(decor);
    injected.places[0]!.members = [decor.id];
    // One short of the bar keeps it open; the bar closes it.
    evening(ctx, day++, d.threshold - 1);
    expect(state.gaps.open.length).toBe(1);
    let closedEv: { e: string }[] = [];
    for (let i = 0; i < d.closeAfter; i++) closedEv = evening(ctx, day++, d.threshold);
    expect(state.gaps.open).toEqual([]);
    expect(state.gaps.closed[0]!.closers).toEqual([0]);
    expect(eventNames(closedEv)).toEqual(['gaps.updated', 'evening.closed']);
  });

  it('credits no one when no place stands near the shop', () => {
    const ctx = newCtx(state);
    setPlaces([]);
    let day = 0;
    for (let i = 0; i < d.openAfter; i++) evening(ctx, day++, 0);
    evening(ctx, day++, d.threshold);
    expect(state.gaps.open).toEqual([]);
    expect(state.gaps.closedCount).toBe(1);
    expect(state.gaps.closed[0]!.closers).toEqual([]);
  });

  it('reads a round row of an earlier day as no customers', () => {
    const ctx = newCtx(state);
    let day = 0;
    for (let i = 0; i < d.openAfter; i++) evening(ctx, day++, d.threshold + 5, true);
    expect(findGap(state, kind, subject)!.n).toBe(0);
  });

  it('does not open with treats off the shelf, and a busy evening resets the streak', () => {
    const ctx = newCtx(state);
    evening(ctx, 0, 1);
    evening(ctx, 1, 1);
    expect(state.gaps.streaks).toEqual([{ kind, subject, n: 2 }]);
    evening(ctx, 2, d.threshold);
    expect(state.gaps.streaks).toEqual([]);
    evening(ctx, 3, 1);
    evening(ctx, 4, 1);
    expect(state.gaps.open).toEqual([]);
    emptyShelfOf(shopId);
    for (let i = 5; i < 9; i++) evening(ctx, i, 0);
    expect(state.gaps.streaks).toEqual([]);
    expect(state.gaps.open).toEqual([]);
  });

  function emptyShelfOf(id: number): void {
    const b = findById(state.buildings, id)!;
    b.rt!.store[content.goodIndex.get('honey')!] = 0;
  }

  it('drops a gap nothing could close any more, and opens it again when ground frees up', () => {
    const ctx = newCtx(state);
    const shop = findById(state.buildings, shopId)!;
    let day = 0;
    for (let i = 0; i < d.openAfter; i++) night(state, ctx, { day: day++, places: { 'seats:9': { v: 0 } } });
    expect(findGap(state, kind, subject)).toBeDefined();
    // The lots around the shop fill in (every tile within six is built on) and its one place is gone.
    const around: number[] = [];
    for (let z = shop.z - 6; z <= shop.z + 6; z++)
      for (let x = shop.x - 6; x <= shop.x + 6; x++) around.push(z * S + x);
    const was = around.map((t) => state.map.occupant[t]!);
    for (const t of around) state.map.occupant[t] = 1;
    setPlaces([mkPlace('seats:9', shop.z * S + shop.x + 40)]);
    night(state, ctx, { day: day++, places: { 'seats:9': { v: 0 } } });
    expect(state.gaps.open.some((g) => g.kind === kind && g.subject === subject)).toBe(false);
    expect(state.gaps.closedCount).toBe(0);
    // Ground frees up: the same quiet evenings open it again.
    around.forEach((t, i) => (state.map.occupant[t] = was[i]!));
    for (let i = 0; i < d.openAfter; i++) night(state, ctx, { day: day++, places: { 'seats:9': { v: 0 } } });
    expect(findGap(state, kind, subject)).toBeDefined();
  });

  it('drops a gap whose shop is gone', () => {
    const ctx = newCtx(state);
    for (let i = 0; i < d.openAfter; i++) night(state, ctx, { day: i, places: { 'seats:9': { v: 0 } } });
    expect(findGap(state, kind, subject)).toBeDefined();
    state.buildings.splice(
      state.buildings.findIndex((b) => b.id === shopId),
      1,
    );
    night(state, ctx, { day: 5 });
    expect(state.gaps.open.some((g) => g.kind === kind && g.subject === subject)).toBe(false);
    expect(state.gaps.closedCount).toBe(0);
  });
});

describe('nowhere to go', () => {
  const kind = 'nowhereToGo';
  const d = content.gapByKind.get(kind)!;
  let f: VillageFixture;
  let state: WorldState;
  let subject: string;
  beforeEach(() => {
    f = village();
    state = f.state;
    // Lane A (z=50) is one street; the seven cottage households stand beside it.
    const tiles: number[] = [];
    for (let x = 32; x <= 96; x++) tiles.push(50 * S + x);
    const street = { id: state.nextId++, anchor: 50 * S + 64, name: 'Lane A' };
    state.streets.push(street);
    injected.streets.set(street.id, tiles);
    subject = `street:${street.id}`;
    setPlaces([mkPlace('seats:3', 52 * S + 50)]);
  });

  function cottageHouseholds(): number[] {
    return f.b.cottages.map((c) => state.households.find((h) => h.homeId === c)!.id);
  }

  function stay(ids: number[], goers: number[] = []): void {
    for (const h of ids) setRound(state, h, goers.includes(h) ? 'seats:3' : null);
  }

  it('opens after openAfter evenings of threshold households staying in, refreshes n, closes when half go', () => {
    const ctx = newCtx(state);
    const all = cottageHouseholds();
    expect(all.length).toBeGreaterThanOrEqual(d.threshold);
    stay(all);
    let day = 0;
    for (let i = 0; i < d.openAfter - 1; i++) {
      night(state, ctx, { day: day++ });
      expect(findGap(state, kind, subject)).toBeUndefined();
    }
    const ev = night(state, ctx, { day: day++ });
    const gap = findGap(state, kind, subject)!;
    expect(gap.n).toBe(all.length);
    expect(eventNames(ev)).toEqual(['gaps.updated', 'evening.closed']);
    // One fewer stays in: still at the threshold, n refreshes.
    stay(all, [all[0]!]);
    const ev2 = night(state, ctx, { day: day++ });
    expect(gap.n).toBe(all.length - 1);
    expect(eventNames(ev2)).toEqual(['gaps.updated', 'evening.closed']);
    // Half go out (the cottage builders' seats get the credit through the place's members).
    const decor: Decor = { id: state.nextId++, def: 'bench', fx: 0, fz: 0, rot: 0, builtBy: 1 };
    state.decor.push(decor);
    injected.places[0]!.members = [decor.id];
    stay(all, all.slice(0, 4));
    for (let i = 0; i < d.closeAfter; i++) night(state, ctx, { day: day++ });
    expect(state.gaps.open).toEqual([]);
    expect(state.gaps.closed[0]!.closers).toEqual([1]);
    expect(state.gaps.closedCount).toBe(1);
  });

  it('does not open with fewer than threshold households staying in', () => {
    const ctx = newCtx(state);
    const all = cottageHouseholds();
    stay(all, all.slice(0, all.length - d.threshold + 1));
    for (let i = 0; i < d.openAfter + 1; i++) night(state, ctx, { day: i });
    expect(state.gaps.open).toEqual([]);
    expect(state.gaps.streaks).toEqual([]);
  });

  it('drops a gap whose street is gone', () => {
    const ctx = newCtx(state);
    stay(cottageHouseholds());
    for (let i = 0; i < d.openAfter; i++) night(state, ctx, { day: i });
    expect(findGap(state, kind, subject)).toBeDefined();
    state.streets.length = 0;
    night(state, ctx, { day: 9 });
    expect(state.gaps.open).toEqual([]);
    expect(state.gaps.closedCount).toBe(0);
  });
});

describe('ranks and evenings', () => {
  it('opens no gap in a Hamlet', () => {
    resetInjected();
    const f = hamletFixture();
    const state = f.state;
    expect(state.charter.rank).toBe('hamlet');
    setPlaces([mkPlace(PROMENADE, 50 * S + 60)]);
    const ctx = newCtx(state);
    for (let i = 0; i < 5; i++) night(state, ctx, { day: i, places: { [PROMENADE]: { v: 20 } } });
    expect(state.gaps.open).toEqual([]);
    expect(state.gaps.streaks).toEqual([]);
  });

  it('does nothing about gaps when no evening happened today', () => {
    const f = village();
    setPlaces([mkPlace(PROMENADE, 70 * S + 60, [f.b.stalls[0]])]);
    rowOf(f.state, PROMENADE);
    const ctx = newCtx(f.state);
    for (let i = 0; i < 4; i++) {
      const ev = night(f.state, ctx, { day: i, noEvening: true, places: { [PROMENADE]: { v: 20 } } });
      expect(ev).toEqual([]);
    }
    expect(f.state.gaps.open).toEqual([]);
    expect(f.state.gaps.streaks).toEqual([]);
  });
});

describe('a kind the town cannot meet yet', () => {
  it('opens nothing and keeps its streak, while an open gap of that kind still closes', async () => {
    const { keepGaps } = await import('../../src/systems/gaps/rules');
    const { passTick } = await import('./harness');
    const f = village();
    const state = f.state;
    const OTHER = 'seats:2';
    setPlaces([
      mkPlace(PROMENADE, 70 * S + 60, [f.b.stalls[0]]),
      mkPlace(OTHER, 90 * S + 90, [f.b.stalls[0]]),
    ]);
    const ctx = newCtx(state);
    // One qualifying evening the ordinary way, so the Promenade has a streak toward opening.
    night(state, ctx, { day: 0, places: { [PROMENADE]: { v: 9 } } });
    const open = openGap(state, ctx, 'nothingToSell', OTHER, 90 * S + 90, 9);
    for (let i = 1; i <= CLOSE_AFTER; i++) {
      // The Promenade still has nothing to sell; the other place is served.
      for (const p of injected.places) {
        const row = rowOf(state, p.id);
        row.visitors.push(p.id === PROMENADE ? 9 : 2);
        row.served.push(p.id === PROMENADE ? 0 : 1);
        row.seenDay = i;
      }
      state.tick = passTick(i);
      keepGaps({ state, ctx, changed: false }, () => false);
    }
    expect(findGap(state, 'nothingToSell', PROMENADE)).toBeUndefined();
    expect(state.gaps.streaks.find((x) => x.subject === PROMENADE)?.n).toBe(1);
    expect(findGap(state, 'nothingToSell', OTHER)).toBeUndefined();
    expect(state.gaps.closed.map((g) => g.id)).toContain(open.id);
  });
});
