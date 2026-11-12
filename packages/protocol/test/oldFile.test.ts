import { describe, expect, it } from 'vitest';
import { handleOldFile } from '../src/oldFile';
import { MemoryStorage, type StoredMeta } from '../src/storage';
import { sha256Hex } from '../src/tokens';

async function save(version: number): Promise<{ b64: string; bytes: Uint8Array }> {
  const text = JSON.stringify({ saveVersion: version, seed: 'x' });
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return { b64: btoa(bin), bytes };
}

async function setup(version: number | null) {
  const storage = new MemoryStorage();
  const meta: StoredMeta = {
    valley: { id: 'a'.repeat(32), seed: 's', settings: {} } as unknown as StoredMeta['valley'],
    tokenHashes: [await sha256Hex('tok-0'), ''],
    nextTurn: 2,
    simVersion: null,
  };
  await storage.putMeta(meta);
  const s = version === null ? null : await save(version);
  if (s) await storage.putSnapshot({ t: 1, simVersion: 'v', label: null, created: 1, data: s.b64 });
  return { storage, meta, bytes: s?.bytes };
}

describe('old-valley file route', () => {
  it('returns the stored bytes untouched for a valley under version 6', async () => {
    const { storage, meta, bytes } = await setup(5);
    const out = await handleOldFile('GET', 'Bearer tok-0', storage, meta);
    expect(out.status).toBe(200);
    expect(Array.from(out.bytes!)).toEqual(Array.from(bytes!));
  });

  it('refuses a missing, wrong or empty-slot token', async () => {
    const { storage, meta } = await setup(5);
    expect((await handleOldFile('GET', null, storage, meta)).status).toBe(401);
    expect((await handleOldFile('GET', 'Bearer nope', storage, meta)).status).toBe(401);
    expect((await handleOldFile('GET', 'Bearer ', storage, meta)).status).toBe(401);
  });

  it('refuses a current (version 6) valley, an empty one, an unknown one and a non-GET', async () => {
    const cur = await setup(6);
    expect((await handleOldFile('GET', 'Bearer tok-0', cur.storage, cur.meta)).status).toBe(409);
    const empty = await setup(null);
    expect((await handleOldFile('GET', 'Bearer tok-0', empty.storage, empty.meta)).status).toBe(404);
    expect((await handleOldFile('GET', 'Bearer tok-0', empty.storage, null)).status).toBe(404);
    const old = await setup(5);
    expect((await handleOldFile('POST', 'Bearer tok-0', old.storage, old.meta)).status).toBe(405);
  });
});
