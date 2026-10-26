// Art kit registry: one line per kit, in alphabetical order by id. Content defs name their kit
// in `art.kit`; the client test checks that every one of them exists here.
import * as B from './buildings';
import * as D from './decor';
import * as G from './goods';
import * as P from './placeholders';
import * as R from './residents';
import * as T from './trees';
import type { Kit } from './types';
import * as W from './workplaces';

// prettier-ignore
export const kits: readonly Kit[] = [
  D.appleTree,
  W.bakeryKit,
  D.barrels,
  D.bench,
  T.birch,
  P.birdbath,
  W.buildersYardKit,
  D.cherryTree,
  B.cottage,
  D.crates,
  P.curvedBench,
  W.farmhouseKit,
  D.fence,
  W.fishersHutKit,
  D.flowerBed,
  W.forestersLodgeKit,
  G.handcart,
  P.hangingLantern,
  D.hedge,
  P.herbPlanter,
  B.house2,
  D.lantern,
  D.lowWall,
  W.marketStallKit,
  P.mooringPost,
  T.oak,
  T.pine,
  D.planter,
  P.planterWall,
  W.quarryKit,
  R.resident,
  P.ringBench,
  W.sawpitKit,
  B.shed,
  D.signpost,
  W.storehouseKit,
  B.townHall,
  W.vegetablePlotKit,
  B.well,
  P.wildflowerVerge,
  B.windmill,
  W.woodcutterKit,
];

export const kitById: ReadonlyMap<string, Kit> = new Map(kits.map((k) => [k.id, k]));

export type { Kit, KitAnchors, KitBuildOptions, KitPart } from './types';
