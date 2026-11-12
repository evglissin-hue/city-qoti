// C5E part 2: the seasonal trees (?scene=seasons): oak, birch, pine, an apple, a cherry and a pear
// in four columns, spring to winter, each column drawn with the game's own foliage material and a
// world env set to that season's blend at noon on its third day (autumn gold and rust, lacy bare
// crowns and snow in winter, blossom in spring). The game's renderer modules are shared, so the
// gallery shows exactly what the valley does.
//
// V2B: the painted green. Rows are spaced so crowns do not overlap, `?rows=oak,birch` picks rows
// (any kit id, plus `meadow` for a patch of the meadow carpet), and each column's trees are built at
// the season's dab thinning on its day (`?day=5` shows autumn's thinning part way).
import { kitById, type KitBuildOptions } from '@qoti/art';
import { Float32BufferAttribute, Group, Mesh, PerspectiveCamera, type BufferGeometry } from 'three';
import { applySeasonBlend, createWorldEnv } from '../../client/src/render/env';
import { meadowPatchMesh, stubMeadowGround } from '../../client/src/render/layers/meadow';
import { createFoliageMaterial } from '../../client/src/render/scatter';
import { seasonBlendAt } from '../../client/src/render/seasons';
import { thinStep } from '../../client/src/render/thin';

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const ROWS: Record<string, [opts: KitBuildOptions, pine: boolean]> = {
  oak: [{ stage: 3 }, false],
  birch: [{ stage: 3 }, false],
  pine: [{ stage: 3 }, true],
  'apple-tree': [{}, false],
  'cherry-tree': [{}, false],
  'pear-tree': [{}, false],
  hedgerow: [{}, false],
  bush: [{}, false],
  reeds: [{}, false],
};
const DEFAULT_ROWS = ['oak', 'birch', 'pine', 'apple-tree', 'cherry-tree', 'pear-tree', 'hedgerow', 'meadow'];
/** Where the meadow row's patch lies on the stub map (a meadow with a flower drift or two). */
const PATCH = { x: 96, z: 96, w: 2, d: 2 };

const COL = 2.2;
const ROW = 2;

/** The trees layer marks evergreens per vertex (`tkind` 1); the gallery does the same. */
function withKind(g: BufferGeometry, pine: boolean): BufferGeometry {
  const n = g.getAttribute('position').count;
  g.setAttribute('tkind', new Float32BufferAttribute(new Float32Array(n).fill(pine ? 1 : 0), 1));
  return g;
}

export function buildSeasons(
  seed: number,
  rowIds: readonly string[] = DEFAULT_ROWS,
  day = 3,
): { group: Group; size: [number, number] } {
  const group = new Group();
  const camera = new PerspectiveCamera();
  const rows = rowIds.filter((id) => id === 'meadow' || kitById.has(id));
  SEASONS.forEach((_, col) => {
    const env = createWorldEnv(camera);
    applySeasonBlend(env, seasonBlendAt(col, day, 12));
    const material = createFoliageMaterial(env);
    const thin = thinStep(col, day);
    rows.forEach((id, row) => {
      if (id === 'meadow') {
        // V2B: a patch of the meadow carpet, with the season's color, snow and thinning.
        const patch = meadowPatchMesh(
          env,
          stubMeadowGround(PATCH.x, PATCH.z, PATCH.w, PATCH.d),
          PATCH.x,
          PATCH.z,
          PATCH.w,
          PATCH.d,
        );
        patch.position.set(
          (col - 1.5) * COL - PATCH.x - PATCH.w / 2,
          0.03,
          (row - (rows.length - 1) / 2) * ROW - PATCH.z - PATCH.d / 2,
        );
        group.add(patch);
        return;
      }
      const kit = kitById.get(id)!;
      const [opts, pine] = ROWS[id] ?? [{}, false];
      const g = withKind(kit.build({ ...opts, seed: seed + row, params: { thin: pine ? 1 : thin } }), pine);
      const mesh = new Mesh(g, material);
      const k = id.endsWith('-tree') ? 1.6 : 1;
      mesh.scale.setScalar(k);
      mesh.position.set((col - 1.5) * COL, 0, (row - (rows.length - 1) / 2) * ROW);
      group.add(mesh);
    });
  });
  return { group, size: [SEASONS.length * COL, rows.length * ROW] };
}

export const SEASON_NAMES = SEASONS;
