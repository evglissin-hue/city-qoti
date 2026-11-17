// R2X: the Hearth's strip reads tonight as it goes (view/evening.ts, townEvenings). An evening is
// scored at 21:00, so before then tonight's score sum is empty: the view says the evening is under
// way (`live`) and keeps the last scored evening's average, and the strip never calls a full evening
// quiet before it is over (the class: a number shown before the sim has made it).
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/constants';
import type { EveningTally, WorldState } from '../../src/contracts';
import { dayIndex, tickOfDay } from '../../src/systems/economy/time';
import { townEvenings } from '../../src/view/evening';
import { villageFixture } from '../fixtures/village';

/** Sets the tick to `hour` of the state's fifth day or later (so yesterday is a real day). */
function atHour(s: WorldState, hour: number): void {
  s.tick = Math.max(s.tick, 5 * TICKS_PER_DAY);
  s.tick = s.tick - tickOfDay(s.tick) + hour * TICKS_PER_HOUR;
}

function tally(s: WorldState, day: number, out: number, grownups: number, scoreSum: number): EveningTally {
  return { ...s.evenings.tonight, day, out, grownups, scoreSum, weather: 'fair' };
}

describe("the Hearth strip's evening (R2X)", () => {
  it('counts tonight so far and keeps the last scored average while the evening is under way', () => {
    const s = villageFixture().state;
    atHour(s, 19);
    const today = dayIndex(s.tick);
    s.evenings.history = [tally(s, today - 1, 30, 40, 40 * 61)];
    s.evenings.tonight = tally(s, today, 25, 40, 0);
    expect(townEvenings(s)).toEqual({ out: 25, grownups: 40, average: 61, live: true });
  });

  it('reads the evening whole once it is scored at 21:00, and the next morning', () => {
    const s = villageFixture().state;
    atHour(s, 21);
    const today = dayIndex(s.tick);
    s.evenings.history = [tally(s, today - 1, 30, 40, 40 * 61)];
    s.evenings.tonight = tally(s, today, 25, 40, 40 * 55);
    expect(townEvenings(s)).toEqual({ out: 25, grownups: 40, average: 55 });
    atHour(s, 10);
    s.tick += TICKS_PER_DAY;
    expect(townEvenings(s)).toEqual({ out: 25, grownups: 40, average: 55 });
  });

  it('has no last average to keep on the first evening of all', () => {
    const s = villageFixture().state;
    atHour(s, 18);
    const today = dayIndex(s.tick);
    s.evenings.history = [];
    s.evenings.tonight = tally(s, today, 3, 5, 0);
    expect(townEvenings(s)).toEqual({ out: 3, grownups: 5, average: 0, live: true });
  });
});
