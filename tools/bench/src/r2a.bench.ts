// R2A benches (docs/spec/22-quality.md): the place pass (budget 1 ms an hour at Village scale, 3 ms
// at City scale) and the planning of the evening round (under 0.4 ms a tick for 2,000 residents
// between 17:00 and 17:30). Both are run by system id through the pipeline, as the sim runs them.
// The place pass is timed twice on each scene, after a change (one more bench placed before each
// pass, the budgeted case) and steady (nothing changed since the last pass); the pass drops the
// derived place index and reads it again, so it may rebuild either way. Planning is the residents
// system's time on the ticks 17:00 to 17:30 minus its time on 16:00 to 16:30 the same day, per
// tick. Wall time after warm-up, median and worst.
import {
  applyTurn,
  createTickCtx,
  MAP_SIZE,
  pipeline,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TILE_FP,
  worldIndex,
  type Building,
  type SimCtx,
  type WorldState,
} from '@qoti/sim';
import { villageFixture } from '../../../packages/sim/test/fixtures/village';
import { flatTown } from './residents';

export const R2A_BUDGET = { placePassVillageMs: 1, placePassCityMs: 3, planningMsPerTick: 0.4 };

const S = MAP_SIZE;
const PASSES = 30;
const PASS_WARMUP = 8;
const WARM_HOURS = 12;
const WARM_DAYS = 1;
const EVENINGS = 8;
const HALF_HOUR = TICKS_PER_HOUR / 2;
const COMPANIONS = ['ring-bench', 'lantern', 'flower-bed', 'brazier'];

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function worst(values: number[]): number {
  return Math.max(...values);
}

/** Free walkable ground: no building, road or water, and no decor within one tile. */
function freeTile(world: WorldState, used: Set<number>, x: number, z: number): boolean {
  if (x < 1 || z < 1 || x >= S - 1 || z >= S - 1) return false;
  const i = z * S + x;
  if (world.map.occupant[i] || world.map.road[i] || world.map.water[i]) return false;
  return !used.has(i);
}

function markUsed(used: Set<number>, x: number, z: number): void {
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) used.add((z + dz) * S + x + dx);
}

/** Pushes one decor piece on tile (x, z) as `decor.place` adds it (next id, sorted, decor grid). */
function pushDecor(world: WorldState, used: Set<number>, def: string, x: number, z: number): void {
  const d = {
    id: world.nextId++,
    def,
    fx: x * TILE_FP + 128,
    fz: z * TILE_FP + 128,
    rot: 0,
    builtBy: 0 as const,
  };
  world.decor.push(d);
  worldIndex(world).decorGrid.add(d);
  markUsed(used, x, z);
}

/** The nearest free tile around a building, scanning rings outward; null when none. */
function tileNear(world: WorldState, used: Set<number>, b: Building): [number, number] | null {
  for (let r = 1; r <= 5; r++) {
    for (let dz = -r; dz <= r + 2; dz++) {
      for (let dx = -r; dx <= r + 2; dx++) {
        if (Math.max(Math.abs(dx - 1), Math.abs(dz - 1)) !== r) continue;
        if (freeTile(world, used, b.x + dx, b.z + dz)) return [b.x + dx, b.z + dz];
      }
    }
  }
  return null;
}

interface Scatter {
  used: Set<number>;
  benches: number;
  homes: Building[];
}

/** Places to find: a bench for every eight grown-ups near homes, with a companion piece beside every other one. */
function scatterPlaces(world: WorldState): Scatter {
  const used = new Set<number>();
  for (const d of world.decor) markUsed(used, Math.floor(d.fx / TILE_FP), Math.floor(d.fz / TILE_FP));
  const homes = world.buildings.filter((b) => b.def === 'house' || b.def === 'cottage');
  const adults = world.residents.filter((r) => r.stage !== 'child').length;
  const wanted = Math.max(2, Math.floor(adults / 8));
  const stride = Math.max(1, Math.floor(homes.length / wanted));
  let benches = 0;
  for (let i = 0, k = 0; i < homes.length && benches < wanted; i += stride, k++) {
    const home = homes[i]!;
    const at = tileNear(world, used, home);
    if (!at) continue;
    pushDecor(world, used, 'bench', at[0], at[1]);
    benches++;
    if (k % 2 === 0) {
      const next = tileNear(world, used, home);
      if (next) pushDecor(world, used, COMPANIONS[(k / 2) % COMPANIONS.length]!, next[0], next[1]);
    }
  }
  return { used, benches, homes };
}

function advance(world: WorldState, ctx: SimCtx, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    applyTurn(world, { t: world.lastTurn + 1, cmds: [] }, ctx);
    ctx.events.length = 0;
    ctx.dirty.clear();
  }
}

/** Times the hourly place pass after a change (a bench placed first) and steady, alternating. */
function placePass(world: WorldState, ctx: SimCtx, scatter: Scatter) {
  const system = pipeline.find((s) => s.id === 'places')!;
  const offset = system.offset ?? 0;
  const changed: number[] = [];
  const steady: number[] = [];
  let spot = 0;
  for (let n = 0; n < PASSES * 2 + PASS_WARMUP; n++) {
    // Bring the clock to the tick the pass is due, then time it on its own.
    const into = world.tick % TICKS_PER_HOUR;
    const wait = (offset - into + TICKS_PER_HOUR) % TICKS_PER_HOUR || TICKS_PER_HOUR;
    // A whole hour of sim every fourth pass; between them the clock jumps to the next pass.
    if (n % 4 === 0) advance(world, ctx, wait);
    else world.tick += wait;
    const isChange = n % 2 === 0;
    if (isChange) {
      for (let tries = 0; tries < scatter.homes.length; tries++) {
        const at = tileNear(world, scatter.used, scatter.homes[spot++ % scatter.homes.length]!);
        if (!at) continue;
        pushDecor(world, scatter.used, 'bench', at[0], at[1]);
        break;
      }
    }
    // The pass reads the tick it is due on.
    world.tick = world.tick - (world.tick % TICKS_PER_HOUR) + offset;
    const t0 = performance.now();
    system.tick(world, ctx);
    const ms = performance.now() - t0;
    ctx.events.length = 0;
    if (n >= PASS_WARMUP) (isChange ? changed : steady).push(ms);
  }
  return { changed, steady };
}

/**
 * The residents system's extra time per tick between 17:00 and 17:30 over the same ticks at 16:00,
 * each evening. The town lives its first day whole (untimed); each timed evening then runs from 15:00
 * to 17:30 and the clock jumps on to 15:00 the next day, so the sim's whole-day cost is not paid per evening.
 */
function planning(world: WorldState, ctx: SimCtx) {
  const residents = pipeline.find((s) => s.id === 'residents')!;
  const t15 = (9 * TICKS_PER_HOUR) % TICKS_PER_DAY;
  const t16 = (10 * TICKS_PER_HOUR) % TICKS_PER_DAY;
  const t17 = (11 * TICKS_PER_HOUR) % TICKS_PER_DAY;
  const diffs: number[] = [];
  const evening: number[] = [];
  const base: number[] = [];
  world.tick = Math.ceil(world.tick / TICKS_PER_DAY) * TICKS_PER_DAY;
  advance(world, ctx, t15 + (WARM_DAYS - 1) * TICKS_PER_DAY);
  for (let day = 0; day < EVENINGS; day++) {
    const eveningMs: number[] = [];
    const baseMs: number[] = [];
    const from = world.tick;
    for (let k = 0; k < t17 + HALF_HOUR - t15; k++) {
      const tod = world.tick % TICKS_PER_DAY;
      const t = world.tick;
      for (const s of pipeline) {
        if (t % (s.every ?? 1) !== (s.offset ?? 0)) continue;
        const inEvening = tod >= t17 && tod < t17 + HALF_HOUR;
        const inBase = tod >= t16 && tod < t16 + HALF_HOUR;
        if (s === residents && (inEvening || inBase)) {
          const t0 = performance.now();
          s.tick(world, ctx);
          (inEvening ? eveningMs : baseMs).push(performance.now() - t0);
        } else s.tick(world, ctx);
      }
      ctx.events.length = 0;
      ctx.dirty.clear();
      world.tick += 1;
    }
    // On to the next day's 15:00 (the clock jumps; the residents re-plan from the time of day).
    world.tick = from + TICKS_PER_DAY;
    for (let k = 0; k < eveningMs.length; k++) diffs.push(eveningMs[k]! - baseMs[k]!);
    evening.push(...eveningMs);
    base.push(...baseMs);
  }
  return { diffs, evening, base };
}

export function r2aBench(): { lines: string[]; failures: string[]; report: object } {
  const failures: string[] = [];
  const lines: string[] = [];
  const ok = (pass: boolean) => (pass ? 'ok' : 'OVER BUDGET');
  const report: Record<string, unknown> = {};

  const placeScene = (name: 'village' | 'city', world: WorldState, ctx: SimCtx, budget: number) => {
    const scatter = scatterPlaces(world);
    advance(world, ctx, WARM_HOURS * TICKS_PER_HOUR);
    const { changed, steady } = placePass(world, ctx, scatter);
    const med = median(changed);
    if (scatter.benches === 0) failures.push(`r2a ${name} place pass has no benches (measures nothing)`);
    if (med > budget) failures.push(`r2a ${name} place pass ${med.toFixed(3)} ms an hour`);
    lines.push(
      `r2a places ${name.padEnd(7)} ${world.residents.length} residents, ${world.decor.length} decor, ${scatter.benches} benches placed: ` +
        `after a change ${med.toFixed(2)} ms median, ${worst(changed).toFixed(2)} worst; steady ${median(steady).toFixed(2)} median, ${worst(steady).toFixed(2)} worst, ` +
        `over ${changed.length} passes (budget ${budget} ms an hour)  ${ok(scatter.benches > 0 && med <= budget)}`,
    );
    report[name] = {
      residents: world.residents.length,
      decor: world.decor.length,
      benchesPlaced: scatter.benches,
      afterChangeMs: med,
      afterChangeWorstMs: worst(changed),
      steadyMs: median(steady),
      steadyWorstMs: worst(steady),
    };
  };

  const village = villageFixture().state;
  placeScene('village', village, createTickCtx(village), R2A_BUDGET.placePassVillageMs);

  const city = flatTown('bench-r2a', 24, 400, 700, 5);
  city.world.charter.rank = 'city';
  placeScene('city', city.world, city.ctx, R2A_BUDGET.placePassCityMs);

  // Planning: a fresh City town, so the pass benches' extra decor does not colour it.
  const evenings = flatTown('bench-r2a-plan', 24, 400, 700, 5);
  evenings.world.charter.rank = 'city';
  scatterPlaces(evenings.world);
  const plan = planning(evenings.world, evenings.ctx);
  const planMs = median(plan.diffs);
  if (planMs > R2A_BUDGET.planningMsPerTick) failures.push(`r2a planning ${planMs.toFixed(3)} ms a tick`);
  lines.push(
    `r2a planning    ${evenings.residents} residents, 17:00 to 17:30 over 16:00 to 16:30: ` +
      `${planMs.toFixed(3)} ms a tick median difference (evening ${median(plan.evening).toFixed(3)}, baseline ${median(plan.base).toFixed(3)}, worst evening tick ${worst(plan.evening).toFixed(2)}), ` +
      `over ${EVENINGS} evenings (budget ${R2A_BUDGET.planningMsPerTick} ms)  ${ok(planMs <= R2A_BUDGET.planningMsPerTick)}`,
  );
  report.planning = {
    residents: evenings.residents,
    msPerTickDifference: planMs,
    eveningMedianMs: median(plan.evening),
    baselineMedianMs: median(plan.base),
    eveningWorstMs: worst(plan.evening),
  };

  return { lines, failures, report };
}
