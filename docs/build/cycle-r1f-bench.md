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

## As built (R1F)

On the stand-ins R1.0 left (R1A and R1B had not landed when this was measured); every number below moves when they do.

**Advisors.** `advisors/land.ts` (slot 20, the Ledger) replaces the street advisor and every specialized want the hamlet and village advisors made: the first street on founding day, the zone of each lit demand bar painted along open frontage by any road within the porters' reach (several runs, about 40 tiles a stroke), a new street, as long as the treasury allows (8 to 22 tiles), when frontage runs thin, and the specialized buildings on their ground (lodge, quarry, fishery with a storehouse out toward it, a windmill on high ground, granary, storehouses, Trading Post, Market Square, Sawmill, Brickworks, Cart Shed). It sets Materials to Always when the valley cannot site a quarry or a lodge. `advisors/plan.ts` (slot 55) replaces the seasons advisor and answers the season card once a season in one `season.setPlan`. The Hearth now dresses the plain streets and, until R1B's lodge replants, plants saplings by thinning lodges (nature advisor); the village advisor keeps services. The planner places an essential site short of its goods when the carrier may bring them (rule 3). Trimmed chores: the Hearth asks and sketches from its own seat (seat 1), commissions not taken are left to lapse, the money levers rest three days, loans come in 600s, the watch budget and posture have slack.

**Decisions count** (`npm run lanes`, both lanes, 70 days, limit 150, no pause, no Ledger decor, no Hearth zoning): willow 97, hazel 116, oak 80, birch 20, all PASS. About 20 of willow's are the stand-in lodge (build, retire, raise) and go with R1B's replanting.

**Lanes test** (residents at day 70 and percent of the both-lanes town; Craftsfolk households are 0 in every run):

| seed | both | Hearth off | Ledger off after founding |
|---|---|---|---|
| willow | 70 | 112 (160%) | 23 (33%) |
| hazel | 99 | 102 (103%) | 21 (21%) |
| oak | 63 | 110 (175%) | 27 (43%) |
| birch | 13 | 14 (108%) | 14 (108%) |

The Ledger lane is needed (Ledger off ends at a fifth to two fifths); the Hearth lane is not yet (R2's evenings are what make it so). Run-to-run spread is wide: the stand-in Village economy runs into debt from about day 40 (wages outrun sales while no Wares or Treats are sold, Fuel is imported all year), and a town in debt lays no lane.

**Health kinds** (`view/health.ts`): `business-short`, `site-unsupplied`, `demand-unanswered`, `site-rule-broken` (woods, open ground, road), `guide-dead-end`, `story-dead-end`; `idle-for-input` and `material-deadlock` are gone. `npm run audit` passes; what it still sees is printed as explained (`EXPLAINED` in `audit.ts`, marked `R1 stand-in (R1X)`): lodges outgrowing their woods (R1B) and a bar unanswered while the treasury is in debt (R1X). Two flags it found were fixed: an outpost storehouse with no road at its door, and short paths skipped for buildings whose site rule wants a road.

**Bench.** `r1 growth` (City rank, 2,000 residents) measures 10 ms a night against 2 ms and `r1 carrier` 7 to 11 ms a day against 0.5 ms, both on the stand-ins (the carrier's `tradingPost` and `carrierTerms` scan the buildings once per unit). They print as recorded and fail only with `BENCH_R1_STRICT=1` until R1X.

**Outcome tests.** Back on: growth without dead ends (willow, hazel, 18 days), the Village by day 37 (both reach it by day 19), lives and stories (hazel, 40 days), festivals every season, the high street's homes. Skipped with their owner: the Village's books with no lean times and oak's 70-day Village (R1X), the guide's eight steps by day 6 (R1D's letters, R1B's first workshop), the Hamlet's food and treasury band (R1X). Not met on the stand-ins, for R1X: the first Craftsfolk by day 40 and a third by day 70 (no Wares or Treats on any shelf: no workshop trade grows, and the stand-in carrier's reserve for a tier not yet in town is zero; also savings, a tavern in reach), and a third of hands in food (16% to 36%).

**For R1X.** The tune now prints a Ledger view (cover and flavors by family, the four bars, businesses by level, hands in food and hauling, the carrier, the tab), a Businesses line and a Next tier tally; read the Next tier line first. The Hearth's refused commands are high (hundreds of saplings refused on hazel), which goes with the sapling stand-in. Birch grows to about 15 residents: no quarry spot within reach of its deposits, and the Materials rule on Always buys no stone while timber covers the family reserve, so growth never gets a site started (R1A's carrier by flavor, R1B's starting sites).
