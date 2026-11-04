# C5E: Seasons art and rendering

**Iteration**: I3. **Wave**: parallel. **Branch**: `cycle/05e-seasons-art`.
**Depends on**: C5.0 and V1X merged (it builds on the V1 look). **Runs alongside**: whatever I3 or I4 cycles are open (they own sim and UI paths). **Ports**: client 5195, relay 8805.

## Goal

The valley changes with the year and looks lovelier for it: blossom in spring, deep green summer, falling leaves in autumn, snow on roofs and pines and a frozen river with skaters in winter, rain, fog and snow sized for the miniature. Festivals glow with bunting, stalls, lanterns and a bonfire; the Watch, walls, gates and towers look like they belong in a storybook, and a raid at dusk reads clearly without being grim. Ponds, the apiary, the new trades, modules and about 30 kinds of ambient critters fill the town with detail. Photo mode and Chronicle thumbnails come from here. All of it holds the frame budget on the weaker laptop and on a Retina screen.

## Read

- `CLAUDE.md`, `docs/build/i3-wave-notes.md`, `docs/spec/20-architecture.md` (I3 contracts, Rendering, Lean renderer, V1 contracts and the four V1 As built notes)
- `docs/build/v1-wave-notes.md` (Animation inside static layers, Cache invalidation, Stand-ins) and the V1 section below: they say how to add anything to the V1 renderer without breaking its caches
- `docs/spec/17-presentation.md` (all; Seasons and weather visuals, Critters, Camera (photo mode), Quality presets)
- `docs/spec/14-challenge.md`: Defenses, Raid resolution (what must read on screen)
- `docs/spec/12-hearth.md`: Festivals, Nature and the Field Guide; `docs/spec/10-world-and-building.md`: Customization (Phase 2), ponds
- The C3D, C4E PR notes and the I1 playtest polish line in `CHANGELOG.md` (what the renderer does and what players flagged)

## You own

`packages/art`, `apps/gallery`, `apps/client/src/render`.

## You can rely on

C5.0's views and agent flags (`cold`, `watch`, `raider`, `wolf`, `festival`, `skating`, `visitor`; `run` and `dance`), `WeatherView`, `isFrozen`, flooded tiles, `rt.modules`, `rt.hp` and `rt.open`, habitat patches, the winter and raid fixtures (`?debug&fixture=winter`, `?debug&fixture=raid`); and the V1 renderer, material, kits and levels below (V1X, 2026-11-03).

## Building on V1 (read before you draw anything)

V1 replaced the look and the renderer under this brief. What it gives you, and the rules that keep it fast:

**The material.** Every kit draws with the lean kit material (`packages/art/src/materials.ts`, `createLeanKitMaterial`; `render/material.ts` binds it to the world env): Lambert, one pattern fetch per face from the shared pattern array (`env.patterns`), chosen by the face's surface id. Write surface ids on every face you build: `new ShapeBuilder().surface(SURFACE.brick).box(...)`. The ids are `plain` 0, `plaster` 1, `brick` 2, `stone` 3, `timber` 4, `tile` 5, `slate` 6, `thatch` 7, `cobble` 8, `glass` 9, `grass` 10, `dirt` 11, `water` 12, `leaf` 13, `zinc` 14, `awning` 15, `field` 16, `flags` 17, `flowers` 18. A new surface (ice, canvas, bunting cloth) goes at the end of `SURFACE` and `SURFACES` in a commit of its own, with a generator in `patterns.ts` (seeded, tileable, `+ - * /` and `floor` only, so both laptops build the same bytes). Glass and water get the sky fresnel and sun glint for free; `glow` lights a pane at night.

**Seasons and snow are already hooked.** `env.snow`, `env.seasonTint` and `env.sway` (V1A) are set from the calendar by `applySeasonLook`; snow lies on upward faces of every kit (patchy as it starts, courses showing on thatch, slate and tile), the season tint reaches grass, leaf and field surfaces, and leaf and flower faces sway. The ground shader (V1C, `render/ground.ts`) has a snow hook (`material.userData.snow`) still to fill: ground snow is yours, through that hook, not a fork. The four seasonal grades are in `look.ts` (`SEASON_LOOK`, `applyGrade`); tune them, do not add a pass. Smooth transitions across a day: drive `env.snow` and `env.seasonTint` by hour, and call `renderer.invalidateStatic()` when they step (a quarter hour at most).

**Two levels for everything.** Kits build `high` and `low` from one code path (`KitBuildOptions.lod`, `ShapeBuilder`'s `detail`, `nearOnly`, `essential` and `proxy`; `20-architecture.md`, As built V1B): decoration runs silently at the far level so random draws and colors never change across a swap. Every new building, module, festival piece and defense needs both levels and a test that they carry the same attributes (`packages/art/src/surface.test.ts`). Far budgets: a home 75 to 150 triangles, nothing over 430; near, a home under 4,000. Trees and nature have a 16-triangle far level (`kits/trees.ts`); new trees and plants follow it. `lod.ts` swaps buildings at `env.buildingDetail` (Low 40, Medium 60, High 75, Ultra 110 tiles), decor at `env.detailDistance` (40, 80, 140, 200), residents at `residentDetail`.

**Static and moving layers.** A render layer is static (default) or `motion: 'moving'` (agents, animals, blobs, carts, effects, ghosts, notes, overlays, presence, water). While the camera rests, static layers are drawn once into the still-frame cache and each idle frame draws only the moving layers over it, and the sun's shadow map is cached. So:
- Anything that animates on its own (falling snow and rain, falling leaves, fireflies, bunting in the wind, the bonfire, fireworks, skaters, critters, lantern flicker) goes in a moving layer (`effects` or a new one, one registry line), never in a static one. Static layers may sway or drift only on `env.staticTime`, which stops at rest.
- A static layer calls `ctx.invalidate()` (or returns true from `frame()`) only when what it draws really changed; each call redraws the still frame and the shadows. V1X found the buildings and signs layers doing it on every sim change (`__qoti.staticChanges()` in a `?debug` valley tallies what drops the cache; a resting valley should add nothing but the sun's quarter-hour step).
- Moving layers do not cast sun shadows (the map is cached). Figures, animals and carts get a soft blob from `layers/blobs.ts` (push one per figure, faded with the detail distance); do the same for raiders, wolves, skaters and critters big enough to need one.
- The windmill's sails have no shadow (V1X decided the tower's is enough); flags, banners and festival bunting that move get none either.

**Weather in the final pass.** Fog, rain tint, the storm's darker sky and the drought's yellowing are cheapest as look functions in `look.ts` called from the final pass (`post.ts`), not as passes of their own: one new function and one call line. Cloud shade on the ground is still in the ground shader and pauses while the camera rests (V1X did not move it, see the V1X PR); if you add overcast weather, that is the place to move it into the final pass from the still target's depth texture.

**Critters.** `QualityPreset.critters` is `none` on Low, `some` on Medium, `all` on High and Ultra; nothing draws critters yet (the wave notes' stand-ins table). They are moving and instanced.

**Budgets (V1).** `22-quality.md`: 60 fps on Medium on the weaker laptop while moving, 12 ms GPU moving and 4 ms GPU idle (camera at rest, residents walking) on Medium on the weaker laptop; draw calls 300 on Low and Medium, 450 on High and Ultra; triangles 1.5 M, 3 M, 6 M and 12 M by preset. Measure with `v1-perf.mjs` (moving, still and idle frames per scene) and `v1-shots.mjs` (`QOTI_LAYERS=1` gives triangles per layer); the V1X numbers in `22-quality.md` (As built) are your before column.

## Tasks

1. **Seasons**: grass and foliage tints per season from palette 2.0 (through `env.seasonTint`), blossom on fruit trees, autumn colors with falling leaves (a moving layer), bare deciduous trees and snow-capped pines at both levels, the seasonal grades in `look.ts` tuned for all four seasons, seasonal clothing (scarves and hats in winter), smooth transitions across a day rather than a snap at midnight.
2. **Winter**: snow on the ground through the ground shader's snow hook (roofs and props already take `env.snow`), snow drifts against walls, the frozen river and frozen ponds (the `ice` token, cracks and skate marks), skaters, breath and chimney smoke thicker in the cold, warm windows that read even cozier.
3. **Weather**: rain, snow and fog particles sized for the miniature, storm wind in trees, a darker sky and gentle lightning glow without flashing (accessibility), heat shimmer kept subtle; flood water over floodplain tiles that rises and falls; a dry, yellowed look in drought.
4. **Festivals**: festival pieces (stalls with goods from the menu, bunting runs, festival lanterns, a stage, tables, a bonfire), the crowd, the dance for the together moment, fireworks for a rank-up or sealed Charter, the circus tent and visitors on a green.
5. **Defense and the Watch**: palisades, stone walls (with ivy and flower box modules), gates open and shut, a wooden watchtower, the Watch House, bell tower, traps; Watch members with gentle gear (slings, staffs, nets, lanterns); raiders as a hooded gang of any species with sacks of loot; wolves at the forest edge; telegraph signs (tracks in the snow, crows gathering); broken wall pieces and condition damage that builders mend. A raid at dusk must read from the default camera (who is where, what is being taken) and stay storybook, not menacing.
6. **Buildings and nature**: the Bath House, River Dock with boats, apiary with skeps, pie shop, chandler, tailor, carpenter, the Herbalist's Cottage, the Stone Bridge; ponds with reeds and lily pads; modules (porch, dormer, bay window, extra floor, balcony, tower, arcade) that fit the district styles; ambient critters near qualifying habitat (butterflies, bees, ducks, frogs, fireflies, a kingfisher, swans, a heron, and the rest of the Field Guide where they can be shown), counts by quality preset.
7. **Overlays**: habitats (one per habitat, colorblind-safe), floodplain, threat (deterrence and Watch coverage), warmth (cold homes).
8. **Photo mode and thumbnails**: `RenderApi` additions for photo mode (free camera beyond the play clamp, depth of field, a time-of-day override that never touches the sim, a high-resolution PNG) and `capture({ focus, radius, size })` returning a small image for Chronicle snapshots, rendered offscreen without a visible hitch.
9. **Performance and feel**: a 150-building Village in winter with snow falling, a festival with 80 residents and a raid with 12 raiders all within the V1 budgets on Medium (300 draws, 3 M triangles, 12 ms GPU moving and 4 ms idle, 12 ms main thread); particles and critters instanced in moving layers; a resting winter village still draws idle frames (check `stills` in the `?debug` overlay); dynamic resolution still steps in on a Retina laptop. Check the motion, not just the stills: walking must not look floaty (the I1 playtest flagged it), every lantern and festival light must actually light, and the bonfire and snowfall must not stutter.

## Acceptance criteria

- [ ] Gallery: every new generator and module by style, and the whole set in all four seasons, day and night (screenshots).
- [ ] Winter and raid fixtures: wide, close, dusk and night screenshots that read as one coherent storybook valley; a short clip each of snowfall, the festival evening and a raid (in the PR).
- [ ] Render budget numbers at village scale in winter, during a festival and during a raid, on Medium at device pixel ratio 1 and 2 (draw calls, triangles, frame ms, the resolution step reached).
- [ ] Photo mode saves a PNG; `capture` returns a thumbnail in under 50 ms of main thread time.
- [ ] Accessibility: no flashing effects; overlays pass the colorblind check (`apps/client/e2e/colorblind.py`).
- [ ] Definition of done.

## Out of scope

Simulation (C5A to C5D); panels, the photo mode UI and image storage (C5F).

## Notes

- **Visual quality is the owner's top priority**: coziness, quaintness, detail and diversity. A season should feel like a different evening in the same beloved place. Prefer fewer, better details over many cheap ones, and review with the owner's eyes: would this make someone want to stay in this town in winter?
- The first live playtest flagged floaty walking, lag on a Retina laptop, plain menus and half-lit lanterns. Your track owns the first, second and fourth: check each in motion with snow, crowds and a raid on screen, and put the numbers in the PR.
- Snow and weather go through the shared material's hooks, the ground shader's snow hook and the look's functions in the final pass, not per-kit forks or extra passes, so every kit gets them for free.
- Critters are cosmetic and client-side; the sim's sightings decide the Field Guide. Never draw a resident species as wildlife.
- Do not pin exact colors or counts in tests where the palette or content can be read.
- Stand-in art for pieces another track adds late goes through stand-in defs (`render/defs.ts`) and the wave notes' stand-ins table.

## As built (C5E, 2026-11-03)

Shipped as a first, solid slice of the brief, polished for the look rather than spread thin; the rest is listed below as follow-ups for the quality audit to rank. Measured in the build container's software renderer (no GPU): draws and triangles are real, milliseconds are ratios only.

**In**

- Seasons (task 1): `render/seasons.ts` blends the season through each turning day (snow settling over winter's first day and melting over spring's, the foliage tint turning over the first day, autumn color, bare branches and blossom weights), stepping at most once a quarter hour and dropping the still frame only then (`staticChanges` key `season`). Trees take it in the foliage shader: autumn gold, amber, rust and red per tree, lacy bare crowns in winter, blossom in spring, snow on the pines (evergreens marked by a `tkind` attribute). Winter clothes: knitted hats and scarves in winter or a cold home. The four grades in `look.ts` are untouched (they read well with the new ground).
- Winter (task 2): ground snow through the ground shader's hook (`material.userData.snow` is now `env.snow`): drifts against walls and under crowns from the ground AO, windswept patches, trodden roads, none on the water. The frozen river and ponds are ice (cracks, skate marks, drifting snow); skaters glide.
- Weather (task 3): `lookWeather` in the final pass (overcast, rain, storm, fog wisps, drought), an overcast sky softening the sun, wet and dry ground, the storm's slow glow (no flashing), and rain, snow and falling leaves in one instanced moving layer (`layers/weather.ts`).
- Defense and the Watch (task 5, figures only): raiders in storybook cloaks and hoods with loot sacks (their far figures and dots in cloak colors), the Watch with lanterns and staffs, wolves as wolves (never a resident species) with blob shadows; run and dance animations.
- Critters (task 6, part): seven kinds in `layers/critters.ts` by habitat, season, hour and weather, counted by `QualityPreset.critters`.
- Overlays (task 7): `habitats` (and `habitat:<id>`), `floodplain`, `threat` and `warmth`, Okabe and Ito colors, checked with `colorblind.py` (deuteranopia); one lens entry each.
- Photo mode and thumbnails (task 8): `photo { setPhoto, setDepthOfField, setTimeOfDay, savePng }` and `capture({ focus, radius, size })` on the Renderer; C5F's stand-ins fall away untouched.
- Tools: `?debug&season=&day=&weather=` pins the look; `__qoti.agentsWith(flag)`; `e2e/c5e-shots.mjs` (stills `docs/build/screenshots/c5e-*.png`); `v1-perf.mjs` scenes `village-winter`, `village-crowd` and `raid` and `QOTI_QUERY`; `e2e/c5e-seasons.spec.ts` (photo PNG, capture thumbnail, a resting winter valley in falling snow draws idle frames with no season or weather cache drops).

**Numbers** (Medium, 1440 x 900, `QOTI_HOLD=1 QOTI_FIXEDRES=1 QOTI_PRESETS=medium v1-perf.mjs`, 8 s moving and 8 s idle, software renderer):

| Scene | Moving frame ms (avg / p95) | Idle frame ms (avg / p95) | Draws | Triangles |
|---|---|---|---|---|
| village of 130 (before: summer, clear) | 906 / 2700 | 1100 / 2217 | 134 | 0.22 M |
| village in winter, snow falling | 833 / 1567 | 2092 / 2217 | 139 | 0.24 M |
| village, summer evening, 80 more folk | 774 / 1283 | 1889 / 2117 | 145 | 0.24 M |
| raid fixture at dusk (6 raiders) | 861 / 3167 | 346 / 1167 | 48 | 0.07 M |

Draws and triangles sit far inside Medium's 300 and 3 M. In software the snowy village's idle frame costs about twice the clear one's (falling snow is transparent overdraw that software rasterizes slowly, and it keeps the idle frames coming); on a GPU 1,600 small quads are cheap, but this is the number to watch on Kat's laptop. `?debug&dpr=2` in this container (device ratio 1) gives the same numbers; the Retina numbers, the resolution step reached and every millisecond budget are for the laptops (`QOTI_HEADED=1` or `await __qoti.perf()`). `capture` took 2.3 to 3.6 s of main thread here, because the software renderer does the GPU's work inside `readPixels`; on a GPU it is one small scene pass and a 320 by 200 read, expected well under 50 ms, still to be confirmed on a laptop.

**Follow-ups** (not in this PR)

- Festival art (task 4): stalls, bunting, festival lanterns, stage, tables, bonfire, fireworks, the circus tent and visitors on the green; the crowd uses residents as they are.
- Defense buildings (task 5): palisades, stone walls with ivy and flower box modules, gates open and shut, watchtower, Watch House, bell tower, traps, broken pieces and mending, telegraph signs (tracks in the snow, crows).
- Buildings and nature (task 6): the Bath House, River Dock with boats, apiary skeps, pie shop, chandler, tailor, carpenter, Herbalist's Cottage, Stone Bridge, ponds with reeds and lily pads, the modules (porch, dormer, bay window, extra floor, balcony, tower, arcade); critters still to come: frogs, the kingfisher, swans' cygnets, the heron and the rest of the Field Guide.
- Winter extras: snow drifts as geometry against walls (now only in the ground), breath in the cold and thicker chimney smoke, cozier windows; scarves for the dots and simple far figures.
- Weather extras: flood water rising over floodplain tiles (the overlay shows the plain), heat shimmer, puddles. The drifting cloud shade still lives in the ground shader and pauses at rest (an overcast sky now mutes it); moving it into the final pass needs the moving target's depth (V1X's note stands).
- The gallery shows kits by season (`?season=`) but not the seasonal trees, weather or critters; the season set is in the game shots instead.
- Shadows of bare trees: the cached shadow map still draws full crowns in winter.
- Laptop measurements: every millisecond budget, the Retina step, `capture`'s 50 ms, and the floaty walk and half-lit lanterns checks in motion.
