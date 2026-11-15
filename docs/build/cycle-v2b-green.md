# V2B: Green

**Iteration**: V2 Light and green. **Wave**: parallel. **Branch**: `cycle/v2b-green`, from `cycle/v2-0-look-contracts`'s tip.
**Depends on**: V2.0. **Runs alongside**: V2A, V2C (and R1's wave, which owns sim, content, bench, UI and the building kits). **Ports**: client 5212, relay 8822.

## Goal

The green half of the picture is painted like the buildings. Near tree crowns, hedges, reeds and ivy are laid in brush dabs, each a little apart in tint and lighter toward the sky; meadows near the camera are a soft carpet of blades that takes its color from the painted ground and melts into it with distance; flowers grow in drifts. They thin through autumn, and they glow faintly from below at night. All of it is opaque geometry inside the village scene's half a million triangles.

## Read

- `CLAUDE.md`, `docs/build/v2-wave-notes.md` (the dab kit, the meadow carpet's ground color, static-layer events)
- `docs/spec/17-presentation.md`: Visual direction, second pass (the rule that makes detail cheap; 2. A painted green world), Quality presets (the V2 rows), Seasons and weather visuals
- `docs/spec/22-quality.md`: Performance budgets, The redesign: measuring first, then budgets
- `docs/spec/20-architecture.md`: Lean renderer [V1] (As built V1C), V2 contracts

## You own

The V2B row of the wave notes' ownership table: `packages/art/src/dabs.ts`, `packages/art/src/kits/{trees,nature}.ts`, `apps/client/src/render/scatter.ts`, `render/layers/{trees,nature}.ts`, the new `render/layers/meadow.ts` and `render/drifts.ts`, `apps/gallery/src/seasons.ts`; and the carve-outs: `fruitTree` and the `hedge` kit's body in `kits/decor.ts`, `ivyPart` and `hedgeRun` in `kits/details.ts`, `reedBed` in `kits/greens.ts`.

Outside these paths: only small, necessary edits (registry lines, exports, additive contract changes, the one line in `ground.ts` that takes the drift mask), listed in the PR.

## You can rely on

V2.0: `brushDabs(b, blobs, opts)`, `DabBlob` and `DabOptions` (a stub that writes nothing); `lightMapUniforms(env)` and `LIGHT_MAP_GLSL` (black until V2A draws the map); the grown village (`?debug&fixture=grown`), `v2-shots.mjs`, `v2-perf.mjs`, Measure this laptop, the before numbers. V1C: the trees' two levels and per-instance swap, `ScatterField`, `createFoliageMaterial` with the season's tint, `uAutumn` and `uBare`, `GroundTextures` (color with wildflower density in A, the detail texture with meadow in A), `meadowAmount` and `mownAmount`, `env.staticTime`. V2A will add `RenderLayer.shadowless`; until it lands a carpet refill re-renders the shadow map (correct, only dearer).

## Tasks

1. **The dab kit** (`dabs.ts`): blobs in, dabs out through the caller's `ShapeBuilder` with surface leaf, as the signature says (wave notes). Deterministic by `seed`; tints wander by `tintSpread`; shaded by the blob's soft normal (from `normalFrom`), lighter toward the sky by `skyLighten`; `gaps` leaves the boughs showing; `thin` drops dabs in a fixed order. Tests: triangles within the count, the same seed gives the same geometry, thinning only removes, the surface id is restored, both levels keep the same attributes.
2. **Crowns**: near oak and birch crowns (and the fruit trees through `fruitTree`) built from 180 to 320 dabs on the crown's blobs; pines as you judge best for a conifer. Far crowns keep today's shape with the dab tints in their vertex colors, so the swap does not pop.
3. **Hedges, reeds and ivy** with the same dabs: the hedgerow, the hedge decor, reeds and the reed bed, `ivyPart` and `hedgeRun` (the garden hedges of grown homes).
4. **Thinning by season**: dabs thin from Autumn day 4 and are gone in winter, where today's bare twigs (`uBare`) stay. `thin` steps in quarters, each step's geometry built once and cached, swapped at most once an in-game day as a static-layer event (wave notes, Static-layer events).
5. **The meadow carpet** (new static layer `layers/meadow.ts`, one registry line): 40 to 60 soft blades a meadow tile within the preset's distance (`QualityPreset.meadowCarpet`, additive: none on Low, 30 tiles on Medium, 45 on High, 60 on Ultra), each colored from the ground texture at its root and shaded with the ground's normal, fading into the painted ground with distance; lawns by houses stay short (`mownAmount`). Filled by chunk with a margin, refilled at rest or when the view leaves the inner half of the filled area, never casting, shadowless once V2A's change lands; sway on `env.staticTime`. Read the ground textures through an accessor (additive), never by editing the ground shader; a shader change you need is a note to V2A.
6. **Flower drifts** (`render/drifts.ts`): one low-frequency mask, a few tiles across, shared by the instanced flowers (`layers/nature.ts`) and the ground's painted dots (one line in `GroundTextures`), so near and far agree.
7. **Lit from below**: `createFoliageMaterial` and the carpet read the light map through `lightMapUniforms(env)` and `qLightMap(xz)`, scaled by `env.night`, stronger low on the crown.
8. **Gallery**: the seasons view shows dabbed trees, hedges and the carpet in all four seasons. Fill your rows in the wave notes' stand-ins table; add your As built lines to `20-architecture.md` (V2 contracts).

## Acceptance criteria

- [ ] Trees, hedges and meadows read as painted from the default camera and at street zoom, in every season (`v2-shots.mjs v2b` beside `v2-before-*` for every scene, plus the winter fixture and an autumn shot; the owner's and Kat's eyes at V2X's playtest evening).
- [ ] Painted green (`22-quality.md`): trees and meadows within 0.5 M triangles in the village scene (the trees, nature and meadow layers by `__qoti.layerTriangles()` at the default camera of the grown village and the village of 130 on Medium, before and after in the PR); opaque geometry only (no alpha test, no transparency).
- [ ] Moving frames add no full-screen pass; draws stay within 300 on Medium; the idle frame stays within 4 ms GPU on Medium (the carpet is static, so idle frames do not draw it).
- [ ] The presets (`17-presentation.md`, Quality presets): meadow carpet within none, 30, 45 and 60 tiles from Low to Ultra; Low keeps today's tufts.
- [ ] A carpet chunk fills within the chunk rebuild budget (4 ms, at most 2 a frame); a season step rebuilds no geometry it built before (logged or tested).
- [ ] Unit tests for the dab kit (task 1), the drift mask (deterministic, shared by both users), the thinning steps.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

The light map itself and every other reader (V2A), the ground shader (V2A; you read its textures), decor surfaces and far levels (V2C), building kits beyond the ivy and hedge helpers (R1E), any sim change.

## Notes

- Run the build and review loop (`31-parallel-development.md`) with Opus executors (model `opus`): the owner's call for this round.
- Compare against the `v2-before-*` shots with `node apps/client/e2e/v2-shots.mjs v2b`, every scene and hour, and report `v2-perf.mjs` numbers and the layers' triangles in the PR.
- The owner's note, twice: nature is still low-poly beside painted buildings (faceted crowns, a flat lawn, tufts that read spiky). Soft masses are the aim, not more spikes: a meadow is one mass with a combed surface, a crown a cloud of strokes.
- Triangles are cheap and pixels dear on integrated graphics, but 0.5 M is the line: spend near the camera, keep the far level as it is.
- Open the PR into `main` when ready (V2 touches no sim state and merges as it goes); V2X merges whatever is still open, yours last.
