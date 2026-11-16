// R2X: newcomers follow good evenings (growth/evenings.ts). Past `growthFreeHouseholds` homes come
// only as fast as recent fair evenings send folk out, and the Homes bar says so (quietEvenings).
import { content } from '@qoti/content';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_HOUR } from '../../src/constants';
import type { EveningTally, WorldState } from '../../src/contracts';
import { growthDemand, refreshDemand } from '../../src/systems/growth';
import { homesPace, recentOutShare } from '../../src/systems/growth/evenings';
import { tickOfDay } from '../../src/systems/economy/time';
import { demandView } from '../../src/view/demand';
import { villageFixture } from '../fixtures/village';

const P = content.places;

function tally(
  day: number,
  out: number,
  grownups: number,
  weather: EveningTally['weather'] = 'fair',
): EveningTally {
  return { ...villageFixture().state.evenings.tonight, day, out, grownups, weather };
}

/** Sets the tick to `hour` of the state's day. */
function atHour(s: WorldState, hour: number): void {
  s.tick = s.tick - tickOfDay(s.tick) + hour * TICKS_PER_HOUR;
}

/** Pads the town to `n` households (homesPace counts them). */
function households(s: WorldState, n: number): void {
  while (s.households.length < n) s.households.push({ ...s.households[0]!, id: s.nextId++ });
}

describe('the share of grown-ups out on recent fair evenings', () => {
  it('reads fair evenings only, and tonight only once it has closed', () => {
    const s = villageFixture().state;
    s.evenings.history = [];
    s.evenings.tonight = tally(-1, 0, 0);
    expect(recentOutShare(s)).toBeNull();
    s.evenings.history = [tally(1, 10, 40), tally(2, 0, 40, 'rain'), tally(3, 30, 40)];
    expect(recentOutShare(s)).toBe(50);
    s.evenings.tonight = tally(4, 0, 40);
    atHour(s, 19);
    expect(recentOutShare(s)).toBe(50);
    atHour(s, 23);
    expect(recentOutShare(s)).toBe(33);
  });
});

describe('homes come as fast as the evenings send folk out', () => {
  it('runs at the jobs pace under the free households, and before any fair evening', () => {
    const s = villageFixture().state;
    s.evenings.history = [tally(1, 0, 40)];
    expect(s.households.length).toBeLessThan(P.growthFreeHouseholds!);
    expect(homesPace(s)).toBe(100);
    households(s, P.growthFreeHouseholds!);
    expect(homesPace(s)).toBe(0);
    s.evenings.history = [tally(1, 0, 40, 'rain')];
    s.evenings.tonight = tally(-1, 0, 0);
    expect(homesPace(s)).toBe(100);
  });

  it('scales with the share out up to the full share', () => {
    const s = villageFixture().state;
    households(s, P.growthFreeHouseholds!);
    s.evenings.tonight = tally(-1, 0, 0);
    const full = P.growthFullOutPercent!;
    s.evenings.history = [tally(1, full / 2, 100)];
    expect(homesPace(s)).toBe(50);
    s.evenings.history = [tally(1, full, 100)];
    expect(homesPace(s)).toBe(100);
    s.evenings.history = [tally(1, 90, 100)];
    expect(homesPace(s)).toBe(100);
  });

  it('holds back the homes the jobs ask for when nobody goes out, and the Homes bar says why', () => {
    const s = villageFixture().state;
    s.evenings.tonight = tally(-1, 0, 0);
    s.evenings.history = [tally(1, 40, 40)];
    households(s, P.growthFreeHouseholds!);
    const asked = growthDemand(s).homes;
    expect(asked).toBeGreaterThan(0);
    s.evenings.history = [tally(1, 0, 40)];
    expect(growthDemand(s).homes).toBe(0);
    refreshDemand(s, null);
    const homes = demandView(s).bars[0]!;
    expect(homes.reasons.map((r) => r.code)).toContain('quietEvenings');
    expect(homes.why.join(' ')).toContain('to do of an evening');
  });
});
