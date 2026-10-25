# C3B: Hearth v1

**Iteration**: I1. **Wave**: parallel. **Branch**: `cycle/03b-hearth-v1`.
**Depends on**: C3.0 merged. **Runs alongside**: C3A, C3C, C3D, C3E.

## Goal

The Hearth lane becomes a real game: Charm with honest rules, the Pattern Book with 8 discoverable patterns, 12 wishes residents actually voice, the Chronicle, achievements, and paint-and-details customization.

## Read

- `CLAUDE.md`
- `docs/spec/12-hearth.md`: Charm, Pattern Book, Wishes, Chronicle
- `docs/spec/10-world-and-building.md`: Customization (Phase 1)
- `docs/spec/15-progression.md`: Achievements
- `docs/spec/16-coop.md`: While you were away
- `docs/spec/20-architecture.md`: Determinism rules, I1 contracts

## You own

`packages/sim/src/systems/hearth/**` (charm, patterns, wishes), `packages/sim/src/systems/chronicle/**`, `packages/sim/src/systems/achievements/**`, `packages/sim/src/conditions/**` (the Condition DSL evaluator), the `build.customize` command, content for patterns, wishes, achievements and Chronicle templates, their tests.

## You can rely on

C3.0 contracts, fixtures and stubs (`addBond`, `addMoodModifier`, resident and household data).

## Tasks

1. **Charm**: every source in the table, the no-spam, variety, clutter and enclosure rules, the five category layers, dirty-chunk recompute (hourly and after Hearth commands), layer patches.
2. **Condition DSL evaluator**, with named code predicates for the hard cases (lantern route, path route).
3. **Pattern engine and the 8 I1 detectors**; stable instance keys; site bonuses applied to charm; discovery credit and "built together"; unlocks; hints (3 visible at a time).
4. **Wishes**: daily generation with caps and weights, the 12 templates, binding, hourly target checks, expiry, rewards through `addBond` and `addMoodModifier`, thank-you letters as notify events.
5. **Chronicle**: templates for the I1 kinds; the weekly wishes digest; deterministic text.
6. **Achievements**: engine on the DSL, the 10 I1 achievements, credit to seats.
7. **While you were away**: a view builder that summarizes entries and stat changes since a seat's `lastSeenTick`.
8. **Customization**: `build.customize` validate and apply (palette swatches, details, sign text); marks the building handmade.

## Acceptance criteria

- [ ] Charm rule tests, including "fifty benches count as two".
- [ ] Each detector has positive and negative fixtures; discovery and built-together credit tested.
- [ ] Each wish template is generated and granted in a fixture; caps and expiry tested.
- [ ] Each achievement unlocks in a fixture; Chronicle text is identical across two runs.
- [ ] Bench: charm recompute under 2 ms per dirty chunk; patterns pass under 3 ms per in-game hour on the hamlet.
- [ ] Definition of done.

## Out of scope

Rendering overlays and panels (C3D, C3E), residents' own logic (C3A), economy (C3C). Festivals, nature and district styles (I3, I4).
