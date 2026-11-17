# P3C: The look in rain, haze and close up

**Iteration**: R2 to R3 (the owner's playtest of R2 and V3). **Wave**: serial (the look half of P3). **Branch**: `cycle/p3c-weather-look`.
**Depends on**: V3X and R2X merged into `main`. **Runs alongside**: the other P3 cycles (the inspector card is another cycle's); V4 starts soon on `render/{cache,post,shadows,resolution}.ts`.

## Goal

The valley looks painted and deliberate in the weather and hours the owner actually plays in: rain at night, haze and mist by day, and at the nearest zoom. No frame looks broken, unlit or like a stand-in.

## The owner's words (2026-11-17, after playing `main`)

"Attaching some screenshots of things not looking too great." What each shows (the master's description; the files could not be passed on):

1. **Night, rain, close on a meadow beside a dirt path, blossom trees about (spring).**
   - Puddles on the path and the grass are flat, saturated lavender-blue shapes with hard edges, with no depth or reflection, and they are the brightest thing in a night scene.
   - Across the grass sit clusters of short parallel diagonal stripes, some lavender-white and some orange-pink. They read as a broken texture or a debug overlay.
   - Blossom trees and bushes are a flat, loud magenta-pink at night, their crowns reading as crumpled facets.
   - The dirt path is blotchy purple-brown with hard-edged patches; a roof in the corner is saturated red. Nothing in the frame looks lamplit or moonlit; it looks like day colors pushed purple.
2. **A blossom tree close up, in haze.** The crown is a lump of large flat pink and olive leaf-shaped facets, like crumpled paper; the trunk is a plain six-sided tapered post with a flared foot; the haze tints all of it one pink-tan. It reads as a stand-in, not as painted.
3. **Day, close zoom on two thatched cottages and a fenced garden bed (autumn).**
   - A heavy tan haze lies over the whole frame even at street zoom. Contrast is gone: thatch, grass and paths drift to the same tan.
   - Thin streaks fall across the frame in many colors (leaves or rain), and small white specks dot the ground.
   - On the path by the garden bed lie two pale, unshaded objects: a flight of five steps and a long tilted slab with a row of triangular teeth.
4. (An inspector card, handled by another cycle.)

## Read

- `CLAUDE.md`
- `docs/spec/17-presentation.md`: Visual direction (the second pass), Weather, night
- `docs/spec/22-quality.md`: the frame budgets by preset, Definition of done
- The As built sections of `cycle-v2x-integration.md`, `cycle-v3x-integration.md`, `cycle-v3c-long-view.md` (haze with height, river mist, chimney haze), `cycle-v2a-night.md`, `cycle-v2b-green.md` (the dab kit, crowns, drifts); `v3-wave-notes.md`

## You own

- `apps/client/src/render/layers/{weather,water,nature,trees,meadow,roads,terrain,sky}.ts`
- The haze and fog code where V3C put it
- The night grade's values in `render/look.ts` and `render/lighting.ts`
- `packages/art/src/kits/{nature,trees}.ts`, the dab kit, and the values in `materials.ts`, `palette.ts` (append tokens, never rename) and `surface.ts`
- The shots scripts and `docs/build/screenshots/p3c-*`

Outside these paths: only small, necessary edits, listed in the PR. Keep out of V4's `render/{cache,post,shadows,resolution}.ts`, `renderer.capture()` and `input/camera.ts` (a one-line fix at most, listed in the PR), and out of R3's light map and `layers/{lights,decor,agents,buildings}.ts` unless an item's cause is there (then tell the master first).

## You can rely on

- The debug URL: `?debug&fixture=grown`, `&hour=22`, `&season=spring|autumn|winter&day=N`, `&weather=...` (`docs/playtests/V3.md`, `apps/client/src/render/renderer.ts`)
- The V3 shots and perf scripts (`apps/client/e2e/v3-shots.mjs`, `v3-perf.mjs`)
- The build and review loop (`docs/spec/31-parallel-development.md`); Sonnet executors only retake shots and make mechanical edits. Every decision about the look stays with the master of this cycle, who looks at every shot.

## Tasks

1. **Reproduce and find the cause of each item**, in code, not by eye alone: which layer draws the puddles and with what material; what the stripes are; why blossom, drifts and paths keep day saturation at night; where the haze's density by height and distance comes from and why it is so thick at street zoom; what the falling streaks and ground specks are; what the two pale objects are. Before shots `p3c-before-*` matching the owner's frames.
2. **Rain and night**: puddles that read as water (dark, edge-soft, catching the sky or a lamp, never brighter than the ground at night); rain that wets the ground without hatch marks; drifts, meadow and blossom that take the night like everything else (moonlit and muted, warm only where a lamp reaches); the path in rain a wet earth, not purple blotches. Check dusk, 22:00 and dawn, with and without lamps in view.
3. **Haze and mist**: haze belongs to distance and to low ground at dawn. At street and default zoom on a plain day the picture keeps its contrast and its colors; mist still pools by the river at dawn and the long view still fades into the hills (V3C's acceptance holds: no wall, no box). Leaves and weather particles in believable colors and counts; no specks that read as noise.
4. **Trees close up**: at the nearest zoom a crown reads as brushed dabs with some depth (smaller dabs at the rim, a shaded underside, a little color variation) and the trunk as a trunk; blossom is soft, not loud. Every tree kind, every season, default zoom and nearest. Triangle and draw counts stay inside the budgets.
5. **The pale objects**: fix them and add a check for the whole class: a test or gallery pass that renders every kit, site stage and dressing piece and fails on a missing surface, an unlit default material or a piece off its anchor.
6. **A weather contact sheet**: one script beside the existing shots scripts that shoots the grown village and a fresh hamlet at default and nearest zoom across clear, rain, fog and snow, at noon, dusk, 22:00 and dawn, in each season where it applies. Look at every frame and fix what else looks wrong in the same spirit; list what is left.

## Acceptance criteria

- [ ] Before and after shots matching each of the owner's three frames, and the contact sheet, all looked at; nothing in them reads as broken, unlit or a stand-in.
- [ ] Night rain: no element brighter or more saturated than lamplit ground unless it is a light; puddles read as water.
- [ ] A plain day at street zoom keeps its contrast (the haze's share at the default and nearest cameras before and after); V3C's long view still holds.
- [ ] The missing-surface check covers every kit, site stage and dressing piece and passes.
- [ ] Budgets hold on every preset (software numbers before and after); hashes unchanged; typecheck, lint, unit tests, build, e2e and bench pass.
- [ ] `17-presentation.md` updated where the look differs, a CHANGELOG line, the board row, As built.
- [ ] Definition of done in `docs/spec/22-quality.md`

## Out of scope

- The inspector card (the owner's fourth shot): another P3 cycle.
- Any sim change: every hash stays the same.
- V4's renderer files and R3's light map and lights, decor, agents and buildings layers (see You own).

## Notes

- Ports for this checkout: client 5252, relay 8862.
- Every static change goes through `ctx.invalidate()`. Contracts additive.
- The frame budget is the floor: moving and idle frames cost no more than on `main` on every preset.
- Known CI noise: the bench line "growth night R1B" swings around its 2 ms budget; `street.test.ts` "runs in well under 2 ms" failed once at 6.06 ms against 6.

## As built

Built on `cycle/p3c-weather-look` by the build and review loop's master alone: every look decision was made from the shots, and no executor was needed for the mechanical work this time. Before shots come from `main` served from a worktree (`p3c-before-*`), after shots from the branch (`p3c-after-*`), same cameras.

### What each of the owner's frames was, in code

| The owner saw | The cause |
|---|---|
| Puddles as flat, saturated lavender-blue shapes, the brightest thing at night | `ground.ts` `qPuddles`: a hard-edged mask over any hollow, grass included, whose roughness dropped to 0.3, so the moon's specular lit each one as a lavender sheet. |
| Clusters of short parallel diagonal stripes, lavender-white and orange-pink | The meadow carpet (`layers/meadow.ts`): a share of blades in a flower drift took the flower's color foot to tip, and blades in a drift all lean one comb direction, so they read as hatching; at night they kept 35% of their day color. |
| Blossom loud magenta at night, crowns as crumpled facets | No night term reached albedo: moonlight is just a bluish light on day colors, so pink went magenta and red roofs stayed saturated. The cherry is a decor kit painted in one blossom pink; forest blossom was noise patches at seven to a tile, which cut every dab in two. |
| The dirt path blotchy purple-brown | Puddles (above) on the moonlit dirt. |
| A blossom tree close up as big pink and olive facets on a six-sided post | Dabs of 0.255 tiles on an oak (0.14 on the cherry) at the nearest zoom, the forest blossom noise above, and `TreeBuilder.trunk`'s two straight cylinders. |
| A heavy tan haze over the whole frame at street zoom | A fog day: `renderer.ts` pulled the fog's near and far in by a share of the camera's distance at every zoom, and `lookWeather` laid a flat wash over 22 to 67 percent of the screen. A clear day's haze is about 1 percent of the frame at every camera, before and after. |
| Thin streaks of many colors across the frame | Autumn leaves and rain from `layers/weather.ts`, whose box reaches past a close camera, so particles a tile or two from the lens filled the frame. |
| Small white specks on the ground | Petals (spring) and leaf litter (autumn) in `qGroundSeason`, a base share sprinkled on every tile. |
| A flight of five pale steps and a long tilted slab with teeth | Road stairs (`layers/roads.ts`, C4P): tread boxes that reached down to the lowest ground under them and ratcheted up over any dip, plus a straight sloped kerb, in pale sandstone with no surface. Beside a building's pinned pad (the grown village's garden beds at 92, 99 to 94, 101) they stood as a plinth. |

### What changed

- **Night**: `lighting.ts` patches three's light chunks once (as V3C's haze does): after every lit material gathers its light, the moon's and the night sky's light (direct, ambient and specular) goes toward a cool blue of the same brightness, about half way at full night, and a pale surface is held back. Lamps, windows and flames are emissive everywhere, so they keep their warmth. The terms come in from the violet twilight (night 0.6); dusk and dawn are untouched. The sky dome sets them on each light step. The moon's glint on glass and water is a twentieth of the sun's (a well's water bloomed into a cyan orb); fireflies are sparks with a small halo (a cluster bloomed into a green cloud).
- **Rain**: puddles stand on roads, paths and worn ground (only the deepest hollows elsewhere), darker than the ground with a soft wet margin, holding the sky and a lamp's pool as an emissive sheen; roughness 0.6, not 0.3. Wet roads are darker and a little richer. Rain is fainter at night and nothing falls in front of the lens.
- **Haze**: `hazeFor(distance, fog)` closes a fog day in world distance; `lookWeather`'s fog is a breath of wisps at the top of the frame. River mist at dawn and the long view are V3C's, unchanged.
- **Green**: more, smaller dabs, smaller toward the sides and underside, a deeper and cooler belly, a darker root to each stroke; trunks bend over three root spurs; the cherry is paler with a deeper clump, a near-white one and fresh leaves, with no year-round petal boxes; woodland blossom on 42% of deciduous trees, dab by dab (each dab's `dab` attribute carries its own random); litter in drifts; meadow flowers as heads on the top fifth of a blade.
- **Stairs and stand-ins**: stairs are risers let into the slope, every corner on the drawn ground (`village.test.ts` checks every vertex on a falling hillside and beside a pad). `packages/art/src/standIns.test.ts` builds every kit at both levels and every tree stage, and every site stage of every building kit, and fails on missing attributes or bad normals, a near pale face with no surface over 0.1 square tiles, or a near base floating over 3 cm or sunk. It found: stage-3 sites drawing their walls as one pale plain box, the windmill's tower, the quarry's blocks, the town hall's clock tower, cloth and boards on the market stall, square and cart shed, and the bush, hedgerow and flower cart floating; all fixed.
- **The contact sheet**: `apps/client/e2e/p3c-contact.mjs` loads the grown village and a fresh hamlet once each, switches season and weather in place (the renderer's debug look pins), and shoots the default and nearest cameras at noon, dusk, 22:00 and dawn: sheets `p3c-after-sheet-<fixture>-<season>.png`.

### Outside the owned paths (all small)

`render/renderer.ts` (`fitView`: the fog day goes through `hazeFor`, three lines), `render/ground.ts` (the terrain layer's painting: puddles, wet ground, litter), `render/scatter.ts` (the foliage shader's blossom), `render/material.ts` (the moon's glint, one line), `render/layers/critters.ts` (the fireflies' brightness, one line), `packages/art/src/kits/decor.ts` (the orchard tree's crown and trunk), and surface lines in `kits/{buildings,construction,services,specialized,workplaces,fineDecor}.ts`. Nothing in V4's files or R3's light map and lights, decor, agents and buildings layers.

### What is left

- The cherry (decor) keeps its blossom all year: salmon under autumn's tint, pink in the snow. A seasonal cherry needs the decor layer to hand the kit the season, as it hands orchard trees their thinning (`layers/decor.ts`, R3's look cycle).
- Lamp pools keep V2X's hard edge on pale paths, most visible at dusk (the light map's curve, R3's).
- Dusk keeps V1A's rose and violet split tone, which turns streets and roofs strongly purple for an hour; the owner's note was about night, so it is unchanged.
- A dab is one triangle, so at the nearest zoom a crown still shows triangles up close, now smaller and varied. A rounded two-triangle dab would double a near crown's dabs.
- `CameraController.snap()` does not apply the view when the ground under it is unchanged (V4's `input/camera.ts`): the P3C scripts call `rig.apply()` after it.
- The numbers are the container's software renderer; the laptop rows are the owner's and Kat's.
