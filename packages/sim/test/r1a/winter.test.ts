// R1A acceptance: winter has teeth (docs/spec/13-ledger.md, Tuning targets). A town whose reserves
// stand under half the season plan's marks when snow closes the pass for two days has hungry or
// cold households, and loses none of its buildings. Every system runs.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import { PASS_EVENT, passClosed } from '../../src/systems/carrier/api';
import { familyCover } from '../../src/systems/market/balances';
import { hamletFixture } from '../fixtures/hamlet';
import { tickAt } from '../fixtures/seasonsPlace';
import { runDays } from '../market/helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';

/** The hamlet on Winter day 2, the river frozen, a day of Food and Fuel in the whole town. */
function leanWinter() {
  const f = hamletFixture();
  const s = f.state;
  s.tick = tickAt(0, 3, 2, 0);
  s.weather.river.frozen = true;
  s.weather.river.frozenTick = s.tick;
  for (const b of s.buildings) {
    if (!b.rt) continue;
    for (let g = 0; g < content.goods.length; g++) {
      const fam = content.goods[g]!.family;
      if (fam === 'food' || fam === 'fuel') {
        b.rt.store[g] = 0;
        b.rt.output[g] = 0;
      }
    }
  }
  const grain = content.goodIndex.get('grain')!;
  const firewood = content.goodIndex.get('firewood')!;
  for (const h of s.households) {
    h.pantry.fill(0);
    h.pantry[grain] = h.members.length;
    h.pantry[firewood] = 1;
  }
  return s;
}

describe('winter has teeth', () => {
  it('with the pass open, the carrier brings the essentials a lean town lacks', () => {
    const s = leanWinter();
    const before = moneySnapshot(s);
    runDays(s, 1);
    const row = s.carrier.bought[s.carrier.bought.length - 1]!;
    expect(row[content.goodIndex.get('firewood')!]).toBeGreaterThan(0);
    expect(row.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expectMoneyInvariant(before, s);
  });

  it('a town under half its marks goes hungry or cold while the pass is closed, and keeps every building', () => {
    const s = leanWinter();
    expect(familyCover(s, 0)).toBeLessThan(400);
    expect(familyCover(s, 1)).toBeLessThan(400);
    // Snow shuts the pass from this morning for two days.
    s.weather.events.push({
      id: s.nextId++,
      event: PASS_EVENT,
      start: s.tick,
      end: s.tick + 2 * TICKS_PER_DAY,
      forecastTick: s.tick - TICKS_PER_DAY,
    });
    const ids = s.buildings.map((b) => b.id);
    const before = moneySnapshot(s);
    let hungryOrCold = false;
    expect(passClosed(s)).toBe(true);
    for (let d = 0; d < 2; d++) {
      runDays(s, 1);
      for (const h of s.households)
        if ((h.warmth?.coldHours ?? 0) > 0 || (h.warmth?.coldDays ?? 0) > 0) hungryOrCold = true;
      for (const r of s.residents) if ((r.needs[0] ?? 100) < 40) hungryOrCold = true;
    }
    // The carrier came neither day.
    const rows = s.carrier.bought.slice(-2);
    expect(rows.length).toBe(2);
    for (const row of rows) expect(row.every((n) => n === 0)).toBe(true);
    expect(hungryOrCold || s.warmth.coldHouseholdDays > 0).toBe(true);
    // Nothing is lost: every building still stands.
    for (const id of ids) expect(s.buildings.some((b) => b.id === id)).toBe(true);
    expectMoneyInvariant(before, s);
  });
});
