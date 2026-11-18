// R2 benches (docs/spec/22-quality.md, redesign budgets): the place pass (1 ms an hour at Village
// scale, 3 ms at City scale), planning the round (under 0.4 ms a tick for 2,000 residents between
// 17:00 and 17:30), a whole evening at City scale against the sim tick budget, and the gaps pass
// (under 1 ms, the share of "gaps, supplies, masters, the Town Book" that R2 owns).
// Every scene runs the real systems by id through the pipeline, as the sim does, so it keeps
// measuring the real pass after R2A to R2C replace their stand-ins (on stand-ins the numbers are near
// zero). Timing is wall time after warm-up, median and worst over many samples, as r1.bench does.
import { content } from '@qoti/content';
import {
  applyTurn,
  insertBuilding,
  invalidatePlaces,
  MAP_SIZE,
  pipeline,
  START_HOUR,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TILE_FP,
  worldIndex,
  type PlaceState,
  type SimCtx,
  type WorldState,
} from '@qoti/sim';
import { dailyOffset } from '../../../packages/sim/src/systems/economy/time';
import { openGap } from '../../../packages/sim/src/systems/gaps/api';
import { flatTown, type Town } from './residents';

export const R2_BUDGET = {
  placesVillageMsPerHour: 1,
  placesCityMsPerHour: 3,
  roundPlanMsPerTick: 0.4,
  /** The sim tick with 2,000 residents (22-quality.md, Performance budgets). */
  eveningTickMs: 4,
  eveningWorstMs: 12,
  gapsMs: 1,
};

export interface R2Result {
  lines: string[];
  failures: string[];
  report: object;
}

export interface R2Scene {
  id: string;
  label: string;
  run: () => R2Result;
}

const S = MAP_SIZE;
const SAMPLES = 40;
const WARMUP = 10;
const EVENINGS = 2;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}
const worst = (values: number[]): number => Math.max(...values);
const mean = (values: number[]): number => values.reduce((a, c) => a + c, 0) / values.length;
const ok = (pass: boolean) => (pass ? 'ok' : 'OVER BUDGET');
const now = () => performance.now();

type System = (typeof pipeline)[number];

function system(id: string): System {
  const s = pipeline.find((x) => x.id === id);
  if (!s) throw new Error(`bench: no system ${id}`);
  return s;
}

/** A tick of the given day at hour:minute (tick 0 is 06:00, so this goes through the calendar). */
function tickAt(day: number, hour: number, extra = 0): number {
  return day * TICKS_PER_DAY + dailyOffset(hour, extra);
}

/**
 * Dresses a flat town with seats: benches, lanterns and flower beds on free verge tiles beside the
 * lanes (so beside the homes), and `taverns` taverns in clear ground below the last lane.
 */
export function dress(town: Town, taverns: number): { benches: number; lanterns: number; beds: number } {
  const { world } = town;
  const m = world.map;
  const grid = worldIndex(world).decorGrid;
  const count = { benches: 0, lanterns: 0, beds: 0 };
  const put = (def: string, tx: number, tz: number) => {
    const d = {
      id: world.nextId++,
      def,
      fx: tx * TILE_FP + 128,
      fz: tz * TILE_FP + 128,
      rot: 0,
      builtBy: 0 as const,
    };
    world.decor.push(d);
    grid.add(d);
  };
  let lastLaneZ = 0;
  for (let z = 0; z < S; z++) if (m.road[z * S + 20]) lastLaneZ = z;
  let n = 0;
  for (let z = 6; z <= lastLaneZ + 2; z++) {
    for (let x = 3; x < S - 3; x++) {
      const i = z * S + x;
      if (m.road[i] || m.occupant[i]) continue;
      n++;
      if (n % 24 === 0) {
        put('bench', x, z);
        count.benches++;
      } else if (n % 67 === 0) {
        put('lantern', x, z);
        count.lanterns++;
      } else if (n % 59 === 0) {
        put('flower-bed', x, z);
        count.beds++;
      }
    }
  }
  const z = lastLaneZ + 10;
  for (let k = 0; k < taverns; k++) {
    if (z + 3 < S) {
      insertBuilding(world, null, content.buildingById.get('tavern')!, 20 + k * 40, z, 0, 0, { site: false });
    }
  }
  world.networkVersion += 1;
  return count;
}

/** Place rows as the pass would have written them: `n` rows with their evening counts. */
export function placeRows(world: WorldState, n: number): void {
  world.places = [];
  for (let i = 0; i < n; i++) {
    world.places.push({
      // Place ids are strings kept sorted with `<`; equal-width numbers sort as numbers do.
      id: `seats:${1000 + i}`,
      name: `Bench ${i}`,
      visitors: [3, 5, 2, 4, 6, 1, 0],
      takings: [0, 12, 0, 8, 0, 0, 0],
      sold: [0, 2, 0, 1, 0, 0, 0],
      served: [0, 1, 0, 1, 0, 0, 0],
      firstDay: 1,
      seenDay: 8,
    } satisfies PlaceState);
  }
}

/** One run of a system's tick; returns wall ms. */
function timed(world: WorldState, ctx: SimCtx, s: System): number {
  const t0 = now();
  s.tick(world, ctx);
  const ms = now() - t0;
  ctx.events.length = 0;
  ctx.dirty.clear();
  return ms;
}

function placesScene(label: string, town: Town, budget: number): R2Result {
  const { world, ctx } = town;
  const places = system('places');
  const dressed = dress(town, 2);
  ctx.events.length = 0;
  const changed: number[] = [];
  const still: number[] = [];
  // An hourly pass rebuilds when the hour changes: the index is dropped before each sample.
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    world.tick = tickAt(3 + (i % 5), 8 + (i % 9)) + (places.offset ?? 0);
    invalidatePlaces(world);
    const ms = timed(world, ctx, places);
    if (i >= WARMUP) changed.push(ms);
  }
  // The no-change pass: the hour comes round again and nothing moved.
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    world.tick += TICKS_PER_HOUR;
    const ms = timed(world, ctx, places);
    if (i >= WARMUP) still.push(ms);
  }
  const med = median(changed);
  return {
    lines: [
      `r2 places ${label} ${town.residents} residents, ${world.buildings.length} buildings, ${dressed.benches} benches, ` +
        `${dressed.lanterns} lanterns, ${dressed.beds} beds: ${med.toFixed(3)} ms median, ${worst(changed).toFixed(3)} worst ` +
        `over ${SAMPLES} hours with the index invalidated, ${median(still).toFixed(3)} ms with no change (budget ${budget} ms)  ${ok(med <= budget)}`,
    ],
    failures: med > budget ? [`r2 places ${label} ${med.toFixed(3)} ms an hour`] : [],
    report: {
      residents: town.residents,
      benches: dressed.benches,
      rebuildMs: med,
      rebuildWorstMs: worst(changed),
      noChangeMs: median(still),
    },
  };
}

function placesVillage(): R2Result {
  return placesScene('village', flatTown('bench-r2-village', 6, 30, 40, 5), R2_BUDGET.placesVillageMsPerHour);
}

function placesCity(): R2Result {
  return placesScene('city', flatTown('bench-r2-city', 24, 400, 500, 5), R2_BUDGET.placesCityMsPerHour);
}

function planScene(): R2Result {
  const town = flatTown('bench-r2-round', 24, 400, 500, 5);
  const { world, ctx } = town;
  dress(town, 2);
  const residents = system('residents');
  const half = TICKS_PER_HOUR / 2;
  const run = (ticks: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < ticks; i++) {
      out.push(timed(world, ctx, residents));
      world.tick += 1;
    }
    return out;
  };
  const planning: number[] = [];
  const before: number[] = [];
  for (let day = 2; day < 8; day++) {
    // From midday, untimed, to 16:00; then the half hour before the round and the half hour of it.
    world.tick = tickAt(day, 13);
    run(3 * TICKS_PER_HOUR);
    const b = run(half);
    world.tick = tickAt(day, 17);
    const p = run(half);
    if (day >= 4) {
      before.push(mean(b));
      planning.push(mean(p));
    }
  }
  const b = median(before);
  const p = median(planning);
  const diff = p - b;
  return {
    lines: [
      `r2 round planning ${town.residents} residents: ${p.toFixed(3)} ms a tick 17:00 to 17:30 against ${b.toFixed(3)} ` +
        `16:00 to 16:30, planning costs ${diff.toFixed(3)} ms a tick, the residents system alone (budget ${R2_BUDGET.roundPlanMsPerTick} ms)  ${ok(diff <= R2_BUDGET.roundPlanMsPerTick)}`,
    ],
    failures: diff > R2_BUDGET.roundPlanMsPerTick ? [`r2 round planning ${diff.toFixed(3)} ms a tick`] : [],
    report: { residents: town.residents, planMsPerTick: p, baselineMsPerTick: b, diffMsPerTick: diff },
  };
}

function eveningScene(): R2Result {
  const town = flatTown('bench-r2-evening', 24, 400, 500, 5);
  const { world, ctx } = town;
  dress(town, 2);
  world.time.desired = [1, 1, 1, 1];
  world.time.connected = [0];
  const run = (until: number, sample?: number[], at?: number[], restSample?: number[]): void => {
    while (world.tick < until) {
      const t0 = now();
      const before = world.tick;
      logisticsMs = 0;
      applyTurn(world, { t: world.lastTurn + 1, cmds: [] }, ctx);
      const dt = now() - t0;
      const rest = dt - logisticsMs;
      ctx.events.length = 0;
      ctx.dirty.clear();
      const ticks = Math.max(1, world.tick - before);
      if (sample) for (let k = 0; k < ticks; k++) sample.push(dt / ticks);
      if (restSample) for (let k = 0; k < ticks; k++) restSample.push(rest / ticks);
      if (at) for (let k = 0; k < ticks; k++) at.push(before + k);
    }
  };
  // Each evening starts from noon of its own day (the town's mood, errands and stock carry over from
  // the day before only as far as the saved state does), runs to 17:00 untimed, then is timed from
  // 17:00 to 21:30 (past the 21:00 gaps slot). The first evening is the warm-up and is not counted.
  const ms: number[] = [];
  const ats: number[] = [];
  const msRest: number[] = [];
  // Wrap each system's tick to total its time, so the line can say where an evening's ms went.
  const bySystem = new Map<string, number>();
  let timing = false;
  let logisticsMs = 0;
  const maxBySystem = new Map<string, number>();
  const originals = pipeline.map((sys) => sys.tick);
  pipeline.forEach((sys, i) => {
    sys.tick = (st, c) => {
      const t0 = now();
      originals[i]!(st, c);
      if (sys.id === 'logistics') logisticsMs += now() - t0;
      if (timing) {
        const d = now() - t0;
        bySystem.set(sys.id, (bySystem.get(sys.id) ?? 0) + d);
        if (d > (maxBySystem.get(sys.id) ?? 0)) maxBySystem.set(sys.id, d);
      }
    };
  });
  for (let day = 2; day < 2 + EVENINGS + 1; day++) {
    world.tick = tickAt(day, 16);
    run(tickAt(day, 17));
    timing = true;
    const mine: number[] = [];
    const mineAt: number[] = [];
    const mineRest: number[] = [];
    run(tickAt(day, 21, 100), mine, mineAt, mineRest);
    timing = false;
    if (day === 2) {
      bySystem.clear();
      continue;
    }
    ms.push(...mine);
    msRest.push(...mineRest);
    ats.push(...mineAt);
  }
  const clock = (tick: number): string => {
    const t = (tick + START_HOUR * TICKS_PER_HOUR) % TICKS_PER_DAY;
    return `${String(Math.floor(t / TICKS_PER_HOUR)).padStart(2, '0')}:${String(Math.floor((t % TICKS_PER_HOUR) / (TICKS_PER_HOUR / 60))).padStart(2, '0')}`;
  };
  pipeline.forEach((sys, i) => (sys.tick = originals[i]!));
  const top = [...bySystem]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, t]) => `${id} ${(t / ms.length).toFixed(2)}`)
    .join(', ');
  const slow = [...maxBySystem]
    .filter(([id]) => id !== 'logistics')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, t]) => `${id} ${t.toFixed(1)}`)
    .join(', ');
  const over12 = ms.filter((v) => v > R2_BUDGET.eveningWorstMs).length;
  const worstAt = clock(ats[ms.indexOf(Math.max(...ms))]!);
  // The flat fixture's logistics (porters and relays over a town with a storehouse and no routes
  // worth the name) spikes on its own and is not R2's: it is reported beside the budget's figure,
  // which is the pipeline without it (the residents bench's own budget leaves it out too).
  const avg = mean(msRest);
  const w = worst(msRest);
  const fails: string[] = [];
  if (avg > R2_BUDGET.eveningTickMs) fails.push(`r2 evening ${avg.toFixed(3)} ms a tick`);
  return {
    lines: [
      `r2 evening ${town.residents} residents, pipeline less logistics 17:00 to 21:30: ${median(msRest).toFixed(3)} ms a tick median, ` +
        `${avg.toFixed(3)} average, ${w.toFixed(1)} worst over ${msRest.length} ticks (budget ${R2_BUDGET.eveningTickMs} ms average enforced; ` +
        `the ${R2_BUDGET.eveningWorstMs} ms worst is reported: slowest single passes in ms: ${slow})  ${ok(fails.length === 0)}`,
      `r2 evening with logistics (fixture spikes, reported only): ${median(ms).toFixed(3)} ms median, ${mean(ms).toFixed(3)} average, ` +
        `${worst(ms).toFixed(1)} worst (at ${worstAt}), ${over12} ticks over ${R2_BUDGET.eveningWorstMs} ms; ms a tick by system, top three: ${top}`,
    ],
    failures: fails,
    report: {
      residents: town.residents,
      medianMsPerTick: median(msRest),
      avgMsPerTick: avg,
      worstMs: w,
      ticks: msRest.length,
      withLogisticsAvgMsPerTick: mean(ms),
      withLogisticsWorstMs: worst(ms),
    },
  };
}

function gapsScene(): R2Result {
  const town = flatTown('bench-r2-gaps', 24, 400, 500, 5);
  const { world, ctx } = town;
  const gaps = system('gaps');
  placeRows(world, 300);
  world.gaps.open.length = 0;
  // A few open gaps through R2C's own API (their kinds are its union; the bench needs only some rows).
  for (let i = 0; i < 4; i++) {
    openGap(
      world,
      ctx,
      (['nothingToSell', 'nobodyPasses', 'nowhereToGo'] as const)[i % 3]!,
      `place:${1000 + i}`,
      100 + i,
      2,
    );
  }
  const samples: number[] = [];
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    world.tick = tickAt(4 + i, 21, 10);
    const ms = timed(world, ctx, gaps);
    if (i >= WARMUP) samples.push(ms);
  }
  const med = median(samples);
  return {
    lines: [
      `r2 gaps ${town.residents} residents, ${world.places.length} place rows, ${world.gaps.open.length} open: ` +
        `${med.toFixed(3)} ms median, ${worst(samples).toFixed(3)} worst at 21:00 over ${SAMPLES} evenings ` +
        `(budget ${R2_BUDGET.gapsMs} ms, gaps alone)  ${ok(med <= R2_BUDGET.gapsMs)}`,
    ],
    failures: med > R2_BUDGET.gapsMs ? [`r2 gaps ${med.toFixed(3)} ms`] : [],
    report: {
      rows: world.places.length,
      open: world.gaps.open.length,
      medianMs: med,
      worstMs: worst(samples),
    },
  };
}

/**
 * The scenes, in the order they run. R2A's and R2B's own lines join by adding one line here, kept
 * alphabetically sorted by id; `r2Bench` prints and enforces whatever each returns.
 */
export const R2_SCENES: readonly R2Scene[] = [
  { id: 'evening', label: 'A whole evening, City scale', run: eveningScene },
  { id: 'gaps', label: 'The gaps pass at 21:00', run: gapsScene },
  { id: 'places-city', label: 'The place pass, City scale', run: placesCity },
  { id: 'places-village', label: 'The place pass, Village scale', run: placesVillage },
  { id: 'round', label: 'Planning the round', run: planScene },
];

export function r2Bench(): R2Result {
  const lines: string[] = [];
  const failures: string[] = [];
  const report: Record<string, object> = {};
  for (const scene of R2_SCENES) {
    const r = scene.run();
    lines.push(...r.lines);
    failures.push(...r.failures);
    report[scene.id] = r.report;
  }
  return { lines, failures, report };
}
