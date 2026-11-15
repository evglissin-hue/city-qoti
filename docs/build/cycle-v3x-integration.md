# V3X: V3 integration

**Iteration**: V3 Yards, streets and the long view. **Wave**: integration. **Branch**: `cycle/v3x-integration`, made from `main` after V3.0 merges; one PR into `main`.
**Depends on**: V3A to V3D open or merged. **Runs alongside**: R2's wave and R2X. **Ports**: client 5235, relay 8845.

## Goal

V3 is merged, tuned and measured on both laptops. In a grown street you can tell who lives and works where without a panel, streets join into rows with gardens behind, the far view has a horizon and no box, and from 240 tiles out the valley is its own map and the scene is not drawn. Both laptops' tables are in `22-quality.md`, the owner and Kat have played an evening on it, and V4's briefs are written. Nothing in the sim changed.

## Read

- `CLAUDE.md`, `docs/build/v3-wave-notes.md`, the V3A to V3D briefs and PRs
- `docs/spec/30-roadmap.md`: The redesign (Order of work: the inks), V3 (cycles and the four acceptance lines), V4; `docs/spec/31-parallel-development.md`: Integration cycles
- `docs/spec/22-quality.md`: The redesign: measuring first, then budgets (the Dressing and Endpaper map rows; the laptops' tables)
- `docs/build/cycle-v3-0-contracts.md`: "Measured headroom per preset (V2X)"

## You own

Everything, but only to merge, fix and tune; and the V3X row of the wave notes: `render/{renderer,cache,post,statics,lightMap,material,ground,scatter}.ts` (but V3D's one line), the showcases, every layer no track owns, `packages/art/src/{materials,patterns,surface,dabs,rooms}.ts` and `kits/{trees,nature,animals,vehicles,residents}.ts`, `apps/client/src/app/{perf,debug}.ts`, `apps/client/e2e/{v3-shots,v3-perf}.mjs`.

## You can rely on

The four track PRs, the wave notes' stand-ins and carve-out tables as each track filled them, V3.0's scenes and scripts (`v3-shots.mjs` with `street`, `village`, `far120`, `far200`, `far240`; `v3-perf.mjs`; `__qoti.grownInfo().door`), the before shots and numbers (wave notes, Before numbers), Measure this laptop and the perf route, and the headroom table in `cycle-v3-0-contracts.md`.

## Tasks

1. **Merge in this order**, running typecheck, lint, unit, e2e, build and bench after each: V3C first (the horizon and the fog's height term touch shared shaders and the far draws, so the rest are measured on the final far view), then V3B (rows, building kits and its `yardOf`), then V3A (dressing wants V3B's free yard and its street furniture rows), and V3D last (it reads V3B's rows and V3C's river through `EndpaperInput`, and its scene skip is the last word on what draws). Resolve appended `EndpaperInput` fields, palette tokens and registry lines by keeping every name and order (append only).
2. **Join the handshakes**: the dressing layer passes `yardOf(lot)` to `anchorsFor` instead of the whole lot (the stand-in retired); the carve-out table's anchor overrides are landed or taken; V3B's street furniture rules are in `dressingRules.ts`, one row each; `endpaperInput` calls V3B's row function and V3C's river function; the horizon yields to `env.skipScene`.
3. **Wire the inks** if R2X has landed on `main` by now: `EndpaperInks.goods` from the flows overlay's routes (ochre) and `footfall` from `map.footfallEve` (sage), as `InkLayer`s, with R2's street names from `state.streets` in `endpaperInput`'s labels. If R2X has not landed, leave them unset and say so in As built: R2X wires them (`30-roadmap.md`, The redesign, Order of work).
4. **Which R2 fields show**: R2's lot fields reach `main` only with R2X. Say in As built which of gardens, corners and storeys show on `main` at this merge (R2's fields through `lotsFor`, or its fallback) and take the after set on that `main`; if R2X has regrown the village, say the after scene is not the before's.
5. **Tune** against the before shots and the owner's taste: dressing counts and distance per preset, rows and gardens, the horizon's tints and haze with height, the river's colors and flow, the map's ink and labels. Retire any stand-in the wave notes mark for V3X. Every Medium row stays inside its budget on Kat's laptop; a piece that fails there is cut back (P50), and As built says what.
6. **Shots**: `node apps/client/e2e/v3-shots.mjs after`, every scene by day, golden hour and night beside `v3-before-*`, plus an autumn and a winter shot of the street and of the far view, saved in `docs/build/screenshots/`.
7. **Numbers**: `v3-perf.mjs` (headless) for the record against `docs/build/screenshots/v3-before-perf.md`, then both laptops' after tables from Measure this laptop on the live link (the owner and Kat run it on this build, plugged in, as in `docs/playtests/V2.md`). Put before and after for both laptops in `22-quality.md` (The redesign, as built) and fill the headroom table's laptop columns, TBD until now. Check the Dressing row (0.3 M triangles, 12 draws) and the Endpaper map row (redraw under 150 ms in the worker, no scene draw while it shows in full).
8. **The playtest evening**: `docs/playtests/V3.md` from `V2.md`'s shape: walk a grown street by day and at night, a fresh valley, the far view out to the map in each season, the numbers readout; filled after the evening with the owner's and Kat's eyes.
9. **V4's briefs**: V4's wave notes and briefs (`30-roadmap.md`, V4), written as V3.0 wrote V3's and carrying what V3 learned (the measured headroom per preset, what the carve-outs taught, which stand-ins are still open). Put them on the board.
10. **Docs**: `20-architecture.md` (V3 contracts as built), `17-presentation.md` (the preset values as tuned; items 4 and 5 marked done or with what remains), `30-roadmap.md` (V3 as built), the board rows, one line in `CHANGELOG.md`.

## Acceptance criteria

- [ ] The four lines of `30-roadmap.md`'s V3 acceptance hold, each with a shot or a test: a street's trades, levels and woodpiles read; streets join into rows with gardens behind (as far as the fields on `main` allow, said in As built); the far view has a horizon and no box, and from 240 tiles out only the map draws; budgets hold on both laptops with tables in `22-quality.md`.
- [ ] On Kat's laptop on Medium, day and night moving frames stay inside the 12 ms budget and idle inside 4 ms, and every budget in `22-quality.md` holds; both laptops' before and after tables are written down.
- [ ] Nothing in the sim changes and hashes match (the golden scripts replay identically).
- [ ] Before and after shots of every scene and hour are in `docs/build/screenshots/`, and the track acceptances still hold after the merge and the tuning.
- [ ] `docs/playtests/V3.md` is filled; V4's briefs and wave notes are written and on the board.
- [ ] Typecheck, lint, unit, e2e, build and bench pass; definition of done in `docs/spec/22-quality.md`.

## Out of scope

New features. A track's unfinished work goes to a follow-up brief, not into this branch. Anything on R2's paths (`packages/sim`, `packages/content` beyond `dressingRules.ts`, `tools/bench`, `ui`, `input`, `state`).

## Notes

- Run the build and review loop (`31-parallel-development.md`): the master plays it from the player's chair, one or two rounds before the PR. The dead-end hunt here is visual: a woodpile with no home, a garden on a road, a lamp that lights nothing, a horizon band that pokes through the map, a map that shows before it has ever drawn, a label that overlaps another.
- Visual quality is the owner's top priority: when a number and the look disagree, show both to the owner before trading one away.
- The laptops' numbers are the owner's and Kat's part; the wave may be built without them, but V3X cannot ship without both after tables.
