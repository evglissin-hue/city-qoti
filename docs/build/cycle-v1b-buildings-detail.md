# V1B: Buildings detail

**Iteration**: V1. **Wave**: parallel. **Branch**: `cycle/v1b-buildings-detail`.
**Depends on**: V1.0 merged. **Runs alongside**: V1A, V1C, V1D (and the I3 cycles that own sim and UI paths). **Ports**: client 5202, relay 8812.

## Goal

Every building and prop generator carries the Painted Miniature detail kit (B): framed windows with sills, lintels, muntins, shutters and window boxes; doors with steps; string courses and cornices; roof courses with eave and verge boards and ridge caps; dormers; chimney stacks with caps and pots; timber framing; ivy. Neighbors that touch join into rows with party walls and stepped rooflines. Every kit builds a near level and a cheap far level, and walls carry baked vertex ambient occlusion. Up close a street looks like the concept's; from the default camera a home costs about 100 to 150 triangles.

## Read

- `CLAUDE.md`, `docs/build/v1-wave-notes.md`
- `docs/spec/17-presentation.md`: Visual direction, Style kit (Buildings, Props, Village, Eras), Quality presets
- `docs/spec/20-architecture.md`: Lean renderer [V1] (Levels of detail and culling, Baked ambient occlusion), V1 contracts
- `docs/spec/12-hearth.md`: District styles and Customization (what the swatches and modules must keep doing)
- The concept viewer (`docs/concepts/v0-look/index.html`: `buildHouse`, `addWindow`, `addRoof`, the far level) and `docs/build/screenshots/v0-b-steam-street.jpg`, `v0-b-old-street.jpg`

## You own

`packages/art/src/kits/` except `nature.ts` and `trees.ts`, helpers in `packages/art/src/{shapes,geometry}.ts` (additive), `apps/client/src/render/kitGeometry.ts` and `render/layers/buildings.ts`, the kit sections of the gallery (`apps/gallery/src`).

## You can rely on

V1.0: `ShapeBuilder.surface(id)` and the surface table, `palette2`, `KitBuildOptions.lod` (`'high' | 'low'`), `env.buildingDetail` (the full detail distance per preset; V1D's `lod.ts` takes the swap over), the before shots and numbers. V1A's material reads your surface ids; until it lands the old material ignores them.

## Tasks

1. **Detail kit** as shared parts (`kits/parts.ts`, `kits/details.ts`): window (frame, glass, muntins, sill, lintel, shutters, window box with flowers), door (frame, step, a fanlight in brick and stucco styles, a hood in timber ones), shopfront (pilasters, fascia with a gilt line, stall riser, glass, awning), string course, cornice, quoins where the style says so, eave fascia, verge (barge) boards, ridge cap, dormer, chimney stack with cap and pots, gutter and downpipe, timber framing with posts, rails and braces, jettied upper floor, ivy. Each sets its surface id. Use the concept's proportions as the starting point and tune against the stills.
2. **Every generator** gets the kit: district homes and townhouses, shops with flats above, workshops, farmsteads, the I1 and I2 buildings (town hall, storehouse, mill, sawpit, kiln, school, tavern, herbalist, Trading Post, cart shed and the rest), civic pieces, landmarks, construction stages and upgrade scaffolding, and props that read as small buildings (stalls, sheds, the well). Customization swatches and modules keep working and map onto `palette2`.
3. **Joined facades** (render-side): where a building's side wall touches a neighbor's on the same frontage, skip the hidden faces, step the rooflines, put chimneys on the party wall and run the plinth through; corner buildings dress both street faces. Read neighbors from the Mirror's occupant layer, and make the neighbor shape part of the geometry key so a change next door rebuilds both. V2 later changes how lots are cut so rows form by themselves; this cycle only makes touching buildings look joined.
4. **Two levels for every kit**: `lod: 'high'` is the full kit; `lod: 'low'` keeps walls, roof planes, gables, chimneys as boxes, and windows, doors and shutters as flat quads, with no sills, muntins, dormers, pots, ivy or railings: at most 150 triangles for a home and 600 for a landmark. Per-face color jitter is hashed from position, and every random choice that changes the silhouette (chimney side, dormer count, turret) is rolled before branching on the level, so the swap never pops a color or a shape.
5. **Vertex AO**: darker toward the ground (about a quarter at the foot of a wall), under jetties and deep eaves, in inner corners of L shapes and porches; never on roofs. It is baked into vertex colors, so it costs nothing at draw time.
6. **Gallery**: every generator at both levels side by side, with triangle counts printed under each.

## Acceptance criteria

- [ ] Gallery screenshots of every generator at both levels, by day and night; a table of triangle counts in the PR (homes at most 150 low and 4,000 high; landmarks at most 600 low).
- [ ] Close `v1-shots.mjs` shots of the village of 130 read like the concept's street stills.
- [ ] Touching homes in the village fixture show joined rows: no hidden walls drawn, no z-fighting, chimneys on party walls (close shots).
- [ ] No color or silhouette pop when a building swaps level (a short clip zooming through the swap distance).
- [ ] Every building key builds within the chunk rebuild budget (4 ms each); all keys of the village of 130 build in under 300 ms (logged).
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

The material and its patterns (V1A), ground, roads, trees, nature and water (V1C), choosing levels, caching and the frame graph (V1D), streets that fill their frontage and new lot shapes (V2), era kits beyond today's styles (V3, V4).

## Notes

- Visual quality is the owner's top priority: coziness, quaintness, detail and diversity. Prefer fewer, better details over many cheap ones, and look at the concept's streets with the owner's eyes.
- Triangles still matter at City scale: the far level is what most of the town shows from the default camera.
- The concept's generator is a single-file reference with its own shortcuts (one merged mesh, no Mirror, no customization); port its proportions and choices, not its code.
- Keep geometry deterministic from the building's seed (`KitBuildOptions.seed`), so both laptops build the same rows.
