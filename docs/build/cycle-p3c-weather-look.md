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
