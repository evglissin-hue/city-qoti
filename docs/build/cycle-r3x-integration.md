# R3X: Integration and tuning

**Iteration**: R3 Masters and the Town Book. **Wave**: integration. **Branch**: `cycle/r3x-integration` (the master cut it at `main`; R3.0 landed on it by PR, and the wave's PRs land on it). **Recommended effort**: high.
**Depends on**: R3A to R3G. **Runs alongside**: V4's wave (merged into `main` as it goes). **Ports**: client 5247, relay 8857.

## Goal

The R3 wave is one game: places come alive when supplied and rest when not, a lantern round lights along the lamplighter's walk and is drawn as it goes, residents grow into masters who bring the town new flavors, the Town Book fills with what the town is known for and earns a calling, every inspector can say where a thing came from and where it goes, a chapter prints as a storybook, nothing a player meets is a dead end, R2's lines still hold, and the wave reaches `main` in one merge.

## Read

- `CLAUDE.md`; `docs/build/r3-wave-notes.md` (all of it, with the rulings); the seven wave PRs
- `docs/spec/30-roadmap.md`: R3 (Acceptance), V4, I4; `docs/spec/19-evenings.md`: the R2 and R3 acceptance
- `docs/spec/22-quality.md`: the R3 budget row, the lanes test, Playability from the redesign, Playtests; `docs/spec/13-ledger.md`: Population tiers
- `docs/spec/31-parallel-development.md`: Integration cycles, Build and review loop

## You own

Everything, but only to merge, fix and tune; plus the seam with V4B's pictures (`setPictureSource`, one call) if you land second.

## Tasks

1. **Merge the wave** into `cycle/r3x-integration` in a sensible order (R3A and R3B first, then R3C, which reads both, then R3D, R3F and R3G, then R3E), resolving conflicts; merge `main` (V4's wave so far) too. Run everything after each.
2. **Stand-ins**: `grep -rn "R3 stand-in" packages apps tools --exclude-dir=dist --exclude-dir=node_modules` must come back empty, and `PENDING` in `hearth/achievements.test.ts` must hold no R3 feat; finish or cut what a cycle left, and say which. `OWED_SENDERS` and `OWED_FIELDS` must hold no R3 entry.
3. **Tune** against the R3 acceptance on every bench seed with R3E's tables: with candles for half the lanterns the places kept first are lit and the rest rest; the first master in the first Village year; a master's good on a shelf and stopping when its master goes; six pages found by the two seats and one calling earned; the fourth gap; the tavern's Treats closing the nothing-to-sell gap; the Merchants' and Patrons' variety wants met by masters, specialties and trade with no good the Ledger wires. Every number is in content; record what holds in `19-evenings.md` and the roadmap.
4. **"A shop nobody passes"**: retune R2C's rule on the outlet's own evening customers (`Building.roundSales`, R3.0's counter) in place of the visitors near it, and say what changed.
5. **Keep R2's lines**: the lanes test on every seed (`npm run lanes -w @qoti/bench`); the evening goal in the owner's wording (every grown-up with a place worth the walk goes out), with the worst fair evening's share not below R2X's 48 to 54%; the first Craftsfolk household by day 40 and a third of households by day 70; a full evening of 2,000 residents inside its budget; R1F's `r1 growth night` under 2 ms on a reference laptop. Supplies move draws and draws move growth: if a line moves, tune supplies and draws, never the test. R2X's misses (R3E measures each): a third Craftsfolk by day 70 (1 of 4 seeds), gardens behind rows, Treats in autoplayed towns, Village debt against the credit line.
6. **Determinism and co-op**: R3.0's skating spots fix and its place index check hold on the merged branch, with R3A's rests and R3C's specialties and customs among the moving parts (`test/r3-0/placeIndex.test.ts`, the joining-seat tests); a year hashes the same in Node and a browser worker, the lamplighter's walk included; two browsers play a year online (`c5x-year`, `QOTI_YEAR=1`); a version 8 save opens (`v8-willow-day70.json`) and `v6-hazel-day3.json` through every step.
7. **The grown fixture**: regrow `apps/client/src/app/fixtures/grown.qoti` with R3E's seed or day count (`npm run fixture:grown -w @qoti/client`) so `grownFixture.test` passes at version 9.
8. **The dead-end hunt and the player's chair** (two rounds): every gap (the fourth too), wish, twist (the pie contest, a custom's), feat, page and hint can be met; the audit is quiet or each flag explained. Play the first lamplit Village evening with candles short, a winter evening with and without firewood for the brazier, a master leaving town, both seats founding a page together, the Thread from a cider to its drinkers, a priority set and undone, the storybook printed.
9. **The seams with V4**: R3F's look with V4A's rest frame (lamps coming on one by one do not pop the still frame); V4B's pictures in the Town Book and the storybook if V4X has landed (one `setPictureSource` call), else the data ready and a note for V4X.
10. **Ship**: one PR from `cycle/r3x-integration` into `main`; update the spec where the build differs (never the design's intent without the owner), `CHANGELOG.md`, the board; write I4's briefs (I4.0 first; V5 runs inside I4, `31-parallel-development.md`; the worldgen rim and the bandstand with the theater and the inn are I4's) and the playtest notes file (`docs/playtests/R3.md`); tell V4X what R3 left it.

## Acceptance criteria

- [ ] `30-roadmap.md`, R3, Acceptance, and the R3 list in `19-evenings.md`: every line with its evidence in the PR (test, bench table or screenshot).
- [ ] The lanes test passes on every bench seed; the evening goal and R2's Craftsfolk lines hold; the storybook prints from the browser with the valley's own pictures.
- [ ] No `R3 stand-in` left; `OWED_SENDERS` and `OWED_FIELDS` hold no R3 entry; any skip in the wave notes back on or rewritten.
- [ ] A version 8 save opens and plays on the merged branch; a year hashes the same in Node and a browser worker; two browsers play a year online.
- [ ] Typecheck, lint, unit tests, build, e2e (two browsers) and bench pass; budgets hold, including gaps, supplies, masters and the Town Book under 1 ms an hour together.
- [ ] The wave reaches `main` in one merge.

## Out of scope

New design (I4 and later); V4's look work beyond merging it and the seams the rulings name.

## Notes

- `SAVE_VERSION` is 9 (R3.0). If a wave cycle bumped it again, keep one version for the merge and say so.
- Arrivals draw from their own generator; R3 needs no dice (settling by priority, distance and id; masters by days and id; pages by day and id). If a cycle added a draw, it must have its own stream.
- The place index's check was the main evening cost at City scale; R3.0 kept every R3 input a moving part of the draw. Read R3E's line before tuning anything that adds work to `refreshDraws`.
- R2C's "a shop nobody passes" reads visitors near the shop until task 4.
- Keep a list of what each cycle's PR left for you, and close it before the merge.
- If R2's tuning moved a number this wave reads (the draw's parts, the baskets, the tiers), say so in the PR.
- A Hamlet's lanterns light for nothing and do not count for the Lamplighter's Round or the custom of a kept supply (the rulings).
- Runs as the build and review loop (`31-parallel-development.md`): two rounds of quality check, dead-end hunt and player's chair before the PR, each round's findings in it.
