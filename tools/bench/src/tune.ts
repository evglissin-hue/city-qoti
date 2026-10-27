// `npm run tune -w @qoti/bench [days] [seed] [economy] [villageDay] [handsOffDay]`: plays the
// standard start with the autoplayer and prints a line per in-game day (C3X tuning). With a village
// day (C4A, C4B) the County grants Village rank that morning (through the real claim), the Ledger lays
// and zones a high street, and the run ends with a top-down map of what grew there ('-' skips it).
// TUNE_SAVE=<file.qoti> writes the valley out, to open in the game (title screen, More, Open a valley
// file) or shoot with the e2e scripts. TUNE_VILLAGE=1 also plays the Village chains, services and
// Craftsfolk (C4C) once the rank comes.
import { serialize, type ValleySettings } from '@qoti/sim';
import { writeFileSync } from 'node:fs';
import { autoplay, formatDays } from './autoplay';
import { frontageAscii, grownSummary, streetRect } from './village';

const days = Number(process.argv[2] ?? 12);
const seed = process.argv[3] ?? 'hazel';
const economy = (process.argv[4] ?? 'standard') as ValleySettings['economy'];
const villageDay = process.argv[5] && process.argv[5] !== '-' ? Number(process.argv[5]) : undefined;
const handsOff = process.argv[6] ? Number(process.argv[6]) : undefined;
// `TUNE_POST=1`: storehouses stand in for the Trading Post from Village rank (until C4C's lands).
const standInPost = !!process.env.TUNE_POST;
const t0 = performance.now();
// C4C: `TUNE_VILLAGE=1` plays on past the Charter (chains, services, Craftsfolk).
const village = !!process.env.TUNE_VILLAGE;
const run = autoplay(seed, days, { economy, villageDay, handsOff, standInPost, village });
console.log(`Autoplay ${seed}, ${economy}, ${days} days (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
console.log(formatDays(run.days));
if (run.street) {
  const rect = streetRect(run.street);
  console.log(`\n${grownSummary(run.hamlet.world)}`);
  console.log(`high street around (${(rect[0] + rect[2]) >> 1}, ${(rect[1] + rect[3]) >> 1})`);
  console.log(`\n${frontageAscii(run.hamlet.world, rect)}`);
}
if (process.env.TUNE_SAVE) {
  const w = run.hamlet.world;
  w.time.connected = [];
  writeFileSync(process.env.TUNE_SAVE, serialize(w));
  console.log(`saved ${process.env.TUNE_SAVE}`);
}
if (process.env.TUNE_ACTIONS) console.log(run.actions.join('\n'));
