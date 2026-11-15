// V3.0: the endpaper map's layer, a stub (render/endpaper.ts). It keeps the map's writer told of
// town changes, sets `env.endpaper.cover` from the camera's distance and `env.skipScene` when the
// map covers the view, and returns true from `frame()` when a finished drawing lands (a static-layer
// event). V3.0 draws nothing and `cover` stays 0 (`ENDPAPER_ON` is off), so the worker never starts
// and the picture is unchanged; V3D adds the quad that shows the map and turns it on.
import type { MirrorChange } from '../../state/mirror';
import {
  ENDPAPER_ON,
  EndpaperWriter,
  endpaperCover,
  endpaperInput,
  type EndpaperWorkerLike,
} from '../endpaper';
import type { WorldEnv } from '../env';
import type { LayerContext, RenderLayer } from './types';

/** Mirror changes that redraw the map: anything about the town's shape, never folk or the clock. */
export function townChanged(c: MirrorChange): boolean {
  if (c.full || c.buildings || c.village) return true;
  for (const name of ['height', 'water', 'road', 'tree', 'fieldOwner', 'lot'] as const)
    if (c.rects.has(name)) return true;
  return false;
}

/** The camera's distance from the ground point it looks at, in tiles. */
export function cameraDistance(env: WorldEnv): number {
  return env.camera.position.distanceTo(env.focus);
}

export interface EndpaperLayerOptions {
  /** A fake worker for tests (the real one is made on the first drawing). */
  makeWorker?: () => EndpaperWorkerLike;
  /** The clock in ms (tests); `performance.now` by default. */
  now?: () => number;
  /** Turn the map on regardless of `ENDPAPER_ON` (tests, and V3D while it builds). */
  on?: boolean;
}

export function endpaperLayer(opts: EndpaperLayerOptions = {}): RenderLayer {
  let ctx: LayerContext | null = null;
  let writer: EndpaperWriter | null = null;
  const now = opts.now ?? (() => performance.now());
  const on = opts.on ?? ENDPAPER_ON;
  return {
    id: 'endpaper',
    motion: 'static',
    shadowless: true,
    init(c) {
      ctx = c;
      if (c.env) writer = new EndpaperWriter(c.env.endpaper, opts.makeWorker);
    },
    update(change) {
      if (writer && townChanged(change)) writer.townChanged(now());
    },
    frame() {
      const env = ctx?.env;
      if (!ctx || !env || !writer) return false;
      const cover = on ? endpaperCover(cameraDistance(env)) : 0;
      env.endpaper.cover = cover;
      env.skipScene = cover >= 1;
      const mirror = ctx.mirror;
      return writer.tick(now(), cover, () => endpaperInput(mirror));
    },
    dispose() {
      writer?.dispose();
      writer = null;
      ctx = null;
    },
  };
}
