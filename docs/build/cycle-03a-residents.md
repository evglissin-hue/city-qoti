# C3A: Residents

**Iteration**: I1. **Wave**: parallel. **Branch**: `cycle/03a-residents`.
**Depends on**: C3.0 merged. **Runs alongside**: C3B, C3C, C3D, C3E.

## Goal

Residents are individuals who arrive, settle, work, shop, rest, make friends and sometimes leave, walking the valley believably and deterministically, within budget.

## Read

- `CLAUDE.md`
- `docs/spec/11-residents.md` (all except Story characters)
- `docs/spec/20-architecture.md`: Determinism rules, I1 contracts
- `docs/spec/22-quality.md`: Performance budgets

## You own

`packages/sim/src/systems/residents/**`, `packages/sim/src/systems/movement/**`, content for species, traits and names, their tests, the residents scenarios in `tools/bench`.

## You can rely on

C3.0 contracts and cross-track API stubs; the hamlet fixture; C2A's map and rules.

## Tasks

1. **Content**: 7 species with tastes, 16 traits with compatibility, 200 given and 100 family names.
2. **Arrival and departure**: attractiveness, daily arrivals at the valley gate, household makeup, home choice by species desirability (read `hearth.charm` when present), departure after 3 low-mood days with a Chronicle call.
3. **Jobs**: assign adults and young residents to the nearest vacancy at their tier; release on building removal; update `present` as workers arrive and leave.
4. **Schedules**: the day table, Night Owl and Early Bird shifts, leisure spot choice, shopping trips through `nearestOutletWithFood` and `takeFromOutlet`.
5. **Movement**: A* with the spec's costs and tie-breaks, path cache keyed by `networkVersion`, per-tile speeds, stuck handling, the `requestMove` API used by C3C for porters and builders.
6. **Agent frames**: emit the stride-8 frame for residents outdoors after each turn.
7. **Needs and mood**: food (pantry, variety), water (well coverage and capacity), shelter, belonging, beauty; modifiers with decay; bands and productivity; mood tax factor exposed to C3C.
8. **Friendships and bonds**: points from shared places, compatibility, levels, decay; `addBond` and `addMoodModifier`.
9. **Inspect**: full resident detail for the `inspect` request.

## Acceptance criteria

- [ ] Tests for arrival, departure, job assignment, every schedule block, shopping, needs, mood bands, friendships and bonds, on the hamlet fixture.
- [ ] Pathfinding tests: deterministic tie-breaks, cache invalidation on road changes, stuck handling.
- [ ] Bench: 40-resident hamlet under 0.5 ms per tick; a synthetic 2,000-resident town under 4 ms average (movement and schedules only).
- [ ] Golden hamlet script (with C3.0 stubs for other tracks) deterministic in Node twice and in the browser.
- [ ] Definition of done.

## Out of scope

Production, logistics and budget (C3C), Charm, wishes and patterns (C3B), visuals (C3D), panels (C3E). Couples, births and story characters (I2).
