# V2 wave notes: how the tracks meet

Read this with your brief. V2.0 fixed the types and the shared files (`docs/spec/20-architecture.md`, "V2 contracts"); these notes fix the handshakes between V2A (night), V2B (green) and V2C (what V1 left half-wired), so the pieces fit when V2X merges them. V2 touches no sim code: every hash stays the same. R1 runs beside this wave on other paths. If something here is wrong for you, say so in your PR and work around it; V2X decides.

## Rules for the wave (read first)

- **The look is the point, and the frame budget is the floor.** Visual quality is the owner's top priority ("how pretty it is, how cozy it is, and how detailed it is"); Kat's laptop's 60 fps on Medium (P50, measured by GPU frame time) is what every detail has to fit inside. Add detail the three cheap ways only (`17-presentation.md`, Visual direction, second pass): small static geometry in instanced draws, shader inputs read from small map-sized textures, work done once at rest. No new full-screen pass on a moving frame. Report `v2-shots.mjs <your stage>` stills and a `v2-perf.mjs` table in your PR, on this wave's scenes, so the numbers compare with the before numbers below.
- **Contracts are additive, indices append-only.** Add surface ids, pattern layers, uniforms, preset fields, light sources, dab options or exports; never rename, renumber or remove one. Surface ids and pattern layers are read by number in shaders, tests and gallery shots: a new one goes at the end, in a commit of its own, and the PR says so. `NOISE_LAYER` stays 19 and `ROOM_LAYER` stays 25.
- **Stay in your files.** Ownership is by file (below). Outside it, only small, necessary edits (a registry line, an export, an additive field, the one-line hooks named here), listed in your PR.
- **Nothing on screen changes outside your area.** Run `v2-shots.mjs` before you open the PR and look at every scene and every hour, not only yours.
- **Every static change goes through `ctx.invalidate()`** (or a static layer's `frame()` returning true, or `renderer.invalidateStatic()` from outside a layer). A change that skips it leaves a stale still frame on screen until the camera moves.
- **R1 runs alongside and owns other paths**: `packages/sim`, `packages/content`, `tools/bench`, `apps/client/src/{ui,input,state}`, every kit in `packages/art/src/kits/` but V2's six, and `render/layers/buildings.ts` (R1E). Never edit them, with the exceptions named below (one line in `ui/lenses.ts`; dab foliage and decor levels in a few R1E kit bodies).
- **Build and review loop** (`31-parallel-development.md`): every V2 cycle runs it with Opus executors this round (the owner's call), one or two rounds before the PR.

## Ownership by file

From the redesign's pairs (`31-parallel-development.md`, Tracks and ownership): V2 owns `packages/art/src/{materials,patterns,surface,palette}.ts`, the new `dabs.ts`, the kits `nature`, `trees`, `props`, `decor`, `vehicles` and `residents`, and `apps/client/src/render` but `layers/buildings.ts`. Split file by file (a file's test goes with it; a new file belongs to the track that makes it):

| Owner | `apps/client/src/render` | `packages/art/src` | Elsewhere |
|---|---|---|---|
| V2A night | `lightMap.ts`, `lighting.ts`, `material.ts`, `ground.ts`, `look.ts`, `renderer.ts`; `layers/{lights,water,festival,festivalFx,sky}.ts` | `materials.ts` (the kit shader and the resident material); new `rooms.ts` (the room generators) | |
| V2B green | `scatter.ts`; `layers/{trees,nature}.ts`; new `layers/meadow.ts` (the meadow carpet) and `drifts.ts` (the flower drift mask) | `dabs.ts`; `kits/{trees,nature}.ts` | `apps/gallery/src/seasons.ts` |
| V2C half-wired | `groundAo.ts`, `icons.ts`, `instances.ts`; `layers/{agents,carts,decor,effects}.ts`; new `wallAo.ts` (wall occlusion's shader patch) | `surface.ts` (the values of ids 20 to 24), `patterns.ts` (the five V2 surface generators); `kits/{props,decor,vehicles,residents}.ts` | `apps/gallery/src/{surfaces,figures}.ts`; one line in `apps/client/src/ui/lenses.ts` |
| Shared: additive only, listed in the PR | `env.ts`, `quality.ts`, `kitGeometry.ts`, `api.ts`; `layers/{index,types}.ts` | `geometry.ts`, `shapes.ts`, `rig.ts`, `palette.ts` (append tokens), `index.ts` (exports); `kits/{index,types}.ts` | `apps/gallery/src/main.ts` |
| V2X: no track edits these without V2X's say | `agentPlayback.ts`, `batch.ts`, `cache.ts`, `chunkDirt.ts`, `chunks.ts`, `coords.ts`, `cursorTrack.ts`, `defs.ts`, `drape.ts`, `fitShowcase.ts`, `folkShowcase.ts`, `gpuTimer.ts`, `layerTags.ts`, `lod.ts`, `picking.ts`, `pool.ts`, `post.ts`, `resolution.ts`, `roadShowcase.ts`, `seasons.ts`, `seasonsShowcase.ts`, `separation.ts`, `shadows.ts`, `showcase.ts`, `surface.ts`, `synthetic.ts`, `thumbnails.ts`, `townShowcase.ts`; `layers/{animals,blobs,critters,fields,flood,ghosts,notes,overlays,presence,roads,signs,telegraph,terrain,weather}.ts` | | `apps/client/src/app/{perf,debug}.ts`, `apps/client/e2e/{v2-shots,v2-perf}.mjs` |
| R1E (not V2) | `layers/buildings.ts` | `kits/` but the six: `animals`, `buildings`, `callings`, `construction`, `defenses`, `details`, `district`, `festival`, `fields`, `fineDecor`, `garden`, `goods`, `greens`, `grown`, `modules`, `parts`, `roofs`, `rows`, `services`, `style`, `trades`, `village`, `workplaces` | |

Carve-outs inside another track's file (each one function body, no signature change, listed in the PR):

- **V2B in `kits/decor.ts`** (V2C's): `fruitTree` (apple, cherry and pear crowns) and the `hedge` kit's body, which V2B points at its dab helpers in `kits/trees.ts`. V2C keeps out of both.
- **V2A in `patterns.ts`** (V2C's): the room stub line in `generatePatterns` (`for (let r = 0; r < ROOM_LAYERS; r++) put(ROOM_LAYER + r, null);`) becomes one call into `rooms.ts`.
- **V2C in `material.ts`** (V2A's): one line in `createWorldMaterial`'s `onBeforeCompile` calling `patchWallAo(shader, env)` from `wallAo.ts`.
- **V2C in `renderer.ts`** (V2A's): `setOverlay('bubbles')` turns the agents layer's bubbles on (and off with any other kind), two lines.
- **V2A in `layers/agents.ts`** (V2C's): one line passing `lightMapUniforms(env)` to the resident material.
- **R1E's kit files, V2's looks** (V2.0's master asks R1.0 to write the same carve-out into the R1 wave notes): V2B lays dabs in `ivyPart` and `hedgeRun` (`kits/details.ts`) and `reedBed` (`kits/greens.ts`); V2C gives far levels and V2 surfaces to the commonest decor pieces that live in `garden.ts`, `fineDecor.ts`, `greens.ts`, `callings.ts` or `festival.ts` (the lamp post, hanging lantern and the like). Kit bodies only; R1E keeps out of those kits during the pair. Building kits stay R1E's whatever they hold (their windows, shopfronts and walls are drawn by V2A's material without a kit edit).

## Handshakes

**The light map.** V2A owns it (`render/lightMap.ts`): the target, the writers, the one instanced draw and its blur, and every reader shader in V2A's files (ground, walls, folk and carts, water). Two readers live in other tracks' files and do not wait for V2A, because the stub already declares the reader side: V2B's trees and hedges (`render/scatter.ts`) and V2C's ribbon smoke (`layers/effects.ts`) bind `lightMapUniforms(env)` (`uLightMap`, `uLightMapXf`) into their material's uniforms, include `LIGHT_MAP_GLSL` and call `qLightMap(xz)`; it reads black until V2A draws the map. The map holds lamplight whatever the hour (linear RGB): each reader scales it by `env.night` itself. If V2A adds a shared helper (say a `qLamp(xz, up)` with the strength curve), it is appended to `LIGHT_MAP_GLSL` and the readers switch to it in V2X. A new light source is a new source name on `env.lightWriter` (see the table below); the stub's `lanterns` and `windows` stay.

**The dab kit.** V2B builds `brushDabs` (`packages/art/src/dabs.ts`) and is the only track that calls it: near tree crowns, the hedgerow and hedge, fruit trees, reeds, the reed bed and ivy. The signature is below; options are appended, never renamed or reordered. Both levels of a kit carry the same attributes (`surface.test.ts`): a far crown keeps today's shape with the dab tints in its vertex colors.

**Surfaces on props, carts and residents.** V2C writes the ids (`SURFACE.woodGrain` 20, `paintedWood` 21, `wroughtIron` 22, `terracotta` 23, `cloth` 24) in its kits through `ShapeBuilder.surface(id)`, and owns their table rows in `surface.ts` (mapping, scale, strength, accent) and their five generators in `patterns.ts`. V2A's material draws them: props, decor and carts already go through the kit material, which indexes the table up to `SURFACE_LAYERS` (25), so they show as soon as V2C's rows and generators land. Residents draw with `createResidentMaterial()` (`materials.ts`), which reads no surface today: V2A teaches it to (an optional `KitSurfaceUniforms` argument, additive) and `RigBuilder` (`rig.ts`, shared) gains an additive way to write ids, since it writes zeros now. Until V2A's part lands, residents carry V2C's ids and draw flat; V2X checks them in the street shots.

**Room layers and the pattern array.** The eight room layers sit at `ROOM_LAYER` (25) to 32 of `PATTERN_LAYERS` (33). V2A generates them in its own `rooms.ts` and samples them in the kit shader's glass. V2C's five surface generators and V2A's rooms together keep the whole array under V1A's 150 ms at load on Kat's laptop (`lastPatternMs()`).

**Wall occlusion.** V2C binds `groundAoFor(env)` (V1C's ground AO, a `{ value }` per world env, a white texel until the terrain layer sets it) in the kit material through `wallAo.ts`: `patchWallAo(shader, env)` adds the uniform and darkens a wall toward the ground (`texture(uGroundAo, world.xz / 192.0).r`, faded out a tile or two up). It anchors on a shader chunk V2A's patches do not replace (for example `#include <aomap_fragment>`), and says which in its PR; V2A keeps that chunk untouched.

**Cache invalidation.** Every static change goes through `ctx.invalidate()` or a static layer's `frame()` returning true; the renderer bumps `staticRevision`, the still-frame cache redraws, and today the shadow map re-renders too. A light-only change moves no caster, so V2A adds an additive way for a static change to drop the still frame without re-rendering the shadow map (an optional `RenderLayer.shadowless?: true`, implemented in `renderer.ts` with a second counter for the shadow trigger), uses it for the lights layer, and puts `env.lightMapRevision` in the still frame's key. V2B uses it for the meadow carpet. Until it lands, those changes re-render the shadow map as every static change does today: correct, only dearer.

**The meadow carpet's ground color.** The carpet takes each blade's color from the ground texture V1C built (`GroundTextures` in `render/ground.ts`, one texel a tile: color in RGB, wildflower density in A; meadow amount in the detail texture's A) and its shading from the ground's normal, so it reads as one mass with the painted ground. V2B reads those textures (an accessor from the terrain layer, additive) and does not edit the ground shader. The flower drift mask lives in V2B's `drifts.ts`; the ground's painted dots take it through one line in `GroundTextures` (V2B's listed edit in V2A's `ground.ts`). Any other ground shader change V2B needs (say the shader's own meadow combing fading where the carpet stands) is a note to V2A, made by V2A.

**Bubbles.** One line in `apps/client/src/ui/lenses.ts`'s `overlays` registry (the View list), `{ id: 'bubbles', lens: 'hearth', ... }`, and the route in `Renderer.setOverlay` above. The rest of `ui/` is R1C's: if R1C reworks the toolbar, the line stays a registry line and R1X carries it.

**Era lamp colors.** Candlelight is the lantern token (the Old Age), gas a greener gold, electric a paler warm white (`18-eras.md`). V2A owns the table (tokens appended to `palette.ts`) and picks a disc's color by the era of the piece or district; every valley is in the Old Age until I4, so V2A shows the other two in the gallery or behind a `?debug` parameter.

## The light map's writers and readers

Every writer is V2A's. Discs are `LightDisc { x, z, radius, color, intensity }` (world tiles, sRGB hex, 1 a lit lantern's pool), set per source with `env.lightWriter.set(source, discs)`.

| Writer | Source name | Where it comes from | File | Owner |
|---|---|---|---|---|
| Lanterns and lamps | `lanterns` (V2.0) | decor kits' `anchors().lights` (lantern, lamp post, hanging lantern, wall lantern, festoons), every night | `layers/lights.ts` | V2A |
| Window spill | `windows` (V2.0) | building kits' `anchors().lights`, the panes `windowLit` lights for the hour, 0.3 tiles out from the wall | `layers/lights.ts` | V2A |
| Oven doors | `ovens` | buildings whose kit bakes or smelts (by `artKitId`, since R1 keeps the kit ids as trade looks), a disc at the entrance | `layers/lights.ts` | V2A |
| Fires | `fires` | the bonfire (its `anchors().lights` sit in `lanterns` today; V2A moves them here with a larger, redder disc) | `layers/lights.ts` | V2A |
| Festival lights | `festival` | the festoon lanterns round the festival's site, its day only | `layers/festival.ts` | V2A |
| Shop fronts | `shops` | shops and stalls (by `artKitId`), a wide disc before the entrance in the evening hours | `layers/lights.ts` | V2A |

| Reader | What it does with it | File (material) | Owner |
|---|---|---|---|
| Ground and roads | in place of the 32-light loop (`uLights`, `MAX_GROUND_LIGHTS`) | `render/ground.ts` (`createGroundMaterial`, terrain layer) | V2A |
| Walls, decor, carts, animals | sampled a little in front of the face along its normal, fading out between 1.5 and 4 tiles up | `packages/art/src/materials.ts` (`patchKitShader`), bound in `render/material.ts` (`createWorldMaterial`) | V2A |
| Folk | a warm rim | `packages/art/src/materials.ts` (`createResidentMaterial`), made in `layers/agents.ts` | V2A |
| Carts (the rim) | carts draw with the kit material (`ctx.material`), so the wall read covers them; a rim for moving pieces alone is V2A's call | as walls | V2A |
| Water | read through the ripples, so lamplight trembles on the river; off on Low | `layers/water.ts` (`createWaterMaterial`) | V2A |
| Trees, bushes, ferns, reeds | lit from below | `render/scatter.ts` (`createFoliageMaterial`, shared by `layers/trees.ts` and `layers/nature.ts`) | V2B |
| Meadow carpet | as the ground | new `layers/meadow.ts` | V2B |
| Hedges and fruit trees (decor) | through the kit material, as walls | as walls | V2A |
| Smoke | ribbons take the glow at night | `layers/effects.ts` | V2C |

## The dab kit's signature

`packages/art/src/dabs.ts`, exported from `@qoti/art`. The stub writes nothing and returns 0.

```ts
/** One soft blob of foliage, in the kit's local space (tiles; y up). */
export interface DabBlob {
  center: V3;
  /** Its radii along x, y and z (an ellipsoid). */
  radii: V3;
  /** Where the soft normal points from (shared by blobs that shade as one mass). Defaults to center. */
  normalFrom?: V3;
  /** The blob's base color (sRGB hex, a palette 2.0 foliage swatch). */
  color: number;
}

/** How the dabs are laid. Every value is a plain number, so a kit's key stays a string of them. */
export interface DabOptions {
  count: number; // dabs over all the blobs, before gaps and thinning (a near crown: 180 to 320)
  size: number; // a dab's size in tiles (the side of its triangle)
  tintSpread: number; // 0 to 1
  skyLighten: number; // 0 to 1, lighter toward the sky
  gaps: number; // 0 to 1, the share left open to show the boughs
  thin: number; // the season: 1 full, 0 bare; dabs drop in a fixed order
  seed: number; // the kit's opts.seed
}

/** Lays dabs over `blobs` into `b` with surface leaf; returns the triangles written. */
export function brushDabs(b: ShapeBuilder, blobs: readonly DabBlob[], opts: DabOptions): number;
```

The caller sets the builder's level and any `glow` first; `brushDabs` restores the surface id as it found it. Opaque triangles only: no alpha test, no transparency.

## Static-layer events

What drops the still-frame cache in V2, beyond V1's list:

| Event | How often | How |
|---|---|---|
| A light map redraw | a lamp lit or put out, a window's quarter-hour step at dusk and dawn, a festival's lights, a building added or gone | the writer's layer returns true from `frame()` (the lights layer does already); `drawLightMap` redraws once that frame. With V2A's shadowless change, no shadow render |
| Dab thinning by season | at most once an in-game day, from Autumn day 4 to winter | `thin` stepped in quarters (1, 0.75, 0.5, 0.25, 0), each step's geometry built once and cached; the trees and nature layers swap and return true. Winter keeps today's bare twigs (`uBare` in `scatter.ts`). Never a per-frame rebuild |
| The meadow carpet's near ring | as the view moves | a static layer, never casting, filled by chunk (16 x 16 tiles) within the preset's distance plus a margin. It refills at rest, and while moving only when the view leaves the inner half of the filled area (the shadow frustum's rule), so a pan refills it every 15 tiles or so, not every frame. Shadowless once V2A's change lands. It is not a moving layer: 40 to 60 blades a meadow tile would be drawn again on every idle frame |
| V2C's far levels for decor | as before | the decor layer's level swaps, as V1D built them |

## Animation inside static layers

| Effect | Where | Decision |
|---|---|---|
| Lamplight flicker | the kit material's glow on lantern flames (`glow` 2) | runs on `env.staticTime`, so it pauses at rest (like V1's sway). The light map's pools never flicker: the map is static and redraws only on a change. If a flame frozen at rest is missed at the playtest, V2A adds a moving layer of small instanced halos at the flames (one draw), never a per-frame light map redraw |
| Ribbon smoke | `layers/effects.ts` (moving) | moving layer, as the puffs are today: drawn on every idle frame, so it stays one instanced draw |
| Meadow sway | the carpet's vertex shader (`layers/meadow.ts`) | `env.staticTime`, paused at rest, as `scatter.ts` sways tufts and crowns |
| Dab crowns swaying | `render/scatter.ts` | as today, `env.staticTime` |
| Rooms behind windows | the kit material's glass | not animation: the parallax follows the camera (still at rest), the room comes from the building's seed |
| Era lamp colors, oven doors, shop fronts | light map discs | changes, not animation: a light map redraw |

## Stand-ins (every track fills its row before its PR)

| What | Stand-in until the owner lands | Owner |
|---|---|---|
| The light map | **V2A built**: `drawLightMap` draws every disc of every source in one instanced draw of soft additive discs into a scratch target, then one blur pass into `env.lightMap`, only on a frame a writer changed something (two draws; a clear with no disc; `lightMapStats(env)`, and `?debug` logs each redraw's time). Sources: `lanterns`, `windows`, `fires`, `ovens`, `shops` (`layers/lights.ts`, shadowless) and `festival` (`layers/festival.ts`). The 32-light loop stays behind `?debug&lights=loop` (`LIGHT_LOOP`), where no shader reads the map, for V2X to measure both and retire it | V2A |
| Light map readers | **V2A built** the ground (in place of the loop), walls and every kit piece (`patchKitShader`'s `lamp`, `KitLampOptions`), folk (a warm rim, `createResidentMaterial`) and the river (through its ripples, none on Low). `qLamp(xz, up)`, the shared strength curve (a smooth ceiling where pools crowd, fading out between 1.5 and 4 tiles up), is appended to `LIGHT_MAP_GLSL`: V2B's trees and V2C's smoke can switch to it in V2X | V2A (ground, walls, folk, water), V2B (trees), V2C (smoke) |
| A static change without a shadow render | **V2A built**: `RenderLayer.shadowless?: true` (the lights layer has it); the renderer counts caster changes apart (`render/statics.ts`), and `env.lightMapRevision` is in the still frame's key | V2A |
| Rooms behind windows | **V2A built**: eight rooms painted in code (`packages/art/src/rooms.ts`, one call from `generatePatterns`); the kit shader's glass shows one by parallax (`qKitRoom`, `patchKitShader`'s `rooms`), picked by the building's origin and the room cell (`roomFor`); `QualityPreset.rooms`, off on Low (the flat glow). A figure shows by seed; one only when someone is home waits for a per-building value from the buildings layer (R1E's) | V2A |
| Era lamp colors | **V2A built**: `palette.lampCandle`, `lampGas`, `lampElectric` and `LAMP_COLORS`; a disc takes `lampColor(def.eras)` and flames `flameColor(era)` (the Old Age keeps the glow's candle); `?debug&era=steam` or `bright` shows the other two. Every valley is in the Old Age until I4 | V2A |
| V2 surfaces | ids 20 to 24 in `SURFACE` and `SURFACES` (strength 0, flat layers), drawn flat; `SURFACES[19]` is `undefined` (the noise layer's slot); the gallery leaves them out (`SURFACE_ORDER` stops below `NOISE_LAYER`). **V2C: done** (rows, generators, the gallery's fourth row; props, decor, carts and residents write them). **V2A built** the residents' side: `createResidentMaterial(surface?, lamp?)` (or `bindResidentMaterial`) draws surface ids through the kit's table, and `RigBuilder.surface(id)` writes them | V2C (ids, rows, generators, gallery), V2A (residents' material) |
| The dab kit | `brushDabs` writes nothing and returns 0; no kit calls it | V2B |
| Meadow carpet and drifts | none: the tufts (`meadowTuft`) and the ground's painted flowers as today | V2B |
| Wall occlusion | `groundAoFor(env)` offered, not bound in the kit material. **V2C: done** (`wallAo.ts`; anchors `#include <aomap_fragment>` and, in the vertex shader, `#include <fog_vertex>`: V2A keeps both) | V2C |
| Ribbon smoke | the puffs (`layers/effects.ts`). **V2C: done** (one instanced draw of ribbons; reads `qLightMap` per vertex, black until V2A draws the map) | V2C |
| Bubbles | built (`setBubbles` on `RenderApi`), nothing calls it. **V2C: done** (Moods on the Hearth View list) | V2C |
| Decor far levels | the fruit trees only; small props shrink away at the decor distance. **V2C: done** for the dozen commonest; small props still shrink away beyond the decor distance (letting the ones with a far level stay is a one-line choice in `layers/decor.ts`'s `decorKind`, left to V2X) | V2C |
| Preset rows (`17-presentation.md`) | light map texels in `LIGHT_MAP_TEXELS` (2, 4, 6, 8); **V2A built** `QualityPreset.rooms` and `QualityPreset.lampWater` (both off on Low); no meadow field yet | V2A (rooms, water reflection off on Low), V2B (meadow carpet within: none, 30, 45, 60) |
| The grown village | `?debug&fixture=grown`, the V2.0 snapshot (version 5) | V2.0 (done); R1X regrows it |
| Both laptops' before tables | `docs/playtests/V1.md`, Measuring the laptops (V2.0) | the owner and Kat |

## Ports

| Cycle | Client | Relay |
|---|---|---|
| V2.0 | 5210 | 8820 |
| V2A | 5211 | 8821 |
| V2B | 5212 | 8822 |
| V2C | 5213 | 8823 |
| V2X | 5214 | 8824 |

Start the relay with `PORT=<relay> npm run start -w @qoti/dev-server` and the client with `QOTI_CLIENT_PORT=<client> QOTI_RELAY_PORT=<relay> npm run dev -w @qoti/client`, then point the scripts at it with `QOTI_CLIENT_PORT`. R1's cycles use 5221 to 5227 and 8831 to 8837.

## The grown village

A real town for the shots and the perf runs, beside V1's synthetic showcases: the standard start played by the bench's autoplayer (`tools/bench`) to about 150 residents, Village rank and a festival's worth of decor, saved as a valley and opened live with `?debug&fixture=grown`. It is the scene this wave is judged on, because it is what a player's town looks like at night.

- **Regrow it** with `npm run fixture:grown -w @qoti/client`: it runs `tools/bench/src/tune.ts` with a fixed seed and day count and `TUNE_SAVE` pointing at the fixture's file, so one command makes a new snapshot.
- **R1X must regrow it.** R1 replaces the economy and starts every valley fresh (`21-networking-and-saves.md`, The fresh start): from `SAVE_VERSION` 6 the game refuses older valleys, so the V2.0 snapshot stops loading the moment R1X merges, and `?debug&fixture=grown`, `v2-shots.mjs` and `v2-perf.mjs` fail on it. R1X runs the command on the new autoplayer and commits the new snapshot in the same PR.
- **Comparing across the fresh start.** A regrown town is a different town. V2A to V2C shoot on the V2.0 snapshot. V2X shoots `after` on it from the V2 branch before merging R1X's `main`; if R1X has merged by then, V2X also shoots the regrown town, and that set is V3's before.

## The scenes and scripts

- `node apps/client/e2e/v2-shots.mjs <stage> [scene ...]`: V1's scenes (the hamlet, the village of 130, the town, winter) and the grown village, each by day, golden hour and night, at 1440 x 900 on Medium with the interface hidden and dynamic resolution off. Saves `docs/build/screenshots/v2-<stage>-<scene>-<shot>.png`. `before` is V2.0's; a track PR uses its own stage (`v2a`, `v2b`, `v2c`); `after` is V2X's. V2.0 retook every scene on its own branch (stage `check`, not kept) and found it matching `before` by eye; the pixels that differ are folk, carts and smoke, except one: the town's wide shot sometimes catches the showcase's garden trees between the houses and sometimes not (`v2-before-town-wide.png` has them; a retake from `main` the same evening had none), so compare that shot's trees with a second take before blaming a change. V2B, whose trees they are, should find out why and make the shot wait for them.
- `node apps/client/e2e/v2-perf.mjs [scene ...]`: per scene and preset, the camera path and the rest, as `v1-perf.mjs`, with the grown village added and a night run. `QOTI_HEADED=1` runs it on the laptop's GPU.
- **Measure this laptop** (Settings): the same run in the valley on screen and the village and town showcases, every preset at 11:00 and Medium and High again at 22:00 (eighteen rows, an Hour column; the night rows are what V2's night acceptance reads), a table to copy, and the run kept with the valley (`/api/valleys/:id/perf`, the last three per seat).
- `window.__qoti.layerTriangles()` gives each layer's triangles from the current camera: report your layers' before and after with it (V2B's trees, nature and meadow layers especially).

## Before numbers

Taken by V2.0 on 2026-11-10 from the branch before any V2 art (its rendering code is `main`'s), in the build container's software renderer. The laptop tables are the owner's and Kat's (Measure this laptop, `docs/playtests/V1.md`); V2X cannot ship without them.

How they were taken: headless Chromium in the build container, which has no GPU, so WebGL runs in SwiftShader (software). Draw calls and triangles are real; **every millisecond below, frame and GPU alike, is the CPU doing the GPU's work in SwiftShader**, good for ratios at best. The container is shared with other sessions, so even the ratios wobble. The owner's and Kat's laptops give the real timings (Measure this laptop).

### Scenes

- **hamlet**: the hamlet fixture (`?debug&fixture=hamlet`).
- **village**: the village fixture dressed by the dense village showcase (`villageShowcase(true)`, 140 buildings), the village of 130.
- **town**: `townShowcase()` (1,000 buildings, 4,000 decor, 2,000 trees, 2,000 synthetic residents).
- **winter**: the winter fixture.
- **grown**: `?debug&fixture=grown`, the village the bench's autoplayer grew (seed rowan, 60 days: 155 residents, 61 households, Village rank since day 32, 153 buildings of which 33 grew on lots, 875 decor including 157 lanterns, at least eight festivals held, renown level 3). Regrow it with `npm run fixture:grown -w @qoti/client`. Its high street (the middle of its six shop lots) is at about (145, 87) and the middle of its buildings at (137, 85).

### Shots

`QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_CLIENT_PORT=5216 node apps/client/e2e/v2-shots.mjs before` (Medium, 1440 x 900, interface hidden, dynamic resolution off; stills in `docs/build/screenshots/v2-before-*.png`). Every scene pins its season's look and clear weather (`season=summer&day=3&weather=clear`, the winter fixture `season=winter&day=3&weather=clear`): unpinned, the hamlet fixture starts on the first morning of spring mid-thaw, so its day shot came out snowy and its night shot green, and the grown village starts an hour before autumn.

Read the draws and triangles here with care: they are the last frame drawn before the screenshot, and once a scene has settled that is often a still-cache frame, which draws only the moving layers over the cached picture (the hamlet's 12 draws and 2,500 triangles). They do not compare shot to shot; the perf tables below do.

| Scene | Shot | Draws | Triangles | Frame ms (CPU) | GPU ms |
|---|---|---|---|---|---|
| hamlet | day | 73 | 0.12 M | 4.4 | 2440.4 |
| hamlet | golden | 12 | 0.00 M | 4.1 | 1096.0 |
| hamlet | night | 12 | 0.00 M | 1.1 | 510.0 |
| hamlet | close | 7 | 0.00 M | 1.0 | 345.7 |
| village | wide | 153 | 0.34 M | 7.8 | 3150.5 |
| village | golden | 83 | 0.07 M | 1.7 | 2663.7 |
| village | night | 77 | 0.07 M | 2.2 | 859.8 |
| village | street | 69 | 0.06 M | 2.1 | 803.5 |
| town | wide | 122 | 0.49 M | 5.2 | 2043.7 |
| town | golden | 46 | 0.14 M | 4.6 | 1578.1 |
| town | night | 46 | 0.12 M | 1.7 | 608.8 |
| town | street | 29 | 0.07 M | 1.5 | 734.1 |
| winter | day | 86 | 0.09 M | 2.1 | 1406.9 |
| winter | night | 31 | 0.02 M | 1.5 | 702.7 |
| grown | wide | 37 | 0.05 M | 2.0 | 1472.6 |
| grown | golden | 62 | 0.06 M | 1.6 | 208.0 |
| grown | night | 55 | 0.05 M | 2.9 | 745.7 |
| grown | street | 43 | 0.05 M | 1.5 | 546.9 |

### Perf, Medium, sim paused

`QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_CLIENT_PORT=5216 QOTI_FIXEDRES=1 QOTI_HOLD=1 QOTI_PRESETS=medium node apps/client/e2e/v2-perf.mjs` (about 10 minutes). 10 s moving (the scripted pan, orbit and zoom), 10 s idle, at each scene's default camera (the hamlet at 45 tiles, the village at 70, the town at 90, the grown village at 70 from the middle of its buildings). Draws and triangles are averages over the moving part.

headless (software renderer), lean engine, fixed resolution, sim paused, 1440 x 900, 10 s moving, 10 s idle:

| Scene | Preset | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|
| hamlet | medium | 1304.7 / 5099.8 | 1276.6 / 2846.1 | 3308.2 / 3683.2 | 3204.1 / 3664.0 | 71 | 0.27 M | 0 / 1 / 1, 1 |
| village | medium | 1613.9 / 4099.8 | 1590.6 / 4188.3 | 4049.8 / 4116.5 | 4012.5 / 4081.2 | 141 | 0.28 M | 0 / 1 / 1, 1 |
| town | medium | 408.3 / 683.4 | 406.6 / 573.7 | 3841.5 / 4083.1 | 3825.8 / 4059.2 | 97 | 0.31 M | 0 / 1 / 1, 1 |
| grown | medium | 1483.3 / 3716.6 | 1454.7 / 3692.6 | 3958.2 / 3983.2 | 3883.5 / 3934.5 | 128 | 0.40 M | 0 / 2 / 0, 2 |

In the idle 10 s a software frame takes about four seconds, so the rest holds only one or two frames (the last column): the idle columns are one frame's cost, the cache's first still render, not an idle average.

### Perf, every preset, sim running

`QOTI_CHROMIUM=/opt/pw-browsers/chromium QOTI_CLIENT_PORT=5216 QOTI_FIXEDRES=1 node apps/client/e2e/v2-perf.mjs` (22 minutes, 19:59 to 20:21). The same cameras, each preset in turn, with the sim running at speed 1.

headless (software renderer), lean engine, fixed resolution, 1440 x 900, 10 s moving, 10 s idle:

| Scene | Preset | Moving frame ms (avg / p95) | Moving GPU ms (avg / p95) | Idle frame ms (avg / p95) | Idle GPU ms (avg / p95) | Draws | Triangles | Rest: moving / still / idle frames, shadow renders |
|---|---|---|---|---|---|---|---|---|
| hamlet | low | 945.0 / 2516.6 | 877.4 / 1013.5 | 975.0 / 1350.0 | 939.3 / 1268.3 | 72 | 0.05 M | 8 / 0 / 0, 2 |
| hamlet | medium | 2037.4 / 2983.1 | 1952.1 / 2867.5 | 2287.4 / 2466.6 | 2183.4 / 2355.0 | 75 | 0.21 M | 0 / 3 / 1, 3 |
| hamlet | high | 3416.5 / 3649.8 | 3305.7 / 3519.7 | 3649.9 / 3799.9 | 3539.4 / 3676.0 | 91 | 0.78 M | 0 / 2 / 0, 2 |
| hamlet | ultra | 0.0 / 0.0 | n/a / n/a | 2241.6 / 5816.5 | 3145.1 / 6229.8 | 0 | 0.00 M | 0 / 2 / 2, 2 |
| village | low | 1283.3 / 1549.9 | 1139.4 / 1267.6 | 2029.1 / 2349.8 | 1970.2 / 2333.8 | 119 | 0.22 M | 4 / 0 / 0, 3 |
| village | medium | 2395.8 / 3283.3 | 3092.6 / 3247.4 | 3383.1 / 3383.1 | 3421.2 / 3637.6 | 190 | 0.34 M | 0 / 1 / 0, 1 |
| village | high | 4608.1 / 4683.1 | 4548.6 / 4563.1 | 4058.1 / 4816.4 | 3949.0 / 4742.6 | 224 | 1.99 M | 0 / 2 / 0, 2 |
| village | ultra | 0.0 / 0.0 | n/a / n/a | 3299.9 / 8982.9 | 3322.4 / 9207.0 | 0 | 0.00 M | 0 / 1 / 2, 1 |
| town | low | 1454.2 / 1683.3 | 1388.0 / 1564.0 | 1696.6 / 2749.8 | 1674.9 / 1868.9 | 83 | 0.31 M | 5 / 0 / 0, 1 |
| town | medium | 0.0 / 0.0 | n/a / n/a | 1644.4 / 3899.9 | 1580.1 / 3869.5 | 0 | 0.00 M | 0 / 2 / 4, 2 |
| town | high | 3458.2 / 6883.1 | n/a / n/a | 7233.1 / 7233.1 | 7183.3 / 7183.3 | 88 | 0.68 M | 0 / 1 / 0, 1 |
| town | ultra | 0.0 / 0.0 | n/a / n/a | 0.0 / 0.0 | n/a / n/a | 0 | 0.00 M | 0 / 0 / 0, 0 |
| grown | low | 1261.8 / 1866.5 | 1383.8 / 1833.3 | 1696.6 / 3299.8 | 1666.2 / 1784.1 | 112 | 0.26 M | 5 / 0 / 0, 5 |
| grown | medium | 3424.9 / 6816.4 | n/a / n/a | 3758.2 / 4366.5 | 3702.3 / 4296.7 | 183 | 0.56 M | 0 / 2 / 0, 2 |
| grown | high | 5799.8 / 5799.8 | 5795.6 / 5968.6 | 5649.7 / 5649.7 | 5567.7 / 5567.7 | 213 | 2.05 M | 0 / 1 / 0, 1 |
| grown | ultra | 33.3 / 33.3 | n/a / n/a | 7633.1 / 7633.1 | 6664.8 / 7605.8 | 54 | 0.07 M | 0 / 1 / 0, 1 |

The zeros are not fast frames: when one software frame takes longer than the part being measured, the part records no frame (0.0 ms, n/a, 0 draws), as on Ultra moving in most scenes, the town's Medium moving and every part of the town on Ultra. The grown village's Ultra moving row (33.3 ms, 54 draws, 0.07 M) is a single partial frame and means nothing. The rows that do compare: draws and triangles where a moving frame was recorded, and Low, where frames are short enough to count several.

### What the before set says, for the wave

- **The grown village is the heaviest of the four on Medium**: 183 draws and 0.56 M triangles moving with the sim running (the village of 130: 190 and 0.34 M), 128 draws and 0.40 M with the sim paused, and 213 draws and 2.05 M on High. Its 875 decor (157 lanterns, 165 cherry trees, 483 planters and flower beds) and 8,250 trees are real, not a showcase, so it is the scene to judge V2's night lighting and green by.
- **Draw calls fit everywhere measured**: at most 224 (the village on High; budget 450) and 190 on Medium (budget 300).
- **Night matters most**: in the night shots today's light is lit windows, the street lamps' pools and a lantern's glow on the ground at a few spots (the grown village's 157 lanterns light almost nothing around them); these are the light map's first writers.
- **One number to distrust**: the town's paused Medium moving average (408 ms) is far below every other scene's; with frames this slow it likely counts a few cheap frames during the camera path, not a lighter town.
- **Software timings are not budgets**: a Medium frame takes 1.3 to 4 s here; the laptops' tables decide.
