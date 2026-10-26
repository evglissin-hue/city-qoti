// Named code predicates for the Condition DSL's escape hatch ({ code: 'lanternRoute' }), for the
// rules a JSON condition cannot say well: anything about the route a resident actually walks.
import { content } from '@qoti/content';
import { MAP_SIZE } from '../constants';
import type { Rect, WorldState } from '../contracts';
import { doorTileOf } from '../systems/movement/api';
import { decorInRect, decorTileX, decorTileZ, expandRect } from './geo';
import type { Binding } from './index';
import { findRoute } from './route';

export type CodePredicate = (
  state: WorldState,
  bind: Binding,
  params: readonly [string, number][],
) => boolean;

function param(params: readonly [string, number][], name: string, fallback: number): number {
  for (const [k, v] of params) if (k === name) return v;
  return fallback;
}

/** The walk from work to home, door to door, or null when either is missing or unreachable. */
function commute(state: WorldState, bind: Binding, roadsOnly: boolean): number[] | null {
  if (!bind.home || !bind.work) return null;
  const from = doorTileOf(state, bind.work);
  const to = doorTileOf(state, bind.home);
  if (from < 0 || to < 0) return null;
  return findRoute(state, from, to, roadsOnly);
}

/**
 * Lanterns along `share` percent (default 50) of the route home from work: a route tile is lit
 * when a lantern stands on it or on one of its eight neighbors.
 */
export function lanternRoute(state: WorldState, bind: Binding, params: readonly [string, number][]): boolean {
  const route = commute(state, bind, false);
  if (!route || route.length === 0) return false;
  let rect: Rect = [MAP_SIZE, MAP_SIZE, -1, -1];
  for (const i of route) {
    const x = i % MAP_SIZE;
    const z = (i - x) / MAP_SIZE;
    rect = [Math.min(rect[0], x), Math.min(rect[1], z), Math.max(rect[2], x), Math.max(rect[3], z)];
  }
  const lit = new Set<number>();
  for (const d of decorInRect(state, expandRect(rect, 1))) {
    if (!content.decorById.get(d.def)?.tags.includes('lantern')) continue;
    const x = decorTileX(d);
    const z = decorTileZ(d);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) lit.add((z + dz) * MAP_SIZE + x + dx);
  }
  let n = 0;
  for (const i of route) if (lit.has(i)) n++;
  return n * 100 >= param(params, 'share', 50) * route.length;
}

/** A road route from home to work: door to door without setting foot on grass. */
export function pathRoute(state: WorldState, bind: Binding): boolean {
  return commute(state, bind, true) !== null;
}

// Registry: one line per predicate, alphabetical.
// prettier-ignore
export const codePredicates: ReadonlyMap<string, CodePredicate> = new Map<string, CodePredicate>([
  ['lanternRoute', lanternRoute],
  ['pathRoute', pathRoute],
]);
