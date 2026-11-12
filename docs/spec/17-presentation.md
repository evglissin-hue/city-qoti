# 17. Presentation

A storybook miniature: soft-lit, warm, richly detailed, never grimy, never babyish (P4, P44 to P49).

## Visual direction [V0]

The game should stay cozy and get much more detailed (owner, 2026-11-01). The V0 concept viewer (`docs/concepts/v0-look/index.html`, open it in a browser; stills in `docs/build/screenshots/v0-*.jpg`) draws one generated town three ways, in each era (`18-eras.md`) and at day, golden hour and night, with a live fps, draw call and triangle readout to try on both laptops.

| Direction | What it is | Cost |
|---|---|---|
| A. Polished Storybook | Today's palette and chunky shapes, plus joined rows, window frames, roof courses and ground variety | cheapest; close to today's budgets |
| **B. Painted Miniature (picked)** | A softened, harmonious palette; surface detail drawn in the shader (brick courses, roof tile rows, thatch, plaster grain, timber); ambient occlusion, warm haze, tilt-shift; a model village under a warm lamp | moderate: one material system, then detail everywhere for free |
| C. Grand Diorama | Closest to Anno: taller three to four storey buildings, mansards, cornices and more ornament, a natural palette, stronger haze and little tilt-shift | most geometry and the least cozy |

**Status**: B picked by the owner and Kat (2026-11-01); A and C stay recorded as the alternatives. The V1 briefs (`docs/build/cycle-v1-*.md`) built B into the game, merged by V1X (2026-11-03). From the default camera and close up, by day, golden hour and night, the game now reads as the B concept for the Old Age (`docs/build/screenshots/v1-after-*.png` beside `v0-lean-b-*.jpg`): the palette, the pattern detail on every building, the lit far windows, the warm haze and the shadows match. What still differs: the concept's stills are Age of Steam towns of joined terraces (V3 and V5; the visual iterations were renumbered on 2026-11-10, `30-roadmap.md`), its night lamp pools are larger and warmer (V2's light map), and its trees are rounder at a distance (V2's painted green). The concept viewer stays the reference.

**Performance**: on High the first concept ran at about 20 to 25 fps on the owner's laptop. The concept now runs on the lean renderer (`20-architecture.md`, Lean renderer), the same look drawn far more cheaply; the first engine stays in `docs/concepts/v0-look/v1-engine.html` for comparison. V1 builds the lean renderer into the game.

Measured in a software renderer (the build container has no GPU, so only the ratios mean anything), at 1280 x 800 on a 2x screen, B in the Age of Steam, three frames each:

| View | First engine, High | Lean, High, moving | Lean, High, camera at rest | Lean, Ultra, moving (same pixel ratio as the first engine's High) |
|---|---|---|---|---|
| Town | 12.6 s | 1.6 s (7.8x less) | 0.39 s (32x less) | 2.6 s (4.8x less) |
| Street | 13.4 s | 2.0 s (6.6x less) | 0.33 s (40x less) | 3.6 s (3.7x less) |

The first engine drew 4.9 M triangles a frame (shadows, the scene and the AO normals, each from scratch); the lean renderer draws 0.2 M while moving and 0.04 M at rest. Medium: 3.0 s and 3.3 s on the first engine, 0.83 s and 1.0 s moving, 0.19 s and 0.16 s at rest. Stills of the lean renderer: `docs/build/screenshots/v0-lean-*.jpg`.

Concept numbers (Age of Steam, 249 buildings, about 3,000 trees and the valley around them, every post pass on): A 0.49 M triangles, B 1.24 M, C 1.28 M, under 100 draw calls. The concept merges each look into a few meshes, so the game will draw more calls than this; the triangles are a fair guide to what each look costs.

Whatever the pick, the gap to close is the same: buildings standing alone on lawns instead of joining into streets, flat roof planes with no courses or thickness, one saturated grass, and little ambient occlusion where things meet.

## Visual direction, second pass [V2 to V4]

Accepted by the owner on 2026-11-10 ("how pretty it is, how cozy it is, and how detailed it is. Detailed is very important"), after a look at an autoplayed Village of 177 by day, at golden hour and at night. The Painted Miniature stays the direction. A grown town at mid zoom already reads well; these six items are where it does not yet. Everything is still made in code (P46): no image textures, no art assets.

**The rule that makes detail cheap.** On integrated graphics pixels cost and triangles do not (`22-quality.md`): a town on Medium draws 0.58 M of its 3 M triangles and 122 of its 300 calls, and static layers cost nothing while the camera rests (the still-frame cache). So V2 to V4 add detail three ways only: more small static geometry in instanced draws, shader inputs read from small map-sized textures, and work done once at rest. They add no full-screen pass to a moving frame. No GPU time had been measured in the game on either laptop when this was written, so V2 starts by measuring both (`22-quality.md`, Measuring the laptops) and every budget below is checked there.

### 1. Night as the signature [V2]

*Found*: only the 32 lights nearest the camera reach the ground (`MAX_GROUND_LIGHTS`) and none reaches a wall, so in a real town most lanterns light nothing (the I3 playtest sheet's "half-lit lanterns").

- **The light map**: one top-down texture of the valley's lamplight, 4 texels a tile on Medium (768 x 768). Every lit lantern and lamp, each lit window's spill outside its wall, oven doors, bonfires, festival lights and shop fronts are drawn into it as soft additive discs, in one instanced draw, then blurred once. It is redrawn only when a light changes (the lamplighter's round, a window's hour step, a festival), which makes it a static-layer event.
- **Who reads it**: the ground (in place of the 32-light loop), walls (sampled a little in front of the wall along its normal, fading out between 1.5 and 4 tiles up), trees and hedges (lit from below), folk and carts (a warm rim), smoke, and water (the same texture read through the ripples, so lamplight trembles on the river). Unlimited lights for one texture read a pixel.
- **By era** (`18-eras.md`): candlelight is the lantern token (the Old Age's lanterns burn the chandler's candles; older notes call them oil lanterns), gas a greener gold, electric a paler warm white. A district's lamps set its night color.
- **Rooms behind the windows**: in the kit material's glass, each pane shows a little room by parallax (walls, a shelf, a table, a figure when someone is home), chosen by the building's seed from eight room layers generated into the pattern array. It costs a handful of shader operations on window pixels only. From the default camera it reads as livelier, more varied windows; at street zoom and in photos every lit pane is a tiny diorama. From R3 a home with a candle lights all its windows until bedtime, so a well supplied street is visibly brighter; no home ever goes dark (`19-evenings.md`, Supplies).
- **As built (V2A)**: one map carries lanterns, lit windows' spill, oven doors, the bonfire, festival lights and shop fronts; the ground, every kit piece, folk (a warm rim) and the river read it, and a grown village glows from the valley's edge. Walls take a breath of it low down and roofs little, so pools stay pools. Each room cell (a tile wide, a storey tall) of a facade picks one of the eight rooms by the building's seed and the cell, so neighboring windows of one house can look into different rooms; the figure shows by seed (two cells in five) until homes report who is in (a later wave). Far off a lit pane keeps the full glow with a hint of its room's color. Lamp flames flicker gently while the camera moves and hold still at rest; the pools never flicker (`20-architecture.md`, V2 contracts, As built).

### 2. A painted green world [V2]

*Found*: buildings are painted and nature is still low-poly (faceted crowns, a flat lawn, tufts that read spiky; the owner's note twice, P1 and after).

- **Trees**: near crowns are built from brush-dab leaves, 180 to 320 small triangles laid on the crown's blobs, each dab tinted a little apart and shaded by the blob's soft normal, lighter toward the sky, with a few gaps to the boughs. Far crowns keep today's shape with the dab tints in their vertex colors. Dabs thin from Autumn day 4 and are gone in winter. Hedges, reeds and ivy use the same dabs.
- **Meadows**: a carpet near the camera (within 30 tiles on Medium): 40 to 60 soft blades a meadow tile, each taking its color from the ground texture at its root and shading with the ground's normal, so the meadow reads as one soft mass and fades into the painted ground with distance. Lawns by houses stay short. As built (V2B): the carpet lies round the view's focus (30 tiles on Medium), so it shows from the default camera as well as at street zoom, fading out as the camera pulls back past about 110 tiles; 50 blades a tile, one triangle each.
- **Flowers** grow in drifts a few tiles across (one low-frequency mask shared by the instanced flowers and the ground shader's painted dots, so near and far agree) instead of an even scatter.
- All of it is opaque geometry: no alpha test, no transparency.
- As built (V2B): `20-architecture.md`, V2 contracts, As built (V2B, green).

### 3. What V1 left half-wired [V2]

- Everyday props, carts and residents write surface id 0 and so have flat color beside painted walls: give them surfaces (wood grain, painted wood, wrought iron, terracotta, cloth).
- The ground's ambient occlusion texture is offered to the kit material and never bound: bind it, so walls darken toward the ground.
- Chimney smoke is stacked balls: draw it as soft ribbons that lean with the wind and take the light map's glow at night.
- Resident bubbles (wish, happy, unhappy, sleepy, cold) are built and never switched on: add them to the View list.
- Only fruit trees have a far level among decor: give one to the dozen commonest pieces.

### 4. Yards, doorsteps and goods you can see [V3]

*Found*: between buildings the ground is flat green and brown, and an automated player fills a town with rows of lanterns and pots because nothing else makes it look full.

- **The dressing layer**: every home, business and specialized building dresses its own plot from what the sim already knows about it, as tiny instanced props at the kit's anchors (door, yard, wall, eaves, garden). It is client-side and derived only from shared state, so both players see the same.
  - By trade: nets on poles at the fishery, loaves cooling on the baker's sill, dyed cloth on the weaver's frame, a half-made chair at the carpenter's, skeps by the hives.
  - By household: a woodpile under the eaves that is as big as the firewood in the pantry, washing on a line once the household owns cloth, a pram after a birth, boots by the door, now and then a cat.
  - By level: a level 2 business hangs a painted sign and sets goods out front; level 3 adds an awning and a bigger yard.
  - By stock: sacks and barrels piled at granaries and storehouses as they fill.
- **Streets that feel like a town** (the old V2): frontage without gaps on streets, rows that join, back gardens and courtyards, corner buildings, floors by tier, street furniture by district. Its sim half (`Lot.row`, garden lots, corner lots, `params.storeys`) is specified by R2.0 and built by R2F; the notes are `docs/build/i4-visual-planning-notes.md`.
- **The ground between**: a worn path from each door to its road, cobble aprons at shop doors, puddles in the hollows for a day after rain, and autumn leaves and spring petals gathering where snow drifts already do (the ground AO's enclosure term).
- Budget on Medium: 0.3 M triangles and 12 draws for dressing, drawn within the decor detail distance.

### 5. The long view [V3]

*Found*: zoomed out, the valley is a green slab in a gray box, and the far view draws more calls than any other (208 on High in the valley looked at).

- **A horizon**: three bands of painted silhouette round the valley (near hills with woods, far hills, sky haze), built once from the valley's seed, under 2,000 triangles, in place of the rim's box of mist.
- **Haze with height**: the fog the shaders already compute thins with height above the valley floor and thickens along the river at dawn and over a town of many chimneys on winter evenings.
- **The river**: color by depth, flow along its course, foam at bridges and weirs, and the light map's reflections.
- **The endpaper map**: from a camera distance of 200 tiles the valley cross-fades into its own inked map, complete at 240: parchment, the river lettered with the valley's name, woods as little trees, fields hatched, roads by class, roofs in rows, the names of places and streets, plans in blueprint ink and the two inks (see UI). It is drawn to one 2048 x 2048 texture on a canvas in a worker when the town changes, never per frame, and while it shows in full the 3D scene is not drawn at all.

### 6. The picture develops when you stop [V4]

The still-frame cache already draws the static world once when the camera rests. For the next half second it keeps adding samples to that picture, one a frame:

- each sample jitters the pixel (so brick courses and roof tiles stay crisp), the sun inside a small disc (soft shadows whose edges widen with distance) and the lens (true depth of field for the tilt-shift, with round highlights on lanterns);
- one sample in four lights the scene from a random part of the sky instead of the sun, which adds the soft shadow of alleys, eaves and courtyards;
- Medium takes 8 samples, High 16, Ultra 32 *(tune)*; Low takes none;
- moving layers are drawn over the result as today and take the lens blur from the cached depth in the final pass;
- a step of the light or a small change to the town folds in a few fresh samples and never restarts; moving the camera drops back to the plain moving frame at once;
- it costs nothing while moving and nothing once settled, and a governor skips it when moving frames are already slow.

Photo mode saves at 64 samples. The riskiest item of the six, and the last built.

**Storybook pictures** [V4]: `capture()` gains an ink style (the developed still, ink lines where depth and facing break, paper grain, a limited wash). The Chronicle, the Pattern Book, the Town Book and the season cards use it, so the books are illustrated by the valley itself (`12-hearth.md`, The Chronicle).

**Tea-break mode** [V4]: after 90 seconds without input (a setting, on by default; never while a tool is in hand or a card is open) the camera follows a resident on their evening round or circles the day's busiest place. Any input puts the view back where it was.

## Palette

All colors are tokens in `packages/art/src/palette.ts`. Customization swatches are subsets.

| Group | Tokens |
|---|---|
| Ground | grass `#8DB360` (summer `#7FA650`, autumn `#B5A048`), meadow `#A7C46A`, forest floor `#5E7F43`, dirt path `#C9A877`, sand `#E3D2A1`, rock `#9A9A92`, snow `#EEF2F5` |
| Water | shallow `#6FB7C2`, deep `#3E8FA6`, foam `#E8F4F2`, ice `#CFE3EA` |
| Foliage | oak `#5C8A3A`, birch `#8DB84A`, pine `#3F6B45`, autumn `#D98A3A` / `#C9603A` / `#E0B84A`, blossom `#F2B8C6` |
| Plaster | cream `#F1E6CF`, rose `#EBC7B9`, sage `#C9D3B4`, sky `#BFD0D8`, butter `#F0DDA0` |
| Structure | timber `#5B4232`, stone `#B9B1A3`, brick `#B5654B`, foundation `#8F877A` |
| Roofs | terracotta `#C0643E`, slate `#5E6B7A`, thatch `#C9A35F`, moss `#6E7F4E`, plum `#7A5468` |
| Accents | teal `#3F7F7A`, red `#A8473B`, mustard `#D6A73E`, navy `#34506B`, white `#F7F4EC` |
| Light | lantern `#FFC977`, window `#FFD58A`, sunset `#F4A261`, night ambient `#2B3A55`, moon `#9DB4D8` |
| UI | paper `#F7F0E1`, paper shade `#E9DEC6`, ink `#3B3229`, ink soft `#6B5E50`, Hearth `#C7604A`, Ledger `#3E6E5A`, warning `#C98B2B`, danger `#A8473B` |
| Seats | 6 seat palettes: lantern gold, rose, teal, plum, sky, moss |

**Palette 2.0 [V1A]** (`palette2`, the Painted Miniature tokens from the concept's palette B, each a little greyed toward its neighbors; kits move their reads to it in V1B and V1C, and the customization swatches read it now: the old plaster, roof and accent tokens they use hold these values):

| Group | Tokens |
|---|---|
| Ground | grass `#93AD66`, meadow `#B7C27C`, forest floor `#5F7A47`, dirt `#C4A67E`, lane `#B09673`, cobble `#A39A8C`, flags `#CDC4B2`, fields `#D0B673` / `#A6B866` / `#A07F5A` |
| Walls | plasters `#EFE3CC` `#E6C6B5` `#CDD2B3` `#C3CFD0` `#EDDAA6` `#E2C9A0`; stuccos, deco and pastels (Age of Steam and Bright Age, in `palette.ts`); bricks `#AE6A52` `#9F5E4A` `#B67D5F` `#94583F` with mortar `#C4BCB1`; stones `#C8BFAE` `#D4CAB6` `#B9B09F`; timber `#5A4434`; foundation `#938A7C` |
| Roofs | tiles `#BB6E4C` `#A95F43` `#C27B55` `#9A5A42`, slates `#67707D` `#5D6773` `#707A83`, thatch `#C2A16A` `#B8975F`, zinc `#8A959B`, moss `#74805A`, plum `#7A5A6C`, flat `#857D73`, copper `#76A594`, chimney `#A1604B` |
| Accents | frames `#F4ECDD`, doors `#4E7C78` `#9C4F43` `#D1A24A` `#45607A` `#6F8B68` `#7A5468`, shutters, shopfronts, awnings `#B2564A` `#4E7C78` `#D1A24A` `#45607A` `#7A5468` with the stripe `#EFE7D7`, glass `#34434F`, metal `#33403A`, wood `#957050` |
| Foliage and water | leaves `#67904A` `#86AD55` `#5A8243` `#76984C`, pine `#466D4C`, bark `#6A4C36`, water `#6AAAB4`, riverbed `#3D5C66` |
| Customization | walls: the first five plasters; roofs: tile, slate, thatch, moss, plum; accents: the first four doors and the frame cream |

## Style kit (`packages/art`)

Pure functions from parameters (and a seed) to `BufferGeometry` with vertex colors and baked vertex ambient occlusion. Deterministic, cached by parameter key, with a high and a low level of detail.

- **Terrain**: chunk meshes (16 x 16 tiles) with smooth slopes between levels, soft cliff faces where levels differ by 2+, terrain colors blended at tile edges, field furrows [I1].
- **Water**: river and pond surfaces with gentle animated waves and foam at banks; frozen variant [I3].
- **Roads**: path (worn dirt with grass edges), lane (packed dirt with ruts), street (cobbles) [I2]; joins and corners from neighbors; bridges (plank and stone). C4E: streets are granite setts in rows across the street between pale kerbs with a gutter shadow; desire paths (the `wear` layer) are narrow trodden lines joining worn tiles; stone stairs climb where a path with the stairs flag meets a road a level up. C4P: paths and lanes are one dirt (a lane a little darker and packed, with soft ruts and a ragged grass crown), and a path running into a lane changes width and dirt over the middle of the joint; a square of four road tiles is paved across; desire paths are trampled earth of the same dirt, never paler than the roads; stairs are cut into the drawn slope (each tread's back flush with the ground, its front one riser above it, all heights from `groundY`) in warm sandstone between sloped kerbs that sink into the ground at both ends, so no tread floats where a hillside falls away to the side.
- **Buildings**: modular parts (walls: plaster, timber frame, stone, brick; roofs: gable, hip, half-hip in thatch, slate, tile; windows with shutters and boxes; doors; chimneys with smoke; porches; dormers; signs). Generators: cottage, house, workshop, mill, farm, storehouse, stall, town hall, landmarks. Construction stages (staked plot, foundation, frame, roof). V1B: the Painted Miniature detail kit on every generator (framed windows with a reveal, muntins, sills, stone lintels on brick and stone, ledged shutters and window boxes; doors on a step with a fanlight on brick and stone or a hood on timber; string courses and cornices on brick; eave fascias, verge boards and ridge caps; dormers; chimney stacks with a cap and pots; gutters and a downpipe; timber framing with posts, rails and braces; jettied upper floors; ivy), surface ids on every face, and a far level of each kit (about 75 to 150 triangles for a home). Homes that touch a neighbor on the same frontage join into rows (`kits/rows.ts`): party walls, stepped rooflines, chimneys on the party wall, one plinth; a corner house dresses its street side.
- **Props**: bench, curved and ring bench, lantern, hanging lantern, well, fountain, birdbath, fence, low wall, planter wall, hedge, flower bed, planter, wildflower verge, signpost, barrels, crates, carts, laundry lines, festival pieces [I3].
- **Trees**: oak, birch, pine, apple, cherry, willow; growth stages; seasonal variants. [V1C] Round-shaded crowns of a few blobs and root flares near, a 16-triangle far level for forests; hedgerows along fields from the same kit.
- **Nature** [I1]: bush, grass tuft, wildflowers, reeds, rock, fern, mushrooms, fallen log, and [V1C] lily pads and hedgerows (kind `nature`). Never placed by players: the renderer scatters them from the map with a seeded hash (forest floor and edges, open grass, meadows, banks, stony ground), clear of roads, buildings and decor, and fades them out at the decor detail distance.
- **Residents** [I1]: one parametric body (rounded, about 0.3 tile tall) with species parts (ears, tails, stripes, spines), fur palette, clothing colors, tier details (aprons, scarves, hats) and seasonal clothing.
- **Critters** [I3]: tiny ambient wildlife (butterflies, bees, ducks, frogs, fireflies). As built (C5E): `layers/critters.ts`, cosmetic and client-side, seven kinds near the habitats that draw them (`habitats.updated` scores; a light share of butterflies, songbirds and fireflies anywhere green): butterflies and bees by pollinator patches and gardens on warm dry days, fireflies over summer meadows at night (slow, unsynchronized pulses), songbirds (some with a robin's red breast) about hedgerows and woods, dragonflies over summer wetland, ducks and the odd swan on open water. Two instanced draws, animated in the vertex shaders; up to 48 flyers and 10 swimmers on Medium, 140 and 24 on High and Ultra, none on Low. Frogs, the kingfisher, the heron and the rest of the Field Guide are still to come.
- **Raid and the Watch** [I3]: As built (C5E): raiders of any species wear storybook cloaks and hoods (muted plum, moss, slate or russet, which their far figures and dots take too) and carry a lumpy loot sack; the Watch carries a lantern and a staff; wolves are a soft grey storybook wolf with a blob shadow, never a resident species; running is a quicker, leaning walk.
- **Village** [I2, C4E]: district styles (`kits/district.ts`: Riverside Timber `timber`, Hill Stone `stone`, Market Brick `brick`, Garden Plaster `plaster`) set wall and upper-floor materials, plaster, roof shape, material and tint, accents and detail odds (window boxes, shutters, ivy, porches, lean-tos, dormers, benches, garden edges: picket, wattle, dry stone, hedge, railings). Grown generators fit any 2x2 to 3x3 lot: the district cottage (side gardens: vegetables, washing, a fruit tree or hens), the Craftsfolk townhouse (jettied upper floor, bay window, fanlight, two stacks), the shop with a flat above (shopfront, gilt fascia lettering, awning, a trade sign), the workshop with its yard and what it makes, and the farmstead (house, barn, yard and a produce corner: pen, fruit trees, wheat or rows). A home's look comes from its seed and district alone, so a cottage that upgrades in place becomes a townhouse in the same walls and paint, with scaffolding while the upgrade is under way. Each I2 building has its own silhouette (clay pit banks and pug mill, bottle kiln, shepherd's hut, spinning wheel porch and dye pots, weavers' windows and tenter frame, byre and churn stand, cheese room, orchard rows by season, apple mill and screw press, round woodstack, skeps and herb beds, open forge, bell cote and playground, inn sign on a post and beer garden, herbalist's bottles and bunches, Trading Post veranda and pennants, cart shed bay and pony stall). Sheep, cows and ponies are animated parts; the cart has a body, wheels and a load per good.
- *As built (P1, the owner's playtest: "meadow grass should look more alive and fluffy; trees need work")*: meadows grow tufts of 10 to 14 curved blades up to 0.32 tall with a base-to-tip gradient and the odd seed head, about five a meadow tile (lawns by houses stay short), that sway by their own height in gusts that travel across the field, take the season's tint (straw and gold in autumn, dull with snow on top in winter) and stay within every preset's budget (Medium about 0.12 M triangles in the hamlet scene against 3 M). Trees have three mature shapes a species: oaks with more clumps tinted apart, airier birches, jittered pine tiers. The meadow ground warms to gold in autumn. Window boxes take a flower color, and the six Village pieces and the five that help the work have kits of their own.
- **Eras** (`18-eras.md`): kits take `era` beside `style`, and an era is a parameter set, not a fork. Old Age [today]: thatch, timber frame, plaster, wattle, dry stone, steep gables, oil lanterns. Age of Steam [I4, V5]: brick and stucco, slate and mansards, sash windows, cast iron railings and lamp posts, gas lamps, chimney stacks, canal locks and barges, terraces of two to four storeys. Bright Age [I5, V6]: stucco in soft pastels, art deco details (stepped parapets, round windows, fluted pilasters), striped awnings, electric globe lamps, tram wires, station canopies; pitched roofs stay the rule.
- **Gallery** (`apps/gallery`): every generator with parameter sliders, all seasons, day and night. Used for art review.

## Lighting and time of day

| Phase | Sun color | Ambient (sky / ground) | Notes |
|---|---|---|---|
| Dawn | `#F6C28B` | `#E9C9B0` / `#6B5E50` | long soft shadows |
| Day | `#FFF4E0` | `#DDE8F0` / `#7A8F5A` | haze `#D8E2E3`, exposure 0.9 |
| Golden hour [V1A] | `#F7B878` | `#EAD0B8` / `#6A5A4C` | peach haze `#ECCAA6`, gentle bloom |
| Dusk | `#F4A261` | `#D9A8B4` / `#4E4660` | windows start to glow |
| Night | moon `#A9BFE0` | `#3A4B6B` / `#232A3A` | haze `#2B3A55`, lit windows, lanterns, bloom |

V1A retuned the table for the Lambert kit material and Khronos Neutral tone mapping, with the concept's day, golden hour and night as the target (`render/lighting.ts`). The warm haze is fog that follows the view: near at 0.93 and far at 4.2 times the camera's distance to what it looks at (`hazeFor`), in the hour's horizon color.

- One directional light with shadows (Medium 2048, High 4096, Low off), hemisphere ambient, fog by weather.
- Night: a share of windows in occupied homes glow (seeded per building, varying by hour); lanterns are emissive with bloom and a soft ground glow. As built there are no real point lights at all: the ground shader draws pools from the 32 lights nearest the view and nothing lights walls (this line promised eight point lights until 2026-11-10). [V2] The light map replaces the pools and lights everything (Visual direction, second pass, item 1).
- C3D-1: the table gains a golden hour (18:00) and a violet twilight (20:30) between its keys; a dusk split tone in the post grade keeps evening greens from turning to mud. Ground glow pools are drawn by the ground shader from the 32 lights nearest the view (lanterns, and spill under lit windows, chosen by the same integer hash as the panes). The sky is a dome with drifting clouds and stars; clouds also drift their shade over the ground by day.
- Sun direction from the in-game hour on the client (any math is fine outside the sim).

## Seasons and weather visuals [I3]

- Grass and foliage tints per season; blossoms on fruit trees in spring; autumn leaf colors and falling leaves; bare deciduous trees and snow-capped pines in winter.
- Snow cover shader on upward-facing surfaces in winter; frozen river; puddles and wet sheen after rain [I4]. [V1A] The kit material draws the snow (patchy as it starts, keeping a hint of courses on thatch, slate and tile), the season tint on grass, leaf and field surfaces, and sway on leaf and flower faces, from `env.snow`, `env.seasonTint` and `env.sway`, which the renderer sets from the calendar's season (`applySeasonLook`); the ground shader's snow is V1C's and C5E's.
- Rain, snow and fog particles sized for the miniature look.
- As built (C5E): the season's look blends through each turning day (`render/seasons.ts`, `seasonBlendAt`, stepping at most once a quarter hour): the first snow settles over the first day of winter and melts over the first day of spring, crowns turn gold, amber, rust and red through autumn and thin from day 4, deciduous trees stand bare (slimmer crowns in twig colors with gaps through to the boughs) in winter while pines hold thick snow, and blossom opens over early spring. Trees take it in the foliage shader (`scatter.ts`; the trees layer marks evergreens with a `tkind` attribute). The ground shader's snow hook binds `env.snow` (the kit material's own), so roofs and ground settle together: drifts deepen against walls and under crowns (the ground AO), windswept patches let the old grass show, roads and paths keep trodden snow so the streets still read, and nothing lies on the water. The frozen river (and ponds) is ice in the water shader, with cracks, skate marks and drifting snow. Weather is a look in the final pass (`lookWeather` in `look.ts`: overcast, rain, a storm's darker light, fog wisps that thicken with distance, a straw-yellow drought), an overcast sky softens the sun and lifts the fill, wet ground darkens, and a storm swells a slow warm glow behind the clouds every eleven seconds or so (a few percent of brightness over more than a second, never a flash). Rain streaks, snowflakes and falling autumn leaves are one instanced moving layer (`layers/weather.ts`, 700, 1,600 and 3,200 particles on Low, Medium and High), placed on the GPU in a box that follows the view. Folk wear knitted hats and scarves in winter or when their home is cold; skaters glide; the dance is a turning bounce. Debug pins for looks: `?debug&season=autumn&day=4&weather=storm` (also `drought`, `frozen`).

- As built (C5E part 2): the I3 pieces are drawn. Defs that name a stand-in kit draw the kit in their `art.params.kit` once it exists (`artKitId` in `packages/art`), so content never changes when art lands. Defenses (`kits/defenses.ts`): a palisade of pointed logs and a dry stone wall that join the wall pieces beside them and turn corners, a lychgate with a lantern on each post whose leaves stand open or barred shut, a log watchtower, the Watch House, a bell tower, a net trap and a pit trap (sprung or set). Damage reads from the wall's hit points (`rt.hp` in percent): a snapped log or a missing coping stone, then a breach with the pieces lying beside it, then the piece down to its stumps, each with fresh timber or dressed stone stacked ready for mending. Festivals (`kits/festival.ts`, `layers/festival.ts`, `layers/festivalFx.ts`): a bonfire (flames that lick and lean, embers that drift up and shrink away), bunting, a stage under a striped canopy, stalls with the menu's goods in crates on the counter, trestle tables, a flower arch, festoon lanterns on posts round the site all through its day, the circus tent and wagons on the Village Green while the circus is in, and fireworks for the `fireworks` together moment: soft bursts that bloom over a second and fade over three, no flash and no light on the town. The new trades, the bath house (a steaming vent), the apiary, the River Dock (a jetty over the water behind it, a moored boat) and the Stone Bridge (spanning the river behind it to the far bank) are kits of their own; modules are fitted to any home after it is built (`kits/modules.ts` reads the kit's walls, eave and ridge from its surface ids). Flood water is a sheet over the floodplain and the river beside it that rises to just over the plain's highest ground and falls away with the event (`layers/flood.ts`); a raid's telegraph signs show on its side once seen: trails of prints walking in from the valley's edge and crows gathering (`layers/telegraph.ts`); folk breathe little clouds in the cold and winter chimneys smoke fuller. Debug: `__qoti.seasonsShowcase()`, `__qoti.fireworks()`, `?debug&flood=0.6`, `?debug&omens`.

## Camera

- Perspective, FOV 30 degrees (miniature feel). Pitch 30 to 65 degrees (default 45). Free yaw. Distance 12 to 320 tiles. Smooth damping. Clamped to the valley.
- Mouse: left click acts, right-drag rotates, middle-drag (or left-drag on empty ground with the inspect tool) pans, wheel zooms. Trackpad: two-finger pan, pinch zoom, Shift+two-finger rotate. Keyboard: WASD or arrows pan, Q and E rotate, T and G tilt, + and - zoom. Space is reserved for pause (`16-coop.md`) and R for rotating the piece being placed.
- Focus animation for "go to" actions; follow mode for residents [I1].
- Photo mode [I3]: hides UI, free camera, depth of field and time-of-day sliders, saves a PNG. As built (C5F): F2 or the camera button at the toolbar's end; a slim strip keeps the sliders, Save PNG and Back (Esc). The time of day changes the picture's light only. As built (C5E): the renderer's `photo` (`setPhoto` lifts the play clamp to pitch 8 to 85 degrees, distance 3 to 420 tiles and 48 tiles past the valley's edge; `setDepthOfField` raises the tilt-shift; `setTimeOfDay` pins the light's hour; `savePng` draws a still frame at one and a half times its resolution) and `capture({ focus, radius, size })` (one offscreen scene pass at twice the size into a float target, tone mapped and halved on the CPU into a PNG, from the player's bearing at 50 degrees).
- Stroll mode [I5]: walk the streets at resident eye level. From R2 the natural stroll is the evening round (`19-evenings.md`): the together moment of day 3 walks it.
- [V4] Photo mode saves the developed picture (64 samples, the depth of field slider is the lens), and tea-break mode drifts the camera when nobody touches it (Visual direction, second pass, item 6).

## Post-processing

Tone mapping (Khronos PBR Neutral, V1A's pick: it matches the concept stills and keeps the pastel palette's hues, where ACES pushed them toward orange and crushed the darks), bloom (golden hour and night only; none by day, so the bloom chain is skipped), tilt-shift (vertical gradient blur from 45 tiles back, full from about 160, none close up), a soft oval vignette, gentle seasonal grading (lift, gamma, gain, saturation and a slight S-curve: spring fresh, summer warmest, autumn golden, winter cool and quieter; dusk warmth and a little less saturation at night), dither, MSAA where the preset allows. The values and GLSL live in `render/look.ts`. [V1] All of it runs in one final full-screen pass after a quarter resolution blur chain, and ambient occlusion is baked (vertex AO in the kits and a ground AO texture); screen-space AO runs only on Ultra, on still frames (`20-architecture.md`, Lean renderer).

## Quality presets

From V1 (the lean renderer, `20-architecture.md`):

| | Low | Medium (target) | High | Ultra [V1] |
|---|---|---|---|---|
| Render scale, moving | 0.75 of a pixel ratio of 1 | pixel ratio up to 1 | pixel ratio up to 1.5 | pixel ratio up to 2 |
| Render scale, at rest [V1D] | as moving | pixel ratio up to 2 | pixel ratio up to 2 | the device's, up to 3 |
| Antialiasing | none | MSAA 4 on the scene pass | MSAA 4 | MSAA 4 |
| Sun shadows (cached) | 1024 | 2048 | 4096 | 4096, softest filtering |
| Ambient occlusion | baked | baked | baked | baked, plus screen-space on still frames |
| Still-frame cache | off | on | on | on, at the device pixel ratio |
| Post (one final pass) | tilt-shift, grade, tone mapping | + bloom at golden hour and night | as Medium | as Medium |
| Buildings at full detail within | 40 tiles | 60 | 75 | 110 *(tune)* |
| Resident detail distance | 30 tiles | 60 | 100 | 140 |
| Decor detail distance | 40 | 80 | 140 | 200 |
| Ambient critters | none | some | all | all |
| Light map [V2] | 2 texels a tile, no water reflection | 4 | 6 | 8 |
| Rooms behind windows [V2] | off (flat glow) | on | on | on |
| Meadow carpet within [V2] | none (tufts as today) | 30 tiles | 45 | 60 |
| Dressing [V3] | signs and stock piles only | all, within the decor distance | all | all |
| Endpaper map [V3] | 1024 x 1024 | 2048 | 2048 | 2048 |
| Rest-frame samples [V4] | 0 | 8 | 16 | 32 |

All V2 to V4 values are *(tune)* against the laptop numbers.

Ultra is for the stronger laptop or a desktop; it is never auto-detected. Budgets per preset: `22-quality.md`. The settings menu offers Ultra ("Spare no candles") and `?quality=ultra` picks it. From V1D every preset runs the lean renderer (`20-architecture.md`, Lean renderer): Low too gets the one final pass (tilt-shift, grade, tone mapping, no bloom) and cached 1024 shadows, every preset reads its own building distance (with a floor of 75 tiles until V1B's far levels carry lit windows: today's far level has none, and at 60 tiles much of a town went dark at night), and decor reads the decor distance (small props shrink away beyond it; lit pieces like lanterns and larger ones switch to their far level). `?engine=classic` keeps the chain from before V1D on the same build until V1X, for comparing the two.

**Medium on a Retina screen (V1D's choice)**: moving frames draw at a pixel ratio of 1 (dynamic resolution below that when they lag), and once the camera rests the still-frame cache draws at the device's ratio, up to 2 (`QualityPreset.stillScale`); High does the same from 1.5. Playtest round three found 1.5 soft on a Retina screen and Medium was raised to 2 for every frame; with the still-frame cache the sharp picture costs one full frame per rest instead of every frame, so the view is crisp whenever you stop to look and quick while you pan, and the camera at rest sharpens a moment (200 ms) after it stops. Not yet measured on the Retina laptop (the build container has no GPU): `?debug&dpr=2` draws moving frames at 2 for comparing caps on the same screen, and the `?debug` overlay shows GPU ms, the frame mode and the ratio. If cap 1 looks soft while panning, Medium's `renderScale` goes to 2 with dynamic resolution doing the rest.

Auto-detect picks a preset (Low on phones and two-core machines, otherwise Medium; High is a choice in settings, because core counts say little about the GPU behind a Retina screen); the settings menu can override it. On every preset, dynamic resolution steps the render scale down (to 0.85, 0.72, 0.6 and 0.5 of the preset's, never below a pixel ratio of 0.6) when frames average slower than about 45 fps, and back up after a few seconds above about 66 fps (`apps/client/src/render/resolution.ts`; `?debug&fixedres` turns it off for screenshots). [V1D] It judges moving frames only (30-frame windows), steps back up after 2.5 s of moving time with headroom, and when frames turn slow within 3 s of a step-up, that step-up failed and the next one waits twice as long (up to 40 s); a quality change starts over. Still and idle frames always draw at the preset's own ratio.

## UI

- **Look**: paper panels (`paper`) with soft shadows and thin ink outlines, line-art icons, small hand-drawn flourishes. Fonts: Alegreya (headings) and Alegreya Sans (UI, tabular numbers), self-hosted.
- **Layout**: top bar (date, time and season, weather, effective speed, treasury, population (opens the townsfolk: jobs, homes and moods, K), rank progress), bottom toolbar (a lens switch; a click inspects by default, so the toolbar has no Inspect button, and Esc, a right-click or clicking the chosen tool again puts a tool away; the lens's tools as one quiet strip, grouped by a little air into looking, making, talking and taking away, only the chosen tool in the lens color; the books as small icon spines with quick tooltips; one View button that names the overlay showing and opens the lens's overlays as a short list; then undo), right inspector panel, left feed (alerts, notes once there is one, wishes, requests), minimap bottom right [I2]. Playtest round five: under the top bar, a strip of the town's stocks in both lenses (food as one chip; logs, planks and stone always; anything else the town holds or made lately), each chip saying where the good comes from and goes, a click opening the stocks report; the pointer resting on a building says what it is for and what holds it up, and on the ground its terrain, soil (a number and rich, good, thin or poor) and any deposit; the Build picker says what the chosen building is for; the building ghost has an arrow on the doorstep, and its cursor always says R turns it (Shift+R or T turns it back), and warns of no road at the door, grown trees in a woodcutter's reach and the soil under a plot or farm; a "no road at the door" icon shows over a building whatever the overlay; the Pattern Book is on both lenses' shelves. Playtest round six: the lenses look different. The Ledger keeps the stocks strip and shows the land by default (rich soil a soft green wash, clay and stone in their colors; "Soil and stone" in its View list, cleared to stay off); the Hearth's strip is about how folk are doing (the valley's mood, Pattern Book pages, wishes waiting, plaques), each chip opening its book. The Build picker shows Food and Materials as production chains, a row each, labeled by what they make and from what ("Bread, from wheat"), columns from the buildings that start from nothing to the ones that finish the goods, the goods that pass between them on the arrows; services and homes are plain cards. Roads are named for what they do: Footpath (Hearth: folk on foot, cheap and cozy), Cart lane and Street (Ledger). The Fields tool waits until there is a farmhouse. Labels following the cursor leave as soon as the pointer is over the interface or the wheel moves the camera, and the hover label goes after four seconds or a key. The title screen's list of valleys has a remove button on each (solo valleys are deleted from the device; online ones only leave the list).
- **Season pages** [I3, C5F]: an almanac card opens each season and a two-page report (the Hearth's page and the Ledger's) closes it; weather and renown sit in the top bar (the weather keeps only its glyph on a laptop or at large sizes); the Hearth's books add the Festival poster and the Field Guide, the Ledger's the Watch board; the River Dock and commissions are tabs of Trade; the trial card opens from the season card; a raid brings a small bar under the top bar and a captive card bottom right, never red and never flashing; panel paper takes a faint tint of the season.
- **Village pages** [I2]: the Charter board opens from the rank pennant in the top bar (H), not the toolbar; the Ledger's books are Market (M), Trade, Policies (P), Reports (L) and the inventor's notebook (N); the Hearth adds Letters (O); plans open with the shared Plans tool and are drawn on the valley as ink-blue blueprints; requests live in the left feed with an ask card; the minimap floats above the toolbar's right end and steps aside while an inspector holds the right column.
- **Books** [I1]: Wishes, the Pattern Book, the Chronicle, Plaques and the Ledger's Reports open from the toolbar one at a time; the left feed steps aside while one is open. The Pattern Book is a two-page spread in the middle of the screen; the Chronicle is a small gazette; plaques are brass. Keys: B Pattern Book, C Chronicle, J Wishes, L Reports, Esc closes.
- **Portraits** [I1]: an inked SVG badge per resident from species, life stage, mood and look seed, until the art kit renders 3D portraits.
- **Picker portraits**: every card in the Build, Decor and Fence pickers shows the piece itself, drawn from its art kit as a little diorama on a round patch of meadow, in warm light (`apps/client/src/render/thumbnails.ts`, drawn once per piece on a small offscreen canvas).
- **Interface size**: at 120% and above the toolbar drops its labels (tooltips keep them); side panels grow with the size.
- **Lenses**: Hearth uses the sage green accent, Ledger the ochre (as built since I1; the line here had them the other way round); Tab toggles.
- **Motion**: 100 to 200 ms transitions; reduced-motion setting.
- **Writing**: warm, dry, witty; short sentences; never babyish; no em dashes anywhere.
- *As built (P1, the owner's playtest: "the goal should be clearer; more icons, less clutter; bigger resource counts")*: a goal pill beside the rank pennant says the next step in words with a slim bar (the Charter's nearest goal, then the trial, the calling to choose, then "Village chapter complete"); hover lists every goal and a click opens the board. The top bar is calmer: speed, invite, settings and leave are icons with tooltips, the season sits in the date, the speed note moved into a tooltip. Every good has a line icon (coats, furniture, pies, honey and candles were grey dots), so does the cart lane, and paired overlays and alerts have icons of their own. The Ledger's Stores panel tops the left column with every good in larger type, grouped (Food, Grain and flour, Building, Hearth and home, Crafts), food with its days of cover, and the strip under the top bar steps aside while it shows. A festival chip counts down to the evening. The Village chapter card and the Calling card are overlays in the rank-up style.

### The redesign's interface [R1 to R3]

Accepted by the owner on 2026-11-10. Both players play on their own laptop, online, in a browser (the owner, the same day), so the interface is designed for a mouse or trackpad and a keyboard at laptop sizes and tested from 1280 x 800 up. Gamepads and a one-screen couch mode are no longer planned (`30-roadmap.md`, I5). Where the bullets above this heading differ from what follows (the top bar's contents, the Stores panel, the list of books, the two-page season report), what follows replaces them when its iteration lands.

*Found*: each lane's numbers stay in that lane (the profit card shows only in the Ledger, the season report is a page a lane); no screen shows charm becoming arrivals or coins; the registry holds 17 books and 13 overlays, and the top bar about 16 controls at 1280 px; opening a valley can stack three cards on top of each other.

- **A calmer top bar** [R1]: town and valley, coins, the rank pennant with the goal pill, the lens's own strip, the date with the clock and the weather, and the speed. Everything else sits behind one menu button. The Ledger's strip is the four demand bars and the five balances (each a chip: an icon, days of cover as a short bar, and small pips for the flavors on offer); the winter reserve bar joins it from Summer day 4. The Hearth's strip is how folk are doing: mood, wishes waiting and, from R2, the evening (how many went out and how good it was).
- **Books** [R1]: fewer, each with one job. Ledger: Balances (families, flavors, prices, the carrier and deals; it replaces Market, Trade, the Stores panel and the stocks report), Purse (budget, taxes, wages, loans), Businesses, the Watch, the Notebook. Hearth: Wishes, Festival, Field Guide, Chronicle, Letters, Plaques. Shared: the Pattern Book, the Town Book [R3], the Charter, Townsfolk, Plans.
- **The Build picker** [R1]: the Ledger's has three shelves: Zones (the Homes, Shops, Workshops and Farmland brushes, each beside its demand bar; from Village rank the Homes brush has a second density, Townhouses), Specialized (each card says its site rule, and choosing one shows its reach on the ground) and Services. The chain rows of playtest round six go with the chains.
- **Cards wait their turn** [R1]: letters, result cards and season pages show one at a time, with a small stack at the corner saying how many wait. Nothing ever covers another card.
- **One map, two inks** [R2]: one overlay, Town, in both lenses' View lists and on the endpaper map: goods routes in ochre (the flows overlay as built), evening footfall in sage, and a small glint where an outlet sells to the round. The lens only decides which ink is stronger. Evening streets, gaps and the reach of specialized buildings draw on it.
- **Places and the round** [R2]: clicking a place opens its card (name, seats, tonight's visitors, what it serves and took, its draw in parts, what it still wants). A resident's inspector shows today's day and evening as a short line of stops and draws it on the ground.
- **The evening edition** [R2]: at 21:00 a slim card of three to five lines about the day across both lanes, crediting each seat by name where one lane's work fed the other ("Kat's lantern walk brought 34 folk past the pie stall: 21 coins"). A setting turns it into a line in the feed. The season report becomes one spread with the cross-lane lines first.
- **Gaps** [R2]: in the left feed of both lenses and as paper tags on the ground (`19-evenings.md`).
- **Follow the thread** [R3]: every inspector gains a Thread: one sentence of where the thing came from and where it goes, across both lanes, with the route drawn on the ground while it is open ("This cider: fruit from the Hollins orchard, pressed on Mill Lane, drunk by 14 folk at the Promenade"). It reads decaying counts the sim keeps for each pair of doors (maker to store, store to outlet, outlet to home or place).
- **The world carries what it can** [V3, R3]: stock is piled where it is stored, a home short of candles has dark windows, a business shows its level, a resting piece looks at rest. No panel repeats this unasked.
- **Paper by lamplight** [R1]: from dusk to dawn panel paper takes a warmer, dimmer tint, as it already takes the season's.
- **Illustrated books** [V4]: pages carry ink-and-wash pictures of the players' own valley (Visual direction, second pass).
- **The help card** is corrected in R1: with a mouse the view turns on a right-drag, and on a trackpad with Shift and two fingers. It said Shift and drag.

## Residents on screen [I1]

- Walk bob and squash in the vertex shader (no skeletons); carried bundles; little hops for joy; slower walk when unhappy.
- [I2 polish, C4P] Round eyes with a catchlight, blush on most species, rounder heads. Everyday outfits over the vest from the look seed: skirts, overalls (mostly field and yard hands, never under an apron), neckerchiefs and hair bows. Between walks, motions the client derives from the frames (the sim never hears of them, `MOTION` in `@qoti/art`): an idle resident by a bench sits on it, idle neighbors within 0.75 tiles turn to each other and take turns talking with a hand while the other nods, and folk who know each other (family, partners and a stable third of the neighbors) wave once in a while as they pass.
- Bubbles (toggleable): wish, happy, unhappy, sleepy, cold [I3]. As built they were never switched on (nothing in the interface called `setBubbles`); V2 puts them on the View list.
- [R2] The round is something to watch: folk sit at the places they chose, stand at the stalls, and carry what they bought (a mug, a slice). [R3] The lamplighter walks his round with a pole and a light.
- [I2, C4E] Story characters wear a signature outfit by species (Pippa Quill: goggles, cap and satchel; Odette Fenwick: wide hat, long scarf and ledger bag; Juniper Reed: beret, long scarf and lute). Partners near each other walk side by side, hand in hand. Babies (under a year) ride in a parent's sling. Carts glide on a damped follow, turn at a pony's pace and tilt with the slope; the pony's legs and the wheels move with the ground covered; a carter stands at the front board. Animals graze, wander a few steps, look up and lie down at night in the pens their buildings declare (`KitAnchors.animals`).
- Far away, residents become simple instanced shapes (beyond the resident detail distance), then dots (beyond 2.5 times it). Figures are drawn at 1.15 times the kit's 0.3 tiles so they read from the default camera; clothes follow the job (bakers in toques, farmers in straw hats, fishers in sou'westers) and tier (bowler, top hat).

## Audio [I3]

- **Music**: acoustic guitar, piano, upright bass and brushes; light jazz chords in the evening, a waltz in winter. Layered stems that follow time of day and season.
- **Ambience**: emitters from what is nearby: river, wind, birds by habitat, market chatter by stall density, mill creak, saw, festival crowd, the watch bell.
- *As built (P1, the owner's playtest: "night sounds too fake and chirpy")*: the night is rebuilt: a few field crickets (a 3.8 to 4.6 kHz carrier with a quiet octave, a snapped attack, a little droop and a wing-stroke flutter, each its own pitch and rate) over a shimmering bed of three dozen distant ones, on a 28 s loop, 4 dB quieter, slower and lower on cool spring and autumn nights; a soft night air; tawny owls by the woods from 21:00 to 04:00, not every night, a round hoot with its second harmonic about 22 dB down; frogs and a toad by the water on spring and summer nights. Ambience sits in a short outdoor space of its own rather than the music's room. `npx tsx tools/audio/night.ts <dir>` renders previews of a meadow, a pond and a wood's edge, and `tools/audio/stats.ts` prints their numbers.
- **UI**: paper rustle, soft clicks, pencil scratch for plans.
- Sources: CC0 or public domain recordings only (decided after I2), listed in `tools/audio/manifest.json` with their source pages and credited in `apps/client/public/audio/CREDITS.md`. Volume sliders per channel and a mute (C5G).
- As built (C5G, recordings added after it): the piano, double bass, string section, flute, clarinet, harp and marimba are recorded samples from the VS Chamber Orchestra: Community Edition (CC0; `npm run audio:samples` prepares them, `audio/sampler.ts` plays them, about 7 MB fetched note by note as pieces need them), and everything else is synthesized in the browser, as is any recorded note that cannot load in time. Real-instrument models (tuned plucked strings, a felt piano, FM electric piano, mallets, flute, strings, brushes) play pieces a composer writes from a seed in the hour's style: spring guitar and flute mornings, summer marimba mornings, winter celesta mornings, piano afternoons, minor autumn afternoons, swung evening jazz, celesta nights, the winter waltz. Each piece has an A A B A form with phrases that close, the theme returning, chords voice-led and a slowing outro, and music follows the hour and the season by style rather than by stems, with a 4 s crossfade when the style changes and quiet gaps of 20 to 90 s. Cues use the same instruments and are tuned to the music's key. Ambience loops and cues are synthesized too (`apps/client/src/audio/synth`), rendered once in a worker. The UI's pencil scratch for plans is not in yet; plans use the place and remove sounds.
- Combined pass (after the Valley Band sketch, `docs/concepts/valley-band/`): richer harmony (borrowed and chromatic chords: a Lydian II, the minor iv, the backdoor bVII, tritone substitutes, 9ths, 11ths and 13ths, with the melody following each chord's scale); new styles, bossa for summer afternoons and a light funk dance while a festival is on, and a jazz waltz with bass and brushes in winter; a band that grows with the town's rank (a guitar and a lead in the hamlet, then bass and brushes, the style's own instruments, a bell and a pad, the full band in the city); weather that thins or softens it; a valley tune generated from the valley's name that opens one piece in three; played-by-people touches (accents, rolled guitar chords, a singing top voice, phrase arcs, ghost brushes). Both laptops seed the music from the valley's and the town's names, so they pick the same pieces (they are not time-aligned). The mix has a glue compressor, a limiter and a soft clipper with a -1 dBFS ceiling, music bus EQ, a filtered and pre-delayed reverb with early reflections, wider placement, and a per-piece loudness match that keeps the styles within about 3 LU (night sits lowest by design).

## Accessibility [I1]

Colorblind-safe overlay ramps, UI scale 80% to 140%, reduced motion, captions for audio cues [I5], remappable keys [I4], no flashing effects.
