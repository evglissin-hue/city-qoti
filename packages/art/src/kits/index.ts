// Art kit registry: one line per kit, in alphabetical order by id. Content defs name their kit
// in `art.kit`; the client test checks that every one of them exists here.
import * as B from './buildings';
import * as D from './decor';
import * as N from './nature';
import * as P from './placeholders';
import * as T from './trees';
import type { Kit } from './types';

// prettier-ignore
export const kits: readonly Kit[] = [
  D.appleTree,
  P.bakery,
  D.barrels,
  D.bench,
  T.birch,
  P.birdbath,
  P.buildersYard,
  N.bush,
  D.cherryTree,
  B.cottage,
  D.crates,
  P.curvedBench,
  N.fallenLog,
  P.farmhouse,
  D.fence,
  N.fern,
  P.fishersHut,
  D.flowerBed,
  P.forestersLodge,
  N.grassTuft,
  P.hangingLantern,
  D.hedge,
  P.herbPlanter,
  B.house2,
  D.lantern,
  D.lowWall,
  P.marketStall,
  P.mooringPost,
  N.mushrooms,
  T.oak,
  T.pine,
  D.planter,
  P.planterWall,
  P.quarry,
  N.reeds,
  P.resident,
  P.ringBench,
  N.rock,
  P.sawpit,
  B.shed,
  D.signpost,
  P.storehouse,
  B.townHall,
  P.vegetablePlot,
  B.well,
  P.wildflowerVerge,
  N.wildflowers,
  B.windmill,
  P.woodcutter,
];

export const kitById: ReadonlyMap<string, Kit> = new Map(kits.map((k) => [k.id, k]));

export type { Kit, KitAnchors, KitBuildOptions, KitPart } from './types';
