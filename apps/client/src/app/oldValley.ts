// R1C: valleys founded under the old rules (save version under 6). A solo valley is told apart
// by peeking at its stored snapshot's header; an online one is marked when joining answers
// OLD_VALLEY (session.ts). Nothing here deletes anything.
import { base64ToBytes, peekSaveVersion } from '@qoti/sim';
import { IdbStorage } from '../net/idb';
import { updateRecent, type RecentValley } from './recent';
import { downloadBytes, oldValleyFileName } from './valleyFile';

const OLDEST = 6;

/** The stored snapshot's bytes of a solo valley, or null when it has none. */
async function storedBytes(valleyId: string): Promise<Uint8Array | null> {
  const store = new IdbStorage(valleyId);
  try {
    const snap = await store.latestSnapshot();
    return snap ? base64ToBytes(snap.data) : null;
  } finally {
    await store.close();
  }
}

/** Ids of the solo valleys in the list whose stored snapshot is from before version 6. */
export async function findOldSolo(list: RecentValley[]): Promise<string[]> {
  const old: string[] = [];
  for (const v of list) {
    if (v.mode !== 'solo' || v.pending) continue;
    try {
      const bytes = await storedBytes(v.valleyId);
      const version = bytes ? peekSaveVersion(bytes) : null;
      if (version !== null && version < OLDEST) {
        old.push(v.valleyId);
        updateRecent(v.valleyId, { old: true });
      }
    } catch {
      // Storage blocked or unreadable: leave the valley as it was.
    }
  }
  return old;
}

/** An online old valley's stored snapshot, fetched from its room with the seat token. */
async function onlineBytes(v: RecentValley): Promise<Uint8Array | null> {
  const res = await fetch(`/api/valleys/${v.valleyId}/old-file`, {
    headers: { authorization: `Bearer ${v.token}` },
  });
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Downloads an old valley's stored snapshot, untouched (solo: from this device; online: from its
 * room). False when there is nothing to save.
 */
export async function saveOldFile(v: RecentValley): Promise<boolean> {
  const bytes = v.mode === 'solo' ? await storedBytes(v.valleyId) : await onlineBytes(v);
  if (!bytes) return false;
  downloadBytes(bytes, oldValleyFileName(v.name));
  return true;
}
