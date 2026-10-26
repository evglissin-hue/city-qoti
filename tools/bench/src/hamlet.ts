// Economy scenarios (C3C): the standard valley's starting town with its first households, and a
// 40-resident hamlet for the per-tick budget (docs/spec/22-quality.md).
//
// Until C3A's residents system lands, a small stand-in plays its part: it hires, sends workers in
// at 08:00 and home at 17:00, feeds everyone at 07:00 and shops in the evening, teleporting like
// the C3.0 movement stub. Once C3A drives residents (it also books breakfast), set STAND_IN to
// false and the scenarios run on the real thing.
import type { BuildingDef } from '@qoti/content';
import { content } from '@qoti/content';
import {
  applyTurn,
  canPlaceBuilding,
  createTickCtx,
  createValley,
  defaultSettings,
  doorTile,
  findById,
  insertBuilding,
  MAP_SIZE,
  NEED_IDS,
  nearestOutletWithFood,
  PANTRY_CAPACITY,
  START_HOUR,
  takeFromOutlet,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TREE_MATURE,
  treeStage,
  type Building,
  type Command,
  type EntityId,
  type Household,
  type Resident,
  type Rot4,
  type SimCtx,
  type ValleySettings,
  type WorldState,
  worldIndex,
} from '@qoti/sim';

/** Flip to false once C3A's residents system is merged: the two must not both drive residents. */
export const STAND_IN = false;

const FOODS = content.goods.flatMap((g, i) => (g.food ? [i] : []));

export interface StandInStats {
  meals: number;
  /** Residents who found nothing in the pantry at breakfast. */
  hungry: number;
  /** Units carried home from outlets. */
  shopped: number;
}

export interface Hamlet {
  world: WorldState;
  ctx: SimCtx;
  stats: StandInStats;
  standIn: boolean;
}

// ------------------------------------------------------------------------------------------------
// The stand-in for C3A

/** Job preference: builders, two porters per storehouse, food, then the rest. */
function jobRank(b: Building, filled: number): number {
  switch (b.def) {
    case 'town-hall':
    case 'builders-yard':
      return 0;
    case 'storehouse':
      return filled < 2 ? 1 : 7;
    case 'vegetable-plot':
    case 'fishers-hut':
      return 2;
    case 'farmhouse':
    case 'windmill':
    case 'bakery':
      return 3;
    case 'market-stall':
      return 4;
    case 'woodcutter':
    case 'sawpit':
      return 5;
    default:
      return 6;
  }
}

function rankOf(world: WorldState, r: Resident): number {
  const b = r.jobId ? findById(world.buildings, r.jobId) : undefined;
  return b ? jobRank(b, b.rt!.workers.indexOf(r.id)) : Infinity;
}

/** Fills the best vacancy for each resident of working age; spare porters move to better jobs. */
function hire(world: WorldState): void {
  for (const r of world.residents) {
    if (r.stage !== 'adult' && r.stage !== 'young') continue;
    if (r.activity.kind === 'task') continue;
    const current = rankOf(world, r);
    let best: Building | null = null;
    let bestRank = current;
    for (const b of world.buildings) {
      const count = content.buildingById.get(b.def)?.jobs?.count ?? 0;
      if (b.stage !== 'built' || !b.rt || b.rt.workers.length >= count || b.id === r.jobId) continue;
      const rank = jobRank(b, b.rt.workers.length);
      if (rank < bestRank && (current === Infinity || current === 7)) {
        bestRank = rank;
        best = b;
      }
    }
    if (!best) continue;
    const old = r.jobId ? findById(world.buildings, r.jobId) : undefined;
    if (old?.rt) old.rt.workers = old.rt.workers.filter((id) => id !== r.id);
    r.jobId = best.id;
    best.rt!.workers.push(r.id);
    best.rt!.workers.sort((a, b) => a - b);
  }
}

function homeOf(world: WorldState, r: Resident): Building | undefined {
  const h = findById(world.households, r.householdId);
  return h ? findById(world.buildings, h.homeId) : undefined;
}

/** Workers in at work hours, everyone else at home; residents on a Ledger task are left alone. */
function presence(world: WorldState, workTime: boolean): void {
  for (const r of world.residents) {
    if (r.activity.kind === 'task') continue;
    const work = r.jobId ? findById(world.buildings, r.jobId) : undefined;
    const at = workTime && work && work.stage === 'built' ? work : homeOf(world, r);
    if (!at || r.inside === at.id) continue;
    r.inside = at.id;
    r.tile = doorTile(at);
    r.move = null;
    r.activity = at === work ? { kind: 'work', at: at.id } : { kind: 'home' };
  }
  for (const b of world.buildings) {
    if (!b.rt) continue;
    let n = 0;
    for (const id of b.rt.workers) if (findById(world.residents, id)?.inside === b.id) n++;
    b.rt.present = n;
  }
}

function eat(world: WorldState, stats: StandInStats): void {
  const e = world.economy;
  for (const h of world.households) {
    for (const _ of h.members) {
      let pick = -1;
      for (const g of FOODS) {
        if (!h.pantry[g]) continue;
        // Variety: the food eaten longest ago, then the one there is most of.
        const age = h.recentFoods.lastIndexOf(g);
        const best = pick < 0 ? Infinity : h.recentFoods.lastIndexOf(pick);
        if (pick < 0 || age < best || (age === best && h.pantry[g]! > h.pantry[pick]!)) pick = g;
      }
      if (pick < 0) {
        stats.hungry++;
        continue;
      }
      h.pantry[pick]! -= 1;
      h.recentFoods.push(pick);
      if (h.recentFoods.length > 9) h.recentFoods.shift();
      e.today.consumed[pick]! += 1;
      e.season.consumed[pick]! += 1;
      stats.meals++;
    }
  }
}

function pantryFood(h: Household): number {
  let n = 0;
  for (const g of FOODS) n += h.pantry[g]!;
  return n;
}

/** Households under two days of food walk to the nearest outlet, 4 units a trip, until full. */
function shop(world: WorldState, stats: StandInStats): void {
  for (const h of world.households) {
    const home = findById(world.buildings, h.homeId);
    if (!home || pantryFood(h) >= 2 * h.members.length) continue;
    for (let trip = 0; trip < 4 && pantryFood(h) < PANTRY_CAPACITY; trip++) {
      const outlet = nearestOutletWithFood(world, doorTile(home));
      if (!outlet) break;
      let carried = 0;
      for (const g of [...FOODS].sort((a, b) => h.pantry[a]! - h.pantry[b]! || a - b)) {
        const want = Math.min(4 - carried, PANTRY_CAPACITY - pantryFood(h));
        if (want <= 0) break;
        const got = takeFromOutlet(world, outlet, g, Math.min(want, 2));
        h.pantry[g]! += got;
        carried += got;
      }
      stats.shopped += carried;
      if (carried === 0) break;
    }
  }
}

/** One tick of the stand-in; call after every tick. */
export function standInTick(world: WorldState, stats: StandInStats): void {
  const tod = (world.tick + START_HOUR * TICKS_PER_HOUR) % TICKS_PER_DAY;
  const hour = Math.floor(tod / TICKS_PER_HOUR);
  if (tod % TICKS_PER_HOUR === 30) hire(world);
  if (tod === 7 * TICKS_PER_HOUR) eat(world, stats);
  if (tod % 10 === 0) presence(world, hour >= 8 && hour < 17);
  if (tod === 17 * TICKS_PER_HOUR + 100) shop(world, stats);
}

// ------------------------------------------------------------------------------------------------
// Building the scenarios

function addHousehold(world: WorldState, home: Building, family: string, species: string): void {
  const sp = content.speciesById.get(species)!;
  const traits = content.traits.map((t) => t.id);
  const h: Household = {
    id: world.nextId++,
    family,
    members: [],
    homeId: home.id,
    pantry: new Array<number>(content.goods.length).fill(0),
    recentFoods: [],
    savings: 0,
    tier: 'settler',
    arrivedDay: 0,
    lowMoodDays: 0,
  };
  h.pantry[content.goodIndex.get('bread')!] = 2;
  h.pantry[content.goodIndex.get('vegetables')!] = 2;
  world.households.push(h);
  const stages: Resident['stage'][] = ['adult', 'adult', 'young', 'child'];
  stages.forEach((stage, k) => {
    const r: Resident = {
      id: world.nextId++,
      given: sp.givenNames[(h.id + k) % sp.givenNames.length]!,
      family,
      species,
      stage,
      bornDay: stage === 'child' ? -30 : stage === 'young' ? -120 : -300,
      traits: [traits[(h.id + k) % traits.length]!, traits[(h.id + k + 5) % traits.length]!],
      householdId: h.id,
      jobId: 0,
      tier: 'settler',
      mood: 65,
      needs: NEED_IDS.map(() => 70),
      modifiers: [],
      bond: 1,
      friends: [],
      activity: { kind: 'home' },
      move: null,
      tile: doorTile(home),
      inside: home.id,
      carry: null,
      wishId: 0,
      history: [],
      flags: 0,
      look: (world.nextId * 2654435761) >>> 0,
    };
    world.residents.push(r);
    h.members.push(r.id);
  });
}

function center(world: WorldState): [number, number] {
  const th = world.buildings.find((b) => b.def === 'town-hall');
  if (th) return [th.x + 2, th.z + 2];
  const [x0, z0, x1, z1] = world.meta.startArea;
  return [(x0 + x1) >> 1, (z0 + z1) >> 1];
}

function crowded(world: WorldState, x0: number, z0: number, w: number, d: number): boolean {
  for (let z = z0 - 1; z <= z0 + d; z++) {
    for (let x = x0 - 1; x <= x0 + w; x++) {
      if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) continue;
      if (world.map.occupant[z * MAP_SIZE + x]) return true;
      // I2 (C4B): hand-placed buildings leave zoned land to grow.
      if (world.map.zone[z * MAP_SIZE + x]) return true;
    }
  }
  return false;
}

function matureTreesNear(world: WorldState, x: number, z: number, r: number): number {
  let n = 0;
  for (let tz = z - r; tz <= z + r; tz++) {
    for (let tx = x - r; tx <= x + r; tx++) {
      if (tx < 0 || tz < 0 || tx >= MAP_SIZE || tz >= MAP_SIZE) continue;
      const v = world.map.tree[tz * MAP_SIZE + tx]!;
      if (v && treeStage(v) >= TREE_MATURE) n++;
    }
  }
  return n;
}

/**
 * The nearest valid spot to the town center for a building, with a tile of space around it and,
 * for woodcutters, mature trees in reach. Null when nothing fits within `radius`.
 */
export function findSpot(world: WorldState, defId: string, radius = 40): [number, number, Rot4] | null {
  const def = content.buildingById.get(defId)!;
  const [cx, cz] = center(world);
  const reader = worldIndex(world).reader;
  for (let r = 3; r <= radius; r++) {
    let best: [number, number, Rot4] | null = null;
    let bestScore = -Infinity;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (let rot = 0 as Rot4; rot < 4; rot = (rot + 1) as Rot4) {
          const x = cx + dx;
          const z = cz + dz;
          const p = canPlaceBuilding(reader, def, x, z, rot);
          if (!p.ok) continue;
          const [w, d] = rot % 2 === 0 ? def.size : [def.size[1], def.size[0]];
          if (crowded(world, x, z, w, d)) continue;
          if (!nearStorehouse(world, def, x, z, rot)) continue;
          let score = p.warnings.includes('NO_ROAD') ? 0 : 1;
          if (defId === 'woodcutter') score = matureTreesNear(world, x, z, 8) >= 40 ? 1 : -1;
          if (score > bestScore) {
            bestScore = score;
            best = [x, z, rot];
          }
        }
      }
    }
    if (best && bestScore >= 0) return best;
  }
  return null;
}

/** Keeps new buildings within porter range (22 of 24 tiles) of a storehouse door. */
function nearStorehouse(world: WorldState, def: BuildingDef, x: number, z: number, rot: Rot4): boolean {
  const houses = world.buildings.filter((b) => b.def === 'storehouse');
  if (houses.length === 0) return true;
  const door = doorTile({ x, z, rot, def: def.id } as Building, def);
  return houses.some((h) => {
    const d = doorTile(h);
    return (
      Math.abs((d % MAP_SIZE) - (door % MAP_SIZE)) +
        Math.abs(Math.floor(d / MAP_SIZE) - Math.floor(door / MAP_SIZE)) <=
      22
    );
  });
}

/** Applies commands as one turn (seat 0) and returns whether each was accepted. */
export function command(h: Hamlet, cmds: Command[]): boolean[] {
  const before = h.ctx.events.length;
  applyTurn(
    h.world,
    { t: h.world.lastTurn + 1, cmds: cmds.map((cmd, i) => ({ seat: 0, seq: i + 1, cmd })) },
    h.ctx,
  );
  const rejected = new Set<number>();
  for (const e of h.ctx.events.slice(before)) if (e.e === 'command.rejected') rejected.add(e.seq);
  h.ctx.events.length = 0;
  return cmds.map((_, i) => !rejected.has(i + 1));
}

/** Places a building as a construction site, as a player would. Returns its id or 0. */
export function build(h: Hamlet, defId: string): EntityId {
  const spot = findSpot(h.world, defId);
  if (!spot) return 0;
  const [ok] = command(h, [{ t: 'build.place', def: defId, x: spot[0], z: spot[1], rot: spot[2] }]);
  return ok ? h.world.buildings[h.world.buildings.length - 1]!.id : 0;
}

function newHamlet(seed: string, economy: ValleySettings['economy'], standIn: boolean): Hamlet {
  const world = createValley(seed, { ...defaultSettings(), mode: 'standard', economy });
  world.time.connected = [0];
  world.time.desired = [1, 1, 1, 1];
  return { world, ctx: createTickCtx(world), stats: { meals: 0, hungry: 0, shopped: 0 }, standIn };
}

/** The standard starting town with its two households (8 residents) at home. */
export function startingTown(
  seed: string,
  opts: { standIn?: boolean; economy?: ValleySettings['economy'] } = {},
) {
  const h = newHamlet(seed, opts.economy ?? 'standard', opts.standIn ?? STAND_IN);
  if (h.standIn) {
    const cottages = h.world.buildings.filter((b) => b.def === 'cottage');
    addHousehold(h.world, cottages[0]!, content.familyNames[0]!, 'rabbit');
    addHousehold(h.world, cottages[1]!, content.familyNames[1]!, 'otter');
  }
  // Otherwise the founders walk in through the valley gate at 08:00 (C3A).
  return h;
}

/** Runs ticks at speed 1, the stand-in after each. Returns the ms spent inside the sim. */
export function runTicks(h: Hamlet, n: number, each?: (h: Hamlet) => void): number {
  let ms = 0;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    applyTurn(h.world, { t: h.world.lastTurn + 1, cmds: [] }, h.ctx);
    ms += performance.now() - t0;
    h.ctx.events.length = 0;
    h.ctx.dirty.clear();
    if (h.standIn) standInTick(h.world, h.stats);
    each?.(h);
  }
  return ms;
}

/**
 * A 40-resident hamlet: the starting town grown to ten cottages and the I1 chains (food, flour
 * and bread, timber, stone), with two sites under construction, all built directly into state.
 */
export function fortyResidentHamlet(seed: string): Hamlet {
  const h = newHamlet(seed, 'standard', STAND_IN);
  const w = h.world;
  const put = (defId: string): Building | null => {
    const spot = findSpot(w, defId);
    if (!spot) return null;
    const def = content.buildingById.get(defId)!;
    return insertBuilding(w, null, def, spot[0], spot[1], spot[2], 0, { site: false });
  };
  for (let i = 0; i < 8; i++) put('cottage');
  for (const id of [
    'builders-yard',
    'storehouse',
    'market-stall',
    'market-stall',
    'well',
    'vegetable-plot',
    'vegetable-plot',
    'fishers-hut',
    'farmhouse',
    'windmill',
    'bakery',
    'woodcutter',
    'foresters-lodge',
    'sawpit',
    'quarry',
  ]) {
    put(id);
  }
  const homes = w.buildings.filter((b) => b.def === 'cottage');
  homes.forEach((home, i) =>
    addHousehold(
      w,
      home,
      content.familyNames[i % content.familyNames.length]!,
      content.species[i % content.species.length]!.id,
    ),
  );
  // Fields for the farm: fertile tiles around it, painted through the command.
  const farm = w.buildings.find((b) => b.def === 'farmhouse');
  if (farm) {
    const tiles: [number, number][] = [];
    for (let z = farm.z - 6; z <= farm.z + 7; z++)
      for (let x = farm.x - 6; x <= farm.x + 7; x++) tiles.push([x, z]);
    command(h, [{ t: 'field.paint', farm: farm.id, tiles: tiles.slice(0, 256) }]);
  }
  const store = w.buildings.find((b) => b.def === 'storehouse')!;
  for (const [good, qty] of [
    ['planks', 60],
    ['stone', 30],
    ['wheat', 20],
  ] as const) {
    store.rt!.store[content.goodIndex.get(good)!]! += qty;
  }
  build(h, 'cottage');
  build(h, 'cottage');
  return h;
}
