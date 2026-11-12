// R1A acceptance: no tier names a single good, so a town with no windmill reaches Craftsfolk on
// porridge, fish and cheese (docs/spec/13-ledger.md, Population tiers). A headless run: every system
// runs, the carrier included, for a week of days.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { findById } from '../../src/state/entities';
import { withoutSystems } from '../../src/systems';
import { runDays } from '../market/helpers';
import { tierProgress } from '../../src/systems/tiers/api';
import { villageFixture } from '../fixtures/village';
import { rejection, run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { good, place, staff, stocked } from '../village/helpers';

const FOOD = ['grain', 'vegetables', 'fruit', 'fish', 'cheese', 'bread'];

describe('Craftsfolk without a windmill', () => {
  it('a town with no windmill and no bread reaches Craftsfolk on porridge, fish and cheese', () => {
    const f = villageFixture();
    const s = f.state;
    // No windmill, so no baker: both go.
    expect(rejection(run(s, { t: 'build.remove', ids: [f.b.windmill, f.b.bakery] }))).toBeUndefined();
    expect(s.buildings.some((b) => b.def === 'windmill' || b.trade === 'baker')).toBe(false);
    staff(s, place(s, 'tavern', 46, 43), 2);
    staff(s, place(s, 'herbalist', 52, 43), 1);
    s.map.charm.fill(40);
    // No bread anywhere; porridge, fish and cheese in the stores, with a treat and a ware.
    for (const b of s.buildings) {
      if (!b.rt) continue;
      for (const id of FOOD) {
        b.rt.store[good(id)] = 0;
        b.rt.output[good(id)] = 0;
        b.rt.input[good(id)] = 0;
      }
    }
    for (const h of s.households) {
      for (const id of FOOD) h.pantry[good(id)] = 0;
      if (h.tier === 'settler') h.savings = Math.max(h.savings, 40 * 100);
    }
    stocked(findById(s.buildings, f.b.storehouses[1])!, 'store', [
      ['cider', 100],
      ['candles', 40],
    ]);
    // A week of porridge and cheese for everyone, and fish for the first few days (it spoils).
    const pop = s.residents.length;
    stocked(findById(s.buildings, f.b.granary)!, 'store', [
      ['grain', 5 * pop],
      ['fish', 2 * pop],
      ['cheese', 3 * pop],
    ]);
    // Nobody brings bread: no neighbor sells it.
    expect(content.neighbors.some((n) => n.sells.some(([g]) => g === 'bread'))).toBe(false);
    const settlers = s.households.filter((h) => h.tier === 'settler').map((h) => h.id);
    expect(settlers.length).toBeGreaterThan(0);
    const before = moneySnapshot(s);
    // Charm is the Hearth's: it holds at the doors for the length of the run.
    withoutSystems(['charm'], () => runDays(s, 7));
    const moved = s.households.filter(
      (h) =>
        settlers.includes(h.id) &&
        (h.tier === 'craftsfolk' || !!findById(s.buildings, h.homeId)?.rt?.upgrade),
    );
    const why = s.households
      .filter((h) => settlers.includes(h.id))
      .map(
        (h) =>
          `${h.id} ${h.tier} d${h.tierDays} [${tierProgress(s, h)?.missing.join(',')}] seen ${JSON.stringify(h.seen)}`,
      );
    expect(moved.length, why.join('\n')).toBeGreaterThan(0);
    expect(s.buildings.some((b) => (b.rt?.store[good('bread')] ?? 0) > 0)).toBe(false);
    expectMoneyInvariant(before, s);
  });
});
