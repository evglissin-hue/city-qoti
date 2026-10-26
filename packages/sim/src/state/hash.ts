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

  /** 32-bit words as little-endian bytes. */
  words(data: Int32Array | Uint32Array): void {
    let hi = this.hi;
    let lo = this.lo;
    for (let i = 0; i < data.length; i++) {
      const v = data[i]!;
      for (let s = 0; s < 32; s += 8) {
        lo = (lo ^ ((v >>> s) & 255)) >>> 0;
        const m = lo * PRIME_LO;
        hi = (Math.imul(hi, PRIME_LO) + Math.floor(m / TWO_32) + (lo << 8)) >>> 0;
        lo = m >>> 0;
      }
    }
    this.hi = hi;
    this.lo = lo;
  }

  /** UTF-16 code units, two bytes each, little-endian. */
  text(s: string): void {
    let hi = this.hi;
    let lo = this.lo;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      for (let k = 0; k < 2; k++) {
        lo = (lo ^ (k === 0 ? c & 255 : c >>> 8)) >>> 0;
        const m = lo * PRIME_LO;
        hi = (Math.imul(hi, PRIME_LO) + Math.floor(m / TWO_32) + (lo << 8)) >>> 0;
        lo = m >>> 0;
      }
    }
    this.hi = hi;
    this.lo = lo;
  }

  hex(): string {
    return this.hi.toString(16).padStart(8, '0') + this.lo.toString(16).padStart(8, '0');
  }
}

/** Hash of the whole state: layer bytes, RNG words, then the JSON of everything else. */
export function hashState(state: WorldState): string {
  const h = new Fnv64();
  for (const name of LAYER_NAMES) {
    const layer = state.map[name];
    if (layer instanceof Int32Array) h.words(layer);
    else h.bytes(layer);
  }
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
