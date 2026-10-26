// Content registry. Add one line per entry, kept in alphabetical order, so parallel
// branches adding different entries merge cleanly. The one exception is `goods`: its order is
// append-only, because a good's position is its index in every per-good array in saved state.
import * as A from './achievements';
import * as B from './buildings';
import * as C from './chronicle';
import * as D from './decor';
import * as G from './goods';
import { familyNames } from './names';
import * as P from './patterns';
import * as R from './roads';
import * as Sp from './species';
import * as Sw from './swatches';
import * as T from './trees';
import * as Tr from './traits';
import * as W from './wishes';
import type {
  AchievementDef,
  BuildingDef,
  ChronicleTemplate,
  Content,
  DecorDef,
  GoodDef,
  PatternDef,
  RoadDef,
  SpeciesDef,
  SwatchDef,
  TraitDef,
  TreeDef,
  WishTemplate,
} from './types';

export { familyNames, valleyNamePrefixes, valleyNameSuffixes } from './names';
export * from './types';

// prettier-ignore
export const buildings: readonly BuildingDef[] = [
  B.bakery,
  B.buildersYard,
  B.cottage,
  B.farmhouse,
  B.fishersHut,
  B.forestersLodge,
  B.house,
  B.marketStall,
  B.quarry,
  B.sawpit,
  B.shed,
  B.storehouse,
  B.townHall,
  B.vegetablePlot,
  B.well,
  B.windmill,
  B.woodcutter,
];

// prettier-ignore
export const decor: readonly DecorDef[] = [
  D.appleTree,
  D.barrels,
  D.bench,
  D.birdbath,
  D.cherryTree,
  D.crates,
  D.curvedBench,
  D.fence,
  D.flowerBed,
  D.hangingLantern,
  D.hedge,
  D.herbPlanter,
  D.lantern,
  D.lowWall,
  D.mooringPost,
  D.planter,
  D.planterWall,
  D.ringBench,
  D.signpost,
  D.wildflowerVerge,
];

// prettier-ignore
export const roads: readonly RoadDef[] = [
  R.lane,
  R.path,
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
  P.hedgerowLane,
  P.kitchenGarden,
  P.lanternWalk,
  P.pocketPark,
  P.promenadeByTheWater,
  P.sittingWall,
  P.treePlace,
  P.wellGatheringPlace,
];

// prettier-ignore
export const achievements: readonly AchievementDef[] = [
  A.balancedBooks,
  A.breadOnTheTable,
  A.builtTogether,
  A.everyDoorAName,
  A.firstFootsteps,
  A.hearthAndHome,
  A.plankByPlank,
  A.theLongWalkHome,
  A.wellMet,
  A.wishesGranted,
];

// prettier-ignore
export const chronicle: readonly ChronicleTemplate[] = [
  C.achievement,
  C.firstOf,
  C.founding,
  C.householdArrived,
  C.householdLeft,
  C.patternDiscovered,
  C.seasonSummary,
  C.wishesDigest,
];

// prettier-ignore
export const swatches: readonly SwatchDef[] = [
  Sw.accentMustard,
  Sw.accentNavy,
  Sw.accentRed,
  Sw.accentTeal,
  Sw.accentWhite,
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

function byId<T extends { id: string }>(list: readonly T[]): ReadonlyMap<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

export const content: Content = {
  buildings,
  decor,
  roads,
  trees,
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
};
