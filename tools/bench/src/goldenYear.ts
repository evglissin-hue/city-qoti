// `npm run golden:year -w @qoti/bench`: plays the autoplayer for a year (24 days) on seed hazel,
// standard economy, threat standard, every system on (as `npm run tune` plays it), recording every
// command it sends with the turn it took effect and its seat, and writes the script to
// packages/sim/test/golden/r1-year.json. The world is createValley(seed, settings) plus the
// recorded turns alone (the seat join is a recorded command), so replaying the file in Node or in
// a browser worker must give the autoplayer's own end-state hash (the R1 year determinism check).
import { DAYS_PER_SEASON, hashState, type Turn, type ValleySettings } from '@qoti/sim';
import { writeFileSync } from 'node:fs';
import { autoplay } from './autoplay';

export const YEAR_SEED = 'hazel';
export const YEAR_DAYS = DAYS_PER_SEASON * 4;

export interface GoldenScript {
  seed: string;
  settings: ValleySettings;
  lastTurn: number;
  turns: Turn[];
}

/** Plays the year and returns the script and the hash of the autoplayer's end state. */
export function playYear(days = YEAR_DAYS): { script: GoldenScript; hash: string } {
  const turns: Turn[] = [];
  const run = autoplay(YEAR_SEED, days, {
    economy: 'standard',
    threat: 'standard',
    village: true,
    record: turns,
  });
  const w = run.hamlet.world;
  return { script: { seed: w.seed, settings: w.settings, lastTurn: w.lastTurn, turns }, hash: hashState(w) };
}

if (process.argv[1]?.endsWith('goldenYear.ts')) {
  const { script, hash } = playYear();
  const file = new URL('../../../packages/sim/test/golden/r1-year.json', import.meta.url);
  writeFileSync(file, JSON.stringify(script));
  console.log(`r1-year: ${script.turns.length} turns, lastTurn ${script.lastTurn}, hash ${hash}`);
}
