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

V3.0: `lotsFor(mirror)` returning `ScreenLots { lots, rows, fromSim }` of `ScreenLot` (`row`, `rowSource`, `kind`, `corner`, `frontage2`, `storeys`; `LotFields`, `BuildingFields` and `storeysOf` are the accessors), its `rowNeighbors` fallback (no gardens, no corners, storeys 1) and the synthetic lots in `render/lots.test.ts`; `anchorsFor` and `BODY_INSET`; V1B's `kits/rows.ts` (`isRowKit`, `rowOf`, `fitRow`, `ROW_SETBACK`, `ROW_DEPTH`, `ROW_EAVES`) and the `joinL` and `joinR` params. R2.0's final field shapes are already matched there; if R2 changes them, only the accessors change.

## Tasks

1. **Rows from `lotsFor` only**: the buildings layer reads `ScreenLots.rows` instead of calling `rowNeighbors` itself; joins, party walls, shared eaves, gable ends and chimneys on the party wall as V1B does; a side facing a road gets windows. Keep the fallback working and covered by a test until R2X; do not delete it.
2. **Storeys** (`params.storeys`): `kits/rows.ts` and the building kits build 1, 1.5, 2, 3 or 4 storeys, with window rows and string courses per storey and the roof riding the top. Storeys are in the build key, so a change rebuilds (a test: a different `storeys` gives a different key and geometry). The ceiling is four outside landmarks; neighbors in a row step by at most one (the sim chooses; the draw clamps defensively, with a test on synthetic rows).
3. **Corner buildings**: where `ScreenLot.corner` and `frontage2` are set, the kit faces both streets: a canted shop entrance, windows and sills on both faces, the second street's side never a blank party wall. Add the second face's anchors to `anchors()` where V3A's dressing asks.
4. **Gardens**: where `kind: 'garden'` lots are, draw garden walls, sheds, washing lines and fruit trees (reuse V2B's `fruitTree` and hedge helpers) by lot seed; the mown lawn stays the ground shader's. A block with no road on one side stays open to the fields. Never drawn on a plot.
5. **The free yard** for V3A: export `yardOf(mirror: Mirror, buildingId: EntityId): { x: number; z: number; w: number; d: number } | null` from `lots.ts` (the wave notes' signature): the building's lot in world tiles, less what joined neighbors and a garden lot take, null when it has no lot. V3A turns it into kit-local space with `lotBox` (`layers/dressing.ts`). Tested on synthetic joined rows.
6. **Street furniture by district**: lamps, benches, planters and bollards along streets at a density per district style, from the road and district layers, no sim state, at the decor level of detail. Existing kits: `lantern`, `bench`, `planter`; add `bollard` and any missing piece. Place them from roads in your own layer code, or, if placed from plots, as rows in V3A's `dressingRules.ts` (one row each, named in your PR; V3A keeps them). Lamps placed by your own layer code write their discs under a new light source, `street` (`env.lightWriter.set('street', discs)`, additive); lamps placed as decor or rules go through the existing writers.
7. **Anchor overrides**: land the rows V3A writes into the wave notes' table in each kit's `anchors()` return, and fill the Landed by column.
8. **Feed the endpaper**: expose rooflines in rows and gardens as plain arrays from a function in your own files, for V3D's `EndpaperInput` builder (append-only fields).
9. **Calm the orchard's crowns**: P2-E2's orchard crowns (#43, `docs/build/screenshots/p2-orchard-close-after.png`) are many small hard triangles and read spiky up close beside V2X's calmer painted crowns. Bring them to the same painted read as the other dabbed trees (V2X's dab settings: fewer, larger, softer dabs, a tight tint spread, lying flat on their blob; `20-architecture.md`, V2 contracts, As built V2X), keeping P2-E2's look otherwise (no lot rectangle, the boarded shed, the gable window). A before and after at street zoom in the PR.
10. **Synthetic scenes and notes**: a gallery scene and tests with synthetic lots (a row of 24, a block with its garden, a corner, a stepped skyline), since R2's fields reach `main` only with R2X. Fill your rows in the wave notes' stand-ins table and add your As built lines to `20-architecture.md` (V3 contracts).

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

- **P2 landed first on some of your kits** (wave notes, P2 runs beside V3): start rows and roofs from P2-A's lot clamp (a kit's geometry, overhang included, stays inside its own lot; `lotBounds.test.ts`) and keep P2-E1's verge and soffit (`roofVerge.test.ts`). Do not merge P2; whichever of your PR and P2 reaches `main` second resolves the conflicts in `kits/{buildings,farms,grown,roofs,village,workshops}.ts`.
- The picture is the B concept's town stills: streets edge to edge, rooflines stepping, back gardens, buildings turning the corner. Cozy, never a wall of identical boxes: vary by lot seed.
- R2.0's final names are matched in `lots.ts` (wave notes): `LotView.row`, `kind`, `corner?: true`, `frontage2`, `storeys` (and `BuildingView.storeys`). The sim's storeys field is `Building.storeys`; `params.storeys` is your kit param, filled from `ScreenLot.storeys`.
- Run the build and review loop (`31-parallel-development.md`) with Sonnet executors; the lead tunes the look and checks Medium.
- Compare with `node apps/client/e2e/v3-shots.mjs v3b`, every scene and hour, and report `v3-perf.mjs` numbers per preset.

## As built (V3B, 2026-11-16)

- **Built in the loop**: the master set the row contract in `kits/rows.ts` (storeys, party eaves, the corner side) and the row budget test, then seven Sonnet executors built in parallel worktrees: storeys and corners for the cottage and house (E1a), for the townhouse and shop with the canted corner shop (E1b), `lots.ts` and the buildings layer (E3), the back garden kit (E4), street furniture (E5), the orchard (E6, finished by the master) and the streets showcase (E7). Two review rounds from the player's chair followed (below).
- **Rows from `lotsFor` only** (task 1): `rowParams` gives every row kit its joins, party eaves, streets, storeys and corner side; on the fallback it equals `rowNeighbors` exactly (tested), so the grown village draws as before. `rowNeighbors` stays (moved into `lots.ts`, re-exported) until R2X.
- **Storeys** (task 2): 1 to 4 in halves for the cottage, house, townhouse and shop; native storeys are today's geometry byte for byte; `rowEaves` agrees with every kit's real eaves; storeys are in the build key; `lotsFor` clamps neighbors to one storey apart (the sim's upper envelope) and four at most. Business looks other than the shop (workshops, farms, trades) keep drawing their height from their level, as the sim's `BUSINESS_STOREYS` matches.
- **Corners** (task 3): `params.corner` from `frontage2`; the corner shop's 45 degree cant with the door in it and the shopfront round both faces; homes dress the second face as a front. `anchors.sills` on both faces for corner kits; no V3A override asked yet.
- **Gardens** (task 4): `back-garden` on every garden lot, in the buildings batch (no new draw), by lot seed, style and season.
- **`yardOf`** (task 5) and **the endpaper feed** (task 8, `endpaperStreets`): in `lots.ts`, tested.
- **Street furniture** (task 6): `layers/street.ts` from the roads (no dressing rules), one batched draw, lamps under the `street` light source.
- **Anchor overrides** (task 7): none asked; the table says so.
- **The orchard** (task 9): `docs/build/screenshots/v3b-orchard-{before,after}-{close,spring,street}.png`.
- **Review rounds** (the master, from the shots): the showcase cleared the village's decor too (lanterns stood in the gardens); a shed in about half the gardens (eight sheds in eight gardens read as huts) and always a pent roof (a shed's gable verge stood out like a flag); door bollards in pairs or none (a lone one stood by the shop on the grown village); street lamps step off doorsteps (a row of two-wide homes put every lamp tile on a doorstep, so its plaster and stone stretches had none) and a two-tile street counts as straight (it read as a junction its whole length); each with a test for its class.
- **Budgets**: a row of 24 joined homes with storeys stepping is 1,930 triangles far and 37,865 near (3,000 and 70,000 allowed), 1,930 against 2,572 far and 37,865 against 49,927 near apart (`rowBudget.test.ts`). `v3-perf.mjs` at 11:00, moving, draws and triangles (V3.0's before in brackets): Low street 128, 0.47 M (125, 0.45 M), village 118, 0.29 M (137, 0.33 M), far240 191, 0.45 M (179, 0.41 M); Medium street 127, 0.54 M (117, 0.51 M), village 215, 0.75 M (186, 0.59 M), far120 182, 0.52 M (186, 0.51 M), far200 197, 0.48 M (219, 0.61 M), far240 228, 0.59 M (231, 0.63 M); High worst far120 256, 2.48 M (266, 2.23 M); Ultra worst far240 380, 0.90 M (479 at far120 before; 241 now). Medium at 22:00: street 97, village 145, far240 230. Every preset inside its draw and triangle budget. The grown village runs with the sim live, so its counts wander between runs (Ultra far120 read 479 before and 241 now with no change of ours there); an A/B on the same build with the hour pinned and the sim held puts the street layer at no measurable draws (Medium street 94 with and 94 without, village 134 with and 142 without). GPU milliseconds need a laptop (the container renders in software): Kat's laptop on Medium is V3X's check.
