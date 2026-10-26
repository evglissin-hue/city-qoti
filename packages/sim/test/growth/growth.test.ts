// C4B growth: the nightly pass scores lots, works out demand per zone and starts grown sites
// (docs/spec/13-ledger.md, Zoning and growth). Most tests call growthPass directly on the village
// fixture; the one that runs the clock switches off residents, so the fixture's households stay as
// they are, and checks the site goes up through ordinary construction.
import { content, type BuildingDef } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, Zone } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { growLot, lotPlacement } from '../../src/systems/growth/api';
import { GROWTH_MAX_SITES, GROWTH_RESERVE, growthDemand, growthPass } from '../../src/systems/growth';
import { bestMethod, shortages } from '../../src/systems/growth/recipes';
import { withoutSystems } from '../../src/systems';
import { doorTile } from '../../src/systems/movement/api';
import { advanceTo, createTickCtx } from '../../src/turn';
import { townStock } from '../../src/view/hamlet';
import { villageFixture } from '../fixtures/village';
import { run, S } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { frontageMap, lotsIn, paintZone, zoneNow } from './helpers';

const good = (id: string) => content.goodIndex.get(id)!;

/** A built workplace nobody works at yet, so the town has open jobs. */
function openWork(state: WorldState, x = 88, z = 46): Building {
  return insertBuilding(state, null, content.buildingById.get('sawpit')!, x, z, 0, 0, { site: false });
}

function grown(state: WorldState): Building[] {
  return state.buildings.filter((b) => b.lot && b.stage === 'construction');
}

function night(state: WorldState): number {
  return growthPass(state, createTickCtx(state));
}

describe('grown sites', () => {
  it('stand flush with the road, door onto it, set along a wide lot by the lot itself', () => {
    const f = villageFixture();
    const s = f.state;
    const lot = findById(s.lots, f.lots.shops[0]!)!;
    const stall = content.buildingById.get('market-stall')!;
    const at = lotPlacement(s, lot, stall)!;
    expect(at[1]).toBe(lot.z);
    expect(at[0]).toBeGreaterThanOrEqual(lot.x);
    expect(at[0]).toBeLessThanOrEqual(lot.x + lot.w - 1);
    const b = growLot(s, createTickCtx(s), lot.id, 'market-stall')!;
    expect(s.map.road[doorTile(b)]).toBeGreaterThan(0);
    expect(b.style).toBe('plaster');
    expect(b.rt!.construction!.paid).toBe(0);
  });
});

describe('the nightly growth pass', () => {
  it('grows homes on the best lots while newcomers would come and there is work, then stops', () => {
    const f = villageFixture();
    const s = f.state;
    openWork(s);
    openWork(s, 91, 46);
    const before = moneySnapshot(s);
    const demand = growthDemand(s);
    expect(demand.homes).toBeGreaterThan(0);
    const started = night(s);
    expect(started).toBeGreaterThan(0);
    const homes = grown(s).filter((b) => content.buildingById.get(b.def)!.housing);
    expect(homes.length).toBeGreaterThan(0);
    for (const b of homes) expect(findById(s.lots, b.lot!)!.zone).toBe(Zone.homesLow);
    // The best lots went first.
    const empty = s.lots.filter((l) => l.zone === Zone.homesLow && !l.buildingId);
    const taken = homes.map((b) => findById(s.lots, b.lot!)!);
    for (const t of taken)
      for (const e of empty) expect(t.desirability).toBeGreaterThanOrEqual(e.desirability);
    // Enough homes are going up for the work on offer: the next nights add none.
    expect(growthDemand(s).homes).toBe(0);
    expect(night(s)).toBe(0);
    expect(night(s)).toBe(0);
    expectMoneyInvariant(before, s);
  });

  it('grows no homes while there is no work for newcomers', () => {
    const f = villageFixture();
    const s = f.state;
    for (const b of s.buildings) {
      const def = content.buildingById.get(b.def)!;
      if (def.jobs && b.rt) b.rt.paused = true;
    }
    expect(growthDemand(s).homes).toBe(0);
    night(s);
    expect(grown(s).filter((b) => content.buildingById.get(b.def)!.housing)).toHaveLength(0);
  });

  it('grows a shop where households have no outlet in reach, and only there', () => {
    const f = villageFixture();
    const s = f.state;
    // Shops zoned along street B, among the houses no stall reaches.
    paintZone(s, 'shops', [66, 71, 80, 73]);
    zoneNow(s);
    expect(growthDemand(s).shops).toBe(1);
    night(s);
    const shop = grown(s).find((b) => findById(s.lots, b.lot!)!.zone === Zone.shops);
    expect(shop, frontageMap(s, [60, 66, 84, 74])).toBeDefined();
    expect(shop!.z).toBeGreaterThanOrEqual(71);
    // The fixture's shop lots by the stalls on lane A reach nobody new: still empty.
    for (const id of f.lots.shops) expect(findById(s.lots, id)!.buildingId).toBe(0);
  });

  it('grows a workshop for what the market is short of, and none when nothing is', () => {
    const f = villageFixture();
    const s = f.state;
    paintZone(s, 'crafts', [83, 44, 95, 49]);
    zoneNow(s);
    expect(lotsIn(s, [83, 44, 95, 49]).length).toBeGreaterThan(0);
    // Nothing short yet: no workshop.
    s.market.demand.fill(0);
    s.economy.yesterday.consumed.fill(0);
    expect(growthDemand(s).crafts).toBe(0);
    night(s);
    expect(grown(s).some((b) => findById(s.lots, b.lot!)!.zone === Zone.crafts)).toBe(false);
    // Planks run short: the sawpit (which the logs in stock can feed) grows.
    s.market.demand[good('planks')] = 40;
    expect(growthDemand(s).crafts).toBe(1);
    night(s);
    const shop = grown(s).find((b) => findById(s.lots, b.lot!)!.zone === Zone.crafts);
    expect(shop?.def).toBe('sawpit');
  });

  it('grows a farm when food runs low, and gives it the farm land behind as fields', () => {
    const f = villageFixture();
    const s = f.state;
    // Fertile farm land north of lane A, east of the stalls; empty the larders.
    for (let z = 36; z <= 49; z++) for (let x = 83; x <= 96; x++) s.map.fertility[z * S + x] = 80;
    paintZone(s, 'farms', [83, 38, 96, 49]);
    zoneNow(s);
    for (const b of s.buildings) {
      if (!b.rt) continue;
      for (const g of content.goods.filter((x) => x.food)) {
        b.rt.store[good(g.id)] = 0;
        b.rt.output[good(g.id)] = 0;
      }
    }
    for (const h of s.households) h.pantry.fill(0);
    expect(growthDemand(s).farms).toBe(1);
    night(s);
    const farm = grown(s).find((b) => findById(s.lots, b.lot!)!.zone === Zone.farms)!;
    expect(farm).toBeDefined();
    // Finished, it takes fields on the zoned land behind the lots, nearest first.
    farm.stage = 'built';
    farm.rt!.construction = null;
    night(s);
    let fields = 0;
    for (let i = 0; i < s.map.fieldOwner.length; i++) if (s.map.fieldOwner[i] === farm.id) fields++;
    expect(fields).toBeGreaterThan(0);
    for (let i = 0; i < s.map.fieldOwner.length; i++) {
      if (s.map.fieldOwner[i] !== farm.id) continue;
      expect(s.map.zone[i]).toBe(Zone.farms);
      expect(s.map.lot[i]).toBe(0);
    }
  });

  it('waits when the storehouses cannot spare the materials, and keeps a few sites at a time', () => {
    const f = villageFixture();
    const s = f.state;
    openWork(s);
    openWork(s, 91, 46);
    const planks = good('planks');
    for (const b of s.buildings) if (b.rt) b.rt.store[planks] = 0;
    // Just under the cheapest stand-in's planks (a stall's) plus the reserve.
    const stall = content.buildingById.get('market-stall')!;
    const need = stall.cost!.goods!.find(([g]) => g === 'planks')![1];
    findById(s.buildings, f.b.storehouses[0])!.rt!.store[planks] = need + GROWTH_RESERVE - 1;
    expect(growthDemand(s).homes).toBeGreaterThan(0);
    expect(night(s)).toBe(0);
    findById(s.buildings, f.b.storehouses[0])!.rt!.store[planks] = 400;
    // Lots of work on offer: still never more than a few grown sites at once.
    for (let k = 0; k < 6; k++) openWork(s, 30 + k * 3, 30);
    for (let d = 0; d < 5; d++) night(s);
    expect(grown(s).length).toBeLessThanOrEqual(GROWTH_MAX_SITES);
  });

  it('builds a grown site with the town builders, then the lot reads as taken', () => {
    const f = villageFixture();
    const s = f.state;
    openWork(s);
    const ctx = createTickCtx(s);
    withoutSystems(['residents'], () => advanceTo(s, TICKS_PER_DAY, ctx));
    const sites = s.buildings.filter((b) => b.lot && b.lot !== f.lots.homes[0]);
    expect(sites.length).toBeGreaterThan(0);
    for (const b of sites) expect(findById(s.lots, b.lot!)!.buildingId).toBe(b.id);
    expect(ctx.events.some((e) => e.e === 'lot.updated')).toBe(true);
  });
});

describe('grown crafts and farms choose what to make', () => {
  const workshop: BuildingDef = {
    id: 'test-workshop',
    name: 'Test workshop',
    lane: 'ledger',
    category: 'production',
    size: [2, 2],
    entrance: [1, 1],
    cost: { goods: [['planks', 4]] },
    jobs: { count: 2, role: 'worker' },
    methods: [
      {
        id: 'saw',
        name: 'Saw',
        kind: 'craft',
        inputs: [['logs', 2]],
        outputs: [['planks', 2]],
        hours: 4,
        workers: 2,
      },
      {
        id: 'grind',
        name: 'Grind',
        kind: 'craft',
        inputs: [['wheat', 2]],
        outputs: [['flour', 2]],
        hours: 4,
        workers: 2,
      },
      {
        id: 'yarn',
        name: 'Spin',
        kind: 'craft',
        inputs: [['wool', 2]],
        outputs: [['yarn', 2]],
        hours: 4,
        workers: 2,
      },
    ],
    grows: { zone: 'crafts' },
    art: { kit: 'workshop' },
  };

  function withWorkshop<T>(fn: () => T): T {
    const list = content.buildings as BuildingDef[];
    const byId = content.buildingById as Map<string, BuildingDef>;
    list.push(workshop);
    byId.set(workshop.id, workshop);
    try {
      return fn();
    } finally {
      list.splice(list.indexOf(workshop), 1);
      byId.delete(workshop.id);
    }
  }

  it('picks the method for the shortest good it can feed, and never one it cannot', () => {
    const f = villageFixture();
    const s = f.state;
    const stock = townStock(s);
    s.market.demand.fill(0);
    s.economy.yesterday.consumed.fill(0);
    s.market.demand[good('flour')] = 30;
    s.market.demand[good('yarn')] = 90;
    // No wool in town, and none ever made: spinning cannot be fed.
    for (const b of s.buildings) if (b.rt) b.rt.store[good('wool')] = 0;
    const [k] = bestMethod(s, workshop, shortages(s, townStock(s)), townStock(s));
    expect(workshop.methods![k]!.id).toBe('grind');
    expect(stock.length).toBe(content.goods.length);
  });

  it('switches to a much shorter good by night, but never away from a pinned method', () => {
    withWorkshop(() => {
      const f = villageFixture();
      const s = f.state;
      paintZone(s, 'crafts', [83, 44, 95, 49]);
      zoneNow(s);
      s.market.demand.fill(0);
      s.economy.yesterday.consumed.fill(0);
      // Flour a little short (a third of a day), nothing else wanted.
      s.market.demand[good('flour')] = 30;
      findById(s.buildings, f.b.storehouses[0])!.rt!.store[good('flour')] = 80;
      night(s);
      const b = grown(s).find((x) => x.def === 'test-workshop')!;
      expect(b).toBeDefined();
      expect(b.rt!.method).toBe(1);
      b.stage = 'built';
      b.rt!.construction = null;
      // Planks run far shorter than flour now: it changes over at night.
      s.market.demand[good('planks')] = 200;
      night(s);
      expect(b.rt!.method).toBe(0);
      // Pinned to grinding, it grinds whatever the market says.
      run(s, { t: 'build.pinRecipe', id: b.id, method: 'grind' });
      night(s);
      expect(b.rt!.method).toBe(1);
      expect(b.rt!.pinned).toBe('grind');
    });
  });
});
