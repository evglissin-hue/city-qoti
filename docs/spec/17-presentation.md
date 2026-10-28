# 17. Presentation

A storybook miniature: soft-lit, warm, low-poly but dense with small details, never grimy, never babyish (P4, P44 to P49).

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

## Style kit (`packages/art`)

Pure functions from parameters (and a seed) to `BufferGeometry` with vertex colors and baked vertex ambient occlusion. Deterministic, cached by parameter key, with a high and a low level of detail.

- **Terrain**: chunk meshes (16 x 16 tiles) with smooth slopes between levels, soft cliff faces where levels differ by 2+, terrain colors blended at tile edges, field furrows [I1].
- **Water**: river and pond surfaces with gentle animated waves and foam at banks; frozen variant [I3].
- **Roads**: path (worn dirt with grass edges), lane (packed dirt with ruts), street (cobbles) [I2]; joins and corners from neighbors; bridges (plank and stone). C4E: streets are granite setts in rows across the street between pale kerbs with a gutter shadow; desire paths (the `wear` layer) are narrow trodden lines joining worn tiles; stone stairs climb where a path with the stairs flag meets a road a level up. C4P: paths and lanes are one dirt (a lane a little darker and packed, with soft ruts and a ragged grass crown), and a path running into a lane changes width and dirt over the middle of the joint; a square of four road tiles is paved across; desire paths are trampled earth of the same dirt, never paler than the roads; stairs are cut into the drawn slope (each tread's back flush with the ground, its front one riser above it, all heights from `groundY`) in warm sandstone between sloped kerbs that sink into the ground at both ends, so no tread floats where a hillside falls away to the side.
- **Buildings**: modular parts (walls: plaster, timber frame, stone, brick; roofs: gable, hip, half-hip in thatch, slate, tile; windows with shutters and boxes; doors; chimneys with smoke; porches; dormers; signs). Generators: cottage, house, workshop, mill, farm, storehouse, stall, town hall, landmarks. Construction stages (staked plot, foundation, frame, roof).
- **Props**: bench, curved and ring bench, lantern, hanging lantern, well, fountain, birdbath, fence, low wall, planter wall, hedge, flower bed, planter, wildflower verge, signpost, barrels, crates, carts, laundry lines, festival pieces [I3].
- **Trees**: oak, birch, pine, apple, cherry, willow; growth stages; seasonal variants.
- **Nature** [I1]: bush, grass tuft, wildflowers, reeds, rock, fern, mushrooms, fallen log (kind `nature`). Never placed by players: the renderer scatters them from the map with a seeded hash (forest floor and edges, open grass, meadows, banks, stony ground), clear of roads, buildings and decor, and fades them out at the decor detail distance.
- **Residents** [I1]: one parametric body (rounded, about 0.3 tile tall) with species parts (ears, tails, stripes, spines), fur palette, clothing colors, tier details (aprons, scarves, hats) and seasonal clothing.
- **Critters** [I3]: tiny ambient wildlife (butterflies, bees, ducks, frogs, fireflies).
- **Village** [I2, C4E]: district styles (`kits/district.ts`: Riverside Timber `timber`, Hill Stone `stone`, Market Brick `brick`, Garden Plaster `plaster`) set wall and upper-floor materials, plaster, roof shape, material and tint, accents and detail odds (window boxes, shutters, ivy, porches, lean-tos, dormers, benches, garden edges: picket, wattle, dry stone, hedge, railings). Grown generators fit any 2x2 to 3x3 lot: the district cottage (side gardens: vegetables, washing, a fruit tree or hens), the Craftsfolk townhouse (jettied upper floor, bay window, fanlight, two stacks), the shop with a flat above (shopfront, gilt fascia lettering, awning, a trade sign), the workshop with its yard and what it makes, and the farmstead (house, barn, yard and a produce corner: pen, fruit trees, wheat or rows). A home's look comes from its seed and district alone, so a cottage that upgrades in place becomes a townhouse in the same walls and paint, with scaffolding while the upgrade is under way. Each I2 building has its own silhouette (clay pit banks and pug mill, bottle kiln, shepherd's hut, spinning wheel porch and dye pots, weavers' windows and tenter frame, byre and churn stand, cheese room, orchard rows by season, apple mill and screw press, round woodstack, skeps and herb beds, open forge, bell cote and playground, inn sign on a post and beer garden, herbalist's bottles and bunches, Trading Post veranda and pennants, cart shed bay and pony stall). Sheep, cows and ponies are animated parts; the cart has a body, wheels and a load per good.
- **Gallery** (`apps/gallery`): every generator with parameter sliders, all seasons, day and night. Used for art review.

## Lighting and time of day

| Phase | Sun color | Ambient (sky / ground) | Notes |
|---|---|---|---|
| Dawn | `#F6C28B` | `#E9C9B0` / `#6B5E50` | long soft shadows |
| Day | `#FFF4E0` | `#DDE8F0` / `#7A8F5A` | |
| Dusk | `#F4A261` | `#E2A88A` / `#5E4A44` | windows start to glow |
| Night | moon `#9DB4D8` | `#2B3A55` / `#1E2433` | lit windows, lanterns, bloom |

- One directional light with shadows (Medium 2048, High 4096, Low off), hemisphere ambient, fog by weather.
- Night: a share of windows in occupied homes glow (seeded per building, varying by hour); lanterns are emissive with bloom and a soft ground glow decal (no real point lights beyond 8 nearest the camera).
- C3D-1: the table gains a golden hour (18:00) and a violet twilight (20:30) between its keys; a dusk split tone in the post grade keeps evening greens from turning to mud. Ground glow pools are drawn by the ground shader from the 32 lights nearest the view (lanterns, and spill under lit windows, chosen by the same integer hash as the panes). The sky is a dome with drifting clouds and stars; clouds also drift their shade over the ground by day.
- Sun direction from the in-game hour on the client (any math is fine outside the sim).

## Seasons and weather visuals [I3]

- Grass and foliage tints per season; blossoms on fruit trees in spring; autumn leaf colors and falling leaves; bare deciduous trees and snow-capped pines in winter.
- Snow cover shader on upward-facing surfaces in winter; frozen river; puddles and wet sheen after rain [I4].
- Rain, snow and fog particles sized for the miniature look.

## Camera

- Perspective, FOV 30 degrees (miniature feel). Pitch 30 to 65 degrees (default 45). Free yaw. Distance 12 to 320 tiles. Smooth damping. Clamped to the valley.
- Mouse: left click acts, right-drag rotates, middle-drag (or left-drag on empty ground with the inspect tool) pans, wheel zooms. Trackpad: two-finger pan, pinch zoom, Shift+two-finger rotate. Keyboard: WASD or arrows pan, Q and E rotate, T and G tilt, + and - zoom. Space is reserved for pause (`16-coop.md`) and R for rotating the piece being placed.
- Focus animation for "go to" actions; follow mode for residents [I1].
- Photo mode [I3]: hides UI, free camera, depth of field and time-of-day sliders, saves a PNG.
- Stroll mode [I5]: walk the streets at resident eye level.

## Post-processing

Tone mapping (AgX or ACES), bloom (strong at night), tilt-shift (vertical gradient blur, stronger when zoomed out), subtle vignette, gentle seasonal grading (lift, gamma, gain), MSAA where supported.

## Quality presets

| | Low | Medium (target) | High |
|---|---|---|---|
| Shadows | off | 2048, soft | 4096, softer |
| Post | tone mapping only | + bloom, tilt-shift | + ambient occlusion, more bloom detail |
| Render scale | 0.75 | 1.0 | 1.0 (device pixel ratio up to 2) |
| Resident detail distance | 30 tiles | 60 | 100 |
| Decor detail distance | 40 | 80 | 140 |
| Ambient critters | none | some | all |

Auto-detect picks a preset (Low on phones and two-core machines, otherwise Medium; High is a choice in settings, because core counts say little about the GPU behind a Retina screen); the settings menu can override it. On every preset, dynamic resolution steps the render scale down (to 0.85, 0.72, 0.6 and 0.5 of the preset's, never below a pixel ratio of 0.6) when frames average slower than about 45 fps, and back up after a few seconds above about 66 fps (`apps/client/src/render/resolution.ts`; `?debug&fixedres` turns it off for screenshots).

## UI

- **Look**: paper panels (`paper`) with soft shadows and thin ink outlines, line-art icons, small hand-drawn flourishes. Fonts: Alegreya (headings) and Alegreya Sans (UI, tabular numbers), self-hosted.
- **Layout**: top bar (date, time and season, weather, effective speed, treasury, population (opens the townsfolk: jobs, homes and moods, K), rank progress), bottom toolbar (a lens switch; a click inspects by default, so the toolbar has no Inspect button, and Esc, a right-click or clicking the chosen tool again puts a tool away; the lens's tools as one quiet strip, grouped by a little air into looking, making, talking and taking away, only the chosen tool in the lens color; the books as small icon spines with quick tooltips; one View button that names the overlay showing and opens the lens's overlays as a short list; then undo), right inspector panel, left feed (alerts, notes, wishes, requests), minimap bottom right [I2].
- **Village pages** [I2]: the Charter board opens from the rank pennant in the top bar (H), not the toolbar; the Ledger's books are Market (M), Trade, Policies (P), Reports (L) and the inventor's notebook (N); the Hearth adds Letters (O); plans open with the shared Plans tool and are drawn on the valley as ink-blue blueprints; requests live in the left feed with an ask card; the minimap floats above the toolbar's right end and steps aside while an inspector holds the right column.
- **Books** [I1]: Wishes, the Pattern Book, the Chronicle, Plaques and the Ledger's Reports open from the toolbar one at a time; the left feed steps aside while one is open. The Pattern Book is a two-page spread in the middle of the screen; the Chronicle is a small gazette; plaques are brass. Keys: B Pattern Book, C Chronicle, J Wishes, L Reports, Esc closes.
- **Portraits** [I1]: an inked SVG badge per resident from species, life stage, mood and look seed, until the art kit renders 3D portraits.
- **Picker portraits**: every card in the Build, Decor and Fence pickers shows the piece itself, drawn from its art kit as a little diorama on a round patch of meadow, in warm light (`apps/client/src/render/thumbnails.ts`, drawn once per piece on a small offscreen canvas).
- **Interface size**: at 120% and above the toolbar drops its labels (tooltips keep them); side panels grow with the size.
- **Lenses**: Hearth uses the warm accent, Ledger the green accent; Tab toggles.
- **Motion**: 100 to 200 ms transitions; reduced-motion setting.
- **Writing**: warm, dry, witty; short sentences; never babyish; no em dashes anywhere.

## Residents on screen [I1]

- Walk bob and squash in the vertex shader (no skeletons); carried bundles; little hops for joy; slower walk when unhappy.
- [I2 polish, C4P] Round eyes with a catchlight, blush on most species, rounder heads. Everyday outfits over the vest from the look seed: skirts, overalls (mostly field and yard hands, never under an apron), neckerchiefs and hair bows. Between walks, motions the client derives from the frames (the sim never hears of them, `MOTION` in `@qoti/art`): an idle resident by a bench sits on it, idle neighbors within 0.75 tiles turn to each other and take turns talking with a hand while the other nods, and folk who know each other (family, partners and a stable third of the neighbors) wave once in a while as they pass.
- Bubbles (toggleable): wish, happy, unhappy, sleepy, cold [I3].
- [I2, C4E] Story characters wear a signature outfit by species (Pippa Quill: goggles, cap and satchel; Odette Fenwick: wide hat, long scarf and ledger bag; Juniper Reed: beret, long scarf and lute). Partners near each other walk side by side, hand in hand. Babies (under a year) ride in a parent's sling. Carts glide on a damped follow, turn at a pony's pace and tilt with the slope; the pony's legs and the wheels move with the ground covered; a carter stands at the front board. Animals graze, wander a few steps, look up and lie down at night in the pens their buildings declare (`KitAnchors.animals`).
- Far away, residents become simple instanced shapes (beyond the resident detail distance), then dots (beyond 2.5 times it). Figures are drawn at 1.15 times the kit's 0.3 tiles so they read from the default camera; clothes follow the job (bakers in toques, farmers in straw hats, fishers in sou'westers) and tier (bowler, top hat).

## Audio [I3]

- **Music**: acoustic guitar, piano, upright bass and brushes; light jazz chords in the evening, a waltz in winter. Layered stems that follow time of day and season.
- **Ambience**: emitters from what is nearby: river, wind, birds by habitat, market chatter by stall density, mill creak, saw, festival crowd, the watch bell.
- **UI**: paper rustle, soft clicks, pencil scratch for plans.
- Sources: CC0 or public domain recordings only (decided after I2), listed in `tools/audio/manifest.json` with their source pages and credited in `apps/client/public/audio/CREDITS.md`. Volume sliders per channel and a mute (C5G).
- As built (C5G): every sound is synthesized in the browser, so the manifest is empty and nothing is downloaded. Real-instrument models (tuned plucked strings, a felt piano, FM electric piano, mallets, flute, strings, brushes) play pieces a composer writes from a seed in the hour's style: spring guitar and flute mornings, summer marimba mornings, winter celesta mornings, piano afternoons, minor autumn afternoons, swung evening jazz, celesta nights, the winter waltz. Each piece has an A A B A form with phrases that close, the theme returning, chords voice-led and a slowing outro, and music follows the hour and the season by style rather than by stems, with a 4 s crossfade when the style changes and quiet gaps of 20 to 90 s. Cues use the same instruments and are tuned to the music's key. Ambience loops and cues are synthesized too (`apps/client/src/audio/synth`), rendered once in a worker. The UI's pencil scratch for plans is not in yet; plans use the place and remove sounds.

## Accessibility [I1]

Colorblind-safe overlay ramps, UI scale 80% to 140%, reduced motion, captions for audio cues [I5], remappable keys [I4], no flashing effects.
