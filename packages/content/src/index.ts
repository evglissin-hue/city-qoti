// Content registry. Add one line per entry, kept in alphabetical order, so parallel
// branches adding different entries merge cleanly. The one exception is `goods`: its order is
// append-only, because a good's position is its index in every per-good array in saved state.
import * as A from './achievements';
import * as Ba from './baskets';
import * as B from './buildings';
import * as Ca from './carts';
import * as Ch from './charters';
import * as C from './chronicle';
import * as Cl from './callings';
import * as D from './decor';
import * as Dr from './dressing';
import * as Co from './commissions';
import * as Fe from './festivals';
import * as FC from './festivalsChronicle';
import * as FD from './fineDecor';
import * as G from './goods';
import * as Gu from './guide';
import * as He from './herbalist';
import * as I from './innovations';
import * as L from './lives';
import { familyNames } from './names';
import * as N from './neighbors';
import * as Na from './nature';
import * as ND from './natureDecor';
import * as P from './patterns';
import * as R from './roads';
import * as SA from './seasonsAchievements';
import * as SB from './seasonsBuildings';
import * as SC from './seasonsChronicle';
import * as SG from './seasonsGoods';
import * as SP from './seasonsPatterns';
import * as Se from './seasons';
import * as Sr from './stories';
import * as Sp from './species';
import * as St from './styles';
import * as Sm from './stonemason';
import * as Sw from './swatches';
import * as T from './trees';
import * as Th from './threats';
import * as Tr from './traits';
import * as VB from './villageBuildings';
import * as VD from './villageDecor';
import * as VG from './villageGoods';
import * as VP from './villagePatterns';
import * as W from './wishes';
import * as Z from './zones';
import type {
  AchievementDef,
  BuildingDef,
  CallingDef,
  CartDef,
  CharterDef,
  CommissionDef,
  ChronicleTemplate,
  Content,
  DecorDef,
  DistrictStyleDef,
  EventDef,
  FestivalDef,
  FestivalTwistDef,
  GoodDef,
  InnovationDef,
  ModuleDef,
  NeedsBasket,
  NeighborDef,
  PatternDef,
  RenownDef,
  RoadDef,
  SeasonDef,
  SpeciesDef,
  StoryArc,
  SwatchDef,
  ThreatDef,
  TraitDef,
  TreeDef,
  WeatherDef,
  WildlifeDef,
  WishTemplate,
  ZoneDef,
} from './types';

export { chroniclePhrases } from './chronicle';
export { callingPhrases, callingTuning } from './callings';
export { dealUse, dealUseDefault } from './dealUse';
export { festivalTuning } from './festivals';
export { lifePhrases } from './lives';
export { familyNames, valleyNamePrefixes, valleyNameSuffixes } from './names';
export { villagePhrases } from './villageText';
export * from './types';

// prettier-ignore
export const buildings: readonly BuildingDef[] = [
  SB.apiary,
  B.bakery,
  SB.bathHouse,
  SB.bellTower,
  VB.brickKiln,
  B.buildersYard,
  SB.carpenter,
  VB.cartShed,
  SB.chandler,
  VB.cheesemaker,
  VB.choppingShed,
  VB.ciderPress,
  VB.clayPit,
  VB.cornerShop,
  B.cottage,
  VB.dairy,
  B.farmhouse,
  VB.farmstead,
  B.fishersHut,
  B.forestersLodge,
  SB.gate,
  VB.herbGarden,
  VB.herbalist,
  He.herbalistsCottage,
  B.house,
  B.marketStall,
  SB.netTrap,
  VB.orchard,
  SB.palisade,
  SB.pieShop,
  SB.pitTrap,
  B.quarry,
  SB.riverDock,
  VB.sawmill,
  B.sawpit,
  VB.school,
  B.shed,
  VB.sheepPasture,
  VB.smithy,
  VB.spinner,
  Th.stoneBridge,
  SB.stoneWall,
  B.storehouse,
  SB.tailor,
  VB.tavern,
  B.townHall,
  VB.townhouse,
  VB.tradingPost,
  B.vegetablePlot,
  SB.watchHouse,
  SB.watchtower,
  VB.weaver,
  B.well,
  B.windmill,
  B.woodcutter,
  VB.workshop,
];

// prettier-ignore
export const decor: readonly DecorDef[] = [
  D.appleTree,
  ND.arborSeat,
  D.barrels,
  D.bench,
  D.birdbath,
  Fe.bonfire,
  Fe.bunting,
  VD.cafeTable,
  D.cherryTree,
  D.crates,
  D.curvedBench,
  D.fence,
  Fe.festivalStage,
  Fe.festivalStall,
  Fe.festivalTable,
  Fe.flowerArch,
  D.flowerBed,
  VD.flowerCart,
  FD.flowerTrellis,
  VD.fountain,
  Th.gateBanner,
  D.hangingLantern,
  D.hedge,
  D.herbPlanter,
  VD.lampPost,
  D.lantern,
  Th.lookoutBench,
  D.lowWall,
  VD.maypole,
  Cl.millstoneBench,
  D.mooringPost,
  VD.noticeBoard,
  FD.paintedShopSign,
  ND.pearTree,
  D.planter,
  D.planterWall,
  FD.rainBarrel,
  ND.reedBed,
  D.ringBench,
  Cl.roseArch,
  ND.seeSaw,
  D.signpost,
  ND.swing,
  FD.toolRack,
  Cl.waysideShrine,
  FD.weathervane,
  D.wildflowerVerge,
];

// prettier-ignore
export const roads: readonly RoadDef[] = [
  R.lane,
  R.path,
  R.street,
];

// prettier-ignore
export const trees: readonly TreeDef[] = [
  T.birch,
  T.oak,
  T.pine,
];

/** APPEND-ONLY. Never reorder or remove: saves store per-good arrays by these indexes. */
// prettier-ignore
export const goods: readonly GoodDef[] = [
  G.logs,
  G.planks,
  G.stone,
  G.wheat,
  G.flour,
  G.bread,
  G.vegetables,
  G.fish,
  // I2 (C4.0)
  VG.clay,
  VG.bricks,
  VG.wool,
  VG.yarn,
  VG.cloth,
  VG.milk,
  VG.cheese,
  VG.apples,
  VG.cider,
  VG.firewood,
  VG.herbs,
  VG.tools,
  // I3 (C5.0)
  SG.coats,
  SG.furniture,
  SG.pies,
  SG.honey,
  SG.candles,
];

// prettier-ignore
export const species: readonly SpeciesDef[] = [
  Sp.badger,
  Sp.fox,
  Sp.hedgehog,
  Sp.mouse,
  Sp.otter,
  Sp.rabbit,
  Sp.squirrel,
];

// prettier-ignore
export const traits: readonly TraitDef[] = [
  Tr.artistic,
  Tr.bookish,
  Tr.cheerful,
  Tr.curious,
  Tr.earlyBird,
  Tr.generous,
  Tr.greenFingered,
  Tr.grumpy,
  Tr.homebody,
  Tr.nightOwl,
  Tr.practical,
  Tr.reformed,
  Tr.romantic,
  Tr.shy,
  Tr.sporty,
  Tr.sweetTooth,
  Tr.thrifty,
];

// prettier-ignore
export const wishes: readonly WishTemplate[] = [
  W.aGardenPlot,
  W.aProperPath,
  W.aSecondWell,
  W.aWellCloser,
  W.bakeryNearby,
  W.flowersOnTheLane,
  W.freshFish,
  W.lanternOnMyWayHome,
  W.neighbors,
  W.quietPlease,
  W.riverBench,
  W.somewhereToSit,
  W.treeByMyWindow,
];

// prettier-ignore
export const patterns: readonly PatternDef[] = [
  VP.bridgeCrossing,
  SP.childrensCorner,
  VP.cornerCafe,
  P.hedgerowLane,
  P.kitchenGarden,
  P.lanternWalk,
  VP.marketCross,
  SP.orchardPath,
  P.pocketPark,
  SP.pondGarden,
  P.promenadeByTheWater,
  SP.readingNook,
  P.sittingWall,
  VP.smallSquare,
  SP.townGate,
  P.treePlace,
  VP.villageGreen,
  SP.watchLookout,
  P.wellGatheringPlace,
  VP.windowGardens,
];

// prettier-ignore
export const achievements: readonly AchievementDef[] = [
  A.balancedBooks,
  A.breadOnTheTable,
  A.builtTogether,
  A.everyDoorAName,
  SA.fieldNotes,
  A.firstFootsteps,
  SA.fiveStars,
  A.hearthAndHome,
  A.plankByPlank,
  SA.theFirstWinter,
  SA.theGateHeld,
  A.theLongWalkHome,
  SA.theRiverRunsClean,
  SA.warmHearths,
  A.wellMet,
  A.wishesGranted,
];

// prettier-ignore
export const chronicle: readonly ChronicleTemplate[] = [
  C.achievement,
  Th.banditHome,
  Th.banditSent,
  L.birth,
  Cl.calling,
  SC.circus,
  SC.coldSnap,
  FC.commissionDone,
  FC.festival,
  FC.firstBoat,
  SC.firstFrost,
  C.firstOf,
  ND.firstSighting,
  SC.firstWinter,
  SC.flood,
  C.founding,
  Gu.guideDone,
  C.householdArrived,
  C.householdLeft,
  C.patternDiscovered,
  Th.raidHeld,
  Th.raidLost,
  Th.raidRepelled,
  L.rankUp,
  FC.renownLevel,
  L.seaside,
  C.seasonSummary,
  FC.shopOpened,
  L.storyArrived,
  L.storyFinale,
  C.threatDial,
  SC.trialFailed,
  SC.trialPassed,
  L.wedding,
  C.wishesDigest,
  Th.wolves,
  Th.wolvesHowl,
];

// prettier-ignore
export const swatches: readonly SwatchDef[] = [
  Sw.accentMustard,
  Sw.accentNavy,
  Sw.accentRed,
  Sw.accentTeal,
  Sw.accentWhite,
  Sw.flowersButtercup,
  Sw.flowersCornflower,
  Sw.flowersCream,
  Sw.flowersGeranium,
  Sw.flowersMixed,
  Sw.flowersRose,
  Sw.materialShingle,
  Sw.materialSlate,
  Sw.materialThatch,
  Sw.materialTile,
  Sw.roofMoss,
  Sw.roofPlum,
  Sw.roofSlate,
  Sw.roofTerracotta,
  Sw.roofThatch,
  Sw.wallBrick,
  Sw.wallButter,
  Sw.wallCream,
  Sw.wallRose,
  Sw.wallSage,
  Sw.wallSky,
  Sw.wallStone,
];

// --- I2 (C4.0) --------------------------------------------------------------------------------

// prettier-ignore
export const zones: readonly ZoneDef[] = [
  Z.crafts,
  Z.farms,
  Z.homesLow,
  Z.homesMedium,
  Z.shops,
];

// prettier-ignore
export const baskets: readonly NeedsBasket[] = [
  Ba.craftsfolk,
  Ba.settler,
];

// prettier-ignore
export const neighbors: readonly NeighborDef[] = [
  N.millhaven,
  N.stonecross,
];

// prettier-ignore
export const innovations: readonly InnovationDef[] = [
  I.barometer,
  I.brickKiln,
  I.carts,
  I.cobbles,
  I.seedDrill,
  I.waterWheel,
  I.wheelbarrows,
];

// prettier-ignore
export const charters: readonly CharterDef[] = [
  Ch.villageCharter,
];

/** APPEND-ONLY since C5.0 (like goods): conditions name arcs by id, but keep old indexes stable too. */
// prettier-ignore
export const stories: readonly StoryArc[] = [
  Sr.inventor,
  Sr.merchant,
  Sr.musician,
  // I3 (C5.0)
  He.herbalist,
  Sm.stonemason,
];

// prettier-ignore
export const carts: readonly CartDef[] = [
  Ca.cart,
];

// --- I2 (C4B) ---------------------------------------------------------------------------------

// prettier-ignore
export const styles: readonly DistrictStyleDef[] = [
  St.brick,
  St.plaster,
  St.stone,
  St.timber,
];

// --- I3 (C5.0) --------------------------------------------------------------------------------

/** In SeasonIndex order (spring 0 to winter 3), not alphabetical. */
// prettier-ignore
export const seasons: readonly SeasonDef[] = [
  Se.spring,
  Se.summer,
  Se.autumn,
  Se.winter,
];

// prettier-ignore
export const weather: readonly WeatherDef[] = [
  Se.clear,
  Se.cloudy,
  Se.fog,
  Se.heat,
  Se.rain,
  Se.snow,
  Se.storm,
];

// prettier-ignore
export const events: readonly EventDef[] = [
  Se.circus,
  Se.coldSnap,
  Se.drought,
  Se.earlyFrost,
  Se.flood,
];

// prettier-ignore
export const festivals: readonly FestivalDef[] = [
  Fe.blossomFair,
  Fe.harvestSupper,
  Fe.hearthFeast,
  Fe.lanternNight,
];

// prettier-ignore
export const twists: readonly FestivalTwistDef[] = [
  Fe.costumeParade,
  Fe.harvestDisplay,
  Fe.lanternsOnTheWater,
  Fe.pieContest,
  Fe.snowSculptures,
];

/** C5C writes about 30 species (one line each, alphabetical). */
// prettier-ignore
export const wildlife: readonly WildlifeDef[] = [
  Na.blueTit,
  Na.bumblebee,
  Na.commonBlue,
  Na.commonFrog,
  Na.commonToad,
  Na.dragonfly,
  Na.elephantHawkMoth,
  Na.firefly,
  Na.gardenSnail,
  Na.glowWorm,
  Na.goldfinch,
  Na.greatSpottedWoodpecker,
  Na.greyHeron,
  Na.honeybee,
  Na.kingfisher,
  Na.ladybird,
  Na.mallard,
  Na.muteSwan,
  Na.peacockButterfly,
  Na.perch,
  Na.pipistrelle,
  Na.robin,
  Na.roeDeer,
  Na.smoothNewt,
  Na.songThrush,
  Na.stagBeetle,
  Na.stoat,
  Na.swallow,
  Na.tawnyOwl,
  Na.trout,
  Na.waterVole,
  Na.wren,
];

// prettier-ignore
export const threats: readonly ThreatDef[] = [
  Se.bandits,
  Se.wolves,
];

/** C5C writes the modules (one line each, alphabetical). */
// prettier-ignore
export const modules: readonly ModuleDef[] = [
  Na.arcade,
  Na.balcony,
  Na.bayWindow,
  Na.dormer,
  Na.extraFloor,
  Na.flowerBoxes,
  Na.ivy,
  Na.porch,
  Na.tower,
];

/** C5B writes the commissions (one line each, alphabetical). */
// prettier-ignore
export const commissions: readonly CommissionDef[] = [
  Co.countySurveyor,
  Co.millhavenBread,
  Co.millhavenFurniture,
  Co.minstrelCandles,
  Co.stonecrossCoats,
  Co.stonecrossPlanks,
  Co.theDowager,
];

/** In level order, 0 to 5. */
// prettier-ignore
export const renown: readonly RenownDef[] = [
  Se.renown0,
  Se.renown1,
  Se.renown2,
  Se.renown3,
  Se.renown4,
  Se.renown5,
];

// prettier-ignore
export const callings: readonly CallingDef[] = [
  Cl.gardenVillage,
  Cl.millTown,
  Cl.pilgrimsRest,
];

function byId<T extends { id: string }>(list: readonly T[]): ReadonlyMap<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

export const content: Content = {
  buildings,
  decor,
  roads,
  trees,
  callings,
  callingById: byId(callings),
  buildingById: byId(buildings),
  decorById: byId(decor),
  roadById: byId(roads),
  treeById: byId(trees),
  goods,
  goodById: byId(goods),
  goodIndex: new Map(goods.map((g, i) => [g.id, i])),
  species,
  speciesById: byId(species),
  traits,
  traitById: byId(traits),
  familyNames,
  wishes,
  wishById: byId(wishes),
  patterns,
  patternById: byId(patterns),
  achievements,
  achievementById: byId(achievements),
  chronicle,
  chronicleByKind: new Map(chronicle.map((c) => [c.kind, c])),
  swatches,
  zones,
  zoneById: byId(zones),
  zoneByValue: new Map(zones.map((z) => [z.layerValue, z])),
  baskets,
  basketByTier: new Map(baskets.map((b) => [b.tier, b])),
  neighbors,
  neighborById: byId(neighbors),
  innovations,
  innovationById: byId(innovations),
  charters,
  charterById: byId(charters),
  stories,
  storyById: byId(stories),
  carts,
  cartById: byId(carts),
  styles,
  styleById: byId(styles),
  seasons,
  weather,
  weatherById: byId(weather),
  events,
  eventById: byId(events),
  festivals,
  festivalById: byId(festivals),
  twists,
  twistById: byId(twists),
  wildlife,
  wildlifeById: byId(wildlife),
  threats,
  threatById: byId(threats),
  modules,
  moduleById: byId(modules),
  habitats: Na.habitats,
  habitatSources: Na.habitatSources,
  commissions,
  commissionById: byId(commissions),
  renown,
  guide: Gu.firstDays,
  dressing: Dr.dressingSteps,
};
