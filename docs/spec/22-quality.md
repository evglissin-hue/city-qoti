# 22. Quality

## Performance budgets

Acceptance criteria for every cycle that touches the area. Reference machines: a laptop with integrated graphics (Intel Iris Xe class or Apple M1), 8 GB RAM, latest Chrome, Edge, Firefox or Safari (P50).

| Metric | Budget |
|---|---|
| Frame rate | 60 fps at 1080p on Medium on the weaker laptop with a City-scale scene while the camera moves; 30 fps floor on Low on older machines |
| GPU frame time | 12 ms or less on Medium on the weaker laptop, measured with `EXT_disjoint_timer_query_webgl2` where the browser offers it, else frame time minus main thread time; shown in the `?debug` overlay [V1] |
| Idle frame [V1] | GPU frame time 4 ms or less on Medium on the weaker laptop while the camera rests and residents move (the still-frame cache, `20-architecture.md`, Lean renderer) |
| Main thread frame time | 12 ms or less on average (render, UI, mirror) |
| Draw calls | Low and Medium 300; High and Ultra 450 |
| Triangles on screen | Low 1.5 M; Medium 3 M; High 6 M; Ultra 12 M *(tune: confirm on both laptops with the V0 concept viewer's readout)* |
| Sim tick (worker) | I0: 1 ms; I1 40-resident hamlet: 0.5 ms; with 2,000 residents: 4 ms average, 12 ms worst |
| World generation | 300 ms in Node |
| Chunk rebuild | 4 ms each, at most 2 per frame |
| Catch-up | 300 turns at 3x in 1.5 s |
| Snapshot | 2 MB gzipped at City scale; serialize in 150 ms |
| State hash | 30 ms |
| Memory | Low and Medium 800 MB per tab; High and Ultra 1.5 GB |
| Load | interactive in 5 s cold, 2 s warm; initial JS 1.5 MB gzipped |
| Input | ghost follows the cursor within 1 frame; online command visible within 250 ms |

**Why these numbers (V0, 2026-11-01)**: v1's 1.5 M triangles and 300 draws were a guess made before anything was measured, and a village of 130 already draws 0.8 to 1.15 M triangles (`30-roadmap.md`, I2 As built). On integrated graphics fill rate costs more than triangles: post passes, shadow map size, overdraw and the pixel ratio decide the frame long before geometry does. So the frame rate and the GPU frame time on the weaker laptop are the real criteria, triangles are a guide, and detail is spent where the camera is (levels of detail near, impostors far away). Draw calls stay low because each costs main thread time; more detail comes from batching and instancing, never from more calls.

**Moving and idle frames (V1)**: the render budgets above are measured on moving frames (V1.0's perf script pans, orbits and zooms across each scene); a frame with the camera at rest has its own row, because the lean renderer draws only the moving layers then. The V0 concept on its first engine ran at about 20 to 25 fps on High on the owner's laptop, which is what the lean renderer answers.

**As built (V1D, 2026-11-03)**: the lean renderer, measured so far only in a container without a GPU (headless Chromium in SwiftShader, 1440 x 900, Medium, `QOTI_FIXEDRES=1 QOTI_PRESETS=medium node apps/client/e2e/v1-perf.mjs`, both engines on the same build; `QOTI_ENGINE=classic` is the chain before V1D). Every millisecond is the CPU doing the GPU's work, and each 10 s phase holds only a few frames, so read them as ratios. Draws and triangles are real. The laptop rows (every budget above, moving and idle, on both laptops) are still to be taken with `QOTI_HEADED=1` or `await __qoti.perf()`.

| Scene | Engine | Moving GPU ms (avg) | Idle GPU ms (avg) | Draws (moving) | Triangles (moving) | Rest frames: moving / still / idle |
|---|---|---|---|---|---|---|
| hamlet | classic | 2280 | 3927 | 94 | 0.13 M | 2 / 0 / 0 |
| hamlet | lean | 959 | 575 | 68 | 0.10 M | 0 / 3 / 10 |
| hamlet | lean, sim paused | 868 | 325 | 66 | 0.10 M | 0 / 0 / 28 |
| village of 130 | classic | 4457 | 4495 | 225 | 0.88 M | 2 / 0 / 0 |
| village of 130 | lean | 1651 | 4386 | 159 | 0.66 M | 0 / 3 / 0 |
| town | classic | 5780 | 5033 | 176 | 1.26 M | 1 / 0 / 0 |
| town | lean | 1998 | 3075 | 108 | 0.64 M | 0 / 3 / 0 |
| town | lean, sim paused | 402 | 3189 | 91 | 0.43 M | 0 / 1 / 3 |

Moving frames cost the GPU 2.4 to 2.9 times less than the classic chain's on the same build (one scene pass, no full-resolution post passes, and the shadow map drawn only when due); held still (`QOTI_HOLD=1`), the town's moving frames skip the shadow pass altogether. An idle frame (the cache restored, the moving layers, the blur and the final pass) costs a twelfth of a classic frame in the hamlet. In the village and the town the software rest is still mostly still frames: a frame there takes seconds, so the sim moves dozens of turns between frames and something static (a stock pile, the sun's quarter-hour step, a building's level swap after the zoom) changes in nearly every one, which a laptop at 60 fps sees once in a hundred frames or more. Compared with V1.0's before table (which drew every frame at a lower dynamic resolution, so its milliseconds are not comparable), the town's moving triangles on Medium went from 2.66 M to 0.64 M. That run predates the building distance floor (`20-architecture.md`, Lean renderer, As built), so it drew buildings to 60 tiles on Medium; with the floor they go to 75 as before. The final shots (`v1-shots.mjs v1d`, stills `docs/build/screenshots/v1-v1d-*.png`): the town's camera pass went from 1.31 M to 0.58 M triangles in the wide shot, 1.47 M to 0.95 M at night and 1.18 M to 0.63 M in the street, almost all from decor culled per chunk and leveled (800 k to 62 k, 337 k and 256 k); its night frame, still frame and shadow pass included, from 3.46 M (over Medium's budget) to 2.47 M. The hamlet and the village of 130 draw what they drew (their big layers are trees and buildings, V1C's and V1B's). The shots' own draws and triangles columns now show the last frame drawn, which at rest is an idle one (a hamlet at dusk: 13 draws, a few thousand triangles), so compare per layer.

`tools/bench` builds synthetic valleys (I0: 1,000 buildings and 6,000 decor; I1: a 40-resident hamlet; later a synthetic 2,000-resident town) and reports ms per tick, memory and snapshot size. CI fails when a sim or worldgen budget is exceeded.

## Tests

| Layer | What | Where |
|---|---|---|
| Sim unit | every command (validate and apply), every system, rules, worldgen properties (river spans the map, start area flat, deposits present), serialize round trip, migrations | `packages/sim/**/*.test.ts` |
| Determinism | golden scripts (seed, settings, turns) replayed twice in Node must give identical hashes; the same script in a browser worker (Playwright) must match the Node hash | `packages/sim/test/golden/`, `apps/client/e2e/determinism.spec.ts` |
| Content | unique ids, valid references, sane values; every art kit id exists | `packages/content`, `apps/client` |
| Protocol | RoomCore with fake connections: ordering, `sys.*` injection, empty turns, snapshots and pruning, desync and version flows, limits | `packages/protocol` |
| Client unit | road route proposals, mirror patching, ghost validity equals sim validation (property test) | `apps/client/src/**/*.test.ts` |
| End to end | two browser contexts on the dev server: create, invite, join, both build, both see the same thing, hashes match, reload and catch up, pause from one pauses both | `apps/client/e2e/` |
| Visual review | gallery screenshots at fixed seeds, uploaded as CI artifacts (no pixel assertions) | `apps/gallery/e2e/` |

## CI

GitHub Actions on every pull request and on `main`: install (cached), typecheck, lint, unit tests, build, end-to-end (Chromium), bench (fails on sim and worldgen budgets). Artifacts: Playwright report, gallery screenshots, bench report. A deploy job on `main` runs when Cloudflare secrets are configured.

## Definition of done (every cycle)

1. Every acceptance criterion in the brief is met and demonstrated by a test, a bench number or a screenshot.
2. Typecheck, lint, unit, determinism and end-to-end tests pass, with no new warnings.
3. If the saved state shape changed: `SAVE_VERSION` bumped, migration and test added.
4. Budgets for the touched areas are met; numbers are in the PR.
5. Spec sections updated where behavior differs from the docs; one line in `CHANGELOG.md`.
6. No em dashes in any text; UI copy follows the tone in `17-presentation.md`.
7. A PR into `main` with what changed, how to try it, screenshots or a short clip for anything visual, and follow-ups.

## Playtests

At the end of each iteration the two players play at least one evening together on the live link and fill in `docs/playtests/I<n>.md`:

- What was the best moment? What felt like a chore?
- Was anything confusing? Where did you get stuck?
- Did each lane have enough to do? Did you need each other?
- Bugs, desyncs, performance on each laptop (fps from the debug overlay).
- Three things to change before the next iteration.

## Issue labels

`bug`, `desync`, `perf`, `art`, `ux`, `balance`, `content`, `spec`, plus the iteration (`I1`) and track (`track:render`).
