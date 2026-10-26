// Art kit registry: one line per kit, in alphabetical order by id. Content defs name their kit
// in `art.kit`; the client test checks that every one of them exists here.
import * as An from './animals';
import * as B from './buildings';
import * as D from './decor';
import * as Gd from './garden';
import * as G from './goods';
import * as Gr from './grown';
import * as N from './nature';
import * as R from './residents';
import * as Sv from './services';
import * as T from './trees';
import * as Ve from './vehicles';
import type { Kit } from './types';
import * as V from './village';
import * as W from './workplaces';

// prettier-ignore
export const kits: readonly Kit[] = [
  D.appleTree,
  W.bakeryKit,
  D.barrels,
  D.bench,
  T.birch,
  Gd.birdbath,
  V.brickKilnKit,
  W.buildersYardKit,
  N.bush,
  Ve.cart,
  Sv.cartShedKit,
  V.cheesemakerKit,
  D.cherryTree,
  V.choppingShedKit,
  V.ciderPressKit,
  V.clayPitKit,
  Gr.cottage,
  An.cowKit,
  D.crates,
  Gd.curvedBench,
  V.dairyKit,
  N.fallenLog,
  W.farmhouseKit,
  Gr.farmstead,
  D.fence,
  N.fern,
  W.fishersHutKit,
  D.flowerBed,
  W.forestersLodgeKit,
  N.grassTuft,
  G.handcart,
  Gd.hangingLantern,
  D.hedge,
  V.herbGardenKit,
  Gd.herbPlanter,
  Sv.herbalistKit,
  B.house2,
  D.lantern,
  D.lowWall,
  W.marketStallKit,
  Gd.mooringPost,
  N.mushrooms,
  T.oak,
  V.orchardKit,
  T.pine,
  D.planter,
  Gd.planterWall,
  An.ponyKit,
  W.quarryKit,
  N.reeds,
  R.resident,
  Gd.ringBench,
  N.rock,
  W.sawpitKit,
  Sv.schoolKit,
  B.shed,
  An.sheepKit,
  V.sheepPastureKit,
  Gr.shop,
  D.signpost,
  V.smithyKit,
  V.spinnerKit,
  W.storehouseKit,
  Sv.tavernKit,
  B.townHall,
  Gr.townhouse,
  Sv.tradingPostKit,
  W.vegetablePlotKit,
  V.weaverKit,
  B.well,
  Gd.wildflowerVerge,
  N.wildflowers,
  B.windmill,
  W.woodcutterKit,
  Gr.workshop,
];

export const kitById: ReadonlyMap<string, Kit> = new Map(kits.map((k) => [k.id, k]));

export type { Kit, KitAnchors, KitBuildOptions, KitPart } from './types';
