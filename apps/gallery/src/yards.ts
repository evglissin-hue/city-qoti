// V3A: the yard and goods pieces (?scene=yards). Rows of pieces at their near level with the same
// piece at its far level behind it; then a row of painted signs (one per emblem), a row of master's
// boards (R3X, one per trade) and a row of goods tables (one per good). Params: `row` (0 to 5, show one row), `cols` (pieces per row,
// default 8), `seed`.
import { kitById, MASTER_EMBLEMS, type KitBuildOptions } from '@qoti/art';
import { Group, Mesh, type Material } from 'three';

export const YARD_PIECES = [
  'yard-woodpile',
  'yard-nets',
  'yard-loaf-tray',
  'yard-cloth-frame',
  'yard-chair-half',
  'yard-skep',
  'yard-pram',
  'yard-boots',
  'yard-cat',
  'yard-washing-line',
  'yard-awning',
  'yard-lamp',
  'yard-sill-lamp',
  'yard-chopping-block',
  'yard-water-butt',
  'yard-wheelbarrow',
  'goods-sacks',
  'goods-churns',
  'goods-apple-crate',
  'goods-candle-rack',
  'goods-fleece',
  'goods-fish-rack',
];

const EMBLEMS = [
  'bread',
  'cloth',
  'candles',
  'cheese',
  'apples',
  'cider',
  'honey',
  'wool',
  'chair',
  'veg',
  'fish',
  'grain',
  'sundries',
];

export interface YardsScene {
  group: Group;
  size: [number, number];
  /** Triangles per piece (near/far), for the info line. */
  counts: string[];
  /** The z of each row's near line, so the camera can aim at one. */
  rowZ: number[];
}

export function buildYards(q: URLSearchParams, material: Material, seed: number): YardsScene {
  const group = new Group();
  const cols = Math.max(2, Number(q.get('cols') ?? 8));
  const only = q.has('row') ? Number(q.get('row')) : -1;
  type Cell = { id: string; label: string; opts: KitBuildOptions };
  const rows: Cell[][] = [];
  for (let i = 0; i < YARD_PIECES.length; i += cols)
    rows.push(
      YARD_PIECES.slice(i, i + cols).map((id, k) => ({ id, label: id, opts: { seed: seed + i + k } })),
    );
  rows.push(
    EMBLEMS.map((e, k) => ({
      id: 'yard-sign',
      label: `sign/${e}`,
      opts: { seed: seed + k, params: { emblem: e } },
    })),
  );
  // R3X: the master's boards, one per trade, hung on a wall and (the second half) on a post.
  rows.push(
    MASTER_EMBLEMS.map((e, k) => ({
      id: 'master-sign',
      label: `master/${e}`,
      opts: { seed: seed + k, params: { emblem: e, post: k % 2 === 1 } },
    })),
  );
  rows.push(
    EMBLEMS.map((g, k) => ({
      id: 'goods-display',
      label: `display/${g}`,
      opts: { seed: seed + k, params: { good: g } },
    })),
  );
  const counts: string[] = [];
  const stepX = 1.05;
  const stepZ = 1.5;
  const rowZ: number[] = [];
  let widest = 0;
  const shown = rows.filter((_, r) => only < 0 || r === only);
  shown.forEach((row, r) => {
    widest = Math.max(widest, row.length);
    const z = r * stepZ;
    rowZ.push(z);
    row.forEach((cell, c) => {
      const kit = kitById.get(cell.id);
      if (!kit) return;
      const x = (c - (row.length - 1) / 2) * stepX;
      const near = kit.build(cell.opts);
      const far = kit.build({ ...cell.opts, lod: 'low' });
      counts.push(
        `${cell.label} ${near.getAttribute('position').count / 3}/${far.getAttribute('position').count / 3}`,
      );
      const a = new Mesh(near, material);
      a.position.set(x, 0, z + 0.5);
      group.add(a);
      const b = new Mesh(far, material);
      b.position.set(x, 0, z - 0.2);
      group.add(b);
    });
  });
  return { group, size: [widest * stepX, shown.length * stepZ], counts, rowZ };
}
