// C5B test helpers: the winter fixture with its feast's well gathering place made real (two
// benches and a cherry tree by the well, so the pattern detector finds the site), the clock moved
// to a given hour of the season, and runners that play every system.
import { content } from '@qoti/content';
import { START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { SimEvent, WorldState } from '../../src/contracts';
import { runPatterns } from '../../src/systems/hearth/patterns/engine';
import { applyTurn, createTickCtx } from '../../src/turn';
import { addDecorAt, tickAt } from '../fixtures/seasonsPlace';
import { winterFixture, type WinterFixture } from '../fixtures/winter';

export const good = (id: string): number => content.goodIndex.get(id)!;

/** The winter fixture, its well gathering place detected, at `hour` on `day` of its winter. */
export function feastFixture(day = 6, hour = 11): WinterFixture {
  const f = winterFixture();
  const s = f.state;
  addDecorAt(s, 'bench', 58.5, 53.5);
  addDecorAt(s, 'bench', 63.5, 53.5);
  addDecorAt(s, 'cherry-tree', 61.5, 50.5);
  runPatterns(s, createTickCtx(s));
  s.tick = tickAt(1, 3, day, hour);
  // The plan was made on day 1 of this winter (the fixture's season and year).
  return f;
}

/** Plays every system until state.tick reaches `tick`. Returns the events. */
export function runUntil(state: WorldState, tick: number): SimEvent[] {
  const ctx = createTickCtx(state);
  const out: SimEvent[] = [];
  state.time.desired = state.time.desired.map(() => 1);
  while (state.tick < tick) {
    applyTurn(state, { t: state.lastTurn + 1, cmds: [] }, ctx);
    out.push(...ctx.events);
    ctx.events.length = 0;
  }
  return out;
}

/** The tick of `hour`:00 on the current day. */
export function todayAt(state: WorldState, hour: number): number {
  const day = Math.floor((state.tick + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY);
  return day * TICKS_PER_DAY + (hour - START_HOUR) * TICKS_PER_HOUR;
}

/** Puts `qty` of a good into the first storehouse. */
export function stock(state: WorldState, id: string, qty: number): void {
  const sh = state.buildings.find((b) => b.def === 'storehouse')!;
  sh.rt!.store[good(id)] = qty;
}

/** Units of a good across town stores and output buffers. */
export function inTown(state: WorldState, id: string): number {
  let n = 0;
  for (const b of state.buildings) if (b.rt) n += (b.rt.store[good(id)] ?? 0) + (b.rt.output[good(id)] ?? 0);
  return n;
}
