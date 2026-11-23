// R3C part B: what the earned callings do. Calling ids are pushed by hand (the Town Book's close
// writes them in the real game).
import { callingPhrases, content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/constants';
import type { Building, SimEvent, WorldState } from '../../src/contracts';
import { insertBuilding } from '../../src/state/place';
import { callingLanternCharm, callingRoom, hasCalling } from '../../src/systems/callings/api';
import { callings, visitorPennies } from '../../src/systems/callings';
import { dayIndex } from '../../src/systems/economy/time';
import { capacityOf } from '../../src/systems/specialized/api';
import { createTickCtx } from '../../src/turn';
import { expectMoneyInvariant, moneySnapshot } from '../money';
import { flatWorld } from '../helpers';
import { winterFixture } from '../fixtures/winter';

const def = (id: string) => content.buildingById.get(id)!;
const put = (s: WorldState, id: string, x: number, z: number): Building =>
  insertBuilding(s, null, def(id), x, z, 0, 0, { site: false });

describe('Mill Town: room by the mills', () => {
  it('gives one more room at a windmill and a sawmill, and nowhere else', () => {
    const s = flatWorld();
    const mill = put(s, 'windmill', 30, 50);
    const saw = put(s, 'sawmill', 60, 50);
    const base = [capacityOf(s, mill), capacityOf(s, saw)];
    expect(callingRoom(s, mill)).toBe(0);
    s.townBook.callings.push('mill-town');
    expect(callingRoom(s, mill)).toBe(1);
    expect(callingRoom(s, saw)).toBe(1);
    expect(capacityOf(s, mill)).toBe(base[0]! + 1);
    expect(capacityOf(s, saw)).toBe(base[1]! + 1);
    const other = put(s, 'workshop', 90, 50);
    expect(callingRoom(s, other)).toBe(0);
  });

  it('is nothing for the other callings', () => {
    const s = flatWorld();
    const mill = put(s, 'windmill', 30, 50);
    s.townBook.callings.push('garden-village', 'pilgrims-rest');
    expect(callingRoom(s, mill)).toBe(0);
  });
});

describe("Pilgrims' Rest: lantern light", () => {
  it('adds the content charm once earned', () => {
    const s = flatWorld();
    expect(callingLanternCharm(s)).toBe(0);
    s.townBook.callings.push('pilgrims-rest');
    expect(callingLanternCharm(s)).toBe(content.callingById.get('pilgrims-rest')!.lanternCharm);
    expect(callingLanternCharm(s)).toBe(1);
    expect(hasCalling(s, 'pilgrims-rest')).toBe(true);
  });
});

/** Garden Village's visit: charm at every door, then run the callings system at its hour. */
function visit(s: WorldState, tick: number): SimEvent[] {
  s.tick = tick;
  const ctx = createTickCtx(s);
  callings.tick(s, ctx);
  return ctx.events;
}

describe("Garden Village's visitors", () => {
  const T = content.townBook.visitors;
  function fixture(): WorldState {
    const s = winterFixture().state;
    s.map.charm.fill(40);
    return s;
  }
  /** A tick at the visiting hour on day `d` (an absolute day index). */
  const at = (d: number) => d * TICKS_PER_DAY + T.hour * (TICKS_PER_DAY / 24);

  it('books visitors pennies, money kept whole, and says so only every noticeEveryDays', () => {
    const s = fixture();
    s.townBook.callings.push('garden-village');
    const pennies = visitorPennies(s);
    expect(pennies).toBeGreaterThan(0);
    expect(pennies).toBeLessThanOrEqual(T.cap);
    // A day that is not a notice day.
    let d = 30;
    while (d % T.noticeEveryDays === 0) d++;
    const before = moneySnapshot(s);
    const treasury = s.economy.treasury;
    const quiet = visit(s, at(d));
    expect(s.economy.treasury).toBe(treasury + pennies);
    expect(quiet.filter((e) => e.e === 'notify' && e.kind === 'visitors')).toHaveLength(0);
    expectMoneyInvariant(before, s);
    // A notice day.
    let n = 30;
    while (n % T.noticeEveryDays !== 0) n++;
    expect(dayIndex(at(n))).toBe(n);
    const loud = visit(s, at(n)).filter((e) => e.e === 'notify' && e.kind === 'visitors');
    expect(loud).toHaveLength(1);
    expect((loud[0] as { text: string }).text).toContain(s.settings.townName);
    expect(callingPhrases.visitors).toContain('about');
    expectMoneyInvariant(before, s);
  });

  it('books nothing without the calling', () => {
    const s = fixture();
    s.townBook.callings.push('mill-town', 'pilgrims-rest');
    const treasury = s.economy.treasury;
    const ev = visit(s, at(35));
    expect(s.economy.treasury).toBe(treasury);
    expect(ev).toHaveLength(0);
  });
});
