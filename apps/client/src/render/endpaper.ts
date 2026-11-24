// V3.0: the endpaper map's interface (docs/spec/17-presentation.md, Visual direction, second pass,
// item 5; docs/spec/20-architecture.md, V3 contracts). Pulled far back, the valley cross-fades into
// its own inked map: one texture, drawn off the main thread by `worker/endpaper.worker.ts` when the
// town changes (never per frame) and shown on one quad by `layers/endpaper.ts`. V3.0's stub draws
// plain parchment and keeps `cover` at 0, so nothing on screen changes; V3D draws the map and turns
// it on (`ENDPAPER_ON`), and adds the renderer's one-line skip of the scene pass on `env.skipScene`.
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  NoColorSpace,
  RGBAFormat,
  Texture,
  Vector2,
  Vector3,
} from 'three';
import { artKitId, kitById, storybookInk } from '@qoti/art';
import { content } from '@qoti/content';
import { footprintSize } from '@qoti/sim';
import type { Mirror } from '../state/mirror';
import { fpToWorld } from './coords';
import { drawDef } from './defs';
import { OVEN_KITS, SHOP_KITS } from './layers/lights';
import { riverCourse } from './layers/water';
import { flowsOf } from './layers/overlays';
import { endpaperStreets } from './lots';
import { footfallWash, routeEdges, TOWN_COLORS } from './overlayTown';

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
 * overlay) and evening footfall (sage, from R2's `map.footfallEve`). Unset draws nothing. R2X landed
 * first, so the V3X follow-up wired them: the layer passes `endpaperInks(mirror)`.
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
  /**
   * V4B: where the town's lights stand, for the night layer: x, z (tiles) and a strength (1 a lamp
   * post) per light, from shared state (`mapLamps`). Absent, the map has no lamplight at night.
   */
  lamps?: Float32Array;
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
  /** V4B: the night layer's texture (one black texel until the first drawing). */
  night?: Texture;
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
  /** V4B: the night layer (lamplight in red). */
  tEndpaperNight: { value: Texture };
  /** V4B: how much of the night shows, 0 by day to 1 at full night (`env.night`, set by the layer). */
  uEndpaperNight: { value: number };
  /** V4B: the deeper parchment by night, as a multiplier of the day's, and the lamplight's tint. */
  uEndpaperNightPaper: { value: Vector3 };
  uEndpaperLamp: { value: Vector3 };
}

/** V4B: the night's parchment over the day's (sRGB): a slightly deeper sheet, never a dark filter. */
export const NIGHT_PAPER: [number, number, number] = [
  (storybookInk.nightPaper >> 16) / ((PARCHMENT >> 16) & 255),
  ((storybookInk.nightPaper >> 8) & 255) / ((PARCHMENT >> 8) & 255),
  (storybookInk.nightPaper & 255) / (PARCHMENT & 255),
];
/** V4B: lamplight on the sheet, as a multiplier of the deepened paper (warmer and a little lighter). */
export const LAMP_TINT: [number, number, number] = [1.17, 1.1, 0.95];

function blankNight(): Texture {
  const t = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, RGBAFormat);
  t.colorSpace = NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export function endpaperUniforms(texture: Texture, night: Texture = blankNight()): EndpaperUniforms {
  return {
    tEndpaper: { value: texture },
    uEndpaperCover: { value: 0 },
    uEndpaperInv: { value: new Matrix4() },
    uEndpaperGround: { value: 0 },
    uEndpaperSpan: { value: new Vector2(-ENDPAPER_MARGIN, 1) },
    uEndpaperTable: { value: new Vector3(...ENDPAPER_TABLE) },
    tEndpaperNight: { value: night },
    uEndpaperNight: { value: 0 },
    uEndpaperNightPaper: { value: new Vector3(...NIGHT_PAPER) },
    uEndpaperLamp: { value: new Vector3(...LAMP_TINT) },
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
  uniform sampler2D tEndpaperNight;
  uniform float uEndpaperNight;
  uniform vec3 uEndpaperNightPaper;
  uniform vec3 uEndpaperLamp;
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
    float lampLit = texture2D(tEndpaperNight, clamp(mapUv, 0.0, 1.0)).r;
    // V4B: by night the parchment deepens a little (the ink barely: the lettering keeps its
    // contrast) and the lamps pool warm on it.
    float sheet = smoothstep(0.45, 0.8, dot(ink, vec3(0.299, 0.587, 0.114)));
    vec3 deep = ink * mix(vec3(0.93), uEndpaperNightPaper, sheet);
    vec3 lamplit = mix(deep, deep * uEndpaperLamp, clamp(lampLit, 0.0, 1.0) * sheet);
    ink = mix(ink, lamplit, uEndpaperNight);
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
  const night = blankNight();
  return {
    texture,
    revision: 0,
    size,
    cover: 0,
    uniforms: endpaperUniforms(texture, night),
    ready: false,
    ms: 0,
    night,
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

/**
 * Footfall ink on the map. V4B (the owner, 2026-11-17): warm and light, laid under the roofs, where
 * V3X's was the Town overlay's sage over them (it read heavy and teal from 240 tiles).
 */
export const MAP_FOOTFALL_INK = storybookInk.footfall;

/**
 * The map's two inks from the Mirror (V3X follow-up, once R2 landed), as the Town overlay reads them:
 * goods routes along the roads (R2D's `routeEdges` over the flows overlay's list) and the evening
 * footfall (R2D's soft wash of `FootfallView.eve`). A strength per tile; the drawing scales each ink
 * by its own busiest tile, and leaves out an ink with nothing in it.
 */
export function endpaperInks(
  mirror: Mirror,
  routes: readonly [number, number, number][] = flowsOf(mirror),
): EndpaperInks {
  const n = mirror.size * mirror.size;
  const inks: EndpaperInks = {};
  const goods = new Uint16Array(n);
  let any = false;
  for (const e of routeEdges(mirror, routes))
    for (const t of [e.a, e.b]) {
      goods[t] = Math.min(65535, goods[t]! + Math.round(e.units));
      any ||= goods[t]! > 0;
    }
  if (any) inks.goods = { tiles: goods, color: TOWN_COLORS.ochre };
  const wash = footfallWash(mirror.footfall.value?.eve);
  const foot = new Uint16Array(n);
  any = false;
  for (let i = 0; i < n; i++) {
    foot[i] = Math.round((wash[i] ?? 0) * 1000);
    any ||= foot[i]! > 0;
  }
  if (any) inks.footfall = { tiles: foot, color: MAP_FOOTFALL_INK };
  return inks;
}

/** A street this short has no room for its name on the map. */
const STREET_LABEL_TILES = 3;

/**
 * R2's named streets as the map's lettering: each name at the tile of its run nearest the run's
 * middle, along the run's longer side. Longest streets first (then by id, so both seats letter the
 * same map): the drawing leaves off a name that would cross one already lettered.
 */
export function streetLabels(mirror: Mirror): EndpaperLabel[] {
  const N = mirror.size;
  const out: EndpaperLabel[] = [];
  const streets = [...mirror.streets.values()].sort((a, b) => b.tiles.length - a.tiles.length || a.id - b.id);
  for (const s of streets) {
    if (!s.name || s.tiles.length < STREET_LABEL_TILES) continue;
    let sx = 0;
    let sz = 0;
    let x0 = N;
    let x1 = 0;
    let z0 = N;
    let z1 = 0;
    for (const t of s.tiles) {
      const x = t % N;
      const z = (t - x) / N;
      sx += x;
      sz += z;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    const mx = sx / s.tiles.length;
    const mz = sz / s.tiles.length;
    let best = s.tiles[0]!;
    let bestD = Infinity;
    for (const t of s.tiles) {
      const x = t % N;
      const d = (x - mx) ** 2 + ((t - x) / N - mz) ** 2;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    const bx = best % N;
    out.push({
      text: s.name,
      x: bx + 0.5,
      z: (best - bx) / N + 0.5,
      angle: x1 - x0 >= z1 - z0 ? 0 : Math.PI / 2,
      kind: 'street',
    });
  }
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
  labels.push(...streetLabels(mirror));
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
  const lamps = mapLamps(mirror);
  if (lamps.length) input.lamps = lamps;
  return input;
}

/** V4B: a decor kit's lamplight on the map at night (a lamp post 1), by art kit, sorted. */
const MAP_LAMP_KITS: Readonly<Record<string, number>> = {
  bonfire: 1.3,
  'hanging-lantern': 0.75,
  lantern: 0.7,
  'lamp-post': 1,
};
/** V4B: a decor piece with a light the table does not name (its kit has light anchors). */
const MAP_LAMP_OTHER = 0.6;
/** V4B: a shop's door lamp or an oven's glow, and a home's lit windows (a faint warmth). */
const MAP_LAMP_DOOR = 0.8;
const MAP_LAMP_HOME = 0.28;

const lampKits = new Map<string, number>();

/** The lamplight a decor def throws on the map (0 for none), cached by def. */
function decorLamp(defId: string): number {
  let v = lampKits.get(defId);
  if (v === undefined) {
    const def = content.decorById.get(defId);
    const kitId = def ? artKitId(def.art) : '';
    const kit = kitById.get(kitId);
    const lit = !!kit?.anchors?.(def?.art.params ? { params: def.art.params } : {})?.lights?.length;
    v = MAP_LAMP_KITS[kitId] ?? (lit ? MAP_LAMP_OTHER : 0);
    lampKits.set(defId, v);
  }
  return v;
}

/**
 * V4B: the town's lights for the map's night layer, from shared state only: decor lamps where they
 * stand, a door lamp at every shop and oven, and a faint warmth at every built home (its lit
 * windows). Triples of x, z (tiles) and strength.
 */
export function mapLamps(mirror: Mirror): Float32Array {
  const out: number[] = [];
  // Tests pass partial mirrors: a missing map is an empty one.
  const { decor } = mirror as Partial<Mirror>;
  for (const d of decor?.values() ?? []) {
    const s = decorLamp(d.def);
    if (s > 0) out.push(fpToWorld(d.fx), fpToWorld(d.fz), s);
  }
  for (const b of mirror.buildings.values()) {
    if (b.stage !== 'built') continue;
    const def = drawDef(b.def);
    if (!def) continue;
    const trade = b.trade ? content.tradeById.get(b.trade) : undefined;
    const kit = trade ? artKitId(trade.look) : artKitId(def.art);
    const [w, dd] = footprintSize(def, b.rot);
    const door = SHOP_KITS.includes(kit) || OVEN_KITS.includes(kit);
    out.push(b.x + w / 2, b.z + dd / 2, door ? MAP_LAMP_DOOR : MAP_LAMP_HOME);
  }
  return Float32Array.from(out);
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
  arr(inp.lamps);
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
  /** V4B: the night layer (lamplight pools, a quarter of the map's size); `ms` includes it. */
  night?: ImageBitmap | null;
  /** V4B: how long the night layer took, ms. */
  nightMs?: number;
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
  /** V4B: the night layer's bitmap, likewise. */
  private nightBitmap: { close?: () => void } | null = null;
  /** V4B: the last night layer's time in the worker, ms (inside `lastMs`). */
  nightMs = 0;
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
    if (r.night) {
      // V4B: the night layer, its own small texture (linear, no mipmaps: it is all soft pools).
      const tex = new Texture(r.night as unknown as TexImageSource);
      tex.flipY = false;
      tex.colorSpace = NoColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = LinearFilter;
      tex.needsUpdate = true;
      this.map.night?.dispose();
      this.map.night = tex;
      this.map.uniforms.tEndpaperNight.value = tex;
      this.nightBitmap?.close?.();
      this.nightBitmap = r.night;
      this.nightMs = r.nightMs ?? 0;
    }
    this.map.revision++;
    this.fresh = true;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}

/**
 * R3G's still for the printed storybook: the endpaper map drawn once at print resolution by its own
 * one-shot worker (the live map's writer and texture are untouched) and returned as a PNG. The
 * clean map by default (no inks). Null when nothing could be drawn or encoded; it never throws.
 */
export async function endpaperStill(
  mirror: Mirror,
  opts: { size?: number; inks?: boolean; makeWorker?: () => EndpaperWorkerLike; timeoutMs?: number } = {},
): Promise<Blob | null> {
  let worker: EndpaperWorkerLike | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const size = opts.size ?? 2048;
    const input = endpaperInput(mirror, opts.inks ? endpaperInks(mirror) : {});
    worker = (opts.makeWorker ?? createEndpaperWorker)();
    const w = worker;
    const reply = await new Promise<EndpaperReply | null>((resolve) => {
      timer = setTimeout(() => resolve(null), opts.timeoutMs ?? 20000);
      w.onmessage = (e) => {
        if (e.data.type === 'drawn' && e.data.id === 1) resolve(e.data);
      };
      w.postMessage({ type: 'draw', id: 1, size, input });
    });
    const bitmap = reply?.bitmap ?? null;
    if (!bitmap) return null;
    try {
      if (typeof OffscreenCanvas !== 'undefined') {
        const c = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0);
        return await c.convertToBlob({ type: 'image/png' });
      }
      if (typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        c.width = bitmap.width;
        c.height = bitmap.height;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0);
        return await new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
      }
      return null;
    } finally {
      bitmap.close?.();
    }
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    try {
      worker?.terminate();
    } catch {
      /* ignore */
    }
  }
}
