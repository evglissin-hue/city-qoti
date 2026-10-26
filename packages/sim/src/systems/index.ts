// System registry: one line per system, in alphabetical order. The tick pipeline runs them
// by `order`, not by their place in this list. I1 slots (C3.0): 20 construction, 30 production,
// 40 logistics, 50 residents, 52 movement, 60 economy, 70 charm, 72 patterns, 74 wishes,
// 90 achievements, 100 chronicle. I2 slots (C4.0): 24 zoning, 26 growth, 54 traffic, 56 services,
// 58 tiers, 62 market, 64 trade, 66 loans, 92 innovations, 94 charter, 96 stories, 97 plans,
// 98 requests.
import type { System } from '../contracts';
import { achievements } from './achievements';
import { charter } from './charter';
import { chronicle } from './chronicle';
import { clock } from './clock';
import { construction } from './construction';
import { economy } from './economy';
import { growth } from './growth';
import { charm } from './hearth/charm';
import { patterns } from './hearth/patterns';
import { wishes } from './hearth/wishes';
import { innovations } from './innovations';
import { loans } from './loans';
import { logistics } from './logistics';
import { market } from './market';
import { movement } from './movement';
import { plans } from './plans';
import { production } from './production';
import { requests } from './requests';
import { residents } from './residents';
import { services } from './services';
import { stories } from './stories';
import { tiers } from './tiers';
import { trade } from './trade';
import { traffic } from './traffic';
import { trees } from './trees';
import { zoning } from './zoning';

// prettier-ignore
export const systems: readonly System[] = [
  achievements,
  charm,
  charter,
  chronicle,
  clock,
  construction,
  economy,
  growth,
  innovations,
  loans,
  logistics,
  market,
  movement,
  patterns,
  plans,
  production,
  requests,
  residents,
  services,
  stories,
  tiers,
  trade,
  traffic,
  trees,
  wishes,
  zoning,
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
