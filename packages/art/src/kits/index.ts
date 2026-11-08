// Art kit registry: one line per kit, in alphabetical order by id. Content defs name their kit
// in `art.kit`; the client test checks that every one of them exists here.
import * as An from './animals';
import * as B from './buildings';
import * as D from './decor';
import * as Df from './defenses';
import * as Fe from './festival';
import * as Gd from './garden';
import * as Gn from './greens';
import * as G from './goods';
import * as Gr from './grown';
import * as N from './nature';
import * as R from './residents';
import * as Sv from './services';
import * as T from './trees';
import * as Tr from './trades';
import * as Ve from './vehicles';
import type { Kit } from './types';
import * as V from './village';
import * as W from './workplaces';

// prettier-ignore
export const kits: readonly Kit[] = [
  Tr.apiaryKit,
  D.appleTree,
  Gn.arborSeat,
  W.bakeryKit,
  D.barrels,
  Tr.bathHouseKit,
  Df.bellTowerKit,
  D.bench,
  T.birch,
  Gd.birdbath,
  Fe.bonfire,
  V.brickKilnKit,
  W.buildersYardKit,
  Fe.bunting,
  N.bush,
  Tr.carpenterKit,
  Ve.cart,
  Sv.cartShedKit,
  Tr.chandlerKit,
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
  Fe.festivalStage,
  Fe.festivalStall,
  Fe.festivalTable,
  W.fishersHutKit,
  Fe.flowerArch,
  D.flowerBed,
  W.forestersLodgeKit,
  Df.gateKitDef,
  Df.gateBanner,
  N.grassTuft,
  G.handcart,
  Gd.hangingLantern,
  D.hedge,
  T.hedgerow,
  V.herbGardenKit,
  Gd.herbPlanter,
  Sv.herbalistKit,
  Tr.herbalistsCottageKit,
  B.house2,
  D.lantern,
  N.lilyPads,
  Df.lookoutBench,
  D.lowWall,
  W.marketStallKit,
  Gd.mooringPost,
  N.mushrooms,
  Df.netTrapKit,
  T.oak,
  V.orchardKit,
  Df.palisadeKit,
  Gn.pearTree,
  Tr.pieShopKit,
  T.pine,
  Df.pitTrapKit,
  D.planter,
  Gd.planterWall,
  An.ponyKit,
  W.quarryKit,
  Gn.reedBed,
  N.reeds,
  R.resident,
  Gd.ringBench,
  Tr.riverDockKit,
  N.rock,
  W.sawpitKit,
  Sv.schoolKit,
  Gn.seeSaw,
  B.shed,
  An.sheepKit,
  V.sheepPastureKit,
  Gr.shop,
  D.signpost,
  V.smithyKit,
  V.spinnerKit,
  Tr.stoneBridgeKit,
  Df.stoneWallKit,
  W.storehouseKit,
  Gn.swing,
  Tr.tailorKit,
  Sv.tavernKit,
  B.townHall,
  Gr.townhouse,
  Sv.tradingPostKit,
  W.vegetablePlotKit,
  Df.watchHouseKit,
  Df.watchtowerKit,
  V.weaverKit,
  B.well,
  Gd.wildflowerVerge,
  N.wildflowers,
  B.windmill,
  W.woodcutterKit,
  Gr.workshop,
];

export const kitById: ReadonlyMap<string, Kit> = new Map(kits.map((k) => [k.id, k]));

/**
 * C5E: the kit a def draws with. I3 defs name a stand-in kit in `art.kit` and the kit they are
 * meant to draw with in `art.params.kit` (C5.0); once that kit exists it is the one, so content
 * never has to change when the art lands.
 */
export function artKitId(art: { kit: string; params?: Record<string, unknown> }): string {
  const want = art.params?.kit;
  return typeof want === 'string' && kitById.has(want) ? want : art.kit;
}

export { WALL_KITS } from './defenses';

export type { Kit, KitAnchors, KitBuildOptions, KitPart } from './types';
