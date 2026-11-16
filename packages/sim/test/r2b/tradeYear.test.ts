// R2B: the money invariant through evening sales at stops, passing and the doorstep, in the full
// pipeline over several evenings and in a year of the trade passes. Places are stubbed by hand.
import { describe, expect, it, vi } from 'vitest';
import { RoundFlags, TICKS_PER_DAY } from '../../src/constants';
import { findById } from '../../src/state/entities';
import { accrueTreats, doorstepErrand, tradePass } from '../../src/systems/market/trade';
import { applyTurn, createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { place, setStubPlaces } from './stubPlaces';
import { addOutlet, doorOf, standAt, stockTreats, stop, tickAt, walkAt } from './tradeKit';

/* eslint-disable no-restricted-syntax, @typescript-eslint/consistent-type-imports -- a test's mock factory */
vi.mock('../../src/systems/places/api', async (orig) => {
  const { stubPlacesApi } = await import('./stubPlaces');
  return stubPlacesApi(await orig<typeof import('../../src/systems/places/api')>());
});
/* eslint-enable no-restricted-syntax, @typescript-eslint/consistent-type-imports */

function town() {
  const f = villageFixture();
  const s = f.state;
  const outlets = [0, 1, 2].map((i) => addOutlet(s, 'market-stall', 40 + i * 6, 56));
  const places = outlets.map((o, i) => place({ id: `seats:${i + 1}`, tile: doorOf(o), outlets: [o.id] }));
  setStubPlaces(places);
  for (const id of f.b.stalls) outlets.push(findById(s.buildings, id)!);
  return { f, s, outlets, places };
}

describe('the money invariant', () => {
  it('holds through the full pipeline over several evenings with sales at stops, passing and the doorstep', () => {
    const { s, outlets, places } = town();
    const ctx = createTickCtx(s);
    const before = moneySnapshot(s);
    for (let day = 0; day < 5; day++) {
      for (const o of outlets) stockTreats(o, 40);
      // Run to just before 17:00, then send the grown-ups out by hand (R2A's planner is a stand-in).
      while (s.tick < tickAt(day, 17) - 1) applyTurn(s, { t: s.lastTurn + 1, cmds: [] }, ctx);
      s.households.forEach((h, hi) => {
        h.members.forEach((id, mi) => {
          const r = findById(s.residents, id)!;
          if (r.stage === 'child') return;
          const p = places[(hi + mi) % places.length]!;
          // Most stand at a place; one in four walks past an outlet; some households stay in.
          if (hi % 5 === 4) r.round = undefined;
          else if ((hi + mi) % 4 === 3) walkAt(r, p.tile, [stop(p.id, p.tile, -1)]);
          else standAt(r, p.tile, [stop(p.id, p.tile, tickAt(day, 17))]);
        });
      });
      while (s.tick < tickAt(day, 22)) applyTurn(s, { t: s.lastTurn + 1, cmds: [] }, ctx);
      expectMoneyInvariant(before, s);
    }
    const t = s.evenings.tonight; // R2A rolls it daily; until then it counts all the evenings
    const sold = t.treatsAtStops + t.treatsPassing + t.treatsDoorstep;
    expect(sold).toBeGreaterThan(0);
    expectMoneyInvariant(before, s);
  }, 60_000);

  it('holds through a year of evenings', () => {
    const { s, outlets, places } = town();
    const ctx = createTickCtx(s);
    const before = moneySnapshot(s);
    let sales = 0;
    for (let day = 0; day < 365; day++) {
      for (const o of outlets) stockTreats(o, 12);
      s.tick = tickAt(day, 17);
      accrueTreats(s);
      s.households.forEach((h, hi) => {
        h.savings += 300; // wages, so purses do not run dry across the year
        s.economy.treasury -= 300;
        const r = findById(s.residents, h.members[0]!)!;
        const p = places[hi % places.length]!;
        if (hi % 3 === 0) standAt(r, p.tile, [stop(p.id, p.tile, s.tick)]);
        else if (hi % 3 === 1) walkAt(r, p.tile, [stop(p.id, p.tile, -1)]);
        else r.round = undefined;
        for (const m of h.members) if (m !== r.id) findById(s.residents, m)!.round = undefined;
      });
      for (let t = 0; t < 4; t++) {
        s.tick = tickAt(day, 18, t * 4);
        tradePass(s, ctx);
      }
      s.tick = tickAt(day, 21, 100);
      doorstepErrand(s, ctx);
      const t = s.evenings.tonight;
      sales = t.treatsAtStops + t.treatsPassing + t.treatsDoorstep;
    }
    expect(sales).toBeGreaterThan(0);
    expect(s.tick).toBeLessThan(366 * TICKS_PER_DAY);
    // The wages above moved money between purses and the treasury only.
    expectMoneyInvariant(before, s);
    expect(RoundFlags.treat).toBe(32);
  });
});
