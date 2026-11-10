import { describe, expect, it } from 'vitest';
import {
  handlePerf,
  isPerfRunInput,
  MAX_PERF_CHARS,
  MemoryPerf,
  PERF_ROUTE,
  PERF_RUNS_PER_SEAT,
  trimPerfRuns,
  type PerfRequest,
  type PerfRun,
  type PerfRunInput,
} from '../src/perf';
import type { StoredMeta } from '../src/storage';
import { sha256Hex } from '../src/tokens';

async function meta(): Promise<StoredMeta> {
  return {
    valley: { valleyId: 'a'.repeat(32), seed: 's', settings: {} } as unknown as StoredMeta['valley'],
    tokenHashes: [await sha256Hex('seat-0-token'), await sha256Hex('seat-1-token')],
    nextTurn: 1,
    simVersion: null,
  };
}

const part = {
  frames: 120,
  frameAvg: 8.1,
  frameP95: 11.4,
  gpuAvg: null,
  gpuP95: null,
  draws: 140,
  triangles: 9e5,
};

function input(tag = 'run'): PerfRunInput {
  return {
    machine: { browser: 'TestBrowser/1', screen: [1440, 900], pixelRatio: 2, gpu: null, build: 'b1' },
    rows: [{ scene: 'village', quality: 'high', moving: part, idle: { ...part, gpuAvg: 3.2, gpuP95: 4 } }],
    table: `| ${tag} |`,
  };
}

function run(seat: number, created: number): PerfRun {
  return { ...input(`${seat}-${created}`), seat, created };
}

function req(over: Partial<PerfRequest> & { text?: string }): PerfRequest {
  const text = over.text ?? JSON.stringify(input());
  return {
    method: 'PUT',
    authorization: 'Bearer seat-0-token',
    contentLength: text.length,
    body: async (limit) => (text.length > limit ? null : text),
    ...over,
  };
}

describe('trimPerfRuns', () => {
  it('keeps the last three of each seat across interleaved seats, in the order they came', () => {
    const runs = [run(0, 1), run(1, 2), run(0, 3), run(0, 4), run(1, 5), run(0, 5), run(2, 6), run(0, 7)];
    const kept = trimPerfRuns(runs);
    expect(kept.map((r) => [r.seat, r.created])).toEqual([
      [1, 2],
      [0, 4],
      [1, 5],
      [0, 5],
      [2, 6],
      [0, 7],
    ]);
    expect(PERF_RUNS_PER_SEAT).toBe(3);
  });

  it('leaves a short list alone and honors a smaller cap', () => {
    const runs = [run(0, 1), run(1, 2)];
    expect(trimPerfRuns(runs)).toEqual(runs);
    expect(trimPerfRuns([run(0, 1), run(0, 2), run(1, 3)], 1).map((r) => r.created)).toEqual([2, 3]);
  });
});

describe('handlePerf', () => {
  it('answers 404 for a valley that does not exist', async () => {
    expect(await handlePerf(req({}), new MemoryPerf(), null, 1)).toMatchObject({ status: 404 });
  });

  it('answers 401 without a token or with a wrong one, for reads and writes alike', async () => {
    const m = await meta();
    const store = new MemoryPerf();
    for (const authorization of [
      null,
      'Bearer nope',
      'seat-0-token',
      'Bearer ',
      `Bearer ${'x'.repeat(200)}`,
    ]) {
      expect((await handlePerf(req({ authorization }), store, m, 1)).status).toBe(401);
      expect((await handlePerf(req({ authorization, method: 'GET' }), store, m, 1)).status).toBe(401);
    }
    expect(await store.getPerfRuns()).toEqual([]);
  });

  it('answers 400 for bad JSON or a body that is not a perf run', async () => {
    const m = await meta();
    const store = new MemoryPerf();
    const bad = [
      '{nope',
      '',
      'null',
      '[]',
      JSON.stringify({ ...input(), table: 4 }),
      JSON.stringify({ ...input(), machine: { ...input().machine, screen: [1] } }),
      JSON.stringify({ ...input(), rows: [{ scene: 'v', quality: 'high', moving: part }] }),
      JSON.stringify({
        ...input(),
        rows: [{ scene: 'v', quality: 'high', moving: part, idle: { ...part, draws: 'x' } }],
      }),
    ];
    for (const text of bad) expect((await handlePerf(req({ text }), store, m, 1)).status).toBe(400);
    expect(await store.getPerfRuns()).toEqual([]);
  });

  it('answers 413 past MAX_PERF_CHARS, by declared length or by what the body holds', async () => {
    const m = await meta();
    const store = new MemoryPerf();
    const big = JSON.stringify({ ...input(), table: 'x'.repeat(MAX_PERF_CHARS) });
    expect((await handlePerf(req({ text: big }), store, m, 1)).status).toBe(413);
    expect((await handlePerf(req({ text: big, contentLength: null }), store, m, 1)).status).toBe(413);
    expect((await handlePerf(req({ contentLength: MAX_PERF_CHARS + 1 }), store, m, 1)).status).toBe(413);
    expect(await store.getPerfRuns()).toEqual([]);
  });

  it('answers 405 for methods other than GET and PUT', async () => {
    const m = await meta();
    for (const method of ['POST', 'DELETE', 'PATCH', 'HEAD'])
      expect((await handlePerf(req({ method }), new MemoryPerf(), m, 1)).status).toBe(405);
  });

  it('stamps the seat from the token and the time from the server, whatever the body says', async () => {
    const m = await meta();
    const store = new MemoryPerf();
    const text = JSON.stringify({ ...input('mine'), seat: 0, created: 5, extra: 'dropped' });
    const out = await handlePerf(req({ text, authorization: 'Bearer seat-1-token' }), store, m, 1234);
    expect(out).toEqual({ status: 201, json: { stored: true, runs: 1 } });
    const [stored] = await store.getPerfRuns();
    expect(stored).toEqual({ ...input('mine'), seat: 1, created: 1234 });
  });

  it('keeps three runs a seat and lists every seat on GET, oldest first', async () => {
    const m = await meta();
    const store = new MemoryPerf();
    let changes = 0;
    store.onChange = () => changes++;
    const counts: unknown[] = [];
    for (let i = 1; i <= 4; i++) {
      const out = await handlePerf(req({ text: JSON.stringify(input(`a${i}`)) }), store, m, i);
      counts.push(out.json);
    }
    await handlePerf(
      req({ text: JSON.stringify(input('b1')), authorization: 'Bearer seat-1-token' }),
      store,
      m,
      5,
    );
    expect(counts.map((c) => (c as { runs: number }).runs)).toEqual([1, 2, 3, 3]);
    expect(changes).toBe(5);
    const got = await handlePerf(req({ method: 'GET', authorization: 'Bearer seat-1-token' }), store, m, 6);
    expect(got.status).toBe(200);
    const runs = (got.json as { runs: PerfRun[] }).runs;
    expect(runs.map((r) => [r.seat, r.table])).toEqual([
      [0, '| a2 |'],
      [0, '| a3 |'],
      [0, '| a4 |'],
      [1, '| b1 |'],
    ]);
  });
});

describe('perf contract odds and ends', () => {
  it('matches only a valley id followed by /perf', () => {
    const id = 'ab'.repeat(16);
    expect(PERF_ROUTE.exec(`/api/valleys/${id}/perf`)?.[1]).toBe(id);
    expect(PERF_ROUTE.test(`/api/valleys/${id}/perf/1`)).toBe(false);
    expect(PERF_ROUTE.test(`/api/valleys/${id.toUpperCase()}/perf`)).toBe(false);
    expect(PERF_ROUTE.test('/api/valleys/abc/perf')).toBe(false);
  });

  it('accepts a run with the optional mode counts and shadow renders', () => {
    const rich = { ...part, modes: { moving: 1, still: 2, idle: 3 }, shadowRenders: 4 };
    expect(
      isPerfRunInput({ ...input(), rows: [{ scene: 's', quality: 'low', moving: rich, idle: rich }] }),
    ).toBe(true);
  });

  it('MemoryPerf dumps and restores without sharing its list', async () => {
    const a = MemoryPerf.restore([run(0, 1)]);
    const dumped = a.dump();
    dumped.push(run(1, 2));
    expect(await a.getPerfRuns()).toEqual([run(0, 1)]);
    expect(await MemoryPerf.restore(dumped).getPerfRuns()).toHaveLength(2);
  });
});
