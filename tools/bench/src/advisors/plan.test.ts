// C5A: the seasons advisor (R1F: the plan advisor, which took its duties) tells the one planner to keep new buildings off the floodplain once a
// flood is forecast, and lets it build there again when the flood has gone.
import { describe, expect, it } from 'vitest';
import { content } from '@qoti/content';
import { Flags, MAP_SIZE, onFloodplain, PENNIES_PER_COIN, TICKS_PER_DAY } from '@qoti/sim';
import { autoplay } from '../autoplay';
import { startingTown } from '../hamlet';
import { Planner } from '../planner';
import { plan } from './plan';

describe('the plan advisor', () => {
  it('keeps new buildings off the floodplain while a flood is forecast', () => {
    const where = (forecast: boolean) => {
      const h = startingTown('hazel');
      const w = h.world;
      // Everything within twelve tiles of the town's middle is floodplain.
      const [x0, z0, x1, z1] = w.meta.startArea;
      const cx = Math.floor((x0 + x1) / 2);
      const cz = Math.floor((z0 + z1) / 2);
      for (let z = cz - 12; z <= cz + 12; z++)
        for (let x = cx - 12; x <= cx + 12; x++) w.map.flags[z * MAP_SIZE + x]! |= Flags.floodplain;
      if (forecast)
        w.weather.events.push({
          id: 9000,
          event: 'flood',
          start: w.tick + TICKS_PER_DAY,
          end: w.tick + 2 * TICKS_PER_DAY,
          forecastTick: w.tick,
        });
      const p = new Planner(h);
      plan.create(p).visit({ afternoon: false });
      const b = p.build('well');
      expect(b).not.toBeNull();
      const [bw, bd] = content.buildingById.get('well')!.size;
      return onFloodplain(w, b!.x, b!.z, bw, bd);
    };
    expect(where(false)).toBe(true);
    expect(where(true)).toBe(false);
  });

  it(
    "sets the carrier's Food reserve to six days once a Village has coins, from late spring",
    { timeout: 60_000 },
    () => {
      const set = (day: number, rank: 'hamlet' | 'village', coins: number) => {
        const h = autoplay('hazel', 8).hamlet;
        const w = h.world;
        w.tick = day * TICKS_PER_DAY;
        w.charter.rank = rank;
        w.economy.treasury = coins * PENNIES_PER_COIN;
        const p = new Planner(h);
        plan.create(p).visit({ afternoon: false });
        return w.carrier.families[0]!.reserve;
      };
      // Day 12 is autumn day 1; day 2 is spring day 3 (the reserve waits for late spring, the menu's put-by).
      expect(set(12, 'village', 500)).toBe(6);
      expect(set(2, 'village', 500)).toBe(3);
      expect(set(12, 'hamlet', 500)).toBe(3);
      expect(set(12, 'village', 100)).toBe(3);
    },
  );

  it(
    'leaves the card on its last zone when no bar is lit (no chore for a "nowhere in particular")',
    { timeout: 60_000 },
    () => {
      const h = autoplay('hazel', 8).hamlet;
      const w = h.world;
      w.tick = 2 * TICKS_PER_DAY;
      w.seasonPlan.buildFirst = 'shops';
      w.demand.lit.fill(false);
      const p = new Planner(h);
      plan.create(p).visit({ afternoon: false });
      expect(w.seasonPlan.buildFirst).toBe('shops');
    },
  );

  it(
    'keeps coins back for the winter food the larder falls short of, from summer day 4 to the thaw',
    { timeout: 60_000 },
    () => {
      const reserve = (day: number) => {
        const h = autoplay('hazel', 8).hamlet;
        const w = h.world;
        w.tick = day * TICKS_PER_DAY;
        for (const b of w.buildings) {
          b.rt?.store.fill(0);
          b.rt?.output.fill(0);
        }
        for (const hh of w.households) hh.pantry.fill(0);
        expect(w.residents.length).toBeGreaterThan(0);
        const p = new Planner(h);
        plan.create(p).visit({ afternoon: false });
        return p.winterFood;
      };
      // Day 12 is autumn day 1 (six days a season, spring first); day 2 is spring.
      expect(reserve(12)).toBeGreaterThan(0);
      expect(reserve(2)).toBe(0);
    },
  );
});
