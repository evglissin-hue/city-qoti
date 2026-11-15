// R1X: reads a stored snapshot's save version from the head of its gzip, without building a world.
// Mirrors peekSaveVersion in @qoti/sim (the protocol may only import types from sim).

const HEAD_BASE64_CHARS = 8192; // a multiple of 4
const HEAD_TEXT_CHARS = 4096;

/** The saveVersion of base64 gzip save data, or null when it cannot be read. */
export async function peekSnapshotVersion(base64: string): Promise<number | null> {
  let head = '';
  try {
    const bin = atob(base64.slice(0, HEAD_BASE64_CHARS));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (head.length < HEAD_TEXT_CHARS) {
        const { done, value } = await reader.read();
        if (done) break;
        head += decoder.decode(value, { stream: true });
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  } catch {
    // A truncated stream still yields what it inflated; anything else is not a save.
  }
  const m = /"saveVersion":\s*(\d+)/.exec(head);
  return m ? Number(m[1]) : null;
}
