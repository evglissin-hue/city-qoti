// npm run bench: headless simulation benchmarks. Exits non-zero when a sim or worldgen budget
// (docs/spec/22-quality.md) is exceeded, and writes bench-report.json for CI.
import {
  advanceTo,
  applyTurn,
  applyTurns,
  createTickCtx,
  createWorld,
  defaultSettings,
  deserialize,
  generateValley,
  hashState,
  serialize,
  SIM_VERSION,
  type Turn,
  type ValleySettings,
  type WorldState,
} from '@qoti/sim';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { residentsBench } from './residents';
import { hearthBench } from './hearth';
import { benchEconomy } from './economy';
import { growthBench } from './growth';
import { benchMarket } from './market';
import { syntheticValley } from './synthetic';
import { villageBench } from './village.bench';

const BUDGET = {
  worldgenMs: 300,
  tickMs: 1,
  // Reported against the spec, not enforced here (City scale budgets).
  serializeMs: 150,
  hashMs: 30,
  catchUpMs: 1500,
  snapshotBytes: 2 * 1024 * 1024,
};
const TICKS = 10_000;

interface GoldenScript {
  seed: string;
  settings: ValleySettings;
  lastTurn: number;
  turns: Turn[];
}

function time<T>(fn: () => T): [T, number] {
  const start = performance.now();
  const result = fn();
  return [result, performance.now() - start];
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** Empty turns at the world's current speed until `ticks` more ticks have run. Returns ticks run. */
function tickFor(world: WorldState, ticks: number): number {
  const ctx = createTickCtx(world);
  const start = world.tick;
  let guard = 0;
  while (world.tick - start < ticks && guard++ < ticks * 4) {
    applyTurn(world, { t: world.lastTurn + 1, cmds: [] }, ctx);
    ctx.events.length = 0;
    ctx.dirty.clear();
  }
  return world.tick - start;
}

const root = fileURLToPath(new URL('../../..', import.meta.url));
const golden = JSON.parse(
  readFileSync(`${root}packages/sim/test/golden/i0-basic.json`, 'utf8'),
) as GoldenScript;
const failures: string[] = [];
const lines: string[] = [];
const ok = (pass: boolean) => (pass ? 'ok' : 'OVER BUDGET');

// 1. Worldgen: two warm-up runs, then ten seeds.
for (const seed of ['warm-a', 'warm-b']) generateValley(seed, defaultSettings());
const worldgenRuns = Array.from(
  { length: 10 },
  (_, i) => time(() => generateValley(`bench-${i}`, defaultSettings()))[1],
);
const worldgen = { medianMs: median(worldgenRuns), maxMs: Math.max(...worldgenRuns) };
if (worldgen.maxMs > BUDGET.worldgenMs) failures.push(`worldgen max ${worldgen.maxMs.toFixed(1)} ms`);
lines.push(
  `worldgen        median ${worldgen.medianMs.toFixed(1)} ms, max ${worldgen.maxMs.toFixed(1)} ms ` +
    `(budget ${BUDGET.worldgenMs} ms)  ${ok(worldgen.maxMs <= BUDGET.worldgenMs)}`,
);

// 2. The golden script: replay its turns, then keep going at 3x until 10,000 ticks have run.
const [goldenRun, goldenMs] = time(() => {
  const world = createWorld(golden.seed, golden.settings);
  const ctx = createTickCtx(world);
  applyTurns(world, golden.turns, ctx);
  advanceTo(world, golden.lastTurn, ctx);
  world.time.desired = [3, 3, 3, 3];
  if (world.time.connected.length === 0) world.time.connected = [0];
  const ticks = world.tick + tickFor(world, Math.max(0, TICKS - world.tick));
  return { world, ticks };
});
const goldenTick = goldenMs / goldenRun.ticks;
if (goldenTick > BUDGET.tickMs) failures.push(`golden tick ${goldenTick.toFixed(4)} ms`);
lines.push(
  `golden script   ${goldenRun.ticks} ticks in ${goldenMs.toFixed(0)} ms: ${goldenTick.toFixed(4)} ms/tick ` +
    `(budget ${BUDGET.tickMs} ms)  ${ok(goldenTick <= BUDGET.tickMs)}`,
);

// 3. The synthetic I0 valley: 1,000 buildings and 6,000 decor, ticking at 3x.
const [synthetic, setupMs] = time(() => syntheticValley('bench-valley'));
synthetic.world.time.desired = [3, 3, 3, 3];
const [syntheticTicks, syntheticMs] = time(() => tickFor(synthetic.world, TICKS));
const syntheticTick = syntheticMs / syntheticTicks;
if (syntheticTick > BUDGET.tickMs) failures.push(`synthetic tick ${syntheticTick.toFixed(4)} ms`);
lines.push(
  `synthetic       ${synthetic.buildings} buildings, ${synthetic.decor} decor (built in ${setupMs.toFixed(0)} ms): ` +
    `${syntheticTick.toFixed(4)} ms/tick (budget ${BUDGET.tickMs} ms)  ${ok(syntheticTick <= BUDGET.tickMs)}`,
);

// 4. Snapshot size, serialize, deserialize and hash on the synthetic valley.
serialize(synthetic.world);
const [bytes, serializeMs] = time(() => serialize(synthetic.world));
const [, deserializeMs] = time(() => deserialize(bytes));
hashState(synthetic.world);
const [, hashMs] = time(() => hashState(synthetic.world));
lines.push(
  `snapshot        ${(bytes.length / 1024).toFixed(0)} KB gzipped, serialize ${serializeMs.toFixed(1)} ms, ` +
    `deserialize ${deserializeMs.toFixed(1)} ms, hash ${hashMs.toFixed(1)} ms ` +
    `(budgets ${BUDGET.snapshotBytes / 1024 / 1024} MB, ${BUDGET.serializeMs} ms, ${BUDGET.hashMs} ms at City scale)`,
);

// 5. Catch-up: 300 stored-gap turns at 3x from a snapshot, as a joining seat would replay them.
const joining = deserialize(bytes);
joining.time.desired = [3, 3, 3, 3];
const [, catchUpMs] = time(() => advanceTo(joining, joining.lastTurn + 300, createTickCtx(joining)));
lines.push(`catch-up        300 turns at 3x in ${catchUpMs.toFixed(1)} ms (budget ${BUDGET.catchUpMs} ms)`);

// 6. Residents (C3A): the 40-resident hamlet and the synthetic 2,000-resident town.
const residents = residentsBench(lines, failures);
// 6. Hearth (C3B): charm per dirty chunk and the Pattern Book pass.
const hearth = hearthBench();
lines.push(...hearth.lines);
failures.push(...hearth.failures);
// 6. The I1 economy: the 40-resident hamlet against its budget, the standard start's first days.
const economy = benchEconomy();
lines.push(...economy.lines);
failures.push(...economy.failures);
// 7. Growth and traffic (C4B): zoning, the nightly growth pass and carts, at 150 and 2,000 residents.
const growth = growthBench(lines, failures);
// 8. Market and money (C4A): the daily passes of a 150-resident village.
const market = benchMarket();
lines.push(...market.lines);
failures.push(...market.failures);
// 9. Village chains (C4C): the village fixture with every chain, services, tiers and a cart.
const village = villageBench();
lines.push(...village.lines);
failures.push(...village.failures);

const heapMb = process.memoryUsage().heapUsed / 1024 / 1024;
lines.push(`memory          ${heapMb.toFixed(0)} MB heap in use`);

console.log(`City Qoti bench (simVersion ${SIM_VERSION}, node ${process.version})`);
for (const line of lines) console.log(`  ${line}`);

const report = {
  simVersion: SIM_VERSION,
  node: process.version,
  budgets: BUDGET,
  worldgen,
  golden: { ticks: goldenRun.ticks, totalMs: goldenMs, msPerTick: goldenTick },
  synthetic: {
    buildings: synthetic.buildings,
    decor: synthetic.decor,
    setupMs,
    ticks: syntheticTicks,
    msPerTick: syntheticTick,
  },
  snapshot: { bytes: bytes.length, serializeMs, deserializeMs, hashMs },
  catchUpMs,
  residents,
  hearth: hearth.report,
  economy: economy.report,
  growth,
  market: market.report,
  village: village.report,
  heapMb,
  failures,
};
writeFileSync(`${root}bench-report.json`, JSON.stringify(report, null, 2) + '\n');

if (failures.length > 0) {
  console.error(`Over budget: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('All sim and worldgen budgets met.');
