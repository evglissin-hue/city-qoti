import { describe, expect, it } from 'vitest';
import { PHOTO_DEVELOP_TIMEOUT_MS, untilDeveloped, type DevelopStats } from './photoSave';

/** A fake clock and frame: each frame moves the clock 16 ms and runs `step` on the stats. */
function rig(stats: DevelopStats, step: (s: DevelopStats, frame: number) => void) {
  let t = 0;
  let frames = 0;
  return {
    get frames() {
      return frames;
    },
    stats: () => stats,
    now: () => t,
    frame: () => {
      t += 16;
      step(stats, ++frames);
      return Promise.resolve();
    },
  };
}

describe('V4B: Save PNG waits for the developed picture', () => {
  it('waits for a still drawn after it began to reach the goal (a mocked goal of 64)', async () => {
    // The old rest had developed fully; the new size starts a fresh still on frame 2.
    const r = rig({ samples: 16, sampleGoal: 16, stillRenders: 5 }, (s, f) => {
      if (f === 2) Object.assign(s, { stillRenders: 6, samples: 0, sampleGoal: 64 });
      else if (f > 2) s.samples = Math.min(64, s.samples + 1);
    });
    expect(await untilDeveloped(r.stats, r.frame, r.now)).toBe(true);
    expect(r.stats().samples).toBe(64);
    expect(r.frames).toBe(2 + 64);
  });

  it("never takes the old rest's developed picture for the new one", async () => {
    const r = rig({ samples: 64, sampleGoal: 64, stillRenders: 3 }, (s, f) => {
      if (f === 4) Object.assign(s, { stillRenders: 4, samples: 64 });
    });
    expect(await untilDeveloped(r.stats, r.frame, r.now)).toBe(true);
    expect(r.frames).toBe(4);
  });

  it('saves what it has after the timeout when the samples never reach the goal', async () => {
    const r = rig({ samples: 0, sampleGoal: 64, stillRenders: 0 }, (s, f) => {
      if (f === 1) s.stillRenders = 1;
      if (f % 10 === 0) s.samples++;
    });
    expect(await untilDeveloped(r.stats, r.frame, r.now)).toBe(false);
    expect(r.now()).toBeGreaterThanOrEqual(PHOTO_DEVELOP_TIMEOUT_MS);
    expect(r.now()).toBeLessThan(PHOTO_DEVELOP_TIMEOUT_MS + 32);
  });
});
