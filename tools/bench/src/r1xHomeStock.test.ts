// R1X E11: townStock skips the buildings that keep no goods (a home with no storage and no method):
// the sum reads the same as before only while their `store` and `output` stay zero. This plays the
// bench autoplayer thirty days on two seeds, one of them through a Village claim so townhouses
// stand, and looks every game hour, so a unit that lay there even for an hour would show.
import { content } from '@qoti/content';
import { keepsNoGoods, type WorldState } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { autoplay } from './autoplay';

function strays(w: WorldState): string[] {
  const out: string[] = [];
  for (const b of w.buildings) {
    if (!b.rt || !keepsNoGoods(content.buildingById.get(b.def))) continue;
    for (const [name, arr] of [
      ['store', b.rt.store],
      ['output', b.rt.output],
    ] as const) {
      for (let g = 0; g < arr.length; g++)
        if (arr[g]) out.push(`${b.def} ${b.id} ${name} ${content.goods[g]?.id ?? g} ${arr[g]}`);
    }
  }
  return out;
}

describe('homes keep no goods', { timeout: 600_000 }, () => {
  for (const [seed, villageDay] of [
    ['willow', undefined],
    ['hazel', 12],
  ] as const) {
    it(`every housing building's store and output stay zero over thirty days of ${seed}`, () => {
      let looks = 0;
      let homes = 0;
      const seen: string[] = [];
      autoplay(seed, 30, {
        villageDay,
        onHour: (w) => {
          looks++;
          homes = Math.max(
            homes,
            w.buildings.filter((b) => keepsNoGoods(content.buildingById.get(b.def))).length,
          );
          if (seen.length < 5) seen.push(...strays(w));
        },
      });
      expect(looks).toBeGreaterThan(100);
      expect(homes).toBeGreaterThan(3);
      expect(seen).toEqual([]);
    });
  }

  it('the flag is the housing defs with no storage and no method', () => {
    const flagged = content.buildings.filter((d) => keepsNoGoods(d));
    expect(flagged.length).toBeGreaterThan(0);
    for (const d of flagged) {
      expect(d.housing, d.id).toBeDefined();
      expect(d.storage ?? 0, d.id).toBe(0);
      expect(d.methods, d.id).toBeUndefined();
    }
  });
});
