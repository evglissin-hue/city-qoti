// The walk hook (C5.0): one registry of ticks-per-tile multipliers for residents and carts, so no
// I3 track edits movement or traffic. Each returns permille of the tile's ticks (1000 = normal,
// 1300 = 30% slower); they multiply. C5A: snow (-30%); C5D: fences and hedges for raiders only.
import type { WorldState } from '../../contracts';
import { snowWalk } from '../weather/effects';

/** Who is moving: residents and carts here; raiders and wolves use the same hook in C5D. */
export type Mover =
  { kind: 'resident'; id: number } | { kind: 'cart'; id: number } | { kind: 'raider'; id: number };

export type WalkFactor = (state: WorldState, mover: Mover, tile: number) => number;

// Registry: one line per source, alphabetical by id.
// prettier-ignore
export const walkFactors: readonly [id: string, factor: WalkFactor][] = [
  ['snow', snowWalk],
];

let extra: readonly [string, WalkFactor][] = [];

/** Tests only: runs `fn` with extra factors registered after the real ones. */
export function withWalkFactors<T>(list: readonly [string, WalkFactor][], fn: () => T): T {
  const before = extra;
  extra = [...before, ...list];
  try {
    return fn();
  } finally {
    extra = before;
  }
}

/** The product of every registered factor for this mover entering `tile`, permille. */
export function walkPermille(state: WorldState, mover: Mover, tile: number): number {
  if (walkFactors.length === 0 && extra.length === 0) return 1000;
  let p = 1000;
  for (const [, f] of walkFactors) p = Math.floor((p * f(state, mover, tile)) / 1000);
  for (const [, f] of extra) p = Math.floor((p * f(state, mover, tile)) / 1000);
  return Math.max(1, p);
}
