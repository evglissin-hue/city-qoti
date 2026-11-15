// P2: the game as it ships. The midday growth pass is built and switched off (GROWTH_MIDDAY), so
// growth runs at 01:00 only, on main's schedule; a lot that waits says the night's hour.
import { describe, expect, it } from 'vitest';
import { DEMAND_KINDS, GROWTH_HOURS, GROWTH_MIDDAY, TICKS_PER_DAY } from '../../src/constants';
import { dailyOffset } from '../../src/systems/economy/time';
import { growth, growthPass, nextGrowthHour, refreshDemand } from '../../src/systems/growth';
import { createTickCtx } from '../../src/turn';
import { demandView } from '../../src/view/demand';
import { villageFixture } from '../fixtures/village';
import { lotsIn, paintZone, zoneNow } from '../growth/helpers';

describe('growth with the midday pass switched off', () => {
  it('is switched off, and the system runs once a day at 01:00', () => {
    expect(GROWTH_MIDDAY).toBe(false);
    expect(growth.every).toBe(TICKS_PER_DAY);
    expect(growth.offset).toBe(dailyOffset(GROWTH_HOURS[0]));
  });

  it('starts nothing at midday and says a waiting lot starts at 1:00', () => {
    const { state: s } = villageFixture();
    // Homes zoned in the morning, in reach of the east storehouse, with nothing under construction.
    paintZone(s, 'homes-low', [66, 71, 80, 72]);
    zoneNow(s);
    expect(lotsIn(s, [66, 71, 80, 72]).length).toBeGreaterThanOrEqual(3);
    s.tick = TICKS_PER_DAY + dailyOffset(9);
    refreshDemand(s, null);
    expect(nextGrowthHour(s)).toBe(1);
    const homes = demandView(s).bars[DEMAND_KINDS.indexOf('homes')]!;
    expect(homes.value).toBeGreaterThan(0);
    expect(homes.reasons.at(-1)).toEqual({ code: 'lotWaiting', value: 1 });
    expect(homes.why.at(-1)).toBe('A lot is free and waiting. Building starts at 1:00.');
    const sites = () => s.buildings.filter((b) => b.lot && b.stage === 'construction').length;
    const before = sites();
    s.tick = TICKS_PER_DAY + dailyOffset(13);
    expect(growthPass(s, createTickCtx(s), true)).toBe(0);
    expect(sites()).toBe(before);
    // The night starts them.
    s.tick = 2 * TICKS_PER_DAY + dailyOffset(1) - TICKS_PER_DAY;
    expect(growthPass(s, createTickCtx(s))).toBeGreaterThan(0);
  });
});
