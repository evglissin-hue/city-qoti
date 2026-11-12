# R2.0: Evenings contracts

**Iteration**: R2 The evening round. **Wave**: serial. **Branch**: `cycle/r2-0-evenings-contracts`, from `cycle/r1x-integration` once R1X has merged into `main` (or from `main` if R1X is done by then); it ends by creating `cycle/r2x-integration` at its last commit.
**Depends on**: R1X. **Unblocks**: R2A to R2F, and V3.0 (the lot fields). **Runs alongside**: nothing in the sim; V3 starts when this lands. **Recommended effort**: xhigh. **Ports**: client 5230, relay 8840.

## Goal

The evening round's contracts exist in their final form, on a branch that compiles, passes its tests and runs a fresh valley on simple stand-ins, and the lot fields V3 draws from exist in their final shape. The six R2 cycles then build in parallel against types that will not move, each in files no other cycle edits. Policy is additive from the first line (`31-parallel-development.md`, Contracts policy): R2 renames and removes nothing except `beauty` and `social` as tier gates, which the evenings need replaces. This cycle writes the other R2 briefs' final versions and R2's wave notes, as R1.0 did.

## Read

- `CLAUDE.md`; `docs/build/r1-wave-notes.md` and R1X's As built in `docs/build/cycle-r1x-integration.md` (what R1 became)
- `docs/spec/19-evenings.md`: all of it down to Gaps, with Data and budgets and the R2 acceptance (skip the R3 sections except for their saved fields)
- `docs/spec/20-architecture.md`: Redesign outline, R2; `docs/spec/21-networking-and-saves.md`: Saves
- `docs/spec/22-quality.md`: the R2 budget rows and the lanes test
- The [R2] notes in `02-game-overview.md`, `10-world-and-building.md` (Roads, Decor), `11-residents.md`, `12-hearth.md`, `13-ledger.md` (Lots, Population tiers, Streets), `14-challenge.md`, `15-progression.md`, `16-coop.md`, `17-presentation.md` (the redesign's interface)
- `docs/spec/30-roadmap.md`: R2, V3; `docs/build/i4-visual-planning-notes.md`: V2 (streets that fill their frontage), the lot fields
- `docs/spec/31-parallel-development.md`: Waves and cycles, Contracts policy, Integration cycles, Writing a brief

## You own

`packages/sim/src/contracts/**`, `packages/content/src/types.ts` and the content data that must exist for the contracts to validate (`decor.ts` and `villageDecor.ts` seats and the brazier, `achievements.ts` ids), `packages/protocol/src/messages.ts` (additive), `packages/sim/src/commands/**` (the three new commands' shapes), `packages/sim/src/state/**` (version 7, the migration), `packages/sim/src/map/layers.ts` (the footfall layers), `packages/sim/src/rng/streams.ts`, `packages/sim/src/systems/index.ts` (the new slots), `packages/sim/test/**` for the above, `test/every-command-has-a-sender.test.ts` (the owed list), new `docs/build/r2-wave-notes.md`, the briefs `docs/build/cycle-r2{a,b,c,d,e,f,x}-*.md`, an "R2 contracts" section in `docs/spec/20-architecture.md`. R1X's As built decides anything R1 left open.

## Tasks

1. **State** (final shapes, optional where a fresh read must not break): `map.footfallDay` and `map.footfallEve` (Uint16 layers, halved at 04:00); the `evening` bit in the road layer's spare bits; street names by road run (`state.streets`); the `evenings` need on residents in place of `beauty` and `social` for tier gates (the old need kinds stay in the union, unused); `Resident.evening` (last score, the stops of today's round, what happened at each: `Resident.round`); `state.places` (by stable id: name, priority slot kept for R3, visitors and takings for the last six evenings, the running counts gap rules read); `state.gaps` (open gaps with kind, subject, opened day, closer seat); the lingering-evening valley setting (`ValleySettings.eveningLingers?`, default on). Derived, not saved: a place's seats, kinds, draw and serves (`Place`, rebuilt on load and hourly).
2. **Lots** for V3 (`contracts/village.ts`, `LotView`): `Lot.row` (an id shared by lots cut from one run), `Lot.kind` (`'plot' | 'garden'`), `Lot.corner` and `Lot.frontage2`, `params.storeys` on a grown building (saved). Decide the planning questions in `i4-visual-planning-notes.md` and record them in the wave notes: a garden lot is never built on and is not paintable by hand; its tiles count for charm as ordinary ground; it is no pattern site; a row is restyled by house; growth picks the corner lot's def by the busier road. Stand-in cutter: every lot gets `row: 0`, `kind: 'plot'`, no corner and storeys by tier.
3. **Content types**: `DecorDef.seats` and `DecorDef.standing`; `PlaceKind` ids (`sit`, `eat`, `view`, `play`, `meet`, `walk`); the seat numbers of `19-evenings.md` on every existing seat piece, as data (all *(tune)*); the brazier as a Village decor piece (8 standing, warm); host capacities on the tavern and Bath House; `GapDef` shapes; the draw's constants as one `PLACES` content table so R2X tunes in one file. Content validation tests: every seat piece has seats; every host has capacity.
4. **Commands** (shapes, handlers that validate and store, no behavior): `road.setEvening { tiles, on }`, `road.rename`, `place.rename`. Each gets a sender entry on `OWED_SENDERS` naming R2D. New events and views: `places.updated`, `evening.closed` (the edition's lines, each with a seat credit), `gaps.updated`; `ViewSnapshot` additions; an `AgentView.pose` (`stand | sit | carry`) and `carry` good for the round to be watched (the drawing is V3's; check against V2X's As built and V3.0).
5. **Systems**: register `places` and `gaps` with stand-ins (a place pass that finds none; a gaps pass that opens none), a `round` RNG stream (appended), and keep the system order test true; say in the wave notes where each R2 system runs in the day. Mark each stand-in `// R2 stand-in (R2x): ...` and list it with its replacing cycle in the wave notes. The round's cross-track API (`placesNear`, `placeById`, `recordVisit`, `recordSale`, `eveningScore`, `openGap`, `closeGap`) is typed here with stubs.
6. **Saves**: `SAVE_VERSION` 7, a migration 6 to 7 (the new layers zeroed, `evenings` seeded at 50 for existing residents, no places, no gaps) and its test; the hash covers the new state; golden files regenerated. (Check against R1X's As built for the version R1 shipped.)
7. **Wave notes** (`docs/build/r2-wave-notes.md`): file ownership for R2A to R2F file by file (R2A and R2B share `systems/residents` and `systems/market`: split them by file), stand-ins, handshakes (who writes which state, the order of systems in a day, the evening's score: R2A records stops, R2B computes at 21:00), the wave's ports (R2A 5231 and 8841 up to R2F 5236 and 8846, R2X 5237 and 8847), skipped specs.
8. **Briefs**: rewrite the seven briefs from these drafts against the final types; each wave cycle branches from `cycle/r2x-integration` and opens its PR into it; R2X merges, tunes and opens the one PR into `main`.
9. **Finish**: push `cycle/r2-0-evenings-contracts`, then the same commit as `cycle/r2x-integration`. Tell V3.0's author the lot fields have landed. Update the board row.

## Acceptance criteria

- [ ] The new contracts match `19-evenings.md` (Data and budgets) and the Redesign outline's R2; content validation passes.
- [ ] A fresh valley and a version 6 save (migrated) run 10 in-game days on stand-ins with no error, the money invariant intact and the same hash twice, in Node and a browser worker.
- [ ] Typecheck, lint, unit tests, build and bench pass; e2e passes; golden regenerated.
- [ ] The lot fields are in `LotView` and the saved state, with a migration test; V3.0 can read them.
- [ ] Every new command has a handler test and an owed sender; `OWED_SENDERS` names R2D.
- [ ] The wave notes and the seven briefs are written; `cycle/r2x-integration` exists at this cycle's last commit; the "R2 contracts" section, `CHANGELOG.md` and the board row are done.

## Out of scope

The real systems (A to C), the interface (D), the bench (E), the cutter itself (F), any render or art path (V3's).

## Notes

- Every number in `19-evenings.md` is *(tune)*; put each in content, never in a system.
- Per-good quantities stay arrays indexed by good index. A place's stable id: its pattern and anchor tile, the lowest seat piece id for a sitting spot, the building id for a host.
- Keep stand-ins cheap: R2A to R2F each replace theirs and R2X greps for what is left.
