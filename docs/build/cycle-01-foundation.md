# C1: Foundation

**Iteration**: I0. **Wave**: serial (runs alone, first). **Branch**: `cycle/01-foundation`.
**Depends on**: nothing. **Unblocks**: C2A, C2B, C2C, C2D.

## Goal

A working monorepo where two browser tabs (or two laptops on the same network) share one generated valley through the local dev relay, and can paint paths, place cottages, decor and trees, and see identical results. A solo offline valley works too. Every I0 contract and registry exists, CI is green, and the four wave-2 cycles can start in parallel. Visuals are placeholders: C2B makes them beautiful, C2A makes the valley real, C2C hardens co-op and saves, C2D polishes controls and UI.

## Read

- `CLAUDE.md`
- `docs/spec/20-architecture.md` (all of it: layout, simulation, I0 contracts, client, rendering, content)
- `docs/spec/21-networking-and-saves.md`: Model, Messages, RoomCore, Join and catch-up, Snapshots and backups (first bullet only), Hosting (routes, schema)
- `docs/spec/10-world-and-building.md`: Units, Map layers, Roads, Buildings, Decor, Trees, Placement feedback
- `docs/spec/02-game-overview.md`: Time and calendar
- `docs/spec/16-coop.md`: Time and speed
- `docs/spec/22-quality.md`: Performance budgets, CI, Definition of done
- `docs/spec/31-parallel-development.md`: Contracts policy, Registries, Branches

## You own

Everything (first cycle).

## Tasks

Commit after each numbered step. If you run short of time or context, push the branch, open a **draft** PR, and tick in its description the steps that are done so a follow-up session can continue from there.

0. **Branches.** If `main` does not exist on origin, create it from `claude/eager-hawking-lf4gnu` (it holds the spec) and push it. Create `cycle/01-foundation` from `main`.
1. **Scaffold.** Root `package.json` with npm workspaces (`apps/*`, `packages/*`, `tools/*`) and scripts `dev`, `build`, `test`, `e2e`, `typecheck`, `lint`, `format`, `bench`, `deploy`. `tsconfig.base.json` (strict, ESM, `moduleResolution: bundler`, `@qoti/*` paths). ESLint flat config: in `packages/sim/**` ban `Math.random`, `Date`, `performance`, timers, `Math.sin|cos|tan|asin|acos|atan|atan2|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot|sinh|cosh|tanh`, and the `**` operator; enforce the package dependency rules. Prettier, Vitest workspace, `.gitignore` (include `*.generated.ts`, `.wrangler`, `.devdata`, Playwright output), `.nvmrc` (22), `.editorconfig`, `CHANGELOG.md`.
2. **Content** (`packages/content`): `types.ts` with `BuildingDef`, `DecorDef`, `RoadDef`, `TreeDef`, `Cost`, `PlacementRule`; the I0 content list from `20-architecture.md`; `index.ts` registry; `validate.test.ts`.
3. **Sim** (`packages/sim`):
   - `contracts/` exactly as in `20-architecture.md` (I0 contracts).
   - `constants.ts` with the time constants; `rng/` (sfc32, cyrb128, streams).
   - `map/`: layer allocation, `MapReader` over state, and **worldgen v0**: value-noise heights, one river crossing the map, sand banks, a forest mask with trees, the start area flag, a valley gate with a lane to the start area. Deterministic. C2A replaces it with the full algorithm, so keep it in `map/worldgen.ts` behind `generateValley(seed, settings)`.
   - `rules/`: `canPlaceBuilding`, `canPaintRoad`, `canPlaceDecor`, `canPlantTree` with the reason codes in `10-world-and-building.md` (bridges may wait for C2A).
   - `commands/`: every I0 command with `validate` and `apply` (sandbox: no costs, instant), one file per family, registry in `index.ts`. Removing another seat's handmade decor is allowed by the sim; the confirmation is client-side.
   - `systems/`: registry plus a `clock` system (advances the calendar, emits `clock` each in-game hour and on speed changes).
   - `applyTurn` and `effectiveSpeed`; `view/` builds `ViewSnapshot`; events plus `LayerPatch` generation for changed rects.
   - `state/`: `serialize`, `deserialize`, `hashState`, `SAVE_VERSION = 1`, empty migrations registry; a build script that writes `version.generated.ts` (hash of `packages/sim/src` and `packages/content/src`).
   - Tests: each command, each rule, worldgen determinism and basic properties, serialize round trip, a golden script (`test/golden/i0-basic.json`: seed, settings, 2,000 turns of mixed commands) replayed twice to the same hash.
4. **Protocol** (`packages/protocol`): `messages.ts` exactly as in `21-networking-and-saves.md`; `RoomCore` with token checks (SHA-256 hashes), `sys.seatJoined/Left` injection, a turn every `step()`, storing only non-empty turns, `welcome` with snapshot, log and `nextTurn`, `needSnapshot` every 300 turns, snapshot storage and pruning, presence relay with throttling, hash comparison that logs a warning on mismatch (the resync flow is C2C), message size and rate limits; `MemoryStorage`; tests with fake connections.
5. **Dev server** (`tools/dev-server`): Node `ws` server (port 8787) hosting rooms by valley id; `POST /api/valleys` (seed, settings, returns id and two tokens) and the WebSocket route; in-memory storage persisted to `.devdata/` so restarts keep valleys.
6. **Client** (`apps/client`, Vite):
   - `app/`: title screen with New online valley, Join (from the invite link fragment), New solo valley, Continue (recent valleys in localStorage, wrapped in try/catch).
   - `net/`: `RoomConnection`, `OnlineRoom` (WebSocket), `LocalRoom` (RoomCore in the page with a basic IndexedDB storage adapter).
   - `worker/`: `SimHost` and `sim.worker.ts` implementing `ToWorker` and `FromWorker`, hash every 50 turns.
   - `state/`: Mirror (layers patched by `LayerPatch`, entity maps, seats, clock, decor spatial hash) implementing `MapReader`, with Preact signals.
   - `render/` v0: Three.js scene; terrain as per-tile colored quads at their heights (stepped is fine); water tiles; roads as flat strips; buildings as a box plus a gable roof per footprint; decor as small colored primitives; trees as instanced cone and trunk; hemisphere plus directional light tinted by the clock; `RenderApi` implemented (heightfield ray-march picking, translucent ghosts tinted valid or invalid, a presence marker per seat, `focus`); layer registry.
   - `input/` v0: camera controller (mouse, trackpad and keyboard as in `17-presentation.md` Camera); tool registry with inspect, path, lane, building (cottage, house, well), decor (bench, lantern, flower bed), linear decor (fence), tree (oak), erase, note. Ghost validity uses the sim rules on the Mirror.
   - `ui/` v0 (Preact): top bar (clock, speed buttons showing effective speed and "paused by"), bottom toolbar with a Hearth and Ledger lens toggle (Tab), a simple inspector, notes list, invite link dialog, connection status. Panel and lens registries.
   - A `window.__qoti` debug hook (only with `?debug`) exposing mirror counts, last turn and last hash for tests.
7. **Server** (`apps/server`): Cloudflare Worker plus `ValleyRoom` Durable Object wrapping `RoomCore` with SQLite storage; routes from the spec; `wrangler.toml` (Durable Object binding, `new_sqlite_classes` migration, static assets from `apps/client/dist`); `npm run deploy`. It must typecheck and build; deploying is not required in this cycle.
8. **Gallery** (`apps/gallery`): minimal Vite app rendering one placeholder cottage with orbit controls (C2B fills it).
9. **Bench** (`tools/bench`): worldgen time, 10,000 ticks of the golden script (ms per tick), snapshot size; exits non-zero over budget (worldgen 300 ms, I0 tick 1 ms).
10. **End to end** (Playwright): start the dev server and client; context A creates an online valley; context B joins with the invite link; A paints a path and places a cottage; B sees both; B places a bench; A sees it; after 100 turns both hashes are equal; A pauses and B's clock stops. A determinism spec runs the golden script in a browser worker and compares with the Node hash.
11. **CI** (`.github/workflows/ci.yml`): install, typecheck, lint, test, build, e2e (install Chromium), bench.
12. **Docs**: root `README.md` quick start (install, dev, test, two-tab co-op locally, solo); keep the commands list in `CLAUDE.md` accurate; a line in `CHANGELOG.md`; mark C1 done in `docs/build/README.md`.

## Acceptance criteria

- [ ] `npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run e2e && npm run bench` pass locally and in CI.
- [ ] Two tabs share a valley through the dev server: placements show in both within 250 ms; hashes stay equal through 5 minutes of mixed actions (manual) and through the e2e script.
- [ ] Reloading an online tab catches up to the same hash.
- [ ] A solo valley works with the dev server stopped and survives a reload.
- [ ] The golden script gives the same hash twice in Node and once in the browser.
- [ ] Bench: worldgen under 300 ms, I0 tick under 1 ms.
- [ ] Every I0 contract exists as specified and is exported; every registry in `31-parallel-development.md` exists with at least one entry.
- [ ] Lint fails on `Math.random`, `Math.sin` and `**` inside `packages/sim` (prove it with a lint fixture test).
- [ ] `apps/server` typechecks and builds.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

Pretty visuals (C2B). The full worldgen, bridges, parcels and tree growth (C2A). Backups, export and import, the desync resync flow, version changes, reconnects and deploy automation (C2C). Pings, emotes, guardrail dialogs, title screen polish and settings (C2D).

## Notes

- Keep files small and named by responsibility; wave-2 cycles will extend them in parallel.
- Registries sorted alphabetically, one line per entry.
- Prefer boring, explicit code over clever abstractions. Comments explain why, not what.
- Never use em dashes, in code comments, UI text, docs or commit messages.
