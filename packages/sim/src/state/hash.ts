import type { WorldState } from '../contracts';
import { LAYER_NAMES } from '../map/layers';

// 64-bit FNV-1a in two 32-bit lanes (hi, lo). The prime is 2^40 + 0x1b3, so
// h * prime = h * 0x1b3 + (lo << 40): lo's product carries into hi, and lo * 2^8 lands in hi.

const PRIME_LO = 0x1b3;
const TWO_32 = 4294967296;

class Fnv64 {
  hi = 0xcbf29ce4;
  lo = 0x84222325;

  bytes(data: Uint8Array): void {
    let hi = this.hi;
    let lo = this.lo;
    for (let i = 0; i < data.length; i++) {
      lo = (lo ^ data[i]!) >>> 0;
      const m = lo * PRIME_LO;
      hi = (Math.imul(hi, PRIME_LO) + Math.floor(m / TWO_32) + (lo << 8)) >>> 0;
      lo = m >>> 0;
    }
    this.hi = hi;
    this.lo = lo;
  }

  hex(): string {
    return this.hi.toString(16).padStart(8, '0') + this.lo.toString(16).padStart(8, '0');
  }
}

/**
 * A fast 64-bit state hash for desync checks (not FNV: 2 x 32-bit lanes over 32-bit words, with a
 * murmur-style finalizer). Typed arrays are read as little-endian 32-bit words through views on their
 * buffers (every layer is a multiple of 4 bytes); strings two UTF-16 code units per word.
 */
class WordHash {
  a = 0x9e3779b9;
  b = 0x85ebca6b;
  n = 0;

  words(data: Uint32Array): void {
    let a = this.a;
    let b = this.b;
    for (let i = 0; i < data.length; i++) {
      const w = data[i]!;
      a = Math.imul(a ^ w, 0x01000193);
      b = Math.imul((b ^ w) + (a >>> 13), 0x5bd1e995);
    }
    this.a = a;
    this.b = b;
    this.n += data.length;
  }

  layer(layer: Uint8Array | Int32Array): void {
    const aligned = layer.byteOffset % 4 === 0 ? layer : layer.slice();
    this.words(new Uint32Array(aligned.buffer, aligned.byteOffset, aligned.byteLength >>> 2));
  }

  text(s: string): void {
    let a = this.a;
    let b = this.b;
    const n = s.length;
    for (let i = 0; i < n; i += 2) {
      const w = (s.charCodeAt(i) | ((i + 1 < n ? s.charCodeAt(i + 1) : 0) << 16)) >>> 0;
      a = Math.imul(a ^ w, 0x01000193);
      b = Math.imul((b ^ w) + (a >>> 13), 0x5bd1e995);
    }
    this.a = a;
    this.b = b;
    this.n += n;
  }

  hex(): string {
    const fmix = (h: number) => {
      h ^= h >>> 16;
      h = Math.imul(h, 0x85ebca6b);
      h ^= h >>> 13;
      h = Math.imul(h, 0xc2b2ae35);
      return (h ^ (h >>> 16)) >>> 0;
    };
    const hi = fmix(this.a ^ this.n);
    const lo = fmix(this.b ^ Math.imul(this.n, 0x27d4eb2d));
    return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
  }
}

/** Hash of the whole state: layer words, RNG words, then the JSON of everything else. */
export function hashState(state: WorldState): string {
  const h = new WordHash();
  for (const name of LAYER_NAMES) h.layer(state.map[name]);
  h.words(state.rng);
  h.text(
    JSON.stringify({
      saveVersion: state.saveVersion,
      seed: state.seed,
      settings: state.settings,
      lastTurn: state.lastTurn,
      tick: state.tick,
      time: state.time,
      nextId: state.nextId,
      meta: state.meta,
      seats: state.seats,
      buildings: state.buildings,
      decor: state.decor,
      notes: state.notes,
      residents: state.residents,
      households: state.households,
      economy: state.economy,
      logistics: state.logistics,
      hearth: state.hearth,
      wishes: state.wishes,
      chronicle: state.chronicle,
      achievements: state.achievements,
      stats: state.stats,
      networkVersion: state.networkVersion,
      market: state.market,
      levers: state.levers,
      loans: state.loans,
      lots: state.lots,
      trade: state.trade,
      carts: state.carts,
      charter: state.charter,
      innovations: state.innovations,
      plans: state.plans,
      requests: state.requests,
      stories: state.stories,
      village: state.village,
    }),
  );
  return h.hex();
}

/** Exposed for tests: FNV-1a 64 of raw bytes as 16 hex chars. */
export function fnv64Hex(data: Uint8Array): string {
  const h = new Fnv64();
  h.bytes(data);
  return h.hex();
}
