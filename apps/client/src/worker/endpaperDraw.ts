// V3D: the endpaper map's drawing (17-presentation.md, The long view). Pure functions of a 2D
// context and the compact `EndpaperInput`: parchment, relief, water, fields, woods, roads, roofs,
// plans, the two inks, lettering and a hand-drawn border. Every wobble comes from a hash of position
// (endpaperGeo.ts), so the same input draws the same picture and a small change moves only its spot.
// The road table straight from its file (a relative import, so the worker does not pull in all of
// `@qoti/content`: that index would add about 900 kB); a test checks it equals content's `roads`.
import * as roadDefs from '../../../../packages/content/src/roads';
import { endpaperInk as K } from '../../../../packages/art/src/palette';
import type { EndpaperInput, EndpaperRoof } from '../render/endpaper';
import {
  ENDPAPER_MARGIN,
  endpaperSpan,
  blur,
  contours,
  hash2,
  padded,
  patches,
  Proj,
  riverCenterline,
  upright,
  type Poly,
} from './endpaperGeo';
import {
  css,
  defaultMakeCanvas,
  grainTile,
  treeGlyphs,
  VARIANTS,
  type Ctx,
  type MakeCanvas,
} from './endpaperGlyphs';

export type { Ctx, MakeCanvas } from './endpaperGlyphs';

/** Every road def, as content lists them (checked against `roads` in the tests). */
export const roadTable: readonly { id: string; layerValue: number }[] = Object.values(roadDefs);

export const MAP_FONT = 'Alegreya, Georgia, serif';

export interface DrawOpts {
  /** Filled with the milliseconds each pass took. */
  timings?: Record<string, number>;
  /** Makes the canvases for glyphs and grain (OffscreenCanvas by default). */
  makeCanvas?: MakeCanvas;
}

interface Cx {
  g: Ctx;
  inp: EndpaperInput;
  size: number;
  tiles: number;
  P: Proj;
  /** Pixels per tile. */
  sc: number;
  /** Line width scale (1 at 2048). */
  ls: number;
  make: MakeCanvas;
}

function ink(g: Ctx, kind: 'stroke' | 'fill', color: number, alpha = 1): void {
  if (kind === 'stroke') g.strokeStyle = css(color);
  else g.fillStyle = css(color);
  g.globalAlpha = alpha;
}

/** Appends a smooth outline (grid coords offset by `o`) to the current path. */
function addPoly(c: Cx, poly: Poly, o: number): void {
  const n = poly.pts.length / 2;
  if (n < 2) return;
  const { g, P } = c;
  const px = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    P.at(poly.pts[2 * i]! + o, poly.pts[2 * i + 1]! + o);
    px[2 * i] = P.x;
    px[2 * i + 1] = P.y;
  }
  if (poly.closed && n >= 3) {
    g.moveTo((px[2 * n - 2]! + px[0]!) / 2, (px[2 * n - 1]! + px[1]!) / 2);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      g.quadraticCurveTo(
        px[2 * i]!,
        px[2 * i + 1]!,
        (px[2 * i]! + px[2 * j]!) / 2,
        (px[2 * i + 1]! + px[2 * j + 1]!) / 2,
      );
    }
    g.closePath();
  } else {
    g.moveTo(px[0]!, px[1]!);
    for (let i = 1; i < n - 1; i++) {
      g.quadraticCurveTo(
        px[2 * i]!,
        px[2 * i + 1]!,
        (px[2 * i]! + px[2 * i + 2]!) / 2,
        (px[2 * i + 1]! + px[2 * i + 3]!) / 2,
      );
    }
    g.lineTo(px[2 * n - 2]!, px[2 * n - 1]!);
  }
}

// 1. Parchment ---------------------------------------------------------------------------------

function parchment(c: Cx): void {
  const { g, size } = c;
  g.globalAlpha = 1;
  g.fillStyle = css(K.paper);
  g.fillRect(0, 0, size, size);
  // Soft aged blotches.
  for (let i = 0; i < 6; i++) {
    const x = hash2(i, 1, 41) * size;
    const y = hash2(i, 2, 41) * size;
    const r = size * (0.07 + hash2(i, 3, 41) * 0.16);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, css(i % 3 === 0 ? K.paperLight : K.paperShade));
    gr.addColorStop(1, css(K.paper));
    g.globalAlpha = i % 3 === 0 ? 0.35 : 0.1;
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Grain.
  const pat = g.createPattern(grainTile(c.make) as unknown as CanvasImageSource, 'repeat');
  if (pat) {
    g.globalAlpha = 0.85;
    g.fillStyle = pat;
    g.fillRect(0, 0, size, size);
  }
  // Darkening toward the edges, like an aged page.
  const m = size / 2;
  const v = g.createRadialGradient(m, m, size * 0.38, m, m, size * 0.78);
  v.addColorStop(0, 'rgba(184,156,108,0)');
  v.addColorStop(1, 'rgba(160,126,78,0.55)');
  g.globalAlpha = 1;
  g.fillStyle = v;
  g.fillRect(0, 0, size, size);
}

// 2. Ground relief -------------------------------------------------------------------------------

function relief(c: Cx): void {
  const { g, inp, tiles, P, sc, ls } = c;
  const pad = 2;
  const W = tiles + 2 * pad;
  const o = 0.5 - pad;
  // Meadow: a faint tint with smooth edges.
  const meadow = new Uint8Array(tiles * tiles);
  let anyMeadow = false;
  for (let i = 0; i < meadow.length; i++) {
    if (inp.terrain[i] === 1) {
      meadow[i] = 1;
      anyMeadow = true;
    }
  }
  if (anyMeadow) {
    const f = blur(padded(meadow, tiles, pad, false), W, W, 1);
    g.beginPath();
    for (const p of contours(f, W, W, 0.4)) if (p.pts.length >= 8) addPoly(c, p, o);
    ink(g, 'fill', K.meadow, 0.1);
    g.fill('evenodd');
  }
  // Contours at each height step.
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < inp.heights.length; i++) {
    const h = inp.heights[i]!;
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  if (hi > lo) {
    const f = blur(padded(inp.heights, tiles, pad, true), W, W, 2);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    for (let lvl = lo + 1; lvl <= hi; lvl += 2) {
      const polys = contours(f, W, W, lvl - 0.5).filter((p) => p.pts.length >= 12);
      if (!polys.length) continue;
      const major = (lvl - lo - 1) % 8 === 0;
      g.beginPath();
      for (const p of polys) addPoly(c, p, o);
      ink(g, 'stroke', K.inkFaint, major ? 0.34 : 0.2);
      g.lineWidth = (major ? 1.7 : 1.4) * ls;
      g.stroke();
    }
  }
  // Rock and mountain: hachure down the slope. Sand: a sparse stipple.
  const hs = blur(padded(inp.heights, tiles, 1, true), tiles + 2, tiles + 2, 1);
  const T2 = tiles + 2;
  g.beginPath();
  const dots: number[] = [];
  for (let z = 0; z < tiles; z++) {
    for (let x = 0; x < tiles; x++) {
      const t = inp.terrain[z * tiles + x]!;
      if (t === 3) {
        for (let k = 0; k < 2; k++) {
          dots.push(x + hash2(x, z, 60 + k), z + hash2(x, z, 70 + k));
        }
      } else if (t === 4 || t === 5) {
        const gx = hs[(z + 1) * T2 + x + 2]! - hs[(z + 1) * T2 + x]!;
        const gz = hs[(z + 2) * T2 + x + 1]! - hs[z * T2 + x + 1]!;
        const mag = Math.hypot(gx, gz);
        let dx = 0.12;
        let dz = 1;
        if (mag > 0.02) {
          dx = -gx / mag;
          dz = -gz / mag;
        }
        if (t === 4 && hash2(x, z, 12) < 0.4) continue;
        if (t === 5 && hash2(x, z, 13) < 0.35) continue;
        const n = t === 5 ? 2 : 1;
        const len = (t === 5 ? 0.62 : 0.45) * (0.8 + 0.4 * hash2(x, z, 8));
        for (let k = 0; k < n; k++) {
          const sx = x + (k + 0.5 + (hash2(x, z, 9 + k) - 0.5) * 0.5) / n;
          const sz = z + 0.15 + hash2(x, z, 14 + k) * 0.4;
          P.at(sx, sz);
          g.moveTo(P.x, P.y);
          P.at(sx + dx * len * 0.9, sz + dz * len);
          g.lineTo(P.x, P.y);
        }
      }
    }
  }
  ink(g, 'stroke', K.rock, 0.42);
  g.lineWidth = 1.5 * ls;
  g.lineCap = 'round';
  g.stroke();
  if (dots.length) {
    g.beginPath();
    const r = Math.max(1, 0.1 * sc);
    for (let i = 0; i < dots.length; i += 2) {
      P.at(dots[i]!, dots[i + 1]!);
      g.rect(P.x, P.y, r, r);
    }
    ink(g, 'fill', K.sand, 0.4);
    g.fill();
  }
}

function box(p: Poly): [number, number, number, number] {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < p.pts.length; i += 2) {
    x0 = Math.min(x0, p.pts[i]!);
    x1 = Math.max(x1, p.pts[i]!);
    z0 = Math.min(z0, p.pts[i + 1]!);
    z1 = Math.max(z1, p.pts[i + 1]!);
  }
  return [x0, z0, x1, z1];
}

/** Whether some shore outline's box sits inside this outline's box. */
function enclosesShore(p: Poly, shore: Poly[]): boolean {
  const [x0, z0, x1, z1] = box(p);
  return shore.some((q) => {
    const [a, b, c, d] = box(q);
    return a >= x0 && b >= z0 && c <= x1 && d <= z1;
  });
}

// 3. Water ---------------------------------------------------------------------------------------

function water(c: Cx): void {
  const { g, inp, tiles, ls, sc } = c;
  const mask = new Uint8Array(tiles * tiles);
  const deep = new Uint8Array(tiles * tiles);
  let any = false;
  let anyDeep = false;
  // Specks of water under four tiles are noise on a map: leave them out.
  const { list: ponds } = patches(inp.water, tiles);
  const speck = new Uint8Array(tiles * tiles);
  for (const l of ponds) if (l.length < 4) for (const t of l) speck[t] = 1;
  for (let i = 0; i < mask.length; i++) {
    const w = inp.water[i]!;
    if (w && !speck[i]) {
      mask[i] = 1;
      any = true;
      if (w === 2) {
        deep[i] = 1;
        anyDeep = true;
      }
    }
  }
  if (!any) return;
  const pad = 2;
  const W = tiles + 2 * pad;
  const o = 0.5 - pad;
  const f = blur(padded(mask, tiles, pad, false), W, W, 1);
  const shore = contours(f, W, W, 0.5).filter((p) => p.pts.length >= 6);
  const path = (polys: Poly[]): void => {
    c.g.beginPath();
    for (const p of polys) addPoly(c, p, o);
  };
  path(shore);
  ink(g, 'fill', K.water, 0.86);
  g.fill('evenodd');
  if (anyDeep) {
    const fd = blur(padded(deep, tiles, pad, false), W, W, 1);
    path(contours(fd, W, W, 0.5).filter((p) => p.pts.length >= 6));
    ink(g, 'fill', K.waterDeep, 0.42);
    g.fill('evenodd');
  }
  // Inner shading: wide soft strokes along the shore, clipped inside.
  g.save();
  path(shore);
  g.clip('evenodd');
  g.lineJoin = 'round';
  for (const [wd, a] of [
    [1.3, 0.1],
    [0.6, 0.12],
  ] as const) {
    path(shore);
    ink(g, 'stroke', K.waterInk, a);
    g.lineWidth = wd * sc;
    g.stroke();
  }
  g.restore();
  // Water lines outside the shore, then the inked shore.
  g.lineJoin = 'round';
  for (const [lvl, a] of [
    [0.3, 0.42],
    [0.12, 0.28],
  ] as const) {
    // Only lines that enclose some inked shore (the faint halo of a speck is not a lake).
    path(contours(f, W, W, lvl).filter((p) => p.pts.length >= 8 && enclosesShore(p, shore)));
    ink(g, 'stroke', K.waterInk, a);
    g.lineWidth = 1.5 * ls;
    g.stroke();
  }
  path(shore);
  ink(g, 'stroke', K.ink, 0.8);
  g.lineWidth = 2 * ls;
  g.stroke();
}

// 4. Fields --------------------------------------------------------------------------------------

function fields(c: Cx): void {
  const { g, inp, tiles, P, ls } = c;
  const { list } = patches(inp.fields, tiles);
  if (!list.length) return;
  const angles = [0.5, 1.2, -0.45, 2.1, -1.05, 0.05];
  const have = (x: number, z: number): boolean =>
    x >= 0 && z >= 0 && x < tiles && z < tiles && inp.fields[z * tiles + x] !== 0;
  for (const patch of list) {
    let x0 = tiles;
    let x1 = 0;
    let z0 = tiles;
    let z1 = 0;
    const first = Math.min(...patch);
    for (const t of patch) {
      const x = t % tiles;
      const z = (t - x) / tiles;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x + 1);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z + 1);
    }
    const ang = angles[Math.floor(hash2(first % tiles, (first / tiles) | 0, 77) * angles.length)]!;
    // The patch as a clip, hatched inside.
    g.save();
    g.beginPath();
    for (const t of patch) {
      const x = t % tiles;
      const z = (t - x) / tiles;
      P.at(x, z);
      g.moveTo(P.x, P.y);
      P.at(x + 1, z);
      g.lineTo(P.x, P.y);
      P.at(x + 1, z + 1);
      g.lineTo(P.x, P.y);
      P.at(x, z + 1);
      g.lineTo(P.x, P.y);
      g.closePath();
    }
    g.clip();
    ink(g, 'fill', K.field, 0.1);
    g.fillRect(0, 0, c.size, c.size);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const R = Math.hypot(x1 - x0, z1 - z0) / 2 + 1;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    g.beginPath();
    for (let s = -R; s <= R; s += 0.5) {
      // Lines run along (ca, sa); offset across it.
      const ox = cx - sa * s;
      const oz = cz + ca * s;
      P.at(ox - ca * R, oz - sa * R);
      g.moveTo(P.x, P.y);
      P.at(ox + ca * R, oz + sa * R);
      g.lineTo(P.x, P.y);
    }
    ink(g, 'stroke', K.field, 0.68);
    g.lineWidth = 1.5 * ls;
    g.stroke();
    g.restore();
    // Outline round the patch.
    g.beginPath();
    for (const t of patch) {
      const x = t % tiles;
      const z = (t - x) / tiles;
      const edge = (ax: number, az: number, bx: number, bz: number): void => {
        P.at(ax, az);
        g.moveTo(P.x, P.y);
        P.at(bx, bz);
        g.lineTo(P.x, P.y);
      };
      if (!have(x, z - 1)) edge(x, z, x + 1, z);
      if (!have(x, z + 1)) edge(x, z + 1, x + 1, z + 1);
      if (!have(x - 1, z)) edge(x, z, x, z + 1);
      if (!have(x + 1, z)) edge(x + 1, z, x + 1, z + 1);
    }
    g.lineCap = 'round';
    ink(g, 'stroke', K.ink, 0.5);
    g.lineWidth = 1.5 * ls;
    g.stroke();
  }
}

// 5. Woods ---------------------------------------------------------------------------------------

function woods(c: Cx): void {
  const { g, inp, tiles, P, sc, make } = c;
  const glyphs = treeGlyphs(make, sc);
  g.globalAlpha = 1;
  for (let z = 0; z < tiles; z++) {
    for (let x = 0; x < tiles; x++) {
      const v = inp.woods[z * tiles + x]!;
      if (!v) continue;
      const species = Math.min(3, v >> 3);
      const stage = Math.min(3, v & 7);
      const variant = Math.floor(hash2(x, z, 3) * VARIANTS);
      const gl = glyphs[species]![variant * 4 + stage]!;
      P.at(x + 0.5 + (hash2(x, z, 4) - 0.5) * 0.5, z + 0.85 + (hash2(x, z, 6) - 0.5) * 0.3);
      g.drawImage(
        gl.canvas as unknown as CanvasImageSource,
        gl.sx,
        gl.sy,
        gl.w,
        gl.h,
        Math.round(P.x - gl.ax),
        Math.round(P.y - gl.ay),
        gl.w,
        gl.h,
      );
    }
  }
}

// 6. Roads ---------------------------------------------------------------------------------------

interface RoadStyle {
  width: number;
  casing: boolean;
  fill: number;
  edge: number;
  dash: boolean;
}

/** Style per road id; an unknown id reads as a lane. */
const ROAD_STYLE: Record<string, RoadStyle> = {
  path: { width: 0.2, casing: false, fill: K.path, edge: K.path, dash: true },
  lane: { width: 0.42, casing: false, fill: K.ink, edge: K.ink, dash: false },
  street: { width: 0.6, casing: true, fill: K.road, edge: K.ink, dash: false },
  avenue: { width: 0.9, casing: true, fill: K.road, edge: K.ink, dash: false },
};
const ROAD_RANK = ['path', 'lane', 'street', 'avenue'];

function roads(c: Cx): void {
  const { g, inp, tiles, P, sc, ls } = c;
  const idOf = new Map<number, string>();
  for (const r of roadTable) idOf.set(r.layerValue, r.id);
  const cls = (v: number): number => {
    const id = idOf.get(v) ?? 'lane';
    const i = ROAD_RANK.indexOf(id);
    return i < 0 ? 1 : i;
  };
  const at = (x: number, z: number): number =>
    x < 0 || z < 0 || x >= tiles || z >= tiles ? 0 : inp.roads[z * tiles + x]!;
  const segs: number[][] = ROAD_RANK.map(() => []);
  const ticks: number[] = [];
  const link = (x: number, z: number, nx: number, nz: number): void => {
    const a = at(x, z);
    const b = at(nx, nz);
    const k = Math.min(cls(a), cls(b));
    segs[k]!.push(x + 0.5, z + 0.5, nx + 0.5, nz + 0.5);
    // A bridge: ticks where the road leaves the water.
    const wa = inp.water[z * tiles + x]! !== 0;
    const wb = inp.water[nz * tiles + nx]! !== 0;
    if (wa !== wb) {
      const mx = (x + nx + 1) / 2;
      const mz = (z + nz + 1) / 2;
      const dx = nx - x;
      const dz = nz - z;
      const l = Math.hypot(dx, dz);
      ticks.push(mx, mz, -dz / l, dx / l, k);
    }
  };
  for (let z = 0; z < tiles; z++) {
    for (let x = 0; x < tiles; x++) {
      if (!at(x, z)) continue;
      let any = false;
      const e = at(x + 1, z) !== 0;
      const s = at(x, z + 1) !== 0;
      const go = (nx: number, nz: number): void => {
        link(x, z, nx, nz);
        any = true;
      };
      if (e) go(x + 1, z);
      if (s) go(x, z + 1);
      if (!e && !s && at(x + 1, z + 1)) go(x + 1, z + 1);
      if (!s && !at(x - 1, z) && at(x - 1, z + 1)) go(x - 1, z + 1);
      if (!any) {
        const w = at(x - 1, z) || at(x, z - 1) || at(x - 1, z - 1) || at(x + 1, z - 1) || at(x - 1, z + 1);
        if (!w) segs[cls(at(x, z))]!.push(x + 0.5, z + 0.5, x + 0.5, z + 0.5 + 0.001);
      }
    }
  }
  const trace = (list: number[]): void => {
    g.beginPath();
    for (let i = 0; i < list.length; i += 4) {
      P.at(list[i]!, list[i + 1]!);
      g.moveTo(P.x, P.y);
      P.at(list[i + 2]!, list[i + 3]!);
      g.lineTo(P.x, P.y);
    }
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.globalAlpha = 1;
  const styleOf = (k: number): RoadStyle => ROAD_STYLE[ROAD_RANK[k]!]!;
  // Casings first (widest class first), then fills, so junctions merge cleanly.
  for (let k = ROAD_RANK.length - 1; k >= 0; k--) {
    const st = styleOf(k);
    if (!st.casing || !segs[k]!.length) continue;
    trace(segs[k]!);
    ink(g, 'stroke', st.edge, 0.95);
    g.lineWidth = st.width * sc + 3 * ls;
    g.setLineDash([]);
    g.stroke();
  }
  for (let k = ROAD_RANK.length - 1; k >= 0; k--) {
    const st = styleOf(k);
    if (!segs[k]!.length) continue;
    trace(segs[k]!);
    ink(g, 'stroke', st.fill, st.casing ? 1 : 0.9);
    g.lineWidth = st.casing ? st.width * sc : Math.max(st.width * sc, 2 * ls);
    g.setLineDash(st.dash ? [3.2 * ls, 3 * ls] : []);
    g.stroke();
  }
  g.setLineDash([]);
  // Bridge ticks.
  if (ticks.length) {
    g.beginPath();
    for (let i = 0; i < ticks.length; i += 5) {
      const st = styleOf(ticks[i + 4]!);
      const half = (st.width * sc) / 2 + 2.5 * ls;
      const [mx, mz, nx, nz] = [ticks[i]!, ticks[i + 1]!, ticks[i + 2]!, ticks[i + 3]!];
      P.at(mx, mz);
      const px = P.x;
      const py = P.y;
      for (const off of [-1.2, 1.2]) {
        // Two ticks across the road, one either side of the bank line (along is perpendicular to the tick).
        const ax = -nz * off * ls;
        const ay = nx * off * ls;
        g.moveTo(px + ax - nx * half, py + ay - nz * half);
        g.lineTo(px + ax + nx * half, py + ay + nz * half);
      }
    }
    ink(g, 'stroke', K.ink, 0.95);
    g.lineWidth = 1.6 * ls;
    g.stroke();
  }
}

// 7. Roofs and 8. plans --------------------------------------------------------------------------

function rectPath(c: Cx, r: EndpaperRoof, inset: number, dx = 0, dz = 0): void {
  const { g, P } = c;
  const x0 = r.x + inset + dx;
  const z0 = r.z + inset + dz;
  const x1 = r.x + r.w - inset + dx;
  const z1 = r.z + r.d - inset + dz;
  P.at(x0, z0);
  g.moveTo(P.x, P.y);
  P.at(x1, z0);
  g.lineTo(P.x, P.y);
  P.at(x1, z1);
  g.lineTo(P.x, P.y);
  P.at(x0, z1);
  g.lineTo(P.x, P.y);
  g.closePath();
}

function roofs(c: Cx): void {
  const { g, inp, P, ls } = c;
  const list = inp.roofs;
  if (!list.length) return;
  g.lineJoin = 'round';
  g.beginPath();
  for (const r of list) rectPath(c, r, 0.05, 0.22, 0.22);
  ink(g, 'fill', K.ink, 0.2);
  g.fill();
  g.beginPath();
  for (const r of list) rectPath(c, r, 0.05);
  ink(g, 'fill', K.roof, 1);
  g.fill();
  // A touch of tone per roof, so rows do not look stamped.
  for (let i = 0; i < list.length; i++) {
    const r = list[i]!;
    const h = hash2(r.x, r.z, 19);
    g.beginPath();
    rectPath(c, r, 0.05);
    ink(g, 'fill', h < 0.5 ? K.paperLight : K.roofInk, 0.04 + h * 0.1);
    g.fill();
  }
  g.beginPath();
  for (const r of list) rectPath(c, r, 0.05);
  ink(g, 'stroke', K.roofInk, 0.95);
  g.lineWidth = 1.6 * ls;
  g.stroke();
  // Hipped roofs seen from above: a ridge along the long axis (a point on a square roof) and hips
  // to the corners, with the faces turned away from the light (south and east) a shade darker, so
  // a roof reads as a roof and a row as a row, not as a stack of crates.
  const faces = (r: EndpaperRoof): { ridge: [number, number, number, number]; c: number[] } => {
    const x0 = r.x + 0.05;
    const z0 = r.z + 0.05;
    const x1 = r.x + r.w - 0.05;
    const z1 = r.z + r.d - 0.05;
    const h = Math.min(x1 - x0, z1 - z0) / 2;
    const ridge: [number, number, number, number] =
      x1 - x0 >= z1 - z0
        ? [x0 + h, (z0 + z1) / 2, x1 - h, (z0 + z1) / 2]
        : [(x0 + x1) / 2, z0 + h, (x0 + x1) / 2, z1 - h];
    return { ridge, c: [x0, z0, x1, z1] };
  };
  const poly = (pts: number[]): void => {
    for (let i = 0; i < pts.length; i += 2) {
      P.at(pts[i]!, pts[i + 1]!);
      if (i) g.lineTo(P.x, P.y);
      else g.moveTo(P.x, P.y);
    }
    g.closePath();
  };
  g.beginPath();
  for (const r of list) {
    const {
      ridge: [ax, az, bx, bz],
      c: [x0, z0, x1, z1],
    } = faces(r);
    // The south face (from the ridge down to z1) and the east face (to x1).
    poly([x0!, z1!, x1!, z1!, bx, bz, ax, az]);
    poly([x1!, z0!, x1!, z1!, bx, bz]);
  }
  ink(g, 'fill', K.roofInk, 0.22);
  g.fill();
  g.beginPath();
  for (const r of list) {
    const {
      ridge: [ax, az, bx, bz],
      c: [x0, z0, x1, z1],
    } = faces(r);
    P.at(ax, az);
    g.moveTo(P.x, P.y);
    P.at(bx, bz);
    g.lineTo(P.x, P.y);
    for (const [cx, cz, ex, ez] of [
      [x0!, z0!, ax, az],
      [x0!, z1!, ax, az],
      [x1!, z0!, bx, bz],
      [x1!, z1!, bx, bz],
    ] as const) {
      P.at(cx, cz);
      g.moveTo(P.x, P.y);
      P.at(ex, ez);
      g.lineTo(P.x, P.y);
    }
  }
  ink(g, 'stroke', K.roofInk, 0.4);
  g.lineWidth = 1.1 * ls;
  g.stroke();
}

function plans(c: Cx): void {
  const { g, inp, P, ls } = c;
  const list = inp.plans;
  if (!list.length) return;
  g.beginPath();
  for (const r of list) rectPath(c, r, 0.05);
  ink(g, 'fill', K.blueprintWash, 0.75);
  g.fill();
  g.beginPath();
  for (const r of list) {
    P.at(r.x + 0.05, r.z + 0.05);
    g.moveTo(P.x, P.y);
    P.at(r.x + r.w - 0.05, r.z + r.d - 0.05);
    g.lineTo(P.x, P.y);
    P.at(r.x + r.w - 0.05, r.z + 0.05);
    g.moveTo(P.x, P.y);
    P.at(r.x + 0.05, r.z + r.d - 0.05);
    g.lineTo(P.x, P.y);
  }
  ink(g, 'stroke', K.blueprint, 0.45);
  g.lineWidth = 1.5 * ls;
  g.stroke();
  g.beginPath();
  for (const r of list) rectPath(c, r, 0.05);
  ink(g, 'stroke', K.blueprint, 0.95);
  g.lineWidth = 1.8 * ls;
  g.setLineDash([4 * ls, 3 * ls]);
  g.stroke();
  g.setLineDash([]);
}

// 9. Inks ------------------------------------------------------------------------------------------

function inkLayer(c: Cx, layer: { tiles: Uint16Array; color: number } | undefined, salt: number): void {
  if (!layer) return;
  const { g, tiles, P, sc } = c;
  let max = 0;
  for (let i = 0; i < layer.tiles.length; i++) if (layer.tiles[i]! > max) max = layer.tiles[i]!;
  if (!max) return;
  const bins: number[][] = [[], [], []];
  const strong = (x: number, z: number): number => {
    if (x < 0 || z < 0 || x >= tiles || z >= tiles) return 0;
    const r = layer.tiles[z * tiles + x]! / max;
    return r < 0.12 ? 0 : r;
  };
  const wob = (x: number, z: number, s: number): number => (hash2(x, z, salt + s) - 0.5) * 0.35;
  for (let z = 0; z < tiles; z++) {
    for (let x = 0; x < tiles; x++) {
      const r = strong(x, z);
      if (!r) continue;
      const bin = r < 0.4 ? 0 : r < 0.7 ? 1 : 2;
      let any = false;
      for (const [dx, dz] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [-1, 1],
      ] as const) {
        if (strong(x + dx, z + dz)) {
          bins[bin]!.push(
            x + 0.5 + wob(x, z, 1),
            z + 0.5 + wob(x, z, 2),
            x + dx + 0.5 + wob(x + dx, z + dz, 1),
            z + dz + 0.5 + wob(x + dx, z + dz, 2),
          );
          any = true;
        }
      }
      if (!any) bins[bin]!.push(x + 0.5 + wob(x, z, 1), z + 0.5, x + 0.5 + 0.35, z + 0.5 + wob(x, z, 2));
    }
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let b = 0; b < 3; b++) {
    const list = bins[b]!;
    if (!list.length) continue;
    g.beginPath();
    for (let i = 0; i < list.length; i += 4) {
      P.at(list[i]!, list[i + 1]!);
      g.moveTo(P.x, P.y);
      P.at(list[i + 2]!, list[i + 3]!);
      g.lineTo(P.x, P.y);
    }
    ink(g, 'stroke', layer.color, 0.3 + b * 0.1);
    g.lineWidth = sc * (0.3 + b * 0.22);
    g.stroke();
  }
}

// 10. Labels ---------------------------------------------------------------------------------------

function halo(c: Cx, text: string, fs: number, k = 0.22): void {
  const { g } = c;
  g.lineJoin = 'round';
  g.lineWidth = fs * k;
  ink(g, 'stroke', K.halo, 0.9);
  g.strokeText(text, 0, 0);
}

function placeLabel(
  c: Cx,
  text: string,
  x: number,
  z: number,
  angle: number,
  kind: 'place' | 'street',
): void {
  const { g, P, sc } = c;
  const fs = Math.max(11, sc * (kind === 'place' ? 1.6 : 1.25));
  g.font = kind === 'place' ? `700 ${fs}px ${MAP_FONT}` : `italic 400 ${fs}px ${MAP_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  P.at(x, z);
  g.save();
  g.translate(P.x, P.y);
  g.rotate(upright(angle));
  halo(c, text, fs);
  ink(g, 'fill', K.ink, 1);
  g.fillText(text, 0, 0);
  g.restore();
}

/**
 * Letters the valley's name along the river, the old map way: spaced capitals set beside the water
 * on the side away from the town, following the river's bend, reading left to right (or top to
 * bottom on a river that runs down the page). Straight at (x, z) where there is no river.
 */
function valleyLabel(c: Cx, text: string, x: number, z: number, angle: number): void {
  const { g, inp, tiles, P, sc } = c;
  const caps = text.toUpperCase();
  let fs = sc * 3.1;
  const setFont = (): void => {
    g.font = `italic 400 ${fs}px ${MAP_FONT}`;
  };
  setFont();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const line = riverCenterline(inp.water, tiles);
  const letters = [...caps];
  const track = 0.42;
  const widths = (): number[] => letters.map((ch) => g.measureText(ch).width + fs * track);
  let w = widths();
  let total = w.reduce((s2, v) => s2 + v, 0) - fs * track;
  const straight = (): void => {
    P.at(x, z);
    g.save();
    g.translate(P.x, P.y);
    g.rotate(upright(angle));
    halo(c, caps, fs);
    ink(g, 'fill', K.waterInk, 1);
    g.fillText(caps, 0, 0);
    g.restore();
  };
  if (!line) return straight();
  // The centerline in pixels, smoothed so the lettering flows rather than wobbles.
  const n = line.pts.length / 2;
  let px: number[] = [];
  let py: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = line.pts[2 * i]!;
    const v = line.pts[2 * i + 1]!;
    P.at(line.axis === 'x' ? u : v, line.axis === 'x' ? v : u);
    px.push(P.x);
    py.push(P.y);
  }
  for (let pass = 0; pass < 6; pass++) {
    const qx = px.slice();
    const qy = py.slice();
    for (let i = 1; i < n - 1; i++) {
      qx[i] = (px[i - 1]! + 2 * px[i]! + px[i + 1]!) / 4;
      qy[i] = (py[i - 1]! + 2 * py[i]! + py[i + 1]!) / 4;
    }
    px = qx;
    py = qy;
  }
  const arcOf = (): number[] => {
    const arc = [0];
    for (let i = 1; i < px.length; i++)
      arc.push(arc[i - 1]! + Math.hypot(px[i]! - px[i - 1]!, py[i]! - py[i - 1]!));
    return arc;
  };
  let arc = arcOf();
  let curveLen = arc[n - 1]!;
  if (curveLen < total * 1.3) {
    fs = Math.max(sc * 1.4, (fs * curveLen) / (total * 1.4));
    setFont();
    w = widths();
    total = w.reduce((s2, v) => s2 + v, 0) - fs * track;
  }
  if (curveLen < total * 1.05) return straight();
  // Read left to right: reverse the path if its run would set the letters upside down.
  const chord = Math.atan2(py[n - 1]! - py[0]!, px[n - 1]! - px[0]!);
  if (Math.abs(upright(chord) - chord) > 1e-6) {
    px.reverse();
    py.reverse();
    arc = arcOf();
    curveLen = arc[n - 1]!;
  }
  const sample = (s0: number): [number, number] => {
    const s1 = Math.min(Math.max(s0, 0), curveLen);
    let i = 1;
    while (i < arc.length - 1 && arc[i]! < s1) i++;
    const t = (s1 - arc[i - 1]!) / Math.max(1e-6, arc[i]! - arc[i - 1]!);
    return [px[i - 1]! + (px[i]! - px[i - 1]!) * t, py[i - 1]! + (py[i]! - py[i - 1]!) * t];
  };
  // The stretch nearest the label's x, z, kept inside the curve with a little room at each end.
  P.at(x, z);
  const lx = P.x;
  const ly = P.y;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const d = (px[i]! - lx) ** 2 + (py[i]! - ly) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const room = Math.min(fs * 2, (curveLen - total) / 2);
  const start = Math.min(Math.max(arc[best]! - total / 2, room), curveLen - total - room);
  // Beside the water, on the side away from the town (the roofs' middle), or the north or west side.
  let tx = 0;
  let tz = 0;
  for (const r of inp.roofs) {
    tx += r.x + r.w / 2;
    tz += r.z + r.d / 2;
  }
  const [mx, my] = sample(start + total / 2);
  const [m0x, m0y] = sample(start + total / 2 - fs);
  const [m1x, m1y] = sample(start + total / 2 + fs);
  let nx = -(m1y - m0y);
  let ny = m1x - m0x;
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;
  let side = 1;
  if (inp.roofs.length) {
    P.at(tx / inp.roofs.length, tz / inp.roofs.length);
    if ((P.x - mx) * nx + (P.y - my) * ny > 0) side = -1;
  } else if (ny > 0) side = -1;
  // The river's half width there, from the water layer, plus a little air.
  let half = 1;
  for (let k = 1; k < 6; k++) {
    const tX = Math.floor(mx / sc - ENDPAPER_MARGIN + (nx * k) / 2);
    const tZ = Math.floor(my / sc - ENDPAPER_MARGIN + (ny * k) / 2);
    if (tX < 0 || tZ < 0 || tX >= tiles || tZ >= tiles) break;
    const v = inp.water[tZ * tiles + tX]!;
    if (v === 1 || v === 2 || v === 4) half = k / 2 + 0.5;
  }
  const off = side * (half * sc + fs * 0.78);
  let pos = start;
  for (let i = 0; i < letters.length; i++) {
    const mid = pos + (w[i]! - fs * track) / 2;
    pos += w[i]!;
    if (letters[i] === ' ') continue;
    const [cx, cy] = sample(mid);
    const [ax, ay] = sample(mid - fs * 0.8);
    const [bx, by] = sample(mid + fs * 0.8);
    const a2 = Math.atan2(by - ay, bx - ax);
    g.save();
    g.translate(cx - Math.sin(a2) * off, cy + Math.cos(a2) * off);
    g.rotate(a2);
    halo(c, letters[i]!, fs, 0.16);
    ink(g, 'fill', K.waterInk, 1);
    g.fillText(letters[i]!, 0, 0);
    g.restore();
  }
}

function labels(c: Cx): void {
  for (const l of c.inp.labels) {
    if (l.kind === 'valley') valleyLabel(c, l.text, l.x, l.z, l.angle);
  }
  for (const l of c.inp.labels) {
    if (l.kind !== 'valley') placeLabel(c, l.text, l.x, l.z, l.angle, l.kind);
  }
}

// 11. Border, compass, scale -------------------------------------------------------------------

function border(c: Cx): void {
  const { g, tiles, P, sc, ls } = c;
  const M = ENDPAPER_MARGIN;
  const ring = (inset: number): void => {
    const lo = -M + inset;
    const hi = tiles + M - inset;
    const steps = 48;
    g.beginPath();
    const edge = (x0: number, z0: number, x1: number, z1: number, first: boolean): void => {
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        P.at(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
        if (first && i === 0) g.moveTo(P.x, P.y);
        else g.lineTo(P.x, P.y);
      }
    };
    edge(lo, lo, hi, lo, true);
    edge(hi, lo, hi, hi, false);
    edge(hi, hi, lo, hi, false);
    edge(lo, hi, lo, lo, false);
    g.closePath();
  };
  g.lineJoin = 'round';
  ink(g, 'stroke', K.ink, 0.85);
  ring(1.6);
  g.lineWidth = 3.2 * ls;
  g.stroke();
  ring(2.7);
  g.lineWidth = 1.5 * ls;
  g.stroke();
  // Corner ornaments: a small diamond with a dot at each inner corner.
  for (const [cx, cz] of [
    [-M + 1.6, -M + 1.6],
    [tiles + M - 1.6, -M + 1.6],
    [-M + 1.6, tiles + M - 1.6],
    [tiles + M - 1.6, tiles + M - 1.6],
  ] as const) {
    P.at(cx, cz);
    const r = sc * 0.95;
    g.beginPath();
    g.moveTo(P.x, P.y - r);
    g.lineTo(P.x + r, P.y);
    g.lineTo(P.x, P.y + r);
    g.lineTo(P.x - r, P.y);
    g.closePath();
    ink(g, 'fill', K.paper, 1);
    g.fill();
    ink(g, 'stroke', K.ink, 0.9);
    g.lineWidth = 1.8 * ls;
    g.stroke();
    g.beginPath();
    g.arc(P.x, P.y, r * 0.28, 0, Math.PI * 2);
    ink(g, 'fill', K.ink, 0.9);
    g.fill();
  }
  // Compass rose, bottom left of the margin: an eight-pointed star in a ring, north up.
  const rx = -M + 7.8;
  const rz = tiles + M - 7.8;
  P.at(rx, rz);
  const cxp = P.x;
  const cyp = P.y;
  const R = sc * 4.6;
  g.beginPath();
  g.arc(cxp, cyp, R * 0.72, 0, Math.PI * 2);
  ink(g, 'stroke', K.ink, 0.7);
  g.lineWidth = 1.5 * ls;
  g.stroke();
  const pt = (ang: number, len: number): [number, number] => [
    cxp + Math.sin(ang) * len,
    cyp - Math.cos(ang) * len,
  ];
  for (let k = 0; k < 8; k++) {
    const major = k % 2 === 0;
    const a = (k * Math.PI) / 4;
    const len = major ? R : R * 0.62;
    const half = major ? 0.2 : 0.16;
    const [tx, ty] = pt(a, len);
    const [lx, ly] = pt(a - Math.PI / 2, R * half);
    const [rx2, ry2] = pt(a + Math.PI / 2, R * half);
    g.beginPath();
    g.moveTo(tx, ty);
    g.lineTo(lx, ly);
    g.lineTo(cxp, cyp);
    g.closePath();
    ink(g, 'fill', K.ink, major ? 0.9 : 0.45);
    g.fill();
    g.beginPath();
    g.moveTo(tx, ty);
    g.lineTo(rx2, ry2);
    g.lineTo(cxp, cyp);
    g.closePath();
    ink(g, 'fill', K.paperLight, 1);
    g.fill();
    g.beginPath();
    g.moveTo(tx, ty);
    g.lineTo(lx, ly);
    g.lineTo(rx2, ry2);
    g.closePath();
    ink(g, 'stroke', K.ink, 0.85);
    g.lineWidth = 1.3 * ls;
    g.stroke();
  }
  g.font = `700 ${sc * 1.5}px ${MAP_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  ink(g, 'fill', K.ink, 1);
  g.fillText('N', cxp, cyp - R - sc * 1.1);
  // Scale bar, bottom right of the margin: 40 tiles of 4 m.
  const bx = tiles + M - 7 - 40;
  const bz = tiles + M - 5.2;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    P.at(bx + i * 10, bz);
    const x0 = P.x;
    const y0 = P.y;
    P.at(bx + (i + 1) * 10, bz + 0.7);
    g.rect(x0, y0, P.x - x0, P.y - y0);
  }
  ink(g, 'stroke', K.ink, 0.9);
  g.lineWidth = 1.5 * ls;
  g.stroke();
  g.beginPath();
  for (const i of [0, 2]) {
    P.at(bx + i * 10, bz);
    const x0 = P.x;
    const y0 = P.y;
    P.at(bx + (i + 1) * 10, bz + 0.7);
    g.rect(x0, y0, P.x - x0, P.y - y0);
  }
  ink(g, 'fill', K.ink, 0.8);
  g.fill();
  g.font = `italic 400 ${sc * 1.25}px ${MAP_FONT}`;
  ink(g, 'fill', K.ink, 1);
  P.at(bx + 20, bz - 1.3);
  g.fillText('160 meters', P.x, P.y);
}

/** Draws the whole map onto `g` (a `size` square context). */
export function drawMap(g: Ctx, inp: EndpaperInput, size: number, opts: DrawOpts = {}): void {
  const span = endpaperSpan(inp.tiles);
  const P = new Proj(size, span, ENDPAPER_MARGIN);
  const c: Cx = {
    g,
    inp,
    size,
    tiles: inp.tiles,
    P,
    sc: size / span,
    ls: size / 2048,
    make: opts.makeCanvas ?? defaultMakeCanvas,
  };
  const t = opts.timings;
  const run = (name: string, fn: (c: Cx) => void): void => {
    const t0 = t ? performance.now() : 0;
    g.save();
    fn(c);
    g.restore();
    g.globalAlpha = 1;
    // Timing mode only: reading a pixel forces the queued drawing to run, so the pass owns its cost.
    if (t) {
      g.getImageData(0, 0, 1, 1);
      t[name] = performance.now() - t0;
    }
  };
  run('parchment', parchment);
  run('relief', relief);
  run('water', water);
  run('fields', fields);
  run('woods', woods);
  run('roads', roads);
  run('roofs', roofs);
  run('plans', plans);
  run('inks', (cx) => {
    inkLayer(cx, cx.inp.inks.goods, 5);
    inkLayer(cx, cx.inp.inks.footfall, 9);
  });
  run('labels', labels);
  run('border', border);
}
