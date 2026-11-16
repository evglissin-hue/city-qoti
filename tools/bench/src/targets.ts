// `npm run targets -w @qoti/bench [days] [seeds...]` (R1X): plays each seed with the autoplayer for
// 70 days (every system on) and prints one row per seed against R1's tuning targets
// (docs/spec/13-ledger.md, Tuning targets and acceptance): hands in food at days 40 and 70, the
// Ledger's decisions, the first Craftsfolk and the Craftsfolk share at day 70, businesses a whole day
// without their raw good while the carrier may buy, and the money (lowest treasury, owed, the tab).
// R2E adds the evening: share out, the average evening, places and seats, Treats on the round, gaps,
// the Hearth's decisions and R1's Craftsfolk lines as PASS/FAIL; '-' while no evening is tallied.
// TARGETS_DAYS=1 adds a line per day with the numbers behind it.
import { content } from '@qoti/content';
import {
  calendar,
  hasInnovation,
  loansOwed,
  PENNIES_PER_COIN,
  placesView,
  rankAtLeast,
  type WorldState,
} from '@qoti/sim';
import { autoplay, type DayLine } from './autoplay';
import { DEFAULT_SEEDS } from './audit';
import { DECISIONS_DAYS, decisionVerdict, tallyDecisions } from './decisions';
import { rowsOf } from './rows';
import { charterOpen } from './town';

export interface TargetRow {
  seed: string;
  villageDay: number;
  residents40: number;
  residents70: number;
  households70: number;
  foodHands40: number;
  foodHands70: number;
  /** Mean percent of hands in food over the growing days from day 20 (winter's resting farms left out). */
  foodHandsMean: number;
  decisions: number;
  verdict: string[];
  /** The Ledger's accepted commands by kind, most first. */
  kinds: string;
  firstCraftsfolk: number;
  craftsfolkShare70: number;
  /** The best share of Craftsfolk households on any day up to the end (winter slides it back). */
  craftsfolkBest: number;
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
  // R2E: the evening, in the new terms. null: no evening tallied (or no places, no Treats sold yet).
  /** Mean percent of grown-ups out over the fair evenings from day 20, and the last fair evening's. */
  shareOutMean: number | null;
  shareOutLast: number | null;
  /** Mean evening score (0 to 100) over the same evenings. */
  avgEvening: number | null;
  /** Places at the end of the run, and their seats per 100 grown-ups. */
  places: number;
  seatsPer100: number | null;
  /** Percent of Treats sold on the round (at stops and to passing trade) over the run. */
  treatsRound: number | null;
  gapsOpened: number;
  gapsClosed: number;
  /** Gaps closed by each seat, e.g. '2/1'. */
  closedBySeat: string;
  /** The Hearth's accepted commands (reported; the Ledger's `decisions` has the limit). */
  hearthDecisions: number;
  /** R2E: the day Cobbles unlocked (0: never), and the street lots at the end (R2F cuts rows and gardens). */
  cobblesDay: number;
  rowLots: number;
  rows: number;
  gardens: number;
  corners: number;
  grownRowLots: number;
  /** The first Craftsfolk came by day 40 (R1). */
  craftsBy40: boolean;
  /** A third of households are Craftsfolk at day 70 (R1). */
  craftsThird70: boolean;
}

/** R1 target: the first Craftsfolk by this day. */
export const FIRST_CRAFTSFOLK_BY = 40;
/** R1 target: this share of households Craftsfolk at day 70. */
export const CRAFTSFOLK_SHARE = 1 / 3;
/** R2 target: once this many places stand, this percent of Treats are sold on the round. */
export const ROUND_MIN_PLACES = 3;
export const ROUND_MIN_PERCENT = 80;

const firewood = content.goodIndex.get('firewood')!;

/** Households whose tier is craftsfolk or higher, and all households. */
function craftsHouseholds(w: WorldState): [number, number] {
  let crafts = 0;
  for (const h of w.households) if (h.tier !== 'settler') crafts++;
  return [crafts, w.households.length];
}

export function targetRow(seed: string, days = DECISIONS_DAYS): { row: TargetRow; lines: string[] } {
  let villageDay = 0;
  let cobblesDay = 0;
  let firstCraftsfolk = 0;
  let lowest = Infinity;
  let made = 0;
  let bought = 0;
  let share70 = 0;
  let best = 0;
  const lines: string[] = [];
  const hands: number[] = [];
  // R2E: read the evening's tally once a day, after 21:00 (onDay runs at the day's end).
  const outShares: number[] = [];
  const scores: number[] = [];
  let lastOut: number | null = null;
  let tallyDay = -1;
  let onRound = 0;
  let sold = 0;
  const gapIds = new Set<number>();
  const onDay = (w: WorldState, line: DayLine) => {
    if (!villageDay && rankAtLeast(w, 'village')) villageDay = line.day;
    if (!cobblesDay && hasInnovation(w, 'cobbles')) cobblesDay = line.day;
    const [crafts, all] = craftsHouseholds(w);
    if (!firstCraftsfolk && crafts > 0) firstCraftsfolk = line.day;
    share70 = all ? crafts / all : 0;
    best = Math.max(best, share70);
    lowest = Math.min(lowest, w.economy.treasury / PENNIES_PER_COIN);
    made += w.economy.yesterday.produced[firewood] ?? 0;
    bought += w.carrier.bought[w.carrier.bought.length - 1]?.[firewood] ?? 0;
    if (line.day >= 20 && line.ledger && calendar(w.tick).season !== 3) hands.push(line.ledger.handsFood);
    const t = w.evenings.tonight;
    if (t.day >= 0 && t.day !== tallyDay) {
      tallyDay = t.day;
      onRound += t.treatsAtStops + t.treatsPassing;
      sold += t.treatsAtStops + t.treatsPassing + t.treatsDoorstep;
      if (t.weather === 'fair' && line.day >= 20 && t.grownups > 0) {
        lastOut = (t.out / t.grownups) * 100;
        outShares.push(lastOut);
        scores.push(t.scoreSum / t.grownups);
      }
    }
    for (const g of w.gaps.open) gapIds.add(g.id);
    for (const g of w.gaps.closed) gapIds.add(g.id);
    if (process.env.TARGETS_DAYS) {
      const l = line.ledger;
      lines.push(
        `${seed} d${line.day} ${line.rank} ${line.charter} open ${charterOpen(w).join(',')} pop ${line.residents} hh ${line.households} crafts ${crafts} coins ${line.coins} owed ${line.owed} wages ${line.wages} sales ${line.sales} tax ${line.taxes} trade ${line.trade} food% ${l?.handsFood ?? '-'} haul% ${l?.handsHaul ?? '-'} biz ${l?.businesses ?? '-'} in ${l?.carrierIn ?? '-'} out ${l?.carrierOut ?? '-'} tab ${l?.tab ?? '-'} cover ${l?.balances.map((b) => `${b.cover}/${b.flavors}`).join(' ') ?? '-'}`,
      );
    }
  };
  const run = autoplay(seed, days, { village: true, onDay });
  const d = run.days;
  const at = (day: number) => d[Math.min(d.length, day) - 1];
  const w = run.hamlet.world;
  const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const round = (v: number | null) => (v === null ? null : Math.round(v));
  const grownups = w.residents.filter((r) => r.stage === 'young' || r.stage === 'adult').length;
  const places = placesView(w).places;
  const seats = places.reduce((a, p) => a + p.seats, 0);
  const street = rowsOf(w);
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
      kinds: tally.kinds
        .filter((k) => k.ledger > 0)
        .slice(0, 8)
        .map((k) => `${k.kind} ${k.ledger}`)
        .join(', '),
      firstCraftsfolk,
      craftsfolkShare70: Math.round(share70 * 100),
      craftsfolkBest: Math.round(best * 100),
      stalls: run.health.filter((i) => i.kind === 'business-short').map((i) => i.text),
      lowestCoins: Math.round(lowest),
      owed70: Math.round(loansOwed(w) / PENNIES_PER_COIN),
      tab70: Math.round(w.carrier.tab / PENNIES_PER_COIN),
      coins70: Math.round(w.economy.treasury / PENNIES_PER_COIN),
      firewoodMade: made,
      firewoodBought: bought,
      leanDays: d.filter((x) => x.leanTimes).length,
      departures: d[d.length - 1]?.departures ?? 0,
      shareOutMean: round(mean(outShares)),
      shareOutLast: round(lastOut),
      avgEvening: round(mean(scores)),
      places: places.length,
      seatsPer100: grownups && places.length ? Math.round((seats / grownups) * 100) : null,
      treatsRound: sold > 0 ? Math.round((onRound / sold) * 100) : null,
      gapsOpened: gapIds.size,
      gapsClosed: w.gaps.closedCount,
      closedBySeat: w.gaps.closedBySeat.join('/'),
      hearthDecisions: tally.hearth,
      cobblesDay,
      rowLots: street.rowLots,
      rows: street.rows,
      gardens: street.gardens,
      corners: street.corners,
      grownRowLots: street.grownRowLots,
      craftsBy40: firstCraftsfolk > 0 && firstCraftsfolk <= FIRST_CRAFTSFOLK_BY,
      craftsThird70: share70 >= CRAFTSFOLK_SHARE,
    },
    lines,
  };
}

export const TARGET_HEAD =
  'seed     village  pop40 pop70 hh70  food%40 food%70 food%mean  decisions  1st crafts  crafts%70 best  stalls  low coins  coins70 owed70 tab70  firewood made/bought  lean  left  out%mean out%last evening seats/100  places  treats%round  gaps open/shut  by seat  hearth  cobbles  rowlots rows gardens corners grown  crafts@40 third@70';

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
    pad(r.craftsfolkBest, 4),
    pad(r.stalls.length, 7),
    pad(r.lowestCoins, 10),
    pad(r.coins70, 8),
    pad(r.owed70, 6),
    pad(r.tab70, 5),
    pad(`${r.firewoodMade}/${r.firewoodBought}`, 21),
    pad(r.leanDays, 5),
    pad(r.departures, 5),
    pad(r.shareOutMean ?? '-', 9),
    pad(r.shareOutLast ?? '-', 8),
    pad(r.avgEvening ?? '-', 7),
    pad(r.seatsPer100 ?? '-', 9),
    pad(r.places || '-', 7),
    pad(r.treatsRound ?? '-', 12),
    pad(`${r.gapsOpened}/${r.gapsClosed}`, 14),
    pad(r.closedBySeat, 7),
    pad(r.hearthDecisions, 6),
    pad(r.cobblesDay || '-', 7),
    pad(r.rowLots, 8),
    pad(r.rows, 4),
    pad(r.gardens, 7),
    pad(r.corners, 7),
    pad(r.grownRowLots, 5),
    pad(r.craftsBy40 ? 'PASS' : 'FAIL', 9),
    pad(r.craftsThird70 ? `PASS ${r.craftsfolkShare70}%` : `FAIL ${r.craftsfolkShare70}%`, 9),
  ].join(' ');
}

/** One line per failed R1 or R2 target for a seed (the footer). */
export function failedTargets(r: TargetRow): string[] {
  const fails = r.verdict.map((v) => `Ledger decisions: ${v}`);
  if (!r.craftsBy40)
    fails.push(
      `R1: no Craftsfolk by day ${FIRST_CRAFTSFOLK_BY} (${r.firstCraftsfolk ? `first on day ${r.firstCraftsfolk}` : 'none came'})`,
    );
  if (!r.craftsThird70)
    fails.push(`R1: Craftsfolk are ${r.craftsfolkShare70}% of households at day 70 (a third wanted)`);
  if (r.places >= ROUND_MIN_PLACES && (r.treatsRound ?? 0) < ROUND_MIN_PERCENT)
    fails.push(
      `R2: ${r.treatsRound ?? 0}% of Treats sold on the round with ${r.places} places (${ROUND_MIN_PERCENT}% wanted)`,
    );
  return fails;
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
    for (const f of failedTargets(r)) console.log(`${r.seed}: FAIL ${f}`);
    console.log(`${r.seed} Ledger kinds: ${r.kinds}`);
    for (const s of r.stalls.slice(0, 5)) console.log(`${r.seed} stall: ${s}`);
  }
}
