// Wheat field tiles by growth stage (docs/spec/13-ledger.md, Wheat Field): 0 sprouts in the
// furrows, 1 green blades, 2 tall and turning, 3 golden and heavy with ears. One tile, origin at the
// tile's corner, rows running along x. The furrowed soil itself is the terrain's.
import type { BufferGeometry } from 'three';
import { seeded, ShapeBuilder, vary } from '../geometry';

const GREEN = 0x7fae4e;
const TURNING = 0xb7b552;
const GOLD = 0xe0bd5c;
const EAR = 0xcf9f3e;

export function wheatTileGeometry(stage: number): BufferGeometry {
  const st = Math.max(0, Math.min(3, Math.round(stage)));
  const rnd = seeded(41 + st);
  const s = new ShapeBuilder();
  const rows = 4;
  const per = st === 0 ? 3 : 4;
  const h = [0.06, 0.16, 0.26, 0.3][st]!;
  const r = [0.035, 0.06, 0.07, 0.075][st]!;
  const color = [GREEN, GREEN, TURNING, GOLD][st]!;
  for (let i = 0; i < rows; i++) {
    const z = (i + 0.5) / rows;
    for (let j = 0; j < per; j++) {
      const x = (j + 0.5 + (rnd() - 0.5) * 0.3) / per;
      const hh = h * (0.85 + rnd() * 0.3);
      s.cylinder(x, z, r, r * 0.35, 0, hh, vary(color, rnd, 0.8), 4, rnd() * Math.PI);
      if (st >= 2)
        s.cylinder(x, z, r * 0.6, 0, hh, hh + 0.07, vary(st === 3 ? EAR : TURNING, rnd, 0.6), 4, rnd());
    }
  }
  return s.build(false);
}
