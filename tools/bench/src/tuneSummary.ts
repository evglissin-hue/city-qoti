// `npm run tune:summary -w @qoti/bench [days] [seeds...]` (C5X part 2): plays each seed with the
// autoplayer, every system on and the threat dial at Standard, and prints one block per seed with
// the I3 tuning targets side by side: the Village day, population, Field Guide species in the first
// Village year, County Bank loans (now and at their peak), the treasury less loans at each winter's
// end, lean days, the most households cold on a winter day (V marks a winter at Village rank),
// winter days with less than a day's food in store, departures, festival stars by season, raids and
// the trial. Seeds run one after another (about two minutes each for 72 days).
import { calendar, loansOwed, PENNIES_PER_COIN, rankAtLeast, type WorldState } from '@qoti/sim';
import { autoplay, type DayLine } from './autoplay';

const SEASON = ['Sp', 'Su', 'Au', 'Wi'];

export interface TuneSummary {
  seed: string;
  lines: string[];
}

/** Plays `seed` for `days` and summarizes it against the I3 targets. */
export function tuneSummary(seed: string, days: number): TuneSummary {
  let villageDay = 0;
  let species = -1;
  let peak = 0;
  const lean: number[] = [];
  const cold = new Map<string, number>();
  const hungry: string[] = [];
  const winterEnds: number[] = [];
  const trial: string[] = [];
  let lastTrial = '';
  const onDay = (w: WorldState, line: DayLine) => {
    const c = calendar(w.tick);
    if (!villageDay && rankAtLeast(w, 'village')) villageDay = line.day;
    if (villageDay && species < 0 && line.day >= villageDay + 23) species = w.nature.guide.length;
    peak = Math.max(peak, loansOwed(w) / PENNIES_PER_COIN);
    if (line.leanTimes) lean.push(line.day);
    const t = w.trial?.status ?? '';
    if (t !== lastTrial) {
      trial.push(`${line.day}:${t || 'none'}`);
      lastTrial = t;
    }
    if (c.season !== 3) return;
    let n = 0;
    for (const h of w.households) if (h.warmth && h.warmth.coldHours > 0) n++;
    const key = `y${c.year}${villageDay ? 'V' : ''}`;
    cold.set(key, Math.max(cold.get(key) ?? 0, n));
    if (line.food < line.residents) hungry.push(`${line.day}:${line.food}/${line.residents}`);
    if (c.day === 6) winterEnds.push(Math.round((w.economy.treasury - loansOwed(w)) / PENNIES_PER_COIN));
  };
  const run = autoplay(seed, days, { village: true, threat: 'standard', onDay });
  const w = run.hamlet.world;
  const last = run.days[run.days.length - 1]!;
  const savings = w.households.reduce((n, h) => n + h.savings, 0) / PENNIES_PER_COIN;
  const festivals = w.festival.history.map((f) => `${SEASON[f.season]}${f.year}:${f.stars}`).join(' ');
  const raids = w.threats.history
    .map(
      (r) =>
        `${r.band} ${r.repelled ? (r.stolen ? 'repelled' : 'held') : 'lost'} ${r.stolen}, ${r.captured} caught`,
    )
    .join('; ');
  return {
    seed,
    lines: [
      `${seed}: Village day ${villageDay || '-'}, ${last.residents} residents, ${species} species in the first Village year, ${last.departures} left`,
      `  loans ${Math.round(loansOwed(w) / PENNIES_PER_COIN)} (peak ${Math.round(peak)}), treasury less loans at each winter's end [${winterEnds.join(', ')}], lean days ${lean.length ? lean.join(',') : 'none'}`,
      `  levers: wages ${w.levers.wageLevel}%, tax ${w.levers.taxRate}%; savings ${Math.round(savings)} in ${w.households.length} households; Craftsfolk ${last.craftsfolk}`,
      `  cold households (most on a winter day) ${[...cold].map(([k, v]) => `${k}:${v}`).join(' ') || '-'}; winter days under a day's food ${hungry.join(',') || 'none'}`,
      `  festivals ${festivals}`,
      `  raids ${raids || 'none'}`,
      `  trial ${trial.join(' ')}`,
    ],
  };
}

const days = Number(process.argv[2] ?? 72);
const seeds = process.argv.slice(3);
for (const seed of seeds.length ? seeds : ['willow', 'hazel', 'oak', 'alpha']) {
  console.log(tuneSummary(seed, days).lines.join('\n'));
}
