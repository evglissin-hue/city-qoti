// The tune's Ledger view (R1F): the zones-first terms of docs/spec/13-ledger.md in one row a day, so
// the balance can be tuned against numbers: the five balances (days of cover / flavors on offer), the
// four demand bars, businesses by level, hands in food, the carrier and the County tab. It reads only
// the exported views and contracts (balancesView, state.demand, state.carrier, Building.trade/level,
// methodOf), never a system's internals. Nothing here changes the valley.
import { content } from '@qoti/content';
import {
  balancesView,
  DEMAND_KINDS,
  GOOD_FAMILIES,
  methodOf,
  PENNIES_PER_COIN,
  tierProgress,
  type WorldState,
} from '@qoti/sim';

/** One day of the ledger view, as plain numbers. */
export interface LedgerLine {
  /** Per family, in GOOD_FAMILIES order: days of cover (one decimal) and flavors on offer. */
  balances: { cover: number; flavors: number }[];
  /** Per bar, in DEMAND_KINDS order. */
  bars: { value: number; lit: boolean }[];
  businesses: number;
  level2: number;
  level3: number;
  /** Percent of working residents at a building that makes a Food good, and hauling or building. */
  handsFood: number;
  handsHaul: number;
  carrierIn: number;
  carrierOut: number;
  /** Coins spent on imports today. */
  spent: number;
  /** Coins on the County tab. */
  tab: number;
}

const sum = (a: readonly number[] | undefined): number => (a ? a.reduce((n, v) => n + v, 0) : 0);

/** True when the building's method outputs a good of the Food family. */
function makesFood(b: { def: string; trade?: string }): boolean {
  const m = methodOf(b);
  return !!m && m.outputs.some(([g]) => content.goodById.get(g)?.family === 'food');
}

/** Read one day's ledger numbers off the world. */
export function ledgerLine(w: WorldState): LedgerLine {
  const view = balancesView(w);
  const byId = new Map(w.buildings.map((b) => [b.id, b]));
  let working = 0;
  let food = 0;
  let haul = 0;
  for (const r of w.residents) {
    const b = r.jobId ? byId.get(r.jobId) : undefined;
    if (!b) continue;
    working++;
    if (makesFood(b)) food++;
    const role = content.buildingById.get(b.def)?.jobs?.role;
    if (role === 'porter' || role === 'builder') haul++;
  }
  const pct = (n: number) => (working ? Math.round((100 * n) / working) : 0);
  const biz = w.buildings.filter((b) => b.trade);
  return {
    balances: GOOD_FAMILIES.map((_, i) => {
      const l = view.lines[i];
      return {
        cover: Math.round((l?.cover ?? 0) / 10) / 10,
        flavors: l ? l.flavors.filter((f) => f.onOffer).length : 0,
      };
    }),
    bars: DEMAND_KINDS.map((_, i) => ({ value: w.demand.bars[i] ?? 0, lit: w.demand.lit[i] ?? false })),
    businesses: biz.length,
    level2: biz.filter((b) => (b.level ?? 1) === 2).length,
    level3: biz.filter((b) => (b.level ?? 1) >= 3).length,
    handsFood: pct(food),
    handsHaul: pct(haul),
    carrierIn: sum(w.carrier.bought[w.carrier.bought.length - 1]),
    carrierOut: sum(w.carrier.sold[w.carrier.sold.length - 1]),
    spent: Math.round(w.carrier.spentToday / PENNIES_PER_COIN),
    tab: Math.round(w.carrier.tab / PENNIES_PER_COIN),
  };
}

const FAMILY_LABEL = ['food', 'fuel', 'mats', 'wares', 'treats'];
const BAR_LABEL = ['h', 's', 'w', 'f'];

/** One row of the ledger view. */
export function ledgerRow(day: number, l: LedgerLine): string {
  const fam = l.balances.map((b, i) => `${FAMILY_LABEL[i]} ${b.cover.toFixed(1)}/${b.flavors}`).join(' ');
  const bars = l.bars.map((b, i) => `${BAR_LABEL[i]}${Math.round(b.value)}${b.lit ? '*' : ''}`).join(' ');
  return [
    String(day).padStart(3),
    fam,
    '|',
    bars,
    '|',
    `biz ${l.businesses} L2 ${l.level2} L3 ${l.level3}`,
    '|',
    `hands f${l.handsFood}% h${l.handsHaul}%`,
    '|',
    `car +${l.carrierIn}/-${l.carrierOut} $${l.spent}`,
    '|',
    `tab ${l.tab}`,
  ].join(' ');
}

/** The Ledger view table, with a header line. */
export function formatLedger(days: readonly { day: number; ledger?: LedgerLine }[]): string {
  const rows = days.filter((d) => d.ledger).map((d) => ledgerRow(d.day, d.ledger!));
  const head =
    'day  balances (cover days/flavors on offer)  | bars h s w f (* lit) | businesses | hands in food, haul | carrier in/out, coins | tab';
  return [head, ...rows].join('\n');
}

/** The last day's businesses by trade and level: `baker 2 (L1 2)`, one per trade, sorted by name. */
export function businessesSummary(w: WorldState): string {
  const by = new Map<string, number[]>();
  for (const b of w.buildings) {
    if (!b.trade) continue;
    const row = by.get(b.trade) ?? [0, 0, 0];
    row[Math.min(3, Math.max(1, b.level ?? 1)) - 1]!++;
    by.set(b.trade, row);
  }
  const parts: string[] = [];
  for (const t of [...by.keys()].sort()) {
    const row = by.get(t)!;
    const lv = row
      .map((n, i) => (n ? `L${i + 1} ${n}` : ''))
      .filter(Boolean)
      .join(', ');
    parts.push(`${t} ${row[0]! + row[1]! + row[2]!} (${lv})`);
  }
  return parts.length ? parts.join(', ') : 'none';
}

/** Why households are not moving up: each `missing` reason tallied, most common first. */
export function nextTierSummary(w: WorldState): string {
  const tally = new Map<string, number>();
  let n = 0;
  for (const h of w.households) {
    const p = tierProgress(w, h);
    if (!p) continue;
    n++;
    for (const m of p.missing) tally.set(m, (tally.get(m) ?? 0) + 1);
  }
  if (!n) return 'no household has a next tier yet';
  const rows = [...tally.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return `${n} households: ${rows.length ? rows.map(([m, c]) => `${m} ${c}`).join(', ') : 'nothing missing'}`;
}
