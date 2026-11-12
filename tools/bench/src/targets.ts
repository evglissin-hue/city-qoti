// `npm run targets -w @qoti/bench [days] [seeds...]` (R1X): plays each seed with the autoplayer for
// 70 days (every system on) and prints one row per seed against R1's tuning targets
// (docs/spec/13-ledger.md, Tuning targets and acceptance): hands in food at days 40 and 70, the
// Ledger's decisions, the first Craftsfolk and the Craftsfolk share at day 70, businesses a whole day
// without their raw good while the carrier may buy, and the money (lowest treasury, owed, the tab).
// TARGETS_DAYS=1 adds a line per day with the numbers behind it.
import { content } from '@qoti/content';
import { loansOwed, PENNIES_PER_COIN, rankAtLeast, type WorldState } from '@qoti/sim';
import { autoplay, type DayLine } from './autoplay';
import { DEFAULT_SEEDS } from './audit';
import { DECISIONS_DAYS, decisionVerdict, tallyDecisions } from './decisions';

export interface TargetRow {
  seed: string;
  villageDay: number;
  residents40: number;
  residents70: number;
  households70: number;
  foodHands40: number;
  foodHands70: number;
  /** Mean percent of hands in food over days 20 to the end. */
  foodHandsMean: number;
  decisions: number;
  verdict: string[];
  firstCraftsfolk: number;
  craftsfolkShare70: number;
  stalls: string[];
  lowestCoins: number;
  owed70: number;
  tab70: number;
  coins70: number;
  /** Firewood made in the valley and bought by the carrier over the run. */
  firewoodMade: number;
  firewoodBought: number;
  leanDays: number;
  departures: number;
}

const firewood = content.goodIndex.get('firewood')!;

/** Households whose tier is craftsfolk or higher, and all households. */
function craftsHouseholds(w: WorldState): [number, number] {
  let crafts = 0;
  for (const h of w.households) if (h.tier !== 'settler') crafts++;
  return [crafts, w.households.length];
}

export function targetRow(seed: string, days = DECISIONS_DAYS): { row: TargetRow; lines: string[] } {
  let villageDay = 0;
  let firstCraftsfolk = 0;
  let lowest = Infinity;
  let made = 0;
  let bought = 0;
  let share70 = 0;
  const lines: string[] = [];
  const hands: number[] = [];
  const onDay = (w: WorldState, line: DayLine) => {
    if (!villageDay && rankAtLeast(w, 'village')) villageDay = line.day;
    const [crafts, all] = craftsHouseholds(w);
    if (!firstCraftsfolk && crafts > 0) firstCraftsfolk = line.day;
    share70 = all ? crafts / all : 0;
    lowest = Math.min(lowest, w.economy.treasury / PENNIES_PER_COIN);
    made += w.economy.yesterday.produced[firewood] ?? 0;
    bought += w.carrier.bought[w.carrier.bought.length - 1]?.[firewood] ?? 0;
    if (line.day >= 20 && line.ledger) hands.push(line.ledger.handsFood);
    if (process.env.TARGETS_DAYS) {
      const l = line.ledger;
      lines.push(
        `${seed} d${line.day} pop ${line.residents} hh ${line.households} crafts ${crafts} coins ${line.coins} owed ${line.owed} wages ${line.wages} sales ${line.sales} tax ${line.taxes} trade ${line.trade} food% ${l?.handsFood ?? '-'} haul% ${l?.handsHaul ?? '-'} biz ${l?.businesses ?? '-'} in ${l?.carrierIn ?? '-'} out ${l?.carrierOut ?? '-'} tab ${l?.tab ?? '-'} cover ${l?.balances.map((b) => `${b.cover}/${b.flavors}`).join(' ') ?? '-'}`,
      );
    }
  };
  const run = autoplay(seed, days, { village: true, onDay });
  const d = run.days;
  const at = (day: number) => d[Math.min(d.length, day) - 1];
  const w = run.hamlet.world;
  const tally = tallyDecisions(run.decisions, Math.min(days, DECISIONS_DAYS));
  return {
    row: {
      seed,
      villageDay,
      residents40: at(40)?.residents ?? 0,
      residents70: at(70)?.residents ?? 0,
      households70: at(70)?.households ?? 0,
      foodHands40: at(40)?.ledger?.handsFood ?? 0,
      foodHands70: at(70)?.ledger?.handsFood ?? 0,
      foodHandsMean: hands.length ? Math.round(hands.reduce((a, b) => a + b, 0) / hands.length) : 0,
      decisions: tally.ledger,
      verdict: decisionVerdict(run.decisions),
      firstCraftsfolk,
      craftsfolkShare70: Math.round(share70 * 100),
      stalls: run.health.filter((i) => i.kind === 'business-short').map((i) => i.text),
      lowestCoins: Math.round(lowest),
      owed70: Math.round(loansOwed(w) / PENNIES_PER_COIN),
      tab70: Math.round(w.carrier.tab / PENNIES_PER_COIN),
      coins70: Math.round(w.economy.treasury / PENNIES_PER_COIN),
      firewoodMade: made,
      firewoodBought: bought,
      leanDays: d.filter((x) => x.leanTimes).length,
      departures: d[d.length - 1]?.departures ?? 0,
    },
    lines,
  };
}

export const TARGET_HEAD =
  'seed     village  pop40 pop70 hh70  food%40 food%70 food%mean  decisions  1st crafts  crafts%70  stalls  low coins  coins70 owed70 tab70  firewood made/bought  lean  left';

export function formatTarget(r: TargetRow): string {
  const pad = (v: string | number, n: number) => String(v).padStart(n);
  return [
    r.seed.padEnd(8),
    pad(r.villageDay || '-', 7),
    pad(r.residents40, 6),
    pad(r.residents70, 5),
    pad(r.households70, 4),
    pad(r.foodHands40, 8),
    pad(r.foodHands70, 7),
    pad(r.foodHandsMean, 9),
    pad(r.decisions, 10),
    pad(r.firstCraftsfolk || '-', 11),
    pad(r.craftsfolkShare70, 10),
    pad(r.stalls.length, 7),
    pad(r.lowestCoins, 10),
    pad(r.coins70, 8),
    pad(r.owed70, 6),
    pad(r.tab70, 5),
    pad(`${r.firewoodMade}/${r.firewoodBought}`, 21),
    pad(r.leanDays, 5),
    pad(r.departures, 5),
  ].join(' ');
}

const isMain = process.argv[1]?.endsWith('targets.ts');
if (isMain) {
  const days = Number(process.argv[2] ?? DECISIONS_DAYS);
  const seeds = process.argv.length > 3 ? process.argv.slice(3) : DEFAULT_SEEDS;
  const rows: TargetRow[] = [];
  for (const seed of seeds) {
    const t0 = Date.now();
    const { row, lines } = targetRow(seed, days);
    rows.push(row);
    for (const l of lines) console.log(l);
    console.log(`${seed}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  console.log(`\n${TARGET_HEAD}`);
  for (const r of rows) console.log(formatTarget(r));
  for (const r of rows) {
    for (const v of r.verdict) console.log(`${r.seed}: ${v}`);
    for (const s of r.stalls.slice(0, 5)) console.log(`${r.seed} stall: ${s}`);
  }
}
