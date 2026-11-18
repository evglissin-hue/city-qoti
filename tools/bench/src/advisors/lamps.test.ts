// R3E: the lamps advisor keeps places alive. Candles short: the busiest place is kept and the far
// one rests; candles cover: a rest returns to normal; a set priority is never sent again; no
// lantern goes down past the candle cover at Village rank, and a Hamlet's lanterns are free. State is
// built by hand (stock, rank, decor, places), since the stand-ins (R3A to R3C) make none of it.
import { content } from '@qoti/content';
import { doorTile, TILE_FP, type Building, type PlaceView, type WorldState } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { startingTown } from '../hamlet';
import { G } from '../town';
import { advisors } from '.';
import { candlesAllow, firewoodAllows, lamps, priorityChanges, specialtyNear } from './lamps';

const S = 128;

/** A willow town at the given rank with `lanterns` lanterns (ids 9001 up) and `candles` candles in one storehouse. */
export function town(lanterns: number, candles: number, rank: 'hamlet' | 'village' = 'village'): WorldState {
  const w = startingTown('willow').world;
  w.charter.rank = rank;
  w.decor = [];
  for (let i = 0; i < lanterns; i++)
    w.decor.push({
      id: 9001 + i,
      def: 'lantern',
      fx: (20 + i) * TILE_FP,
      fz: 20 * TILE_FP,
      rot: 0,
      builtBy: 0,
    });
  const store = w.buildings.find((b) => b.rt && content.buildingById.get(b.def)?.storage);
  if (!store) throw new Error('no storehouse in the starting town');
  store.stage = 'built';
  store.rt!.store[G('candles')] = candles;
  return w;
}

/** A place stub: its lanterns are the decor ids given, visitors per evening, at tile (x, 20). */
function place(
  id: string,
  x: number,
  members: number[],
  visitors: number[],
  priority?: PlaceView['priority'],
) {
  return {
    id,
    name: id,
    tile: 20 * S + x,
    members,
    visitors,
    ...(priority ? { priority } : {}),
  } as unknown as PlaceView;
}

describe('the lamps advisor', () => {
  it('is a Hearth-lane advisor, after places, that plays unless the Hearth is off', () => {
    const def = advisors.find((a) => a.id === 'lamps')!;
    expect(def).toBe(lamps);
    expect(def.lane).toBe('hearth');
    expect(def.slot).toBeGreaterThan(advisors.find((a) => a.id === 'places')!.slot);
    expect(def.plays({}, {} as WorldState)).toBe(true);
    expect(def.plays({ hearth: false }, {} as WorldState)).toBe(false);
  });

  it('with candles short keeps the busiest place and lets the far, quiet one rest', () => {
    // Eight lanterns, one candle: it lights four (a candle for every four).
    const w = town(8, 1);
    const busy = place('busy', 30, [9001, 9002, 9003, 9004], [20, 22, 25]);
    const far = place('far', 90, [9005, 9006, 9007, 9008], [2, 1, 3]);
    const got = priorityChanges(w, [far, busy]);
    expect(got.map((c) => [c.place.id, c.priority])).toEqual([
      ['busy', 'keep'],
      ['far', 'rest'],
    ]);
  });

  it('puts a rest back to normal once candles cover every lantern, and sends nothing already set', () => {
    const w = town(8, 3);
    const busy = place('busy', 30, [9001, 9002, 9003, 9004], [20], 'keep');
    const far = place('far', 90, [9005, 9006, 9007, 9008], [2], 'rest');
    expect(priorityChanges(w, [busy, far]).map((c) => [c.place.id, c.priority])).toEqual([['far', 'normal']]);
    // Short again, with the priorities already as they should be: nothing to send.
    const short = town(8, 1);
    expect(priorityChanges(short, [busy, far])).toEqual([]);
  });

  it('sends at most a few priorities a visit and none below Village rank', () => {
    const w = town(16, 0);
    const many = [0, 1, 2, 3].map((k) =>
      place(`p${k}`, 10 + k * 10, [9001 + k * 4, 9002 + k * 4, 9003 + k * 4, 9004 + k * 4], [k]),
    );
    expect(priorityChanges(w, many).length).toBeLessThanOrEqual(3);
    expect(priorityChanges(town(16, 0, 'hamlet'), many)).toEqual([]);
  });

  it('places a lantern only while the candles cover it at Village rank; a Hamlet places freely', () => {
    expect(candlesAllow(town(0, 0, 'hamlet'))).toBe(true);
    expect(candlesAllow(town(40, 0, 'hamlet'))).toBe(true);
    // Eight lanterns need two candles a night; a ninth needs a third.
    expect(candlesAllow(town(8, 2))).toBe(false);
    expect(candlesAllow(town(8, 3))).toBe(true);
    expect(candlesAllow(town(0, 0))).toBe(false);
    expect(candlesAllow(town(4, 1), 1)).toBe(false);
    expect(candlesAllow(town(4, 2), 1)).toBe(true);
    // More than one at once: nine lanterns need three candles.
    expect(candlesAllow(town(4, 2), 5)).toBe(false);
  });

  it('counts a built chandler toward the candle cover', () => {
    const w = town(8, 0);
    expect(candlesAllow(w)).toBe(false);
    const base = w.buildings[0]!;
    w.buildings.push({ ...base, id: 9100, stage: 'built', trade: 'chandler' } as Building);
    expect(candlesAllow(w)).toBe(true);
  });

  it('keeps braziers for when firewood stands above the winter mark', () => {
    expect(firewoodAllows(town(0, 0, 'hamlet'))).toBe(true);
    expect(firewoodAllows(town(0, 0))).toBe(false);
    const stocked = town(0, 0);
    const store = stocked.buildings.find((b) => b.rt && content.buildingById.get(b.def)?.storage)!;
    store.rt!.store[G('firewood')] = 5000;
    expect(firewoodAllows(stocked)).toBe(true);
  });

  it('prefers a site beside a business making a specialty Treat', () => {
    const w = town(0, 0);
    const base = w.buildings[0]!;
    const maker = {
      ...base,
      id: 9200,
      stage: 'built',
      def: 'workshop',
      trade: 'cider-maker',
      x: 60,
      z: 60,
      rot: 0,
    } as Building;
    w.buildings.push(maker);
    const d = doorTile(maker);
    expect(specialtyNear(w, d + 3)).toBeGreaterThan(0);
    expect(specialtyNear(w, d + 40)).toBe(0);
  });
});
