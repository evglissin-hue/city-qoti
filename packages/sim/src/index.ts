// @qoti/sim public API: contracts, the deterministic simulation and its shared helpers.
export type * from './contracts';
export * from './constants';

export { cyrb128 } from './rng/cyrb128';
export { sfc32Next } from './rng/sfc32';
export { RNG_STREAMS, rngFromSeed, seedStream, seedStreams, StreamRng, streamIndex } from './rng/streams';

export { DecorGrid } from './map/decorGrid';
export { DIR_COS, DIR_SIN, rotationForDirection } from './map/directions';
export { Dirty } from './map/dirty';
export {
  clampRect,
  copyRect,
  createLayers,
  Deposit,
  Flags,
  inBounds,
  INT32_LAYERS,
  LAYER_NAMES,
  pasteRect,
  Road,
  Terrain,
  tilesRect,
  TREE_MATURE,
  TREE_SPECIES,
  treeSpecies,
  treeStage,
  treeValue,
  Water,
} from './map/layers';
export { createStateReader } from './map/reader';
export { generateValley, type GeneratedValley, valleyNameFor } from './map/worldgen';

export * from './rules';

export { ALLOWED_WHEN_APART, commandHandlers, ensureSeat, handlerFor } from './commands';
export type { AnyHandler, HandlerFor } from './commands';
export { pipeline, systems } from './systems';
export { calendar, type CalendarDate } from './systems/clock/calendar';

export {
  advanceTo,
  applyTurn,
  applyTurns,
  createTickCtx,
  effectiveSpeed,
  executeCommand,
  runTick,
  type SimCtx,
} from './turn';
export {
  achievementView,
  budgetView,
  buildingView,
  buildView,
  chronicleView,
  clockView,
  constructionProgress,
  constructionStage,
  decorView,
  fillText,
  goodPairs,
  householdView,
  moodBand,
  nameOf,
  noteView,
  patternView,
  residentName,
  residentView,
  runtimeView,
  seatView,
  stocksView,
  townStock,
  townView,
  wishView,
  workforceView,
} from './view';
export { agentFrame } from './view/agents';
export {
  awayLetter,
  buildingDetail,
  inspect,
  residentDetail,
  type InspectKind,
  type InspectResult,
} from './view/inspect';
export { evaluate, type Binding } from './conditions';
export { HealthWatch, type HealthIssue, type HealthKind } from './view/health';

export { base64ToBytes, bytesToBase64 } from './state/base64';
export { createValley, createWorld, defaultSettings } from './state/create';
export { createRuntime, emptyHamletSlices, goodsArray, isStandard } from './state/hamlet';
export { insertBuilding } from './state/place';
export { START_GOODS } from './systems/economy/start';
export { settleHousehold } from './systems/residents/lifecycle';
export { economyDial, type EconomyDial } from './systems/economy/dial';
export { fieldCost, placementCost, roadCost } from './systems/economy/api';
export { nearestOutletWithFood, outletFood, takeFromOutlet } from './systems/economy/outlets';
export { doorTile } from './systems/movement/api';
export {
  CROP_RIPE,
  CROP_STAGE_SHIFT,
  FIELD_RANGE,
  FIELD_TILES_PER_WORKER,
  fieldCap,
  fieldTileProblem,
} from './systems/production/fields';
export { soilPermille } from './systems/production/soil';
// I2 (C4.0)
export {
  charterView,
  creditLimit,
  innovationView,
  leversView,
  loansOwed,
  loansView,
  lotView,
  marketView,
  nextRank,
  planView,
  regionalPrice,
  requestText,
  requestView,
  storyLetter,
  storyView,
  tierCounts,
  tradeView,
  wagesAt,
} from './view';
export { foodDays, goodsAtMarket } from './conditions';
export { findRoute } from './conditions/route';
export { emptyVillageSlices, hasInnovation, rankAtLeast } from './state/village';
export { moneyBalance, moneyInside, pay, type Purse } from './systems/economy/money';
export { buy, marketOpen, outletsWith, priceOf, sell, tillPrice } from './systems/market/api';
// I2 (C4A)
export { basketScore, likeHalves } from './systems/market/baskets';
export { coverOf, multiplierFor, stepPrice, targetPrice } from './systems/market/prices';
export { incomeTax, wageBill } from './systems/market/wages';
export { expenses, income } from './systems/economy';
export { caravanCapacity, postBuyPrice, postSellPrice } from './systems/trade/caravans';
export { tradingPost } from './systems/trade/post';
export { isLean, overdraftLimit } from './systems/loans/credit';
export { growLot, lotPlacement } from './systems/growth/api';
export { cartAt, cartRoute, cartTile, requestCartMove } from './systems/traffic/api';
// I2 (C4B): growth, traffic, desire paths and stairs for the client (overlays, tools, previews).
export { growthDemand, type GrowthDemand } from './systems/growth';
export { roadCapacity, roadNoise, slowdownPercent, trafficFlow } from './systems/traffic/api';
export { roadKindLocked, wantsStairs } from './systems/traffic/streets';
export { DESIRE_PATH_WEAR, desirePathTiles, WEAR_VISIBLE } from './systems/traffic/wear';
export { grantReward, storyStep } from './systems/stories/api';
export { countsAsBuilt, hasBuilt, meetsRequires, unlockInnovation } from './systems/innovations/api';
// I2 (C4C): services, tiers and carts for the client and the bench.
export { serviceCoverage, servedBy } from './systems/services/coverage';
export { checkTier, homeRoute, nextTier, tierProgress } from './systems/tiers/api';
export { CART_MIN_LOAD, CART_MIN_TRIP } from './systems/logistics/carts';
export { terraformCost } from './commands/terrain';
export { findById, findIndexById, removeById } from './state/entities';
export { fnv64Hex, hashState } from './state/hash';
export { deserialize, serialize } from './state/serialize';
export { migrateSave, migrations, SAVE_VERSION, type Migration, type SaveObject } from './state/version';
export { worldIndex, type WorldIndex } from './state/worldIndex';
export { SIM_VERSION } from './version.generated';
// I3 (C5.0): the season views, hooks and cross-track APIs for the client and the bench.
export {
  commissionView,
  dockView,
  festivalOf,
  festivalResultView,
  festivalView,
  fieldGuideEntryView,
  guideView,
  raidResultView,
  raidView,
  renownView,
  seasonCardView,
  threatView,
  trialView,
  watchView,
  weatherEventView,
  weatherView,
} from './view/seasons';
export { seasonReportView } from './view/season';
export { emptySeasonsSlices, markFloodplain, seasonAt, startGuide } from './state/seasons';
export { FESTIVAL_SITE_MAX, FESTIVAL_SITE_MIN } from './commands/festival';
export { WATCH_BUDGET_MAX, WATCH_MAX } from './commands/watch';
export { addRenown, levelFor, renownLevel } from './systems/renown/api';
export { festivalMorale } from './systems/festivals/api';
export {
  forecast,
  isCold,
  isFlooded,
  isFrozen,
  seasonNow,
  warmthReport,
  weatherToday,
} from './systems/seasons/api';
export { habitatAt, hasSpecies, pestLoss, pollinatorFactor } from './systems/habitats/api';
export { deterrenceAt, isRaidActive, lanternLit, watchStrength, wealth } from './systems/threats/api';
// I3 (C5A): the winter stores, for the autoplayer and the tuner.
export { larder } from './systems/seasons/stores';
