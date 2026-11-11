// Art kit registry: one line per kit, in alphabetical order by id. Content defs name their kit
// in `art.kit`; the client test checks that every one of them exists here.
import * as An from './animals';
import * as B from './buildings';
import * as Bz from './business';
import * as Cg from './callings';
import * as D from './decor';
import * as Df from './defenses';
import * as Fe from './festival';
import * as Fd from './fineDecor';
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
  Fd.cafeTable,
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
  Bz.farmstead,
  D.fence,
  N.fern,
  Fe.festivalStage,
  Fe.festivalStall,
  Fe.festivalTable,
  W.fishersHutKit,
  Fe.flowerArch,
  D.flowerBed,
  Fd.flowerCart,
  Fd.flowerTrellis,
  W.forestersLodgeKit,
  Fd.fountain,
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
  Fd.lampPost,
  D.lantern,
  N.lilyPads,
  Df.lookoutBench,
  D.lowWall,
  W.marketStallKit,
  Fd.maypole,
  N.meadowTuft,
  Cg.millstoneBench,
  Gd.mooringPost,
  N.mushrooms,
  Df.netTrapKit,
  Fd.noticeBoard,
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
  Fd.rainBarrel,
  Gn.reedBed,
  N.reeds,
  R.resident,
  Gd.ringBench,
  Tr.riverDockKit,
  N.rock,
  Cg.roseArch,
  W.sawpitKit,
  Sv.schoolKit,
  Gn.seeSaw,
  B.shed,
  An.sheepKit,
  V.sheepPastureKit,
  Bz.shop,
  Fd.paintedShopSign,
  D.signpost,
  V.smithyKit,
  V.spinnerKit,
  Tr.stoneBridgeKit,
  Df.stoneWallKit,
  W.storehouseKit,
  Gn.swing,
  Tr.tailorKit,
  Sv.tavernKit,
  Fd.toolRack,
  B.townHall,
  Gr.townhouse,
  Sv.tradingPostKit,
  W.vegetablePlotKit,
  Df.watchHouseKit,
  Df.watchtowerKit,
  Cg.waysideShrine,
  Fd.weathervane,
  V.weaverKit,
  B.well,
  Gd.wildflowerVerge,
  N.wildflowers,
  B.windmill,
  W.woodcutterKit,
  Bz.workshop,
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
