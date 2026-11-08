// The sampler: the band's recorded instruments (the VS Chamber Orchestra: Community Edition, CC0,
// prepared by tools/audio/samples.ts). A note plays the nearest recorded note of its touch layer,
// retuned by playback rate (and by the cents that recording sat off its name). Files load on first
// use and decode once; a file that cannot load leaves that note to the synthesized instrument.
import { SAMPLED, type Zone } from './sampler.zones';
import type { Instrument } from './synth/instruments';

/** Where the files are served. */
const BASE = '/audio/samples/';
/** Furthest a recording is stretched, in semitones (beyond it the synth plays). */
const MAX_STRETCH = 6;
/** The decoded files kept, in sample frames (64 MB of floats); least recently used go first. */
const MAX_FRAMES = 16_000_000;
/** Below this the recording has not started yet (the encoder's lead-in). */
const ONSET = 0.01;

export interface SampledVoice {
  file: string;
  /** Playback rate that brings the recording to the note. */
  rate: number;
  /** Matches the recording's level to the synthesized instrument's. */
  gain: number;
}

/**
 * The recording that plays `midi`: the nearest of the same touch layer, or of the other layer when
 * this one has nothing near (some sets recorded only part of the range firmly); null when none is.
 */
export function zoneFor(inst: Instrument, midi: number, layer: number): SampledVoice | null {
  const set = SAMPLED[inst];
  if (!set) return null;
  const pitch = (z: Zone) => z[0] + z[3] / 100;
  const nearest = (same: boolean): Zone | null => {
    let best: Zone | null = null;
    let bestCost = Infinity;
    for (const z of set.zones) {
      if ((z[1] === layer) !== same) continue;
      const away = midi - pitch(z);
      // Between two equally near, retune up rather than down.
      const cost = Math.abs(away) + (away < 0 ? 0.01 : 0);
      if (cost < bestCost && Math.abs(away) <= MAX_STRETCH) {
        bestCost = cost;
        best = z;
      }
    }
    return best;
  };
  const z = nearest(true) ?? nearest(false);
  return z ? { file: z[2], rate: Math.pow(2, (midi - pitch(z)) / 12), gain: set.gain } : null;
}

/** Every file the instruments use (for checks and the credits). */
export function sampleFiles(): string[] {
  const out: string[] = [];
  for (const set of Object.values(SAMPLED)) for (const z of set!.zones) out.push(z[2]);
  return out;
}

export class Sampler {
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loading = new Set<string>();
  private readonly failed = new Set<string>();
  private frames = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly load: (url: string) => Promise<ArrayBuffer> = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return res.arrayBuffer();
    },
  ) {}

  /** The recording for a note, unless this instrument has none near or its file would not load. */
  pick(inst: Instrument, midi: number, layer: number): SampledVoice | null {
    const v = zoneFor(inst, midi, layer);
    return v && !this.failed.has(v.file) ? v : null;
  }

  has(file: string): boolean {
    return this.buffers.has(file);
  }

  get(file: string): AudioBuffer | undefined {
    const b = this.buffers.get(file);
    if (b) {
      this.buffers.delete(file);
      this.buffers.set(file, b);
    }
    return b;
  }

  /** Starts loading a file, once. */
  want(file: string): void {
    if (this.buffers.has(file) || this.loading.has(file) || this.failed.has(file)) return;
    this.loading.add(file);
    this.load(BASE + file)
      .then((data) => this.ctx.decodeAudioData(data))
      .then((b) => this.store(file, trimLead(this.ctx, b)))
      .catch(() => this.failed.add(file))
      .finally(() => this.loading.delete(file));
  }

  private store(file: string, b: AudioBuffer): void {
    this.buffers.set(file, b);
    this.frames += b.length;
    while (this.frames > MAX_FRAMES && this.buffers.size > 1) {
      const oldest = this.buffers.keys().next().value as string;
      this.frames -= this.buffers.get(oldest)!.length;
      this.buffers.delete(oldest);
    }
  }
}

/**
 * Drops the encoder's lead-in, so the attack lands on the beat. The files start 4 ms before the
 * attack; that much is kept.
 */
export function trimLead(ctx: BaseAudioContext, b: AudioBuffer): AudioBuffer {
  const d = b.getChannelData(0);
  let on = 0;
  while (on < d.length && Math.abs(d[on]!) < ONSET) on++;
  const from = Math.max(0, on - Math.floor(0.004 * b.sampleRate));
  if (from === 0 || from >= d.length) return b;
  const out = ctx.createBuffer(b.numberOfChannels, b.length - from, b.sampleRate);
  for (let c = 0; c < b.numberOfChannels; c++) out.copyToChannel(b.getChannelData(c).subarray(from), c);
  return out;
}
