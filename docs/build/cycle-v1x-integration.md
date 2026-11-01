# V1X: V1 integration

**Iteration**: V1. **Wave**: integration. **Branch**: `cycle/v1x-integration`.
**Depends on**: V1A to V1D open or merged. **Runs alongside**: the I3 cycles still open (they own sim and UI paths). **Ports**: client 5205, relay 8815.

## Goal

V1 is merged, tuned and measured: from the default camera and close up, by day, golden hour and night and in every season, the game looks like the picked Painted Miniature concept (B); the budgets in `docs/spec/22-quality.md` hold on both laptops, moving and idle; the owner and Kat have played an evening on it; C5E can start on the new look; and the notes for I4's V2 (streets that fill their frontage) and V3 (the Age of Steam kit) are written.

## Read

- `CLAUDE.md`, `docs/build/v1-wave-notes.md`, the V1A to V1D PRs
- `docs/spec/17-presentation.md`, `docs/spec/20-architecture.md` (Rendering, Lean renderer [V1], V1 contracts), `docs/spec/22-quality.md`, `docs/spec/30-roadmap.md` (Visual overhaul), `docs/spec/18-eras.md`
- `docs/build/cycle-05e-seasons-art.md` (to update), `docs/spec/31-parallel-development.md` (Integration cycles)

## You own

Everything, but only to merge, fix and tune.

## You can rely on

The four V1 PRs, V1.0's scenes and scripts (`v1-shots.mjs`, `v1-perf.mjs`), the before shots and numbers in the wave notes.

## Tasks

1. Merge V1D first (the frame graph and caches), then V1A, V1B and V1C, resolving conflicts against `main`; run typecheck, lint, unit, e2e, build and bench after each.
2. Retire what V1 replaced: the old palette tokens no kit reads any more, the old post chain and `?engine=classic`, stand-ins listed in the wave notes.
3. Tune against the concept stills: pattern strengths, palette 2.0, haze, tilt-shift strength, bloom, ground AO weights, the level distances per preset, the still-frame cache delay.
4. Shots: `v1-shots.mjs after` for every scene, next to the `before` set and the concept stills, at day, golden hour and night; winter and raid fixtures included.
5. Numbers: `v1-perf.mjs` on both laptops for every preset and scene, moving and idle; the table goes into `22-quality.md` (As built) and `30-roadmap.md` (V1 As built).
6. A playtest evening on the live link; fill `docs/playtests/V1.md` (best moment, what looked off, fps and the `res` and mode readouts on each laptop, three things to change).
7. Update `cycle-05e-seasons-art.md` so C5E builds seasons, festivals, defenses and critters on the V1 material, kit and levels (its owned paths, the surface ids, the moving and static layers, the new budgets), and mark it ready on the board.
8. Planning notes for I4: V2's sim needs (lots cut along street frontage, terraces around back gardens, corner lots, heights by tier) for I4's contracts cycle, and V3's Age of Steam kit on the V1 material (`18-eras.md`).
9. Docs: spec sections where reality differs, the board, one changelog line.

## Acceptance criteria

- [ ] Everything passes; the golden scripts replay identically (V1 changes no sim code).
- [ ] Before and after shots of every scene in `docs/build/screenshots/` (`v1-before-*`, `v1-after-*`), and the after set reads like the B concept stills.
- [ ] The perf table covers both laptops, four presets and three scenes, moving and idle; every Medium number meets its budget on the weaker laptop, and High holds 60 fps moving on the stronger one.
- [ ] `docs/playtests/V1.md` is filled after the evening.
- [ ] C5E's brief is updated and marked ready; the I4 planning notes for V2 and V3 exist.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## Out of scope

New features. A track's unfinished work goes back to a follow-up brief, not into this branch.

## Notes

- Visual quality is the owner's top priority: when a number and the look disagree, show both to the owner before trading one away.
- The concept viewer stays in `docs/concepts/v0-look/` as the reference; once the game matches it, say so in `17-presentation.md` (Visual direction).
