// R3X: a master's good sells on its own surplus (carrier step 5b), not behind its family's
// twice-the-reserve gate. Each case sets the stores by hand and calls the 10:00 visit directly.
import { describe, expect, it } from 'vitest';
import { content } from '@qoti/content';
import type { WorldState } from '../../src/contracts';
import { carrierDay } from '../../src/systems/carrier';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { tickAt } from '../fixtures/seasonsPlace';
import { run } from '../helpers';
import { building, good } from '../ledger/helpers';
import { familyIndex } from '../../src/state/zones';

const butter = good('butter');
const FOOD = familyIndex('food');

function town(units: number, boughtYesterday = 0) {
  const f = hamletFixture();
  for (const b of f.state.buildings) {
    if (!b.rt) continue;
    b.rt.store.fill(0);
    b.rt.output.fill(0);
    b.rt.input.fill(0);
  }
  for (const h of f.state.households) h.pantry.fill(0);
  building(f.state, f.b.granary).rt!.store[butter] = units;
  f.state.market.bought = new Array<number>(content.goods.length).fill(0);
  f.state.market.bought[butter] = boughtYesterday;
  return f.state;
}

function visit(state: WorldState): number {
  state.tick = tickAt(0, 0, 2, 10);
  carrierDay(state, createTickCtx(state));
  const sold = state.carrier.sold[state.carrier.sold.length - 1]!;
  return sold[butter]!;
}

const stored = (state: WorldState) =>
  state.buildings.reduce((n, b) => n + (b.rt?.store[butter] ?? 0) + (b.rt?.output[butter] ?? 0), 0);

describe("a master's good at the carrier", () => {
  it('sells past the family gate (Food under twice its reserve), never under exportKeep', () => {
    const state = town(14);
    const keep = content.mastery.exportKeep ?? 8;
    const sold = visit(state);
    expect(sold).toBeGreaterThan(0);
    expect(sold).toBeLessThanOrEqual(14 - keep);
    expect(stored(state)).toBeGreaterThanOrEqual(keep);
  });

  it('keeps twice what households bought of it yesterday', () => {
    const state = town(30, 10);
    const sold = visit(state);
    expect(sold).toBeGreaterThan(0);
    expect(stored(state)).toBeGreaterThanOrEqual(20);
  });

  it("never sells into its family's reserve (butter is Food, and a short larder keeps it)", () => {
    const state = town(30);
    state.carrier.families[FOOD]!.reserve = 1000;
    expect(visit(state)).toBe(0);
    expect(stored(state)).toBe(30);
  });

  it('sells none on Never, or with selling off', () => {
    const a = town(30);
    run(a, { t: 'carrier.setRule', family: 'food', rule: 'never', sell: true });
    expect(visit(a)).toBe(0);
    const b = town(30);
    run(b, { t: 'carrier.setRule', family: 'food', rule: 'always', sell: false });
    expect(visit(b)).toBe(0);
  });
});
