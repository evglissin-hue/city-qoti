# V1D: Lean renderer

**Iteration**: V1. **Wave**: parallel. **Branch**: `cycle/v1d-lean-renderer`.
**Depends on**: V1.0 merged. **Runs alongside**: V1A, V1B, V1C (and the I3 cycles that own sim and UI paths). **Ports**: client 5204, relay 8814.

## Goal

The game draws on the lean renderer (`20-architecture.md`, Lean renderer [V1]): one scene pass, a quarter resolution blur chain and one final pass instead of a stack of full-resolution passes; sun shadows rendered only when they change; levels of detail chosen per preset; a still-frame cache that draws only the moving layers while the camera rests; dynamic resolution that judges moving frames and stops flapping; and the Ultra preset. The budgets in `docs/spec/22-quality.md` hold on both laptops, moving and idle, and the owner's 20 to 25 fps on High becomes a smooth 60.

## Read

- `CLAUDE.md`, `docs/build/v1-wave-notes.md`
- `docs/spec/20-architecture.md`: Rendering, Lean renderer [V1], V1 contracts
- `docs/spec/17-presentation.md`: Post-processing, Quality presets; `docs/spec/22-quality.md`: Performance budgets
- The concept viewer (`docs/concepts/v0-look/index.html`: the lean frame graph, shadow caching, the still-frame cache with its depth restore, dynamic resolution) and its first engine (`docs/concepts/v0-look/v1-engine.html`) for comparison

## You own

`apps/client/src/render/{renderer,post,quality,resolution,chunks,batch,gpuTimer}.ts`, new `apps/client/src/render/{cache,shadows,lod}.ts`, `apps/client/e2e/v1-perf.mjs`.

## You can rely on

V1.0: layers tagged static (Three.js layer 1) and moving (layer 2), the presets with Ultra, `env.buildingDetail`, the GPU timer and `RenderStats.mode`, `look.ts` (V1A's final pass functions and `lookUniforms`), `material.ts`, `v1-shots.mjs`, `v1-perf.mjs` and the before numbers. V1B and V1C build `high` and `low` levels for every kit (stand-in until they land: today's low detail versions); V1C draws blob shadows and reports ground AO changes.

## Tasks

1. **Frame graph** (`post.ts`): a HalfFloat scene target with MSAA 4 from Medium up (none on Low); a quarter resolution chain (downsample, horizontal and vertical Gaussian, five fetches each with linear sampling); one final full-screen pass to the canvas that calls `look.ts` (tilt-shift mix of the sharp and blurred images, bloom from the blurred image's bright part at golden hour and night, grade, vignette, tone mapping, sRGB, dither). Remove `EffectComposer`, `UnrealBloomPass`, both tilt-shift passes, `OutputPass` and the separate grade pass; create the context without `antialias`.
2. **Cached sun shadows** (`shadows.ts`): `shadowMap.autoUpdate = false`; re-render when the sun direction moved more than about half a degree (about every in-game quarter hour), static content changed inside the frustum, the quality changed, or the view target left the frustum's inner half; re-center the frustum with that hysteresis and snap it to whole shadow texels. Moving layers never cast (V1C's blob shadows stand in). A counter of shadow renders in the `?debug` overlay.
3. **Levels of detail** (`lod.ts`): per building, decor and tree instance, `high` within the preset's distance and `low` beyond, with about 10% hysteresis and a cap on swaps per frame; replaces the buildings layer's fixed 75 tiles with `env.buildingDetail`.
4. **Still-frame cache** (`cache.ts`): after about 200 ms without camera motion, draw the static layers once into a color target with a depth texture (on Ultra at the device pixel ratio and with screen-space AO, for example three's `GTAOPass` run once per still); then each frame restore it with one full-screen pass that writes color and depth (`gl_FragDepth`, depth function always), draw the moving layers on top, run the blur chain and the final pass. Invalidate on a camera move, a sun or light change, a shadow render, a quality or size change, and any static layer's change (chunk rebuild, building key or level swap, ground AO rebuild, decor). Apply the wave notes' decisions on animation inside static layers (cloud shade can move into the final pass from depth). `RenderStats.mode` says moving, still or idle.
5. **Dynamic resolution** (`resolution.ts`): judge moving frames only; steps 1, 0.85, 0.72, 0.6 and 0.5; step up after a few seconds of headroom; after a failed step-up wait twice as long before the next try (reset on a quality change); the still-frame cache draws at the preset's own scale, not the moving step.
6. **Presets**: wire every field of V1.0's presets (render scale, MSAA, shadow size, still cache, still AO, building detail, bloom) into the renderer; Ultra is never auto-detected. Decide Medium's pixel ratio cap on the Retina laptop (cap 1 against cap 2 with dynamic resolution, and whether still frames may draw at the device ratio on Medium and High) and record the choice in `17-presentation.md`.
7. **Numbers**: run `v1-perf.mjs` (moving and idle, every preset, the hamlet, the village of 130 and the 1,000-building town with 2,000 residents) on both laptops; put the table in the PR and in `22-quality.md` (As built). Keep `?engine=classic` (the old chain) until V1X, so both engines can be measured on the same build.

## Acceptance criteria

- [ ] Moving, on the weaker laptop at 1080p on Medium, the 1,000-building town with 2,000 residents: 60 fps, GPU frame time at most 12 ms, at most 300 draw calls and 3 M triangles; main thread at most 12 ms.
- [ ] Idle (camera at rest, residents walking), same scene and laptop on Medium: GPU frame time at most 4 ms.
- [ ] High holds 60 fps moving on the stronger laptop with the same scene; Ultra holds at least 30 moving and 60 idle.
- [ ] While the camera rests, shadows render at most once per in-game quarter hour (overlay counter) and never visibly pop when they do.
- [ ] A cached still frame and a live frame at the same settings look the same (side by side in the PR); only Ultra's still frames add AO.
- [ ] Memory within budget on the Retina laptop on High; `&fixedres` still fixes the scale for screenshots; every e2e spec and screenshot script passes; hashes unchanged.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

What the final pass looks like (V1A owns `look.ts`), materials, buildings, ground and trees (V1A to V1C), the later moonshots below.

## Notes

- Suggested order: the frame graph first (the biggest saving: full-screen passes eat the bandwidth of integrated graphics), then shadow caching, then the still-frame cache, then levels of detail and dynamic resolution. Measure after each step and keep the numbers in the PR.
- Drawing stays on demand: with nothing moving and the camera at rest, draw nothing at all, as today.
- On the depth restore: the restored depth must match what the moving layers' depth test expects (same projection, same target size); test with residents walking behind buildings and under trees.
- The concept proves the approach in one file with a fixed town; the game adds chunk rebuilds, batched buildings, overlays and ghosts. Port the design, not the code.
- Later moonshots, listed here so nobody starts them by accident: rendering in a worker with `OffscreenCanvas`, a WebGPU backend with GPU culling and indirect draws, temporal upscaling.

## As built

Pushed straight to `main` at the owner's request (no PR). Built and measured in a container without a GPU (Chromium in SwiftShader), so draw calls, triangles, frame modes and shadow counts are real, and every millisecond is the CPU doing the GPU's work: ratios at best. The laptop rows of every acceptance criterion are still to be measured (below).

- **Frame graph** (`post.ts`): as the brief asks, with two choices of its own. The scene targets are R11F_G11F_B10F where the browser can render to it (half RGBA16F's bytes per sample, and integrated graphics are bound by bandwidth; the final image needs no alpha), else RGBA16F (`?debug&scenefmt=half`). Still and idle frames draw into a target at the still ratio and moving frames into one at the moving ratio times the dynamic resolution step (one target when they match); the canvas is at the still ratio and the final pass scales a moving frame up. The blur chain is skipped when there is no tilt-shift and no bloom (close up by day). The tilt-shift mix is `smoothstep(0, 1, lookTiltMask * tiltFor * 0.85)`; the dither is a stand-in in `post.ts` until V1A writes `lookDither`. The canvas has no antialiasing, depth or stencil.
- **One render a frame**: three resolves a multisampled target at the end of every `render()` and invalidates its samples, so an idle frame is one `render()` of the moving layers with the restore as a full-screen mesh in the scene, drawn first (as in the concept viewer). Each pass hides the layer roots it does not draw.
- **Still-frame cache** (`cache.ts`): after 200 ms at rest the still is drawn once even when nothing moves (so it has the preset's own sharpness and, on Ultra, AO), kept as color and depth, and idle frames restore it. The key is the targets, the preset, the view, `staticRevision`, the light and the shadow map's render count. Ultra's AO is three's GTAOPass with the concept's values, loaded on demand (its own 7.8 kB chunk). `env.staticTime` stops at rest.
- **Cached shadows** (`shadows.ts`): the brief's triggers, with the frustum fitted at 20% slack, re-centered when the view target leaves its inner half, refitted when the view needs more than it holds or less than 60% of it, and snapped to whole texels. Static changes re-render it at once with the camera at rest (any preset) and 300 ms after the change while it moves. **Moving layers never cast**, from V1D itself: a caster that moves would leave its shadow on the cached ground. Residents never cast (they have had blob shadows since C3D); animals, carts and the windmill's sails have no sun shadow until V1C's blob layer (wave notes, Blob shadows).
- **Levels** (`lod.ts`): a 10% band around each distance, building swaps queued nearest first at 24 or 4 ms a frame (all at once on the first look after a load), new buildings born at the level their distance asks for. Decor got the culling and levels trees had (`InstanceField`): per chunk frustum culling, its far level beyond the decor distance, and small props (radius under 0.9 tiles, nothing lit) shrinking away there. Trees keep scatter.ts's own swap (V1C's file). `ChunkedMeshes` reports a change only when a mesh changed, so a streaming valley stops dropping the cache for chunks that stay empty.
- **Dynamic resolution**: moving frames only, 30-frame windows, 2.5 s of headroom to step up, a step-up that turns slow within 3 s doubles the next wait (to 40 s), reset on a quality change.
- **Presets**: every field read, plus `stillScale` (the ratio at rest). Medium on a Retina screen moves at 1 and rests at 2; High moves at 1.5 and rests at 2; Ultra rests at the device's ratio, up to 3 (`17-presentation.md`, Quality presets, says why and how to check it). Low gets the one final pass (no bloom, no MSAA) and cached 1024 shadows.
- **Kept until V1X**: `?engine=classic` (the chain before V1D, `postClassic.ts`, with per-frame shadows and no cache) on the same build; `QOTI_ENGINE=classic` runs `v1-perf.mjs` on it. `?debug&dpr=2` overrides the moving cap.
- **Outside my paths** (small edits): `render/layers/buildings.ts` (the swap queue and hysteresis from `lod.ts`), `render/layers/decor.ts` (the decor field), `render/kitGeometry.ts` (`decorGeometry(def, lod)`), `ui/Overlays.tsx` (one overlay line: engine, shadow and still counts), `e2e/v1-quality.spec.ts` (at rest the overlay reads still or idle).
- **Left for V1X**: the cloud shade in the final pass from depth (needs V1C's ground shader and V1A's look); deleting `postClassic.ts`; the laptop numbers.

<!-- V1D numbers -->
