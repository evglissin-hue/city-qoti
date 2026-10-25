// Valley ids and seat tokens are 128-bit random values; tokens are stored only as SHA-256 hashes.

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/** 128 random bits as 32 hex characters. */
export function randomId(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return hex(new Uint8Array(digest));
}

/** Constant-time comparison for equal-length hex strings. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
