// R3B: the masters' views (docs/spec/19-evenings.md, Masters): the resident inspector's craft, mastery
// and master, the building inspector's master and apprentices, and the Businesses book's fields.
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { ResidentFlags, TICKS_PER_DAY } from '../../src/constants';
import type { BuildingDetail, ResidentDetail, WorldState } from '../../src/contracts';
import { emptyCounters } from '../../src/state/zones';
import { businessView } from '../../src/view/businesses';
import { residentName } from '../../src/view/hamlet';
import { inspect } from '../../src/view/inspect';
import { hamletFixture } from '../fixtures/hamlet';
import { building, hire, resident } from '../ledger/helpers';

function setup() {
  const f = hamletFixture();
  const s = f.state;
  const b = building(s, f.b.bakery);
  b.counters = emptyCounters();
  const [m, a1, a2, other] = hire(s, b.id, 4) as [number, number, number, number];
  const master = resident(s, m);
  master.flags |= ResidentFlags.master;
  master.mastery = 'baker';
  b.masterId = m;
  const today = Math.floor(s.tick / TICKS_PER_DAY);
  resident(s, a2).apprentice = { at: b.id, trade: 'baker', untilDay: today + 5, master: m };
  resident(s, a1).apprentice = { at: b.id, trade: 'baker', untilDay: today + 5, master: m };
  // Finished, so no longer under the master's wing.
  resident(s, other).apprentice = { at: b.id, trade: 'baker', untilDay: today - 1, master: m };
  return { f, s, b, ids: { m, a1, a2, other }, today };
}

const resDetail = (s: WorldState, id: number) => inspect(s, 'resident', id) as ResidentDetail;
const bldDetail = (s: WorldState, id: number) => inspect(s, 'building', id) as BuildingDetail;

describe("a resident's masters' fields", () => {
  it('lists craft most days first, ties by trade, and says nothing without any', () => {
    const { s, ids } = setup();
    const r = resident(s, ids.a1);
    expect(resDetail(s, ids.a1).craft).toBeUndefined();
    r.craft = [
      ['weaver', 5],
      ['baker', 9],
      ['carpenter', 5],
    ];
    expect(resDetail(s, ids.a1).craft).toEqual([
      { trade: 'baker', days: 9 },
      { trade: 'carpenter', days: 5 },
      { trade: 'weaver', days: 5 },
    ]);
  });

  it('gives a master their trade and title, and an apprentice their master', () => {
    const { s, ids } = setup();
    expect(resDetail(s, ids.m).master).toEqual({ trade: 'baker', title: 'master baker' });
    expect(resDetail(s, ids.m).apprenticeOf).toBeUndefined();
    expect(resDetail(s, ids.a1).master).toBeUndefined();
    expect(resDetail(s, ids.a1).apprenticeOf).toEqual({
      id: ids.m,
      name: residentName(resident(s, ids.m)),
    });
  });

  it('drops the master when they are gone from town', () => {
    const { s, ids } = setup();
    s.residents = s.residents.filter((r) => r.id !== ids.m);
    expect(resDetail(s, ids.a1).apprenticeOf).toBeUndefined();
  });
});

describe("a building's master", () => {
  it('names the master and the apprentices under way, by id, not the finished one', () => {
    const { s, b, ids } = setup();
    const d = bldDetail(s, b.id).master!;
    expect(d.id).toBe(ids.m);
    expect(d.trade).toBe('baker');
    expect(d.title).toBe('master baker');
    expect(d.apprentices.map((a) => a.id)).toEqual([ids.a1, ids.a2].sort((x, y) => x - y));
  });

  it('is absent without a master, or when the master is not in town', () => {
    const { s, b } = setup();
    delete b.masterId;
    expect(bldDetail(s, b.id).master).toBeUndefined();
    const two = setup();
    two.s.residents = two.s.residents.filter((r) => r.id !== two.ids.m);
    expect(bldDetail(two.s, two.b.id).master).toBeUndefined();
  });
});

describe("the Businesses book's masters' fields", () => {
  it('carries masterId, masterGood and the apprentices', () => {
    const { s, b, ids } = setup();
    const v = businessView(s, b);
    expect(v.masterId).toBe(ids.m);
    expect(v.masterGood).toBe('pies');
    expect(v.apprentices).toEqual([ids.a1, ids.a2].sort((x, y) => x - y));
    expect(v.graceDays).toBeUndefined();
  });

  it('has none of them for a business without a master', () => {
    const { s, b } = setup();
    delete b.masterId;
    const v = businessView(s, b);
    expect(v.masterId).toBeUndefined();
    expect(v.masterGood).toBeUndefined();
    expect(v.apprentices).toBeUndefined();
  });

  it('counts the grace days down at level 3 with its master gone, and never below zero', () => {
    const { s, b, today } = setup();
    delete b.masterId;
    b.level = 3;
    const grace = content.mastery.graceDays;
    b.counters!.masterGone = today;
    expect(businessView(s, b).graceDays).toBe(grace);
    s.tick += 2 * TICKS_PER_DAY;
    expect(businessView(s, b).graceDays).toBe(grace - 2);
    s.tick += 20 * TICKS_PER_DAY;
    expect(businessView(s, b).graceDays).toBe(0);
    b.level = 2;
    expect(businessView(s, b).graceDays).toBeUndefined();
  });
});
