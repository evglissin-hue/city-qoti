import type { Rng } from '../contracts';

/**
 * Value noise: random values on a lattice with `scale`-tile spacing, smoothly interpolated.
 * Integer-free but deterministic: only + - * / and floor. Returns values in [0, 1).
 */
export class ValueNoise {
  private readonly side: number;
  private readonly lattice: Float64Array;

  constructor(
    rng: Rng,
    size: number,
    private readonly scale: number,
  ) {
    this.side = Math.floor(size / scale) + 2;
    this.lattice = new Float64Array(this.side * this.side);
    for (let i = 0; i < this.lattice.length; i++) this.lattice[i] = rng.float();
  }

  at(x: number, z: number): number {
    const gx = x / this.scale;
    const gz = z / this.scale;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const tx = gx - ix;
    const tz = gz - iz;
    const sx = tx * tx * (3 - 2 * tx);
    const sz = tz * tz * (3 - 2 * tz);
    const row = iz * this.side + ix;
    const a = this.lattice[row]!;
    const b = this.lattice[row + 1]!;
    const c = this.lattice[row + this.side]!;
    const d = this.lattice[row + this.side + 1]!;
    const top = a + (b - a) * sx;
    const bottom = c + (d - c) * sx;
    return top + (bottom - top) * sz;
  }
}
