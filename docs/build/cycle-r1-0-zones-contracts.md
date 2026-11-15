# R1.0: Zones contracts

**Iteration**: R1 Zones first. **Wave**: serial. **Branch**: `cycle/r1-0-zones-contracts`, from `claude/funny-noether-28i3x9` (main plus the redesign's spec and these briefs); it ends by creating `cycle/r1x-integration` at its last commit.
**Depends on**: P1 (merged). **Unblocks**: R1A to R1F. **Runs alongside**: V2.0 (it owns render, art, the perf endpoint and one Settings entry; nothing here touches them). **Ports**: client 5220, relay 8830.

## Goal

The zones-first Ledger's contracts and content shapes exist in their final form and the chain economy's contracts are gone, on a branch that compiles, passes its tests and runs a fresh standard valley on simple stand-ins. The six R1 cycles then build in parallel against types that will not move, each in files no other cycle edits, and each replaces a stand-in this cycle named. This is the one cycle allowed to rename and remove contracts (`20-architecture.md`, Redesign outline); after it the policy is additive again.

## Read

- `CLAUDE.md`
- `docs/spec/13-ledger.md`, all of it (what to build), and `docs/spec/archive/13-ledger-chains.md` (what exists)
- `docs/spec/20-architecture.md`: Simulation design, the I0, hamlet, village and seasons contracts sections, Redesign outline (R1)
- `docs/spec/21-networking-and-saves.md`: The fresh start
- `docs/spec/22-quality.md`: The redesign: measuring first, then budgets (the lanes test, decisions not chores, the R1 budgets, the playability rows)
- The [R1] notes in `02-game-overview.md` (New valley, the guide, glossary), `10-world-and-building.md` (From the redesign), `11-residents.md`, `12-hearth.md` (with Decorating that composes itself), `14-challenge.md`, `15-progression.md`, `16-coop.md`, and `17-presentation.md` (The redesign's interface)
- `docs/spec/30-roadmap.md`: R1 Zones first; `docs/spec/31-parallel-development.md`: Contracts policy, Registries, the redesign's pairs, Build and review loop

## You own

`packages/sim/src/contracts/**`, `packages/content/src/**`, `packages/protocol/src/messages.ts` (additive: `OLD_VALLEY`), `packages/sim/src/commands/**`, `packages/sim/src/state/**` (version and migrations), `packages/sim/src/systems/**` and `packages/sim/test/**` to remove the chain economy and register stand-ins, `tools/bench/src` to keep it compiling and running, `apps/client/src/{ui,input,state,app}` only to remove what sends or shows a removed contract, `test/every-command-has-a-sender.test.ts`, new `docs/build/r1-wave-notes.md`, the briefs `docs/build/cycle-r1{a,b,c,d,e,f,x}-*.md`, an "R1 contracts" section in `docs/spec/20-architecture.md`.

Not yours, whatever the reason: `packages/art`, `apps/client/src/render`, `apps/server`, `tools/dev-server` (V2.0 is in them now). If a removed building's art kit id is referenced from content, keep the kit; R1E decides its future as a trade look.

## You can rely on

The I3 game after P1 on `main`: growth's lot cutter and `growthDemand`, `chooseMethod`, production methods (`craft`, `gather`), fields and sowing (C5A, P1), logistics and porters, construction, the market and prices, baskets, tiers and upgrades, the peddler, caravans and the Trading Post, Deals, the budget and the money invariant, the dressing ladder, callings (P1 slice), the guide, stories, the autoplayer and the playability audit, the sender test.

## The master's calls (already decided)

1. **The cut is here, in full.** Remove `trade.setStandingOrder`, `ledger.setForSale` and `calling.choose` with their handlers, state, views and interface; the goods `13-ledger.md` lists as gone; the 27 hand-placed production building defs (the Apiary stays as the way to place hives by hand); method switching; the yield registry's `decor` and `calling` lines. Add the R1 commands, state, views and content types of the Redesign outline.
2. **Final shapes, not placeholders.** Every wave codes against what you write, so get the shapes right: the 16 goods in a fixed order with `family` and `raw`; `TradeDef` and a trades registry with the 12 trades of `13-ledger.md`; the 13 specialized buildings with site rule, reach, capacity and `enables`; the business defs (workshop, farmstead, shop) with `Building.trade`, `keeperId`, `level` and the counters levels read; baskets by tier and family with amount and variety wants; carrier state (a rule, a reserve and what it carried, by family; the budget; the County tab); `seasonPlan`; the demand view with its reasons; the three new views; the six new commands and `build.pinRecipe` pinning a trade.
3. **Stand-ins, not features.** Where a fresh valley needs behavior you removed, write the simplest stand-in that keeps it running and deterministic (for example: trade choice takes the first trade whose site wants the lot meets; the carrier is today's peddler mapped onto families with the default rules; tiers read amount only; businesses stay level 1). Mark each in code `// R1 stand-in (R1A): ...` and list it, with the cycle that replaces it, in the wave notes' stand-ins table. Do not build the real systems: that is the wave's work.
4. **A green branch.** Typecheck, lint, unit tests and build pass; the golden files are regenerated (new goods change every hash, as expected) and determinism still holds (the same script hashes the same twice in Node and in a browser worker); bench runs (its numbers on stand-ins are not targets); e2e passes, except specs of removed features, which you delete, and specs a wave will rewrite, which you skip with a comment naming the cycle. List both in the wave notes.
5. **Saves move to version 6 now.** The R1 wave reaches `main` only through R1X's one merge, so do the fresh start's sim half here: `SAVE_VERSION` 6, `deserialize` refuses a save under 6 with `OLD_VALLEY` (in the sim and in `messages.ts`), migrations 1 to 5 and their tests removed, a test that a version 5 save is refused. The title screen's grayed list is R1C's; the server's answer to a hello for an old valley is R1X's (V2.0 owns the server now).
6. **Senders owed.** New commands with no button yet go on a separate `OWED_SENDERS` list in the sender test, each naming its cycle (R1C or R1D). The test passes while a command is owed; R1X's brief says the list must be empty before the merge.
7. **Four design notes for the wave briefs**: (a) a made good no business makes yet, while its raw good is made here, counts as a little short (`13-ledger.md`, Choosing a trade, the need term; R1B); (b) before Village rank the Shops bar's brush is the Market Stall and its words say so, since the Shops zone is closed (R1C, R1B); (c) the guide's "first workshop" letter names the windmill (R1D), and the achievable check covers every guide step (R1F); (d) the grown village scene V2.0 adds (`?debug&fixture=grown`) is a version 5 snapshot that version 6 refuses, so R1X regrows it with V2.0's script under the new rules.

## Tasks

1. **Trace** every use of what goes (read-only explorer agents are fine): goods by id, the production defs and methods, standing orders, goods for sale, callings, the peddler, caravans, the Trading Post's orders, baskets, tiers, `chooseMethod`, the yield lines, the Market, Trade, Stores and Calling panels, the bench's advisors and audit, the e2e specs. Write the removal map into the wave notes before cutting.
2. **Content types and data** (`types.ts` and the data files): the five rules' shapes above; the site rule reason codes of `10-world-and-building.md` (From the redesign); the standard start from R1 (`02-game-overview.md`, New valley); innovations that open specialized buildings (`15-progression.md`); costs converted as `13-ledger.md` says. Content validation tests: every trade's goods exist; **a made good is never an input** (rule 2, as a test over all content); every specialized building has a site rule; every good belongs to exactly one family.
3. **State, views and commands** (`contracts/`, `commands/`): as in call 2. Handlers for the plain setters (`carrier.setRule`, `carrier.setReserve`, `carrier.setBudget`, `season.setPlan`, `build.pinRecipe` on a trade) with validation and unit tests; `decor.move` and `build.move` get their shapes and a handler that refuses until R1D builds it, or build them if they turn out small.
4. **Systems**: remove what only served the chains; register the new slots (`carrier`, `levels`) with stand-ins; keep the system order test true and say in the wave notes where each R1 system runs in the day.
5. **Saves** (call 5) and the hash covering the new state.
6. **Client**: remove what sends or shows a removed contract (the Calling card and pill, standing order controls, goods for sale toggles, Market and Trade book contents that read removed views); leave the panels that R1C replaces showing stand-in content. Nothing new is designed here.
7. **Bench**: the autoplayer stops placing removed buildings and zones Homes, Workshops and Farmland from the first day; the audit compiles and runs. R1F rewrites both.
8. **Wave notes** (`docs/build/r1-wave-notes.md`): ownership file by file for R1A to R1F (R1C and R1D share `ui` and `input`: split them by file; R1E's paths are in `31-parallel-development.md`, the redesign's pairs), the removal map, the stand-ins table, the skipped e2e specs, the handshakes (which system writes which state, which view each panel reads, the order of systems in a day), ports (R1A 5221 and 8831 up to R1F 5226 and 8836, R1X 5227 and 8837).
9. **Briefs**: R1A the economy core, R1B land and businesses, R1C the interface, R1D the Hearth's tools and the first days, R1E art for trades, R1F the bench, R1X integration and tuning, each about two pages from `_template.md`, splitting `30-roadmap.md`'s R1 acceptance and `13-ledger.md`'s tuning targets among them. Each brief's header names a recommended effort: xhigh for R1A and R1B, high for the rest. Each wave cycle branches from `cycle/r1x-integration` and opens its PR into it; R1X merges the wave and opens the one PR into `main`, and tags the last `main` commit of the old rules `chains-final` before that merge.
10. **Finish**: push `cycle/r1-0-zones-contracts`, then push the same commit as `cycle/r1x-integration`. No PR into `main`. Update the board row.

## Acceptance criteria

- [ ] The removed commands, goods and production defs are gone from contracts, content, sim, client and bench; `grep` finds no chain good id outside the archive doc and tests that assert absence.
- [ ] The new contracts match `13-ledger.md` and the Redesign outline; content validation passes, including the rule 2 test.
- [ ] A fresh standard valley starts with the R1 start and runs 10 in-game days on stand-ins with no error, the money invariant intact and the same hash twice.
- [ ] A version 5 save is refused with `OLD_VALLEY`.
- [ ] Typecheck, lint, unit, build and bench pass; e2e passes with the listed skips; golden regenerated and determinism holds in Node and a browser worker.
- [ ] The wave notes and the seven briefs are written; `cycle/r1x-integration` exists at this cycle's last commit.
- [ ] A line in `CHANGELOG.md`, your row in `docs/build/README.md`, the "R1 contracts" section in `20-architecture.md`.

## Out of scope

The real systems (carrier, trade choice, levels, tiers by variety, demand bars: R1A and R1B), the new interface (R1C), the Hearth's tools and the guide's letters (R1D), art (R1E), advisors and the lanes test (R1F), tuning (R1X), anything in V2's paths.

## Notes

- Run the build and review loop (`31-parallel-development.md`). For this round the owner asked for Opus executors (model `opus`, high effort) rather than the Sonnet executor default; use them for the mechanical sweeps (removals, test updates), and keep the shapes and the stand-ins' design for yourself.
- Per-good quantities stay arrays indexed by good index; with only 16 goods, do not leave gaps for removed ones.
- If a call above turns out wrong in the code, stop that part, write the problem and your proposal in the wave notes, and carry on with the rest.
