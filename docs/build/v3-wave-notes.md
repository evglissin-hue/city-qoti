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
- R2.0's final shapes (`cycle/r2-0-evenings-contracts` at 9847e74, forwarded by the master) are matched in `lots.ts`: `LotView.row` (0 for none), `kind?: 'plot' | 'garden'` (absent reads 'plot'), `corner?: true`, `frontage2?` (a road tile index), `storeys?` (the grown building's, also `BuildingView.storeys`; the sim's field is `Building.storeys`, and `params.storeys` stays the kit param V3B fills). R2.0's stand-in cutter gives every lot row 0 until R2F, so even once R2X lands the joined fallback carries the rows until R2F's cutter does; it goes only then. Only the accessors in `lots.ts` (`LotFields`, `BuildingFields`, `storeysOf`) know these names.
- The regrown village (`?debug&fixture=grown`) is R1X's, grown before R2's lots exist: V3's before. R2X regrows it on its lots; V3X takes its after set on whatever `main` then holds and says which.

## P2 runs beside V3 on some of the same files

P2, a playtest pass on the R1 build (branch `claude/great-maxwell-rlok0k`, brief `docs/build/cycle-p2-playtest.md` there; another of the owner's accounts), touches V3's render and art files. **Do not merge P2 into a V3 branch**: whichever of a V3 PR and P2 reaches `main` second resolves the conflicts. Build on what P2 landed rather than redo it:

- **P2-A** (landed): grown and business kits keep their geometry, roof overhang included, inside their own lot (the kit's footprint: `lot: [w, d]` passed to the shell, eaves and verges clamped; `packages/art/src/lotBounds.test.ts`). V3B's rows and roofs start from this clamp. V3.0's derived anchors assume the same plot (`BODY_INSET` inside the footprint) and are unaffected.
- **P2-E1** (landed): the gable verge and soffit rebuilt (`kits/roofs.ts`, `roofVerge.test.ts`; the far level draws no verge). V3B's storeys and corner roofs keep it.
- **P2-E2** (landed): the orchard belongs to the valley: no lot rectangle, dabbed crowns, a boarded shed with surfaces, a window in the gable (`kits/farms.ts`, `kits/village.ts`, `orchardGreens.test.ts`). V3A's dressing knows this look: no yard or garden pieces that assume an orchard's lot rectangle.
- **P2-F** (to come): chimney smoke as soft wisps, and close-ups and followed residents drawn sharper under the resolution governor (`layers/effects.ts`, `render/resolution.ts`, likely `renderer.ts`). No V3 cycle reworks smoke or the governor; if one must touch either (V3C's chimney haze reads the smoke's count; V3D's scene skip sits in `renderer.ts`), its PR says how it relates to P2-F.

Expected overlap files (P2 against V3): `packages/art/src/kits/{buildings,farms,grown,roofs,village,workshops}.ts` (V3B's), `apps/client/src/render/renderer.ts` (V3D's line, V3X), `render/layers/overlays.ts` and `render/api.ts` (V3X and shared), and from P2-F `render/layers/effects.ts`, `render/resolution.ts`. P2 also bumps `SAVE_VERSION` to 7 in `packages/sim` (as R2.0 does); that is R2's and P2's to settle, not V3's.

## Ownership by file

V3 owns `apps/client/src/render` (but R2D's two render files: the new `render/overlayTown.ts` and the Town overlay's additive entry in `render/layers/overlays.ts`; the carve-outs below), `packages/art` and the one content file `packages/content/src/dressingRules.ts` (a content file owned by a look track for the wave, agreed with R2's master, who does not edit it; not `dressing.ts` beside it, the P1 ladder the sim climbs). Split file by file (a file's test goes with it; a new file belongs to the track that makes it):

| Owner | `apps/client/src/render` | `packages/art/src` | Elsewhere |
|---|---|---|---|
| V3A dressing | `layers/dressing.ts`, `ground.ts` (the ground between: paths, aprons, puddles, gathered leaves; V3C's carve-outs below) | `dressing.ts` (the resolver); new props kits for yards (a new `kits/yard.ts`, or `kits/goods.ts` for stock piles); `kits/props.ts` | `packages/content/src/dressingRules.ts` (the table) |
| V3B streets | `lots.ts`, `layers/buildings.ts` | `kits/rows.ts` and the building kits (`buildings`, `business`, `district`, `details`, `farms`, `grown`, `modules`, `parts`, `roofs`, `services`, `specialized`, `style`, `trades`, `village`, `workplaces`, `workshops`), street furniture in `kits/decor.ts` | |
| V3C long view | new `layers/horizon.ts`, `lighting.ts` (the fog chunk's height term), `layers/{water,sky}.ts` | `palette.ts` (append horizon tokens) | |
| V3D endpaper | `endpaper.ts`, `layers/endpaper.ts`, one line in `renderer.ts` (skip the scene pass on `env.skipScene`) | | `apps/client/src/worker/endpaper.worker.ts` |
| Shared: additive only, listed in the PR | `env.ts`, `quality.ts`, `kitGeometry.ts`, `api.ts`; `layers/{index,types}.ts` | `anchors.ts`, `kits/types.ts`, `kits/index.ts` (registry lines), `index.ts` (exports), `geometry.ts`, `shapes.ts` | |
| V3X: no track edits these without V3X's say | `renderer.ts` (but V3D's line), `cache.ts`, `post.ts`, `statics.ts`, `lightMap.ts`, `material.ts`, `scatter.ts`, `layers/lights.ts`, the showcases, and every layer not named above | `materials.ts`, `patterns.ts`, `surface.ts`, `dabs.ts`, `rooms.ts`, `kits/{trees,nature,animals,vehicles,residents}.ts` | `apps/client/src/app/{perf,debug}.ts`, `apps/client/e2e/{v3-shots,v3-perf}.mjs` |
| R2 (not V3) | | | `packages/sim`, `packages/content` (but `dressingRules.ts`), `tools/bench`, `apps/client/src/{ui,input,state}` |

Carve-outs inside another track's file (each one function body, no signature change, named here and listed in the PR):

- **R2D (not V3)**: new `render/overlayTown.ts`; the Town overlay's additive entry in `render/layers/overlays.ts` (the 'town' case beside P2's site markers); gap tags through the notes layer's API, no change to it. No V3 cycle edits `overlayTown.ts`; whichever of V3X and R2X lands second merges `overlays.ts`.
- **Anchor overrides in building kits** are V3B's (V3B owns the kits). V3A writes each override it needs into the table below (kit, anchor, why the derived one is wrong, the place it wants); V3B lands it in the kit's `anchors()` return, or V3A takes that kit's `anchors()` body as a carve-out, with V3B's yes in its PR. A PR note alone is not enough: the row goes here.
- **Street furniture rules** (V3B) go into V3A's `dressingRules.ts`, one row each, named in V3B's PR; V3A keeps them. If street furniture is placed from roads rather than plots, it is V3B's own layer code and no rule.

- **V3C in `ground.ts`** (V3A's): the rim's mist (`qRimMist`'s body and the line that applies it), which the horizon replaces.
- **V3C in `material.ts`** (V3X's) and **`layers/terrain.ts`** (V3X's): one line each if the height term or the horizon needs them (the fog include where the kit material reads it; the rim's skirt hidden behind the bands). Prefer the route in the handshake below, which needs neither.

| Kit | Anchor | Why the derived one is wrong | Wanted | Asked by | Landed by |
|---|---|---|---|---|---|
| (none: V3A fits every piece to the geometry the buildings layer draws, `fitPlacement` in `art/dressing.ts`, so no derived anchor needed overriding) | | | | V3A | |
| (none asked by V3B's PR; the corner shop gives `anchors.sills` on both faces, V3B) | | | | | |

## Handshakes

**Anchors** (`packages/art/src/anchors.ts`, V3.0). `anchorsFor(kit, { size, entrance, params, lot })` returns a building kit's own anchors plus the plot anchors it leaves out, derived from the footprint and entrance: `door` (on the plot's front edge before the entrance tile, facing out), `yard` (the biggest of the ground beside the house and the front strip beside the door), `walls` (the lot's left, back and right sides, facing out), `sills` (under the kit's lit ground-floor windows on the street face), `front` (the strip before the facade), `garden` (the lot behind the house) and `eaves` (against each side wall, facing out). The derived ones take the house to be the plot less `BODY_INSET` (0.22 a side, 0.3 at the back, 0.26 at the front), so they are right for most homes and shops and approximate elsewhere. `lot` is the building's lot in kit-local space, from which side and back gardens come. Cached per kit, size, entrance, params and lot; never the seed. `layers/lights.ts` keeps its own anchor cache and is untouched.

**The rules table** (`content/dressingRules.ts` and `art/dressing.ts`, V3.0; V3A fills it). Some trade looks are buildings, not trades (the fishery is a `BuildingDef`, not a trade in `content/trades.ts`): a rule for one matches by `who.def`. `DressingRule { id, who, anchor, piece, count, seed, chance?, low? }`; `who` matches by building kind, def, trade, least level, place kind, household tier and season; `count` is `base + perUnit * stat`, rounded down, at most `max` and `DRESSING_MAX_PER_RULE` (24). `resolveDressing(subject, rules, anchors, seed)` is pure; the dressing layer builds each building's `DressingSubject` from the Mirror (`dressingSubject`, shared state only) and keeps each building's placements until its subject key, lot or the rules for the preset change. `validateDressingRules` runs on the shipped table in CI: a rule naming an unknown kit, anchor, stat, trade or building, a count out of bounds, a duplicate id or seed fails the build.

**The lot fields** (`render/lots.ts`, V3.0; V3B owns it in the wave). V3B is the only reader of `lotsFor`. V3A asks V3B for a plot's free yard: V3B exports `yardOf(mirror: Mirror, buildingId: EntityId): { x: number; z: number; w: number; d: number } | null` from `lots.ts` (world tiles, the lot less what joined neighbors and a garden lot take; null when the building has no lot), and the dressing layer turns it into kit-local space with `lotBox` and passes it as `anchorsFor`'s `lot`. Until it exists, the dressing layer passes the building's whole lot.

**The light map.** Dressing lamps (a lamp in a yard, a sill lamp, a lit shop front's goods) are discs written by the dressing layer itself (not `layers/lights.ts`) through `env.lightWriter.set('yards', discs)` (a new source name, additive; `lanterns` stays the decor kits'), never real lights; pieces read the map through `patchKitShader`'s lamp option as every kit does. The endpaper map reads nothing from it: it is ink on parchment.

**The endpaper map** (V3.0's interface; V3D draws it). `EndpaperMap { texture, revision, size, cover }` in `env.endpaper`, written only through `EndpaperWriter` from the worker's bitmap, read only by the endpaper layer. Its input (`EndpaperInput`) is built from the Mirror by `endpaperInput`; V3B's rows (rooflines in rows, gardens) and V3C's river (its course and width) feed it as plain arrays through functions in their own files that V3D's builder calls (fields appended to `EndpaperInput`, never renamed). The inks (`EndpaperInks { goods?, footfall? }`, `InkLayer { tiles: Uint16Array, color }`): goods routes from the flows overlay, evening footfall from R2's `map.footfallEve`; **whichever of V3X and R2X lands second wires them**; until then they are unset and draw nothing.

**Haze with height** (V3C). Every material that fogs goes through three's `fog_fragment` chunk (the kit material, the ground, water, foliage, the carpet), so the height term is best added once: V3C patches `ShaderChunk.fog_pars_fragment` and `fog_fragment` from `lighting.ts` at startup (world height and the river's nearness as a varying, the chimneys' winter haze as a uniform in `env`), and every reader takes it with no edit in their files. A material that bypasses the chunk gets a carve-out line, named above.

**The scene skip.** At `cover` 1, once a map has been drawn (`env.endpaper.revision` above 0, so a browser that cannot draw it never blanks the view), the endpaper layer sets `env.skipScene`; the renderer's one-line check is V3D's. V3C's far view yields to it: past 240 tiles the horizon is not drawn because nothing is.

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
| Rows joined from the occupant layer; no gardens, no corners, storeys 1 | `render/lots.ts` | R2's lot fields through the same `lotsFor` | R2X landed on `main` (#56, no V3 edit), and R2X regrew the grown village on R2's lots, where the V3X follow-up retook the street and village shots. V3B draws gardens (`back-garden`), corners (`params.corner`) and storeys (`params.storeys`) from them already, tested on synthetic lots and shown by `__qoti.streetsShowcase()`; on the fallback `rowParams` equals `rowNeighbors` exactly, so the grown village's rows are unchanged |
| Firewood from household size and season; cloth from tier (V3A: as specified; R1X's grown village is all settlers, so it shows no washing) | `layers/dressing.ts` (`dressingSubject`) | the sim's own counts, if R2X adds them | R2X's list |
| No place kinds | `DressingSubject.place` unset | R2's places in the Mirror | R2X |
| The endpaper's inks unset | `EndpaperInks` (V3D draws `goods` in ochre and `footfall` in sage when set, tested with synthetic layers) | the flows overlay's goods routes and R2's `map.footfallEve`, passed as `endpaperInput`'s `inks` from the layer | done in the V3X follow-up (`endpaperInks`; R2X landed first) |
| No street names on the map | `endpaperInput` labels: the valley's name only (V3D draws `place` and `street` labels along their angle with a halo, never upside down) | R2's street names (`state.streets`) | done in the V3X follow-up (`streetLabels`) |
| A plain parchment endpaper, `cover` 0 | `worker/endpaper.worker.ts`, `ENDPAPER_ON` | the inked map, cover from 200 to 240 tiles | done in V3D |
| No rows, gardens or fed river course on the map: plain hipped footprints, the course found in `water` | `endpaperFeeds` (`render/endpaper.ts`) unset | V3B's `endpaperStreets` through `rowsOfRooflines` (rows, storeys) and its gardens; V3C's river course, if it exports one | wired by V3X: `endpaperFeeds` defaults to V3B's rows and gardens and V3C's `riverCourse` (`riverOfMirror`); done |
| The building's whole lot as the yard, reaching half a tile onto free neighbouring ground (`roomyLot`, `YARD_REACH`): grown kits fill their plots almost to the edge | `layers/dressing.ts` | V3B's free yard (`lots.ts`, `yardOf`) | retired as the base by V3X: `dressingYard` is V3B's `yardOf` grown by `YARD_REACH` onto free ground (the reach kept: grown kits fill their plots); done |
| Puddles a day after rain from the client's memory of the last rainy day it saw (the Mirror keeps no weather history): a seat that loads on the morning after rain shows none that day | `render/groundPaths.ts` (the rain memory) | yesterday's weather (or a wetness) in the Mirror | R2X's list |
| R1X's grown village as the before scene | `?debug&fixture=grown` | the village regrown on R2's lots | R2X regrows it |
| The chimneys' winter haze counts hearths (households with a home), not the smoke layer's chimneys | `layers/sky.ts` (`hearthsOf`) | the smoke's own count, if P2-F's smoke exposes one (V3C read nothing from `layers/effects.ts`) | V3X, after P2-F |
| Foam at bridges only: the Mirror has no weirs | `layers/water.ts` (`wfoam`, a road tile over water) | weirs, if a later cycle adds them | no cycle yet |
| The horizon's seed is a hash of `mirror.meta` (the client holds no valley seed) | `layers/horizon.ts` (`horizonSeed`) | the valley's seed, if the Mirror ever carries it (both players already see the same bands) | none needed |

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

Draws and triangles at 11:00, moving (`v3-perf.mjs`, the sim running, 1440 x 900; budgets: Low and Medium 300 draws, High and Ultra 450; triangles Low 1.5 M, Medium 3 M, High 6 M, Ultra 12 M):

| Scene | Low | Medium | High | Ultra |
|---|---|---|---|---|
| street (12 tiles, the doorstep) | 125, 0.45 M | 117, 0.51 M | 146, 1.33 M | 180, 2.23 M |
| village (70 tiles, the Ledger's height) | 137, 0.33 M | 186, 0.59 M | 191, 1.71 M | 364, 4.24 M |
| far120 | 137, 0.34 M | 186, 0.51 M | 266, 2.23 M | **479**, 6.79 M |
| far200 | 171, 0.41 M | 219, 0.61 M | 234, 0.60 M | 364, 1.89 M |
| far240 | 179, 0.41 M | 231, 0.63 M | 239, 0.57 M | 379, 0.89 M |

Medium at 22:00: street 106 and 0.43 M, village 129 and 0.38 M, far120 156 and 0.38 M, far200 170 and 0.37 M, far240 176 and 0.36 M.

What they say for the wave:

- **A far view is the dearest view in draws on every preset** (far240 on Low and Medium, far120 on High and Ultra), and on Low and Medium it grows with distance (219 to 231 on Medium at 200 to 240 against 186 at the Ledger's height). V3C's target, and V3D's skip at 240 takes it to a handful.
- **Ultra's far120 is over its budget already on `main`** (479 of 450 draws; 6.79 M triangles): the stand-out row for V3C and V3X to bring down; nothing in V3.0 caused it (V3.0 adds no draw).
- **Medium's worst moving scene is far240 at 231 draws** (V2X measured 214 on the grown village's default camera): 69 draws of headroom on Medium, less than V2X's table implied; V3A's 12 dressing draws fit, but V3B's and V3C's additions must be paid for by V3C's far cuts.
- In the shots script some golden and night rows read 0.01 to 0.03 M triangles (street golden and night, far120 night): those count the still-frame cache's last draw, not the scene; use the perf table's numbers.

## Decisions V3.0 made

- **Anchors for building kits**: derived by default in `anchors.ts`, with per-kit overrides in the kit bodies (the carve-out table above), not one table keyed by kit id.
- **The rules table** is in `packages/content` (as the brief asks), as `dressingRules.ts`, since `dressing.ts` is taken by the P1 ladder the sim reads. Being content, a change to it changes `SIM_VERSION` (both players need the same build anyway) but no hash.
- **The endpaper's drawing surface**: an `OffscreenCanvas` in a module worker returning an `ImageBitmap`. Where OffscreenCanvas is missing the worker replies with no bitmap and the map stays parchment; a main-thread canvas fallback (Safari, Low only) is V3D's to add if it wants one.
- **The redraw debounce**: 2 s after the town's last change, and only while the map shows (`cover` above 0): no redraw at rest at `cover` 0. The first time the map shows it draws at once (it has never been drawn).
- **The dressing layer's `frame()`** returns true when some building's placements change, not on every input change, so an input change that moves nothing on screen drops no still frame.

## V3C's after numbers and V3X's list (the far view)

V3C's table is `docs/build/screenshots/v3-v3c-perf.md` (same method as the before table). Draws moving at 11:00, before and after:

| Scene | Low | Medium | High | Ultra |
|---|---|---|---|---|
| far120 | 137 to 99 | 186 to 122 | 266 to 182 | 479 to 246 |
| far200 | 171 to 97 | 219 to 93 | 234 to 131 | 364 to 190 |
| far240 | 179 to 97 | 231 to 88 | 239 to 111 | 379 to 258 |

Nearly all of it is the ground and the water joined by block (`ChunkedMeshes` with `group`, V3C): the terrain drew one call per 16-tile chunk (54 of them at far120 on Ultra, 115 at far200), now one per 3 x 3 block; the water one per chunk, now one per 4 x 4. The horizon adds one draw everywhere.

What V3C found the far camera still pays for, in V3X's files (measured per layer on Ultra at far120, `__qoti.renderer()` with one layer root shown at a time; scene pass, then the shadow pass):

- **The shadow pass**: a moving frame that re-renders the sun's shadows draws the casters again over a frustum of up to 140 tiles a side (`shadows.ts`, `MAX_HALF`): trees 17 draws and 1.0 to 1.3 M triangles at full detail, nature 9, decor 7, roads 8, fields 4. Before V3C the 479 on Ultra was frames like these. A far view could cap the frustum (haze covers the far half) or draw trees' far level into it.
- **Ultra's still frame** draws the static scene twice (the still pass and the AO normal pass, GTAOPass): about 300 draws at far120 after V3C (440 before). Joining more layers by block halves twice.
- **Nature** (28 to 33 draws, per chunk), **trees** (17 to 31, per chunk and level) and **decor** (7 to 13) are per-chunk instanced draws that could join by block the way the ground now does.

## V3X: what the integration decided

- **Merge order**: V3A, V3B, V3D, then V3C (V3C was still pushing when the others were ready; the master's order), then V3C's second round (`964397f`, a crest past the rim, woods shared with the rim's paint, the river winding off into the haze), whose far-view code ships (the master's call: V3X's own haze work on the same finding was set aside).
- **The far view's box** (the master's finding on V3C's round two: a gray cliff band along the edge and a pale wedge at the river's notch): the rim, the sim's six-tile ring of mountain above a cliff, is now drawn (not changed) as a slope rising a level a tile from the valley's own edge, with a gorge where the river leaves (`surface.ts`, `rimLevel`); V3C's rim paint reaches down to the slope's foot; the ground painter's cliff test ignores the rim; rock and mountain near the edge take a mossy hillside tint. What still shows from far200 is the valley's rocky upland just inside: sim terrain, so a worldgen follow-up (a valley that slopes out into the hills, for new valleys only).
- **The river** (the owner's note during V3X: "river also doesn't look smooth"): the shoreline followed a 3 x 3 water share eased between tile centers, so a river stepping across the grid bulged once a tile; it is now a 5 x 5 binomial share, linear between centers, shaping the whole bank, with a test that walks a stepping river.
- **Undressed buildings**: on the grown village five herbalists, five forester's lodges and the tavern wore nothing (no trade, not a home: no kind). Any other built building is now `'specialized'`, reached only by rules that name its def; six rules dress the three. The tavern's pieces fit in isolation but find no room in the grown village's tight spot.
- **Kept for later**: the brown lattice of worn lines by the fisheries is in the V3.0 before shots too (not a V3 change); the endpaper map is the same parchment at every hour (a night tint is the owner's call, V3D's note); the inks and street names wait on R2X.

