# V1C: Ground, water and nature

**Iteration**: V1. **Wave**: parallel. **Branch**: `cycle/v1c-ground-nature`.
**Depends on**: V1.0 merged. **Runs alongside**: V1A, V1B, V1D (and the I3 cycles that own sim and UI paths). **Ports**: client 5203, relay 8813.

## Goal

The valley floor and its nature look like the Painted Miniature concept (B): mown grass near homes and meadow patches with tiny flowers farther out, worn edges along roads and under benches, soil you can see, kerbs and gutters on streets and grass edges on paths, soft ambient occlusion pooling around buildings and in courtyards from a ground AO texture, fuller trees with a cheap far level for forests, water with banks, reeds and a sky fresnel, and soft blob shadows under residents, animals and carts now that moving things no longer cast into the cached sun shadows.

## Read

- `CLAUDE.md`, `docs/build/v1-wave-notes.md`
- `docs/spec/17-presentation.md`: Visual direction, Style kit (Terrain, Water, Roads, Trees, Nature), Seasons and weather visuals, Quality presets
- `docs/spec/20-architecture.md`: Rendering (Ground), Lean renderer [V1] (Baked ambient occlusion, Levels of detail, Cached sun shadows), V1 contracts
- `docs/spec/30-roadmap.md`: Ideas from playtests ("Soil you can see")
- The concept viewer (`docs/concepts/v0-look/index.html`: ground colors, fields, hedges, trees, the ground AO texture) and `docs/build/screenshots/v0-b-old-town.jpg`, `v0-b-steam-town.jpg`

## You own

`packages/art/src/kits/{nature,trees}.ts`, `apps/client/src/render/layers/{terrain,roads,water,nature,trees}.ts`, `apps/client/src/render/{ground,surface,scatter}.ts`, new `apps/client/src/render/groundAo.ts`, a new blob shadow layer `render/layers/blobs.ts` (one registry line), the nature sections of the gallery.

## You can rely on

V1.0: surface ids and the table, `createPatternArray` (V1A fills it; sample the same texture, one array for the whole game), `palette2`, layers marked static or moving (water and your blob layer are moving), the before shots and numbers. V1A's material functions for fresnel and glint (`render/material.ts` exports them; until then use a stand-in), V1D's cache invalidation call.

## Tasks

1. **Ground shader** (`ground.ts`): grass from the surface table and the noise layer (meadow patches with flowers, mown grass within a few tiles of homes, darker forest floor), worn earth along roads, at doors and under benches, soil tinted by fertility (rich and thin soil read apart, the playtest's "soil you can see"), field furrows, snow hooks kept for C5E.
2. **Roads**: kerbs and a gutter shadow along streets, ragged grass edges along paths and lanes, flags on squares, cobbles and flags from the surface table; joins and stairs as today.
3. **Ground AO texture** (`groundAo.ts`): a world-space texture at about 2.5 texels per tile (480 x 480 for the 192-tile map) from building footprints (the occupant layer), walls and fences, and tree crowns (decor), blurred twice (a contact blur of about 1.5 tiles and an enclosure blur of about 5 tiles, weighted about 0.55 and 0.15, *(tune)*), sampled by the ground shader so it darkens softly next to walls, in narrow streets and in courtyards. When occupants or decor change, rebuild only the touched chunks plus a blur margin, within the chunk rebuild budget, and report the change so V1D drops the still-frame cache.
4. **Trees v2** (`kits/trees.ts`, `scatter.ts`): fuller crowns of a few soft blobs, a root flare, blossom, autumn and bare variants kept; two levels: `high` and a far `low` of a few dozen triangles, chosen per instance by distance as today; forests beyond the town always use the low level on Low and Medium. Hedgerows along fields from the same kit.
5. **Water and banks**: the river and ponds with V1A's sky fresnel and sun glint, gentle ripples, stone or earth banks by district and era, reeds and lily pads; the water layer is moving, so its shimmer keeps going while the camera rests.
6. **Blob shadows** (`layers/blobs.ts`): one soft dark disc under every resident, animal and cart, instanced from the agent and cart frames, sized by the figure and faded at the resident detail distance; on Low it is the only shadow residents get.
7. **Gallery**: ground and nature sections (meadow, mown grass, worn edges, soils, fields, each tree at both levels, water and banks) by day, night and season.

## Acceptance criteria

- [ ] Wide `v1-shots.mjs` shots read like the concept's ground: varied grass, soft occlusion in courtyards and along walls, no hard halo edges.
- [ ] Placing a building updates its ground AO within 2 frames and under 4 ms (logged in a test or the overlay).
- [ ] In the village fixture's wide shot, tree triangles drop by at least 60% against the V1.0 before number, with no visible pop at the swap (numbers and a clip in the PR).
- [ ] Every resident and cart has a blob shadow; no shadow acne on the ground at a low sun.
- [ ] Rich and thin soil read apart from the default camera (a shot with a soil overlay off).
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

The material code and the patterns themselves (V1A), buildings and props (V1B), the frame graph, shadow caching, level choice for buildings and the still-frame cache (V1D), seasonal art beyond keeping the hooks (C5E).

## Notes

- Visual quality is the owner's top priority; cozy first. The ground is most of the screen from the default camera, so it decides the first impression.
- The ground AO texture replaces screen-space AO for everything that touches the ground; it must look right with the sun from any side, so keep it soft and never directional.
- The concept builds its AO once for a fixed town; here it must follow edits chunk by chunk without a hitch.
- Stand far back and slowly zoom in when you judge the two tree levels: forests are where most of the triangles used to go.
