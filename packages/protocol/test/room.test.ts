import type { SeatId, Turn, ValleySettings } from '@qoti/sim';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloseCode, MAX_CMD_BYTES, SNAPSHOT_EVERY_TURNS } from '../src/limits';
import type { S2C } from '../src/messages';
import { RoomCore, type Conn } from '../src/room';
import { MemoryStorage, type StoredSnapshot } from '../src/storage';
import { initValley, type NewValley } from '../src/valley';

const SETTINGS: ValleySettings = {
  mode: 'sandbox',
  economy: 'gentle',
  threat: 'peaceful',
  togetherOnly: false,
  townName: 'Qoti',
  valleyName: 'Riverbend',
};

class FakeConn implements Conn {
  sent: S2C[] = [];
  closed: { code: number; reason: string } | null = null;
  send(msg: S2C): void {
    this.sent.push(structuredClone(msg));
  }
  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }
  of<K extends S2C['k']>(k: K): Extract<S2C, { k: K }>[] {
    return this.sent.filter((m): m is Extract<S2C, { k: K }> => m.k === k);
  }
  turns(): Turn[] {
    return this.of('turn').map((m) => m.turn);
  }
}

/** Storage that answers slowly, to prove nothing is lost while a welcome is prepared. */
class SlowStorage extends MemoryStorage {
  delay = 0;
  override async turnsAfter(t: number): Promise<Turn[]> {
    await new Promise((r) => setTimeout(r, this.delay));
    return super.turnsAfter(t);
  }
}

let now = 0;
let storage: MemoryStorage;
let valley: NewValley;
let room: RoomCore;
const logs: string[] = [];

async function makeRoom(store: MemoryStorage = storage): Promise<RoomCore> {
  const r = new RoomCore(store, { turnMs: 100, now: () => now, log: (_level, msg) => logs.push(msg) });
  await r.ready();
  return r;
}

async function join(seat: SeatId, r = room, simVersion = 'v-test'): Promise<FakeConn> {
  const conn = new FakeConn();
  r.open(conn);
  r.message(conn, { k: 'hello', valleyId: valley.valleyId, seat, token: valley.tokens[seat]!, simVersion });
  await vi.waitFor(() => expect(conn.of('welcome').length + conn.of('error').length).toBe(1));
  return conn;
}

function steps(n: number, r = room): void {
  for (let i = 0; i < n; i++) {
    now += 100;
    r.step();
  }
}

beforeEach(async () => {
  now = 0;
  logs.length = 0;
  storage = new MemoryStorage();
  valley = await initValley(storage, { valleyId: 'valley-1', seed: 'seed-1', settings: SETTINGS, now: 0 });
  room = await makeRoom();
});

describe('initValley', () => {
  it('stores only token hashes', async () => {
    const meta = (await storage.getMeta())!;
    expect(valley.tokens).toHaveLength(2);
    expect(valley.tokens[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(meta.tokenHashes).toHaveLength(2);
    expect(JSON.stringify(meta)).not.toContain(valley.tokens[0]);
    expect(meta.valley).toMatchObject({ id: 'valley-1', seed: 'seed-1' });
  });
});

describe('imported valleys', () => {
  it('start from the imported snapshot, with the next turn after it', async () => {
    storage = new MemoryStorage();
    valley = await initValley(storage, {
      valleyId: 'valley-2',
      seed: 'seed-2',
      settings: SETTINGS,
      now: 0,
      snapshot: { t: 420, simVersion: 'v-test', data: 'IMPORTED' },
    });
    room = await makeRoom();
    const a = await join(0);
    expect(a.of('welcome')[0]).toMatchObject({
      snapshot: { t: 420, simVersion: 'v-test', data: 'IMPORTED' },
      log: [],
      nextTurn: 421,
    });
    steps(2);
    expect(a.turns()[0]!.t).toBe(421);
  });
});

describe('joining', () => {
  it('welcomes a seat with the valley, no snapshot and turn 1 next, then injects sys.seatJoined', async () => {
    const a = await join(0);
    expect(a.of('welcome')[0]).toMatchObject({ seat: 0, snapshot: null, log: [], nextTurn: 1 });
    expect(a.of('welcome')[0]!.valley.seed).toBe('seed-1');
    steps(1);
    expect(a.turns()).toEqual([{ t: 1, cmds: [{ seat: 0, seq: 0, cmd: { t: 'sys.seatJoined', seat: 0 } }] }]);
  });

  it('rejects bad tokens and unknown valleys', async () => {
    const bad = new FakeConn();
    room.open(bad);
    room.message(bad, {
      k: 'hello',
      valleyId: valley.valleyId,
      seat: 0,
      token: valley.tokens[1]!,
      simVersion: 'v',
    });
    await vi.waitFor(() => expect(bad.closed?.code).toBe(CloseCode.badToken));
    expect(bad.of('error')[0]!.code).toBe('BAD_TOKEN');

    const lost = new FakeConn();
    room.open(lost);
    room.message(lost, { k: 'hello', valleyId: 'nope', seat: 0, token: valley.tokens[0]!, simVersion: 'v' });
    await vi.waitFor(() => expect(lost.of('error')[0]?.code).toBe('NOT_FOUND'));
  });

  it('closes connections that never say hello', () => {
    const quiet = new FakeConn();
    room.open(quiet);
    now += 5100;
    room.step();
    expect(quiet.closed?.code).toBe(CloseCode.helloTimeout);
  });

  it('replaces an older connection for the same seat', async () => {
    const first = await join(0);
    const second = await join(0);
    expect(first.closed?.code).toBe(CloseCode.replaced);
    steps(1);
    expect(second.turns()).toHaveLength(1);
    expect(first.turns()).toHaveLength(0);
  });

  it('refuses a different simVersion while the partner is connected', async () => {
    await join(0, room, 'v-old');
    const late = await join(1, room, 'v-new');
    expect(late.of('error')[0]!.code).toBe('VERSION_MISMATCH');
  });
});

describe('turns', () => {
  it('orders sys commands first, then client commands in arrival order, and drops client sys.*', async () => {
    const a = await join(0);
    const b = await join(1);
    steps(1);
    room.message(b, { k: 'cmd', seq: 1, cmd: { t: 'time.setSpeed', speed: 2 } });
    room.message(a, { k: 'cmd', seq: 1, cmd: { t: 'time.setSpeed', speed: 3 } });
    room.message(a, { k: 'cmd', seq: 2, cmd: { t: 'sys.seatLeft', seat: 1 } });
    room.close(b);
    steps(1);
    const turn = a.turns()[1]!;
    expect(turn.cmds.map((c) => [c.seat, c.cmd.t])).toEqual([
      [1, 'sys.seatLeft'],
      [1, 'time.setSpeed'],
      [0, 'time.setSpeed'],
    ]);
  });

  it('broadcasts empty turns but stores only turns with commands', async () => {
    const a = await join(0);
    steps(5);
    expect(a.turns().map((t) => t.t)).toEqual([1, 2, 3, 4, 5]);
    await room.flush();
    expect((await storage.turnsAfter(0)).map((t) => t.t)).toEqual([1]);
  });

  it('stops time when nobody is connected, after one turn recording the leave', async () => {
    const a = await join(0);
    steps(2);
    room.close(a);
    steps(3);
    await room.flush();
    expect((await storage.turnsAfter(0)).map((t) => t.t)).toEqual([1, 3]);
    expect(room.currentTurn).toBe(3);
  });

  it('sends a joining seat everything since the snapshot, then live turns without gaps', async () => {
    const slow = new SlowStorage();
    valley = await initValley(slow, { valleyId: 'valley-2', seed: 's', settings: SETTINGS, now: 0 });
    const r = await makeRoom(slow);
    const a = await join(0, r);
    steps(3, r);
    r.message(a, { k: 'cmd', seq: 1, cmd: { t: 'note.pin', x: 1, z: 1, text: 'hi' } });
    steps(2, r);
    slow.delay = 30;
    const b = new FakeConn();
    r.open(b);
    r.message(b, {
      k: 'hello',
      valleyId: 'valley-2',
      seat: 1,
      token: valley.tokens[1]!,
      simVersion: 'v-test',
    });
    // Turns keep flowing while the welcome waits on slow storage.
    for (let i = 0; i < 4; i++) {
      await new Promise((res) => setTimeout(res, 10));
      steps(1, r);
    }
    await vi.waitFor(() => expect(b.of('welcome')).toHaveLength(1));
    const welcome = b.of('welcome')[0]!;
    const covered = welcome.log.map((t) => t.t);
    expect(covered).toEqual([1, 4]);
    const live = b.turns().map((t) => t.t);
    steps(2, r);
    const all = b.turns().map((t) => t.t);
    expect(all[0]).toBe(welcome.nextTurn);
    expect(all).toEqual(Array.from({ length: all.length }, (_, i) => welcome.nextTurn + i));
    expect(all.length).toBeGreaterThan(live.length);
  });

  it('resumes turn numbers after a restart', async () => {
    const a = await join(0);
    steps(60);
    room.close(a);
    steps(1);
    await room.flush();
    const again = await makeRoom();
    const b = await join(0, again);
    expect(b.of('welcome')[0]!.nextTurn).toBe(62);
  });
});

describe('snapshots', () => {
  it('asks the longest-connected seat every 300 turns, stores the reply and prunes the log', async () => {
    const a = await join(0);
    now += 1000;
    const b = await join(1);
    room.message(a, { k: 'cmd', seq: 1, cmd: { t: 'note.pin', x: 1, z: 1, text: 'early' } });
    steps(SNAPSHOT_EVERY_TURNS);
    expect(a.of('needSnapshot')).toEqual([{ k: 'needSnapshot', reason: 'periodic' }]);
    expect(b.of('needSnapshot')).toEqual([]);
    room.message(a, { k: 'snapshot', t: 250, simVersion: 'v-test', data: 'SNAP' });
    await room.flush();
    const snap = (await storage.latestSnapshot()) as StoredSnapshot;
    expect(snap).toMatchObject({ t: 250, simVersion: 'v-test', data: 'SNAP' });
    expect((await storage.turnsAfter(0)).every((t) => t.t > 250)).toBe(true);

    const c = await join(1);
    const welcome = c.of('welcome')[0]!;
    expect(welcome.snapshot).toEqual({ t: 250, simVersion: 'v-test', data: 'SNAP' });
    expect(welcome.log.every((t) => t.t > 250)).toBe(true);
  });

  it('ignores stale snapshots, future turns and other versions', async () => {
    const a = await join(0);
    steps(20);
    room.message(a, { k: 'snapshot', t: 10, simVersion: 'v-test', data: 'A' });
    room.message(a, { k: 'snapshot', t: 5, simVersion: 'v-test', data: 'B' });
    room.message(a, { k: 'snapshot', t: 999, simVersion: 'v-test', data: 'C' });
    room.message(a, { k: 'snapshot', t: 15, simVersion: 'v-other', data: 'D' });
    await room.flush();
    expect((await storage.latestSnapshot())!.data).toBe('A');
  });
});

describe('presence, hashes and limits', () => {
  it('relays presence to the other seat only, at most 12 per second', async () => {
    const a = await join(0);
    const b = await join(1);
    for (let i = 0; i < 15; i++)
      room.message(a, { k: 'presence', cursor: [i + 0.5, i + 0.25], tool: 'path' });
    expect(b.of('presence')).toHaveLength(12);
    expect(b.of('presence')[0]).toEqual({ k: 'presence', seat: 0, cursor: [0.5, 0.25], tool: 'path' });
    expect(a.of('presence')).toHaveLength(0);
    now += 1000;
    room.message(a, { k: 'presence', cursor: [9, 9] });
    expect(b.of('presence')).toHaveLength(13);
  });

  it('rate-limits pings and emotes to 2 per second', async () => {
    const a = await join(0);
    const b = await join(1);
    for (let i = 0; i < 3; i++) room.message(a, { k: 'ping', x: 1, z: 2, kind: 'look' });
    room.message(a, { k: 'emote', id: 'wave' });
    expect(b.of('ping')).toHaveLength(2);
    expect(b.of('emote')).toHaveLength(0);
  });

  it('logs a warning when two seats report different hashes for the same turn', async () => {
    const a = await join(0);
    const b = await join(1);
    room.message(a, { k: 'hash', t: 50, h: 'aaaa' });
    room.message(b, { k: 'hash', t: 50, h: 'aaaa' });
    expect(room.desyncs).toBe(0);
    room.message(a, { k: 'hash', t: 100, h: 'aaaa' });
    room.message(b, { k: 'hash', t: 100, h: 'bbbb' });
    expect(room.desyncs).toBe(1);
    expect(logs.some((l) => l.includes('Desync at turn 100'))).toBe(true);
  });

  it('resyncs a desynced seat from the longest-connected seat, without losing live turns', async () => {
    const a = await join(0);
    now += 10;
    const b = await join(1);
    steps(5);
    room.message(a, { k: 'hash', t: 5, h: 'aaaa' });
    room.message(b, { k: 'hash', t: 5, h: 'bbbb' });
    expect(a.of('needSnapshot').map((m) => m.reason)).toEqual(['desync']);
    expect(b.of('needSnapshot')).toEqual([]);
    // A second mismatch while waiting does not ask again.
    room.message(b, { k: 'hash', t: 5, h: 'cccc' });
    expect(a.of('needSnapshot').length).toBe(1);
    room.message(a, { k: 'snapshot', t: 5, simVersion: 'v-test', data: 'U05BUA==' });
    steps(2);
    await room.flush();
    await vi.waitFor(() => expect(b.of('resync').length).toBe(1));
    const r = b.of('resync')[0]!;
    expect(r.snapshot).toEqual({ t: 5, simVersion: 'v-test', data: 'U05BUA==' });
    expect(r.nextTurn).toBe(6);
    expect(a.of('resync')).toEqual([]);
    // Turns emitted while the resync was prepared follow it, with no gaps.
    steps(1);
    expect(b.turns().map((t) => t.t)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect((await storage.latestSnapshot())?.t).toBe(5);
  });

  it('caps commands at 30 per second per seat', async () => {
    const a = await join(0);
    for (let i = 0; i < 32; i++) room.message(a, { k: 'cmd', seq: i, cmd: { t: 'time.setSpeed', speed: 1 } });
    expect(a.of('error').map((e) => e.code)).toEqual(['RATE_LIMIT', 'RATE_LIMIT']);
    steps(1);
    expect(a.turns()[0]!.cmds).toHaveLength(31); // seatJoined plus 30 commands
  });

  it('drops oversized messages with an error', async () => {
    const a = await join(0);
    const text = 'x'.repeat(MAX_CMD_BYTES);
    room.receive(a, JSON.stringify({ k: 'cmd', seq: 1, cmd: { t: 'note.pin', x: 1, z: 1, text } }));
    room.receive(a, JSON.stringify({ k: 'presence', tool: 'y'.repeat(300) }));
    expect(a.of('error').map((e) => e.code)).toEqual(['TOO_LARGE', 'TOO_LARGE']);
    room.receive(a, 'not json');
    steps(1);
    expect(a.turns()[0]!.cmds).toHaveLength(1);
  });

  it('keeps the roster current', async () => {
    const a = await join(0);
    expect(a.of('welcome')[0]!.roster).toEqual([
      { seat: 0, connected: true },
      { seat: 1, connected: false },
    ]);
    const b = await join(1);
    expect(a.of('roster').at(-1)!.roster).toEqual([
      { seat: 0, connected: true },
      { seat: 1, connected: true },
    ]);
    room.close(b);
    expect(a.of('roster').at(-1)!.roster[1]).toEqual({ seat: 1, connected: false });
  });
});
