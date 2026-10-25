# C3E: Hamlet UI

**Iteration**: I1. **Wave**: parallel. **Branch**: `cycle/03e-hamlet-ui`.
**Depends on**: C3.0 merged. **Runs alongside**: C3A, C3B, C3C, C3D.

## Goal

Both lanes get the panels they need to play the hamlet: inspectors for residents and buildings, wishes, the Pattern Book, the Chronicle, Ledger reports, customization, achievements, the while-you-were-away letter, and per-player undo.

## Read

- `CLAUDE.md`
- `docs/spec/16-coop.md`: Lenses, Guardrails (undo), While you were away
- `docs/spec/17-presentation.md`: UI, Accessibility
- `docs/spec/11-residents.md`: Client needs
- `docs/spec/12-hearth.md`: Pattern Book (Book UI), Wishes (Feedback)
- `docs/spec/13-ledger.md`: Reports and overlays (I1)
- `docs/spec/20-architecture.md`: Client, I1 contracts

## You own

`apps/client/src/ui`, `apps/client/src/input`, `apps/client/src/state`, `apps/client/src/app`.

## You can rely on

C3.0 contracts and mock views (build against mocks first, then wire to the live Mirror), C2D's theme, lenses and registries.

## Tasks

1. **Mirror**: apply all I1 events; `inspect` requests for detail views.
2. **Resident inspector**: portrait (from the art kit), name, species, traits, household, home, job, mood breakdown, needs, friends, wish, bio and history; follow button.
3. **Building inspector**: runtime state (workers present, buffers, progress, condition, status), priority and pause toggles, customization entry, built by.
4. **Hearth panels**: Wishes (list, highlight target area), Pattern Book (pages, hints, credit), Chronicle (scrollable history), Customization (swatches, details, sign text), Achievements (plaques).
5. **Ledger panels**: Stocks (stock, produced and consumed per day, trend sparkline), Workforce (jobs and vacancies), Budget (income and expenses by category, today and season), goods for sale toggles, field painting tool.
6. **Lens toolbars**: add the I1 tools and overlays to each lens.
7. **While you were away**: the letter on connect.
8. **Undo**: per-seat stack of the last 30 accepted commands with inverses; Ctrl+Z; rejected undo explained gently.
9. **Alerts**: lens-filtered alerts (Ledger: shortages, idle buildings, lean times; Hearth: wishes, pattern hints).

## Acceptance criteria

- [ ] Every panel works against mocks (component tests) and against a live hamlet (e2e smoke).
- [ ] Undo works for place, remove, paint and customize, and is rejected cleanly when the target changed.
- [ ] Screenshots of every panel in the PR.
- [ ] Definition of done.

## Out of scope

Rendering (C3D), simulation (C3A to C3C).
