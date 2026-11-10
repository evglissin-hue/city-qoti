# R1F: The bench

**Iteration**: R1 Zones first. **Wave**: parallel. **Branch**: `cycle/r1f-bench`, from `cycle/r1x-integration`; PR into `cycle/r1x-integration`. **Recommended effort**: high.
**Depends on**: R1.0. **Runs alongside**: R1A to R1E, and V2's wave. **Ports**: client 5226, relay 8836.

## Goal

The autoplayer plays the zones-first Ledger the way a sensible player would (zone, site a dozen specialized buildings, read the five balances, answer the season card) and the bench measures what R1 promises: the decisions count, the lanes test, the tuning targets and the dead-end hunt's new checks, on every bench seed, so R1X can tune against numbers.

## Read

- `CLAUDE.md`; `docs/build/r1-wave-notes.md` (File ownership: R1F; Stand-ins: the autoplayer and audit)
- `docs/spec/22-quality.md`: The redesign (the lanes test, decisions not chores, the R1 budgets, the playability rows); Playtests; the dead-end hunt in `31-parallel-development.md` (Build and review loop, step 4)
- `docs/spec/13-ledger.md`: The five rules; Tuning targets and acceptance; The season plan
- `docs/spec/30-roadmap.md`: R1 Zones first (Acceptance)

## You own

`tools/bench/**` and `packages/sim/src/view/health.ts` (the playability audit's health kinds), with their tests (`tools/bench/src/**/*.test.ts`, `packages/sim/test/p1/health*`).

## You can rely on

- R1.0's stand-in autoplayer: zones Homes, Workshops and Farmland from the first day, sites the Hamlet's specialized buildings, sends no order, sale, calling or labor pause (its outcome tests are skipped with comments naming R1F or R1X; see the wave notes).
- The planner and advisors (`planner.ts`, `advisors/*`), HealthWatch, the year view, `npm run tune`, `npm run audit`.
- R1A's and R1B's systems as they land in `cycle/r1x-integration`; merge it into your branch often.

## Tasks

1. **Two new advisors** (one registration line each): one that zones and sites (lays streets and lanes ahead of growth, paints the zone whose demand bar is lit, places the specialized buildings a sensible player would: a Forester's Lodge by the woods, a quarry, a fishery, a windmill on open high ground, a granary and a storehouse as the town grows, a Market Square and a Trading Post at Village rank, the Sawmill and Brickworks when their innovations open), and one that tends the season plan (the winter reserve each summer, a deal when it pays, where to build first). The Ledger's advisor places no decor and the Hearth's zones nothing.
2. **The decisions count** (22-quality.md, Decisions, not chores): count the autoplayer's commands by kind; fail if the Ledger needed more than 150 in 70 days or used a pause to balance labor. Report the count in the tune table.
3. **The lanes test** (`npm run lanes -w @qoti/bench`): each bench seed for 70 days three ways (both lanes; the Hearth's advisors off; the Ledger's off after founding, the carrier on its defaults); record each one-lane town's residents and Craftsfolk households against the town played by both. R1 records it; R2 enforces it.
4. **Health kinds** (the dead-end hunt): a business a whole day without its raw good while its family's rule lets the carrier buy; a site waiting on a material nothing in the valley makes and the carrier is not bringing (R1.0's playtest found a Forester's Lodge site waiting on the very timber only it could make, and HealthWatch said nothing); a demand bar lit while no zoned land is offered for days; a specialized building whose site stopped meeting its rule; every wish, twist, guide step and story step that cannot be met (static, with R1D's check); anything removable but not rebuildable. Drop the chain economy's kinds R1.0 left (idle-for-input as written, material deadlocks of removed goods).
5. **The tune table and year view** read in the new terms: the five balances' cover, flavors on offer, demand bars, businesses by trade and level, hands in food, the carrier's in and out, the tab.
6. **Bench scenes** for R1's budgets: trade choice and growth at City scale (under 2 ms a night), the carrier (under 0.5 ms a day), as budget lines in `npm run bench`.
7. Turn the outcome tests R1.0 skipped back on with R1's targets (the first Craftsfolk by day 40 and a third of households by day 70; Village in about two evenings; a third of hands in food) where the wave's systems reach them, and leave the rest named for R1X.

## Acceptance criteria

- [ ] The decisions count and the lanes test run on every bench seed and print their tables; the decisions count fails the run above 150 or on a pause.
- [ ] The new health kinds flag their cases in unit tests and stay quiet on a sensible 70-day run once R1A and R1B land (or each flag is explained for R1X).
- [ ] `npm run bench`, `npm run audit -w @qoti/bench` and `npm run tune -w @qoti/bench` run; typecheck, lint and unit tests pass.

## Out of scope

The systems themselves (R1A, R1B), the interface (R1C), tuning numbers to targets (R1X does that against your tables).

## Notes

- The I3 lesson stands: one planner, one labor budget, one money reserve; an advisor proposes, it never builds by itself.
- Keep the bench headless and deterministic: the same seed hashes the same twice.
- R1.0's findings: on kat-1 and willow every fishery spot lies beyond the porters' 22 tiles from the starting storehouse, so the stand-in advisor never places one there (a storehouse out by the river, as the village advisor does for far quarries, is yours); birch's quarry spot runs out early ("no spot for quarry"); the spot finder already checks the woods, open ground, river and road rules the sim does not check until R1B, and `village.bench.ts` places a Sawmill off the river through `insertBuilding`, which checks no site rule.
