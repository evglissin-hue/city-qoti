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

- [x] Gallery screenshots of every generator at both levels, by day and night; a table of triangle counts in the PR (homes at most 150 low and 4,000 high; landmarks at most 600 low).
- [x] Close `v1-shots.mjs` shots of the village of 130 read like the concept's street stills.
- [x] Touching homes in the village fixture show joined rows (in the town showcase and the gallery, since the village's homes all stand apart): no hidden walls drawn, no z-fighting, chimneys on party walls (close shots).
- [x] No color or silhouette pop when a building swaps level (a short clip zooming through the swap distance).
- [x] Every building key builds within the chunk rebuild budget (4 ms each); all keys of the village of 130 build in under 300 ms (logged).
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

The material and its patterns (V1A), ground, roads, trees, nature and water (V1C), choosing levels, caching and the frame graph (V1D), streets that fill their frontage and new lot shapes (V2), era kits beyond today's styles (V3, V4).

## Notes

- Visual quality is the owner's top priority: coziness, quaintness, detail and diversity. Prefer fewer, better details over many cheap ones, and look at the concept's streets with the owner's eyes.
- Triangles still matter at City scale: the far level is what most of the town shows from the default camera.
- The concept's generator is a single-file reference with its own shortcuts (one merged mesh, no Mirror, no customization); port its proportions and choices, not its code.
- Keep geometry deterministic from the building's seed (`KitBuildOptions.seed`), so both laptops build the same rows.

## As built

**Approach.** A kit runs one code path at both levels; the builder knows the level and decides what to draw (`detail`, `nearOnly`, `levels`, `essential`, `proxy`, and small primitives dropping out by themselves; `20-architecture.md`, As built V1B). Both levels therefore make the same random draws in the same order, so silhouette choices and paint match without rolling them up front kit by kit. The old `plain` branches are gone.

**Detail kit** (`kits/parts.ts`, `kits/details.ts`, `kits/roofs.ts`, `shell` in `kits/buildings.ts`): windows with a proud frame and a reveal, muntins, a sill, stone lintels and sills on brick and stone fronts, ledged shutters, window boxes; doors on a stone step with a fanlight (brick and stone) or a hood (timber); shopfronts with pilasters, fascia, gilt lettering, stall riser and awning (already there, now with far versions); string courses and brick cornices; eave fascias, verge boards and ridge caps; dormers; chimney stacks with a string course, cap and one or two pots; gutters and a downpipe; timber framing, jetties and ivy (already there). Surface ids on every face of every building kit.

**Joined facades** (`kits/rows.ts`, `rowNeighbors` in `render/layers/buildings.ts`): cottage, townhouse, shop and house join neighbors of those kits that face the same way with their fronts on one line at the same level. The village fixture's homes all stand a tile apart (its rows use a gap), so the close joined-row shots are from the town showcase's main streets, where 80% of homes touch, and from the gallery (`?scene=lineup&join=1`). The workshop does not join (its yard side depends on its door).

**Triangles** (every style and six seeds, with the def's params; `?scene=levels` in the gallery prints them under each pair):

| Kit | Footprint | Near (avg / max) | Far (avg / max) |
|---|---|---|---|
| bakery | 2 x 2 | 1,482 / 1,482 | 216 / 216 |
| brick-kiln | 2 x 2 | 1,308 / 1,308 | 426 / 426 |
| builders-yard | 3 x 3 | 1,170 / 1,170 | 282 / 282 |
| cart-shed | 2 x 3 | 1,287 / 1,308 | 124 / 124 |
| cheesemaker | 2 x 2 | 2,184 / 2,184 | 60 / 60 |
| chopping-shed | 2 x 2 | 1,498 / 1,498 | 366 / 366 |
| cider-press | 2 x 2 | 1,564 / 1,604 | 80 / 80 |
| clay-pit | 2 x 2 | 1,166 / 1,166 | 194 / 194 |
| cottage | 2 x 2 | 1,646 / 2,939 | 75 / 85 |
| dairy | 3 x 3 | 1,981 / 2,172 | 140 / 140 |
| farmhouse | 2 x 2 | 1,358 / 1,366 | 86 / 86 |
| farmstead | 3 x 3 | 2,592 / 3,515 | 123 / 157 |
| fishers-hut | 2 x 2 | 1,286 / 1,286 | 164 / 164 |
| foresters-lodge | 2 x 2 | 1,751 / 1,751 | 135 / 135 |
| herb-garden | 2 x 2 | 2,047 / 2,096 | 188 / 188 |
| herbalist | 2 x 2 | 1,612 / 2,002 | 64 / 64 |
| house | 3 x 2 | 2,367 / 2,746 | 136 / 141 |
| market-stall | 1 x 2 | 508 / 508 | 162 / 162 |
| orchard | 3 x 3 | 2,382 / 2,470 | 120 / 120 |
| quarry | 3 x 3 | 820 / 820 | 390 / 390 |
| sawpit | 2 x 3 | 750 / 750 | 250 / 250 |
| school | 3 x 3 | 2,663 / 2,924 | 134 / 134 |
| shed | 2 x 2 | 612 / 612 | 30 / 30 |
| sheep-pasture | 3 x 3 | 1,068 / 1,068 | 38 / 38 |
| shop | 2 x 3 | 2,719 / 3,900 | 124 / 134 |
| smithy | 2 x 2 | 1,606 / 1,610 | 118 / 118 |
| spinner | 2 x 2 | 1,489 / 1,644 | 109 / 112 |
| storehouse | 3 x 3 | 1,631 / 1,647 | 120 / 120 |
| tavern | 3 x 2 | 3,955 / 4,243 | 165 / 169 |
| town-hall | 4 x 4 | 4,837 / 4,837 | 338 / 338 |
| townhouse | 2 x 2 | 2,288 / 3,054 | 140 / 149 |
| trading-post | 4 x 3 | 2,232 / 2,232 | 172 / 172 |
| vegetable-plot | 2 x 2 | 916 / 916 | 30 / 30 |
| weaver | 2 x 2 | 1,641 / 1,748 | 87 / 90 |
| well | 1 x 1 | 478 / 478 | 266 / 266 |
| windmill | 2 x 2 | 1,108 / 1,108 | 262 / 262 |
| woodcutter | 2 x 2 | 1,710 / 1,710 | 138 / 138 |
| workshop | 2 x 2 | 1,195 / 1,584 | 82 / 94 |

Homes (cottage, townhouse, shop, house, workshop, farmhouse) stay within 150 at the far level and 4,000 near (the worst, a stone shop with its flat, is 3,900, after proud stones and quoins lost the faces against the wall). The farmstead is a house and a barn on one lot: 157 far at most, 3,515 near. Nothing is over 430 far; the town hall is 338.

**Builds**: `ShapeBuilder` keeps vertices in growable typed arrays and converts each color once, so building is about three times faster (the profile run of 720 builds: 8.6 s before, 2.8 s after). In Node the slowest keys average 1.3 to 4.3 ms (the town hall); in the browser (SwiftShader, sharing the CPU) the town showcase built 621 keys in 1,557 ms and the village of 130 its keys in the time logged below.

**Not done** (follow-ups for V1X): the customization swatches still map to the old palette tokens (palette 2.0's values are V1A's to settle); decor props other than the fruit trees keep one level (small props shrink away at the decor distance anyway); props, decor and residents still write plain surfaces; the far town's dense window bloom at night is for V1A (see the wave notes).
