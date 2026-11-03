// C5D: the threat fixture's raid, replayed in Node. Prints JSON: the snapshot it starts from (an
// hour before dusk on the raid day, base64), the turn to run to, and the hash there. The browser
// determinism e2e spec replays the same snapshot in a sim worker and compares the hash.
import { advanceTo, bytesToBase64, createTickCtx, deserialize, hashState, serialize } from '../src/index';
import { tickAt } from '../test/fixtures/seasonsPlace';
import { threatFixture } from '../test/fixtures/threat';

/** Turns run from the snapshot: through dusk and the raid to its end. */
const TURNS = 1500;

const start = threatFixture().state;
start.tick = tickAt(0, 2, 4, 17);
const data = serialize(start);
const world = deserialize(data);
const to = world.lastTurn + TURNS;
advanceTo(world, to, createTickCtx(world));
console.error(
  `raid replay: tick ${world.tick}, raids ${world.threats.history.length}, raid live ${world.raid !== null}`,
);
console.log(JSON.stringify({ data: bytesToBase64(data), to, hash: hashState(world) }));
