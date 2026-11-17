// V3.0: the endpaper map's interface (render/endpaper.ts) and its stub layer.
import { describe, expect, it } from 'vitest';
import { content } from '@qoti/content';
import type { Mirror } from '../state/mirror';
import {
  createEndpaperMap,
  ENDPAPER_DEBOUNCE_MS,
  ENDPAPER_FULL,
  ENDPAPER_NEAR,
  endpaperCover,
  endpaperInput,
  EndpaperWriter,
  type EndpaperReply,
  type EndpaperRequest,
  type EndpaperWorkerLike,
} from './endpaper';
import { QUALITY_PRESETS } from './quality';

/** A fake worker: records requests; `finish()` answers the oldest one. */
class FakeWorker implements EndpaperWorkerLike {
  onmessage: ((e: { data: EndpaperReply }) => void) | null = null;
  requests: EndpaperRequest[] = [];
  terminated = false;
  postMessage(msg: EndpaperRequest): void {
    this.requests.push(msg);
  }
  terminate(): void {
    this.terminated = true;
  }
  finish(ms = 40): void {
    const r = this.requests.shift()!;
    this.onmessage?.({ data: { type: 'drawn', id: r.id, bitmap: null, ms } });
  }
}

const N = 8;
function fakeMirror(): Mirror {
  const layer = (v = 0) => new Uint8Array(N * N).fill(v);
  return {
    size: N,
    layers: { height: layer(2), water: layer(), tree: layer(), fieldOwner: layer(), road: layer() },
    buildings: new Map([
      [1, { id: 1, def: 'cottage', x: 2, z: 3, rot: 0, stage: 'built' }],
      [2, { id: 2, def: 'cottage', x: 5, z: 3, rot: 1, stage: 'construction' }],
    ]),
    settings: { value: { valleyName: 'Hollowmere' } },
    // V3X: the default feeds read the lots (V3B's rows) and the flow (V3C's river).
    lots: new Map(),
    meta: { flow: 'ns' },
    occupant: () => 0,
    road: () => 0,
    height: () => 2,
  } as unknown as Mirror;
}

describe('the endpaper cover (V3.0)', () => {
  it('is 0 to 200 tiles, rises evenly and is 1 from 240', () => {
    expect(endpaperCover(0)).toBe(0);
    expect(endpaperCover(ENDPAPER_NEAR)).toBe(0);
    expect(endpaperCover(220)).toBeCloseTo(0.5, 9);
    expect(endpaperCover(ENDPAPER_FULL)).toBe(1);
    expect(endpaperCover(400)).toBe(1);
    let last = -1;
    for (let d = 190; d <= 250; d += 2) {
      const c = endpaperCover(d);
      expect(c).toBeGreaterThanOrEqual(last);
      last = c;
    }
  });

  it('is sized by preset', () => {
    expect(QUALITY_PRESETS.low.endpaperSize).toBe(1024);
    for (const q of ['medium', 'high', 'ultra'] as const) expect(QUALITY_PRESETS[q].endpaperSize).toBe(2048);
  });
});

describe('the endpaper writer (V3.0)', () => {
  function setup() {
    const map = createEndpaperMap(1024);
    const worker = new FakeWorker();
    let made = 0;
    const writer = new EndpaperWriter(map, () => {
      made++;
      return worker;
    });
    let inputs = 0;
    // Each input differs (a new roof), as after a real change; V3D skips a drawing when nothing differs.
    const input = () => {
      inputs++;
      const inp = endpaperInput(fakeMirror());
      inp.roofs.push({ x: inputs, z: 1, w: 1, d: 1, rot: 0 });
      return inp;
    };
    return { map, worker, writer, input, made: () => made, inputs: () => inputs };
  }

  it('never draws, or starts the worker, while the map does not show', () => {
    const t = setup();
    t.writer.townChanged(0);
    for (let now = 0; now < 20000; now += 500) expect(t.writer.tick(now, 0, t.input)).toBe(false);
    expect(t.made()).toBe(0);
    expect(t.inputs()).toBe(0);
  });

  it('waits out the debounce after the last change, then draws once', () => {
    const t = setup();
    t.writer.townChanged(1000);
    t.writer.townChanged(1500); // a second change restarts the wait
    t.writer.tick(1500 + ENDPAPER_DEBOUNCE_MS - 1, 0.5, t.input);
    expect(t.worker.requests).toHaveLength(0);
    t.writer.tick(1500 + ENDPAPER_DEBOUNCE_MS, 0.5, t.input);
    expect(t.worker.requests).toHaveLength(1);
    expect(t.worker.requests[0]!.size).toBe(1024);
    expect(t.inputs()).toBe(1);
    // Nothing more is asked while it is quiet.
    t.writer.tick(10000, 1, t.input);
    expect(t.worker.requests).toHaveLength(1);
  });

  it('bumps the revision and fires the redraw event once a drawing lands', () => {
    const t = setup();
    t.writer.townChanged(0);
    expect(t.writer.tick(5000, 1, t.input)).toBe(false);
    expect(t.map.revision).toBe(0);
    t.worker.finish(42);
    expect(t.map.revision).toBe(1);
    expect(t.writer.lastMs).toBe(42);
    expect(t.writer.tick(5016, 1, t.input)).toBe(true);
    expect(t.writer.tick(5032, 1, t.input)).toBe(false);
  });

  it('keeps one drawing in flight and asks again for changes made during it', () => {
    const t = setup();
    t.writer.townChanged(0);
    t.writer.tick(3000, 1, t.input);
    t.writer.townChanged(3100);
    t.writer.tick(9000, 1, t.input);
    expect(t.worker.requests).toHaveLength(1);
    t.worker.finish();
    t.writer.tick(9016, 1, t.input);
    expect(t.worker.requests).toHaveLength(1);
    expect(t.writer.asked).toBe(2);
    t.worker.finish();
    expect(t.map.revision).toBe(2);
  });

  it('draws the first map when it first shows, with no change at all', () => {
    const t = setup();
    expect(t.writer.tick(0, 0.1, t.input)).toBe(false);
    expect(t.worker.requests).toHaveLength(1);
  });

  it('terminates its worker on dispose', () => {
    const t = setup();
    t.writer.tick(0, 1, t.input);
    t.writer.dispose();
    expect(t.worker.terminated).toBe(true);
  });
});

describe('the endpaper input (V3.0)', () => {
  it('copies shared map layers, roofs, plans and the valley name', () => {
    const inp = endpaperInput(fakeMirror());
    expect(inp.tiles).toBe(N);
    expect(inp.heights).toHaveLength(N * N);
    expect(inp.heights[0]).toBe(2);
    expect(inp.roofs).toHaveLength(1);
    // Roofs carry the def's footprint, turned by rot (the plan stands at rot 1).
    const [w, d] = content.buildingById.get('cottage')!.size;
    expect(inp.roofs[0]).toMatchObject({ x: 2, z: 3, w, d });
    expect(inp.plans[0]).toMatchObject({ w: d, d: w });
    expect(inp.plans).toHaveLength(1);
    expect(inp.labels[0]).toMatchObject({ text: 'Hollowmere', kind: 'valley' });
    expect(inp.inks).toEqual({});
    // Structured-cloneable: plain arrays and objects only.
    expect(structuredClone(inp)).toEqual(inp);
  });
});
