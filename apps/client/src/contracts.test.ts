// Type-level check that every I0 contract exists and is exported with its specified shape
// (docs/spec/20-architecture.md and 21-networking-and-saves.md). `npm run typecheck` fails if
// a contract is renamed or loses a member; additive changes keep it green.
import type { BuildingDef, Content, Cost, DecorDef, PlacementRule, RoadDef, TreeDef } from '@qoti/content';
import type { C2S, PresenceMsg, PresenceUpdate, RosterEntry, S2C, ValleyMeta } from '@qoti/protocol';
import type {
  BuildingView,
  ClockView,
  Command,
  CommandHandler,
  DecorView,
  EntityId,
  LayerName,
  LayerPatch,
  Lens,
  MapReader,
  NoteView,
  Rect,
  RejectReason,
  RoadKind,
  Rot4,
  SeatedCommand,
  SeatId,
  SeatView,
  SimEvent,
  Speed,
  System,
  TickCtx,
  TreeSpecies,
  Turn,
  ValleySettings,
  ViewSnapshot,
  WorldState,
} from '@qoti/sim';
import { describe, expectTypeOf, it } from 'vitest';
import type { PointerInfo, Tool } from './input/tool';
import type { RoomConnection } from './net/connection';
import type { Ghost, RenderApi } from './render/api';
import type { FromWorker, ToWorker } from './worker/messages';

describe('I0 contracts', () => {
  it('ids and settings', () => {
    expectTypeOf<SeatId>().toEqualTypeOf<0 | 1 | 2 | 3>();
    expectTypeOf<EntityId>().toEqualTypeOf<number>();
    expectTypeOf<Rot4>().toEqualTypeOf<0 | 1 | 2 | 3>();
    expectTypeOf<Speed>().toEqualTypeOf<0 | 1 | 2 | 3>();
    expectTypeOf<Lens>().toEqualTypeOf<'hearth' | 'ledger'>();
    expectTypeOf<RoadKind>().toEqualTypeOf<'path' | 'lane'>();
    expectTypeOf<TreeSpecies>().toEqualTypeOf<'oak' | 'birch' | 'pine'>();
    expectTypeOf<Rect>().toEqualTypeOf<[x0: number, z0: number, x1: number, z1: number]>();
    expectTypeOf<LayerName>().toEqualTypeOf<
      | 'height'
      | 'terrain'
      | 'water'
      | 'fertility'
      | 'deposit'
      | 'road'
      | 'tree'
      | 'occupant'
      | 'zone'
      | 'parcel'
      | 'flags'
      | 'charm'
      | 'charmNature'
      | 'charmComfort'
      | 'charmLight'
      | 'charmView'
      | 'charmNoise'
      | 'fieldOwner'
      | 'crop'
    >();
    expectTypeOf<keyof ValleySettings>().toEqualTypeOf<
      'mode' | 'economy' | 'threat' | 'togetherOnly' | 'townName' | 'valleyName'
    >();
  });

  it('commands, turns and reject reasons', () => {
    expectTypeOf<Command['t']>().toEqualTypeOf<
      | 'road.paint'
      | 'road.remove'
      | 'build.place'
      | 'build.remove'
      | 'decor.place'
      | 'decor.placeRun'
      | 'decor.remove'
      | 'tree.plant'
      | 'tree.remove'
      | 'note.pin'
      | 'note.remove'
      | 'time.setSpeed'
      | 'seat.setProfile'
      | 'valley.setSettings'
      | 'sys.seatJoined'
      | 'sys.seatLeft'
      | 'build.customize'
      | 'build.setPriority'
      | 'build.setPaused'
      | 'field.paint'
      | 'field.remove'
      | 'ledger.setForSale'
    >();
    expectTypeOf<SeatedCommand>().toEqualTypeOf<{ seat: SeatId; seq: number; cmd: Command }>();
    expectTypeOf<Turn>().toEqualTypeOf<{ t: number; cmds: SeatedCommand[] }>();
    expectTypeOf<RejectReason>().toEqualTypeOf<
      | 'OUT_OF_BOUNDS'
      | 'LOCKED_PARCEL'
      | 'WATER'
      | 'OCCUPIED'
      | 'TOO_STEEP'
      | 'NEEDS_DEPOSIT'
      | 'NEEDS_WATER_EDGE'
      | 'NEEDS_FERTILITY'
      | 'CANNOT_AFFORD'
      | 'NOT_FOUND'
      | 'NOT_ALLOWED'
      | 'TOGETHER_ONLY'
      | 'TOO_MANY'
      | 'INVALID'
      | 'LEAN_TIMES'
      | 'LOCKED'
      | 'OUT_OF_RANGE'
      | 'CHANGED'
    >();
  });

  it('views and events', () => {
    expectTypeOf<keyof ViewSnapshot>().toEqualTypeOf<
      | 'simVersion'
      | 'saveVersion'
      | 'size'
      | 'lastTurn'
      | 'layers'
      | 'buildings'
      | 'decor'
      | 'notes'
      | 'seats'
      | 'settings'
      | 'clock'
      | 'meta'
      | 'residents'
      | 'households'
      | 'stocks'
      | 'budget'
      | 'wishes'
      | 'patterns'
      | 'chronicle'
      | 'achievements'
      | 'town'
    >();
    expectTypeOf<ViewSnapshot['meta']>().toEqualTypeOf<WorldState['meta']>();
    expectTypeOf<keyof ClockView>().toEqualTypeOf<
      'tick' | 'speed' | 'year' | 'season' | 'day' | 'hour' | 'minute'
    >();
    expectTypeOf<keyof SeatView>().toEqualTypeOf<
      'seat' | 'name' | 'color' | 'lens' | 'connected' | 'desiredSpeed' | 'lastSeenTick'
    >();
    expectTypeOf<keyof DecorView>().toEqualTypeOf<'id' | 'def' | 'fx' | 'fz' | 'rot' | 'builtBy'>();
    expectTypeOf<keyof NoteView>().toEqualTypeOf<'id' | 'x' | 'z' | 'text' | 'by' | 'tick'>();
    expectTypeOf<BuildingView['stage']>().toEqualTypeOf<'construction' | 'built'>();
    expectTypeOf<SimEvent['e']>().toEqualTypeOf<
      | 'tiles.changed'
      | 'building.added'
      | 'building.updated'
      | 'building.removed'
      | 'decor.added'
      | 'decor.removed'
      | 'note.added'
      | 'note.removed'
      | 'seat.updated'
      | 'settings.updated'
      | 'clock'
      | 'command.rejected'
      | 'notify'
      | 'resident.added'
      | 'resident.updated'
      | 'resident.removed'
      | 'household.added'
      | 'household.updated'
      | 'household.removed'
      | 'stocks.updated'
      | 'budget.updated'
      | 'town.updated'
      | 'wish.added'
      | 'wish.granted'
      | 'wish.expired'
      | 'pattern.discovered'
      | 'pattern.siteAdded'
      | 'pattern.siteRemoved'
      | 'pattern.updated'
      | 'chronicle.added'
      | 'achievement.unlocked'
    >();
    expectTypeOf<keyof LayerPatch>().toEqualTypeOf<'layer' | 'rect' | 'data'>();
  });

  it('sim interfaces', () => {
    expectTypeOf<keyof MapReader>().toEqualTypeOf<
      | 'size'
      | 'height'
      | 'terrain'
      | 'water'
      | 'road'
      | 'tree'
      | 'occupant'
      | 'deposit'
      | 'fertility'
      | 'parcelUnlocked'
      | 'decorNear'
    >();
    expectTypeOf<keyof CommandHandler>().toEqualTypeOf<'type' | 'validate' | 'apply'>();
    expectTypeOf<keyof System>().toEqualTypeOf<'id' | 'order' | 'every' | 'offset' | 'tick'>();
    expectTypeOf<keyof TickCtx>().toEqualTypeOf<'events' | 'rng' | 'content' | 'dirty'>();
  });

  it('client interfaces', () => {
    expectTypeOf<keyof RenderApi>().toEqualTypeOf<
      | 'pickTile'
      | 'pickEntity'
      | 'setGhost'
      | 'setOverlay'
      | 'setPresence'
      | 'ping'
      | 'focus'
      | 'setQuality'
      | 'project'
      | 'follow'
      | 'setBubbles'
      | 'highlight'
    >();
    expectTypeOf<Ghost['kind']>().toExtend<string>();
    expectTypeOf<ToWorker['k']>().toEqualTypeOf<'init' | 'turns' | 'snapshot' | 'hash' | 'inspect'>();
    expectTypeOf<FromWorker['k']>().toEqualTypeOf<
      'ready' | 'update' | 'agents' | 'hash' | 'snapshot' | 'error' | 'inspected'
    >();
    expectTypeOf<RoomConnection>().toHaveProperty('submit');
    expectTypeOf<RoomConnection>().toHaveProperty('status');
    expectTypeOf<Tool['lane']>().toEqualTypeOf<'hearth' | 'ledger' | 'shared'>();
    expectTypeOf<PointerInfo>().toHaveProperty('tile');
  });

  it('protocol messages', () => {
    expectTypeOf<C2S['k']>().toEqualTypeOf<
      'hello' | 'cmd' | 'presence' | 'ping' | 'emote' | 'hash' | 'snapshot' | 'bye'
    >();
    expectTypeOf<S2C['k']>().toEqualTypeOf<
      | 'welcome'
      | 'turn'
      | 'presence'
      | 'ping'
      | 'emote'
      | 'roster'
      | 'needSnapshot'
      | 'resync'
      | 'reloadRequired'
      | 'error'
    >();
    expectTypeOf<keyof ValleyMeta>().toEqualTypeOf<'id' | 'seed' | 'settings' | 'createdAt'>();
    expectTypeOf<RosterEntry>().toEqualTypeOf<{ seat: SeatId; connected: boolean }>();
    expectTypeOf<PresenceMsg['k']>().toEqualTypeOf<'presence' | 'ping' | 'emote' | 'roster'>();
    expectTypeOf<keyof PresenceUpdate>().toEqualTypeOf<'cursor' | 'tool' | 'cam'>();
  });

  it('content types', () => {
    expectTypeOf<BuildingDef['category']>().toEqualTypeOf<
      'home' | 'production' | 'storage' | 'service' | 'civic' | 'landmark' | 'defense'
    >();
    expectTypeOf<DecorDef>().toHaveProperty('radius');
    expectTypeOf<RoadDef>().toHaveProperty('layerValue');
    expectTypeOf<TreeDef>().toHaveProperty('species');
    expectTypeOf<Cost>().toHaveProperty('coins');
    expectTypeOf<PlacementRule['kind']>().toEqualTypeOf<'waterEdge' | 'deposit' | 'fertility' | 'height'>();
    expectTypeOf<Content>().toHaveProperty('buildingById');
  });
});
