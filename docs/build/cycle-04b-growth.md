# C4B: Growth

**Iteration**: I2. **Wave**: parallel. **Branch**: `cycle/04b-growth`.
**Depends on**: C4.0 merged. **Runs alongside**: C4A, C4C to C4F.

## Goal

The Ledger paints zones and the village grows itself: lots appear along frontage, the best ones start grown construction sites in a district style, streets carry carts with gentle congestion, residents wear desire paths into the grass, and land can be raised, lowered and given stairs.

## Read

- `CLAUDE.md`, `docs/build/i2-wave-notes.md`, `docs/spec/20-architecture.md` (I2 contracts)
- `docs/spec/13-ledger.md`: Zoning and growth, Streets and traffic
- `docs/spec/10-world-and-building.md`: roads, terrain, placement

## You own

`packages/sim/src/systems/{zoning,growth,traffic}/**`, the `zone.*` and `terrain.*` commands, street rules in `src/rules`, desire paths, their tests and growth scenarios in `tools/bench`.

## Tasks

1. Zone painting (homes low and medium, shops, crafts, farms) and lot subdivision along road frontage (2x2 to 3x3, facing the road).
2. Daily growth: desirability (charm, services, species tastes, noise) and demand per zone; grown sites with variant parameters from the district style (C4E draws them).
3. Grown crafts choose a recipe by shortage (pinnable); grown farms choose a crop.
4. Streets: a road kind with cart speed, capacity and noise; traffic per tile per hour, slowdown above capacity, no gridlock.
5. Desire paths: tiles walked often wear in; the Ledger can turn them into paths (achievement "Desire Lines" with C4C's content).
6. Terraforming with costs and limits; stairs where levels differ by one along a path.
7. Movement: carts share C3A's grid with their own speeds (coordinate in the wave notes).

## Acceptance criteria

- [ ] A zoned frontage grows homes, shops and crafts in a 10-day headless run; growth stops when demand does.
- [ ] Traffic slows carts as specified; never gridlocks (property test).
- [ ] Bench: growth and traffic under 2 ms per in-game hour at 150 residents; 2,000-resident town still within budget.
- [ ] Definition of done.

## Out of scope

Prices and wages (C4A), chain content (C4C), art for grown buildings (C4E), UI (C4F).
