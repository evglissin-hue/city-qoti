import type { Rng, RngStream } from '../contracts';
import { cyrb128 } from './cyrb128';
import { sfc32Next } from './sfc32';

/** Append-only. A stream's index fixes its four words in WorldState.rng. */
export const RNG_STREAMS: readonly RngStream[] = [
  'worldgen',
  'residents',
  'wishes',
  'weather',
  'threats',
  'misc',
  // I3 (C5.0)
  'nature',
  'festival',
];

const WARMUP_STEPS = 12;
const TWO_32 = 4294967296;

export function streamIndex(stream: RngStream): number {
  const i = RNG_STREAMS.indexOf(stream);
  if (i < 0) throw new Error(`Unknown RNG stream ${stream}`);
  return i;
}

/** Seeds one stream's four words from cyrb128(seed + ':' + name), then warms it up. */
export function seedStream(words: Uint32Array, offset: number, seed: string, name: string): void {
  const h = cyrb128(`${seed}:${name}`);
  words[offset] = h[0];
  words[offset + 1] = h[1];
  words[offset + 2] = h[2];
  words[offset + 3] = h[3] === 0 && h[0] === 0 && h[1] === 0 && h[2] === 0 ? 1 : h[3];
  for (let i = 0; i < WARMUP_STEPS; i++) sfc32Next(words, offset);
}

/** Fresh RNG state for every stream, as stored in WorldState.rng. */
export function seedStreams(seed: string): Uint32Array {
  const words = new Uint32Array(RNG_STREAMS.length * 4);
  RNG_STREAMS.forEach((name, i) => seedStream(words, i * 4, seed, name));
  return words;
}

/** A generator over four words of a shared state array. Reads and writes in place. */
export class StreamRng implements Rng {
  constructor(
    private readonly words: Uint32Array,
    private readonly offset: number,
  ) {}

  next(): number {
    return sfc32Next(this.words, this.offset);
  }

  float(): number {
    return this.next() / TWO_32;
  }

  int(n: number): number {
    return Math.floor(this.float() * n);
  }

  range(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  uniform(min: number, max: number): number {
    return min + this.float() * (max - min);
  }

  chance(p: number): boolean {
    return this.float() < p;
  }
}

/** A standalone generator with its own state, seeded like a stream. Handy in tools and tests. */
export function rngFromSeed(seed: string, name = 'misc'): Rng {
  const words = new Uint32Array(4);
  seedStream(words, 0, seed, name);
  return new StreamRng(words, 0);
}
