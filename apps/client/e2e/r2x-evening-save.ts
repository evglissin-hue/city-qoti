// R2X (the player's chair): runs a valley file on to a time of evening and writes it out, so the
// client's grown fixture can be shot on real evening data (people out at places, a closed evening).
//   npx tsx apps/client/e2e/r2x-evening-save.ts <in.qoti> <out.qoti> <days ahead> <hour, e.g. 19.5>
// Then copy <out.qoti> over a scratch copy of apps/client/src/app/fixtures/grown.qoti (as R2F's
// r2f-street.mjs does) and open ?debug&fixture=grown.
import { readFileSync, writeFileSync } from 'node:fs';
import { advanceTo, createTickCtx, deserialize, serialize, TICKS_PER_DAY, TICKS_PER_HOUR } from '@qoti/sim';
import type { WorldState } from '@qoti/sim';
import { tickOfDay } from '../../../packages/sim/src/systems/economy/time';

const [inFile, outFile, daysArg, hourArg] = process.argv.slice(2);
if (!inFile || !outFile) {
  console.error('usage: r2x-evening-save.ts <in.qoti> <out.qoti> [days ahead] [hour]');
  process.exit(1);
}
const state: WorldState = deserialize(new Uint8Array(readFileSync(inFile)));
// Both seats present, or the sim stands paused.
state.time.connected = [0, 1];
const ctx = createTickCtx(state);
const hourTick = Math.round(Number(hourArg ?? 19.5) * TICKS_PER_HOUR);
const startDay = state.tick - tickOfDay(state.tick);
const target = startDay + Number(daysArg ?? 1) * TICKS_PER_DAY + hourTick;
while (state.tick < target) advanceTo(state, state.lastTurn + 1, ctx);
writeFileSync(outFile, serialize(state));
const t = state.evenings.tonight;
console.log(
  `${outFile}: tick ${state.tick}, rank ${state.charter.rank}, ${state.residents.length} residents, ` +
    `${state.places.length} place rows, tonight out ${t.out} of ${t.grownups}, gaps open ${state.gaps.open.length}`,
);
