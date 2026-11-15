# V3 wave notes: how the tracks meet

Read this with your brief. V3.0 fixed the types and the shared files (`docs/spec/20-architecture.md`, "V3 contracts"); these notes fix the handshakes between V3A (the dressing layer and goods you can see), V3B (rows, gardens, corners, floors by tier and street furniture), V3C (the long view) and V3D (the endpaper map), so the pieces fit when V3X merges them. V3 touches no sim code: every hash stays the same. R2 runs beside this wave on other paths. If something here is wrong for you, say so in your PR and work around it; V3X decides.

## Rules for the wave (read first)

- **The look is the point, and the frame budget is the floor.** Visual quality first ("how pretty it is, how cozy it is, and how detailed it is"); Kat's laptop on Medium (P50, measured by GPU frame time) is the limit. Add detail the three cheap ways only (`17-presentation.md`, Visual direction, second pass): small static geometry in instanced draws, shader inputs read from small map-sized textures, work done once at rest. No new full-screen pass on a moving frame. A dressing piece or an endpaper detail that fails on Medium is cut back, not the budget.
- **Contracts are additive, names append-only.** Anchor names (`ANCHOR_NAMES`), rule ids, stat ids (`DRESSING_STATS`), light sources, preset fields, `EndpaperInput` fields: add, never rename, reorder or remove. They show up in tests and shots.
- **Stay in your files.** Ownership is by file (below). Outside it, only small, necessary edits (a registry line, an export, an additive field, the carve-outs named here), listed in your PR.
- **Nothing on screen changes outside your area.** Run `v3-shots.mjs <your stage>` before you open the PR and look at every scene and every hour, not only yours.
- **Every static change goes through `ctx.invalidate()`** (or a static layer's `frame()` returning true). A change that moves no shadow caster is `shadowless`.
- **V3 never changes sim state.** If a rule needs a number the Mirror lacks, it uses the stand-in below and the gap goes on R2X's list; no V3 cycle adds a sim field.
- **Build and review loop** (`31-parallel-development.md`): an Opus lead plans and briefs, Sonnet `executor` agents build, the lead checks quality, runs the dead-end hunt where it applies and looks from the player's chair, one or two rounds before the PR.

## V3 and R2 do not meet on `main` (the master's ruling, 2026-11-15)

The whole R2 wave reaches `main` only through R2X; V3 merges into `main` as it goes (V3.0, then V3X). **Never merge an R2 branch into a V3 branch.** So on `main` there are no lot fields (`Lot.row`, `Lot.kind` `'garden'`, `Lot.corner` with `frontage2`, `params.storeys`), no places, no `map.footfallEve` and no street names, and V3 draws from stand-ins for all of them:

- `render/lots.ts` (`lotsFor(mirror)`) reads R2's lot fields through optional accessors when a lot carries them, and otherwise falls back to rows joined from the occupant layer (`rowNeighbors`, V1B): no gardens, no corners, storeys 1. The fallback stays until R2X lands; it is not deleted in V3.
- **V3B draws gardens, corners and storeys from `lotsFor` and tests them with synthetic lots** (lots carrying the fields, as `render/lots.test.ts` builds them). On `main` they show once R2X lands, with no V3 edit; until then a grown street shows rows from the fallback, as today.
- R2.0 sends the master the fields' exact shapes; the master forwards them, and whoever holds `lots.ts` then (V3.0, or V3B once the wave runs) matches the accessors (the `LotFields` and `BuildingFields` types and `storeysOf` in `lots.ts`). If R2's names differ from V3.0's guesses (`row`, `kind`, `corner`, `frontage2`, `storeys` or `params.storeys`), only those accessors change.
- The regrown village (`?debug&fixture=grown`) is R1X's, grown before R2's lots exist: V3's before. R2X regrows it on its lots; V3X takes its after set on whatever `main` then holds and says which.

## Ownership by file

V3 owns `apps/client/src/render` (but what R2 needs for its overlay, which is R2D's in `ui/`), `packages/art` and the one content file `packages/content/src/dressingRules.ts` (a content file owned by a look track for the wave, agreed with R2's master, who does not edit it; not `dressing.ts` beside it, the P1 ladder the sim climbs). Split file by file (a file's test goes with it; a new file belongs to the track that makes it):

| Owner | `apps/client/src/render` | `packages/art/src` | Elsewhere |
|---|---|---|---|
| V3A dressing | `layers/dressing.ts`, `layers/lights.ts` (the `yards` source only, below) | `dressing.ts` (the resolver); new props kits for yards (a new `kits/yard.ts`, or `kits/goods.ts` for stock piles); `kits/props.ts` | `packages/content/src/dressingRules.ts` (the table) |
| V3B streets | `lots.ts`, `layers/buildings.ts` | `kits/rows.ts` and the building kits (`buildings`, `business`, `district`, `details`, `farms`, `grown`, `modules`, `parts`, `roofs`, `services`, `specialized`, `style`, `trades`, `village`, `workplaces`, `workshops`), street furniture in `kits/decor.ts` | |
| V3C long view | new `layers/horizon.ts`, `lighting.ts` (the fog chunk's height term), `layers/{water,sky}.ts` | `palette.ts` (append horizon tokens) | |
| V3D endpaper | `endpaper.ts`, `layers/endpaper.ts`, one line in `renderer.ts` (skip the scene pass on `env.skipScene`) | | `apps/client/src/worker/endpaper.worker.ts` |
| Shared: additive only, listed in the PR | `env.ts`, `quality.ts`, `kitGeometry.ts`, `api.ts`; `layers/{index,types}.ts` | `anchors.ts`, `kits/types.ts`, `kits/index.ts` (registry lines), `index.ts` (exports), `geometry.ts`, `shapes.ts` | |
| V3X: no track edits these without V3X's say | `renderer.ts` (but V3D's line), `cache.ts`, `post.ts`, `statics.ts`, `lightMap.ts`, `material.ts`, `ground.ts`, `scatter.ts`, the showcases, and every layer not named above | `materials.ts`, `patterns.ts`, `surface.ts`, `dabs.ts`, `rooms.ts`, `kits/{trees,nature,animals,vehicles,residents}.ts` | `apps/client/src/app/{perf,debug}.ts`, `apps/client/e2e/{v3-shots,v3-perf}.mjs` |
| R2 (not V3) | | | `packages/sim`, `packages/content` (but `dressingRules.ts`), `tools/bench`, `apps/client/src/{ui,input,state}` |

Carve-outs inside another track's file (each one function body, no signature change, named here and listed in the PR):

- **Anchor overrides in building kits** are V3B's (V3B owns the kits). V3A writes each override it needs into the table below (kit, anchor, why the derived one is wrong, the place it wants); V3B lands it in the kit's `anchors()` return, or V3A takes that kit's `anchors()` body as a carve-out, with V3B's yes in its PR. A PR note alone is not enough: the row goes here.
- **Street furniture rules** (V3B) go into V3A's `dressingRules.ts`, one row each, named in V3B's PR; V3A keeps them. If street furniture is placed from roads rather than plots, it is V3B's own layer code and no rule.

| Kit | Anchor | Why the derived one is wrong | Wanted | Asked by | Landed by |
|---|---|---|---|---|---|
| (none yet) | | | | | |

## Handshakes

**Anchors** (`packages/art/src/anchors.ts`, V3.0). `anchorsFor(kit, { size, entrance, params, lot })` returns a building kit's own anchors plus the plot anchors it leaves out, derived from the footprint and entrance: `door` (on the plot's front edge before the entrance tile, facing out), `yard` (the biggest of the ground beside the house and the front strip beside the door), `walls` (the lot's left, back and right sides, facing out), `sills` (under the kit's lit ground-floor windows on the street face), `front` (the strip before the facade), `garden` (the lot behind the house) and `eaves` (against each side wall, facing out). The derived ones take the house to be the plot less `BODY_INSET` (0.22 a side, 0.3 at the back, 0.26 at the front), so they are right for most homes and shops and approximate elsewhere. `lot` is the building's lot in kit-local space, from which side and back gardens come. Cached per kit, size, entrance, params and lot; never the seed. `layers/lights.ts` keeps its own anchor cache and is untouched.

**The rules table** (`content/dressingRules.ts` and `art/dressing.ts`, V3.0; V3A fills it). `DressingRule { id, who, anchor, piece, count, seed, chance?, low? }`; `who` matches by building kind, def, trade, least level, place kind, household tier and season; `count` is `base + perUnit * stat`, rounded down, at most `max` and `DRESSING_MAX_PER_RULE` (24). `resolveDressing(subject, rules, anchors, seed)` is pure; the dressing layer builds each building's `DressingSubject` from the Mirror (`dressingSubject`, shared state only) and keeps each building's placements until its subject key, lot or the rules for the preset change. `validateDressingRules` runs on the shipped table in CI: a rule naming an unknown kit, anchor, stat, trade or building, a count out of bounds, a duplicate id or seed fails the build.

**The lot fields** (`render/lots.ts`, V3.0; V3B owns it in the wave). V3B is the only reader of `lotsFor`. V3A asks V3B for a plot's free yard (a function V3B exports from `lots.ts`, say `yardOf(lot)`, which its rows shrink where houses join) and passes it as `anchorsFor`'s `lot`; until it exists, the dressing layer passes the building's whole lot.

**The light map.** Dressing lamps (a lamp in a yard, a sill lamp, a lit shop front's goods) are discs written by the dressing layer through `env.lightWriter.set('yards', discs)` (a new source name, additive; `lanterns` stays the decor kits'), never real lights; pieces read the map through `patchKitShader`'s lamp option as every kit does. The endpaper map reads nothing from it: it is ink on parchment.

**The endpaper map** (V3.0's interface; V3D draws it). `EndpaperMap { texture, revision, size, cover }` in `env.endpaper`, written only through `EndpaperWriter` from the worker's bitmap, read only by the endpaper layer. Its input (`EndpaperInput`) is built from the Mirror by `endpaperInput`; V3B's rows (rooflines in rows, gardens) and V3C's river (its course and width) feed it as plain arrays through functions in their own files that V3D's builder calls (fields appended to `EndpaperInput`, never renamed). The inks (`EndpaperInks { goods?, footfall? }`, `InkLayer { tiles: Uint16Array, color }`): goods routes from the flows overlay, evening footfall from R2's `map.footfallEve`; **whichever of V3X and R2X lands second wires them**; until then they are unset and draw nothing.

**The scene skip.** At `cover` 1 the endpaper layer sets `env.skipScene`; the renderer's one-line check is V3D's. V3C's far view yields to it: past 240 tiles the horizon is not drawn because nothing is.

## Static-layer events

| Event | How often | How |
|---|---|---|
| Dressing placements change | a building's subject changes (a trade, a level, a household's size or tier, a birth, a store's fill, the season), a building comes or goes, a lot changes, the preset's dressing level changes | the dressing layer (static, `shadowless`) re-resolves only the buildings whose key changed and returns true from `frame()` when some placements differ. With the shipped empty table it does no work and never returns true. Pieces taller than a tile that should cast are V3A's call (then the layer is not shadowless, or splits a casting family into a second layer) |
| Yard lamps | as placements, and the lamplighter's hours | `env.lightWriter.set('yards', ...)`; `drawLightMap` redraws once that frame (no shadow render) |
| Rows, gardens, corners, storeys | a building or lot changes | the buildings layer's rebuild, as today (`change.buildings`, `occupant`, `village` for lots) |
| The endpaper map | the town changed (`townChanged`: buildings, lots, height, water, roads, trees, fields), then 2 s quiet, and only while the map shows | the writer asks the worker for one drawing; the finished bitmap bumps `env.endpaper.revision` and the layer (static, `shadowless`) returns true from `frame()`. Never drawn on the main thread, never per frame |
| The horizon | once, from the valley's seed | built at init; a static layer that never changes |
| Haze with height | the fog terms follow the hour and the weather | uniforms only, as `env.fog` today; no rebuild |

## What the sim exposes, read-only (V3.0's audit of the Mirror on `main`)

The dressing reads these through `dressingSubject` (`layers/dressing.ts`), each listed in `DRESSING_STATS` with its source. A gap is never a V3 sim edit: the rule uses the stand-in and the gap goes to R2X's list.

| Stat or field | Status | Where the client reads it, or the stand-in |
|---|---|---|
| A household's firewood | gap | stand-in: the household's members, doubled in autumn and winter. R2X: a household's firewood on hand in `HouseholdView` |
| A household's cloth | gap | stand-in: the household's tier above settler (0 to 3). R2X: cloth or clothing on hand in `HouseholdView` |
| A birth | read | children of the home's household with `ResidentView.bornDay` in the last 28 days |
| A household's size and tier | read | `HouseholdView.members`, `HouseholdView.tier` (the household whose `homeId` is the building) |
| A business's trade and level | read | `BuildingView.trade`, `BuildingView.level` (R1) |
| A store's fill | read | `rt.store` over `BuildingDef.storage`, as a percent |
| A business's goods waiting | read | `rt.output` |
| Hands at work | read | `rt.workers` |
| A place's kind | gap | R2's places are not on `main`: `DressingSubject.place` is unset and a rule with `who.place` matches nothing until R2X |
| The season | read | the clock's season |

Nothing a rule reads is private to one seat: every stat is `scope: 'shared'`, and the subject builder never reads a seat's lens, cursor, notes or anything one seat set alone.

## Stand-ins (every track fills its row before its PR)

| Stand-in | Where | Replaced by | When |
|---|---|---|---|
| Rows joined from the occupant layer; no gardens, no corners, storeys 1 | `render/lots.ts` | R2's lot fields through the same `lotsFor` | R2X lands on `main` (no V3 edit) |
| Firewood from household size and season; cloth from tier | `layers/dressing.ts` (`dressingSubject`) | the sim's own counts, if R2X adds them | R2X's list |
| No place kinds | `DressingSubject.place` unset | R2's places in the Mirror | R2X |
| The endpaper's inks unset | `EndpaperInks` | the flows overlay's goods routes and R2's `map.footfallEve` | whichever of V3X and R2X lands second |
| No street names on the map | `endpaperInput` labels: the valley's name only | R2's street names (`state.streets`) | R2X |
| A plain parchment endpaper, `cover` 0 | `worker/endpaper.worker.ts`, `ENDPAPER_ON` | the inked map, cover from 200 to 240 tiles | V3D |
| The building's whole lot as the yard | `layers/dressing.ts` | V3B's free yard (`lots.ts`) | V3B, wired in V3X if V3A lands first |
| R1X's grown village as the before scene | `?debug&fixture=grown` | the village regrown on R2's lots | R2X regrows it |

## Ports

Each track runs its dev server and relay on its own ports, so two tracks in one container do not collide (`QOTI_CLIENT_PORT` and the relay's port, as the shots and perf scripts read them):

| Cycle | Client | Relay |
|---|---|---|
| V3.0 | 5230 | 8840 |
| V3A | 5231 | 8841 |
| V3B | 5232 | 8842 |
| V3C | 5233 | 8843 |
| V3D | 5234 | 8844 |
| V3X | 5235 | 8845 |

## The scenes and scripts

- `apps/client/e2e/v3-shots.mjs <stage> [scene ...]`: the grown village (`?debug&fixture=grown`, summer, clear) as `street` (the doorstep camera: 12 tiles, the play camera's nearest, looking at a high-street door), `village` (the Ledger's height: 70 tiles, the default camera) and `far120`, `far200`, `far240` (the far view), each by day (11:00), golden hour (18:00) and night (22:20); saves `docs/build/screenshots/v3-<stage>-<scene>-<shot>.png` and prints draws, triangles and frame times.
- `apps/client/e2e/v3-perf.mjs`: `v2-perf.mjs` plus those scenes, per preset, moving and idle, with the Hour column (`QOTI_HOUR`).
- `__qoti.grownInfo().door`: the doorstep camera's door (a high-street business's entrance and the yaw that faces it).

## Before numbers

Taken on V3.0's branch before any V3 look change (the branch is a no-op on screen, so its tip shows the same). The shots are `docs/build/screenshots/v3-before-*.png`; the perf tables are in `docs/build/screenshots/v3-before-perf.md`, in the build container's software renderer (draws and triangles are real; milliseconds are ratios at best).

(Filled in by V3.0 below once the runs finish.)

## Decisions V3.0 made

- **Anchors for building kits**: derived by default in `anchors.ts`, with per-kit overrides in the kit bodies (the carve-out table above), not one table keyed by kit id.
- **The rules table** is in `packages/content` (as the brief asks), as `dressingRules.ts`, since `dressing.ts` is taken by the P1 ladder the sim reads. Being content, a change to it changes `SIM_VERSION` (both players need the same build anyway) but no hash.
- **The endpaper's drawing surface**: an `OffscreenCanvas` in a module worker returning an `ImageBitmap`. Where OffscreenCanvas is missing the worker replies with no bitmap and the map stays parchment; a main-thread canvas fallback (Safari, Low only) is V3D's to add if it wants one.
- **The redraw debounce**: 2 s after the town's last change, and only while the map shows (`cover` above 0): no redraw at rest at `cover` 0. The first time the map shows it draws at once (it has never been drawn).
- **The dressing layer's `frame()`** returns true when some building's placements change, not on every input change, so an input change that moves nothing on screen drops no still frame.
