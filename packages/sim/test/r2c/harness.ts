// Shared by the R2C gaps and runs tests: injected places and streets (the places pass is R2A's stand-in
// on this branch and finds none), and a way to hold one evening at a time and run the gaps pass.
import { content } from '@qoti/content';
import { RoundFlags, TICKS_PER_DAY } from '../../src/constants';
import type { Building, EntityId, Place, PlaceState, WorldState } from '../../src/contracts';
import { emptyTally, newPlaceState } from '../../src/state/evenings';
import { GAPS_OFFSET, gaps } from '../../src/systems/gaps';
import { createTickCtx, type SimCtx } from '../../src/turn';
import { injected, resetInjected, setPlaces } from './injected';

export { injected, resetInjected, setPlaces };

export function mkPlace(id: string, tile: number, outlets: EntityId[] = [], members: EntityId[] = []): Place {
  return {
    id,
    source: 'seats',
    def: 'bench',
    tile,
    tiles: [tile],
    members,
    seats: 4,
    childSeats: 0,
    standing: 2,
    kinds: ['meet'],
    sheltered: false,
    warm: false,
    outlets,
    draw: 50,
    parts: { charm: 0, site: 0, pieces: 0, water: 0, lit: 0, treats: 0, winter: 0 },
  };
}

/** The saved row of a place, made if need be. */
export function rowOf(state: WorldState, id: string): PlaceState {
  let row = state.places.find((r) => r.id === id);
  if (!row) {
    row = newPlaceState(id, id, 0);
    row.visitors = [];
    row.served = [];
    row.sold = [];
    row.takings = [];
    state.places.push(row);
    state.places.sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  return row;
}

/** The tick at which the gaps pass runs on this day index. */
export function passTick(day: number): number {
  return day * TICKS_PER_DAY + GAPS_OFFSET;
}

export interface Night {
  day: number;
  /** Visitors and served by place for the evening (a place not listed gets 0 and 0). */
  places?: Record<string, { v: number; s?: number }>;
  weather?: 'fair' | 'rain' | 'storm';
  grownups?: number;
  out?: number;
  stood?: number;
  /** Leave `tonight` alone (no evening happened). */
  noEvening?: boolean;
}

/**
 * One evening: push each place's counts, roll the tally into history (as R2A does at 17:00), set the
 * clock to the pass and run the gaps system once. Returns the events it pushed.
 */
export function night(state: WorldState, ctx: SimCtx, n: Night): SimCtx['events'] {
  for (const p of injected.places) {
    const row = rowOf(state, p.id);
    const c = n.places?.[p.id];
    row.visitors.push(c?.v ?? 0);
    row.served.push(c?.s ?? 0);
    row.sold.push(0);
    row.takings.push(0);
    for (const a of [row.visitors, row.served, row.sold, row.takings]) while (a.length > 6) a.shift();
    row.seenDay = n.day;
  }
  if (!n.noEvening) {
    if (state.evenings.tonight.day >= 0) {
      state.evenings.history.push(state.evenings.tonight);
      while (state.evenings.history.length > 6) state.evenings.history.shift();
    }
    const t = emptyTally(n.day);
    t.weather = n.weather ?? 'fair';
    t.grownups = n.grownups ?? 10;
    t.out = n.out ?? 0;
    t.stood = n.stood ?? 0;
    state.evenings.tonight = t;
  }
  state.tick = passTick(n.day);
  ctx.events.length = 0;
  gaps.tick(state, ctx);
  return [...ctx.events];
}

export function newCtx(state: WorldState): SimCtx {
  return createTickCtx(state);
}

/** Puts a Treat on a shelf so `treatsOnShelf` reads true. */
export function stockTreats(b: Building, qty = 5): void {
  b.rt!.store[content.goodIndex.get('honey')!] = qty;
}

export function emptyShelf(b: Building): void {
  b.rt!.store[content.goodIndex.get('honey')!] = 0;
}

/** Marks a household's grown-ups: stayed in (a round with no stop) or went out to a place. */
export function setRound(state: WorldState, householdId: EntityId, placeId: string | null): void {
  const h = state.households.find((x) => x.id === householdId)!;
  for (const id of h.members) {
    const r = state.residents.find((x) => x.id === id)!;
    if (r.stage !== 'young' && r.stage !== 'adult') continue;
    r.round =
      placeId === null
        ? []
        : [{ place: placeId, kind: 'meet', tile: 0, draw: 50, flags: RoundFlags.arrived, arrived: 1 }];
  }
}
