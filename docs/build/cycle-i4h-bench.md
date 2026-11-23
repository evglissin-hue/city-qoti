# I4H: The bench

**Iteration**: I4 Town, wave one. **Wave**: parallel. **Branch**: `cycle/i4h-bench`, from `cycle/i4x-integration`; PR into `cycle/i4x-integration`. **Recommended effort**: high.
**Depends on**: I4.0. **Runs alongside**: I4A to I4G, V5A, V5B. **Ports**: client 5278, relay 8888.
*Draft (R3X, 2026-11-23); every design call marked "proposed (R3X draft)" waits for the master's or the owner's word.*

## Goal

The autoplayer plays a Town the way a sensible pair would, in both profiles (tuned and newcomer), and the bench measures what wave one promises: when each seed claims the Town and whether it weathers the trial, the era moment, Merchants, steam and smoke, districts and policies, contracts and Port Amberly, guests, the new pages and feats; the money with every new flow over the valley's edge decomposed by `debt.ts`; R2's and R3's lines still holding; the budgets. The dead-end hunt grows a health kind for each new way a player could get stuck, so I4X can tune against numbers.

## Read

- `CLAUDE.md`; `docs/build/i4-wave-notes.md` (Starting after R3X; Lessons, all of them; the order of a day)
- R3E's As built (`docs/build/cycle-r3e-bench.md`) and R3X's (`cycle-r3x-integration.md`)
- `docs/spec/22-quality.md`: The lanes test, the redesign's budgets with I4.0's row, Playability from the redesign; `docs/spec/31-parallel-development.md`: Build and review loop, step 4
- `docs/spec/15-progression.md`: Ranks and Charters (Town); `docs/spec/13-ledger.md`: Population tiers, What holds (R1X, R2X, P3A); `docs/spec/18-eras.md`; `docs/spec/19-evenings.md`: the R2 and R3 acceptance

## You own

The I4H paths in the wave notes: `tools/bench/**` (advisors, `lanes.ts`, `outcomes.ts`, `targets*`, `audit.ts`, `autoplay.ts`, `debt.ts`, `profile.ts`, new `i4.bench.ts` and `i4Outcomes.ts`), `packages/sim/src/view/health.ts` (the I4 kinds), `apps/client/scripts/grow-fixture.mjs` (a Town fixture), with their tests (`tools/bench/src/**/*.test.ts`, new `packages/sim/test/i4h/**`).

## You can rely on

- R3E's advisors (lamps, supplies, places, shops, streets), outcomes, targets, the year view, the variety check, the newcomer profile (live since P3A), the lanes verdict, the evening baseline per seed, HealthWatch with R3's kinds, `debt.ts`.
- I4.0's contracts and commands (the district commands, `contract.accept` and `decline`, `season.setPlan`'s district), the views (`EraView`, `DistrictView`, `ContractView`, `TourismView`, `BuildingView.smoke`), I4A to I4F as they land: merge `cycle/i4x-integration` often.

## Tasks

The advisors' strategies below are proposed (R3X draft): how a sensible pair would play, for the master to adjust.

1. **A Town fixture and long runs**: a saved Town (proposed, R3X draft: from I4.0's version 9 fixture played on, or the bench seed that claims the Town first) in `grow-fixture.mjs`, for V5's shots, I4X's playthrough and the outcome tests, so no test autoplays from founding to Town (long autoplay tests stay under 300 s on a slow host; wall-clock tests take the best of several runs).
2. **The Ledger's advisor** grows into a Town's: claims the Town when its goals hold and prepares the trial (the Watch, walls, towers, lanterns lit); after the Steam Engine sites a steam mill where `smokeAt` falls on no place or homes it can help, keeps coal above its mark before winter; draws a market quarter by the shops and a mill quarter by the works with their policies; accepts contracts it holds the goods for and declines the rest. It places no decor and sets no style.
3. **The Hearth's advisor** grows too: styles districts and restyles the core to the era, or keeps an Old Town where one stands; composes places by the inn, theater, library and bandstand; follows the eight new pages' hints. It never zones, draws a district, sets a policy or accepts a contract.
4. **Outcomes** (headless, two bench seeds and both profiles, in `npm run outcomes`, each row naming the cycle its number needs): the Town claim day per seed; the trial weathered when prepared and failed (and returning, losing only its own raid's goods) when not (a scripted scene); the era turning once; the first Merchants household; a place under a steam mill's smoke drawing less (scripted); each policy's effect (scripted); a restyle finishing; Old Town found and broken; a contract kept and one missed; guests on a summer evening, none taking a resident's seat; each new page found somewhere; each feat's count moving.
5. **Money** (R3X's lesson): `debt.ts` gains categories for contracts, Port Amberly, guests, coal and restyling; report debt per resident on every seed and profile beside R3X's, and flag a new flow that pushes a Town past its credit line.
6. **Lines that must hold** on every seed and both profiles: the lanes test (guests counted apart); the evening goal's worst fair evening not below R3X's figure (a mill quarter's late shift takes workers out of the evening: report its cost); P3A's hands and food (about a third of hands in food, no missed breakfast with food in reach); the decisions count (the Town's new choices count: report how many a season the Ledger now takes).
7. **Health kinds** (`view/health.ts`, coordinated with each cycle): a Town Charter goal the town can never meet; a contract offered that the town cannot meet; a steam works resting a whole day for coal while the carrier may buy; a policy that changes nothing where it is set; a restyle job waiting on a material nothing brings; a guest with no room or no place in reach; a new page or hint content cannot produce. Quiet on a sensible run, or each flag explained for I4X.
8. **Targets and the year view** gain I4's columns (Town day, trial, era day, Merchants share, steam mills and coal, smoke over places, districts and policies, contracts kept and missed, Port Amberly's trade, guests a season, pages found, feats); extend `npm run targets`, never a second table.
9. **Bench scenes** (`npm run bench`, `i4.bench.ts`): the smoke settling and `smokeAt` at City scale, the restyle pass and policies in growth's night, contracts and tourism in the shared hour, the round's planning with a full inn, the patterns pass with nine new detectors; I4A to I4F's lines join through your scene list, one sorted line each.

## Acceptance criteria

- [ ] The lanes test, the evening goal, P3A's lines and the decisions count hold on every bench seed in both profiles, or each failing seed is measured and explained for I4X.
- [ ] The outcome tests pass, or each miss is explained with its number and the cycle it needs; the Town claim day is reported per seed and profile.
- [ ] The I4 health kinds flag their cases in unit tests and stay quiet on a sensible run; debt per resident is reported with the new categories.
- [ ] The I4 bench lines hold I4.0's budgets; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests, build and bench pass.

## Out of scope

Changing a system to make a number pass (report it to I4X); the interface (I4G); the rules behind every item (I4A to I4F).

## Notes

- Variance between runs is large (R1X, R2E, R3E): read every target over several seeds and runs; the container's timings swing by half, so medians.
- The Town Charter's 40 Craftsfolk may sit beyond what R3's tuning reaches (wave notes, Starting after R3X). Report the claim day honestly, with what holds households back (R3X's `r3xWhy.ts` reading), and leave the tuning to I4X.
- Never re-baseline a golden hash unless a rule changed, and say which (R3X's lesson); the advisors changing is a rule change for the golden year, as R3E recorded.
- Runs as the build and review loop (`31-parallel-development.md`); the dead-end hunt is this cycle's own product, so run it on every round.
