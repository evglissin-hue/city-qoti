// R1A: the cross-track readers (familyCover, flavorsOnOffer, familyUse, wantedVariety) work out
// what they read on the first ask in a tick and keep it for the rest of it, so R1B's trade score can
// ask for every lot. A new tick, or a building or household more or fewer, works it out again; a
// caller that changes stock within the tick passes its own.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { balanceStock, familyCover, familyUse } from '../../src/systems/market/balances';
import { hamletFixture } from '../fixtures/hamlet';
import { building, good } from '../ledger/helpers';

describe('the readers keep a tick', () => {
  it('hold within a tick, and see a change on the next tick or when the town changes size', () => {
    const f = hamletFixture();
    const s = f.state;
    const granary = building(s, f.b.granary).rt!;
    const before = familyCover(s, 0);
    granary.store[good('grain')]! += 100;
    // The same tick: the first answer holds.
    expect(familyCover(s, 0)).toBe(before);
    // Passing the stock gives the fresh answer at once.
    expect(familyCover(s, 0, balanceStock(s))).toBeGreaterThan(before);
    // The next tick works it out again.
    s.tick += 1;
    expect(familyCover(s, 0)).toBeGreaterThan(before);
    // A household more changes the use within the tick.
    const use = familyUse(s, 0);
    const h = s.households[0]!;
    s.households.push({
      ...h,
      id: s.nextId++,
      members: [...h.members],
      pantry: new Array<number>(content.goods.length).fill(0),
    });
    expect(familyUse(s, 0)).toBeGreaterThan(use);
  });
});
