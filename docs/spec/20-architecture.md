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

## Client

- **Boot**: title screen → create or join → `RoomConnection` → `SimHost.init` (new from seed, or snapshot) → `ready` → Mirror built from the view → Renderer and UI mount → live turns flow to the worker.
- **Mirror** (`state/`): typed-array copies of the layers (patched by `LayerPatch`), entity maps, seats, clock, and a decor spatial hash. Implements `MapReader`. Exposes Preact signals for UI.
- **Registries** (one line per addition): render layers (`render/layers/index.ts`), tools (`input/tools/index.ts`), lens toolbars and lens overlay toggles (`ui/lenses.ts`), panels (`ui/panels/index.ts`). [I1] A panel's side is `left`, `right`, `book` (opens from its lens's toolbar, one book at a time) or `overlay` (the away letter); a tool may name the valley `modes` that offer it.
- **Undo** [I1] (`state/undo.ts`): each seat's stack of its last `UNDO_DEPTH` accepted commands. A command counts as accepted when the turn carrying its seq has run with no `command.rejected` for it; the inverse is built then, from what the command changed (new entity ids from the update, earlier road, tree and field values captured before submitting, earlier customization fields). Before submitting an inverse the client checks the target still looks as the command left it, and refuses with `CHANGED` otherwise; the sim's own rejection of an inverse reads as an undo refusal.
- **Optimistic feel**: a placed ghost stays visible until the turn carrying its command arrives (about 100 to 200 ms), then the real piece replaces it; a rejection shows a gentle message at the spot.
- **Settings**: `localStorage` wrapped in try/catch; the game works without it.

## Rendering

- `WebGLRenderer` (WebGL2). One shared kit material (`MeshStandardMaterial`, vertex colors, roughness 0.9) extended with `onBeforeCompile` hooks for season tint, snow and wind sway; an emissive variant for windows and lanterns.
- **Static content** is chunked (16 x 16 tiles): terrain and roads are meshes per chunk; buildings use `BatchedMesh`; decor and trees use `InstancedMesh` per def and level of detail. A dirty chunk rebuilds within 2 frames; at most 2 chunk rebuilds per frame.
- **Picking** is math, not raycasting meshes: march the ray across the heightfield, then use the `occupant` layer and the decor spatial hash.
- **Ghosts**: translucent kit meshes tinted valid or invalid.
- **Overlays** [I1]: their own ground-draped transparent meshes (charm per chunk, coverage discs and rings, flow ribbons with animated chevrons, status icons as billboards), never edits to the terrain shader. Buildings are one `BatchedMesh` keyed by variant (seed bucket, customization, runtime piles, construction stage), with a low detail swap beyond 75 tiles.
- **Time of day**: from the clock plus interpolation between turns.

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
