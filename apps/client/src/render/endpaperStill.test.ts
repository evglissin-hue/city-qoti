// R3G: the endpaper still for the printed storybook.
import { describe, expect, it } from 'vitest';
import type { Mirror } from '../state/mirror';
import { endpaperStill, type EndpaperReply, type EndpaperRequest, type EndpaperWorkerLike } from './endpaper';

class FakeWorker implements EndpaperWorkerLike {
  onmessage: ((e: { data: EndpaperReply }) => void) | null = null;
  requests: EndpaperRequest[] = [];
  terminated = false;
  constructor(private readonly replies: boolean) {}
  postMessage(msg: EndpaperRequest): void {
    this.requests.push(msg);
    if (this.replies) {
      queueMicrotask(() => this.onmessage?.({ data: { type: 'drawn', id: msg.id, bitmap: null, ms: 1 } }));
    }
  }
  terminate(): void {
    this.terminated = true;
  }
}

const N = 8;
function fakeMirror(): Mirror {
  const layer = (v = 0) => new Uint8Array(N * N).fill(v);
  return {
    size: N,
    layers: { height: layer(2), water: layer(), tree: layer(), fieldOwner: layer(), road: layer() },
    buildings: new Map([[1, { id: 1, def: 'cottage', x: 2, z: 3, rot: 0, stage: 'built' }]]),
    settings: { value: { valleyName: 'Hollowmere' } },
    lots: new Map(),
    streets: new Map(),
    footfall: { value: null },
    meta: { flow: 'ns' },
    occupant: () => 0,
    road: () => 0,
    height: () => 2,
  } as unknown as Mirror;
}

describe('endpaperStill (R3G)', () => {
  it('is null when the reply has no bitmap, and the worker is terminated', async () => {
    const w = new FakeWorker(true);
    expect(await endpaperStill(fakeMirror(), { makeWorker: () => w })).toBeNull();
    expect(w.terminated).toBe(true);
  });

  it('asks for the size given and no inks by default', async () => {
    const w = new FakeWorker(true);
    await endpaperStill(fakeMirror(), { size: 512, makeWorker: () => w });
    expect(w.requests).toHaveLength(1);
    expect(w.requests[0]!.size).toBe(512);
    expect(w.requests[0]!.id).toBe(1);
    expect(w.requests[0]!.input.inks).toEqual({});
  });

  it('defaults to 2048 and carries the inks when asked', async () => {
    const w = new FakeWorker(true);
    await endpaperStill(fakeMirror(), { inks: true, makeWorker: () => w });
    expect(w.requests[0]!.size).toBe(2048);
    expect(w.requests[0]!.input.inks).toBeDefined();
  });

  it('resolves null after the timeout when the worker never replies', async () => {
    const w = new FakeWorker(false);
    expect(await endpaperStill(fakeMirror(), { makeWorker: () => w, timeoutMs: 50 })).toBeNull();
    expect(w.terminated).toBe(true);
  });

  it('never throws when the worker cannot be made', async () => {
    const made = () => {
      throw new Error('no workers');
    };
    expect(await endpaperStill(fakeMirror(), { makeWorker: made })).toBeNull();
  });
});
