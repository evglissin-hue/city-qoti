/**
 * One sfc32 step on the four words at s[o..o+3], updated in place. Keeping the words in a
 * shared Uint32Array (WorldState.rng) is what lets snapshots resume every stream exactly.
 * Returns a uniform uint32.
 */
export function sfc32Next(s: Uint32Array, o: number): number {
  const a = s[o]!;
  const b = s[o + 1]!;
  const c = s[o + 2]!;
  const d = s[o + 3]!;
  const t = (((a + b) >>> 0) + d) >>> 0;
  s[o + 3] = d + 1;
  s[o] = b ^ (b >>> 9);
  s[o + 1] = c + (c << 3);
  s[o + 2] = ((c << 21) | (c >>> 11)) + t;
  return t;
}
