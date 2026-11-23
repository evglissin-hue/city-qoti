# V4A: Rest-frame refinement and its governor

**Iteration**: V4 The developing picture. **Wave**: parallel. **Branch**: `cycle/v4a-rest-refinement`, from `cycle/v4x-integration`; PR into `cycle/v4x-integration`.
**Depends on**: V4.0. **Runs alongside**: V4B, V4C, and R3's wave (other paths). **Model and effort**: Opus 5.5 at xhigh (perf-critical); Sonnet executors for mechanical parts. **Ports**: client 5261, relay 8871.

## Goal

When the camera rests, the still frame keeps developing for about half a second, one sample a frame: jittered pixels (crisp brick courses and roof tiles), the sun inside a small disc (soft shadows whose edges widen with distance), a lens (true depth of field for the tilt-shift, with round highlights on lanterns) and, one sample in four, light from the sky (soft shadow in alleys, under eaves and in courtyards). A light step or a small change to the town (R3F's lamplighter lighting the lamps one by one, above all) folds in fresh samples and never makes the picture pop or restart; moving drops back to the plain moving frame at once. A governor skips refinement when moving frames are already slow, and Medium keeps today's still frame if its sample frames do not fit Kat's laptop.

## Read

- `CLAUDE.md`; `docs/build/v4-wave-notes.md` (all of it: the handshakes are yours); `docs/spec/20-architecture.md`, V4 contracts and Lean renderer
- `docs/spec/17-presentation.md`, Visual direction, second pass, 6. The picture develops when you stop; Quality presets
- `docs/spec/22-quality.md`: the budgets, Rest-frame refinement [V4], V4's before
- `apps/client/src/render/{cache,refine,post,shadows,resolution,lampSequence}.ts`, and in `renderer.ts`: `drawLean`, `drawSample`, `governorInput`, `scenePass`, `planShadows`

## You own

- `apps/client/src/render/{cache,refine,post,shadows}.ts`; `resolution.ts` additively (P2-F's dynamic resolution stays as it is); `renderer.ts`'s named lines: `drawSample`, `governorInput`, the `refine` call in `drawLean`, and what the sun disc's shadow per sample needs in `planShadows`
- V3's far-camera list (the shadow pass on far views, Ultra's second still pass for the AO, nature, trees and decor joined by block): in `shadows.ts`, `cache.ts`, and by carve-out the chunk grouping in `render/chunks.ts` and the `group` option where nature, trees and decor build their `ChunkedMeshes` (`layers/{nature,trees,decor}.ts`: P3C holds nature and trees and R3F holds decor until they land; a one-line `group` change there is listed in your PR and made after theirs merge)

Outside these: only small, necessary edits, listed in the PR. Not `lightMap.ts`, `lighting.ts`, `material.ts`, `layers/{lights,decor,agents,buildings}.ts` (R3F's), nor `look.ts`'s night grade (P3C's).

## You can rely on

- `StillCache.samples`, `goal`, `lastChange`, `developing(key)`, `refine(n, ctx)`, `keep(..., change)`; `StillKeyParts`, `stillChange`, `restartsDevelopment`, `RefineContext { renderer, frame, draw }` (`cache.ts`)
- `refineJitter(index)`, `halton`, `toDisc`, `PHOTO_SAMPLES`, `SETTLE_MS`, `SKY_EVERY`, `RefineGovernorInput`, `refineGoal`, `refineOffFromUrl` (`refine.ts`); `QualityPreset.refineSamples` (0, 8, 16, 32); `DynamicResolution.movingMs` and `stepIndex`
- `RenderStats.mode` `'sample'`, `samples`, `sampleGoal`, `stillChange`; `?debug&refine=0`
- `__qoti.lampSequence()`, `v4-shots.mjs` (with `lamps` and `compare`), `v4-perf.mjs` (moving, settling, settled), Measure this laptop's still part

## Tasks

1. **Measure first**: `v4-perf.mjs` on the grown village's street and village cameras and far120 on every preset, and the laptops' still part in `docs/playtests/V4.md` where the owner and Kat have run it. Write down what a sample frame may cost on Medium on Kat's laptop (12 ms GPU a sample frame; idle back within 4 ms once settled), and on High (settled inside `SETTLE_MS`, 0.6 s, at 60 fps: 16 samples in 36 frames).
2. **Accumulate** into the still frame (`StillCache`), one sample a frame to `goal`: a float accumulation target beside the kept picture, the restore mesh showing the developed picture, the plain still's depth kept for moving layers. Build the accumulation so it can fold samples drawn from any camera (V4X wires `capture`'s `samples` through it: `drawSample(jitter, target, camera)` already takes one).
3. **The jitters** in `drawSample`: the pixel (a sub-pixel projection offset, `camera.setViewOffset` or the projection matrix, reset after), the sun inside its disc (a shadow render a sample, `shadows.ts`, with the texel snap kept), the lens (depth of field from the cached depth in the final pass for the moving layers, `post.ts`; the photo slider's `setDepthOfField(amount)` is the aperture at rest), and the sky one sample in `SKY_EVERY` (the sun off, light from `jitter.sky`).
4. **Fold, never restart**, on `content`, `light`, `lamps` and `shadows` changes (`restartsDevelopment` false): the wave notes' table, with a unit test of the fold-in and the `lamps` shot sequence. Restart only on `first`, `targets` and `view`.
5. **The governor** (`refineGoal`): the preset's samples, none when `off`, none while moving frames already run slow (`movingFrameMs` over about 18 ms, or `resolutionStep` above 0) or a sample frame would not fit (`sampleGpuMs`), `PHOTO_SAMPLES` when `photo`; Medium falls back to 0 if the laptops' numbers say so (then `QualityPreset.medium.refineSamples` is 0 and the spec says why).
6. **V3's far-camera list** as part of the still frame's budget: cap or coarsen the shadow pass on far views, look at Ultra's second still pass for the AO (once a rest, never a sample), and join nature, trees and decor by block where it pays.
7. Docs: `17-presentation.md` (As built), `20-architecture.md` (V4 contracts, As built), `22-quality.md` (your numbers), the board row, `CHANGELOG.md`.

## Acceptance criteria

- [ ] At rest the picture settles inside 0.6 s on High (`v4-perf.mjs`'s settling column, counted in frames at 60 fps where software is slower); idle frames return to their budget once settled; moving frames cost what they did (same draws and triangles; `?debug&refine=0` on the same build as the before).
- [ ] A light step or a small change never makes the picture pop: `v4-shots.mjs v4a lamps` (12 lamps lit one by one at rest, golden hour and night) shows no frame that drops back to the plain still, and a unit test folds a `lamps` change without resetting `samples` to 0.
- [ ] Moving the camera drops to the plain moving frame on the next frame (a test on `drawLean`'s mode).
- [ ] The governor's rules are unit tested, Medium's fallback included.
- [ ] Every hash matches; `v4-shots.mjs compare before v4a` shows changes only at rest (developed pictures), none on moving frames.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

Photo mode's waiting for its 64 samples and the ink style (V4B); `capture`'s `samples` (V4X wires it); the tea-break camera (V4C); the lamps, windows and resting pieces themselves (R3F).

## Notes

- A sample frame is a static scene pass plus a fold: about the cost of the still frame, which Measure this laptop's still column measures per preset. On Kat's laptop Medium idle frames already ran near 5 to 6 ms on the owner's M4 (V2's table): watch the idle budget once settled.
- The sun's disc needs a shadow render per sample; on Low there is no cache and no refinement, so nothing changes there. Keep the shadow frustum's texel snap, or soft shadows will swim.
- The sky samples light the scene from `jitter.sky` with the sun off: the hemisphere light stays, the shadow map renders from the sky direction. One in four is the spec's ratio; tune it if alleys read too dark or too flat.
- Bloom at rest is built from the still picture once per key (`RestBloomSource`); a developing picture changes it every sample. Build the bloom from the developed picture when it settles, not per sample.
- The night's bloom and the lamps: R3F lights lamps one per tick for about 10 s at 1x around 17:30; each is a `lamps` change. Check the fold at 3x too (about 3 s for the whole street).
