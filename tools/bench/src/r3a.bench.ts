// R3A benches (docs/spec/22-quality.md): the supplies at City scale (2,000 residents, 300 lanterns and
// more, fires and cloth among the places, a stock above the reserves, a few lamplighters). Run by system
// id through the pipeline, as the sim runs them, over whole days:
//   (a) the settling: the supplies system's run at 17:30 (the run after which the night turns over);
//   (b) the walk: the residents system's time per tick over 17:30 to 18:00 with the lamplighters walking,
//       minus the same window the same day of a twin of the scene (copied through serialize before the
//       first timed day) with nobody in the job (`supplies.lamplighters` emptied);
//   (c) supplies in all: the supplies system's total time over a day, over 24, in ms an hour.
// Gaps, supplies, masters and the Town Book together stay under 1 ms an hour; supplies take half of it.
import { content } from '@qoti/content';
import {
  insertBuilding,
  MAP_SIZE,
  pipeline,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  bumpPlaceInputs,
  createTickCtx,
  deserialize,
  serialize,
  type SimCtx,
  type WorldState,
} from '@qoti/sim';
import { release } from '../../../packages/sim/src/systems/residents/jobs';
import { advance, median, pushDecor, scatterPlaces, tileNear, worst } from './r2a.bench';
import { flatTown } from './residents';

export const R3A_BUDGET = { settlingMs: 5, walkMsPerTick: 0.1, suppliesMsPerHour: 0.5 };

const HALF_HOUR = TICKS_PER_HOUR / 2;
const DAYS = 3;
const LANTERNS = 320;
const FIRES = 40;
const CLOTH = 40;
const LAMPLIGHTERS_WANTED = 4;
const T16 = (10 * TICKS_PER_HOUR) % TICKS_PER_DAY;
const T17 = (11 * TICKS_PER_HOUR) % TICKS_PER_DAY;
const WALK_FROM = T17 + HALF_HOUR;
const WALK_TO = T17 + 2 * HALF_HOUR;

const good = (id: string): number => content.goodIndex.get(id)!;

/** Lanterns, fires and cloth pieces around the homes, beside the places the R2A scatter makes. */
function furnish(world: WorldState, homes: ReturnType<typeof scatterPlaces>): number[] {
  const counts = [0, 0, 0];
  const jobs: Array<[string, number]> = [
    ['lantern', LANTERNS],
    ['brazier', FIRES],
    ['maypole', CLOTH],
  ];
  let spot = 0;
  jobs.forEach(([def, n], j) => {
    for (let placed = 0, tries = 0; placed < n && tries < n * 6; tries++) {
      const home = homes.homes[spot++ % homes.homes.length]!;
      const at = tileNear(world, homes.used, home);
      if (!at) continue;
      pushDecor(world, homes.used, def, at[0], at[1]);
      placed++;
      counts[j]!++;
    }
  });
  bumpPlaceInputs(world);
  return counts;
}

/** A built Town Hall on the first free ground found, where the lamplighters' job is posted. */
function townHall(world: WorldState): void {
  const def = content.buildingById.get('town-hall')!;
  const [w, d] = def.size;
  const S = MAP_SIZE;
  for (let z = 2; z < S - d - 2; z++) {
    for (let x = 2; x < S - w - 2; x++) {
      let free = true;
      for (let dz = -1; dz <= d && free; dz++)
        for (let dx = -1; dx <= w && free; dx++) {
          const i = (z + dz) * S + x + dx;
          if (world.map.occupant[i] || world.map.road[i] || world.map.water[i]) free = false;
        }
      if (!free) continue;
      insertBuilding(world, null, def, x, z, 0, 0, { site: false });
      return;
    }
  }
}

/**
 * Posts `n` lamplighters as the hourly hiring would (a job seeker takes the Town Hall's job, off its
 * books): the flat town employs everyone, so a few workers are released to the lamplighters' list.
 */
function hireLamplighters(world: WorldState, ctx: SimCtx, n: number): void {
  const hall = world.buildings.find((b) => b.def === 'town-hall' && b.stage === 'built');
  if (!hall) return;
  for (const r of world.residents) {
    if (world.supplies.lamplighters.length >= n) break;
    if (r.stage !== 'adult' || !r.jobId || r.activity.kind === 'arrive' || r.activity.kind === 'leave')
      continue;
    release(world, r, false, ctx);
    r.jobId = hall.id;
    world.supplies.lamplighters.push(r.id);
  }
  world.supplies.lamplighters.sort((a, b) => a - b);
}

/** Candles, firewood and cloth in every storehouse, far above any reserve. */
function stock(world: WorldState): void {
  for (const b of world.buildings) {
    if (b.def !== 'storehouse' || !b.rt) continue;
    b.rt.store[good('candles')] = 4000;
    b.rt.store[good('firewood')] = 4000;
    b.rt.store[good('cloth')] = 4000;
  }
}

interface Days {
  settling: number[];
  /** Per day, the residents system's ms for each tick of the 17:30 to 18:00 window. */
  walk: number[][];
  suppliesMsPerHour: number[];
  lamps: number;
  lamplighters: number;
  reached: number[];
}

/** The untimed lead-in: a day whole, with stock above the reserves. */
function warm(world: WorldState, ctx: SimCtx): void {
  world.tick = Math.ceil(world.tick / TICKS_PER_DAY) * TICKS_PER_DAY;
  advance(world, ctx, T16);
  stock(world);
  advance(world, ctx, TICKS_PER_DAY - T16);
}

function days(world: WorldState, ctx: SimCtx): Days {
  const residents = pipeline.find((s) => s.id === 'residents')!;
  const suppliesSys = pipeline.find((s) => s.id === 'supplies')!;
  const out: Days = { settling: [], walk: [], suppliesMsPerHour: [], lamps: 0, lamplighters: 0, reached: [] };
  for (let day = 0; day < DAYS; day++) {
    const walkMs: number[] = [];
    let suppliesTotal = 0;
    for (let k = 0; k < TICKS_PER_DAY; k++) {
      const tod = world.tick % TICKS_PER_DAY;
      const t = world.tick;
      if (tod === T16) stock(world);
      for (const s of pipeline) {
        if (t % (s.every ?? 1) !== (s.offset ?? 0)) continue;
        if (s === suppliesSys) {
          const night = world.supplies.night;
          const t0 = performance.now();
          s.tick(world, ctx);
          const ms = performance.now() - t0;
          suppliesTotal += ms;
          if (world.supplies.night !== night) {
            out.settling.push(ms);
            out.lamps = world.supplies.lamps.length;
            out.lamplighters = world.supplies.lamplighters.length;
            out.reached.push(world.supplies.lamps.filter((l) => l.by !== undefined && l.by !== null).length);
          }
        } else if (s === residents && tod >= WALK_FROM && tod < WALK_TO) {
          const t0 = performance.now();
          s.tick(world, ctx);
          walkMs.push(performance.now() - t0);
        } else s.tick(world, ctx);
      }
      ctx.events.length = 0;
      ctx.dirty.clear();
    }
    out.suppliesMsPerHour.push(suppliesTotal / 24);
    out.walk.push(walkMs);
  }
  return out;
}

export function r3aBench(): { lines: string[]; failures: string[]; report: object } {
  const failures: string[] = [];
  const lines: string[] = [];
  const ok = (pass: boolean) => (pass ? 'ok' : 'OVER BUDGET');

  const town = flatTown('bench-r3a', 24, 400, 700, 5);
  const world = town.world;
  world.charter.rank = 'city';
  townHall(world);
  const scatter = scatterPlaces(world);
  const [lanterns = 0, fires = 0, cloth = 0] = furnish(world, scatter);
  warm(world, town.ctx);
  hireLamplighters(world, town.ctx, LAMPLIGHTERS_WANTED);
  // The twin: the same scene and the same lamps settled, with nobody in the lamplighters' job.
  const twinWorld = deserialize(serialize(world));
  const twinCtx = createTickCtx(twinWorld);
  twinWorld.supplies.lamplighters.length = 0;
  const d = days(world, town.ctx);
  const twin = days(twinWorld, twinCtx);
  const walkDiffs: number[] = [];
  const walkAll: number[] = [];
  const twinAll: number[] = [];
  d.walk.forEach((day, i) => {
    const other = twin.walk[i]!;
    for (let k = 0; k < Math.min(day.length, other.length); k++) walkDiffs.push(day[k]! - other[k]!);
    walkAll.push(...day);
    twinAll.push(...other);
  });
  const reached = median(d.reached);

  const setup = `${town.residents} residents, ${lanterns} lanterns, ${fires} braziers, ${cloth} maypoles, ${scatter.benches} benches, ${d.lamps} lamps lit, ${d.lamplighters} lamplighters`;
  if (lanterns < 300) failures.push(`r3a scene has ${lanterns} lanterns (wants 300)`);
  if (d.lamps < 300) failures.push(`r3a settled ${d.lamps} lamps (wants 300, stock or reserve)`);
  if (d.lamplighters < LAMPLIGHTERS_WANTED) failures.push(`r3a hired ${d.lamplighters} lamplighters`);

  const settleMed = median(d.settling);
  if (settleMed > R3A_BUDGET.settlingMs) failures.push(`r3a settling ${settleMed.toFixed(3)} ms`);
  lines.push(
    `r3a settling    ${setup}: ${settleMed.toFixed(3)} ms median, ${worst(d.settling).toFixed(3)} worst, over ${d.settling.length} evenings (budget ${R3A_BUDGET.settlingMs} ms)  ${ok(d.settling.length > 0 && settleMed <= R3A_BUDGET.settlingMs)}`,
  );

  const walkMs = median(walkDiffs);
  if (walkMs > R3A_BUDGET.walkMsPerTick) failures.push(`r3a walk ${walkMs.toFixed(3)} ms a tick`);
  lines.push(
    `r3a walk        17:30 to 18:00 against a twin with no lamplighters: ${walkMs.toFixed(3)} ms a tick median difference (walk ${median(walkAll).toFixed(3)}, twin ${median(twinAll).toFixed(3)}, worst walk tick ${worst(walkAll).toFixed(2)}; ${reached} of ${d.lamps} lamps reached before 18:00), over ${DAYS} days (budget ${R3A_BUDGET.walkMsPerTick} ms)  ${ok(walkMs <= R3A_BUDGET.walkMsPerTick)}`,
  );

  const perHour = median(d.suppliesMsPerHour);
  if (perHour > R3A_BUDGET.suppliesMsPerHour) failures.push(`r3a supplies ${perHour.toFixed(3)} ms an hour`);
  lines.push(
    `r3a supplies    the system's day over 24: ${perHour.toFixed(3)} ms an hour median, ${worst(d.suppliesMsPerHour).toFixed(3)} worst, over ${DAYS} days (budget ${R3A_BUDGET.suppliesMsPerHour} ms an hour, of 1 with gaps, masters and the Town Book)  ${ok(perHour <= R3A_BUDGET.suppliesMsPerHour)}`,
  );

  return {
    lines,
    failures,
    report: {
      residents: town.residents,
      lanterns,
      fires,
      cloth,
      lamps: d.lamps,
      lamplighters: d.lamplighters,
      settlingMs: settleMed,
      settlingWorstMs: worst(d.settling),
      walkMsPerTickDifference: walkMs,
      walkMedianMs: median(walkAll),
      twinMedianMs: median(twinAll),
      lampsReached: reached,
      suppliesMsPerHour: perHour,
    },
  };
}
