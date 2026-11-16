// V3D: geometry helpers for the endpaper map's drawing (no canvas here, so they are unit tested
// without a context): a stable hash, the hand-ink warp, marching squares with chained outlines,
// connected patches, and the river's centerline. Drawing happens in endpaperDraw.ts.

/** Stable value in [0, 1) per integer pair (visual variety only; the same as render/coords.ts's hash). */
export function hash2(x: number, z: number, salt = 0): number {
  let h = Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(z + 0x7f4a + salt, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/**
 * Maps tile coordinates to canvas pixels with a slow hand-ink wobble: a coarse lattice of offsets
 * (one per 4 tiles) interpolated smoothly, so every line drifts a fraction of a pixel together and
 * nothing is jaggy. The wobble depends on position only, so a redraw never shimmers.
 */
export class Proj {
  /** Result of the last `at`. */
  x = 0;
  y = 0;
  private readonly n: number;
  private readonly dx: Float32Array;
  private readonly dy: Float32Array;
  readonly sc: number;

  constructor(
    readonly size: number,
    readonly span: number,
    readonly margin: number,
    amp = 0.1,
  ) {
    this.sc = size / span;
    this.n = Math.ceil(span / 4) + 3;
    this.dx = new Float32Array(this.n * this.n);
    this.dy = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        this.dx[j * this.n + i] = (hash2(i, j, 101) - 0.5) * 2 * amp;
        this.dy[j * this.n + i] = (hash2(i, j, 211) - 0.5) * 2 * amp;
      }
    }
  }

  /** Projects tile coords (x, z) to pixels into `this.x`, `this.y`. */
  at(x: number, z: number): void {
    const u = (x + this.margin) / 4;
    const v = (z + this.margin) / 4;
    const i = Math.max(0, Math.min(this.n - 2, Math.floor(u)));
    const j = Math.max(0, Math.min(this.n - 2, Math.floor(v)));
    let fu = u - i;
    let fv = v - j;
    fu = fu * fu * (3 - 2 * fu);
    fv = fv * fv * (3 - 2 * fv);
    const k = j * this.n + i;
    const a = this.dx[k]!;
    const b = this.dx[k + 1]!;
    const c = this.dx[k + this.n]!;
    const d = this.dx[k + this.n + 1]!;
    const wx = a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
    const e = this.dy[k]!;
    const f = this.dy[k + 1]!;
    const g = this.dy[k + this.n]!;
    const h = this.dy[k + this.n + 1]!;
    const wz = e + (f - e) * fu + (g - e) * fv + (e - f - g + h) * fu * fv;
    this.x = (x + wx + this.margin) * this.sc;
    this.y = (z + wz + this.margin) * this.sc;
  }
}

/** A field with `pad` cells of border round a `tiles` square: zero outside, or edge-replicated. */
export function padded(src: ArrayLike<number>, tiles: number, pad: number, replicate: boolean): Float32Array {
  const W = tiles + 2 * pad;
  const out = new Float32Array(W * W);
  for (let j = 0; j < W; j++) {
    for (let i = 0; i < W; i++) {
      let x = i - pad;
      let z = j - pad;
      if (x < 0 || z < 0 || x >= tiles || z >= tiles) {
        if (!replicate) continue;
        x = Math.min(tiles - 1, Math.max(0, x));
        z = Math.min(tiles - 1, Math.max(0, z));
      }
      out[j * W + i] = src[z * tiles + x]!;
    }
  }
  return out;
}

/** Passes of a separable [1 2 1] / 4 blur over a W x H field (edges replicate). */
export function blur(f: Float32Array, W: number, H: number, passes = 1): Float32Array {
  let a = f;
  for (let p = 0; p < passes; p++) {
    const t = new Float32Array(W * H);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const l = a[j * W + Math.max(0, i - 1)]!;
        const r = a[j * W + Math.min(W - 1, i + 1)]!;
        t[j * W + i] = (l + 2 * a[j * W + i]! + r) * 0.25;
      }
    }
    const o = new Float32Array(W * H);
    for (let j = 0; j < H; j++) {
      const jm = Math.max(0, j - 1);
      const jp = Math.min(H - 1, j + 1);
      for (let i = 0; i < W; i++) {
        o[j * W + i] = (t[jm * W + i]! + 2 * t[j * W + i]! + t[jp * W + i]!) * 0.25;
      }
    }
    a = o;
  }
  return a;
}

/** An outline: x, z pairs in grid cell coordinates, and whether it closes on itself. */
export interface Poly {
  pts: number[];
  closed: boolean;
}

/**
 * Marching squares at `level` over a W x H field (a sample is "in" at or above the level), chained
 * into outlines. Points sit on cell edges by linear interpolation, in grid coordinates (sample
 * (i, j) is at i, j).
 */
export function contours(f: Float32Array, W: number, H: number, level: number): Poly[] {
  const ne = W * H * 2;
  const ex = new Float32Array(ne);
  const ez = new Float32Array(ne);
  const adj0 = new Int32Array(ne).fill(-1);
  const adj1 = new Int32Array(ne).fill(-1);
  const mark = new Uint8Array(ne);
  const seen = new Uint8Array(ne);
  const touched: number[] = [];
  const edgeH = (i: number, j: number): number => {
    const id = (j * W + i) * 2;
    if (!mark[id]) {
      mark[id] = 1;
      touched.push(id);
      const a = f[j * W + i]!;
      const b = f[j * W + i + 1]!;
      ex[id] = i + (level - a) / (b - a);
      ez[id] = j;
    }
    return id;
  };
  const edgeV = (i: number, j: number): number => {
    const id = (j * W + i) * 2 + 1;
    if (!mark[id]) {
      mark[id] = 1;
      touched.push(id);
      const a = f[j * W + i]!;
      const b = f[(j + 1) * W + i]!;
      ex[id] = i;
      ez[id] = j + (level - a) / (b - a);
    }
    return id;
  };
  const link = (p: number, q: number): void => {
    if (adj0[p] === -1) adj0[p] = q;
    else adj1[p] = q;
    if (adj0[q] === -1) adj0[q] = p;
    else adj1[q] = p;
  };
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const va = f[j * W + i]!;
      const vb = f[j * W + i + 1]!;
      const vc = f[(j + 1) * W + i + 1]!;
      const vd = f[(j + 1) * W + i]!;
      const m = (va >= level ? 1 : 0) | (vb >= level ? 2 : 0) | (vc >= level ? 4 : 0) | (vd >= level ? 8 : 0);
      if (m === 0 || m === 15) continue;
      switch (m) {
        case 1:
        case 14:
          link(edgeV(i, j), edgeH(i, j));
          break;
        case 2:
        case 13:
          link(edgeH(i, j), edgeV(i + 1, j));
          break;
        case 3:
        case 12:
          link(edgeV(i, j), edgeV(i + 1, j));
          break;
        case 4:
        case 11:
          link(edgeV(i + 1, j), edgeH(i, j + 1));
          break;
        case 6:
        case 9:
          link(edgeH(i, j), edgeH(i, j + 1));
          break;
        case 7:
        case 8:
          link(edgeV(i, j), edgeH(i, j + 1));
          break;
        default: {
          // Saddle (5: a and c in; 10: b and d in): the center decides which pair joins.
          const center = (va + vb + vc + vd) * 0.25 >= level;
          if ((m === 5) === center) {
            link(edgeH(i, j), edgeV(i + 1, j));
            link(edgeV(i, j), edgeH(i, j + 1));
          } else {
            link(edgeV(i, j), edgeH(i, j));
            link(edgeV(i + 1, j), edgeH(i, j + 1));
          }
        }
      }
    }
  }
  const out: Poly[] = [];
  const walk = (start: number, closed: boolean): void => {
    const pts: number[] = [];
    let cur = start;
    for (;;) {
      seen[cur] = 1;
      pts.push(ex[cur]!, ez[cur]!);
      const n0 = adj0[cur]!;
      const n1 = adj1[cur]!;
      const next = n0 !== -1 && !seen[n0] ? n0 : n1 !== -1 && !seen[n1] ? n1 : -1;
      if (next === -1) break;
      cur = next;
    }
    out.push({ pts, closed });
  };
  for (const id of touched) if (!seen[id] && adj1[id] === -1) walk(id, false);
  for (const id of touched) if (!seen[id]) walk(id, true);
  return out;
}

/** Connected patches (4-neighbors) of the tiles `pick` accepts: a label per tile (0 none) and each patch's tile indexes. */
export function patches(
  mask: ArrayLike<number>,
  tiles: number,
  pick: (v: number) => boolean = (v) => v !== 0,
): { label: Int32Array; list: number[][] } {
  const label = new Int32Array(tiles * tiles);
  const list: number[][] = [];
  const stack: number[] = [];
  for (let s = 0; s < tiles * tiles; s++) {
    if (label[s] || !pick(mask[s]!)) continue;
    const id = list.length + 1;
    const mine: number[] = [];
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const t = stack.pop()!;
      mine.push(t);
      const x = t % tiles;
      const z = (t - x) / tiles;
      const tryAdd = (u: number): void => {
        if (!label[u] && pick(mask[u]!)) {
          label[u] = id;
          stack.push(u);
        }
      };
      if (x > 0) tryAdd(t - 1);
      if (x < tiles - 1) tryAdd(t + 1);
      if (z > 0) tryAdd(t - tiles);
      if (z < tiles - 1) tryAdd(t + tiles);
    }
    list.push(mine);
  }
  return { label, list };
}

/** The river's centerline: its long axis, and alternating (along, across) tile coords per step. */
export interface Centerline {
  axis: 'x' | 'z';
  pts: number[];
}

/**
 * The river's course from `water` (kinds 1, 2 and 4: river, deep river, canal): the largest connected
 * stretch, parametrized along its longer axis by the mean cross position per column (or row), then
 * smoothed. Null when there is no river worth lettering along.
 */
export function riverCenterline(water: ArrayLike<number>, tiles: number): Centerline | null {
  const { list } = patches(water, tiles, (v) => v === 1 || v === 2 || v === 4);
  let best: number[] | null = null;
  for (const l of list) if (!best || l.length > best.length) best = l;
  if (!best || best.length < 12) return null;
  let x0 = tiles;
  let x1 = 0;
  let z0 = tiles;
  let z1 = 0;
  for (const t of best) {
    const x = t % tiles;
    const z = (t - x) / tiles;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  const axis: 'x' | 'z' = x1 - x0 >= z1 - z0 ? 'x' : 'z';
  const lo = axis === 'x' ? x0 : z0;
  const n = (axis === 'x' ? x1 : z1) - lo + 1;
  const sum = new Float64Array(n);
  const cnt = new Float64Array(n);
  for (const t of best) {
    const x = t % tiles;
    const z = (t - x) / tiles;
    const a = (axis === 'x' ? x : z) - lo;
    sum[a] += axis === 'x' ? z + 0.5 : x + 0.5;
    cnt[a]++;
  }
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = cnt[i]! > 0 ? sum[i]! / cnt[i]! : NaN;
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(v[i]!)) continue;
    let a = i - 1;
    let b = i + 1;
    while (a >= 0 && Number.isNaN(v[a]!)) a--;
    while (b < n && Number.isNaN(v[b]!)) b++;
    if (a < 0 || b >= n) return null;
    v[i] = v[a]! + ((v[b]! - v[a]!) * (i - a)) / (b - a);
  }
  let cur = v;
  for (let pass = 0; pass < 10; pass++) {
    const nx = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      nx[i] = (cur[Math.max(0, i - 1)]! + 2 * cur[i]! + cur[Math.min(n - 1, i + 1)]!) * 0.25;
    }
    cur = nx;
  }
  const pts: number[] = [];
  for (let i = 0; i < n; i++) pts.push(lo + i + 0.5, cur[i]!);
  return { axis, pts };
}

/** Turns an angle so text never reads upside down: into (-pi/2, pi/2]. */
export function upright(a: number): number {
  const TAU = Math.PI * 2;
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  if (r <= -Math.PI) r += TAU;
  if (r > Math.PI / 2 + 1e-9) r -= Math.PI;
  else if (r <= -Math.PI / 2 - 1e-9) r += Math.PI;
  return r;
}
