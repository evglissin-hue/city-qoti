# V1 wave notes: how the tracks meet

Read this with your brief. V1.0 fixed the types and the shared files (`docs/spec/20-architecture.md`, "V1 contracts"); these notes fix the handshakes between V1A (materials and light), V1B (buildings detail), V1C (ground, water and nature) and V1D (the lean renderer), so the pieces fit when V1X merges them. V1 touches no sim code: every hash stays the same. If something here is wrong for you, say so in your PR and work around it; V1X decides.

## Rules for the wave (read first)

- **The look is the point, and the frame budget is the floor.** Visual quality is the owner's top priority; the weaker laptop's 60 fps on Medium (P50, measured by GPU frame time) is what every detail has to fit inside. Report `v1-shots.mjs after` stills and a `v1-perf.mjs` table in your PR, run on this branch's scenes so the numbers compare with the before table below.
- **Contracts are additive.** Add surface ids, uniforms, preset fields or exports; never rename, renumber or remove one. A new surface id goes at the end of `SURFACE` and `SURFACES` in a commit of its own, and the PR says so (V1B and V1C may both add some; V1X renumbers nothing, it only resolves two ids added for the same thing).
- **Stay in your files.** Ownership is by subpath (below). Outside it, only small, necessary edits (a registry line, an export, an additive field), listed in your PR.
- **Nothing on screen changes outside your area.** Run `v1-shots.mjs` before you open the PR and look at every scene, not only yours.

## Ownership by subpath

From `docs/spec/31-parallel-development.md`, with the files V1.0 added:

| Cycle | Owns |
|---|---|
| V1A | `packages/art/src/{materials,palette,patterns}.ts` and the values in `surface.ts`; `apps/client/src/render/{material,look,lighting,env}.ts`; the gallery's surfaces section |
| V1B | `packages/art/src/kits/` (buildings, props, residents) except `nature.ts` and `trees.ts`; helpers in `packages/art/src/{shapes,geometry}.ts`; `apps/client/src/render/{kitGeometry.ts,layers/buildings.ts}` |
| V1C | `packages/art/src/kits/{nature,trees}.ts`; `render/layers/{terrain,roads,water,nature,trees,blobs}.ts`; `render/{ground,surface,scatter,groundAo}.ts` |
| V1D | `apps/client/src/render/{renderer,post,quality,resolution,chunks,batch,gpuTimer,cache,shadows,lod,layerTags}.ts`, `apps/client/src/app/perf.ts`, `apps/client/e2e/v1-perf.mjs` |
| V1X | everything, to merge, fix and tune; `apps/client/e2e/v1-shots.mjs` and `render/townShowcase.ts` are shared and change only with V1X's say |

`render/layers/sky.ts` and `render/layers/lights.ts` belong to nobody in the wave: V1A may change their look, V1D their drawing (one line each, listed in the PR).

## Handshakes

**Surface ids.** V1B and V1C write them: `new ShapeBuilder().surface(SURFACE.brick).box(...)`, like `glow`. Every geometry carries the `surface` attribute (a `Uint8Array`, 0 unless set), `RigBuilder` writes zeros and `mergeFlat` carries the ids, so a batch of buildings or a merged cart always has one attribute set (the buildings layer's `BatchedMesh` throws on a geometry missing an attribute the first one had: keep it that way). V1A's material reads `attribute float surface;` and indexes the table; plain (0) and any id it does not know draw as today. Both levels of a kit carry the same attributes (tested in `packages/art/src/surface.test.ts`).

**The two levels.** V1B (buildings and props) and V1C (trees and nature) build `high` and `low` geometry for every kit through `KitBuildOptions.lod`; the low level keeps the silhouette, roof, chimneys, and windows and doors as flat quads (about 100 to 150 triangles for a home), with per-face color jitter hashed from position and silhouette choices rolled before branching on the level, so the two match. V1D's `lod.ts` decides which shows: buildings from `env.buildingDetail`, decor and small props from `env.detailDistance`, trees per instance, residents from the agents layer's `setDetail` distance, all set per preset in `quality.ts`. Until `lod.ts` lands, the buildings layer swaps at `env.buildingDetail` (75 tiles on every preset, 110 on Ultra).

**The pattern array.** One texture for the whole game: `env.patterns.value`, created once with the world env (`createPatternArray()`, flat until V1A). V1A fills it with the generators (it may replace the texture's data in place or set `env.patterns.value` once at load, before the first frame); V1A's kit material and V1C's ground shader bind the same `{ value }` object as a uniform, so neither ever creates its own. Channels: R luminance (128 is 1), G accent mask, B secondary (flower hue), A color mask (flowers only).

**Ground AO.** V1C builds the ground AO texture (`render/groundAo.ts`, about 2.5 texels a tile, from building footprints and tree crowns, blurred twice) and rebuilds a chunk's part when its occupants or decor change, from the terrain layer. That layer is static, so its `ctx.invalidate()` (or its `frame()` returning true) bumps `renderer.staticRevision` and V1D drops the still-frame cache. V1C samples it in the ground shader; V1A's kit material may sample it for the bottoms of walls (V1C exports the uniform from `groundAo.ts`).

**Blob shadows.** V1C draws them in a new moving layer, `render/layers/blobs.ts` (one registry line, `motion: 'moving'`), instanced from the agents and carts frames the agents and carts layers read, faded at the resident detail distance. V1D stops moving layers casting into the cached shadow map (an object on `MOVING_LAYER` gets `castShadow = false`) only once V1C's blobs are in; until both land, residents and carts cast as today. V1X checks the pair.

**The final pass.** V1D owns the frame graph and the passes (`post.ts`) and the frame loop (`renderer.ts`); V1A owns what the final image looks like (`look.ts`). V1D's one final pass includes `LOOK_GLSL`, shares one `lookUniforms()` set, and calls the look's functions in this order: `lookTiltMask` to mix the sharp and blurred images, `lookBloomMix` with the blurred image, `lookToneMap`, `lookSrgb`, then `lookGrade` times `lookVignette` (dither after, V1A's function). A new look function is V1A's change; calling it is one line of V1D's. Until V1D lands, `PostChain` calls them from today's passes, and the bloom is still UnrealBloomPass's own composite with `bloomFor`'s strength and threshold.

**Cache invalidation.** Each layer has its own context, so the renderer knows which kind of layer changed: a static layer calls `ctx.invalidate()` as today (no flag) and the renderer bumps `staticRevision`; a static layer's `frame()` returning true bumps it too. V1D's `cache.ts` keeps the revision it drew at and redraws when it differs, and also on a camera move, a sun or light change, a shadow render, and a quality or size change. A moving layer's `invalidate()` only asks for a frame. Anything that changes static content outside a layer (a ground AO texture swap, a material uniform that changes the static picture, such as the hour's window share) calls `renderer.invalidate()` plus a static bump through its layer, or V1D adds a public `invalidateStatic()` (additive).

**Fresnel and glint.** V1A exports them from `render/material.ts` as GLSL (sky fresnel and a sun glint for glass and water); V1C's water shader uses them. Until then the water keeps its own.

## Animation inside static layers

V1.0 looked at every static layer for anything that moves on its own. Each decision keeps the still-frame cache honest:

| Effect | Where | Decision |
|---|---|---|
| Cloud shade drifting over the ground | the ground shader (`render/ground.ts`, terrain layer) | Pause while the camera rests now (it reads `env.staticTime`); V1D moves it into the final pass from depth (world x and z from the depth buffer), with V1A deciding its look in `look.ts`, so it drifts again at rest. |
| Foliage, grass and flower sway | `render/scatter.ts` (trees and nature layers) | Pause while the camera rests (`env.staticTime`). The sway is a few hundredths of a tile; at rest the eye goes to the residents, and the clock carries on from where it stopped, so nothing jumps. |
| Drifting sky clouds and twinkling stars | the sky dome (`layers/sky.ts`) | Pause while the camera rests (`env.staticTime`): the clouds drift 0.004 of the dome a second, too slow to see in a rest. If the stars are missed at night, V1A can twinkle them in the final pass. |
| Lit windows by the hour, ground glow pools | the kit material's night glow, the lights layer | Not animation: they change every in-game quarter hour or when the view's focus moves, and the change invalidates the cache (a light change, or the lights layer's `frame()` returning true). |
| Seasonal orchards, level of detail swaps | buildings layer, trees and nature | Changes, not animation: they invalidate the cache through `frame()`. |
| Lantern flicker, fountain water | none today | If V1B or V1C add them, they go in a moving layer (`effects`, which already spins sails and puffs smoke) or the final pass, never inside a static layer. |
| Windmill sails, chimney smoke, water ripples | `effects`, `water` | Already in moving layers. |

How it works: `env.staticTime` is the same object as `env.time` until V1D, so today everything animates as before. V1D gives it its own `{ value }` that advances only on moving frames (it may let it run on idle frames for the few seconds before the cache is drawn).

## Stand-ins (every track fills its row before its PR)

| What | Stand-in until the owner lands | Owner |
|---|---|---|
| Pattern generators | `createPatternArray()` is flat (R 128): a material that samples it draws as today | V1A |
| Surface ids on kits | every kit writes plain (0) | V1B (buildings, props, residents), V1C (trees, nature, ground) |
| The lean kit material | `createWorldMaterial(env)`: today's `MeshStandardMaterial` with the night glow; it ignores `surface` | V1A |
| Fresnel and glint for glass and water | the water layer's own shader; no glint on glass | V1A |
| High and low levels | today's `lod: 'low'` versions; only buildings swap (at `env.buildingDetail`) | V1B, V1C build; V1D swaps |
| The frame graph | `PostChain`: RenderPass, UnrealBloomPass, two tilt-shift passes, the look's output pass (tone mapping and sRGB), the look's grade pass | V1D |
| The V1 preset fields | stored, not read; Ultra is High with Ultra's distances | V1D |
| `RenderStats.mode` | always `moving` | V1D |
| `renderer.staticRevision` | counted, read by nobody | V1D's `cache.ts` |
| `env.staticTime` | the same clock as `env.time` | V1D |
| Cached sun shadows | re-rendered whenever the Mirror changes, as today | V1D |
| Blob shadows | none; residents and carts cast into the shadow map | V1C draws, V1D stops the casting |
| Ground AO texture | none | V1C |
| Ambient critters (`critters`) | none drawn on any preset | C5E (seasons art) |

## Ports

| Cycle | Client | Relay |
|---|---|---|
| V1.0 | 5200 | 8810 |
| V1A | 5201 | 8811 |
| V1B | 5202 | 8812 |
| V1C | 5203 | 8813 |
| V1D | 5204 | 8814 |
| V1X | 5205 | 8815 |

Start the relay with `PORT=<relay> npm run start -w @qoti/dev-server` and the client with `QOTI_CLIENT_PORT=<client> QOTI_RELAY_PORT=<relay> npm run dev -w @qoti/client`, then point the scripts at it with `QOTI_CLIENT_PORT`.

## The scenes and scripts

- `QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_CLIENT_PORT=<port> node apps/client/e2e/v1-shots.mjs <stage> [scene ...]`: the hamlet fixture (default, close, dusk, night), the village of 130 (`fixture=village` plus `villageShowcase(true)`: wide, golden hour, night, street), the town (`townShowcase()`: wide, night, street) and the winter fixture (wide), at 1440 x 900 on Medium with the interface hidden and dynamic resolution off. Saves `docs/build/screenshots/v1-<stage>-<scene>-<shot>.png` and prints draws, triangles, CPU frame ms and GPU ms per shot. `before` is V1.0's, `after` is V1X's; a track PR saves its own under `QOTI_OUT` (or a stage named for it, such as `v1b`).
- `node apps/client/e2e/v1-perf.mjs [scene ...]`: for each scene (hamlet, village, town) and preset, a 10 s camera path (a pan, an orbit, a zoom in and a zoom out) then a 10 s rest with residents walking; prints average and 95th percentile frame ms and GPU ms, moving and idle, as a Markdown table. `QOTI_HEADED=1` runs it in a real window on the laptop's GPU; in a `?debug` valley, `await __qoti.perf()` in the console does the same for the scene on screen (`__qoti.perf({ presets: ['medium'], move: 10, rest: 10 })`).
- `window.__qoti.townShowcase()` builds the town in any `?debug` valley (best on `fixture=village`); `townShowcase({ residents: 0 })` leaves the residents out.
- `window.__qoti.layerTriangles()` gives the triangles each render layer draws from the current camera (`QOTI_LAYERS=1` prints them per shot): report your layers' before and after with it.

## Before numbers

How they were taken: headless Chromium in the build container, which has no GPU, so WebGL runs in SwiftShader (software) and every frame takes seconds. Draw calls and triangles are real; frame and GPU times are the CPU doing the GPU's work, good for ratios at best. The owner's and Kat's laptops give the timings (below).

**Shots** (`v1-shots.mjs before`, Medium, 1440 x 900; stills `docs/build/screenshots/v1-before-*.png`). The hamlet, village and winter scenes ran on `main` itself (aa218a3, C5A merged); the town ran on `main` plus this branch's first commit (the town showcase, GPU timer and scripts: debug tooling, no rendering change), since `main` has no town. `main` has no GPU timer, so GPU ms there is n/a.

| Scene | Shot | Draws | Triangles | GPU ms (software) |
|---|---|---|---|---|
| hamlet | default | 90 | 0.10 M | n/a |
| hamlet | close | 63 | 0.10 M | n/a |
| hamlet | dusk | 77 | 0.11 M | n/a |
| hamlet | night | 75 | 0.11 M | n/a |
| village of 130 | wide | 217 | 0.88 M | n/a |
| village of 130 | golden | 230 | 0.87 M | n/a |
| village of 130 | night | 223 | 0.86 M | n/a |
| village of 130 | street | 218 | 0.95 M | n/a |
| town | wide | 156 | 2.67 M | 3655 |
| town | night | 161 | 3.46 M | 3897 |
| town | street | 144 | 2.67 M | 3871 |
| winter | wide | 85 | 0.11 M | n/a |

**Perf** (`v1-perf.mjs`, this branch, which draws exactly as `main` does; 10 s moving, 10 s idle, at the default camera of each scene: the hamlet at 45 tiles, the village at 70, the town at 90). Draws and triangles are averages over the moving part.

| Scene | Preset | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles |
|---|---|---|---|---|---|---|---|
| hamlet | low | 1101.8 / 3033.3 | 1130.7 / 2227.9 | 1221.4 / 1333.3 | 1149.7 / 1267.7 | 74 | 0.06 M |
| hamlet | medium | 1913.2 / 2149.9 | 1898.3 / 2269.8 | 2466.5 / 2766.5 | 2434.5 / 2747.6 | 104 | 0.12 M |
| hamlet | high | 1846.6 / 2016.6 | 1772.7 / 1934.8 | 2566.6 / 2733.2 | 2481.5 / 2613.1 | 83 | 0.17 M |
| hamlet | ultra | 1779.9 / 1849.9 | 1709.9 / 1795.6 | 2483.2 / 3033.2 | 2399.9 / 2960.8 | 82 | 0.18 M |
| village of 130 | low | 1749.9 / 2199.9 | 1576.5 / 1631.5 | 1058.3 / 1199.9 | 1006.2 / 1135.1 | 112 | 0.35 M |
| village of 130 | medium | 3416.5 / 3466.5 | 3496.5 / 3545.6 | 1969.9 / 2283.2 | 1923.3 / 2266.6 | 230 | 1.07 M |
| village of 130 | high | 3574.8 / 3583.3 | 3491.9 / 3499.7 | 2195.7 / 2549.9 | 2171.1 / 2562.3 | 241 | 1.87 M |
| village of 130 | ultra | 3658.2 / 3699.9 | 3580.6 / 3638.0 | 2916.6 / 3899.9 | 2833.9 / 3810.5 | 224 | 2.45 M |
| town | low | 2424.9 / 2566.7 | 2356.3 / 2465.8 | 1920.8 / 2816.6 | 2495.7 / 2784.2 | 76 | 1.15 M |
| town | medium | 4383.1 / 4766.5 | 4324.5 / 4670.6 | 2977.7 / 4516.5 | 4461.8 / 4526.6 | 148 | 2.66 M |
| town | high | 4699.9 / 4883.2 | 4652.8 / 4868.6 | 2816.6 / 4266.5 | 4165.2 / 4203.9 | 180 | 2.99 M |
| town | ultra | 5733.2 / 5733.2 | 5827.0 / 5827.0 | 5499.7 / 5499.7 | 4960.8 / 5706.9 | 148 | 4.96 M |

**Triangles per render layer** (`QOTI_LAYERS=1 v1-shots.mjs`, `__qoti.layerTriangles()`: each layer's root drawn alone from the shot's camera; the camera pass only, so the columns add up to the camera pass, and the whole frame adds the sun's shadow pass and the post quads):

| Shot | Buildings | Trees | Nature | Decor | Terrain | Agents | Animals | Carts | Effects | Water | Sky | Camera pass | Whole frame |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hamlet default | 18 k | 332 | 36 k | 932 | 15 k | 77 | 0 | 0 | 2 k | 0 | 960 | 0.07 M | 0.10 M |
| hamlet close | 12 k | 332 | 56 k | 932 | 4 k | 845 | 0 | 0 | 2 k | 0 | 960 | 0.08 M | 0.10 M |
| village wide | 77 k | 283 k | 14 k | 5 k | 34 k | 6 k | 8 k | 10 k | 32 k | 7 k | 960 | 0.48 M | 0.88 M |
| village golden | 151 k | 83 k | 45 k | 5 k | 11 k | 19 k | 11 k | 10 k | 32 k | 0 | 960 | 0.37 M | 0.86 M |
| village street | 72 k | 220 k | 81 k | 5 k | 11 k | 9 k | 11 k | 11 k | 32 k | 0 | 960 | 0.45 M | 0.94 M |
| town wide | 335 k | 53 k | 184 | 800 k | 40 k | 38 k | 0 | 0 | 32 k | 7 k | 960 | 1.31 M | 2.66 M |
| town night | 452 k | 87 k | 6 k | 800 k | 15 k | 76 k | 0 | 0 | 32 k | 0 | 960 | 1.47 M | 3.46 M |
| town street | 193 k | 76 k | 14 k | 800 k | 10 k | 53 k | 0 | 0 | 32 k | 0 | 960 | 1.18 M | 2.66 M |
| winter wide | 27 k | 0 | 19 k | 96 | 19 k | 3 k | 0 | 0 | 7 k | 0 | 960 | 0.08 M | 0.11 M |

What the numbers say, for the wave:

- **Draw calls fit everywhere**: at most 241 (the village on High; budget 450) and 230 on Medium (budget 300).
- **Half of every frame is the shadow pass**: the camera pass is 0.48 M of the village wide shot's 0.88 M and 1.31 M of the town's 2.66 M; the rest is the sun's shadow map drawing every caster again each frame. V1D's cached shadows remove it from nearly every frame.
- **Decor is the town's biggest layer, and it is never culled**: 800 k triangles in every town shot whatever the camera sees, because each decor kind is one instanced mesh over the whole valley, drawn whole. Per-instance culling and levels for decor (V1D's `lod.ts`, V1B's low levels for props) are the largest single saving in the wave.
- **Trees are the village's biggest layer**: 283 k of the wide shot's 0.48 M camera pass (V1C's before number for the 60% cut), 220 k in the street shot.
- **Buildings come next**: 335 k to 452 k in the town at full detail within 75 tiles, 151 k in the village at 45 tiles (V1B's low levels and `lod.ts`).
- **The town is at Medium's triangle budget**: 2.66 M on average while moving (budget 3 M) and 3.46 M in the night shot at 60 tiles, over it; Ultra's distances take it to 4.96 M (budget 12 M).
- **Idle frames cost as much as moving ones today** (no still-frame cache): the idle columns are the baseline V1D's cache has to beat (the budget is 4 ms of GPU on Medium on the weaker laptop).
- **Branch against `main`**: the same shots taken on this branch match `main` by eye and in numbers (draws and triangles within the few residents and carts that come and go). Pixel by pixel, 82 to 99.7% of each image is identical, and what differs is what moves with the clock: walking residents, chimney smoke, carts, the windmill's sails, swaying tree edges, and once a showcase-only desire path that the live sim's wear patch overwrites at a different moment in each run. The gallery's kit, grid, lineup (day and night) and trees views are identical to the pixel; its animated residents view differs from `main` as much as `main` differs from itself.

| Shot | Mean difference (0 to 255) | Pixels off by more than 8 | Identical pixels |
|---|---|---|---|
| hamlet default | 0.04 | 0.10% | 97.3% |
| hamlet close | 0.10 | 0.26% | 88.8% |
| hamlet dusk | 0.08 | 0.21% | 92.3% |
| hamlet night | 0.03 | 0.15% | 99.7% |
| village wide | 0.23 | 0.37% | 81.9% |
| village golden | 0.45 | 1.45% | 91.7% |
| village night | 0.27 | 0.98% | 86.8% |
| village street | 0.79 | 1.79% | 95.8% |
| town wide | 0.23 | 0.70% | 90.4% |
| town night | 0.24 | 1.07% | 91.8% |
| town street | 0.66 | 1.61% | 97.2% |
| winter wide | 0.08 | 0.20% | 95.2% |

**The owner's laptop** (2026-11-02, the V0 concept viewer on the lean renderer): a stable 30 fps on High and on Ultra, very smooth, with the sense that there is room for more detail. A flat 30 on both presets usually means the browser capped the frame rate (Chrome's Energy Saver, or macOS Low Power Mode, holds animation at 30 fps on battery) rather than that the GPU ran out, so the number to compare is the readout's GPU ms. Still to record, plugged in with Energy Saver off, on both laptops: the concept viewer's GPU ms on High and Ultra, and the game's timings from `QOTI_HEADED=1 node apps/client/e2e/v1-perf.mjs` (or `await __qoti.perf()` in a `?debug` valley's console, scene by scene). Kat's laptop, the weaker one that sets the 60 fps bar, has not been measured yet. V1A to V1D report against whatever of these exists when they open their PRs, and V1X fills the after column.
