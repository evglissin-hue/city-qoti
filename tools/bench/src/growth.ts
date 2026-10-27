// Growth and traffic benches (C4B; docs/build/cycle-04b-growth.md): zoning, the nightly growth pass
// and carts on the roads, measured per in-game hour.
//
// - Village: 150 residents in a flat town (tools/bench/src/residents.ts) with materials in store,
//   a new lane zoned along both sides with every zone, and 12 carts criss-crossing the lanes. Budget:
//   zoning, growth and traffic together under 2 ms per in-game hour.
// - Town: the 2,000-resident town, a new lane zoned a stroke an hour (as a player would, at most
//   256 tiles a stroke) and 100 carts. Movement, schedules, zoning, growth and traffic stay within
//   the 2,000-resident tick budget (4 ms average); the worst tick of zoning, growth or traffic is
//   reported against the 12 ms worst-tick budget (like the residents bench, timing noise on shared
//   machines makes single ticks a poor gate).
import { content } from '@qoti/content';
import {
  cartTile,
  MAP_SIZE,
  pipeline,
  Road,
  requestCartMove,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type Cart,
  type WorldState,
} from '@qoti/sim';
import { flatTown, RESIDENT_BUDGET, type Town } from './residents';

export const GROWTH_BUDGET = { msPerHour: 2 };

const S = MAP_SIZE;
const MINE = new Set(['growth', 'traffic', 'zoning']);
const ZONES = ['homes-low', 'homes-medium', 'shops', 'crafts', 'farms'];
const STROKE = 256;

/**
 * Village rank and a new lane `z` across the map; returns the zoning strokes for both sides of
 * it, 3 deep, every zone in turn (each at most STROKE tiles). Fertile ground for the farms.
 */
function newLane(world: WorldState, z: number): [number, number][][] {
  world.charter.rank = 'village';
  for (let x = 2; x < S - 2; x++) world.map.road[z * S + x] = Road.lane;
  for (let i = 0; i < S * S; i++) if (world.map.fertility[i]! < 60) world.map.fertility[i] = 60;
  world.networkVersion += 1;
  const strokes: [number, number][][] = [];
  let stroke: [number, number][] = [];
  for (let x = 2; x < S - 2; x++) {
    for (const dz of [-3, -2, -1, 1, 2, 3]) {
      const i = (z + dz) * S + x;
      if (world.map.road[i] || world.map.occupant[i]) continue;
      stroke.push([x, z + dz]);
      if (stroke.length === STROKE) {
        strokes.push(stroke);
        stroke = [];
      }
    }
  }
  if (stroke.length) strokes.push(stroke);
  return strokes;
}

/** Paints one stroke straight into the zone layer (what zone.paint does), zone by its x. */
function paint(world: WorldState, stroke: readonly [number, number][]): void {
  for (const [x, z] of stroke) {
    world.map.zone[z * S + x] = content.zoneById.get(ZONES[Math.floor(x / 24) % ZONES.length]!)!.layerValue;
  }
  // The zone commands tell the zoning pass through its zone epoch; a version bump does the same.
  world.networkVersion += 1;
}

/** Plenty of building materials in every storehouse, so growth is never held up by them. */
function stockUp(world: WorldState): void {
  for (const b of world.buildings) {
    if (b.def !== 'storehouse' || !b.rt) continue;
    for (const g of ['planks', 'stone', 'logs']) b.rt.store[content.goodIndex.get(g)!] = 200;
  }
}

/** `n` carts on lane tiles; `keepDriving` sends each on to another lane tile when it arrives. */
function addCarts(world: WorldState, n: number): Cart[] {
  const lanes: number[] = [];
  for (let i = 0; i < S * S; i++) if (cartTile(world, i)) lanes.push(i);
  const carts: Cart[] = [];
  for (let k = 0; k < n; k++) {
    const cart: Cart = {
      id: world.nextId++,
      def: 'cart',
      home: 0,
      tile: lanes[(k * 7919) % lanes.length]!,
      move: null,
      load: [[content.goodIndex.get('planks')!, 16]],
      job: 0,
      dir: 0,
      parked: false,
    };
    world.carts.push(cart);
    carts.push(cart);
  }
  return carts;
}

/**
 * CPU time of this process in ms (user and system). The benches time CPU rather than the wall
 * clock, so a machine busy with other work does not inflate them; worst ticks still carry GC.
 */
function cpuMs(): number {
  const c = process.cpuUsage();
  return (c.user + c.system) / 1000;
}

function keepDriving(
  world: WorldState,
  carts: readonly Cart[],
  lanes: readonly number[],
  tick: number,
): void {
  for (let k = 0; k < carts.length; k++) {
    const c = carts[k]!;
    if (c.move) continue;
    requestCartMove(world, c.id, lanes[(tick * 31 + k * 104729) % lanes.length]!);
  }
}

interface Measure {
  hours: number;
  /** Zoning, growth and traffic per in-game hour, and the worst single tick of them. */
  mineMsPerHour: number;
  mineWorstMs: number;
  /** Per system, ms per in-game hour. */
  bySystem: Record<string, number>;
  /** All the systems run, per tick. */
  tickAvgMs: number;
  tickWorstMs: number;
  lots: number;
  grown: number;
}

/**
 * Runs `ticks` ticks of the given systems (by id), timing zoning, growth and traffic apart. At the
 * top of each hour `hourly` may change the world (a zoning stroke).
 */
function measure(
  town: Town,
  carts: readonly Cart[],
  ticks: number,
  ids: ReadonlySet<string>,
  hourly?: () => void,
): Measure {
  const { world, ctx } = town;
  const systems = pipeline.filter((s) => ids.has(s.id));
  const lanes: number[] = [];
  for (let i = 0; i < S * S; i++) if (cartTile(world, i)) lanes.push(i);
  let mine = 0;
  const by = new Map<string, number>();
  let mineWorst = 0;
  let worst = 0;
  const start = performance.now();
  for (let i = 0; i < ticks; i++) {
    const t = world.tick;
    if (hourly && t % TICKS_PER_HOUR === 0) hourly();
    if (t % 20 === 0) keepDriving(world, carts, lanes, t);
    const t0 = performance.now();
    for (const s of systems) {
      if (t % (s.every ?? 1) !== (s.offset ?? 0)) continue;
      if (MINE.has(s.id)) {
        const m0 = performance.now();
        s.tick(world, ctx);
        const dt = performance.now() - m0;
        mine += dt;
        by.set(s.id, (by.get(s.id) ?? 0) + dt);
        mineWorst = Math.max(mineWorst, dt);
      } else s.tick(world, ctx);
    }
    ctx.events.length = 0;
    ctx.dirty.clear();
    worst = Math.max(worst, performance.now() - t0);
  }
  const total = performance.now() - start;
  return {
    hours: ticks / TICKS_PER_HOUR,
    mineMsPerHour: (mine * TICKS_PER_HOUR) / ticks,
    bySystem: Object.fromEntries(
      [...by].map(([k, ms]) => [k, Math.round((ms * TICKS_PER_HOUR * 1000) / ticks) / 1000]),
    ),
    mineWorstMs: mineWorst,
    tickAvgMs: total / ticks,
    tickWorstMs: worst,
    lots: world.lots.length,
    grown: world.buildings.filter((b) => b.lot).length,
  };
}

/**
 * Zoning, growth and traffic alone (with the clock and the carts' owner sending them on) for
 * `ticks` ticks, CPU-timed as one block: ms per in-game hour. Everything else stands still, so this
 * is what the three systems themselves cost, without the wall clock's noise on a busy machine.
 */
function mineOnly(town: Town, carts: readonly Cart[], ticks: number): number {
  const { world, ctx } = town;
  const systems = pipeline.filter((s) => s.id === 'clock' || MINE.has(s.id));
  const lanes: number[] = [];
  for (let i = 0; i < S * S; i++) if (cartTile(world, i)) lanes.push(i);
  const start = cpuMs();
  for (let i = 0; i < ticks; i++) {
    const t = world.tick;
    if (t % 20 === 0) keepDriving(world, carts, lanes, t);
    for (const s of systems) if (t % (s.every ?? 1) === (s.offset ?? 0)) s.tick(world, ctx);
    ctx.events.length = 0;
    ctx.dirty.clear();
  }
  return ((cpuMs() - start) * TICKS_PER_HOUR) / ticks;
}

export interface GrowthReport {
  village: { residents: number; carts: number; cpuMsPerHour: number } & Measure;
  town: { residents: number; carts: number; baselineAvgMs: number; cpuMsPerHour: number } & Measure;
}

/** Both growth benches; appends report lines and budget failures. */
export function growthBench(lines: string[], failures: string[]): GrowthReport {
  const ok = (pass: boolean) => (pass ? 'ok' : 'OVER BUDGET');

  // 150 residents: thirty households of five on three lanes, a fourth lane zoned, 12 carts.
  const village = flatTown('bench-village', 3, 30, 70, 5);
  stockUp(village.world);
  for (const stroke of newLane(village.world, 8 + 7 * 3 + 4)) paint(village.world, stroke);
  const vCarts = addCarts(village.world, 12);
  const all = new Set(pipeline.map((s) => s.id));
  measure(village, vCarts, TICKS_PER_DAY / 4, all);
  const v = measure(village, vCarts, 3 * TICKS_PER_DAY, all);
  const vCpu = mineOnly(village, vCarts, 2 * TICKS_PER_DAY);
  const vOk = vCpu <= GROWTH_BUDGET.msPerHour;
  if (!vOk) failures.push(`village growth and traffic ${vCpu.toFixed(3)} ms/hour`);
  lines.push(
    `village growth  ${village.residents} residents, ${vCarts.length} carts, ${v.lots} lots, ${v.grown} grown in ` +
      `${v.hours} h: zoning, growth and traffic ${vCpu.toFixed(3)} ms CPU per in-game hour (wall clock ` +
      `${v.mineMsPerHour.toFixed(3)}), worst tick ${v.mineWorstMs.toFixed(2)} ms ` +
      `(budget ${GROWTH_BUDGET.msPerHour} ms/hour)  ${ok(vOk)}`,
  );

  // 2,000 residents: the residents bench town, then a lane zoned a stroke an hour and 100 carts.
  const town = flatTown('bench-town', 24, 400, 700, 5);
  stockUp(town.world);
  const ids = new Set(['clock', 'residents', 'movement', ...MINE]);
  measure(town, [], TICKS_PER_DAY / 4, ids);
  const base = measure(town, [], TICKS_PER_DAY / 2, ids);
  const strokes = newLane(town.world, 8 + 7 * 24 + 1);
  const tCarts = addCarts(town.world, 100);
  const t = measure(town, tCarts, TICKS_PER_DAY, ids, () => {
    const s = strokes.shift();
    if (s) paint(town.world, s);
  });
  const tCpu = mineOnly(town, tCarts, TICKS_PER_DAY);
  const tOk = t.tickAvgMs <= RESIDENT_BUDGET.townTickMs;
  if (!tOk)
    failures.push(
      `town growth and traffic ${t.tickAvgMs.toFixed(3)} ms/tick, worst ${t.mineWorstMs.toFixed(1)} ms`,
    );
  lines.push(
    `town growth     ${town.residents} residents, ${tCarts.length} carts, ${t.lots} lots, ${t.grown} grown: ` +
      `movement, schedules, zoning, growth and traffic ${t.tickAvgMs.toFixed(3)} ms/tick (without carts and ` +
      `zones ${base.tickAvgMs.toFixed(3)}; budget ${RESIDENT_BUDGET.townTickMs} ms); zoning, growth and ` +
      `traffic ${tCpu.toFixed(2)} ms CPU per in-game hour, worst tick ${t.mineWorstMs.toFixed(1)} ms ` +
      `(reported against ${RESIDENT_BUDGET.townWorstMs} ms)  ${ok(tOk)}`,
  );
  return {
    village: { residents: village.residents, carts: vCarts.length, cpuMsPerHour: vCpu, ...v },
    town: {
      residents: town.residents,
      carts: tCarts.length,
      baselineAvgMs: base.tickAvgMs,
      cpuMsPerHour: tCpu,
      ...t,
    },
  };
}
