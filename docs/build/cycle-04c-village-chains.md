# C4C: Village chains, services and tiers

**Iteration**: I2. **Wave**: parallel. **Branch**: `cycle/04c-village-chains`.
**Depends on**: C4.0 merged. **Runs alongside**: C4A, C4B, C4D to C4F.

## Goal

The Village has its chains (clay and bricks, wool to cloth, dairy and cheese, orchards and cider, firewood, herbs, tools), carts, the school, tavern and herbalist, the Craftsfolk tier with home upgrades, the first innovations and six new patterns.

## Read

- `CLAUDE.md`, `docs/build/i2-wave-notes.md`, `docs/spec/20-architecture.md` (I2 contracts)
- `docs/spec/13-ledger.md`: Goods (I2 rows), Logistics (carts), Services, Population tiers
- `docs/spec/15-progression.md`: Innovations (I2 rows); `docs/spec/12-hearth.md`: later patterns (I2)

## You own

Content for I2 goods, buildings, carts and innovations; `systems/{production,logistics}` changes for carts and new methods; `systems/services/**`, `systems/tiers/**`, `systems/innovations/**`; pattern detectors for the six I2 patterns (with C3B's engine); their tests.

## Tasks

1. Goods and buildings for every I2 chain with numbers; production methods; firewood for winter (I3 uses it).
2. Carts: cart shed, 16 units, lanes and streets only, sharing porter matching.
3. Services with coverage: school (children learn, enables apprenticeships), tavern (social, evening leisure), herbalist (health).
4. Craftsfolk: needs, home upgrades consuming materials, sliding back after 4 days unmet, skilled jobs.
5. Innovations: wheelbarrows, carts, cobbles, brick kiln, water wheel, with progress views.
6. Patterns: Small Square, Corner Cafe, Village Green, Window Gardens, Market Cross, Bridge Crossing (rules written here, in `12-hearth.md`).

## Acceptance criteria

- [ ] Every I2 building produces at full and partial staffing (tests); each chain runs end to end in a fixture.
- [ ] Tier upgrades and slides tested; services coverage tested.
- [ ] Each innovation unlocks in a fixture; each new pattern has positive and negative fixtures.
- [ ] The autoplayer (extended) reaches 40 Craftsfolk in its Village run (with C4X).
- [ ] Definition of done.

## Out of scope

Prices (C4A), zoning (C4B), visuals (C4E), panels (C4F).
