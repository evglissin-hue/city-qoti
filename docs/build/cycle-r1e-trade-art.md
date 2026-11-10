# R1E: Art for trades

**Iteration**: R1 Zones first. **Wave**: parallel. **Branch**: `cycle/r1e-trade-art`, from `cycle/r1x-integration`; PR into `cycle/r1x-integration`. **Recommended effort**: high.
**Depends on**: R1.0, and V2.0 on `main` (V2's contracts: surfaces, materials): merge `main` into your branch first and again as V2's wave lands. **Runs alongside**: R1A to R1D, R1F, and V2's wave (which owns every other render and art path). **Ports**: client 5225, relay 8835.

## Goal

A business looks like its trade and its level: a baker's workshop smells of bread from across the street, an orchard farmstead stands among its trees, a level 3 shop has a painted sign and goods out front, all drawn from the kits that exist. The four new specialized buildings (the Brickworks, the Granary, the Market Square and the Forester's Lodge as one building) have kits of their own.

## Read

- `CLAUDE.md`; `docs/build/r1-wave-notes.md` (File ownership: R1E; Who writes what)
- `docs/spec/13-ledger.md`: Zoning and growth (Trades, Levels: "Levels are drawn"), Land and specialized buildings
- `docs/spec/17-presentation.md`: what it says of businesses and levels; Visual direction (second pass) for what V2 is doing beside you
- `docs/spec/31-parallel-development.md`: the redesign's pairs (what R1E owns and what V2 owns)
- `docs/spec/20-architecture.md`: R1 contracts (`BuildingView.trade`, `.level`, `.keeperId`; `TradeDef.look`)

## You own

`packages/art/src/kits/` for buildings, workplaces and services (not nature, trees, props, decor, vehicles or residents, which are V2's), their registry lines in `packages/art/src/kits/index.ts`, and `apps/client/src/render/layers/buildings.ts`. Nothing else in `render` or `art` (V2's), and nothing in the sim or content but `TradeDef.look` values in `packages/content/src/trades.ts` (R1B owns the file: agree the look lines with R1B, one line per trade).

## You can rely on

- `BuildingView.trade` (a content trade id), `.level` (absent is 1) and `.keeperId` on every building; the Mirror's residents for the keeper's family name (the sign).
- `TradeDef.look`: an `ArtRef` naming an existing kit (bakery, farmhouse, vegetable-plot, orchard, dairy, sheep-pasture, apiary, weaver, carpenter, chandler, cider-press, shop) with params; `artKitId(def.art)` reads `params.kit` once that kit exists, else `kit`.
- The kits the chain economy drew (their ids stay as trade looks): `bakery`, `brick-kiln`, `cheesemaker`, `chopping-shed`, `cider-press`, `clay-pit`, `dairy`, `farmhouse`, `herb-garden`, `orchard`, `sawpit`, `sheep-pasture`, `smithy`, `spinner`, `weaver`, `woodcutter`, `pie-shop`, `chandler`, `tailor`, `carpenter`, `workshop`, `farmstead`, `shop`.

## Tasks

1. **Looks by trade**: the buildings layer draws a business (a `workshop`, `farmstead` or `corner-shop` def with a `trade`) by its trade's look, in its lot's district style, fitted to the business def's footprint (3x3 workshop and farmstead, 2x3 shop). Grain farms, market gardens, orchards, dairies, sheep runs and hives each read as themselves at a glance from the Ledger's height.
2. **Levels drawn**: level 1, 2 and 3 a bigger yard, a painted sign with the keeper's family name, goods out front (17-presentation.md and 13-ledger.md, "Levels are drawn"); never a different footprint.
3. **New kits**: the Brickworks (clay pit and kiln in one, on clay), the Granary, the Market Square (six stalls, 3x3; Odette's finale roofs it into the Market Hall later), and the Forester's Lodge (the old woodcutter, forester and chopping shed in one), each with its registry line.
4. **The reach ring** is an overlay (V2's path): if R1C asks for one, agree the API with V2 rather than drawing it in the buildings layer.
5. Turn back on the two render tests R1.0 skipped for you (`render/hamlet.test.ts`, pile levels and a plot's growth; `render/village.test.ts`, what a craft makes and the orchard's season; wave notes, Skipped and deleted tests), rewritten for trades: a market garden's growth, a baker's look, an orchard farmstead's season.
6. The gallery shows every trade at every level and the four new kits: `apps/gallery` is V2's path, so add one section through the gallery's existing registry and list it in your PR.
7. Budgets: `22-quality.md` (the frame budget on Medium; the buildings layer's draws within V1's numbers). Measure the village scene before and after.

## Acceptance criteria

- [ ] Every trade at each level and the four new specialized buildings drawn, screenshots in the PR at 1440 x 900 (day and dusk).
- [ ] No render or art path outside yours changed; the frame and draw budgets hold on the village scene.
- [ ] Typecheck, lint, unit tests (`render` and `art` tests for what you touched), build and e2e pass.

## Out of scope

Materials, surfaces, lights, nature and the renderer (V2); what trades a lot takes and when a level changes (R1B); UI (R1C).

## Notes

- `render/kitGeometry.ts` (V2's) reads `BuildingRuntimeView.method` for a building's goods pile today; from R1 a business's look comes from `BuildingView.trade`. Decided: you draw the trade looks in your own buildings layer; if `kitGeometry.ts` needs to read `BuildingView.trade`, add that one additive line in the shared file and list it in your PR.
- R1.0 kept every old kit id so trades can borrow them; retire a kit only once no trade or def names it, and say so in your PR.
