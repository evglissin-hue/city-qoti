// V3D: the endpaper map's writer, input, page camera and layer with the map on (render/endpaper.ts).
import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Vector3, Vector4 } from 'three';
import type { Mirror, MirrorChange } from '../state/mirror';
import {
  createEndpaperMap,
  ENDPAPER_DEBOUNCE_MS,
  ENDPAPER_LOOKAHEAD,
  ENDPAPER_NEAR,
  ENDPAPER_ON,
  ENDPAPER_PAGE_PITCH,
  rowsOfRooflines,
  endpaperCover,
  endpaperInput,
  EndpaperWriter,
  type EndpaperReply,
  type EndpaperRequest,
  type EndpaperWorkerLike,
} from './endpaper';
import type { WorldEnv } from './env';
import { endpaperLayer, pageCamera, townChanged } from './layers/endpaper';
import type { LayerContext } from './layers/types';

/** A fake worker: records requests; `finish()` answers the oldest one. It never draws anything. */
class FakeWorker implements EndpaperWorkerLike {
  onmessage: ((e: { data: EndpaperReply }) => void) | null = null;
  requests: EndpaperRequest[] = [];
  postMessage(msg: EndpaperRequest): void {
    this.requests.push(msg);
  }
  terminate(): void {}
  finish(ms = 40, bitmap: ImageBitmap | null = null): void {
    const r = this.requests.shift()!;
    this.onmessage?.({ data: { type: 'drawn', id: r.id, bitmap, ms } });
  }
}

/** An ImageBitmap-like object: three needs a width, a height, and something to close. */
function fakeBitmap(size = 16): ImageBitmap & { closed: boolean } {
  const b = {
    width: size,
    height: size,
    closed: false,
    close() {
      b.closed = true;
    },
  };
  return b as unknown as ImageBitmap & { closed: boolean };
}

const N = 8;
function fakeMirror(): Mirror {
  const layer = (v = 0) => new Uint8Array(N * N).fill(v);
  return {
    size: N,
    layers: {
      height: layer(2),
      water: layer(),
      tree: layer(),
      fieldOwner: layer(),
      road: layer(),
      terrain: layer(),
    },
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

describe('the endpaper writer (V3D)', () => {
  function setup(size = 1024) {
    const map = createEndpaperMap(size);
    const worker = new FakeWorker();
    const writer = new EndpaperWriter(map, () => worker);
    const input = () => endpaperInput(fakeMirror());
    return { map, worker, writer, input };
  }

  it('swaps in a new texture (flipY off, no color space) and disposes the old one', () => {
    const t = setup();
    const first = t.map.texture;
    let disposed = 0;
    first.addEventListener('dispose', () => disposed++);
    t.writer.tick(0, 1, t.input);
    const b1 = fakeBitmap();
    t.worker.finish(30, b1);
    expect(t.map.ready).toBe(true);
    expect(t.map.texture).not.toBe(first);
    expect(t.map.texture.flipY).toBe(false);
    expect(t.map.texture.colorSpace).toBe('');
    expect(t.map.texture.anisotropy).toBe(8);
    expect(t.map.uniforms.tEndpaper.value).toBe(t.map.texture);
    expect(t.map.ms).toBe(30);
    expect(disposed).toBe(1);
    // A second drawing replaces the first and closes its bitmap.
    t.writer.townChanged(0);
    t.writer.tick(5000, 1, t.input);
    const second = t.map.texture;
    second.addEventListener('dispose', () => disposed++);
    t.worker.finish(20, fakeBitmap());
    expect(t.map.texture).not.toBe(second);
    expect(disposed).toBe(2);
    expect(b1.closed).toBe(true);
  });

  it('leaves ready false when the worker replies with no bitmap', () => {
    const t = setup();
    t.writer.tick(0, 1, t.input);
    t.worker.finish(5, null);
    expect(t.map.ready).toBe(false);
    expect(t.map.revision).toBe(1);
  });

  it('redraws when the size changes (a preset change), without waiting for the debounce', () => {
    const t = setup(2048);
    t.writer.tick(0, 1, t.input);
    t.worker.finish();
    t.map.size = 1024;
    t.writer.tick(1, 1, t.input);
    expect(t.worker.requests).toHaveLength(1);
    expect(t.worker.requests[0]!.size).toBe(1024);
  });

  it('is asked for before the fade starts, using the lookahead', () => {
    const t = setup();
    const d = ENDPAPER_NEAR - ENDPAPER_LOOKAHEAD + 1;
    expect(endpaperCover(d)).toBe(0);
    t.writer.tick(0, endpaperCover(d + ENDPAPER_LOOKAHEAD), t.input);
    expect(t.worker.requests).toHaveLength(1);
  });

  it('at rest with the town unchanged asks for nothing more', () => {
    const t = setup();
    t.writer.tick(0, 1, t.input);
    t.worker.finish(10, fakeBitmap());
    const asked = t.writer.asked;
    for (let now = 100; now < 60000; now += 16) t.writer.tick(now, 1, t.input);
    expect(t.writer.asked).toBe(asked);
  });

  it('only ever posts drawings to the worker', () => {
    const t = setup();
    t.writer.tick(0, 1, t.input);
    expect(t.worker.requests).toHaveLength(1);
    expect(t.worker.requests[0]!.type).toBe('draw');
    expect(t.worker.requests[0]!.input.tiles).toBe(N);
  });
});

describe('the endpaper input (V3D)', () => {
  it('is byte-identical whatever one seat has: lens, cursor, notes, seats', () => {
    const a = fakeMirror();
    const b = fakeMirror() as unknown as Record<string, unknown>;
    b.seats = { value: [{ seat: 0, lens: 'flows', cursor: [3, 4], connected: true }] };
    b.notes = new Map([[1, { id: 1, x: 1, z: 1, text: 'private' }]]);
    b.lens = 'footfall';
    b.cursor = { x: 5, z: 5 };
    const json = (m: Mirror) =>
      JSON.stringify(endpaperInput(m), (_k, v: unknown) =>
        ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<number>) : v,
      );
    expect(json(b as unknown as Mirror)).toBe(json(a));
  });
});

describe('the endpaper feeds (V3D, for V3B and V3C)', () => {
  it("takes V3C's river and V3B's rows from the feeds, and leaves them absent when unset", () => {
    const plain = endpaperInput(fakeMirror());
    expect(plain.river).toBeUndefined();
    expect(plain.rows).toBeUndefined();
    const river = { points: new Float32Array([0, 0, 10, 10]), widths: new Float32Array([3, 3]) };
    const rows = [
      [
        { x: 1, z: 1, w: 2, d: 2, rot: 0 },
        { x: 3, z: 1, w: 2, d: 2, rot: 0 },
      ],
    ];
    const fed = endpaperInput(fakeMirror(), {}, { river: () => river, rows: () => rows });
    expect(fed.river).toBe(river);
    expect(fed.rows).toBe(rows);
  });

  it("groups V3B's rooflines into rows by row id, leaving lone lots out", () => {
    const rows = rowsOfRooflines([
      { row: 2, x: 1, z: 1, w: 2, d: 2, rot: 0, storeys: 2 },
      { row: 0, x: 9, z: 9, w: 2, d: 2, rot: 0, storeys: 1 },
      { row: 2, x: 3, z: 1, w: 2, d: 2, rot: 0, storeys: 1 },
      { row: 5, x: 1, z: 7, w: 2, d: 2, rot: 1, storeys: 1 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.map((r) => r.x)).toEqual([1, 3]);
    expect(rows[0]![0]!.storeys).toBe(2);
    expect(rows[1]).toHaveLength(1);
  });

  it('drops a river feed with no course and an empty rows feed', () => {
    const none = endpaperInput(
      fakeMirror(),
      {},
      {
        river: () => ({ points: new Float32Array([1, 1]), widths: new Float32Array([2]) }),
        rows: () => [],
      },
    );
    expect(none.river).toBeUndefined();
    expect(none.rows).toBeUndefined();
    expect(endpaperInput(fakeMirror(), {}, { river: () => null }).river).toBeUndefined();
  });
});

describe('the page camera (V3D)', () => {
  function cam(pitchDeg: number, dist = 100) {
    const camera = new PerspectiveCamera(30, 1.6, 1, 1000);
    const p = (pitchDeg * Math.PI) / 180;
    const focus = new Vector3(40, 3, 50);
    camera.position.set(
      focus.x + Math.cos(p) * dist * 0.6,
      focus.y + Math.sin(p) * dist,
      focus.z + Math.cos(p) * dist * 0.8,
    );
    camera.lookAt(focus);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    return { camera, focus };
  }
  /** Where the center ray meets y = ground. */
  function centerHit(inv: Matrix4, ground: number): Vector3 {
    const n = new Vector4(0, 0, -1, 1).applyMatrix4(inv);
    const f = new Vector4(0, 0, 1, 1).applyMatrix4(inv);
    const o = new Vector3(n.x / n.w, n.y / n.w, n.z / n.w);
    const d = new Vector3(f.x / f.w, f.y / f.w, f.z / f.w).sub(o);
    return o.addScaledVector(d, (ground - o.y) / d.y);
  }

  it('at cover 0 is the real camera: the screen center lands on the focus', () => {
    const { camera, focus } = cam(45);
    const inv = new Matrix4();
    pageCamera(camera, focus, 0, inv);
    expect(centerHit(inv, focus.y).distanceTo(focus)).toBeLessThan(1e-3);
  });

  it('at cover 1 the pitch is the page pitch (or the real one if higher) and the focus stays centered', () => {
    const { camera, focus } = cam(45);
    const inv = new Matrix4();
    expect(pageCamera(camera, focus, 1, inv)).toBeCloseTo(ENDPAPER_PAGE_PITCH, 6);
    expect(centerHit(inv, focus.y).distanceTo(focus)).toBeLessThan(1e-3);
    const steep = cam(80);
    expect(pageCamera(steep.camera, steep.focus, 1, inv)).toBeCloseTo((80 * Math.PI) / 180, 6);
  });
});

describe('the endpaper layer (V3D)', () => {
  function envAt(distance: number): WorldEnv {
    const camera = new PerspectiveCamera(30, 1.6, 1, 2000);
    camera.position.set(0, distance, 0.001);
    camera.lookAt(0, 0, 0);
    return {
      camera,
      focus: new Vector3(),
      endpaper: createEndpaperMap(),
      skipScene: false,
    } as unknown as WorldEnv;
  }
  function make(distance: number, bitmaps: boolean) {
    const worker = new FakeWorker();
    let t = 0;
    const layer = endpaperLayer({ makeWorker: () => worker, now: () => t, on: true });
    const env = envAt(distance);
    layer.init({ env, mirror: fakeMirror() } as unknown as LayerContext);
    const frame = () => {
      const r = layer.frame!(0.016);
      while (worker.requests.length) worker.finish(10, bitmaps ? fakeBitmap() : null);
      return r;
    };
    const at = (d: number) => env.camera.position.set(0, d, 0.001);
    return { layer, env, worker, frame, at, tick: (ms: number) => (t = ms) };
  }

  it('is on, and static and shadowless', () => {
    expect(ENDPAPER_ON).toBe(true);
    const l = endpaperLayer();
    expect(l.shadowless).toBe(true);
    expect(l.motion).toBe('static');
  });

  it('with a worker that never draws (Safari), keeps cover 0 and the scene drawn at any distance', () => {
    const t = make(300, false);
    for (const d of [100, 210, 239, 240, 300, 600]) {
      t.at(d);
      t.frame();
      t.frame();
      expect(t.env.endpaper.cover).toBe(0);
      expect(t.env.skipScene).toBe(false);
      expect(t.env.endpaper.ready).toBe(false);
    }
  });

  it('with a bitmap, follows the distance and skips the scene from 240', () => {
    const t = make(300, true);
    t.frame(); // asks and is answered
    t.frame(); // the drawing is in
    t.at(240);
    t.frame();
    expect(t.env.endpaper.cover).toBe(1);
    expect(t.env.endpaper.uniforms.uEndpaperSpan.value.y).toBe(N + 28);
    expect(t.env.skipScene).toBe(true);
    t.at(239);
    t.frame();
    expect(t.env.endpaper.cover).toBeCloseTo(0.975, 6);
    expect(t.env.skipScene).toBe(false);
    t.at(220);
    t.frame();
    expect(t.env.endpaper.cover).toBeCloseTo(0.5, 6);
    t.at(200);
    t.frame();
    expect(t.env.endpaper.cover).toBeCloseTo(0, 6);
    expect(t.env.endpaper.uniforms.uEndpaperCover.value).toBeCloseTo(0, 6);
  });

  it('asks for the first drawing before the fade starts; frame() is true when it lands and when cover moves', () => {
    const t = make(190, true);
    expect(t.layer.frame!(0.016)).toBe(false);
    expect(t.worker.requests).toHaveLength(1);
    t.worker.finish(10, fakeBitmap());
    expect(t.layer.frame!(0.016)).toBe(true);
    expect(t.env.endpaper.cover).toBe(0);
    t.at(210);
    expect(t.layer.frame!(0.016)).toBe(true);
    expect(t.layer.frame!(0.016)).toBe(false);
  });

  it('redraws when the valley is renamed', () => {
    const worker = new FakeWorker();
    let now = 0;
    const m = fakeMirror();
    const layer = endpaperLayer({ makeWorker: () => worker, now: () => now, on: true });
    const env = envAt(250);
    layer.init({ env, mirror: m } as unknown as LayerContext);
    layer.frame!(0.016);
    worker.finish(10, fakeBitmap());
    now = 100000;
    layer.frame!(0.016);
    expect(worker.requests).toHaveLength(0);
    (m.settings as unknown as { value: { valleyName: string } }).value = { valleyName: 'Elsewhere' };
    layer.update(change());
    now += ENDPAPER_DEBOUNCE_MS;
    layer.frame!(0.016);
    expect(worker.requests).toHaveLength(1);
  });

  it('redraws on town changes only', () => {
    expect(townChanged(change({ buildings: true }))).toBe(true);
    expect(townChanged(change({ rects: new Map([['terrain', []]]) }))).toBe(true);
    expect(townChanged(change())).toBe(false);
    expect(townChanged(change({ rects: new Map([['charm', []]]) }))).toBe(false);
  });
});
