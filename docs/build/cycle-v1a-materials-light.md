# V1A: Materials and light

**Iteration**: V1. **Wave**: parallel. **Branch**: `cycle/v1a-materials-light`.
**Depends on**: V1.0 merged. **Runs alongside**: V1B, V1C, V1D (and the I3 cycles that own sim and UI paths). **Ports**: client 5201, relay 8811.

## Goal

The game's surfaces and light look like the picked Painted Miniature concept (B): a Lambert-based kit material that reads each vertex's surface id and draws brick courses, curved clay tiles, slate, thatch, plaster grain, timber, cobbles, flags, grass with tiny flowers, dirt, field furrows, zinc seams and awning stripes from a pattern texture array generated in code; palette 2.0; glass and water with a sky fresnel and a sun glint; warm haze; night windows and lamp pools; the season, snow and sway hooks working on the new material; and the final pass's look (grade, tilt-shift, bloom, tone mapping) matched to the concept stills. Each pixel costs less than today, and nothing shimmers at distance.

## Read

- `CLAUDE.md`, `docs/build/v1-wave-notes.md`
- `docs/spec/17-presentation.md`: Visual direction, Palette, Lighting and time of day, Seasons and weather visuals, Post-processing, Quality presets
- `docs/spec/20-architecture.md`: Rendering, Lean renderer [V1] (Kit material, Frame graph), V1 contracts
- The concept viewer (`docs/concepts/v0-look/index.html`: palette b, the pattern generators and the lean material) and the stills `docs/build/screenshots/v0-b-*.jpg`

## You own

`packages/art/src/{materials,palette,patterns}.ts`, the values in `packages/art/src/surface.ts`, `apps/client/src/render/{material,look,lighting,env}.ts`, a surfaces section in the gallery (`apps/gallery/src`).

## You can rely on

V1.0: surface ids written by kits (plain 0 until V1B and V1C set theirs), `createPatternArray` (flat stub), `palette2`, `look.ts` called by today's `PostChain` (V1D replaces the chain with the single final pass, calling the same functions), the presets with Ultra, `v1-shots.mjs` and `v1-perf.mjs`, the before numbers.

## Tasks

1. **Pattern generators** (`patterns.ts`): deterministic, seeded, tileable 256 x 256 layers built with integer lattice noise from precomputed tables (no per-pixel hashing), together under 150 ms at load on the weaker laptop; mipmaps and anisotropy from the preset (4 on Medium, 8 on High, 16 on Ultra where supported). One layer per surface, as in the concept: brick (courses of about 0.075 tiles, stretchers of 0.2, stagger, tone per brick, mortar in G), stone ashlar (blocks, darker joints), timber grain, clay tile (courses of 0.07 with a shadow line under each course, joints, tone per tile, and a curve shaded across every tile), slate (smaller courses, tone per slate), thatch (fibers down the slope, soft courses, clumps), plaster (two scales of mottling), cobbles (setts with rounded shading and dark gaps), flags (slabs with joints), grass (fine variation and sparse flower dots: G mask, B hue), dirt (noise and pebbles), field furrows, zinc standing seams, awning stripes (G), flowers (colors in RGB, mask in A), and the low-frequency noise layer.
2. **Kit material** (`render/material.ts`, on `MeshLambertMaterial` with `onBeforeCompile`): the `surface` attribute indexes a per-surface uniform table (world scale, mapping, strength, accent color); one fetch from the array plus one from the noise layer (meadow patches on grass, weathering on walls and roofs); a global pattern strength; accent mixes (mortar, stripes, flowers); glass and water with a sky fresnel and a cheap sun glint added to the emissive term; the night glow from `glow` as today. Keep it branch-light (branch only for glass, water and flowers). Residents keep their rig material; move it to Lambert as well if it looks the same.
3. **Palette 2.0**: tune `palette2` against the concept stills and switch every token read by kits to it (V1B and V1C change the reads in their kits; you own the values and the Palette table in `17-presentation.md`). Customization swatches map onto the new tokens.
4. **Light**: sun, hemisphere and fill colors per phase retuned for Lambert, with the concept's day, golden hour and night as the target; warm haze as fog that follows view distance (B's values: near about 0.93 and far about 4.2 times the view distance); night windows, lantern glow and ground lamp pools as today.
5. **Seasons and snow**: re-attach the season tint, snow on upward faces and the sway hook to the new material, so C5E can build on them (snow covers the pattern gradually and leaves a hint of courses on thatch and slate). Keep the four seasonal grades.
6. **The final pass's look** (`render/look.ts`): grade (lift, gamma, gain, saturation, warmth per season and phase), vignette, the tilt-shift mask and its strength by view distance (none close up), bloom from the blurred image (threshold and strength by phase), tone mapping (pick AgX, ACES or Khronos Neutral by matching the concept stills) and dither, as GLSL functions V1D's final pass includes. Until V1D's frame graph lands they run inside the current chain.
7. **Gallery**: a surfaces section with every surface at three distances, in four seasons, by day and night.

## Acceptance criteria

- [ ] `v1-shots.mjs` shots of the hamlet, village and town read like the B concept stills by day, golden hour and night (concept still, before and after side by side in the PR).
- [ ] No shimmer or moire while slowly zooming from street to valley (a 10 s clip in the PR).
- [ ] On the weaker laptop, GPU frame time for the village of 130 at the default camera on Medium is lower than the V1.0 before number (both in the PR); pattern generation stays under 150 ms (logged).
- [ ] Winter fixture shots: snow and the winter grade work on the new material.
- [ ] The colorblind overlay check passes (`apps/client/e2e/colorblind.py`); no flashing effects.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

Geometry detail and levels (V1B, V1C), the ground shader's own code (V1C; it calls your functions and samples your array), the frame graph, shadow caching and the still-frame cache (V1D).

## Notes

- Visual quality is the owner's top priority, and cozy comes first: warm, soft, never grimy. The concept stills are the target; review with the owner's eyes.
- P46 holds because the textures are generated by code. Keep generation seeded so both laptops build identical layers (the sim never reads them, but screenshots and tests compare them).
- Lambert loses the faint specular of the old material; the glass, water and wet-sheen fakery should make up for it where it matters.
- The concept's material is a reference: it has no seasons, snow, sway or batching. Port the ideas, not the code.
- Coordinate with V1C on the grass, dirt and field layers (they sample them in the ground shader) and with V1D on the final pass's uniforms (one `lookUniforms` object both sides share).
