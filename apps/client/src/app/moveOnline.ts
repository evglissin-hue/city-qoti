// Moving a solo valley online (docs/spec/16-coop.md, Creating and joining; C4D). It is C2C's import
// path without the file: the valley's current turn is snapshotted, read back exactly as a .qoti
// file would be, and created on the relay as a new online valley. This device keeps seat 0 and the
// invite for seat 1, and the solo valley leaves the Continue list (it has moved, not been copied;
// its last save stays in this browser's storage).
import { createOnlineValley } from '../net/api';
import { forgetValley, rememberValley, type RecentValley } from './recent';
import type { SessionTarget } from './session';
import { readValleyFile } from './valleyFile';

/** Creates the online valley from a snapshot of the solo one and returns where to open it. */
export async function moveValleyOnline(snapshot: Uint8Array, solo: SessionTarget): Promise<SessionTarget> {
  const file = readValleyFile(snapshot);
  const v = await createOnlineValley({ seed: file.seed, settings: file.settings, snapshot: file.snapshot });
  const recent: RecentValley = {
    valleyId: v.valleyId,
    seat: 0,
    token: v.tokens[0]!,
    mode: 'online',
    name: file.summary.townName,
    lastPlayed: Date.now(),
    ...(file.settings.mode === 'sandbox' ? { creative: true } : {}),
    ...(v.invites[1] ? { invite: v.invites[1] } : {}),
  };
  rememberValley(recent);
  forgetValley(solo.valleyId);
  return {
    valleyId: recent.valleyId,
    seat: 0,
    token: recent.token,
    mode: 'online',
    ...(recent.invite ? { invite: recent.invite } : {}),
  };
}
