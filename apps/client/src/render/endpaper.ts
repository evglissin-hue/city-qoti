// V3.0: the endpaper map's interface (docs/spec/17-presentation.md, Visual direction, second pass,
// item 5; docs/spec/20-architecture.md, V3 contracts). Pulled far back, the valley cross-fades into
// its own inked map: one texture, drawn off the main thread by `worker/endpaper.worker.ts` when the
// town changes (never per frame) and shown on one quad by `layers/endpaper.ts`. V3.0's stub draws
// plain parchment and keeps `cover` at 0, so nothing on screen changes; V3D draws the map and turns
// it on (`ENDPAPER_ON`), and adds the renderer's one-line skip of the scene pass on `env.skipScene`.
import { DataTexture, RGBAFormat, SRGBColorSpace, type Texture } from 'three';
import { footprintSize } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { drawDef } from './defs';

/** Camera distance in tiles where the map starts to show, and where it covers the view. */
export const ENDPAPER_NEAR = 200;
export const ENDPAPER_FULL = 240;

/** Wait this long after the town's last change before redrawing (V3.0's choice of 0.5, 2 and 5 s). */
export const ENDPAPER_DEBOUNCE_MS = 2000;

/** The most a redraw may take in the worker, in ms (a budget V3D checks, not a timeout). */
export const ENDPAPER_DRAW_BUDGET_MS = 150;

/** Parchment, the stub's whole map and the real map's ground (sRGB). */
export const PARCHMENT = 0xeee2c2;

/**
 * V3D: the map's margin in tiles round the valley. The texture covers world tiles [-M, tiles + M] on
 * both axes, square: texel (px, py) of a `size` map is tile x = -M + px * span / size, z = -M + py *
 * span / size, where span = tiles + 2M. Canvas y runs down the page, which is +z; the texture is
 * uploaded with flipY off, so v = 0 is the canvas's top row (z = -M).
 */
export const ENDPAPER_MARGIN = 14;

/** V3D: the side of the map's texture in tiles (the valley plus its margins). */
export function endpaperSpan(tiles: number): number {
  return tiles + 2 * ENDPAPER_MARGIN;
}

/**
 * V3D turns this on. Until then `cover` stays 0 whatever the distance, the worker is never made and
 * the scene is always drawn: V3.0 is a no-op on screen.
 */
export const ENDPAPER_ON = false;

/** How much the map covers the view at a camera distance: 0 to 200 tiles, rising to 1 at 240. */
export function endpaperCover(distance: number): number {
  const t = (distance - ENDPAPER_NEAR) / (ENDPAPER_FULL - ENDPAPER_NEAR);
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** One ink drawn over the map: a strength per tile (0 none) in one color (sRGB). */
export interface InkLayer {
  tiles: Uint16Array;
  color: number;
}

/**
 * The map's two inks (17-presentation.md, One map, two inks): goods routes (ochre, from the flows
 * overlay) and evening footfall (sage, from R2's `map.footfallEve`). Unset draws nothing. Whichever
 * of V3X and R2X lands second wires them; V3.0's stub and V3D draw neither until then.
 */
export interface EndpaperInks {
  goods?: InkLayer;
  footfall?: InkLayer;
}

/** A building's footprint on the map (a roofline), or a plan's in blueprint ink: world tiles, already turned by `rot`. */
export interface EndpaperRoof {
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
}

/** Lettering on the map: the valley's name along the river, places and streets. Tiles, radians. */
export interface EndpaperLabel {
  text: string;
  x: number;
  z: number;
  angle: number;
  kind: 'valley' | 'place' | 'street';
}

/**
 * The compact copy of the valley the worker draws from, built from the Mirror on the main thread
 * (`endpaperInput`) and posted whole. Plain arrays only, so it crosses to the worker by structured
 * clone. Per-tile layers are `tiles * tiles` long, index z * tiles + x. V3B's rows and V3C's river
 * feed it as plain arrays too (fields appended, never renamed).
 */
export interface EndpaperInput {
  /** The map's side in tiles. */
  tiles: number;
  /** Height level per tile. */
  heights: Uint8Array;
  /** Water per tile, the sim's `Water` kind (0 dry, 1 river, 2 deep river, 3 pond, 4 canal). */
  water: Uint8Array;
  /** Trees per tile (the tree layer; 0 none). */
  woods: Uint8Array;
  /** 1 where a field is worked (the field owner layer), for hatching. */
  fields: Uint8Array;
  /** The road layer's value per tile (0 none); its class through content `roads`. */
  roads: Uint8Array;
  /** Built buildings' footprints. */
  roofs: EndpaperRoof[];
  /** Buildings under construction, in blueprint ink. */
  plans: EndpaperRoof[];
  labels: EndpaperLabel[];
  inks: EndpaperInks;
  /** V3D: the terrain layer's kind per tile (sim `Terrain`: grass, meadow, forest floor, sand, rock, mountain, water, field). */
  terrain: Uint8Array;
}

/**
 * The map as the renderer sees it. `texture` is written only through the `EndpaperWriter` (with the
 * worker's bitmap) and read only by the endpaper layer; `revision` bumps on each finished drawing;
 * `size` is the texture's side in texels (`QualityPreset.endpaperSize`); `cover` is 0 to 1 (set by the
 * layer each frame from the camera's distance, 0 while `ENDPAPER_ON` is off).
 */
export interface EndpaperMap {
  texture: Texture;
  revision: number;
  size: number;
  cover: number;
}

/** A blank map: one parchment texel until the first drawing arrives. */
export function createEndpaperMap(size = 2048): EndpaperMap {
  const c = PARCHMENT;
  const data = new Uint8Array([(c >> 16) & 255, (c >> 8) & 255, c & 255, 255]);
  const texture = new DataTexture(data, 1, 1, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return { texture, revision: 0, size, cover: 0 };
}

function layerCopy(
  src: ArrayLike<number> | undefined,
  n: number,
  pick: (v: number) => number = (v) => v,
): Uint8Array {
  const out = new Uint8Array(n);
  if (src) for (let i = 0; i < n; i++) out[i] = Math.min(255, Math.max(0, pick(src[i]!)));
  return out;
}

/** The worker's copy of the valley, from shared Mirror state only (both seats draw the same map). */
export function endpaperInput(mirror: Mirror, inks: EndpaperInks = {}): EndpaperInput {
  const tiles = mirror.size;
  const n = tiles * tiles;
  const L = mirror.layers;
  const roofs: EndpaperRoof[] = [];
  const plans: EndpaperRoof[] = [];
  for (const b of mirror.buildings.values()) {
    const def = drawDef(b.def);
    const [w, d] = def ? footprintSize(def, b.rot) : [1, 1];
    const r: EndpaperRoof = { x: b.x, z: b.z, w, d, rot: b.rot };
    (b.stage === 'built' ? roofs : plans).push(r);
  }
  const labels: EndpaperLabel[] = [];
  const name = mirror.settings.value.valleyName;
  if (name) labels.push({ text: name, x: tiles / 2, z: tiles / 2, angle: 0, kind: 'valley' });
  return {
    tiles,
    heights: layerCopy(L.height, n),
    water: layerCopy(L.water, n),
    woods: layerCopy(L.tree, n),
    fields: layerCopy(L.fieldOwner, n, (v) => (v ? 1 : 0)),
    roads: layerCopy(L.road, n),
    roofs,
    plans,
    labels,
    inks,
    terrain: layerCopy(L.terrain, n),
  };
}

/** Main thread to worker: draw this input at this size. */
export interface EndpaperRequest {
  type: 'draw';
  id: number;
  size: number;
  input: EndpaperInput;
}

/** Worker to main thread: the drawing for request `id` (null where no canvas exists, as in tests), and how long it took. */
export interface EndpaperReply {
  type: 'drawn';
  id: number;
  bitmap: ImageBitmap | null;
  ms: number;
}

/** The part of a Worker the writer uses, so tests can pass a fake. */
export interface EndpaperWorkerLike {
  postMessage(msg: EndpaperRequest): void;
  onmessage: ((e: { data: EndpaperReply }) => void) | null;
  terminate(): void;
}

/** Makes the real worker (a module worker; Vite bundles it). */
export function createEndpaperWorker(): EndpaperWorkerLike {
  return new Worker(new URL('../worker/endpaper.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as EndpaperWorkerLike;
}

/**
 * The map's only writer, on the main thread. The redraw event: the town changed (`townChanged`, on a
 * static-layer event), then, once `debounceMs` has passed since the last change and only while the
 * map shows (`cover` above 0), one drawing is asked of the worker; the finished bitmap goes into the
 * texture, `revision` bumps and the next `tick` returns true (the layer's `frame()` returns it, a
 * static-layer event). One drawing is in flight at most; changes during it ask for one more. The
 * worker is made on the first drawing, so a session that never pulls back never starts it.
 */
export class EndpaperWriter {
  private dirty = true;
  private lastChange = -Infinity;
  private inFlight = 0;
  private nextId = 1;
  private fresh = false;
  private worker: EndpaperWorkerLike | null = null;
  /** The last drawing's time in the worker, ms (for the `?debug` overlay and V3D's budget check). */
  lastMs = 0;
  /** Drawings asked for, and finished (for tests and the debug overlay). */
  asked = 0;
  drawn = 0;

  constructor(
    readonly map: EndpaperMap,
    private readonly makeWorker: () => EndpaperWorkerLike = createEndpaperWorker,
    private readonly debounceMs = ENDPAPER_DEBOUNCE_MS,
  ) {}

  /** The town changed at `now` (ms): a redraw is due once it has been quiet for the debounce. */
  townChanged(now: number): void {
    this.dirty = true;
    this.lastChange = now;
  }

  /** Whether a drawing is due now (dirty, quiet long enough, showing, none in flight). */
  due(now: number, cover: number): boolean {
    return this.dirty && this.inFlight === 0 && cover > 0 && now - this.lastChange >= this.debounceMs;
  }

  /**
   * Once a frame: asks for a drawing when one is due (building the input only then) and returns true
   * when a finished drawing landed since the last call.
   */
  tick(now: number, cover: number, input: () => EndpaperInput): boolean {
    if (this.due(now, cover)) {
      this.worker ??= this.attach(this.makeWorker());
      const id = this.nextId++;
      this.inFlight = id;
      this.dirty = false;
      this.asked++;
      this.worker.postMessage({ type: 'draw', id, size: this.map.size, input: input() });
    }
    const f = this.fresh;
    this.fresh = false;
    return f;
  }

  private attach(w: EndpaperWorkerLike): EndpaperWorkerLike {
    w.onmessage = (e) => this.receive(e.data);
    return w;
  }

  private receive(r: EndpaperReply): void {
    if (r.type !== 'drawn' || r.id !== this.inFlight) return;
    this.inFlight = 0;
    this.lastMs = r.ms;
    this.drawn++;
    if (r.bitmap) {
      const tex = this.map.texture as Texture & { image: unknown };
      const old = tex.image as { close?: () => void } | undefined;
      tex.image = r.bitmap;
      tex.needsUpdate = true;
      old?.close?.();
    }
    this.map.revision++;
    this.fresh = true;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
