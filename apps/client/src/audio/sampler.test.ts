import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Sampler, sampleFiles, trimLead, zoneFor } from './sampler';
import { SAMPLED } from './sampler.zones';
import { INSTRUMENTS } from './synth/instruments';

const samples = join(__dirname, '..', '..', 'public', 'audio', 'samples');

/** Just enough of an AudioContext and its buffers for the sampler. */
function fakeCtx() {
  const buffer = (channels: number, length: number, sampleRate: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      length,
      sampleRate,
      numberOfChannels: channels,
      duration: length / sampleRate,
      getChannelData: (c: number) => data[c]!,
      copyToChannel: (src: Float32Array, c: number) => data[c]!.set(src),
    };
  };
  return {
    buffer,
    createBuffer: buffer,
    decodeAudioData: async (data: ArrayBuffer) => {
      // The "file" is its own samples: 40 frames of lead-in, then the note.
      const b = buffer(1, data.byteLength / 4, 1000);
      b.copyToChannel(new Float32Array(data), 0);
      return b;
    },
  } as unknown as BaseAudioContext & { buffer: typeof buffer };
}

describe('the sampler', () => {
  it('plays the nearest recorded note of the same touch, retuned by rate and its cents', () => {
    const piano = SAMPLED.piano!;
    const z = piano.zones.find((x) => x[0] === 61 && x[1] === 1)!;
    const v = zoneFor('piano', 62, 1)!;
    expect(v.file).toBe(z[2]);
    expect(v.rate).toBeCloseTo(Math.pow(2, (62 - 61 - z[3] / 100) / 12), 6);
    expect(v.gain).toBe(piano.gain);
    // Soft notes keep to the soft recordings.
    expect(zoneFor('piano', 62, 0)!.file).toMatch(/-0\.m4a$/);
    // An exact note plays at (almost) its own speed.
    expect(Math.abs(Math.log2(zoneFor('piano', 61, 1)!.rate) * 1200)).toBeLessThan(30);
  });

  it('leaves unsampled instruments and notes far from any recording to the synth', () => {
    expect(zoneFor('kalimba', 72, 1)).toBeNull();
    expect(zoneFor('bass', 120, 1)).toBeNull();
    expect(zoneFor('piano', 10, 0)).toBeNull();
  });

  it('covers the band where the music plays each recorded instrument', () => {
    // The composer's ranges: bass 38 to 50, pads 55 to 76, comping 40 to 72, melodies 62 to 88.
    const span: [string, number, number][] = [
      ['bass', 38, 50],
      ['strings', 55, 76],
      ['piano', 40, 100],
      ['harp', 40, 88],
      ['flute', 62, 88],
      ['clarinet', 62, 84],
      ['marimba', 62, 96],
    ];
    for (const [inst, lo, hi] of span)
      for (let m = lo; m <= hi; m++)
        for (const layer of [0, 1]) expect(zoneFor(inst as never, m, layer), `${inst} ${m}`).not.toBeNull();
  });

  it('ships every file it names, within the music budget, credited', () => {
    const files = sampleFiles();
    let bytes = 0;
    for (const f of files) {
      expect(existsSync(join(samples, f)), f).toBe(true);
      bytes += statSync(join(samples, f)).size;
    }
    expect(new Set(files).size).toBe(files.length);
    // docs/spec/22-quality.md via the audio brief: music at most 16 MB.
    expect(bytes).toBeLessThan(16e6);
    const credits = readFileSync(join(samples, 'CREDITS.md'), 'utf8');
    expect(credits).toMatch(/CC0/);
    for (const f of files) expect(credits).toContain(f);
    for (const inst of Object.keys(SAMPLED)) expect(INSTRUMENTS).toContain(inst);
  });

  it('loads a file once, trims its lead-in, and gives up on one that will not load', async () => {
    const ctx = fakeCtx();
    const asked: string[] = [];
    const note = new Float32Array(100);
    for (let i = 40; i < 100; i++) note[i] = 0.5;
    const sampler = new Sampler(ctx, async (url) => {
      asked.push(url);
      if (url.includes('flute')) throw new Error('404');
      return note.slice().buffer;
    });
    const piano = zoneFor('piano', 60, 1)!;
    sampler.want(piano.file);
    sampler.want(piano.file);
    const flute = sampler.pick('flute', 72, 1)!;
    sampler.want(flute.file);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(asked).toEqual([`/audio/samples/${piano.file}`, `/audio/samples/${flute.file}`]);
    expect(sampler.has(piano.file)).toBe(true);
    // 4 ms before the attack is kept: 4 frames at the fake's 1 kHz.
    expect(sampler.get(piano.file)!.length).toBe(64);
    expect(sampler.pick('flute', 72, 1)).toBeNull();
    expect(sampler.pick('piano', 60, 1)).not.toBeNull();
  });

  it('keeps a recording that starts at once as it is', () => {
    const ctx = fakeCtx();
    const b = ctx.buffer(1, 10, 1000);
    b.getChannelData(0).fill(0.5);
    expect(trimLead(ctx, b as unknown as AudioBuffer)).toBe(b);
  });
});
