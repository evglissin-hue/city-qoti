// System registry: one line per system, in alphabetical order. The tick pipeline runs them
// by `order`, not by their place in this list. I1 slots (C3.0): 20 construction, 30 production,
// 40 logistics, 50 residents, 52 movement, 60 economy, 70 charm, 72 patterns, 74 wishes,
// 90 achievements, 100 chronicle.
import type { System } from '../contracts';
import { achievements } from './achievements';
import { chronicle } from './chronicle';
import { clock } from './clock';
import { construction } from './construction';
import { economy } from './economy';
import { charm } from './hearth/charm';
import { patterns } from './hearth/patterns';
import { wishes } from './hearth/wishes';
import { logistics } from './logistics';
import { movement } from './movement';
import { production } from './production';
import { residents } from './residents';
import { trees } from './trees';

// prettier-ignore
export const systems: readonly System[] = [
  achievements,
  charm,
  chronicle,
  clock,
  construction,
  economy,
  logistics,
  movement,
  patterns,
  production,
  residents,
  trees,
  wishes,
];

/** Systems in pipeline order (stable for equal orders, which never happens in practice). */
export const pipeline: readonly System[] = [...systems].sort(
  (a, b) => a.order - b.order || (a.id < b.id ? -1 : 1),
);

let skipped: ReadonlySet<string> | null = null;

/** Tests only: whether runTick skips a system (see withoutSystems). */
export function isSkipped(id: string): boolean {
  return skipped !== null && skipped.has(id);
}

/**
 * Tests only: runs `fn` with some systems switched off, to test one system in isolation (for
 * example production without the residents' schedule moving hand-placed workers). Never used by
 * the game; nothing in saved state depends on it.
 */
export function withoutSystems<T>(ids: readonly string[], fn: () => T): T {
  const before = skipped;
  skipped = new Set([...(before ?? []), ...ids]);
  try {
    return fn();
  } finally {
    skipped = before;
  }
}
