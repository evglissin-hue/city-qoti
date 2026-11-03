// C5F: where this client keeps a valley's Chronicle pictures. Online, the relay's image route with
// the seat token in an Authorization header; solo, IndexedDB through the protocol's own handleImage,
// so the same rules hold everywhere (seat token, first write wins, 256 KB, a per-valley cap).
import { handleImage, type ImageStorage, type RoomStorage } from '@qoti/protocol';
import { IdbStorage } from './idb';

export interface SnapshotStore {
  /** The entry's picture, or null. */
  get(entry: number): Promise<Blob | null>;
  /** Uploads it; true when this one was kept (false when the entry already had one). */
  put(entry: number, image: Blob): Promise<boolean>;
  /** Entry ids that have a picture. */
  list(): Promise<number[]>;
}

export interface SnapshotTarget {
  valleyId: string;
  token: string;
  mode: 'online' | 'solo';
}

export function snapshotStore(target: SnapshotTarget): SnapshotStore {
  return target.mode === 'online'
    ? new OnlineSnapshots(target)
    : new SoloSnapshots(target, new IdbStorage(target.valleyId));
}

class OnlineSnapshots implements SnapshotStore {
  constructor(private readonly target: SnapshotTarget) {}

  private url(entry?: number): string {
    return `/api/valleys/${this.target.valleyId}/images${entry === undefined ? '' : `/${entry}`}`;
  }

  private get auth(): Record<string, string> {
    return { authorization: `Bearer ${this.target.token}` };
  }

  async get(entry: number): Promise<Blob | null> {
    const res = await fetch(this.url(entry), { headers: this.auth });
    return res.ok ? res.blob() : null;
  }

  async put(entry: number, image: Blob): Promise<boolean> {
    const res = await fetch(this.url(entry), {
      method: 'PUT',
      headers: { ...this.auth, 'content-type': image.type },
      body: image,
    });
    if (!res.ok) return false;
    return ((await res.json()) as { stored?: boolean }).stored === true;
  }

  async list(): Promise<number[]> {
    const res = await fetch(this.url(), { headers: this.auth });
    if (!res.ok) return [];
    return ((await res.json()) as { entries?: number[] }).entries ?? [];
  }
}

/** Solo: the same route, answered on this device. */
export class SoloSnapshots implements SnapshotStore {
  constructor(
    private readonly target: SnapshotTarget,
    private readonly storage: ImageStorage & Pick<RoomStorage, 'getMeta'>,
  ) {}

  private async call(method: string, entry: number | null, image?: Blob) {
    const data = image ? new Uint8Array(await image.arrayBuffer()) : null;
    return handleImage(
      {
        method,
        entry,
        authorization: `Bearer ${this.target.token}`,
        contentType: image?.type ?? null,
        contentLength: data?.length ?? null,
        body: async (limit) => (data && data.length <= limit ? data : null),
      },
      this.storage,
      await this.storage.getMeta(),
      Date.now(),
    );
  }

  async get(entry: number): Promise<Blob | null> {
    const out = await this.call('GET', entry);
    return out.bytes ? new Blob([out.bytes as BlobPart], { type: out.type }) : null;
  }

  async put(entry: number, image: Blob): Promise<boolean> {
    const out = await this.call('PUT', entry, image);
    return (out.json as { stored?: boolean } | undefined)?.stored === true;
  }

  async list(): Promise<number[]> {
    const out = await this.call('GET', null);
    return (out.json as { entries?: number[] } | undefined)?.entries ?? [];
  }
}
