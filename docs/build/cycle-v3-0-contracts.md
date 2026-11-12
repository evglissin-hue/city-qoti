# V3.0: Yards and long view contracts

**Iteration**: V3 Yards, streets and the long view. **Wave**: serial. **Branch**: `cycle/v3-0-contracts`, from `main` after V2X, R1X and R2.0 have merged.
**Depends on**: V2X (the light map, surfaces, dabs and the measured headroom), R1X (businesses, trades and levels on every building) and R2.0 (the lot fields). **Unblocks**: V3A, V3B, V3C, V3D. **Runs alongside**: R2A to R2F, which own sim, content (but the one file named below), bench and UI paths. **Ports**: client 5230, relay 8840.

## Goal

Every shared piece the four V3 tracks need exists, with stubs that change nothing on screen, so the dressing layer and goods you can see (V3A), rows, gardens, corners and floors by tier (V3B), the long view (V3C) and the endpaper map (V3D) run in parallel without editing each other's files. The kits offer anchors, the dressing rules are a data table with its resolver, the endpaper map has a texture, a writer and a redraw event, and the scripts can take V3's before set on the regrown village. A perfect no-op on screen plus tests that fail on a bad rule is a success.

## Read

- `CLAUDE.md`
- `docs/spec/17-presentation.md`: Visual direction, second pass (items 4 and 5), Quality presets, The redesign's interface (one map, two inks)
- `docs/spec/30-roadmap.md`: The redesign (Order of work), V3, R2 (R2.0 and R2F)
- `docs/spec/20-architecture.md`: Redesign outline (R2 lots, V3), V2 contracts and its As built notes
- `docs/build/i4-visual-planning-notes.md` (V3B's notes: rows, gardens, corners, storeys, street furniture)
- `docs/build/v2-wave-notes.md` (the shape of these wave notes), `docs/build/r1-wave-notes.md` (R1E's kit files and what the carve-outs taught)
- `docs/spec/19-evenings.md` (places, footfall, street names) and `docs/spec/13-ledger.md` (trades, levels) only where they name what V3 dresses

## You own

`packages/art/src/anchors.ts` (new), `packages/art/src/kits/types.ts` (the additive anchor fields), `packages/content/src/dressing.ts` (new: the rule types and an empty table, plus its registry line), `packages/art/src/dressing.ts` (new: the resolver, a pure function), `apps/client/src/render/{lots,endpaper}.ts` (new), `apps/client/src/worker/endpaper.worker.ts` (new), `render/layers/{dressing,endpaper}.ts` (new stubs, registry lines), `render/env.ts` and `quality.ts` (additive), `apps/client/src/app/debug.ts` (scenes), new `apps/client/e2e/{v3-shots,v3-perf}.mjs`, new `docs/build/v3-wave-notes.md`, the briefs `docs/build/cycle-v3{a,b,c,d,x}-*.md`, a "V3 contracts" section in `docs/spec/20-architecture.md`, and the V3 rows in `docs/spec/22-quality.md` (the headroom table's V3 columns).

Outside these paths: only small, necessary edits (registry lines, exports), listed in the PR. Never `packages/sim` or `tools/bench` (R2 owns them), and never `packages/content` beyond `dressing.ts`.

## You can rely on

- **V2 as merged** (`20-architecture.md`, V2 contracts and As built): `env.lightMap`, `env.lightWriter` and its sources, `RenderLayer.shadowless`, the static-layer events, surfaces 20 to 24, the dab kit and the meadow carpet, `v2-shots.mjs` and `v2-perf.mjs`, Measure this laptop.
- **R1's views** (names as R1X merged them; check the Mirror): a building's trade, level and keeper on every building, trade looks, the Mirror's residents for family names.
- **R2.0's lot fields**: `Lot.row` (an id shared by lots cut from one run), `Lot.kind` (`'garden'` for the tiles inside a block), `Lot.corner` with a second frontage tile, and `params.storeys` (chosen by the sim from tier and row). R2.0 also fixes how the Mirror carries them; V3.0 reads that and nothing else of R2's.
- V1B's `kits/rows.ts` and the buildings layer's `rowNeighbors` (rows joined by the occupant layer), which work with no sim change and are the stand-in for the lot fields.

## What V2 left you

- **The light map is a reader as well as a lamp.** Dressing writes to it through `env.lightWriter` under its own source, `yards` (a new source name is additive; `lanterns` stays the decor kits'): a lamp in a yard or a window box lamp is a disc (`LightDisc { x, z, radius, color, intensity }`), never a real light. Pieces read it through `patchKitShader`'s lamp option as every kit does. The endpaper map reads nothing from it: it is ink on parchment.
- **The three cheap ways to add detail**, and only these: small static geometry in instanced draws, shader inputs read from small map-sized textures, and work done once at rest. No new full-screen pass on a moving frame. The dressing layer is one instanced draw per piece family; the endpaper is drawn off the main thread and shown on one quad.
- **Static-layer events.** Every static change goes through `ctx.invalidate()` or a static layer's `frame()` returning true. A layer whose change moves no shadow caster (a washing line's cloth, a lit sill lamp) is `shadowless`, so it costs no shadow render. Dressing is shadowless except pieces taller than a tile, which are V3A's call.
- **The carve-out lesson.** V2B laid dabs and V2C laid far levels inside R1E's kit bodies, and it worked because each carve-out was one function body with no signature change, named in the wave notes and listed in the PR. V3 repeats it: anchors for the kits are mostly derived (below), so a kit body gets an anchor override only where the footprint's default is wrong, and each override is a carve-out in the wave notes. Do not rely on a PR note alone.
- **Measured headroom per preset (V2X)**. V3's budgets sit inside this, on both laptops:

| Preset | Draws (moving, worst scene) | Triangles (moving, worst scene) | Night GPU ms, Kat's laptop |
|---|---|---|---|
| Low | 133 of 300 (the village of 130) | 0.36 M of 1.5 M (the grown village) | TBD (the laptops' after tables) |
| Medium | 214 of 300 (the grown village) | 0.80 M of 3 M (the grown village) | TBD |
| High | 225 of 450 (the village of 130) | 4.03 M of 6 M (the town) | TBD |
| Ultra | 374 of 450 (the grown village) | 5.41 M of 12 M (the grown village) | TBD |

Draws and triangles are V2X's final software run (`v2-perf.mjs`, sim running, `docs/spec/22-quality.md`, As built V2X): real counts, so they hold on the laptops. The GPU column waits on Measure this laptop.

## Tasks

1. **Anchors** (`kits/types.ts`, `anchors.ts`). Extend `KitAnchors` additively with `door` (doorstep point and its facing), `yard` (a rectangle in front or beside: center, size, facing), `walls` (runs along the plot's sides: start, end, facing), `sills` (window sills, points), `front` (a shop front: a rectangle under the awning line), `garden` (a rectangle at the back) and `eaves` (points under the eaves, for a woodpile). Same kit-local space as `build`; all optional. `anchorsFor(kit, opts)` in `anchors.ts` returns the kit's own anchors where it gives them and otherwise derives the rest from `footprint.size` and `entrance` (door at the entrance, yard in front, walls along the sides), so every building kit has them with no kit edit. Anchors are cached per kit and params like `lights.ts` does with `anchorsForBuilding`. A test per registered building kit: `door` exists and lies on the plot's edge, `yard` is inside the lot and off the footprint.
2. **The dressing rules as data** (`content/dressing.ts`, `art/dressing.ts`). `DressingRule { id, who, anchor, piece, count, seed }`: `who` matches by building kind (`home`, `business`, `specialized`), `trade`, minimum `level`, a place kind, a household tier and a season; `anchor` is an anchor name; `piece` names a props kit with params; `count` is a base plus a scaled term (`{ base, stat, perUnit, max }`) so a woodpile is as big as its firewood and a granary's sacks as its fill. `resolveDressing(view, rules, anchors, seed): Placement[]` is pure and deterministic from shared state (both players see the same), keyed by building id so an unchanged building returns the same list. The table ships empty; V3A fills it. **What the sim exposes, read-only**: V3.0 audits the Mirror for each stat the spec names (a household's firewood and cloth, a birth, a business's trade and level, a store's fill, a place's kind) and lists each in the wave notes as "read" or "gap". A gap is never a sim edit here: the rule uses a stand-in (a household's size and the season for firewood) and the gap goes to R2X's list. Tests: every rule names a registered kit, a known anchor and a stat the Mirror carries or a listed stand-in; counts are bounded by `max`; the resolver gives equal output for equal input; no rule reads anything private to one seat.
3. **The dressing layer's stub** (`layers/dressing.ts`). A static, shadowless layer registered in the layer registry that resolves nothing (the table is empty) and draws nothing, with its budget constants (0.3 M triangles and 12 draws on Medium, `QualityPreset.dressing`: signs and stock piles only on Low, all elsewhere) and a `frame()` that returns true when the resolver's input revision changes.
4. **Lots on screen** (`render/lots.ts`). `lotsFor(mirror)` reads R2.0's lot fields (`row`, `kind`, `corner`, `storeys`) into one shape V3B draws from. Until R2.0's fields exist in the Mirror it falls back to `rowNeighbors` (rows from the occupant layer, no gardens, no corners, storeys 1), so V3.0 can start before R2.0 lands; the stand-in is deleted when it does. A test per field and one for the fallback.
5. **The endpaper map's interface** (`render/endpaper.ts`, `worker/endpaper.worker.ts`, `layers/endpaper.ts`). `EndpaperMap { texture, revision, size, cover }`: one texture (1024 or 2048 square by preset), written only by the worker and read by the endpaper layer; `cover` runs 0 at 200 tiles of camera distance to 1 at 240, and at 1 the renderer skips the scene pass (a flag in `env`, the renderer's one-line check is V3D's). `EndpaperInput` is the compact copy the worker draws from (heights, water, woods, fields, roads by class, rooflines, valley and place and street names), built from the Mirror. **Inks**: `EndpaperInks { goods?: InkLayer; footfall?: InkLayer }` with `InkLayer { tiles: Uint16Array; color }`; unset draws nothing. The goods route ink comes from the flows overlay and the footfall ink from R2's `map.footfallEve`; **whichever of V3X and R2X lands second wires them**, and the stub draws neither. **When it redraws**: only when the town changes (a static-layer event: the static revision), debounced about 2 s after the last change and only while `cover` is above 0 or the camera has rested, in the worker, never on the main thread, in under 150 ms; the finished bitmap bumps `revision` and the layer returns true from `frame()`. The stub draws plain parchment and `cover` stays 0, so nothing changes. A test for `cover`'s ramp and the debounce, using a fake worker.
6. **Scenes, shots and perf** (`debug.ts`, `v3-shots.mjs`, `v3-perf.mjs`). The regrown village (R1X's `?debug&fixture=grown`, regrown on R2.0's lots so it has rows; regrow it again as R2X changes the economy) is V3's before. Shots: a street close-up at the doorstep camera, the village from the Ledger's height, and the far view at 120, 200 and 240 tiles, each by day, golden hour and night, saved as `docs/build/screenshots/v3-<stage>-<scene>-<shot>.png`. `v3-perf.mjs` is `v2-perf.mjs` plus those scenes, per preset, moving and idle, with the Hour column. Take the `v3-before-*` set and the headless numbers.
7. **Wave notes and briefs**. `docs/build/v3-wave-notes.md` (ownership by file with carve-outs, the handshakes below, the static-layer events, a stand-ins table, ports V3A 5231 and 8841, V3B 5232 and 8842, V3C 5233 and 8843, V3D 5234 and 8844, V3X 5235 and 8845, the before numbers) and five briefs, V3A dressing and goods you can see, V3B rows, gardens, corners, floors and street furniture, V3C the long view, V3D the endpaper map, V3X integration, each about two pages, from `_template.md`, with the acceptance lines of `30-roadmap.md` (V3) split among them. V3X also fills the headroom table's laptop columns and writes V4's briefs.
8. **The contracts section** in `20-architecture.md` ("V3 contracts"), and the redesign outline's V3 bullets brought in line (the resolver lives in `art/dressing.ts`; the rules table in `content/dressing.ts`).

**Ownership in the wave** (V3.0 proposes, the wave notes fix): V3A owns `layers/dressing.ts`, `art/dressing.ts`, `content/dressing.ts` (a content file owned by a look track for the wave, agreed with R2's master, who does not edit it) and the props kits it needs. V3B owns `kits/rows.ts`, `render/lots.ts`, `layers/buildings.ts` and the building kits, plus street furniture in `kits/decor.ts`. V3C owns the horizon layer, the fog chunk's height term (`lighting.ts`), `layers/{water,sky}.ts`. V3D owns `endpaper.ts`, its worker and layer, and the one-line scene-pass skip in `renderer.ts`. Shared, additive only: `env.ts`, `quality.ts`, `kitGeometry.ts`, `kits/types.ts`, `anchors.ts`.

**Handshakes the wave notes must fix**: anchors (V3B owns building kits, so building anchor overrides are V3B's; V3A writes override requests into the notes and V3B lands them, or V3A takes the kit body as a carve-out, listed); the rules table (V3A fills it, V3B adds street furniture rows through V3A's file, one row each); the lot fields (V3B is the only reader of `lotsFor`; V3A asks it for a plot's free yard rectangle, which V3B's rows shrink); the light map (dressing lamps go through `lightWriter`, source `yards`); the endpaper's inks (as above) and its input, which V3B's rows and V3C's river both feed as plain arrays; the scene skip (V3D's one line, which V3C's far view yields to).

## Acceptance criteria

- [ ] The game looks exactly as before: `v3-before-*` shots from the start of this branch and from its tip match by eye; gallery screenshots unchanged.
- [ ] Anchors exist for every building kit (a test), derived by default; `KitAnchors` additions are optional and `lights.ts` is untouched in behavior.
- [ ] The resolver tests pass (bounded counts, determinism, every rule resolvable); the table is empty and the dressing layer draws nothing.
- [ ] `lotsFor` reads R2.0's fields, or its fallback does and the stand-in is listed; the endpaper stub shows `cover` 0 and its redraw event is tested with a fake worker.
- [ ] `?debug&fixture=grown` loads on the regrown village; `v3-shots.mjs` and `v3-perf.mjs` run and the before set is committed.
- [ ] The wave notes and the V3A, V3B, V3C, V3D and V3X briefs are written, with the headroom table in place (TBD until V3X).
- [ ] Typecheck, lint, unit, e2e, build and bench pass; hashes unchanged (no sim edits).
- [ ] Definition of done in `docs/spec/22-quality.md`; a line in `CHANGELOG.md`; your row in `docs/build/README.md`.

## Out of scope

Any change to how the game looks (V3A to V3D), every sim, content (but `dressing.ts`) and bench change (R2), the laptops' own timings (V2X's), the wiring of the endpaper's inks beyond the interface.

## Notes

- **Start order.** V3.0 starts after R1X and R2.0. If R2.0's fields are late, start with the stand-ins (task 4's fallback) and finish the contracts section once they land; V3B's brief must not start before they do, or it builds on the stand-in and says so.
- The look is the point and the frame budget is the floor: visual quality first, Kat's laptop on Medium the limit, measured by GPU frame time (P50). A dressing piece or an endpaper detail that fails there is cut back, not the budget.
- V3 never changes sim state. If a rule needs a number the Mirror lacks, write the gap down; do not add a field.
- Keep every index and name append-only: anchor names, rule ids and source names show up in tests, saves of nothing, and shots.
- Run the build and review loop (`31-parallel-development.md`), one or two rounds before the PR. Open the PR into `main`; the V3 wave branches from this branch's tip.

## Decisions left to V3.0

- **(V3.0 decides)** Where anchors for building kits live: derived by default in `anchors.ts` with per-kit overrides in the kit bodies (chosen), or one table in `anchors.ts` keyed by kit id, keeping the kit files untouched.
- **(V3.0 decides)** Whether the rules table is in `packages/content` (chosen, as the brief asks) or `packages/art`; content keeps it as data and lets R2's bench read it, at the price of a content file owned by a look track.
- **(V3.0 decides)** The endpaper's drawing surface: an `OffscreenCanvas` in a worker returning an `ImageBitmap` (chosen, as the spec says), or a canvas on the main thread where OffscreenCanvas is missing (Safari fallback, on Low only).
- **(V3.0 decides)** The redraw debounce (2 s chosen; 0.5 s and 5 s are the options) and whether it also redraws on camera rest at `cover` 0 (no, chosen: only when it will show).
