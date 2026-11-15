# R2F: Lots for streets

**Iteration**: R2 The evening round. **Wave**: parallel. **Branch**: `cycle/r2f-street-lots`, from `cycle/r2x-integration`; PR into `cycle/r2x-integration`. **Recommended effort**: high.
**Depends on**: R2.0. **Runs alongside**: R2A to R2E, and V3's wave (V3B draws what this cuts). **Ports**: client 5236, relay 8846.

## Goal

The lot cutter fills a street's frontage with lots that touch, gives the blocks behind them garden lots, gives each road corner a lot with two frontages, and chooses storeys by tier and row, all in the fields R2.0 fixed, so V3B can draw joined rows, back gardens, corner buildings and rooflines that step. Nothing else about growth changes: the same zones, the same demand, the same hash for a town with no streets.

## Read

- `CLAUDE.md`; `docs/build/r2-wave-notes.md` (The lot fields and R2.0's planning answers)
- `docs/build/i4-visual-planning-notes.md`: V2 (streets that fill their frontage), items 1 to 4 and its budgets
- `docs/spec/13-ledger.md`: Zoning and growth (Lots); `docs/spec/17-presentation.md`: Visual direction, second pass, item 4
- `docs/spec/20-architecture.md`: R2 contracts (Lots); `docs/spec/30-roadmap.md`: R2, V3

## You own

`packages/sim/src/systems/zoning/**` (`lots.ts`, `storeys.ts`), `systems/growth/{index,site,recipes,api,trades,defs,retool}.ts`, `view/lots.ts` (`lotView`), `view/zones.ts` (re-exports), content `zones.ts` (the per-road-class width and depth table, `ZoneDef`), lot fixtures of your own beside `packages/sim/test/fixtures/**`, and their tests (`packages/sim/test/r2f/**`).

Not yours: `systems/growth/{desirability,bars,outlets,cafes}.ts` (R2B), anything under `render` or `art` (V3).

## You can rely on

- R2.0's fields (`contracts/village.ts`): `Lot.row` (an id shared by lots cut from one run; 0 for none), `Lot.kind` (`LotKind`, `'plot' | 'garden'`), `Lot.corner?: true` and `Lot.frontage2?: number`; `Building.storeys?: number` (half-storey steps); `LotView` carrying `frontage`, `row`, `kind`, `corner`, `frontage2` and `storeys` (`lotView(lot, state)`), `BuildingView.storeys`; the migration (every old lot a plot in no row, grown buildings' storeys by tier) and its test; `storeysFor` (`zoning/storeys.ts`) and `growLot` passing it to `insertBuilding`.
- The cutter as built in C4B (frontage runs, shapes by weight, streets before lanes before paths, the hourly idempotent pass) and R1B's growth with R1X's rules (Workshops lots 3x3 only; `HANDS_WAITING`).

## Tasks

1. **Streets without gaps**: on a street (not a lane or path) in a town-density zone, the cutter fills the whole run with lots sharing their side lines; the one-tile gaps stay for lanes, paths and low-density zones. Widths 1 to 3 and depths 2 to 4 per road class come from `ZoneDef` (additive fields), never code. Lots cut from one run share `row` (a fresh id from `state.nextId`), so growth fills a row from one end.
2. **Garden lots**: the tiles behind a row, enclosed by the rows of a block, become `kind: 'garden'` lots, never built on; a block open on one side keeps that side open to the fields. R2.0's calls hold: not paintable by hand, ordinary charm, no pattern site. Every reader of `state.lots` in your paths that grows or offers a lot skips gardens; tell R2B (desirability, bars) and R2E (the autoplayer, the audit's garden kind) in your PR which readers you found outside your paths.
3. **Corner lots**: where two frontage runs meet at a road corner one lot takes the corner with two frontages (`corner: true`, `frontage2`); the entrance stays with the busier road; growth picks the corner lot's def as for a lot on that road.
4. **Storeys by tier and row**: replace `storeysFor`'s stand-in: a Merchants' townhouse three, a Settler cottage one and a half; neighbors in a row differ by at most one; four storeys is the ceiling outside landmarks; deterministic from the tier and the row's other members; a lot of a row built later fits the row it joins. Your hourly pass keeps them right as homes move up a tier and businesses a level (no edit in R2B's tiers), and emits `building.updated` and `lot.updated` when a storey changes.
5. **Idempotent and stable**: the pass cuts the same lots from the same roads in any order of painting; an occupied lot is never moved or cut out from under its building; erasing a road releases only empty lots (and the gardens it opened).
6. Tests: rows touch on a street and gap on a lane; a garden lot behind a closed block and none on an open one; one corner lot per corner with both frontages valid road tiles; storeys never differ by more than one inside a row, over 100 seeds; occupied lots survive a re-cut; a town with no new streets hashes as before; the lot pass under its share of the budget (a bench line through R2E's scene list).

## Acceptance criteria

- [ ] `grep -rn "R2 stand-in (R2F)" packages apps tools --exclude-dir=dist` is empty.
- [ ] In a grown Village street, every lot on a street frontage touches its neighbors (no one-tile gap) and a closed block has a garden lot; nothing stands alone on a lawn where a street has grown (a test over a grown fixture).
- [ ] A corner lot has two valid frontages; `storeys` obeys its rules over 100 seeds; occupied lots are never disturbed.
- [ ] A year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.
- [ ] The PR notes V3.0's author has the fields V3B needs (through the master), with any field you added.

## Out of scope

Drawing any of it (V3B); street furniture (client-side, V3B); shop desirability by footfall (R2B); restyling by era (I4, V5).

## Notes

- The growth budget (trade choice and growth under 2 ms a night at City scale) holds; rows are cut hourly, not nightly.
- V3B will ask whether a row restyles as one (no: house by house, R2.0's answer) and how a corner def is picked (by the busier road): answer in the PR with what you built.
