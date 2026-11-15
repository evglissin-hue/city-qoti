import { OLDEST_SAVE_VERSION as ROOM_OLDEST, peekSnapshotVersion } from '@qoti/protocol';
import { bytesToBase64, OLDEST_SAVE_VERSION, peekSaveVersion } from '@qoti/sim';
import { gzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

// R1X: the room reads a stored snapshot's version without the sim; keep it in step with the sim.
describe('the room and the sim agree on old valleys', () => {
  it('share the oldest save version', () => {
    expect(ROOM_OLDEST).toBe(OLDEST_SAVE_VERSION);
  });

  it('read the same version from the same save bytes', async () => {
    for (const v of [1, 5, 6, 7]) {
      const bytes = gzipSync(
        new TextEncoder().encode(JSON.stringify({ saveVersion: v, pad: 'x'.repeat(9000) })),
      );
      expect(await peekSnapshotVersion(bytesToBase64(bytes))).toBe(peekSaveVersion(bytes));
      expect(await peekSnapshotVersion(bytesToBase64(bytes))).toBe(v);
    }
    expect(await peekSnapshotVersion('IMPORTED')).toBeNull();
  });
});
