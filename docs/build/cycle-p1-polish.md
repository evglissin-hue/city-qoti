# P1: Quality audit and polish (the owner's playtest)

**Iteration**: I3 to I4. **Wave**: serial, one master session running the build and review loop (`docs/spec/31-parallel-development.md`) with executor waves. **Branch**: `claude/busy-archimedes-3hky32`.
**Depends on**: C5X merged. **Runs alongside**: nothing; no I4 brief is written until P1 is done (`30-roadmap.md`, P1).

## Goal

The rough edges the owner's playtest of 2026-11-08 found are gone, the town can no longer be locked into a restart, every wish and goal can be met, the screen says what to aim for, and the vision the playtest sketched for the next stages is in the spec with a first slice to play.

## Input: the owner's playtest (2026-11-08, "Cottage Construction and UI Enhancements")

Bugs and weak mechanics:

1. The town hall could be removed but not rebuilt, forcing a restart.
2. A resident asked for a well although home was inside a well's radius.
3. Planning a festival did nothing.
4. Some wishes are dead ends.
5. Land cannot be flattened.
6. Wheat can only be sown in spring, so a windmill is useless in summer.

Economy and simulation:

7. Early building mostly needs planks; stone ran short once the windmill went up.
8. Residents walk through each other; their animation and AI should improve.
9. A simple trade system: see what the neighbors need, import with money, export for income, with each neighbor its own advantage and little manual price or trader management.

UI and clarity:

10. The overall goal should be clearer.
11. More icons, less clutter, a cleaner and more visual UI.
12. Ledger resource counts: bigger, perhaps in a side panel.
13. The end of the game needs work (valleys are generated and never repeat).

Visuals and sound:

14. More decoration variety, such as window flowers in different colors.
15. Trees and vegetation; meadow grass should look more alive and fluffy.
16. Pricier decorations that boost a building's productivity and look better.
17. Night ambience is too fake and chirpy.

Vision for the next stages:

18. Zoning like Cities Skylines: buildings grow and improve on their own, with decorating by hand still possible.
19. Development paths by map and location (an industrial village, or a pretty one for tourism or pilgrimage), shaping how the village looks over time, with easier growing.

## How it runs

The master (Opus, max effort) traced every item with read-only explorers, fixed 1 and 2 itself, then briefed Sonnet executors in two waves of parallel worktrees:

- Wave 1: festivals (3), wishes (4), Earthworks (5), wheat, stone and hamlet imports (6, 7 and the import half of 9), the goal pill, icons and stores (10 to 12), decor colors and boosts (14, 16).
- Wave 2: walkers (8), trade deals (9), the chapter's end (13), vegetation (15), night sound (17), homes that improve and development paths (18, 19), and the playability audit that hunts dead ends from now on.

After each wave: the quality check, the dead-end hunt and the player's chair, one or two rounds.

## Acceptance criteria

- [ ] Each of the 19 items is fixed, built as a first slice, or written into the spec with the reason, and the As built below says which.
- [ ] A test for each fixed bug, and a check for its whole class where one is cheap (every wish, every building, every command).
- [ ] The playability audit runs clean on its seeds, or every flag is explained.
- [ ] Typecheck, lint, unit tests, build and bench pass; e2e as far as this machine allows.
- [ ] Definition of done in `docs/spec/22-quality.md`.

## As built

To be filled in at the end of the cycle.
