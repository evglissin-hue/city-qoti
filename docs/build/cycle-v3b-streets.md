# V3B: Streets

**Iteration**: V3 Yards, streets and the long view. **Wave**: parallel. **Branch**: `cycle/v3b-streets`, from `main` after V3.0 has merged (V3.0's tip is `cycle/v3-0-contracts`); PR into `cycle/v3x-integration`.
**Depends on**: V3.0. **Runs alongside**: V3A, V3C, V3D (and the R2 wave, which owns sim, content, bench and UI paths). **Recommended effort**: high. **Ports**: client 5232, relay 8842.

## Goal

Nothing stands alone on a lawn where a street has grown. Streets join into rows whose rooflines step, with gardens behind them: garden walls, sheds, washing lines and fruit trees on the garden lots inside a block. A building on a corner faces both streets, with a canted shop entrance and windows on both sides. Floors follow tier (a cottage one and a half storeys, a merchant's townhouse three, four at most) and neighbors step by at most one. Streets get lamps, benches, planters and bollards by district. Everything draws from `lotsFor`; the sim is untouched, and gardens, corners and storeys show on `main` once R2X lands R2's lot fields, with no V3 edit (until then the fallback's joined rows show, as today).

## Read

- `CLAUDE.md`, `docs/build/v3-wave-notes.md` (the ruling that V3 and R2 do not meet on `main`, ownership, the carve-outs and override table, handshakes, stand-ins)
- `docs/build/i4-visual-planning-notes.md`: V2: streets that fill their frontage (items 1 to 5 and the budgets; its "V2" is this cycle)
- `docs/spec/17-presentation.md`: Visual direction, second pass, 4. Yards, doorsteps and goods you can see (streets that feel like a town)
- `docs/build/cycle-v3-0-contracts.md`: Task 4 (lots on screen) and the headroom table

## You own

The V3B row of the wave notes' ownership table: `apps/client/src/render/lots.ts`, `render/layers/buildings.ts`, `packages/art/src/kits/rows.ts`, the building kits (`buildings`, `business`, `district`, `details`, `farms`, `grown`, `modules`, `parts`, `roofs`, `services`, `specialized`, `style`, `trades`, `village`, `workplaces`, `workshops`) and street furniture in `kits/decor.ts` (V2B's `fruitTree` and `hedge` bodies there stay as built).

Outside these paths: only small, necessary edits (registry lines, exports, additive fields), listed in the PR. No `packages/sim`, and no R2 branch merged in.

## You can rely on

V3.0: `lotsFor(mirror)` returning `ScreenLots { lots, rows, fromSim }` of `ScreenLot` (`row`, `rowSource`, `kind`, `corner`, `frontage2`, `storeys`; `LotFields`, `BuildingFields` and `storeysOf` are the accessors), its `rowNeighbors` fallback (no gardens, no corners, storeys 1) and the synthetic lots in `render/lots.test.ts`; `anchorsFor` and `BODY_INSET`; V1B's `kits/rows.ts` (`isRowKit`, `rowOf`, `fitRow`, `ROW_SETBACK`, `ROW_DEPTH`, `ROW_EAVES`) and the `joinL` and `joinR` params. R2.0's exact field shapes arrive from the master; when they do, match the accessors in `lots.ts` and nothing else.

## Tasks

1. **Rows from `lotsFor` only**: the buildings layer reads `ScreenLots.rows` instead of calling `rowNeighbors` itself; joins, party walls, shared eaves, gable ends and chimneys on the party wall as V1B does; a side facing a road gets windows. Keep the fallback working and covered by a test until R2X; do not delete it.
2. **Storeys** (`params.storeys`): `kits/rows.ts` and the building kits build 1, 1.5, 2, 3 or 4 storeys, with window rows and string courses per storey and the roof riding the top. Storeys are in the build key, so a change rebuilds (a test: a different `storeys` gives a different key and geometry). The ceiling is four outside landmarks; neighbors in a row step by at most one (the sim chooses; the draw clamps defensively, with a test on synthetic rows).
3. **Corner buildings**: where `ScreenLot.corner` and `frontage2` are set, the kit faces both streets: a canted shop entrance, windows and sills on both faces, the second street's side never a blank party wall. Add the second face's anchors to `anchors()` where V3A's dressing asks.
4. **Gardens**: where `kind: 'garden'` lots are, draw garden walls, sheds, washing lines and fruit trees (reuse V2B's `fruitTree` and hedge helpers) by lot seed; the mown lawn stays the ground shader's. A block with no road on one side stays open to the fields. Never drawn on a plot.
5. **The free yard** for V3A: export `yardOf(mirror: Mirror, buildingId: EntityId): { x: number; z: number; w: number; d: number } | null` from `lots.ts` (the wave notes' signature): the building's lot in world tiles, less what joined neighbors and a garden lot take, null when it has no lot. V3A turns it into kit-local space with `lotBox` (`layers/dressing.ts`). Tested on synthetic joined rows.
6. **Street furniture by district**: lamps, benches, planters and bollards along streets at a density per district style, from the road and district layers, no sim state, at the decor level of detail. Existing kits: `lantern`, `bench`, `planter`; add `bollard` and any missing piece. Place them from roads in your own layer code, or, if placed from plots, as rows in V3A's `dressingRules.ts` (one row each, named in your PR; V3A keeps them). Lamps placed by your own layer code write their discs under a new light source, `street` (`env.lightWriter.set('street', discs)`, additive); lamps placed as decor or rules go through the existing writers.
7. **Anchor overrides**: land the rows V3A writes into the wave notes' table in each kit's `anchors()` return, and fill the Landed by column.
8. **Feed the endpaper**: expose rooflines in rows and gardens as plain arrays from a function in your own files, for V3D's `EndpaperInput` builder (append-only fields).
9. **Synthetic scenes and notes**: a gallery scene and tests with synthetic lots (a row of 24, a block with its garden, a corner, a stepped skyline), since R2's fields reach `main` only with R2X. Fill your rows in the wave notes' stand-ins table and add your As built lines to `20-architecture.md` (V3 contracts).

## Acceptance criteria

- [ ] A synthetic block (rows of joined homes, a garden lot behind with wall, shed, washing line and fruit tree, a corner shop with two faces, storeys stepping by at most one up to four) draws correctly (`lots.test.ts` and gallery shots); on the grown village the fallback's rows show as before (`v3-shots.mjs v3b`, every scene and hour, beside `v3-before-*`).
- [ ] Budget (`i4-visual-planning-notes.md`): a block of 24 joined homes about 3,000 triangles far and about 70,000 near, and a joined row costs less than the same homes apart (a count test); street furniture within the decor distance; draws and triangles inside the V2X headroom table in `cycle-v3-0-contracts.md` on every preset; the idle frame within 4 ms GPU on Medium.
- [ ] Storeys are keyed (a changed `storeys` rebuilds, an unchanged one does not); the four-storey ceiling and the one-step rule hold on synthetic rows.
- [ ] `yardOf` exists and is tested; every landed anchor override is in the wave notes' table.
- [ ] The game looks unchanged outside streets, rows and their furniture; hashes unchanged; nothing in the sim changes.
- [ ] Typecheck, lint, unit, e2e, build and bench pass; definition of done in `docs/spec/22-quality.md`.

## Out of scope

The cutter that makes rows, garden lots, corners and storeys (R2.0 and R2F, sim), dressing rules other than your furniture rows (V3A), the horizon and the endpaper's drawing (V3C, V3D), restyling by era (V5), any sim change.

## Notes

- The picture is the B concept's town stills: streets edge to edge, rooflines stepping, back gardens, buildings turning the corner. Cozy, never a wall of identical boxes: vary by lot seed.
- If R2.0's names differ from `row`, `kind`, `corner`, `frontage2` or `storeys`, only the accessors in `lots.ts` change.
- Run the build and review loop (`31-parallel-development.md`) with Sonnet executors; the lead tunes the look and checks Medium.
- Compare with `node apps/client/e2e/v3-shots.mjs v3b`, every scene and hour, and report `v3-perf.mjs` numbers per preset.
