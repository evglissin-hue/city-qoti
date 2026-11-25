// R3E: the lamps advisor keeps places alive. Candles short: the busiest place is kept and the far
// one rests; candles cover: a rest returns to normal; a set priority is never sent again; no
// lantern goes down past the candle cover at Village rank, and a Hamlet's lanterns are free. State is
// built by hand (stock, rank, decor, places), since the stand-ins (R3A to R3C) make none of it.
import { content } from '@qoti/content';
import {
  doorTile,
  PENNIES_PER_COIN,
  TILE_FP,
  type Building,
  type PlaceView,
  type WorldState,
} from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { startingTown } from '../hamlet';
import { Planner } from '../planner';
import { G } from '../town';
import { advisors } from '.';
import {
  candlesAllow,
  charterNear,
  firewoodAllows,
  lamps,
  FIRE_FLOOR,
  LANTERN_FLOOR,
  priorityChanges,
  specialtyNear,
} from './lamps';

const S = 128;
/** Lanterns one candle lights a night, and the nights the town's candles in hand are spread over (the crate's week). */
const PER = content.decorById.get('lantern')!.supply!.per!;
const NIGHTS = content.supplies.charterCrateNights!;

/** A willow town at the given rank with `lanterns` lanterns (ids 9001 up) and `candles` candles in one storehouse. */
function town(lanterns: number, candles: number, rank: 'hamlet' | 'village' = 'village'): WorldState {
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
    // Two candles' worth of lanterns, one candle: it lights the first half.
    const w = town(2 * PER, 1);
    const ids = (from: number) => Array.from({ length: PER }, (_, k) => 9001 + from + k);
    const busy = place('busy', 30, ids(0), [20, 22, 25]);
    const far = place('far', 90, ids(PER), [2, 1, 3]);
    const got = priorityChanges(w, [far, busy]);
    expect(got.map((c) => [c.place.id, c.priority])).toEqual([
      ['busy', 'keep'],
      ['far', 'rest'],
    ]);
  });

  it('puts a rest back to normal once candles cover every lantern, and sends nothing already set', () => {
    const ids = (from: number) => Array.from({ length: PER }, (_, k) => 9001 + from + k);
    const w = town(2 * PER, 3);
    const busy = place('busy', 30, ids(0), [20], 'keep');
    const far = place('far', 90, ids(PER), [2], 'rest');
    expect(priorityChanges(w, [busy, far]).map((c) => [c.place.id, c.priority])).toEqual([['far', 'normal']]);
    // Short again, with the priorities already as they should be: nothing to send.
    const short = town(2 * PER, 1);
    expect(priorityChanges(short, [busy, far])).toEqual([]);
  });

  it('sends at most a few priorities a visit and none below Village rank', () => {
    const w = town(4 * PER, 0);
    const many = [0, 1, 2, 3].map((k) =>
      place(
        `p${k}`,
        10 + k * 10,
        Array.from({ length: PER }, (_, i) => 9001 + k * PER + i),
        [k],
      ),
    );
    expect(priorityChanges(w, many).length).toBeLessThanOrEqual(3);
    expect(priorityChanges(town(4 * PER, 0, 'hamlet'), many)).toEqual([]);
  });

  /** The County's crate, held at the Town Hall's store. */
  const crate = (w: WorldState, n: number): void => {
    const hall = w.buildings.find((b) => b.def === 'town-hall')!;
    hall.stage = 'built';
    hall.rt!.store[G('candles')] = n;
  };

  it('stands lanterns to the candles coming, at every rank: the stock and the crate over a week, and what is made a day', () => {
    // No household buys a candle of its own here: what is made all goes to the lanterns.
    const noHomes = (w: WorldState): WorldState => {
      w.households = [];
      return w;
    };
    // The first few lanterns need no cover.
    expect(candlesAllow(town(0, 0))).toBe(true);
    expect(candlesAllow(town(LANTERN_FLOOR - 1, 0))).toBe(true);
    // Past the floor, a Hamlet's lanterns want candles coming too (they will burn them from the Charter).
    expect(candlesAllow(noHomes(town(LANTERN_FLOOR, 0, 'hamlet')))).toBe(false);
    expect(candlesAllow(noHomes(town(LANTERN_FLOOR, 0)))).toBe(false);
    // Candles in stock count for nothing here (much of it sits on shelves no lantern draws from).
    const nightsToFeed = Math.ceil((LANTERN_FLOOR + 1) / PER);
    expect(candlesAllow(noHomes(town(LANTERN_FLOOR, 1000)))).toBe(false);
    // The County's crate at the Town Hall counts, spread over its week: PER lanterns for each candle a night.
    const held = noHomes(town(LANTERN_FLOOR, 0, 'hamlet'));
    crate(held, nightsToFeed * NIGHTS - 1);
    expect(candlesAllow(held)).toBe(false);
    crate(held, nightsToFeed * NIGHTS);
    expect(candlesAllow(held)).toBe(true);
    expect(candlesAllow(held, PER + 1)).toBe(false);
    // What the town made yesterday counts a night's worth each day.
    const made = noHomes(town(LANTERN_FLOOR, 0));
    made.economy.yesterday.produced[G('candles')] = nightsToFeed;
    expect(candlesAllow(made)).toBe(true);
    made.economy.yesterday.produced[G('candles')] = nightsToFeed - 1;
    expect(candlesAllow(made)).toBe(false);
  });

  it('counts a built chandler toward what is made a day, as soon as it stands', () => {
    const w = town(4 * PER, 0);
    expect(candlesAllow(w)).toBe(false);
    const base = w.buildings[0]!;
    for (let k = 0; k < 4; k++)
      w.buildings.push({ ...base, id: 9100 + k, stage: 'built', trade: 'chandler' } as Building);
    expect(candlesAllow(w)).toBe(true);
  });

  it('reads the Charter as near when it is within two goals of met', () => {
    const w = town(0, 0, 'hamlet');
    const def = content.charterById.get(w.charter.charter)!;
    w.charter.progress = def.goals.map(() => 0);
    expect(charterNear(w)).toBe(false);
    w.charter.progress = def.goals.map((g, i) => (i < def.goals.length - 2 ? g.target : 0));
    expect(charterNear(w)).toBe(true);
    expect(charterNear(town(0, 0))).toBe(false);
  });

  it('keeps bees of its own, an Apiary at a time, while the candles made fall short of the lanterns and windows', () => {
    const run = (lanterns: number, made: number) => {
      const h = startingTown('willow');
      const p = new Planner(h);
      const w = p.w;
      w.charter.rank = 'village';
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
      w.economy.treasury = 5000 * PENNIES_PER_COIN;
      const store = w.buildings.find((b) => b.rt && content.buildingById.get(b.def)?.storage)!;
      store.stage = 'built';
      store.rt!.store[G('timber')] = 200;
      w.economy.yesterday.produced[G('candles')] = made;
      p.advisor = { id: 'lamps', lane: 'hearth' };
      p.runDay = 12;
      lamps.create(p).visit({ afternoon: false });
      return p.decisions.filter((d) => d.cmd.t === 'build.place' && d.cmd.def === 'apiary');
    };
    // Short: an Apiary is asked for, in the Hearth's lane.
    const got = run(LANTERN_FLOOR, 0);
    expect(got.length).toBeLessThanOrEqual(1);
    for (const d of got) expect(d.lane).toBe('hearth');
    // Covered, or too few lanterns to matter: none.
    expect(run(LANTERN_FLOOR, 500)).toEqual([]);
    expect(run(LANTERN_FLOOR - 1, 0)).toEqual([]);
  });

  it('keeps braziers for when firewood stands above the winter mark, past the first few', () => {
    const fires = (w: WorldState) => {
      for (let i = 0; i < FIRE_FLOOR; i++)
        w.decor.push({ id: 9500 + i, def: 'brazier', fx: 5 * TILE_FP, fz: 5 * TILE_FP, rot: 0, builtBy: 0 });
      return w;
    };
    expect(firewoodAllows(town(0, 0, 'hamlet'))).toBe(true);
    expect(firewoodAllows(town(0, 0))).toBe(true);
    expect(firewoodAllows(fires(town(0, 0)))).toBe(false);
    const stocked = fires(town(0, 0));
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
