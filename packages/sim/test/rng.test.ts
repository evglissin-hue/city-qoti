import { describe, expect, it } from 'vitest';
import { cyrb128 } from '../src/rng/cyrb128';
import { sfc32Next } from '../src/rng/sfc32';
import { RNG_STREAMS, rngFromSeed, seedStreams, StreamRng, streamIndex } from '../src/rng/streams';

describe('rng', () => {
  it('cyrb128 is stable and spreads small changes', () => {
    expect(cyrb128('qoti')).toEqual(cyrb128('qoti'));
    expect(cyrb128('qoti')).not.toEqual(cyrb128('qotj'));
    for (const word of cyrb128('qoti')) expect(word >>> 0).toBe(word);
  });

  it('sfc32 steps the shared words in place', () => {
    const a = new Uint32Array([1, 2, 3, 4]);
    const b = new Uint32Array([1, 2, 3, 4]);
    const seqA = [sfc32Next(a, 0), sfc32Next(a, 0), sfc32Next(a, 0)];
    const seqB = [sfc32Next(b, 0), sfc32Next(b, 0), sfc32Next(b, 0)];
    expect(seqA).toEqual(seqB);
    expect(a).toEqual(b);
    expect(new Set(seqA).size).toBe(3);
  });

  it('seeds one independent slot per stream', () => {
    const words = seedStreams('valley');
    expect(words.length).toBe(RNG_STREAMS.length * 4);
    expect(seedStreams('valley')).toEqual(words);
    const worldgen = new StreamRng(words, streamIndex('worldgen') * 4);
    const misc = new StreamRng(words, streamIndex('misc') * 4);
    const before = words.slice(streamIndex('misc') * 4, streamIndex('misc') * 4 + 4);
    worldgen.next();
    expect(words.slice(streamIndex('misc') * 4, streamIndex('misc') * 4 + 4)).toEqual(before);
    expect(misc.next()).not.toBe(worldgen.next());
  });

  it('stays inside the requested ranges', () => {
    const rng = rngFromSeed('ranges');
    for (let i = 0; i < 2000; i++) {
      const f = rng.float();
      expect(f >= 0 && f < 1).toBe(true);
      const n = rng.int(7);
      expect(Number.isInteger(n) && n >= 0 && n < 7).toBe(true);
      const r = rng.range(-3, 3);
      expect(r >= -3 && r <= 3).toBe(true);
      const u = rng.uniform(-0.15, 0.15);
      expect(u >= -0.15 && u < 0.15).toBe(true);
    }
  });

  it('rejects unknown streams', () => {
    expect(() => streamIndex('nope' as never)).toThrow();
  });
});
