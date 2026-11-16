// V3D: the endpaper map's pre-rendered marks: little trees (stamped thousands of times with
// drawImage) and the paper grain tile. Made once per worker and cached; all of it deterministic.
import { endpaperInk as K } from '../../../../packages/art/src/palette';
import { hash2 } from './endpaperGeo';

/** The part of a 2D context the glyphs and the drawing use (an OffscreenCanvas's, or a test's fake). */
export type Ctx = OffscreenCanvasRenderingContext2D;
/** A canvas the glyphs draw into: real OffscreenCanvas, or a fake in tests. */
export interface GlyphCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): Ctx | null;
}
export type MakeCanvas = (w: number, h: number) => GlyphCanvas;

export const defaultMakeCanvas: MakeCanvas = (w, h) => new OffscreenCanvas(w, h) as unknown as GlyphCanvas;

const cssCache = new Map<number, string>();
/** A palette number as a CSS color. */
export function css(n: number): string {
  let s = cssCache.get(n);
  if (!s) cssCache.set(n, (s = `#${n.toString(16).padStart(6, '0')}`));
  return s;
}

/** One tree mark: a canvas, and where the tree's foot sits in it. */
export interface Glyph {
  canvas: GlyphCanvas;
  ax: number;
  ay: number;
}

export const STAGE_SCALE = [0.5, 0.78, 1, 1.18] as const;
export const VARIANTS = 3;

/** Smooth closed lump through `n` points round (cx, cy) with radius rx, ry and a hashed wobble. */
function lump(g: Ctx, cx: number, cy: number, rx: number, ry: number, seed: number, n: number): void {
  const pts: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const r = 0.82 + 0.3 * hash2(seed, k, 5);
    pts.push(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r);
  }
  g.beginPath();
  g.moveTo((pts[2 * n - 2]! + pts[0]!) / 2, (pts[2 * n - 1]! + pts[1]!) / 2);
  for (let k = 0; k < n; k++) {
    const nk = (k + 1) % n;
    g.quadraticCurveTo(
      pts[2 * k]!,
      pts[2 * k + 1]!,
      (pts[2 * k]! + pts[2 * nk]!) / 2,
      (pts[2 * k + 1]! + pts[2 * nk + 1]!) / 2,
    );
  }
  g.closePath();
}

function drawTree(g: Ctx, species: number, stage: number, variant: number, ax: number, ay: number, sc: number): void {
  const k = STAGE_SCALE[stage]!;
  const lw = Math.max(1, sc * 0.11);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = lw;
  g.strokeStyle = css(K.ink);
  const seed = species * 17 + variant * 5 + stage;
  if (stage === 0) {
    // A sapling: a stick and a small tuft.
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(ax, ay - sc * 0.32);
    g.strokeStyle = css(K.trunk);
    g.stroke();
    g.fillStyle = css(species === 3 ? K.pine : species === 2 ? K.birch : K.oak);
    g.strokeStyle = css(K.ink);
    g.globalAlpha = 0.9;
    if (species === 3) {
      g.beginPath();
      g.moveTo(ax, ay - sc * 0.62);
      g.lineTo(ax + sc * 0.2, ay - sc * 0.22);
      g.lineTo(ax - sc * 0.2, ay - sc * 0.22);
      g.closePath();
    } else lump(g, ax, ay - sc * 0.42, sc * 0.2, sc * 0.18, seed, 6);
    g.fill();
    g.stroke();
    g.globalAlpha = 1;
    return;
  }
  if (species === 3) {
    // Pine: a trunk stub and tiers of triangles, shadow on the right half.
    const tiers = stage === 1 ? 2 : 3;
    const th = sc * 0.3 * k * (1 + 0.1 * (variant - 1));
    const bw = sc * 0.46 * k;
    g.fillStyle = css(K.trunk);
    g.fillRect(ax - sc * 0.05, ay - sc * 0.2, sc * 0.1, sc * 0.2);
    for (let t = 0; t < tiers; t++) {
      const by = ay - sc * 0.12 - t * th * 0.8;
      const w = bw * (1 - t * 0.22);
      g.beginPath();
      g.moveTo(ax, by - th * 1.25);
      g.lineTo(ax + w, by);
      g.lineTo(ax - w, by);
      g.closePath();
      g.fillStyle = css(K.pine);
      g.fill();
      g.beginPath();
      g.moveTo(ax, by - th * 1.25);
      g.lineTo(ax + w, by);
      g.lineTo(ax, by);
      g.closePath();
      g.fillStyle = css(K.pineDark);
      g.fill();
      g.beginPath();
      g.moveTo(ax, by - th * 1.25);
      g.lineTo(ax + w, by);
      g.lineTo(ax - w, by);
      g.closePath();
      g.stroke();
    }
    return;
  }
  const birch = species === 2;
  const rx = sc * (birch ? 0.3 : 0.5) * k * (0.92 + 0.08 * variant);
  const ry = sc * (birch ? 0.46 : 0.44) * k;
  const trunkH = sc * (birch ? 0.42 : 0.26) * k;
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(ax, ay - trunkH - ry * 0.4);
  g.lineWidth = Math.max(1.2, sc * (birch ? 0.1 : 0.15));
  g.strokeStyle = css(birch ? K.paperLight : K.trunk);
  g.stroke();
  if (birch) {
    g.lineWidth = Math.max(1, sc * 0.045);
    g.strokeStyle = css(K.ink);
    g.beginPath();
    g.moveTo(ax - sc * 0.03, ay - trunkH * 0.5);
    g.lineTo(ax + sc * 0.03, ay - trunkH * 0.5);
    g.stroke();
  }
  const cy = ay - trunkH - ry * 0.7;
  g.lineWidth = lw;
  g.strokeStyle = css(K.ink);
  // Shadow side first (the whole crown dark), then the lit part clipped inside it.
  lump(g, ax, cy, rx, ry, seed, birch ? 6 : 7);
  g.fillStyle = css(birch ? K.birchDark : K.oakDark);
  g.fill();
  g.save();
  g.clip();
  lump(g, ax - rx * 0.2, cy - ry * 0.18, rx * 0.88, ry * 0.88, seed, birch ? 6 : 7);
  g.fillStyle = css(birch ? K.birch : K.oak);
  g.fill();
  g.restore();
  lump(g, ax, cy, rx, ry, seed, birch ? 6 : 7);
  g.stroke();
}

const glyphCache = new WeakMap<MakeCanvas, Map<string, Glyph[]>>();

/** The tree marks for a map scale: `[species 0..3][variant * 4 + stage]` (species 0 reads as oak). */
export function treeGlyphs(make: MakeCanvas, sc: number): Glyph[][] {
  let perMake = glyphCache.get(make);
  if (!perMake) glyphCache.set(make, (perMake = new Map()));
  const key = sc.toFixed(3);
  const hit = perMake.get(key);
  if (hit) return hit as unknown as Glyph[][];
  const out: Glyph[][] = [];
  const W = Math.ceil(sc * 1.5) + 4;
  const H = Math.ceil(sc * 2.1) + 4;
  for (let species = 0; species < 4; species++) {
    const row: Glyph[] = [];
    for (let v = 0; v < VARIANTS; v++) {
      for (let stage = 0; stage < 4; stage++) {
        const canvas = make(W, H);
        const g = canvas.getContext('2d');
        const ax = W / 2;
        const ay = H - 2;
        if (g) drawTree(g, species === 0 ? 1 : species, stage, v, ax, ay, sc);
        row.push({ canvas, ax, ay });
      }
    }
    out.push(row);
  }
  perMake.set(key, out as unknown as Glyph[]);
  return out;
}

const grainCache = new WeakMap<MakeCanvas, GlyphCanvas>();

/** A 256 px tile of paper grain: faint warm speckle and a few short fibers (repeats; deterministic). */
export function grainTile(make: MakeCanvas): GlyphCanvas {
  const hit = grainCache.get(make);
  if (hit) return hit;
  const N = 256;
  const canvas = make(N, N);
  const g = canvas.getContext('2d');
  if (g) {
    const img = g.createImageData(N, N);
    const d = img.data;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const h = hash2(x, y, 31);
        const o = (y * N + x) * 4;
        const dark = h > 0.55;
        d[o] = dark ? 110 : 255;
        d[o + 1] = dark ? 84 : 250;
        d[o + 2] = dark ? 50 : 235;
        d[o + 3] = dark ? Math.floor((h - 0.55) * 70) : Math.floor((0.55 - h) * 36);
      }
    }
    g.putImageData(img, 0, 0);
    g.lineCap = 'round';
    g.strokeStyle = css(K.inkFaint);
    g.lineWidth = 0.8;
    g.globalAlpha = 0.1;
    g.beginPath();
    for (let i = 0; i < 160; i++) {
      const x = hash2(i, 1, 7) * N;
      const y = hash2(i, 2, 7) * N;
      const a = hash2(i, 3, 7) * Math.PI;
      const l = 5 + hash2(i, 4, 7) * 14;
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    }
    g.stroke();
    g.globalAlpha = 1;
  }
  grainCache.set(make, canvas);
  return canvas;
}
