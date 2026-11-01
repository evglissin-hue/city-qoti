# V1.0: Look contracts

**Iteration**: V1. **Wave**: serial (short). **Branch**: `cycle/v1-0-look-contracts`.
**Depends on**: the V0 branch (`claude/compassionate-dirac-9c0pyz`) merged. **Unblocks**: V1A to V1D. **Runs alongside**: C5B, C5C, C5D, C5F, C5H (they own sim and UI paths; this cycle touches no sim code). **Ports**: client 5200, relay 8810.

## Goal

Every shared piece the four V1 tracks need exists, with baselines that change nothing on screen, so materials (V1A), building detail (V1B), ground and nature (V1C) and the lean renderer (V1D) can run in parallel without editing each other's files: the per-vertex surface id and its table, palette 2.0 for the picked Painted Miniature look (B), the pattern texture array interface, `Era` reserved in content types, render layers marked static or moving, the quality presets with Ultra, a GPU timer in the `?debug` overlay, the file split that gives V1A and V1D separate files, and fixed before and after scenes with a perf script, so every V1 PR reports the same numbers.

## Read

- `CLAUDE.md`, `docs/spec/17-presentation.md` (Visual direction, Palette, Style kit, Post-processing, Quality presets)
- `docs/spec/20-architecture.md`: Rendering, Lean renderer [V1]; `docs/spec/22-quality.md`: Performance budgets
- `docs/spec/18-eras.md`: Data; `docs/spec/31-parallel-development.md`: the V1 ownership table
- The concept viewer `docs/concepts/v0-look/index.html` (`PALHEX.b`, the surface ids `M`, the lean renderer) and the stills `docs/build/screenshots/v0-b-*.jpg`

## You own

`packages/content/src/types.ts` (additive), `packages/art/src/geometry.ts` (the surface channel on `ShapeBuilder`), new `packages/art/src/{surface,patterns}.ts` (interfaces and stubs), `packages/art/src/palette.ts` (palette 2.0 added beside the old tokens), `apps/client/src/render/layers/types.ts` (additive), the split into new `apps/client/src/render/{material,look}.ts`, `apps/client/src/render/quality.ts`, new `apps/client/src/render/gpuTimer.ts`, the stats line of the `?debug` overlay (`apps/client/src/ui/Overlays.tsx`, `RenderStats` in `render/renderer.ts`), `apps/client/src/app/debug.ts` (a town showcase), new `apps/client/e2e/{v1-shots,v1-perf}.mjs`, new `docs/build/v1-wave-notes.md`, a "V1 contracts" section in `20-architecture.md`.

Outside these paths: only small, necessary edits (registry lines, exports), listed in the PR.

## You can rely on

The I3 game on `main` (C5A merged): `ShapeBuilder` with its `glow` channel, `KitBuildOptions.lod` (`'high' | 'low'`), `KeyedBatch` and the buildings layer's 75-tile low detail swap, `ChunkedMeshes`, `scatter.ts` per-chunk instancing, `PostChain`, `DynamicResolution`, the fixtures (`?debug&fixture=hamlet|village|winter|raid`), `window.__qoti.villageShowcase(dense)`, `synthResidents(n)` and `look(x, z, distance, turn, tilt)`.

## Tasks

1. **Surface ids** (`packages/art/src/surface.ts`): an append-only table, ids as in the concept: plain 0, plaster 1, brick 2, stone 3, timber 4, clay tile 5, slate 6, thatch 7, cobble 8, glass 9, grass 10, dirt 11, water 12, leaf 13, zinc 14, awning 15, field 16, flags 17, flowers 18; layer 19 is the low-frequency noise (not a surface). Each row: name, mapping (`facade`: wall UV from world position and the face's horizontal tangent, tops of walls use `top`; `top`: world x and z; `roof`: facade UV always, so tile and slate courses run level), the world size of one pattern tile, strength, and an accent color token (mortar for brick, cream for awning stripes). `ShapeBuilder.surface(id)` sets the id written with the following faces, like `glow(value)`, into a `surface` Uint8 attribute; a geometry without the attribute reads as 0, so every kit looks the same until V1B and V1C set ids.
2. **Palette 2.0** (`palette.ts`): the B tokens from the concept's `PALHEX.b` (ground, plasters and stuccos, bricks, stones, timber, roofs, accents, doors, shutters, shopfronts, awnings, glass, foliage, water) as a `palette2` export beside `palette`, plus the Bright Age pastels; nothing reads them yet. V1A tunes the values and the table in `17-presentation.md`; V1X retires the old tokens.
3. **Pattern array interface** (`packages/art/src/patterns.ts`): `createPatternArray(size = 256): DataArrayTexture` with one layer per surface id plus the noise layer, RGBA8, mipmapped, repeat wrapping; channels: R luminance multiplier (128 means 1), G accent mask, B secondary value (flower hue), A color mask (the flowers layer only). The stub fills every layer flat (R 128, G B A 0), so a material that samples it changes nothing. V1A writes the generators.
4. **Content types**: `Era = 'old' | 'steam' | 'bright'` and `eras?: Era[]` on `BuildingDef`, `DecorDef` and `RoadDef` (absent means every era), as `18-eras.md` (Data) says. No data, no sim state.
5. **Static and moving layers**: `RenderLayer.motion?: 'static' | 'moving'` (absent means static). The renderer gives each layer a root group and tags every object added under it with Three.js layer 1 (static) or 2 (moving), recursively, for example from Object3D's `childadded` event; the camera and lights see both. Mark today's layers: moving are agents, animals, carts, effects, ghosts, notes, overlays, presence and water; the rest are static. List in the wave notes every animation that lives in a static layer (cloud shade on the ground, foliage sway, lantern flicker, fountain water) and propose for each: move it to a moving layer, apply it in the final pass, or pause it while the camera rests.
6. **Presets** (`quality.ts`): `Quality` gains `'ultra'`; `QualityPreset` gains `renderScale`, `msaa` (0 or 4, on the scene target from V1D on), `stillCache`, `stillAo`, `buildingDetail` (full detail distance in tiles), `bloom` and `critters`, with the values in `17-presentation.md` (Quality presets). Until V1D lands, the renderer maps them onto today's behavior (Ultra behaves as High plus Ultra's distances). `?quality=ultra` works, the settings menu offers Ultra, auto-detect never picks it. `env.buildingDetail` carries the distance to the buildings layer in place of its constant.
7. **GPU timer** (`render/gpuTimer.ts`): `EXT_disjoint_timer_query_webgl2` around each drawn frame, a ring of three queries read back when available, results dropped when the GPU reports a disjoint; `RenderStats.gpuMs` (null without the extension) and `RenderStats.mode` (`'moving' | 'still' | 'idle'`, always `'moving'` until V1D) shown in the `?debug` overlay.
8. **File split, no behavior change**: the kit material setup and `addNightGlow` move from `render/renderer.ts` to `render/material.ts` (V1A's), exporting `createWorldMaterial(env)`; the grade shader and the color code of the last passes move from `render/post.ts` to `render/look.ts` (V1A's) as GLSL functions plus their uniforms (`lookUniforms`, `LOOK_GLSL`: grade, vignette, tilt-shift mask, bloom mix, tone mapping), which today's `PostChain` calls. From here on V1D owns `renderer.ts` and the frame graph in `post.ts`, V1A owns what the final pass looks like.
9. **Scenes and scripts**:
   - `window.__qoti.townShowcase()`: a City-scale stress scene in this client's Mirror (never the sim), like `villageShowcase`: about 1,000 buildings in streets of today's kits, 6,000 decor and trees, then `synthResidents(2000)`.
   - `apps/client/e2e/v1-shots.mjs`: fixed cameras at 1440 x 900 with `&clean&fixedres`: the hamlet fixture (default, close, dusk, night), the village of 130 (`fixture=village` plus `villageShowcase(true)`: wide, street, golden hour, night), the town showcase (wide, street, night), the winter fixture (wide). Saves `docs/build/screenshots/v1-<stage>-<scene>-<shot>.png` with `<stage>` from an argument (`before` now, `after` in V1X) and prints draw calls, triangles, frame ms and GPU ms for each.
   - `apps/client/e2e/v1-perf.mjs`: for each preset and scene, a 10 s scripted camera path (pan, orbit, zoom in and out) and a 10 s rest with residents walking; prints average and 95th percentile frame ms and GPU ms, moving and idle, as a Markdown table. Headless Chromium gives draws and triangles only; the owner runs it on both laptops for timings (it also runs from the browser console as `__qoti.perf()`).
10. **Wave notes** (`docs/build/v1-wave-notes.md`): ownership by subpath (from `31-parallel-development.md`), the handshakes below, the static-layer animation decisions (task 5), a stand-ins table, ports (V1A 5201 and 8811, V1B 5202 and 8812, V1C 5203 and 8813, V1D 5204 and 8814, V1X 5205 and 8815), and the before numbers from task 9 on both laptops.

**Handshakes the wave notes must fix**: surface ids (V1B and V1C write them; V1A's material reads them; plain 0 stays valid); the two levels (V1B and V1C build `high` and `low` geometry for every kit; V1D's `lod.ts` decides which shows, from `env.buildingDetail` and the decor and resident distances); the pattern array (V1A creates it once; the ground shader in V1C samples the same texture); the ground AO texture (V1C builds it and tells the renderer which chunks changed; V1D invalidates the still-frame cache); blob shadows (V1C draws them from the agents and carts frames; V1D stops moving layers casting); the final pass (V1D owns the frame graph and passes, V1A owns `look.ts`); cache invalidation (any static layer that changes calls `ctx.invalidate()` with a flag that it was static, so V1D drops the cache).

## Acceptance criteria

- [ ] The game looks exactly as before: `v1-before-*` shots taken from `main` and from this branch match by eye; gallery screenshots unchanged.
- [ ] Unit tests: `ShapeBuilder` writes surface ids and a kit without them reads 0; `createPatternArray()` returns the right size, layer count and flat values; layer tagging puts a moving layer's new objects on Three.js layer 2.
- [ ] `?quality=ultra` and the settings menu work; auto-detect still picks Low or Medium.
- [ ] The `?debug` overlay shows GPU ms in Chrome where the extension exists and `n/a` elsewhere.
- [ ] `v1-shots.mjs before` and `v1-perf.mjs` run; the before table (headless draws and triangles, plus the owner's laptop timings when available) is in the wave notes.
- [ ] Typecheck, lint, unit, e2e, build and bench pass; hashes unchanged (no sim edits).
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

Any change to how the game looks (V1A to V1C), the frame graph, shadow caching, levels of detail and the still-frame cache (V1D), streets that fill their frontage (V2, a sim change).

## Notes

- V1 is the render and art track only: nothing in `packages/sim` changes and every hash stays the same.
- The concept viewer is a single-file prototype with no Mirror, no chunk rebuilds and no on-demand drawing. Port its ideas and numbers, not its code.
- Keep every id append-only (surface ids show up in gallery screenshots and tests).
- Visual quality is the owner's top priority, but this cycle's job is that nothing moves: a perfect no-op is a success.
