// C5A: warmth through the winter (docs/spec/14-challenge.md, Seasons): firewood burned from the
// pantry, the cold households, the cold modifier and shiver, cold snaps, the Bath House and the
// herbalist, autumn stockpiling, the Hamlet's free woodpile and the money invariant at the till.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { AgentFlags, AGENT_STRIDE, TICKS_PER_DAY, WARMTH_PER_HOUSEHOLD } from '../../src/constants';
import type { Household, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { isCold, warmthReport } from '../../src/systems/seasons/api';
import { closeWinter } from '../../src/systems/seasons';
import { marketOpen } from '../../src/systems/market/api';
import {
  AUTUMN_STOCK,
  BATH_SOFTENS,
  burnDay,
  COLD_MOOD,
  COLD_MODIFIER,
  firewoodToday,
  stockUp,
} from '../../src/systems/warmth';
import { createTickCtx } from '../../src/turn';
import { agentFrame } from '../../src/view/agents';
import { hamletFixture } from '../fixtures/hamlet';
import { tickAt } from '../fixtures/seasonsPlace';
import { winterFixture } from '../fixtures/winter';
import { expectMoneyInvariant, moneySnapshot } from '../money';

const FIREWOOD = content.goodIndex.get('firewood')!;

function stockOutlets(state: WorldState, qty: number): void {
  for (const b of state.buildings) {
    if (content.buildingById.get(b.def)?.tags?.includes('outlet') && b.rt) b.rt.store[FIREWOOD] = qty;
  }
}

function emptyFirewood(state: WorldState): void {
  for (const b of state.buildings) if (b.rt) b.rt.store[FIREWOOD] = 0;
  for (const h of state.households) h.pantry[FIREWOOD] = 0;
}

function coldMod(state: WorldState, h: Household): number | undefined {
  const r = findById(state.residents, h.members[0]!)!;
  return r.modifiers.find((m) => m.kind === COLD_MODIFIER)?.value;
}

describe('warmth', () => {
  it('burns a firewood a household each winter day from the pantry', () => {
    const f = winterFixture();
    const s = f.state;
    emptyFirewood(s);
    for (const h of s.households) h.pantry[FIREWOOD] = 3;
    burnDay(s, createTickCtx(s));
    for (const h of s.households) {
      expect(h.pantry[FIREWOOD]).toBe(3 - WARMTH_PER_HOUSEHOLD);
      expect(h.warmth?.burnedToday).toBe(WARMTH_PER_HOUSEHOLD);
      expect(isCold(s, h.id)).toBe(false);
      expect(coldMod(s, h)).toBeUndefined();
    }
  });

  it('leaves a household without firewood cold: the modifier, the shiver and the count', () => {
    const f = winterFixture();
    const s = f.state;
    emptyFirewood(s);
    for (const h of s.households) h.arrivedDay = 0;
    s.warmth = { winter: 1, coldHouseholdDays: 0, coldHouseholds: [] };
    burnDay(s, createTickCtx(s));
    const h = s.households[0]!;
    expect(isCold(s, h.id)).toBe(true);
    expect(warmthReport(s).cold).toBe(s.households.length);
    expect(s.warmth.coldHouseholdDays).toBe(s.households.length);
    expect(s.warmth.coldHouseholds).toHaveLength(s.households.length);
    expect(coldMod(s, h)).toBeLessThan(0);
    expect(coldMod(s, h)).toBeGreaterThanOrEqual(COLD_MOOD);
    // A resident out of doors shivers.
    const r = findById(s.residents, h.members[0]!)!;
    r.inside = 0;
    const frame = agentFrame(s);
    let flags = 0;
    for (let o = 0; o < frame.length; o += AGENT_STRIDE) if (frame[o] === r.id) flags = frame[o + 7]!;
    expect(flags & AgentFlags.cold).toBeTruthy();
    // Warm again the next day: the modifier goes.
    h.pantry[FIREWOOD] = 2;
    s.tick += TICKS_PER_DAY;
    burnDay(s, createTickCtx(s));
    expect(isCold(s, h.id)).toBe(false);
    expect(coldMod(s, h)).toBeUndefined();
  });

  it('doubles the firewood in a cold snap', () => {
    const f = winterFixture();
    const s = f.state;
    expect(firewoodToday(s)).toBe(WARMTH_PER_HOUSEHOLD);
    s.weather.events.push({
      id: 9999,
      event: 'cold-snap',
      start: s.tick - 10,
      end: s.tick + 2 * TICKS_PER_DAY,
      forecastTick: s.tick - TICKS_PER_DAY,
    });
    expect(firewoodToday(s)).toBe(2 * WARMTH_PER_HOUSEHOLD);
    emptyFirewood(s);
    for (const h of s.households) h.pantry[FIREWOOD] = 1;
    burnDay(s, createTickCtx(s));
    // One of two: cold for half the day.
    const h = s.households[0]!;
    expect(h.warmth?.burnedToday).toBe(1);
    expect(h.warmth?.coldHours).toBeGreaterThan(0);
  });

  it('softens the cold for households a Bath House reaches', () => {
    const f = winterFixture();
    const s = f.state;
    const bath = findById(s.buildings, f.bathHouse)!;
    const keeper = s.residents.find((r) => r.stage === 'adult')!;
    bath.rt!.workers = [keeper.id];
    // The fixture's bath house stands at the far end of lane A; bring it among the cottages.
    bath.x = 50;
    bath.z = 44;
    emptyFirewood(s);
    burnDay(s, createTickCtx(s));
    const mods = s.households.map((h) => coldMod(s, h) ?? 0);
    expect(Math.max(...mods)).toBeGreaterThanOrEqual(COLD_MOOD + BATH_SOFTENS);
    expect(Math.min(...mods)).toBeLessThan(COLD_MOOD + BATH_SOFTENS);
  });

  it('buys firewood at the till in a Village, and the money stays put', () => {
    const f = winterFixture();
    const s = f.state;
    expect(marketOpen(s)).toBe(true);
    emptyFirewood(s);
    stockOutlets(s, 200);
    for (const h of s.households) h.savings = 50_00;
    const before = moneySnapshot(s);
    const treasury = s.economy.treasury;
    burnDay(s, createTickCtx(s));
    for (const h of s.households) expect(isCold(s, h.id)).toBe(false);
    expect(s.economy.treasury).toBeGreaterThan(treasury);
    expect(s.market.demandToday[FIREWOOD]).toBeGreaterThanOrEqual(s.households.length);
    expectMoneyInvariant(before, s);
  });

  it('puts firewood by in autumn, up to four days a household', () => {
    const f = winterFixture();
    const s = f.state;
    s.tick = tickAt(1, 2, 3, 8);
    emptyFirewood(s);
    stockOutlets(s, 500);
    for (const h of s.households) h.savings = 50_00;
    stockUp(s, createTickCtx(s));
    for (const h of s.households) expect(h.pantry[FIREWOOD]).toBe(AUTUMN_STOCK);
  });

  it('takes firewood free from the storehouses in a Hamlet', () => {
    const f = hamletFixture();
    const s = f.state;
    s.tick = tickAt(0, 3, 1, 8);
    expect(marketOpen(s)).toBe(false);
    emptyFirewood(s);
    const store = s.buildings.find((b) => (content.buildingById.get(b.def)?.storage ?? 0) > 0)!;
    store.rt!.store[FIREWOOD] = 50;
    const before = moneySnapshot(s);
    burnDay(s, createTickCtx(s));
    for (const h of s.households) expect(isCold(s, h.id)).toBe(false);
    expect(store.rt!.store[FIREWOOD]).toBe(50 - s.households.length * WARMTH_PER_HOUSEHOLD);
    expect(s.economy.today.consumed[FIREWOOD]).toBe(s.households.length * WARMTH_PER_HOUSEHOLD);
    expectMoneyInvariant(before, s);
  });

  it('counts a winter where nobody was cold toward Warm Hearths, and clears the winter in spring', () => {
    const f = winterFixture();
    const s = f.state;
    s.warmth = { winter: 1, coldHouseholdDays: 0, coldHouseholds: [] };
    const warm = s.seasons.warmWinters;
    closeWinter(s);
    expect(s.seasons.warmWinters).toBe(warm + 1);
    for (const h of s.households) expect(h.warmth).toBeUndefined();
    const g = winterFixture();
    closeWinter(g.state);
    expect(g.state.seasons.warmWinters).toBe(warm);
  });
});
