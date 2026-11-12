# R2B: Evening trade

**Iteration**: R2 The evening round. **Wave**: parallel. **Branch**: `cycle/r2b-evening-trade`, from `cycle/r2x-integration`; PR into `cycle/r2x-integration`. **Recommended effort**: xhigh.
**Depends on**: R2.0. **Runs alongside**: R2A, R2C to R2F, and V3's wave. **Ports**: client 5232, relay 8842.

## Goal

The round is the Ledger's second flow. Treats are bought where folk stop, shops are zoned and level up by who walks past, a busy shop puts tables out and becomes a cafe, and carts keep off evening streets. Dusk runs at half speed. Each resident's evening gets a score, the evenings need replaces beauty and the tavern's social need, and the tiers ask for it: a flower by the door no longer opens Craftsfolk, a place with a seat in reach does.

## Read

- `CLAUDE.md`; `docs/build/r2-wave-notes.md`
- `docs/spec/19-evenings.md`: The day in two acts (the clock), Evening trade, Good evenings, Evening streets, the R2 acceptance
- `docs/spec/13-ledger.md`: Households (baskets, Treats), Population tiers, Levels (custom, shops), Streets and traffic, Demand (Shops by footfall) and the [R2] notes
- `docs/spec/11-residents.md`: Needs (Evenings), hearts and the bond [R2]
- `docs/spec/14-challenge.md` and `15-progression.md`: the [R2] notes (winter evenings, the Village's goal is R2C's)
- `docs/spec/20-architecture.md`: R2 contracts; `docs/spec/22-quality.md`: the R2 budgets

## You own

The R2B paths in `r2-wave-notes.md`: `systems/market/{baskets,shopping}.ts` and `systems/residents/{shopping,shops,needs,life}.ts` (Treats on the round, the doorstep errand, the evenings need, the bond heart), `systems/tiers/**` (tiers read evenings), `systems/growth/{desirability,bars,outlets}.ts` (shops by footfall, the Shops bar counts places with nothing to sell), `systems/levels/**` (every ten evening steps past a door count as a customer), new `systems/growth/cafes.ts`, `systems/logistics/**` and `systems/traffic/**` (evening streets, the carters' hours), `commands/road.ts` (`road.setEvening` only), `sim/turn.ts` and `speed.ts` (dusk at half speed), content `baskets.ts` and the tier wants (check where R1X left them), and their tests (`test/r2b/**`).

## You can rely on

- R2.0's contracts and stand-ins: `Resident.evening`, `Resident.round`, `eveningScore` and `recordSale` stubs, the `evening` road bit, `ValleySettings.eveningLingers`, `Place`.
- R1's businesses, levels and keepers, the carrier, baskets by family (check against R1X's As built).

## Tasks

1. **Dusk at half speed**: from 17:00 to 21:00 the clock runs at half the chosen speed when `eveningLingers` is on (default on); a turn advances half its ticks, rounded down on odd turns and up on even; time controls and the top bar's effective speed read it. Hashes must not depend on wall clock.
2. **Treats on the round**: leave the 18:00 household pass. At a stop that serves Treats a resident still owed a unit buys their favorite flavor, pays at the till and has it in hand (`carry`); a comfortable household buys one more; passing trade (one time in five within a tile of an outlet); the 21:30 doorstep errand for a third of what is owed. A Hamlet's treats are free at the shelf; money moves from Village rank. Every sale calls `recordSale` and counts toward the outlet's custom.
3. **Shops follow the walkers**: Shops desirability gains up to 30 for frontage footfall and 10 for a place within 3 tiles; the Shops demand bar counts each place that drew 8+ visitors with nothing to sell; a level 2 shop within 2 tiles of two seats puts tables out and becomes a cafe (`cafeTables`: its tables join the place and it serves there).
4. **Evening streets**: `road.setEvening` handler; carts and porters' barrows treat marked tiles as closed from 17:00 to 21:00 and go round (one with no other way waits at the edge and its shed says so), no cart noise falls on them, carters keep the porters' hours to 19:00; a stall or workshop on the stretch gets no delivery after 17:00. R2A's route cost reads the flag.
5. **Good evenings**: at 21:00 compute each resident's score (draw of the best stop as found, +8 friend, +8 treat, +4 a second kind, -10 standing; staying in 20, the floor; weather loses the evening); the evenings need moves a third of the way; it takes `beauty`'s weight 15 and `social` for Craftsfolk; the bond heart (four of a season's six evenings at 60+, once a season, up to 5).
6. **Tiers**: grown-ups average evenings of 50, 65 and 80 three days running for Craftsfolk, Merchants and Patrons; charm round the door still feeds desirability and arrivals but no longer opens a tier. Make sure a tier is never gated by something no town can build (R2E's achievable check will test it).
7. Tests: the money invariant through a year with evening sales; a Hamlet pays nothing; dusk half-speed on odd and even turns and across a save; carts route round an evening street within twice free-flow, a cart with no other way waits and delivers after 21:00 and none deadlocks; the score's parts; tiers on evenings and not on charm.

## Acceptance criteria

- [ ] Every R2B stand-in is gone (`grep -rn "R2 stand-in (R2B)"` is empty).
- [ ] Once three places stand, four fifths of Treats are sold on the round (headless, on two bench seeds); a household in a town with no places is still sold a third by the doorstep errand.
- [ ] The first Craftsfolk household by day 40 holds on evenings of 50 in place of charm 25 (R2E's bench run is the evidence).
- [ ] Carts route round an evening street and arrive within twice free-flow; none deadlocks.
- [ ] The money invariant holds in every test that moves money; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.

## Out of scope

Places, the planner and footfall (R2A); gaps (R2C); the cafe's drawing and every UI (R2D, V3); supplies, rested pieces and masters (R3).

## Notes

- The score needs R2A's `Resident.round` facts: write the 21:00 pass against the stub and a fixture, and merge `cycle/r2x-integration` often.
- A shop that stops selling after 17:00 because its road is closed must say so in its view; R2D shows it.
- Treats accrue as built (in hundredths); do not change the basket's numbers beyond content.
