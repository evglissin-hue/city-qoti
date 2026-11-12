import type { ImageStorage, RoomStorage, StoredImage, StoredMeta, StoredSnapshot } from '@qoti/protocol';
import { retainSnapshots } from '@qoti/protocol';
import type { Turn } from '@qoti/sim';

/** 2 (C5F): adds the `images` store for Chronicle pictures. */
const VERSION = 2;

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

/**
 * RoomStorage in IndexedDB, one database per valley, for LocalRoom (solo valleys). C5F: also the
 * valley's Chronicle pictures (ImageStorage), through the same storeImage as the relay.
 */
export class IdbStorage implements RoomStorage, ImageStorage {
  private db: Promise<IDBDatabase> | null = null;

  constructor(private readonly valleyId: string) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(valleyDbName(this.valleyId), VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, key] of [
          ['meta', null],
          ['turns', 't'],
          ['snapshots', 't'],
          ['images', 'entry'],
        ] as const) {
          if (!db.objectStoreNames.contains(name))
            db.createObjectStore(name, key ? { keyPath: key } : undefined);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }

  private async tx(stores: string[], mode: IDBTransactionMode): Promise<IDBTransaction> {
    return (await this.open()).transaction(stores, mode);
  }

  /** Lets go of the connection, so the valley's database can be deleted. */
  async close(): Promise<void> {
    const db = await this.db;
    db?.close();
    this.db = null;
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
    const all = (await promisify(store.getAll())) as StoredSnapshot[];
    const keep = new Map(retainSnapshots(all).map((x) => [x.t, x]));
    for (const x of all) {
      const k = keep.get(x.t);
      if (!k) store.delete(x.t);
      else if (k.label !== x.label) store.put(k);
    }
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

  async getImage(entry: number): Promise<StoredImage | null> {
    const tx = await this.tx(['images'], 'readonly');
    return ((await promisify(tx.objectStore('images').get(entry))) as StoredImage | undefined) ?? null;
  }

  async putImageIfAbsent(image: StoredImage): Promise<boolean> {
    const tx = await this.tx(['images'], 'readwrite');
    const store = tx.objectStore('images');
    const had = await promisify(store.getKey(image.entry));
    if (had === undefined) store.put(image);
    await done(tx);
    return had === undefined;
  }

  async listImages(): Promise<number[]> {
    const tx = await this.tx(['images'], 'readonly');
    return ((await promisify(tx.objectStore('images').getAllKeys())) as number[]).sort((a, b) => a - b);
  }

  async deleteImages(entries: number[]): Promise<void> {
    const tx = await this.tx(['images'], 'readwrite');
    for (const e of entries) tx.objectStore('images').delete(e);
    await done(tx);
  }
}
