// R2A: the saved rows by example: a place found is named and remembered, found again is marked seen,
// not found for forgetDays days is forgotten, and places.updated says when something changed.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR, TILE_FP } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { placeState } from '../../src/state/evenings';
import { invalidatePlaces, placeIndex } from '../../src/systems/places';
import { refreshRows } from '../../src/systems/places/rows';
import { createTickCtx } from '../../src/turn';
import { flatWorld, run } from '../helpers';

const fp = (t: number) => t * TILE_FP + TILE_FP / 2;

/** The tick for a day, hour and minute (day 1 or later keeps it positive). */
export function tickAt(day: number, hour: number, minute = 0): number {
  return (
    day * TICKS_PER_DAY +
    hour * TICKS_PER_HOUR +
    Math.round((minute * TICKS_PER_HOUR) / 60) -
    START_HOUR * TICKS_PER_HOUR
  );
}

function benchWorld(): WorldState {
  const w = flatWorld();
  run(w, { t: 'decor.place', def: 'bench', fx: fp(40), fz: fp(40), rot: 0 });
  w.tick = tickAt(2, 12, 30);
  return w;
}

function pass(w: WorldState) {
  const ctx = createTickCtx(w);
  refreshRows(w, ctx);
  return ctx.events.filter((e) => e.e === 'places.updated');
}

describe('the saved rows', () => {
  it('adds one named row for a bench, and a second pass changes and emits nothing', () => {
    const w = benchWorld();
    const first = pass(w);
    expect(w.places.length).toBe(1);
    expect(w.places[0]!.id).toBe(`seats:${w.decor[0]!.id}`);
    expect(w.places[0]!.name).toBe('the bench at the edge of town');
    expect(first.length).toBe(1);
    const before = JSON.stringify(w.places);
    expect(pass(w).length).toBe(0);
    expect(JSON.stringify(w.places)).toBe(before);
  });

  it('moves seenDay forward and leaves the counts alone', () => {
    const w = benchWorld();
    pass(w);
    const row = w.places[0]!;
    row.visitors[0] = 7;
    w.tick = tickAt(3, 12, 30);
    pass(w);
    expect(row.seenDay).toBe(3);
    expect(row.firstDay).toBe(2);
    expect(row.visitors).toEqual([7]);
  });

  it('keeps a vanished place within forgetDays and drops it after', () => {
    const w = benchWorld();
    pass(w);
    const id = w.places[0]!.id;
    w.places[0]!.visitors[0] = 5;
    w.decor.length = 0;
    invalidatePlaces(w);
    expect(placeIndex(w).places.length).toBe(0);
    w.tick = tickAt(2 + content.places.forgetDays, 12, 30);
    pass(w);
    expect(placeState(w, id)?.visitors).toEqual([5]);
    w.tick = tickAt(3 + content.places.forgetDays, 12, 30);
    const ev = pass(w);
    expect(placeState(w, id)).toBeUndefined();
    expect(ev.length).toBe(1);
  });

  it('keeps rows sorted by id as places come, with distinct names', () => {
    const w = flatWorld();
    w.tick = tickAt(2, 12, 30);
    for (const x of [40, 50, 60]) run(w, { t: 'decor.place', def: 'bench', fx: fp(x), fz: fp(40), rot: 0 });
    pass(w);
    const ids = w.places.map((p) => p.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(w.places.map((p) => p.name)).size).toBe(3);
  });

  it('announces at the evening close even when nothing changed', () => {
    const w = benchWorld();
    pass(w);
    expect(pass(w).length).toBe(0);
    w.tick = tickAt(2, content.places.homeHour, 30);
    expect(pass(w).length).toBe(1);
  });

  it('never touches the evening counts', () => {
    const w = benchWorld();
    pass(w);
    const row = w.places[0]!;
    row.visitors = [1, 2];
    row.takings = [3, 4];
    row.sold = [5, 6];
    row.served = [7, 8];
    w.tick = tickAt(4, 9, 30);
    pass(w);
    expect([row.visitors, row.takings, row.sold, row.served]).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
    ]);
  });
});
