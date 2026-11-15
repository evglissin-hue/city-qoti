// Debug only (R1X): what the village and town showcases need to place R1's buildings. The chain
// economy's old goods map to the sixteen R1 goods, and a business def (workshop, farmstead, corner
// shop) is given a trade, a level and a keeper, deterministically from the order the scene places
// them in, so the same layout always shows the same mix. In this client's Mirror only.
import type { BuildingView, ResidentView } from '@qoti/sim';

/** The removed goods, as the R1 good that took their place in a pile or a store. */
const GOOD: Record<string, string> = {
  apples: 'fruit',
  bricks: 'brick',
  clay: 'stone',
  herbs: 'honey',
  logs: 'timber',
  milk: 'cheese',
  planks: 'timber',
  tools: 'furniture',
  yarn: 'wool',
};

/** An R1 good id for any good id a showcase plan names (R1 ids pass through). */
export function r1Good(good: string): string {
  return GOOD[good] ?? good;
}

export function r1Goods(lines: [string, number][]): [string, number][] {
  return lines.map(([g, n]) => [r1Good(g), n]);
}

/** The trades each business def hosts, in the order the showcases hand them out. */
export const SHOWCASE_TRADES: Record<string, string[]> = {
  'corner-shop': ['shop'],
  farmstead: ['grain-farm', 'market-garden', 'orchard', 'dairy', 'sheep-run', 'hives'],
  workshop: ['baker', 'weaver', 'carpenter', 'chandler', 'cider-maker'],
};

const FAMILIES = [
  'Fenwick',
  'Hollis',
  'Ashdown',
  'Thornbury',
  'Pennywhistle',
  'Marsh',
  'Oakes',
  'Brightwater',
];
const SPECIES = ['badger', 'fox', 'hedgehog', 'mouse', 'otter', 'rabbit', 'squirrel'];
const FIRST_KEEPER = 900000;

export function isBusinessDef(def: string): boolean {
  return SHOWCASE_TRADES[def] !== undefined;
}

/** Hands out trades, levels (1 to 3) and keepers; call `next` for each business in placement order. */
export function businessHands(): {
  next: (def: string) => Pick<BuildingView, 'trade' | 'level' | 'keeperId'> | null;
  keepers: ResidentView[];
} {
  const used = new Map<string, number>();
  const keepers: ResidentView[] = [];
  return {
    keepers,
    next: (def) => {
      const trades = SHOWCASE_TRADES[def];
      if (!trades) return null;
      const n = used.get(def) ?? 0;
      used.set(def, n + 1);
      const k = keepers.length;
      const id = FIRST_KEEPER + k;
      keepers.push({
        id,
        given: 'Ada',
        family: FAMILIES[k % FAMILIES.length]!,
        species: SPECIES[k % SPECIES.length]!,
        stage: 'adult',
        traits: [],
        householdId: 0,
        homeId: 0,
        jobId: 0,
        tier: 'craftsfolk',
        wishId: 0,
        moodBand: 3,
        bond: 2,
        look: 1000 + k * 37,
        flags: 0,
      });
      return { trade: trades[n % trades.length]!, level: 1 + ((k + n) % 3), keeperId: id };
    },
  };
}
