// System registry: one line per system, in alphabetical order. The tick pipeline runs them
// by `order`, not by their place in this list. I1 slots (C3.0): 20 construction, 30 production,
// 40 logistics, 50 residents, 52 movement, 60 economy, 70 charm, 72 patterns, 74 wishes,
// 90 achievements, 100 chronicle. I2 slots (C4.0): 24 zoning, 26 growth, 54 traffic, 56 services,
// 58 tiers, 62 market, 64 trade, 66 loans, 92 innovations, 94 charter, 96 stories, 97 plans,
// 98 requests. C4A adds 63 wages (17:00), 65 caravans (08:00) and 67 baskets (18:00). I3 slots
// (C5.0): 12 seasons, 14 weather, 59 warmth, 68 dock, 75 festivals, 76 habitats, 78 wildlife,
// 80 threats, 82 watch, 84 raids, 86 defenses, 91 renown, 93 commissions, 95 trials, 99 guide.
import type { System } from '../contracts';
import { achievements } from './achievements';
import { charter } from './charter';
import { chronicle } from './chronicle';
import { clock } from './clock';
import { commissions } from './commissions';
import { construction } from './construction';
import { defenses } from './defenses';
import { dock } from './dock';
import { economy } from './economy';
import { festivals } from './festivals';
import { growth } from './growth';
import { guide } from './guide';
import { habitats } from './habitats';
import { charm } from './hearth/charm';
import { patterns } from './hearth/patterns';
import { wishes } from './hearth/wishes';
import { innovations } from './innovations';
import { loans } from './loans';
import { logistics } from './logistics';
import { market } from './market';
import { baskets } from './market/baskets';
import { wages } from './market/wages';
import { movement } from './movement';
import { plans } from './plans';
import { production } from './production';
import { raids } from './raids';
import { renown } from './renown';
import { requests } from './requests';
import { residents } from './residents';
import { seasons } from './seasons';
import { services } from './services';
import { stories } from './stories';
import { threats } from './threats';
import { tiers } from './tiers';
import { trade } from './trade';
import { caravans } from './trade/caravans';
import { traffic } from './traffic';
import { trees } from './trees';
import { trials } from './trials';
import { warmth } from './warmth';
import { watch } from './watch';
import { weather } from './weather';
import { wildlife } from './wildlife';
import { zoning } from './zoning';

// prettier-ignore
export const systems: readonly System[] = [
  achievements,
  baskets,
  caravans,
  charm,
  charter,
  chronicle,
  clock,
  commissions,
  construction,
  defenses,
  dock,
  economy,
  festivals,
  growth,
  guide,
  habitats,
  innovations,
  loans,
  logistics,
  market,
  movement,
  patterns,
  plans,
  production,
  raids,
  renown,
  requests,
  residents,
  seasons,
  services,
  stories,
  threats,
  tiers,
  trade,
  traffic,
  trees,
  trials,
  wages,
  warmth,
  watch,
  weather,
  wildlife,
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
