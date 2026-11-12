// R1X: no new business while businesses stand empty for want of hands (HANDS_WAITING): the Workshops
// bar goes quiet with the 'hands' reason, and growth starts no business that night. On oak a hamlet
// of 19 had grown 22 businesses, most of them empty, before this.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { DEMAND_KINDS } from '../src/constants';
import type { WorldState } from '../src/contracts';
import { findById } from '../src/state/entities';
import { businessesWaitingHands, growthDemand, HANDS_WAITING, writeDemand } from '../src/systems/growth';
import { demandWhy } from '../src/view/demand';
import { villageFixture } from './fixtures/village';
import { build } from './hearth/helpers';

const g = (id: string) => content.goodIndex.get(id)!;
const workshops = (s: WorldState) => {
  const i = DEMAND_KINDS.indexOf('workshops');
  return { value: s.demand.bars[i]!, lit: s.demand.lit[i]!, reasons: s.demand.reasons[i]! };
};

/** Cloth short with wool in store: the Workshops bar wants a weaver. */
function clothShort() {
  const f = villageFixture();
  const s = f.state;
  s.market.demand.fill(0);
  for (const b of s.buildings) if (b.rt) b.rt.store[g('cloth')] = 0;
  findById(s.buildings, f.b.storehouses[0])!.rt!.store[g('wool')] = 60;
  s.market.demand[g('cloth')] = 40;
  return f;
}

/** `n` built workshops with nobody at work (grown on a lot, as growth would have). */
function emptyBusinesses(s: WorldState, n: number): void {
  for (let k = 0; k < n; k++) {
    const b = build(s, 'workshop', 40 + 4 * k, 150, 0, 0, 'cider-maker');
    b.lot = s.nextId++;
  }
}

describe('businesses waiting for hands', () => {
  it('counts built businesses with nobody at work', () => {
    const { state: s } = clothShort();
    const before = businessesWaitingHands(s);
    emptyBusinesses(s, 2);
    expect(businessesWaitingHands(s)).toBe(before + 2);
  });

  it('quiets the Workshops bar and starts no business while two stand empty', () => {
    const { state: s } = clothShort();
    writeDemand(s, null);
    expect(workshops(s).value).toBeGreaterThan(0);
    expect(workshops(s).reasons.some((r) => r.code === 'hands')).toBe(false);
    emptyBusinesses(s, HANDS_WAITING - businessesWaitingHands(s));
    expect(businessesWaitingHands(s)).toBeGreaterThanOrEqual(HANDS_WAITING);
    writeDemand(s, null);
    const w = workshops(s);
    expect(w.lit).toBe(false);
    expect(w.reasons.at(-1)).toEqual({ code: 'hands' });
    expect(demandWhy({ code: 'hands' })).toMatch(/hands/);
    const d = growthDemand(s);
    expect(d.crafts + d.farms + d.shops).toBe(0);
  });
});
