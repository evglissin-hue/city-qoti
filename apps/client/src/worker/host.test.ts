// @vitest-environment happy-dom
import type { ViewSnapshot } from '@qoti/sim';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Session } from '../app/session';
import type { ToWorker } from './messages';
import { SimHost } from './host';

/** A stand-in sim worker: records what it is sent; the test answers for it. */
class FakeWorker {
  static last: FakeWorker | null = null;
  readonly sent: ToWorker[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(msg: ToWorker): void {
    this.sent.push(msg);
  }
  terminate(): void {}
  reply(data: unknown): void {
    this.onmessage?.({ data });
  }
}

const view = (lastTurn: number) => ({ lastTurn }) as unknown as ViewSnapshot;
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => vi.stubGlobal('Worker', FakeWorker));
afterEach(() => vi.unstubAllGlobals());

describe('SimHost', () => {
  it('answers two inits out at once in order, each with its own view (V2.0)', async () => {
    const host = new SimHost();
    const w = FakeWorker.last!;
    const a = host.init({ kind: 'new', seed: 'a', settings: {} as never });
    const b = host.init({ kind: 'new', seed: 'b', settings: {} as never });
    w.reply({ k: 'ready', view: view(1) });
    w.reply({ k: 'ready', view: view(2) });
    expect((await a).lastTurn).toBe(1);
    expect((await b).lastTurn).toBe(2);
  });

  it('fails every init that is waiting when the worker stops', async () => {
    const host = new SimHost();
    const a = host.init({ kind: 'new', seed: 'a', settings: {} as never });
    const b = host.init({ kind: 'new', seed: 'b', settings: {} as never });
    FakeWorker.last!.reply({ k: 'error', message: 'boom' });
    await expect(a).rejects.toThrow('boom');
    await expect(b).rejects.toThrow('boom');
  });
});

describe('Session.reloadMirror (V2.0, Measure this laptop)', () => {
  const snapshotsAsked = (w: FakeWorker) => w.sent.filter((m) => m.k === 'snapshot') as { reqId: number }[];

  it('starts the worker over from its own snapshot, then plays the held turns live', async () => {
    const s = new Session({ valleyId: 'v', seat: 0, token: 't', mode: 'solo' });
    const w = FakeWorker.last!;
    const load = vi.spyOn(s.mirror, 'load').mockImplementation(() => {});
    s.holdTurns();
    (s as unknown as { heldTurns: { t: number; cmds: [] }[] }).heldTurns.push({ t: 7, cmds: [] });
    // While held, nothing the Mirror shows may reach the sim.
    expect(s.submit({ t: 'time.setSpeed', speed: 0 })).toBe(-1);
    const done = s.reloadMirror();
    await tick();
    w.reply({ k: 'snapshot', reqId: snapshotsAsked(w)[0]!.reqId, t: 6, data: new Uint8Array(4) });
    await tick();
    expect(w.sent.map((m) => m.k)).toEqual(['snapshot', 'init', 'turns']);
    expect((w.sent[2] as { turns: { t: number }[] }).turns.map((t) => t.t)).toEqual([7]);
    w.reply({ k: 'ready', view: view(6) });
    await done;
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('snapshots again when a welcome or resync started the worker over meanwhile', async () => {
    const s = new Session({ valleyId: 'v', seat: 0, token: 't', mode: 'solo' });
    const w = FakeWorker.last!;
    vi.spyOn(s.mirror, 'load').mockImplementation(() => {});
    s.holdTurns();
    const done = s.reloadMirror();
    await tick();
    // A reconnect's welcome re-inits the worker while the first snapshot is on its way.
    (s as unknown as { simEpoch: number }).simEpoch++;
    w.reply({ k: 'snapshot', reqId: snapshotsAsked(w)[0]!.reqId, t: 3, data: new Uint8Array(4) });
    await tick();
    expect(snapshotsAsked(w)).toHaveLength(2);
    expect(w.sent.some((m) => m.k === 'init')).toBe(false);
    w.reply({ k: 'snapshot', reqId: snapshotsAsked(w)[1]!.reqId, t: 9, data: new Uint8Array(4) });
    await tick();
    w.reply({ k: 'ready', view: view(9) });
    await done;
    expect(w.sent.map((m) => m.k)).toEqual(['snapshot', 'snapshot', 'init']);
  });
});
