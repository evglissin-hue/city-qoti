# V3C: The long view

**Iteration**: V3 Yards, streets and the long view. **Wave**: parallel. **Branch**: `cycle/v3c-long-view`, from `main` after V3.0 merges; PR into `cycle/v3x-integration`.
**Depends on**: V3.0. **Runs alongside**: V3A, V3B, V3D and the R2 wave. **Recommended effort**: high. **Ports**: client 5233, relay 8843.

## Goal

Zoomed out, the valley stops being a green slab in a gray box. Three bands of painted silhouette ring it (near hills with woods, far hills, sky haze), the fog thins with height and thickens along the river at dawn and over a town of many chimneys on a winter evening, and the river reads as a river: color by depth, flow along its course, foam at bridges and weirs, the light map's reflections kept. The far scenes (120 and 200 tiles) draw no more calls than before, and fewer where they can. Past 240 tiles V3D's map takes over and none of this is drawn.

## Read

- `CLAUDE.md`, `docs/build/v3-wave-notes.md` (Rules, Ownership by file, Handshakes: the endpaper map and the scene skip; Static-layer events; Stand-ins)
- `docs/spec/17-presentation.md`: Visual direction, second pass, 5. The long view (first three bullets)
- `docs/spec/22-quality.md`: The redesign: measuring first, then budgets (Moving frames row)
- `docs/build/cycle-v3-0-contracts.md`: "Measured headroom per preset (V2X)"

## You own

The V3C row of the wave notes: new `apps/client/src/render/layers/horizon.ts` (and its test), `render/lighting.ts` (the height term), `render/layers/{water,sky}.ts`, and `packages/art/src/palette.ts` (append horizon tokens only).

Outside these paths: only small, necessary edits (a registry line in `layers/index.ts`, additive fields in `env.ts`, an export), listed in the PR. The carve-outs the wave notes name, each one function body or one line, no signature change: the rim's mist in `ground.ts` (V3A's; `qRimMist`'s body and the line that applies it, which the horizon replaces), and one line each in `material.ts` and `layers/terrain.ts` (V3X's) only if the height term or the bands need them. Name each in the PR.

## You can rely on

V3.0: `env.skipScene` (set by the endpaper layer at `cover` 1), `endpaperCover`, `ENDPAPER_NEAR` and `ENDPAPER_FULL` (200 and 240 tiles), `EndpaperInput` (fields appended, never renamed), `v3-shots.mjs` scenes `far120`, `far200` and `far240`, `v3-perf.mjs`, and the before numbers in the wave notes. V2: `env.lightMap` and `lightMapUniforms(env)` (the water already reads them), `hazeFor(distance)` in `lighting.ts`, `env.fog` (weather fog), `env.night`, `env.focus`.

## Tasks

1. **The horizon** (`layers/horizon.ts`): a static layer, built once at init from the valley's seed (a seeded stream, no `Math.random`), three bands round the valley: near hills with woods (low, dark, with tree silhouettes), far hills (paler), and a haze band that melts into the sky color. Under 2,000 triangles in all, one or two draws, a flat material in the fog's color and the lighting's `sky`, so it follows the hour and season through uniforms only. It replaces the rim's box of mist (`qRimMist`) and hides the skirt from far cameras. It yields at `env.skipScene` (V3D's map needs no horizon). Unit tests: same seed, same bands; triangle count under 2,000.
2. **Haze with height**: every material that fogs goes through three's `fog_fragment`, so add the height term once (the wave notes' route): patch `ShaderChunk.fog_pars_fragment` and `fog_fragment` (and the vertex chunks for a world-height varying) from `lighting.ts` at startup, with uniforms in `env` (for the cycle to add; today `lighting.ts` holds `hazeFor` and the fog's near and far), and every reader takes it with no edit in its file: fog thins with height above the valley floor, so hills and tall roofs clear first. Two more terms, both uniforms only: thicker along the river at dawn (a river-distance term from a small texture or from the water layer's existing depth data, not a pass) and thicker over a town of many chimneys on winter evenings (a chimney count from the smoke layer's existing count, smoothed). No rebuild, no new pass, and a still frame is dropped only by the weather and hour steps that drop it today.
3. **The river** (`layers/water.ts`): color by depth (shallow sand-gold to deep green-blue, tokens appended to `palette.ts`), flow along its course (the ripples' direction from the water's gradient, slow, on `env.staticTime` so it pauses at rest), foam at bridges and weirs where the Mirror has them (a small additive strip, no new draw), and the light map's reflections kept as V2A built them (check at night; none on Low as today). Fewer ripple octaves on Low.
4. **Feed the map**: export from `water.ts` a function returning the river's course and width as plain arrays (a centerline in tiles and a width per sample; name and add it), and append matching fields to `EndpaperInput` (additive) for V3D's builder to call. Touch `endpaper.ts` for nothing else.
5. **Draws in the far view**: the far view drew the most calls of any view (208 on High in the valley looked at). Find what the far camera pays for and cannot see (decor, props and signs past their distance, per-chunk draws that could join) and cull it by camera distance in your own layers, or through an additive distance in `render/env.ts` that you add and name for V3X; a draw you cannot cut in your files goes to V3X's list with its layer name. Report draws before and after for `far120` and `far200` on every preset.
6. **Shots and tuning**: `node apps/client/e2e/v3-shots.mjs v3c`, every scene and hour, beside `v3-before-*`. Only the far views, the river and the fog should change; the `street` shots must match by eye (the height term must not tint a close street).
7. Fill your rows in the wave notes' stand-ins table and add As built lines to `20-architecture.md` (V3 contracts).

## Acceptance criteria

- [ ] `far120` and `far200` show a horizon, three bands and no gray box, at dawn, noon, golden hour and night, and in autumn and winter (screenshots).
- [ ] The horizon is under 2,000 triangles and built once (test); haze with height is uniforms only (no new pass, no rebuild; the layer returns false from `frame()` at rest, tested).
- [ ] The river shows depth, flow and foam at bridges and weirs, with lamplight reflections at night; nothing in it is a new draw on Low.
- [ ] Draws in the far scenes are at or below the before numbers on every preset and inside the headroom table (`cycle-v3-0-contracts.md`); `v3-perf.mjs` numbers in the PR.
- [ ] Past 240 tiles the horizon is not drawn (test with `env.skipScene` set).
- [ ] Street zoom looks unchanged, hashes unchanged, typecheck, lint, unit, e2e, build and bench pass; definition of done in `docs/spec/22-quality.md`.

## Out of scope

The endpaper map, its worker, quad and inks (V3D); dressing, rows and gardens (V3A, V3B); any sim change; new full-screen passes; a new weather system.

## Notes

- Cozy first: a horizon is a painting, not a skybox. Soft shapes, two or three tints a band, haze so thin at noon that it only softens the far hills.
- The frame budget is the floor: a band or a haze term that fails on Kat's laptop on Medium is cut back, not the budget.
- Do not edit `renderer.ts` or the endpaper layer; the skip line is V3D's.
- Smoke and the resolution governor are P2-F's (wave notes, P2 runs beside V3): the chimney haze reads the smoke's count and changes nothing in `layers/effects.ts` or `resolution.ts`; if it must, the PR says how it relates to P2-F.
- Open the PR into `cycle/v3x-integration` (made from `main` once V3.0 merges).
