// Chronicle snapshots (C5F; docs/spec/21-networking-and-saves.md, Chronicle snapshots). A small
// picture per notable Chronicle entry, kept with the valley and never in sim state. One route,
// shared by the Worker's ValleyRoom, the dev relay and (through ImageStorage) the solo client:
//   PUT /api/valleys/<id>/images/<entry>  body: the image (webp, png or jpeg), at most 256 KB
//   GET /api/valleys/<id>/images/<entry>  the image, or 404
//   GET /api/valleys/<id>/images          the entry ids that have one, as JSON
// Every call needs a seat token in `Authorization: Bearer <token>`. The first write for an entry
// wins (a second PUT answers 200 with `stored: false`), so whichever seat captured it, an entry gets
// one image. A valley keeps at most IMAGES_PER_VALLEY; past that the oldest entries' images go.
import { sameHash, sha256Hex } from './tokens';
import type { StoredMeta } from './storage';

export const MAX_IMAGE_BYTES = 256 * 1024;
export const IMAGES_PER_VALLEY = 200;
export const IMAGE_TYPES = ['image/webp', 'image/png', 'image/jpeg'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export const IMAGE_ROUTE = /^\/api\/valleys\/([0-9a-f]{32})\/images(?:\/(\d{1,10}))?$/;

export interface StoredImage {
  /** The Chronicle entry's id. */
  entry: number;
  type: ImageType;
  /** Wall-clock ms when stored. */
  created: number;
  data: Uint8Array;
}

/** Where a valley keeps its pictures: Durable Object SQLite, the dev relay's memory, IndexedDB. */
export interface ImageStorage {
  getImage(entry: number): Promise<StoredImage | null>;
  /** Stores it unless the entry already has one; true when stored. */
  putImageIfAbsent(image: StoredImage): Promise<boolean>;
  /** Entry ids with an image, oldest entry first. */
  listImages(): Promise<number[]>;
  deleteImages(entries: number[]): Promise<void>;
}

/** Stores the image (first write wins) and prunes the oldest past the cap. */
export async function storeImage(
  storage: ImageStorage,
  image: StoredImage,
  cap = IMAGES_PER_VALLEY,
): Promise<boolean> {
  const stored = await storage.putImageIfAbsent(image);
  if (stored) {
    const all = await storage.listImages();
    if (all.length > cap) await storage.deleteImages(all.slice(0, all.length - cap));
  }
  return stored;
}

/** Does the image's first bytes match its type? (A cheap guard against storing anything else.) */
export function sniffImage(type: string, data: Uint8Array): boolean {
  const b = data;
  if (type === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8;
  if (type === 'image/webp')
    return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45;
  return false;
}

export interface ImageRequest {
  method: string;
  /** The entry id from the path, or null for the list. */
  entry: number | null;
  authorization: string | null;
  contentType: string | null;
  /** Declared length, when the transport knows it (refused early when too large). */
  contentLength: number | null;
  /** Reads the body, refusing past `limit` bytes (returns null then). */
  body(limit: number): Promise<Uint8Array | null>;
}

export interface ImageResponse {
  status: number;
  /** JSON body, or the image bytes with `type`. */
  json?: unknown;
  bytes?: Uint8Array;
  type?: string;
}

async function seatOf(meta: StoredMeta | null, authorization: string | null): Promise<number | null> {
  if (!meta || !authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  if (!token || token.length > 128) return null;
  const hash = await sha256Hex(token);
  const seat = meta.tokenHashes.findIndex((h) => sameHash(h, hash));
  return seat >= 0 ? seat : null;
}

/** The image route, the same for the Worker and the dev relay. */
export async function handleImage(
  req: ImageRequest,
  storage: ImageStorage,
  meta: StoredMeta | null,
  now: number,
): Promise<ImageResponse> {
  if (!meta) return { status: 404, json: { error: 'No such valley' } };
  if ((await seatOf(meta, req.authorization)) === null)
    return { status: 401, json: { error: 'A seat token is needed' } };
  if (req.entry === null) {
    if (req.method !== 'GET') return { status: 405, json: { error: 'Method not allowed' } };
    return { status: 200, json: { entries: await storage.listImages() } };
  }
  if (req.method === 'GET') {
    const img = await storage.getImage(req.entry);
    return img
      ? { status: 200, bytes: img.data, type: img.type }
      : { status: 404, json: { error: 'No picture' } };
  }
  if (req.method !== 'PUT') return { status: 405, json: { error: 'Method not allowed' } };
  const type = (req.contentType ?? '').split(';')[0]!.trim().toLowerCase();
  if (!(IMAGE_TYPES as readonly string[]).includes(type))
    return { status: 415, json: { error: 'Pictures only' } };
  if (req.contentLength !== null && req.contentLength > MAX_IMAGE_BYTES)
    return { status: 413, json: { error: 'Too large' } };
  const data = await req.body(MAX_IMAGE_BYTES);
  if (!data) return { status: 413, json: { error: 'Too large' } };
  if (data.length === 0 || !sniffImage(type, data)) return { status: 400, json: { error: 'Not a picture' } };
  const stored = await storeImage(storage, { entry: req.entry, type: type as ImageType, created: now, data });
  return { status: stored ? 201 : 200, json: { stored } };
}

/** In-memory image storage for tests and the dev relay (which persists it with dump and restore). */
export class MemoryImages implements ImageStorage {
  private images = new Map<number, StoredImage>();
  onChange: (() => void) | null = null;

  static restore(list: { entry: number; type: ImageType; created: number; data: string }[]): MemoryImages {
    const s = new MemoryImages();
    for (const i of list)
      s.images.set(i.entry, { ...i, data: Uint8Array.from(atob(i.data), (c) => c.charCodeAt(0)) });
    return s;
  }

  dump(): { entry: number; type: ImageType; created: number; data: string }[] {
    return [...this.images.values()].map((i) => {
      let bin = '';
      for (let k = 0; k < i.data.length; k += 0x8000)
        bin += String.fromCharCode(...i.data.subarray(k, k + 0x8000));
      return { entry: i.entry, type: i.type, created: i.created, data: btoa(bin) };
    });
  }

  async getImage(entry: number): Promise<StoredImage | null> {
    return this.images.get(entry) ?? null;
  }

  async putImageIfAbsent(image: StoredImage): Promise<boolean> {
    if (this.images.has(image.entry)) return false;
    this.images.set(image.entry, { ...image, data: image.data.slice() });
    this.onChange?.();
    return true;
  }

  async listImages(): Promise<number[]> {
    return [...this.images.keys()].sort((a, b) => a - b);
  }

  async deleteImages(entries: number[]): Promise<void> {
    for (const e of entries) this.images.delete(e);
    this.onChange?.();
  }
}
