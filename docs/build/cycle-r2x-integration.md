# R2X: Integration and tuning

**Iteration**: R2 The evening round. **Wave**: integration. **Branch**: `cycle/r2x-integration` (R2.0 created it at its last commit; the wave's PRs land on it). **Recommended effort**: high.
**Depends on**: R2A to R2F. **Runs alongside**: V3's wave (merged into `main` as it goes). **Ports**: client 5237, relay 8847.

## Goal

The R2 wave is one game: evenings have somewhere to go, treats sell on the round, shops follow the walkers, each lane can see what the other did for it, the lanes test holds on every bench seed, nothing a player meets is a dead end, and the wave reaches `main` in one merge. The endpaper map's two inks are wired, by whichever of V3X and R2X lands second.

## Read

- `CLAUDE.md`; `docs/build/r2-wave-notes.md` (all of it); the six wave PRs
- `docs/spec/30-roadmap.md`: R2 (Acceptance), V3; `docs/spec/19-evenings.md`: the R2 acceptance
- `docs/spec/22-quality.md`: the R2 budgets, the lanes test, Playtests
- `docs/spec/31-parallel-development.md`: Integration cycles, Build and review loop

## You own

Everything, but only to merge, fix and tune; plus the endpaper wiring if you land second (a small edit in V3D's interface file, listed in the PR).

## Tasks

1. **Merge the wave** into `cycle/r2x-integration` in a sensible order (R2A and R2B first, then R2F, R2C, R2E, R2D), resolving conflicts; merge `main` (V3's wave so far) in too. Run everything after each.
2. **Stand-ins**: `grep -rn "R2 stand-in" packages apps tools` must come back empty; finish or cut what a cycle left, and say which. `OWED_SENDERS` must hold no R2 entry.
3. **The two inks on the endpaper map**: if V3X has landed, wire the Town overlay's data into V3D's interface; if not, leave the data ready and the note for V3X. Check against V3.0's brief.
4. **Tune** against the R2 acceptance on every bench seed (`19-evenings.md`, with R2E's tables): every grown-up with a place in reach goes out; four fifths of Treats on the round once three places stand; the first Craftsfolk household by day 40 on evenings of 50; evening streets and carts; the evening of 2,000 residents inside budget. Every number is in `PLACES` and the content tables; record what holds in `19-evenings.md` and the roadmap, and what the lanes test shows.
5. **The lanes test enforced** on every seed: one-lane towns at most three quarters of the residents and half the Craftsfolk households. If a seed fails, tune the draw and the tier asks, not the test.
6. **The dead-end hunt and the player's chair** (two rounds): every gap, wish and guide step can be met; a town with no places is never stuck; play the first evening, a busy Village with places and a stall, both seats at once (can each say what the other did for them?), a winter evening with a brazier and without, an evening street with a cart that has no other way, a rename and its undo.
7. **Determinism and co-op**: a year hashes the same in Node and a browser worker (the lingering evening included); two browsers play a year online (`c5x-year`).
8. **Ship**: one PR from `cycle/r2x-integration` into `main`; update the spec where the build differs (never the design's intent without the owner), `CHANGELOG.md`, the board; write R3's briefs (R3.0 first) and the playtest notes file; tell V3X what R2 left it.

## Acceptance criteria

- [ ] `30-roadmap.md`, R2, Acceptance, and the R2 list in `19-evenings.md`: every line with its evidence in the PR (test, bench table or screenshot).
- [ ] The lanes test passes on every bench seed; each player can say from the screen what the other's work did for theirs today (screenshots, an e2e step).
- [ ] No `R2 stand-in` left; the skips in the wave notes are back on or rewritten.
- [ ] Typecheck, lint, unit tests, build, e2e (two browsers) and bench pass; budgets hold, including the R2 lines.
- [ ] The wave reaches `main` in one merge.

## Out of scope

New design (R3 and later); V3's look work beyond merging it and wiring the two inks.

## Notes

- `SAVE_VERSION` is 7 on this branch (R2.0); if a wave cycle bumped it, keep one version for the merge and say so.
- Keep a list of what each cycle's PR left for you, and close it before the merge.
- If R1's tuning moved a number this wave reads (the tiers, the baskets), say so in the PR (check against R1X's As built).
- R1X left open, for this cycle's tuning: Villages still owe 1,200 to 2,694 coins at day 70 (with no lean days); the first Craftsfolk by day 40 on hazel only, and a third of households by day 70 on no seed (best 14%, willow: towns grow fast and fill with Settlers); the lanes test above. R1X's table, with every seed, is in `13-ledger.md` (What holds) and the R1X PR.
- The growth pass waits for hands (demand reason `hands`: no new business while two stand empty); shops opened by footfall go through the same gate.
