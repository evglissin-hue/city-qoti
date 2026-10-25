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
export { generateValley, type GeneratedValley } from './map/worldgen';

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
export { buildingView, buildView, clockView, decorView, noteView, seatView } from './view';

export { base64ToBytes, bytesToBase64 } from './state/base64';
export { createWorld, defaultSettings } from './state/create';
export { findById, findIndexById, removeById } from './state/entities';
export { fnv64Hex, hashState } from './state/hash';
export { deserialize, serialize } from './state/serialize';
export { migrateSave, migrations, SAVE_VERSION, type Migration, type SaveObject } from './state/version';
export { worldIndex, type WorldIndex } from './state/worldIndex';
export { SIM_VERSION } from './version.generated';
