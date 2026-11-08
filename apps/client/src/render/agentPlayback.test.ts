import { AGENT_STRIDE, TURN_MS } from '@qoti/sim';
import { describe, expect, it } from 'vitest';
import { AgentPlayback, PLAYBACK_DELAY } from './agentPlayback';

/** One resident (id 7) at x. */
function frame(x: number): Float32Array {
  const f = new Float32Array(AGENT_STRIDE);
  f[0] = 7;
  f[1] = x;
  return f;
}

function x(p: AgentPlayback): number {
  const s = p.sample()!;
  const a = s.a.data[s.a.index.get(7)! + 1]!;
  const b = s.b.data[s.b.index.get(7)! + 1]!;
  return a + (b - a) * s.alpha;
}

describe('agent playback', () => {
  it('moves at an even pace even when frames arrive unevenly', () => {
    const p = new AgentPlayback();
    // A resident walking one unit per turn; frames arrive late, early and in pairs.
    const arrivals = [0, 1, 2, 2, 4, 5, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    let turn = 0;
    const seen: number[] = [];
    const step = TURN_MS / 1000 / 4;
    for (let tick = 0; tick <= 80; tick++) {
      while (turn < arrivals.length && arrivals[turn]! * 4 <= tick) {
        p.push(turn, frame(turn));
        turn++;
      }
      p.advance(step);
      seen.push(x(p));
    }
    // After settling, every quarter turn moves about a quarter unit: no stops, no lurches.
    const deltas = seen.slice(30).map((v, i, a) => (i === 0 ? 0.25 : v - a[i - 1]!));
    for (const d of deltas) {
      expect(d).toBeGreaterThan(0.1);
      expect(d).toBeLessThan(0.45);
    }
  });

  it('runs a little behind the newest frame and jumps after a long gap', () => {
    const p = new AgentPlayback();
    for (let t = 0; t < 4; t++) p.push(t, frame(t));
    p.advance(0);
    expect(p.time).toBeCloseTo(3 - PLAYBACK_DELAY);
    p.push(40, frame(40));
    p.advance(0.016);
    expect(p.time).toBeCloseTo(40 - PLAYBACK_DELAY);
  });

  it('holds still when frames stop coming (a paused valley)', () => {
    const p = new AgentPlayback();
    for (let t = 0; t < 4; t++) p.push(t, frame(t));
    for (let i = 0; i < 200; i++) p.advance(0.016);
    expect(x(p)).toBe(3);
  });
});
