// `npm run hands -w @qoti/bench [days] [seeds...]`: the share of working residents in food jobs, for
// the R1X tuning record (docs/spec/13-ledger.md, Tuning targets). Plays each seed with the
// autoplayer and prints a line every 10 days, then the mean share over the seeds on the last day.
import { content } from '@qoti/content';
import { findById, methodOf, type WorldState } from '@qoti/sim';
import { autoplay } from './autoplay';
import { DEFAULT_SEEDS } from './audit';

export interface HandsInFood {
  /** Working residents whose workplace makes Food or runs a farm method. */
  food: number;
  /** Residents with a job. */
  working: number;
  /** food / working, 0 to 1 (0 when nobody works). */
  share: number;
}

/** True when the building's method outputs a Food good or is a farm method. */
function feedsTown(b: Parameters<typeof methodOf>[0]): boolean {
  const m = methodOf(b);
  if (!m) return false;
  if (m.kind === 'farm') return true;
  return m.outputs.some(([g]) => content.goodById.get(g)?.family === 'food');
}

/** Counts working residents, and those whose workplace grows or makes food. */
export function handsInFood(w: WorldState): HandsInFood {
  let working = 0;
  let food = 0;
  for (const r of w.residents) {
    if (!r.jobId) continue;
    working++;
    const b = findById(w.buildings, r.jobId);
    if (b && feedsTown(b)) food++;
  }
  return { food, working, share: working > 0 ? food / working : 0 };
}

export function formatHands(seed: string, day: number, h: HandsInFood): string {
  return `${seed} day ${day}: ${h.food} of ${h.working} working residents in food (${Math.round(h.share * 100)}%)`;
}

if (process.argv[1]?.endsWith('hands.ts')) {
  const days = Number(process.argv[2] ?? 40);
  const seeds = process.argv.length > 3 ? process.argv.slice(3) : DEFAULT_SEEDS;
  const last: number[] = [];
  for (const seed of seeds) {
    let final: HandsInFood = { food: 0, working: 0, share: 0 };
    let finalDay = 0;
    autoplay(seed, days, {
      onDay: (w, line) => {
        final = handsInFood(w);
        finalDay = line.day;
        if (line.day % 10 === 0) console.log(formatHands(seed, line.day, final));
      },
    });
    if (finalDay % 10 !== 0) console.log(formatHands(seed, finalDay, final));
    last.push(final.share);
  }
  const mean = last.reduce((a, b) => a + b, 0) / Math.max(1, last.length);
  console.log(
    `mean over ${seeds.length} seeds at day ${days}: ${Math.round(mean * 100)}% of working residents in food`,
  );
}
