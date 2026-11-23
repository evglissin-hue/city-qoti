// P3A growth order (systems/growth/index.ts, startSites): while food jobs stand open at built
// workplaces that grow or make Food, the night's pass tries homes before farms (the hands first);
// with none open, farms come first as before. One start left for the day shows which went first.
import { describe, expect, it } from 'vitest';
import { GROWTH_PER_DAY, growthDemand, growthPass } from '../../src/systems/growth';
import { dayIndex } from '../../src/systems/economy/time';
import { createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { paintZone, zoneNow } from '../growth/helpers';
import { place } from '../village/helpers';

/** The village with Homes and Farmland lots free, both wanted, one start left today. */
function onlyOneStart(foodOpen: boolean) {
  const { state: s } = villageFixture();
  paintZone(s, 'farms', [83, 38, 96, 49]);
  zoneNow(s);
  // A built grain farm with nobody at work is an open food job.
  if (foodOpen) place(s, 'farmstead', 60, 30, 0, 'grain-farm');
  const want = growthDemand(s);
  expect(want.homes).toBeGreaterThan(0);
  expect(want.farms).toBeGreaterThan(0);
  s.demand.starts = { day: dayIndex(s.tick), n: GROWTH_PER_DAY - 1 };
  const before = new Set(s.buildings.map((b) => b.id));
  const started = growthPass(s, createTickCtx(s));
  const grown = s.buildings.filter((b) => !before.has(b.id));
  return { started, grown };
}

describe('the night’s pass with one start left', () => {
  it('starts a farm first when no food job stands open', () => {
    const { started, grown } = onlyOneStart(false);
    expect(started).toBe(1);
    expect(grown.map((b) => b.def)).toEqual(['farmstead']);
  });

  it('starts a home first while a food job stands open', () => {
    const { started, grown } = onlyOneStart(true);
    expect(started).toBe(1);
    expect(grown.map((b) => b.def)).toEqual(['cottage']);
  });
});
