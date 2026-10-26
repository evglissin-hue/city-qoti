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
} from './systems/production/fields';
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
export { emptyVillageSlices, hasInnovation, rankAtLeast } from './state/village';
export { moneyBalance, moneyInside, pay, type Purse } from './systems/economy/money';
export { buy, marketOpen, outletsWith, priceOf, sell, tillPrice } from './systems/market/api';
// I2 (C4A)
export { basketScore, likeHalves } from './systems/market/baskets';
export { coverOf, multiplierFor, stepPrice, targetPrice } from './systems/market/prices';
export { incomeTax, wageBill } from './systems/market/wages';
export { caravanCapacity, postBuyPrice, postSellPrice } from './systems/trade/caravans';
export { tradingPost } from './systems/trade/post';
export { isLean, overdraftLimit } from './systems/loans/credit';
export { growLot } from './systems/growth/api';
export { cartAt, cartRoute, cartTile, requestCartMove } from './systems/traffic/api';
export { grantReward, storyStep } from './systems/stories/api';
export { unlockInnovation } from './systems/innovations/api';
export { terraformCost } from './commands/terrain';
export { findById, findIndexById, removeById } from './state/entities';
export { fnv64Hex, hashState } from './state/hash';
export { deserialize, serialize } from './state/serialize';
export { migrateSave, migrations, SAVE_VERSION, type Migration, type SaveObject } from './state/version';
export { worldIndex, type WorldIndex } from './state/worldIndex';
export { SIM_VERSION } from './version.generated';
