// `npx tsx tools/bench/src/r3xMoney.ts <seed> [days]` (R3X): one row of a Village's money at days 40
// and 70, to judge what outside income does for it. Plays one seed with the tuned autoplayer
// (village: true, as debt.ts does) and prints a ROW json line.
//   - owed and the credit line (coins), residents, at 40 and the last day;
//   - exports and imports summed over days 41 to 70 (from yesterday's books, coins);
//   - the masters' goods the carrier sold over the run (units, and coins at the best neighbor price);
//   - wage level and tax rate at 70, Craftsfolk households (share and first day), the median purse,
//     and the three wants most Settler households miss (from tierProgress).
import { content } from '@qoti/content';
import {
  carrierSellPrice,
  creditLimit,
  LEDGER_CATEGORIES,
  loansOwed,
  PENNIES_PER_COIN,
  tierProgress,
  type WorldState,
} from '@qoti/sim';
import { autoplay, type DayLine } from './autoplay';

const seed = process.argv[2] ?? 'hazel';
const days = Number(process.argv[3] ?? 70);
const cats = LEDGER_CATEGORIES.map((c) => c.id as string);
const coins = (p: number) => Math.round(p / PENNIES_PER_COIN);
const MASTERS = ['pies', 'butter', 'jam', 'cordial', 'mead', 'coats', 'toys', 'soap', 'smoked-fish'];
const masterIdx = MASTERS.map((id) => content.goodIndex.get(id)!);

let village = 0;
let lean = 0;
let lowest = Infinity;
let lowestDay = 0;
let first = 0;
let exp41 = 0;
let imp41 = 0;
let masterUnits = 0;
let masterPennies = 0;
const at = new Map<number, { res: number; owed: number; line: number }>();
let last: Record<string, unknown> = {};

const onDay = (w: WorldState, line: DayLine) => {
  const d = line.day;
  if (!village && line.rank !== 'hamlet') village = d;
  if (w.economy.leanTimes) lean++;
  const c = coins(w.economy.treasury);
  if (c < lowest) {
    lowest = c;
    lowestDay = d;
  }
  at.set(d, { res: w.residents.length, owed: coins(loansOwed(w)), line: coins(creditLimit(w)) });
  if (!first && w.households.some((h) => h.tier !== 'settler')) first = d;
  if (d >= 42 && d <= days) {
    const m = w.economy.yesterday.money;
    exp41 += m[cats.indexOf('exports')] ?? 0;
    imp41 += m[cats.indexOf('imports')] ?? 0;
  }
  const sold = w.carrier.sold[w.carrier.sold.length - 1];
  if (sold) {
    const best = (g: number) =>
      Math.max(0, ...w.trade.neighbors.map((n) => carrierSellPrice(w, n.id, g) ?? 0));
    for (const g of masterIdx) {
      const u = Math.max(0, sold[g] ?? 0);
      masterUnits += u;
      masterPennies += u * best(g);
    }
  }
  if (d === days) {
    const purses = w.households.map((h) => h.savings).sort((a, b) => a - b);
    const craft = w.households.filter((h) => h.tier !== 'settler').length;
    const wants = new Map<string, number>();
    for (const h of w.households) {
      if (h.tier !== 'settler') continue;
      for (const m of tierProgress(w, h)?.missing ?? []) wants.set(m, (wants.get(m) ?? 0) + 1);
    }
    last = {
      wage: w.levers.wageLevel,
      tax: w.levers.taxRate,
      hh: w.households.length,
      craft,
      share: Math.round((100 * craft) / Math.max(1, w.households.length)),
      medianPurse: coins(purses[purses.length >> 1] ?? 0),
      wants: [...wants]
        .sort((x, y) => y[1] - x[1])
        .slice(0, 3)
        .map(([k, v]) => `${k} (${v})`),
    };
  }
};
autoplay(seed, days, { village: true, onDay });
const a = at.get(40)!;
const b = at.get(days)!;
const row = {
  seed,
  village,
  res40: a.res,
  res70: b.res,
  owed40: a.owed,
  line40: a.line,
  owed70: b.owed,
  line70: b.line,
  lean,
  lowest,
  lowestDay,
  exports41_70: coins(exp41),
  imports41_70: coins(imp41),
  masterUnits,
  masterCoins: coins(masterPennies),
  firstCraft: first,
  ...last,
};
console.log('ROW ' + JSON.stringify(row));
