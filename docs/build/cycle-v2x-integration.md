# V2X: V2 integration

**Iteration**: V2 Light and green. **Wave**: integration. **Branch**: `cycle/v2x-integration`, from `cycle/v2-0-look-contracts`'s tip (or `main` once V2.0 has merged).
**Depends on**: V2.0; V2A, V2B and V2C open or merged. **Runs alongside**: R1's wave (it owns sim, content, bench, UI and the building kits). **Ports**: client 5214, relay 8824.

## Goal

V2 is merged, tuned and measured on both laptops. At night the light map lights a real town end to end, trees and meadows are painted, the half-wired pieces are finished, and the budgets hold on Kat's laptop on Medium, moving and idle, with both laptops' before and after tables in `22-quality.md`. The owner and Kat have played an evening on it, and the V3 briefs are written.

## Read

- `CLAUDE.md`, `docs/build/v2-wave-notes.md`, the V2A, V2B and V2C briefs and PRs
- `docs/spec/17-presentation.md`: Visual direction, second pass (items 1 to 3; 4 and 5 for V3), Quality presets
- `docs/spec/22-quality.md`: The redesign: measuring first, then budgets
- `docs/spec/30-roadmap.md`: The redesign (Order of work, V2, V3); `docs/spec/31-parallel-development.md`: Integration cycles, Build and review loop
- `docs/build/i4-visual-planning-notes.md` (for V3B's brief)

## You own

Everything, but only to merge, fix and tune; and the V2X row of the wave notes (`app/{perf,debug}.ts`, `v2-shots.mjs`, `v2-perf.mjs`, the render files no track owns).

## You can rely on

The three track PRs, the wave notes' stand-ins table as each track filled it, V2.0's scenes and scripts (the grown village, `v2-shots.mjs`, `v2-perf.mjs`), Measure this laptop and the perf route, the before shots and numbers (wave notes, Before numbers; both laptops' before tables in `docs/playtests/V1.md`).

## Tasks

1. **Merge** whatever is not yet in `main`, in this order: V2A (the shadowless change, the readers, the resident material), V2C (its surfaces need V2A's material; its wall occlusion hooks into V2A's material), V2B (the meadow carpet uses the shadowless change). Run typecheck, lint, unit, e2e, build and bench after each.
2. **Join the readers**: if V2A appended a shared strength curve to `LIGHT_MAP_GLSL`, switch V2B's foliage and V2C's smoke to it. Check residents draw V2C's surfaces through V2A's material.
3. **Retire the stand-ins** the wave notes list: the 32-light loop and its `?debug` switch once the night numbers are in (`MAX_GROUND_LIGHTS` and `env.lights` stay exported until the next contracts cycle), the gallery's V2 surface filter if V2C left it, anything else a track marked for you.
4. **Tune** against the before shots and the owner's taste: light map strength, pool radii, era colors, the wall fade and the folk's rim, lamplight on the river; dab counts, tints and gaps, the carpet's distance per preset and its fade, the drift scale; the five surfaces' strengths, wall occlusion, the smoke. Keep every Medium row inside its budget on Kat's laptop.
5. **Shots**: `node apps/client/e2e/v2-shots.mjs after`, every scene by day, golden hour and night, beside the `v2-before-*` set, plus an autumn and a winter shot of the grown village. The grown village rule (wave notes): shoot `after` on the V2.0 snapshot before merging R1X's `main`; if R1X has merged, also shoot the regrown town, which becomes V3's before.
6. **Numbers**: `v2-perf.mjs` (headless) for the record, then both laptops' after tables from Measure this laptop (the owner and Kat run it on this build, plugged in, as in `docs/playtests/V1.md`). Put the before and after tables for both laptops in `22-quality.md` (The redesign, as built). A row that fails on Kat's laptop on Medium is cut back before the wave ships (P50); say what was cut.
7. **The playtest evening**: `docs/playtests/V2.md` from `V1.md`'s shape (night in the grown village and their own fresh valley, trees and meadows in each season, the bubbles toggle, the numbers readout), filled after the evening with the owner's and Kat's eyes.
8. **The V3 briefs**: V3.0's brief in full (anchors, the dressing rules as data, the endpaper map's interface, on R2.0's lot fields; `30-roadmap.md`, V3), carrying what V2 learned (the measured headroom on each preset, the light map as a reader for V3's dressing and the endpaper map, what the carve-outs in R1E's kit files taught); V3.0 then writes V3A to V3X as V2.0 did. V3 starts after R1X and R2.0.
9. **Docs**: `20-architecture.md` (V2 contracts as built), `17-presentation.md` (the preset values as tuned, the second pass's items 1 to 3 marked done or with what remains), `30-roadmap.md` (V2 as built), the board rows, one line in `CHANGELOG.md`.

## Acceptance criteria

- [ ] On Kat's laptop on Medium a night moving frame costs no more GPU time than before V2, and every budget in `22-quality.md` holds, moving and idle; both laptops' tables are in `22-quality.md`.
- [ ] Nothing in the sim changes and hashes match (the golden scripts replay identically).
- [ ] Before and after shots of every scene and hour are in `docs/build/screenshots/` (`v2-before-*`, `v2-after-*`), and the track acceptances still hold after the merge and the tuning.
- [ ] `docs/playtests/V2.md` is filled after the evening.
- [ ] V3.0's brief is written and on the board.
- [ ] Typecheck, lint, unit, e2e, build and bench pass; definition of done in `docs/spec/22-quality.md`.

## Out of scope

New features. A track's unfinished work goes to a follow-up brief, not into this branch. Anything on R1's paths.

## Notes

- Run the build and review loop (`31-parallel-development.md`) with Opus executors (model `opus`): the owner's call for this round. The dead-end hunt here is mostly visual: walk the grown village and a fresh valley at night, in each season, on Low and on Medium, and look for a light that lights nothing, a dab crown that pops at its swap, a carpet edge that shows, a prop that shimmers.
- Visual quality is the owner's top priority: when a number and the look disagree, show both to the owner before trading one away.
- The laptops' numbers are the owner's and Kat's part; the wave may be built without them, but V2X cannot ship without both after tables.
