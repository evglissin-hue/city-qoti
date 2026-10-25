# C3C: Ledger v1

**Iteration**: I1. **Wave**: parallel. **Branch**: `cycle/03c-ledger-v1`.
**Depends on**: C3.0 merged. **Runs alongside**: C3A, C3B, C3D, C3E.

## Goal

The Ledger lane becomes a real game: goods, the first chains, construction by builders, porters moving goods, food reaching homes, a budget with lean times, and the starting state of a standard valley.

## Read

- `CLAUDE.md`
- `docs/spec/13-ledger.md`: Goods (I1), I1 buildings, Construction, Logistics, Consumption, Budget, Reports (I1)
- `docs/spec/14-challenge.md`: Difficulty dials (economy rows)
- `docs/spec/02-game-overview.md`: New valley
- `docs/spec/20-architecture.md`: Determinism rules, I1 contracts

## You own

`packages/sim/src/systems/{construction,production,logistics,economy}/**`, the `field.*`, `build.setPriority`, `build.setPaused` and `ledger.setForSale` commands, content for goods and I1 buildings (numbers), the standard starting state, the outlet API implementation, their tests and the economy scenarios in `tools/bench`.

## You can rely on

C3.0 contracts, fixtures and stubs (`requestMove`, `isAt`, residents with jobs).

## Tasks

1. **Content**: I1 goods and every I1 building with the spec's numbers *(tune)*.
2. **Construction**: sites, coin deduction at placement, material requests, builder work, stages, priority, cancel and refund, removal refunds, tree clearing in footprints.
3. **Production**: methods, input and output buffers, scaling by workers present and mood productivity, farmhouse and wheat fields (`field.paint` within 6 tiles, fertility 40+), height bonus for windmills, pausing.
4. **Logistics**: needs and offers, porter job matching every 20 ticks with the priority order, reservations (no double booking), trips through `requestMove`, storehouse range of 20 walking tiles, "no porters" status.
5. **Outlets and consumption**: market stalls and storehouses as food outlets; implement `takeFromOutlet` and `nearestOutletWithFood`; stall restocking target 30.
6. **Budget**: daily taxes with the mood factor (from C3A), upkeep, construction and road costs in standard mode, the peddler and `ledger.setForSale`, lean times with condition loss and repair, the economy dial multipliers.
7. **Standard starting state**: Town Hall, Storehouse with starting goods, two Cottages, a Well, the path, treasury, two builders.
8. **Reports**: view builders for stocks (with produced and consumed per day), workforce, budget by category, building status flags.

## Acceptance criteria

- [ ] Each I1 building produces the specified output at full and partial staffing (tests).
- [ ] Construction, logistics reservations, outlets and budget math tested; lean times start and end correctly.
- [ ] A headless 3-day run from the starting state (with fixture residents if C3A is not merged) keeps food flowing and the treasury within the expected band; numbers in the PR.
- [ ] Bench: hamlet economy under 0.5 ms per tick.
- [ ] Definition of done.

## Out of scope

Residents' schedules and movement (C3A), Hearth systems (C3B), visuals (C3D), panels (C3E). Market prices and wages (I2).
