// V3.0: the endpaper map's interface (docs/spec/17-presentation.md, Visual direction, second pass,
// item 5; docs/spec/20-architecture.md, V3 contracts). Pulled far back, the valley cross-fades into
// its own inked map: one texture, drawn off the main thread by `worker/endpaper.worker.ts` when the
// town changes (never per frame) and shown on one quad by `layers/endpaper.ts`. V3.0's stub draws
// plain parchment and keeps `cover` at 0, so nothing on screen changes; V3D draws the map and turns
// it on (`ENDPAPER_ON`), and adds the renderer's one-line skip of the scene pass on `env.skipScene`.
import {
  DataTexture,
  LinearMipmapLinearFilter,
  Matrix4,
  NoColorSpace,
  RGBAFormat,
  Texture,
  Vector2,
  Vector3,
} from 'three';
import { footprintSize } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { drawDef } from './defs';
import { riverCourse } from './layers/water';
import { endpaperStreets } from './lots';

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
export const ENDPAPER_ON = true;

/**
 * V3D: the writer asks for the first drawing when the camera is this many tiles short of where the
 * map begins to show, so it is ready when the fade starts (no blank or parchment-only frame).
 */
export const ENDPAPER_LOOKAHEAD = 20;

/** V3D: the page's pitch at full cover, radians (68 degrees): the sheet tilts up toward the reader. Never lower than the real pitch. */
export const ENDPAPER_PAGE_PITCH = (68 * Math.PI) / 180;

/** V3D: the table the sheet lies on, a deeper, warmer parchment than the sheet's edge (sRGB, 0 to 1). */
export const ENDPAPER_TABLE = [0.78, 0.67, 0.5] as const;

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
  /** V3D, from V3B's rows: the building's storeys (absent 1); a taller roof casts a longer shadow on the map. */
  storeys?: number;
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
  /** V3D, fed by V3C (`endpaperFeeds.river`): the river's course. Absent, the drawing derives one from `water`. */
  river?: EndpaperRiver;
  /**
   * V3D, fed by V3B (`endpaperFeeds.rows`): roofs joined into rows, each row's footprints in order
   * along it. A roof in a row is drawn with one ridge running the row's length. Absent, every roof
   * is drawn alone (a hipped roof).
   */
  rows?: EndpaperRoof[][];
  /** V3D, fed by V3B (`endpaperFeeds.gardens`): garden lots behind the rows, in tiles, drawn as hedged greens. */
  gardens?: { x: number; z: number; w: number; d: number }[];
  /** V3C: the river's centerline as x, z pairs in tiles, from `riverCourse` in `layers/water.ts`. */
  riverPoints?: Float32Array;
  /** V3C: the river's width in tiles at each point of `riverPoints`, from `riverCourse`. */
  riverWidths?: Float32Array;
}

/** V3D: the river's course (V3C's): x, z pairs in tiles along the river, and its width in tiles at each point. */
export interface EndpaperRiver {
  points: Float32Array;
  widths: Float32Array;
}

/**
 * V3D: where `endpaperInput` takes V3B's rows and V3C's river from, so neither track edits this
 * file: each sets its function here once (V3X wired them), from shared Mirror state only. Unset, the
 * map draws plain footprints and finds the river in `water`.
 */
export interface EndpaperFeeds {
  river?: (mirror: Mirror) => EndpaperRiver | null;
  rows?: (mirror: Mirror) => EndpaperRoof[][];
  gardens?: (mirror: Mirror) => { x: number; z: number; w: number; d: number }[];
}

/**
 * V3D: V3B's `endpaperStreets(mirror).rooflines` (`render/lots.ts` on V3B's branch) as the map's
 * rows: rooflines sharing a row id above 0 make one row, in the order given; row 0 (a lone lot) makes
 * none. V3X wired it into `endpaperFeeds.rows`, and V3B's gardens into `endpaperFeeds.gardens`.
 */
export function rowsOfRooflines(
  rooflines: readonly {
    row: number;
    x: number;
    z: number;
    w: number;
    d: number;
    rot: number;
    storeys?: number;
  }[],
): EndpaperRoof[][] {
  const rows = new Map<number, EndpaperRoof[]>();
  for (const r of rooflines) {
    if (r.row <= 0) continue;
    let list = rows.get(r.row);
    if (!list) rows.set(r.row, (list = []));
    list.push({ x: r.x, z: r.z, w: r.w, d: r.d, rot: r.rot, storeys: r.storeys ?? 1 });
  }
  return [...rows.values()];
}

/** V3X: the river's course for the map: V3C's `riverCourse` over the shared water layer. */
export function riverOfMirror(mirror: Mirror): EndpaperRiver | null {
  const tiles = mirror.size;
  const water = mirror.layers.water;
  if (!water) return null;
  const course = riverCourse(
    { water: (x, z) => (x < tiles && z < tiles ? (water[z * tiles + x] ?? 0) : 0) },
    mirror.meta?.flow,
  );
  return { points: course.points, widths: course.widths };
}

/**
 * V3D: the feeds `endpaperInput` uses by default. V3X wired them: V3B's rows and gardens
 * (`endpaperStreets` in `lots.ts`) and V3C's river (`riverCourse` in `layers/water.ts`).
 */
export const endpaperFeeds: EndpaperFeeds = {
  river: riverOfMirror,
  rows: (m) => rowsOfRooflines(endpaperStreets(m).rooflines),
  gardens: (m) => endpaperStreets(m).gardens,
};

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
  /** V3D: the map's own uniform objects (the final pass shares them; see `ENDPAPER_GLSL`). */
  uniforms: EndpaperUniforms;
  /** V3D: a real bitmap is in the texture (false in a browser whose worker cannot draw). */
  ready: boolean;
  /** V3D: the last drawing's time in the worker, ms (the `?debug` overlay). */
  ms: number;
}

/** The uniforms `ENDPAPER_GLSL` reads. */
export interface EndpaperUniforms {
  tEndpaper: { value: Texture };
  uEndpaperCover: { value: number };
  /** The page camera's world matrix times its inverse projection: ndc to world. */
  uEndpaperInv: { value: Matrix4 };
  /** The height of the plane the map is laid on (the focus's y). */
  uEndpaperGround: { value: number };
  /** The map's world origin (-M on both axes) in x, its span in tiles in y. */
  uEndpaperSpan: { value: Vector2 };
  uEndpaperTable: { value: Vector3 };
}

export function endpaperUniforms(texture: Texture): EndpaperUniforms {
  return {
    tEndpaper: { value: texture },
    uEndpaperCover: { value: 0 },
    uEndpaperInv: { value: new Matrix4() },
    uEndpaperGround: { value: 0 },
    uEndpaperSpan: { value: new Vector2(-ENDPAPER_MARGIN, 1) },
    uEndpaperTable: { value: new Vector3(...ENDPAPER_TABLE) },
  };
}

/**
 * V3D: the final pass's map overlay. `endpaperOver(c, uv)` mixes the map over the graded, sRGB color
 * `c` with opacity `uEndpaperCover` (it returns `c` untouched, with no fetch, at 0). Per pixel it casts
 * the page camera's ray onto the plane y = ground and samples the map there, so at small cover the
 * ink lies over the valley it maps. Rays that miss the sheet or point up see the table, and the
 * sheet's border fades into it softly. The texture holds raw sRGB values (no color space), as the
 * final pass's output is sRGB. The sample is taken before any branch so its derivatives stay valid.
 */
export const ENDPAPER_GLSL = /* glsl */ `
  uniform sampler2D tEndpaper;
  uniform float uEndpaperCover;
  uniform mat4 uEndpaperInv;
  uniform float uEndpaperGround;
  uniform vec2 uEndpaperSpan;
  uniform vec3 uEndpaperTable;
  vec3 endpaperOver(vec3 c, vec2 uv) {
    if (uEndpaperCover <= 0.0) return c;
    vec2 ndc = uv * 2.0 - 1.0;
    vec4 n = uEndpaperInv * vec4(ndc, -1.0, 1.0);
    vec4 f = uEndpaperInv * vec4(ndc, 1.0, 1.0);
    vec3 o = n.xyz / n.w;
    vec3 d = f.xyz / f.w - o;
    float t = (uEndpaperGround - o.y) / (abs(d.y) < 1e-6 ? -1e-6 : d.y);
    bool hit = d.y < 0.0 && t > 0.0;
    vec3 p = o + d * (hit ? t : 0.0);
    vec2 mapUv = (p.xz - vec2(uEndpaperSpan.x)) / uEndpaperSpan.y;
    vec3 ink = texture2D(tEndpaper, clamp(mapUv, 0.0, 1.0)).rgb;
    vec2 e = min(mapUv, 1.0 - mapUv);
    float on = hit ? smoothstep(0.0, 0.012, min(e.x, e.y)) : 0.0;
    vec3 m = mix(uEndpaperTable, ink, on);
    return mix(c, m, uEndpaperCover);
  }
`;

/** A blank map: one parchment texel until the first drawing arrives. */
export function createEndpaperMap(size = 2048): EndpaperMap {
  const c = PARCHMENT;
  const data = new Uint8Array([(c >> 16) & 255, (c >> 8) & 255, c & 255, 255]);
  const texture = new DataTexture(data, 1, 1, RGBAFormat);
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  return {
    texture,
    revision: 0,
    size,
    cover: 0,
    uniforms: endpaperUniforms(texture),
    ready: false,
    ms: 0,
  };
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
export function endpaperInput(
  mirror: Mirror,
  inks: EndpaperInks = {},
  feeds: EndpaperFeeds = endpaperFeeds,
): EndpaperInput {
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
  const input: EndpaperInput = {
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
  const river = feeds.river?.(mirror);
  if (river && river.points.length >= 4) {
    input.river = river;
    // V3C's two fields carry the same course (append-only; the drawing reads `river`).
    input.riverPoints = river.points;
    input.riverWidths = river.widths;
  }
  const rows = feeds.rows?.(mirror);
  if (rows && rows.length) input.rows = rows;
  const gardens = feeds.gardens?.(mirror);
  if (gardens && gardens.length) input.gardens = gardens;
  return input;
}

/**
 * V3D: a fingerprint of everything the map draws (each layer, footprint, plan, label, ink and feed),
 * so the writer redraws only when the picture would change. Two 32-bit FNV-1a hashes in different
 * seeds over the numbers, joined: about 1 ms on the grown village, run only when a drawing is due.
 */
export function endpaperSignature(inp: EndpaperInput): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  const num = (v: number): void => {
    const x = Math.round(v * 16) | 0;
    a = Math.imul(a ^ x, 0x01000193);
    b = Math.imul(b ^ (x + 0x9e3779b9), 0x85ebca6b);
  };
  const arr = (t: ArrayLike<number> | undefined): void => {
    if (!t) return num(-1);
    num(t.length);
    for (let i = 0; i < t.length; i++) num(t[i]!);
  };
  const str = (s: string): void => {
    num(s.length);
    for (let i = 0; i < s.length; i++) num(s.charCodeAt(i));
  };
  const roofs = (list: readonly EndpaperRoof[]): void => {
    num(list.length);
    for (const r of list) {
      num(r.x);
      num(r.z);
      num(r.w);
      num(r.d);
      num(r.rot);
      num(r.storeys ?? 1);
    }
  };
  num(inp.tiles);
  for (const t of [inp.heights, inp.water, inp.woods, inp.fields, inp.roads, inp.terrain]) arr(t);
  roofs(inp.roofs);
  roofs(inp.plans);
  num(inp.labels.length);
  for (const l of inp.labels) {
    str(l.text);
    str(l.kind);
    num(l.x);
    num(l.z);
    num(l.angle);
  }
  for (const ink of [inp.inks.goods, inp.inks.footfall]) {
    arr(ink?.tiles);
    num(ink?.color ?? -1);
  }
  arr(inp.river?.points);
  arr(inp.river?.widths);
  num(inp.rows?.length ?? -1);
  for (const row of inp.rows ?? []) roofs(row);
  num(inp.gardens?.length ?? -1);
  for (const g of inp.gardens ?? []) {
    num(g.x);
    num(g.z);
    num(g.w);
    num(g.d);
  }
  return `${(a >>> 0).toString(36)}.${(b >>> 0).toString(36)}`;
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
  /** The size of the last drawing asked for: a different `map.size` (a preset change) redraws. */
  private askedSize: number;
  /** The bitmap now in the texture, closed when the next one replaces it. */
  private bitmap: { close?: () => void } | null = null;
  private worker: EndpaperWorkerLike | null = null;
  /** The last drawing's time in the worker, ms (for the `?debug` overlay and V3D's budget check). */
  lastMs = 0;
  /** Drawings asked for, and finished (for tests and the debug overlay). */
  asked = 0;
  drawn = 0;
  /** Redraws found unneeded: the town changed, but nothing the map draws did. */
  skipped = 0;
  /** `endpaperSignature` of the last drawing asked. */
  private drawnSig = '';

  constructor(
    readonly map: EndpaperMap,
    private readonly makeWorker: () => EndpaperWorkerLike = createEndpaperWorker,
    private readonly debounceMs = ENDPAPER_DEBOUNCE_MS,
  ) {
    this.askedSize = map.size;
  }

  /** The town changed at `now` (ms): a redraw is due once it has been quiet for the debounce. */
  townChanged(now: number): void {
    this.dirty = true;
    this.lastChange = now;
  }

  /** Whether a drawing is due now (dirty, quiet long enough, showing, none in flight). */
  due(now: number, cover: number): boolean {
    if (this.inFlight !== 0 || cover <= 0) return false;
    if (this.map.size !== this.askedSize) return true;
    return this.dirty && now - this.lastChange >= this.debounceMs;
  }

  /**
   * Once a frame: asks for a drawing when one is due (building the input only then) and returns true
   * when a finished drawing landed since the last call.
   */
  tick(now: number, cover: number, input: () => EndpaperInput): boolean {
    if (this.due(now, cover)) {
      this.dirty = false;
      // A living town flags buildings and lots on most turns (stock, crews, plans' progress) while
      // the map's own picture is unchanged: draw only when what the map draws differs.
      const inp = input();
      const sig = endpaperSignature(inp);
      if (sig !== this.drawnSig || this.map.size !== this.askedSize) {
        this.worker ??= this.attach(this.makeWorker());
        const id = this.nextId++;
        this.inFlight = id;
        this.asked++;
        this.askedSize = this.map.size;
        this.drawnSig = sig;
        this.worker.postMessage({ type: 'draw', id, size: this.map.size, input: inp });
      } else this.skipped++;
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
    this.map.ms = r.ms;
    if (r.bitmap) {
      // A new texture each time: three uploads a bitmap-backed texture once, and a new one is the
      // simple way to replace it (the old one's GPU copy goes with `dispose`).
      const tex = new Texture(r.bitmap as unknown as TexImageSource);
      tex.flipY = false;
      tex.colorSpace = NoColorSpace;
      tex.minFilter = LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      const old = this.map.texture;
      this.map.texture = tex;
      this.map.uniforms.tEndpaper.value = tex;
      old.dispose();
      this.bitmap?.close?.();
      this.bitmap = r.bitmap;
      this.map.ready = true;
    }
    this.map.revision++;
    this.fresh = true;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
