// C5X part 2: a full year of the threat fixture (a village under threat at Standard, its raid on the
// fourth day of spring included), replayed in Node. Prints JSON: the starting snapshot (base64), the
// turn to run to and the hash there; the browser determinism e2e spec replays it in a sim worker.
import {
  advanceTo,
  bytesToBase64,
  createTickCtx,
  deserialize,
  hashState,
  serialize,
  TICKS_PER_DAY,
} from '../src/index';
import { DAYS_PER_SEASON, SEASONS_PER_YEAR } from '../src/constants';
import { threatFixture } from '../test/fixtures/threat';

const start = threatFixture().state;
const data = serialize(start);
const world = deserialize(data);
// At 1x a turn is a tick.
const to = world.lastTurn + DAYS_PER_SEASON * SEASONS_PER_YEAR * TICKS_PER_DAY;
advanceTo(world, to, createTickCtx(world));
console.error(
  `year replay: tick ${world.tick}, raids ${world.threats.history.length}, festivals ${world.festival.history.length}, trial ${world.trial?.status ?? 'none'}`,
);
console.log(JSON.stringify({ data: bytesToBase64(data), to, hash: hashState(world) }));
