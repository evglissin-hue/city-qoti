# R2C: Gaps and the evening's book

**Iteration**: R2 The evening round. **Wave**: parallel. **Branch**: `cycle/r2c-gaps-book`, from `cycle/r2x-integration`; PR into `cycle/r2x-integration`. **Recommended effort**: high.
**Depends on**: R2.0. **Runs alongside**: R2A, R2B, R2D to R2F, and V3's wave. **Ports**: client 5233, relay 8843.

## Goal

Requests return without a form. From Village rank the town posts a gap when one lane's work waits on the other's, says in words what would close it, closes it by itself and credits the seat that built the piece that closed it. The evening closes with its tally and its edition: three to five lines about the day across both lanes, each crediting a seat by name where one lane fed the other, and the season report puts the cross-lane lines first. The Charter, the feats, the Together goals and Odette's arc count closed gaps and good evenings where fulfilled requests and charm counted.

## Read

- `CLAUDE.md`; `docs/build/r2-wave-notes.md`
- `docs/spec/19-evenings.md`: Gaps (the R2 rows; the R3 row is not built), the evening's tally (Good evenings), Data and budgets, the R2 acceptance
- `docs/spec/16-coop.md`: Gaps [R2, R3], the evening edition; `docs/spec/17-presentation.md`: The redesign's interface (the edition, gaps, the season report as one spread)
- `docs/spec/15-progression.md`: the [R2] notes (the Village's evening goal, the three feats); `docs/spec/14-challenge.md`: Together goals; `docs/spec/11-residents.md`: arcs that read requests
- `docs/spec/20-architecture.md`: R2 contracts; `packages/sim/src/contracts/evenings.ts`

## You own

The R2C paths in `r2-wave-notes.md`: `packages/sim/src/systems/gaps/**`, `view/gaps.ts`, `view/evening.ts`, `view/season/index.ts`, `systems/festivals/together.ts`, `systems/stories/**`, `conditions/**`, `systems/achievements/**`, `commands/request.ts`, content `gaps.ts`, `achievements.ts`, `charters.ts`, and their tests (`packages/sim/test/r2c/**`).

## You can rely on

- R2.0's contracts and stubs: `Gap`, `GapStreak`, `GapsState` (`state.gaps`: `open`, `closed`, `streaks`, `closedCount`, `closedBySeat`, `credited`), `GapDef` and `content.gaps` (in GAP_KINDS order: `nothingToSell`, `nobodyPasses`, `nowhereToGo`, and R3's `shortOfSupplies`), `EveningTally`, `EveningsState` (`tonight`, `history`, and the runs `outRun`, `allOut`, `stoodThisSeason`, `seatedSeasons` that you keep), `EditionLine`, `EveningView`, `GapView`, `GapsView`; the gaps system (order 79, 21:00 plus 10 ticks); `findGap`, `openGap`, `closeGap` (`gaps/api.ts`); `gapView`, `gapsView`, `eveningView`, `townEvenings`; the `CountWhat`s `gapsClosed`, `gapsClosedEachSeat`, `eveningsOut`, `eveningsAllOut`, `seatedSeasons` (counting 0 until you count them); the feats Out of an Evening, A Seat for Everyone and Mind the Gap with their conditions.
- R2A's `PlaceState` counts (`visitors`, `served`, `sold`, `takings`, by evening, the last entry the evening just closed) and R2B's score and sales in `tonight`, as they land; fixtures until then.

## Tasks

1. **The three R2 gaps** read at 21:00 from Village rank, numbers from `content.gaps` (`threshold`, `openAfter`, `closeAfter`): a place with nothing to sell (`threshold` visitors on `openAfter` evenings running, `served` 0; closes when an outlet serves there for `closeAfter` evenings); a shop nobody passes (Treats on its shelf and under `threshold` customers on `openAfter` evenings; closes when a place within 3 tiles draws 8+); nowhere to go (`threshold` households of a street stayed in `openAfter` evenings running for want of a place; closes when half of them go out). Keep streaks in `gaps.streaks`; subjects as `Gap`'s doc says; deduped; never in a Hamlet.
2. **Credit**: the closer is the seat whose command built the piece that closed it (the outlet, the seat piece, the place's member: `builtBy`); both seats when both laid it; once a place a season (`gaps.credited`, cleared when a season starts). Saved on the gap (`closers`); `closedBySeat` counts.
3. **The tally and the edition** at 21:00: keep the runs (`outRun` for fair evenings with half out, `allOut`, `stoodThisSeason` and `seatedSeasons` at a season's turn); then three to five `EditionLine`s in words, each crediting the seats it names ("Kat's lantern walk brought 34 folk past the pie stall: 21 coins"), a gap closed that day first; a day with nothing to say gets one honest line. Emit `evening.closed` with `eveningView`, and `gaps.updated` when a gap opens, changes or closes.
4. **The joint season report**: the cross-lane lines first, then each lane's page; same data in both lenses (`view/season/index.ts`; the layout is R2D's).
5. **Counts**: the five `CountWhat`s; Together goals, Odette's arc and the Charter read closed gaps where fulfilled requests counted; add the Village's goal "half the grown-ups out on three fair evenings" (`eveningsOut`, target 3) to the Village Charter together with its counter, in one commit, and check the autoplayer (R2E's) can still claim the Village.
6. **Achievable**: no gap, goal or feat is offered that the town cannot meet; extend the achievable check (`systems/hearth/wishes/achievable.ts` and the audit, through their registries) and list the edits in your PR.
7. **Words**: rewrite `content/gaps.ts`' first words as needed: warm, dry, never babyish, US spelling, no em dashes; each says what would close it.
8. Tests: each gap opens and closes in a headless run; credit goes to the right seat and only once a season; no gap in a Hamlet; the edition's lines are deterministic, 1 to 5, and name the right seat; the Village goal counts fair evenings only; the gaps pass under its share of 1 ms an hour.

## Acceptance criteria

- [x] `grep -rn "R2 stand-in (R2C)" packages apps tools --exclude-dir=dist` is empty.
- [x] Each R2 gap opens and closes in the bench's autoplayed town, and closing one credits the right seat (R2E runs it; your own test until then). (R2C's own tests, `test/r2c/gaps.test.ts`.)
- [x] The edition has 3 to 5 lines on a day with news (one honest line otherwise), names the seat and the numbers, and is the same in both seats' snapshots.
- [ ] No goal, gap or feat is unreachable (the achievable check passes with the new rows); the Village is still claimed on every bench seed. (The achievable half passes, gap-dead-end included; the Village claim waits for R2A's 17:00 roll, so R2X merges R2A first.)
- [x] A year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.

## Out of scope

The cards, feed rows, paper tags and the report's layout (R2D); the R3 gap; places, the round, the score and sales (R2A, R2B).

## Notes

- "The evening's book" is the tally and the edition (numbers and lines), not a new book panel.
- `request.*` stays for free-text asks, without the ask form.
- Seat names in the edition come from `state.seats`; a line naming a seat that has left still reads well.

## As built

- **The gaps pass** (`systems/gaps/`, order 79 at 21:10): on a season's first day it clears `gaps.credited`; it does nothing more unless an evening happened today (`tonight.day` is today). It keeps the runs (`runs.ts`, every rank, a Hamlet included): `outRun` counts fair evenings with half the grown-ups out and breaks on a fair evening below half, `allOut` counts fair evenings with every grown-up out, rain and storm hold both; `stoodThisSeason` counts non-storm evenings with someone standing, and on a season's last day `seatedSeasons` grows when all six evenings are in the history, nobody stood and every non-storm evening had someone out (a season nobody went out is not a seated one). Then, from Village rank on a fair evening, the three rules (`rules.ts`), each walking its subjects in sorted order with one streak per subject in `gaps.streaks`: a place with nothing to sell (last `visitors` at `threshold` and last `served` 0; closes when `served` is above 0), a shop nobody passes (a Treats outlet with Treats on the shelf whose places within 3 tiles had under `threshold` visitors; closes when one of them draws `nothingToSell.threshold`, 8, the spec's "draws 8+"), nowhere to go (households of a street, by their lot's frontage or the road beside the home, whose grown-ups planned and reached no place; closes when half of the street's planning households went out). Rain and storm hold every streak and gap. A gap whose subject is gone is dropped (`dropGap`: no credit, no count, not listed). A kind the town cannot meet (`achievable.ts`, `gapAchievable`: an outlet to be had, a seat piece to be had) opens nothing and keeps its streaks, while its open gaps still close. `gaps.updated` goes out once a pass when something opened, closed, dropped or changed its number; `evening.closed` every evening with `eveningView`.
- **Credit** (`credit.ts`): a piece placed by hand credits its `builtBy`; a business grown on a lot (growth writes seat 0) credits the seats in the Ledger lens, whose zoning grew it; a place credits whoever laid its decor, or its buildings' seats when it has none; both seats when both laid it. Once a subject a season (`gaps.credited`).
- **What a shop nobody passes measures.** Per-outlet evening customers are not saved anywhere (R2A's `recordSale` counts by place), so "customers" is read as the visitors at the places within 3 tiles; the words say "{folk} came by", not a count of treats sold. R2X may tune it once R2B's per-outlet sales exist.
- **The edition** (`view/evening.ts`): pure, so both snapshots agree; it never reads `treatsDoorstep` (the doorstep errand is at 21:30). Candidate lines in order: gaps closed today (crediting the closers), the busiest place with both lanes' credit ("The Promenade, Kat's doing, brought 34 folk past the Underbank shop: 21 coins in Sam's till."), who went out and the average, treats on the round, gaps opened today, friendships, standing, the next busiest place, rain. Five at most; a day with news pads to three; a day without news gets one honest line ("A storm kept the whole town in. The kettles did well out of it.").
- **The season report** gains `together` (`view/season/evening.ts`, track `evening`): gaps mended by seat, two of them in their own words, the season's busiest place with both lanes' credit, the share of grown-ups out on an average evening, and the friendships made. The hearth and ledger pages are unchanged; R2D lays the spread out.
- **Counts** (`conditions/index.ts`): the five R2 `CountWhat`s read `state.gaps` and `state.evenings`; `gapsClosedEachSeat` is the fewer of seats 0 and 1; `requestsFulfilled` adds `gaps.closedCount`, so closed gaps count wherever fulfilled requests did (the guide's partnership letter, Together goals). Odette's R1 arc no longer reads requests, so nothing there changed. The three evening feats have their setups in `hearth/achievements.test.ts`.
- **The Village's evening goal** ("Half the grown-ups out, 3 fair evenings running", `eveningsOut`, target 3, Hearth lane) went in with its counter in one commit, last on the branch. On this branch R2A's 17:00 roll is a stand-in (nobody goes out), so with the goal the bench cannot claim the Village: R2X merges R2A before R2C (the master's call). `test/r2c/village-goal.test.ts` plays R2A's roll through the harness.
- **The audit** (`view/health.ts`, R2E's file, one block): `gap-dead-end`, an open gap a day old that nothing the town can build would close.
- **Contracts** (additive, each in its own commit): `SeasonReportView.together?`, `SeasonReportLine.track` gains `'evening'` and `seats?`; content `GapDef.closed?` and `closedQuiet?` and the `{folk}` placeholder. Outside R2C's paths: one line in `apps/client/src/ui/panels/SeasonCard.tsx` (`TRACK_MARK.evening`, so the client typechecks), the export of `gapAchievable` in `packages/sim/src/index.ts`, and the `view/health.ts` block.
