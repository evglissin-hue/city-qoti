// R3H bench (docs/spec/22-quality.md): the levels pass at its day end (23:30) at City scale, with
// specialized buildings that climb and slide (levels/specialized.ts) beside the businesses' own day
// end. The budget is 2 ms a night at City scale, the one 22-quality.md gives the other nightly pass
// ("Trade choice and growth"): the "gaps, supplies, masters, the Town Book" share (1 ms an hour) is
// for hourly passes, and the levels pass runs once a day. The specialized day ends alone are held to
// it (R3H's part); the whole pass, the businesses' day ends included, and a stress mix are reported.
// The scene runs the real system by id through the pipeline, as the sim does. Timing is wall time
// after warm-up, median and worst over many days, as r1.bench and r2.bench do.
import { content } from '@qoti/content';
import { insertBuilding, MAP_SIZE, pipeline, TICKS_PER_DAY, type WorldState } from '@qoti/sim';
import { dailyOffset } from '../../../packages/sim/src/systems/economy/time';
import { specializedDayEnd } from '../../../packages/sim/src/systems/levels/specialized';
import { emptyCounters } from '../../../packages/sim/src/state/zones';
import { flatTown } from './residents';

export const R3H_BUDGET = {
  /** The specialized day ends' median at City scale, in ms (22-quality.md: a nightly pass, 2 ms like trade choice and growth). */
  levelsMs: 2,
};

export interface R3hResult {
  lines: string[];
  failures: string[];
  report: object;
}

const S = MAP_SIZE;
const SAMPLES = 40;
const WARMUP = 10;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}
const ok = (pass: boolean) => (pass ? 'ok' : 'OVER BUDGET');

/** Specialized defs with levels that flatTown's workplaces do not already carry, and how many of each to add. */
const EXTRA = ['fishery', 'granary', 'sawmill', 'brickworks', 'trading-post'];
const EXTRA_EACH = 12;

/** Puts `EXTRA_EACH` of each extra def on the open ground below the last lane, 8 tiles apart. */
function addSpecialized(world: WorldState): void {
  let lastLaneZ = 0;
  for (let z = 0; z < S; z++) if (world.map.road[z * S + 20]) lastLaneZ = z;
  let slot = 0;
  for (const def of EXTRA) {
    for (let k = 0; k < EXTRA_EACH; k++, slot++) {
      const x = 8 + (slot % 28) * 8;
      const z = lastLaneZ + 10 + Math.floor(slot / 28) * 8;
      if (z + 4 >= S) continue;
      insertBuilding(world, null, content.buildingById.get(def)!, x, z, 0, 0, { site: false });
    }
  }
  world.networkVersion += 1;
}

/** Spreads the levels over the buildings and gives each a day's counters that suit its good. */
function setDay(world: WorldState, round: number): number {
  let n = 0;
  for (const b of world.buildings) {
    const levels = content.buildingById.get(b.def)?.levels;
    if (!levels || !b.rt) continue;
    const max = Math.max(
      levels.crew?.length ?? 0,
      levels.reach?.length ?? 0,
      levels.storage?.length ?? 0,
      levels.capacity?.length ?? 0,
    );
    // Levels settle where they are the first rounds; every fifth building has a failing day.
    if (round === 0) b.level = 1 + (n % Math.max(1, max));
    const failing = (n + round) % 5 === 0;
    b.counters = {
      ...(b.counters ?? emptyCounters()),
      madeToday: 10,
      soldToday: failing ? 0 : 9,
      customersToday: failing ? 3 : 12,
      shortToday: false,
    };
    n++;
  }
  return n;
}

/**
 * Keeps `keep` buildings of each def that has levels (the first by id) and drops the rest: a City's
 * mix, a handful of each kind (flatTown's own mix has 71 Windmills, which no town builds).
 */
function trimTo(world: WorldState, keep: number): void {
  const seen = new Map<string, number>();
  world.buildings = world.buildings.filter((b) => {
    if (!content.buildingById.get(b.def)?.levels) return true;
    const n = (seen.get(b.def) ?? 0) + 1;
    seen.set(b.def, n);
    return n <= keep;
  });
  world.networkVersion += 1;
}

/** One timed run of the levels pass over `SAMPLES` days; the median and worst in ms, and the count of buildings with levels. */
function timeLevels(
  town: ReturnType<typeof flatTown>,
  only: boolean,
): { med: number; worst: number; leveled: number } {
  const { world, ctx } = town;
  const system = pipeline.find((s) => s.id === 'levels');
  if (!system) throw new Error('bench: no system levels');
  const samples: number[] = [];
  let leveled = 0;
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    leveled = setDay(world, i === 0 ? 0 : 1 + (i % 7));
    world.tick = (4 + i) * TICKS_PER_DAY + dailyOffset(23, 100);
    const t0 = performance.now();
    if (only) {
      // R3H's own part: the specialized buildings' day ends, without the businesses'.
      for (const b of world.buildings)
        if (!b.trade && b.stage === 'built' && b.rt && content.buildingById.get(b.def)?.levels)
          specializedDayEnd(world, ctx, b);
    } else system.tick(world, ctx);
    const ms = performance.now() - t0;
    ctx.events.length = 0;
    ctx.dirty.clear();
    if (i >= WARMUP) samples.push(ms);
  }
  return { med: median(samples), worst: Math.max(...samples), leveled };
}

/** Per def kept in the City mix. */
const CITY_EACH = 6;

function levelsScene(): R3hResult {
  const town = flatTown('bench-r3h-levels', 24, 400, 500, 5);
  addSpecialized(town.world);
  // The stress mix first (flatTown's 71 of each, and 12 of each extra), then a City's own.
  const stress = timeLevels(town, false);
  trimTo(town.world, CITY_EACH);
  const city = timeLevels(town, false);
  const mine = timeLevels(town, true);
  const pass = mine.med <= R3H_BUDGET.levelsMs;
  return {
    lines: [
      `r3h levels ${town.residents} residents, ${mine.leveled} specialized buildings with levels (${CITY_EACH} of each kind), ` +
        `their day ends alone: ${mine.med.toFixed(3)} ms median, ${mine.worst.toFixed(3)} worst at 23:30 over ${SAMPLES} days ` +
        `(budget ${R3H_BUDGET.levelsMs} ms a night, as trade choice and growth)  ${ok(pass)}`,
      `r3h levels whole pass (the businesses' day ends too): ${city.med.toFixed(3)} ms median, ${city.worst.toFixed(3)} worst; ` +
        `stress mix, ${stress.leveled} specialized buildings (flatTown's mix, 71 Windmills): ${stress.med.toFixed(3)} ms median, ` +
        `${stress.worst.toFixed(3)} worst (reported, no budget)`,
    ],
    failures: pass ? [] : [`r3h levels ${mine.med.toFixed(3)} ms`],
    report: {
      residents: town.residents,
      specialized: mine.leveled,
      medianMs: mine.med,
      worstMs: mine.worst,
      wholePass: { medianMs: city.med, worstMs: city.worst },
      stress: { specialized: stress.leveled, medianMs: stress.med, worstMs: stress.worst },
    },
  };
}

/** The scenes, in the order they run, one sorted line each. */
export const R3H_SCENES: readonly { id: string; label: string; run: () => R3hResult }[] = [
  { id: 'levels', label: 'The levels pass at 23:30, City scale', run: levelsScene },
];

export function r3hBench(): R3hResult {
  const lines: string[] = [];
  const failures: string[] = [];
  const report: Record<string, object> = {};
  for (const scene of R3H_SCENES) {
    const r = scene.run();
    lines.push(...r.lines);
    failures.push(...r.failures);
    report[scene.id] = r.report;
  }
  return { lines, failures, report };
}
