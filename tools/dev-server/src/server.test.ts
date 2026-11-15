import type { CreateValleyResponse, S2C } from '@qoti/protocol';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { startDevServer, type DevServer } from './server';

const dirs: string[] = [];
const servers: DevServer[] = [];

afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function start(dataDir?: string): Promise<{ server: DevServer; dataDir: string }> {
  const dir = dataDir ?? mkdtempSync(join(tmpdir(), 'qoti-dev-'));
  if (!dataDir) dirs.push(dir);
  const server = await startDevServer({ port: 0, dataDir: dir, log: () => {} });
  servers.push(server);
  return { server, dataDir: dir };
}

async function createValley(port: number): Promise<CreateValleyResponse> {
  const res = await fetch(`http://localhost:${port}/api/valleys`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed: 'dev-seed', settings: { townName: 'Testwick' } }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as CreateValleyResponse;
}

function connect(port: number, valleyId: string, seat: number, token: string) {
  const ws = new WebSocket(`ws://localhost:${port}/api/valleys/${valleyId}/ws`);
  const received: S2C[] = [];
  ws.on('message', (data) => received.push(JSON.parse(data.toString()) as S2C));
  ws.on('open', () => ws.send(JSON.stringify({ k: 'hello', valleyId, seat, token, simVersion: 'test' })));
  return { ws, received };
}

describe('dev server', () => {
  it('creates a valley and relays turns over the WebSocket', async () => {
    const { server } = await start();
    const valley = await createValley(server.port);
    expect(valley.valleyId).toMatch(/^[0-9a-f]{32}$/);
    expect(valley.seed).toBe('dev-seed');
    expect(valley.invites[1]).toBe(`#v=${valley.valleyId}&s=1&k=${valley.tokens[1]}`);

    const a = connect(server.port, valley.valleyId, 0, valley.tokens[0]!);
    await vi.waitFor(() => expect(a.received.some((m) => m.k === 'welcome')).toBe(true), { timeout: 3000 });
    await vi.waitFor(() => expect(a.received.filter((m) => m.k === 'turn').length).toBeGreaterThan(2), {
      timeout: 3000,
    });
    const first = a.received.find((m) => m.k === 'turn');
    expect(first && first.k === 'turn' && first.turn.cmds[0]?.cmd).toEqual({ t: 'sys.seatJoined', seat: 0 });
    a.ws.close();
  });

  it('keeps valleys across restarts', async () => {
    const { server, dataDir } = await start();
    const valley = await createValley(server.port);
    const a = connect(server.port, valley.valleyId, 0, valley.tokens[0]!);
    await vi.waitFor(() => expect(a.received.filter((m) => m.k === 'turn').length).toBeGreaterThan(3), {
      timeout: 3000,
    });
    a.ws.close();
    await server.close();
    servers.splice(servers.indexOf(server), 1);
    expect(readdirSync(dataDir)).toContain(`${valley.valleyId}.json`);

    const again = await startDevServer({ port: 0, dataDir, log: () => {} });
    servers.push(again);
    dirs.push(dataDir);
    const b = connect(again.port, valley.valleyId, 1, valley.tokens[1]!);
    await vi.waitFor(() => expect(b.received.some((m) => m.k === 'welcome')).toBe(true), { timeout: 3000 });
    const welcome = b.received.find((m) => m.k === 'welcome');
    expect(welcome && welcome.k === 'welcome' && welcome.log.length).toBeGreaterThan(0);
    expect(welcome && welcome.k === 'welcome' && welcome.valley.settings.townName).toBe('Testwick');
    b.ws.close();
  });

  it('answers unknown valleys with NOT_FOUND', async () => {
    const { server } = await start();
    const c = connect(server.port, 'f'.repeat(32), 0, 'nope');
    await vi.waitFor(() => expect(c.received[0]).toMatchObject({ k: 'error', code: 'NOT_FOUND' }), {
      timeout: 3000,
    });
  });

  it('stores one Chronicle picture an entry, keeps it across restarts, and refuses strangers', async () => {
    const { server, dataDir } = await start();
    const valley = await createValley(server.port);
    const url = (port: number, entry?: number) =>
      `http://localhost:${port}/api/valleys/${valley.valleyId}/images${entry === undefined ? '' : `/${entry}`}`;
    const png = (tag: number) => {
      const b = new Uint8Array(100);
      b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      b[99] = tag;
      return b;
    };
    const put = (port: number, token: string | null, body: Uint8Array, entry = 12) =>
      fetch(url(port, entry), {
        method: 'PUT',
        headers: { 'content-type': 'image/png', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body as BodyInit,
      });
    expect((await put(server.port, valley.tokens[0]!, png(1))).status).toBe(201);
    expect((await put(server.port, valley.tokens[1]!, png(2))).status).toBe(200);
    expect((await put(server.port, null, png(3), 13)).status).toBe(401);
    expect(
      (await put(server.port, valley.tokens[0]!, new Uint8Array(300 * 1024).fill(0x89), 14)).status,
    ).toBe(413);
    expect((await fetch(url(server.port, 12))).status).toBe(401);
    await server.close();
    servers.splice(servers.indexOf(server), 1);

    const again = await startDevServer({ port: 0, dataDir, log: () => {} });
    servers.push(again);
    dirs.push(dataDir);
    const res = await fetch(url(again.port, 12), {
      headers: { authorization: `Bearer ${valley.tokens[1]!}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await res.arrayBuffer())[99]).toBe(1);
    const list = await fetch(url(again.port), { headers: { authorization: `Bearer ${valley.tokens[0]!}` } });
    expect(await list.json()).toEqual({ entries: [12] });
  });

  it('keeps three perf runs a seat, across restarts, and refuses tokens from another valley', async () => {
    const { server, dataDir } = await start();
    const valley = await createValley(server.port);
    const other = await createValley(server.port);
    const url = (port: number) => `http://localhost:${port}/api/valleys/${valley.valleyId}/perf`;
    const part = {
      frames: 60,
      frameAvg: 9,
      frameP95: 12,
      gpuAvg: null,
      gpuP95: null,
      draws: 90,
      triangles: 4e5,
    };
    const body = (table: string) =>
      JSON.stringify({
        machine: { browser: 'Test/1', screen: [1280, 800], pixelRatio: 1, gpu: null, build: 'dev' },
        rows: [{ scene: 'village', quality: 'medium', moving: part, idle: part }],
        table,
        seat: 1,
      });
    const put = (port: number, token: string, table: string) =>
      fetch(url(port), {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: body(table),
      });
    const get = (port: number, token: string) =>
      fetch(url(port), { headers: { authorization: `Bearer ${token}` } });
    type Runs = { runs: { seat: number; table: string; created: number }[] };

    for (let i = 1; i <= 4; i++) {
      const res = await put(server.port, valley.tokens[0]!, `a${i}`);
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ stored: true, runs: Math.min(i, 3) });
    }
    expect((await put(server.port, valley.tokens[1]!, 'b1')).status).toBe(201);
    expect((await put(server.port, other.tokens[0]!, 'stranger')).status).toBe(401);
    expect((await get(server.port, other.tokens[0]!)).status).toBe(401);
    expect(
      (
        await fetch(url(server.port), {
          method: 'PUT',
          headers: { authorization: `Bearer ${valley.tokens[0]!}` },
          body: '{"not":"a run"}',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(url(server.port), {
          method: 'PUT',
          headers: { authorization: `Bearer ${valley.tokens[0]!}` },
          body: 'x'.repeat(70 * 1024),
        })
      ).status,
    ).toBe(413);
    expect((await fetch(`http://localhost:${server.port}/api/valleys/${'f'.repeat(32)}/perf`)).status).toBe(
      404,
    );

    const before = (await (await get(server.port, valley.tokens[1]!)).json()) as Runs;
    expect(before.runs.map((r) => [r.seat, r.table])).toEqual([
      [0, 'a2'],
      [0, 'a3'],
      [0, 'a4'],
      [1, 'b1'],
    ]);
    expect(before.runs.every((r) => r.created > 0)).toBe(true);
    await server.close();
    servers.splice(servers.indexOf(server), 1);
    expect(readdirSync(dataDir)).toContain(`${valley.valleyId}.perf.json`);

    const again = await startDevServer({ port: 0, dataDir, log: () => {} });
    servers.push(again);
    dirs.push(dataDir);
    const after = (await (await get(again.port, valley.tokens[0]!)).json()) as Runs;
    expect(after).toEqual(before);
  });
});
