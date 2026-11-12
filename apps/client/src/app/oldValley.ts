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

/** Downloads a solo old valley's stored snapshot, untouched. False when there is nothing stored. */
export async function saveOldSoloFile(v: RecentValley): Promise<boolean> {
  const bytes = await storedBytes(v.valleyId);
  if (!bytes) return false;
  downloadBytes(bytes, oldValleyFileName(v.name));
  return true;
}
