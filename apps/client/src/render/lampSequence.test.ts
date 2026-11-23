import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAMP_SEQUENCE_SOURCE, lampSequenceDiscs, startLampSequence } from './lampSequence';
import { LightMapWriter } from './lightMap';

describe("V4.0: V4A's lamps-lighting scene", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lays the lamps along a line through the center, evenly spaced', () => {
    const d = lampSequenceDiscs({ center: [100, 50], count: 5, spacing: 3 });
    expect(d.map((l) => l.x)).toEqual([94, 97, 100, 103, 106]);
    expect(d.every((l) => l.z === 50 && l.radius > 0 && l.intensity > 0)).toBe(true);
  });

  it('lights one lamp a step, each a light map change and a shadowless static change, then puts them out', () => {
    const writer = new LightMapWriter();
    const changes: [string | undefined, boolean | undefined][] = [];
    const seq = startLampSequence(
      { env: { lightWriter: writer }, invalidateStatic: (src, sl) => changes.push([src, sl]) },
      { center: [10, 10], count: 3, everyMs: 100 },
    );
    expect(seq.lit()).toBe(0);
    expect(writer.count).toBe(0);
    vi.advanceTimersByTime(100);
    expect(seq.lit()).toBe(1);
    expect(writer.count).toBe(1);
    expect(writer.takeDirty()).toBe(true);
    vi.advanceTimersByTime(250);
    expect(seq.lit()).toBe(3);
    expect(writer.count).toBe(3);
    vi.advanceTimersByTime(1000);
    expect(seq.lit()).toBe(3);
    expect(changes).toEqual([
      [LAMP_SEQUENCE_SOURCE, true],
      [LAMP_SEQUENCE_SOURCE, true],
      [LAMP_SEQUENCE_SOURCE, true],
    ]);
    seq.stop();
    expect(writer.count).toBe(0);
    expect(changes).toHaveLength(4);
  });
});
