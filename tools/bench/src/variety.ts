// `npm run variety -w @qoti/bench [seed ...]` (R3E): can the Merchants' and Patrons' variety wants be
// met by masters, specialties and trade, with no good the Ledger has to wire? Two parts.
//
// 1. A static content reading, per family (Food, Wares, Treats): every flavor that can reach a
//    household and from where. Base goods are the shelf goods (`SHELF_GOODS`: the family's goods but
//    input-only wool and the masters' goods, which count only once a master makes one), masters' goods
//    come by their family from `content.masters`, each specialty is one more flavor at its place for
//    households whose round passes it (`specialtiesOnRound`), and the neighbors' lists say what trade
//    can bring. Compared with each tier's wants (the Merchants' and Patrons' are constants: content
//    holds only the Craftsfolk's basket, those tiers arrive with I4 and I5).
// 2. A measured part: the most variety one household of a bench town reaches by family, by day 70 and
//    in the last year of the run (24 days, `DAYS_PER_YEAR`), through `autoplay(seed, days, { village })`
//    and `householdVariety` (the sim's own count: shelf flavors seen in the last three days plus the
//    specialties on the round). Seeds run in parallel child processes, as the lanes test does.
//
// VARIETY_DAYS=<n> plays n days (default 70), VARIETY_JOBS the number of child processes (default 4).
// `--one <seed>` is the child: it plays one run and prints one JSON line.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { content } from '@qoti/content';
import { DAYS_PER_YEAR, familyIndex, householdVariety, SHELF_GOODS, type WorldState } from '@qoti/sim';
import { autoplay } from './autoplay';
import { DEFAULT_SEEDS } from './audit';

export type VarietyFamily = 'food' | 'wares' | 'treats';
export const VARIETY_FAMILIES: readonly VarietyFamily[] = ['food', 'wares', 'treats'];
const FAMILY_NAMES: Record<VarietyFamily, string> = { food: 'Food', wares: 'Wares', treats: 'Treats' };

/**
 * What each tier wants of a family's flavors on offer (docs/spec/13-ledger.md, Population tiers).
 * Content holds only the Craftsfolk's basket (`content.basketByTier`), so the Merchants' (I4) and the
 * Patrons' (I5) wants are written here from that table.
 */
export const TIER_WANTS: Record<'craftsfolk' | 'merchant' | 'patron', Record<VarietyFamily, number>> = {
  craftsfolk: { food: 3, wares: 1, treats: 1 },
  merchant: { food: 5, wares: 3, treats: 3 },
  patron: { food: 7, wares: 5, treats: 5 },
};

export interface FamilyReach {
  family: VarietyFamily;
  /** Shelf goods of the family: id and what makes it (a trade id, or 'building' for fish). */
  base: { good: string; madeBy: string; raw: boolean; neighbors: string[] }[];
  /** Masters' goods of the family and the trade whose master makes each. */
  masters: { good: string; trade: string }[];
  /** Specialties of the family: how many, and their distinct goods. */
  specialties: { count: number; goods: string[] };
  /** Goods of the family a neighbor sells that are not base goods (trade adds a flavor), by good. */
  tradeOnly: { good: string; neighbors: string[] }[];
}

/** Which trade makes a good ('building' for a good no trade makes: fish comes from the Fishery). */
function madeBy(goodId: string): string {
  return content.trades.find((t) => t.makes === goodId)?.id ?? 'building';
}

/** The reading of one family: every flavor that can reach a household, and from where. */
export function familyReach(family: VarietyFamily): FamilyReach {
  const f = familyIndex(family);
  const sellers = (goodId: string) =>
    content.neighbors.filter((n) => n.sells.some(([g]) => g === goodId)).map((n) => n.id);
  const baseIds = SHELF_GOODS[f]!.map((g) => content.goods[g]!.id);
  const base = baseIds.map((good) => ({
    good,
    madeBy: madeBy(good),
    raw: content.goodById.get(good)!.raw,
    neighbors: sellers(good),
  }));
  const masters = content.masters.flatMap((m) =>
    m.good !== undefined && content.goodById.get(m.good)?.family === family
      ? [{ good: m.good, trade: m.of }]
      : [],
  );
  const specs = content.specialties.filter((s) => content.goodById.get(s.good)?.family === family);
  const goods = [...new Set(specs.map((s) => s.good))].sort();
  const known = new Set([...baseIds, ...masters.map((m) => m.good)]);
  const tradeOnly: FamilyReach['tradeOnly'] = [];
  for (const g of content.goods) {
    if (g.family !== family || known.has(g.id) || g.id === 'wool') continue;
    const by = sellers(g.id);
    if (by.length) tradeOnly.push({ good: g.id, neighbors: by });
  }
  return { family, base, masters, specialties: { count: specs.length, goods }, tradeOnly };
}

export interface TierVerdict {
  tier: 'craftsfolk' | 'merchant' | 'patron';
  want: number;
  /** Flavors by source, and the total with every source. */
  base: number;
  withMasters: number;
  /** Base, masters and the family's specialties (each one flavor at its place; a household's round passes some). */
  withSpecialties: number;
  /** Raw base goods, masters' goods and specialties: no made good, so no chain to wire. */
  noChain: number;
  /** Made base goods the want would need beyond `noChain` (0: met with no chain). */
  chainGoodsNeeded: number;
  /** Masters needed on top of the base goods alone (0 when the base meets the want). */
  mastersNeeded: number;
  /** The want is met by base goods, masters' goods and specialties, whatever a neighbor sells. */
  met: boolean;
  /** The want is met with no chain at all (no made base good). */
  metNoChain: boolean;
}

/**
 * Whether a tier's want for a family can be met, by source. "No chain" counts what needs no workshop
 * to wire: raw base goods (a farm or gatherer), masters' goods (made in the master's own building from
 * its raw good, content rule 2) and specialties (a place and a Treat on the round). The made base goods
 * (bread, cheese, cloth, candles, furniture, cider) each hang on a chain.
 */
export function tierVerdict(r: FamilyReach, tier: TierVerdict['tier']): TierVerdict {
  const want = TIER_WANTS[tier][r.family];
  const base = r.base.length;
  const withMasters = base + r.masters.length;
  const withSpecialties = withMasters + r.specialties.count;
  const rawBase = r.base.filter((b) => b.raw).length;
  const noChain = rawBase + r.masters.length + r.specialties.count;
  return {
    tier,
    want,
    base,
    withMasters,
    withSpecialties,
    noChain,
    chainGoodsNeeded: Math.max(0, want - noChain),
    mastersNeeded: Math.max(0, want - base),
    met: withSpecialties >= want,
    metNoChain: noChain >= want,
  };
}

/** The static reading as printable lines. */
export function formatReach(): string[] {
  const lines: string[] = [
    'Variety: flavors that can reach a household, by family and source (content reading)',
    '',
  ];
  const summary: string[] = [];
  for (const family of VARIETY_FAMILIES) {
    const r = familyReach(family);
    lines.push(`${FAMILY_NAMES[family]}`);
    lines.push(
      `  base goods on a shelf (${r.base.length}): ${r.base
        .map(
          (b) =>
            `${b.good} (${b.raw ? 'raw' : `made, ${b.madeBy}`}${b.neighbors.length ? `; sold by ${b.neighbors.join(', ')}` : ''})`,
        )
        .join(', ')}`,
    );
    lines.push(
      `  masters' goods (${r.masters.length}): ${r.masters.map((m) => `${m.good} (${m.trade})`).join(', ') || 'none'}`,
    );
    lines.push(
      `  specialties (${r.specialties.count}, one more flavor each at its place): ${r.specialties.goods.join(', ') || 'none'}`,
    );
    lines.push(
      `  neighbors add (${r.tradeOnly.length} beyond the base): ${r.tradeOnly.map((t) => `${t.good} (${t.neighbors.join(', ')})`).join(', ') || 'nothing, they sell base goods only'}`,
    );
    lines.push(
      `  reachable: base ${r.base.length}, with masters ${r.base.length + r.masters.length}, with specialties ${r.base.length + r.masters.length + r.specialties.count}`,
    );
    for (const tier of ['craftsfolk', 'merchant', 'patron'] as const) {
      const v = tierVerdict(r, tier);
      summary.push(
        `${FAMILY_NAMES[family].padEnd(6)} ${tier.padEnd(10)} want ${String(v.want).padStart(2)} | base ${String(v.base).padStart(2)} +masters ${String(v.withMasters).padStart(2)} +specialties ${String(v.withSpecialties).padStart(2)} | masters needed ${v.mastersNeeded} | no-chain flavors ${String(v.noChain).padStart(2)} | ${v.met ? 'MET' : 'SHORT'}${v.metNoChain ? ', met with no chain' : v.met ? `, needs ${v.chainGoodsNeeded} made good(s) of a chain` : ''}`,
      );
    }
    lines.push('');
  }
  lines.push(
    'Wants against sources (Craftsfolk from content, Merchants and Patrons from 13-ledger.md)',
    ...summary,
  );
  return lines;
}

// --- The measured part ---------------------------------------------------------------------------

export interface VarietyRun {
  seed: string;
  days: number;
  /** Most flavors any household reached by family, up to the end of the run (day `days`). */
  best: Record<VarietyFamily, number>;
  /** The same over the last year of the run (the last DAYS_PER_YEAR days). */
  bestYear: Record<VarietyFamily, number>;
  /** Day the best was first reached, by family. */
  bestDay: Record<VarietyFamily, number>;
  /** On the last day: the mean over households and the households at the Merchants' want or better. */
  mean: Record<VarietyFamily, number>;
  atMerchant: Record<VarietyFamily, number>;
  households: number;
}

const zero = (): Record<VarietyFamily, number> => ({ food: 0, wares: 0, treats: 0 });

/** Plays one bench run and reads every household's variety at each day's end. */
export function playVariety(seed: string, days: number): VarietyRun {
  const best = zero();
  const bestYear = zero();
  const bestDay = zero();
  const last = { mean: zero(), atMerchant: zero(), households: 0 };
  const onDay = (w: WorldState, line: { day: number }) => {
    const todays = zero();
    const sum = zero();
    const at = zero();
    for (const h of w.households) {
      for (const fam of VARIETY_FAMILIES) {
        const v = householdVariety(w, h, familyIndex(fam));
        if (v > todays[fam]) todays[fam] = v;
        sum[fam] += v;
        if (v >= TIER_WANTS.merchant[fam]) at[fam]++;
      }
    }
    for (const fam of VARIETY_FAMILIES) {
      if (todays[fam] > best[fam]) {
        best[fam] = todays[fam];
        bestDay[fam] = line.day;
      }
      if (line.day > days - DAYS_PER_YEAR) bestYear[fam] = Math.max(bestYear[fam], todays[fam]);
      last.mean[fam] = w.households.length ? sum[fam] / w.households.length : 0;
      last.atMerchant[fam] = at[fam];
    }
    last.households = w.households.length;
  };
  autoplay(seed, days, { village: true, onDay });
  const round = (r: Record<VarietyFamily, number>) => ({
    food: Math.round(r.food * 10) / 10,
    wares: Math.round(r.wares * 10) / 10,
    treats: Math.round(r.treats * 10) / 10,
  });
  return {
    seed,
    days,
    best,
    bestYear,
    bestDay,
    mean: round(last.mean),
    atMerchant: last.atMerchant,
    households: last.households,
  };
}

export function formatRuns(runs: readonly VarietyRun[]): string[] {
  const days = runs[0]?.days ?? 0;
  const lines = [
    `Variety reached by one household, ${days} days (best any day / best in the last ${DAYS_PER_YEAR} days / mean and households at the Merchants' want on the last day)`,
    'seed     hh  | Food best yr mean  >=5 | Wares best yr mean  >=3 | Treats best yr mean  >=3 | best on day F/W/T',
  ];
  const c = (v: number | string, n: number) => String(v).padStart(n);
  for (const r of runs) {
    lines.push(
      `${r.seed.padEnd(8)} ${c(r.households, 3)} | ${c(r.best.food, 9)} ${c(r.bestYear.food, 2)} ${c(r.mean.food, 4)} ${c(r.atMerchant.food, 3)} | ${c(r.best.wares, 10)} ${c(r.bestYear.wares, 2)} ${c(r.mean.wares, 4)} ${c(r.atMerchant.wares, 3)} | ${c(r.best.treats, 11)} ${c(r.bestYear.treats, 2)} ${c(r.mean.treats, 4)} ${c(r.atMerchant.treats, 3)} | ${r.bestDay.food}/${r.bestDay.wares}/${r.bestDay.treats}`,
    );
  }
  return lines;
}

/** Plays one run in a child process (tsx's own flags are passed on); resolves its JSON line. */
function child(seed: string, days: number): Promise<VarietyRun> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--one', seed], {
      env: { ...process.env, VARIETY_DAYS: String(days) },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let out = '';
    p.stdout.on('data', (d: Buffer) => (out += d.toString()));
    p.on('error', reject);
    p.on('close', (code) => {
      const line = out.split('\n').find((l) => l.startsWith('{'));
      if (code === 0 && line) resolve(JSON.parse(line) as VarietyRun);
      else reject(new Error(`variety child ${seed} exited ${code}`));
    });
  });
}

async function main(): Promise<void> {
  console.log(formatReach().join('\n'));
  const seeds = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_SEEDS;
  const days = Number(process.env.VARIETY_DAYS ?? 70);
  const jobs = Math.max(1, Number(process.env.VARIETY_JOBS ?? 4));
  const runs: VarietyRun[] = [];
  let next = 0;
  const worker = async () => {
    for (let s = seeds[next++]; s; s = seeds[next++]) {
      runs.push(await child(s, days));
      console.error(`done ${s}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, seeds.length) }, worker));
  runs.sort((a, b) => seeds.indexOf(a.seed) - seeds.indexOf(b.seed));
  console.log(`\n${formatRuns(runs).join('\n')}`);
}

if (process.argv[1]?.endsWith('variety.ts')) {
  if (process.argv[2] === '--one') {
    console.log(JSON.stringify(playVariety(process.argv[3]!, Number(process.env.VARIETY_DAYS ?? 70))));
  } else {
    void main();
  }
}
