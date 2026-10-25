# C3X: I1 integration and I2 planning

**Iteration**: I1. **Wave**: integration. **Branch**: `cycle/03x-integration`.
**Depends on**: C3A, C3B, C3C, C3D and C3E PRs open or merged.

## Goal

The hamlet shipped and tuned, deployed, ready for a playtest evening, and the I2 Village briefs written.

## Read

- `CLAUDE.md`
- `docs/spec/30-roadmap.md`: I1 and I2
- `docs/spec/31-parallel-development.md`: Integration cycles, Writing a brief
- `docs/spec/13-ledger.md`: I1 buildings (sanity check)
- The five wave-3 PR descriptions and `docs/playtests/I0.md`

## You own

Everything, for merging, fixing and tuning, plus new briefs.

## Tasks

1. Merge the wave-3 PRs (contracts-heavy first), re-running checks after each.
2. Replace fixtures with live systems everywhere; run a headless "two evenings" simulation from the starting state and tune numbers until the I1 acceptance criteria in `30-roadmap.md` hold (record final values in the spec).
3. Play the hamlet manually with two browsers for a full in-game season; fix what feels wrong.
4. Deploy (if credentials exist); create `docs/playtests/I1.md`.
5. Update the spec and the board.
6. Write the I2 briefs from `30-roadmap.md` (I2 scope) and the playtests: a short contracts cycle (C4.0) and parallel tracks, for example market and money (prices, wages, households, invariant), growth (zoning, lots, streets, traffic, desire paths, terraforming), Village chains and services, co-op tools (plans, requests) and story characters, Village art, Village UI. Keep each brief to about two pages.

## Acceptance criteria

- [ ] All I1 acceptance criteria in `30-roadmap.md` checked, with evidence.
- [ ] CI green on `main`; deploy URL or remaining human steps in the PR.
- [ ] I2 briefs and an updated board committed.
