// Playtest round four: planning a festival leads somewhere. The festival lock exemption, the day
// count, the countdown chip text and the estimate reading the sim's thresholds.
import { festivalTuning } from '@qoti/content';
import { FESTIVAL, START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR, type FestivalView } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { decorChoices, decorGroupsOf } from '../input/catalog';
import { Mirror } from '../state/mirror';
import { mockView } from './mocks/session';
import {
  currentFestivalPlan,
  festivalChipText,
  festivalTooLate,
  joyEstimate,
  starsFor,
  today,
  twistNeeds,
} from './seasons';

/** The tick of `hour`:00 on absolute day `day` (0 based). */
const at = (day: number, hour: number): number => day * TICKS_PER_DAY + (hour - START_HOUR) * TICKS_PER_HOUR;

const FESTIVAL_DAY = 5;

function view(plan: boolean, over: Partial<FestivalView> = {}): FestivalView {
  return {
    festival: { id: 'blossom-fair', name: 'Blossom Fair', season: 0 },
    day: FESTIVAL_DAY,
    plan: plan
      ? { festival: 'blossom-fair', site: null, menu: [], twist: '', music: 'none', musician: 0, by: 0 }
      : null,
    pieces: [],
    live: false,
    ...over,
  };
}

function mirror(f: FestivalView | null, tick: number): Mirror {
  const m = new Mirror();
  m.load(mockView());
  m.festival.value = f;
  m.tick.value = tick;
  return m;
}

describe('today', () => {
  it('counts days as the sim does: the day turns at midnight, not at 06:00', () => {
    expect(today(at(3, 0))).toBe(3);
    expect(today(at(3, 5))).toBe(3);
    expect(today(at(3, 6))).toBe(3);
    expect(today(at(3, 23))).toBe(3);
    expect(today(at(4, 0))).toBe(4);
    expect(today(0)).toBe(0);
  });
});

describe('the festival lock', () => {
  const festivalIds = ['bonfire', 'festival-table', 'festival-stall'];

  it('keeps festival pieces locked with no plan', () => {
    const m = mirror(view(false), at(2, 10));
    const choices = decorChoices(m, 'hearth', false);
    for (const id of festivalIds) expect(choices.find((c) => c.def.id === id)?.locked).toBe(true);
    expect(decorGroupsOf(choices)).not.toContain('festival');
  });

  it('opens them in their own first group while this season has a plan, as the sim does', () => {
    const m = mirror(view(true), at(2, 10));
    const choices = decorChoices(m, 'hearth', false);
    for (const id of festivalIds) {
      const c = choices.find((x) => x.def.id === id)!;
      expect(c.locked).toBe(false);
      expect(c.festival).toBe(true);
    }
    expect(decorGroupsOf(choices)[0]).toBe('festival');
    // Other Pattern Book pieces stay locked.
    expect(choices.find((c) => c.def.id === 'birdbath')?.locked).toBe(true);
  });

  it('does not count last season as a plan', () => {
    // Midnight on day 1 of summer: the view still names spring's festival.
    const m = mirror(view(true), at(6, 1));
    expect(currentFestivalPlan(m.festival.value, m.tick.value)).toBeNull();
    expect(decorChoices(m, 'hearth', false).find((c) => c.def.id === 'bonfire')?.locked).toBe(true);
  });
});

describe('the countdown chip', () => {
  it('reads days, tomorrow, tonight, now, and hides otherwise', () => {
    const f = view(true);
    expect(festivalChipText(f, at(3, 9))).toBe('Festival in 2 days');
    expect(festivalChipText(f, at(4, 2))).toBe('Festival tomorrow');
    expect(festivalChipText(f, at(FESTIVAL_DAY, 0))).toBe('Festival tonight at 18:00');
    expect(festivalChipText(f, at(FESTIVAL_DAY, 17))).toBe('Festival tonight at 18:00');
    expect(festivalChipText(view(true, { live: true }), at(FESTIVAL_DAY, 19))).toBe('Festival now');
    expect(festivalChipText(f, at(FESTIVAL_DAY, FESTIVAL.to))).toBeNull();
    expect(festivalChipText(view(false), at(3, 9))).toBeNull();
  });

  it('knows when a plan would be too late', () => {
    const f = view(false);
    expect(festivalTooLate(f, at(FESTIVAL_DAY, FESTIVAL.from - 1))).toBe(false);
    expect(festivalTooLate(f, at(FESTIVAL_DAY, FESTIVAL.from))).toBe(true);
    expect(festivalTooLate(f, at(FESTIVAL_DAY - 1, 20))).toBe(false);
  });
});

describe('the estimate', () => {
  it('turns scores into stars at the sim thresholds from content', () => {
    const [a, b, c, d] = festivalTuning.stars as [number, number, number, number];
    expect(starsFor(a - 1)).toBe(1);
    expect(starsFor(a)).toBe(2);
    expect(starsFor(b)).toBe(3);
    expect(starsFor(c)).toBe(4);
    expect(starsFor(d - 1)).toBe(4);
    expect(starsFor(d)).toBe(5);
  });

  it('weighs the parts with the content weights', () => {
    const w = festivalTuning.weights;
    // Everything but the twist at full marks: the score is the other weights' share.
    const est = joyEstimate({
      siteCharm: 255,
      pattern: true,
      pieces: festivalTuning.varietyFull,
      menu: [
        ['bread', 100],
        ['honey', 100],
        ['cider', 100],
      ],
      attendees: 10,
      music: 'bandstand',
      twist: false,
    });
    expect(est.parts.site).toBe(100);
    expect(est.parts.variety).toBe(100);
    expect(est.parts.menu).toBe(100);
    expect(est.parts.music).toBe(festivalTuning.music.bandstand);
    const total = w.site + w.variety + w.menu + w.music + w.twist;
    const expected = (100 * (w.site + w.variety + w.menu) + festivalTuning.music.bandstand * w.music) / total;
    expect(est.total).toBe(Math.round(expected));
    expect(est.stars).toBe(starsFor(est.total));
    // An empty plan scores nothing and one star.
    const none = joyEstimate({
      siteCharm: 0,
      pieces: 0,
      menu: [],
      attendees: 0,
      music: 'none',
      twist: false,
    });
    expect(none.total).toBe(0);
    expect(none.stars).toBe(1);
  });
});

describe('twists the town cannot meet', () => {
  it('names what a twist needs from the stores', () => {
    expect(twistNeeds('harvest-display', () => 0)).toBe('12 vegetables');
    expect(twistNeeds('harvest-display', (g) => (g === 'vegetables' ? 12 : 0))).toBeNull();
    expect(twistNeeds('costume-parade', () => 0)).toBe('8 cloth');
    expect(twistNeeds('costume-parade', (g) => (g === 'cloth' ? 8 : 0))).toBeNull();
  });
});
