import { describe, expect, it } from 'vitest';
import { CursorTrack } from './cursorTrack';

/** Feeds a straight run along x at one tile per update, every `gap` ms, from t = 0. */
function run(track: CursorTrack, count: number, gap: number): void {
  for (let i = 0; i < count; i++) track.push(i, 5, i * gap);
}

describe('CursorTrack', () => {
  it('shows nothing until a position arrives, then that position', () => {
    const t = new CursorTrack();
    const p = { x: 0, z: 0 };
    expect(t.at(0, p)).toBe(false);
    t.push(3.5, 7.25, 1000);
    expect(t.at(1000, p)).toBe(true);
    expect(p).toEqual({ x: 3.5, z: 7.25 });
  });

  it('glides at an even speed through jittery updates instead of stepping', () => {
    const t = new CursorTrack();
    const p = { x: 0, z: 0 };
    // Updates one tile apart every 100 ms, each 30 ms early or late, drawn every frame.
    let next = 0;
    const arrival = (i: number) => i * 100 + (i % 2 ? 30 : -30);
    let prev: number | null = null;
    let minStep = Infinity;
    let maxStep = 0;
    for (let now = 0; now <= 3000; now += 16) {
      while (next < 40 && arrival(next) <= now) t.push(next, 5, arrival(next++));
      t.at(now, p);
      expect(p.z).toBeCloseTo(5, 6);
      if (now >= 600 && prev !== null) {
        minStep = Math.min(minStep, p.x - prev);
        maxStep = Math.max(maxStep, p.x - prev);
      }
      prev = p.x;
    }
    // One tile per 100 ms is 0.16 a frame: never a stall, never a leap.
    expect(minStep).toBeGreaterThan(0.08);
    expect(maxStep).toBeLessThan(0.26);
  });

  it('settles on the last position when the cursor rests', () => {
    const t = new CursorTrack();
    run(t, 10, 100);
    const p = { x: 0, z: 0 };
    t.at(5000, p);
    expect(p).toEqual({ x: 9, z: 5 });
  });

  it('sets off from where it rested, not from the start of the pause', () => {
    const t = new CursorTrack();
    run(t, 10, 100);
    t.push(10, 5, 5000);
    const p = { x: 0, z: 0 };
    t.at(5000, p);
    expect(p.x).toBeCloseTo(9, 6);
    // It glides over, and comes to rest on the new position.
    for (let now = 5016; now < 5600; now += 16) {
      const before = p.x;
      t.at(now, p);
      expect(p.x).toBeGreaterThanOrEqual(before - 1e-9);
    }
    expect(p.x).toBeCloseTo(10, 3);
  });

  it('jumps when the partner goes somewhere else entirely', () => {
    const t = new CursorTrack();
    run(t, 10, 100);
    t.push(120, 90, 1000);
    const p = { x: 0, z: 0 };
    t.at(1000, p);
    expect(p).toEqual({ x: 120, z: 90 });
  });

  it('runs further behind when updates come less often', () => {
    const fast = new CursorTrack();
    const slow = new CursorTrack();
    run(fast, 20, 100);
    run(slow, 20, 200);
    expect(slow.delay).toBeGreaterThan(fast.delay * 1.5);
    expect(fast.delay).toBeLessThan(200);
  });
  it('stops asking for frames once the cursor has come to rest', () => {
    const t = new CursorTrack();
    const p = { x: 0, z: 0 };
    for (let i = 0; i < 10; i++) t.push(i, 0, i * 100);
    let now = 900;
    for (; now < 3000; now += 16) t.at(now, p);
    expect(t.moving(now)).toBe(false);
    expect(p.x).toBeCloseTo(9, 3);
  });
});
