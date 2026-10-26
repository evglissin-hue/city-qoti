// C3.0 placeholders: every I1 content id gets a kit so the content-to-art check passes while C3D
// draws the real ones. Each borrows an I0 kit; delete an entry when its real kit lands.
import { ShapeBuilder } from '../geometry';
import { palette } from '../palette';
import * as B from './buildings';
import * as D from './decor';
import type { Kit } from './types';

function alias(id: string, base: Kit, kind: Kit['kind'] = base.kind): Kit {
  const kit: Kit = { id, kind, build: (opts) => base.build(opts) };
  if (base.anchors) kit.anchors = (opts) => base.anchors!(opts);
  if (base.parts) kit.parts = (opts) => base.parts!(opts);
  return kit;
}

export const bakery = alias('bakery', B.cottage);
export const buildersYard = alias('builders-yard', B.shed);
export const farmhouse = alias('farmhouse', B.cottage);
export const fishersHut = alias('fishers-hut', B.shed);
export const forestersLodge = alias('foresters-lodge', B.cottage);
export const marketStall = alias('market-stall', B.shed);
export const quarry = alias('quarry', B.shed);
export const sawpit = alias('sawpit', B.shed);
export const storehouse = alias('storehouse', B.house2);
export const vegetablePlot = alias('vegetable-plot', D.flowerBed, 'building');
export const woodcutter = alias('woodcutter', B.shed);

export const birdbath = alias('birdbath', D.planter);
export const curvedBench = alias('curved-bench', D.bench);
export const hangingLantern = alias('hanging-lantern', D.lantern);
export const herbPlanter = alias('herb-planter', D.planter);
export const mooringPost = alias('mooring-post', D.signpost);
export const planterWall = alias('planter-wall', D.lowWall);
export const ringBench = alias('ring-bench', D.bench);
export const wildflowerVerge = alias('wildflower-verge', D.flowerBed);

/** A rounded little figure, about 0.3 tile tall: the stand-in for every species. */
export const resident: Kit = {
  id: 'resident',
  kind: 'decor',
  build() {
    return new ShapeBuilder()
      .rbox(-0.07, 0, -0.06, 0.07, 0.2, 0.06, palette.timber, 0.04)
      .rbox(-0.06, 0.2, -0.06, 0.06, 0.31, 0.06, palette.plasterCream, 0.04)
      .build();
  },
};
