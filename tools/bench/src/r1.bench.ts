// R1 benches (docs/spec/22-quality.md, redesign budgets): the night's growth pass, which chooses a
// trade for every lot it grows (budget 2 ms a night), and the carrier's 10:00 pass (budget 0.5 ms a
// day), both at City scale: the 2,000-resident flat town at rank City with two new lanes zoned
// every kind, fertile ground, a sawmill and windmills standing. Both are run by system id through
// the pipeline, as the sim runs them, so they keep measuring the real passes after their internals
// change. Each timed run is on a fresh copy of the town (deserialized from one snapshot), so the
// lots are empty and the stores are as set every time.
import { content } from '@qoti/content';
import {
  createTickCtx,
  deserialize,
  insertBuilding,
  MAP_SIZE,
  pipeline,
  Road,
  serialize,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  type WorldState,
} from '@qoti/sim';
import { flatTown } from './residents';

export const R1_BUDGET = { growthMsPerNight: 2, carrierMsPerDay: 0.5 };

const S = MAP_SIZE;
const ZONES = ['homes-low', 'homes-medium', 'shops', 'crafts', 'farms'];
const NIGHTS = 9;
const WARMUP = 2;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** CPU time of this process in ms, so a busy machine does not inflate the timing. */
function cpuMs(): number {
  const c = process.cpuUsage();
  return (c.user + c.system) / 1000;
}

/** Two new lanes at the bottom of the map, zoned 3 deep both sides, every zone by its x. */
function zoneLanes(world: WorldState): void {
  // Paths from the town's last lane down through both new lanes, so porters reach them.
  for (let x = 4; x < S - 4; x += 18) for (let z = 169; z <= 185; z++) world.map.road[z * S + x] = Road.path;
  for (const z of [177, 185]) {
    for (let x = 2; x < S - 2; x++) world.map.road[z * S + x] = Road.lane;
    // A storehouse every 30 tiles on the lane (south side, facing north), so lots are near a store.
    for (let x = 10; x + 3 < S - 4; x += 30) {
      const store = insertBuilding(world, null, content.buildingById.get('storehouse')!, x, z + 1, 2, 0, {
        site: false,
      });
      // Porters: growth only counts a storehouse that has someone working in it.
      store.rt?.workers.push(world.residents[0]!.id);
    }
    for (let x = 2; x < S - 2; x++) {
      for (const dz of [-3, -2, -1, 1, 2, 3]) {
        const i = (z + dz) * S + x;
        if (world.map.road[i] || world.map.occupant[i]) continue;
        world.map.zone[i] = content.zoneById.get(ZONES[Math.floor(x / 24) % ZONES.length]!)!.layerValue;
      }
    }
  }
  world.networkVersion += 1;
}

/** The City-scale town: rank, lots cut, fertile, materials stocked, treasury full. */
function cityTown() {
  const town = flatTown('bench-r1', 24, 400, 700, 5);
  const { world, ctx } = town;
  world.charter.rank = 'city';
  for (let i = 0; i < S * S; i++) if (world.map.fertility[i]! < 60) world.map.fertility[i] = 60;
  // Specialized buildings in clear ground below the lanes: a sawmill and two more windmills.
  for (const [def, x] of [
    ['sawmill', 10],
    ['windmill', 30],
    ['windmill', 50],
  ] as const) {
    insertBuilding(world, null, content.buildingById.get(def)!, x, 189, 0, 0, { site: false });
  }
  zoneLanes(world);
  for (const b of world.buildings) {
    if (b.def !== 'storehouse' || !b.rt) continue;
    for (const g of ['timber', 'stone', 'brick']) b.rt.store[content.goodIndex.get(g)!] = 200;
  }
  world.economy.treasury = 5_000_000;
  // A town short of food and of what its workshops make, so farms and crafts have trades to score:
  // empty larders and shelves, and a day's demand for every good.
  for (const b of world.buildings) if (b.rt && b.def !== 'storehouse') b.rt.store.fill(0);
  for (const g of ['bread', 'vegetables', 'grain', 'flour']) {
    const i = content.goodIndex.get(g);
    if (i === undefined) continue;
    for (const b of world.buildings) if (b.rt) b.rt.store[i] = 0;
  }
  for (const h of world.households) h.pantry.fill(0);
  for (let g = 0; g < content.goods.length; g++) {
    world.market.demand[g] = 40;
    world.economy.yesterday.consumed[g] = 40;
  }
  // Cut the lots (the zoning system does it from the zone layer).
  const zoning = pipeline.find((s) => s.id === 'zoning')!;
  zoning.tick(world, ctx);
  ctx.events.length = 0;
  return town;
}

/** A fresh copy of the world, at the start of a day, with its own tick context. */
function fresh(bytes: Uint8Array) {
  const world = deserialize(bytes);
  world.tick = Math.ceil(world.tick / TICKS_PER_DAY) * TICKS_PER_DAY;
  return { world, ctx: createTickCtx(world) };
}

/** Runs the named systems over `ticks` ticks as the sim does; returns CPU ms spent in each, by id. */
function runSystems(world: WorldState, ctx: ReturnType<typeof createTickCtx>, ids: string[], ticks: number) {
  const systems = pipeline.filter((s) => ids.includes(s.id));
  const ms: Record<string, number> = {};
  for (let i = 0; i < ticks; i++) {
    const t = world.tick;
    for (const s of systems) {
      if (t % (s.every ?? 1) !== (s.offset ?? 0)) continue;
      const t0 = cpuMs();
      s.tick(world, ctx);
      ms[s.id] = (ms[s.id] ?? 0) + cpuMs() - t0;
    }
    ctx.events.length = 0;
    ctx.dirty.clear();
    world.tick += 1;
  }
  return ms;
}

export function r1Bench(): { lines: string[]; failures: string[]; report: object } {
  const failures: string[] = [];
  const lines: string[] = [];
  // R1 stand-in (R1X): the R1 lines time today's stand-in growth and carrier, which R1A and R1B are
  // replacing, so over budget they are recorded, not failed; R1X makes them fail (or BENCH_R1_STRICT=1).
  const strict = process.env.BENCH_R1_STRICT === '1';
  const ok = (pass: boolean) => (pass ? 'ok' : strict ? 'OVER BUDGET' : 'OVER BUDGET (recorded, R1X enforces)');
  const over = (line: string) => (strict ? failures.push(line) : undefined);
  const town = cityTown();
  const bytes = serialize(town.world);
  const residents = town.residents;

  // Growth: the night, 00:00 to 03:00, which holds the 01:00 growth pass and the hourly zoning.
  const nightMs: number[] = [];
  const zoningMs: number[] = [];
  let lots = 0;
  let grew = 0;
  for (let n = 0; n < WARMUP + NIGHTS; n++) {
    const { world, ctx } = fresh(bytes);
    // The night starts at midnight, an hour before the growth pass.
    world.tick += pipeline.find((s) => s.id === 'growth')!.offset! - TICKS_PER_HOUR;
    // A running town has its caches warm; one untimed zoning pass warms this copy's.
    pipeline.find((s) => s.id === 'zoning')!.tick(world, ctx);
    ctx.events.length = 0;
    const before = world.lots.filter((l) => l.buildingId).length;
    const ms = runSystems(world, ctx, ['zoning', 'growth'], 3 * TICKS_PER_HOUR);
    if (n >= WARMUP) {
      nightMs.push((ms.zoning ?? 0) + (ms.growth ?? 0));
      zoningMs.push(ms.zoning ?? 0);
    }
    lots = world.lots.length;
    grew = world.lots.filter((l) => l.buildingId).length - before;
  }
  const growthMs = median(nightMs);
  if (grew === 0) failures.push('r1 growth grew nothing (measures nothing)');
  if (growthMs > R1_BUDGET.growthMsPerNight) over(`r1 growth ${growthMs.toFixed(3)} ms a night`);
  lines.push(
    `r1 growth       ${residents} residents, rank city, ${lots} lots, ${grew} grew: ` +
      `${growthMs.toFixed(2)} ms a night, ${median(zoningMs).toFixed(2)} of it zoning (budget ${R1_BUDGET.growthMsPerNight} ms)  ` +
      ok(grew > 0 && growthMs <= R1_BUDGET.growthMsPerNight),
  );

  // Carrier: every family short of its reserve, every rule Always, coins and budget to spare.
  // One warm world, re-emptied before each day (a fresh copy would time the cold caches).
  const prep = fresh(bytes);
  const reset = (world: WorldState): void => {
    for (const b of world.buildings) {
      if (!b.rt) continue;
      for (let g = 0; g < b.rt.store.length; g++) b.rt.store[g] = 0;
    }
    for (const f of world.carrier.families) {
      f.rule = 'always';
      f.reserve = Math.max(f.reserve, 8);
    }
    world.carrier.budget = 100_000_000;
    world.economy.treasury = 500_000_000;
    world.tick = Math.ceil((world.tick + 1) / TICKS_PER_DAY) * TICKS_PER_DAY;
  };
  const dayMs: number[] = [];
  let bought = 0;
  for (let n = 0; n < WARMUP + NIGHTS; n++) {
    reset(prep.world);
    const ms = runSystems(prep.world, prep.ctx, ['carrier'], TICKS_PER_DAY);
    if (n >= WARMUP) dayMs.push(ms.carrier ?? 0);
    const last = prep.world.carrier.bought[prep.world.carrier.bought.length - 1]!;
    bought = last.reduce((a, b) => a + b, 0);
  }
  const carrierMs = median(dayMs);
  const families = prep.world.carrier.families.length;
  if (bought === 0) failures.push('r1 carrier bought nothing (measures nothing)');
  if (carrierMs > R1_BUDGET.carrierMsPerDay) over(`r1 carrier ${carrierMs.toFixed(3)} ms a day`);
  lines.push(
    `r1 carrier      ${residents} residents, ${families} families short, ${bought} units carried: ` +
      `${carrierMs.toFixed(2)} ms a day (budget ${R1_BUDGET.carrierMsPerDay} ms)  ` +
      ok(bought > 0 && carrierMs <= R1_BUDGET.carrierMsPerDay),
  );

  return {
    lines,
    failures,
    report: {
      residents,
      lots,
      grew,
      zoningMsPerNight: median(zoningMs),
      growthMsPerNight: growthMs,
      carrierUnits: bought,
      carrierMsPerDay: carrierMs,
    },
  };
}
