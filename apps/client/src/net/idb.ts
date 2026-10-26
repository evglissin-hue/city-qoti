import type { RoomStorage, StoredMeta, StoredSnapshot } from '@qoti/protocol';
import { SNAPSHOTS_KEPT } from '@qoti/protocol';
import type { Turn } from '@qoti/sim';

const VERSION = 1;

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function valleyDbName(valleyId: string): string {
  return `qoti-valley-${valleyId}`;
}

/** RoomStorage in IndexedDB, one database per valley, for LocalRoom (solo valleys). */
export class IdbStorage implements RoomStorage {
  private db: Promise<IDBDatabase> | null = null;

  constructor(private readonly valleyId: string) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(valleyDbName(this.valleyId), VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('meta');
        db.createObjectStore('turns', { keyPath: 't' });
        db.createObjectStore('snapshots', { keyPath: 't' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }

  private async tx(stores: string[], mode: IDBTransactionMode): Promise<IDBTransaction> {
    return (await this.open()).transaction(stores, mode);
  }

  async getMeta(): Promise<StoredMeta | null> {
    const tx = await this.tx(['meta'], 'readonly');
    return ((await promisify(tx.objectStore('meta').get('meta'))) as StoredMeta | undefined) ?? null;
  }

  async putMeta(m: StoredMeta): Promise<void> {
    const tx = await this.tx(['meta'], 'readwrite');
    tx.objectStore('meta').put(m, 'meta');
    await done(tx);
  }

  async appendTurn(turn: Turn): Promise<void> {
    const tx = await this.tx(['turns'], 'readwrite');
    tx.objectStore('turns').put(turn);
    await done(tx);
  }

  async turnsAfter(t: number): Promise<Turn[]> {
    const tx = await this.tx(['turns'], 'readonly');
    return (await promisify(tx.objectStore('turns').getAll(IDBKeyRange.lowerBound(t, true)))) as Turn[];
  }

  async putSnapshot(s: StoredSnapshot): Promise<void> {
    const tx = await this.tx(['snapshots'], 'readwrite');
    const store = tx.objectStore('snapshots');
    store.put(s);
    const keys = (await promisify(store.getAllKeys())) as number[];
    for (const key of keys.slice(0, Math.max(0, keys.length - SNAPSHOTS_KEPT))) store.delete(key);
    await done(tx);
  }

  async latestSnapshot(): Promise<StoredSnapshot | null> {
    const tx = await this.tx(['snapshots'], 'readonly');
    const cursor = await promisify(tx.objectStore('snapshots').openCursor(null, 'prev'));
    return (cursor?.value as StoredSnapshot | undefined) ?? null;
  }

  async pruneTurnsUpTo(t: number): Promise<void> {
    const tx = await this.tx(['turns'], 'readwrite');
    tx.objectStore('turns').delete(IDBKeyRange.upperBound(t));
    await done(tx);
  }
}
