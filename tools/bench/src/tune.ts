// `npm run tune -w @qoti/bench [days] [seed] [economy] [villageDay]`: plays the standard start with the
// autoplayer and prints a line per in-game day (C3X tuning).
import type { ValleySettings } from '@qoti/sim';
import { autoplay, formatDays } from './autoplay';

const days = Number(process.argv[2] ?? 12);
const seed = process.argv[3] ?? 'hazel';
const economy = (process.argv[4] ?? 'standard') as ValleySettings['economy'];
// I2 (C4A): `npm run tune -w @qoti/bench 30 hazel standard 12` grants Village rank on day 12.
const villageDay = process.argv[5] && process.argv[5] !== '-' ? Number(process.argv[5]) : undefined;
// `TUNE_POST=1`: storehouses stand in for the Trading Post from Village rank (until C4C's lands).
const standInPost = !!process.env.TUNE_POST;
const t0 = performance.now();
const run = autoplay(seed, days, { economy, villageDay, standInPost });
console.log(`Autoplay ${seed}, ${economy}, ${days} days (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
console.log(formatDays(run.days));
if (process.env.TUNE_ACTIONS) console.log(run.actions.join('\n'));
