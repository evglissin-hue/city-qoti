# C4E: Village art and rendering

**Iteration**: I2. **Wave**: parallel. **Branch**: `cycle/04e-village-art`.
**Depends on**: C4.0 merged. **Runs alongside**: C4A to C4D, C4F.

## Goal

The village looks grown, not placed: grown homes, shops and workshops in district styles, Craftsfolk townhouses, streets of cobbles, carts on the lanes, orchards and pastures, the I2 buildings, and story characters you can pick out in a crowd. Keep the storybook bar C3D set, and hold the frame budget at village scale.

## Read

- `CLAUDE.md`, `docs/build/i2-wave-notes.md`, `docs/spec/17-presentation.md` (all)
- `docs/spec/12-hearth.md`: District styles; `docs/spec/13-ledger.md`: I2 buildings and goods
- The C3D PR notes (what the kit and renderer already do)

## You own

`packages/art`, `apps/gallery`, `apps/client/src/render`.

## Tasks

1. Grown building generators with style parameters (timber, plaster, stone, brick; roof types; detail probabilities), lot-sized footprints, upgrades in place (Settler cottage to Craftsfolk townhouse).
2. I2 buildings: clay pit and brick kiln, sheep pasture, spinner, weaver, dairy, cheesemaker, orchard and cider press, chopping shed, herb garden, smithy, school, tavern, herbalist, Trading Post, cart shed.
3. Streets (cobbles with kerbs), stairs, terraformed slopes, desire paths, zone tints and lot outlines in the Ledger lens.
4. Carts with goods, sheep and cows, orchards with seasons-ready trees.
5. Story characters with distinguishing details; couples walking together; babies.
6. Overlays: traffic, land value, needs by tier.
7. Performance: a 150-building village with 150 residents on Medium within budget (draw calls, triangles), LOD and instancing for grown buildings.

## Acceptance criteria

- [ ] Gallery screenshots of every new generator and style, day and night.
- [ ] Village fixture screenshots (wide, close, dusk, night) that read as one coherent storybook village.
- [ ] Render budget numbers at village scale in the PR.
- [ ] Definition of done.

## Out of scope

Simulation (C4A to C4D), panels (C4F).
