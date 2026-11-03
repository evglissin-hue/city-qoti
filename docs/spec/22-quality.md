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
