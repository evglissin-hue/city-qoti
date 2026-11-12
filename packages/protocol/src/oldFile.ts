// R1X (E9): the old-valley file route. A valley saved before version 6 cannot be opened, but its
// newest stored snapshot can be saved to a file, untouched. Read-only; the same for the Worker and
// the dev relay. Current valleys are refused: their bytes travel through the session.
import { OLDEST_SAVE_VERSION } from './limits';
import { peekSnapshotVersion } from './saveVersion';
import type { RoomStorage, StoredMeta } from './storage';
import { sameHash, sha256Hex } from './tokens';

export const OLD_FILE_ROUTE = /^\/api\/valleys\/([0-9a-f]{32})\/old-file$/;

export interface OldFileResponse {
  status: number;
  json?: unknown;
  bytes?: Uint8Array;
}

/** Any seat's token opens it (the same check as the hello). */
export async function handleOldFile(
  method: string,
  authorization: string | null,
  storage: Pick<RoomStorage, 'latestSnapshot'>,
  meta: StoredMeta | null,
): Promise<OldFileResponse> {
  if (method !== 'GET') return { status: 405, json: { error: 'Method not allowed' } };
  if (!meta) return { status: 404, json: { error: 'No such valley' } };
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token || token.length > 128) return { status: 401, json: { error: 'A seat token is needed' } };
  const hash = await sha256Hex(token);
  if (!meta.tokenHashes.some((h) => h && sameHash(h, hash)))
    return { status: 401, json: { error: 'A seat token is needed' } };
  const snap = await storage.latestSnapshot();
  if (!snap) return { status: 404, json: { error: 'Nothing stored' } };
  const version = await peekSnapshotVersion(snap.data);
  if (version === null || version >= OLDEST_SAVE_VERSION)
    return { status: 409, json: { error: 'This valley is not an old one' } };
  const bin = atob(snap.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { status: 200, bytes };
}
