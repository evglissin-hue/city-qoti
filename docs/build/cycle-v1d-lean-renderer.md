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
