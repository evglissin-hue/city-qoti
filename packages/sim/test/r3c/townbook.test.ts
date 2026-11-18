// The Town Book (R3C, docs/spec/19-evenings.md, The Town Book): the counts, the pages a specialty and a
// custom earn, the draws and variety they bring, Made Together, hints, callings, snapshots and
// determinism. Headless: the evening's close is called directly on a hand-set town (a site, a row, the
// evening's numbers), the way the Pattern Book's tests set a pattern.
import { content, TOWN_BOOK } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import {
  DAYS_PER_SEASON,
  GOOD_FAMILIES,
  START_HOUR,
  SUPPLY_KINDS,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
} from '../../src/constants';
import type { PlaceId, PlaceState, WorldState } from '../../src/contracts';
import { emptyTally, newPlaceState, byPlaceId } from '../../src/state/evenings';
import { hashState } from '../../src/state/hash';
import { isMasterGood } from '../../src/state/masters';
import { defPossible } from '../../src/systems/townbook/achievable';
import {
  customToday,
  pagesFound,
  pagesTogether,
  placeSpecialty,
  specialtiesOnRound,
  specialtyGood,
  townBookSale,
} from '../../src/systems/townbook/api';
import { closeTownBook } from '../../src/systems/townbook/close';
import { placeById } from '../../src/systems/places/api';
import { bumpPlaceInputs } from '../../src/systems/places/inputs';
import { advanceTo, createTickCtx, type SimCtx } from '../../src/turn';
import { townBookView } from '../../src/view/townBook';
import { hamletFixture } from '../fixtures/hamlet';
import { villageFixture } from '../fixtures/village';
import { build, decor, events, standardWorld } from '../hearth/helpers';

/** The tick of `hour`:00 on day index `day`. */
const tickAt = (day: number, hour: number): number =>
  day * TICKS_PER_DAY + (hour - START_HOUR) * TICKS_PER_HOUR;
const CIDER = content.goodIndex.get('cider')!;
const HONEY = content.goodIndex.get('honey')!;
const S = 256;

interface Site {
  id: PlaceId;
  row: PlaceState;
}

/** A town with seats 0 and 1 and every pattern known (the hints and the pages ask for it). */
function town(): WorldState {
  const s = standardWorld();
  s.time.connected = [0, 1];
  for (const p of content.patterns)
    s.hearth.discovered.push({ pattern: p.id, tick: 0, seat: 0, together: false, anchor: 0 });
  return s;
}

/** A pattern site with one bench laid by `seat` and its saved row, found by the place index. */
function site(
  s: WorldState,
  pattern: string,
  x: number,
  z: number,
  seat: 0 | 1 = 0,
  name = 'the lane',
): Site {
  const bench = decor(s, 'bench', x, z, seat);
  const anchor = z * S + x;
  s.hearth.sites.push({ pattern, anchor, members: [bench], tiles: [], seats: [seat], tick: 0 });
  s.hearth.sites.sort((a, b) =>
    a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : a.anchor - b.anchor,
  );
  bumpPlaceInputs(s);
  const id = `site:${pattern}:${anchor}`;
  const row = newPlaceState(id, name, 0);
  s.places.push(row);
  s.places.sort(byPlaceId);
  expect(placeById(s, id), id).toBeDefined();
  return { id, row };
}

interface Evening {
  customers?: [good: number, n: number][];
  visitors?: number;
  weather?: 'fair' | 'rain' | 'storm';
}

/** Gives the place its evening and closes the book at 21:20 on `day`. */
function close(
  s: WorldState,
  day: number,
  ev: Record<PlaceId, Evening>,
  ctx: SimCtx = createTickCtx(s),
): SimCtx {
  s.tick = tickAt(day, 21) + 20;
  let weather: 'fair' | 'rain' | 'storm' = 'fair';
  for (const row of s.places) {
    const e = ev[row.id];
    if (!e) continue;
    row.visitors.push(e.visitors ?? 0);
    for (const [g, n] of e.customers ?? []) for (let i = 0; i < n; i++) townBookSale(s, row, g);
    weather = e.weather ?? weather;
  }
  s.evenings.tonight = { ...emptyTally(day), weather };
  closeTownBook(s, ctx);
  return ctx;
}

/** Four evenings of cider (the first four days of the season 0). */
function sellCider(
  s: WorldState,
  id: PlaceId,
  days = [0, 1, 2, 3],
  customers = TOWN_BOOK.specialtyCustomers,
): SimCtx {
  let ctx!: SimCtx;
  for (const d of days) ctx = close(s, d, { [id]: { customers: [[CIDER, customers]] } });
  return ctx;
}

describe('the counts', () => {
  it('townBookSale counts customers by good on the place row', () => {
    const s = town();
    const { row } = site(s, 'orchard-path', 60, 60);
    townBookSale(s, row, CIDER);
    townBookSale(s, row, CIDER);
    townBookSale(s, row, HONEY);
    expect(row.customers![CIDER]).toBe(2);
    expect(row.customers![HONEY]).toBe(1);
    expect(row.customers).toHaveLength(content.goods.length);
  });

  it('the close turns ten customers into an evening of the season, resets a stale season, and clears customers', () => {
    const s = town();
    const { id, row } = site(s, 'orchard-path', 60, 60);
    close(s, 0, {
      [id]: {
        customers: [
          [CIDER, 10],
          [HONEY, 9],
        ],
      },
    });
    expect(row.customers).toBeUndefined();
    expect(row.goodEvenings).toEqual({ season: 0, n: expect.any(Array) });
    expect(row.goodEvenings!.n[CIDER]).toBe(1);
    expect(row.goodEvenings!.n[HONEY]).toBe(0);
    close(s, 1, { [id]: { customers: [[CIDER, 12]] } });
    expect(row.goodEvenings!.n[CIDER]).toBe(2);
    // A new season starts the count again.
    close(s, DAYS_PER_SEASON, { [id]: { customers: [[CIDER, 10]] } });
    expect(row.goodEvenings!.season).toBe(1);
    expect(row.goodEvenings!.n[CIDER]).toBe(1);
  });
});

describe('a specialty', () => {
  it('is found by example: its page, its name, renown once, the draw, the carrier and the round', () => {
    const f = hamletFixture();
    const s = f.state;
    s.time.connected = [0, 1];
    for (const p of content.patterns)
      s.hearth.discovered.push({ pattern: p.id, tick: 0, seat: 0, together: false, anchor: 0 });
    const { id } = site(s, 'orchard-path', 70, 70);
    const renown = s.renown.points;
    const ctx = sellCider(s, id, [0, 1, 2]);
    expect(s.townBook.pages).toEqual([]);
    expect(placeSpecialty(s, placeById(s, id)!)).toBe(0);
    expect(specialtyGood(s, CIDER)).toBe(false);
    const found = close(s, 3, { [id]: { customers: [[CIDER, 10]] } }, ctx);
    expect(s.townBook.pages).toHaveLength(1);
    const page = s.townBook.pages[0]!;
    expect(page).toMatchObject({
      kind: 'specialty',
      def: 'orchard-path-cider',
      place: id,
      good: CIDER,
      leaning: 'gardens',
    });
    expect(page.name).toBe('Orchard Walk Cider');
    expect(page.day).toBe(3);
    expect(page.seats).toEqual([0]);
    expect(s.renown.points).toBe(renown + TOWN_BOOK.pageRenown);
    expect(events(found, 'townBook.updated')).toHaveLength(1);
    expect(events(found, 'chronicle.added').some((e) => e.c.text.includes('Orchard Walk Cider'))).toBe(true);
    expect(
      events(found, 'notify').some((e) => e.kind === 'letter' && e.text.includes('Orchard Walk Cider')),
    ).toBe(true);
    // Not found again, and no more renown, on later closes.
    for (let d = 4; d < 6; d++) close(s, d, { [id]: { customers: [[CIDER, 15]] } });
    expect(s.townBook.pages).toHaveLength(1);
    expect(s.renown.points).toBe(renown + TOWN_BOOK.pageRenown);
    // The draw, after the place index rebuilds.
    bumpPlaceInputs(s);
    const place = placeById(s, id)!;
    expect(placeSpecialty(s, place)).toBe(TOWN_BOOK.specialtyDraw);
    expect(place.parts.specialty).toBe(TOWN_BOOK.specialtyDraw);
    expect(specialtyGood(s, CIDER)).toBe(true);
    expect(specialtyGood(s, HONEY)).toBe(false);
    // The round: +1 for the household with a stop there, 0 for the one without.
    const treats = GOOD_FAMILIES.indexOf('treats');
    const [a, b] = s.households;
    const rider = s.residents.find((r) => r.id === a!.members[0])!;
    rider.round = [{ place: id, kind: 'sit', tile: 0, draw: 0, flags: 0, arrived: -1 }];
    expect(specialtiesOnRound(s, a!, treats)).toBe(1);
    expect(specialtiesOnRound(s, b!, treats)).toBe(0);
    expect(specialtiesOnRound(s, a!, GOOD_FAMILIES.indexOf('food'))).toBe(0);
  });

  it('is not found for fewer than four evenings, or with nine customers', () => {
    const s = town();
    const { id } = site(s, 'orchard-path', 60, 60);
    sellCider(s, id, [0, 1, 2, 3], TOWN_BOOK.specialtyCustomers - 1);
    sellCider(s, id, [4, 5], TOWN_BOOK.specialtyCustomers);
    expect(s.townBook.pages).toEqual([]);
  });

  it('a second page of the same def at another place takes the place name', () => {
    const s = town();
    const a = site(s, 'orchard-path', 60, 60);
    const b = site(s, 'orchard-path', 80, 80, 0, 'the Old Orchard');
    b.row.custom = 'The Old Orchard';
    sellCider(s, a.id);
    close(s, 0, { [b.id]: { customers: [[CIDER, 10]] } });
    for (const d of [1, 2, 3]) close(s, d, { [b.id]: { customers: [[CIDER, 10]] } });
    expect(s.townBook.pages.map((p) => p.name)).toEqual(['Orchard Walk Cider', 'The Old Orchard Cider']);
    expect(pagesFound(s, 'specialty')).toBe(2);
  });
});

describe('Made Together', () => {
  it('needs two different seats on the place and the trade', () => {
    const together = town();
    build(together, 'workshop', 120, 120, 0, 1, 'cider-maker');
    const t = site(together, 'orchard-path', 60, 60, 0);
    sellCider(together, t.id);
    expect(together.townBook.pages[0]!.seats).toEqual([0, 1]);
    expect(pagesTogether(together)).toBe(1);

    const alone = town();
    build(alone, 'workshop', 120, 120, 0, 0, 'cider-maker');
    const a = site(alone, 'orchard-path', 60, 60, 0);
    sellCider(alone, a.id);
    expect(alone.townBook.pages[0]!.seats).toEqual([0]);
    expect(pagesTogether(alone)).toBe(0);

    // A trade nobody built still credits the one seat that laid the place.
    const bare = town();
    const c = site(bare, 'orchard-path', 60, 60, 1);
    sellCider(bare, c.id);
    expect(bare.townBook.pages[0]!.seats).toEqual([1]);
  });
});

describe('a custom', () => {
  it('a day kept three seasons running is found and draws on its day only', () => {
    const s = town();
    const { id, row } = site(s, 'orchard-path', 60, 60);
    const d = 2;
    const day = (season: number): number => season * DAYS_PER_SEASON + d;
    close(s, day(0), { [id]: { visitors: 20 } });
    expect(row.dayRuns![d]).toBe(1);
    // Rain takes the evening: the run holds.
    close(s, day(1), { [id]: { visitors: 3, weather: 'rain' } });
    expect(row.dayRuns![d]).toBe(1);
    // A fair evening with a thin crowd ends it.
    close(s, day(2), { [id]: { visitors: 3 } });
    expect(row.dayRuns![d]).toBe(0);
    for (const season of [3, 4]) close(s, day(season), { [id]: { visitors: 25 } });
    expect(s.townBook.pages).toEqual([]);
    close(s, day(5), { [id]: { visitors: 20 } });
    expect(row.dayRuns!.length).toBe(DAYS_PER_SEASON);
    expect(s.townBook.pages).toHaveLength(1);
    const page = s.townBook.pages[0]!;
    expect(page).toMatchObject({
      kind: 'custom',
      def: 'orchard-stroll',
      place: id,
      dayOfSeason: d + 1,
      leaning: 'gardens',
    });
    expect(page.seats).toEqual([0]);
    expect(pagesFound(s, 'custom')).toBe(1);
    // customToday: 15 on its day (day d + 1 of the season), nothing on the others.
    bumpPlaceInputs(s);
    const place = placeById(s, id)!;
    for (let k = 0; k < DAYS_PER_SEASON; k++) {
      s.tick = tickAt(6 * DAYS_PER_SEASON + k, 12);
      expect(customToday(s, place), `day ${k + 1}`).toBe(k === d ? TOWN_BOOK.customDraw : 0);
    }
    // The page's words say the day in the town's voice.
    const view = townBookView(s).pages[0]!;
    expect(view.text).toContain('the third evening of each season');
    expect(view.text).not.toContain('{');
  });

  it('a supply custom is found from a kept supply record', () => {
    const s = town();
    const { id, row } = site(s, 'village-green', 60, 60, 1);
    const k = SUPPLY_KINDS.indexOf('season');
    const kept = SUPPLY_KINDS.map(() => 0);
    kept[k] = DAYS_PER_SEASON;
    row.supplied = { season: 0, kept: [...kept], rested: SUPPLY_KINDS.map(() => 0) };
    const rested = SUPPLY_KINDS.map(() => 0);
    rested[k] = 1;
    // A rested piece spoils it, and a stale record (two seasons old) is not read.
    row.supplied.rested = rested;
    close(s, DAYS_PER_SEASON, { [id]: {} });
    expect(s.townBook.pages).toEqual([]);
    row.supplied = { season: 0, kept: [...kept], rested: SUPPLY_KINDS.map(() => 0) };
    close(s, DAYS_PER_SEASON * 3, { [id]: {} });
    expect(s.townBook.pages).toEqual([]);
    close(s, DAYS_PER_SEASON * 1 + 1, { [id]: {} });
    expect(s.townBook.pages.map((p) => p.def)).toEqual(['bunting-season']);
    expect(s.townBook.pages[0]).toMatchObject({
      kind: 'custom',
      dayOfSeason: 1,
      seats: [1],
      leaning: 'gardens',
    });
  });
});

describe('hints', () => {
  it('shows three at a time, only pages that can be earned, and reveals the next when one is found', () => {
    const s = town();
    const { id } = site(s, 'orchard-path', 60, 60);
    close(s, 0, { [id]: {} });
    expect(s.townBook.hints).toHaveLength(TOWN_BOOK.hints);
    for (const h of s.townBook.hints) {
      expect(defPossible(s, h), h).toBe(true);
      const sp = content.specialtyById.get(h);
      if (sp) expect(isMasterGood(content.goodIndex.get(sp.good)!), h).toBe(false);
    }
    const hint = s.townBook.hints[0]!;
    const rest = s.townBook.hints.slice(1);
    // Find the hinted page: a day custom needs its run; set it by hand and close on its day.
    const custom = content.customById.get(hint);
    if (custom) {
      const day = 12;
      s.tick = tickAt(day, 21);
      const row = s.places.find((r) => r.id === id)!;
      row.dayRuns = new Array<number>(DAYS_PER_SEASON).fill(TOWN_BOOK.customSeasons);
      s.townBook.pages.push({
        id: s.nextId++,
        kind: 'custom',
        def: hint,
        place: id,
        dayOfSeason: 1,
        name: custom.name,
        day,
        seats: [0],
        leaning: custom.leaning,
      });
    } else {
      const sp = content.specialtyById.get(hint)!;
      s.townBook.pages.push({
        id: s.nextId++,
        kind: 'specialty',
        def: hint,
        place: id,
        good: content.goodIndex.get(sp.good)!,
        name: sp.name,
        day: 0,
        seats: [0],
        leaning: sp.leaning,
      });
    }
    close(s, 13, { [id]: {} });
    expect(s.townBook.hints).toHaveLength(TOWN_BOOK.hints);
    expect(s.townBook.hints).not.toContain(hint);
    expect(s.townBook.hints.slice(0, 2)).toEqual(rest);
  });

  it("never hints a page whose pattern is unknown or whose good is a master's, nor holds one that became impossible", () => {
    const s = standardWorld();
    s.time.connected = [0, 1];
    // Nothing discovered: only a page that needs no pattern (a host or a supply) may be hinted.
    close(s, 0, {});
    for (const h of s.townBook.hints) {
      const def = content.specialtyById.get(h) ?? content.customById.get(h)!;
      expect('pattern' in def && def.pattern !== undefined ? def.pattern : null, h).toBeNull();
    }
    // One pattern known: its pages are fair game, a master's good still is not.
    s.hearth.discovered.push({ pattern: 'corner-cafe', tick: 0, seat: 0, together: false, anchor: 0 });
    s.townBook.hints = ['corner-cafe-pies'];
    close(s, 1, {});
    expect(s.townBook.hints).not.toContain('corner-cafe-pies');
    expect(s.townBook.hints).not.toContain('corner-cafe-cordial');
  });
});

describe('callings', () => {
  it('three pages of a leaning earn its calling; a second leaning earns a second and state.calling stays the first', () => {
    const s = town();
    const { id } = site(s, 'orchard-path', 60, 60);
    const page = (def: string, leaning: 'industry' | 'gardens' | 'pilgrimage'): void => {
      s.townBook.pages.push({
        id: s.nextId++,
        kind: 'custom',
        def,
        place: id,
        name: def,
        day: 0,
        seats: [0],
        leaning,
        dayOfSeason: 1,
      });
    };
    page('pond-evening', 'gardens');
    page('green-evenings', 'gardens');
    close(s, 0, { [id]: {} });
    expect(s.townBook.callings).toEqual([]);
    expect(s.calling).toBeUndefined();
    // The third comes by example.
    const ctx = sellCider(s, id, [1, 2, 3, 4]);
    expect(s.townBook.pages.filter((p) => p.leaning === 'gardens')).toHaveLength(3);
    const garden = content.callings.find((c) => c.leaning === 'gardens')!;
    expect(s.townBook.callings).toEqual([garden.id]);
    expect(s.calling).toBe(garden.id);
    expect(s.hearth.unlocked).toContain(garden.signature);
    expect(events(ctx, 'charter.updated')).toHaveLength(1);
    expect(events(ctx, 'town.updated')).toHaveLength(1);
    expect(events(ctx, 'chronicle.added').some((e) => e.c.kind === 'calling')).toBe(true);
    expect(events(ctx, 'notify').some((e) => e.kind === 'letter' && e.text.includes(garden.name))).toBe(true);
    expect(townBookView(s).callings.map((c) => c.id)).toEqual([garden.id]);
    // Not earned twice.
    const again = close(s, 5, { [id]: {} });
    expect(events(again, 'charter.updated')).toHaveLength(0);
    // A second leaning.
    page('well-gathering', 'pilgrimage');
    page('promenade', 'pilgrimage');
    page('evening-walk', 'pilgrimage');
    close(s, 6, { [id]: {} });
    const pilgrim = content.callings.find((c) => c.leaning === 'pilgrimage')!;
    expect(s.townBook.callings).toEqual([garden.id, pilgrim.id]);
    expect(s.calling).toBe(garden.id);
    expect(s.hearth.unlocked).toContain(pilgrim.signature);
  });
});

describe('seats and snapshots', () => {
  it('a seat joining from a snapshot reads the same pages, draws and customToday', () => {
    const s = town();
    const { id, row } = site(s, 'orchard-path', 60, 60);
    sellCider(s, id);
    const d = 3;
    for (const season of [0, 1, 2]) close(s, season * DAYS_PER_SEASON + d, { [id]: { visitors: 20 } });
    expect(row.dayRuns![d]).toBe(3);
    expect(s.townBook.pages.map((p) => p.kind)).toEqual(['specialty', 'custom']);
    bumpPlaceInputs(s);
    const copy = structuredClone(s);
    bumpPlaceInputs(copy);
    for (const k of [0, 1, 2, 3, 4, 5]) {
      s.tick = copy.tick = tickAt(3 * DAYS_PER_SEASON + k, 12);
      const a = placeById(s, id)!;
      const b = placeById(copy, id)!;
      expect(customToday(copy, b)).toBe(customToday(s, a));
      expect(b.parts.specialty).toBe(a.parts.specialty);
    }
    expect(placeSpecialty(copy, placeById(copy, id)!)).toBe(TOWN_BOOK.specialtyDraw);
    expect(townBookView(copy)).toEqual(townBookView(s));
    expect(hashState(copy)).toBe(hashState(s));
  });

  it('two identical runs close to identical states', () => {
    const run = (): string => {
      const s = town();
      build(s, 'workshop', 120, 120, 0, 1, 'cider-maker');
      const a = site(s, 'orchard-path', 60, 60);
      const b = site(s, 'village-green', 80, 80, 1);
      for (let d = 0; d < 3 * DAYS_PER_SEASON; d++)
        close(s, d, {
          [a.id]: { customers: [[CIDER, 11]], visitors: 22 },
          [b.id]: { customers: [[HONEY, 4]], visitors: 21, weather: d % 5 === 0 ? 'rain' : 'fair' },
        });
      expect(s.townBook.pages.length).toBeGreaterThan(0);
      return hashState(s);
    };
    expect(run()).toBe(run());
  });
});

describe('the content', () => {
  const pattern = (id: string): boolean => content.patternById.has(id);

  it('every specialty names a real pattern and a Treat, every custom a real pattern, host or supply', () => {
    for (const sp of content.specialties) {
      expect(pattern(sp.pattern), sp.id).toBe(true);
      expect(content.goodById.get(sp.good)?.family, sp.id).toBe('treats');
    }
    for (const c of content.customs) {
      if (c.kind === 'day') {
        expect(c.pattern !== undefined || c.host !== undefined, c.id).toBe(true);
        if (c.pattern !== undefined) expect(pattern(c.pattern), c.id).toBe(true);
        if (c.host !== undefined) expect(content.buildingById.has(c.host), c.id).toBe(true);
        expect(c.text, c.id).toContain('{day}');
      } else {
        expect(SUPPLY_KINDS).toContain(c.supply);
        expect(
          content.decor.some((d) => d.supply?.kind === c.supply),
          c.id,
        ).toBe(true);
      }
      expect(c.text, c.id).not.toMatch(/—/);
    }
  });

  it("every page that does not need a master can be earned in a grown valley, and a master's only with a master", () => {
    const s = villageFixture().state;
    for (const p of content.patterns)
      s.hearth.discovered.push({ pattern: p.id, tick: 0, seat: 0, together: false, anchor: 0 });
    // Good land to grow fruit and honey on (the flat test map has none).
    s.map.fertility.fill(80);
    // Festival cloth and the rest are locked until earned: the hints wait for the piece.
    for (const d of content.decor) s.hearth.unlocked.push(d.id);
    for (const c of content.customs) expect(defPossible(s, c.id), c.id).toBe(true);
    for (const sp of content.specialties) {
      const g = content.goodIndex.get(sp.good)!;
      expect(defPossible(s, sp.id), sp.id).toBe(!isMasterGood(g));
    }
  });
});

describe('a dead end is never hinted', () => {
  it('a base good whose raw has no land to grow on is not possible', () => {
    const s = villageFixture().state;
    s.map.fertility.fill(0);
    for (const p of content.patterns)
      s.hearth.discovered.push({ pattern: p.id, tick: 0, seat: 0, together: false, anchor: 0 });
    expect(defPossible(s, 'orchard-path-cider')).toBe(false);
  });
});

describe('beside every other system', () => {
  it(
    'runs through the close at 21:20 on a whole town without trouble and clears the evening',
    { timeout: 120_000 },
    () => {
      const s = hamletFixture().state;
      s.time.connected = [0, 1];
      const ctx = createTickCtx(s);
      advanceTo(s, tickAt(2, 23), ctx);
      for (const row of s.places) expect(row.customers).toBeUndefined();
      expect(s.townBook.pages.length).toBe(0);
      expect(s.townBook.hints.length).toBeLessThanOrEqual(TOWN_BOOK.hints);
    },
  );
});
