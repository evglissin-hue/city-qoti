// `npm run tune -w @qoti/bench [days] [seed] [economy] [villageDay] [handsOffDay]`: plays the
// standard start with the autoplayer and prints a line per in-game day (C3X tuning). With a village
// day (C4A, C4B) the County grants Village rank that morning (through the real claim), the Ledger lays
// and zones a high street, and the run ends with a top-down map of what grew there ('-' skips it).
// TUNE_SAVE=<file.qoti> writes the valley out, to open in the game (title screen, More, Open a valley
// file) or shoot with the e2e scripts. TUNE_ACTIONS=1 lists everything the player tried.
//
// C5.0: one run plays every advisor whose system it finds (the Village chains, services and
// Craftsfolk included), so the old `TUNE_VILLAGE=1` is the default and `TUNE_POST` is gone (it lent
// the storehouses the Trading Post's tag until C4C's post landed, and did nothing since). Last comes
// the year view: a line per day with the season, weather, cold households, festival stars, threat
// band and raid results ('-' until the I3 systems fill them).
import { serialize, type WorldState, type ValleySettings } from '@qoti/sim';
import { writeFileSync } from 'node:fs';
import { autoplay, formatDays } from './autoplay';
import { frontageAscii, grownSummary, streetRect } from './village';
import { YEAR_HEAD, yearRow } from './yearRow';

const days = Number(process.argv[2] ?? 12);
const seed = process.argv[3] ?? 'hazel';
const economy = (process.argv[4] ?? 'standard') as ValleySettings['economy'];
const villageDay = process.argv[5] && process.argv[5] !== '-' ? Number(process.argv[5]) : undefined;
const handsOff = process.argv[6] ? Number(process.argv[6]) : undefined;
const year: string[] = [];
const onDay = (w: WorldState, line: { day: number }) => year.push(yearRow(w, line.day));
const t0 = performance.now();
const run = autoplay(seed, days, { economy, villageDay, handsOff, village: true, onDay });
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
console.log(`\nYear view\n${YEAR_HEAD}\n${year.join('\n')}`);
