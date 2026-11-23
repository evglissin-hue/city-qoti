// R3D bench: Follow the thread's counts at City scale (docs/spec/22-quality.md: the counts stay inside
// the shared budget). On the flat 2,000-resident town, the busiest hour of writes (every household
// buying at the 18:00 basket pass, 6 goods each, and the porters' deliveries) into a table already full
// to the bound, the midnight halving over that table, and the Thread itself, the worker request an
// inspector makes (not the tick, but it must not stall one). Writes are spread over the town's doors
// by a fixed sequence, so the table is the same run to run. Wall time after warm-up, median and worst.
import { content } from '@qoti/content';
import { threadView, type WorldState } from '@qoti/sim';
import { recordThread } from '../../../packages/sim/src/systems/threads/api';
import { decayThreads } from '../../../packages/sim/src/systems/threads/index';
import { flatTown } from './residents';

export const R3D_BUDGET = {
  /**
   * The busiest hour's writes (the 18:00 baskets and the hour's deliveries), against the R3 systems'
   * shared line (22-quality.md: under 1 ms an hour); an ordinary hour writes a fraction of this.
   */
  writesMsPerHour: 1,
  /** The midnight halving over a table full to the bound. */
  decayMs: 0.5,
  /** One Thread, as an inspector asks for it. */
  threadMs: 4,
};

export interface R3dResult {
  lines: string[];
  failures: string[];
  report: object;
}

const SAMPLES = 20;
const WARMUP = 5;
const GOODS = 12;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}
const ok = (pass: boolean): string => (pass ? 'ok' : 'OVER');

/** A fixed sequence (no dice in a bench either: the table is the same every run). */
function sequence(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x;
  };
}

interface Doors {
  makers: number[];
  stores: number[];
  outlets: number[];
  homes: number[];
}

function doorsOf(world: WorldState): Doors {
  const homes = world.households.map((h) => h.homeId);
  const homeSet = new Set(homes);
  const works = world.buildings.map((b) => b.id).filter((id) => !homeSet.has(id));
  return {
    makers: works.slice(0, 120),
    stores: works.slice(120, 140),
    outlets: works.slice(140, 200),
    homes,
  };
}

/** One busy hour: deliveries maker to store to outlet, and every household's basket at an outlet. */
function busyHour(world: WorldState, d: Doors, next: () => number): number {
  let writes = 0;
  for (let i = 0; i < 200; i++) {
    const g = next() % GOODS;
    const store = d.stores[next() % d.stores.length]!;
    recordThread(world, d.makers[next() % d.makers.length]!, store, g, 4 + (next() % 8));
    recordThread(world, store, d.outlets[next() % d.outlets.length]!, g, 4 + (next() % 8));
    writes += 2;
  }
  for (const home of d.homes) {
    const outlet = d.outlets[home % d.outlets.length]!;
    for (let k = 0; k < 6; k++) {
      recordThread(world, outlet, home, (home + k) % GOODS, 1 + (next() % 3));
      writes++;
    }
  }
  return writes;
}

export function r3dBench(): R3dResult {
  const lines: string[] = [];
  const failures: string[] = [];
  const town = flatTown('bench-r3d', 24, 400, 700, 5);
  const world = town.world;
  const d = doorsOf(world);
  const next = sequence(7);
  // Fill the table: a few busy days, halved each night, so it stands full at the bound.
  for (let day = 0; day < 4; day++) {
    busyHour(world, d, next);
    busyHour(world, d, next);
    decayThreads(world);
  }
  busyHour(world, d, next);

  const writesMs: number[] = [];
  let writes = 0;
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const t0 = performance.now();
    writes = busyHour(world, d, next);
    const ms = performance.now() - t0;
    if (i >= WARMUP) writesMs.push(ms);
  }
  const pairs = world.threads.pairs.length;

  const decayMs: number[] = [];
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const copy = world.threads.pairs.map((p) => ({ ...p }));
    const t0 = performance.now();
    decayThreads(world);
    const ms = performance.now() - t0;
    world.threads.pairs = copy;
    if (i >= WARMUP) decayMs.push(ms);
  }

  const subjects = [
    ...d.outlets.slice(0, 10).map((id) => ({ kind: 'building', id }) as const),
    ...d.stores.slice(0, 5).map((id) => ({ kind: 'building', id }) as const),
    ...d.homes.slice(0, 10).map((id) => ({ kind: 'building', id }) as const),
    ...world.residents.slice(0, 10).map((r) => ({ kind: 'resident', id: r.id }) as const),
    ...content.goods.slice(0, GOODS).map((g) => ({ kind: 'good', good: g.id }) as const),
  ];
  const threadMs: number[] = [];
  for (let i = 0; i < 2; i++) {
    for (const s of subjects) {
      const t0 = performance.now();
      threadView(world, s);
      const ms = performance.now() - t0;
      if (i > 0) threadMs.push(ms);
    }
  }

  const w = median(writesMs);
  const dm = median(decayMs);
  const tm = median(threadMs);
  const tw = Math.max(...threadMs);
  lines.push(
    `r3d threads    ${town.residents} residents, ${pairs} door pairs: ${writes} writes in the busiest hour ` +
      `${w.toFixed(3)} ms (budget ${R3D_BUDGET.writesMsPerHour} ms)  ${ok(w <= R3D_BUDGET.writesMsPerHour)}; ` +
      `midnight halving ${dm.toFixed(3)} ms (budget ${R3D_BUDGET.decayMs} ms)  ${ok(dm <= R3D_BUDGET.decayMs)}; ` +
      `a Thread ${tm.toFixed(3)} ms, ${tw.toFixed(1)} worst (budget ${R3D_BUDGET.threadMs} ms)  ${ok(tm <= R3D_BUDGET.threadMs)}`,
  );
  if (w > R3D_BUDGET.writesMsPerHour) failures.push(`r3d thread writes ${w.toFixed(3)} ms an hour`);
  if (dm > R3D_BUDGET.decayMs) failures.push(`r3d thread halving ${dm.toFixed(3)} ms`);
  if (tm > R3D_BUDGET.threadMs) failures.push(`r3d a Thread ${tm.toFixed(3)} ms`);
  return {
    lines,
    failures,
    report: {
      residents: town.residents,
      pairs,
      writes,
      writesMs: w,
      decayMs: dm,
      threadMs: tm,
      threadWorstMs: tw,
    },
  };
}
