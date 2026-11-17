// R2X: a resident's Day shows today's round only as today's. A round planned on an earlier day (a
// porter plans at 19:00, so at 19:31 their round is still last night's) is marked `roundEarlier`, so
// the inspector never reads yesterday's stops as tonight's (the class: a stale plan read as live, as
// evening trade's tonightStops).
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import { dayIndex } from '../../src/systems/residents/time';
import { residentDetail } from '../../src/view/residentDetail';
import { villageFixture } from '../fixtures/village';

describe("a resident's round in the inspector (R2X)", () => {
  it("marks a round planned on an earlier day, and leaves today's unmarked", () => {
    const s = villageFixture().state;
    s.tick += 3 * TICKS_PER_DAY;
    const r = s.residents.find((x) => x.stage === 'adult')!;
    r.round = [{ place: 'seats:1', tile: 0, kind: 'sit', draw: 40, arrived: s.tick - 10, flags: 3 }];
    r.roundEvening = 0;
    r.roundDay = dayIndex(s.tick) - 1;
    const stale = residentDetail(s, r.id)!;
    expect(stale.round).toHaveLength(1);
    expect(stale.roundEarlier).toBe(true);
    r.roundDay = dayIndex(s.tick);
    const fresh = residentDetail(s, r.id)!;
    expect(fresh.roundEarlier).toBeUndefined();
  });
});
