# V2C: What V1 left half-wired

**Iteration**: V2 Light and green. **Wave**: parallel. **Branch**: `cycle/v2c-half-wired`, from `cycle/v2-0-look-contracts`'s tip.
**Depends on**: V2.0. **Runs alongside**: V2A, V2B (and R1's wave, which owns sim, content, bench, UI and the building kits). **Ports**: client 5213, relay 8823.

## Goal

The things V1 built and never finished are finished. Everyday props, carts and residents wear wood grain, painted wood, wrought iron, terracotta and cloth beside the painted walls; walls darken toward the ground; chimney smoke rises as soft ribbons that lean with the wind and glow by lamplight; resident bubbles can be switched on from the View list; and the dozen commonest decor pieces have far levels, so a big town's decor costs less from afar.

## Read

- `CLAUDE.md`, `docs/build/v2-wave-notes.md` (surfaces, wall occlusion, bubbles, the carve-outs in R1E's kit files)
- `docs/spec/17-presentation.md`: Visual direction, second pass (the rule that makes detail cheap; 3. What V1 left half-wired), Quality presets, Residents on screen
- `docs/spec/22-quality.md`: Performance budgets, The redesign: measuring first, then budgets
- `docs/spec/20-architecture.md`: Lean renderer [V1] (As built V1A and V1C), V1 contracts (surface ids), V2 contracts

## You own

The V2C row of the wave notes' ownership table: `packages/art/src/surface.ts` (the values of ids 20 to 24), `packages/art/src/patterns.ts` (their five generators), `packages/art/src/kits/{props,decor,vehicles,residents}.ts` (not `fruitTree` or the `hedge` kit, which are V2B's), `apps/client/src/render/{groundAo,icons,instances}.ts`, `render/layers/{agents,carts,decor,effects}.ts`, a new `render/wallAo.ts`, `apps/gallery/src/{surfaces,figures}.ts`; and the carve-out for the commonest decor pieces in `kits/{garden,fineDecor,greens,callings,festival}.ts` (kit bodies only).

Outside these paths: only small, necessary edits (registry lines, exports, additive contract changes, the hooks the wave notes name: one line in `ui/lenses.ts`, `patchWallAo` called from `render/material.ts`, the bubbles route in `Renderer.setOverlay`, an additive way to write surface ids in `rig.ts`), listed in the PR.

## You can rely on

V2.0: `SURFACE.woodGrain` 20, `paintedWood` 21, `wroughtIron` 22, `terracotta` 23, `cloth` 24 with flat rows and flat layers; `SURFACE_LAYERS` (25, the kit material's table size) and `NOISE_LAYER` (19, `SURFACES[19]` is `undefined`); the gallery's `SURFACE_ORDER` that leaves the V2 surfaces out; `lightMapUniforms(env)` and `LIGHT_MAP_GLSL` (black until V2A draws the map); the grown village, `v2-shots.mjs`, `v2-perf.mjs`, Measure this laptop, the before numbers. V1: `ShapeBuilder.surface(id)`, the kit material indexing the table by id, `groundAoFor(env)` and `GROUND_AO_GLSL`, the agents layer's `setBubbles` and `RenderApi.setBubbles`, the decor layer's levels and `decorGeometry(def, lod)`. V2A teaches the resident material to read surfaces; until then residents carry your ids and draw flat.

## Tasks

1. **The five surfaces**: their rows in `SURFACES` (mapping, scale, strength, accent) and their generators in `patterns.ts` (wood grain, painted wood with a little wear at edges, wrought iron, terracotta, cloth weave), deterministic and in the house style of V1A's layers. Then drop the filter in the gallery's `SURFACE_ORDER` so they show. Tests: every id keeps its number, the noise layer and `SURFACES[19]` are untouched, the five layers are no longer flat.
2. **Write them**: props (`props.ts`: barrels, benches, ladders, the rowboat and the rest), decor (`decor.ts` and the carve-out pieces), cart bodies and wheels (`vehicles.ts`; the loads come from `goods.ts`, R1E's), residents (`residents.ts`: clothes as cloth, tools and bundles as wood). `RigBuilder` writes zeros today: give it an additive way to write ids. Both levels carry the same attributes (`surface.test.ts`).
3. **Wall occlusion**: `render/wallAo.ts` exports `patchWallAo(shader, env)` that binds `groundAoFor(env)` and darkens walls toward the ground, faded out a tile or two up; one line in `createWorldMaterial` calls it. Anchor on a chunk V2A's patches leave alone (say which in the PR). The ground AO already rebuilds and invalidates from the terrain layer, so nothing new invalidates.
4. **Ribbon smoke** (`layers/effects.ts`, moving): soft ribbons from each chimney anchor that rise, widen, lean with the wind and fade, in place of the stacked puffs; at night they take the light map's glow (`qLightMap(xz)` scaled by `env.night`). One instanced draw, as the puffs are.
5. **Bubbles on the View list**: one line in `ui/lenses.ts`'s `overlays` (id `bubbles`, the Hearth lens, an existing glyph such as `charm` so the change stays one line, a warm and dry label and hint you read in place), and `Renderer.setOverlay('bubbles')` turning the agents layer's bubbles on (off with any other kind). A unit test that the registry line routes to `setBubbles`.
6. **Far levels for common decor**: count decor by kind in the grown village and the town showcase, take the dozen commonest pieces without a far level, and give each one from the same code path (silhouette first, about a fifth of the near triangles), so the decor layer swaps them at the decor distance. List the dozen with near and far triangles in the PR.
7. Fill your rows in the wave notes' stand-ins table; add your As built lines to `20-architecture.md` (V2 contracts).

## Acceptance criteria

- [ ] Props, carts and residents show their surfaces at street zoom beside painted walls, and melt into their color from the default camera without shimmer (`v2-shots.mjs v2c` street and village shots beside `v2-before-*`; residents once V2A's material lands, checked by V2X).
- [ ] Walls darken toward the ground in the village and town shots, most in narrow streets and courtyards, never as a dark band.
- [ ] Smoke reads as soft ribbons that lean with the wind by day and glow at night; it stays one draw and costs no more on an idle frame than the puffs (`v2-perf.mjs` idle columns, before and after).
- [ ] The View list has the bubbles toggle; it shows wish, happy, unhappy, sleepy and cold bubbles and hides them again.
- [ ] The dozen commonest decor pieces have far levels; the town's decor triangles drop (`__qoti.layerTriangles()` before and after).
- [ ] Moving frames add no full-screen pass; draws stay within 300 on Medium; the idle frame stays within 4 ms GPU on Medium; the pattern array (with V2A's rooms) stays under 150 ms at load.
- [ ] Unit tests: surface ids and layers (task 1), both levels' attributes, the bubbles route.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

The light map and its other readers (V2A), the resident material's shader (V2A), trees, hedges, fruit trees and nature (V2B), building kits and their walls' surfaces (R1E), the rest of `ui/` (R1C), any sim change.

## Notes

- Run the build and review loop (`31-parallel-development.md`) with Opus executors (model `opus`): the owner's call for this round.
- Compare against the `v2-before-*` shots with `node apps/client/e2e/v2-shots.mjs v2c`, every scene and hour, and report `v2-perf.mjs` numbers in the PR.
- Surfaces are a detail, not a texture pack: strength low enough that a cart still reads as a painted toy.
- The decor carve-out in R1E's files is for kit bodies only, no signature or id change; tell the master before you edit one, so R1E hears of it.
- Open the PR into `main` when ready (V2 touches no sim state and merges as it goes); V2X merges whatever is still open, after V2A.
