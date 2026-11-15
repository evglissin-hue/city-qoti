// V3.0: the endpaper map's interface (render/endpaper.ts) and its stub layer.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { content } from '@qoti/content';
import type { Mirror, MirrorChange } from '../state/mirror';
import {
  createEndpaperMap,
  ENDPAPER_DEBOUNCE_MS,
  ENDPAPER_FULL,
  ENDPAPER_NEAR,
  ENDPAPER_ON,
  endpaperCover,
  endpaperInput,
  EndpaperWriter,
  type EndpaperReply,
  type EndpaperRequest,
  type EndpaperWorkerLike,
} from './endpaper';
import type { WorldEnv } from './env';
import { endpaperLayer, townChanged } from './layers/endpaper';
import type { LayerContext } from './layers/types';
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
  } as unknown as Mirror;
}

function change(over: Partial<MirrorChange> = {}): MirrorChange {
  return { rects: new Map(), full: false, buildings: false, village: false, ...over } as MirrorChange;
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
    const input = () => {
      inputs++;
      return endpaperInput(fakeMirror());
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

describe('the endpaper layer stub (V3.0)', () => {
  function envAt(distance: number): WorldEnv {
    const camera = new PerspectiveCamera();
    camera.position.set(0, distance, 0);
    return {
      camera,
      focus: new Vector3(),
      endpaper: createEndpaperMap(),
      skipScene: false,
    } as unknown as WorldEnv;
  }

  it('is off in V3.0, so cover stays 0 and the scene is always drawn', () => {
    expect(ENDPAPER_ON).toBe(false);
    const worker = new FakeWorker();
    let made = 0;
    const layer = endpaperLayer({
      makeWorker: () => {
        made++;
        return worker;
      },
      now: () => 100000,
    });
    const env = envAt(300);
    layer.init({ env, mirror: fakeMirror() } as unknown as LayerContext);
    layer.update(change({ buildings: true }));
    expect(layer.frame!(0.016)).toBe(false);
    expect(env.endpaper.cover).toBe(0);
    expect(env.skipScene).toBe(false);
    expect(made).toBe(0);
    expect(layer.shadowless).toBe(true);
  });

  it('when on, follows the distance, skips the scene at full cover and fires on a drawing', () => {
    const worker = new FakeWorker();
    let t = 0;
    const layer = endpaperLayer({ makeWorker: () => worker, now: () => t, on: true });
    const env = envAt(250);
    layer.init({ env, mirror: fakeMirror() } as unknown as LayerContext);
    expect(layer.frame!(0.016)).toBe(false);
    expect(env.endpaper.cover).toBe(1);
    // No map drawn yet: the scene is still drawn.
    expect(env.skipScene).toBe(false);
    expect(worker.requests).toHaveLength(1);
    worker.finish();
    expect(layer.frame!(0.016)).toBe(true);
    expect(env.skipScene).toBe(true);
    // A town change waits out the debounce.
    t = 1000;
    layer.update(change({ buildings: true }));
    t = 1000 + ENDPAPER_DEBOUNCE_MS - 1;
    layer.frame!(0.016);
    expect(worker.requests).toHaveLength(0);
    t = 1000 + ENDPAPER_DEBOUNCE_MS;
    layer.frame!(0.016);
    expect(worker.requests).toHaveLength(1);
    env.camera.position.set(0, 210, 0);
    layer.frame!(0.016);
    expect(env.endpaper.cover).toBeCloseTo(0.25, 9);
    expect(env.skipScene).toBe(false);
  });

  it('redraws on town changes only', () => {
    expect(townChanged(change({ buildings: true }))).toBe(true);
    expect(townChanged(change({ village: true }))).toBe(true);
    expect(townChanged(change({ rects: new Map([['road', []]]) }))).toBe(true);
    expect(townChanged(change())).toBe(false);
    expect(townChanged(change({ rects: new Map([['charm', []]]) }))).toBe(false);
  });
});
