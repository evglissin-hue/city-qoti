// R1E: every trade at every level, and the specialized buildings (?scene=trades). Rows are the
// trades (a workshop, farmstead or shop drawn with its trade's look, as the game's buildings layer
// does), columns are levels 1, 2 and 3, then level 3's far level; the last row is the four
// specialized buildings R1E drew. Params: `trades` (ids, comma separated; default all), `style`
// (a district style, default brick), `season` (spring, summer, autumn or winter, default summer), `special=0` to
// leave the specialized row out, `far=0` to leave the far column out.
import { artKitId, businessParams, kitById, type KitBuildOptions } from '@qoti/art';
import { content } from '@qoti/content';
import { Group, Mesh, type Material } from 'three';

/** The specialized buildings R1E drew, by def id. */
export const SPECIAL_DEFS = ['brickworks', 'granary', 'market-square', 'foresters-lodge'];

export interface TradesScene {
  group: Group;
  size: [number, number];
  /** Triangles per cell, for the info line. */
  counts: string[];
}

export function buildTrades(q: URLSearchParams, material: Material, seed: number): TradesScene {
  const group = new Group();
  const ids = q.get('trades')?.split(',').filter(Boolean);
  const trades = ids ? content.trades.filter((t) => ids.includes(t.id)) : content.trades;
  const style = q.get('style') ?? 'brick';
  // The gallery names the season (?season=winter) for its materials; kits take its index.
  const season = Math.max(0, ['spring', 'summer', 'autumn', 'winter'].indexOf(q.get('season') ?? 'summer'));
  const far = q.get('far') !== '0';
  const counts: string[] = [];
  const cellW = 3.8;
  const cellD = 3.8;
  const cols = far ? 4 : 3;
  const rows: { label: string; cells: { kit: string; opts: KitBuildOptions }[] }[] = [];
  for (const t of trades) {
    const def = content.buildingById.get(t.building);
    if (!def) continue;
    const cells = [1, 2, 3, 3].slice(0, cols).map((level, i) => ({
      kit: artKitId(def.art),
      opts: {
        seed: seed + rows.length,
        size: def.size,
        entrance: def.entrance,
        params: { style, season, ...businessParams(artKitId(t.look), t.makes, level, t.look.params) },
        ...(i === 3 ? { lod: 'low' as const } : {}),
      },
    }));
    rows.push({ label: t.id, cells });
  }
  if (q.get('special') !== '0') {
    const cells = SPECIAL_DEFS.map((id) => content.buildingById.get(id))
      .filter((d) => d !== undefined)
      .map((def) => ({
        kit: artKitId(def.art),
        opts: { seed, size: def.size, entrance: def.entrance, params: { style, season } },
      }));
    rows.push({ label: 'specialized', cells });
  }
  rows.forEach((row, r) => {
    row.cells.forEach(({ kit: id, opts }, c) => {
      const kit = kitById.get(id);
      if (!kit) return;
      const g = kit.build(opts);
      counts.push(`${row.label}/${c + 1} ${g.getAttribute('position').count / 3}`);
      const mesh = new Mesh(g, material);
      const [w, d] = opts.size ?? [3, 3];
      mesh.position.set(
        (c - (row.cells.length - 1) / 2) * cellW - w / 2,
        0,
        (r - (rows.length - 1) / 2) * cellD - d / 2,
      );
      group.add(mesh);
    });
  });
  return { group, size: [cols * cellW, rows.length * cellD], counts };
}
