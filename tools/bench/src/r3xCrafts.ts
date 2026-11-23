// `npx tsx tools/bench/src/r3xCrafts.ts <seed> [days]` (R3X): one ROW json line on why Craftsfolk households
// are few. Plays one seed with the tuned autoplayer (village: true) through `recordRun` and reports the
// Village day, residents at 40 and 70, the first Craftsfolk day, Craftsfolk households and share at 70
// and the mean share over days 40 to 70, the median Settler purse at 70, wage and tax at 70, lean days,
// owed and the credit line at 70, evenings with every lantern lit from Village rank, the worst fair
// evening's share out, and the top three Settler wants at 70.
import { content } from '@qoti/content';
import { PENNIES_PER_COIN, tierProgress, type WorldState } from '@qoti/sim';
import { measureOut, recordRun, rankIndex } from './outcomes';

const seed = process.argv[2] ?? 'hazel';
const days = Number(process.argv[3] ?? 70);
const coins = (p: number) => Math.round(p / PENNIES_PER_COIN);

let wage = 0;
let tax = 0;
let medianPurse = 0;
let wants: string[] = [];
const rec = recordRun(seed, days, {
  onDay: (w: WorldState, line) => {
    if (line.day !== days) return;
    wage = w.levers.wageLevel;
    tax = w.levers.taxRate;
    const purses = w.households
      .filter((h) => h.tier === 'settler')
      .map((h) => h.savings)
      .sort((a, b) => a - b);
    medianPurse = coins(purses[purses.length >> 1] ?? 0);
    const tally = new Map<string, number>();
    for (const h of w.households) {
      if (h.tier !== 'settler') continue;
      for (const m of tierProgress(w, h)?.missing ?? []) {
        const k = m.replace(/\d+/g, '#');
        tally.set(k, (tally.get(k) ?? 0) + 1);
      }
    }
    wants = [...tally]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} (${v})`);
  },
});
const d = (n: number) => rec.r3.days.find((x) => x.day === n);
const last = rec.r3.days[rec.r3.days.length - 1]!;
const firstCraft = rec.daySamples.find((s) => s.crafts > 0)?.day ?? 0;
const shares = rec.daySamples
  .filter((s) => s.day >= 40 && s.households > 0)
  .map((s) => s.crafts / s.households);
const out = measureOut(rec.evenings);
const nights = rec.r3.nights.filter((n) => rankIndex(n.rank) >= rankIndex('village') && n.standing > 0);
const lit = nights.filter((n) => n.lit >= n.standing).length;
const litShare = Math.round(
  (100 * nights.reduce((a, n) => a + n.lit, 0)) /
    Math.max(
      1,
      nights.reduce((a, n) => a + n.standing, 0),
    ),
);
console.log(
  'ROW ' +
    JSON.stringify({
      seed,
      village: rec.r3.villageDay,
      res40: d(40)?.residents,
      res70: last.residents,
      firstCraft,
      crafts: last.crafts,
      hh: last.households,
      share: Math.round((100 * last.crafts) / Math.max(1, last.households)),
      meanShare40_70: Math.round((100 * shares.reduce((a, b) => a + b, 0)) / Math.max(1, shares.length)),
      purse: medianPurse,
      savingsTarget: content.basketByTier.get('craftsfolk')?.savings,
      wage,
      tax,
      lean: rec.r3.days.filter((x) => x.leanTimes).length,
      owed: last.owed,
      line: last.creditLine,
      litNights: `${lit}/${nights.length}`,
      litPct: litShare,
      worstOut: `${Math.round(out.worst * 100)}%@${out.worstDay}`,
      wants,
    }),
);
