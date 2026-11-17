# R2X: Integration and tuning

**Iteration**: R2 The evening round. **Wave**: integration. **Branch**: `cycle/r2x-integration` (R2.0 created it at its last commit; the wave's PRs land on it). **Recommended effort**: high.
**Depends on**: R2A to R2F. **Runs alongside**: V3's wave (merged into `main` as it goes). **Ports**: client 5237, relay 8847.

## Goal

The R2 wave is one game: evenings have somewhere to go, treats sell on the round, shops follow the walkers, each lane can see what the other did for it, the lanes test holds on every bench seed, R1's moved targets hold, nothing a player meets is a dead end, and the wave reaches `main` in one merge. The endpaper map's two inks are wired by whichever of V3X and R2X lands second.

## Read

- `CLAUDE.md`; `docs/build/r2-wave-notes.md` (all of it); the six wave PRs
- `docs/spec/30-roadmap.md`: R2 (Acceptance), V3; `docs/spec/19-evenings.md`: the R2 acceptance
- `docs/spec/22-quality.md`: the R2 budgets, the lanes test, Playtests; `docs/spec/13-ledger.md`: What holds (R1X)
- `docs/spec/31-parallel-development.md`: Integration cycles, Build and review loop

## You own

Everything, but only to merge, fix and tune; plus the endpaper wiring if you land second (a small edit in V3D's interface file, listed in the PR).

## Tasks

1. **Merge the wave** into `cycle/r2x-integration` in a sensible order (R2A and R2B first, then R2F, R2C, R2E, R2D), resolving conflicts; merge `main` (V3's wave so far) too. Run everything after each.
2. **Stand-ins**: `grep -rn "R2 stand-in" packages apps tools --exclude-dir=dist --exclude-dir=node_modules` must come back empty; finish or cut what a cycle left, and say which. `OWED_SENDERS` must hold no R2 entry.
3. **The two inks on the endpaper map**: if V3X has landed, wire the Town overlay's data (the flows ink and `FootfallView.eve`) into V3D's `EndpaperInks`; if not, leave the data ready and a note for V3X.
4. **Tune** against the R2 acceptance on every bench seed with R2E's tables: every grown-up with a place in reach goes out; four fifths of Treats on the round once three places stand; the first Craftsfolk household by day 40 on evenings of 50, and a third of households by day 70 (R1's lines, moved here by the owner on 2026-11-15); evening streets and carts; the evening of 2,000 residents inside budget. Every number is in `content.places`, `content.gaps` and the baskets; record what holds in `19-evenings.md` and the roadmap.
5. **Village debt** (from R1X: 616 to 3,080 coins owed at day 70, one lean day on hazel): the household loop nets the treasury nothing, so see what evening trade and visitors change and tune what crosses the valley's edge; record it.
6. **The lanes test enforced** on every seed: one-lane towns at most three quarters of the residents and half the Craftsfolk households. If a seed fails, tune the draw and the tier asks, never the test.
7. **R1F's `r1 growth night` under 2 ms** on a reference laptop (moved here by the owner): read R2E's numbers and the laptop's.
8. **The dead-end hunt and the player's chair** (two rounds): every gap, wish, feat and guide step can be met; a town with no places is never stuck; play the first evening, a busy Village with places and a stall, both seats at once (can each say what the other did for them?), a winter evening with a brazier and without, an evening street with a cart that has no other way, a rename and its undo.
9. **Determinism and co-op**: a year hashes the same in Node and a browser worker, the lingering evening included; two browsers play a year online (`c5x-year`, `QOTI_YEAR=1`); a version 6 save opens (the migration) on the merged branch.
10. **Ship**: one PR from `cycle/r2x-integration` into `main`; update the spec where the build differs (never the design's intent without the owner), `CHANGELOG.md`, the board; write R3's briefs (R3.0 first) and the playtest notes file (`docs/playtests/R2.md`); tell V3X what R2 left it (the lot fields as R2F built them, the inks).

## Acceptance criteria

- [ ] `30-roadmap.md`, R2, Acceptance, and the R2 list in `19-evenings.md`: every line with its evidence in the PR (test, bench table or screenshot).
- [ ] The lanes test passes on every bench seed; each player can say from the screen what the other's work did for theirs today (screenshots, an e2e step).
- [ ] R1's two lines: on every bench seed the first Craftsfolk household by day 40 and a third of households by day 70; R1F's `r1 growth night` under 2 ms on a reference laptop.
- [ ] No `R2 stand-in` left; `OWED_SENDERS` holds no R2 entry; any skip in the wave notes back on or rewritten.
- [ ] Typecheck, lint, unit tests, build, e2e (two browsers) and bench pass; budgets hold, including the R2 lines.
- [ ] The wave reaches `main` in one merge.

## Out of scope

New design (R3 and later); V3's look work beyond merging it and wiring the two inks.

## Notes

- `SAVE_VERSION` is 8 on this branch (P2 took 7; R2.0's migration is 7 to 8); if a wave cycle bumped it, keep one version for the merge and say so.
- Keep a list of what each cycle's PR left for you, and close it before the merge.
- If R1's tuning moved a number this wave reads (tiers, baskets), say so in the PR (`13-ledger.md`, As built (R1X)).
- R2.0 left the Village Charter without its evening goal (R2C adds it with its counter) and Craftsfolk's charm and tavern gates in the data until R2B's tiers read evenings: check both landed together with their readers.

## As built (R2X, 2026-11-16)

Run as the build and review loop: the master merged, made the hard calls (contracts, determinism, saves, tuning) and played from the player's chair; `executor` agents built the place index's change counter, the autoplayer's coverage fixes, the Village debt decomposition and the real-data shots; a general agent drafted R3's briefs.

- **Merged** in order: R2F (#47), R2A (#49, then its perf head 5cb58a9), R2B (#48), R2C (#45), R2E (#53), R2D (#46, head 748bb95: R2C's `together`, no `cross`), and `main` (V3.0). Conflicts: board rows, the changelog, `bench.ts` (R2A's and R2E's bench files both kept), `view/health.ts` (below), `schedule.ts` (R2A's memo with R2B's carter), the golden year (re-recorded at the end).
- **Saves stay at version 8.** Every R2X addition is optional or derived: `EveningsState.outFair`, arrivals' per-wave generator, the place counter.
- **Fixed in the merge**: R2C's and R2E's `gap-dead-end` rules split (`gap-unmeetable`, R2C's: a kind the town cannot meet at all; `gap-dead-end`, R2E's: nothing could close it where it stands); R2B's shops test against R2F's `Lot`; R2B's readers on R2A's `tonightStops` (an elder keeps the afternoon round as their evening); R2F's no-streets test checks the lots' geometry against the wave base (the round moves the rest on purpose); the walled-in garden beds (an empty lot over a door tile goes; audit `building-cut-off`).
- **Arrivals** draw from a per-wave generator (`arrivalsRng`), so evening behavior no longer reshuffles who arrives.
- **The lanes test** (the master's ruling, option A): newcomers follow good evenings past 16 households (`content.places.growthFreeHouseholds`, `growthFullOutPercent`, `growthBareHomes` 0), told in the Homes bar (`quietEvenings`), the Ledger feed and, in a Hamlet, R2C's nowhere-to-go gap; audit `growth-waits-unseen`.
- **Tuning**: composed places draw more, winters bite less, Craftsfolk keep their tier down to evenings of 35 and put by 6 coins; braziers one per 15 grown-ups (the autoplayer); planning over the hour; the Village's evening goal counted whole; upkeep is 70% (a reserve of coins before Materials was tried and dropped); a gap opens only where something could close it. The numbers are in `19-evenings.md` and `13-ledger.md`, As built (R2X), and the tables in the PR.
- **The player's chair**: the strip says "so far" until 21:00 (it called every evening quiet while it ran), a round from an earlier day is "Their last evening", the edition's average has its scale; `site-unsupplied` gives a full cart a second visit; the one-road cart scene runs on to 02:00.
- **Budgets**: the place index rebuilds only when a change counter moves (verified in tests, the audit and the golden year), bringing planning the round under 0.4 ms a tick.
- **Missed, for R3**: a third of households Craftsfolk at day 70 (day 70 is a winter; best days 17 to 43%); R2F's gardens and corners in the regrown grown village (oak builds six single-lot rows; willow's 62 days build 30 row lots in 11 rows with 2 gardens and 4 corners); Village debt still tracks the credit line (17 to 19 coins a resident).
- **Endpaper inks**: V3X has not landed, so the data stays ready (`townInk` and `routeEdges` in `render/overlayTown.ts`, `FootfallView.eve`) for V3X to wire into V3D's `EndpaperInks`.
