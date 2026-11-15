# R1A: The economy core

**Iteration**: R1 Zones first. **Wave**: parallel. **Branch**: `cycle/r1a-economy-core`, from `cycle/r1x-integration`; PR into `cycle/r1x-integration`. **Recommended effort**: xhigh.
**Depends on**: R1.0. **Runs alongside**: R1B to R1F, and V2's wave. **Ports**: client 5221, relay 8831.

## Goal

The town's goods behave as `13-ledger.md` says: households buy by family and count variety, prices follow cover, tiers move on amount and variety, and the carrier imports any shortfall and sells any surplus by itself, within the rules, reserves and budget the Ledger sets and within what it can carry, with essentials always carried on the County tab and nothing coming while the pass is closed. A business short of its raw good is never stuck while its family's rule lets the carrier buy.

## Read

- `CLAUDE.md`; `docs/build/r1-wave-notes.md` (all of it: ownership, stand-ins, handshakes)
- `docs/spec/13-ledger.md`: Goods: families and flavors; Households: amount and variety; Market and prices; The carrier and trade; Budget; Population tiers; The season plan (the marks); Tuning targets
- `docs/spec/20-architecture.md`: R1 contracts
- `docs/spec/14-challenge.md`: the [R1] notes (the closed pass, Prepared has a number)
- `docs/spec/archive/13-ledger-chains.md`: Market and prices, Trade (drift, impact), Budget (loans, the credit line) for the fine print that is kept

## You own

The R1A paths in `r1-wave-notes.md` (File ownership): `systems/{carrier,market,tiers,trade,dock,warmth,loans}`, `systems/economy/{index,emit}.ts`, `view/balances.ts`, `view/village.ts`, content `goods`, `baskets`, `neighbors`, `commissions`, `charters`, and their tests.

## You can rely on

- R1.0's contracts and stand-ins: `state.carrier`, `state.seasonPlan`, `BalancesView`, `carrier.*` and `season.setPlan` handlers, `carrierDay` (the peddler mapped onto families), baskets by family with every flavor weighing 1, tiers reading amount only, `applyRankDefaults` at the claim.
- The money invariant helpers (`book`, `pay`, `test/money.ts`), the market's price rule, neighbors' drift and impact, the bank's loans and credit line, the warmth pass, spoilage.

## Tasks

1. On day one, move `balancesView` from `view/zones.ts` into `view/balances.ts` (leave a re-export; R1B does the same for its two builders).
2. **Baskets and variety**: buy by family as built (Food on the shopping outings, Fuel at the 07:30 warmth pass, Wares on the same trip as food, Treats at the 18:00 pass), choosing within a family by price and liking (Thrifty weighs price more; species and traits have favorites); track each household's flavors on offer over the last three days (an optional `Household` field, additive); the `goods` need is the basket's average of amount and variety against the tier's wants and weighs 10 from Village rank. A newly opened tier with no household yet counts one household in ten as if it had (for the reserve and for R1B's need term).
3. **Tiers by amount and variety** (13-ledger.md, Population tiers): no tier names a good; a town with no windmill reaches Craftsfolk on porridge, fish and cheese.
4. **The carrier** (the whole section): the fixed buying order (Food, Fuel, Materials a site waits for, raw goods a business is resting for, Wares, Treats), the three rules with Essentials as written, selling over twice the reserve (never what a festival put by, nothing under a winter mark from Summer day 4 to the thaw), which goods (a flavor some tier still lacks first, then the cheapest; selling the flavor held most), the budget, the County tab (5% a season like a loan, capped at `TAB_PER_RESIDENT` coins a resident), terms by what stands (the peddler, a Trading Post by rank and carts, the boat every 3 days from a River Dock, 120 units at 110%/92%), the closed pass (snow closes the valley road 1 to 3 winter days, forecast on the season card; R1A adds it to the weather's events with C5A's odds), deals (each season a neighbor offers terms for one family, `carrier.offers`, taken by `season.setPlan`'s `deal`), and from Autumn day 4 buying toward the plan's marks when the rules allow. Price cap: while the carrier runs for a family, a good's price cannot pass the carrier's price by more than a tenth.
5. **A business asks the carrier before it rests**: production (R1B's file) calls your API when a business is short of its raw good; the carrier brings it next morning within its rule (`carrierBrought`, `familyCover`, `flavorsOnOffer`, `winterMark`: the cross-track API in the wave notes, stubs from R1.0).
6. **The Balances view** in full: amount, variety (flavors on a shelf in reach of some home over three days), the price as the average of flavors weighted by what was bought, carried in and out, a year's history (state you add, optional and additive).
7. **Content**: neighbors' lists by family (every family has a seller; no tier names one good), commissions asking goods from the list, the Village Charter's food goal as "5 days of Food with 3 flavors" (with R1D's count), base prices and basket numbers as `13-ledger.md` marks them *(tune)*.
8. Tests: the money invariant through a year with the carrier, the tab and a deal; the buying order; Essentials; the closed pass; selling never under a mark; tiers by amount and variety; a town with no windmill reaching Craftsfolk in a headless run.

## Acceptance criteria

- [ ] Every R1A stand-in in the wave notes is gone (`grep -rn "R1 stand-in (R1A)"` is empty).
- [ ] Nothing stalls: in a headless 70-day run on two bench seeds, no business is a whole day without its raw good while its family's rule lets the carrier buy (the audit check R1F adds; until it lands, your own test).
- [ ] Tiers move (13-ledger.md, Tuning targets; R1X tunes): on the bench seeds you can run, Craftsfolk appear and the trend is toward the first by day 40 and a third of households by day 70. Record what you measured.
- [ ] Winter has teeth: a town with reserves under half the plan and the pass closed two days has hungry or cold households and loses none of its buildings (a test).
- [ ] The carrier runs in under 0.5 ms a day at City scale (`22-quality.md`, R1 budgets; a bench line).
- [ ] The money invariant holds in every test that moves money; typecheck, lint, unit tests and build pass.

## Out of scope

Trade choice, levels, specialized buildings and the season plan's other readers (R1B); the Balances book and top bar (R1C); wishes and stories (R1D); the advisors (R1F); tuning to targets (R1X).

## Notes

- R1.0's design note (a): a made good no business in the valley makes yet, while its raw good is made here, counts as a little short in R1B's need term; your `familyCover` and `carrierBrought` feed that term, so keep them cheap.
- Spoilage as built (a granary halves it); a festival's put-by goods are never sold.
- R1.0's lesson: with the spec's one fixed buying order and the peddler's 20 units, the Food reserve took the whole load every day and a site waiting on timber never got it; the stand-in buys essentials in every family first, then reserves. Keep essentials ahead of reserves (or size the load so they never compete), and keep R1.0's bench playtest green.
- If you need a saved-shape change beyond optional fields, say so in your PR (wave notes: Saves).
