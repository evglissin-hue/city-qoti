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

## As built (2026-11-22)

Two sessions, each run as the build and review loop. The first traced the spiral and built the fixes below (three `executor` agents built the client's level and tier words, the sim tests for the new rules, and the tests that pinned the old building numbers). The second brought the standing targets back (ablations on every seed), traced the missed meals and the end-of-winter larder with two executors, fixed three autoplayer dead ends, and ran the checks; the master played a newcomer's first days in the browser for the screenshots (`p3a-newcomer-morning1.png`, `p3a-newcomer-hands-short.png`: with 8 folk and 12 jobs open the Ledger's feed said "Zone more Homes. Newcomers would come: there is work, and the town draws them." and "3 workplaces have nobody yet. 12 jobs are open; more Homes bring more folk."; Homes zoned off a street got "Homes: land is zoned for it, but no street runs along it. Lots are cut along streets.").

**Task 1, the cause.** The newcomer profile (`tools/bench/src/newcomer.ts`, `npm run newcomer -w @qoti/bench`) reproduced the owner's spiral on `main`: birch never reached Village in 70 days (12 to 13 residents for three weeks), willow and oak only on days 37 and 38, with households missing breakfast on 20 to 22 Hamlet days. The causes, traced in the runs: (1) job ranks: with timber or stone short for sites and food short, a lodge's and a quarry's every hand tied with the first porter, the first builder and every fisher, so a hamlet of 13 had its lodge and quarry full and no porter, and nothing reached a site or a shelf; (2) growth started farms before homes, so homes, the only source of hands, waited behind farms that stood empty; (3) basic buildings needed many porter trips; (4) food did not reach homes beyond a stall's reach once porters had stocked the stall from a bare granary, and a lone Early Bird's evening errand fell after their bedtime; (5) in spring a town that ate its larder in winter took a crowd of newcomers. The evenings gate was not the cause (2 of 280 newcomer days).

**What changed**: `13-ledger.md`, As built (P3A), under Zoning and growth, Construction and Levels; `22-quality.md`, Playability (`hands-spiral`, the newcomer runs in the audit). Screenshots `docs/build/screenshots/p3a-*` (the player's chair: a business's road to its next level, a Settler home's road to Craftsfolk, the Ledger's feed in a newcomer's hamlet and in a Village, the first morning of a fresh valley played as a newcomer).

**Numbers**: the PR has the tables. The newcomer profile reaches Village on every seed (day 19 on five of the six bench seeds, 32 on birch; `main`: 37, 19, 38 and never on its four), with no Hamlet day where a household missed breakfast (`main`: 5, 0, 20 and 22), its first homes up in 9 to 15 hours (11 to 204 on `main`) and its first farmstead in 14 to 37. The tuned autoplayer has no lean day on any seed and 99 to 153 Ledger decisions (willow's 153 is the one over; the lanes test's runs send 94 to 149).

**The second session's findings.** (1) The lean days (willow 10, oak 5) and hazel's 169 decisions came from a faster growth pace the first session tried (three homes waiting, one more start and site for homes), not from the money rules: back at `main`'s pace both hold, and the newcomer keeps everything above. (2) Willow never built a herbalist: the service search tried one spot by a door every visit and the planner refused it each time (fixed; `heldActions` now flags the class). (3) Plain food first cost variety; a household now buys what it likes when its purse covers every mouth. (4) The places advisor ran past its three commands and set a shop's pieces apart (fixed). (5) Missed meals: the larder errand left on the hour turn, after breakfast; a household now leaves at dawn and walks to the shelf that can feed it; `meals-missed` no longer calls a shelf too thin for its queue "food in reach". (6) The bench's end-of-winter larder ran dry because the autoplayer spent its autumn on building: it now keeps the coins the carrier needs for the winter mark. (7) Hazel's larder ran five short at the end of its second winter: the autoplayer now sets the carrier's Food reserve to six days once it is a Village, as a player would; the money advisor no longer repays the winter food money; the treats-unsold check counts sales at a shop's own door; a gap nothing can close any more is dropped (it reopens when ground frees). (8) The audit's newcomer runs found the Hearth's garden beds stalled (its own decor walled a bed's door before the bed went down; a stocked site waited twelve hours to be put first) and a street tree held at a door every visit: fixed. One flag is explained, not fixed: Treats unsold at a stall in hazel's newcomer run, where every refusal was the purse (200 to 292 pennies against a 300-penny Treat).

**Moved, for the master**: the Craftsfolk share. Over days 40 to 70 it averages 15.0% on the four seeds against `main`'s 19.1% (at day 70: 5, 9, 15 and 18% against 13, 21, 9 and 38). Households lack Treats, Wares and savings on both; supply is not short (hazel makes Wares on both and households buy few), and neither the food reserve nor plain food moves it by more than a point. The PR says so at the top.

**Levels for specialized buildings: handed to R3** (the master's call, 2026-11-17: none of it in P3A; its own cycle in the R3 wave, with the additive `BuildingDef.levels` landing with R3.0's contracts). The starting table, earned like a business's levels (good days running, sliding back after four failing), each level a bigger building, never a multiplier:

| Building | A good day | Level 2 | Level 3 |
|---|---|---|---|
| Forester's Lodge | felled with its wood above its rule, the timber carried off | crew 4, wood reach 10 tiles | crew 5, reach 12 |
| Quarry | cut and carried | crew 4 | crew 5 |
| Fishery | a catch carried (frozen days count neither way) | crew 4, a second jetty | crew 5 |
| Market Stall | 8 customers | food reach 18 tiles, a second vendor | reach 22 |
| Granary, Storehouse | at least half full with every porter at work | storage +40%, one more porter | storage +80% |
| Windmill | every baker in reach had grain | one more baker (2 to 3, raised 4 to 5) | one more again |
| Sawmill, Brickworks, Trading Post | made, or carried, and taken off | crew or load one step | one step more |

Nothing new in saved state (`Building.level` and `Building.counters` exist on every building). Needed elsewhere: the content field; `jobsOf` and the storage, reach and capacity readers reading it; `levels/counters.ts` counting made and sold for any building with `def.levels`; a look for each level in the art kits (none draws one for a specialized building today).
