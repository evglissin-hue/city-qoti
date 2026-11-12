// R1A acceptance: nothing stalls (docs/spec/13-ledger.md, rule 3 and Tuning targets). Makers with
// hands and none of their raw good in the valley are never a whole day without it while their
// family's rule lets the carrier buy: the carrier brings it next morning. Every system runs; days
// the pass is closed are left out (nothing comes then, by design). R1F's audit takes this check
// over (`carrierCovers`); until then it lives here.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { Building, WorldState } from '../../src/contracts';
import { methodOf } from '../../src/state/zones';
import { carrierCovers, passClosed } from '../../src/systems/carrier/api';
import { dayIndex } from '../../src/systems/economy/time';
import { applyTurn, createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { good, place, staff } from '../village/helpers';

/** Hours each maker spent short of a raw good the carrier covers, by building and day. */
function shortHours(state: WorldState, makers: readonly Building[], days: number): Map<string, number> {
  const out = new Map<string, number>();
  const ctx = createTickCtx(state);
  const end = state.tick + days * TICKS_PER_DAY;
  while (state.tick < end) {
    applyTurn(state, { t: state.lastTurn + 1, cmds: [] }, ctx);
    ctx.events.length = 0;
    if (state.tick % TICKS_PER_HOUR !== 0 || passClosed(state)) continue;
    for (const b of makers) {
      const m = methodOf(b)!;
      const short = m.inputs.some(([id, qty]) => {
        const g = content.goodIndex.get(id)!;
        return (b.rt!.input[g] ?? 0) < qty && carrierCovers(state, b, g);
      });
      if (!short) continue;
      const key = `${b.trade ?? b.def} day ${dayIndex(state.tick)}`;
      out.set(key, (out.get(key) ?? 0) + 1);
    }
  }
  return out;
}

describe('nothing stalls', () => {
  it('a baker, a weaver and a cider maker with no raw good in the valley get it from the carrier', () => {
    const f = villageFixture();
    const s = f.state;
    const baker = s.buildings.find((b) => b.id === f.b.bakery)!;
    const weaver = place(s, 'workshop', 88, 47, 0, 'weaver');
    const cider = place(s, 'workshop', 91, 47, 0, 'cider-maker');
    staff(s, weaver, 1);
    staff(s, cider, 1);
    if (baker.rt!.workers.length === 0) staff(s, baker, 1);
    // None of their raw goods anywhere in the valley.
    for (const b of s.buildings) {
      if (!b.rt) continue;
      for (const id of ['grain', 'wool', 'fruit']) {
        b.rt.store[good(id)] = 0;
        b.rt.output[good(id)] = 0;
        b.rt.input[good(id)] = 0;
      }
    }
    for (const h of s.households) for (const id of ['grain', 'fruit']) h.pantry[good(id)] = 0;
    const makers = [baker, weaver, cider];
    for (const b of makers)
      for (const [id] of methodOf(b)!.inputs) expect(carrierCovers(s, b, good(id))).toBe(true);
    const before = moneySnapshot(s);
    const hours = shortHours(s, makers, 4);
    const whole = [...hours].filter(([, h]) => h >= 24).map(([k]) => k);
    expect(whole, `makers a whole day short: ${whole.join(', ')}`).toEqual([]);
    // And the carrier did bring them.
    for (const id of ['grain', 'wool', 'fruit']) {
      expect(
        s.carrier.bought.some((row) => row[good(id)]! > 0),
        id,
      ).toBe(true);
    }
    expectMoneyInvariant(before, s);
  });
});
