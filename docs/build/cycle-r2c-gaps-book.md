# R2C: Gaps and the evening's book

**Iteration**: R2 The evening round. **Wave**: parallel. **Branch**: `cycle/r2c-gaps-book`, from `cycle/r2x-integration`; PR into `cycle/r2x-integration`. **Recommended effort**: high.
**Depends on**: R2.0. **Runs alongside**: R2A, R2B, R2D to R2F, and V3's wave. **Ports**: client 5233, relay 8843.

## Goal

Requests return without a form. From Village rank the town posts a gap when one lane's work waits on the other's, says in words what would close it, closes it by itself and credits the seat that built the piece that closed it. The evening closes with its tally and its edition: three to five lines about the day across both lanes, each crediting a seat by name where one lane fed the other, and the season report's cross-lane lines. The Charter, the feats and the arcs count closed gaps and good evenings where fulfilled requests and charm counted.

## Read

- `CLAUDE.md`; `docs/build/r2-wave-notes.md`
- `docs/spec/19-evenings.md`: Gaps (the R2 rows only; the R3 row is not built), the evening's tally (Good evenings), Data and budgets, the R2 acceptance
- `docs/spec/16-coop.md`: Gaps [R2, R3], the evening edition, shared lenses
- `docs/spec/17-presentation.md`: The redesign's interface (the evening edition, gaps, the season report as one spread)
- `docs/spec/15-progression.md`: the [R2] notes (the Village's evening goal, the three feats); `docs/spec/14-challenge.md`: Together goals
- `docs/spec/11-residents.md`: story arcs that read requests; `docs/spec/20-architecture.md`: R2 contracts

## You own

The R2C paths in `r2-wave-notes.md`: new `packages/sim/src/systems/gaps/**` (rules, closing, credit), `commands/request.ts` (free-text asks stay; closed gaps count where fulfilled requests did), new `view/evening.ts` and `view/gaps.ts` (the tally and the edition's lines), `view/season/index.ts` (the joint report's cross-lane lines; the spread's layout is R2D's), `systems/festivals/together.ts` (Together goals count closed gaps), `systems/stories/**` and `conditions/**` (a closed gap as an arc condition, where R1D left requests), `systems/achievements/**` and content `achievements.ts` (Out of an Evening, A Seat for Everyone, Mind the Gap), `charters.ts` (the Village goal: half the grown-ups out on three fair evenings), new content `gaps.ts` (the words), and their tests (`test/r2c/**`).

## You can rely on

- R2.0's contracts: `state.gaps`, `GapDef`, `openGap` and `closeGap` stubs, `gaps.updated`, `evening.closed`, `state.places` counts, `Resident.evening`.
- R2A's place counts (visitors, seats) and R2B's `recordSale` as they land; before then, fixtures.

## Tasks

1. **The three R2 gaps** with their rules and words from `19-evenings.md` (a place with nothing to sell; a shop nobody passes; nowhere to go), opening from Village rank, deduped by subject, closing by themselves; the numbers (8+ visitors, under 4 customers, 6+ households, two or three evenings running) live in content *(tune)*.
2. **Credit**: the closer is the seat whose command built the piece that closed the gap (track the last builder of the outlet, seat or place piece), once a place a season so pulling a stall down and putting it back earns nothing; both seats when both laid it. Saved on the gap.
3. **The evening's tally and edition** at 21:00: the share of grown-ups out, the average evening, each place's visitors, seats and takings, friendships made, then three to five lines in words, crediting seats by name ("Kat's lantern walk brought 34 folk past the pie stall: 21 coins"); `evening.closed` carries them; a gap closed that day leads. A day with nothing to say still gets one honest line.
4. **The joint season report**: the Chronicle entry and the report view put the cross-lane lines first, then each lane's page; same data in both lenses.
5. **Counts**: Together goals, Odette's arc and the Charter read closed gaps and good evenings; the Village goal "half the grown-ups out on three fair evenings" (an evening lost to weather does not count); the three feats.
6. **Achievable**: no gap, goal or feat is offered that the town cannot meet; extend the achievable check (R1F and R1D own it; add rows through its registry and list them in your PR).
7. Tests: each gap opens and closes in a headless run; credit goes to the right seat and only once a season; a gap never opens in a Hamlet; the edition's lines are deterministic and name the right seat; the Village goal counts fair evenings only; the gaps pass under its share of 1 ms an hour (with the R3 rows absent).

## Acceptance criteria

- [ ] Every R2C stand-in is gone (`grep -rn "R2 stand-in (R2C)"` is empty).
- [ ] Each R2 gap opens and closes in the bench's autoplayed town, and closing one credits the right seat (R2E runs it; your own test until it lands).
- [ ] The edition has 3 to 5 lines, names the seat and the numbers, and is the same in both seats' snapshots.
- [ ] No goal, gap or feat is unreachable (the achievable check passes with the new rows).
- [ ] A year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.

## Out of scope

The cards, feed rows, paper tags on the ground and the report's layout (R2D); the R3 gap (a place short of supplies); anything about places or the round (R2A, R2B).

## Notes

- "The evening's book" is the tally and the edition (numbers and lines, not a new book panel); R2D draws them. If the owner wants a page for it, that is a new design, not this cycle.
- `request.*` commands stay for free-text asks, without the ask form.
- Words are warm, dry and never babyish; no em dashes; each gap's words say what would close it.
