// V3D: the endpaper map's layer (render/endpaper.ts). It keeps the map's writer told of town
// changes, sets `env.endpaper.cover` from the camera's distance and `env.skipScene` when the map
// covers the view, feeds the final pass's overlay its uniforms (the page camera's inverse
// view-projection) and returns true from `frame()` when a finished drawing lands or the cover moves.
// The map shows in the final pass as an overlay (post.ts), not as a mesh: never graded, blurred or
// bloomed, and no extra draw.
//
// Safari decision: where the worker has no OffscreenCanvas it replies with no bitmap, so no map is
// drawn, `cover` stays 0, the scene is drawn as today at every distance and nothing is skipped.
// There is no main-thread canvas fallback (a drawing would block a frame).
import { PerspectiveCamera, Vector3, type Matrix4 } from 'three';
import type { MirrorChange } from '../../state/mirror';
import {
  ENDPAPER_LOOKAHEAD,
  ENDPAPER_MARGIN,
  ENDPAPER_ON,
  ENDPAPER_PAGE_PITCH,
  EndpaperWriter,
  endpaperCover,
  endpaperInks,
  endpaperInput,
  endpaperSpan,
  type EndpaperWorkerLike,
} from '../endpaper';
import type { WorldEnv } from '../env';
import type { LayerContext, RenderLayer } from './types';

/** Mirror changes that redraw the map: anything about the town's shape, never folk or the clock. */
export function townChanged(c: MirrorChange): boolean {
  if (c.full || c.buildings || c.village || c.streets || c.footfall) return true;
  for (const name of ['height', 'water', 'road', 'tree', 'fieldOwner', 'lot', 'terrain'] as const)
    if (c.rects.has(name)) return true;
  return false;
}

/** The camera's distance from the ground point it looks at, in tiles. */
export function cameraDistance(env: WorldEnv): number {
  return env.camera.position.distanceTo(env.focus);
}

const scratchCam = new PerspectiveCamera();
const scratchOff = new Vector3();

/**
 * The page camera: the real camera's offset from the focus in spherical terms, with the pitch lifted
 * toward `ENDPAPER_PAGE_PITCH` by smoothstep(cover) (never lower than the real pitch). Writes its
 * inverse view-projection (ndc to world) into `out` and returns the pitch used.
 */
export function pageCamera(camera: PerspectiveCamera, focus: Vector3, cover: number, out: Matrix4): number {
  scratchOff.subVectors(camera.position, focus);
  const dist = Math.max(1e-6, scratchOff.length());
  const horiz = Math.hypot(scratchOff.x, scratchOff.z);
  const real = Math.atan2(scratchOff.y, horiz);
  const k = cover * cover * (3 - 2 * cover);
  const pitch = Math.max(real, real + (ENDPAPER_PAGE_PITCH - real) * k);
  const hx = horiz > 1e-6 ? scratchOff.x / horiz : 0;
  const hz = horiz > 1e-6 ? scratchOff.z / horiz : 1;
  scratchCam.fov = camera.fov;
  scratchCam.aspect = camera.aspect;
  scratchCam.near = camera.near;
  scratchCam.far = camera.far;
  scratchCam.updateProjectionMatrix();
  scratchCam.position.set(
    focus.x + hx * Math.cos(pitch) * dist,
    focus.y + Math.sin(pitch) * dist,
    focus.z + hz * Math.cos(pitch) * dist,
  );
  scratchCam.up.set(0, 1, 0);
  scratchCam.lookAt(focus);
  scratchCam.updateMatrixWorld(true);
  out.multiplyMatrices(scratchCam.matrixWorld, scratchCam.projectionMatrixInverse);
  return pitch;
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
  let name = '';
  let lastCover = 0;
  const now = opts.now ?? (() => performance.now());
  const on = opts.on ?? ENDPAPER_ON;
  return {
    id: 'endpaper',
    motion: 'static',
    shadowless: true,
    init(c) {
      ctx = c;
      name = c.mirror.settings.value.valleyName;
      if (c.env) writer = new EndpaperWriter(c.env.endpaper, opts.makeWorker);
    },
    update(change) {
      if (!writer || !ctx) return;
      // The valley's name lives in settings, which MirrorChange does not flag: compare it.
      const n = ctx.mirror.settings.value.valleyName;
      if (townChanged(change) || n !== name) writer.townChanged(now());
      name = n;
    },
    frame() {
      const env = ctx?.env;
      if (!ctx || !env || !writer) return false;
      const map = env.endpaper;
      const distance = cameraDistance(env);
      const mirror = ctx.mirror;
      // The first drawing is asked a little before the fade starts, so it is ready when it does.
      const landed = writer.tick(now(), on ? endpaperCover(distance + ENDPAPER_LOOKAHEAD) : 0, () =>
        endpaperInput(mirror, endpaperInks(mirror)),
      );
      // Cover follows the camera only once a real bitmap is in: a browser that never draws a map
      // never fades to blank parchment, and its scene is never skipped.
      const cover = on && map.ready ? endpaperCover(distance) : 0;
      map.cover = cover;
      env.skipScene = cover >= 1 && map.revision > 0 && map.ready;
      const u = map.uniforms;
      u.uEndpaperCover.value = cover;
      if (cover > 0) {
        pageCamera(env.camera, env.focus, cover, u.uEndpaperInv.value);
        u.uEndpaperGround.value = env.focus.y;
        u.uEndpaperSpan.value.set(-ENDPAPER_MARGIN, endpaperSpan(mirror.size));
      }
      const moved = cover !== lastCover;
      lastCover = cover;
      return landed || moved;
    },
    dispose() {
      writer?.dispose();
      writer = null;
      ctx = null;
    },
  };
}
