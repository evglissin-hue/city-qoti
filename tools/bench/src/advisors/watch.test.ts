// R2X (a chore the hunt counts): the Watch's stipend, once on, stays on while the treasury holds
// any coins at all; it was switched off at 50 and on again at 150, twice a winter in a thin town.
import { PENNIES_PER_COIN } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { autoplay } from '../autoplay';
import { Planner } from '../planner';
import { watch, WATCH_BUDGET } from './watch';

describe('the watch advisor', () => {
  it(
    'keeps the stipend on while the treasury has any coins, and off until it has 150',
    { timeout: 60_000 },
    () => {
      const budgetAfter = (on: boolean, coins: number) => {
        const h = autoplay('hazel', 8).hamlet;
        const w = h.world;
        w.charter.rank = 'village';
        w.settings.threat = 'standard';
        w.watch.budget = on ? WATCH_BUDGET * PENNIES_PER_COIN : 0;
        w.economy.treasury = coins * PENNIES_PER_COIN;
        // A standing Watch House (the roster is minded only once there is one).
        const site = w.buildings.find((b) => b.stage === 'built')!;
        w.buildings.push({ ...site, id: w.nextId++, def: 'watch-house' });
        const p = new Planner(h);
        watch.create(p).visit({ afternoon: false });
        return w.watch.budget / PENNIES_PER_COIN;
      };
      // On at 40 coins stays on (it went off at 50 before); off at 0 or less.
      expect(budgetAfter(true, 40)).toBe(WATCH_BUDGET);
      expect(budgetAfter(true, -5)).toBe(0);
      // Off stays off below 150, and comes on above it while the season pays its way.
      expect(budgetAfter(false, 120)).toBe(0);
    },
  );
});
