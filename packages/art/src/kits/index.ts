// Art kit registry: one line per kit, in alphabetical order by id. Content defs name their kit
// in `art.kit`; the client test checks that every one of them exists here.
import * as B from './buildings';
import * as D from './decor';
import * as Gd from './garden';
import * as G from './goods';
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
  Gd.birdbath,
  W.buildersYardKit,
  D.cherryTree,
  B.cottage,
  D.crates,
  Gd.curvedBench,
  W.farmhouseKit,
  D.fence,
  W.fishersHutKit,
  D.flowerBed,
  W.forestersLodgeKit,
  G.handcart,
  Gd.hangingLantern,
  D.hedge,
  Gd.herbPlanter,
  B.house2,
  D.lantern,
  D.lowWall,
  W.marketStallKit,
  Gd.mooringPost,
  T.oak,
  T.pine,
  D.planter,
  Gd.planterWall,
  W.quarryKit,
  R.resident,
  Gd.ringBench,
  W.sawpitKit,
  B.shed,
  D.signpost,
  W.storehouseKit,
  B.townHall,
  W.vegetablePlotKit,
  B.well,
  Gd.wildflowerVerge,
  B.windmill,
  W.woodcutterKit,
];

export const kitById: ReadonlyMap<string, Kit> = new Map(kits.map((k) => [k.id, k]));

export type { Kit, KitAnchors, KitBuildOptions, KitPart } from './types';
