# 22. Quality

## Performance budgets

Acceptance criteria for every cycle that touches the area. Reference machines: a laptop with integrated graphics (Intel Iris Xe class or Apple M1), 8 GB RAM, latest Chrome, Edge, Firefox or Safari (P50).

| Metric | Budget |
|---|---|
| Frame rate | 60 fps at 1080p on Medium with a City-scale scene; 30 fps floor on Low on older machines |
| Main thread frame time | 12 ms or less on average (render, UI, mirror) |
| Draw calls | 300 or fewer |
| Triangles on screen | 1.5 M or fewer on Medium |
| Sim tick (worker) | I0: 1 ms; I1 40-resident hamlet: 0.5 ms; with 2,000 residents: 4 ms average, 12 ms worst |
| World generation | 300 ms in Node |
| Chunk rebuild | 4 ms each, at most 2 per frame |
| Catch-up | 300 turns at 3x in 1.5 s |
| Snapshot | 2 MB gzipped at City scale; serialize in 150 ms |
| State hash | 30 ms |
| Memory | 600 MB per tab |
| Load | interactive in 5 s cold, 2 s warm; initial JS 1.5 MB gzipped |
| Input | ghost follows the cursor within 1 frame; online command visible within 250 ms |

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
