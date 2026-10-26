// Art kit registry: one line per kit, in alphabetical order by id. Content defs name their kit
// in `art.kit`; the client test checks that every one of them exists here.
import * as B from './buildings';
import * as D from './decor';
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
  D.cherryTree,
  B.cottage,
  D.crates,
  P.curvedBench,
  P.farmhouse,
  D.fence,
  P.fishersHut,
  D.flowerBed,
  P.forestersLodge,
  P.hangingLantern,
  D.hedge,
  P.herbPlanter,
  B.house2,
  D.lantern,
  D.lowWall,
  P.marketStall,
  P.mooringPost,
  T.oak,
  T.pine,
  D.planter,
  P.planterWall,
  P.quarry,
  P.resident,
  P.ringBench,
  P.sawpit,
  B.shed,
  D.signpost,
  P.storehouse,
  B.townHall,
  P.vegetablePlot,
  B.well,
  P.wildflowerVerge,
  B.windmill,
  P.woodcutter,
];

export const kitById: ReadonlyMap<string, Kit> = new Map(kits.map((k) => [k.id, k]));

export type { Kit, KitAnchors, KitBuildOptions, KitPart } from './types';
