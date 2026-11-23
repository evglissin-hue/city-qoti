// `npx tsx tools/bench/src/r3xWhy.ts <seed> [days]` (R3X): why Settler households stay Settlers. Plays one
// seed with the autoplayer (village: true) and every ten days from day 30 tallies what `tierProgress`
// says each Settler household still wants, with the purse spread and the day's money lines.
import { tierProgress, PENNIES_PER_COIN, type WorldState } from '@qoti/sim';
import { autoplay, type DayLine } from './autoplay';

const seed = process.argv[2] ?? 'oak';
const days = Number(process.argv[3] ?? 70);
const out: string[] = [];
const onDay = (w: WorldState, line: DayLine) => {
  if (line.day < 30 || line.day % 10 !== 0) return;
  const tally = new Map<string, number>();
  let settlers = 0;
  let crafts = 0;
  const purses: number[] = [];
  for (const h of w.households) {
    if (h.tier !== 'settler') {
      crafts++;
      continue;
    }
    settlers++;
    purses.push(Math.round(h.savings / PENNIES_PER_COIN));
    const p = tierProgress(w, h);
    for (const m of p?.missing ?? []) {
      const key = m.replace(/\d+/g, '#');
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  purses.sort((a, b) => a - b);
  const q = (f: number) => purses[Math.min(purses.length - 1, Math.floor(f * purses.length))] ?? 0;
  const top = [...tally]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join('; ');
  out.push(
    `d${line.day} res ${line.residents} hh ${w.households.length} crafts ${crafts} settlers ${settlers} purse p25/50/75 ${q(0.25)}/${q(0.5)}/${q(0.75)} coins ${line.coins} owed ${line.owed} wage ${line.wageLevel} tax ${line.taxRate} basket ${line.basket}\n   wants: ${top}`,
  );
};
autoplay(seed, days, { village: true, onDay });
console.log(`${seed}:\n${out.join('\n')}`);
