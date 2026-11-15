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

- [ ] `grep -rn "R2 stand-in (R2C)" packages apps tools --exclude-dir=dist` is empty.
- [ ] Each R2 gap opens and closes in the bench's autoplayed town, and closing one credits the right seat (R2E runs it; your own test until then).
- [ ] The edition has 3 to 5 lines on a day with news (one honest line otherwise), names the seat and the numbers, and is the same in both seats' snapshots.
- [ ] No goal, gap or feat is unreachable (the achievable check passes with the new rows); the Village is still claimed on every bench seed.
- [ ] A year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.

## Out of scope

The cards, feed rows, paper tags and the report's layout (R2D); the R3 gap; places, the round, the score and sales (R2A, R2B).

## Notes

- "The evening's book" is the tally and the edition (numbers and lines), not a new book panel.
- `request.*` stays for free-text asks, without the ask form.
- Seat names in the edition come from `state.seats`; a line naming a seat that has left still reads well.
