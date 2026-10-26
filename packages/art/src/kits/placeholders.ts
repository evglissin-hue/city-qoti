// C3.0 placeholders: decor that still borrows an I0 kit until its real one lands.
import * as D from './decor';
import type { Kit } from './types';

function alias(id: string, base: Kit, kind: Kit['kind'] = base.kind): Kit {
  const kit: Kit = { id, kind, build: (opts) => base.build(opts) };
  if (base.anchors) kit.anchors = (opts) => base.anchors!(opts);
  if (base.parts) kit.parts = (opts) => base.parts!(opts);
  return kit;
}

export const birdbath = alias('birdbath', D.planter);
export const curvedBench = alias('curved-bench', D.bench);
export const hangingLantern = alias('hanging-lantern', D.lantern);
export const herbPlanter = alias('herb-planter', D.planter);
export const mooringPost = alias('mooring-post', D.signpost);
export const planterWall = alias('planter-wall', D.lowWall);
export const ringBench = alias('ring-bench', D.bench);
export const wildflowerVerge = alias('wildflower-verge', D.flowerBed);
