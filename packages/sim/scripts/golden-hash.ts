// Prints the hash of the golden script replayed in Node. The browser determinism e2e spec
// compares it with the same script replayed in a sim worker.
import { readFileSync } from 'node:fs';
import {
  advanceTo,
  applyTurns,
  createTickCtx,
  createWorld,
  hashState,
  type Turn,
  type ValleySettings,
} from '../src/index';

const file = new URL(`../test/golden/${process.argv[2] ?? 'i0-basic'}.json`, import.meta.url);
const script = JSON.parse(readFileSync(file, 'utf8')) as {
  seed: string;
  settings: ValleySettings;
  lastTurn: number;
  turns: Turn[];
};
const world = createWorld(script.seed, script.settings);
const ctx = createTickCtx(world);
applyTurns(world, script.turns, ctx);
advanceTo(world, script.lastTurn, ctx);
console.log(hashState(world));
