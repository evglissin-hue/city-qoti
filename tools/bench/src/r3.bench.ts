// R3 benches (docs/spec/22-quality.md, R3 budget row): the 17:30 settling and the lamplighter's walk,
// the masters' day, the Town Book's evening close, the thread counts, the specialized buildings'
// day, and the together line (gaps, supplies, masters and the Town Book under 1 ms an hour).
// Every scene runs the real systems by id through the pipeline (or the real API function the system
// calls), as the sim does, so it keeps measuring the real pass after R3A to R3D and R3H replace
// their stand-ins; on stand-ins the numbers are near zero. Wall time after warm-up, median and worst
// over many samples (timings swing by half in the container, so medians).
//
// How R3A to R3D's and R3H's own lines join: add one `{ id, label, run }` to `R3_SCENES` below,
// kept sorted by id; `r3Bench` prints one line a scene and enforces whatever the scene's failures
// say. A scene returns `{ lines, failures, report }` and keeps its own budget in `R3_BUDGET`.
import {
  type Building,
  type Resident,
  insertBuilding,
  pipeline,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type SimCtx,
  type WorldState,
} from '@qoti/sim';
import { content } from '@qoti/content';
import { dailyOffset } from '../../../packages/sim/src/systems/economy/time';
import { openGap } from '../../../packages/sim/src/systems/gaps/api';
import { scheduleOverride } from '../../../packages/sim/src/systems/residents/overrides';
import { specializedDayEnd } from '../../../packages/sim/src/systems/levels/specialized';
import { recordThread } from '../../../packages/sim/src/systems/threads/api';
import { dress, placeRows } from './r2.bench';
import { flatTown, type Town } from './residents';

export const R3_BUDGET = {
  /** The settling at 17:30 and the 18:00 run, together. */
  settlingMs: 1,
  /** The walk's override calls for every resident at 17 and 18: spread over the half hour's replans, never one pass. */
  walkMs: 2,
  mastersMs: 1,
  bookCloseMs: 1,
  /** Midnight's halving, and a whole day's `recordThread` calls together. */
  threadsMidnightMs: 1,
  threadsRecordMs: 1,
  specializedMs: 0.5,
  /** Gaps, supplies, masters and the Town Book together, per hour (22-quality.md). */
  togetherMsPerHour: 1,
};

export interface R3Result {
  lines: string[];
  failures: string[];
  report: object;
}

export interface R3Scene {
  id: string;
  label: string;
  run: () => R3Result;
}

const SAMPLES = 30;
const WARMUP = 8;
/** A City day's deliveries and purchases recorded as threads: about two a resident. */
const THREAD_CALLS_PER_RESIDENT = 2;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}
const worst = (values: number[]): number => Math.max(...values);
const ok = (pass: boolean) => (pass ? 'ok' : 'OVER BUDGET');
const now = () => performance.now();

type System = (typeof pipeline)[number];

function system(id: string): System {
  const s = pipeline.find((x) => x.id === id);
  if (!s) throw new Error(`bench: no system ${id}`);
  return s;
}

/** A tick of the given day at hour:minute-in-ticks (tick 0 is 06:00, so this goes through the calendar). */
const tickAt = (day: number, hour: number, extra = 0): number =>
  day * TICKS_PER_DAY + dailyOffset(hour, extra);

/** One run of a system's tick at the given tick; returns wall ms. */
function timed(world: WorldState, ctx: SimCtx, s: System, tick: number): number {
  world.tick = tick;
  const t0 = now();
  s.tick(world, ctx);
  const ms = now() - t0;
  ctx.events.length = 0;
  ctx.dirty.clear();
  return ms;
}

/** A system's samples at the tick of its own slot on successive days. */
function samplesOf(world: WorldState, ctx: SimCtx, id: string): number[] {
  const s = system(id);
  const out: number[] = [];
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const ms = timed(world, ctx, s, (4 + i) * TICKS_PER_DAY + (s.offset ?? 0));
    if (i >= WARMUP) out.push(ms);
  }
  return out;
}

/** A dressed flat town at a scale: Village (the R2 bench's) or City. */
function town(name: string, scale: 'village' | 'city'): Town {
  const t =
    scale === 'village'
      ? flatTown(`bench-r3-${name}`, 6, 30, 40, 5)
      : flatTown(`bench-r3-${name}`, 24, 400, 500, 5);
  t.world.charter.rank = scale;
  dress(t, 2);
  t.ctx.events.length = 0;
  return t;
}

/** Specialized buildings the town has with levels in their def (none until R3H adds `levels`). */
function specializedWithLevels(world: WorldState): Building[] {
  return world.buildings.filter(
    (b) => !b.trade && b.stage === 'built' && b.rt && content.buildingById.get(b.def)?.levels,
  );
}

function settlingScene(): R3Result {
  const t = town('settling', 'city');
  const { world, ctx } = t;
  const supplies = system('supplies');
  const settle: number[] = [];
  const lit: number[] = [];
  const walk: number[] = [];
  const residents: readonly Resident[] = world.residents;
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const day = 4 + i;
    // 17:30 settles; 18:00 is the next run of the system, with the lamps coming on.
    const a = timed(world, ctx, supplies, tickAt(day, 17, TICKS_PER_HOUR / 2));
    const b = timed(world, ctx, supplies, tickAt(day, 18));
    // The walk: every resident asks the schedule overrides what to do at 17 and at 18 (each override,
    // the lamplighter's among them, costs every resident a call).
    world.tick = tickAt(day, 17, TICKS_PER_HOUR / 2);
    const t0 = now();
    for (const r of residents) {
      scheduleOverride(world, r, 17);
      scheduleOverride(world, r, 18);
    }
    const w = now() - t0;
    if (i >= WARMUP) {
      settle.push(a);
      lit.push(b);
      walk.push(w);
    }
  }
  const pass = median(settle) + median(lit);
  const w = median(walk);
  const fails: string[] = [];
  if (pass > R3_BUDGET.settlingMs) fails.push(`r3 settling ${pass.toFixed(3)} ms`);
  if (w > R3_BUDGET.walkMs) fails.push(`r3 settling walk ${w.toFixed(3)} ms`);
  return {
    lines: [
      `r3 settling city ${t.residents} residents, ${world.decor.length} decor, ${world.supplies.lamps.length} lamps: ` +
        `17:30 settling ${median(settle).toFixed(3)} ms median (${worst(settle).toFixed(2)} worst) and 18:00 ${median(lit).toFixed(3)}, ` +
        `${pass.toFixed(3)} together (budget ${R3_BUDGET.settlingMs} ms); the walk's override calls for every resident at 17 and 18 ` +
        `${w.toFixed(3)} ms (budget ${R3_BUDGET.walkMs} ms)  ${ok(fails.length === 0)}`,
    ],
    failures: fails,
    report: {
      residents: t.residents,
      settleMs: median(settle),
      settleWorstMs: worst(settle),
      litMs: median(lit),
      walkOverridesMs: w,
    },
  };
}

function mastersScene(): R3Result {
  const t = town('masters', 'city');
  const samples = samplesOf(t.world, t.ctx, 'masters');
  const med = median(samples);
  const budget = R3_BUDGET.mastersMs;
  return {
    lines: [
      `r3 masters day city ${t.residents} residents, ${t.world.buildings.length} buildings: ${med.toFixed(3)} ms median, ` +
        `${worst(samples).toFixed(3)} worst at 23:45 over ${SAMPLES} days (budget ${budget} ms)  ${ok(med <= budget)}`,
    ],
    failures: med > budget ? [`r3 masters day ${med.toFixed(3)} ms`] : [],
    report: { residents: t.residents, medianMs: med, worstMs: worst(samples) },
  };
}

function bookCloseScene(): R3Result {
  const t = town('book', 'city');
  const { world, ctx } = t;
  // Rows the close counts: places with an evening's visitors and sales.
  placeRows(world, 300);
  const samples = samplesOf(world, ctx, 'townbook');
  const med = median(samples);
  const budget = R3_BUDGET.bookCloseMs;
  return {
    lines: [
      `r3 town book close city ${t.residents} residents, ${world.places.length} place rows: ${med.toFixed(3)} ms median, ` +
        `${worst(samples).toFixed(3)} worst at 21:20 over ${SAMPLES} evenings (budget ${budget} ms)  ${ok(med <= budget)}`,
    ],
    failures: med > budget ? [`r3 town book close ${med.toFixed(3)} ms`] : [],
    report: { rows: world.places.length, medianMs: med, worstMs: worst(samples) },
  };
}

/** Sorted pairs as R3D keeps them: each door sends a few goods to a few doors, sorted by from, to, good. */
function fillThreads(world: WorldState, doors: number): number {
  const ids = world.buildings.slice(0, doors).map((b) => b.id);
  const pairs: WorldState['threads']['pairs'] = [];
  for (const from of ids)
    for (let k = 1; k <= 3; k++) {
      const to = ids[(ids.indexOf(from) + k * 7) % ids.length]!;
      for (let good = 0; good < 2; good++) pairs.push({ from, to, good, units: 6 + k + good });
    }
  pairs.sort((a, b) => a.from - b.from || a.to - b.to || a.good - b.good);
  world.threads.pairs = pairs;
  return pairs.length;
}

function threadsScene(): R3Result {
  const t = town('threads', 'city');
  const { world, ctx } = t;
  const threads = system('threads');
  const rows = fillThreads(world, 400);
  const calls = t.residents * THREAD_CALLS_PER_RESIDENT;
  const doors = world.buildings.slice(0, 400).map((b) => b.id);
  const midnight: number[] = [];
  const record: number[] = [];
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const day = 4 + i;
    // A day's deliveries and purchases, recorded as the write points do (market purchase, logistics deliver).
    world.tick = tickAt(day, 12);
    const t0 = now();
    for (let n = 0; n < calls; n++)
      recordThread(world, doors[n % doors.length]!, doors[(n * 7 + 1) % doors.length]!, n % 4, 1 + (n % 3));
    const r = now() - t0;
    const m = timed(world, ctx, threads, day * TICKS_PER_DAY + (threads.offset ?? 0));
    if (i >= WARMUP) {
      record.push(r);
      midnight.push(m);
    }
  }
  const mid = median(midnight);
  const rec = median(record);
  const fails: string[] = [];
  if (mid > R3_BUDGET.threadsMidnightMs) fails.push(`r3 threads midnight ${mid.toFixed(3)} ms`);
  if (rec > R3_BUDGET.threadsRecordMs) fails.push(`r3 threads record ${rec.toFixed(3)} ms`);
  return {
    lines: [
      `r3 threads city ${t.residents} residents, ${rows} pairs to start: midnight halving ${mid.toFixed(3)} ms median ` +
        `(${worst(midnight).toFixed(3)} worst, budget ${R3_BUDGET.threadsMidnightMs} ms); recordThread over a day's ${calls} deliveries ` +
        `${rec.toFixed(3)} ms (budget ${R3_BUDGET.threadsRecordMs} ms)  ${ok(fails.length === 0)}`,
    ],
    failures: fails,
    report: { pairs: rows, calls, midnightMs: mid, midnightWorstMs: worst(midnight), recordMs: rec },
  };
}

function specializedScene(): R3Result {
  const t = town('specialized', 'city');
  const { world, ctx } = t;
  // Specialized buildings in the town (windmills, quarries): R3H gives their defs `levels`.
  const defs = ['windmill', 'quarry', 'foresters-lodge', 'storehouse'];
  for (let k = 0; k < 40; k++) {
    const def = content.buildingById.get(defs[k % defs.length]!)!;
    const b = insertBuilding(world, null, def, 6 + (k % 20) * 12, 4 + Math.floor(k / 20) * 3, 0, 0, {
      site: false,
    });
    void b;
  }
  const levels = system('levels');
  const eligible = specializedWithLevels(world);
  const pass: number[] = [];
  const own: number[] = [];
  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const day = 4 + i;
    const ms = timed(world, ctx, levels, day * TICKS_PER_DAY + (levels.offset ?? 0));
    world.tick = day * TICKS_PER_DAY + (levels.offset ?? 0);
    const t0 = now();
    for (const b of eligible) specializedDayEnd(world, ctx, b);
    const d = now() - t0;
    ctx.events.length = 0;
    if (i >= WARMUP) {
      pass.push(ms);
      own.push(d);
    }
  }
  const med = median(own);
  const budget = R3_BUDGET.specializedMs;
  return {
    lines: [
      `r3 specialized day city ${t.residents} residents, ${eligible.length} specialized buildings with levels: ` +
        `specializedDayEnd ${med.toFixed(3)} ms median (budget ${budget} ms); the whole levels pass at 23:30 ` +
        `${median(pass).toFixed(3)} ms median, ${worst(pass).toFixed(2)} worst, reported only  ${ok(med <= budget)}`,
    ],
    failures: med > budget ? [`r3 specialized day ${med.toFixed(3)} ms`] : [],
    report: {
      eligible: eligible.length,
      dayEndMs: med,
      levelsPassMs: median(pass),
      levelsPassWorstMs: worst(pass),
    },
  };
}

/** The ids of the systems the together line sums (22-quality.md: gaps, supplies, masters, the Town Book). */
const TOGETHER = ['gaps', 'masters', 'supplies', 'townbook'] as const;

/** One whole day of the four systems, each run at every tick it is due: wall ms by system. */
function togetherDay(world: WorldState, ctx: SimCtx, day: number): Record<(typeof TOGETHER)[number], number> {
  const out = { gaps: 0, masters: 0, supplies: 0, townbook: 0 };
  const start = day * TICKS_PER_DAY;
  for (const id of TOGETHER) {
    const s = system(id);
    const every = s.every ?? 1;
    const offset = s.offset ?? 0;
    for (let t = start; t < start + TICKS_PER_DAY; t++) {
      if (t % every !== offset) continue;
      out[id] += timed(world, ctx, s, t);
    }
  }
  return out;
}

function togetherScene(): R3Result {
  const lines: string[] = [];
  const failures: string[] = [];
  const report: Record<string, object> = {};
  for (const scale of ['village', 'city'] as const) {
    const t = town(`together-${scale}`, scale);
    const { world, ctx } = t;
    placeRows(world, scale === 'city' ? 300 : 20);
    world.gaps.open.length = 0;
    for (let i = 0; i < 4; i++)
      openGap(
        world,
        ctx,
        (['nothingToSell', 'nobodyPasses', 'nowhereToGo'] as const)[i % 3]!,
        `place:${1000 + i}`,
        100 + i,
        2,
      );
    const perHour: number[] = [];
    const by = {
      gaps: [] as number[],
      masters: [] as number[],
      supplies: [] as number[],
      townbook: [] as number[],
    };
    for (let i = 0; i < WARMUP + 12; i++) {
      const d = togetherDay(world, ctx, 4 + i);
      if (i < WARMUP) continue;
      perHour.push((d.gaps + d.masters + d.supplies + d.townbook) / 24);
      for (const id of TOGETHER) by[id].push(d[id] / 24);
    }
    const med = median(perHour);
    const budget = R3_BUDGET.togetherMsPerHour;
    const split = TOGETHER.map((id) => `${id} ${median(by[id]).toFixed(3)}`).join(', ');
    lines.push(
      `r3 together ${scale.padEnd(7)} ${t.residents} residents, ${world.places.length} place rows: ${med.toFixed(3)} ms an hour median, ` +
        `${worst(perHour).toFixed(3)} worst over ${perHour.length} days (by system, ms an hour: ${split}; budget ${budget} ms an hour)  ${ok(med <= budget)}`,
    );
    if (med > budget) failures.push(`r3 together ${scale} ${med.toFixed(3)} ms an hour`);
    report[scale] = { residents: t.residents, medianMsPerHour: med, worstMsPerHour: worst(perHour) };
  }
  return { lines, failures, report };
}

/**
 * The scenes, in the order they run. R3A to R3D's and R3H's own lines join by adding one entry here,
 * kept alphabetically sorted by id; `r3Bench` prints and enforces whatever each returns.
 */
export const R3_SCENES: readonly R3Scene[] = [
  { id: 'book-close', label: "The Town Book's evening close, City scale", run: bookCloseScene },
  { id: 'masters-day', label: "The masters' day at 23:45, City scale", run: mastersScene },
  { id: 'settling', label: 'The 17:30 settling and the walk, City scale', run: settlingScene },
  {
    id: 'specialized-day',
    label: "The specialized buildings' day at 23:30, City scale",
    run: specializedScene,
  },
  { id: 'threads', label: 'The thread counts, City scale', run: threadsScene },
  {
    id: 'together',
    label: 'Gaps, supplies, masters and the Town Book an hour, Village and City',
    run: togetherScene,
  },
];

export function r3Bench(): R3Result {
  const lines: string[] = [];
  const failures: string[] = [];
  const report: Record<string, object> = {};
  for (const scene of R3_SCENES) {
    const r = scene.run();
    lines.push(...r.lines);
    failures.push(...r.failures);
    report[scene.id] = r.report;
  }
  return { lines, failures, report };
}
