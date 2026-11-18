# P3A: Hands, food and growing buildings

**Iteration**: R2 to R3 (the owner's playtest of R2 and V3). **Wave**: serial, one master session running the build and review loop (`docs/spec/31-parallel-development.md`) with executor waves. **Branch**: `cycle/p3a-hands-food`. **Ports**: client 5250, relay 8860.
**Depends on**: R2X (#56), V3X (#55), both on `main`. **Runs alongside**: P3B (the interface half of the same playtest: layout, the toolbar, the top bar, lenses, css) and R3.0 (`cycle/r3-0-supplies-contracts`: contracts, `content/types.ts`, `sim/state/**`, save version 9).

## Goal

A pair of human players, who do not play like the autoplayer, grow a hamlet into a Village without the spiral of too few hands, then too little food. Basic buildings cost less and go up faster. A building that does well visibly becomes a better one, soon enough and plainly enough that a player notices.

## Input: the owner's words (2026-11-17, after playing `main`)

"i seem to almost always struggle with lack of workers, lack of food as a result, i think we can reduce resource requirements for basic buildings, and increase building speed. also can have tiers of buildings, where they become better over time if they're successful."

The owner's notes on the cluttered interface are P3B's; screenshots of things that look off go to the look wave.

## Read

- `CLAUDE.md`
- `docs/spec/13-ledger.md`: Zoning and growth (Levels), Construction, Households, Population tiers, Tuning targets, both What holds sections
- `docs/spec/19-evenings.md`: As built (R2X), "Newcomers follow good evenings"
- `docs/spec/22-quality.md`: the lanes test, Playability from the redesign, budgets
- `docs/build/cycle-r2x-integration.md` and `docs/build/cycle-p2-playtest.md` (As built: P2 is the model for a playtest cycle)
- `tools/bench`: the autoplayer, the audit, `npm run tune`, `npm run outcomes`

## You own

- `tools/bench/**` (the newcomer profile, the audit's new flag)
- `packages/content/src/**` numbers (costs, work, crews, places' growth numbers), never `types.ts`
- Small, local edits in `packages/sim/src/systems/{growth,construction,levels,residents}` and `packages/sim/src/view/**` (words, the inspector's level line)
- Words only in `apps/client/src/ui/**` (copy, alerts, demand words, hands); P3B owns the layout

Outside these paths: only small, necessary edits, listed in the PR.

## You can rely on

- R1's zones-first Ledger, R2's evenings and the growth gate (`systems/growth/evenings.ts`), P2's demand reasons and feed lines, the levels system (`systems/levels`), R1X's `HANDS_WAITING`, the health watch and the audit.

## Tasks

1. **Reproduce it before changing a number.** Give the bench a newcomer profile that plays like a person: workplaces before homes, zoning late and in lumps, no places for the first evenings, no ideal order, several sites at once. Run it on every bench seed and find where hands run short and food follows. Suspects to check, not to assume: the growth gate (past `growthFreeHouseholds` 16, homes for newcomers come only as fast as fair evenings send grown-ups out, `growthFullOutPercent` 40); the pace of arrivals; jobs outrunning hands as crews grow by level; builders and porters being the same hands the farms need; the timber, stone and work the first homes, farmsteads and specialized buildings ask for; which jobs fill first when hands are short. Play the first two hours in the browser as a newcomer would.
2. **Fix it at the cause**, numbers in content, never in a system: lower the material needs of the basic buildings, raise building speed, fill food jobs first when hands are short, loosen the growth gate if it is what starves a human's town (both lanes must still matter). Where the town waits on something, one line on screen says what and which lever moves it (words only).
3. **Buildings that grow with success.** Find out whether levels are too slow, too quiet or not visible. A business that does well reaches level 2 inside the first evenings of a normal game; the moment is plain (a feed line, the building visibly bigger, its inspector saying what the next level needs and how far along it is); homes' tiers read the same way. For specialized buildings with no levels (granary, lodge, mill and the like), a one-page proposal to the master before building anything.
4. **The dead-end hunt learns the class.** The audit gains the newcomer profile and flags a hands spiral: food jobs unfilled for days while workplaces elsewhere are staffed or sites pile up, with no line on screen naming the lever.
5. **Retune** so the standing targets hold on every bench seed, and say in the PR where one moved: Village in about two evenings, a third of hands in food, decisions under 150, the winter test keeps its teeth, the lanes test passes, benches in budget, a year's hash alike in Node and a browser worker. Regenerate golden hashes only where the numbers changed them.

## Acceptance criteria

- [ ] The newcomer profile reaches Village rank on every bench seed with no day where homes go hungry because food jobs stood unfilled, and the audit's new flag is clean; the numbers before and after are in the PR.
- [ ] The first homes and the first farmstead go up markedly faster than on `main` (both times given), on less timber and stone.
- [ ] A business that does well reaches level 2 in the first evenings and the player is told; the specialized buildings proposal is with the master.
- [ ] The standing targets hold or the PR says which moved and why; typecheck, lint, unit tests, build, bench and e2e pass.
- [ ] Spec updated where behavior changed (`13-ledger.md`, `22-quality.md`), a CHANGELOG line, the board row, As built here, screenshots `p3a-*` from the master's own play.
- [ ] Definition of done in `docs/spec/22-quality.md`

## Out of scope

- Layout of the interface (P3B). Render or art paths beyond what Levels already draw (a level that needs a look that does not exist is named in the PR).
- Any saved shape or contract change: R3.0 owns `packages/sim/src/contracts/**`, `packages/content/src/types.ts`, `packages/sim/src/state/**` and save version 9. A field this cycle truly needs is proposed to the master, who routes it to R3.0.
- Levels for the specialized buildings (a proposal only, until the master answers).

## Notes

- R3.0 is wiring one-line readers into `systems/{residents,production,levels,market,carrier,festivals,gaps,logistics}`: keep edits there small and local so the merge is easy.
- Known CI noise: the bench line "growth night R1B" swings around its 2 ms budget; `street.test.ts` "runs in well under 2 ms" failed once at 6.06 ms against 6.
- Report to the master session (`session_01PQ4wXdf2kocite7BdVtBYP`) with `send_message`: a short note once task 1 has an answer, then the PR link, the cause, before and after numbers, what passed and what is left.

## As built (draft, 2026-11-18)

Run as the build and review loop: the master traced, decided and tuned; three `executor` agents built the client's level and tier words, the sim tests for the six new rules, and the tests that pinned the old building numbers. This is a draft: the standing targets do not all hold yet (below), and the PR lists what remains.

**Task 1, the cause.** The newcomer profile (`tools/bench/src/newcomer.ts`, `npm run newcomer -w @qoti/bench`) reproduced the owner's spiral on `main`: birch never reached Village in 70 days (12 to 13 residents for three weeks), willow and oak only on days 37 and 38, with households missing breakfast on 20 to 22 Hamlet days. The causes, traced in the runs: (1) job ranks: with timber or stone short for sites and food short, a lodge's and a quarry's every hand tied with the first porter, the first builder and every fisher, so a hamlet of 13 had its lodge and quarry full and no porter, and nothing reached a site or a shelf; (2) growth started farms before homes, so homes, the only source of hands, waited behind farms that stood empty; (3) basic buildings needed many porter trips; (4) food did not reach homes beyond a stall's reach once porters had stocked the stall from a bare granary, and a lone Early Bird's evening errand fell after their bedtime; (5) in spring a town that ate its larder in winter took a crowd of newcomers. The evenings gate was not the cause (2 of 280 newcomer days).

**What changed**: `13-ledger.md`, As built (P3A), under Zoning and growth, Construction and Levels; `22-quality.md`, Playability (`hands-spiral`, the newcomer runs in the audit). Screenshots `docs/build/screenshots/p3a-*` (the player's chair: a business's road to its next level, a Settler home's road to Craftsfolk, the Ledger's feed in a newcomer's hamlet and in a Village, the first morning of a fresh valley played as a newcomer).

**Numbers** (70 days; first homes and first farmstead from site to roof): see the PR for the tables. The newcomer profile reaches Village on every seed (day 13 to 33 on the six bench seeds, against 37, 19, 38 and never on `main`'s four), its first homes go up in 9 to 15 hours and its first farmstead in 14 hours (11 to 204 and 31 to 34 on `main`), and Hamlet days with a household missing breakfast fall from 5 / 0 / 20 / 22 to 0 / 0 / 0 / 1.

**Left**: see the PR (standing targets that moved, failing bench tests, the Village purse hunger found on `main` too, the specialized buildings' levels proposal with the master).
