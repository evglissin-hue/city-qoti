// C5B: festivals on the winter fixture (docs/spec/12-hearth.md, Festivals): planning validation,
// pieces placed with the decor tool and taken down (or kept) the morning after, the menu put by at
// noon, the evening (guests walk to the site and go home after), the outcome and its rewards, and
// the together moments (only with both seats here; a one-seat run hashes the same apart from them).
import { content, festivalTuning } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { FESTIVAL, MAP_SIZE, TICKS_PER_HOUR, TILE_FP } from '../../src/constants';
import type { Command, Rect, SimEvent } from '../../src/contracts';
import { hashState } from '../../src/state/hash';
import { deserialize, serialize } from '../../src/state/serialize';
import { festivalMorale, reserveMenu } from '../../src/systems/festivals/api';
import { siteRect } from '../../src/systems/festivals/site';
import { isFood } from '../../src/state/zones';
import { createTickCtx } from '../../src/turn';
import { tickAt } from '../fixtures/seasonsPlace';
import { rejection, run } from '../helpers';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { feastFixture, good, inTown, runUntil, stock, todayAt } from './helpers';

const plan = (over: Partial<Extract<Command, { t: 'festival.plan' }>> = {}): Command => ({
  t: 'festival.plan',
  site: { rect: [51, 52, 57, 58] },
  menu: [
    ['bread', 10],
    ['vegetables', 10],
  ],
  twist: '',
  music: 'none',
  ...over,
});

const onSite = (r: Rect, tile: number): boolean => {
  const x = tile % MAP_SIZE;
  const z = Math.floor(tile / MAP_SIZE);
  return x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
};

describe('planning', () => {
  it('takes open ground of 6x6 or more, or a pattern site standing now', () => {
    const { state } = feastFixture(2, 10);
    expect(rejection(run(state, plan()))).toBeUndefined();
    expect(state.festival.plan?.site).toEqual({ rect: [51, 52, 57, 58] });
    expect(rejection(run(state, plan({ site: { rect: [51, 52, 55, 58] } })))).toBe('INVALID');
    // Over the cottages and the lane: not open ground.
    expect(rejection(run(state, plan({ site: { rect: [43, 46, 50, 52] } })))).toBe('OCCUPIED');
    expect(rejection(run(state, plan({ site: { pattern: 'well-gathering-place', anchor: 1 } })))).toBe(
      'NOT_FOUND',
    );
    const anchor = 52 * MAP_SIZE + 60;
    expect(
      rejection(run(state, plan({ site: { pattern: 'well-gathering-place', anchor } }))),
    ).toBeUndefined();
    expect(siteRect(state, state.festival.plan!.site)).not.toBeNull();
  });

  it('keeps menus to four goods, rotates the twist and checks the music', () => {
    const { state } = feastFixture(2, 10);
    const five: [string, number][] = ['bread', 'fish', 'vegetables', 'cider', 'cheese'].map((g) => [g, 5]);
    expect(rejection(run(state, plan({ menu: five })))).toBe('TOO_MANY');
    // The last festival's twist cannot come round again straight away.
    state.festival.history.push({
      season: 2,
      year: 1,
      festival: 'harvest-supper',
      stars: 3,
      twist: 'costume-parade',
    });
    expect(rejection(run(state, plan({ twist: 'costume-parade' })))).toBe('NOT_ALLOWED');
    expect(rejection(run(state, plan({ twist: 'snow-sculptures' })))).toBeUndefined();
    // Out of season.
    expect(rejection(run(state, plan({ twist: 'harvest-display' })))).toBe('NOT_ALLOWED');
    expect(rejection(run(state, plan({ music: 'bandstand' })))).toBe('LOCKED');
    // An Artistic grown-up plays when Juniper Reed is not in town.
    expect(rejection(run(state, plan({ music: 'resident' })))).toBeUndefined();
    expect(state.festival.plan!.musician).toBeGreaterThan(0);
  });

  it('returns what was put by when a good leaves the menu', () => {
    const { state } = feastFixture(2, 10);
    state.festival.plan!.reserved = [[good('cider'), 8]];
    const before = inTown(state, 'cider');
    run(state, plan({ menu: [['bread', 4]] }));
    expect(inTown(state, 'cider')).toBe(before + 8);
    expect(state.festival.plan!.reserved).toEqual([]);
  });
});

describe('pieces', () => {
  it('places festival pieces with the decor tool while planned, and tidies them the morning after', () => {
    const { state } = feastFixture(6, 10);
    const place = (def: string, x: number, z: number) =>
      run(state, { t: 'decor.place', def, fx: x * TILE_FP, fz: z * TILE_FP, rot: 0 });
    expect(rejection(place('festival-stall', 53.5, 54.5))).toBeUndefined();
    expect(rejection(place('flower-arch', 55.5, 56.5))).toBeUndefined();
    const stall = state.decor[state.decor.length - 2]!;
    const arch = state.decor[state.decor.length - 1]!;
    expect(stall.festival).toEqual({ kept: false });
    expect(state.festival.pieces).toContain(stall.id);
    // A stall cannot be kept; an arch can.
    expect(rejection(run(state, { t: 'festival.keepPiece', decor: stall.id }))).toBe('NOT_ALLOWED');
    expect(rejection(run(state, { t: 'festival.keepPiece', decor: arch.id }))).toBeUndefined();
    expect(state.festival.pieces).not.toContain(arch.id);
    // 04:00 the next morning (Spring day 1): the stall and the fixture's bonfire come down.
    runUntil(state, tickAt(2, 0, 1, 5));
    expect(state.decor.some((d) => d.id === stall.id)).toBe(false);
    expect(state.decor.some((d) => d.id === arch.id)).toBe(true);
    expect(state.festival.pieces).toEqual([]);
    expect(state.festival.plan).toBeNull();
    // With no festival planned, pieces are locked again.
    expect(rejection(place('festival-stall', 53.5, 54.5))).toBe('LOCKED');
  });
});

describe('the menu', () => {
  it('is put by at noon on day 6 from town stock, never below a day of food', () => {
    const { state } = feastFixture(6, 11);
    stock(state, 'cider', 30);
    const cider = inTown(state, 'cider');
    const ctx = createTickCtx(state);
    reserveMenu(state, ctx);
    const reserved = (id: string) => state.festival.plan!.reserved.find(([g]) => g === good(id))?.[1] ?? 0;
    // The fixture's menu wants 16 cider and has 8 put by.
    expect(reserved('cider')).toBe(16);
    expect(inTown(state, 'cider')).toBe(cider - 8);
    // Food never goes below a unit a resident.
    for (const b of state.buildings)
      if (b.rt)
        for (const g of content.goods.keys())
          if (isFood(g)) {
            b.rt.store[g] = 0;
            b.rt.output[g] = 0;
          }
    stock(state, 'fish', state.residents.length + 5);
    state.festival.plan!.menu.push([good('fish'), 40]);
    reserveMenu(state, ctx);
    expect(reserved('fish')).toBe(5);
  });
});

describe('the evening', () => {
  it('runs from 18:00 to 22:00: guests go to the site, are scored and rewarded, then go home', () => {
    const { state } = feastFixture(6, 11);
    stock(state, 'bread', 30);
    stock(state, 'cider', 20);
    const before = moneySnapshot(state);
    const site = siteRect(state, state.festival.plan!.site)!;
    const renown = state.renown.points;
    runUntil(state, todayAt(state, 13));
    expect(state.festival.plan!.reserved.find(([g]) => g === good('bread'))?.[1]).toBe(20);
    let events = runUntil(state, todayAt(state, FESTIVAL.from) + 1);
    expect(events.some((e) => e.e === 'festival.started')).toBe(true);
    expect(state.festival.live).toBe(true);
    const guests = state.festival.guests!;
    expect(guests.length).toBeGreaterThan(10);
    runUntil(state, todayAt(state, 20));
    const there = state.residents.filter((r) => guests.includes(r.id) && !r.move && onSite(site, r.tile));
    expect(there.length).toBeGreaterThan(guests.length / 2);
    events = runUntil(state, todayAt(state, FESTIVAL.to) + 1);
    const ended = events.find((e) => e.e === 'festival.ended');
    expect(ended && ended.e === 'festival.ended' && ended.r.stars).toBeGreaterThanOrEqual(1);
    expect(state.festival.live).toBe(false);
    expect(state.festival.guests).toBeUndefined();
    expect(state.festival.history[state.festival.history.length - 1]!.festival).toBe('hearth-feast');
    expect(state.renown.points).toBeGreaterThan(renown);
    expect(state.residents[0]!.modifiers.some((m) => m.kind === 'festival')).toBe(true);
    expect(state.chronicle[state.chronicle.length - 1]!.kind).toBe('festival');
    expect(state.chronicle.some((c) => c.kind === 'festival' && c.snapshot)).toBe(true);
    // An hour and a half later the guests have left the green.
    runUntil(state, todayAt(state, 23) + TICKS_PER_HOUR / 2);
    const stayed = state.residents.filter((r) => guests.includes(r.id) && !r.inside && onSite(site, r.tile));
    expect(stayed.length).toBeLessThan(guests.length / 4);
    expect(festivalMorale(state)).not.toBeNaN();
    expectMoneyInvariant(before, state);
  });

  it('still happens round its anchor when the pattern site it named stops standing (C5X)', () => {
    const { state } = feastFixture(6, 11);
    const anchor = 52 * MAP_SIZE + 60;
    expect(
      rejection(run(state, plan({ site: { pattern: 'well-gathering-place', anchor }, menu: [] }))),
    ).toBeUndefined();
    const held = state.festival.history.length;
    // The site is gone by the evening (as when a piece moves or a home is built in its corner).
    state.hearth.sites = state.hearth.sites.filter((s) => s.anchor !== anchor);
    expect(siteRect(state, state.festival.plan!.site)).toBeNull();
    const events = runUntil(state, todayAt(state, FESTIVAL.to) + 1);
    expect(events.some((e) => e.e === 'festival.ended')).toBe(true);
    expect(state.festival.history.length).toBe(held + 1);
  });

  it('is a quiet evening when nothing is planned', () => {
    const { state } = feastFixture(6, 11);
    state.festival.plan = null;
    const events = runUntil(state, todayAt(state, 23));
    expect(events.some((e) => e.e === 'festival.started' || e.e === 'festival.ended')).toBe(false);
    expect(state.festival.history.length).toBe(1);
  });
});

describe('together moments', () => {
  it('closes the festival with a dance only when both seats are here, and changes nothing else', () => {
    const { state: two } = feastFixture(6, 11);
    stock(two, 'bread', 30);
    two.time.connected = [0, 1];
    // R1A's sightings at 18:00 would unlock Porridge No More this evening, crediting whoever is
    // here: that feat is settled beforehand so only the dance can differ.
    two.achievements.push({ id: 'porridge-no-more', tick: two.tick, seats: [0, 1] });
    // The day so far with both seats (achievements and their credits settle), then the evening
    // twice: once with both seats, once with one.
    runUntil(two, todayAt(two, 17));
    const one = deserialize(serialize(two));
    one.time.connected = [0];
    const kinds = (events: SimEvent[]) => events.flatMap((e) => (e.e === 'together.moment' ? [e.kind] : []));
    expect(kinds(runUntil(two, todayAt(two, 23)))).toContain('dance');
    expect(two.seasons.together).toEqual([['dance', 1]]);
    expect(kinds(runUntil(one, todayAt(one, 23)))).toEqual([]);
    expect(one.seasons.together).toEqual([]);
    expect(one.festival.history).toEqual(two.festival.history);
    one.time.connected = [0, 1];
    one.seasons.together = two.seasons.together;
    // The festival's Chronicle line names the seats that were there to see it.
    one.chronicle[one.chronicle.length - 1]!.seats = [0, 1];
    expect(hashState(one)).toBe(hashState(two));
  });
});

describe('content', () => {
  it('has a twist for every season and weights that add to 100', () => {
    const w = festivalTuning.weights;
    expect(w.site + w.variety + w.menu + w.music + w.twist).toBe(100);
    for (let s = 0; s < 4; s++) {
      expect(content.twists.filter((t) => !t.seasons || t.seasons.includes(s)).length).toBeGreaterThanOrEqual(
        2,
      );
    }
  });
});
