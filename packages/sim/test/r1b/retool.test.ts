// R1B: retooling and pinning (docs/spec/13-ledger.md, Choosing a trade): a business retools only
// after six days of surplus while another trade is short, one a night across the town, keeping its
// keeper; a pinned trade never retools for surplus; a business whose site wants fail retools after
// three days, pinned or not.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import type { Building, WorldState } from '../../src/contracts';
import { findById, removeById } from '../../src/state/entities';
import { growthPass } from '../../src/systems/growth';
import { growLot } from '../../src/systems/growth/api';
import { SITE_FAIL_DAYS, SURPLUS_DAYS } from '../../src/systems/growth/retool';
import { createTickCtx } from '../../src/turn';
import { villageFixture, type VillageFixture } from '../fixtures/village';
import { lotsIn, paintZone, zoneNow } from '../growth/helpers';

const g = (id: string) => content.goodIndex.get(id)!;

function night(s: WorldState): void {
  growthPass(s, createTickCtx(s));
}

/** A built business of `trade` on the first crafts lot east of the stalls, kept by `keeper`. */
function businessOnLot(f: VillageFixture, trade: string, keeper: number): Building {
  const s = f.state;
  paintZone(s, 'crafts', [83, 44, 95, 49]);
  zoneNow(s);
  const lot = lotsIn(s, [83, 44, 95, 49]).sort((a, b) => a.x - b.x)[0]!;
  const def = content.buildingById.get('workshop')!;
  const b = s.buildings.find((x) => x.id === lot.buildingId);
  if (b) return b;
  // Grow it the way growth does, then finish it.
  const ctx = createTickCtx(s);
  const grown = growLot(s, ctx, lot.id, def.id, undefined, trade)!;
  grown.stage = 'built';
  grown.rt!.construction = null;
  grown.keeperId = keeper;
  return grown;
}

/** The town sits on cider it does not want, and is short of cloth with wool in store. */
function ciderGlutClothShort(f: VillageFixture): void {
  const s = f.state;
  s.market.demand.fill(0);
  s.economy.yesterday.consumed.fill(0);
  const store = findById(s.buildings, f.b.storehouses[0])!.rt!.store;
  for (const id of ['bread', 'vegetables', 'fish', 'cheese', 'grain', 'honey', 'candles']) store[g(id)] = 400;
  store[g('cider')] = 600;
  store[g('wool')] = 60;
  for (const b of s.buildings) if (b.rt) b.rt.store[g('cloth')] = 0;
  s.market.demand[g('cloth')] = 40;
}

describe('retooling', () => {
  it('turns a business in surplus for six days to a short trade, keeping its keeper', () => {
    const f = villageFixture();
    const s = f.state;
    const keeper = s.residents.find((r) => r.stage === 'adult')!.id;
    const b = businessOnLot(f, 'cider-maker', keeper);
    ciderGlutClothShort(f);
    for (let d = 1; d < SURPLUS_DAYS; d++) {
      night(s);
      expect(b.trade).toBe('cider-maker');
    }
    expect(b.counters?.surplusDays).toBe(SURPLUS_DAYS - 1);
    night(s);
    expect(b.trade).toBe('weaver');
    expect(b.keeperId).toBe(keeper);
    expect(b.counters?.surplusDays).toBe(0);
  });

  it('never retools a pinned trade for surplus', () => {
    const f = villageFixture();
    const s = f.state;
    const b = businessOnLot(f, 'cider-maker', 0);
    b.pinned = true;
    ciderGlutClothShort(f);
    for (let d = 0; d < SURPLUS_DAYS + 3; d++) night(s);
    expect(b.trade).toBe('cider-maker');
    expect(b.pinned).toBe(true);
  });

  it('retools one business a night across the town', () => {
    const f = villageFixture();
    const s = f.state;
    paintZone(s, 'crafts', [83, 44, 95, 49]);
    zoneNow(s);
    const lots = lotsIn(s, [83, 44, 95, 49]).sort((a, b) => a.x - b.x);
    expect(lots.length).toBeGreaterThanOrEqual(2);
    const two = lots.slice(0, 2).map((l) => {
      const b = growLot(s, createTickCtx(s), l.id, 'workshop', undefined, 'cider-maker')!;
      b.stage = 'built';
      b.rt!.construction = null;
      return b;
    });
    ciderGlutClothShort(f);
    for (let d = 0; d < SURPLUS_DAYS; d++) night(s);
    expect(two.filter((b) => b.trade !== 'cider-maker').length).toBe(1);
  });

  it('retools a business whose site wants fail for three days, pinned or not', () => {
    const f = villageFixture();
    const s = f.state;
    const bakery = findById(s.buildings, f.b.bakery)!;
    // The fixture's bakery stands on no lot; give it the first crafts lot's place.
    const b = businessOnLot(f, 'baker', 0);
    b.pinned = true;
    expect(bakery.trade).toBe('baker');
    removeById(s.buildings, f.b.windmill);
    for (let d = 1; d < SITE_FAIL_DAYS; d++) {
      night(s);
      expect(b.trade).toBe('baker');
    }
    night(s);
    expect(b.trade).not.toBe('baker');
    expect(b.pinned).toBeUndefined();
  });
});
