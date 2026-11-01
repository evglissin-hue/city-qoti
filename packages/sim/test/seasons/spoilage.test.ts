// C5A: spoilage without per-batch ages (docs/spec/13-ledger.md, Goods): a glut shrinks over a few
// nights, storehouses keep it better, and a town that eats what it makes loses nothing.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { SPOIL_FLOOR, spoil, spoilKeep } from '../../src/systems/seasons/spoilage';
import { villageFixture } from '../fixtures/village';

const FISH = content.goodIndex.get('fish')!;
const BREAD = content.goodIndex.get('bread')!;
const WHEAT = content.goodIndex.get('wheat')!;

function clear(state: ReturnType<typeof villageFixture>['state'], g: number): void {
  for (const b of state.buildings)
    if (b.rt) {
      b.rt.store[g] = 0;
      b.rt.output[g] = 0;
    }
  state.economy.today.consumed[g] = 0;
  state.economy.yesterday.consumed[g] = 0;
  state.economy.today.produced[g] = 0;
  state.economy.yesterday.produced[g] = 0;
}

describe('spoilage', () => {
  it('a glut of fish shrinks by half its excess a night, a storehouse keeping it better', () => {
    const f = villageFixture();
    const s = f.state;
    clear(s, FISH);
    const store = s.buildings.find((b) => b.id === f.b.storehouses[0])!;
    const bakery = s.buildings.find((b) => b.id === f.b.bakery)!;
    store.rt!.store[FISH] = 200;
    bakery.rt!.output[FISH] = 200;
    s.economy.yesterday.consumed[FISH] = 5;
    const lost = spoil(s);
    const keep = spoilKeep(s, FISH, 2);
    expect(keep).toBeGreaterThanOrEqual(Math.max(SPOIL_FLOOR, s.residents.length * 2));
    const loss = Math.floor((400 - keep) / 2);
    expect(bakery.rt!.output[FISH]).toBe(200 - Math.floor((loss * 200) / 400));
    expect(store.rt!.store[FISH]).toBe(200 - (Math.floor((loss * 200) / 400) >> 1));
    expect(lost[FISH]).toBeGreaterThan(0);
    // Wheat never spoils.
    expect(lost[WHEAT]).toBe(0);
  });

  it('a town eating what it makes loses nothing, and pantries never spoil', () => {
    const f = villageFixture();
    const s = f.state;
    clear(s, BREAD);
    const store = s.buildings.find((b) => b.id === f.b.storehouses[0])!;
    s.economy.yesterday.consumed[BREAD] = 20;
    const keep = spoilKeep(s, BREAD, 3);
    store.rt!.store[BREAD] = keep;
    for (const h of s.households) h.pantry[BREAD] = 4;
    spoil(s);
    expect(store.rt!.store[BREAD]).toBe(keep);
    for (const h of s.households) expect(h.pantry[BREAD]).toBe(4);
  });
});
