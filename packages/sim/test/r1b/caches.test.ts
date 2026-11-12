// R1B: the growth pass keeps derived memory between nights (served lists, reach grids, the raised
// Windmill, the road and ground epochs). None of it is saved, so a seat that loads the valley
// mid-game starts with none; it must play on exactly like the seat that kept going, through
// growth, retooling, roads painted and removed, and ground raised.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import type { WorldState } from '../../src/contracts';
import { Road } from '../../src/map/layers';
import { hashState } from '../../src/state/hash';
import { deserialize, serialize } from '../../src/state/serialize';
import { advanceTo, createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { S } from '../helpers';
import { paintZone } from '../growth/helpers';

function days(state: WorldState, n: number, each?: (d: number) => void): void {
  for (let d = 0; d < n; d++) {
    advanceTo(state, state.tick + TICKS_PER_DAY, createTickCtx(state));
    each?.(d);
  }
}

/** The changes both seats see on the same days: a road painted and taken up, ground raised. */
function poke(state: WorldState, d: number): void {
  if (d === 1) for (let x = 84; x <= 92; x++) state.map.road[52 * S + x] = Road.path;
  if (d === 3) for (let x = 84; x <= 92; x++) state.map.road[52 * S + x] = 0;
  if (d === 4) for (let z = 46; z <= 50; z++) for (let x = 66; x <= 72; x++) state.map.height[z * S + x] = 3;
  if (d === 1 || d === 3 || d === 4) state.networkVersion += 1;
}

describe('the growth pass after a load', () => {
  it(
    'plays on like the seat that kept going, nightly, through growth, retooling and new roads',
    { timeout: 120_000 },
    () => {
      const f = villageFixture();
      const a = f.state;
      paintZone(a, 'crafts', [83, 44, 95, 49]);
      paintZone(a, 'farms', [66, 76, 95, 83]);
      paintZone(a, 'homes-low', [40, 74, 61, 78]);
      let b = deserialize(serialize(a));
      expect(hashState(b)).toBe(hashState(a));
      days(a, 7, (d) => poke(a, d));
      // The other seat reloads every evening, so every night starts with no memory at all.
      for (let d = 0; d < 7; d++) {
        advanceTo(b, b.tick + TICKS_PER_DAY, createTickCtx(b));
        poke(b, d);
        b = deserialize(serialize(b));
      }
      expect(hashState(b)).toBe(hashState(a));
      // Something grew and the bars were written, so the memory was in play.
      expect(a.buildings.some((x) => x.lot && x.trade)).toBe(true);
      expect(a.demand.bars.some((v) => v > 0)).toBe(true);
    },
  );
});
