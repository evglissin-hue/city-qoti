# V4 wave notes: how the tracks meet

Read this with your brief. V4 is "The developing picture" (`30-roadmap.md`, V4; `17-presentation.md`, Visual direction, 6. The picture develops when you stop): the picture gets better when the players stop to look, and the books are illustrated by the valley itself. V4.0 fixed the types and stubs (`docs/spec/20-architecture.md`, "V4 contracts"); these notes fix the handshakes between V4A (rest-frame refinement and its governor), V4B (photo mode, ink-and-wash captures, illustrated books and the endpaper's night), V4C (tea-break mode) and V4X, so the pieces fit when V4X merges them. Like V3, V4 changes no sim state: every hash stays the same. Draft by V3X; final by V4.0 (2026-11-17). If something here is wrong for you, say so in your PR and work around it; V4X decides.

## Rules for the wave (read first)

- **The look is the point, and the frame budget is the floor.** Visual quality is the owner's top priority; Kat's laptop on Medium (P50, measured by GPU frame time) is the limit. Refinement costs nothing while moving and nothing once settled. If the measured cost does not fit Medium on Kat's laptop, Medium keeps today's still frame and refinement is High's and Ultra's alone (the roadmap's third acceptance line).
- **Measure before building.** The before is in `22-quality.md` (V4's before) and `docs/playtests/V4.md`: the software tables V4.0 took, and both laptops' runs of Measure this laptop when the owner and Kat have taken them. `?debug&refine=0` turns refinement off on any V4 build, so a before and an after can always be taken on one build (as V2 did with `lights=loop`).
- **Contracts are additive, names append-only.** `StillChange` members, `RefineGovernorInput` and `CaptureOptions` fields, `QualityPreset` fields, `TeaBreakGuards`, `TeaBreakPlan` kinds, `RenderStats` fields: add, never rename, reorder or remove.
- **Stay in your files.** Ownership is by file (below). Outside it, only small, necessary edits (a registry line, an export, an additive field, the carve-outs named here), listed in your PR.
- **Nothing on screen changes outside your area.** Run `v4-shots.mjs <your stage>` before you open the PR and look at every scene and hour, not only yours; `v4-shots.mjs compare before <your stage>` shows what moved.
- **Every static change goes through `ctx.invalidate()`** (or a static layer's `frame()` returning true); a change that moves no caster is `shadowless`. The still frame's key says what changed (`StillChange`), and only `first`, `targets` and `view` may restart the development.
- **V4 never changes sim state** and adds no sim field. A tea break chooses from the Mirror (shared state) only.
- **Build and review loop** (`31-parallel-development.md`): an Opus 5.5 lead plans and briefs, Sonnet `executor` agents build, the lead checks quality, runs the dead-end hunt where it applies and looks from the player's chair, one or two rounds before the PR. Each wave cycle branches from `cycle/v4x-integration` (the master makes it at V4.0's merge commit) and opens its PR into it.

## Who runs beside V4

- **R3's wave** (R3A to R3E, R3F Lamplight and resting pieces, R3G levels on the specialized and services kits) merges into `main` as it goes through R3X. V4 claims none of R3F's files: `render/lightMap.ts`, `render/lighting.ts`, `render/material.ts`, `render/layers/{lights,decor,agents,buildings}.ts`, and in `packages/art/src/kits`: `residents.ts`, `props.ts`, `decor.ts`, `garden.ts`, `fineDecor.ts`, `festival.ts`; R3G draws on the specialized and services kits. **Never merge an R3 branch into a V4 branch**; whichever of a V4 PR and an R3 PR reaches its target second resolves the conflicts. What R3F draws comes from views only: a `supplies.updated` event with `SuppliesView` (`lamps: { id, reach, out }[]`: a lantern lights at tick `reach` as the lamplighter reaches it between 17:30 and 18:00 and goes out at 07:00; `resting: { id, kind }[]` with kind `unlit`, `cold`, `bare`, `faded` or `dry`; `candles`: homes with every window lit until bedtime) and the lamplighter as an agent flag with a pole and a light.
- **The playtest cycles on `main`** (they land before V4's wave): P3C (the look in rain, haze and close up) owns `render/layers/{weather,water,nature,trees,meadow,roads,terrain,sky}.ts`, the haze and fog code (with a three-line edit in `renderer.ts`'s `fitView`), the night grade's values in `render/look.ts`, a night patch in `render/lighting.ts`, the nature and trees kits and values in `materials.ts`, `palette.ts` and `surface.ts`; P3B (a calmer screen) owns `ui/{Toolbar,TopBar,GameUI,Minimap,Picker}.tsx` and the bottom bar's layout (the camera button moves to a corner cluster by the minimap; the photo panel stays where V4B expects it); P3A is sim and content. A V4 track that must touch one of these says so in its PR and builds on what landed.
- **I4** owns the worldgen rim (a valley that slopes out into the hills, new valleys only): not R3's, not V4's.

## Ownership by file

| Owner | `apps/client/src/render` | Elsewhere |
|---|---|---|
| V4A rest-frame refinement | `cache.ts` (`StillCache`: the accumulation, the fold-in), `refine.ts` (the jitter, the governor), `post.ts` (the developed still's resolve, the lens from cached depth for moving layers in the final pass), `shadows.ts` (the sun disc's shadow per sample, the far-view frustum), `resolution.ts` (additive: P2-F's governor stays), `renderer.ts`'s named lines: `drawSample`, `governorInput`, the `refine` call in `drawLean` | `apps/client/e2e/v4a-*.spec.ts` if any |
| V4B photo mode, ink and books | new `ink.ts`, `renderer.ts`'s `capture()` and `photo` (`savePng`), `endpaper.ts` and `layers/endpaper.ts` (the night wash, the footfall ink's weight), `palette.ts` additions only by append (ink and wash tokens, with P3C's say: P3C holds `palette.ts`'s values) | `apps/client/src/worker/endpaper*.ts` (the worker, its drawing, geometry and glyphs), `apps/client/src/app/snapshots.ts`, the photo panel in `ui/` (the strip C5F built; P3B owns the bar it sits in), a new `apps/client/src/app/inkPictures.ts` (the picture source for R3D's seam) |
| V4C tea-break mode | `renderer.ts`'s `follow` and `followStep` (a slower glide while a tea break follows), additive | `apps/client/src/input/{camera,teaBreak}.ts`, the setting's row in `ui/SettingsPanel.tsx` and its line in `ui/copy.ts`, the wiring in `apps/client/src/app/` (a new `teaBreakHost.ts`, and one line where the session starts it) |
| Shared: additive only, listed in the PR | `api.ts`, `quality.ts`, `env.ts`, `layers/{index,types}.ts` | `ui/settings.ts`, `packages/protocol/src/perf.ts` |
| V4X: no track edits these without V4X's say | `renderer.ts` (but the named lines above), `statics.ts`, `gpuTimer.ts`, `lampSequence.ts`, the showcases | `apps/client/src/app/{perf,debug}.ts`, `apps/client/e2e/{v4-shots,v4-perf}.mjs` |
| R3, P3 (not V4) | the files in "Who runs beside V4" | `packages/sim`, `packages/content`, `tools/bench`, the rest of `apps/client/src/{ui,state}` |

## Handshakes

**The still frame says what changed** (`cache.ts`, V4.0). The renderer's still key is now built from `StillKeyParts { targets, quality, view, content, light, shadows, lamps }` (the same string as before); when a rest draws the still frame again, `stillChange(prev, next)` names the biggest change and `StillCache.keep(..., change)` records it (`lastChange`, and `RenderStats.stillChange`). `restartsDevelopment(change)` is true only for `first`, `targets` (a resize, a preset) and `view`; `content`, `light`, `lamps` and `shadows` are a step of the light or a small change to the town, which V4A folds in. A forced redraw with no part changed (a quality change, the AO's code arriving) is `targets`.

**The refinement** (`cache.ts`, `refine.ts`, V4.0; V4A builds it). At rest, once the still frame is kept, the renderer sets `StillCache.goal = refineGoal(governorInput())`; every frame after, while `developing(key)` (enabled, valid, `samples < goal`), it calls `refine(1, ctx)`, which draws a sample through `ctx.draw(jitter, target)` (the renderer's `drawSample`: the static layers with that sample's jitter) and folds it into the kept picture; a frame that folded one is mode `'sample'`. The restore mesh shows the developed picture; its depth stays the plain still frame's (moving layers depth-test against it). `refineJitter(index)` is pure and low-discrepancy (Halton: the pixel in bases 2 and 3, the sun's disc 5 and 7, the lens 11 and 13, the sky 17 and 19, every fourth sample lit from the sky); sample 0 is the plain still frame. `RenderStats.samples` and `sampleGoal` say how far it has developed (settled when equal). V4.0's `refineGoal` returns 0 and `refine` adds nothing: today's still frame.

**The governor** (`refine.ts`, V4.0; V4A builds it). `RefineGovernorInput { quality, presetSamples, movingFrameMs, resolutionStep, gpuMs, sampleGpuMs, photo, off }`: `movingFrameMs` and `resolutionStep` come from P2-F's `DynamicResolution` (`movingMs`, the last judged window's mean; `stepIndex`), `gpuMs` from `GpuTimer.ms`, `sampleGpuMs` from V4A's own measure of sample frames, `photo` from photo mode, `off` from `?debug&refine=0`. It runs once a rest, when the still frame is kept. Dynamic resolution keeps judging moving frames only; sample frames never count as moving.

**R3F's lamplighter** (ruling of 2026-11-17). Lamps come on one by one over half an hour (17:30 to 18:00; 15 game minutes take 5 s of real time at 1x, so about 10 s at 1x and 3 s at 3x), each a light map change batched per tick (`env.lightWriter`, so `lamps` in the key), every static change through `ctx.invalidate()` (`content`, shadowless). With refinement on, each one draws the still frame again at rest: **the refinement must not pop or restart visibly as each lamp lights**. That is exactly the roadmap's "a light step or a small change to the town never makes it pop", and V4A's acceptance tests it with the test scene V4.0 left: `__qoti.lampSequence({ count, everyMs, center?, spacing?, angle? })` (`render/lampSequence.ts`) lights lamps along a line through the view's focus, one every `everyMs` (400 by default), each a light map write and a shadowless static change, as the lights layer does; `lampSequenceLit()` counts them and `lampSequenceStop()` puts them out. `v4-shots.mjs <stage> lamps` shoots it at golden hour and night after 0, 4, 8 and 12 lamps.

**Photo mode at 64 samples** (V4B on V4A's contract). `photo.setPhoto(true)` sets the governor's `photo`, and V4A's `refineGoal` answers `PHOTO_SAMPLES` (64) on every preset with the still-frame cache. V4B's `savePng` draws at rest and waits until `stats.samples >= stats.sampleGoal` (or a timeout of a few seconds, then saves what it has) before reading the canvas; with V4.0's stub the goal is 0 and it saves at once, as today. The depth of field slider stays `LeanFrame.setDepthOfField(amount)`: V4B only calls it, and V4A maps the amount to the lens's aperture at rest (and keeps today's tilt-shift blur while moving).

**Captures** (`api.ts`, V4.0). `capture(opts: CaptureOptions)`: `focus`, `radius`, `size` as C5E's, plus `style?: 'plain' | 'ink'` and `samples?`. Until V4B lands, `'ink'` returns the plain picture; until V4X wires it, `samples` is ignored (one pass, supersampled twice as today). V4A builds the sample accumulation so it can fold samples drawn from any camera (`drawSample(jitter, target, camera)` takes one); **V4X wires `capture`'s `samples`** through it once both have landed. A capture is drawn at rest, never on a moving frame, and nothing is captured while no book is open (a book asks when a page with a slot is shown, and the picture is kept).

**The pictures seam** (ruling of 2026-11-17, from R3.0). R3D creates `apps/client/src/ui/pictures.ts`, exporting `PictureRef = { book: 'townBook' | 'patternBook' | 'chronicle'; id: string }`, `pictureFor(ref): Promise<string | null>` (an image URL) and `setPictureSource(fn)`. V4B builds its source in its own module (`app/inkPictures.ts`: `inkPictureSource(session)` returning `(ref: PictureRef) => Promise<string | null>`, which finds where a page's picture should look from shared state and calls `capture({ style: 'ink', ... })`), and registers it with one `setPictureSource` call at startup. Until then a slot shows the Chronicle snapshot or an empty framed slot. **Whichever of R3X and V4X lands second wires the one call**; until then V4B keeps a structural copy of `PictureRef` in its module (deleted at the wiring). Slots are landscape 4:3: 240 x 180 CSS px on a Town Book or Pattern Book page (capture at 480 x 360); in the printed storybook 80 x 60 mm for a Chronicle entry and 60 x 45 mm for a book page, for which V4B hands back at least 1600 x 1200 px. A 1600 x 1200 capture at today's twice supersampling is a 3200 x 2400 float target and a 123 MB read back: V4B draws print pictures at their own size (the ink pass antialiases its lines) or in tiles, never through a buffer that size.

**Tea break and the camera** (`input/teaBreak.ts`, `input/camera.ts`, V4.0; V4C builds it). `IdleTimer` counts from the last input (`poke` from every key, click, drag, wheel and touch on the window) and is `due(now, guards)` after `TEA_BREAK_AFTER_MS` (90 s) unless a guard says no: `enabled()` (`UiSettings.teaBreak`, on by default), `toolInHand()` (`ToolManager.active` is not `'inspect'`), `cardOpen()` (UiState's selection, panel, dialog, letter, storyLetter, almanac, raidCard, festivalCard, edition, chapter, settingsOpen) and `busy()` (photo mode, Measure this laptop, a resident followed by hand). `chooseTeaBreak(mirror): TeaBreakPlan | null` picks `{ kind: 'follow', residentId }` (a resident on their evening round, the existing follow camera) or `{ kind: 'orbit', x, z, distance }` (the day's busiest place) from the Mirror only. The camera keeps the player's view with `saveView()` and puts it back exactly with `restoreView(v)` (a snap: no glide back); `orbit(around | null)` and `setDrift(on)` are V4C's slow circle and slow glide (stubs in V4.0). Each seat's tea break is its own; camera state is never shared. A tea break is a moving camera: its frames are moving frames, the still frame never rests under it, so refinement never runs during one.

## Static changes at rest: fold or restart

| Change | Key part | V4A |
|---|---|---|
| The camera moves, a resize, a preset change, the AO's code arriving | `view`, `targets` | drop to the plain moving frame at once; a new rest starts over |
| A lamp lights or goes out, a window's quarter-hour step | `lamps` (and `content`, shadowless) | fold in fresh samples, never restart |
| The sun's quarter-hour step, weather easing, photo mode's hour | `light`, `shadows` | fold in |
| A building rises, a stock pile grows, the dressing changes, a site step | `content` (and `shadows` when a caster moved) | fold in |

What "fold in" means is V4A's to build and tune: one way is to draw the new still frame and blend the developed picture toward it over a few frames (a running mean whose weight restarts at about a quarter), so a lamp lighting fades in over 50 to 100 ms and the soft shadows and crisp edges never drop away.

## Stand-ins

| Stand-in | Where | Replaced by | When |
|---|---|---|---|
| No lamplighter: lamps light all at once at dusk, as V2's lights layer does | `render/layers/lights.ts` (R3F's) | R3F's lamps one by one from `SuppliesView` | R3X (V4A tests against `lampSequence` meanwhile) |
| No picture seam: `ui/pictures.ts` does not exist on V4's branches | V4B's structural copy of `PictureRef` in `app/inkPictures.ts` | R3D's module, wired with one `setPictureSource` call | whichever of R3X and V4X lands second |
| `refineGoal` returns 0, `refine` adds nothing | `render/refine.ts`, `render/cache.ts` | V4A's refinement | V4A |
| `capture({ style: 'ink' })` returns the plain picture | `renderer.ts` `capture` | V4B's ink pass | V4B |
| `capture`'s `samples` ignored | `renderer.ts` `capture` | V4A's accumulation from the capture camera | V4X |
| `chooseTeaBreak` picks nothing; `orbit` and `setDrift` do nothing | `input/teaBreak.ts`, `input/camera.ts` | V4C's tea break | V4C |

## Ports

| Cycle | Client | Relay |
|---|---|---|
| V4.0 | 5260 | 8870 |
| V4A | 5261 | 8871 |
| V4B | 5262 | 8872 |
| V4C | 5263 | 8873 |
| V4X | 5264 | 8874 |

## The scenes and scripts

- `apps/client/e2e/v4-shots.mjs <stage> [scene ...]`: the grown village (`?debug&fixture=grown`, summer, clear) at V3's `street` (the doorstep, 12 tiles) and `village` (70 tiles) cameras, by day, golden hour and night; each shot is a rest taken at 0, 0.3 and 0.6 s after the still frame, recording `samples`, `sampleGoal`, `stillChange` and the mode; the `lamps` scene (above). Saves `docs/build/screenshots/v4-<stage>-<scene>-<shot>-<t>.png`. `v4-shots.mjs compare <stageA> <stageB>` compares the two stages pixel by pixel (exit 1 past `QOTI_TOLERANCE`).
- `apps/client/e2e/v4-perf.mjs [scene ...]`: per scene and preset, moving (V3's path), settling (from the first rest frame until `samples` reaches `sampleGoal`: time, frames, samples) and settled (idle frames after), with the still frame's own cost.
- Measure this laptop (Settings) gains a still part per row with a still-frame cache: 3 s in which every frame draws the still frame again (a shadowless static change each frame; the shadow map is left alone), the table's last column. That is what each sample of the refinement adds to a resting frame, near enough, so it is V4's real before on the laptops.

## Before numbers

V4.0 changes nothing on screen, so its branch is the before. The software tables (the build container's SwiftShader: draws and triangles are real, milliseconds are ratios at best) are in `22-quality.md` (V4's before) and `docs/build/screenshots/v4-before-perf.md`; the shots are `docs/build/screenshots/v4-before-*.png`. The laptops' tables go in `docs/playtests/V4.md` (Before).

## What V3 leaves (V3X's list, placed)

| Item | Where it goes | Why |
|---|---|---|
| The laptops' GPU tables for V3 (both laptops; Medium must hold 12 ms GPU moving and 4 ms idle on Kat's laptop) | the owner's and Kat's runs of Measure this laptop on the live link (`docs/playtests/V3.md`); V4.0 made them ready and does not wait on them | V4's budgets are judged against them; the owner's word may defer Kat's |
| The far camera's remaining cost: the shadow pass re-rendered on far views, Ultra's second still pass (the AO normal pass, GTAO), nature, trees and decor drawn per chunk | V4A, as part of the still frame's budget | V4's subject is the still frame; joining by block (V3C's `ChunkedMeshes` `group`) is the known tool |
| A valley that slopes out into the hills instead of a cliff ring (worldgen, new valleys only) | **I4** | it needs a sim cycle (worldgen changes the map and every new valley's hash); V3X drew the existing rim as a slope (`surface.ts`, `rimLevel`) |
| The tavern's dressing fits in isolation but not in the grown village's tight spot | V4X (unless R2X's regrown village already gives it room) | V3X's six rules for undressed buildings |
| The endpaper map's tint at night (the same parchment at every hour today) | **V4B: yes** (the owner, 2026-11-17): a subtle lamplit wash at night, inside the endpaper worker's budget | V3D's note |
| The evening footfall wash on the map at 240 tiles reads heavy and teal over the roofs | **V4B**: tone it down | the owner, 2026-11-17 |

## Decisions V4.0 made

- **Where the refinement's parts live**: the accumulation and the fold-in in `cache.ts` (`StillCache`), the jitter and the governor in a new `refine.ts` beside `resolution.ts` (which only gained `movingMs` and `stepIndex`). The cache never draws the scene: the renderer hands it `RefineContext { renderer, frame, draw }`.
- **What may restart**: only the view, the targets and the first still frame (`restartsDevelopment`); everything else folds, so R3F's lamps never restart the picture.
- **The jitter sequence is fixed now** (pure and tested), so V4A and V4X's capture samples draw the same points; V4A may retune it inside the same shape.
- **Photo mode's 64 samples go through the governor** (`photo`), not a second path; Save PNG waits on `RenderStats.samples`.
- **`capture`'s `samples` is V4X's to wire**, not V4B's, so V4A and V4B never wait on each other.
- **Tea break's timer is pure** (the caller passes the clock and the guards) and lives in `input/teaBreak.ts`; the setting is `UiSettings.teaBreak` (on by default; V4C adds its row in the panel). `restoreView` snaps, so "any input restores the exact view" holds to the pixel.
- **Measure this laptop measures the still frame itself** (a still part a row), not by tagging GPU queries by mode, which needed no change to `gpuTimer.ts`.
- **A test scene, not a stand-in system**, for R3F's lamps: `lampSequence` writes its own light map source and nothing else.
