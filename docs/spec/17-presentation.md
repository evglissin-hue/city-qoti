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
- **Roads**: path (worn dirt with grass edges), lane (packed dirt with ruts), street (cobbles) [I2]; joins and corners from neighbors; bridges (plank and stone).
- **Buildings**: modular parts (walls: plaster, timber frame, stone, brick; roofs: gable, hip, half-hip in thatch, slate, tile; windows with shutters and boxes; doors; chimneys with smoke; porches; dormers; signs). Generators: cottage, house, workshop, mill, farm, storehouse, stall, town hall, landmarks. Construction stages (staked plot, foundation, frame, roof).
- **Props**: bench, curved and ring bench, lantern, hanging lantern, well, fountain, birdbath, fence, low wall, planter wall, hedge, flower bed, planter, wildflower verge, signpost, barrels, crates, carts, laundry lines, festival pieces [I3].
- **Trees**: oak, birch, pine, apple, cherry, willow; growth stages; seasonal variants.
- **Residents** [I1]: one parametric body (rounded, about 0.3 tile tall) with species parts (ears, tails, stripes, spines), fur palette, clothing colors, tier details (aprons, scarves, hats) and seasonal clothing.
- **Critters** [I3]: tiny ambient wildlife (butterflies, bees, ducks, frogs, fireflies).
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

Auto-detect picks a preset; the settings menu can override it.

## UI

- **Look**: paper panels (`paper`) with soft shadows and thin ink outlines, line-art icons, small hand-drawn flourishes. Fonts: Alegreya (headings) and Alegreya Sans (UI, tabular numbers), self-hosted.
- **Layout**: top bar (date, time and season, weather, effective speed, treasury, population, rank progress), bottom toolbar (the lens's tools, then its books and overlay toggles, then undo), right inspector panel, left feed (alerts, notes, wishes, requests), minimap bottom right [I2].
- **Books** [I1]: Wishes, the Pattern Book, the Chronicle, Plaques and the Ledger's Reports open from the toolbar one at a time; the left feed steps aside while one is open. The Pattern Book is a two-page spread in the middle of the screen; the Chronicle is a small gazette; plaques are brass. Keys: B Pattern Book, C Chronicle, J Wishes, L Reports, Esc closes.
- **Portraits** [I1]: an inked SVG badge per resident from species, life stage, mood and look seed, until the art kit renders 3D portraits.
- **Interface size**: at 120% and above the toolbar drops its labels (tooltips keep them); side panels grow with the size.
- **Lenses**: Hearth uses the warm accent, Ledger the green accent; Tab toggles.
- **Motion**: 100 to 200 ms transitions; reduced-motion setting.
- **Writing**: warm, dry, witty; short sentences; never babyish; no em dashes anywhere.

## Residents on screen [I1]

- Walk bob and squash in the vertex shader (no skeletons); carried bundles; little hops for joy; slower walk when unhappy.
- Bubbles (toggleable): wish, happy, unhappy, sleepy, cold [I3].
- Far away, residents become simple instanced shapes, then dots.

## Audio [I5, designed now]

- **Music**: acoustic guitar, piano, upright bass and brushes; light jazz chords in the evening, a waltz in winter. Layered stems that follow time of day and season.
- **Ambience**: emitters from what is nearby: river, wind, birds by habitat, market chatter by stall density, mill creak, saw, festival crowd, the watch bell.
- **UI**: paper rustle, soft clicks, pencil scratch for plans.
- Sources: royalty-free or CC0 libraries, or commissioned. Volume sliders per channel.

## Accessibility [I1]

Colorblind-safe overlay ramps, UI scale 80% to 140%, reduced motion, captions for audio cues [I5], remappable keys [I4], no flashing effects.
