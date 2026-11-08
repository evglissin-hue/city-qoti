// C5E part 2: the seasonal trees (?scene=seasons): oak, birch, pine, an apple, a cherry and a pear
// in four columns, spring to winter, each column drawn with the game's own foliage material and a
// world env set to that season's blend at noon on its third day (autumn gold and rust, lacy bare
// crowns and snow in winter, blossom in spring). The game's renderer modules are shared, so the
// gallery shows exactly what the valley does.
import { kitById, type KitBuildOptions } from '@qoti/art';
import { Float32BufferAttribute, Group, Mesh, PerspectiveCamera, type BufferGeometry } from 'three';
import { applySeasonBlend, createWorldEnv } from '../../client/src/render/env';
import { createFoliageMaterial } from '../../client/src/render/scatter';
import { seasonBlendAt } from '../../client/src/render/seasons';

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const ROWS: [kit: string, opts: KitBuildOptions, pine: boolean][] = [
  ['oak', { stage: 3 }, false],
  ['birch', { stage: 3 }, false],
  ['pine', { stage: 3 }, true],
  ['apple-tree', {}, false],
  ['cherry-tree', {}, false],
  ['pear-tree', {}, false],
];

/** The trees layer marks evergreens per vertex (`tkind` 1); the gallery does the same. */
function withKind(g: BufferGeometry, pine: boolean): BufferGeometry {
  const n = g.getAttribute('position').count;
  g.setAttribute('tkind', new Float32BufferAttribute(new Float32Array(n).fill(pine ? 1 : 0), 1));
  return g;
}

export function buildSeasons(seed: number): { group: Group; size: [number, number] } {
  const group = new Group();
  const camera = new PerspectiveCamera();
  SEASONS.forEach((_, col) => {
    const env = createWorldEnv(camera);
    applySeasonBlend(env, seasonBlendAt(col, 3, 12));
    const material = createFoliageMaterial(env);
    ROWS.forEach(([id, opts, pine], row) => {
      const kit = kitById.get(id);
      if (!kit) return;
      const g = withKind(kit.build({ ...opts, seed: seed + row }), pine);
      const mesh = new Mesh(g, material);
      const k = id.endsWith('-tree') ? 1.6 : 1;
      mesh.scale.setScalar(k);
      mesh.position.set((col - 1.5) * 1.6, 0, (row - (ROWS.length - 1) / 2) * 1.3);
      group.add(mesh);
    });
  });
  return { group, size: [SEASONS.length * 1.6, ROWS.length * 1.3] };
}

export const SEASON_NAMES = SEASONS;
