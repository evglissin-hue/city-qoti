import { MAP_SIZE, TILE_FP } from '../constants';
import type { DecorView } from '../contracts';

const CELL_TILES = 4;
const CELL_FP = CELL_TILES * TILE_FP;

/**
 * Spatial hash for decor, in 4 x 4 tile cells. Shared by the sim's state index and the
 * client's Mirror so decorNear behaves the same on both sides.
 */
export class DecorGrid<D extends DecorView = DecorView> {
  private readonly side: number;
  private readonly cells: D[][];

  constructor(size = MAP_SIZE) {
    this.side = Math.ceil(size / CELL_TILES);
    this.cells = Array.from({ length: this.side * this.side }, () => []);
  }

  private cellOf(fx: number, fz: number): number {
    const cx = Math.min(this.side - 1, Math.max(0, Math.floor(fx / CELL_FP)));
    const cz = Math.min(this.side - 1, Math.max(0, Math.floor(fz / CELL_FP)));
    return cz * this.side + cx;
  }

  add(d: D): void {
    this.cells[this.cellOf(d.fx, d.fz)]!.push(d);
  }

  remove(d: D): void {
    const cell = this.cells[this.cellOf(d.fx, d.fz)]!;
    const i = cell.findIndex((c) => c.id === d.id);
    if (i >= 0) cell.splice(i, 1);
  }

  clear(): void {
    for (const cell of this.cells) cell.length = 0;
  }

  /** Decor whose center lies within `radius` of (fx, fz), in cell order. */
  near(fx: number, fz: number, radius: number): D[] {
    const out: D[] = [];
    const cx0 = Math.max(0, Math.floor((fx - radius) / CELL_FP));
    const cz0 = Math.max(0, Math.floor((fz - radius) / CELL_FP));
    const cx1 = Math.min(this.side - 1, Math.floor((fx + radius) / CELL_FP));
    const cz1 = Math.min(this.side - 1, Math.floor((fz + radius) / CELL_FP));
    const r2 = radius * radius;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        for (const d of this.cells[cz * this.side + cx]!) {
          const dx = d.fx - fx;
          const dz = d.fz - fz;
          if (dx * dx + dz * dz <= r2) out.push(d);
        }
      }
    }
    return out;
  }
}
