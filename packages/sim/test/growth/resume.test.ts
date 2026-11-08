// C4B determinism across a save: the zoning skip, the route cache and the counted-passes list are
// derived memory, so a seat that loads a snapshot mid-game must tick on exactly like the seat that
// never stopped (the joining seat in a two-player valley does just that).
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { Cart, WorldState } from '../../src/contracts';
import { createValley, defaultSettings } from '../../src/state/create';
import { hashState } from '../../src/state/hash';
import { deserialize, serialize } from '../../src/state/serialize';
import { requestCartMove } from '../../src/systems/traffic/api';
import { advanceTo, createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { S } from '../helpers';
import { paintZone } from './helpers';

function resumeAgrees(state: WorldState, ticks: number): void {
  const copy = deserialize(serialize(state));
  expect(hashState(copy)).toBe(hashState(state));
  advanceTo(state, state.tick + ticks, createTickCtx(state));
  advanceTo(copy, copy.tick + ticks, createTickCtx(copy));
  expect(hashState(copy)).toBe(hashState(state));
}

describe('a loaded valley ticks on like the one that kept going', () => {
  it('in a standard hamlet from its first day', () => {
    const s = createValley('resume', { ...defaultSettings(), mode: 'standard' });
    s.time.connected = [0];
    advanceTo(s, TICKS_PER_DAY / 2, createTickCtx(s));
    resumeAgrees(s, TICKS_PER_DAY);
  });

  it('in a village with zones growing and carts on the roads', () => {
    const f = villageFixture();
    const s = f.state;
    paintZone(s, 'homes-low', [66, 71, 95, 74]);
    paintZone(s, 'crafts', [83, 44, 95, 49]);
    const carts: Cart[] = [];
    for (let k = 0; k < 6; k++) {
      const cart: Cart = {
        id: s.nextId++,
        def: 'cart',
        home: f.b.storehouses[0],
        tile: 50 * S + 40 + k,
        move: null,
        load: [],
        job: 0,
        dir: 1,
        parked: false,
      };
      s.carts.push(cart);
      carts.push(cart);
    }
    advanceTo(s, s.tick + TICKS_PER_HOUR * 3, createTickCtx(s));
    for (const c of carts) requestCartMove(s, c.id, 70 * S + 90);
    advanceTo(s, s.tick + TICKS_PER_HOUR + 17, createTickCtx(s));
    resumeAgrees(s, TICKS_PER_DAY + TICKS_PER_HOUR);
  });
});
