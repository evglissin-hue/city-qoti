# 20. Architecture

## Overview

```
 Laptop A                                   Cloudflare                     Laptop B
 ┌──────────────────────────────┐          ┌──────────────────┐          ┌──────────────────────────────┐
 │ UI (Preact)   Render (Three) │          │ Worker (static)  │          │ UI            Render         │
 │        ▲          ▲          │          │ ValleyRoom (DO)  │          │        ▲          ▲          │
 │        └─ Mirror ─┘          │ commands │  - orders cmds   │ commands │        └─ Mirror ─┘          │
 │             ▲                │ ───────► │    into turns    │ ◄─────── │             ▲                │
 │   Sim worker (deterministic) │ ◄─────── │  - stores log,   │ ───────► │   Sim worker (same code)     │
 │             ▲   turns        │  turns   │    snapshots     │  turns   │             ▲                │
 │        Net (RoomConnection)  │          │  - relays        │          │        Net (RoomConnection)  │
 └──────────────────────────────┘          │    presence      │          └──────────────────────────────┘
                                           └──────────────────┘
```

Both browsers run the same deterministic simulation (P48). The room only orders commands into turns, stores the log and snapshots, and relays presence. Offline solo play uses `LocalRoom`, the same room logic running in the browser.

## Repository layout

```
apps/
  client/              the game (Vite)
    src/app/           boot, title screen, routing, settings
    src/net/           RoomConnection: OnlineRoom (WebSocket), LocalRoom (in-browser)
    src/worker/        SimHost and sim.worker.ts
    src/state/         Mirror: client copy of the view, MapReader, signals
    src/render/        Renderer (RenderApi), layers, picking, ghosts, overlays, time of day, post
    src/input/         camera controller, tool manager, tools, shortcuts
    src/ui/            Preact components, lens toolbars, panels, theme
  gallery/             style kit viewer (Vite)
  server/              Cloudflare Worker + ValleyRoom Durable Object (wraps RoomCore)
packages/
  sim/                 deterministic simulation: no DOM, no Three, no network, no timers
    src/contracts/     shared types: ids, commands, events, views, settings
    src/state/         WorldState, create, serialize, hash, migrations
    src/rng/           seeded RNG streams
    src/map/           layers, worldgen, MapReader
    src/rules/         pure placement validators (used by sim and client)
    src/commands/      one file per command family + registry
    src/systems/       one folder per system + registry
    src/view/          view snapshot builder
  content/             game data and its types (no logic)
  protocol/            messages, RoomCore, LocalRoom storage adapters, turn buffer
  art/                 procedural geometry, palette, materials (depends on three)
tools/
  dev-server/          Node WebSocket server wrapping RoomCore (dev and e2e)
  bench/               headless simulation benchmarks
docs/                  spec and cycle briefs
```

**Dependency rules** (enforced by lint): `content` depends on nothing; `sim` on `content`; `protocol` on `sim` (types only); `art` on `three` and `content`; `client` on everything; `server` and `dev-server` on `protocol`. Nothing imports from an app.

## Tooling

Node 22 or newer, npm workspaces, TypeScript (strict, ESM, `moduleResolution: bundler`), Vite, Vitest, Playwright, ESLint (flat config) and Prettier, Three.js, Preact with `@preact/signals`, Wrangler for Cloudflare, `ws` for the dev server. Use current stable versions and pin exact versions in `package.json`.

## Simulation

### State

```ts
interface WorldState {
  saveVersion: number;
  seed: string;
  settings: ValleySettings;
  lastTurn: number;              // last applied turn number
  tick: number;                  // total ticks elapsed
  time: { desired: Speed[]; connected: SeatId[] };   // desired speed per seat
  rng: Uint32Array;              // 4 words per RngStream
  nextId: EntityId;
  map: MapLayers;                // typed arrays, see 10-world-and-building
  meta: { startArea: Rect; valleyGate: [number, number]; flow: 'ns' | 'we' };
  seats: SeatState[];
  buildings: Building[];         // sorted by id
  decor: Decor[];                // sorted by id
  notes: Note[];
  // per-system slices are added by later iterations, for example:
  // residents, households, economy, hearth, ledger, chronicle, threats, progression
}
```

- Entities live in arrays sorted by id, with index maps rebuilt on load. Ids come from `nextId` and are never reused.
- State values are integers wherever practical: pennies, unit counts, fixed-point positions. Floats are allowed in intermediate math (see determinism rules) and rounded before they are stored.

### Commands

```ts
interface CommandHandler<C extends Command> {
  type: C['t'];
  validate(state: WorldState, seat: SeatId, cmd: C): RejectReason | null; // pure
  apply(state: WorldState, seat: SeatId, cmd: C, ctx: TickCtx): void;
}
```

- All state changes go through commands. One file per command family in `src/commands/`, registered with one line in `src/commands/index.ts`.
- A rejected command changes nothing and emits `command.rejected` for the issuing seat's UI.
- `sys.*` commands come only from the room; the room drops any client-sent `sys.*`.

### Systems and the tick pipeline

```ts
interface System {
  id: string;
  order: number;                 // 10 clock, 20 construction, 30 production, 40 logistics,
                                 // 50 residents, 60 economy, 70 hearth, 80 threats,
                                 // 90 progression, 100 chronicle
  every?: number;                // run when tick % every === offset (default every tick)
  offset?: number;
  tick(state: WorldState, ctx: TickCtx): void;
}
interface TickCtx {
  events: SimEvent[];
  rng(stream: RngStream): Rng;
  content: Content;
  dirty: DirtyTracker;           // dirty chunks by layer group
}
```

`applyTurn(state, turn, ctx)`: apply the turn's commands in order, then run `effectiveSpeed(state)` ticks. Each tick runs the systems whose schedule matches, in `order`. Spread heavy hourly and daily work with offsets.

`effectiveSpeed` = minimum desired speed over connected seats; 0 if none connected; 0 if `settings.togetherOnly` and fewer than 2 seats are connected (and then only notes, plans and profile commands are accepted, plus `time.setSpeed` and `valley.setSettings`, so a seat on its own can still turn together only off).

### Determinism rules (packages/sim only)

- No `Math.random`, `Date`, `performance`, timers, `async`, `Intl`, locale methods, or `crypto`.
- Allowed math: `+ - * /`, `%`, `Math.sqrt`, `floor`, `ceil`, `round`, `trunc`, `abs`, `min`, `max`, `sign`, `Math.imul`, bitwise operators. Not allowed: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `exp`, `expm1`, `log*`, `pow`, `cbrt`, `hypot`, `sinh`, `cosh`, `tanh`, and the `**` operator. Use lookup tables or integer math.
- Iterate arrays or Maps (insertion order) only. Never iterate object keys for logic. Sort with total, deterministic comparators (tie-break by id).
- Randomness only from `ctx.rng(stream)`. Streams are an append-only enum (`worldgen`, `residents`, `wishes`, `weather`, `threats`, `misc`, ...).
- No per-tick allocation in hot paths; reuse buffers.
- View builders (`src/view/`) may compute floats freely (headings, interpolation hints) because their output never feeds back into state.

ESLint enforces the banned globals and properties in `packages/sim/**`.

### RNG

sfc32 per stream, seeded from `cyrb128(seed + ':' + streamName)`. State lives in `state.rng`, so snapshots resume exactly.

### Serialization, hashing, versions

- `serialize(state) -> Uint8Array`: JSON where typed arrays are base64 (32-bit layers little-endian), then gzip. The sim uses fflate's synchronous gzip so it stays free of async (CompressionStream is async only); the bytes are standard gzip. `deserialize` reverses it and rebuilds indexes (the decor spatial hash lives in a derived index, never in saved state).
- `hashState(state) -> string`: a fast 64-bit hash (two 32-bit multiply lanes with a murmur-style finalizer) over the typed layers as little-endian 32-bit words, the RNG words and the JSON of the rest. Clients compare hashes every 50 turns. (C3X: replaced byte-wise FNV-1a, which took 65 ms at City scale; this takes about 6.)
- `SAVE_VERSION` (integer): bump whenever the shape of saved state changes, and add `migrations[n]: (save) => save` with a test.
- `simVersion` (string): a hash of `packages/sim/src` and `packages/content/src`, generated at build time into `version.generated.ts` (gitignored). Two clients can share a valley only with the same `simVersion`.

### Placement rules and MapReader

```ts
interface MapReader {
  size: number;
  height(x: number, z: number): number;  terrain(x: number, z: number): number;
  water(x: number, z: number): number;   road(x: number, z: number): number;
  tree(x: number, z: number): number;    occupant(x: number, z: number): number;
  deposit(x: number, z: number): number; fertility(x: number, z: number): number;
  parcelUnlocked(x: number, z: number): boolean;
  decorNear(fx: number, fz: number, radius: number): DecorView[];
}
```

`src/rules/` exports `canPlaceBuilding`, `canPaintRoad`, `canPlaceDecor`, `canPlantTree` over any `MapReader`. Commands call them in `validate`; the client calls them on its Mirror for ghost previews, so previews always match the sim.

## I0 contracts

Defined in cycle 01, then changed only additively (see `31-parallel-development.md`). C1 also made these contracts: `contracts/state.ts` (`WorldState` and its parts), `contracts/map.ts` (`MapReader` and the placement results below) and `contracts/sim.ts` (`Rng`, `RngStream`, `DirtyTracker`, `TickCtx`, `CommandHandler`, `System`). Members marked "C1 addition" below were added while building C1.

```ts
// packages/sim/src/contracts/ids.ts
type SeatId = 0 | 1 | 2 | 3;
type EntityId = number;                 // positive, never reused
type Rot4 = 0 | 1 | 2 | 3;
type Speed = 0 | 1 | 2 | 3;
type Lens = 'hearth' | 'ledger';
type RoadKind = 'path' | 'lane';        // 'street' arrives in I2
type TreeSpecies = 'oak' | 'birch' | 'pine';
type Rect = [x0: number, z0: number, x1: number, z1: number];   // inclusive
type LayerName = 'height' | 'terrain' | 'water' | 'fertility' | 'deposit' | 'road'
               | 'tree' | 'occupant' | 'zone' | 'parcel' | 'flags';

// packages/sim/src/contracts/settings.ts
interface ValleySettings {
  mode: 'sandbox' | 'standard';         // I0 creates sandbox valleys
  economy: 'gentle' | 'standard' | 'thoughtful';
  threat: 'peaceful' | 'standard' | 'fierce';
  togetherOnly: boolean;
  townName: string;
  valleyName: string;
}

// packages/sim/src/contracts/commands.ts
type Command =
  | { t: 'road.paint'; kind: RoadKind; tiles: [number, number][] }       // max 256
  | { t: 'road.remove'; tiles: [number, number][] }
  | { t: 'build.place'; def: string; x: number; z: number; rot: Rot4 }   // x, z = footprint min corner
  | { t: 'build.remove'; ids: EntityId[] }
  | { t: 'decor.place'; def: string; fx: number; fz: number; rot: number }
  | { t: 'decor.placeRun'; def: string; from: [number, number]; to: [number, number] } // linear decor, fixed point
  | { t: 'decor.remove'; ids: EntityId[] }
  | { t: 'tree.plant'; species: TreeSpecies; x: number; z: number }
  | { t: 'tree.remove'; tiles: [number, number][] }
  | { t: 'note.pin'; x: number; z: number; text: string }               // max 200 chars
  | { t: 'note.remove'; id: EntityId }
  | { t: 'time.setSpeed'; speed: Speed }
  | { t: 'seat.setProfile'; name: string; color: number; lens: Lens }
  | { t: 'valley.setSettings'; settings: Partial<ValleySettings> }
  | { t: 'sys.seatJoined'; seat: SeatId }
  | { t: 'sys.seatLeft'; seat: SeatId };

interface SeatedCommand { seat: SeatId; seq: number; cmd: Command }      // seq: per-seat counter
interface Turn { t: number; cmds: SeatedCommand[] }

type RejectReason = 'OUT_OF_BOUNDS' | 'LOCKED_PARCEL' | 'WATER' | 'OCCUPIED' | 'TOO_STEEP'
  | 'NEEDS_DEPOSIT' | 'NEEDS_WATER_EDGE' | 'NEEDS_FERTILITY' | 'CANNOT_AFFORD'
  | 'NOT_FOUND' | 'NOT_ALLOWED' | 'TOGETHER_ONLY' | 'TOO_MANY' | 'INVALID';

// packages/sim/src/contracts/views.ts
interface BuildingView { id: EntityId; def: string; x: number; z: number; rot: Rot4;
  builtBy: SeatId; handmade: boolean; stage: 'construction' | 'built'; foundation: boolean;
  custom?: Record<string, string | boolean> }
interface DecorView { id: EntityId; def: string; fx: number; fz: number; rot: number; builtBy: SeatId }
interface NoteView { id: EntityId; x: number; z: number; text: string; by: SeatId; tick: number }
interface SeatView { seat: SeatId; name: string; color: number; lens: Lens;
  connected: boolean; desiredSpeed: Speed; lastSeenTick: number }
interface ClockView { tick: number; speed: Speed; year: number; season: 0 | 1 | 2 | 3;
  day: number; hour: number; minute: number }
interface ViewSnapshot { simVersion: string; saveVersion: number; size: number; lastTurn: number;
  layers: Record<LayerName, Uint8Array | Int32Array>;
  buildings: BuildingView[]; decor: DecorView[]; notes: NoteView[]; seats: SeatView[];
  settings: ValleySettings; clock: ClockView; meta: WorldState['meta'] }

// packages/sim/src/contracts/events.ts
type SimEvent =
  | { e: 'tiles.changed'; rect: Rect; layers: LayerName[] }
  | { e: 'building.added'; b: BuildingView } | { e: 'building.updated'; b: BuildingView }
  | { e: 'building.removed'; id: EntityId }
  | { e: 'decor.added'; d: DecorView } | { e: 'decor.removed'; id: EntityId }
  | { e: 'note.added'; n: NoteView } | { e: 'note.removed'; id: EntityId }
  | { e: 'seat.updated'; s: SeatView }
  | { e: 'settings.updated'; settings: ValleySettings }
  | { e: 'clock'; c: ClockView }                                        // on speed change and each in-game hour
  | { e: 'command.rejected'; seat: SeatId; seq: number; reason: RejectReason; detail?: string }
  | { e: 'notify'; kind: string; text: string; seat?: SeatId; at?: [number, number] };

interface LayerPatch { layer: LayerName; rect: Rect; data: Uint8Array | Int32Array }

// apps/client/src/worker/messages.ts
type ToWorker =
  | { k: 'init'; source: { kind: 'new'; seed: string; settings: ValleySettings }
                       | { kind: 'snapshot'; data: Uint8Array };
      turns?: Turn[] }                                                 // C1 addition: catch-up applied before ready
  | { k: 'turns'; turns: Turn[] }
  | { k: 'snapshot'; reqId: number }
  | { k: 'hash'; reqId?: number };                                   // C1 addition: reqId
type FromWorker =
  | { k: 'ready'; view: ViewSnapshot }
  | { k: 'update'; t: number; tick?: number; events: SimEvent[]; patches: LayerPatch[] }  // C1 addition: tick
  | { k: 'agents'; t: number; data: Float32Array }                     // I1
  | { k: 'hash'; t: number; h: string; reqId?: number }               // every 50 turns, or a reply
  | { k: 'snapshot'; reqId: number; t: number; data: Uint8Array }
  | { k: 'error'; message: string };

// apps/client/src/net/connection.ts
interface RoomConnection {
  readonly seat: SeatId;
  submit(cmd: Command): number;                                       // returns seq
  onTurn(cb: (turn: Turn) => void): void;
  onPresence(cb: (p: PresenceMsg) => void): void;                      // see 21
  sendPresence(p: PresenceUpdate): void;
  close(): void;
  status: Signal<'connecting' | 'catching-up' | 'live' | 'offline'>;
  // C1 additions
  onWelcome(cb: (w: Welcome) => void): void;                          // snapshot, log, nextTurn, valley
  onNeedSnapshot(cb: (reason: 'periodic' | 'desync' | 'version') => void): void;
  onError(cb: (code: ErrorCode, message: string) => void): void;
  sendSnapshot(s: { t: number; simVersion: string; data: Uint8Array }): void;
  sendHash(t: number, h: string): void;
}

// apps/client/src/render/api.ts
interface RenderApi {
  pickTile(clientX: number, clientY: number): { x: number; z: number; fx: number; fz: number; h: number } | null;
  pickEntity(clientX: number, clientY: number): { kind: 'building' | 'decor' | 'note' | 'tree'; id: number } | null;
  setGhost(g: Ghost | null): void;      // building, decor, decor run, road run, tree, tiles; valid or invalid
  setOverlay(kind: string | null): void;
  setPresence(seat: SeatId, p: { x: number; z: number; tool?: string } | null): void;
  ping(seat: SeatId, x: number, z: number, kind: 'look' | 'help' | 'build'): void;
  focus(x: number, z: number, distance?: number): void;
  setQuality(q: 'low' | 'medium' | 'high'): void;
}

// apps/client/src/input/tool.ts
interface Tool {
  id: string; lane: 'hearth' | 'ledger' | 'shared'; icon: string; label: string;
  enter?(): void; exit?(): void;
  pointerMove?(p: PointerInfo): void; pointerDown?(p: PointerInfo): void; pointerUp?(p: PointerInfo): void;
  key?(e: KeyboardEvent): boolean;
  variants?: { id: string; label: string }[]; variant?: Signal<string>;  // C1 additions
  hint?: string; order?: number;
}
```

## I1 contracts

Defined in cycle C3.0, then changed only additively during the I1 wave. Everything below is exported from `@qoti/sim` (types from `contracts/`, values from `constants.ts`) or `@qoti/content`.

**State** (`contracts/hamlet.ts`, `contracts/state.ts`; `SAVE_VERSION = 2`, migration from 1 adds empty slices and zeroed layers, I0 valleys stay sandbox):

- `WorldState` gains `residents`, `households` (sorted by id), `economy` (treasury in pennies, `forSale`, ledger periods today, yesterday, season and last season, 14 days of stock history, lean times, seasons in surplus, everything ever produced), `logistics` (porter jobs with reservations, delivery flows), `hearth` (pattern sites keyed by pattern and anchor tile, discoveries, 3 hints, unlocked ids, dirty charm chunks), `wishes`, `chronicle`, `achievements`, `stats` and `networkVersion` (bumped whenever roads, buildings, fields or blocking decor change; the path cache key).
- `Building.rt?: BuildingRuntime` in standard valleys only: workers, present, `input`, `output` and `store` buffers, reservations in and out, method, progress, `construction { needs, delivered, work, workDone, priority, paid }`, condition, paused, `status` bits (`BuildingStatus`), produced today.
- `SeatState.seen?`: stats when the seat last left, for the while-you-were-away letter.
- Map layers gain `charm`, `charmNature`, `charmComfort`, `charmLight`, `charmView`, `charmNoise` (noise as a magnitude, 0 quiet), `fieldOwner` (Int32, the farmhouse tending a field tile) and `crop` (growth 0 to 255). Charm is stored because it is recomputed hourly per dirty chunk, so it depends on history.
- **Per-good quantities are arrays indexed by good index** (`content.goods`, whose order is append-only); per-need values follow `NEED_IDS`; money follows `LEDGER_CATEGORIES`.

**Content** (`packages/content/src/types.ts`): `GoodDef`, `ProductionMethod { kind: craft | gather | fell | plant | farm, inputs, outputs, hours, workers, perWorker?, range?, heightBonus? }`, `BuildingDef` additions (`jobs { count, role }`, `housing`, `storage`, `coverage`, `methods`, `work`, `outputBuffer`, `charm`, `tags`, `modes`), `DecorDef` additions (`charm`, `cost`, `locked`), `CharmSource`, `SpeciesDef` and `Taste`, `TraitDef`, `familyNames`, `WishTemplate`, `PatternDef`, `AchievementDef`, `ChronicleTemplate`. Lookups on `Content`: `goodIndex`, `speciesById`, `traitById`, `wishById`, `patternById`, `achievementById`, `chronicleByKind`.

**Condition DSL** (types in content, evaluator in `packages/sim/src/conditions`): `all`, `any`, `not`; `near` (a target such as `{ tag: 'bench' }`, `{ building: 'well' }`, `{ tree: 'any' }`, `{ water: true }` or `{ home: 'occupied' }` within N tiles of a place, `atLeast`, and `also` for "a bench that is itself near water"); `count` (residents, households, patterns, wishes granted, goods produced, seasons in surplus, built together); `charm` at a place; `stock` of a good at a place; `resident` facts for offering wishes; `code` with params for named predicates (`lanternRoute`, `pathRoute`). Places: `home`, `work`, `nearestMarket`, a tile or a building, bound when a wish is made.

**Commands**: `build.customize { id, custom: BuildingCustom }`, `build.setPriority`, `build.setPaused`, `field.paint { farm, tiles }`, `field.remove`, `ledger.setForSale { good, forSale }`. New reject reasons: `LEAN_TIMES`, `LOCKED`, `OUT_OF_RANGE`, `CHANGED`. A valley keeps its mode (`valley.setSettings` refuses a mode change). Pattern Book decor is `LOCKED` in standard valleys until unlocked.

**Events and views**: `resident.added|updated|removed` (coarse `ResidentView`: home, job, tier, wish, mood band, bond, look seed), `household.*`, `stocks.updated` (`StocksView`), `budget.updated` (`BudgetView`), `town.updated` (`TownView`), `wish.added|granted|expired` (`WishView` with rendered text and a highlight area), `pattern.discovered|siteAdded|siteRemoved|updated` (`PatternView`), `chronicle.added`, `achievement.unlocked`; `building.updated` carries `rt` (`BuildingRuntimeView`, goods as `[id, qty]` pairs, construction stage 0 to 3). `ViewSnapshot` carries all of them. Full detail comes from the worker: `ToWorker { k: 'inspect', reqId, kind: 'resident' | 'building' | 'away', id }` answered by `FromWorker { k: 'inspected', reqId, data }` (`ResidentDetail`, `BuildingDetail`, `AwayLetter`).

**Agent frames**: after each batch of turns the worker posts `{ k: 'agents', t, data }`, a `Float32Array` with `AGENT_STRIDE = 8` floats per resident outdoors: `[id, x, z, y, heading, anim, carryGood + 1, flags]`. x and z in tile units (tile centers at +0.5), y in height levels, heading in radians, `anim` 0 idle, 1 walk, 2 carry, 3 hop, 4 work; `flags` are `AgentFlags` (wish, happy, unhappy, sleepy, child, slow). The Mirror keeps the previous and latest frame with arrival times for interpolation.

**Cross-track APIs** (signatures fixed by C3.0, stub or baseline implementations, owners in the file headers):

| API | File | Owner |
|---|---|---|
| `requestMove(state, residentId, targetTile, reason)`, `isAt`, `isWalking`, `stopMove`, `doorTile`, `doorTileOf`, `enterBuilding` | `systems/movement/api.ts` | C3A (stub teleports) |
| `addMoodModifier`, `removeMoodModifier`, `modifierValue`, `addBond`, `moodTaxPercent` | `systems/residents/api.ts` | C3A |
| `takeFromOutlet`, `outletFood`, `nearestOutletWithFood` | `systems/economy/outlets.ts` | C3C |
| `placementBlocked`, `chargePlacement`, `refundRemoval`, `roadBlocked`, `chargeRoad`, `book` | `systems/economy/api.ts` | C3C |
| `setupStandardStart` | `systems/economy/start.ts` | C3C |
| `chronicle(state, ctx, kind, params)` | `systems/chronicle/api.ts` | C3B |
| `markCharmDirty(state, rect)` | `systems/hearth/charm/dirty.ts` | C3B |
| `evaluate(state, condition, binding)`, `codePredicates` | `conditions/` | C3B |

**C3B additions** (additive): `HearthState.charmSoon?: true` (set by Hearth commands so charm recomputes on the next tick; absent, never false); `AwayLetter.opening?` and `.more?`; in content, `Content.swatches` (`SwatchDef`, `SwatchGroup`), `WishTemplate.digest?`, `PatternDef.hintOrder?`, `CountWhat` `'togetherSites'`, and the `chroniclePhrases` tables. Conditions measure distance in steps between tile rectangles within a rounded disk (`conditions/geo.ts`).

`createValley(seed, settings)` (an alias of `createWorld`) builds the standard starting town for `mode: 'standard'`: the Town Hall at the end of the valley lane, a Storehouse with the starting goods, two Cottages and a Well along a new path, and 500 coins. `insertBuilding` puts a building into state (occupancy, trees, runtime, charm dirt) for commands, the start and fixtures.

**System slots**: 20 construction, 30 production, 40 logistics, 50 residents, 52 movement, 60 economy, 70 charm, 72 patterns, 74 wishes, 90 achievements, 100 chronicle (plus I0's 10 clock and 30 trees). Every I1 system returns at once in sandbox valleys.

**Client**: `RenderApi` gains optional `follow(residentId | null)`, `setBubbles(on)` and `highlight(area | tiles | null)`; `EntityPick.kind` gains `'resident'`; `OverlayKind` names `'charm'` (and `'charm:<category>'`), `'coverage'`, `'flows'`, `'status'` and `'fields'`. The Mirror keeps residents, households, wishes, patterns, achievements, the Chronicle, stocks, budget and town, applies every I1 event, keeps agent frames, and exposes `charm(x, z, layer?)`. `SimHost.inspect(kind, id)` and `onAgents`.

**Fixtures**: `packages/sim/test/fixtures/hamlet.ts` (a standard hamlet on the flat test world: 10 buildings with runtime, 3 households, 9 residents, stocks, decor) and `apps/client/src/ui/mocks/hamlet.ts` (matching mock views with a little history).

## I2 contracts

Defined in cycle C4.0, then changed only additively during the I2 wave. Runtime handshakes (who sets prices, who pays wages, who grows lots, how carts move) are in `docs/build/i2-wave-notes.md`.

**State** (`contracts/village.ts`, `contracts/state.ts`; `SAVE_VERSION = 3`, migration from 2 grows every per-good array to the I2 goods, ledger periods to the I2 categories and residents' needs to the tier needs at 100, starts `economy.external` at 0, adds empty layers and neutral slices; I1 valleys play on as Settlers at Hamlet rank):

- `WorldState` gains `market` (price per good in pennies, yesterday's demand, today's demand so far, cover in hundredths of a day, 24 days of prices), `levers` (wage level 80 to 120, income tax 0 to 20, price caps and subsidies per good, export bans), `loans`, `lots` (zone, a world-axis footprint, facing rotation, frontage road tile, desirability, district style, the grown building), `trade` (per neighbor drift and impact in permille, standing orders, caravans, a 60-entry log), `carts` (entity ids from `nextId`, a `MoveState`, load, job, heading, parked), `charter` (rank, the Charter on the board, progress per goal, ready, rank history), `innovations` (progress 0 to 100, a counter, unlock tick or -1), `plans`, `requests`, `stories` (arc step: -1 before arrival, then steps, then the finale) and `village` counters (requests fulfilled, plans approved, couples, weddings, births, seaside).
- `Resident` gains optional `partner`, `marriedDay`, `parents`, `apprentice`, `retired`, `story`; `Household` optional `tierDays`, `basket`, `owed`; `BuildingRuntime` optional `tier`, `pinned`, `upgrade`; `Building` optional `lot` and `style`; `EconomyState.external` (see Money).
- Map layers gain `lot` (Int32, lot id), `traffic` (cart passes this hour) and `wear` (desire paths); `zone` holds zone layer values 1 to 5; `Flags.stairs`.
- Goods 8 to 19 are the I2 goods, appended in this order: clay, bricks, wool, yarn, cloth, milk, cheese, apples, cider, firewood, herbs, tools. `NEED_IDS` appends `goods`, `social`, `health`, `education` (weight 0 until C4A and C4C weigh them; the inspector shows only needs that weigh something). `LEDGER_CATEGORIES` appends wages, sales, exports, imports, loans, interest, repayments, subsidies, terraforming, grants. `TIERS`, `RANKS`, `Zone`, `WAGES`, the market, trade, loan, lot, traffic, terraforming, tier, plan and life constants live in `constants.ts`.

**Money**: `book(state, category, pennies)` moves money between the treasury and the world outside and counts it in `economy.external`; `pay(state, from, to, pennies, category | null)` moves it between purses (`'treasury'`, `'outside'`, `{ household }`), never below zero for households, booking the category when the treasury is a side. The invariant `treasury + sum(savings) - external` never changes; `moneyBalance(state)` returns it and `packages/sim/test/money.ts` has `moneySnapshot` and `expectMoneyInvariant` for every economy test.

**Content**: `NeedsBasket` and `NeedGroup` (perDay may be fractional, perHousehold, season, substitutable goods with preference weights; services, charm and savings per tier), `ZoneDef` and `LotDef`, `NeighborDef` (sells and buys with percent factors, seasonal factors, caravan days, rank), `InnovationDef` (condition, measure, unlocks, rank), `CharterDef` and `CharterGoal` (lane, a `CountWhat` measure and a target), `StoryArc`, `StoryStep`, `ResidentTemplate`, `Reward`, `CartDef`; `BuildingDef` gains `jobs.tier`, `tier`, `grows`, `upgradesTo`, `requires`; `RoadDef` gains `carts`, `capacity`, `requires`; the `street` road (layer 3, needs Cobbles); `CountWhat` gains `foodDays`, `tierResidents`, `requestsFulfilled`, `goodsAtMarket`, `innovations`. Seed content: the Settler and Craftsfolk baskets, five zones, Millhaven and Stonecross, the five I2 innovations, the Village Charter, the cart. `PlanItem` (a proposed `Command`) lives in the sim contracts, since content never imports the sim.

**Commands** (validated baselines, owners in the file headers): `zone.paint { zone, tiles }`, `zone.clear`, `ledger.setWageLevel { percent }`, `ledger.setTaxRate`, `ledger.setPriceCap { good, cap, subsidy }`, `trade.setStandingOrder { good, order | null }`, `loan.take { coins }`, `loan.repay { id, coins }`, `plan.add { name, items }`, `plan.remove`, `plan.approve` (runs the items in order where still valid; plans hold only building commands), `plan.comment`, `plan.seen`, `request.add { ask }`, `request.resolve { id, status }`, `charter.claim`, `terrain.raise { tiles }`, `terrain.lower`, `build.pinRecipe { id, method | null }`. New reject reasons `CREDIT_LIMIT` and `NOT_READY`. Zoning and loans are `LOCKED` before the Village rank. `plan.comment`, `plan.seen` and `request.add` work while a together-only seat is alone.

**Events and views**: `market.updated` (`MarketView`), `levers.updated`, `loans.updated`, `trade.updated` (`TradeView` with post prices at 1.2x and 0.85x), `lot.added|updated|removed` (`LotView`), `charter.updated` (`CharterView`), `rank.up { rank, text }`, `innovation.updated|unlocked`, `plan.added|updated|removed` (`PlanView`), `request.added|updated` (`RequestView` with readable text), `story.step { s: StoryView, letter: LetterView }`, `life.event { kind, residents, text }`. Traffic, wear, lot and zone tiles travel as layer patches. `ViewSnapshot` carries all I2 views; `TownView` gains `rank`, `charter` (done, total, ready) and `tiers`; `ResidentView.partner`, `HouseholdView.savings`, `BuildingView.lot` and `.style`; `ResidentDetail` gains partner, parents, children, apprenticeship, retired, story, savings, tier progress; `BuildingDetail` gains profit per work day, methods to pin, the pinned one, its lot, tier and upgrade.

**Agent frames**: carts that are out ride in the same frame as rows with `anim` 5 (`AgentAnim.cart`) and their first load good; ids never collide with residents (both come from `nextId`).

**Cross-track APIs**:

| API | File | Owner |
|---|---|---|
| `pay`, `moneyInside`, `moneyBalance`, `Purse` | `systems/economy/money.ts` | C4A |
| `priceOf`, `tillPrice`, `buy`, `sell`, `outletsWith` | `systems/market/api.ts` | C4A |
| `regionalPrice`, `wagesAt`, `creditLimit` | `view/village.ts` | C4A |
| `growLot(state, ctx, lotId, defId, style?)` | `systems/growth/api.ts` | C4B |
| `cartRoute(state, from, to)`, `requestCartMove`, `cartAt`, `cartTile`, `cartTicks` | `systems/traffic/api.ts` | C4B (baseline breadth-first route) |
| `unlockInnovation(state, ctx, id)` | `systems/innovations/api.ts` | C4C |
| `storyStep(state, ctx, arcId)`, `grantReward` | `systems/stories/api.ts` | C4D |
| `refreshCharter(state, ctx)` | `systems/charter/index.ts` | C4D |
| `rankAtLeast`, `hasInnovation`, `emptyVillageSlices`, `charterFrom` | `state/village.ts` | C4.0 |

**C4D additions** (additive): `CountWhat` gains `buildings` and `byWater` (built buildings by def id or tag; `byWater` within 3 tiles of water), `innovation` (ref id), `rank` (index), `plansApproved`, `weddings`, `standingOrders`; the `plan.edit` command; `ChronicleParams.variant` (a chosen variant instead of a random pick); in content, the three story arcs, Chronicle kinds `wedding`, `birth`, `seaside`, `rank-up`, `story-arrived`, `story-finale`, and `lifePhrases`. Exported for other tracks: `isTrained`, `isApprentice` (`systems/residents/life.ts`), `advanceStories` (`systems/stories`), `checkRequests`, `tidyPlans`, `celebrateRank`, `requestProgress` (`view/village.ts`).

**System slots**: 24 zoning, 26 growth, 54 traffic, 56 services, 58 tiers, 62 market, 64 trade, 66 loans, 92 innovations, 94 charter, 96 stories, 97 plans, 98 requests. Baselines run in market (daily roll of demand and price history), traffic (carts drive, passes counted, cleared hourly), innovations (conditions checked hourly) and charter (goals counted hourly); the rest are registered stubs. `dailyOffset(hour, extra)` in `systems/economy/time.ts` gives a daily system's offset.

**C4B additions** (additive): in content, `DistrictStyleDef`, `Content.styles` and `styleById` (the four starter styles) and `RoadDef.noise` (streets 2); in the sim, `lotPlacement`, `growthDemand`, `roadCapacity`, `roadNoise`, `slowdownPercent`, `trafficFlow`, `roadKindLocked`, `wantsStairs`, `desirePathTiles`, `DESIRE_PATH_WEAR` and `WEAR_VISIBLE` exported for the client, and the `desireLines` code predicate. `canPaintRoad` accepts `street`. `cartRoute` is cached (same signature). Saved state is unchanged (save version 3).
**C4A additions** (additive): `MarketLine.stock`, `.target` and `.why` (a line on why the price sits there), `MarketView.firstDay`, `.profits` (`ProfitLine`) and `.tiers` (`TierBasketView`); `LOAN_LIMITS` in constants; systems `wages` (63, 17:00), `caravans` (65, 08:00) and `baskets` (67, 18:00); exports `marketOpen`, `basketScore`, `likeHalves`, `coverOf`, `multiplierFor`, `stepPrice`, `targetPrice`, `incomeTax`, `wageBill`, `caravanCapacity`, `postBuyPrice`, `postSellPrice`, `tradingPost`, `isLean`, `overdraftLimit`, `income`, `expenses`. `needWeights(state)` (systems/residents/needs.ts) gives the mood weights in force: `goods` weighs only once the market opens.

**Client**: the Mirror keeps `market`, `levers`, `loans`, `trade`, `charter` (signals), `lots`, `innovations`, `plans`, `requests`, `stories` (maps), `letters` (received this session) and `villageRevision`; `MirrorChange` gains `village`, `letters`, `life` and `rankUp`.

**C4E additions** (additive): `ResidentView.bornDay` (children only), `BuildingRuntimeView.method` (for defs with a choice of methods) and `.upgrading`; `OverlayKind` gains `'zones'`, `'traffic'`, `'land'` and `'needs'`. In `packages/art`: `Kit.kind` gains `'vehicle'` and `'animal'`, `Kit.footprint` (the footprint a kit is drawn for when no def names it; the renderer draws such kits through stand-in defs, `render/defs.ts`), and `KitAnchors.animals` (pens). Village kits are named after their building ids (`clay-pit`, `brick-kiln`, `sheep-pasture`, `spinner`, `weaver`, `dairy`, `cheesemaker`, `orchard`, `cider-press`, `chopping-shed`, `herb-garden`, `smithy`, `school`, `tavern`, `herbalist`, `trading-post`, `cart-shed`), grown ones `cottage` (district aware), `townhouse`, `shop`, `workshop`, `farmstead`; the cart is `cart`. `?debug` adds `__qoti.villageShowcase(dense)`, which dresses the village fixture in this client's Mirror only.

**Fixtures**: `packages/sim/test/fixtures/village.ts` (60 residents in 15 households, 16 of them Craftsfolk, at Village rank: two storehouses, two market stalls, a cobbled street, eleven lots on zoned frontage with one grown cottage, five days of prices, a standing order, a loan, an open plan and request) and `apps/client/src/ui/mocks/village.ts` (views built from it with the sim's own builders, plus a story under way, letters, a couple and a trade log). `?debug&fixture=village` opens it live.

## I3 contracts

Defined in cycle C5.0, then changed only additively during the I3 wave. Runtime handshakes (who sets the season and freezes the river, every new money flow, Watch morale, renown sources, the Chronicle snapshot) are in `docs/build/i3-wave-notes.md`.

**State** (`contracts/seasons.ts`, `contracts/state.ts`; `SAVE_VERSION = 4`, migration from 3 grows every per-good array to the I3 goods, ledger periods to the I3 categories, seeds the new RNG streams from the valley seed, marks the floodplain, adds the two new story arcs and innovations unstarted, and starts the I3 slices neutral; P53, a gentle update: the river is frozen if the date says so, a valley migrated in autumn or winter gets six firewood per household from the County, a Village keeps its rank and its trial is the next winter, and the first days guide is over):

- `WorldState` gains `weather` (today, a forecast of up to 2 days, scheduled and running events, `river.frozen` and the tick it froze), `warmth` (the winter counted, cold household-days, households cold a whole day), `festival` (this season's plan: site as a rect or a pattern site, menu and reserved as `[goodIndex, qty]`, twist, music, who planned it; the temporary pieces; live; the last outcome with attendance, five joy parts and stars; an 8-festival history), `renown` (points, level 0 to 5, a 20-entry log), `commissions`, `dock` (boats from `nextId`, a log), `nature` (habitat scores as a plain `number[]` of 6 x 144, habitat h of chunk c at `h * 144 + c`; Field Guide entries; three hints; summer pests per farm), `threats` (pressure in permille of the threshold, deterrence parts, the scheduled raid with its telegraph tick and signs, wolves' nights, a 12-raid history, captives waiting for a decision), `watch` (members, target, training 100 to 160, morale, up to 3 guard tiles, today's duty, budget in pennies), `raid` (the live raid: raiders with tile, `MoveState`, morale, load, state and target; the Watch in it; bell; lanterns; null outside one), `trial` (kind, Charter, season, year, status, what it measured), `guide` (step, done ticks, hidden per seat, over) and `seasons` counters (raids held, warm winters, best stars, together moments).
- `Household.warmth?`, `Resident.reformed?` and `Resident.watch?`, `BuildingRuntime.hp?`, `.open?`, `.modules?` (`[slot, module]` pairs), `.moduleWork?`, `.flooded?` (a tick), `Decor.festival?` (`kept`), `ChronicleEntry.snapshot?` (focus tile and radius), `LeversState.marketDay?` and `.quietHours?`, `ValleySettings.guide?`. All optional and absent until used, so I2 shapes hash as before.
- Map: `water` value 3 (pond) in use; `Flags.floodplain` (land at height 1 or below within 6 tiles of the river) set for every valley at creation and by the migration (`markFloodplain`).
- Goods 20 to 24 are the I3 goods, appended: coats, furniture, pies, honey, candles. `LEDGER_CATEGORIES` appends festival, dock, commissions, watch, visitors, fees. RNG streams append `nature` and `festival`. `SEASON_IDS`, `HABITAT_IDS`, the forecast, freeze, warmth, festival, renown, raid, Watch and guide constants live in `constants.ts`.

**Content**: `SeasonDef` (sowing and harvest days, river, warmth, events, festival), `WeatherDef` (odds per season and named effects, permille), `EventDef`, `FestivalDef`, `FestivalTwistDef`, `WildlifeDef` and `HabitatName`, `ThreatDef`, `DefenseDef` (`BuildingDef.defense`), `ModuleSlot`, `ModuleDef` and `BuildingDef.moduleSlots`, `CommissionDef`, `RenownDef`, `TrialDef` (`CharterDef.trial`), `GuideDef`, `GuideStep`, `GuidePoint`; `DecorDef.festival` and `.slows`; `Reward.renown`; `TraitDef.special` (never rolled for newcomers); the `code` condition's `ref` (a content id; `storyStep` names its arc by id); `CountWhat` gains `renown`, `festivalStars`, `fieldGuide`, `sighted`, `raidsHeld`, `warmWinters`. Seed content with ids and names: four seasons, seven weather kinds, five events, four festivals, five twists, six renown levels, two threats, the I3 goods, fifteen building stubs (hidden from the picker with `modes: []` until their owners write them), six festival pieces, two innovations (Barometer, Seed Drill; `rank: 'town'` until written), five achievements, six pattern stubs (`rank: 'town'` until their detectors land), the Village trial (The First Winter), the Reformed trait, two story arc stubs (herbalist, stonemason) and the first days guide stub. The story list is append-only now, like goods.

**Commands** (validated baselines, owners in the file headers): `festival.plan { site, menu, twist?, music? }`, `festival.keepPiece { decor }`, `commission.accept|decline { id }`, `ledger.setMarketDay { day | null }`, `ledger.setQuietHours { on }` (C5B); `terrain.pond { tiles }`, `build.setModule { id, slot, module | null }` (C5C); `wall.paint { def, tiles }` (`LOCKED` until C5D unhides the defense defs), `wall.remove { tiles }`, `gate.set { id, open }`, `watch.setTarget`, `watch.setBudget`, `watch.setPosture { guards }`, `watch.ringBell`, `watch.lightLanterns` (raid only), `bandit.decide { id, choice }` (C5D); `guide.setHidden { on }` (C5H; per seat, works while a together-only seat is alone). `valley.setSettings` takes `guide`, and a threat dial change tells the partner and writes a Chronicle line. New reject reasons `WOULD_ENCLOSE`, `FROZEN`, `NO_RAID`.

**Events and views** (`contracts/seasonViews.ts`): `season.started` (`SeasonCardView`), `season.report` (`SeasonReportView`, built in `view/season/` from one file per track), `weather.updated`, `event.forecast|started|ended`, `festival.updated|started|ended`, `together.moment`, `renown.updated`, `commission.added|updated|removed`, `dock.updated`, `species.sighted`, `habitats.updated` (chunk scores), `threat.updated` (`ThreatView`: band, side, days left, signs; `pressure` for the Ledger lens only), `watch.updated`, `raid.started|updated|ended`, `bandit.captured`, `trial.updated`, `guide.step`; `chronicle.added` may carry a `snapshot`. `ViewSnapshot` carries all I3 views; `TownView` gains season, weather, renown level, cold households, threat band and the guide; `ResidentDetail` gains warmth, Watch and reformed; `BuildingDetail` gains modules, hp, gate and flooded.

**Agent frames**: `AgentAnim` gains `run` (6) and `dance` (7); `AgentFlags` gains `cold`, `watch`, `raider`, `wolf`, `festival`, `skating`, `visitor`. Raiders, wolves, circus visitors and boats ride in the same frame with ids from `nextId`. Values from 16 are the client's own motions (`MOTION` in `@qoti/art`), never the sim's.

**Shared hooks** (written once in C5.0, one registration line per source; each has a `with...` helper for tests):

| Hook | File | Returns | Registered by |
|---|---|---|---|
| `yieldModifiers` | `systems/production/modifiers.ts` | permille on farm, gather and craft output | C5A weather, drought, early frost, frozen river, Seed Drill; C5C pollinators, pests |
| `walkFactors` | `systems/movement/factors.ts` | permille of tile ticks, for residents, carts and raiders | C5A snow; C5D fences and hedges (raiders) |
| `scheduleOverrides` | `systems/residents/overrides.ts` | an `Activity` or null, by priority, before the day table | C5B festival evening; C5D bell, duty, turn-out; C5A storms, skating |

**Cross-track APIs**:

| API | File | Owner |
|---|---|---|
| `seasonNow`, `weatherToday`, `forecast`, `isFrozen`, `isFlooded`, `isCold`, `warmthReport`, `startTrial`, `trialOutcome` | `systems/seasons/api.ts` | C5A |
| `addRenown`, `renownLevel`, `levelFor` | `systems/renown/api.ts` | C5B |
| `festivalMorale`, `reserveMenu` | `systems/festivals/api.ts` | C5B |
| `habitatAt`, `pollinatorFactor`, `pestLoss`, `hasSpecies` | `systems/habitats/api.ts` | C5C |
| `wealth`, `deterrenceAt`, `isRaidActive`, `watchStrength`, `lanternLit` | `systems/threats/api.ts` | C5D |
| `emptySeasonsSlices`, `markFloodplain`, `seasonAt`, `startGuide` | `state/seasons.ts` | C5.0 |
| `AudioApi`, `audio()`, `setAudio`, `SoundCueId` | `apps/client/src/audio/api.ts` | C5G |

**System slots**: 12 seasons (00:02), 14 weather (00:04), 59 warmth (07:30), 68 dock (08:00), 75 festivals (04:00), 76 habitats (02:00), 78 wildlife (hourly at 140), 80 threats (00:40), 82 watch (05:30), 84 raids and 86 defenses (every tick, returning at once outside a raid), 91 renown (00:06), 93 commissions (hourly at 180), 95 trials (00:08), 99 guide (hourly at 190). All are registered no-ops that return at once in sandbox valleys.

**Additive changes in the wave (C5B)**: `FestivalState.guests?` (tonight's guests, absent outside a festival), `FestivalOutcome.invited?`, `.score?` and `.eaten?`, `DockState.orders?` (the River Dock's standing orders), `trade.setStandingOrder { via?: 'post' | 'dock' }`; `FestivalResultView.invited?` and `.score?`, `DockView.orders?` and `.built?`; content `FestivalTuning` (`festivalTuning`), `CommissionDef.visitor?`, `.builds?` and `.blurb?`, `BuildingDef.requires.renown?`; the API `renownEffect`; system 77 `festivalEvening` (hourly on the hour: the festival day, market day's fees, opening a shop and the together moments); code predicates `festivalMenu`, `festivalPieces`, `festivalByWater`, `riverFrozen`; yield modifier `quiet-hours`; schedule override `festival` (50); the charm source `MARKET_DAY`. All optional and absent until used, so saved I3 shapes hash as before and `SAVE_VERSION` stays 4.

**Additive changes (C5E part 2)**: `BuildingRuntimeView.hp?` (wall pieces and traps, hit points left in percent of the most, absent when whole), `.open?` (`false` while a gate is shut) and `.flooded?` (the tick the flood water leaves), so the art can show damage, mending, shut gates and sprung traps. In `packages/art`: `artKitId(def.art)` (a def draws the kit in `art.params.kit` once it exists, else `art.kit`), `WALL_KITS`, `fitModules` and `moduleAnchors` (modules fitted to a built kit), and kits `apiary`, `arbor-seat`, `bath-house`, `bell-tower`, `bonfire`, `bunting`, `carpenter`, `chandler`, `festival-stage`, `festival-stall`, `festival-table`, `flower-arch`, `gate`, `gate-banner`, `herbalists-cottage`, `lookout-bench`, `net-trap`, `palisade`, `pear-tree`, `pie-shop`, `pit-trap`, `reed-bed`, `river-dock`, `see-saw`, `stone-bridge`, `stone-wall`, `swing`, `tailor`, `watch-house`, `watchtower`. Building params the renderer adds: `wx-`, `wx+`, `wz-`, `wz+` (wall neighbors, kit-local), `dmg` (1 to 3), `open`, `sprung`, `mod:<slot>` and `span` (tiles of water behind a waterside building). Render layers `festival` (static), `festival-fx`, `flood` and `telegraph` (moving). `?debug` adds `__qoti.seasonsShowcase()` and `__qoti.fireworks(x, z)`; `&flood=0.6` pins the flood's level and `&omens` shows a raid's signs.

**Fixtures**: `packages/sim/test/fixtures/winter.ts` (the village on Winter day 2 of year 2: frozen river, snow, two cold households, a Bath House, the Winter Hearth Feast planned at the well, the trial running, a Watch House with four members, two Field Guide entries) and `threat.ts` (`threatFixture`: storehouse A behind a palisade with a gate, a watchtower, lanterns on lane A, a Medium raid telegraphed from the north for day 4; `raidAtDusk`: the same valley at 18:30 on day 4 with six raiders and the bell rung). Client mocks in `apps/client/src/ui/mocks/seasons.ts`; `?debug&fixture=winter` and `?debug&fixture=raid` open them live.

## V1 contracts

Defined in cycle V1.0, then changed only additively during the V1 wave (V1A to V1D, merged in V1X). Render and art only: no sim state, command or hash changes. Handshakes between the four tracks, stand-ins and the before numbers are in `docs/build/v1-wave-notes.md`.

**Art** (`packages/art`):

- **Surface ids** (`surface.ts`): `SURFACE` names what a face is made of, append-only, as in the V0 concept: plain 0, plaster 1, brick 2, stone 3, timber 4, tile 5, slate 6, thatch 7, cobble 8, glass 9, grass 10, dirt 11, water 12, leaf 13, zinc 14, awning 15, field 16, flags 17, flowers 18; the pattern array's noise layer is 19 (`NOISE_LAYER`, not a surface). `SURFACES[id]` is a row: `mapping` (`facade`: u along the face's horizontal tangent and v up, upward faces use `top`; `top`: world x and z; `roof`: the facade mapping always, so courses run level), `scale` (world size of one pattern tile), `strength` (0 flat to 1) and an optional `accent` (a `palette2` token and how far the accent mask mixes toward it: mortar for brick, the cream stripe for awnings).
- **`ShapeBuilder.surface(id)`** sets the id written with the following faces, like `glow(value)`, into a `surface` attribute (`Uint8Array`, one per vertex). Every `ShapeBuilder` geometry carries it (0 unless set), `RigBuilder` writes zeros and `mergeFlat` carries it, so merged and batched geometries keep one attribute set; a geometry without it reads as 0 in a shader.
- **`palette2`** (`palette.ts`): the Painted Miniature tokens from the concept's `PALHEX.b` beside `palette`: ground, plasters, stuccos, the Bright Age's `deco` and `pastels`, bricks with `mortar`, stones, timber, roofs (tiles, slates, thatch, zinc, flat, copper, chimney), accents (frames, doors, shutters, shopfronts, awnings with their `stripe`, glass, metal, wood), foliage and water. Lists are swatches picked by seed. V1A tunes the values; V1X retires the old tokens.
- **Pattern array** (`patterns.ts`): `createPatternArray(size = 256)` returns a `DataArrayTexture` with `PATTERN_LAYERS` (20) RGBA8 layers, mipmapped and repeating: R a luminance multiplier (128 is 1), G the accent mask, B a secondary value (a flower's hue), A the color mask (flowers only). A flat stub until V1A writes the generators.

**Content**: `Era = 'old' | 'steam' | 'bright'` and `eras?: Era[]` on `BuildingDef`, `DecorDef` and `RoadDef` (absent means every era), reserved for I4 (`18-eras.md`, Data).

**Client** (`apps/client/src/render`):

- **Static and moving layers**: `RenderLayer.motion?: 'static' | 'moving'` (absent is static). Moving: agents, animals, carts, effects, ghosts, notes, overlays, presence, water; the rest are static. Each layer gets its own root (`layerTags.ts`, `layerRoot`) as its `LayerContext.scene`, and everything added under it, at any depth and at any time, goes on Three.js layer 1 (`STATIC_LAYER`) or 2 (`MOVING_LAYER`); the camera and lights see both. A static layer's `ctx.invalidate()`, or its `frame()` returning true, bumps `Renderer.staticRevision`, which V1D's still-frame cache compares.
- **`WorldEnv`** gains `buildingDetail` (full building detail distance in tiles), `staticTime` (the clock animation inside static layers runs on; the same object as `time` until V1D stops it while the camera rests) and `patterns` (the one pattern array, `{ value }`, shared by the kit material and the ground shader).
- **Presets** (`quality.ts`): `Quality` gains `ultra`; `QualityPreset` gains `renderScale`, `msaa` (0 or 4, was a boolean), `stillCache`, `stillAo`, `buildingDetail`, `bloom` and `critters` (`none`, `some`, `all`) with the values in `17-presentation.md`. Until V1D the renderer reads only the fields it read before plus Ultra's distances (`buildingDetailNow`), so Ultra is High with Ultra's distances. `?quality=ultra` and the settings menu offer it; `detectQuality` never does. `RenderApi.setQuality` takes `ultra`.
- **GPU timer** (`gpuTimer.ts`): `EXT_disjoint_timer_query_webgl2` around each drawn frame, a ring of three queries, results dropped on a disjoint. `RenderStats.gpuMs` (an average of 30, null without the extension) and `RenderStats.mode` (`moving`, `still` or `idle`; always `moving` until V1D) show in the `?debug` overlay with the preset; `Renderer.gpuTimer.history` holds raw results for the perf run.
- **The split**: `material.ts` holds the kit material (`createWorldMaterial(env)`, `addNightGlow`); `look.ts` holds the final image's color code as self-contained GLSL (`LOOK_GLSL`: `lookGrade`, `lookVignette`, `lookTiltMask`, `lookBloomMix`, `lookToneMap`, `lookSrgb`), its uniforms (`lookUniforms()`) and values (`applyGrade`, `bloomFor`, `tiltFor`, `LOOK_TONE_MAPPING`, `LOOK_BLOOM_RADIUS`). `PostChain` (`post.ts`) calls them from its passes; V1A owns `material.ts` and `look.ts`, V1D owns `renderer.ts` and the frame graph in `post.ts`.
- **V1D additions** (additive): `RenderStats.shadowRenders`, `stillRenders` and `engine` (`Engine`: `lean`; the `classic` chain behind `?engine=classic` was retired by V1X), shown in the `?debug` overlay; `Renderer.invalidateStatic()` is public (a change to the static picture from outside a layer); `QualityPreset.stillScale` (the pixel ratio cap at rest), `pixelRatios(preset, dpr, cap?)` and `BUILDING_DETAIL_FLOOR`; `decorGeometry(def, lod)` takes a level; `render/{cache,shadows,lod}.ts`; the classic chain moved to `render/postClassic.ts` (V1X deletes it).
- **Scenes and scripts**: `window.__qoti.townShowcase()` (about 1,000 of today's buildings in streets, 4,000 decor, 2,000 garden trees and 2,000 synthetic residents in this client's Mirror, never the sim) `window.__qoti.perf()` and `window.__qoti.layerTriangles()` (triangles per render layer from the current camera; `app/perf.ts`); `apps/client/e2e/v1-shots.mjs <stage>` (fixed cameras at 1440 x 900 on the hamlet, the village of 130, the town and the winter fixture) and `v1-perf.mjs` (per preset and scene, a scripted camera path and a rest, with average and 95th percentile frame and GPU ms).

## Redesign outline [R1 to R3, V2 to V4]

Written 2026-11-10 with the redesign's spec (`13-ledger.md`, `19-evenings.md`, `17-presentation.md`, `30-roadmap.md`). It names where the work lands so the contracts cycles (R1.0, R2.0, R3.0, V2.0, V3.0, V4.0) can write the exact types here, as C4.0, C5.0 and V1.0 did. Paths are as they stand on `main` today.

**R1 is a rebuild, so its contracts cycle may rename and remove.** The contracts policy (`31-parallel-development.md`) is additive-only during parallel waves; R1.0 alone is allowed to delete the chain economy's contracts, and from R1.0's merge the policy is additive again. Fresh valleys only (`21-networking-and-saves.md`, The fresh start), so nothing needs converting.

**R1, the zones-first Ledger** (`packages/sim`, `packages/content`, `tools/bench`, `apps/client/src/ui`)

- Content: `GoodDef.family` and `GoodDef.raw`; the 16 goods; `TradeDef` (zone, makes, from, wants, needs reach, crew by level, look) in a trades registry; `BuildingDef.reach`, `capacity`, `enables` and the site rules for specialized buildings; baskets by family with variety wants. The hand-placed production defs go; their art kit ids stay as trade looks.
- State: `Building.trade`, `keeperId`, `level` and custom counters for a business; `carrier` (a rule, a reserve and what it carried, by family; a budget); `seasonPlan`; `demand` (the four bars with their reasons, a view). Gone: standing orders, goods for sale, the calling.
- Systems: `growth` chooses trades (`chooseMethod` becomes the trade score); `production` runs trades and asks the carrier before a business rests; `market/baskets` buys by family and tracks variety; `trade`, `caravans` and the peddler in `economy` fold into a `carrier` system; `tiers` reads amount and variety; a `levels` system moves businesses up and down; `callings` leaves the pipeline until R3.
- Commands: `carrier.setRule`, `carrier.setReserve`, `carrier.setBudget`, `season.setPlan`, `decor.move`, `build.move`; `build.pinRecipe` pins a trade. Removed: `trade.setStandingOrder`, `ledger.setForSale` and `calling.choose` (callings come back earned in R3, with no command). Every command keeps a sender in the client (`test/every-command-has-a-sender.test.ts`).
- Views: `demand.updated`, `balances.updated` (five families: amount, variety, price, carried in and out), `business.updated`.
- Bench: new advisors (one that zones and sites, one that tends the season plan), the lanes test and the decisions count (`22-quality.md`).

**R2, the evening round** (`packages/sim/src/systems/residents`, `movement`, `market`, `growth`, `zoning`; new `systems/places`, `systems/gaps`)

- State: `map.footfallDay` and `map.footfallEve` (Uint16 layers), the `evening` road flag, street names, the `evenings` need (in place of `beauty` and `social`), each resident's last evening, open gaps, and for each place by its stable id a name and the counts rules read over time (`19-evenings.md`, Data and budgets). A place's seats, kinds, draw and what it serves are derived and rebuilt on load, like the decor index.
- Systems: `places` (hourly with patterns: sites, sitting spots and hosts into `Place` rows with seats, kinds, draw, serves); `residents/outings.ts` grows into the round's planner; `movement` gains the evening cost; `market/baskets` moves Treats to the stops; `growth/desirability.ts` reads footfall for Shops; `gaps` opens and closes gaps; `sim/turn.ts` runs dusk at half speed.
- A new RNG stream, `round`, so an evening's whims never move another system's dice.
- Lots (the old V2's sim half, for V3): `Lot.row`, a `garden` lot kind, `Lot.corner` with a second frontage, `params.storeys` chosen by the sim.
- Commands: `road.setEvening`, `road.rename`, `place.rename`. Views: `places.updated`, `evening.closed` (the edition's lines), `gaps.updated`.

**R3, masters and the Town Book** (new `systems/supplies`, `systems/masters`, `systems/townbook`)

- State: lantern lit bits, place priorities (`place.setPriority`), `Resident.craft` and the master flag, Town Book pages, the door-pair counts behind Follow the thread (maker to store, store to outlet, outlet to home or place; decaying, like the flows overlay's).
- Content: `DecorDef.supply`, master's goods, the pairs of pattern and good, each page's leaning.
- Systems: `supplies` (the lamplighter's round as a schedule override, resting pieces, household candles), `masters`, `townbook` (detectors like the patterns'), and `callings` again, reading the pages.

**V2, light and green** (`apps/client/src/render`, `packages/art`; no sim change)

- `env.lightMap`: a render target the lights layer redraws on a static-layer event; read by `material.ts` (walls, the glass rooms), `ground.ts` (in place of the `MAX_GROUND_LIGHTS` loop), `scatter.ts`, the agents' material, `layers/effects.ts` and `layers/water.ts`.
- `patterns.ts`: eight room layers appended to the pattern array; `surface.ts`: ids appended for wood grain, painted wood, wrought iron, terracotta and cloth, and the props, vehicles and residents kits write them.
- `kits/trees.ts` and `kits/nature.ts`: brush-dab crowns and the meadow carpet; `groundAo.ts`'s uniform bound in the kit material; ribbon smoke; `setBubbles` on the View list.
- `app/perf.ts` and Settings: Measure this laptop, with `/api/valleys/:id/perf` in the server and the dev relay.

**V3, yards, streets and the long view**

- `layers/dressing.ts`: a static, instanced layer driven by rules in `packages/art/src/dressing.ts` (data: who gets what, at which anchor); `KitAnchors` gains door, yard, wall, eaves and garden anchors.
- Rows, garden lots, corners and storeys in `kits/rows.ts` and the buildings layer, on R2.0's lot fields.
- `layers/horizon.ts`; a height term in the shared fog chunk; flow in `layers/water.ts`.
- `render/endpaper.ts`: the map drawn on an OffscreenCanvas in a worker, shown on one full-screen quad, with the scene pass skipped while it covers the view.

**V4, the developing picture**

- `cache.ts`: an accumulation target beside the still frame; jitter sequences for the pixel, the sun's disc (with a shadow re-render a sample) and the lens; sky samples; a governor on the measured GPU time.
- `post.ts`: lens blur for moving layers from the cached depth, in the existing final pass.
- `renderer.capture({ style: 'ink' })`; the tea-break camera in `input/camera.ts`.

Determinism holds as ever: everything under R1 to R3 is integer sim code on seeded streams, and nothing under V2 to V4 touches sim state or the hash.

## V2 contracts

Defined in cycle V2.0, then changed only additively during the V2 wave (V2A night, V2B green, V2C what V1 left half-wired, merged in V2X). Render, art and the perf route only: no sim state, command or hash changes. Ownership by file, the handshakes, the light map's writers and readers, stand-ins and the before numbers are in `docs/build/v2-wave-notes.md`.

**Art** (`packages/art`):

- **Surface ids** (`surface.ts`), appended for props, carts and residents: `woodGrain` 20, `paintedWood` 21, `wroughtIron` 22, `terracotta` 23, `cloth` 24. A surface id is its pattern layer and 19 is the noise layer's (`NOISE_LAYER`, unchanged), so `SURFACES` is `readonly (SurfaceDef | undefined)[]` with `SURFACES[19]` undefined (`surfaceDef(id)` reads it as plain). `SURFACE_LAYERS` (25) is how many layers a surface id indexes, the noise slot included: the kit material's table (`surfaceTable()`: `uSurf`, `uSurfAccent`, `uSurfExtra`) has that many rows, and its plain test is `si < 1 || si == NOISE_LAYER || si >= SURFACE_LAYERS`. The five rows are flat (strength 0) until V2C.
- **Room layers** (`surface.ts`, `patterns.ts`): `ROOM_LAYER` (25, after the surface layers) and `ROOM_LAYERS` (8), the little rooms behind lit windows; `PATTERN_LAYERS` is `ROOM_LAYER + ROOM_LAYERS` (33). `generatePatterns` leaves the five surfaces and the rooms flat (R 128) until V2C and V2A fill them. Every index is append-only.
- **The dab kit** (`dabs.ts`): `brushDabs(b: ShapeBuilder, blobs: readonly DabBlob[], opts: DabOptions): number` lays brush dabs over the blobs into the caller's builder with surface leaf, restores the builder's surface id and returns the triangles written; `DabBlob { center, radii, normalFrom?, color }`, `DabOptions { count, size, tintSpread, skyLighten, gaps, thin, seed }` (all plain numbers; options appended, never reordered). A stub that writes nothing until V2B; no kit calls it yet.

**Client** (`apps/client/src/render`):

- **The light map** (`lightMap.ts`): `LIGHT_MAP_TEXELS` (low 2, medium 4, high 6, ultra 8 texels a tile) and `lightMapSize(quality, tiles = MAP_SIZE)` (384 to 1,536); `LightDisc { x, z, radius, color, intensity }` (world tiles, sRGB hex, 1 a lit lantern's pool); `LightMapWriter` (`set(source, discs)` and `clear(source)`, true when something changed; `discs()`, `count`, `dirty`, `requestRedraw()`, `takeDirty()`); `createLightMapTarget(quality)` (RGBA half float, linear, no depth); `resizeLightMap(env, quality)`, called from `Renderer.setQuality` (the texture object stays the same, so bound uniforms keep working); `drawLightMap(three, env)`, called once a frame after the layers' `frame()`, which redraws only when a writer changed something and bumps `env.lightMapRevision`. Readers bind `lightMapUniforms(env)` (`uLightMap`, `uLightMapXf` with uv = xz * xy + zw; one set per env) and include `LIGHT_MAP_GLSL` for `qLightMap(xz)`, the lamplight in linear RGB, which each reader scales by the night. V2.0's stub draws no discs: it clears the map to black on a redraw, and the ground's 32-light loop (`MAX_GROUND_LIGHTS`) stays in charge.
- **`WorldEnv`** gains `lightMap` (`WebGLRenderTarget`), `lightMapRevision` and `lightWriter` (`LightMapWriter`).
- **The lights layer** (`layers/lights.ts`) feeds the writer under the sources `lanterns` (decor kits' `anchors().lights`) and `windows` (lit panes' spill, by `windowLit`), and its `frame()` returns true when they change, a static-layer event.
- **The gallery** (`apps/gallery/src/surfaces.ts`): `SURFACE_ORDER` stops below `NOISE_LAYER`, so the V2 surfaces stay out of its shots until V2C gives them patterns.

**As built (V2C)**:

- **The five surfaces** (`surface.ts`, `patterns.ts`): `woodGrain` (scale 0.6, strength 0.6: streaks along u, finer lines, a knot in about one cell in seven), `paintedWood` (0.8, 0.5: faint brush strokes, worn through to bare wood where a fine mottle peaks; accent `wood` 0.75), `wroughtIron` (0.5, 0.5: a hammered mottle and bright worn spots), `terracotta` (0.6, 0.55: the wheel's rings, mottled firing, grit, pale bloom; accent `stripe` 0.35) and `cloth` (0.5, 0.5: a plain weave of 32 threads each way, homespun thread tones over an uneven dye). All laid as `facade` (up faces take `top`). They add about 35 ms to the pattern array at load in the build container. The gallery's `SURFACE_ORDER` shows every surface but plain, a fourth row.
- **Writing them**: `ShapeBuilder.currentSurface` (additive getter) lets a helper restore the caller's id; every prop helper in `kits/props.ts` does (the `quiet` wrapper and `groundPatch`), so props inside building kits leave the walls' ids alone. `Channel.surface?` (`rig.ts`, additive) is written into the rig's `surface` attribute: residents' cloth channels carry `cloth`, staffs and lutes `woodGrain`. Carts: beds, planks, shafts and wheels `woodGrain`, painted rails `paintedWood`, axle, tires and hubs `wroughtIron`. The patterns are laid from world position, so on a moving cart the grain slides a little; an object-space switch for moving pieces is V2A's to add in `patchKitShader` (noted to the wave).
- **Wall occlusion** (`render/wallAo.ts`): `patchWallAo(shader, env)`, called last in `createWorldMaterial`'s `onBeforeCompile`, binds `groundAoFor(env)` as `uGroundAo`, passes each piece's foot (its instance or batch origin in world space) from the vertex shader (anchored before `#include <fog_vertex>`) and, after `#include <aomap_fragment>` (the fragment anchor V2A keeps), darkens faces whose normal is mostly level by the ground AO a third of a tile out along the normal (its shortfall from 1 times 1.6, `WALL_AO_GAIN`): at most 40% in indirect light and half that in sun, fading out on a squared curve by 1.2 tiles above the foot (`WALL_AO_STRENGTH`, `WALL_AO_DIRECT`, `WALL_AO_FADE`), so it gathers at the foot and most where the ground AO is deepest (narrow streets, courtyards). Roofs, tops and emissive are untouched. It throws if an anchor goes missing.
- **Ribbon smoke** (`layers/effects.ts`): one instanced draw of 12-segment strips, two to a chimney (`RIBBONS_PER_CHIMNEY`, at most `MAX_RIBBONS` 400), placed and animated in the vertex shader from the chimney, a seed and the clock: they rise about a tile and a half, widen, lean downwind (`env.storm` leans them further), waver in waves that travel up them, face the camera about their own line and fade at the top; winter (`env.snow`) makes them fuller and lower. Shaded by `env.sky` and `env.sunColor`, dimmed by `env.night`, plus `qLightMap` at each vertex scaled by the night; scene fog applies. The CPU writes only the clock a frame (the puffs wrote up to 400 matrices).
- **Bubbles** (`render/bubbles.ts`): the View list's `bubbles` overlay (Hearth lens, label Moods); `Renderer.setOverlay` sends `setBubbles(bubblesFor(kind))` to the agents layer on every call and `overlayKindFor(kind)` (null for bubbles) to the overlays layer. `OverlayKind` gains `'bubbles'`.
- **Decor far levels**: the dozen commonest pieces without one (lantern, lamp post, planter, flower bed, bench, herb planter, barrels, crates, birdbath, wildflower verge, fence, low wall) build a far level from the same code, 10 to 25% of the near triangles; `kits/decorFar.ts` (`farBox`, `farCylinder`) draws the small parts the far level's size rule would drop (a lantern's flame keeps its place and glow). The decor layer is unchanged: lit and larger pieces swap to the far level at the decor distance, small props still shrink away there. The town showcase's decor at the default camera fell from 177,052 to 97,812 triangles on Medium (83,328 to 17,910 wide).

**Measuring**:

- **The perf route** (`packages/protocol/src/perf.ts`): `PUT` and `GET /api/valleys/:id/perf` (`PERF_ROUTE`), one `handlePerf(req, storage, meta, now)` shared by the Worker's ValleyRoom and the dev relay, outside sim state. Every call needs a seat token (`Authorization: Bearer`); the seat and the time come from the server. The body is a `PerfRunInput { machine, rows, table }` (`PerfMachine { browser, screen, pixelRatio, gpu, build }`, `PerfRunRow { scene, quality, moving, idle }`, the Markdown table) of at most `MAX_PERF_CHARS` (64 KB), stored as a `PerfRun` (plus `seat` and `created`); `trimPerfRuns` keeps the last `PERF_RUNS_PER_SEAT` (3) of each seat. `PerfStorage` is the store (Durable Object storage, the dev relay's file; `MemoryPerf` for tests); a solo valley keeps its runs on the device with the same trimming.
- **Measure this laptop** (Settings, with `app/perf.ts`): `__qoti.perf()`'s run on each preset at 11:00 (`MEASURE_HOUR`) and on Medium and High at 22:00 (`MEASURE_NIGHT_HOUR`, `MEASURE_NIGHT_PRESETS`) in the valley on screen, then in the village and town showcases (in this client's Mirror, never the sim; the showcases run on a second sim worker with the village fixture), the valley put back as it was; `PerfRow.hour` (and `PerfRunRow.hour`) marks each row's hour and `perfTable` adds an Hour column when rows carry one; it shows `perfTable(rows)`, copies it as Markdown and stores the run through the perf route.
- **The grown village**: `?debug&fixture=grown`, a town grown by the bench's autoplayer (about 150 residents, Village rank, a festival's worth of decor); `npm run fixture:grown -w @qoti/client` regrows it (`tools/bench/src/tune.ts` with `TUNE_SAVE`). The fresh start refuses the V2.0 snapshot, so R1X regrows it.
- **Scripts**: `apps/client/e2e/v2-shots.mjs <stage>` (V1's scenes and the grown village by day, golden hour and night, saving `docs/build/screenshots/v2-<stage>-<scene>-<shot>.png`) and `v2-perf.mjs` (per scene and preset, moving and idle, the grown village and night included).

## Client

- **Boot**: title screen → create or join → `RoomConnection` → `SimHost.init` (new from seed, or snapshot) → `ready` → Mirror built from the view → Renderer and UI mount → live turns flow to the worker.
- **Mirror** (`state/`): typed-array copies of the layers (patched by `LayerPatch`), entity maps, seats, clock, and a decor spatial hash. Implements `MapReader`. Exposes Preact signals for UI.
- **Registries** (one line per addition): render layers (`render/layers/index.ts`), tools (`input/tools/index.ts`), lens toolbars and lens overlay toggles (`ui/lenses.ts`), panels (`ui/panels/index.ts`). [I1] A panel's side is `left`, `right`, `book` (opens from its lens's toolbar, one book at a time) or `overlay` (the away letter); a tool may name the valley `modes` that offer it.
- **Undo** [I1] (`state/undo.ts`): each seat's stack of its last `UNDO_DEPTH` accepted commands. A command counts as accepted when the turn carrying its seq has run with no `command.rejected` for it; the inverse is built then, from what the command changed (new entity ids from the update, earlier road, tree and field values captured before submitting, earlier customization fields). Before submitting an inverse the client checks the target still looks as the command left it, and refuses with `CHANGED` otherwise; the sim's own rejection of an inverse reads as an undo refusal.
- **Optimistic feel**: a placed ghost stays visible until the turn carrying its command arrives (about 100 to 200 ms), then the real piece replaces it; a rejection shows a gentle message at the spot.
- **Settings**: `localStorage` wrapped in try/catch; the game works without it.

## Rendering

- `WebGLRenderer` (WebGL2). One shared kit material (`MeshStandardMaterial`, vertex colors, roughness 0.9; Lambert-based with a pattern texture array from V1, see Lean renderer) extended with `onBeforeCompile` hooks for season tint, snow and wind sway; an emissive variant for windows and lanterns.
- **Static content** is chunked (16 x 16 tiles): terrain and roads are meshes per chunk; buildings use `BatchedMesh`; decor and trees use `InstancedMesh` per def and level of detail. A dirty chunk rebuilds within 2 frames; at most 2 chunk rebuilds per frame.
- **Ground** (C3D-1): one shared surface (`render/surface.ts`) for terrain, water, trees, props, decor and picking: tile centers sit exactly at their level, cells between four tile centers are two triangles split along the flatter diagonal, cliffs (2+ levels) keep their own levels and get rocky faces, built-on tiles are pinned flat, river banks follow a softened water mask. Use `groundY(reader, x, z)` to stand things on the ground. Road surfaces are painted by the ground shader from a per-tile data texture (joins and corners from neighbors); the roads layer only adds bridge geometry. Trees and nature props are instanced per kind with per-chunk frustum culling and per-instance level of detail (`render/scatter.ts`). Shared look state (time, night, sky, ground lights, camera) is `LayerContext.env`.
- **Picking** is math, not raycasting meshes: march the ray across the heightfield, then use the `occupant` layer and the decor spatial hash.
- **Ghosts**: translucent kit meshes tinted valid or invalid.
- **Overlays** [I1]: their own ground-draped transparent meshes (charm per chunk, coverage discs and rings, flow ribbons with animated chevrons, status icons as billboards), never edits to the terrain shader. Buildings are one `BatchedMesh` keyed by variant (seed bucket, customization, runtime piles, construction stage), with a low detail swap beyond the preset's building distance (V1D: with hysteresis and a few swaps a frame, `render/lod.ts`). Decor is instanced per def and level and culled per chunk (V1D).
- **Time of day**: from the clock plus interpolation between turns.

### Lean renderer [V1]

The V0 concept of the Painted Miniature look ran at about 20 to 25 fps on High on the owner's laptop. On integrated graphics the frame is bound by memory bandwidth (every full-screen pass reads and writes the whole frame) and by how many times the scene is drawn, far more than by triangles. The lean renderer draws the scene at most once a frame, keeps what does not change, and spends full-screen passes sparingly. It was proven first in the concept viewer (`docs/concepts/v0-look/index.html`; the old engine stays as `v1-engine.html` for comparison) and V1 builds it into the game (`docs/build/cycle-v1d-lean-renderer.md` and its wave). Presets are in `17-presentation.md` (Quality presets), budgets in `22-quality.md`.

- **Frame graph**: one scene pass into a HalfFloat target (MSAA 4 on Medium and up, none on Low); a quarter resolution blur chain (downsample, then a horizontal and a vertical Gaussian); then one final full-screen pass to the canvas that does tilt-shift (mixes the sharp and blurred images by the vertical mask), bloom (the bright part of the blurred image, golden hour and night only), the seasonal grade, vignette, tone mapping, sRGB and dither. It replaces `PostChain`'s RenderPass, UnrealBloomPass, two tilt-shift passes, OutputPass and grade pass (`render/post.ts`), and screen-space AO never runs on a moving frame. The context is created without `antialias`; multisampling lives on the scene target.
- **Static and moving layers**: every render layer says whether it is `static` (terrain, roads, buildings, decor, trees, nature, fields, signs, lights, sky) or `moving` (residents, animals, carts, boats, smoke, water, sails, ghosts, overlays, presence, notes), and its objects carry the matching Three.js layer. Drawing stays on demand, as today. Animation inside a static layer (cloud shade drifting over the ground, foliage sway, lantern flicker) either moves to a moving layer or into the final pass (cloud shade can be applied there from depth) or pauses while the camera rests; the V1 wave notes record the choice per effect.
- **Cached sun shadows**: the shadow map renders only when the sun has moved enough (about every in-game quarter hour), static content changed inside the shadow frustum, the quality changed, or the view target left the frustum's inner half. The frustum follows the view with that hysteresis and snaps to whole shadow texels, so panning neither shimmers nor re-renders it every frame. Moving things never cast into it; residents, animals and carts get soft blob shadows (instanced decals).
- **Baked ambient occlusion**: vertex AO in every kit (darker toward the ground, under jetties and eaves, in inner corners), and a ground AO texture in world space (about 2.5 texels per tile) built from building footprints and tree crowns, blurred twice (a tight contact pass and a wide enclosure pass for narrow streets and courtyards) and sampled by the ground shader. A chunk's part is rebuilt when its occupants or decor change. Screen-space AO only on Ultra, and only for still frames.
- **Kit material**: Lambert-based instead of `MeshStandardMaterial`. Surface detail comes from a pattern texture array generated in code at load (brick, stone, timber, clay tile with curved tiles, slate, thatch, cobbles, flags, plaster, grass with tiny flowers, dirt, field furrows, zinc seams, awning stripes, flowers, and a low-frequency noise layer for meadow patches and weathering), mipmapped and anisotropic, indexed by the per-vertex surface id through a per-surface table (world scale, mapping mode: facade, top or roof rows; strength; accent color). One or two texture fetches per pixel replace dozens of noise evaluations, and nothing shimmers at distance. Glass and water get a cheap sun glint and sky fresnel. The textures are generated by code, not authored, so P46 holds.
- **Levels of detail and culling**: static content stays chunked (16 x 16 tiles) and frustum culled, and buildings stay in `KeyedBatch` with per-object culling. Every kit builds two levels: near (full detail) and far (shell, roof, chimneys, windows and doors as flat quads; about 100 to 150 triangles for a home), swapped by camera distance with hysteresis at a distance set per preset. Per-face color jitter is hashed from position rather than drawn from a running RNG, and silhouette choices are rolled before branching on the level, so both levels match. Town trees are full; forest trees use a low-poly version.
- **Still-frame cache** (the moonshot): when the camera has rested for about 200 ms, the static layers are drawn once (on Ultra at the device pixel ratio and with screen-space AO) and kept as color plus depth. Idle frames restore it with one full-screen pass that also writes depth (`gl_FragDepth`, depth function always), then draw only the moving layers, the blur chain and the final pass. A town builder spends most of its time with a still camera, so idle frames cost a fraction of a full frame, laptops stay cool and quiet, and the still picture can be better than the moving one. A camera move, a sun or light change, a shadow re-render, a quality or size change, or any change a static layer reports (a chunk rebuild, a building swap, a ground AO rebuild) invalidates it.
- **Dynamic resolution** (`render/resolution.ts`) judges only moving frames, steps through 1, 0.85, 0.72, 0.6 and 0.5, steps back up after a few seconds of headroom, and waits longer before retrying a step-up that failed (a cool-down), so it never flaps. The `?debug` overlay shows GPU frame time from `EXT_disjoint_timer_query_webgl2` where the browser offers it, and whether the frame was moving, still (the cache being drawn) or idle.
- **Later moonshots** (listed, not scheduled): rendering in a worker with `OffscreenCanvas` (frees the main thread for the UI), a WebGPU backend with GPU culling and indirect draws, temporal upscaling.

**As built (V1D)**:

- **Targets** (`render/post.ts`): the scene targets are R11F_G11F_B10F where the browser can render to it (half the bytes of RGBA16F per sample, which is the bandwidth integrated graphics are short of; the final image needs no alpha), else RGBA16F (`?debug&scenefmt=half` forces it). The canvas has no antialiasing, depth or stencil. A moving frame draws into a target at the moving ratio times the dynamic resolution step; still and idle frames draw into one at the still ratio (`QualityPreset.stillScale`), and the canvas is sized at the still ratio, so the final pass scales a moving frame up. When the two ratios match it is one target. The quarter resolution chain is sized from the still target, so the blur keeps one size on screen at any moving scale, and runs twice above a ratio of 1.5. Without tilt-shift in view (close up) the chain is skipped. Bloom has a chain of its own at quarter resolution: a bright pass that keeps each of the 4 x 4 source texels under a quarter texel only if it is above the threshold (whole colors, as UnrealBloomPass's high pass), then the blur twice or more, added in the final pass through `lookBloomMix` (given the bright light plus the threshold) at 2.5 times the look's strength (`BLOOM_GAIN`). Thresholding the blurred image instead averaged a small lit window away into the dark around it, and the town's night lost its glow.
- **One render a frame**: three resolves a multisampled target at the end of every `render()` and then invalidates its samples, so an idle frame cannot restore the cache in one pass and draw the moving layers in another. The restore is a full-screen mesh in the scene on the moving layer (`render/cache.ts`), drawn first, and an idle frame is one `render()` of the moving layers with it. Each pass hides the layer roots it does not draw, so three does not walk them.
- **Still frames**: once the camera has rested 200 ms the still is drawn even if nothing moves (it is the preset's own sharpness and, on Ultra, has GTAOPass's AO, loaded on demand), its color and depth are copied to the cache target, and the same frame finishes as an idle one. The cache's key is the targets, the preset, the view, `staticRevision`, the light and the shadow map's render count. Static animation (cloud shade, sway, the sky's clouds and stars) runs on `env.staticTime`, which stops at rest; the cloud shade did not move into the final pass (it needs the ground shader, V1C's, to stop drawing it, and the look's say, V1A's: left for V1X).
- **Shadows** (`render/shadows.ts`): `shadowMap.autoUpdate` is off. The map renders when the sun's direction moved more than half a degree (each quarter-hour step of the light), when the view target leaves the inner half of the frustum (re-centered there), the view needs more than the frustum holds or less than 60% of it (fitted with 20% slack), the map size changes, on a quality change, and on static content changes: at once with the camera at rest (on any preset), and 300 ms after the change while it moves (layers refill as the view moves; the next rest catches up). The center snaps to whole shadow texels in the light's view plane, so a re-render for anything but the sun redraws every edge where it was. Moving layers never cast: residents keep their own blob shadows (they never cast), and animals, carts and the windmill's sails have no sun shadow until V1C's blob layer.
- **Levels** (`render/lod.ts`): the building distance has a floor of 75 tiles (`BUILDING_DETAIL_FLOOR`, as before V1D) until V1B's far levels carry lit windows, since today's far level has none and a town past 60 tiles went dark at night; `levelFor` keeps an instance's level within 5% either side of the distance; buildings queue their swaps and apply the nearest first, at most 24 or 4 ms a frame (all at once on the first look after a load), and a new building starts at the level its distance asks for. Decor is an `InstanceField`: per chunk frustum culling and a level per instance by the decor distance; small props (bounding radius under 0.9 tiles, nothing lit) shrink away over the last 15% and are gone beyond it.
- **Chunks** report a change only when a chunk's mesh really changed (an empty chunk rebuilt empty is none), so a streaming valley does not keep dropping the still-frame cache.

**As built (V1A)**:

- **Pattern array** (`packages/art/src/patterns.ts`): `createPatternArray(size, fill = 'patterns')` runs the generators (`'flat'` keeps the stub for tests); the client makes one per page in `createWorldEnv` and logs its time with `?debug` (`lastPatternMs()`, about 30 to 60 ms in the build container). Every layer is built from value noise on an integer lattice whose corner values come from precomputed tables, with interpolation weights precomputed per row and column, so no texel hashes anything; only `+ - * /` and `floor` (no `Math.sin` or `Math.pow`), so both laptops build the same bytes (a checksum test pins it). Anisotropy per preset (`PATTERN_ANISOTROPY`: 2, 4, 8, 16, capped by the GPU), set by `setPatternAnisotropy` on a quality change.
- **Kit material**: the shader lives in `packages/art/src/materials.ts` (`patchKitShader`, `createLeanKitMaterial`, `kitSurfaceUniforms`, `surfaceTable`) so the gallery draws the same thing; `render/material.ts` binds it to the world env and adds the night glow (`createWorldMaterial` returns a `MeshLambertMaterial`). Per fragment: one fetch from the noise layer, and for any surface but plain one fetch from the surface's layer, both with `textureGrad` from world-space derivatives taken before any branch (mipmaps stay right across face edges). The table (`uSurf`, `uSurfAccent`, `uSurfExtra`) holds 1 / scale, mapping, strength, accent mix and color, the snow hint and whether the season tint applies. Roof courses run along the slope (v divided by the normal's horizontal length), so steep and shallow roofs get the same courses. Branches only for plain (no pattern fetch), glass and water (sky fresnel; the sun glint is added to the emissive term, none on a lit pane) and flowers. Snow (`env.snow`) covers upward faces, patchy as it starts; the season tint (`env.seasonTint`) reaches grass, leaf and field; leaf and flower faces sway on `env.staticTime` (`env.sway`). `FRESNEL_GLSL` (`qFresnel`, `qSkyFresnel`, `qSunGlint`) is exported for the water shader. Residents use Lambert too.
- **Look** (`render/look.ts`): Khronos PBR Neutral (`LOOK_TONE_MAPPING` is three's `NeutralToneMapping`), `lookTiltMix(uv, k)` and `lookDither(rgb, fragCoord)` called by the final pass, `uLookContrast` (the grade's S-curve), `applyGrade(u, season, warmth, night?)`, bloom from `bloomFor` at golden hour and night only. The renderer sets the season from the calendar (`applySeasonLook`, `LeanFrame.setSeason`) and the haze from `hazeFor` (`render/lighting.ts`).
**As built (V1B)**:

- **One path, two levels**: a building kit runs the same code at both levels; `ShapeBuilder` carries the level (`kitBuilder(opts)` in `kits/parts.ts`) and decides what is drawn. `detail(fn)` is decoration: at the far level it runs with its faces dropped, so every random draw inside still happens and whatever is built after keeps its colors and choices; structural parts (walls, roofs and gables, chimneys, windows, doors, porches, bays, shopfronts, awnings, yards) still draw their far versions inside it (`essential`). `nearOnly(fn)` drops everything (dormers, ivy, props, signs, gable timbers, dressings). `levels(near, far)` gives a part both versions, and `proxy(fn)` draws clutter far off as one block of its size and average color (stock piles, crop rows). At the far level a primitive whose largest side is under 0.16 tiles, or whose middle side is under 0.045 (0.03 for anything longer than 0.45), drops out by itself, boxes lose their bottoms and chamfers, beams their end caps, and cylinders round with at most 8 sides. Because both levels draw from the same random streams in the same order, nothing about the far level pops: the tests check chimneys, outline and wall paint across a swap.
- **The far level** keeps walls (with the timber's plates and floor beams as flat strips), roof planes (half a course up, with the eave's thickness at real eaves only), gables, chimneys as boxes, windows as flat quads (shutters as one board behind the glass, the frame only where there are none, the glass exactly where the near level's is, so the night glow lights the same panes) and doors, fanlights, bays, shopfronts and awnings as flat quads. Homes come to 75 to 150 triangles, the town hall to 338, nothing over 430. The building distance floor is gone (`BUILDING_DETAIL_FLOOR` 0): far towns light up at night.
- **Paint and shade**: walls and roofs take per-face jitter hashed from the face's position and surface (`ShapeBuilder.jitter`), the same at both levels. The kit bake (`AoBake 'kit'`) darkens a wall by a quarter at its foot, clearing by 0.85 tiles up (in proportion for small pieces), undersides by 30%, and soft boxes of shade (`occlude`) under jetties, deep eaves and porch hoods; roofs and lit panes are never darkened. Trees and nature keep the classic bake.
- **Joined facades** (`kits/rows.ts`): the buildings layer reads each home's neighbors from the Mirror's occupant layer (`rowNeighbors`: a built row kit with the same facing, its front row on the same line and standing at the same level) into `params.joinL` and `params.joinR` (the neighbor's kit), or `streetL` and `streetR` where a road runs past that side, so they are part of the key and both houses rebuild when either changes. A joined home builds to its lot's edge on that side, in a shared band (0.3 tiles back from the lot's front, 1.45 deep, whatever the lot's depth), leaves its party wall out below the neighbor's eaves (`ROW_EAVES`), runs its plinth and sill beams through, stops its roof flush with a gable at a joined end (hips become gables there), and stands its chimney on the right party wall with a pair of pots (its neighbor leaves that wall's stack to it). Row kits: cottage, townhouse, shop (with its flat) and house.
- **Builds** run about three times faster than before V1B: vertices live in growable typed arrays and each color is converted from sRGB once. In Node a key builds in 1 to 4 ms; in the town showcase the browser built 621 keys in 1.56 s (2.5 ms each in SwiftShader, which shares the CPU). The buildings layer logs each rebuild's keys and time in a dev or `?debug` session (`buildingBuildStats` keeps the worst key).
**As built (V1C)**:

- **Ground** (`render/ground.ts`): a third ground texture, `detail` (filtered, a texel a tile): mown lawn within 4 tiles of a building, worn earth (seats, door fronts), fertility, meadow. The shader adds the pattern array's grass grain, calmer lawns, combed meadow, clover on rich soil and a little bare earth on thin, worn earth, stone banks where lawns meet the water, the ground AO texture, and a snow hook for C5E (`material.userData.snow`, 0 until then). Streets that make a square of four tiles are flagged (`qFlags` in `layers/roads.ts`).
- **Ground AO texture** (`render/groundAo.ts`): 480 x 480 R8 from occupant lots, forest crowns, decor trees, walls, hedges and fences, blurred twice (box radius 2 and 6 texels, two passes each, weights 0.7 and 0.25), softly lifted deep inside a lot. Edits rebuild the touched tiles plus the blur's reach (about 1.5 ms a chunk) and the terrain layer's `frame()` reports it. `groundAoFor(env)` is the uniform for other materials.
- **Trees** (`kits/trees.ts`, `render/scatter.ts`): `low` is 16 triangles for every tree with the near level's outline; per-instance hysteresis of 10% of the swap distance; forest trees (no building within 6 tiles) swap at 0.4 of the distance on Low and Medium. Hedgerows (kit `hedgerow`) line field edges and lily pads (kit `lily-pads`) float on still water, both from the nature layer.
- **Blob shadows** (`render/layers/blobs.ts`, moving): channels filled by the animals and carts layers each frame; residents keep the agents layer's own.

**As built (V1X)**:

- **One engine**: the classic chain (`postClassic.ts`, `?engine=classic`, the canvas sky, the per-frame shadow fit) is gone; `RenderStats.engine` is always `lean` and `QualityPreset.maxDpr` is kept unread so the preset contract only grows.
- **Static changes are real changes**: `KeyedBatch.set` returns whether anything on screen changed, and the buildings and signs layers invalidate only then; `GroundAo.update` returns true only when a texel changed. `renderer.staticChanges` (`__qoti.staticChanges()`) counts what bumped `staticRevision` per layer, `renderer` for changes from outside a layer. A resting live valley draws idle frames apart from the sun's quarter-hour step and real changes.
- **Light**: by day the sun stands 12 to 50 degrees up (`daySun` in `lighting.ts`: 50 at noon, about 39 at 15:00, 18 at golden hour; the concept's day is 47 and its golden hour 21) and it swings evenly from 20 degrees east of the default camera's line of sight at 6:00 to 100 west at 18:00 (-40 at noon, near the concept's -38) instead of passing straight behind the camera, and buildings cast shadows the camera sees through the middle of the day; golden hour's exposure is 1.12 (the concept's is 1.08) with 1.3 of sky fill, so its long shadows stay warm; night keeps 92% of its saturation (it was 78%).
- **Cloud shade** stays in the ground shader, paused at rest (`v1-wave-notes.md`, Animation inside static layers).

## Content pipeline

- TypeScript data modules in `packages/content/src/<kind>.ts` (buildings, decor, roads, trees; later goods, patterns, wishes, achievements, names), aggregated in `index.ts`.
- Ids are kebab-case and stable forever (saves reference them).
- `validate.test.ts` checks unique ids, valid references, sane sizes and costs. The client tests that every `art.kit` id exists in `packages/art`.

```ts
interface BuildingDef {
  id: string; name: string; lane: 'hearth' | 'ledger' | 'shared';
  category: 'home' | 'production' | 'storage' | 'service' | 'civic' | 'landmark' | 'defense';
  size: [w: number, d: number]; entrance: [dx: number, dz: number];
  placement?: PlacementRule[]; cost?: Cost; upkeep?: number;
  art: { kit: string; params?: Record<string, number | string | boolean> };
}
interface DecorDef {
  id: string; name: string; lane: 'hearth' | 'ledger' | 'shared';
  radius: number;                       // fixed point
  linear?: boolean; onRoad?: boolean; onWater?: boolean; blocksWalking?: boolean;
  tags: string[];                       // 'bench', 'lantern', 'flower', 'tree', 'wall', 'hedge'...
  art: { kit: string; params?: Record<string, number | string | boolean> };
}
```

**I0 content**: roads path and lane; buildings cottage (2x2), house (2x3), well (1x1), shed (1x2), windmill (2x2, decorative in I0), town hall (4x4); decor bench, lantern, flower bed, planter, fence, low wall, hedge, signpost, barrels, crates, apple tree, cherry tree; forest trees oak, birch, pine.

## Debugging

- `?debug` in the URL shows a dev overlay (fps, frame ms, draw calls, triangles, turn, hash, entity counts; sim ms per tick and turn lag arrive with C2D) and exposes `window.__qoti` for tests: mirror counts, last turn, hashes by turn, clocks and helpers that find valid on-screen spots. `?quality=low|medium|high` picks the render quality.
- [I1] `?debug&fixture=hamlet` opens a fresh solo valley whose first snapshot is the sim's hamlet fixture (`packages/sim/test/fixtures/hamlet.ts`); adding `&mock` lays the UI mocks' history (wishes, pages, Chronicle, stocks, budget) over it. `&clean` hides the dev overlay for screenshots. `?creative` starts the title screen with the creative valley box ticked (the I0 end to end specs use it).
- On desync, both clients save a debug dump (snapshot and recent turns) that can be downloaded from the overlay.
