// Renderer-only crowd manners (playtest item 8). The sim has no collision, so everyone with the same
// endpoints walks the same tiles and residents overlap. This module turns a snapshot of drawn
// positions into small sideways and backward pushes so figures stop standing in each other, and so
// walkers step to the verge when a cart rolls through. Pure and allocation free per frame: no DOM,
// no Three, nothing saved or hashed.

/** Figures closer than this (tiles) push apart. */
export const SEP_RADIUS = 0.32;
/** No push ever exceeds this (tiles), so nobody leaves the tile they walk. */
export const SEP_CAP = 0.25;
/** Pushes ease toward their target over about this many seconds. */
export const SEP_TAU = 0.15;
/** A cart's half width and a figure's radius (tiles): walkers clear the sum. */
export const CART_HALF_WIDTH = 0.35;
export const FIGURE_RADIUS = 0.12;
/** A cart's footprint along its heading: behind the axle, and ahead to the pony's nose. */
export const CART_BACK = 0.6;
export const CART_FRONT = 1;
/** Beyond the footprint the cart's push fades out over this length. */
export const CART_FADE = 0.3;

const CELL = 0.5;
const CELL_BIAS = 2048;
const CELL_STRIDE = 8192;
const EMPTY = -1;
/** Carts farther than this (tiles) along either axis cannot touch a walker. */
const CART_NEAR = 2.5;

/** The factor that moves a smoothed push toward its target in `dt` seconds. */
export function pushEase(dt: number): number {
  return dt <= 0 ? 0 : 1 - Math.exp(-dt / SEP_TAU);
}

function cellOf(v: number): number {
  return Math.floor(v / CELL) + CELL_BIAS;
}

export class SeparationField {
  /** The last `pushFor` result, in tiles (world x, world z). */
  px = 0;
  pz = 0;

  private n = 0;
  private ids = new Int32Array(64);
  private xs = new Float64Array(64);
  private zs = new Float64Array(64);
  private fixed = new Uint8Array(64);
  private next = new Int32Array(64);
  private tableKeys = new Float64Array(256);
  private tableHeads = new Int32Array(256);
  private mask = 255;

  private nc = 0;
  private cx = new Float64Array(16);
  private cz = new Float64Array(16);
  private ch = new Float64Array(16);

  /** Starts a new snapshot. */
  begin(): void {
    this.n = 0;
    this.nc = 0;
  }

  /** Adds a figure at its snapshot position. `fixed` figures (sitters, couples) are obstacles that never move. */
  add(id: number, x: number, z: number, fixed: boolean): void {
    const i = this.n;
    if (i >= this.ids.length) this.growBodies();
    this.ids[i] = id;
    this.xs[i] = x;
    this.zs[i] = z;
    this.fixed[i] = fixed ? 1 : 0;
    this.n = i + 1;
  }

  /** Adds a cart at its centre, rolling along `heading` (forward is sin h, cos h). */
  addCart(x: number, z: number, heading: number): void {
    const i = this.nc;
    if (i >= this.cx.length) {
      const grow = (a: Float64Array): Float64Array<ArrayBuffer> => {
        const b = new Float64Array(a.length * 2);
        b.set(a);
        return b;
      };
      this.cx = grow(this.cx);
      this.cz = grow(this.cz);
      this.ch = grow(this.ch);
    }
    this.cx[i] = x;
    this.cz[i] = z;
    this.ch[i] = heading;
    this.nc = i + 1;
  }

  private home(key: number): number {
    return (Math.imul((key % 2147483647) | 0, 2654435761 | 0) >>> 0) & this.mask;
  }

  /** Buckets the figures; call after the last `add`. */
  build(): void {
    let size = 256;
    while (size < this.n * 4) size *= 2;
    if (size !== this.tableKeys.length) {
      this.tableKeys = new Float64Array(size);
      this.tableHeads = new Int32Array(size);
    }
    this.mask = size - 1;
    this.tableHeads.fill(EMPTY);
    for (let i = 0; i < this.n; i++) {
      const key = cellOf(this.xs[i]!) * CELL_STRIDE + cellOf(this.zs[i]!);
      let s = this.home(key);
      while (this.tableHeads[s] !== EMPTY && this.tableKeys[s] !== key) s = (s + 1) & this.mask;
      if (this.tableHeads[s] === EMPTY) this.tableKeys[s] = key;
      this.next[i] = this.tableHeads[s]!;
      this.tableHeads[s] = i;
    }
  }

  private slot(key: number): number {
    let s = this.home(key);
    while (this.tableHeads[s] !== EMPTY) {
      if (this.tableKeys[s] === key) return s;
      s = (s + 1) & this.mask;
    }
    return -1;
  }

  /**
   * The push for figure `id` standing at (x, z) walking `heading` (`moving`) or standing, into `px`
   * and `pz`. Figures that are `fixed` get none. Each neighbor within `SEP_RADIUS` shares the work
   * (a fixed neighbor leaves all of it to this one); walkers are never pushed forward; carts push
   * sideways out of their footprint; the total is capped at `SEP_CAP`. The result depends only on
   * the snapshot, never on the order figures were added (up to float rounding of the sum).
   */
  pushFor(id: number, x: number, z: number, heading: number, moving: boolean, fixed: boolean): void {
    this.px = 0;
    this.pz = 0;
    if (fixed) return;
    let sx = 0;
    let sz = 0;
    const gx = cellOf(x);
    const gz = cellOf(z);
    for (let ax = gx - 1; ax <= gx + 1; ax++) {
      for (let az = gz - 1; az <= gz + 1; az++) {
        const s = this.slot(ax * CELL_STRIDE + az);
        if (s < 0) continue;
        for (let j = this.tableHeads[s]!; j !== EMPTY; j = this.next[j]!) {
          const oid = this.ids[j]!;
          if (oid === id) continue;
          const dx = x - this.xs[j]!;
          const dz = z - this.zs[j]!;
          const d2 = dx * dx + dz * dz;
          if (d2 >= SEP_RADIUS * SEP_RADIUS) continue;
          const share = this.fixed[j] ? 1 : 0.5;
          if (d2 < 1e-10) {
            // On top of each other: the lower id steps to +x, the higher to -x.
            sx += (id < oid ? 1 : -1) * SEP_RADIUS * share;
            continue;
          }
          const d = Math.sqrt(d2);
          const m = ((SEP_RADIUS - d) * share) / d;
          sx += dx * m;
          sz += dz * m;
        }
      }
    }
    if (moving) {
      // Walkers give way sideways or by hanging back, never by hurrying ahead.
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      const along = sx * fx + sz * fz;
      if (along > 0) {
        sx -= along * fx;
        sz -= along * fz;
      }
    }
    const reach = CART_HALF_WIDTH + FIGURE_RADIUS;
    for (let c = 0; c < this.nc; c++) {
      const dx = x - this.cx[c]!;
      const dz = z - this.cz[c]!;
      if (Math.abs(dx) > CART_NEAR || Math.abs(dz) > CART_NEAR) continue;
      const ch = this.ch[c]!;
      const fx = Math.sin(ch);
      const fz = Math.cos(ch);
      const rx = fz;
      const rz = -fx;
      const a = dx * fx + dz * fz;
      const l = dx * rx + dz * rz;
      const out = a < -CART_BACK ? -CART_BACK - a : a > CART_FRONT ? a - CART_FRONT : 0;
      const w = 1 - out / CART_FADE;
      if (w <= 0) continue;
      const need = reach - Math.abs(l);
      if (need <= 0) continue;
      const side = l > 0 ? 1 : l < 0 ? -1 : id % 2 === 0 ? 1 : -1;
      sx += rx * side * need * w;
      sz += rz * side * need * w;
    }
    const m2 = sx * sx + sz * sz;
    if (m2 > SEP_CAP * SEP_CAP) {
      const k = SEP_CAP / Math.sqrt(m2);
      sx *= k;
      sz *= k;
    }
    this.px = sx;
    this.pz = sz;
  }

  private growBodies(): void {
    const n = this.ids.length * 2;
    const f64 = (a: Float64Array): Float64Array<ArrayBuffer> => {
      const b = new Float64Array(n);
      b.set(a);
      return b;
    };
    const ids = new Int32Array(n);
    ids.set(this.ids);
    this.ids = ids;
    this.xs = f64(this.xs);
    this.zs = f64(this.zs);
    const fixed = new Uint8Array(n);
    fixed.set(this.fixed);
    this.fixed = fixed;
    this.next = new Int32Array(n);
  }
}
