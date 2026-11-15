import type { PerfRun, PerfRunInput } from '@qoti/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { perfStore, runsToShow, SoloPerf } from './perf';

const part = {
  frames: 10,
  frameAvg: 16.7,
  frameP95: 20,
  gpuAvg: null,
  gpuP95: null,
  draws: 120,
  triangles: 9e5,
};
const input = (n: number): PerfRunInput => ({
  machine: { browser: 'test', screen: [1440, 900], pixelRatio: 2, gpu: null, build: `b${n}` },
  rows: [{ scene: 'valley', quality: 'low', moving: part, idle: part }],
  table: `| table ${n} |`,
});

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

const solo = { valleyId: 'a'.repeat(32), seat: 0, token: 't', mode: 'solo' as const };
const online = { ...solo, mode: 'online' as const };

describe('solo perf runs', () => {
  it('keeps the last three on this device, stamped with the seat and time', async () => {
    let now = 1000;
    const store = new SoloPerf(solo, new MemoryStorage() as unknown as Storage, () => now++);
    expect(await store.list()).toEqual([]);
    for (let i = 1; i <= 5; i++) expect(await store.put(input(i))).toBe(true);
    const runs = (await store.list())!;
    expect(runs.map((r) => r.machine.build)).toEqual(['b3', 'b4', 'b5']);
    expect(runs.every((r) => r.seat === 0)).toBe(true);
    expect(runs.map((r) => r.created)).toEqual([1002, 1003, 1004]);
  });

  it('says it could not keep a run when there is no storage', async () => {
    const store = perfStore(solo, null);
    expect(await store.put(input(1))).toBe(false);
    expect(await store.list()).toBeNull();
  });
});

describe('online perf runs', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('PUTs the run as JSON with the seat token, and lists what the route keeps', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      calls.push({ url, ...(init && { init }) });
      const body =
        init?.method === 'PUT' ? { stored: true, runs: 1 } : { runs: [{ ...input(1), seat: 1, created: 5 }] };
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: init?.method === 'PUT' ? 201 : 200 }),
      );
    });
    const store = perfStore(online);
    expect(await store.put(input(1))).toBe(true);
    expect(calls[0]!.url).toBe(`/api/valleys/${'a'.repeat(32)}/perf`);
    expect(calls[0]!.init!.method).toBe('PUT');
    expect((calls[0]!.init!.headers as Record<string, string>).authorization).toBe('Bearer t');
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual(input(1));
    const runs = await store.list();
    expect(runs?.[0]?.seat).toBe(1);
  });

  it('fails softly when the route is missing or the relay is away', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{}', { status: 404 })));
    expect(await perfStore(online).put(input(1))).toBe(false);
    expect(await perfStore(online).list()).toBeNull();
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    expect(await perfStore(online).put(input(1))).toBe(false);
    expect(await perfStore(online).list()).toBeNull();
  });
});

describe('runsToShow', () => {
  it('shows the last three of each seat, newest first', () => {
    const runs: PerfRun[] = [];
    for (let i = 0; i < 5; i++) runs.push({ ...input(i), seat: 0, created: i * 10 });
    for (let i = 0; i < 4; i++) runs.push({ ...input(i), seat: 1, created: i * 10 + 5 });
    const shown = runsToShow(runs);
    expect(shown.map((r) => [r.seat, r.created])).toEqual([
      [0, 40],
      [1, 35],
      [0, 30],
      [1, 25],
      [0, 20],
      [1, 15],
    ]);
  });
});
