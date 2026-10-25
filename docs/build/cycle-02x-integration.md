# C2X: I0 integration

**Iteration**: I0. **Wave**: integration. **Branch**: `cycle/02x-integration`.
**Depends on**: C2A, C2B, C2C and C2D PRs open or merged.

## Goal

I0 shipped: all wave-2 work merged into a coherent game, deployed on the live link (if credentials exist), with a playtest file ready for the first evening together, and the I1 briefs checked against reality.

## Read

- `CLAUDE.md`
- `docs/spec/30-roadmap.md`: I0
- `docs/spec/31-parallel-development.md`: Integration cycles
- The four wave-2 PR descriptions

## You own

Everything, for merging, fixing and tuning only. No new features.

## Tasks

1. Merge C2A, C2B, C2C and C2D into `main` in a sensible order (contracts-heavy first), resolving conflicts and re-running checks after each.
2. Run the full suite, e2e with two browsers, bench, and a manual 30-minute two-tab session following the I0 acceptance list in `30-roadmap.md`.
3. Fix integration bugs; remove duplicated helpers; align naming.
4. Deploy (if credentials exist) and verify the live link from two browsers.
5. Create `docs/playtests/I0.md` from the template in `22-quality.md`.
6. Update the spec where behavior differs; update the board in `docs/build/README.md`.
7. Review the C3.0 to C3E briefs against the merged code and adjust paths, names and assumptions.

## Acceptance criteria

- [ ] All I0 acceptance criteria in `30-roadmap.md` checked, with evidence in the PR.
- [ ] CI green on `main`; deploy URL in the PR (or the deploy steps the human still needs to do).
- [ ] I1 briefs updated.
