# R1E: Art for trades

**Iteration**: R1 Zones first. **Wave**: parallel. **Branch**: `cycle/r1e-trade-art`, from `cycle/r1x-integration`; PR into `cycle/r1x-integration`. **Recommended effort**: high.
**Depends on**: R1.0, and V2.0 on `main` (V2's contracts: surfaces, materials): merge `main` into your branch first and again as V2's wave lands. **Runs alongside**: R1A to R1D, R1F, and V2's wave (which owns every other render and art path). **Ports**: client 5225, relay 8835.

## Goal

A business looks like its trade and its level: a baker's workshop smells of bread from across the street, an orchard farmstead stands among its trees, a level 3 shop has a painted sign and goods out front, all drawn from the kits that exist. The four new specialized buildings (the Brickworks, the Granary, the Market Square and the Forester's Lodge as one building) have kits of their own.

## Read

- `CLAUDE.md`; `docs/build/r1-wave-notes.md` (File ownership: R1E; Who writes what)
- `docs/spec/13-ledger.md`: Zoning and growth (Trades, Levels: "Levels are drawn"), Land and specialized buildings
- `docs/spec/17-presentation.md`: what it says of businesses and levels; Visual direction (second pass) for what V2 is doing beside you
- `docs/spec/31-parallel-development.md`: the redesign's pairs (what R1E owns and what V2 owns)
- `docs/spec/20-architecture.md`: R1 contracts (`BuildingView.trade`, `.level`, `.keeperId`; `TradeDef.look`)

## You own

`packages/art/src/kits/` for buildings, workplaces and services (not nature, trees, props, decor, vehicles or residents, which are V2's), their registry lines in `packages/art/src/kits/index.ts`, and `apps/client/src/render/layers/buildings.ts`. Nothing else in `render` or `art` (V2's), and nothing in the sim or content but `TradeDef.look` values in `packages/content/src/trades.ts` (R1B owns the file: agree the look lines with R1B, one line per trade).

## You can rely on

- `BuildingView.trade` (a content trade id), `.level` (absent is 1) and `.keeperId` on every building; the Mirror's residents for the keeper's family name (the sign).
- `TradeDef.look`: an `ArtRef` naming an existing kit (bakery, farmhouse, vegetable-plot, orchard, dairy, sheep-pasture, apiary, weaver, carpenter, chandler, cider-press, shop) with params; `artKitId(def.art)` reads `params.kit` once that kit exists, else `kit`.
- The kits the chain economy drew (their ids stay as trade looks): `bakery`, `brick-kiln`, `cheesemaker`, `chopping-shed`, `cider-press`, `clay-pit`, `dairy`, `farmhouse`, `herb-garden`, `orchard`, `sawpit`, `sheep-pasture`, `smithy`, `spinner`, `weaver`, `woodcutter`, `pie-shop`, `chandler`, `tailor`, `carpenter`, `workshop`, `farmstead`, `shop`.

## Tasks

1. **Looks by trade**: the buildings layer draws a business (a `workshop`, `farmstead` or `corner-shop` def with a `trade`) by its trade's look, in its lot's district style, fitted to the business def's footprint (3x3 workshop and farmstead, 2x3 shop). Grain farms, market gardens, orchards, dairies, sheep runs and hives each read as themselves at a glance from the Ledger's height.
2. **Levels drawn**: level 1, 2 and 3 a bigger yard, a painted sign with the keeper's family name, goods out front (17-presentation.md and 13-ledger.md, "Levels are drawn"); never a different footprint.
3. **New kits**: the Brickworks (clay pit and kiln in one, on clay), the Granary, the Market Square (six stalls, 3x3; Odette's finale roofs it into the Market Hall later), and the Forester's Lodge (the old woodcutter, forester and chopping shed in one), each with its registry line.
4. **The reach ring** is an overlay (V2's path): if R1C asks for one, agree the API with V2 rather than drawing it in the buildings layer.
5. Turn back on the two render tests R1.0 skipped for you (`render/hamlet.test.ts`, pile levels and a plot's growth; `render/village.test.ts`, what a craft makes and the orchard's season; wave notes, Skipped and deleted tests), rewritten for trades: a market garden's growth, a baker's look, an orchard farmstead's season.
6. The gallery shows every trade at every level and the four new kits: `apps/gallery` is V2's path, so add one section through the gallery's existing registry and list it in your PR.
7. Budgets: `22-quality.md` (the frame budget on Medium; the buildings layer's draws within V1's numbers). Measure the village scene before and after.

## Acceptance criteria

- [ ] Every trade at each level and the four new specialized buildings drawn, screenshots in the PR at 1440 x 900 (day and dusk).
- [ ] No render or art path outside yours changed; the frame and draw budgets hold on the village scene.
- [ ] Typecheck, lint, unit tests (`render` and `art` tests for what you touched), build and e2e pass.

## Out of scope

Materials, surfaces, lights, nature and the renderer (V2); what trades a lot takes and when a level changes (R1B); UI (R1C).

## Notes

- `render/kitGeometry.ts` (V2's) reads `BuildingRuntimeView.method` for a building's goods pile today; from R1 a business's look comes from `BuildingView.trade`. Decided: you draw the trade looks in your own buildings layer; if `kitGeometry.ts` needs to read `BuildingView.trade`, add that one additive line in the shared file and list it in your PR.
- R1.0 kept every old kit id so trades can borrow them; retire a kit only once no trade or def names it, and say so in your PR.

## Look calls (R1E's lead, 2026-11-11)

How each trade and level reads from the Ledger's height. A 3x3 lot is 60 to 100 pixels across at 1440 x 900 from there, so every trade has one **signature mass** (big, colored, outside `s.detail`, so the far level keeps it) and its small things (tools, sills, crates) are near-only detail.

**Plumbing** (`kits/business.ts`): `businessParams(look, makes, level, lookParams)` gives a business's params (`look`: the kit id its `TradeDef.look` names; `level` 1 to 3; `make`: its good); `render/kitGeometry.ts` adds them for a building with a trade. The `workshop`, `farmstead` and `shop` kits draw `WORKSHOP_LOOKS[look]` (`kits/workshops.ts`) or `FARM_LOOKS[look]` (`kits/farms.ts`), else the C4E building as before. Each draw takes the district look (`homeLook(opts, salt)` from `grown.ts`), so a baker on a brick street is brick. Without a `level` param (the C4E showcase, an old gallery cell) a kit draws as it did.

**Levels** (every business, never a different footprint):

- **1**: a modest building (one storey, about 1.5 x 1.3 tiles for a workshop) and a small packed-earth yard; the signature mass already there; a small output pile.
- **2**: the building grows (wider, a lean-to or a side extension); a **painted sign** by the door (`paintedSign`: a board in the business's paint with a cream panel; `anchors.sign` is where the buildings layer letters the keeper's family name); **goods out front** (`goodsOutFront`, a trestle with the good, crates at its feet, near the lot's front edge).
- **3**: a loft or upper storey (dormer or jetty), an **awning** over the front, a **bigger yard** fenced in the district's edge, more stock (a second pile, barrels, a handcart's worth).
- Farms read their level in land: the produce area grows (more trees, rows, hives, animals) and level 3 adds an outbuilding; the sign stands on two posts by the gate facing the road.

**Workshops** (3x3):

- **Baker** (`bakery`): a domed brick bread oven bulging from the side wall, its own fat chimney smoking, a stack of oven wood beside it; loaves on the sill, flour sacks by the door, the bread emblem. Signature: the dome and the smoke.
- **Weaver** (`weaver`): the long band of weavers' windows under the eaves, and the tenter frame in the yard with dyed cloth in madder red, woad blue and weld yellow, dye tubs. Signature: the colored strips. Level 3 a second frame.
- **Carpenter** (`carpenter`): an open-fronted bay on posts beside the shop, stacked pale planks, a sawhorse with a plank across it, a half-made chair; chairs and a table out front. Signature: the open bay and the pale stacks.
- **Chandler** (`chandler`): a dipping rack hung with rows of cream candles, a wax pot over a little fire (smoke), honey pots; a candle emblem and a warm window. Signature: the cream rack.
- **Cider maker** (`cider-press`): the apple mill and screw press under an open press shed, a pyramid of barrels, red apple crates. Signature: the barrels.
- **Shop** (`shop`, 2x3): level 1 a plain painted fascia and a small hanging sign; level 2 the fascia carries the keeper's name (`anchors.sign`), a wares bench and a table with two chairs out front (treats from level 2); level 3 the striped awning, a second bench and tubs of flowers.

**Farms** (3x3; the fields themselves are the fields layer's):

- **Grain farm** (`farmhouse`): the big barn (barn red, or the district's stone) is the mass, with a golden round hayrick under a thatched cap and stooks; a patch of standing grain by season (green, gold, stubble, bare). Level 3 a second rick and a granary on staddle stones.
- **Market garden** (`vegetable-plot`): most of the lot in neat rows of greens with colored crops (cabbage, carrot, beet), by season (seedlings, full, half lifted with pumpkins, bare earth and straw); cold frames, a potting shed, a scarecrow; level 3 a little glasshouse.
- **Orchard** (`orchard`): a grid of fruit trees by season (blossom, green, fruit, bare): 4 at level 1, 6 at 2, 8 or 9 at 3; a packing shed, ladders and red crates.
- **Dairy** (`dairy`): a long low byre, cows in a paddock (2, 3, 4), a churn stand by the gate, cheese wheels on the trestle.
- **Sheep run** (`sheep-pasture`): the lot mostly a fold (post and rail, dry stone in Hill Stone), sheep (3, 5, 7), the shepherd's hut on wheels, fleeces and bales; level 3 a shearing shed.
- **Hives** (`apiary`): a flowery meadow with rows of white hive boxes and golden straw skeps (3, 5, 8), a honey house; honey jars out front.

**The four new kits**:

- **Brickworks** (`brickworks`, 3x3): a bottle kiln (the tallest mass, smoking), a clay pit dug into a back corner (ochre banks, a puddle), drying hacks (low racks of grey-green unfired bricks under narrow roofs), stacks of fired red bricks at the front by its output, a pug mill and kiln wood.
- **Granary** (`granary`, 3x3): a tall weatherboarded granary on staddle stones with a steep roof and a hoist loft (lucam) over the door, steps up, sacks, baskets and barrels on a loading platform by its stock. Never mistaken for the long low Storehouse.
- **Market Square** (`market-square`, 3x3): a paved square, six stalls (two rows of three, open toward the entrance) under canopies in six warm colors, each with a family's goods on its counter (bread, vegetables, cheese, cloth, candles, cider and honey), a market cross in the middle. Odette's finale roofs it into the Market Hall later.
- **Forester's Lodge** (`foresters-lodge`, 2x2, the kit rewritten in place): a log lodge, an open chopping shed against it with a block and split firewood in a round stack, felled logs by its output, and a nursery bed of saplings for replanting.

**Budgets per kit**: near at most 4,000 triangles at level 3 (3,000 at level 1), far at most 250.
