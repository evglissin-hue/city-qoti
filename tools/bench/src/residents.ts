// Residents benches (docs/spec/22-quality.md): the 40-resident hamlet (whole tick, budget 0.5 ms)
// and the synthetic 2,000-resident town (movement and schedules only, budget 4 ms average). Both
// are flat grid towns built straight into state: lanes, homes facing them, workplaces, wells,
// benches and flowers, with households settled in at once.
import { content } from '@qoti/content';
import {
  applyTurn,
  createTickCtx,
  createWorld,
  defaultSettings,
  insertBuilding,
  MAP_SIZE,
  pipeline,
  Road,
  settleHousehold,
  Terrain,
  TICKS_PER_DAY,
  TILE_FP,
  worldIndex,
  type LifeStage,
  type Rot4,
  type SimCtx,
  type WorldState,
} from '@qoti/sim';

export const RESIDENT_BUDGET = { hamletTickMs: 0.5, townTickMs: 4, townWorstMs: 12 };

const SPECIES = ['rabbit', 'badger', 'otter', 'fox', 'mouse', 'hedgehog', 'squirrel'];
const WORKPLACES = ['bakery', 'sawpit', 'storehouse', 'windmill', 'market-stall', 'quarry', 'woodcutter'];

export interface Town {
  world: WorldState;
  ctx: SimCtx;
  residents: number;
  buildings: number;
}

/**
 * A flat town: `lanes` east-west lanes 7 tiles apart, buildings on both sides facing them, and
 * north-south paths every 18 tiles. `homes` houses and `works` workplaces, interleaved, with a well
 * every 9 lots and a bench and flower beds at each crossing. Households of `size` move in.
 */
export function flatTown(
  seed: string,
  lanes: number,
  homesWanted: number,
  worksWanted: number,
  size: number,
): Town {
  const world = createWorld(seed, { ...defaultSettings(), mode: 'standard' });
  const ctx = createTickCtx(world);
  const S = MAP_SIZE;
  const m = world.map;
  m.height.fill(2);
  m.terrain.fill(Terrain.grass);
  m.water.fill(0);
  m.road.fill(0);
  m.tree.fill(0);
  m.occupant.fill(0);
  world.buildings = [];
  world.decor = [];
  worldIndex(world).decorGrid.clear();
  world.time.connected = [0];

  const z0 = 8;
  const lastLane = z0 + 7 * (lanes - 1);
  for (let k = 0; k < lanes; k++) for (let x = 2; x < S - 2; x++) m.road[(z0 + 7 * k) * S + x] = Road.lane;
  for (let x = 4; x < S - 4; x += 18) for (let z = z0; z <= lastLane; z++) m.road[z * S + x] = Road.path;
  world.meta.valleyGate = [2, z0];

  const homes: number[] = [];
  let works = 0;
  let lot = 0;
  let placed = 0;
  const done = () => homes.length >= homesWanted && works >= worksWanted;
  const place = (def: string, x: number, z: number, rot: Rot4) => {
    const b = insertBuilding(world, null, content.buildingById.get(def)!, x, z, rot, 0, { site: false });
    placed++;
    return b;
  };
  for (let k = 0; k < lanes && !done(); k++) {
    const lane = z0 + 7 * k;
    for (const side of [0, 1] as const) {
      for (let x = 6; x + 3 < S - 4 && !done(); x += 4) {
        const next = lot + 1;
        // Rotation 0 faces south onto a lane below; rotation 2 faces north onto a lane above.
        const rot: Rot4 = side === 0 ? 0 : 2;
        // Keep homes and workplaces in proportion as they fill up.
        const home =
          homes.length < homesWanted &&
          (works >= worksWanted || homes.length * worksWanted <= works * homesWanted);
        const def = next % 9 === 0 ? 'well' : home ? 'house' : WORKPLACES[works % WORKPLACES.length]!;
        const [w, depth] = content.buildingById.get(def)!.size;
        // Keep a verge of one tile either side of the paths for benches and flowers.
        let clear = true;
        for (let c = x - 1; c <= x + w; c++) if ((c - 4) % 18 === 0) clear = false;
        if (!clear) continue;
        lot = next;
        const b = place(def, x, side === 0 ? lane - depth : lane + 1, rot);
        if (def === 'house') homes.push(b.id);
        else if (def !== 'well') works++;
      }
    }
  }
  // A bench and a flower bed by every crossing of a path and a lane.
  for (let k = 0; k < lanes; k++) {
    for (let x = 4; x < S - 4; x += 18) {
      const z = z0 + 7 * k;
      for (const [def, dx, dz] of [
        ['bench', 1, 2],
        ['flower-bed', -1, 2],
        ['flower-bed', 1, -2],
      ] as const) {
        const tx = x + dx;
        const tz = z + dz;
        if (tz < 0 || tz >= S || m.occupant[tz * S + tx] || m.road[tz * S + tx]) continue;
        const d = {
          id: world.nextId++,
          def,
          fx: tx * TILE_FP + 128,
          fz: tz * TILE_FP + 128,
          rot: 0,
          builtBy: 0 as const,
        };
        world.decor.push(d);
        worldIndex(world).decorGrid.add(d);
      }
    }
  }
  world.networkVersion += 1;

  let residents = 0;
  homes.forEach((id, i) => {
    const stages: LifeStage[] = ['adult', 'adult', 'young', 'child', 'elder'].slice(0, size) as LifeStage[];
    settleHousehold(world, ctx, id, SPECIES[i % SPECIES.length]!, stages);
    residents += stages.length;
  });
  // Stock the outlets so shopping has somewhere to go.
  const bread = content.goodIndex.get('bread')!;
  const veg = content.goodIndex.get('vegetables')!;
  for (const b of world.buildings) {
    if (!b.rt || !content.buildingById.get(b.def)?.tags?.includes('outlet')) continue;
    b.rt.store[bread] = 200;
    b.rt.store[veg] = 200;
  }
  ctx.events.length = 0;
  return { world, ctx, residents, buildings: placed };
}

interface TickStats {
  ticks: number;
  avgMs: number;
  worstMs: number;
}

/** Runs whole turns (every system) for `ticks` ticks. */
function wholeTicks(town: Town, ticks: number): TickStats {
  const { world, ctx } = town;
  let worst = 0;
  const start = performance.now();
  for (let i = 0; i < ticks; i++) {
    const t0 = performance.now();
    applyTurn(world, { t: world.lastTurn + 1, cmds: [] }, ctx);
    ctx.events.length = 0;
    ctx.dirty.clear();
    worst = Math.max(worst, performance.now() - t0);
  }
  return { ticks, avgMs: (performance.now() - start) / ticks, worstMs: worst };
}

/** Runs only the clock, residents and movement systems for `ticks` ticks. */
function residentTicks(town: Town, ticks: number, sample?: (w: WorldState) => void): TickStats {
  const { world, ctx } = town;
  const systems = pipeline.filter((s) => s.id === 'clock' || s.id === 'residents' || s.id === 'movement');
  let worst = 0;
  const start = performance.now();
  for (let i = 0; i < ticks; i++) {
    const t0 = performance.now();
    const t = world.tick;
    for (const s of systems) if (t % (s.every ?? 1) === (s.offset ?? 0)) s.tick(world, ctx);
    ctx.events.length = 0;
    worst = Math.max(worst, performance.now() - t0);
    if (sample && t % 50 === 0) sample(world);
  }
  return { ticks, avgMs: (performance.now() - start) / ticks, worstMs: worst };
}

export interface ResidentsReport {
  hamlet: { residents: number; buildings: number } & TickStats;
  town: { residents: number; buildings: number; outdoorsPeak: number } & TickStats;
}

/** Both residents benches; appends report lines and budget failures. */
export function residentsBench(lines: string[], failures: string[]): ResidentsReport {
  const ok = (pass: boolean) => (pass ? 'ok' : 'OVER BUDGET');

  // 40 residents: ten households of four in a one-lane hamlet with its workplaces.
  const hamlet = flatTown('bench-hamlet', 1, 10, 6, 4);
  wholeTicks(hamlet, TICKS_PER_DAY / 4);
  const h = wholeTicks(hamlet, 2 * TICKS_PER_DAY);
  const hOk = h.avgMs <= RESIDENT_BUDGET.hamletTickMs;
  if (!hOk) failures.push(`hamlet tick ${h.avgMs.toFixed(4)} ms`);
  lines.push(
    `hamlet          ${hamlet.residents} residents, ${hamlet.buildings} buildings: ${h.avgMs.toFixed(4)} ms/tick, ` +
      `worst ${h.worstMs.toFixed(2)} ms (budget ${RESIDENT_BUDGET.hamletTickMs} ms)  ${ok(hOk)}`,
  );

  // 2,000 residents: four hundred households of five, with workplaces for most of the grown-ups.
  const town = flatTown('bench-town', 24, 400, 500, 5);
  let outdoorsPeak = 0;
  residentTicks(town, TICKS_PER_DAY / 4);
  const t = residentTicks(town, TICKS_PER_DAY, (w) => {
    let out = 0;
    for (const r of w.residents) if (!r.inside) out++;
    outdoorsPeak = Math.max(outdoorsPeak, out);
  });
  const tOk = t.avgMs <= RESIDENT_BUDGET.townTickMs;
  if (!tOk) failures.push(`town tick ${t.avgMs.toFixed(3)} ms`);
  lines.push(
    `town            ${town.residents} residents, ${town.buildings} buildings: ${t.avgMs.toFixed(3)} ms/tick ` +
      `for movement and schedules, worst ${t.worstMs.toFixed(1)} ms, ${outdoorsPeak} outdoors at the busiest ` +
      `(budget ${RESIDENT_BUDGET.townTickMs} ms average)  ${ok(tOk)}`,
  );
  return {
    hamlet: { residents: hamlet.residents, buildings: hamlet.buildings, ...h },
    town: { residents: town.residents, buildings: town.buildings, outdoorsPeak, ...t },
  };
}
