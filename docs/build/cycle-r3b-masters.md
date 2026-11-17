# R3B: Masters

**Iteration**: R3 Masters and the Town Book. **Wave**: parallel. **Branch**: `cycle/r3b-masters`, from `cycle/r3x-integration`; PR into `cycle/r3x-integration`. **Recommended effort**: xhigh.
**Depends on**: R3.0. **Runs alongside**: R3A, R3C to R3E, and V4's wave. **Ports**: client 5242, relay 8852.

## Goal

Good evenings grow masters. A young or adult resident with four hearts and 20 working days in one trade (apprentice days count double), in a business of level 2 or more or at a specialized building, becomes a master, one new master a trade a season: a sign over the door, a Chronicle line and a letter. A master lets the business reach level 3, makes a master's good from the same raw good in the same building (nine in R3), and takes apprentices, so a trade spreads; masters of the other trades and buildings bring a piece or room instead. When a master leaves the valley or retires, the business keeps its level six days and then slides, and the master's good stops when the trade has no master left. Story characters are masters by their arcs. So the Ledger has reason to care about Hazel by name, and to ask the Hearth to look after her.

## Read

- `CLAUDE.md`; `docs/build/r3-wave-notes.md`
- `docs/spec/19-evenings.md`: The loop, Masters, Data and budgets, the R3 acceptance
- `docs/spec/11-residents.md`: Lives (Apprenticeships, Keeping a business, Mastery), Bond ([R2] and [R3]), Story characters ([R1]: masters of their trades from R3)
- `docs/spec/13-ledger.md`: Goods (Later flavors), Choosing a trade (the keeper), Levels (level 3 and the keeper's stand-in), Households (variety), Population tiers
- `docs/spec/12-hearth.md`: Wishes ([R3]: hearts), Festivals ([R1]: the pie contest waits for a master baker); `docs/spec/15-progression.md`: Ranks ([R3]: masters in the later Charters), Achievements (Master of the House)
- `docs/spec/20-architecture.md`: R3 contracts; `docs/spec/22-quality.md`: the R3 budget row, Playability from the redesign [R3] (a master's good with no shelf)

## You own

The R3B paths in `r3-wave-notes.md`: new `packages/sim/src/systems/masters/**` (working days by trade, becoming one, apprentices, losing one, the `api.ts` bodies), `systems/levels/**` (level 3 reads a master; the keeper's 20 days stand-in goes), `systems/residents/{jobs,life}.ts` (working days counted where hands are counted; an apprentice's master), the master's recipe in `systems/production/**` as the wave notes split it, content `masters.ts` (the `MASTERS` table's data), the master's recipes in `trades.ts` and the Fishery's def, the carved stone and ornamental trees as Hearth pieces, the masters in `stories.ts`, the pie contest in `festivals.ts`, `view/masters.ts`, and their tests (`packages/sim/test/r3b/**`).

## You can rely on

- R3.0's contracts and stubs: `Resident.craft`, `ResidentFlags.master`, an apprentice's master, the nine goods appended with their families, the `MASTERS` table's shape, `isMaster`, `masterOf` and `mastersCount` (the levels pass and the conditions already read them), the `masters` slot, Master of the House with its condition, the migration's `craft` from `keeperDays` and its level 3 keepers.
- R1's businesses, keepers, levels and `BusinessCounters` (`keeperDays`), the trade score's keeper term, production, the carrier and its neighbors' lists; C4D's apprenticeships (`Resident.apprentice`) and life events; R2B's heart for a season of good evenings; the wishes' hearts; story arcs as R1D left them.

## Tasks

1. **Working days by trade** (`Resident.craft`): a day worked in a business or at a specialized building adds one to that trade, two for an apprentice under a master; kept across winters and changes of work; a day resting out of season (a cider maker in winter) counts nothing and loses nothing (`13-ledger.md`, Levels).
2. **Becoming a master**: four hearts and 20 days in one trade, in a business of level 2 or more or at a specialized building; at most one new master a trade a season, chosen by days and then id (no dice). The sign, a Chronicle line and a letter in the town's voice; an event for the views.
3. **What a master brings** (`MASTERS`): level 3 for their business (the levels pass reads `masterOf`; a business that reached level 3 on the keeper's days keeps it); the master's good, made from the same raw good in the same building and sold like any flavor (shelves, the round, the carrier); for the other trades and buildings, the quarryman's carved stone and the forester's ornamental trees as Hearth pieces, the miller's room for one more baker, and level 3 with apprentices for the grain farmer, gardener, shepherd and shopkeeper. A piece a master unlocks is unlocked for valleys already past that master (R2.0's lesson, `test/r2-0/unlocks.test.ts`).
4. **Apprentices**: a young resident who serves a season under a master becomes one after 10 working days of their own (whether four hearts are asked too is a ruling), so a trade spreads; a finished apprentice is a keen keeper in the trade score, as built.
5. **Losing one**: a master's household leaves the valley or the master retires; the business keeps its level six days and then slides as the levels pass slides any business; the master's good stops when the trade has no master left in town.
6. **Story characters** are masters of their trades by their arcs (`11-residents.md`): Barnaby Ashcombe, a stonemason, reads most naturally as the quarry's master; an inventor (Pippa Quill), a merchant (Odette Fenwick), a musician (Juniper Reed) and an herbalist (Mother Thornbury) have no R1 trade, so which trade each masters, and what it brings, is the wave notes' call (a master musician could be the bandstand's "musician's evening").
7. **The pie contest**: offered once a master baker makes pies (it has no seasons today; the achievable check keeps it off until then), and a festival menu may carry pies.
8. **Counts**: `mastersCount` for Master of the House and for the later Charters' goals (a master for Town, four for Market Town; those Charters come in I4 and I5).
9. Tests: the rule and its one-a-season cap; apprentice days doubled and the 10-day path; level 3 only with a master, and kept from the keeper's stand-in; a master's good reaches a shelf and is bought as a flavor; departure and retirement (six days, the slide, the good stopping); a story character is a master; the money invariant through a year; a year hashes the same twice; masters inside the shared 1 ms an hour, added by one line to R3E's scene list.

## Acceptance criteria

- [ ] `grep -rn "R3 stand-in (R3B)" packages apps tools --exclude-dir=dist` is empty.
- [ ] The first master in the first Village year on every bench seed (R3E's runs are the evidence; each miss measured for R3X); a master's good reaches a shelf; a departed master's good stops (headless tests).
- [ ] Level 3 needs a master on the crew; no business loses a level when a version 8 valley is migrated.
- [ ] No good the Ledger has to wire: every master's good comes from a raw good the trade already takes, in the building it already has, and its family is the one R3.0 gave it.
- [ ] Budgets hold; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.

## Out of scope

Supplies and the lamplighter (R3A); specialties named for masters' goods (R3C); the sign and the master in the inspectors on screen, and the letter's card (R3D, and the look as the rulings assign); advisors (R3E).

## Notes

- Hearts come from granted wishes (up to three), a season of good evenings (R2B: four of six at 60 or more, once a season), festivals and story steps. Four hearts and 20 days inside a 24-day Village year is tight on purpose; report each seed's first master day and what held it back.
- A master's good is a flavor like any other (R1A's likes and prices), so it counts toward the variety Merchants and Patrons ask for (`13-ledger.md`, Population tiers); R3E checks the families add up.
- Choices go by days and id, never the `residents` stream: arrivals have their own generator since R2X, but the schedule still draws from that stream.
- Do not edit `systems/supplies/**`, `systems/townbook/**` or the client; ask in your PR.
- Runs as the build and review loop (`31-parallel-development.md`), one or two rounds of quality check, dead-end hunt and player's chair before the PR.
