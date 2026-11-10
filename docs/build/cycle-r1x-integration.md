# R1X: Integration and tuning

**Iteration**: R1 Zones first. **Wave**: integration. **Branch**: `cycle/r1x-integration` (R1.0 created it at its last commit; the wave's PRs land on it). **Recommended effort**: high.
**Depends on**: R1A to R1F. **Runs alongside**: V2's wave (merged into `main` as it goes). **Ports**: client 5227, relay 8837.

## Goal

The R1 wave is one game: a fresh valley grows from a hamlet to a Village and through its first winter on the zones-first Ledger, the tuning targets hold on every bench seed, nothing a player meets is a dead end, and the whole wave reaches `main` in one merge, with the last commit of the old rules tagged `chains-final` and a valley from before R1 refused kindly.

## Read

- `CLAUDE.md`; `docs/build/r1-wave-notes.md` (all of it); the six wave PRs
- `docs/spec/30-roadmap.md`: R1 Zones first (Acceptance); `docs/spec/13-ledger.md`: Tuning targets and acceptance
- `docs/spec/21-networking-and-saves.md`: The fresh start
- `docs/spec/31-parallel-development.md`: Integration cycles; Build and review loop
- `docs/spec/22-quality.md`: the R1 budgets, Playtests

## You own

Everything, but only to merge, fix and tune; plus `apps/server` and `tools/dev-server` for the old valley's answer (agree with V2, which owns them in its wave).

## Tasks

1. **Merge the wave** into `cycle/r1x-integration` in a sensible order (R1A and R1B first, then R1F, R1D, R1C, R1E), resolving conflicts; merge `main` (V2's wave) in too. Run everything after each.
2. **Stand-ins**: `grep -rn "R1 stand-in" packages apps tools` must come back empty; finish or cut what a cycle left, and say which.
3. **Senders**: `OWED_SENDERS` in `test/every-command-has-a-sender.test.ts` must be empty before the merge into `main`.
4. **The old valley's answer**: an online room answers a hello for a valley saved under version 6 with `OLD_VALLEY` (the server and the dev relay); the title screen's grayed list (R1C) works against it; nothing is deleted on the device or the server.
5. **The grown village scene** (design note (d)): V2.0's `?debug&fixture=grown` is a version 5 snapshot, which version 6 refuses; regrow it with V2.0's script under the new rules.
6. **Tune** against the targets on every bench seed (`13-ledger.md`, Tuning targets; R1F's tables): about a third of working hands in food; the Ledger's decisions under 150 in 70 days with no pause and no order; the first Craftsfolk by day 40 and a third of households by day 70; no business a whole day without its raw good while the carrier may buy; winter with teeth (half the reserve and the pass closed two days: hungry or cold households, no building lost). Record what holds in `13-ledger.md` and the roadmap.
7. **The dead-end hunt** and **the player's chair** (two rounds): every wish, twist and guide step can be met; nothing removable is unbuildable; play the first hour, a busy Village, both seats at once, the first winter with the reserve met and with it half met, a mistake and its undo.
8. **Determinism and co-op**: a year hashes the same in Node and a browser worker; two browsers play a year online (`c5x-year`).
9. **The lanes test** recorded on every seed (R2 enforces it).
10. **Ship**: tag the last commit of the old rules on `main` `chains-final` before the merge; one PR from `cycle/r1x-integration` into `main`; update the spec where the build differs, `CHANGELOG.md`, the board; write R2's briefs from `30-roadmap.md` (R2.0 first) and the playtest notes file.

## Acceptance criteria

- [ ] `30-roadmap.md`, R1 Zones first, Acceptance: every line, each with its evidence in the PR (test, bench table or screenshot).
- [ ] `OWED_SENDERS` empty; no `R1 stand-in` left; the R1.0 skips (wave notes) back on or rewritten.
- [ ] Typecheck, lint, unit tests, build, e2e (two browsers) and bench pass; budgets hold, including the R1 lines.
- [ ] `chains-final` tagged; the wave reaches `main` in one merge.

## Out of scope

New design (R2 and later); V2's look work beyond merging it.

## Notes

- `SAVE_VERSION` is 6 on this branch (R1.0); if a wave cycle bumped it, keep one version for the merge and say so.
- Keep a list of what each cycle's PR left for you, and close it before the merge into `main`.
