// V2B: the season's thinning of brush-dab foliage (`docs/build/v2-wave-notes.md`, Static-layer
// events). Crowns, hedgerows and bushes are built at one of five steps (1, 0.75, 0.5, 0.25 and 0),
// each step's geometry built once and kept, and swapped at most once an in-game day: the step comes
// from the calendar's day, never its hour. Dabs thin from Autumn day 4 and are gone in winter, where
// the foliage shader's bare twigs (`uBare`) stay; they come back over the first day of spring.
import { DAYS_PER_SEASON } from '@qoti/sim';

/** The five thinning steps, full to bare. */
export const THIN_STEPS = [1, 0.75, 0.5, 0.25, 0] as const;

/**
 * The dab thinning for a season (0 spring to 3 winter) and day (1 to DAYS_PER_SEASON): 1 through
 * spring and summer, autumn's first three days, then a quarter less each day to 0.25 on autumn's
 * last, 0 all winter, and half back on the first day of spring as the buds open.
 */
export function thinStep(season: number, day: number): number {
  const s = ((Math.floor(season) % 4) + 4) % 4;
  const d = Math.max(1, Math.min(DAYS_PER_SEASON, Math.floor(day)));
  if (s === 3) return 0;
  if (s === 0) return d === 1 ? 0.5 : 1;
  if (s === 1) return 1;
  // Autumn: full until day 4, then down a quarter a day.
  const left = DAYS_PER_SEASON - d;
  if (d < 4) return 1;
  return Math.max(0.25, Math.min(1, 0.25 * (left + 1)));
}

/**
 * Geometry (or anything) per thinning step, built once on first use and kept. `builds` counts the
 * builds, so a test (or a log) can show a season step rebuilds nothing it built before.
 */
export class StepCache<T> {
  private readonly made = new Map<number, T>();
  builds = 0;

  constructor(private readonly build: (thin: number) => T) {}

  get(thin: number): T {
    let v = this.made.get(thin);
    if (v === undefined) {
      v = this.build(thin);
      this.builds++;
      this.made.set(thin, v);
    }
    return v;
  }

  /** Everything built so far (for disposal). */
  values(): IterableIterator<T> {
    return this.made.values();
  }
}
