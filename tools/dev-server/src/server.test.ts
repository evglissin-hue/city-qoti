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
});
