// R1B: the four demand bars (docs/spec/13-ledger.md, Demand): values with their reasons, quiet while
// a free suitable lot waits and lit when the town needs more zoned land; demand.updated after the
// 01:00 pass and when the zoning pass changes the free lots; Shops before Village point at a stall.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { DEMAND_KINDS } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { insertBuilding } from '../../src/state/place';
import { growthPass, writeDemand } from '../../src/systems/growth';
import { zoning } from '../../src/systems/zoning';
import { createTickCtx } from '../../src/turn';
import { villageFixture, type VillageFixture } from '../fixtures/village';
import { paintZone, zoneNow } from '../growth/helpers';

const g = (id: string) => content.goodIndex.get(id)!;
const bar = (s: WorldState, kind: (typeof DEMAND_KINDS)[number]) => {
  const i = DEMAND_KINDS.indexOf(kind);
  return { value: s.demand.bars[i]!, lit: s.demand.lit[i]!, reasons: s.demand.reasons[i]! };
};

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

describe('the Workshops bar', () => {
  it('asks in words, lit with no crafts land and quiet once a lot waits', () => {
    const f = villageFixture();
    const s = wellFed(f);
    writeDemand(s, null);
    expect(bar(s, 'workshops').value).toBe(0);
    expect(bar(s, 'workshops').lit).toBe(false);
    // Cloth runs short, with wool in store.
    for (const b of s.buildings) if (b.rt) b.rt.store[g('cloth')] = 0;
    findById(s.buildings, f.b.storehouses[0])!.rt!.store[g('wool')] = 60;
    s.market.demand[g('cloth')] = 40;
    const ctx = createTickCtx(s);
    writeDemand(s, ctx);
    const w = bar(s, 'workshops');
    expect(w.value).toBeGreaterThan(0);
    expect(w.lit).toBe(true);
    expect(w.reasons[0]).toMatchObject({ code: 'short', good: 'cloth', from: 'wool' });
    expect(w.reasons.at(-1)).toEqual({ code: 'needsLand' });
    const e = ctx.events.find((x) => x.e === 'demand.updated');
    expect(e && e.e === 'demand.updated' && e.d.bars[2]!.why[0]).toBe(
      'Cloth is short and wool is plentiful.',
    );
    // Zoning Workshops: the zoning pass cuts lots and the bar goes quiet, growth on its way.
    paintZone(s, 'crafts', [83, 44, 95, 49]);
    const zctx = createTickCtx(s);
    zoning.tick(s, zctx);
    expect(s.lots.some((l) => l.zone === content.zoneById.get('crafts')!.layerValue)).toBe(true);
    expect(bar(s, 'workshops').lit).toBe(false);
    expect(bar(s, 'workshops').reasons.at(-1)).toEqual({ code: 'lotWaiting' });
    expect(zctx.events.some((x) => x.e === 'demand.updated')).toBe(true);
  });

  it('says a first maker is wanted (design note a)', () => {
    const f = villageFixture();
    const s = wellFed(f);
    // A grain town without a baker; the windmill has room.
    findById(s.buildings, f.b.bakery)!.trade = 'weaver';
    findById(s.buildings, f.b.storehouses[0])!.rt!.store[g('bread')] = 0;
    findById(s.buildings, f.b.granary)!.rt!.store[g('bread')] = 0;
    s.economy.yesterday.produced[g('grain')] = 10;
    insertBuilding(s, null, content.buildingById.get('farmstead')!, 40, 30, 0, 0, {
      site: false,
      trade: 'grain-farm',
    });
    writeDemand(s, null);
    expect(bar(s, 'workshops').reasons[0]).toMatchObject({
      code: 'firstMaker',
      good: 'bread',
      from: 'grain',
    });
  });
});

describe('the Farmland bar', () => {
  it('asks while Food is under four days of cover, and for a farm good the carrier keeps bringing', () => {
    const f = villageFixture();
    const s = wellFed(f);
    writeDemand(s, null);
    expect(bar(s, 'farmland').value).toBe(0);
    s.carrier.bought[s.carrier.bought.length - 1]![g('cheese')] = 40;
    writeDemand(s, null);
    expect(bar(s, 'farmland').value).toBeGreaterThan(0);
    expect(bar(s, 'farmland').reasons[0]).toEqual({ code: 'imported', good: 'cheese' });
    expect(bar(s, 'farmland').lit).toBe(true);
    for (const b of s.buildings) {
      if (!b.rt) continue;
      for (const id of ['bread', 'vegetables', 'fish', 'cheese', 'grain']) b.rt.store[g(id)] = 0;
    }
    writeDemand(s, null);
    expect(bar(s, 'farmland').reasons.some((r) => r.code === 'foodCover')).toBe(true);
    // Farm land zoned and cut: quiet.
    paintZone(s, 'farms', [83, 38, 96, 49]);
    zoneNow(s);
    writeDemand(s, null);
    expect(bar(s, 'farmland').lit).toBe(false);
  });
});

describe('the Shops bar', () => {
  it('before Village rank points at the Market Stall', () => {
    const f = villageFixture();
    const s = f.state;
    s.charter.rank = 'hamlet';
    for (const id of f.b.stalls) {
      const i = s.buildings.findIndex((b) => b.id === id);
      s.buildings.splice(i, 1);
    }
    writeDemand(s, null);
    const shops = bar(s, 'shops');
    expect(shops.value).toBeGreaterThan(0);
    expect(shops.lit).toBe(true);
    expect(shops.reasons.some((r) => r.code === 'noOutlet')).toBe(true);
    expect(shops.reasons.at(-1)).toEqual({ code: 'marketStall' });
  });
});

describe('the Homes bar and the pass', () => {
  it('writes every bar after the 01:00 pass and sends demand.updated', () => {
    const f = villageFixture();
    const s = f.state;
    const ctx = createTickCtx(s);
    growthPass(s, ctx);
    expect(ctx.events.filter((e) => e.e === 'demand.updated').length).toBe(1);
    expect(s.demand.bars.length).toBe(4);
    for (const v of s.demand.bars) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of s.demand.bars) expect(v).toBeLessThanOrEqual(100);
    for (let i = 0; i < 4; i++) {
      if (s.demand.bars[i]! > 0) expect(s.demand.reasons[i]!.length).toBeGreaterThan(0);
      else expect(s.demand.lit[i]).toBe(false);
    }
  });
});
