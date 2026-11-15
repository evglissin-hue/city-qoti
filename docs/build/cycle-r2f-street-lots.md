# R2F: Lots for streets

**Iteration**: R2 The evening round. **Wave**: parallel. **Branch**: `cycle/r2f-street-lots`, from `cycle/r2x-integration`; PR into `cycle/r2x-integration`. **Recommended effort**: high.
**Depends on**: R2.0. **Runs alongside**: R2A to R2E, and V3's wave (V3B draws what this builds). **Ports**: client 5236, relay 8846.

## Goal

The lot cutter fills a street's frontage with lots that touch, gives the blocks behind them garden lots, gives each road corner a lot with two frontages, and chooses storeys by tier and row, all in the fields R2.0 fixed, so V3B can draw joined rows, back gardens, corner buildings and rooflines that step. Nothing else about growth changes: the same zones, the same demand, the same hash for a town with no streets.

## Read

- `CLAUDE.md`; `docs/build/r2-wave-notes.md`
- `docs/build/i4-visual-planning-notes.md`: V2 (streets that fill their frontage), items 1 to 4 and its budgets, and R2.0's answers to its planning questions in the wave notes
- `docs/spec/13-ledger.md`: Lots (kept; R2 adds rows, gardens and corners); `docs/spec/17-presentation.md`: Visual direction, second pass, item 4
- `docs/spec/20-architecture.md`: R2 contracts (Lots); `docs/spec/30-roadmap.md`: R2, V3

## You own

`packages/sim/src/systems/zoning/**` (`lots.ts`, the hourly idempotent pass), `systems/growth/{site,recipes,api}.ts` (the def for a corner lot, `params.storeys`), content `zones.ts` (the per-road-class width and depth table, `ZoneDef`), `view/zones.ts` (the lot views carry the new fields; R1B's `view/demand.ts` and `view/businesses.ts` are not yours), the fixtures for lots in `packages/sim/test/fixtures/` (add your own beside them), and their tests (`test/r2f/**`).

Not yours: `systems/growth/{desirability,bars,outlets}.ts` (R2B), anything under `render` or `art` (V3).

## You can rely on

- R2.0's fields and stand-in cutter: `Lot.row`, `Lot.kind`, `Lot.corner`, `Lot.frontage2`, `params.storeys`, `LotView`, the saved shape and its migration.
- The cutter as built in C4B (frontage runs, shapes by weight, streets before lanes before paths, the hourly idempotent pass) and R1B's growth.

## Tasks

1. **Streets without gaps**: on a street (not a lane or path) in a town-density zone, the cutter fills the whole run with lots sharing their side lines; the one-tile gaps stay for lanes, paths and low-density zones. Widths 1 to 3 and depths 2 to 4 per road class come from `ZoneDef`, not code. `Lot.row` ties lots from one run so growth fills a row from one end.
2. **Garden lots**: the tiles behind a row, enclosed by the rows of a block, become `kind: 'garden'` lots, never built on, owned by the lots that back onto them; a block open on one side keeps that side open to the fields. R2.0's calls hold (not paintable, ordinary charm, no pattern site).
3. **Corner lots**: where two frontage runs meet at a road corner one lot takes the corner with two frontages (`corner: true`, `frontage2`); the entrance stays with the busier road; growth picks the corner lot's def by that road.
4. **Storeys by tier and row**: chosen by the sim and saved (`params.storeys`): a Merchants' townhouse three, a Commons cottage one and a half; neighbors in a row differ by at most one; four storeys is the ceiling outside landmarks; deterministic from the tier and the row's other members; lots of a row built later fit the row they join.
5. **Idempotent and stable**: the pass cuts the same lots from the same roads in any order of painting; an existing building's lot is never moved or cut out from under it (re-cutting leaves occupied lots alone); erasing a road releases only empty lots.
6. Tests: rows touch on a street and gap on a lane; a garden lot appears behind a closed block and not on an open one; one corner lot per corner with both frontages valid; storeys never differ by more than one inside a row, across 100 seeds; occupied lots survive a re-cut; a town with no new streets hashes as before; the lot pass under its share of the budget (a bench line).

## Acceptance criteria

- [ ] Every R2F stand-in is gone (`grep -rn "R2 stand-in (R2F)"` is empty).
- [ ] In a grown Village street, 100% of lots on a street frontage touch (no one-tile gap) and a closed block has a garden lot; nothing stands alone on a lawn where a street has grown (the roadmap's V3 line, checked as a test over the grown fixture).
- [ ] A corner lot has two valid frontages; `params.storeys` obeys its rules over 100 seeds; occupied lots are never disturbed.
- [ ] A year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.
- [ ] V3.0's author confirms the fields are what V3B needs (a note in the PR).

## Out of scope

Drawing any of it (V3B); street furniture (client-side, V3B); shop desirability by footfall (R2B); restyling by era (I4, V5).

## Notes

- The growth budget (trade choice and growth under 2 ms a night at City scale) holds; rows are cut hourly, not nightly.
- Questions V3B will ask: does a row restyle as one (house by house, per R2.0) and how a corner def is picked (by the busier road); answer them in the PR.
