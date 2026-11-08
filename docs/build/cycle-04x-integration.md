# C4X: I2 integration and I3 planning

**Iteration**: I2. **Wave**: integration. **Branch**: `cycle/04x-integration`.
**Depends on**: C4A to C4F open or merged.

## Goal

The Village shipped and tuned, deployed, ready for a playtest evening, and the I3 briefs written.

## Read

- `CLAUDE.md`, `docs/spec/30-roadmap.md` (I2, I3), `docs/spec/31-parallel-development.md`
- The six wave PRs, `docs/playtests/I1.md`, the C3X PR (what integration learned)

## You own

Everything, for merging, fixing and tuning, plus new briefs.

## Tasks

1. Merge the wave (contracts-heavy first), re-running checks after each. Expect cross-track test assumptions to break once real systems run together; isolate unit tests with `withoutSystems`, and fix behavior where the combination exposes a real gap.
2. Extend the autoplayer to zone, trade and chase the Village Charter; tune until a Village is reached in about two to three evenings from a Hamlet of 30 without dead ends (money, labor, food). Record final values in the spec.
3. Play two browsers for a season; fix what feels wrong; deploy if credentials exist; `docs/playtests/I2.md`.
4. Write the I3 briefs (seasons and weather, festivals, nature and the Field Guide, threats and the Watch, Seasons art, Seasons UI).

## Acceptance criteria

- [ ] All I2 acceptance criteria in `30-roadmap.md` checked with evidence.
- [ ] CI green; deploy URL or remaining human steps in the PR.
- [ ] I3 briefs and an updated board.
