// The Forester's Lodge (docs/spec/13-ledger.md, Land and specialized buildings): it replants its
// own wood and cuts firewood toward the Fuel mark.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { TREE_SPECIES, treeStage, treeValue } from '../../src/map/layers';
import { insertBuilding } from '../../src/state/place';
import { lodgeYield } from '../../src/systems/production/forestry';
import { woodpile } from '../../src/systems/seasons/stores';
import { hamletFixture } from '../fixtures/hamlet';
import { tickAt } from '../fixtures/seasonsPlace';
import { building, good, hire, stockOf, ticks, toWork } from '../ledger/helpers';

const S = MAP_SIZE;
const H = TICKS_PER_HOUR;

function lodgeWithGrove(state: WorldState): Building {
  const d = content.buildingById.get('foresters-lodge')!;
  const b = insertBuilding(state, null, d, 120, 80, 0, 0, { site: false });
  for (let z = 82; z < 92; z++) {
    for (let x = 118; x < 128; x++) {
      if (!state.map.occupant[z * S + x]) state.map.tree[z * S + x] = treeValue(TREE_SPECIES.oak, 3);
    }
  }
  return b;
}

function stock(f: ReturnType<typeof hamletFixture>, id: string, n: number): void {
  building(f.state, f.b.stall).rt!.store[good(id)] = n;
}

function saplings(state: WorldState): number {
  let n = 0;
  for (let z = 70; z < 100; z++) {
    for (let x = 108; x < 138; x++) {
      const v = state.map.tree[z * S + x]!;
      if (v !== 0 && treeStage(v) === 0) n++;
    }
  }
  return n;
}

describe("the Forester's Lodge", () => {
  it('plants a sapling in its range for every tree it fells', () => {
    const f = hamletFixture();
    stock(f, 'firewood', 500);
    stock(f, 'timber', 500);
    const lodge = lodgeWithGrove(f.state);
    const before = saplings(f.state);
    toWork(f.state, hire(f.state, lodge.id, 1));
    ticks(f.state, 3 * H);
    expect(stockOf(lodge, 'output', 'timber')).toBe(4);
    expect(saplings(f.state)).toBeGreaterThan(before);
  });

  it('cuts firewood from Summer day 4 while the woodpile is under the Fuel mark, timber once over it', () => {
    const f = hamletFixture();
    stock(f, 'timber', 500);
    f.state.tick = tickAt(0, 1, 4, 9);
    const lodge = lodgeWithGrove(f.state);
    const mark = f.state.seasonPlan.reserve * Math.max(1, f.state.households.length);
    expect(woodpile(f.state)).toBeLessThan(mark);
    expect(lodgeYield(f.state, lodge)).toEqual(['firewood', 6]);
    toWork(f.state, hire(f.state, lodge.id, 1));
    ticks(f.state, 3 * H);
    expect(stockOf(lodge, 'output', 'firewood')).toBe(6);
    expect(stockOf(lodge, 'output', 'timber')).toBe(0);

    stock(f, 'firewood', mark + 10);
    expect(lodgeYield(f.state, lodge)).toEqual(['timber', 4]);
    ticks(f.state, 3 * H);
    expect(stockOf(lodge, 'output', 'timber')).toBe(4);
  });

  it("follows the Ledger's own Fuel mark when the plan sets one", () => {
    const f = hamletFixture();
    stock(f, 'timber', 500);
    f.state.tick = tickAt(0, 1, 5, 9);
    f.state.seasonPlan.fuel = 1;
    const lodge = lodgeWithGrove(f.state);
    stock(f, 'firewood', f.state.households.length + 1);
    expect(lodgeYield(f.state, lodge)[0]).toBe('timber');
  });

  it('cuts firewood in spring while the woodpile is under the carrier reserve', () => {
    const f = hamletFixture();
    stock(f, 'timber', 500);
    // Before the carrier's 10:00 round, which would fill the woodpile itself.
    f.state.tick = tickAt(0, 0, 2, 6);
    const lodge = lodgeWithGrove(f.state);
    const reserve = f.state.carrier.families[1]!.reserve;
    stock(f, 'firewood', 0);
    expect(woodpile(f.state)).toBeLessThan(reserve);
    toWork(f.state, hire(f.state, lodge.id, 1));
    ticks(f.state, 3 * H);
    expect(stockOf(lodge, 'output', 'firewood')).toBe(6);
  });

  it('alternates fuel and timber when both are short, whichever it made less of today', () => {
    const f = hamletFixture();
    f.state.tick = tickAt(0, 1, 4, 9);
    const lodge = lodgeWithGrove(f.state);
    const t = good('timber');
    const w = good('firewood');
    for (const b of f.state.buildings) {
      if (!b.rt) continue;
      b.rt.store[t] = 0;
      b.rt.output[t] = 0;
    }
    expect(lodgeYield(f.state, lodge)[0]).toBe('firewood');
    lodge.rt!.producedToday[w] = 6;
    expect(lodgeYield(f.state, lodge)[0]).toBe('timber');
    lodge.rt!.producedToday[t] = 8;
    expect(lodgeYield(f.state, lodge)[0]).toBe('firewood');
  });
});
