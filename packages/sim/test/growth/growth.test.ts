// C4B growth: the nightly pass scores lots, works out demand per zone and starts grown sites
// (docs/spec/13-ledger.md, Zoning and growth). Most tests call growthPass directly on the village
// fixture; the one that runs the clock switches off residents, so the fixture's households stay as
// they are, and checks the site goes up through ordinary construction.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, Zone } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { isFood, methodOf } from '../../src/state/zones';
import { insertBuilding } from '../../src/state/place';
import { growLot, lotPlacement } from '../../src/systems/growth/api';
import { GROWTH_MAX_SITES, GROWTH_SHARE, growthDemand, growthPass } from '../../src/systems/growth';
import { shortages } from '../../src/systems/growth/recipes';
import { withoutSystems } from '../../src/systems';
import { doorTile } from '../../src/systems/movement/api';
import { openJobCount } from '../../src/systems/residents/jobs';
import { advanceTo, createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { S } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { frontageMap, lotsIn, paintZone, zoneNow } from './helpers';

const good = (id: string) => content.goodIndex.get(id)!;

/** A built workplace nobody works at yet, so the town has open jobs (R1: a Forester's Lodge). */
function openWork(state: WorldState, x = 88, z = 46): Building {
  return insertBuilding(state, null, content.buildingById.get('foresters-lodge')!, x, z, 0, 0, {
    site: false,
  });
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
    // The fixture staffs two of the town hall's four builder jobs (playtest round three); this test
    // counts only the work it opens, so hiring there is paused (no ticks run, nobody builds). R1:
    // the granary and the Forester's Lodge have open jobs too; paused alike.
    for (const id of ['town-hall', 'granary', 'foresters-lodge'])
      s.buildings.find((b) => b.def === id)!.rt!.paused = true;
    // Three jobs: two homes' worth, as many as a night starts.
    openWork(s);
    expect(openJobCount(s)).toBe(3);
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

  // R1B: a Workshops lot grows the trade with the best positive score (need x supply x site x
  // keeper); with every family well covered and nothing new to make, nothing scores.
  it('grows a workshop for a trade the town needs, and none when no trade scores', () => {
    const f = villageFixture();
    const s = f.state;
    paintZone(s, 'crafts', [83, 44, 95, 49]);
    zoneNow(s);
    expect(lotsIn(s, [83, 44, 95, 49]).length).toBeGreaterThan(0);
    // Every family well covered, nothing asked of the market: no workshop.
    s.market.demand.fill(0);
    s.economy.yesterday.consumed.fill(0);
    const store = findById(s.buildings, f.b.storehouses[0])!.rt!.store;
    for (const id of ['bread', 'vegetables', 'fish', 'cheese', 'cider', 'honey', 'candles', 'cloth']) {
      store[good(id)] = 400;
    }
    expect(growthDemand(s).crafts).toBe(0);
    night(s);
    expect(grown(s).some((b) => findById(s.lots, b.lot!)!.zone === Zone.crafts)).toBe(false);
    // Cloth runs short: the wool in stock is under two days, so the carrier would bring the rest
    // (supply 0.5), and the workshop grows as a weaver's.
    store[good('cloth')] = 0;
    for (const b of s.buildings) if (b.rt) b.rt.store[good('cloth')] = 0;
    s.market.demand[good('cloth')] = 40;
    expect(growthDemand(s).crafts).toBe(1);
    night(s);
    const shop = grown(s).find((b) => findById(s.lots, b.lot!)!.zone === Zone.crafts);
    const def = content.buildingById.get(shop?.def ?? '');
    expect(def?.grows?.zone).toBe('crafts');
    expect(shop!.trade).toBe('weaver');
    expect(methodOf(shop!)?.outputs[0]?.[0]).toBe('cloth');
  });

  // R1B: Food under four days of cover pulls every Food trade of Farmland alike; a good the carrier
  // keeps bringing pulls its own trade, so imported grain grows a grain farm.
  it('grows a farm when food runs low, and a grain farm for imported grain, with the land behind', () => {
    const f = villageFixture();
    const s = f.state;
    // Fertile farm land north of lane A, east of the stalls; empty the larders.
    for (let z = 36; z <= 49; z++) for (let x = 83; x <= 96; x++) s.map.fertility[z * S + x] = 80;
    paintZone(s, 'farms', [83, 38, 96, 49]);
    zoneNow(s);
    for (const b of s.buildings) {
      if (!b.rt) continue;
      for (let g = 0; g < content.goods.length; g++) {
        if (!isFood(g)) continue;
        b.rt.store[g] = 0;
        b.rt.output[g] = 0;
      }
    }
    for (const h of s.households) h.pantry.fill(0);
    s.market.demand.fill(0);
    s.economy.yesterday.consumed.fill(0);
    expect(growthDemand(s).farms).toBe(1);
    night(s);
    const first = grown(s).find((b) => findById(s.lots, b.lot!)!.zone === Zone.farms)!;
    expect(first).toBeDefined();
    expect(first.def).toBe('farmstead');
    expect(isFood(content.goodIndex.get(content.tradeById.get(first.trade!)!.makes!)!)).toBe(true);
    // Larders full again, but the carrier brought a day's eating of grain over the last days.
    s.buildings.splice(s.buildings.indexOf(first), 1);
    findById(s.lots, first.lot!)!.buildingId = 0;
    findById(s.buildings, f.b.storehouses[0])!.rt!.store[good('vegetables')] = 600;
    s.carrier.bought[s.carrier.bought.length - 1]![good('grain')] = s.residents.length;
    night(s);
    const farm = grown(s).find((b) => findById(s.lots, b.lot!)!.zone === Zone.farms)!;
    expect(farm.trade).toBe('grain-farm');
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
    const planks = good('timber');
    for (const b of s.buildings) if (b.rt) b.rt.store[planks] = 0;
    // Just under the share of the cheapest stand-in's timber (a stall's) that must be in hand.
    const stall = content.buildingById.get('market-stall')!;
    const need = stall.cost!.goods!.find(([g]) => g === 'timber')![1];
    const share = Math.ceil((need * GROWTH_SHARE) / 100) - 1;
    findById(s.buildings, f.b.storehouses[0])!.rt!.store[planks] = share;
    expect(growthDemand(s).homes).toBeGreaterThan(0);
    expect(night(s)).toBe(0);
    // A home waiting on timber would make timber short.
    growLot(s, createTickCtx(s), f.lots.homes[2]!, 'cottage');
    expect(shortages(s)[planks]).toBeGreaterThan(0);
    findById(s.buildings, f.b.storehouses[0])!.rt!.store[planks] = 400;
    // Lots of work on offer: still never more than a few grown sites at once.
    for (let k = 0; k < 6; k++) openWork(s, 30 + k * 3, 30);
    for (let d = 0; d < 5; d++) night(s);
    expect(grown(s).length).toBeLessThanOrEqual(GROWTH_MAX_SITES);
  });

  it('starts at 01:00 with the clock, and the lot reads as taken', () => {
    const f = villageFixture();
    const s = f.state;
    openWork(s);
    openWork(s, 91, 46);
    const ctx = createTickCtx(s);
    // Residents off, so the fixture's households stay as they are for the night's sums.
    withoutSystems(['residents'], () => advanceTo(s, TICKS_PER_DAY, ctx));
    const sites = s.buildings.filter((b) => b.lot && b.id !== f.b.grown);
    expect(sites.length).toBeGreaterThan(0);
    for (const b of sites) expect(findById(s.lots, b.lot!)!.buildingId).toBe(b.id);
    expect(ctx.events.some((e) => e.e === 'lot.updated')).toBe(true);
  });

  it('goes up like any other site: porters bring its materials and builders raise it', () => {
    const f = villageFixture();
    const s = f.state;
    const before = moneySnapshot(s);
    const ctx = createTickCtx(s);
    // The second homes lot, in reach of storehouse A's porters.
    expect(growLot(s, ctx, f.lots.homes[1]!, 'cottage')).not.toBeNull();
    advanceTo(s, 4 * TICKS_PER_DAY, ctx);
    const grownNow = s.buildings.filter((b) => b.lot && b.id !== f.b.grown);
    expect(grownNow.length).toBeGreaterThan(0);
    const progressed = grownNow.filter(
      (b) =>
        b.stage === 'built' ||
        (b.rt?.construction?.workDone ?? 0) > 0 ||
        (b.rt?.construction?.delivered ?? []).some((n) => n > 0),
    );
    expect(progressed.length).toBeGreaterThan(0);
    // Nobody paid for them: the treasury only moved for the town's usual business.
    for (const b of grownNow) expect(b.rt?.construction?.paid ?? 0).toBe(0);
    expectMoneyInvariant(before, s);
  });
});

describe('grown workshops choose what to make', () => {
  // R1B: a trade the town cannot feed scores half (the carrier would bring its raw good) against a
  // fed one's full supply; and a business keeps its trade while it is not in surplus.
  it('takes the trade it can feed before one the carrier would have to feed', () => {
    const f = villageFixture();
    const s = f.state;
    paintZone(s, 'crafts', [83, 44, 95, 49]);
    zoneNow(s);
    s.market.demand.fill(0);
    s.economy.yesterday.consumed.fill(0);
    s.market.demand[good('candles')] = 30;
    s.market.demand[good('cloth')] = 90;
    // No wool in town, and none ever made: a weaver cannot be fed. Some honey for a chandler.
    for (const b of s.buildings) if (b.rt) b.rt.store[good('wool')] = 0;
    findById(s.buildings, f.b.storehouses[0])!.rt!.store[good('honey')] = 5;
    night(s);
    const b = grown(s).find((x) => findById(s.lots, x.lot!)!.zone === Zone.crafts)!;
    expect(b).toBeDefined();
    expect(b.trade).toBe('chandler');
    // It keeps its trade when the market changes its mind.
    b.stage = 'built';
    b.rt!.construction = null;
    s.market.demand[good('cider')] = 200;
    night(s);
    expect(b.trade).toBe('chandler');
  });
});
