// Hands in food (R1X tuning record): who works at a business that makes food or farms.
import { content } from '@qoti/content';
import { insertBuilding } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { handsInFood } from './hands';
import { flatTown } from './residents';

describe('handsInFood', () => {
  it('counts residents in farms and food trades, not other trades or the jobless', () => {
    const { world } = flatTown('hands-test', 1, 4, 6, 3);
    for (const r of world.residents) r.jobId = 0;
    expect(handsInFood(world)).toEqual({ food: 0, working: 0, share: 0 });

    const place = (def: string, trade: string, x: number) =>
      insertBuilding(world, null, content.buildingById.get(def)!, x, 60, 0, 0, { site: false, trade });
    const farm = place('farmstead', 'grain-farm', 20);
    const baker = place('workshop', 'baker', 30);
    const weaver = place('workshop', 'weaver', 40);
    const [a, b, c, d] = world.residents;
    a!.jobId = farm.id;
    b!.jobId = baker.id;
    c!.jobId = weaver.id;
    d!.jobId = 0;

    const h = handsInFood(world);
    expect(h.working).toBe(3);
    expect(h.food).toBe(2);
    expect(h.share).toBeCloseTo(2 / 3, 5);
  });
});
