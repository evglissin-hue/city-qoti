# R2E: The bench

**Iteration**: R2 The evening round. **Wave**: parallel. **Branch**: `cycle/r2e-bench`, from `cycle/r2x-integration`; PR into `cycle/r2x-integration`. **Recommended effort**: high.
**Depends on**: R2.0. **Runs alongside**: R2A to R2D, R2F, and V3's wave. **Ports**: client 5235, relay 8845.

## Goal

The autoplayer plays the evening round the way a sensible pair would (the Hearth lane composes places where folk will walk, the Ledger lane zones shops along those walks) and the bench measures what R2 promises: the lanes test enforced on every seed, the R2 outcome tests, the new health kinds, the budgets, and R1's two lines the owner moved here, so R2X can tune against numbers.

## Read

- `CLAUDE.md`; `docs/build/r2-wave-notes.md`; `docs/build/r1-wave-notes.md` (R1F's advisors) and `docs/build/cycle-r1x-integration.md`, As built (what the autoplayer became)
- `docs/spec/22-quality.md`: The lanes test (with R1X's record), the R2 budgets, the R1 growth row; `docs/spec/31-parallel-development.md`: Build and review loop, step 4
- `docs/spec/19-evenings.md`: the R2 acceptance, Places and The round (what a sensible Hearth player builds), Gaps
- `docs/spec/30-roadmap.md`: R2 (Acceptance); `docs/spec/13-ledger.md`: What holds (R1X)

## You own

`tools/bench/**` (advisors, `lanes.ts`, `tune*.ts`, `targets*`, `autoplay.ts`, new `r2.bench.ts`) and `packages/sim/src/view/health.ts` (the audit's kinds), with their tests (`tools/bench/src/**/*.test.ts`, `packages/sim/test/p1/health*`, new `packages/sim/test/r2e/**`).

## You can rely on

- R1F's planner and advisors as R1X left them (16 streets, services and lanes on credit, the tax under 16%, loans of 1,000, a garden bed for A Garden Plot), the decisions count, the lanes test in record mode, the targets script (`npm run targets -w @qoti/bench`), HealthWatch, the year view.
- R2.0's contracts: `PlaceView` and `placesView`, `state.evenings` (the tally and runs), `state.gaps`, the footfall layers, `content.places`, the brazier, seats on pieces, hosts. R2A to R2C's systems as they land; merge `cycle/r2x-integration` often.

## Tasks

1. **A Hearth advisor that composes places** through the Hearth's tools only: benches in rows near homes, a pattern site by the shops, the tavern and a well where folk live, a brazier for winter (Village), seats at about one for every four grown-ups (`19-evenings.md`).
2. **A Ledger advisor that zones shops** along the Hearth's walks (read `footfallEve` and `PlaceView.serves`), lighting the Shops bar when places have nothing to sell; marks an evening street (`road.setEvening`) when a place's stretch is busy and cart-free hauling allows it. The Ledger's advisor places no decor and the Hearth's zones nothing.
3. **The lanes test enforced** (`npm run lanes -w @qoti/bench`): each bench seed 70 days three ways (both lanes, the Hearth off, the Ledger off after founding); fail unless each one-lane town ends with at most three quarters of the residents of the town played by both and no more than half its Craftsfolk households. Print the table.
4. **R2 outcome tests** (headless, two bench seeds): every grown-up with a place in reach goes out on a fair evening; a town with no places stays in and its Craftsfolk never come; with three places four fifths of Treats are sold on the round; the first Craftsfolk by day 40 on evenings of 50; each R2 gap opens, closes and credits the right seat; a cart routes round an evening street.
5. **Health kinds** (`view/health.ts`): a gap no command could close; a place nobody can reach; a shop whose Treats never sell for a season while a place is in reach; a tier gated by an evenings score no town can build; a garden lot something tried to grow on. Quiet on a sensible 70-day run once R2A to R2C land, or each flag explained for R2X.
6. **The targets table and year view** in the new terms: the share out, the average evening, places and seats per grown-up, Treats on the round, gaps opened and closed, decisions by lane (the Ledger under R1's 150; a Hearth line reported), and R1's Craftsfolk lines (first by day 40, a third by day 70) per seed. Extend `npm run targets`, do not write a second table.
7. **Bench scenes** (`npm run bench`): the place pass (1 ms an hour at Village scale, 3 ms at City), planning the round (0.4 ms a tick for 2,000 residents), a full evening with 2,000 residents, gaps; R2A's and R2B's lines join through your scene list.

## Acceptance criteria

- [ ] The lanes test runs on every bench seed, prints its table and fails past three quarters of residents or half the Craftsfolk (a unit test feeds it a failing table).
- [ ] The outcome tests pass, or each miss is explained with its measured number for R2X.
- [ ] The new health kinds flag their cases in unit tests and stay quiet on a sensible run.
- [ ] A 2,000-resident evening and the place pass hold their budgets; a year hashes the same in Node and a browser worker.
- [ ] R1F's `r1 growth night` (`tools/bench/src/r1.bench.ts`), moved to R2 by the owner (2026-11-15), under 2 ms on a reference laptop (2.45 to 2.56 ms in the build container at R1's end, 1.67 and 1.82 ms on R1X's final build; the container swings by half from run to run). Hot spots left: `townStock` and the night's census, `craftPull` reading the served lists twice a night, the `persist` signature rebuild.
- [ ] Typecheck, lint, unit tests, build and bench pass.

## Out of scope

Changing a system to make a number pass (report it to R2X); the interface (R2D); R3's supplies and masters.

## Notes

- R1X's lanes record: the Hearth-off towns ended with 93 to 187% of the residents (no Craftsfolk), the Ledger-off ones 18 to 26%; the both-lanes Ledger took up to 142 decisions in 70 days. The enforced test fails until the evening round gives places their pull: report each seed's figure, never loosen the bar.
- Variance between runs is large (R1X): read every target over several seeds and runs.
