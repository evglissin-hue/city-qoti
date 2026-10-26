// `npm run tune -w @qoti/bench [days] [seed] [economy] [villageDay] [handsOffDay]`: plays the standard start with
// the autoplayer and prints a line per in-game day (C3X tuning). With a village day (C4B) the
// valley becomes a Village that morning, the Ledger lays and zones a high street, and the run ends
// with a top-down map of what grew there.
import type { ValleySettings } from '@qoti/sim';
import { autoplay, formatDays } from './autoplay';
import { frontageAscii, grownSummary, streetRect } from './village';

const days = Number(process.argv[2] ?? 12);
const seed = process.argv[3] ?? 'hazel';
const economy = (process.argv[4] ?? 'standard') as ValleySettings['economy'];
const village = process.argv[5] ? Number(process.argv[5]) : undefined;
const handsOff = process.argv[6] ? Number(process.argv[6]) : undefined;
const t0 = performance.now();
const run = autoplay(seed, days, { economy, village, handsOff });
console.log(`Autoplay ${seed}, ${economy}, ${days} days (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
console.log(formatDays(run.days));
if (run.street) {
  console.log(`\n${grownSummary(run.hamlet.world)}`);
  console.log(`\n${frontageAscii(run.hamlet.world, streetRect(run.street))}`);
}
if (process.env.TUNE_ACTIONS) console.log(run.actions.join('\n'));
