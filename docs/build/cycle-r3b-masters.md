# R3B: Masters

**Iteration**: R3 Masters and the Town Book. **Wave**: parallel. **Branch**: `cycle/r3b-masters`, from `cycle/r3x-integration`; PR into `cycle/r3x-integration`. **Recommended effort**: xhigh.
**Depends on**: R3.0. **Runs alongside**: R3A, R3C to R3G, and V4's wave. **Ports**: client 5242, relay 8852.

## Goal

Good evenings grow masters. A young or adult resident with four hearts and 20 working days in one trade (apprentice days count double), in a business of level 2 or more or at a specialized building, becomes a master, one new master a trade a season: a sign over the door, a Chronicle line and a letter. A master lets the business reach level 3, makes a master's good from the same raw good in the same building (nine in R3), and takes apprentices, so a trade spreads; masters of the other trades and buildings bring a piece or room instead. When a master leaves the valley or retires, the business keeps its level six days and then slides, and the master's good stops when the trade has no master left. Story characters are masters by their arcs. So the Ledger has reason to care about Hazel by name, and to ask the Hearth to look after her.

## Read

- `CLAUDE.md`; `docs/build/r3-wave-notes.md`
- `docs/spec/19-evenings.md`: The loop, Masters (with R3.0's settled notes), Data and budgets, the R3 acceptance
- `docs/spec/11-residents.md`: Lives (Apprenticeships), Bond ([R2] and [R3]), Story characters; `docs/spec/13-ledger.md`: Goods (Later flavors), Choosing a trade (the keeper), Levels, Households (variety), Population tiers
- `docs/spec/12-hearth.md`: Wishes ([R3]), Festivals ([R1]: the pie contest); `docs/spec/15-progression.md`: Ranks ([R3]), Achievements (Master of the House)
- `docs/spec/20-architecture.md`: R3 contracts; `docs/spec/22-quality.md`: the R3 budget row, Playability from the redesign [R3]

## You own

The R3B paths in the wave notes: `packages/sim/src/systems/masters/**`, `view/masters.ts`, `systems/levels/**`, `systems/residents/life.ts`, `systems/production/**`, `systems/market/**` but `round.ts`; content `masters.ts`, a new `masterDecor.ts`, the masters in `stories.ts`, `herbalist.ts` and `stonemason.ts`, the pie contest in `festivals.ts`; tests `packages/sim/test/r3b/**`.

## You can rely on

- R3.0: `Resident.craft` and `mastery`, `ResidentFlags.master`, `Apprenticeship.master`, `MastersState` (`lastMade`, `made`), `Building.masterId`, `BusinessCounters.masterGone` and `levelKept`, the nine goods appended with their families, `MASTERS` and `MASTERY` (`content.masters`, `masterByOf`, `content.mastery`), `isMaster`, `masterOf`, `mastersCount`, `mastersMade` (real), the stubs `canReachLevel3`, `masterRoom`, `masterMakes` with their readers wired (the levels pass, `capacityOf`, festival twists), `view/masters.ts`'s three hooks (wired into the inspectors and the Businesses book), `LifeEventKind` `master` and `masterLost`, `BuildingView.master` from `masterId`, the `masters` system (87, 23:45), Master of the House and its count, and the migration: a keeper's `keeperDays` became their `craft`; a level 3 business kept its level (`levelKept`) and its keeper was made a master with four hearts.
- `MASTER_GOOD_IDS` and `isMasterGood` (`state/masters.ts`): until a master makes one, a master's good is on no shelf list, basket, base flavor or Balances line.
- R1's businesses, keepers, levels and the trade score's keeper term; production and the carrier; C4D's apprenticeships; R2B's heart for a season of good evenings; the wishes' hearts; story arcs as R1D left them.

## Tasks

1. **Working days by trade** (`Resident.craft`): a day worked in a business or at a specialized building adds one to that trade (a specialized building's def id), `MASTERY.apprenticeWeight` for an apprentice under a master; kept across winters and changes of work; a day resting out of season counts nothing and loses nothing. Count them in your own system at 23:45, from the crews, not in `jobs.ts` (R3A's).
2. **Becoming a master**: four hearts and 20 days in one trade, in a business of level 2 or more or at a specialized building; at most one new master a trade a season, apprentices included (`lastMade` by absolute season index), chosen by days and then id (no dice). Keep `Building.masterId` in step; the sign, a Chronicle line and a letter in the town's voice; `life.event` with `master`.
3. **What a master brings** (`content.masters`): level 3 for their business (`canReachLevel3` reads the master on the crew; `levelKept` keeps a migrated level 3 until a master works there); the master's good, made in the same building from the raw good the trade takes (`MasterDef.method`, while a master is on the crew) and sold like any flavor: bring each made good into `SHELF_GOODS`, the baskets' groups and variety, prices and the carrier once a master makes it, and make `masterMakes` true while one does; the carved stone (quarry) and ornamental trees (forester) as locked Hearth pieces in `masterDecor.ts`, unlocked by the first such master (looks from existing kits until R3F gives them their own); the miller's room for one more baker (`masterRoom`); level 3 and apprentices for the grain farmer, gardener, shepherd and shopkeeper.
4. **Apprentices** (`residents/life.ts`): a young resident who serves a season under a master (`Apprenticeship.master`) becomes one after `MASTERY.apprenticeDays` working days of their own, no four hearts asked (the ruling); a finished apprentice is a keen keeper in the trade score, as built.
5. **Losing one**: a master's household leaves the valley or the master retires: `masterGone` on the business, which keeps its level `MASTERY.graceDays` days and then slides as the levels pass slides any business; the master's good stops when the trade has no master left in town; `life.event` with `masterLost`.
6. **Story characters** are masters by their arcs (the wave notes' call): Barnaby Ashcombe the quarry's master, Pippa Quill the carpenter's (toys), Odette Fenwick the shopkeeper's, Mother Thornbury the gardener's; Juniper Reed, a musician, waits for I4 (no bandstand, no music trade in R3). A story master counts for Master of the House but not against a trade's one a season.
7. **The pie contest**: offered once a master baker makes pies (its seasons and its goal on pies in `festivals.ts`; `masterMakes` keeps it off until then); a festival menu may carry pies.
8. **Views**: `residentMastery` (craft by trade, most first; the mastery and its title; an apprentice's master), `buildingMastery` (the master and apprentices), `businessMastery` (`masterId`, `masterGood`, `apprentices`, `graceDays`).
9. Tests: the rule and its one-a-season cap; apprentice days doubled and the 10-day path; level 3 only with a master, and `levelKept` from the migration; a master's good reaches a shelf and is bought as a flavor, and counts for variety; departure and retirement (six days, the slide, the good stopping); a story character is a master; the money invariant through a year; a year hashes the same twice; masters inside the shared 1 ms an hour, by one line in R3E's scene list.

## Acceptance criteria

- [ ] `grep -rn "R3 stand-in (R3B)" packages apps tools --exclude-dir=dist` is empty; Master of the House has a setup in `hearth/achievements.test.ts` and leaves `PENDING`.
- [ ] The first master in the first Village year on every bench seed (R3E's runs are the evidence; each miss measured for R3X); a master's good reaches a shelf; a departed master's good stops (headless tests).
- [ ] Level 3 needs a master on the crew; no business loses a level when a version 8 valley is migrated (`v8-willow-day70.json`).
- [ ] No good the Ledger has to wire: every master's good comes from a raw good the trade already takes, in the building it already has, in the family R3.0 gave it.
- [ ] Budgets hold; a year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.

## Out of scope

Supplies and the lamplighter (R3A); specialties named for masters' goods (R3C); the sign and the master in the inspectors on screen (R3F draws the sign, R3D the inspectors); advisors (R3E).

## Notes

- Hearts come from granted wishes (up to three), a season of good evenings (R2B: four of six at 60 or more, once a season), festivals and story steps. Four hearts and 20 days inside a 24-day Village year is tight on purpose; report each seed's first master day and what held it back.
- A master's good is a flavor like any other (R1A's likes and prices), so it counts toward the Merchants' and Patrons' variety; R3E checks the families add up.
- Choices go by days and id, never the `residents` stream.
- Do not edit `systems/supplies/**`, `systems/townbook/**`, `systems/market/round.ts` or the client; ask in your PR.
- Runs as the build and review loop (`31-parallel-development.md`), one or two rounds of quality check, dead-end hunt and player's chair before the PR.
