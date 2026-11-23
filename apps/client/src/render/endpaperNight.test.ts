import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import type { Mirror } from '../state/mirror';
import {
  createEndpaperMap,
  ENDPAPER_GLSL,
  endpaperInput,
  endpaperSignature,
  EndpaperWriter,
  LAMP_TINT,
  mapLamps,
  NIGHT_PAPER,
  type EndpaperReply,
  type EndpaperRequest,
  type EndpaperWorkerLike,
} from './endpaper';
import type { WorldEnv } from './env';
import { endpaperLayer } from './layers/endpaper';
import type { LayerContext } from './layers/types';
import { content } from '@qoti/content';
import { TILE_FP } from '@qoti/sim';

class FakeWorker implements EndpaperWorkerLike {
  onmessage: ((e: { data: EndpaperReply }) => void) | null = null;
  requests: EndpaperRequest[] = [];
  postMessage(msg: EndpaperRequest): void {
    this.requests.push(msg);
  }
  terminate(): void {}
  finish(reply: Partial<EndpaperReply>): void {
    const r = this.requests.shift()!;
    this.onmessage?.({ data: { type: 'drawn', id: r.id, bitmap: null, ms: 40, ...reply } });
  }
}

const bitmap = (): ImageBitmap => ({ width: 8, height: 8, close() {} }) as unknown as ImageBitmap;

const N = 8;
/** A lamp post's decor def, from content (any decor whose art kit is the lamp post). */
const lampDef = content.decor.find((d) => d.art.kit === 'lamp-post' || d.id.includes('lamp'))?.id ?? '';

function mirror(withLamp: boolean): Mirror {
  const layer = () => new Uint8Array(N * N);
  return {
    size: N,
    layers: {
      height: layer(),
      water: layer(),
      tree: layer(),
      fieldOwner: layer(),
      road: layer(),
      terrain: layer(),
    },
    buildings: new Map([
      [1, { id: 1, def: 'cottage', x: 2, z: 3, rot: 0, stage: 'built' }],
      [2, { id: 2, def: 'cottage', x: 5, z: 3, rot: 0, stage: 'construction' }],
    ]),
    decor: new Map(
      withLamp
        ? [[9, { id: 9, def: lampDef, fx: 6 * TILE_FP + TILE_FP / 2, fz: 1 * TILE_FP, rot: 0, builtBy: 0 }]]
        : [],
    ),
    settings: { value: { valleyName: 'Hollowmere' } },
    lots: new Map(),
    streets: new Map(),
    footfall: { value: null },
    meta: { flow: 'ns' },
    occupant: () => 0,
    road: () => 0,
    height: () => 0,
  } as unknown as Mirror;
}

describe('V4B: the endpaper at night', () => {
  it('lights the town from shared state: lamps where they stand, a warmth at each built home', () => {
    expect(lampDef).not.toBe('');
    const dark = mapLamps(mirror(false));
    // The built cottage glows faintly at its middle; the one under construction does not.
    expect(dark.length).toBe(3);
    expect(dark[2]).toBeGreaterThan(0);
    expect(dark[2]).toBeLessThan(0.5);
    const lit = mapLamps(mirror(true));
    expect(lit.length).toBe(6);
    expect(lit[0]).toBeCloseTo(6.5, 3);
    expect(lit[1]).toBeCloseTo(1, 3);
    expect(lit[2]).toBeGreaterThanOrEqual(0.6);
  });

  it('sends the lamps to the worker and redraws when one is added', () => {
    const a = endpaperInput(mirror(false));
    const b = endpaperInput(mirror(true));
    expect(b.lamps).toBeInstanceOf(Float32Array);
    expect(endpaperSignature(a)).not.toBe(endpaperSignature(b));
  });

  it('puts the night layer in its own texture, beside the map', () => {
    const map = createEndpaperMap(512);
    const worker = new FakeWorker();
    const writer = new EndpaperWriter(map, () => worker, 0);
    const blank = map.uniforms.tEndpaperNight.value;
    writer.tick(0, 1, () => endpaperInput(mirror(true)));
    worker.finish({ bitmap: bitmap(), night: bitmap(), ms: 60, nightMs: 4 });
    expect(map.night).not.toBe(blank);
    expect(map.uniforms.tEndpaperNight.value).toBe(map.night);
    expect(map.night!.flipY).toBe(false);
    expect(writer.nightMs).toBe(4);
    expect(writer.lastMs).toBe(60);
  });

  it('blends day to night in the final pass by the hour: the hour never redraws the map', () => {
    const worker = new FakeWorker();
    const layer = endpaperLayer({ makeWorker: () => worker, now: () => 0, on: true });
    const camera = new PerspectiveCamera(30, 1.6, 1, 4000);
    camera.position.set(0, 300, 0.001);
    camera.lookAt(0, 0, 0);
    const env = {
      camera,
      focus: new Vector3(),
      endpaper: createEndpaperMap(),
      skipScene: false,
      night: { value: 0 },
    } as unknown as WorldEnv;
    layer.init({ env, mirror: mirror(true) } as unknown as LayerContext);
    layer.frame!(0.016);
    worker.finish({ bitmap: bitmap(), night: bitmap() });
    layer.frame!(0.016);
    const asked = worker.requests.length;
    expect(layer.frame!(0.016)).toBe(false);
    env.night.value = 1;
    // The frame redraws (the final pass's uniform moved), the map is not asked again.
    expect(layer.frame!(0.016)).toBe(true);
    expect(env.endpaper.uniforms.uEndpaperNight.value).toBe(1);
    expect(worker.requests.length).toBe(asked);
    expect(layer.frame!(0.016)).toBe(false);
  });

  it('deepens the parchment a little and tints the lamplight warm, never a dark filter', () => {
    for (const k of NIGHT_PAPER) {
      expect(k).toBeGreaterThan(0.75);
      expect(k).toBeLessThan(1);
    }
    expect(LAMP_TINT[0]).toBeGreaterThan(LAMP_TINT[2]);
    expect(ENDPAPER_GLSL).toContain('uEndpaperNight');
    expect(ENDPAPER_GLSL).toContain('tEndpaperNight');
  });
});
