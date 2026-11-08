// Small text helpers for the Chronicle, letters and notices: phrase picks from the 'misc' stream,
// place names, seat credits, number words and lists. Deterministic: same state, same words.
import { chroniclePhrases, content } from '@qoti/content';
import { MAP_SIZE } from '../../constants';
import type { Building, SeatId, TickCtx, WorldState } from '../../contracts';
import { buildingRect, householdIn, isHomeDef, rectGap2, tileGap2 } from '../../conditions/geo';
import { findById } from '../../state/entities';
import { fillText } from '../../view/hamlet';

const S = MAP_SIZE;

/** One phrase from a list, picked with the 'misc' stream (no draw for a single choice). */
export function pick(ctx: TickCtx, list: readonly string[]): string {
  if (list.length === 0) return '';
  return list.length === 1 ? list[0]! : list[ctx.rng('misc').int(list.length)]!;
}

export function fill(text: string, params: readonly [string, string][]): string {
  return fillText(text, params);
}

/** "one", "twelve", or the digits past twelve. */
export function numberWord(n: number): string {
  return chroniclePhrases.numbers[n] ?? String(n);
}

/** "a", "a and b", "a, b and c". */
export function listJoin(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function seatName(state: WorldState, seat: SeatId): string {
  return state.seats.find((s) => s.seat === seat)?.name ?? `Player ${seat + 1}`;
}

/** Credit line for one or more seats: "Ada", or "Ada and Bo, together". */
export function creditText(state: WorldState, ctx: TickCtx, seats: readonly SeatId[]): string {
  if (seats.length === 0) return `the folk of ${state.settings.townName}`;
  if (seats.length === 1) return seatName(state, seats[0]!);
  const names = seats.map((s) => seatName(state, s));
  return fill(pick(ctx, chroniclePhrases.together), [
    ['a', listJoin(names.slice(0, -1))],
    ['b', names[names.length - 1]!],
  ]);
}

function lower(def: string): string {
  return (content.buildingById.get(def)?.name ?? 'building').toLowerCase();
}

/**
 * Where something is, in gazette words: "at the well, a few steps from the Thistledown family's
 * cottage", "along the lane by the river". `tile` is a tile index.
 */
export function placeName(state: WorldState, ctx: TickCtx, tile: number): string {
  const x = tile % S;
  const z = (tile - x) / S;
  const P = chroniclePhrases;
  const here = state.map.occupant[tile] ? findById(state.buildings, state.map.occupant[tile]!) : undefined;

  // The nearest home with a family, within 8 tiles.
  let home: Building | undefined;
  let homeFamily = '';
  let best = 65;
  for (const b of state.buildings) {
    if (b === here || !isHomeDef(content.buildingById.get(b.def))) continue;
    const h = householdIn(state, b.id);
    if (!h) continue;
    const g = tileGap2(x, z, buildingRect(b));
    if (g < best) {
      best = g;
      home = b;
      homeFamily = h.family;
    }
  }

  let first = '';
  const family =
    here && isHomeDef(content.buildingById.get(here.def)) ? householdIn(state, here.id) : undefined;
  // A family's own home is place enough; no need to name the neighbors too.
  if (family) home = undefined;
  if (here) {
    const h = family;
    first = h
      ? fill(pick(ctx, P.atHome), [
          ['family', h.family],
          ['building', lower(here.def)],
        ])
      : fill(pick(ctx, P.atBuilding), [['building', lower(here.def)]]);
  } else if (state.map.road[tile] === 1) {
    first = pick(ctx, P.alongPath);
  } else if (state.map.road[tile]) {
    first = pick(ctx, P.alongLane);
  }

  let water = false;
  for (let dz = -3; dz <= 3 && !water; dz++) {
    for (let dx = -3; dx <= 3 && !water; dx++) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx >= 0 && nz >= 0 && nx < S && nz < S && state.map.water[nz * S + nx]) water = true;
    }
  }

  let second = '';
  if (home) {
    second = fill(pick(ctx, P.nearHome), [
      ['family', homeFamily],
      ['building', lower(home.def)],
    ]);
  } else if (water) {
    second = pick(ctx, P.byWater);
  } else if (!here && !family) {
    let near: Building | undefined;
    let d = 37;
    for (const b of state.buildings) {
      const g = rectGap2([x, z, x, z], buildingRect(b));
      if (g < d) {
        d = g;
        near = b;
      }
    }
    if (near) second = fill(pick(ctx, P.nearBuilding), [['building', lower(near.def)]]);
  }

  if (family) return first;
  if (first && second) return `${first}, ${second}`;
  return first || second || pick(ctx, P.inTheOpen);
}
