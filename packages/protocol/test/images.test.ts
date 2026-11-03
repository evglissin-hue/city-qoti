import { describe, expect, it } from 'vitest';
import {
  handleImage,
  IMAGES_PER_VALLEY,
  MAX_IMAGE_BYTES,
  MemoryImages,
  storeImage,
  type ImageRequest,
} from '../src/images';
import type { StoredMeta } from '../src/storage';
import { sha256Hex } from '../src/tokens';

const PNG = (n = 64, tag = 0) => {
  const b = new Uint8Array(n);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  b[n - 1] = tag;
  return b;
};

async function meta(): Promise<StoredMeta> {
  return {
    valley: { valleyId: 'a'.repeat(32), seed: 's', settings: {} } as unknown as StoredMeta['valley'],
    tokenHashes: [await sha256Hex('seat-0-token'), await sha256Hex('seat-1-token')],
    nextTurn: 1,
    simVersion: null,
  };
}

function req(over: Partial<ImageRequest> & { data?: Uint8Array }): ImageRequest {
  const data = over.data ?? PNG();
  return {
    method: 'PUT',
    entry: 7,
    authorization: 'Bearer seat-0-token',
    contentType: 'image/png',
    contentLength: data.length,
    body: async (limit) => (data.length > limit ? null : data),
    ...over,
  };
}

describe('chronicle snapshots', () => {
  it('gives an entry one image whichever seat captured it: the first write wins', async () => {
    const store = new MemoryImages();
    const m = await meta();
    const first = await handleImage(req({ data: PNG(64, 1) }), store, m, 1);
    const second = await handleImage(req({ authorization: 'Bearer seat-1-token', data: PNG(64, 2) }), store, m, 2);
    expect(first).toMatchObject({ status: 201, json: { stored: true } });
    expect(second).toMatchObject({ status: 200, json: { stored: false } });
    const got = await handleImage(req({ method: 'GET', authorization: 'Bearer seat-1-token' }), store, m, 3);
    expect(got.status).toBe(200);
    expect(got.type).toBe('image/png');
    expect(got.bytes![63]).toBe(1);
    const list = await handleImage(req({ method: 'GET', entry: null }), store, m, 4);
    expect(list.json).toEqual({ entries: [7] });
  });

  it('refuses unauthenticated, oversized and non-image uploads', async () => {
    const store = new MemoryImages();
    const m = await meta();
    expect((await handleImage(req({ authorization: null }), store, m, 1)).status).toBe(401);
    expect((await handleImage(req({ authorization: 'Bearer wrong' }), store, m, 1)).status).toBe(401);
    expect((await handleImage(req({ method: 'GET', authorization: null }), store, m, 1)).status).toBe(401);
    const big = PNG(MAX_IMAGE_BYTES + 1);
    expect((await handleImage(req({ data: big }), store, m, 1)).status).toBe(413);
    // A body larger than it said is still refused while it is read.
    expect((await handleImage(req({ data: big, contentLength: null }), store, m, 1)).status).toBe(413);
    expect((await handleImage(req({ contentType: 'text/html' }), store, m, 1)).status).toBe(415);
    expect((await handleImage(req({ data: new TextEncoder().encode('<script>') }), store, m, 1)).status).toBe(400);
    expect((await handleImage(req({}), store, null, 1)).status).toBe(404);
    expect(await store.listImages()).toEqual([]);
  });

  it('keeps at most a cap of pictures a valley, pruning the oldest entries', async () => {
    const store = new MemoryImages();
    for (let e = 1; e <= IMAGES_PER_VALLEY + 5; e++) {
      await storeImage(store, { entry: e, type: 'image/png', created: e, data: PNG() });
    }
    const list = await store.listImages();
    expect(list).toHaveLength(IMAGES_PER_VALLEY);
    expect(list[0]).toBe(6);
  });

  it('survives a dump and restore (the dev relay writes it to disk)', async () => {
    const store = new MemoryImages();
    await storeImage(store, { entry: 3, type: 'image/png', created: 1, data: PNG(80, 9) });
    const back = MemoryImages.restore(JSON.parse(JSON.stringify(store.dump())));
    expect((await back.getImage(3))!.data).toEqual(PNG(80, 9));
  });
});
