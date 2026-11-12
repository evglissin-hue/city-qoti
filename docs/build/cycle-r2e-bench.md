# R2E: The bench

**Iteration**: R2 The evening round. **Wave**: parallel. **Branch**: `cycle/r2e-bench`, from `cycle/r2x-integration`; PR into `cycle/r2x-integration`. **Recommended effort**: high.
**Depends on**: R2.0. **Runs alongside**: R2A to R2D, R2F, and V3's wave. **Ports**: client 5235, relay 8845.

## Goal

The autoplayer plays the evening round the way a sensible pair would (the Hearth lane composes places where folk will walk, the Ledger lane zones shops along those walks) and the bench measures what R2 promises: the lanes test enforced on every seed, the R2 outcome tests, the new health kinds and the budgets, so R2X can tune against numbers.

## Read

- `CLAUDE.md`; `docs/build/r2-wave-notes.md`; `docs/build/r1-wave-notes.md` (R1F's advisors and what they became; check against R1X's As built)
- `docs/spec/22-quality.md`: The lanes test, the R2 budgets, the playability rows, Playtests; the dead-end hunt in `31-parallel-development.md` (Build and review loop, step 4)
- `docs/spec/19-evenings.md`: the R2 acceptance, Places and The round (what a sensible Hearth player builds), Gaps
- `docs/spec/30-roadmap.md`: R2 (Acceptance)

## You own

`tools/bench/**` (advisors, `lanes.ts`, `tune*.ts`, `autoplay.ts`, new `r2.bench.ts`) and `packages/sim/src/view/health.ts` (the audit's kinds), with their tests (`tools/bench/src/**/*.test.ts`, `packages/sim/test/p1/health*`, new `test/r2e/**`).

## You can rely on

- R1F's planner and advisors (a zones-and-sites advisor, a season-plan advisor, a Hearth advisor), the decisions count, the lanes test in record mode, HealthWatch, the year view.
- R2.0's contracts and, as they land, R2A to R2C's systems; merge `cycle/r2x-integration` often.

## Tasks

1. **A Hearth advisor that composes places**: benches in rows near homes, a pattern site by the shops, a porch ladder, the tavern and a well where folk live, a brazier for winter, through the Hearth's tools only (the Ledger's advisor places no decor and the Hearth's zones nothing). Seats follow the rule of about one for every four grown-ups.
2. **A Ledger advisor that zones shops**: Shops zoned along the Hearth's walks (read `footfallEve`), lighting the Shops bar when places have nothing to sell; marks an evening street when a place's stretch is busy and cart-free hauling allows it; a Market Square at Village rank as R1F places it.
3. **The lanes test enforced** (`npm run lanes -w @qoti/bench`): each bench seed for 70 days three ways (both lanes, Hearth off, Ledger off after founding); fail unless each one-lane town ends with at most three quarters of the residents of the town played by both and no more than half its Craftsfolk households. Print the table.
4. **R2 outcome tests** (bench-level, headless, two bench seeds): every grown-up with a place in reach goes out on a fair evening; a town with no places stays in and its Craftsfolk never come; with three places four fifths of Treats are sold on the round; the first Craftsfolk household by day 40 on evenings of 50; each R2 gap opens and closes and credits the right seat; a cart routes round an evening street.
5. **Health kinds**: a gap no command could close; a place nobody can reach; a shop whose Treats never sell for a season while a place is within reach; a tier gated by an evenings score no town can build. Quiet on a sensible 70-day run once A to C land (or each flag is explained for R2X).
6. **The tune table and year view** in the new terms: the share out, the average evening, places and seats per grown-up, Treats on the round, gaps opened and closed, decisions by lane (the decisions count stays under R1's 150 for the Ledger and gains a Hearth line, reported).
7. **Bench scenes** (`npm run bench`): the place pass (1 ms an hour at Village scale, 3 ms at City), planning the round (0.4 ms a tick for 2,000 residents), a full evening with 2,000 residents inside the sim budgets, gaps. Include R2A's and R2B's lines.

## Acceptance criteria

- [ ] The lanes test runs on every bench seed, prints its table and fails the run past three quarters of residents or half the Craftsfolk (a unit test feeds it a failing table).
- [ ] The outcome tests of task 4 pass or each miss is explained with its measured number for R2X.
- [ ] The new health kinds flag their cases in unit tests and stay quiet on a sensible run.
- [ ] A 2,000-resident evening and the place pass hold their budgets; a year hashes the same in Node and a browser worker.
- [ ] Typecheck, lint, unit tests, build and bench pass.

## Out of scope

Changing any system to make a number pass (report it to R2X); the interface (R2D); R3's supplies and masters.

## Notes

- Before the redesign the Hearth-off town ended with 106% (willow) and 84% (hazel) of the residents; R1 recorded the new figures (check against R1X's As built). The point of the test is that neither lane can stand in for the other.
- The Ledger's advisor places no decor and the Hearth's zones nothing; keep the two apart so the test means something.
- From R1X: the lanes record at R1's end is Hearth off 97 to 187% of the residents (every seed, no Craftsfolk), Ledger off 18 to 38% (`22-quality.md`). The Hearth lane alone does not yet hold a town back, so the enforced test fails until the evening round gives the Hearth's places their pull; report each seed's figure rather than loosening the bar.
- From R1X: `npm run targets -w @qoti/bench` prints each seed against R1's targets (`TARGETS_DAYS=1` adds a line a day); extend it with R2's columns rather than writing a second table. R1X's advisor changes (16 streets, services and lanes on credit, the tax under 16%, loans of 1,000, no canceling of a site waiting on Materials, a garden bed for A Garden Plot) are in `13-ledger.md`, As built (R1X).
