// R2E: the evening round's health kinds (view/health.ts). Places and gaps are stand-ins on this
// branch, so each case is built by hand: gap rows pushed into state.gaps.open, place rows into
// state.places, a place index mocked to hand-made Places, a synthetic garden lot. Each kind flags
// its case and stays quiet on its near miss; the real stand-ins raise none of them.
import { content, type NeedsBasket } from '@qoti/content';
import { describe, expect, it, vi } from 'vitest';
import { DAYS_PER_SEASON, MAP_SIZE, TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { Gap, Lot, Place, WorldState } from '../../src/contracts';
import { dailyOffset } from '../../src/systems/economy/time';
import * as buildingRules from '../../src/rules/building';
import * as decorRules from '../../src/rules/decor';
import * as placesModule from '../../src/systems/places/index';
import { newPlaceState } from '../../src/state/evenings';
import { createWorld, defaultSettings } from '../../src/state/create';
import { advanceTo, createTickCtx } from '../../src/turn';
import { HealthWatch, type HealthKind } from '../../src/view/health';
import { villageFixture } from '../fixtures/village';

// What the mocks answer: a hand-made place list, and whether anything may be placed.
const fake = vi.hoisted(() => ({
  places: null as unknown[] | null,
  denyDecor: false,
  denyBuilding: false,
}));

// The mocks are spies on the modules the watcher imports, installed once and answering from `fake`.
const realPlaceIndex = placesModule.placeIndex;
const realCanPlaceDecor = decorRules.canPlaceDecor;
const realCanPlaceBuilding = buildingRules.canPlaceBuilding;
vi.spyOn(placesModule, 'placeIndex').mockImplementation((state: WorldState) => {
  if (!fake.places) return realPlaceIndex(state);
  const places = fake.places as Place[];
  return { places, byId: new Map(places.map((p) => [p.id, p])) };
});
vi.spyOn(decorRules, 'canPlaceDecor').mockImplementation((...a) =>
  fake.denyDecor ? { ok: false, reason: 'OCCUPIED' } : realCanPlaceDecor(...a),
);
vi.spyOn(buildingRules, 'canPlaceBuilding').mockImplementation((...a) =>
  fake.denyBuilding
    ? { ok: false, reason: 'OCCUPIED', tiles: [], foundation: false, warnings: [] }
    : realCanPlaceBuilding(...a),
);

const DAY = TICKS_PER_DAY;
const HOUR = TICKS_PER_HOUR;
const R2_KINDS: readonly HealthKind[] = [
  'gap-dead-end',
  'place-unreachable',
  'treats-unsold',
  'tier-unreachable',
  'garden-grown',
];
const tile = (x: number, z: number) => z * MAP_SIZE + x;
const ofKind = (w: HealthWatch, s: WorldState, kind: HealthKind) => w.check(s).filter((i) => i.kind === kind);

function reset(): void {
  fake.places = null;
  fake.denyDecor = false;
  fake.denyBuilding = false;
}

function place(over: Partial<Place> & { id: string; tile: number }): Place {
  return {
    source: 'seats',
    def: 'bench',
    tiles: [over.tile],
    members: [],
    seats: 2,
    childSeats: 0,
    standing: 2,
    kinds: ['sit'],
    sheltered: false,
    warm: false,
    outlets: [],
    draw: 40,
    parts: { charm: 40, site: 0, pieces: 0, water: 0, lit: 0, treats: 0 },
    ...over,
  } as Place;
}

function gap(s: WorldState, kind: Gap['kind'], subject: string, at: number): Gap {
  const g: Gap = { id: s.nextId++, kind, subject, tile: at, openedDay: 0, n: 9 };
  s.gaps.open.push(g);
  return g;
}

/** A look every hour from `from` to `to` ticks, collecting the kind's issues from the last one. */
function lookdays(w: HealthWatch, s: WorldState, kind: HealthKind, from: number, to: number) {
  let last: ReturnType<typeof ofKind> = [];
  for (let t = from; t <= to; t += HOUR) {
    s.tick = t;
    last = ofKind(w, s, kind);
  }
  return last;
}

describe('gap-dead-end', () => {
  it('flags a nothingToSell gap when no outlet could ever stand near the place', () => {
    reset();
    const { state: s } = villageFixture();
    const far = tile(10, 10);
    fake.places = [place({ id: 'seats:900', tile: far })];
    fake.denyBuilding = true;
    gap(s, 'nothingToSell', 'seats:900', far);
    const w = new HealthWatch();
    expect(lookdays(w, s, 'gap-dead-end', 0, DAY - HOUR)).toHaveLength(0);
    const issues = lookdays(w, s, 'gap-dead-end', DAY, DAY);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.text).toContain('nothingToSell');
    reset();
  });

  it('stays quiet on its near misses: a stall fits, an outlet already serves, the place is gone', () => {
    reset();
    const { state: s } = villageFixture();
    const w = new HealthWatch();
    // A stall could stand beside lane A.
    fake.places = [place({ id: 'seats:901', tile: tile(60, 49) })];
    gap(s, 'nothingToSell', 'seats:901', tile(60, 49));
    expect(lookdays(w, s, 'gap-dead-end', 0, 2 * DAY)).toHaveLength(0);
    // Nothing fits, but an outlet is already listed: its shelf can be stocked.
    s.gaps.open.length = 0;
    fake.denyBuilding = true;
    fake.places = [place({ id: 'seats:902', tile: tile(10, 10), outlets: [1] })];
    gap(s, 'nothingToSell', 'seats:902', tile(10, 10));
    expect(lookdays(w, s, 'gap-dead-end', 3 * DAY, 5 * DAY)).toHaveLength(0);
    // A gap about a place the pass no longer finds is no dead end.
    s.gaps.open.length = 0;
    fake.places = [];
    gap(s, 'nothingToSell', 'seats:gone', tile(10, 10));
    expect(lookdays(w, s, 'gap-dead-end', 6 * DAY, 8 * DAY)).toHaveLength(0);
    reset();
  });

  it('flags a nobodyPasses gap when no seat piece fits near the shop door, quiet when one does', () => {
    reset();
    const { state: s, b } = villageFixture();
    gap(s, 'nobodyPasses', `building:${b.stalls[0]}`, tile(60, 49));
    const w = new HealthWatch();
    expect(lookdays(w, s, 'gap-dead-end', 0, 2 * DAY)).toHaveLength(0);
    fake.denyDecor = true;
    const w2 = new HealthWatch();
    expect(lookdays(w2, s, 'gap-dead-end', 0, DAY - HOUR)).toHaveLength(0);
    expect(lookdays(w2, s, 'gap-dead-end', DAY, DAY)).toHaveLength(1);
    reset();
  });

  it('flags a nowhereToGo gap only when no seat piece fits within the round radius of the street', () => {
    reset();
    const { state: s } = villageFixture();
    const street = { id: s.nextId++, anchor: tile(50, 70), name: 'Mill Lane' };
    s.streets.push(street);
    gap(s, 'nowhereToGo', `street:${street.id}`, street.anchor);
    expect(lookdays(new HealthWatch(), s, 'gap-dead-end', 0, 2 * DAY)).toHaveLength(0);
    fake.denyDecor = true;
    expect(lookdays(new HealthWatch(), s, 'gap-dead-end', 0, DAY)).toHaveLength(1);
    reset();
  });

  it('never flags a kind it has no rule for, and forgets a gap that closes', () => {
    reset();
    const { state: s } = villageFixture();
    fake.denyDecor = true;
    fake.denyBuilding = true;
    gap(s, 'shortOfSupplies', 'seats:1', tile(10, 10));
    expect(lookdays(new HealthWatch(), s, 'gap-dead-end', 0, 3 * DAY)).toHaveLength(0);
    // A dead end that closes before the day is out starts its clock again next time.
    s.gaps.open.length = 0;
    fake.places = [place({ id: 'seats:903', tile: tile(10, 10) })];
    const g = gap(s, 'nothingToSell', 'seats:903', tile(10, 10));
    const w = new HealthWatch();
    expect(lookdays(w, s, 'gap-dead-end', 0, DAY - HOUR)).toHaveLength(0);
    s.gaps.open.splice(s.gaps.open.indexOf(g), 1);
    expect(lookdays(w, s, 'gap-dead-end', DAY, DAY + 2 * HOUR)).toHaveLength(0);
    s.gaps.open.push(g);
    expect(lookdays(w, s, 'gap-dead-end', DAY + 3 * HOUR, DAY + 3 * HOUR)).toHaveLength(0);
    reset();
  });
});

describe('place-unreachable', () => {
  /** Walls a tile and its four neighbors in, so no walker can stand on or beside it. */
  function wall(s: WorldState, x: number, z: number): void {
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      s.map.occupant[tile(x + dx, z + dz)] = 9999;
  }

  it('flags a place no home door can walk to once a whole day has passed', () => {
    reset();
    const { state: s } = villageFixture();
    wall(s, 20, 20);
    fake.places = [place({ id: 'seats:910', tile: tile(20, 20) })];
    const w = new HealthWatch();
    expect(lookdays(w, s, 'place-unreachable', 0, DAY - HOUR)).toHaveLength(0);
    const issues = lookdays(w, s, 'place-unreachable', DAY, DAY);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.text).toContain('seats:910');
    reset();
  });

  it('stays quiet on a place beside open ground, and on a town with no places', () => {
    reset();
    const { state: s } = villageFixture();
    fake.places = [place({ id: 'seats:911', tile: tile(60, 49) })];
    expect(lookdays(new HealthWatch(), s, 'place-unreachable', 0, 3 * DAY)).toHaveLength(0);
    fake.places = null;
    expect(lookdays(new HealthWatch(), s, 'place-unreachable', 0, 3 * DAY)).toHaveLength(0);
    reset();
  });
});

describe('treats-unsold', () => {
  /** A village with a stall holding Treats, a place listing it and its saved row. */
  function setup() {
    reset();
    const f = villageFixture();
    const s = f.state;
    const stall = s.buildings.find((x) => x.id === f.b.stalls[0])!;
    const treat = content.goods.findIndex((g) => g.family === 'treats');
    stall.rt!.store[treat] = 5;
    const p = place({ id: 'seats:920', tile: tile(60, 49), outlets: [stall.id] });
    fake.places = [p];
    const row = newPlaceState(p.id, 'The bench', 0);
    s.places.push(row);
    return { s, row, stall };
  }
  /** The evening of day `d` closed with these counts, looked at 21:00 and a minute. */
  function evening(
    w: HealthWatch,
    s: WorldState,
    row: { visitors: number[]; sold: number[] },
    d: number,
    v: number,
    sold: number,
  ) {
    row.visitors = [v];
    row.sold = [sold];
    s.tick = d * DAY + dailyOffset(21, 1);
    return ofKind(w, s, 'treats-unsold');
  }

  it('flags an outlet whose place had visitors and sold nothing a whole season of evenings', () => {
    const { s, row } = setup();
    const w = new HealthWatch();
    for (let d = 0; d < DAYS_PER_SEASON - 1; d++) expect(evening(w, s, row, d, 6, 0)).toHaveLength(0);
    const issues = evening(w, s, row, DAYS_PER_SEASON - 1, 6, 0);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.text).toContain('sold none');
    reset();
  });

  it('a sale resets the run; evenings with no visitors neither count nor reset', () => {
    const { s, row } = setup();
    const w = new HealthWatch();
    for (let d = 0; d < 5; d++) evening(w, s, row, d, 6, 0);
    // The sixth evening sold one: back to the start.
    expect(evening(w, s, row, 5, 6, 1)).toHaveLength(0);
    for (let d = 6; d < 10; d++) evening(w, s, row, d, 6, 0);
    // A quiet evening in the middle: not counted, not a reset.
    expect(evening(w, s, row, 10, 0, 0)).toHaveLength(0);
    expect(evening(w, s, row, 11, 6, 0)).toHaveLength(0);
    // Five unsold so far (6 to 9 and 11 make five); the sixth flags.
    expect(evening(w, s, row, 12, 6, 0)).toHaveLength(1);
    reset();
  });

  it('is quiet when nobody ever goes out, with no Treats on the shelf, and before 21:00', () => {
    const { s, row, stall } = setup();
    const w = new HealthWatch();
    for (let d = 0; d < 3 * DAYS_PER_SEASON; d++) expect(evening(w, s, row, d, 0, 0)).toHaveLength(0);
    const treat = content.goods.findIndex((g) => g.family === 'treats');
    stall.rt!.store[treat] = 0;
    for (let d = 20; d < 20 + 2 * DAYS_PER_SEASON; d++) expect(evening(w, s, row, d, 6, 0)).toHaveLength(0);
    stall.rt!.store[treat] = 5;
    const early = new HealthWatch();
    row.visitors = [6];
    row.sold = [0];
    for (let d = 40; d < 40 + 2 * DAYS_PER_SEASON; d++) {
      s.tick = d * DAY + dailyOffset(20);
      expect(ofKind(early, s, 'treats-unsold')).toHaveLength(0);
    }
    reset();
  });
});

describe('tier-unreachable', () => {
  const craftsfolk = () => content.basketByTier.get('craftsfolk') as { evenings?: number } & NeedsBasket;

  it('flags a gate above the best evening content allows, once, from the tier rank on', () => {
    reset();
    const { state: s } = villageFixture();
    const basket = craftsfolk();
    const was = basket.evenings;
    try {
      basket.evenings = 101;
      const w = new HealthWatch();
      const first = ofKind(w, s, 'tier-unreachable');
      expect(first).toHaveLength(1);
      expect(first[0]!.text).toContain('craftsfolk');
      expect(ofKind(w, s, 'tier-unreachable')).toHaveLength(0);
      // A hamlet has not reached the tier's rank, so nothing is said yet.
      s.charter.rank = 'hamlet';
      expect(ofKind(new HealthWatch(), s, 'tier-unreachable')).toHaveLength(0);
    } finally {
      basket.evenings = was;
    }
  });

  it('flags a tier when no seat piece or host is open to its rank', () => {
    reset();
    const { state: s } = villageFixture();
    const mutable = content as unknown as { decor: unknown; buildings: unknown };
    const { decor, buildings } = content;
    try {
      mutable.decor = decor.filter((d) => !d.seats);
      mutable.buildings = buildings.filter((b) => !b.host || b.host.seats === 0);
      const issues = ofKind(new HealthWatch(), s, 'tier-unreachable');
      expect(issues).toHaveLength(1);
      expect(issues[0]!.text).toContain('no seat piece or host');
    } finally {
      mutable.decor = decor;
      mutable.buildings = buildings;
    }
  });

  it('is quiet on the content as it stands (Craftsfolk 50 with a bench to sit on)', () => {
    reset();
    const { state: s } = villageFixture();
    expect(ofKind(new HealthWatch(), s, 'tier-unreachable')).toHaveLength(0);
  });
});

describe('garden-grown', () => {
  function garden(s: WorldState, x: number, z: number): Lot {
    const base = s.lots[0]!;
    const lot: Lot = { ...base, id: s.nextId++, x, z, w: 2, d: 2, kind: 'garden', buildingId: 0, row: 0 };
    s.lots.push(lot);
    return lot;
  }

  it('is quiet on a bare garden lot', () => {
    const { state: s } = villageFixture();
    garden(s, 20, 20);
    expect(ofKind(new HealthWatch(), s, 'garden-grown')).toHaveLength(0);
  });

  it('flags at once, once per lot: a building id, a standing tile or a grown building', () => {
    const { state: s, b } = villageFixture();
    const byId = garden(s, 20, 20);
    const byTile = garden(s, 30, 30);
    const byLot = garden(s, 40, 20);
    byId.buildingId = b.cottages[0]!;
    s.map.occupant[tile(31, 31)] = 4242;
    s.buildings.find((x) => x.id === b.cottages[1])!.lot = byLot.id;
    const w = new HealthWatch();
    const first = ofKind(w, s, 'garden-grown');
    expect(first.map((i) => i.id).sort()).toEqual([byId.id, byTile.id, byLot.id].sort());
    expect(ofKind(w, s, 'garden-grown')).toHaveLength(0);
  });
});

describe('the stand-ins raise none of them', () => {
  it('a village fixture run for three days', { timeout: 120_000 }, () => {
    reset();
    const { state: s } = villageFixture();
    const ctx = createTickCtx(s);
    const w = new HealthWatch();
    const seen: string[] = [];
    let hour = -1;
    while (s.tick < 3 * DAY) {
      advanceTo(s, s.lastTurn + 1, ctx);
      const h = Math.floor(s.tick / HOUR);
      if (h === hour) continue;
      hour = h;
      for (const i of w.check(s)) if (R2_KINDS.includes(i.kind)) seen.push(`${i.kind}: ${i.text}`);
    }
    expect(seen).toEqual([]);
  });

  it('a fresh valley run for two days', { timeout: 120_000 }, () => {
    reset();
    const s = createWorld('willow', { ...defaultSettings(), mode: 'standard' });
    s.time.connected = [0, 1];
    const ctx = createTickCtx(s);
    const w = new HealthWatch();
    const seen: string[] = [];
    let hour = -1;
    while (s.tick < 2 * DAY) {
      advanceTo(s, s.lastTurn + 1, ctx);
      const h = Math.floor(s.tick / HOUR);
      if (h === hour) continue;
      hour = h;
      for (const i of w.check(s)) if (R2_KINDS.includes(i.kind)) seen.push(`${i.kind}: ${i.text}`);
    }
    expect(seen).toEqual([]);
  });
});
