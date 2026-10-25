import type { ValleySettings } from '@qoti/sim';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { S2C } from '../src/messages';
import { RoomCore } from '../src/room';
import { MemoryStorage, retainSnapshots, type StoredSnapshot } from '../src/storage';
import { initValley, type NewValley } from '../src/valley';

const SETTINGS: ValleySettings = {
  mode: 'sandbox',
  economy: 'gentle',
  threat: 'peaceful',
  togetherOnly: false,
  townName: 'Qoti',
  valleyName: 'Riverbend',
};

class FakeConn {
  sent: S2C[] = [];
  send(msg: S2C): void {
    this.sent.push(structuredClone(msg));
  }
  close(): void {}
  of<K extends S2C['k']>(k: K): Extract<S2C, { k: K }>[] {
    return this.sent.filter((m): m is Extract<S2C, { k: K }> => m.k === k);
  }
}

const snap = (t: number, label: string | null = null): StoredSnapshot => ({
  t,
  simVersion: 'v-test',
  label,
  created: t,
  data: 'U05BUA==',
});

describe('retainSnapshots', () => {
  it('keeps the latest 20', () => {
    const kept = retainSnapshots(Array.from({ length: 25 }, (_, i) => snap(i + 1)));
    expect(kept.map((s) => s.t)).toEqual(Array.from({ length: 20 }, (_, i) => i + 6));
  });

  it('keeps the newest snapshot of each season past the latest 20, and only that one named', () => {
    const list = [snap(1, 'Year 1, Spring'), snap(2, 'Year 1, Spring'), snap(3, 'Year 1, Summer')];
    for (let t = 4; t <= 30; t++) list.push(snap(t, 'Year 1, Fall'));
    const kept = retainSnapshots(list);
    expect(kept.filter((s) => s.label).map((s) => [s.t, s.label])).toEqual([
      [2, 'Year 1, Spring'],
      [3, 'Year 1, Summer'],
      [30, 'Year 1, Fall'],
    ]);
    expect(kept.length).toBe(22);
    expect(kept.some((s) => s.t === 1)).toBe(false);
  });
});

describe('RoomCore snapshot policy', () => {
  let now = 0;
  let storage: MemoryStorage;
  let valley: NewValley;
  let room: RoomCore;

  async function join(seat: 0 | 1): Promise<FakeConn> {
    const conn = new FakeConn();
    room.open(conn);
    room.message(conn, {
      k: 'hello',
      valleyId: valley.valleyId,
      seat,
      token: valley.tokens[seat]!,
      simVersion: 'v-test',
    });
    await vi.waitFor(() => expect(conn.of('welcome').length).toBe(1));
    return conn;
  }

  function steps(n: number): void {
    for (let i = 0; i < n; i++) {
      now += 100;
      room.step();
    }
  }

  beforeEach(async () => {
    now = 0;
    storage = new MemoryStorage();
    valley = await initValley(storage, { valleyId: 'valley-1', seed: 'seed-1', settings: SETTINGS, now: 0 });
    room = new RoomCore(storage, { turnMs: 100, now: () => now, log: () => {} });
    await room.ready();
  });

  it('asks the longest-connected seat for a snapshot when someone pauses', async () => {
    const a = await join(0);
    now += 10;
    const b = await join(1);
    steps(3);
    room.message(b, { k: 'cmd', seq: 1, cmd: { t: 'time.setSpeed', speed: 0 } });
    steps(1);
    expect(a.of('needSnapshot').map((m) => m.reason)).toEqual(['periodic']);
    expect(b.of('needSnapshot')).toEqual([]);
    // Speeding up is not a resting point.
    room.message(b, { k: 'cmd', seq: 2, cmd: { t: 'time.setSpeed', speed: 2 } });
    steps(1);
    expect(a.of('needSnapshot').length).toBe(1);
  });

  it('stores the season label as a named backup that outlives the latest 20', async () => {
    const a = await join(0);
    steps(1);
    room.message(a, { k: 'snapshot', t: 1, simVersion: 'v-test', data: 'U05BUA==', label: 'Year 1, Spring' });
    for (let t = 2; t <= 25; t++) {
      steps(1);
      room.message(a, { k: 'snapshot', t, simVersion: 'v-test', data: 'U05BUA==', label: 'Year 1, Summer' });
    }
    await room.flush();
    const kept = storage.dump().snapshots;
    expect(kept.find((s) => s.t === 1)?.label).toBe('Year 1, Spring');
    expect(kept.filter((s) => s.label === 'Year 1, Summer').map((s) => s.t)).toEqual([25]);
    expect(kept.length).toBe(21);
    expect((await storage.latestSnapshot())?.t).toBe(25);
  });
});
