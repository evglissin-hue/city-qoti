// The stores and markets (docs/spec/13-ledger.md, Land and specialized buildings): the Granary keeps
// Food, the Storehouse the other four, the Market Square sells every family.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { insertBuilding } from '../../src/state/place';
import { takes } from '../../src/systems/logistics/stores';
import { spoil } from '../../src/systems/seasons/spoilage';
import { hamletFixture } from '../fixtures/hamlet';
import { building, everyoneToWork, good, ticksUntil, untilHour, withoutStall } from '../ledger/helpers';

const H = TICKS_PER_HOUR;
const def = (id: string) => content.buildingById.get(id)!;
const FAMILIES = ['food', 'fuel', 'materials', 'wares', 'treats'] as const;

function place(state: WorldState, id: string, x: number, z: number, rot: 0 | 1 | 2 | 3 = 0): Building {
  return insertBuilding(state, null, def(id), x, z, rot, 0, { site: false });
}

describe('stores by family', () => {
  it('the Granary takes only Food and the Storehouse the other four, 1,200 and 800 units', () => {
    const granary = def('granary');
    const store = def('storehouse');
    expect(granary.storage).toBe(1200);
    expect(store.storage).toBe(800);
    for (let g = 0; g < content.goods.length; g++) {
      const food = content.goods[g]!.family === 'food';
      expect(takes(granary, g), content.goods[g]!.id).toBe(food);
      expect(takes(store, g), content.goods[g]!.id).toBe(!food);
    }
    for (const f of FAMILIES) {
      const homes = [granary, store].filter((d) => d.stores!.includes(f));
      expect(homes, f).toHaveLength(1);
    }
  });

  it('the Market Stall stores Food and Treats only; the Market Square has six stalls of 40 and every family', () => {
    const stall = def('market-stall');
    const square = def('market-square');
    expect(stall.stores).toEqual(['food', 'treats']);
    expect(square.stores).toBeUndefined();
    expect(square.storage).toBe(240);
    expect(square.jobs?.count).toBe(3);
    for (let g = 0; g < content.goods.length; g++) expect(takes(square, g)).toBe(true);
  });

  it('Food spoils half as fast in a granary as in the open', () => {
    const f = hamletFixture();
    const granary = place(f.state, 'granary', 40, 70);
    const open = building(f.state, f.b.bakery);
    const bread = good('bread');
    granary.rt!.store[bread] = 400;
    open.rt!.output[bread] = 400;
    // Keep the fixture's other bread out of the count.
    for (const b of f.state.buildings) if (b !== granary && b !== open && b.rt) b.rt.store[bread] = 0;
    const lost = spoil(f.state);
    expect(lost[bread]).toBeGreaterThan(0);
    const inGranary = 400 - granary.rt!.store[bread]!;
    const inOpen = 400 - open.rt!.output[bread]!;
    expect(inOpen).toBeGreaterThan(0);
    expect(inGranary).toBe(inOpen >> 1);
  });
});

describe('the Brickworks and the Apiary', () => {
  it('the Brickworks fires 6 brick from 1 firewood, a craft on 2+ clay tiles', () => {
    const b = def('brickworks');
    const m = b.methods![0]!;
    expect(m.kind).toBe('craft');
    expect(m.inputs).toEqual([['firewood', 1]]);
    expect(m.outputs).toEqual([['brick', 6]]);
    expect(b.placement).toEqual([{ kind: 'deposit', deposit: 'clay', minTiles: 2 }]);
  });

  it("the Apiary is a Hearth building by hand with no trade, tagged 'hives'", () => {
    const a = def('apiary');
    expect(a.lane).toBe('hearth');
    expect(a.tags).toContain('hives');
  });
});

describe('the Market Square restocks every family', () => {
  it('porters bring it Wares and Treats as well as Food', () => {
    const f = withoutStall();
    const store = building(f.state, f.b.storehouse);
    store.rt!.store[good('cloth')] = 40;
    store.rt!.store[good('cider')] = 40;
    const square = place(f.state, 'market-square', 48, 51, 2);
    untilHour(f.state, 8);
    everyoneToWork(f.state);
    ticksUntil(
      f.state,
      () => square.rt!.store[good('cloth')]! > 0 && square.rt!.store[good('cider')]! > 0,
      6 * H,
    );
    expect(square.rt!.store[good('cloth')]).toBeGreaterThan(0);
    expect(square.rt!.store[good('cider')]).toBeGreaterThan(0);
  });
});
