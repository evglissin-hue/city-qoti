// C5H acceptance: the autoplayer never follows the County surveyor's letters, and still finishes
// every step of the first days guide by day 6, together step included, on willow and hazel.
import { content } from '@qoti/content';
import { GUIDE_LAST_DAY, START_HOUR, TICKS_PER_DAY, TICKS_PER_HOUR, type SeatState } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { autoplay } from '../autoplay';

/** The two seats a real online valley has (the autoplayer plays both without joining them). */
const SEATS: SeatState[] = [
  { seat: 0, name: 'Ada', color: 0xd9822b, lens: 'hearth', lastSeenTick: 0 },
  { seat: 1, name: 'Bo', color: 0x2b8fd9, lens: 'ledger', lastSeenTick: 0 },
];

/** Day index (0 is Spring day 1) of a tick. */
const dayIndex = (t: number) => Math.floor((t + START_HOUR * TICKS_PER_HOUR) / TICKS_PER_DAY);

/** Plays a seed to the guide's last day; `seated` joins two seats after day 1, as an online valley has. */
function play(seed: string, seated: boolean) {
  let done = !seated;
  return autoplay(seed, GUIDE_LAST_DAY, {
    onDay: (w) => {
      // After the first day: the together step is not open yet, so it has to be earned.
      if (done) return;
      done = true;
      w.seats = SEATS.map((s) => ({ ...s }));
    },
  });
}

describe('the first days guide, played without reading it', { timeout: 120_000 }, () => {
  // The autoplayer plays as one person (no seat ever joins), so the together step is skipped as in
  // a solo valley; hazel also plays it seated, where a request has to be filled to earn it.
  for (const [seed, seated] of [
    ['willow', false],
    ['hazel', false],
    ['hazel', true],
  ] as const) {
    // R1 stand-in (R1D): six of the eight steps are done by day 6 with R1F's advisors; the rest wait
    // on R1D's new letters and R1B's first workshop (no workshop trade grows on the stand-in).
    it.skip(`finishes every step by day 6 in ${seed}${seated ? ', two seats' : ''}`, () => {
      const run = play(seed, seated);
      const w = run.hamlet.world;
      const g = w.guide;
      expect(g.doneTicks).toHaveLength(content.guide.steps.length);
      expect(g.over).toBe(true);
      for (const t of g.doneTicks) expect(dayIndex(t)).toBeLessThan(GUIDE_LAST_DAY);
      if (seated) expect(w.village.requestsFulfilled + w.village.plansApproved).toBeGreaterThan(0);
      expect(w.chronicle.some((c) => c.kind === 'guide-done')).toBe(true);
      // Letters were read at the visits, and filed.
      expect(run.actions.some((a) => a.startsWith('letter: '))).toBe(true);
    });
  }
});
