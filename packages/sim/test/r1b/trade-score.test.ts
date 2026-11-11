// R1B: the trade score (docs/spec/13-ledger.md, Choosing a trade): need x supply x site x keeper,
// each term on its own, design note (a) (a made good no business makes yet while its raw good is made
// here counts as need 0.25), and their product.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { Lot, WorldState } from '../../src/contracts';
import { findById, removeById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { SiteCache, siteMeets } from '../../src/systems/growth/site';
import {
  FIRST_MAKER_NEED,
  KEEPER_KEEN,
  KEEPER_PLAIN,
  needOf,
  supplyOf,
  SUPPLY_CARRIER,
  SUPPLY_HERE,
  townNeeds,
  tradeScore,
  tradeTerms,
  VARIETY_NEED,
} from '../../src/systems/growth/trades';
import { villageFixture, type VillageFixture } from '../fixtures/village';
import { lotsIn, paintZone, zoneNow } from '../growth/helpers';

const g = (id: string) => content.goodIndex.get(id)!;
const trade = (id: string) => content.tradeById.get(id)!;

/** Every flavor well stocked and nothing asked of the market: no need anywhere. */
function wellFed(f: VillageFixture): WorldState {
  const s = f.state;
  s.market.demand.fill(0);
  s.economy.yesterday.consumed.fill(0);
  const store = findById(s.buildings, f.b.storehouses[0])!.rt!.store;
  for (const id of ['bread', 'vegetables', 'fish', 'cheese', 'grain', 'cider', 'honey', 'candles', 'cloth']) {
    store[g(id)] = 400;
  }
  return s;
}

/** Workshops lots north of lane A, east of the stalls, nearest the windmill first. */
function craftLots(s: WorldState): Lot[] {
  paintZone(s, 'crafts', [83, 44, 95, 49]);
  zoneNow(s);
  return lotsIn(s, [83, 44, 95, 49]).sort((a, b) => a.x - b.x);
}

describe('need', () => {
  it('reads a good the market is short of', () => {
    const s = wellFed(villageFixture());
    for (const b of s.buildings) if (b.rt) b.rt.store[g('cloth')] = 0;
    expect(needOf(s, trade('weaver'), townNeeds(s)).need).toBe(0);
    s.market.demand[g('cloth')] = 40;
    expect(needOf(s, trade('weaver'), townNeeds(s))).toEqual({ need: 1000, code: 'short' });
  });

  it("reads the family's cover under four days of Food, for every Food trade alike", () => {
    const f = villageFixture();
    const s = wellFed(f);
    expect(needOf(s, trade('grain-farm'), townNeeds(s)).need).toBe(0);
    for (const b of s.buildings) {
      if (!b.rt) continue;
      for (const id of ['bread', 'vegetables', 'fish', 'cheese', 'grain']) b.rt.store[g(id)] = 0;
    }
    const n = townNeeds(s);
    expect(needOf(s, trade('grain-farm'), n)).toEqual({ need: 1000, code: 'cover' });
    expect(needOf(s, trade('dairy'), n).need).toBe(1000);
    // Makers already making the town's use count it as caught up; the bare shelves still lack
    // the three flavors Craftsfolk want, so the variety pulls.
    s.economy.yesterday.produced[g('vegetables')] = s.residents.length;
    expect(needOf(s, trade('grain-farm'), townNeeds(s))).toEqual({ need: VARIETY_NEED, code: 'variety' });
  });

  it('reads a flavor an unlocked tier lacks, one household in ten before any has moved up', () => {
    const f = villageFixture();
    const s = wellFed(f);
    // No Treats on offer anywhere, but the town makes its Treats use: the variety alone pulls.
    for (const b of s.buildings) if (b.rt) for (const id of ['cider', 'honey']) b.rt.store[g(id)] = 0;
    s.economy.yesterday.produced[g('honey')] = 100;
    expect(needOf(s, trade('cider-maker'), townNeeds(s))).toEqual({ need: VARIETY_NEED, code: 'variety' });
    // Craftsfolk unlocked with no Craftsfolk household: one in ten of the town still wants Treats.
    for (const h of s.households) h.tier = 'settler';
    const n = townNeeds(s);
    expect(n.famUse[4]).toBeGreaterThanOrEqual(Math.ceil(s.residents.length / 10) * 0.2);
    expect(n.variety[4]).toBe(1);
  });

  it('reads what the carrier keeps bringing, however full the shelf', () => {
    const s = wellFed(villageFixture());
    expect(needOf(s, trade('grain-farm'), townNeeds(s)).need).toBe(0);
    const today = s.carrier.bought.length - 1;
    // A third of the Food use a day, three days running: full need.
    for (let k = 0; k < 3; k++) s.carrier.bought[today - k]![g('grain')] = Math.ceil(s.residents.length / 3);
    expect(needOf(s, trade('grain-farm'), townNeeds(s))).toEqual({ need: 1000, code: 'imported' });
  });

  it('design note (a): a first baker in a grain town, even well fed', () => {
    const f = villageFixture();
    const s = wellFed(f);
    // No baker yet, and no grain made here: nothing pulls bread.
    removeById(s.buildings, f.b.bakery);
    expect(needOf(s, trade('baker'), townNeeds(s)).need).toBe(0);
    // A grain farm at work: the first baker is wanted at need 0.25.
    insertBuilding(s, null, content.buildingById.get('farmstead')!, 40, 30, 0, 0, {
      site: false,
      trade: 'grain-farm',
    });
    expect(needOf(s, trade('baker'), townNeeds(s))).toEqual({ need: FIRST_MAKER_NEED, code: 'firstMaker' });
    // Once a baker stands (or goes up), it is a need like any other again.
    insertBuilding(s, null, content.buildingById.get('workshop')!, 40, 40, 0, 0, { trade: 'baker' });
    expect(needOf(s, trade('baker'), townNeeds(s)).need).toBe(0);
  });
});

describe('supply', () => {
  it('is whole when the raw good is made here or two days are in store, half by carrier, none on Never', () => {
    const f = villageFixture();
    const s = wellFed(f);
    for (const b of s.buildings) if (b.rt) b.rt.store[g('wool')] = 0;
    // Wares at Village rank: Always, so the carrier would bring wool.
    expect(supplyOf(s, trade('weaver'), townNeeds(s))).toBe(SUPPLY_CARRIER);
    s.carrier.families[3]!.rule = 'never';
    expect(supplyOf(s, trade('weaver'), townNeeds(s))).toBe(0);
    // Two days of a weaver's wool in store.
    findById(s.buildings, f.b.storehouses[0])!.rt!.store[g('wool')] = 12;
    expect(supplyOf(s, trade('weaver'), townNeeds(s))).toBe(SUPPLY_HERE);
    findById(s.buildings, f.b.storehouses[0])!.rt!.store[g('wool')] = 0;
    // A sheep run at work.
    insertBuilding(s, null, content.buildingById.get('farmstead')!, 40, 30, 0, 0, {
      site: false,
      trade: 'sheep-run',
    });
    expect(supplyOf(s, trade('weaver'), townNeeds(s))).toBe(SUPPLY_HERE);
    // Land trades take nothing.
    expect(supplyOf(s, trade('orchard'), townNeeds(s))).toBe(SUPPLY_HERE);
  });
});

describe('site', () => {
  it("wants a windmill's reach with room for a baker", () => {
    const f = villageFixture();
    const s = f.state;
    const lots = craftLots(s);
    expect(lots.length).toBeGreaterThan(1);
    const near = lots[0]!;
    // The fixture's windmill serves one baker of two.
    expect(siteMeets(new SiteCache(s), near, trade('baker'))).toBe(true);
    // A second baker beside the first fills it: no room for a third.
    insertBuilding(s, null, content.buildingById.get('workshop')!, 62, 47, 0, 0, { trade: 'baker' });
    expect(siteMeets(new SiteCache(s), near, trade('baker'))).toBe(false);
    // The first two still have their room (they count themselves among the served).
    const bakery = findById(s.buildings, f.b.bakery)!;
    expect(siteMeets(new SiteCache(s), near, trade('baker'), bakery.id)).toBe(true);
    // No windmill at all.
    removeById(s.buildings, f.b.windmill);
    expect(siteMeets(new SiteCache(s), near, trade('baker'))).toBe(false);
    // A weaver wants nothing of its lot.
    expect(siteMeets(new SiteCache(s), near, trade('weaver'))).toBe(true);
  });
});

describe('keeper', () => {
  it('is a little more when a resident keen on the trade keeps nothing yet, and names them', () => {
    const f = villageFixture();
    const s = f.state;
    const keeps = new Set(s.buildings.map((b) => b.keeperId ?? 0));
    const sweet = s.residents.filter(
      (r) =>
        r.traits.includes('sweet-tooth') && (r.stage === 'adult' || r.stage === 'young') && !keeps.has(r.id),
    );
    expect(sweet.length).toBeGreaterThan(0);
    let n = townNeeds(s);
    const lot = craftLots(s)[0]!;
    const free = n.keen.get('baker');
    expect(free).toBe(sweet.map((r) => r.id).sort((a, b) => a - b)[0]);
    let terms = tradeTerms(s, lot, trade('baker'), n, new SiteCache(s));
    expect(terms.keeper).toBe(KEEPER_KEEN);
    expect(terms.keeperId).toBe(free);
    // Everyone keen on baking already keeps a business: plain.
    for (const r of sweet) {
      insertBuilding(s, null, content.buildingById.get('workshop')!, 20 + r.id, 20, 0, 0, {
        site: false,
        trade: 'weaver',
      }).keeperId = r.id;
    }
    n = townNeeds(s);
    terms = tradeTerms(s, lot, trade('baker'), n, new SiteCache(s));
    expect(terms.keeper).toBe(KEEPER_PLAIN);
    expect(terms.keeperId).toBe(0);
  });

  it('counts a finished apprentice of the trade', () => {
    const f = villageFixture();
    const s = f.state;
    for (const r of s.residents) r.traits = r.traits.filter((t) => t !== 'cheerful');
    const r = s.residents.find((x) => x.stage === 'adult')!;
    r.apprentice = { at: 1, trade: 'cider-maker', untilDay: 0 };
    expect(townNeeds(s).keen.get('cider-maker')).toBe(r.id);
    r.apprentice.untilDay = 999;
    expect(townNeeds(s).keen.has('cider-maker')).toBe(false);
  });
});

describe('the score', () => {
  it('is need x supply x site x keeper, in whole numbers', () => {
    const f = villageFixture();
    const s = wellFed(f);
    const lot = craftLots(s)[0]!;
    for (const b of s.buildings) if (b.rt) for (const id of ['cloth', 'wool']) b.rt.store[g(id)] = 0;
    s.market.demand[g('cloth')] = 40;
    const n = townNeeds(s);
    const t = tradeTerms(s, lot, trade('weaver'), n, new SiteCache(s));
    expect(t.need).toBe(1000);
    expect(t.supply).toBe(SUPPLY_CARRIER);
    expect(t.site).toBe(1);
    expect(t.score).toBe(Math.floor((Math.floor((t.need * t.supply) / 1000) * t.site * t.keeper) / 100));
    expect(Number.isInteger(t.score)).toBe(true);
    expect(tradeScore(s, lot, trade('weaver'))).toBe(t.score);
    // A keen baker never bakes outside a windmill's reach: the site multiplies.
    removeById(s.buildings, f.b.windmill);
    expect(tradeScore(s, lot, trade('baker'))).toBe(0);
  });
});
