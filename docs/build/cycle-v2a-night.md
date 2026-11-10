# V2A: Night

**Iteration**: V2 Light and green. **Wave**: parallel. **Branch**: `cycle/v2a-night`, from `cycle/v2-0-look-contracts`'s tip.
**Depends on**: V2.0. **Runs alongside**: V2B, V2C (and R1's wave, which owns sim, content, bench, UI and the building kits). **Ports**: client 5211, relay 8821.

## Goal

Night becomes the game's signature. One top-down light map carries every lantern, lamp, lit window's spill, oven door, fire, festival light and shop front, and the ground, the walls, the folk and the river read it, so in a real town every light lights something and the town glows from the valley's edge. Each lit pane shows a little room by parallax, and a lamp's color says its era. All of it costs no more on a moving night frame than the 32-light loop it replaces.

## Read

- `CLAUDE.md`, `docs/build/v2-wave-notes.md` (all of it: the light map's writers and readers are yours)
- `docs/spec/17-presentation.md`: Visual direction, second pass (the rule that makes detail cheap; 1. Night as the signature), Quality presets (the V2 rows)
- `docs/spec/22-quality.md`: Performance budgets, The redesign: measuring first, then budgets
- `docs/spec/20-architecture.md`: Lean renderer [V1] (and its As built notes), V2 contracts
- `docs/spec/18-eras.md`: The three eras, The era moment (lamps by era)

## You own

The V2A row of the wave notes' ownership table: `apps/client/src/render/{lightMap,lighting,material,ground,look,renderer}.ts`, `render/layers/{lights,water,festival,festivalFx,sky}.ts`, `packages/art/src/materials.ts`, a new `packages/art/src/rooms.ts`.

Outside these paths: only small, necessary edits (registry lines, exports, additive contract changes, the one-line hooks the wave notes name: the room call in `patterns.ts`, the resident material's uniforms in `layers/agents.ts`), listed in the PR.

## You can rely on

V2.0: `env.lightMap`, `env.lightMapRevision`, `env.lightWriter` (`LightMapWriter`: `set`, `clear`, `discs`, `dirty`, `takeDirty`, `requestRedraw`), `LightDisc`, `LIGHT_MAP_TEXELS`, `lightMapSize`, `resizeLightMap` (called in `setQuality`), `drawLightMap` (called once a frame after the layers' `frame()`), `lightMapUniforms(env)` and `LIGHT_MAP_GLSL` (`qLightMap(xz)`); the lights layer feeding `lanterns` and `windows`; `ROOM_LAYER` (25), `ROOM_LAYERS` (8) and `PATTERN_LAYERS` (33) with flat room layers; the grown village (`?debug&fixture=grown`), `v2-shots.mjs`, `v2-perf.mjs`, Measure this laptop, and the before numbers in the wave notes. V1: the still-frame cache, cached shadows, the bloom chain, `windowLit` and `env.windowShare`, `env.staticTime`.

## Tasks

1. **A static change without a shadow render** (do it first, in a commit of its own, so V2B can use it): an additive `RenderLayer.shadowless?: true` whose changes drop the still frame but leave the shadow map alone (a second counter beside `staticRevision` for the shadow trigger in `renderer.ts`), and `env.lightMapRevision` in the still frame's key. The lights layer is shadowless. Unit test: a shadowless change redraws the still frame and renders no shadow.
2. **Draw the map** (`drawLightMap`): every disc of every source in one instanced draw of soft additive discs into `env.lightMap`, then one blur; allocated on the first draw; only when a writer changed something. A test counts the draws and checks the map is not redrawn on a frame with no change.
3. **Writers** (the wave notes' table): tune `lanterns` and `windows`; add `ovens`, `fires`, `festival` (from `layers/festival.ts`) and `shops`, keyed by `artKitId` so they survive R1's trade looks. No building kit edit: building kits are R1E's.
4. **Lamp color by era**: candlelight (the Old Age's lantern token), gas a greener gold, electric a paler warm white, as tokens appended to `palette.ts`; a disc and its flame take the era of the piece or its district. Every valley is in the Old Age until I4: show the other two in the gallery's night lineup or behind a `?debug` parameter.
5. **Readers**: the ground in place of the 32-light loop (keep the loop behind a `?debug` switch until V2X has measured both, then V2X retires it); walls and every kit piece (sampled a little in front of the face along its normal, fading out between 1.5 and 4 tiles up); folk (a warm rim in `createResidentMaterial`, given `lightMapUniforms(env)` from the agents layer); carts and animals through the kit material; the river through the ripples (none on Low). Every reader scales the map by `env.night`. If a shared strength curve helps V2B's trees and V2C's smoke, append it to `LIGHT_MAP_GLSL`.
6. **Rooms behind the windows**: eight rooms in `rooms.ts` (walls, a shelf, a table, a figure), generated into the room layers in code; the kit shader's glass shows one by parallax, picked by the building's seed, a handful of shader operations on window pixels only. Low keeps the flat glow (`QualityPreset.rooms`, additive, off on Low). A figure appears by seed: a figure only when someone is home needs a per-building value from the buildings layer (R1E's), so it waits for a later wave; say so in the PR.
7. **Residents draw surfaces**: `createResidentMaterial` reads the `surface` attribute (an optional `KitSurfaceUniforms` argument, additive), so V2C's ids on residents show.
8. **Lamplight flicker** on the flames' glow, on `env.staticTime` (paused at rest; the wave notes, Animation inside static layers). The map's pools never flicker.
9. Fill your rows in the wave notes' stand-ins table; add your As built lines to `20-architecture.md` (V2 contracts).

## Acceptance criteria

- [ ] In the grown village and the town at night, every lantern and every lit window lights the ground and the walls beside it, lamplight shows on the river, and a town reads as a glow from the valley's edge (`v2-shots.mjs v2a` night shots beside `v2-before-*`).
- [ ] Night with the light map (`22-quality.md`): a night moving frame costs no more GPU time than the 32-light loop on the same scene (`v2-perf.mjs` at night, the map and the loop on the same build, both in the PR); the map redraws in under 2 ms, in one instanced draw, only when a light changes (test, and the redraw time logged in the PR).
- [ ] Moving frames add no full-screen pass; draws stay within 300 on Medium and 450 on High and Ultra; the idle frame stays within 4 ms GPU on Medium.
- [ ] The presets (`17-presentation.md`, Quality presets): light map 2, 4, 6 and 8 texels a tile, no water reflection on Low; rooms off on Low (flat glow), on from Medium.
- [ ] Rooms read as varied little rooms at street zoom and as livelier windows from the default camera; the pattern array (with V2C's layers) stays under 150 ms at load (`lastPatternMs()`).
- [ ] Unit tests: the shadowless change, the map's redraw only on change and its one draw, the new writers' sources, the era colors, the rooms' seed choice.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

Trees and hedges reading the map (V2B, in `scatter.ts`), ribbon smoke reading it (V2C), surface ids on props, carts and residents and their patterns (V2C), wall occlusion (V2C), building kits and their windows (R1E), homes lit by their candle supply (R3), any sim change.

## Notes

- Run the build and review loop (`31-parallel-development.md`) with Opus executors (model `opus`): the owner's call for this round.
- Compare against the `v2-before-*` shots with `node apps/client/e2e/v2-shots.mjs v2a`, every scene and hour (nothing outside night should change), and report `v2-perf.mjs` numbers in the PR, night included.
- Cozy first: warm, soft light, never a floodlit street. Lamplight should pool and fade; walls take a breath of it, not a wash.
- V2B and V2C bind the map in their own files through the stub's uniforms and do not wait for you; do not change `lightMapUniforms` or `qLightMap`'s signature, only append.
- Open the PR into `main` when ready (V2 touches no sim state and merges as it goes); V2X merges whatever is still open, yours first.
