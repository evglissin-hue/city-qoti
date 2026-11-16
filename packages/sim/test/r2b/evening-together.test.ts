// R2B: an evening end to end across R2B's parts (the master's cross-check): a treat bought at a stop
// by the trade pass shows in the 21:00 score and moves the evenings need; a household that went
// nowhere is sent for from the doorstep at 21:30 and scores the floor; money holds throughout.
// Places and stops are stubbed by hand until R2A's round lands.
import { content } from '@qoti/content';
import { describe, expect, it, vi } from 'vitest';
import { RoundFlags } from '../../src/constants';
import { findById } from '../../src/state/entities';
import { EVENINGS_NEED } from '../../src/state/evenings';
import { accrueTreats, doorstepErrand, tradePass } from '../../src/systems/market/trade';
import { closeEvening } from '../../src/systems/residents/evening';
import { createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { place, setStubPlaces } from './stubPlaces';
import { doorOf, owe, owedHundredths, resident, standAt, stockTreats, stop, tickAt } from './tradeKit';

/* eslint-disable no-restricted-syntax, @typescript-eslint/consistent-type-imports -- a test's mock factory */
vi.mock('../../src/systems/places/api', async (orig) => {
  const { stubPlacesApi } = await import('./stubPlaces');
  return stubPlacesApi(await orig<typeof import('../../src/systems/places/api')>());
});
/* eslint-enable no-restricted-syntax, @typescript-eslint/consistent-type-imports */

const P = content.places;

describe('an evening across R2B', () => {
  it('a treat at a stop scores, the doorstep serves the stay-at-homes, and money holds', () => {
    const f = villageFixture();
    const s = f.state;
    const stall = findById(s.buildings, f.b.stalls[0])!;
    stockTreats(stall, 30);
    const door = doorOf(stall);
    setStubPlaces([place({ id: 'seats:1', tile: door, outlets: [stall.id], draw: 50 })]);
    const ctx = createTickCtx(s);
    const before = moneySnapshot(s);

    // 17:00: the Treats line accrues; one household is owed enough for its member at the stop.
    s.tick = tickAt(3, 17);
    accrueTreats(s);
    const out = findById(s.households, f.households[0]!)!;
    const home = findById(s.households, f.households[1]!)!;
    // A whole unit owed in both households, whatever their size.
    owe(out, 1);
    owe(home, 1);
    expect(owedHundredths(out)).toBe(100);

    // 17:30: a grown-up of the first household sits at the place by the stall.
    s.tick = tickAt(3, 17, 100);
    const r = resident(
      s,
      out.members.find((id) => {
        const m = resident(s, id);
        return m.stage === 'adult' || m.stage === 'young';
      })!,
    );
    const stops = [stop('seats:1', door, s.tick - 4)];
    standAt(r, door, stops);
    tradePass(s, ctx);
    expect(stops[0]!.flags & RoundFlags.treat).toBeTruthy();

    // 21:00: their evening scores the place's draw and the treat; the need moves a third of the way.
    s.tick = tickAt(3, 21);
    const need = r.needs[EVENINGS_NEED]!;
    closeEvening(s, ctx);
    expect(r.evening?.score).toBe(50 + P.treatScore);
    expect(r.needs[EVENINGS_NEED]).toBe(need + Math.round((50 + P.treatScore - need) / P.needStepOneIn));
    // A grown-up who went nowhere scores the floor.
    const stayer = resident(
      s,
      home.members.find((id) => {
        const m = resident(s, id);
        return m.stage === 'adult' || m.stage === 'young';
      })!,
    );
    expect(stayer.evening?.score).toBe(P.stayInScore);

    // 21:30: the first household bought on the round and is not sent for; the second puts a third by.
    s.tick = tickAt(3, 21, (P.doorstepMinute * 200) / 60);
    const doorstepBefore = s.evenings.tonight.treatsDoorstep;
    doorstepErrand(s, ctx);
    expect(out.doorstep ?? 0).toBe(0);
    expect(home.doorstep).toBeGreaterThan(0);
    expect(s.evenings.tonight.treatsDoorstep).toBeGreaterThanOrEqual(doorstepBefore);
    expect(r.carry).toBeNull();
    expectMoneyInvariant(before, s);
  });
});
