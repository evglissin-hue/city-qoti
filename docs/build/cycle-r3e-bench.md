# R3E: The bench

**Iteration**: R3 Masters and the Town Book. **Wave**: parallel. **Branch**: `cycle/r3e-bench`, from `cycle/r3x-integration`; PR into `cycle/r3x-integration`. **Recommended effort**: high.
**Depends on**: R3.0. **Runs alongside**: R3A to R3D, R3F to R3H, V4's wave, and the playtest cycles P3A to P3C on `main`. **Ports**: client 5245, relay 8855.

## Goal

The autoplayer plays R3 the way a sensible pair would (the Hearth keeps its best places supplied and composes places beside the trades that could make a page; the Ledger makes what places burn, lets the carrier buy for places when it can afford to, and keeps its masters' businesses fit for level 3), and the bench measures what R3 promises: the R3 outcome tests, the R3 health kinds, the Merchants' and Patrons' variety wants, the lanes test and the evening goal still holding, and the budgets, so R3X can tune against numbers.

## Read

- `CLAUDE.md`; `docs/build/r3-wave-notes.md` (Starting after R2X: R2X's misses; the rulings); R2E's and R2X's As built (`docs/build/cycle-r2e-bench.md`, `cycle-r2x-integration.md`)
- `docs/spec/22-quality.md`: The lanes test, the R3 budget row, Playability from the redesign [R3]; `docs/spec/31-parallel-development.md`: Build and review loop, step 4
- `docs/spec/19-evenings.md`: Supplies, Masters, The Town Book, the R2 and R3 acceptance; `docs/spec/30-roadmap.md`: R3 (Acceptance)
- `docs/spec/13-ledger.md`: Population tiers, Households (variety); `docs/spec/15-progression.md`: Achievements, Callings

## You own

`tools/bench/**` (advisors, `lanes.ts`, `tune*.ts`, `targets*`, `outcomes.ts`, `audit.ts`, `autoplay.ts`, new `r3.bench.ts`), `packages/sim/src/view/health.ts` (the audit's kinds; R3.0 wired `shortOfSupplies` in `gapClosable` to R3A's rule), `apps/client/scripts/grow-fixture.mjs`, with their tests (`tools/bench/src/**/*.test.ts`, `packages/sim/test/p1/health*`, new `packages/sim/test/r3e/**`).

## You can rely on

- R2E's advisors (places, shops, streets and the closed block), `npm run outcomes -w @qoti/bench`, the lanes test enforced (`lanesVerdict`), the targets table and the year view, HealthWatch with R2's kinds and R2X's `gap-unmeetable`, `building-cut-off` and `growth-waits-unseen`; R2X's tuning (newcomers follow good evenings).
- R3.0's contracts, views and counts (`SuppliesView`, `PlaceView.priority` and `supplies`, `BalanceLine.drawnByPlaces`, `mastersCount`, `mastersMade`, `pagesFound`, `pagesTogether`, `callingsCount`, `lampSeasons`, `Building.roundSales`, `ThreadsState`), the commands `place.setPriority` and the places switch; R3A to R3D as they land: merge `cycle/r3x-integration` often.

## Tasks

1. **The Hearth's advisor keeps places alive**: priorities (keep the busiest places, let the far ones rest when candles are short), lanterns only where candles allow, a brazier fed in winter where firewood is above its mark, and places composed beside trades that could make a page (a pair from `content.specialties`, near a business of that Treat). It never zones, sets a carrier rule or places a business.
2. **The Ledger's advisor makes what places burn**: hives where flowers allow and a chandler in reach of honey, firewood above the winter mark, the carrier switched to buy for places when the treasury allows and off when the town owes, and a master's business kept staffed with a street good enough for level 3. It places no decor and sets no priority.
3. **R3 outcome tests** (headless, two bench seeds, in `npm run outcomes`, each row naming the cycle its number needs): with candles for half the lanterns the places kept first are lit and the rest rest, and nothing breaks; the first master in the first Village year; a master's good reaches a shelf; a departed master's good stops; six Town Book pages found by the two seats and one calling earned; the fourth gap opens, closes and credits; the tavern's Treats: the nothing-to-sell gap now opens and closes (the owner's ruling).
4. **The evening goal** (the owner's ruling): report the worst fair evening's share of grown-ups out, and the mean, on every bench seed, beside R2X's (worst 48 to 54%, mean 76 to 77%); R3X keeps the worst from falling.
5. **Variety**: show that the Merchants' wants (Food 5, Wares 3, Treats 3) and the Patrons' (7, 5, 5) can be met by masters, specialties and trade with no good the Ledger has to wire: a static check of which flavors can reach each family and from where (base goods, masters' goods by their families, specialties, neighbors' lists), and the most a bench town reaches by day 70 and in a year. Those tiers come in I4 and I5, so this is a content and bench reading.
6. **Health kinds** (`view/health.ts`): a supplied piece that can never be supplied; a master's good with no shelf to sell from; a Town Book page or hint content cannot produce; the fourth gap under both rules (`gap-unmeetable`, `gap-dead-end`). Quiet on a sensible 70-day run once R3A to R3C land, or each flag explained for R3X.
7. **The lanes test stays enforced** on every bench seed: supplies move draws, and since R2X draws move growth past 16 households, so report each seed's figure and never loosen the bar.
8. **P3A's finding**: at Village rank households with savings missed meals on 20 to 48 of 70 days while food stood on the shelves (prices against wages); P3A fixes it on `main`. Keep the audit's flag for it (add one if P3A did not: a household with savings and food in reach that goes hungry), and report it on every bench seed. **R3H's levels**: report the first climb of a specialized building by day and kind on every seed.
9. **R2X's misses, measured** for R3X: a third of households Craftsfolk by day 70 (held on 1 of 4 seeds; day 70 is a winter), gardens behind rows (0 to 4 a seed), Treats in autoplayed towns, Village debt against the credit line; and the grown fixture: `npm run fixture:grown -w @qoti/client` lands at 108 residents under `grownFixture.test`'s floor of 130: pick a new seed or day count in `grow-fixture.mjs` (R3X regrows it on the merged wave).
10. **The targets table and year view** gain R3's columns: lanterns lit (share, and in winter), candles and firewood drawn by places, fourth-kind gaps opened and closed, masters (first day, count, by trade), masters' goods sold, pages found by kind and seat, callings; extend `npm run targets`, never a second table.
11. **Bench scenes** (`npm run bench`): the 17:30 settling and the walk at City scale, the masters' day, the Town Book's evening close, the thread counts, the specialized buildings' day (R3H); gaps, supplies, masters and the Town Book under 1 ms an hour together (`22-quality.md`); R3A to R3D's and R3H's lines join through your scene list, one sorted line each. Merge `main` often: P3A changes the levels and growth passes your advisors drive.

## Acceptance criteria

- [ ] The lanes test passes on every bench seed, and the worst fair evening's share does not fall below R2X's, or each failing seed is measured and explained for R3X.
- [ ] The outcome tests pass, or each miss is explained with its measured number and the cycle it needs.
- [ ] The R3 health kinds flag their cases in unit tests and stay quiet on a sensible run.
- [ ] The variety check prints, per family, what can reach the Merchants' and Patrons' wants and from where.
- [ ] The R3 lines hold their budget; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests, build and bench pass.

## Out of scope

Changing a system to make a number pass (report it to R3X); the interface (R3D, R3G); the rules behind supplies, masters and pages (R3A to R3C).

## Notes

- Variance between runs is large (R1X, R2E): read every target over several seeds and runs; the container's timings swing by half, so medians. Known noise: the bench line "growth night R1B" swings around its 2 ms budget, and `street.test.ts` "runs in well under 2 ms" failed once at 6.06 ms against 6.
- Arrivals have their own generator since R2X; the schedule still shares the `residents` stream, so seed-specific assertions can still move: report them with measurements.
- Runs as the build and review loop (`31-parallel-development.md`); the dead-end hunt is this cycle's own product, so run it on every round.

## As built

Built on `cycle/r3e-bench` (PR #64, into `cycle/r3x-integration`) as the build and review loop: Sonnet executors in their own worktrees, only their own commits cherry-picked, then the master's checks, the dead-end hunt and a bisect.

- **The advisors** (`tools/bench/src/advisors/lamps.ts`, Hearth, slot 63; `supplies.ts`, Ledger, slot 42).
  - Lamps sends only `place.setPriority`. When candles fall short of the lanterns, it keeps the busiest places and rests the far, quiet ones, and it puts a rest back to normal once the candles cover every lantern. It leaves a place alone for four days after a change.
  - Lamps also holds the Hearth's gates (`candlesAllow`, `firewoodAllows`, `specialtyNear`), which `hearth.ts`, `places.ts` and `together.ts` ask.
  - Supplies pins hives and a chandler, adds a forester's lodge from autumn while Fuel stands under the winter mark, switches the carrier to buy for places above the repayment reserve plus 150 coins, and cobbles a master's front tile for level 3.
- **Softeners, because R3's systems were placeholders while this was built.** Every lantern is lit and nothing burns, so each gate and pin only cost growth.
  - Up to 16 lanterns and 3 braziers are always allowed.
  - The candle gate stands down while more lanterns are lit than the stock could light.
  - The candle chain waits for 80 residents (`CANDLE_POP`); the chandler also waits for 4 honey in town. Pinned at 60, the hive and chandler took two plain trades from birch's town of 68, and its Craftsfolk at day 70 fell from 38% to 27%; a bisect found those two pins together to be the whole cause.
  - A spare trade needs three businesses before a pin takes one.
  - R3X tunes these against R3A's real draw. The chandler's 6 candles a day (`CHANDLER_DAILY`) is a guess.
- **The bench's report.**
  - Outcomes: R3's rows sit in `r3Outcomes.ts`, for both profiles, with the two scripted scenes (candles for half, a departed master). `npm run outcomes` runs R2's rows and R3's.
  - The per-seed report: `r3Report.ts` (`npm run r3report`).
  - The variety check: `variety.ts` (`npm run variety`).
  - R3's columns in `targets.ts` and `yearRow.ts`.
  - R3's bench scenes: `r3.bench.ts`, a sorted list R3A to R3D and R3H join.
- **The evening goal** holds each bench seed's worst fair evening to its figure before R3 (`EVENING_BASELINE`: birch 58, hazel 48, oak 56, willow 54) and reports the mean beside it. The spec keeps the worst from falling; no ruling holds the mean.
- **Health kinds** `supply-unsuppliable`, `master-good-unsold` and `page-unproducible` are in `view/health.ts`, with their content-only checks in `view/healthR3.ts`; the fourth gap reaches `gap-unmeetable` and `gap-dead-end` through `supplyGapAchievable` and `supplyGapClosable`.
- **The newcomer profile** is a parameter (`profile.ts`, P3A's `AutoplayOptions.newcomer`, copied word for word). `NEWCOMER_LIVE` stays false until P3A (#61) merges into `main`; until then the newcomer rows equal the tuned ones.
- **The golden year** (`packages/sim/test/golden/r1-year.json`) is re-recorded, because the autoplayer now plays the new advisors.
- **The grown fixture script** (`apps/client/scripts/grow-fixture.mjs`) uses seed rowan for 70 days, which gives 141 residents.
