// R3X: `PlaceState.served` was never written, so the nothing-to-sell gap (and the Shops bar's
// "unserved place") could not end however many stalls stood by. The hourly places pass now keeps the
// evening's most outlets with Treats on the shelf, and a sale at a stop counts too.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import { placeState } from '../../src/state/evenings';
import { insertBuilding } from '../../src/state/place';
import { PATTERNS_OFFSET } from '../../src/systems/hearth/patterns';
import { places, placeIndex } from '../../src/systems/places';
import { findGap, openGap } from '../../src/systems/gaps/api';
import { GAPS_OFFSET, gaps } from '../../src/systems/gaps';
import { recordSale } from '../../src/systems/places/api';
import { startEvening } from '../../src/systems/residents/round';
import { createTickCtx } from '../../src/turn';
import { hamletFixture } from '../fixtures/hamlet';
import { good } from '../ledger/helpers';

const DAY = 3;

function evening() {
  const f = hamletFixture();
  const s = f.state;
  const ctx = createTickCtx(s);
  const spot = placeIndex(s).places[0]!;
  s.tick = DAY * TICKS_PER_DAY + 11 * TICKS_PER_HOUR; // tick 0 is 06:00: 17:00
  startEvening(s, ctx);
  const at = (hour: number) => {
    s.tick = DAY * TICKS_PER_DAY + (hour - 6) * TICKS_PER_HOUR + PATTERNS_OFFSET;
    places.tick(s, ctx);
  };
  return { s, spot, at };
}

describe('a place row counts the outlets that served it', () => {
  it('stays 0 with nothing on a shelf, counts a stocked stall, and keeps the count when the round empties it', () => {
    const { s, spot, at } = evening();
    const tx = spot.tile % MAP_SIZE;
    const tz = Math.floor(spot.tile / MAP_SIZE);
    const stall = insertBuilding(s, null, content.buildingById.get('market-stall')!, tx + 1, tz, 0, 0, {
      site: false,
    });
    at(18);
    const now = () => placeIndex(s).places.find((p) => p.id === spot.id)!;
    expect(now().outlets, 'the stall is an outlet of the place').toContain(stall.id);
    const row = placeState(s, spot.id)!;
    expect(row.served[row.served.length - 1]).toBe(0);
    stall.rt!.store[good('honey')] = 5;
    // Nobody came yet: a quiet place is not counted (the City's quiet places cost the pass its budget).
    at(19);
    expect(row.served[row.served.length - 1]).toBe(0);
    row.visitors[row.visitors.length - 1] = 3;
    at(20);
    expect(row.served[row.served.length - 1]).toBe(1);
    stall.rt!.store[good('honey')] = 0;
    at(21);
    expect(row.served[row.served.length - 1]).toBe(1);
  });

  it('a sale at a stop counts the place served', () => {
    const { s, spot, at } = evening();
    at(18);
    const row = placeState(s, spot.id)!;
    expect(row.served[row.served.length - 1]).toBe(0);
    recordSale(s, spot.id, 1, 0, 1, 0);
    expect(row.served[row.served.length - 1]).toBe(1);
  });

  it('a nothing-to-sell gap closes after closeAfter real evenings with a stocked stall in reach', () => {
    const { s, spot, at } = evening();
    s.charter.rank = 'village';
    const tx = spot.tile % MAP_SIZE;
    const tz = Math.floor(spot.tile / MAP_SIZE);
    const stall = insertBuilding(s, null, content.buildingById.get('market-stall')!, tx + 1, tz, 0, 0, {
      site: false,
    });
    stall.rt!.store[good('honey')] = 5;
    at(18);
    expect(placeIndex(s).places.find((p) => p.id === spot.id)!.outlets).toContain(stall.id);
    openGap(s, null, 'nothingToSell', spot.id, spot.tile, 9);
    const row = placeState(s, spot.id)!;
    const ctx = createTickCtx(s);
    const closeAfter = content.gapByKind.get('nothingToSell')!.closeAfter;
    for (let k = 0; k < closeAfter; k++) {
      expect(findGap(s, 'nothingToSell', spot.id), `still open before evening ${k + 1}`).toBeDefined();
      const d = DAY + k;
      if (k > 0) {
        // The next evening: a fresh tally and a fresh row entry, as 17:00 makes them.
        s.tick = d * TICKS_PER_DAY + 11 * TICKS_PER_HOUR;
        startEvening(s, ctx);
      }
      row.visitors[row.visitors.length - 1] = 9;
      s.evenings.tonight.weather = 'fair';
      s.tick = d * TICKS_PER_DAY + 13 * TICKS_PER_HOUR + PATTERNS_OFFSET; // 19:00
      places.tick(s, ctx);
      s.tick = d * TICKS_PER_DAY + GAPS_OFFSET;
      gaps.tick(s, ctx);
    }
    expect(findGap(s, 'nothingToSell', spot.id)).toBeUndefined();
    expect(s.gaps.closed.some((g) => g.subject === spot.id)).toBe(true);
  });
});
