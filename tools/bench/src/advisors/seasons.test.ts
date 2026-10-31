// C5A: the seasons advisor tells the one planner to keep new buildings off the floodplain once a
// flood is forecast, and lets it build there again when the flood has gone.
import { describe, expect, it } from 'vitest';
import { content } from '@qoti/content';
import { Flags, MAP_SIZE, onFloodplain, TICKS_PER_DAY } from '@qoti/sim';
import { startingTown } from '../hamlet';
import { Planner } from '../planner';
import { seasons } from './seasons';

describe('the seasons advisor', () => {
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
      seasons.create(p).visit({ afternoon: false });
      const b = p.build('well');
      expect(b).not.toBeNull();
      const [bw, bd] = content.buildingById.get('well')!.size;
      return onFloodplain(w, b!.x, b!.z, bw, bd);
    };
    expect(where(false)).toBe(true);
    expect(where(true)).toBe(false);
  });
});
