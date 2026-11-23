// R3A: the supplies core. The settling at 17:30 (candles for the lanterns, cloth once a season, fires
// that may burn), the pieces' rests, the places' purse and winter mark, household candles, the place
// counts and the Lamplighter's Round. Every test holds with all systems running: they call the
// settling and the readers directly on the village fixture, and one test runs the whole sim twice.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, TICKS_PER_DAY } from '../../src/constants';
import type { Decor, EntityId, WorldState } from '../../src/contracts';
import { findById } from '../../src/state/entities';
import { newPlaceState, placeState } from '../../src/state/evenings';
import { hashState } from '../../src/state/hash';
import { drawForPlaces, placesFloor, placesMark, placesPurse } from '../../src/systems/carrier/places';
import { doorTile } from '../../src/systems/movement/api';
import { bumpPlaceInputs } from '../../src/systems/places/inputs';
import { placeIndex } from '../../src/systems/places';
import {
  candleHomes,
  decorLit,
  decorLitTonight,
  householdBought,
  lampSeasons,
  pieceRests,
} from '../../src/systems/supplies/api';
import { supplies } from '../../src/systems/supplies';
import { drawFires, settle } from '../../src/systems/supplies/settle';
import { tickAt } from '../../src/systems/supplies/time';
import { placesWant } from '../../src/systems/supplies/want';
import { advanceTo, createTickCtx } from '../../src/turn';
import { placeResting, placeSupplies, suppliesView } from '../../src/view/supplies';
import { villageFixture } from '../fixtures/village';
import { decor } from '../hearth/helpers';

const good = (id: string): number => content.goodIndex.get(id)!;
const CANDLES = good('candles');
const FIREWOOD = good('firewood');
const CLOTH = good('cloth');
const FUEL = 1;
const WARES = 3;

function setup() {
  const f = villageFixture();
  const s = f.state;
  // Reserves of nothing, so the purse is what the storehouses hold; each test sets what it needs.
  for (const fam of s.carrier.families) fam.reserve = 0;
  s.seasonPlan.reserve = 0;
  s.seasonPlan.food = null;
  s.seasonPlan.fuel = null;
  for (const b of s.buildings) if (b.rt && b.def === 'storehouse') b.rt.store.fill(0);
  const ctx = createTickCtx(s);
  const store = (g: number, n: number): void => {
    findById(s.buildings, f.b.storehouses[0])!.rt!.store[g] = n;
  };
  const stored = (g: number): number => findById(s.buildings, f.b.storehouses[0])!.rt!.store[g]!;
  /** The settling of day index `day`. */
  const settleDay = (day: number): void => {
    s.tick = tickAt(day, 17, 30);
    settle(s, ctx);
  };
  const piece = (id: EntityId): Decor => s.decor.find((d) => d.id === id)!;
  const lanterns = (n: number): EntityId[] => {
    const ids: EntityId[] = [];
    for (let k = 0; k < n; k++) ids.push(decor(s, 'lantern', 50 + 2 * k, 40));
    bumpPlaceInputs(s);
    return ids;
  };
  return { f, s, ctx, store, stored, settleDay, piece, lanterns };
}

const litIds = (s: WorldState): EntityId[] => s.supplies.lamps.map((l) => l.id);

describe('the settling and the lanterns', () => {
  it('lights half the lanterns on half the candles, the kept ones first, and nothing throws', () => {
    const { s, store, stored, settleDay, piece, lanterns } = setup();
    const ids = lanterns(8);
    // A bench in the farthest lantern's tile makes a place there, and the place is kept first.
    const far = ids[7]!;
    decor(s, 'bench', 64, 40);
    bumpPlaceInputs(s);
    const place = placeIndex(s).places.find((p) => p.tiles.includes(40 * MAP_SIZE + 64))!;
    expect(place, 'a place stands where the far lantern is').toBeDefined();
    const row = newPlaceState(place.id, 'The far end', 0);
    row.priority = 'keep';
    s.places.push(row);
    s.places.sort((a, b) => (a.id < b.id ? -1 : 1));
    store(CANDLES, 1);
    settleDay(0);
    // One candle serves four lanterns: the far one is kept, the three nearest the store follow.
    expect(litIds(s)).toEqual([...ids.slice(0, 3), far].sort((a, b) => a - b));
    expect(stored(CANDLES)).toBe(0);
    s.tick = tickAt(0, 19);
    for (const id of ids) {
      const lit = litIds(s).includes(id);
      expect(decorLit(s, piece(id)), `lantern ${id}`).toBe(lit);
      expect(pieceRests(s, piece(id))).toBe(lit ? null : 'unlit');
    }
    const view = suppliesView(s);
    expect(view.lamps.map((l) => l.id)).toEqual(litIds(s));
    expect(view.resting.filter((r) => r.kind === 'unlit')).toHaveLength(4);
    expect(s.supplies.drawn[s.supplies.drawn.length - 1]![CANDLES]).toBe(1);
  });

  it('draws nothing in a Hamlet: every lantern lit for nothing, one set down late included', () => {
    const { s, settleDay, piece, lanterns } = setup();
    s.charter.rank = 'hamlet';
    const ids = lanterns(6);
    settleDay(0);
    expect(litIds(s)).toEqual([...ids].sort((a, b) => a - b));
    expect(s.supplies.drawn[s.supplies.drawn.length - 1]!.every((n) => n === 0)).toBe(true);
    const late = decor(s, 'lantern', 80, 40);
    s.tick = tickAt(0, 20);
    expect(decorLit(s, piece(late))).toBe(true);
    expect(pieceRests(s, piece(late))).toBeNull();
    expect(placesWant(s).every((n) => n === 0)).toBe(true);
  });

  it('from Village rank a lantern set down after the settling waits for tomorrow', () => {
    const { s, store, settleDay, piece, lanterns } = setup();
    lanterns(4);
    store(CANDLES, 5);
    settleDay(0);
    const late = decor(s, 'lantern', 80, 40);
    bumpPlaceInputs(s);
    s.tick = tickAt(0, 20);
    expect(decorLit(s, piece(late))).toBe(false);
    expect(decorLitTonight(s, piece(late))).toBe(false);
    expect(pieceRests(s, piece(late))).toBe('unlit');
    settleDay(1);
    expect(litIds(s)).toContain(late);
  });

  it('lights at 18:00 sharp and goes out at 07:00; tonight reads at any hour', () => {
    const { s, store, settleDay, piece, lanterns } = setup();
    const [first] = lanterns(4);
    store(CANDLES, 1);
    settleDay(3);
    const d = piece(first!);
    s.tick = tickAt(3, 17, 59);
    expect(decorLit(s, d)).toBe(false);
    expect(decorLitTonight(s, d)).toBe(true);
    s.tick = tickAt(3, 18);
    expect(decorLit(s, d)).toBe(true);
    s.tick = tickAt(4, 6, 50);
    expect(decorLit(s, d)).toBe(true);
    s.tick = tickAt(4, 7);
    expect(decorLit(s, d)).toBe(false);
    s.tick = tickAt(4, 12);
    expect(decorLitTonight(s, d)).toBe(true);
    // The settling's walk stands on its own: every reach lies between the settling and 18:00.
    for (const l of s.supplies.lamps) {
      expect(l.reach).toBeGreaterThanOrEqual(tickAt(3, 17, 30));
      expect(l.reach).toBeLessThanOrEqual(tickAt(3, 18));
    }
  });

  it('draws nothing under a reserve: the lanterns go unlit and the stock stays', () => {
    const { s, store, stored, settleDay, lanterns } = setup();
    lanterns(4);
    store(CANDLES, 2);
    s.carrier.families[WARES]!.reserve = 30;
    expect(placesFloor(s, WARES)).toBeGreaterThan(2);
    settleDay(0);
    expect(s.supplies.lamps).toEqual([]);
    expect(stored(CANDLES)).toBe(2);
    expect(s.supplies.roundBroken).toBe(true);
  });
});

describe('fires, cloth, fountains and tables', () => {
  /** A brazier with a place row that had visitors tonight. */
  function braizer(s: WorldState): EntityId {
    const id = decor(s, 'brazier', 58, 40);
    bumpPlaceInputs(s);
    const place = placeIndex(s).places.find(
      (p) => p.members.includes(id) || p.tiles.includes(40 * MAP_SIZE + 58),
    )!;
    expect(place, 'the brazier makes a place').toBeDefined();
    const row = placeState(s, place.id) ?? newPlaceState(place.id, 'Brazier', 0);
    row.visitors = [3];
    if (!placeState(s, place.id)) s.places.push(row);
    s.places.sort((a, b) => (a.id < b.id ? -1 : 1));
    return id;
  }

  it('a fire never takes a home’s firewood: pantries count toward the fuel reserve', () => {
    const { s, store, stored, settleDay, piece } = setup();
    const id = braizer(s);
    s.carrier.families[FUEL]!.reserve = 1;
    const floor = placesFloor(s, FUEL);
    expect(floor).toBeGreaterThan(0);
    // The homes hold the whole floor in their pantries but one unit short, and the store has one.
    const pantryUnits = floor - 1;
    let left = pantryUnits;
    for (const h of s.households) h.pantry[FIREWOOD] = 0;
    for (const b of s.buildings) {
      if (!b.rt) continue;
      b.rt.store[FIREWOOD] = 0;
      b.rt.output[FIREWOOD] = 0;
    }
    for (const h of s.households) {
      const n = Math.min(left, 3);
      h.pantry[FIREWOOD] = n;
      left -= n;
    }
    expect(left).toBe(0);
    store(FIREWOOD, 1);
    const pantries = (): number => s.households.reduce((n, h) => n + (h.pantry[FIREWOOD] ?? 0), 0);
    s.tick = tickAt(12, 17, 30);
    settleDay(12);
    expect(placesFloor(s, FUEL)).toBe(floor);
    expect(pieceRests(s, piece(id))).toBe('cold');
    s.tick = tickAt(12, 21, 30);
    drawFires(s, createTickCtx(s));
    expect(stored(FIREWOOD)).toBe(1);
    expect(pantries()).toBe(pantryUnits);
    // With a unit above the floor the fire burns, and its firewood comes from the store.
    store(FIREWOOD, 3);
    settleDay(13);
    expect(pieceRests(s, piece(id))).toBeNull();
    s.tick = tickAt(13, 21, 30);
    drawFires(s, createTickCtx(s));
    expect(stored(FIREWOOD)).toBe(2);
    expect(pantries()).toBe(pantryUnits);
    expect(s.supplies.pieces.find((r) => r.id === id)!.burned).toBe(13);
    // Drawn once a night, however many times the hour comes round.
    drawFires(s, createTickCtx(s));
    expect(stored(FIREWOOD)).toBe(2);
  });

  it('a fire burns nothing out of its seasons, and an empty evening costs nothing', () => {
    const { s, store, stored, settleDay, piece } = setup();
    const id = braizer(s);
    store(FIREWOOD, 5);
    settleDay(0);
    expect(pieceRests(s, piece(id))).toBeNull();
    s.tick = tickAt(0, 21, 30);
    drawFires(s, createTickCtx(s));
    expect(stored(FIREWOOD)).toBe(5);
    // Autumn, but nobody came: lit, and no firewood.
    const row = placeState(
      s,
      placeIndex(s).places.find((p) => p.members.includes(id) || p.tiles.includes(40 * MAP_SIZE + 58))!.id,
    )!;
    row.visitors = [0];
    settleDay(12);
    drawFires(s, createTickCtx(s));
    expect(stored(FIREWOOD)).toBe(5);
  });

  it('puts cloth up once a season and fades it without', () => {
    const { s, store, stored, settleDay, piece } = setup();
    const id = decor(s, 'maypole', 60, 40);
    bumpPlaceInputs(s);
    // Before its first settling a piece has just been put up.
    settleDay(0);
    expect(pieceRests(s, piece(id))).toBe('faded');
    store(CLOTH, 4);
    settleDay(1);
    expect(pieceRests(s, piece(id))).toBeNull();
    expect(stored(CLOTH)).toBe(2);
    expect(s.supplies.pieces.find((r) => r.id === id)!.cloth).toBe(0);
    // The rest of the season it stays up and draws nothing more.
    settleDay(2);
    expect(stored(CLOTH)).toBe(2);
    expect(pieceRests(s, piece(id))).toBeNull();
    // A new season with no cloth in stock: faded; with some, up again.
    store(CLOTH, 1);
    settleDay(6);
    expect(pieceRests(s, piece(id))).toBe('faded');
    expect(s.supplies.pieces.find((r) => r.id === id)!.rested).toBe(1);
    store(CLOTH, 2);
    settleDay(7);
    expect(pieceRests(s, piece(id))).toBeNull();
    expect(stored(CLOTH)).toBe(0);
    expect(s.supplies.pieces.find((r) => r.id === id)!.cloth).toBe(1);
  });

  it('a fountain is dry away from a well and fine beside one', () => {
    const { s, settleDay, piece } = setup();
    const near = decor(s, 'fountain', 60, 55);
    const far = decor(s, 'fountain', 90, 30);
    const bath = decor(s, 'birdbath', 90, 34);
    bumpPlaceInputs(s);
    settleDay(0);
    expect(pieceRests(s, piece(near))).toBeNull();
    expect(pieceRests(s, piece(far))).toBe('dry');
    expect(pieceRests(s, piece(bath))).toBe('dry');
    expect(suppliesView(s).resting.map((r) => r.id)).toEqual([far, bath].sort((a, b) => a - b));
  });

  it('a table is bare without Treats on a shelf near it and served with some', () => {
    const { f, s, settleDay, piece } = setup();
    const stall = findById(s.buildings, f.b.stalls[0])!;
    const door = doorTile(stall);
    const x = (door % MAP_SIZE) + 1;
    const z = Math.floor(door / MAP_SIZE) + 1;
    const table = decor(s, 'cafe-table', x, z);
    const lonely = decor(s, 'cafe-table', 40, 100);
    bumpPlaceInputs(s);
    const treat = content.goods.findIndex((g) => g.family === 'treats');
    settleDay(0);
    stall.rt!.store.fill(0);
    expect(pieceRests(s, piece(table))).toBe('bare');
    stall.rt!.store[treat] = 3;
    expect(pieceRests(s, piece(table))).toBeNull();
    expect(pieceRests(s, piece(lonely))).toBe('bare');
  });
});

describe('the places’ purse and winter mark', () => {
  it('the mark falls through winter: day 1 full, the last day a sixth', () => {
    const { s } = setup();
    s.seasonPlan.reserve = 8;
    s.tick = tickAt(18, 12);
    expect(placesMark(s, FUEL)).toBe(8);
    let last = Infinity;
    for (let day = 18; day <= 23; day++) {
      s.tick = tickAt(day, 12);
      const m = placesMark(s, FUEL)!;
      expect(m).toBeLessThan(last);
      last = m;
    }
    expect(last).toBeCloseTo(8 / 6, 1);
    // Homes keep the flat mark; outside the stretch there is none.
    s.tick = tickAt(0, 12);
    expect(placesMark(s, FUEL)).toBeNull();
    // The floor follows: more days of use at the start of winter than at its end.
    s.tick = tickAt(18, 12);
    const first = placesFloor(s, FUEL);
    s.tick = tickAt(23, 12);
    expect(placesFloor(s, FUEL)).toBeLessThan(first);
  });

  it('draws from storehouses nearest first, counts it consumed, and never past the surplus', () => {
    const { f, s, store } = setup();
    const b = findById(s.buildings, f.b.storehouses[1])!;
    store(CANDLES, 3);
    b.rt!.store[CANDLES] = 5;
    const purse = placesPurse(s);
    expect(purse.free[CANDLES]).toBe(8);
    expect(purse.surplus[WARES]).toBeGreaterThanOrEqual(8);
    const nearA = doorTile(findById(s.buildings, f.b.storehouses[0])!);
    const before = s.economy.today.consumed[CANDLES]!;
    expect(drawForPlaces(s, purse, CANDLES, 4, nearA)).toBe(4);
    expect(findById(s.buildings, f.b.storehouses[0])!.rt!.store[CANDLES]).toBe(0);
    expect(b.rt!.store[CANDLES]).toBe(4);
    expect(s.economy.today.consumed[CANDLES]).toBe(before + 4);
    expect(purse.free[CANDLES]).toBe(4);
    purse.surplus[WARES] = 1;
    expect(drawForPlaces(s, purse, CANDLES, 4, nearA)).toBe(1);
  });
});

describe('what places want, household candles and the place counts', () => {
  it('wants a candle for every four lanterns, the cloth not up, and firewood in season', () => {
    const { s, lanterns, store, settleDay } = setup();
    lanterns(6);
    const mast = decor(s, 'maypole', 60, 42);
    decor(s, 'brazier', 58, 42);
    bumpPlaceInputs(s);
    s.tick = tickAt(0, 10);
    let want = placesWant(s);
    expect(want[CANDLES]).toBe(2);
    expect(want[CLOTH]).toBe(2);
    expect(want[FIREWOOD]).toBe(0);
    store(CLOTH, 2);
    settleDay(0);
    s.tick = tickAt(12, 10);
    want = placesWant(s);
    expect(want[FIREWOOD]).toBe(1);
    expect(mast).toBeGreaterThan(0);
  });

  it('a candle lights a home five nights', () => {
    const { s, settleDay } = setup();
    const h = s.households.find((x) => x.homeId)!;
    householdBought(s, h, CANDLES, 1);
    householdBought(s, h, good('bread'), 3);
    expect(h.candle).toBe(content.supplies.candleNights);
    let nights = 1;
    for (let day = 1; day < 12; day++) {
      settleDay(day);
      if (!(h.candle && candleHomes(s).includes(h.homeId!))) break;
      nights += 1;
    }
    expect(nights).toBe(5);
    expect(h.candle).toBeUndefined();
  });

  it('counts a place’s kept and rested nights this season, and starts over in a new one', () => {
    const { s, lanterns, store, settleDay } = setup();
    const ids = lanterns(4);
    decor(s, 'bench', 50, 40);
    bumpPlaceInputs(s);
    const place = placeIndex(s).places.find((p) => p.tiles.includes(40 * MAP_SIZE + 50))!;
    expect(place).toBeDefined();
    s.places.push(newPlaceState(place.id, 'The bench', 0));
    s.places.sort((a, b) => (a.id < b.id ? -1 : 1));
    store(CANDLES, 1);
    settleDay(0);
    expect(placeState(s, place.id)!.supplied).toEqual({
      season: 0,
      kept: [1, 0, 0, 0, 0],
      rested: [0, 0, 0, 0, 0],
    });
    expect(placeSupplies(s, place)).toEqual([
      { kind: 'nightly', good: 'candles', pieces: 1, wants: 1, resting: 0 },
    ]);
    expect(placeResting(s, place)).toBeUndefined();
    // No candle tomorrow: the lantern rests.
    settleDay(1);
    expect(placeState(s, place.id)!.supplied).toEqual({
      season: 0,
      kept: [1, 0, 0, 0, 0],
      rested: [1, 0, 0, 0, 0],
    });
    expect(placeResting(s, place)).toEqual([{ id: ids[0], kind: 'unlit' }]);
    settleDay(6);
    expect(placeState(s, place.id)!.supplied).toEqual({
      season: 1,
      kept: [0, 0, 0, 0, 0],
      rested: [1, 0, 0, 0, 0],
    });
  });
});

describe('The Lamplighter’s Round', () => {
  /** Settles days `from` to `to` (inclusive) with candles for every lantern, then lets the clock cross into the next. */
  function season(lit: boolean, rank: 'village' | 'hamlet' = 'village'): WorldState {
    const { s, ctx, lanterns, store, settleDay } = setup();
    s.charter.rank = rank;
    lanterns(4);
    // The first season watched is never counted; start in season 1 with the round under way.
    s.tick = tickAt(6, 0);
    supplies.tick(s, ctx);
    expect(s.supplies.roundSeason).toBe(1);
    expect(s.supplies.roundBroken).toBe(true);
    s.supplies.roundBroken = false;
    for (let day = 6; day <= 11; day++) {
      store(CANDLES, lit ? 4 : 0);
      settleDay(day);
    }
    s.tick = tickAt(12, 0);
    supplies.tick(s, ctx);
    expect(s.supplies.roundSeason).toBe(2);
    return s;
  }

  it('counts a season settled all lit from Village rank', () => {
    const s = season(true);
    expect(s.supplies.roundSeasons).toBe(1);
    expect(lampSeasons(s)).toBe(1);
  });

  it('does not count a season with a lantern unlit, or one below Village rank', () => {
    expect(season(false).supplies.roundSeasons).toBe(0);
    expect(season(true, 'hamlet').supplies.roundSeasons).toBe(0);
  });

  it('a town with no lantern keeps no round', () => {
    const { s, ctx, settleDay } = setup();
    s.tick = tickAt(6, 0);
    supplies.tick(s, ctx);
    s.supplies.roundBroken = false;
    for (let day = 6; day <= 11; day++) settleDay(day);
    s.tick = tickAt(12, 0);
    supplies.tick(s, ctx);
    expect(s.supplies.roundSeasons).toBe(0);
  });
});

describe('a standard valley through four days', () => {
  it('hashes the same twice, candles, fires and all', { timeout: 120_000 }, () => {
    const run = (): string => {
      const { s, ctx, lanterns, store } = setup();
      lanterns(6);
      decor(s, 'maypole', 60, 40);
      decor(s, 'brazier', 58, 40);
      bumpPlaceInputs(s);
      store(CANDLES, 3);
      store(CLOTH, 4);
      store(FIREWOOD, 6);
      advanceTo(s, s.lastTurn + 4 * TICKS_PER_DAY, ctx);
      expect(s.supplies.night).toBeGreaterThanOrEqual(2);
      return hashState(s);
    };
    expect(run()).toBe(run());
  });
});
