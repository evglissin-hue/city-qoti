// Shared setup for the R2C edition and season tests: R2A's place index is a stand-in that finds
// nothing, so a test hands places to a state by hand (`givePlaces`) and mocks `placeIndex` to read
// them (each test file does `vi.mock('../../src/systems/places/index', mockPlaceIndex)`).
import { GOOD_FAMILIES, START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { EntityId, EveningTally, Gap, Place, PlaceState, SeatId, WorldState } from '../../src/contracts';
import { GOODS_BY_FAMILY } from '../../src/state/zones';
import { villageFixture } from '../fixtures/village';
import { givePlaces, indexFor } from './placestore';

export { givePlaces, indexFor };

export function tally(day: number, over: Partial<EveningTally> = {}): EveningTally {
  return {
    day,
    weather: 'fair',
    grownups: 0,
    out: 0,
    nowhere: 0,
    stood: 0,
    scoreSum: 0,
    friendships: 0,
    treatsAtStops: 0,
    treatsPassing: 0,
    treatsDoorstep: 0,
    takings: 0,
    ...over,
  };
}

export function place(id: string, over: Partial<Place> = {}): Place {
  return {
    id,
    source: 'seats',
    def: 'bench',
    tile: 0,
    tiles: [],
    members: [],
    seats: 4,
    childSeats: 0,
    standing: 0,
    kinds: ['sit'] as unknown as Place['kinds'],
    sheltered: false,
    warm: false,
    outlets: [],
    draw: 50,
    parts: { charm: 0, site: 0, pieces: 0, water: 0, lit: 0, treats: 0, winter: 0 },
    ...over,
  };
}

/** A saved row whose arrays hold one entry per evening, oldest first. */
export function row(
  id: string,
  name: string,
  visitors: number[],
  takings: number[] = [],
  sold: number[] = [],
): PlaceState {
  return {
    id,
    name,
    visitors,
    takings: takings.length > 0 ? takings : visitors.map(() => 0),
    sold: sold.length > 0 ? sold : visitors.map(() => 0),
    served: visitors.map(() => 0),
    firstDay: 0,
    seenDay: 0,
  };
}

export function gap(id: number, over: Partial<Gap> = {}): Gap {
  return { id, kind: 'nothingToSell', subject: 'seats:1', tile: 0, openedDay: 0, n: 9, ...over };
}

/** The village with two named seats (Kat is seat 0 in the Hearth, Sam is seat 1 in the Ledger). */
export function town(): ReturnType<typeof villageFixture> {
  const f = villageFixture();
  const s = f.state;
  while (s.seats.length < 2) {
    s.seats.push({ ...s.seats[0]!, seat: s.seats.length as SeatId });
  }
  s.seats[0]!.name = 'Kat';
  s.seats[0]!.lens = 'hearth';
  s.seats[1]!.name = 'Sam';
  s.seats[1]!.lens = 'ledger';
  return f;
}

/** Lays a bench by `seat` and returns its id. */
export function bench(state: WorldState, seat: SeatId): EntityId {
  const id = state.nextId++;
  state.decor.push({ id, def: 'bench', fx: 0, fz: 0, rot: 0, builtBy: seat });
  return id;
}

/** Puts a Treat on a building's shelf. */
export function stock(state: WorldState, id: EntityId): void {
  const b = state.buildings.find((x) => x.id === id)!;
  const treat = GOODS_BY_FAMILY[GOOD_FAMILIES.indexOf('treats')]![0]!;
  b.rt = b.rt ?? ({ store: [], reservedOut: [], workers: [] } as unknown as NonNullable<typeof b.rt>);
  b.rt.store[treat] = 5;
}

/** A tick on day `d` (the day index) in the evening. */
export function tickOnDay(d: number): number {
  return d * TICKS_PER_DAY - START_HOUR * TICKS_PER_HOUR + 21 * TICKS_PER_HOUR;
}

/** A deep copy of a state (the runtime has structuredClone; the sim's lib types do not name it). */
export function clone<T>(value: T): T {
  return (globalThis as unknown as { structuredClone: (v: T) => T }).structuredClone(value);
}
