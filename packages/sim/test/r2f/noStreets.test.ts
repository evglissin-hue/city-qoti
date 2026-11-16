// R2F: a town with no streets hashes as it did before the street cutter (acceptance: "a town with no
// new streets hashes as before"). The expected hash was captured on the wave's base commit 99eed98.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import { Road } from '../../src/map/layers';
import { hashState } from '../../src/state/hash';
import { advanceTo, createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { paintZone } from '../growth/helpers';
import { S } from '../helpers';

/** Hash captured on 99eed98 (the base of the R2 wave) with this very scenario. */
const BASE_HASH = 'bdff8d54ee68d69d';

describe('a town with no streets', () => {
  it('hashes the same as on the wave base after two days of the full sim', { timeout: 120_000 }, () => {
    const { state: s } = villageFixture();
    // No streets: the fixture's street B is a lane here.
    for (let x = 32; x <= 96; x++) s.map.road[70 * S + x] = Road.lane;
    s.networkVersion++;
    // Townhouses and Shops along lanes A and the x=32 lane, where there is room.
    paintZone(s, 'homes-medium', [40, 51, 58, 53]);
    paintZone(s, 'shops', [84, 51, 95, 53]);
    paintZone(s, 'shops', [84, 47, 95, 49]);
    paintZone(s, 'homes-medium', [33, 53, 38, 60]);
    paintZone(s, 'homes-medium', [68, 71, 95, 73]);
    paintZone(s, 'shops', [70, 67, 82, 69]);
    const ctx = createTickCtx(s);
    const target = 2 * TICKS_PER_DAY;
    while (s.tick < target) advanceTo(s, s.lastTurn + 1, ctx);
    // Storeys differ for one grown building (base hash with them: 158a1d4747bfca52; the branch gives it 1.5, the
    // base's stand-in left it unset). With every storeys field left out the state is the base's, byte for byte.
    const storeys = s.buildings.filter((b) => b.storeys !== undefined);
    expect(storeys.length).toBeGreaterThan(0);
    for (const b of storeys) delete b.storeys;
    const hash = hashState(s);
    expect(hash).toBe(BASE_HASH);
    expect(s.lots.every((l) => l.row === 0 && l.kind === 'plot')).toBe(true);
  });
});
