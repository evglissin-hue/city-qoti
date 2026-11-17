// `npx tsx tools/bench/src/debt.ts <seed> [days]` (R2X): where a Village's coins go and why its loans
// keep rising. Plays one seed with the autoplayer (village: true, as `npm run targets` does) and prints
//   - the ledger by category, per ten days from day 11, in coins (whole days, read from yesterday's books),
//   - each loan taken (day, coins, treasury and residents then, the three days' biggest outflows),
//   - the share of the balance that is capitalized interest at the end,
//   - units the carrier imported by good family, and
//   - a SUMMARY json line: owed at days 40 and 70, lean days, residents, first Craftsfolk day and share.
// Experiments set the levers through the environment of whoever edits the sim for the run.
import { content } from '@qoti/content';
import { LEDGER_CATEGORIES, loansOwed, PENNIES_PER_COIN, type WorldState } from '@qoti/sim';
import { autoplay, type DayLine } from './autoplay';

const seed = process.argv[2] ?? 'hazel';
const days = Number(process.argv[3] ?? 70);
const cats = LEDGER_CATEGORIES.map((c) => c.id as string);
const coins = (p: number) => Math.round(p / PENNIES_PER_COIN);

let first = 0;
let lean = 0;
let share = 0;
const owedAt = new Map<number, number>();
const resAt = new Map<number, number>();
const perDay: number[][] = [];
const loanIds = new Set<number>();
const loanLines: string[] = [];
let cumLoans = 0;
let cumRepaid = 0;
let owedNow = 0;
let capitalized = 0;
const importUnits = new Map<string, number>();
const family = content.goods.map((g) => g.family as string);

const onDay = (w: WorldState, line: DayLine) => {
  const d = line.day;
  // At 23:00 yesterday's books are the last whole day's: day d-1, and the balance read now is the same night's.
  const m = w.economy.yesterday.money;
  if (d >= 2) {
    perDay[d - 1] = [...m];
    cumLoans += m[cats.indexOf('loans')]!;
    cumRepaid += m[cats.indexOf('repayments')]!;
    capitalized = loansOwed(w) - (cumLoans - cumRepaid);
  }
  owedNow = loansOwed(w);
  const cf = w.households.filter((h) => h.tier !== 'settler').length;
  if (cf > 0 && !first) first = d;
  share = w.households.length ? cf / w.households.length : 0;
  if (w.economy.leanTimes) lean++;
  owedAt.set(d, coins(owedNow));
  resAt.set(d, w.residents.length);
  const b = w.carrier.bought[w.carrier.bought.length - 1];
  if (b && d >= 20)
    b.forEach((u, g) => importUnits.set(family[g]!, (importUnits.get(family[g]!) ?? 0) + Math.max(0, u)));
  for (const l of w.loans.loans) {
    if (loanIds.has(l.id)) continue;
    loanIds.add(l.id);
    const back = [d - 3, d - 2, d - 1].flatMap((x) => (perDay[x] ? [perDay[x]!] : []));
    const out = cats
      .map((c, i) => [c, back.reduce((a, r) => a + r[i]!, 0)] as const)
      .filter(([c]) => LEDGER_CATEGORIES.find((k) => k.id === c)!.kind === 'expense' && c !== 'wages')
      .sort((a, b2) => b2[1] - a[1])
      .slice(0, 3)
      .map(([c, v]) => `${c} ${coins(v)}`)
      .join(', ');
    loanLines.push(
      `  d${d} loan ${coins(l.principal)} treasury ${coins(w.economy.treasury)} pop ${w.residents.length} hh ${w.households.length} bldg ${w.buildings.length}; outflows of the 3 days before (not wages): ${out}`,
    );
  }
};
const run = autoplay(seed, days, { village: true, onDay });

// The ledger by ten-day block, in coins per day.
const rows: string[] = [];
for (let from = 11; from + 9 <= days; from += 10) {
  const parts: string[] = [];
  for (let i = 0; i < cats.length; i++) {
    let s = 0;
    for (let d = from; d < from + 10; d++) s += perDay[d]?.[i] ?? 0;
    if (s !== 0) parts.push(`${cats[i]} ${coins(s)}`);
  }
  rows.push(`  d${from}-${from + 9}: ${parts.join(', ')}`);
}
console.log(`${seed}: ledger per ten days (coins)\n${rows.join('\n')}`);
console.log(`${seed}: loans taken\n${loanLines.join('\n')}`);
console.log(
  `${seed}: balance ${coins(owedNow)} = borrowed ${coins(cumLoans)} less repaid ${coins(cumRepaid)} plus capitalized interest ${coins(capitalized)} (to day ${days - 1})`,
);
console.log(
  `${seed}: carrier imports from day 20 by family (units): ${[...importUnits].map(([k, v]) => `${k} ${v}`).join(', ')}`,
);
console.log(
  'SUMMARY ' +
    JSON.stringify({
      seed,
      owed40: owedAt.get(40),
      owed70: owedAt.get(days),
      lean,
      res70: resAt.get(days),
      first,
      share: Math.round(share * 100),
      decisions: run.decisions.length,
    }),
);
