// A deterministic small hamlet for unit tests (C3.0). Built directly in state on the flat test
// world (grass at height 2, river at x 100 and 101), in standard mode, so every track can test
// against the same town before the others land:
//
//   z=46..49  north of the lane: town hall, storehouse, three cottages, bakery, windmill, sawpit,
//             market stall, all facing the lane
//   z=50      the lane from x 40 to 90; a path crosses it at x 61 from z 40 to 60
//   z=52      the well, benches, lanterns and flowers south of the lane
//
// Three households (9 residents): the Thistledowns (rabbits), the Underbanks (otters) and the
// Quills (mice). Jobs: two town hall builders, two storehouse porters, a baker, a vendor.
import { content } from '@qoti/content';
import { MAP_SIZE, NEED_IDS, START_TREASURY } from '../../src/constants';
import type {
  Building,
  Decor,
  EntityId,
  Household,
  Resident,
  Rot4,
  TierId,
  WorldState,
} from '../../src/contracts';
import { Road, treeValue, TREE_SPECIES } from '../../src/map/layers';
import { findById } from '../../src/state/entities';
import { goodsArray } from '../../src/state/hamlet';
import { insertBuilding } from '../../src/state/place';
import { worldIndex } from '../../src/state/worldIndex';
import { doorTile } from '../../src/systems/movement/api';
import { flatWorld, S } from '../helpers';

export interface HamletFixture {
  state: WorldState;
  /** Building ids by role. */
  b: {
    townHall: EntityId;
    storehouse: EntityId;
    cottages: [EntityId, EntityId, EntityId];
    bakery: EntityId;
    windmill: EntityId;
    sawpit: EntityId;
    stall: EntityId;
    well: EntityId;
  };
  households: [EntityId, EntityId, EntityId];
  /** Resident ids per household, in member order. */
  residents: EntityId[][];
  decor: { benches: EntityId[]; lanterns: EntityId[]; flowers: EntityId[] };
}

function place(
  state: WorldState,
  def: string,
  x: number,
  z: number,
  rot: Rot4 = 0,
  seat: 0 | 1 = 0,
): Building {
  return insertBuilding(state, null, content.buildingById.get(def)!, x, z, rot, seat, { site: false });
}

function stock(b: Building, pairs: [string, number][], where: 'store' | 'input' | 'output' = 'store'): void {
  for (const [good, qty] of pairs) b.rt![where][content.goodIndex.get(good)!] = qty;
}

function addDecor(state: WorldState, def: string, x: number, z: number, seat: 0 | 1 = 0): EntityId {
  const d: Decor = { id: state.nextId++, def, fx: x * 256 + 128, fz: z * 256 + 128, rot: 0, builtBy: seat };
  state.decor.push(d);
  worldIndex(state).decorGrid.add(d);
  return d.id;
}

interface Person {
  given: string;
  species: string;
  stage: Resident['stage'];
  traits: [string, string];
  job?: EntityId;
}

function addHousehold(
  state: WorldState,
  family: string,
  home: Building,
  people: Person[],
  tier: TierId = 'settler',
): { household: EntityId; members: EntityId[] } {
  const h: Household = {
    id: state.nextId++,
    family,
    members: [],
    homeId: home.id,
    pantry: goodsArray(),
    recentFoods: [],
    savings: 0,
    tier,
    arrivedDay: 0,
    lowMoodDays: 0,
  };
  h.pantry[content.goodIndex.get('bread')!] = 3;
  h.pantry[content.goodIndex.get('vegetables')!] = 3;
  state.households.push(h);
  const door = doorTile(home);
  for (const p of people) {
    const r: Resident = {
      id: state.nextId++,
      given: p.given,
      family,
      species: p.species,
      stage: p.stage,
      bornDay: p.stage === 'child' ? -30 : p.stage === 'elder' ? -400 : -200,
      traits: [...p.traits],
      householdId: h.id,
      jobId: p.job ?? 0,
      tier,
      mood: 65,
      needs: NEED_IDS.map(() => 70),
      modifiers: [],
      bond: 1,
      friends: [],
      activity: { kind: 'home' },
      move: null,
      tile: door,
      inside: home.id,
      carry: null,
      wishId: 0,
      history: [{ day: 0, kind: 'arrived' }],
      flags: 0,
      look: (h.id * 7919 + state.nextId * 104729) >>> 0,
    };
    state.residents.push(r);
    h.members.push(r.id);
    if (p.job) {
      const job = findById(state.buildings, p.job)!;
      job.rt!.workers.push(r.id);
    }
  }
  return { household: h.id, members: h.members };
}

export function hamletFixture(): HamletFixture {
  const state = flatWorld();
  state.settings.mode = 'standard';
  state.economy.treasury = START_TREASURY;

  for (let x = 40; x <= 90; x++) state.map.road[50 * S + x] = Road.lane;
  for (let z = 40; z <= 60; z++) if (z !== 50) state.map.road[z * S + 61] = Road.path;

  const townHall = place(state, 'town-hall', 44, 46);
  const storehouse = place(state, 'storehouse', 49, 47);
  const c1 = place(state, 'cottage', 53, 48);
  const c2 = place(state, 'cottage', 56, 48);
  const c3 = place(state, 'cottage', 62, 48, 0, 1);
  const bakery = place(state, 'bakery', 65, 48);
  const windmill = place(state, 'windmill', 68, 48);
  const sawpit = place(state, 'sawpit', 71, 47);
  const stall = place(state, 'market-stall', 74, 48, 0, 1);
  const well = place(state, 'well', 57, 52);

  stock(storehouse, [
    ['logs', 40],
    ['planks', 30],
    ['stone', 20],
    ['wheat', 12],
    ['bread', 16],
    ['vegetables', 16],
    ['fish', 8],
  ]);
  stock(stall, [
    ['bread', 10],
    ['vegetables', 8],
  ]);
  stock(bakery, [['flour', 4]], 'input');
  stock(sawpit, [['logs', 4]], 'input');

  const thistledown = addHousehold(state, 'Thistledown', c1, [
    {
      given: 'Clover',
      species: 'rabbit',
      stage: 'adult',
      traits: ['cheerful', 'green-fingered'],
      job: townHall.id,
    },
    { given: 'Hazel', species: 'rabbit', stage: 'adult', traits: ['shy', 'bookish'], job: bakery.id },
    { given: 'Pip', species: 'rabbit', stage: 'child', traits: ['curious', 'sporty'] },
  ]);
  const underbank = addHousehold(state, 'Underbank', c2, [
    { given: 'Wendell', species: 'otter', stage: 'adult', traits: ['grumpy', 'practical'], job: townHall.id },
    {
      given: 'Marina',
      species: 'otter',
      stage: 'adult',
      traits: ['romantic', 'night-owl'],
      job: storehouse.id,
    },
    { given: 'Finn', species: 'otter', stage: 'young', traits: ['sporty', 'cheerful'], job: storehouse.id },
  ]);
  const quill = addHousehold(state, 'Quill', c3, [
    { given: 'Pippa', species: 'mouse', stage: 'young', traits: ['curious', 'practical'], job: stall.id },
    { given: 'Tansy', species: 'mouse', stage: 'elder', traits: ['sweet-tooth', 'homebody'] },
    { given: 'Crumb', species: 'mouse', stage: 'adult', traits: ['early-bird', 'generous'] },
  ]);

  const benches = [addDecor(state, 'bench', 56, 53), addDecor(state, 'bench', 58, 53, 1)];
  const lanterns = [addDecor(state, 'lantern', 55, 51), addDecor(state, 'lantern', 60, 51, 1)];
  const flowers = [addDecor(state, 'flower-bed', 54, 53), addDecor(state, 'planter', 59, 53)];
  state.map.tree[54 * S + 57] = treeValue(TREE_SPECIES.oak, 3);
  state.map.tree[55 * S + 52] = treeValue(TREE_SPECIES.birch, 3);

  state.networkVersion = 1;
  state.hearth.hints = content.patterns.slice(0, 3).map((p) => p.id);
  // Everything starts dirty, so the first charm pass covers the whole map.
  for (let c = 0; c < (MAP_SIZE / 16) * (MAP_SIZE / 16); c++) state.hearth.dirtyChunks.push(c);

  return {
    state,
    b: {
      townHall: townHall.id,
      storehouse: storehouse.id,
      cottages: [c1.id, c2.id, c3.id],
      bakery: bakery.id,
      windmill: windmill.id,
      sawpit: sawpit.id,
      stall: stall.id,
      well: well.id,
    },
    households: [thistledown.household, underbank.household, quill.household],
    residents: [thistledown.members, underbank.members, quill.members],
    decor: { benches, lanterns, flowers },
  };
}
