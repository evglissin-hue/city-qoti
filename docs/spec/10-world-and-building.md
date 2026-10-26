# 10. World and building

## Units and coordinates

| Unit | Value |
|---|---|
| Map | 192 x 192 tiles, index `i = z * 192 + x`, x east, z south |
| Tile | 4 m, 1 world unit in the renderer |
| Height level | integer 0 to 15; 1 level = 0.5 world units (2 m) |
| Water level | level 0 |
| Sub-tile fixed point | 1 tile = 256 units (decor and agent positions) |
| Building rotation | 0 to 3 (quarter turns; 0 = entrance faces south, +z) |
| Decor rotation | 0 to 63 (5.625 degree steps) |
| Chunk | 16 x 16 tiles (12 x 12 chunks), used for dirty tracking and rendering |

## Map layers

Typed arrays of length 192 x 192 in `WorldState.map`:

| Layer | Type | Values |
|---|---|---|
| `height` | Uint8 | 0 to 15 |
| `terrain` | Uint8 | 0 grass, 1 meadow, 2 forestFloor, 3 sand, 4 rock, 5 mountain, 6 water, 7 field [I1] |
| `water` | Uint8 | 0 none, 1 river, 2 riverDeep, 3 pond [I3], 4 canal [I4] |
| `fertility` | Uint8 | 0 to 100 |
| `deposit` | Uint8 | 0 none, 1 stone, 2 clay, 3 sand [I4], 4 coal [I4] |
| `road` | Uint8 | 0 none, 1 path, 2 lane, 3 street [I2], 4 avenue [I5] |
| `tree` | Uint8 | 0 none, else `species * 8 + stage` (species 1 oak, 2 birch, 3 pine; stage 0 sapling to 3 mature) |
| `occupant` | Int32 | building id occupying the tile, 0 if none |
| `zone` | Uint8 | [I2] 0 none, see `13-ledger.md` |
| `parcel` | Uint8 | parcel index 0 to 15 |
| `flags` | Uint8 | bit 0 floodplain [I3], bit 1 valleyGate, bit 2 startArea |

## Valley generation

Deterministic from `seed` (string) using the `worldgen` RNG stream. Must finish in under 300 ms in Node. Valley types: river valley (I0), coast, highlands, lakes [I5].

1. **River.** Pick a flow axis (north to south or west to east) from the seed. Walk the centerline across the map: velocity `v += uniform(-0.15, 0.15)`, clamp `|v| <= 0.6`, position `+= v`, keep within tiles 40 to 152, then smooth with a 9-tile moving average. Width 2 tiles, 3 where a noise channel exceeds 0.6. Mark `water`; the middle tile of 3-wide stretches is `riverDeep`.
2. **Distance field.** Chamfer distance `d` from every tile to the nearest water tile.
3. **Height.** `h = clamp(floor(base(d) + n), 0, 12)` where `base(d) = 0` for water, `1` for `d <= 2`, then `1 + (d - 2) / 6` capped at 10, and `n` is 3-octave value noise (scales 32, 16, 8 tiles; amplitudes 3, 1.5, 0.75; centered on 0). A 6-tile border ring becomes `mountain` at heights 13 to 15.
4. **Terrain.** `sand` on bank tiles (`d = 1`) where a noise channel exceeds 0.5; `rock` where the local slope (max height difference to a 4-neighbor) is at least 3 or `h >= 11`; `meadow` where `h <= 3` and a moisture channel exceeds 0.55; `forestFloor` under the forest mask; otherwise `grass`.
5. **Forest.** Mask: noise at 24-tile scale above 0.55, `d >= 6`, `h <= 11`. Density has soft edges: about 35% at the rim of the mask rising to 85% at its heart, with a sparse fringe (14%) on grass just outside it and 2.5% lone trees elsewhere. Clearings (a 10-tile noise channel above 0.74 inside the mask) become meadow glades. Species by height: `h <= 3` oak 60% / birch 40%; `4..8` oak 50% / pine 50%; `>= 9` pine. Wild trees start mature; only planted saplings grow.
6. **Deposits.** Stone clusters on and around rock (cluster noise), clay clusters on bank and sand tiles. Guarantee at least 2 stone clusters of 12+ tiles and 1 clay cluster within 40 tiles of the start area; if missing, stamp one deterministically.
7. **Fertility.** `100 - 3d` near the river (floor 20), +15 on meadow, -30 on forest floor, -60 on rock, plus noise, clamped 0 to 100.
8. **Start area.** Search, in deterministic order, for a 24 x 24 window 6 to 14 tiles from the river in the middle third of the map with height spread at most 2 and no rock. Clear trees in its central 16 x 16. Set `flags.startArea`.
9. **Valley road.** A* from the map edge (on the start area's side of the river, perpendicular to the flow) to the start area, cost favoring flat, treeless tiles. Paint it as `lane`. The edge tile gets `flags.valleyGate`: arrivals and trade enter here.
10. **Parcels.** Voronoi cells around 16 jittered points on a 4 x 4 grid. The cell containing the start area center is parcel 0 (unlocked). I0 unlocks all parcels.
11. **Validation.** The river must span the map, the start area must exist, and deposits must be present; otherwise regenerate with `seed + ":r" + n`.

Output: map layers, metadata (`startArea` rect, `valleyGate` tile, flow axis), and nothing else. Generation is pure: same seed, same valley, on every machine.

C2A implements all steps behind `generateValley(seed, settings)`, with a softer storybook shape: the river centerline is two low octaves of value noise (64 and 28 tiles) around a seeded middle, smoothed over 9 tiles and limited to 0.7 tiles of drift per step, always 3 wide with a deep middle; banks are sand at `d = 1` and patchily at `d = 2`; height uses octaves at 48, 24 and 12 tiles (amplitudes 5, 2, 0.6), terraces `base(d) = 1` to `d <= 3` then `1 + (d - 3) / 10` capped at 8, plus a rise of up to 3.5 levels within 34 tiles of the border, so slopes inside the valley are almost always 1 or less. Noise is damped near the river so banks stay buildable, and the start area is levelled to its median height plus or minus 1. Validation retries up to 5 times with `seed + ":r" + n` when no start window free of rock and water exists; the last attempt keeps a fallback window. `valleyNameFor(seed)` names the valley from the content word lists (`valleyNamePrefixes`, `valleyNameSuffixes`).

## Terrain rules

- Walking and roads connect 4-neighbor tiles whose height differs by at most 1. A difference of 2 or more is a cliff. Stairs (a Hearth decor piece) bridge a 2-level cliff for paths only [I2].
- Terraforming [I2]: raise, lower and level tools (Ledger). Cost per level per tile *(tune: 3 coins)*. Not on water, roads or buildings.
- Ponds [I3]: Hearth can dig a pond (lower to 0 and fill) on fertile low tiles.
- Canals [I4]: Ledger digs canal tiles connected to the river.

## Roads

| Kind | From | Who uses it | Cost per tile *(tune)* | Notes |
|---|---|---|---|---|
| Path | I0 | walkers | 1 coin [I1] | charm +1 radius 0; cheapest connection |
| Lane | I0 | walkers, porters, carts | 2 coins [I1] | the valley road is a lane |
| Street | I2 | walkers, carts (faster) | 4 coins + 1 stone | noise; needs Cobbles innovation |
| Avenue | I5 | trams, carts | later | |

- **Painting.** Drag from A to B; the client proposes a straight or L-shaped route (`road.paint` carries the tile list, max 256 tiles). The sim validates each tile and paints valid ones; if any tile is invalid, the whole command is rejected with the first failing tile. Neighboring tiles in a run may differ by at most one level (`TOO_STEEP`). Sandbox clears forest trees under new roads.
- **Bridges.** A road over water is a bridge: up to 6 consecutive water tiles, both ends on land, height of ends 0 or 1. Cost x3 [I1].
- **Removal.** Free; refunds 50% of coin cost [I1].
- **Connections** are computed, not stored: the renderer draws joins from neighbor road tiles.
- **Desire paths** [I2]: grass tiles walked often get worn; the overlay suggests paths.

## Buildings

Defined in `packages/content` (fields in `20-architecture.md`). Placement rules, all reported with a reason code:

| Rule | Reason code |
|---|---|
| Footprint inside the map and in unlocked parcels | `OUT_OF_BOUNDS`, `LOCKED_PARCEL` |
| No water under the footprint unless the def allows `waterEdge` | `WATER` |
| No road, building or decor in the footprint (decor keeps its 32-unit margin, and every decor piece is handmade, so a building never swallows one) | `OCCUPIED` |
| Footprint height spread at most 1 (adds a foundation), else invalid | `TOO_STEEP` |
| Def-specific rule (deposit, water edge, fertility, height) | `NEEDS_DEPOSIT`, `NEEDS_WATER_EDGE`, `NEEDS_FERTILITY` |
| Affordable [I1] | `CANNOT_AFFORD` |

- **Trees in the footprint**: sandbox removes them. Standard [I1]: the construction site includes clearing work (+1 builder-hour per tree, yields 4 logs each to the nearest storehouse).
- **Entrance**: each def has an entrance tile offset (front middle by default). The tile in front of it must be a road for the building to function [I1]; placement without it is allowed with a warning, and the building shows a "no road" marker until connected.
- **Foundations**: a footprint with spread 1 gets a stone plinth (render) and costs +10% stone [I1].
- **Construction** [I1]: placed buildings start as construction sites (see `13-ledger.md`). Sandbox: instant.
- **Removal**: sandbox instant. Standard [I1]: refunds 50% of materials to the nearest storehouse; residents and workers are released.

## Decor

Off-grid pieces (benches, lanterns, flower beds, planters, fences, low walls, hedges, signposts, barrels, crates, ornamental trees, statues, fountains...).

- Position `fx, fz` in fixed point, rotation 0 to 63, collision radius `r` from the def (fixed point).
- May not overlap building footprints (with a 32-unit margin) or water (unless `def.onWater`). Two decor items may not have centers closer than `0.8 * (r1 + r2)`.
- Allowed on grass, meadow, sand, roads (paths and lanes only, and only defs with `onRoad`), field edges. Elsewhere the reason is `NOT_ALLOWED`; a forest tree on the tile gives `OCCUPIED`.
- **Linear decor** (fence, low wall, hedge, bunting [I3]): drag places a run of segments along a line, each a separate decor item aligned to the line. Segments are 1 tile long (the client snaps runs to tile centers). The sim picks each segment's rotation from a 64-entry integer direction table, since it may not call trigonometry.
- **Ornamental trees** (apple, cherry, willow, lime...) are decor. Forest trees are the `tree` layer (harvested by woodcutters). Ornamental trees are never harvested.
- Cap: 6,000 decor items per valley. The UI warns at 5,500.
- Every decor item is handmade (guardrails in `16-coop.md`).

## Trees (tile layer)

- Stages: sapling (0) → young (1) → grown (2) → mature (3). Each stage takes 2 days [I1]. Only mature trees yield logs (4) and count fully for charm and wildlife.
- `tree.plant` places a sapling on grass, meadow or forest floor with no road, building, tree or decor on the tile. `tree.remove` clears it (sandbox instant; standard [I1] queues a clearing job that yields logs).
- Foresters replant automatically within their radius [I1].
- Winter [I3]: deciduous trees bare, no growth.

## Parcels [I4]

16 parcels. Each has an unlock rule in content: rank reached, coin purchase, a bridge built to it, or clearing a feature (bandit camp, wolf den) with the Watch. Locked parcels render desaturated with a soft fog edge. See `15-progression.md`.

## Customization

Hearth actions that mark the target as handmade.

- **Phase 1 [I1]: paint and details.** Per building: wall swatch, roof material and swatch, accent swatch (doors, shutters), window boxes, shutters, chimney, shop sign text (24 chars). Command `build.customize`. Swatches come from the palette in `17-presentation.md`. *As built (C3B)*: the allowed swatch ids are content (`packages/content/src/swatches.ts`, `content.swatches`, grouped `wall`, `roof`, `roofMaterial`, `accent`, each naming its `packages/art` palette token), because the sim may not import art. Each field is optional; `null` clears it back to the kit default and `false` turns a detail off. Sign text is trimmed, 1 to 24 printable characters. Any accepted change marks the building handmade and emits `building.updated`; window boxes count as a little flower piece for charm.
- **Phase 2 [I3]: modules.** Special homes and landmarks offer module slots: porch, dormer, bay window, extra floor, balcony, tower, arcade. Modules cost materials.
- **Phase 3 [I4]: block builder.** Landmarks are built by stacking 1-tile blocks on their plot (walls, arches, roofs, stairs, towers). Pieces adapt to neighbors and slopes: roofs join, stairs appear where levels differ, arches form over passages (P21).
- **District styles** [I4] set defaults for grown buildings (see `12-hearth.md`).

## Placement feedback (for the client)

The sim exports pure validators that run on any `MapReader` (sim state or client mirror), so ghost previews are synchronous and match the sim exactly:

- `canPlaceBuilding(reader, def, x, z, rot) -> { ok, reason?, tiles, foundation, warnings[] }`
- `canPaintRoad(reader, kind, tiles) -> { ok, reason?, firstBadTile? }`
- `canPlaceDecor(reader, def, fx, fz, rot) -> { ok, reason? }`
- `canPlantTree(reader, x, z) -> { ok, reason? }`
