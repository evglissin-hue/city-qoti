// A deterministic village for I2 unit tests (C4.0): about 60 residents at Village rank, built
// directly in state on the flat test world (grass at height 2, river at x 100 and 101), so every
// I2 track can test against the same town before the others land.
//
//   z=46..49  north of lane A (z=50, x 32 to 96): town hall, storehouse A, seven cottages, bakery,
//             windmill, sawpit, two market stalls, all facing the lane
//   z=50      lane A; a path crosses at x 64 from z 40 to 80; a lane joins A and B at x 32
//   z=51..53  shops zoned south of lane A (x 66 to 81), cut into four 2x3 lots facing north
//   z=66..69  north of street B (z=70, x 32 to 96, cobbled): eight houses (four of Craftsfolk),
//             storehouse B, wells at (60, 52) and (60, 72)
//   z=71..73  homes zoned south of street B (x 40 to 61), cut into seven 2x2 lots facing north;
//             the first holds a grown cottage (style 'timber')
//
// Fifteen households, 60 residents: seven Settler families in the cottages, four Settler and four
// Craftsfolk families in the houses. Jobs: builders, porters at both storehouses, bakers, a miller,
// sawyers and two vendors. Savings: Settlers 20 coins, Craftsfolk 60. One open plan, one open
// goods request, a standing order and a small loan; Cobbles unlocked; five days of price history.
import { content } from '@qoti/content';
import { MAP_SIZE, NEED_IDS, PENNIES_PER_COIN, START_TREASURY, Zone } from '../../src/constants';
import type {
  Building,
  EntityId,
  Household,
  Lot,
  Resident,
  Rot4,
  TierId,
  WorldState,
} from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { findById } from '../../src/state/entities';
import { goodsArray } from '../../src/state/hamlet';
import { insertBuilding } from '../../src/state/place';
import { doorTile } from '../../src/systems/movement/api';
import { charterFrom } from '../../src/state/village';
import { flatWorld, S } from '../helpers';

export interface VillageFixture {
  state: WorldState;
  b: {
    townHall: EntityId;
    storehouses: [EntityId, EntityId];
    cottages: EntityId[];
    houses: EntityId[];
    bakery: EntityId;
    windmill: EntityId;
    sawpit: EntityId;
    stalls: [EntityId, EntityId];
    wells: [EntityId, EntityId];
    /** The cottage grown on the first homes lot. */
    grown: EntityId;
  };
  /** Lots: shops along lane A, homes along street B (the first holds `grown`). */
  lots: { shops: EntityId[]; homes: EntityId[] };
  households: EntityId[];
  /** Craftsfolk households (in the first four houses). */
  craftsfolk: EntityId[];
  residents: EntityId[];
  plan: EntityId;
  request: EntityId;
  loan: EntityId;
}

const SPECIES = ['rabbit', 'otter', 'mouse', 'hedgehog', 'fox', 'badger', 'squirrel'] as const;
const TRAIT_PAIRS: [string, string][] = [
  ['cheerful', 'green-fingered'],
  ['shy', 'bookish'],
  ['practical', 'early-bird'],
  ['romantic', 'night-owl'],
  ['curious', 'sporty'],
  ['generous', 'homebody'],
  ['thrifty', 'practical'],
  ['sweet-tooth', 'artistic'],
];
const STAGES: Resident['stage'][] = ['adult', 'adult', 'young', 'child'];

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

function stock(b: Building, pairs: [string, number][], where: 'store' | 'input' = 'store'): void {
  for (const [good, qty] of pairs) b.rt![where][content.goodIndex.get(good)!] = qty;
}

/** A household of four (two adults, a young one, a child) of one species; jobs for the grown-ups. */
function addFamily(
  state: WorldState,
  n: number,
  home: Building,
  tier: TierId,
  jobs: EntityId[],
): { household: EntityId; members: EntityId[] } {
  const species = SPECIES[n % SPECIES.length]!;
  const sp = content.speciesById.get(species)!;
  const family = content.familyNames[(n * 7) % content.familyNames.length]!;
  const h: Household = {
    id: state.nextId++,
    family,
    members: [],
    homeId: home.id,
    pantry: goodsArray(),
    recentFoods: [],
    savings: (tier === 'craftsfolk' ? 60 : 20) * PENNIES_PER_COIN,
    tier,
    arrivedDay: 0,
    lowMoodDays: 0,
  };
  h.pantry[content.goodIndex.get('bread')!] = 3;
  h.pantry[content.goodIndex.get('vegetables')!] = 3;
  state.households.push(h);
  const door = doorTile(home);
  for (let k = 0; k < 4; k++) {
    const stage = STAGES[k]!;
    const job = stage === 'child' ? 0 : (jobs[k] ?? 0);
    const r: Resident = {
      id: state.nextId++,
      given: sp.givenNames[(n * 4 + k) % sp.givenNames.length]!,
      family,
      species,
      stage,
      bornDay: stage === 'child' ? -30 : stage === 'young' ? -100 : -200,
      traits: [...TRAIT_PAIRS[(n + k) % TRAIT_PAIRS.length]!],
      householdId: h.id,
      jobId: job,
      tier,
      mood: 62 + ((n + k) % 5) * 4,
      needs: NEED_IDS.map(() => 75),
      modifiers: [],
      bond: 1 + ((n + k) % 3),
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
    if (job) findById(state.buildings, job)!.rt!.workers.push(r.id);
  }
  return { household: h.id, members: h.members };
}

/** Cuts a lot (world-axis rect) facing the road, marks the lot layer. */
function cutLot(
  state: WorldState,
  zone: number,
  x: number,
  z: number,
  w: number,
  d: number,
  rot: Rot4,
  style: string,
): Lot {
  const frontageZ = rot === 2 ? z - 1 : z + d;
  const lot: Lot = {
    id: state.nextId++,
    zone,
    x,
    z,
    w,
    d,
    rot,
    frontage: frontageZ * MAP_SIZE + x,
    desirability: 50,
    style,
    buildingId: 0,
    tick: 0,
  };
  state.lots.push(lot);
  for (let tz = z; tz < z + d; tz++) {
    for (let tx = x; tx < x + w; tx++) {
      state.map.lot[tz * S + tx] = lot.id;
      state.map.zone[tz * S + tx] = zone;
    }
  }
  return lot;
}

export function villageFixture(): VillageFixture {
  const state = flatWorld();
  state.settings.mode = 'standard';
  state.settings.townName = 'Thistlecombe';
  state.economy.treasury = START_TREASURY;
  const m = state.map;

  for (let x = 32; x <= 96; x++) m.road[50 * S + x] = Road.lane;
  for (let x = 32; x <= 96; x++) m.road[70 * S + x] = Road.street;
  for (let z = 51; z < 70; z++) m.road[z * S + 32] = Road.lane;
  for (let z = 40; z <= 80; z++) if (z !== 50 && z !== 70) m.road[z * S + 64] = Road.path;

  const townHall = place(state, 'town-hall', 34, 46);
  const storeA = place(state, 'storehouse', 39, 47);
  const cottages: Building[] = [];
  for (let i = 0; i < 7; i++) cottages.push(place(state, 'cottage', 43 + i * 3, 48, 0, (i % 2) as 0 | 1));
  const bakery = place(state, 'bakery', 66, 48);
  const windmill = place(state, 'windmill', 69, 48);
  const sawpit = place(state, 'sawpit', 72, 47);
  const stallA = place(state, 'market-stall', 76, 48, 0, 1);
  const stallB = place(state, 'market-stall', 79, 48, 0, 1);
  const wellA = place(state, 'well', 60, 52);

  const houses: Building[] = [];
  for (let i = 0; i < 8; i++)
    houses.push(place(state, 'house', 34 + i * 3 + (i >= 4 ? 7 : 0), 67, 0, (i % 2) as 0 | 1));
  const storeB = place(state, 'storehouse', 84, 67);
  const wellB = place(state, 'well', 60, 72);
  for (let i = 0; i < 4; i++) houses[i]!.rt!.tier = 'craftsfolk';

  stock(storeA, [
    ['logs', 40],
    ['planks', 60],
    ['stone', 30],
    ['wheat', 20],
    ['bread', 30],
    ['vegetables', 30],
    ['fish', 10],
  ]);
  stock(storeB, [
    ['planks', 20],
    ['stone', 20],
    ['clay', 12],
    ['wool', 8],
    ['firewood', 24],
    ['cloth', 6],
  ]);
  stock(stallA, [
    ['bread', 12],
    ['vegetables', 10],
  ]);
  stock(stallB, [
    ['fish', 6],
    ['cheese', 4],
    ['firewood', 8],
  ]);
  stock(bakery, [['flour', 4]], 'input');
  stock(sawpit, [['logs', 4]], 'input');

  // Lots: shops facing lane A from the south, homes facing street B from the south.
  const shopLots = [0, 1, 2, 3].map((i) => cutLot(state, Zone.shops, 66 + i * 4, 51, 2, 3, 2, 'plaster').id);
  const homeLots = [0, 1, 2, 3, 4, 5, 6].map(
    (i) => cutLot(state, Zone.homesLow, 40 + i * 3, 71, 2, 2, 2, 'timber').id,
  );
  const firstLot = findById(state.lots, homeLots[0]!)!;
  const grown = insertBuilding(
    state,
    null,
    content.buildingById.get('cottage')!,
    firstLot.x,
    firstLot.z,
    2,
    0,
    {
      site: false,
      lot: firstLot.id,
      style: 'timber',
    },
  );
  firstLot.buildingId = grown.id;

  // Families: seven Settler families in the cottages, four Settler and four Craftsfolk in houses.
  const jobs: EntityId[][] = [
    [townHall.id, townHall.id, storeA.id],
    [storeA.id, storeA.id, storeA.id],
    [bakery.id, bakery.id],
    [windmill.id, sawpit.id, sawpit.id],
    [stallA.id, storeB.id],
    [storeB.id, storeB.id, storeB.id],
    [stallB.id],
  ];
  const households: EntityId[] = [];
  const craftsfolk: EntityId[] = [];
  const residents: EntityId[] = [];
  cottages.forEach((c, i) => {
    const f = addFamily(state, i, c, 'settler', jobs[i] ?? []);
    households.push(f.household);
    residents.push(...f.members);
  });
  houses.forEach((house, i) => {
    const tier: TierId = i < 4 ? 'craftsfolk' : 'settler';
    const f = addFamily(state, 7 + i, house, tier, []);
    households.push(f.household);
    residents.push(...f.members);
    if (tier === 'craftsfolk') craftsfolk.push(f.household);
  });

  // Village rank, with the Charter's unlocks and Cobbles in.
  state.charter.rank = 'village';
  state.charter.charter = charterFrom('village');
  state.charter.progress = [];
  state.charter.ready = false;
  state.charter.history = [{ rank: 'village', tick: 0, seats: [0, 1] }];
  for (const u of content.charterById.get('village')!.unlocks) state.hearth.unlocked.push(u);
  const cobbles = state.innovations.find((i) => i.id === 'cobbles')!;
  cobbles.unlockedTick = 0;
  cobbles.progress = 100;
  state.hearth.unlocked.push('street');

  // Five days of prices: bread climbing as stock runs short, the rest at base.
  const bread = content.goodIndex.get('bread')!;
  for (let d = 0; d < 5; d++) {
    const day = content.goods.map((g) => g.basePrice);
    day[bread] = 200 + d * 15;
    state.market.history.push(day);
  }
  state.market.prices[bread] = 260;
  state.market.demand[bread] = 70;
  state.market.cover[bread] = 60;

  state.trade.orders.push({
    good: content.goodIndex.get('planks')!,
    min: 0,
    max: 60,
    floor: 250,
    ceiling: 0,
    neighbor: '',
  });
  const loan = {
    id: state.nextId++,
    principal: 100 * PENNIES_PER_COIN,
    balance: 100 * PENNIES_PER_COIN,
    rate: 5,
    takenTick: 0,
  };
  state.loans.loans.push(loan);

  const plan = state.nextId++;
  state.plans.push({
    id: plan,
    name: 'A bench by the well',
    by: 1,
    tick: 0,
    items: [{ cmd: { t: 'decor.place', def: 'bench', fx: 61 * 256 + 128, fz: 53 * 256 + 128, rot: 0 } }],
    comments: [{ by: 1, tick: 0, text: 'Somewhere to sit while the buckets fill?' }],
    seenBy: [1],
    status: 'open',
  });
  const request = state.nextId++;
  state.requests.push({
    id: request,
    from: 0,
    ask: { kind: 'goods', good: 'cheese', qty: 12, byDay: 3, at: stallB.id },
    tick: 0,
    status: 'open',
    closedTick: 0,
  });

  state.networkVersion = 1;
  state.hearth.hints = content.patterns.slice(0, 3).map((p) => p.id);
  for (let c = 0; c < (MAP_SIZE / 16) * (MAP_SIZE / 16); c++) state.hearth.dirtyChunks.push(c);

  return {
    state,
    b: {
      townHall: townHall.id,
      storehouses: [storeA.id, storeB.id],
      cottages: cottages.map((c) => c.id),
      houses: houses.map((h) => h.id),
      bakery: bakery.id,
      windmill: windmill.id,
      sawpit: sawpit.id,
      stalls: [stallA.id, stallB.id],
      wells: [wellA.id, wellB.id],
      grown: grown.id,
    },
    lots: { shops: shopLots, homes: homeLots },
    households,
    craftsfolk,
    residents,
    plan,
    request,
    loan: loan.id,
  };
}
