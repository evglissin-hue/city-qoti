# C2A: World and sim

**Iteration**: I0. **Wave**: parallel. **Branch**: `cycle/02a-world-sim`.
**Depends on**: C1 merged. **Runs alongside**: C2B, C2C, C2D.

## Goal

The real valley: the full generation algorithm, terrain and road rules including bridges, every placement rule and reason code, decor collision and linear runs, tree growth, parcels, and the complete I0 content. Every valley is different, readable and buildable, and identical on both laptops.

## Read

- `CLAUDE.md`
- `docs/spec/10-world-and-building.md` (all)
- `docs/spec/20-architecture.md`: Simulation, Determinism rules, Placement rules and MapReader, I0 contracts, Content pipeline
- `docs/spec/22-quality.md`: Performance budgets, Tests

## You own

`packages/sim/src/map`, `packages/sim/src/rules`, `packages/sim/src/commands`, `packages/sim/src/systems` (tree growth), `packages/content/src`, `tools/bench`, sim tests and golden scripts.

## You can rely on

C1's contracts, registries, worldgen v0 entry point (`generateValley`), serialize and hash, the golden test harness.

## Tasks

1. **Worldgen**: implement steps 1 to 11 of "Valley generation" exactly, including validation and deterministic retries. Integer-hash value noise with smoothstep interpolation (no banned math). Generate the valley name from content word lists (for example "Willowmere", "Brackenford").
2. **Property tests over 200 seeds**: the river spans the map; the start area exists and is flat within 2; stone and clay within 40 tiles of the start; the valley gate connects to the start area by lane; generation under 300 ms each.
3. **Terrain rules**: walking and road connectivity limited to height difference 1; cliffs at 2+.
4. **Roads**: painting validation per tile, bridges (up to 6 water tiles, land at both ends, end heights 0 or 1), removal; reject the whole command on the first bad tile with `detail` naming it.
5. **Buildings**: every rule and reason code in the placement table; foundations for spread 1; entrance tile and the "no road" warning in the validator result; sandbox removes trees under footprints.
6. **Decor**: collision (`0.8 x (r1 + r2)`), footprint margin, `onRoad` and `onWater`; `decor.placeRun` for linear decor (1-tile segments aligned to the line, skipping blocked segments and reporting them); the 6,000 cap (`TOO_MANY`); `decorNear` spatial index in sim state (rebuilt on load).
7. **Trees**: stages and a `trees` system that grows saplings (2 days per stage) using `every` and `offset` scheduling; planting and removal rules.
8. **Parcels**: Voronoi assignment; all unlocked in I0; `LOCKED_PARCEL` path tested with a locked fixture.
9. **Content**: complete I0 defs with sizes, entrances, radii, tags and art kit ids agreed with C2B (use the kit ids listed in `20-architecture.md`; if C2B needs new ids, coordinate through additive content changes).
10. **Golden and bench**: update the golden script to cover bridges, linear runs and tree growth; bench a synthetic valley with 1,000 buildings and 6,000 decor at 3x for 10,000 ticks.

## Acceptance criteria

- [ ] Worldgen property tests pass for 200 seeds; each generation under 300 ms in Node.
- [ ] Every reason code has a test that triggers it.
- [ ] Bridges, linear decor runs, the decor cap and tree growth have tests.
- [ ] Golden determinism passes (Node twice, browser once).
- [ ] Bench: I0 tick under 1 ms with the synthetic load.
- [ ] Screenshot or ASCII dump of 3 seeds' height and terrain maps in the PR, so the human can judge variety.
- [ ] Definition of done.

## Out of scope

Rendering (C2B), networking and persistence (C2C), tools and UI (C2D). Costs, construction and residents (I1).

## Notes

- Keep validators pure and fast: the client calls them on every pointer move.
- Changing the shape of saved state means `SAVE_VERSION` plus a migration. C1 saves are throwaway dev data; a migration that regenerates the map is acceptable if documented.
