# R1B: Land and businesses

**Iteration**: R1 Zones first. **Wave**: parallel. **Branch**: `cycle/r1b-land-businesses`, from `cycle/r1x-integration`; PR into `cycle/r1x-integration`. **Recommended effort**: xhigh.
**Depends on**: R1.0. **Runs alongside**: R1A, R1C to R1F, and V2's wave. **Ports**: client 5222, relay 8832.

## Goal

The Ledger zones land and the town builds, staffs and runs the businesses on it. Each lot about to grow chooses a trade by `need x supply x site x keeper`; businesses have keepers and move between three levels on custom, inputs and room; the thirteen specialized buildings keep their site rules, reach and capacity; the four demand bars say in words what the town wants and light only when it needs more zoned land; the season plan's winter reserve and where-to-build-first are read; and labor needs no lever.

## Read

- `CLAUDE.md`; `docs/build/r1-wave-notes.md` (all of it)
- `docs/spec/13-ledger.md`: The five rules; Land and specialized buildings; Zoning and growth (Trades, Demand, Choosing a trade, Starting sites, Levels, Labor); Production; Construction; Logistics; The season plan; Tuning targets
- `docs/spec/10-world-and-building.md`: From the redesign (site rules, zoned from the first street)
- `docs/spec/11-residents.md`: the [R1] notes (Keeping a business, the jobs table)
- `docs/spec/15-progression.md`: the [R1] innovations note
- `docs/spec/20-architecture.md`: R1 contracts; `docs/spec/22-quality.md`: the R1 budgets

## You own

The R1B paths in `r1-wave-notes.md`: `systems/{growth,levels,production,logistics,construction,zoning,innovations,specialized}`, `systems/residents/jobs.ts`, `systems/seasons/{stores,river,growing}.ts`, `systems/economy/{start,api}.ts`, `rules/{building,reach}.ts`, `commands/{recipe,zone,field}.ts`, `view/{demand,businesses,inspect}.ts`, content `trades`, `buildings`, `villageBuildings`, `seasonsBuildings`, `zones`, `innovations`, the sim fixtures, and their tests.

## You can rely on

- R1.0's contracts and stand-ins: `Building.trade/keeperId/level/pinned/counters`, `state.demand`, `DemandView`, `BusinessView`, `methodOf`/`jobsOf`/`levelOf`/`hasTag`, the growth stand-in (best shortage score among trades whose site wants the lot meets), the `levels` system slot (69, 23:30), `build.pinRecipe { id, trade }`, the five new `PlacementRule` kinds and reject reasons (declared, not checked).
- C4B's lot cutter, desirability and starting sites; C5A and P1's fields and sowing windows; production as built; R1A's `carrierBrought`, `familyCover`, `flavorsOnOffer`, `winterMark` (stubs from R1.0 until R1A lands).

## Tasks

1. Day one: move `demandView` and `businessView` out of `view/zones.ts` into `view/demand.ts` and `view/businesses.ts` (leave re-exports).
2. **Site rules** in `canPlaceBuilding`: `woods` (NEEDS_WOODS), `river` (NEEDS_RIVER: the door on the river's edge, not a pond), `openGround` (NEEDS_OPEN_GROUND), `road` (NEEDS_ROAD, kinds), `valleyRoad` (NEEDS_VALLEY_ROAD: define the valley road as the road tiles connected to `meta.valleyGate`, cached by `networkVersion`). The client calls the same rules on its Mirror, so ghosts match.
3. **Specialized buildings** (`systems/specialized`): reach along roads (24 unless noted), capacity (the Windmill's raised capacity), served counts; the Forester's Lodge fells and replants its own wood and cuts firewood toward the Fuel mark from Summer day 4; the Sawmill saws by hand for one carpenter fewer while the river is frozen; the Brickworks fires brick; the Granary keeps Food (spoiling half as fast) and the Storehouse the other four families (`BuildingDef.stores`), homes and shops in reach drawing on them; the Market Square's six stalls; the Apiary (decide whether it places a `hives` business; write the call in your PR).
4. **Choosing a trade** (the 01:00 pass): `need x supply x site x keeper` as written, with design note (a): a made good no business in the valley makes yet, while its raw good is made here, counts as need 0.25, so a windmill in a grain town gets its first baker even when the town is well fed (the guide's "first workshop" step depends on it). Wants read for every tier unlocked, one household in ten for a tier with none yet. Retooling: six days of surplus while another is short, one a night across the town, keeping the keeper; pinned never, except a failed site after three days.
5. **Demand bars** as written (Homes, Shops, Workshops, Farmland), with reasons (`DemandReason` codes) and the quiet/lit rule; `demand.updated` after the pass and on zoning. Design note (b): before Village rank the Shops zone is closed, so the Shops bar's reasons say the Market Stall is how to answer it (R1C words the brush).
6. **Keepers and levels**: the first hand hired keeps it (or the resident whose trait or apprenticeship tipped the choice); a keeper who leaves is replaced by the longest-serving hand. Levels 1 to 3 with crews by level (`TradeDef.crew`), the counters in `BusinessCounters`, up after three good days, down after four failing days, resting out of season counting neither. `business.updated` on every change.
7. **Labor** (11-residents.md, the [R1] jobs note): no pauses needed; a business with nothing to do rests and frees its hands; a farmstead's hands go to the forester and the builders in winter. Hands: about a third of working residents in food (the tuning target; record what you measure).
8. **Construction and starting sites**: a site short of a material asks the carrier when the Materials rule allows (R1A's carrier reads open sites' needs); the season plan's `buildFirst` zone's sites go first; Townhouses need brick as well as timber and stone.
9. **Innovations** (15-progression.md, [R1]): conditions in the new names, each opening a specialized building or capability (the Seed Drill: a cut field is sown again the same day inside the window); none waits on a story alone.
10. **Fixtures**: keep `test/fixtures` true to R1 (businesses with trades and levels, specialized buildings with reach), and update `apps/client/src/ui/mocks` only through the fixtures.
11. Tests: each site rule; the trade score's four terms and design note (a); retooling and pinning; levels up and down; demand bars lit and quiet; keepers; the Lodge's Fuel mark; the first workshop growing in a windmill's reach.

## Acceptance criteria

- [ ] Every R1B stand-in in the wave notes is gone (`grep -rn "R1 stand-in (R1B)"` is empty).
- [ ] Trade choice and growth run in under 2 ms a night at City scale (`22-quality.md`, R1 budgets; a bench line).
- [ ] About a third of working residents are in food on the bench seeds you run (record the numbers for R1X).
- [ ] A fresh standard valley that zones Farmland, Homes and Workshops and sites a windmill grows a farm, homes and a baker in the windmill's reach within its first days, with no hand placement of a production building.
- [ ] Typecheck, lint, unit tests, build and the bench pass; e2e of your ghosts (site rules) pass.

## Out of scope

The carrier, baskets, tiers and prices (R1A); the Build picker, demand bar chips and the Businesses book (R1C); the guide's letters and the Hearth's tools (R1D); art (R1E); advisors and the audit (R1F).

## Notes

- `hasTag(b, tag)` makes a business answer to its trade id; detectors, wishes and conditions already read it.
- The shop's wants say "households or footfall in reach"; footfall arrives in R2. Leave a seam.
- Keep everything integer and on seeded streams; the trade score's floats are intermediate, rounded before they are stored.
