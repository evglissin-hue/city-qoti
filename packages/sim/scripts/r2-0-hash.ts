// R2.0: ten in-game days on the stand-ins, in Node, from a version 6 valley (migrated on load) or a
// fresh standard valley. Prints JSON: the snapshot it starts from (base64), the turn to run to, and
// the hash there. The browser determinism e2e spec runs the same snapshot in a sim worker (so the
// migration runs in the browser too) and compares the hash.
//   npx tsx packages/sim/scripts/r2-0-hash.ts v6 | fresh
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  advanceTo,
  base64ToBytes,
  bytesToBase64,
  createTickCtx,
  createWorld,
  defaultSettings,
  deserialize,
  hashState,
  serialize,
  TICKS_PER_DAY,
} from '../src/index';

const DAYS = 10;
const which = process.argv[2] ?? 'v6';

let data: Uint8Array;
if (which === 'v6') {
  const v6 = JSON.parse(
    readFileSync(fileURLToPath(new URL('../test/golden/v6-hazel-day3.json', import.meta.url)), 'utf8'),
  ) as { save: string };
  data = base64ToBytes(v6.save);
} else {
  const fresh = createWorld('willow', { ...defaultSettings(), mode: 'standard' });
  fresh.time.connected = [0, 1];
  data = serialize(fresh);
}
const world = deserialize(data);
const ctx = createTickCtx(world);
const target = world.tick + DAYS * TICKS_PER_DAY;
while (world.tick < target) advanceTo(world, world.lastTurn + 1, ctx);
console.error(
  `r2-0 ${which}: version ${world.saveVersion}, day ${Math.floor(world.tick / TICKS_PER_DAY)}, ${world.residents.length} residents, turn ${world.lastTurn}`,
);
console.log(JSON.stringify({ data: bytesToBase64(data), to: world.lastTurn, hash: hashState(world) }));
