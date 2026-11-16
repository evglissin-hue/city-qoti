# R2B: Evening trade

**Iteration**: R2 The evening round. **Wave**: parallel. **Branch**: `cycle/r2b-evening-trade`, from `cycle/r2x-integration`; PR into `cycle/r2x-integration`. **Recommended effort**: xhigh.
**Depends on**: R2.0. **Runs alongside**: R2A, R2C to R2F, and V3's wave. **Ports**: client 5232, relay 8842.

## Goal

The round is the Ledger's second flow. Treats are bought where folk stop, shops are zoned and level up by who walks past, a busy shop puts tables out and becomes a cafe, and carts keep off evening streets. Dusk runs at half speed. Each resident's evening gets a score, the evenings need replaces beauty in mood and the tavern's social need, and the tiers ask for it: a flower by the door no longer opens Craftsfolk, a place with a seat in reach does.

## Read

- `CLAUDE.md`; `docs/build/r2-wave-notes.md` (ownership by file: you share `systems/residents` and `systems/market` with R2A)
- `docs/spec/19-evenings.md`: The day in two acts, Evening trade, Good evenings, Evening streets, the R2 acceptance
- `docs/spec/13-ledger.md`: Households, Population tiers, Levels (custom), Streets and traffic, Demand (Shops) and the [R2] notes; the As built (R1X) notes and What holds
- `docs/spec/11-residents.md`: Needs (Evenings), the bond [R2]; `docs/spec/14-challenge.md`: the [R2] note (winter evenings)
- `docs/spec/20-architecture.md`: R2 contracts; `docs/spec/22-quality.md`: the R2 budgets

## You own

The R2B paths in `r2-wave-notes.md`: `systems/market/{baskets,round,api}.ts`, `systems/residents/{evening,needs,shopping,shops,life}.ts`, `systems/services/**`, `systems/tiers/**`, `systems/growth/{desirability,bars,outlets,cafes}.ts`, `systems/levels/**`, `systems/logistics/**`, `systems/traffic/**`, the `road.setEvening` handler in `commands/road.ts`, `sim/turn.ts` and `speed.ts`, content `baskets.ts` and the trade, need and good-evening sections of `content/places.ts`, and their tests (`packages/sim/test/r2b/**`).

## You can rely on

- R2.0's contracts and stubs: `Resident.evening` (`ResidentEvening`), `Resident.round` (RoundFlags), `EveningsState.tonight` (`scoreSum`, `treatsAtStops`, `treatsPassing`, `treatsDoorstep`, `takings`, `weather`), `NeedsBasket.evenings` (Craftsfolk 50 in the data), the `evenings` need (NEED_IDS' last; `eveningsNeed`, `EVENINGS_NEED`), `settings.eveningLingers` (absent means on), `Flags.evening`, `content.places`; `eveningScore` and `closeEvening` (`residents/evening.ts`, called at 21:00), `sellsTreats`, `treatsOnShelf` (`market/round.ts`), `cafeTables` (`growth/cafes.ts`), `recordSale`, `placeById`, `placesNear`, `placeServes` (R2A's), `pathFor(..., 'barrow')` (R2A's).
- R1's businesses, levels, keepers, the carrier and baskets by family as R1X shipped them (`13-ledger.md`, As built (R1X)).

## Tasks

1. **Dusk at half speed**: from `eveningHour` to `homeHour` a turn advances `lingerPercent` of its ticks when `eveningLingers !== false`, rounded down on odd turns and up on even; the effective speed in the clock view and the top bar reads it; the night's hurry stays as built. Hashes depend on turns only, never wall clock; a save mid-evening resumes the same.
2. **Treats on the round**: Treats leave the 18:00 household pass. At a stop whose place `placeServes` (or a `shop:` stop), a resident whose household is still owed a unit buys the flavor they like best (R1A's likes), pays at the till and carries it (set `Resident.carry`, so the agent row's pose reads `carry`; set the stop's `treat` flag); a comfortable household buys one more; passing trade (`passingRadius`, one in `passingOneIn`, from the `round` stream); the doorstep errand at `doorstepHour`:`doorstepMinute` for `doorstepPercent` of what is owed (in hundredths, as the basket accrues). In a Hamlet treats are free at the shelf; money moves from Village rank with `pay()`. Every sale calls `recordSale` and counts toward the outlet's custom. Decide and record which takes first, the round or the carrier's collection of surplus (the wave notes' rule: both take from the shelf, never from `reservedOut`).
3. **Shops follow the walkers**: Shops desirability gains up to `footfallDesirability` for `footfallEve` at the frontage (full at `footfallFullPercent` of grown-ups) and `placeNearShop` for a place within `placeNearShopRadius`; the Shops bar counts each place that drew `unservedVisitors` with nothing to sell (its saved `served` 0); a shop of `cafeLevel` whose door is within `cafeRadius` of `cafeSeats` seats puts tables out (`cafeTables`, checked in the levels pass); every `stepsPerCustomer` evening steps past a door count as a customer for levels. Garden lots (`kind: 'garden'`) are never priced or offered.
4. **Evening streets**: `road.setEvening` stays validate and store (R2.0's); carts treat `Flags.evening` tiles as closed from `eveningHour` to `homeHour` and go round (one with no other way waits at the edge, and its shed says so), no cart noise falls there, carters keep the porters' hours (to 19:00), porters with barrows route with `pathFor(..., 'barrow')`; a stall or workshop on the stretch gets no delivery after 17:00 and its view says so.
5. **Good evenings**: `eveningScore` (the draw of the best stop as found, `friendScore`, `treatScore`, `secondKindScore`, less `standingPenalty`; `stayInScore` the floor and the score for staying in); `closeEvening` at 21:00 moves the need a `needStepOneIn` of the way, keeps `Resident.evening` (good evenings this season, the bond heart: `goodForHeart` of the season's evenings at `goodEvening`, once a season, up to `heartsMax`), adds `scoreSum` and the weather to the tally; an evening lost to weather does not count. In mood the need takes beauty's weight (`needWeight`) through `services/weights.ts`' `weightsOf`, never by editing `NEED_WEIGHTS`.
6. **Tiers**: a household's grown-ups average `NeedsBasket.evenings` for `tierDays` days running (Craftsfolk 50; Merchants 65 and Patrons 80 when their baskets come); charm at the door still feeds desirability and arrivals but no longer opens a tier, and the tavern leaves Craftsfolk's services (drop `charm` 25 and `'social'` from the basket then). No tier is gated by something no town can build (R2E's check reads it).
7. Tests: the money invariant through a year with evening sales; a Hamlet pays nothing; dusk on odd and even turns and across a save; four fifths of Treats on the round once three places stand (a fixture with R2A's places stubbed by hand until R2A lands); the doorstep errand in a town with no places; carts round an evening street within twice free-flow, a cart with no other way waits and delivers after 21:00, none deadlocks; the score's parts; tiers on evenings and not on charm.

## Acceptance criteria

- [ ] `grep -rn "R2 stand-in (R2B)" packages apps tools --exclude-dir=dist` is empty.
- [ ] Once three places stand, four fifths of Treats are sold on the round (headless, two bench seeds); a household in a town with no places is still sold a third by the doorstep errand.
- [ ] The first Craftsfolk household by day 40 holds on evenings of 50 in place of charm 25 (R2E's runs are the evidence). R1's Craftsfolk targets moved here by the owner (2026-11-15): R1 ended with the first by day 40 on willow only and a third of households at day 70 on no seed.
- [ ] Carts route round an evening street and arrive within twice free-flow; none deadlocks.
- [ ] The money invariant holds in every test that moves money; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.

## Out of scope

Places, the planner, routes and footfall (R2A); gaps and the edition (R2C); the cafe's drawing and every UI (R2D, V3); supplies, resting pieces and masters (R3).

## Notes

- Write the 21:00 pass against `Resident.round` fixtures and merge `cycle/r2x-integration` often; R2A fills the stops.
- Treats accrue as built (in hundredths); change the basket's numbers only in content.
- From R1X: the household loop nets the treasury nothing; evening trade moves coins inside the valley. Village debt is R2X's tuning, not this cycle's.
- Growth waits for hands (`HANDS_WAITING`, the `hands` reason); shops opened by footfall go through the same gate.
- From P2: the zone bars' reasons are P2's (`noRoad`, `outOfReach`, `unsuitable`, `materials`, `sitesBusy`, `lotWaiting` with its hour); the Shops bar's evening reasons are new codes beside them, never in their place.
