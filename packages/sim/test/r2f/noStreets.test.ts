// R2F: a town with no streets is cut as it was before the street cutter (acceptance: "a town with no
// new streets hashes as before"). R2F checked the whole state's hash against the wave's base commit
// 99eed98 (bdff8d54ee68d69d, storeys left out). With the whole wave merged (R2X) evenings move the
// rest of the state on purpose, so the test keeps what R2F guards: the lots' geometry, which the
// round cannot touch, fingerprinted here, and no rows, gardens or corners.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import { Road } from '../../src/map/layers';
import { advanceTo, createTickCtx } from '../../src/turn';
import { villageFixture } from '../fixtures/village';
import { paintZone } from '../growth/helpers';
import { S } from '../helpers';

/** The lots' geometry after this scenario: the same on the wave's base (99eed98) and on the merged wave. */
const LOTS_PRINT = '54:4b04a968';

/** A 32-bit FNV hash of every lot's rectangle, turn, frontage and zone, in lot order. */
function lotsPrint(
  lots: readonly {
    x: number;
    z: number;
    w: number;
    d: number;
    rot: number;
    frontage: number;
    zone: number;
  }[],
): string {
  let h = 0x811c9dc5;
  for (const l of lots)
    for (const v of [l.x, l.z, l.w, l.d, l.rot, l.frontage, l.zone]) h = Math.imul(h ^ v, 0x01000193);
  return `${lots.length}:${(h >>> 0).toString(16)}`;
}

describe('a town with no streets', () => {
  it('cuts its lots as before the street cutter after two days of the full sim', { timeout: 120_000 }, () => {
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
    expect(lotsPrint(s.lots)).toBe(LOTS_PRINT);
    expect(s.lots.every((l) => l.row === 0 && l.kind === 'plot')).toBe(true);
  });
});
