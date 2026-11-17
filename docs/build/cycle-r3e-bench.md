# R3E: The bench

**Iteration**: R3 Masters and the Town Book. **Wave**: parallel. **Branch**: `cycle/r3e-bench`, from `cycle/r3x-integration`; PR into `cycle/r3x-integration`. **Recommended effort**: high.
**Depends on**: R3.0. **Runs alongside**: R3A to R3D, and V4's wave. **Ports**: client 5245, relay 8855.

## Goal

The autoplayer plays R3 the way a sensible pair would (the Hearth keeps its best places supplied and composes places beside the trades that could make a page; the Ledger makes what places burn, lets the carrier buy for places when it can afford to, and keeps its masters' businesses fit for level 3), and the bench measures what R3 promises: the R3 outcome tests, the R3 health kinds, the Merchants' and Patrons' variety wants, the lanes test still enforced, and the budgets, so R3X can tune against numbers.

## Read

- `CLAUDE.md`; `docs/build/r3-wave-notes.md`; R2E's and R2X's As built (`docs/build/cycle-r2e-bench.md`, `cycle-r2x-integration.md`: what the autoplayer and the audit became)
- `docs/spec/22-quality.md`: The lanes test (R2X's record), the R3 budget row, Playability from the redesign [R3]; `docs/spec/31-parallel-development.md`: Build and review loop, step 4
- `docs/spec/19-evenings.md`: Supplies, Masters, The Town Book, the R3 acceptance; `docs/spec/30-roadmap.md`: R3 (Acceptance)
- `docs/spec/13-ledger.md`: Population tiers (Merchants and Patrons), Households (variety); `docs/spec/15-progression.md`: Achievements, Callings

## You own

`tools/bench/**` (advisors, `lanes.ts`, `tune*.ts`, `targets*`, `outcomes.ts`, `audit.ts`, `autoplay.ts`, new `r3.bench.ts`) and `packages/sim/src/view/health.ts` (the audit's kinds; R3.0 wired the `shortOfSupplies` case to R3A's rule), with their tests (`tools/bench/src/**/*.test.ts`, `packages/sim/test/p1/health*`, new `packages/sim/test/r3e/**`).

## You can rely on

- R2E's advisors (places, shops, streets and the closed block), `npm run outcomes -w @qoti/bench`, the lanes test enforced (`lanesVerdict`), the targets table and the year view, HealthWatch with R2's kinds and R2X's `gap-unmeetable` and `building-cut-off`, stuck commands and stalled Hearth sites; R2X's tuning (newcomers follow good evenings).
- R3.0's contracts and views (supplies, lanterns, masters, the Town Book, the Thread); R3A to R3D as they land: merge `cycle/r3x-integration` often.

## Tasks

1. **The Hearth's advisor keeps places alive**: priorities (keep the busiest places, let the far ones rest when candles are short), lanterns only where candles allow, a brazier fed in winter where firewood is above its mark, and places composed beside trades that could make a page (a pair from content's Town Book table, near a business of that trade). It never zones, sets a carrier rule or places a business.
2. **The Ledger's advisor makes what places burn**: hives where flowers allow and a chandler in reach of honey, firewood above the winter mark, the carrier switched to buy for places when the treasury allows and off when the town owes, and a master's business kept staffed with a street good enough for level 3. It places no decor and sets no priority.
3. **R3 outcome tests** (headless, two bench seeds, in `npm run outcomes`, each row naming the cycle its number needs): with candles for half the lanterns, the places kept first are lit and the rest rest, and nothing breaks; the first master in the first Village year; a master's good reaches a shelf; a departed master's good stops; six Town Book pages found by the two seats and one calling earned; the fourth gap opens, closes and credits.
4. **Variety**: show that the Merchants' wants (Food 5, Wares 3, Treats 3) and the Patrons' (7, 5, 5) can be met by masters, specialties and trade with no good the Ledger has to wire: a static check of which flavors can reach each family and from where (base goods, masters' goods by the families R3.0 gave them, specialties, neighbors' lists), and the most a bench town reaches by day 70 and in a year. Those tiers come in I4 and I5, so this is a content and bench reading, not a tier in play.
5. **Health kinds** (`view/health.ts`): a supplied piece that can never be supplied; a master's good with no shelf to sell from; a Town Book page or hint content cannot produce; the fourth gap under both rules (`gap-unmeetable`, `gap-dead-end`). Quiet on a sensible 70-day run once R3A to R3C land, or each flag explained for R3X.
6. **The lanes test stays enforced** on every bench seed: supplies move draws, and since R2X draws move growth past 20 households, so report each seed's figure and never loosen the bar.
7. **The targets table and year view** gain R3's columns: lanterns lit (share, and in winter), candles and firewood drawn by places, fourth-kind gaps opened and closed, masters (first day, count, by trade), masters' goods sold, pages found by kind and seat, callings; extend `npm run targets`, never a second table.
8. **Bench scenes** (`npm run bench`): the 17:30 settling and the walk at City scale, the masters' day, the Town Book's evening close, the thread counts; gaps, supplies, masters and the Town Book under 1 ms an hour together (`22-quality.md`); R3A to R3D's lines join through your scene list, one sorted line each.

## Acceptance criteria

- [ ] The lanes test passes on every bench seed, or each failing seed is measured and explained for R3X.
- [ ] The outcome tests pass, or each miss is explained with its measured number and the cycle it needs.
- [ ] The R3 health kinds flag their cases in unit tests and stay quiet on a sensible run.
- [ ] The variety check prints, per family, what can reach the Merchants' and Patrons' wants and from where.
- [ ] The R3 lines hold their budget; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests, build and bench pass.

## Out of scope

Changing a system to make a number pass (report it to R3X); the interface (R3D); the rules behind supplies, masters and pages (R3A to R3C).

## Notes

- R2X's record: past `growthFreeHouseholds` (16) households homes come only as fast as fair evenings send folk out, which is why the lanes test passes; a town short of candles has darker evenings and moves it.
- The audit has two gap kinds since R2X: `gap-unmeetable` (the kind cannot be met at all, `gaps/achievable.ts`) and `gap-dead-end` (nothing could close it where it stands, `gapClosable`); keep both, and keep `building-cut-off`.
- Variance between runs is large (R1X, R2E): read every target over several seeds and runs; the container's timings swing by half, so medians.
- Arrivals have their own generator since R2X, so new evening behavior no longer moves who arrives; the schedule still shares the `residents` stream, so seed-specific assertions can still move: report them with measurements.
- Runs as the build and review loop (`31-parallel-development.md`); the dead-end hunt is this cycle's own product, so run it on every round.
