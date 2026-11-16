// R2F bench: the lot pass on a town-sized street grid (docs/spec/22-quality.md: zoning, growth and traffic
// together under 2 ms per in-game hour). A flat map with a grid of streets, Townhouses and Shops zoned
// in every block, about a thousand lots on streets with their gardens. Three timings:
//
// - the full cut from scratch (a valley zoned in one go: not an hourly cost, reported against a generous cap);
// - the pass after one building is added (its inputs changed, so the zoning system runs it; nothing new to cut);
// - refitStoreys, which runs every in-game hour, over a street grid built up: an hour with one tier
//   change, a quiet hour, and every row (after lots or buildings moved).
//
// Wall time, median over samples, as the other benches do.
import { content } from '@qoti/content';
import {
  createWorld,
  defaultSettings,
  insertBuilding,
  MAP_SIZE,
  refitStoreys,
  Road,
  Terrain,
  worldIndex,
  zoningPass,
  type WorldState,
} from '@qoti/sim';

/**
 * The refit runs every hour, so it takes a share of the hour's 2 ms shared with growth and traffic,
 * as does the pass after a grown building (growth's night). The whole plan runs only after a road,
 * zone or decor stroke (or on a client that just loaded), so it is a single tick's cost, held to half
 * the 12 ms worst-tick budget (growth.ts). The full cut is a one-off (a valley zoned in one go).
 */
export const LOTS_BUDGET = { refitMs: 0.5, afterBuildingMs: 1, strokeMs: 6, fullCutMs: 150 };

const S = MAP_SIZE;
const BLOCK_X = 16;
const BLOCK_Z = 12;
const ACROSS = 7;
const DOWN = 7;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** A flat standard world with a street grid and its blocks zoned (Townhouses and Shops in a checker). */
export function streetGrid(kind: number = Road.street): WorldState {
  const world = createWorld('bench-r2f', { ...defaultSettings(), mode: 'standard' });
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
  const x0 = 20;
  const z0 = 20;
  const xs = x0 + ACROSS * BLOCK_X;
  const zs = z0 + DOWN * BLOCK_Z;
  for (let k = 0; k <= DOWN; k++) for (let x = x0; x <= xs; x++) m.road[(z0 + k * BLOCK_Z) * S + x] = kind;
  for (let k = 0; k <= ACROSS; k++) for (let z = z0; z <= zs; z++) m.road[z * S + x0 + k * BLOCK_X] = kind;
  const homes = content.zoneById.get('homes-medium')!.layerValue;
  const shops = content.zoneById.get('shops')!.layerValue;
  for (let bz = 0; bz < DOWN; bz++) {
    for (let bx = 0; bx < ACROSS; bx++) {
      const zone = (bx + bz) % 3 === 0 ? shops : homes;
      for (let z = z0 + bz * BLOCK_Z + 1; z < z0 + (bz + 1) * BLOCK_Z; z++)
        for (let x = x0 + bx * BLOCK_X + 1; x < x0 + (bx + 1) * BLOCK_X; x++) m.zone[z * S + x] = zone;
    }
  }
  world.networkVersion += 1;
  return world;
}

export function lotsBench(): { lines: string[]; failures: string[]; report: object } {
  const lines: string[] = [];
  const failures: string[] = [];
  const ok = (pass: boolean) => (pass ? 'ok' : 'OVER BUDGET');

  // The full cut from scratch.
  const cut: number[] = [];
  let world = streetGrid();
  for (let n = 0; n < 7; n++) {
    world = streetGrid();
    const t0 = performance.now();
    zoningPass(world, null);
    cut.push(performance.now() - t0);
  }
  const plots = world.lots.filter((l) => l.kind === 'plot' && l.row !== 0).length;
  const gardens = world.lots.filter((l) => l.kind === 'garden').length;
  const fullMs = median(cut);

  // The pass after one building is added: the lots, gardens and rows stand; nothing is cut or lifted for good.
  const lot = world.lots.filter((l) => l.kind === 'plot' && l.row !== 0 && !l.buildingId);
  const def = content.buildingById.get('townhouse')!;
  const after: number[] = [];
  const stroke: number[] = [];
  for (let n = 0; n < 15; n++) {
    const l = lot[n * 3]!;
    const b = insertBuilding(world, null, def, l.x, l.z, l.rot, 0, { lot: l.id, site: false, storeys: 2 });
    l.buildingId = b.id;
    // The zoning system knows only a grown building came since its last pass.
    const t0 = performance.now();
    const r = zoningPass(world, null, false, true);
    after.push(performance.now() - t0);
    // The whole plan, as after a road or zone stroke (or on a client that just loaded): the same lots.
    const t1 = performance.now();
    const full = zoningPass(world, null, false);
    stroke.push(performance.now() - t1);
    if (r.added + r.removed + full.added + full.removed !== 0)
      failures.push(
        `lots: a pass after a building changed ${r.added + r.removed + full.added + full.removed} lots`,
      );
  }
  const afterMs = median(after);
  const strokeMs = median(stroke);

  // The same pass on the same grid laid as lanes (C4B's cut, no rows or gardens), for comparison.
  const lanes = streetGrid(Road.lane);
  zoningPass(lanes, null);
  const laneLots = lanes.lots.filter((l) => !l.buildingId);
  const laneAfter: number[] = [];
  for (let n = 0; n < 15; n++) {
    const l = laneLots[n * 3]!;
    const b = insertBuilding(lanes, null, def, l.x, l.z, l.rot, 0, { lot: l.id, site: false, storeys: 2 });
    l.buildingId = b.id;
    const t0 = performance.now();
    zoningPass(lanes, null, false);
    laneAfter.push(performance.now() - t0);
  }
  const laneMs = median(laneAfter);

  // The hourly refit over a street grid built up (every row lot a building), then the idle refit.
  for (const l of world.lots) {
    if (l.kind !== 'plot' || l.row === 0 || l.buildingId) continue;
    const b = insertBuilding(world, null, def, l.x, l.z, l.rot, 0, { lot: l.id, site: false, storeys: 2 });
    l.buildingId = b.id;
  }
  refitStoreys(world, null);
  // The hour as the zoning system runs it: one home moves up a tier (its def swaps, as tiers does),
  // so the refit reads every building's tier and level and refits that home's row alone.
  const homes = world.buildings.filter((b) => b.lot);
  const refit: number[] = [];
  const quiet: number[] = [];
  for (let n = 0; n < 25; n++) {
    const b = homes[(n * 37) % homes.length]!;
    b.def = b.def === 'townhouse' ? 'cottage' : 'townhouse';
    const t0 = performance.now();
    const r = refitStoreys(world, null);
    refit.push(performance.now() - t0);
    if (r.full) failures.push('lots: the hourly refit after a tier change refit every row');
    const t1 = performance.now();
    refitStoreys(world, null);
    quiet.push(performance.now() - t1);
  }
  const refitMs = median(refit);
  const quietMs = median(quiet);
  // Every row, as after the lots or buildings moved (or on a client that just loaded).
  const whole: number[] = [];
  for (let n = 0; n < 9; n++) {
    const t0 = performance.now();
    refitStoreys(world, null, true);
    whole.push(performance.now() - t0);
  }
  const wholeRefitMs = median(whole);

  lines.push(
    `lots street grid  ${plots} row lots, ${gardens} gardens: full cut ${fullMs.toFixed(1)} ms (cap ${LOTS_BUDGET.fullCutMs}) ${ok(fullMs <= LOTS_BUDGET.fullCutMs)}`,
    `lots after a building  pass ${afterMs.toFixed(3)} ms (budget ${LOTS_BUDGET.afterBuildingMs}) ${ok(afterMs <= LOTS_BUDGET.afterBuildingMs)}; the same grid of lanes ${laneMs.toFixed(3)} ms (${lanes.lots.length} lots)`,
    `lots after a stroke  whole plan ${strokeMs.toFixed(3)} ms (budget ${LOTS_BUDGET.strokeMs}, worst tick) ${ok(strokeMs <= LOTS_BUDGET.strokeMs)}`,
    `lots hourly refit  ${refitMs.toFixed(3)} ms with a tier change, ${quietMs.toFixed(3)} ms quiet, over ${plots} built row lots (budget ${LOTS_BUDGET.refitMs}) ${ok(refitMs <= LOTS_BUDGET.refitMs)}; every row ${wholeRefitMs.toFixed(3)} ms (after lots or buildings move)`,
  );
  if (fullMs > LOTS_BUDGET.fullCutMs)
    failures.push(`lots full cut ${fullMs.toFixed(1)} ms over ${LOTS_BUDGET.fullCutMs}`);
  if (afterMs > LOTS_BUDGET.afterBuildingMs)
    failures.push(`lots pass after a building ${afterMs.toFixed(3)} ms over ${LOTS_BUDGET.afterBuildingMs}`);
  if (strokeMs > LOTS_BUDGET.strokeMs)
    failures.push(`lots whole plan ${strokeMs.toFixed(3)} ms over ${LOTS_BUDGET.strokeMs}`);
  if (refitMs > LOTS_BUDGET.refitMs)
    failures.push(`lots hourly refit ${refitMs.toFixed(3)} ms over ${LOTS_BUDGET.refitMs}`);
  return {
    lines,
    failures,
    report: {
      plots,
      gardens,
      fullMs,
      afterMs,
      strokeMs,
      laneMs,
      refitMs,
      quietMs,
      wholeRefitMs,
      budget: LOTS_BUDGET,
    },
  };
}
