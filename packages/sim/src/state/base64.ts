// Base64 and little-endian helpers for saves and hashing. The sim has no DOM, so no btoa.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(128);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const n = (a << 16) | (b << 8) | c;
    chunk +=
      ALPHABET[(n >> 18) & 63]! +
      ALPHABET[(n >> 12) & 63]! +
      (i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63]! : '=') +
      (i + 2 < bytes.length ? ALPHABET[n & 63]! : '=');
    if (chunk.length >= 8192) {
      parts.push(chunk);
      chunk = '';
    }
  }
  parts.push(chunk);
  return parts.join('');
}

export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)]!;
    const b = LOOKUP[clean.charCodeAt(i + 1)]!;
    const c = i + 2 < clean.length ? LOOKUP[clean.charCodeAt(i + 2)]! : 0;
    const d = i + 3 < clean.length ? LOOKUP[clean.charCodeAt(i + 3)]! : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/** 32-bit words to little-endian bytes, independent of platform byte order. */
export function wordsToBytes(words: Int32Array | Uint32Array): Uint8Array {
  const out = new Uint8Array(words.length * 4);
  for (let i = 0; i < words.length; i++) {
    const v = words[i]!;
    out[i * 4] = v & 255;
    out[i * 4 + 1] = (v >>> 8) & 255;
    out[i * 4 + 2] = (v >>> 16) & 255;
    out[i * 4 + 3] = (v >>> 24) & 255;
  }
  return out;
}

export function bytesToWords<T extends Int32Array | Uint32Array>(bytes: Uint8Array, out: T): T {
  for (let i = 0; i < out.length; i++) {
    out[i] = bytes[i * 4]! | (bytes[i * 4 + 1]! << 8) | (bytes[i * 4 + 2]! << 16) | (bytes[i * 4 + 3]! << 24);
  }
  return out;
}
