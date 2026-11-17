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

- [x] The lanes test runs on every bench seed, prints its table and fails past three quarters of residents or half the Craftsfolk (a unit test feeds it a failing table).
- [x] The outcome tests pass, or each miss is explained with its measured number for R2X (`npm run outcomes`, below).
- [x] The new health kinds flag their cases in unit tests and stay quiet on a sensible run (on stand-ins, and with R2A to R2C merged: below).
- [x] A 2,000-resident evening and the place pass hold their budgets (on stand-ins; the evening without its fixture's porters, below); a year hashes the same in Node and a browser worker.
- [x] R1F's `r1 growth night` (`tools/bench/src/r1.bench.ts`), moved to R2 by the owner (2026-11-15), under 2 ms on a reference laptop (2.45 to 2.56 ms in the build container at R1's end, 1.67 and 1.82 ms on R1X's final build; the container swings by half from run to run). Hot spots left: `townStock` and the night's census, `craftPull` reading the served lists twice a night, the `persist` signature rebuild.
- [ ] Typecheck, lint, unit tests, build and bench pass. All but one unit test: oak's Village run has one lean day (below).

## Out of scope

Changing a system to make a number pass (report it to R2X); the interface (R2D); R3's supplies and masters.

## Notes

- R1X's lanes record: the Hearth-off towns ended with 93 to 187% of the residents (no Craftsfolk), the Ledger-off ones 18 to 26%; the both-lanes Ledger took up to 142 decisions in 70 days. The enforced test fails until the evening round gives places their pull: report each seed's figure, never loosen the bar.
- Variance between runs is large (R1X): read every target over several seeds and runs.
- From P2: tuning starts from R1X's numbers (P2 left them as they were); P2's table for the switched-off midday growth pass (`docs/build/cycle-p2-playtest.md`, As built) is there if a tuning round wants to try it (`GROWTH_MIDDAY`).

## As built (2026-11-16)

Built as the build and review loop: seven executor tasks (E1 the places advisor, E2 the shops advisor and garden lots, E3 the health kinds, E4 the lanes test and targets, E5 the bench scenes, E6 the outcome report, E7 streets and the block), then the master's rounds of the dead-end hunt. Everything here reads live state and runs on R2.0's stand-ins; the trial merges below show what moves at R2X.

**The autoplayer** (`tools/bench/src/advisors/`):

- `places.ts` (Hearth lane, slot 62): seats at one for every four grown-ups (`GROWNUPS_PER_SEAT`, counted from decor seats and hosts, or live `placesView` once places exist), a row of two to four benches for three or more homes with no seat within 8 tiles, a Corner Cafe or a served pair of benches by an outlet, the tavern where folk live (moved here from the village advisor through the shared `siting.ts`), a well for four or more homes with none in reach, a brazier beside the two busiest open-air spots in autumn. It waits while the town owes the bank; three commands a visit at most.
- `shops.ts` (Ledger lane, slot 22): `walkFrontage` ranks the Shops bar's frontage by `footfallEve` and the live places near it (an unserved place pulls three times as hard); a place with 8+ visitors two evenings running and nothing to sell gets shops painted beside it; an evening street on a busy stretch of up to 8 tiles near a place, never a bridge, a dead end or a stretch a workshop, stall or specialized building fronts, with a way round at most twice its length plus 10 (three in town). On stand-ins it sends nothing and the land advisor replays as before.
- Streets for R2F's rows (`land.ts`, `village.ts`, `rows.ts`): the village street and later shop or townhouse streets are `street` class once Cobbles opens (willow day 10, hazel 6, oak 12, birch never: no quarry reaches 20 stone a day there), cobbled later if laid as lanes; one closed block (an 11 or 13 tile ring) at the village core, zoned inside with townhouses (and shops nearest the village street), so rows close a hollow into gardens. The Hearth keeps its beds out of a walled-in hollow.
- Garden lots (`town.ts`: `isGarden`, `growableLots`): never zoned, grown, counted or offered by the autoplayer, the land advisor's offered-lot check, the far and unreached lots, the growth lines and the R1 bench counts.
- Dead ends the hunt found in the autoplayer, each with a class check: a service sent to a spot nobody can walk to, twice a day for days (willow's tavern from day 30: no Craftsfolk came; hazel's well): `findSpot` and the service siting skip what `build.place` refuses as `CUT_OFF`, and the audit fails any command refused on five separate days (`stuckCommands`); a second well four tiles from the first (ash, elm): every spot keeps the sim's `service-clustered` rule (`clearOfKind`); a second tavern started on credit in winter whose brick never came (elm): imported Materials wait for coins in hand (the carrier buys a site's Materials from coins in hand only) and for spring; a garden bed cut off (yew) or stalled 48 hours (hazel on R2A's branch): beds go only where folk can reach them, and from Village rank the Hearth puts a stocked site of its own first after half a day, the audit failing a Hearth site left a working day un-nudged (`HearthSites`; in a Hamlet the homes go first: nudging beds there cost hazel a lean day, and one bed at a time left oak's Charter at day 58); a garden bed sent into lean times on five days (ash): the planner sends no `build.place` in lean times.

**The bench**: `npm run lanes` enforced (`lanesVerdict`, exit 1); `npm run outcomes` (`--strict` or `OUTCOMES_STRICT=1` exits 1 on a MISS; each row names the cycle its number needs); the targets table and the year view in the evening's terms (share out, the average evening, places and seats per 100 grown-ups, Treats on the round, gaps opened and closed by seat, the Hearth's decisions, Cobbles day, row lots, rows, gardens, corners, R1's Craftsfolk lines as PASS/FAIL); `r2.bench.ts` (`R2_SCENES`, one sorted line each for R2A's and R2B's scenes).

**Health kinds** (`view/health.ts`, tests in `test/r2e/health-r2.test.ts`): `gap-dead-end` (an open gap no placement near it could close, a day), `place-unreachable` (a built place no home door can walk to, a day; the skating ice, found at bank tiles all along the river, is passed by), `treats-unsold` (an outlet with Treats whose places had visitors and sold nothing a season of evenings; evenings with no visitors do not count), `tier-unreachable` (a gate above the best evening content allows, or no seat open at the tier's rank), `garden-grown` (at once). The demand check skips garden lots by kind. R2C's branch adds its own `gap-dead-end` (content-level, `gapAchievable`) in the same file: R2X keeps both rules under the one kind, or one.

### Numbers on stand-ins (this branch, final build)

The lanes test (70 days; residents and Craftsfolk households, percent of the both-lanes town):

| Seed | Both | Hearth off | Ledger off after founding | Ledger, Hearth decisions |
|---|---|---|---|---|
| willow | 111, 0 | 191 (172%), 0: FAIL | 31 (28%), 0 | 119, 593 |
| hazel | 116, 0 | 198 (171%), 0: FAIL | 24 (21%), 0 | 132, 938 |
| oak | 110, 0 | 159 (145%), 0: FAIL | 29 (26%), 0 | 110, 683 |
| birch | 73, 0 | 108 (148%), 0: FAIL | 23 (32%), 0 | 82, 569 |

The targets (70 days, every system on; the evening columns read '-' on stand-ins):

| Seed | Village | Residents at 40, 70 | Ledger decisions | First Craftsfolk | Craftsfolk at 70 (best) | Lean days | Owed at 70 |
|---|---|---|---|---|---|---|---|
| willow | day 29 | 86, 113 | 108 | day 33 | 21% (24%) | 0 | 2,034 |
| hazel | day 17 | 83, 146 | 132 | none | 0% | 0 | 2,663 |
| oak | day 40 | 63, 116 | 110 | day 49 | 0% (3%) | 1 | 2,242 |
| birch | day 28 | 56, 73 | 72 | day 39 | 15% (19%) | 0 | 1,264 |

The audit passes (no dead-end flag, no stuck command, no Hearth site stalled). The five-seed year (willow, hazel, ash, elm, yew) has one flag, explained: `demand-unanswered` on elm, the Homes bar lit while the treasury sat at 12 to 43 coins and no street could be paid for; the same flag stands on the wave's base (`99eed98`, yew), so it is the Village debt R2X tunes, not this cycle's. One unit test fails: `autoplay.test.ts`, oak's Village run, with one lean day at 70 (R1X's own table allowed a lean day on a seed; every variant of the Hearth's sites compared moved a lean day or a Charter on some seed, and R2A's round reshuffles the seeds again).

### The trial merge: this branch with R2A, R2B, R2C and R2F (what moves at R2X)

A scratch merge, never pushed (conflicts taken as ours: docs, `r1-year.json`, and R2C's `gap-dead-end` in `health.ts`; R2B's `test/r2b/shops.test.ts` fails typecheck against R2F's `Lot`). The lanes test:

| Seed | Both | Hearth off | Ledger off | Ledger, Hearth decisions |
|---|---|---|---|---|
| willow | 149, 5 | 164 (110%), 0: FAIL | 32 (21%), 0 | 114, 491 |
| hazel | 151, 8 | 204 (135%), 0: FAIL | 23 (15%), 0 | 143, 990 |
| oak | 113, 4 | 63 (56%), 0: PASS | 26 (23%), 0 | 133, 787 |
| birch | 81, 2 | 124 (153%), 0: FAIL | 22 (27%), 0 | 101, 701 |

The evening round gives the Hearth its first pull on growth (oak's Hearth-off town at 56%; with R2A to R2C alone, willow's at 66%), and the Craftsfolk are now the Hearth's on every seed; three seeds still fail on residents. The targets:

| Seed | Out (mean, last) | Average evening | Seats per 100 grown-ups | Places | Treats on the round | Gaps opened, closed | First Craftsfolk | Craftsfolk at 70 | Row lots, rows, gardens, corners | Lean days |
|---|---|---|---|---|---|---|---|---|---|---|
| willow | 70%, 45% | 46 | 120 | 52 | 88% | 9, 0 | day 45 | 0% (4%) | 16, 6, 0, 1 | 1 |
| hazel | 70%, 58% | 48 | 145 | 79 | 83% | 6, 1 | day 41 | 7% (14%) | 4, 4, 0, 0 | 7 |
| oak | 62%, 35% | 54 | 117 | 52 | 94% | 3, 1 | day 44 | 2% (8%) | 2, 2, 0, 0 | 0 |
| birch | 76%, 68% | 56 | 176 | 56 | 97% | 6, 0 | day 53 | 3% (7%) | 0 | 0 |

The outcome report there: out on a fair evening 74 to 77% on average, worst evening 45 to 46% (target every grown-up with a place in reach: MISS, R2A); places never fill past their room (0 overflows in 9,000 place-hours: PASS); Treats on the round 88% and 83% (PASS); first Craftsfolk day 45 and 41 (MISS by days, R2B's tiers); gaps open but rarely close (willow 6, 2 and 1 of the three kinds opened, none closed; hazel's shop nobody passes closed once and credited a seat: R2C, and shops that do not grow where places want them: R2B); a town with no places is never seen (a place stands every evening once the well is up: N/A); carts keep off an evening street at 1.26 times their free-flow time (PASS), and a cart with no way round is neither delivered nor parked by 23:00 (MISS, R2B). With R2F, the Ledger's street grows rows (willow 16 row lots in 6 rows, the longest 5, one corner) and the closed block got gardens on willow (4) and hazel (2) in E7's runs, none in the final trial (the block comes late, day 48 on willow, and oak and birch never lay one: oak's coins, birch's Cobbles). The audit there: `treats-unsold` on willow's stall (visitors at five places, nothing sold a season: for R2B) and two garden beds on oak walled in after they were placed (`site-cut-off`, then `site-stalled`): placed reachable, then closed in, most likely by R2F's rows growing across their step; for R2X with R2F.

### Budgets (in this container; it swings by half from run to run, so medians)

| Line | Runs | Median | Range | Budget |
|---|---|---|---|---|
| `r1 growth night` (R1F's stricter scene) | 11 | 1.75 ms | 1.60 to 1.85 | 2 ms: under in every run |
| `growth night` (R1B) | 11 | 1.89 ms | 1.18 to 2.41 | 2 ms: over in 4 runs |
| `carrier R1A` | 6 | 0.36 ms | 0.32 to 0.49 | 0.5 ms |
| `r1 carrier day` | 11 | 0.43 ms | 0.38 to 0.64 | 0.5 ms |
| `r2 places` Village and City (stand-in pass) | 6 | 0.000 ms | to 0.002 | 1 and 3 ms |
| `r2 round planning` (17:00 to 17:30 less 16:00 to 16:30) | 11 | about 0.27 ms | 0.21 to 0.36 | 0.4 ms |
| `r2 evening`, 2,000 residents, pipeline less logistics, average | 6 | 1.50 ms | 1.45 to 1.59 | 4 ms |
| the same with the fixture's logistics (reported) | 6 | 6.52 ms | 5.85 to 6.76 | 4 ms |
| `r2 gaps` (stand-in) | 6 | 0.000 ms | | 1 ms |

The planning line is R1's leisure code on stand-ins, already two thirds of its budget; R2A's round adds to it. The evening is enforced without the flat fixture's porters (`assign`, `findRelay`, `matchPorters` average 3.5 to 5 ms a tick there, R1's fixture, not R2). Speed-ups for the growth night, hash for hash, in other cycles' files (E5's profile at a 100 microsecond interval): remember "any room" per def beside the kept lists in `systems/growth/site.ts` (0.15 to 0.2 ms), share recalled lists instead of `slice()` (0.05 to 0.1), per-def flags for the census in `growth/defs.ts` (0.1), check the signature once a night (0.03), patch the signature instead of rebuilding it at `persist` (0.03): together 0.3 to 0.4 ms off the 1.75.

### Edits outside the owned paths

`packages/sim/src/index.ts`: read-only exports for the bench (`findGap`, `sellsTreats`, `treatsOnShelf`, `pathFor`, `PathMode`, `placeById`, `placeDraw`, `placesNear`, `placeServes`, `invalidatePlaces`, `placeIndex`, `streetTiles`, `townReachesDoor`). `packages/sim/test/golden/r1-year.json`: regenerated (the autoplayer's year). `CHANGELOG.md`, `docs/build/README.md`: one line each.

