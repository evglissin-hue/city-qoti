# R3H: Specialized buildings grow

**Iteration**: R3 Masters and the Town Book. **Wave**: parallel. **Branch**: `cycle/r3h-specialized-levels`, from `cycle/r3x-integration`; PR into `cycle/r3x-integration`. **Recommended effort**: xhigh, on Opus (it crosses content, sim and art).
**Depends on**: R3.0. **Runs alongside**: R3A to R3G, V4's wave, and the playtest cycles P3A to P3C on `main` (P3A's levels pass first of all). **Ports**: client 5249, relay 8859.

## Goal

The buildings a player sites grow with success, as businesses already do (the owner's playtest of `main`, 2026-11-17; the master's ruling). A Forester's Lodge that keeps felling and has its timber carried off takes on more hands and reaches further into the wood; a Market Stall with a queue serves farther; a Granary kept half full with its porters busy grows bigger. Each level is a bigger building with a bigger crew, reach, store or room, never a multiplier (`13-ledger.md`, Levels), drawn so a player can see it, with an inspector line that says what the next level needs and how far along it is. A building that stops doing well slides back as a business does. Nothing new is saved.

## Read

- `CLAUDE.md`; `docs/build/r3-wave-notes.md` (R3H's ownership, Beside the wave: P3A's levels pass, the split of `render/layers/buildings.ts` with R3F)
- `docs/spec/13-ledger.md`: Land and specialized buildings, Levels (and R1B's As built), Logistics; `docs/spec/17-presentation.md`: The world carries what it can (a business shows its level)
- `docs/spec/20-architecture.md`: R1 contracts (specialized buildings), R3 contracts (`BuildingDef.levels`); `docs/spec/22-quality.md`: Playability from the redesign

## You own

`packages/sim/src/systems/levels/specialized.ts` (`specializedDayEnd`, wired into the levels pass by R3.0), the readers of a level as small edits (`jobsOf` in `state/zones.ts`; storage in `systems/logistics/stores.ts`; a specialized building's reach where it is read; `capacityOf` in `systems/specialized/api.ts`), the `levels` data on the specialized defs (`content/buildings.ts`, `villageBuildings.ts`), the looks of a level in `packages/art/src/kits/{specialized,services,workplaces}.ts` and their kit selection in `render/layers/buildings.ts`, the level line in the building inspector's view (`view/inspect.ts`) and its client line, the feed line on a climb, one audit kind in `view/health.ts` (coordinated with R3E) and a static content test, tests `packages/sim/test/r3h/**`, shots `docs/build/screenshots/r3h-*`.

## You can rely on

- R3.0: `BuildingDef.levels` (`SpecializedLevelsDef`: `crew`, `reach`, `storage`, `capacity` by level, and `good`: `carried`, `customers`, `served` or `full`), `specializedDayEnd` called at 23:30 for every built specialized building with `levels` (a marked stand-in), `Building.level` and `Building.counters` saved and hashed on every building (`BusinessCounters`: `levelDays`, `madeToday`, `soldToday`, `customersToday`, and the rest), `BuildingView.level` shown above 1.
- R1B's levels pass and its slide (four failing days, keeping its walls, trimming the crew), P3A's version on `main` (businesses climb after two good days: follow it once landed), the specialized buildings' reach and capacity (`systems/specialized/api.ts`), porters and stores (`systems/logistics/**`), the Fishery's frozen days (`seasons/river.ts`).

## Tasks

1. **The rule** (`specializedDayEnd`): a good day by the def's `good` (goods `carried` off its output, `customers` at its stall, `served`: every business it serves in reach had its raw good, `full`: a store at least half full with every porter at work); days resting out of season (a Fishery on a frozen river) count neither way; up after three good days running (or P3A's two, if it has landed), down after four failing days, at most `levels` long; a climb gives `business.updated` and `building.updated`.
2. **The readers**: crew (`jobsOf` for a building with no trade reads `levels.crew[level - 1]`), storage, reach and capacity by level; the extra porter or vendor through the crew; a level's reach or room read where today's is (one helper beside `levelOf`), so the Build picker's reach, the Windmill's bakers and the Market Stall's food reach follow.
3. **The table** (P3A's, every number *tune*), as `levels` data:
   - Forester's Lodge: a good day is felling with its wood above its rule and the timber carried off. Level 2 crew 3 to 4 and its wood reaches 10 tiles (8 today); level 3 crew 5 and 12 tiles.
   - Quarry: cut and carried. Crew 4, then 5.
   - Fishery: a catch carried (frozen days count neither way). Crew 4, then 5, with a second jetty.
   - Market Stall: 8 customers a day. Food reach 14, 18, 22 tiles, and a second vendor.
   - Granary and Storehouse: at least half full with every porter at work. Storage 40% more, then 80%, and one more porter each.
   - Windmill: every baker in reach had grain. Room for one more baker a level.
   - Sawmill, Brickworks, Trading Post: crew or load one step a level.
4. **The look**: each level of those buildings reads at a glance (a second jetty, a bigger yard, a longer stall, a taller store), from the kits by params, opaque and instanced, inside the dressing and building budgets.
5. **Words**: the inspector says what the next level needs and how far along it is ("Two more good days of timber carried off and the Lodge takes on a fourth hand."); the feed says when one climbs or slides, warm and dry, no em dashes.
6. **The audit**: every level of every specialized def can be reached by content (its good day is possible in some valley) and nothing slides forever (a building that slid is not stuck failing for a reason no command can change): one health kind and a static test.
7. Tests: each good day by example; three up, four down, resting days neutral; crew, storage, reach and capacity read the level; a joining seat reads the same levels; the money invariant through a year; a year hashes the same twice; the levels pass inside its budget at City scale (a line in R3E's scene list).

## Acceptance criteria

- [ ] `grep -rn "R3 stand-in (R3H)" packages apps tools --exclude-dir=dist` is empty.
- [ ] In an autoplayed Village at least one specialized building climbs by day 70 on every bench seed (R3E's runs), and one that stops doing well slides back; no level is out of reach (the audit and the static test).
- [ ] A level is never a multiplier: crew, reach, storage and capacity only.
- [ ] Each level reads on screen (shots by day and lamplight at 1250 px); the inspector says what the next level needs.
- [ ] Budgets hold; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests, build and e2e pass.

## Out of scope

Business levels and masters (R3B: level 3 for a business needs a master; a specialized building has no master's level, only its own climb), supplies (R3A), the candle windows in `render/layers/buildings.ts` (R3F), advisors (R3E).

## Notes

- Merge `main` early: P3A changes the levels pass (two good days) and the growth pass beside your files.
- Follow the business levels' code and words rather than inventing a second idiom; a player should read a level the same way on a bakery and on a Lodge.
- Runs as the build and review loop (`31-parallel-development.md`), one or two rounds of quality check, dead-end hunt and player's chair before the PR.
