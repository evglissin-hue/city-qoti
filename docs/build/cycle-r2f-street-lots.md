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

- [x] `grep -rn "R2 stand-in (R2F)" packages apps tools --exclude-dir=dist` is empty.
- [x] In a grown Village street, every lot on a street frontage touches its neighbors (no one-tile gap) and a closed block has a garden lot; nothing stands alone on a lawn where a street has grown (a test over a grown fixture).
- [x] A corner lot has two valid frontages; `storeys` obeys its rules over 100 seeds; occupied lots are never disturbed.
- [x] A year hashes the same in Node and a browser worker; typecheck, lint, unit tests and build pass.
- [x] The PR notes V3.0's author has the fields V3B needs (through the master), with any field you added.

## Out of scope

Drawing any of it (V3B); street furniture (client-side, V3B); shop desirability by footfall (R2B); restyling by era (I4, V5).

## Notes

- The growth budget (trade choice and growth under 2 ms a night at City scale) holds; rows are cut hourly, not nightly.
- From P2 (wave notes, Starting after P2): growth's `index.ts` and `site.ts` carry P2's waiting reasons and its switched-off midday pass; garden lots are never free lots in any of those reasons. Roofs keep to their own lot (`ShellSpec.lot`), so a row's lots must be the lots its buildings stand in.
- V3B will ask whether a row restyles as one (no: house by house, R2.0's answer) and how a corner def is picked (by the busier road): answer in the PR with what you built.

## As built (2026-11-16)

The rules are in `13-ledger.md`, Lots, As built (R2F). What the cycle found and decided:

- **Content**: `ZoneDef.roads` (`RoadLotsDef`, additive): shapes and `row` per class of road. Townhouses and Shops fill streets in rows (2x3 mostly, 2x2 and 3x3 now and then); every other zone and class keeps C4B's cut, so a town with no streets is cut exactly as before (the autoplayer lays lanes, so R1X's tuning, the audit and the golden year are untouched).
- **Order of painting**: the empty lots a street manages are lifted each pass and cut again; a lot cut again in place keeps its id. The tests' per-stroke fuzz found that a lane lot cut before a street came, a tile or two back from it, kept the street from its depth: a street now lifts every empty row-zone lot within a street lot's depth. 40 random street grids give the same street lots and rows painted all at once, zones first, reversed, or with a pass after every stroke.
- **From the player's chair** (the shots): a run of 2-wide townhouses cut 3 + 2 + 3 left the houses a tile apart although the lots touched, and a corner house hugging its corner stood a tile off its row. Rows are now filled with the zone's commonest width (another only where the run will not come out even, once at its end), and a building narrower than its lot stands against its row neighbor; the fuzz checks the class (four seeds failed before), the grown street checks its houses stand wall to wall.
- **Corners**: the entrance stays on the busier road; a busier stub too short to cut a lot makes no corner. Built row lots recompute their corner when roads change.
- **Gardens** are in no zone (`zone` 0), so every reader that filters lots by zone (the bars, desirability's styles, shops opening, the health watch, the autoplayer) passes them by already; they never take Farmland (free farm ground is fields), and a block holding some is open.
- **Growth fills a row from one end** (its corner first), as an order, never a refusal: lots that would stand alone are tried after every other free lot.
- **Storeys**: the upper envelope along a row's built chain; set at growth (the row refit at once) and kept hourly. A town with no streets hashes as on the wave's base except `storeys` on grown buildings, which R2.0's stand-in left unset after growth (`test/r2f/noStreets.test.ts` compares the hash with storeys stripped, and they match field for field otherwise).
- **Budgets** (`tools/bench/src/lots.bench.ts`, a grid of 852 row lots and 353 gardens): the pass after a grown building 0.13 to 0.87 ms (budget 1; the same grid of lanes 0.56 to 1.35), the whole plan after a road or zone stroke 2.9 ms (6, half the worst-tick budget; it runs only on a stroke or a fresh load), the hourly storeys refit 0.14 to 0.44 ms (0.5), a full cut from scratch 9 to 15 ms (a one-off). The zoning system takes a quick path when only buildings grown on lots came since its last pass, and every pass reads windmills' clearance from one mask.
- **Shots**: `docs/build/screenshots/r2f-{before,after}-{day,street,ledger,row}.png`, grown by `apps/client/e2e/r2f-street-grow.ts` and taken by `r2f-street.mjs`. Growth on a new street is slow in both (10 of 36 lots in 20 days, on ground at the edge of the porters' reach): the street is limited by demand and reach, not the cutter.
