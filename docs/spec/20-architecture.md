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

`effectiveSpeed` = minimum desired speed over connected seats; 0 if none connected; 0 if `settings.togetherOnly` and fewer than 2 seats are connected (and then only notes, plans and profile commands are accepted).

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

- `serialize(state) -> Uint8Array`: JSON where typed arrays are base64, then gzip (CompressionStream). `deserialize` reverses it and rebuilds indexes.
- `hashState(state) -> string`: 64-bit FNV-1a (two 32-bit lanes) over typed array bytes and the JSON of the rest. Clients compare hashes every 50 turns.
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

Defined in cycle 01, then changed only additively (see `31-parallel-development.md`).

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
                       | { kind: 'snapshot'; data: Uint8Array } }
  | { k: 'turns'; turns: Turn[] }
  | { k: 'snapshot'; reqId: number }
  | { k: 'hash' };
type FromWorker =
  | { k: 'ready'; view: ViewSnapshot }
  | { k: 'update'; t: number; events: SimEvent[]; patches: LayerPatch[] }
  | { k: 'agents'; t: number; data: Float32Array }                     // I1
  | { k: 'hash'; t: number; h: string }                                // every 50 turns
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
}

// apps/client/src/render/api.ts
interface RenderApi {
  pickTile(clientX: number, clientY: number): { x: number; z: number; fx: number; fz: number; h: number } | null;
  pickEntity(clientX: number, clientY: number): { kind: 'building' | 'decor' | 'note' | 'tree'; id: number } | null;
  setGhost(g: Ghost | null): void;      // building, decor, road run, tree; valid or invalid
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
}
```

## Client

- **Boot**: title screen → create or join → `RoomConnection` → `SimHost.init` (new from seed, or snapshot) → `ready` → Mirror built from the view → Renderer and UI mount → live turns flow to the worker.
- **Mirror** (`state/`): typed-array copies of the layers (patched by `LayerPatch`), entity maps, seats, clock, and a decor spatial hash. Implements `MapReader`. Exposes Preact signals for UI.
- **Registries** (one line per addition): render layers (`render/layers/index.ts`), tools (`input/tools/index.ts`), lens toolbars (`ui/lenses.ts`), panels (`ui/panels/index.ts`), overlays.
- **Optimistic feel**: a placed ghost stays visible until the turn carrying its command arrives (about 100 to 200 ms), then the real piece replaces it; a rejection shows a gentle message at the spot.
- **Settings**: `localStorage` wrapped in try/catch; the game works without it.

## Rendering

- `WebGLRenderer` (WebGL2). One shared kit material (`MeshStandardMaterial`, vertex colors, roughness 0.9) extended with `onBeforeCompile` hooks for season tint, snow and wind sway; an emissive variant for windows and lanterns.
- **Static content** is chunked (16 x 16 tiles): terrain and roads are meshes per chunk; buildings use `BatchedMesh`; decor and trees use `InstancedMesh` per def and level of detail. A dirty chunk rebuilds within 2 frames; at most 2 chunk rebuilds per frame.
- **Picking** is math, not raycasting meshes: march the ray across the heightfield, then use the `occupant` layer and the decor spatial hash.
- **Ghosts**: translucent kit meshes tinted valid or invalid.
- **Overlays** [I1]: data textures sampled by the terrain shader (charm, coverage, flows).
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

- `?debug` in the URL shows a dev overlay: fps, frame ms, sim ms per tick, turn lag, hash, entity counts.
- On desync, both clients save a debug dump (snapshot and recent turns) that can be downloaded from the overlay.
