# R3X: Integration and tuning

**Iteration**: R3 Masters and the Town Book. **Wave**: integration. **Branch**: `cycle/r3x-integration` (the master cut it at `main`; R3.0 landed on it by PR, and the wave's PRs land on it). **Recommended effort**: high.
**Depends on**: R3A to R3H. **Runs alongside**: V4's wave and the playtest cycles P3A to P3C (merged into `main` as they go). **Ports**: client 5247, relay 8857.

## Goal

The R3 wave is one game: places come alive when supplied and rest when not, a lantern round lights along the lamplighter's walk and is drawn as it goes, residents grow into masters who bring the town new flavors, the buildings a player sites grow with success, the Town Book fills with what the town is known for and earns a calling, every inspector can say where a thing came from and where it goes, a chapter prints as a storybook, nothing a player meets is a dead end, R2's lines still hold, and the wave reaches `main` in one merge.

## Read

- `CLAUDE.md`; `docs/build/r3-wave-notes.md` (all of it, with the rulings and Beside the wave); the eight wave PRs, and P3A to P3C's on `main`
- `docs/spec/30-roadmap.md`: R3 (Acceptance), V4, I4; `docs/spec/19-evenings.md`: the R2 and R3 acceptance
- `docs/spec/22-quality.md`: the R3 budget row, the lanes test, Playability from the redesign, Playtests; `docs/spec/13-ledger.md`: Population tiers
- `docs/spec/31-parallel-development.md`: Integration cycles, Build and review loop

## You own

Everything, but only to merge, fix and tune; plus the seam with V4B's pictures (`setPictureSource`, one call) if you land second.

## Tasks

1. **Merge the wave** into `cycle/r3x-integration` in a sensible order (`main` first, with P3A to P3C and V4's wave so far; then R3A and R3B, then R3H, which shares the levels pass with R3B, then R3C, which reads R3A and R3B, then R3D, R3F and R3G, then R3E), resolving conflicts. Run everything after each.
2. **Stand-ins**: `grep -rn "R3 stand-in" packages apps tools --exclude-dir=dist --exclude-dir=node_modules` must come back empty, and `PENDING` in `hearth/achievements.test.ts` must hold no R3 feat; finish or cut what a cycle left, and say which. `OWED_SENDERS` and `OWED_FIELDS` must hold no R3 entry.
3. **Tune** against the R3 acceptance on every bench seed with R3E's tables: with candles for half the lanterns the places kept first are lit and the rest rest; the first master in the first Village year; a master's good on a shelf and stopping when its master goes; six pages found by the two seats and one calling earned; the fourth gap; the tavern's Treats closing the nothing-to-sell gap; the Merchants' and Patrons' variety wants met by masters, specialties and trade with no good the Ledger wires. Every number is in content; record what holds in `19-evenings.md` and the roadmap.
4. **"A shop nobody passes"**: retune R2C's rule on the outlet's own evening customers (`Building.roundSales`, R3.0's counter) in place of the visitors near it, and say what changed.
5. **Keep P3A's fix**: households with savings never miss meals while food stands on the shelves (the audit's flag, R3E's report) after R3's tuning. **Keep R2's lines**: the lanes test on every seed (`npm run lanes -w @qoti/bench`); the evening goal in the owner's wording (every grown-up with a place worth the walk goes out), with the worst fair evening's share not below R2X's 48 to 54%; the first Craftsfolk household by day 40 and a third of households by day 70; a full evening of 2,000 residents inside its budget; R1F's `r1 growth night` under 2 ms on a reference laptop. Supplies move draws and draws move growth: if a line moves, tune supplies and draws, never the test. R2X's misses (R3E measures each): a third Craftsfolk by day 70 (1 of 4 seeds), gardens behind rows, Treats in autoplayed towns, Village debt against the credit line.
6. **Determinism and co-op**: R3.0's skating spots fix and its place index check hold on the merged branch, with R3A's rests and R3C's specialties and customs among the moving parts (`test/r3-0/placeIndex.test.ts`, the joining-seat tests); a year hashes the same in Node and a browser worker, the lamplighter's walk included; two browsers play a year online (`c5x-year`, `QOTI_YEAR=1`); a version 8 save opens (`v8-willow-day70.json`) and `v6-hazel-day3.json` through every step.
7. **The grown fixture**: regrow `apps/client/src/app/fixtures/grown.qoti` with R3E's seed or day count (`npm run fixture:grown -w @qoti/client`) so `grownFixture.test` passes at version 9.
8. **The dead-end hunt and the player's chair** (two rounds): every gap (the fourth too), wish, twist (the pie contest, a custom's), feat, page and hint can be met; the audit is quiet or each flag explained. Play the first lamplit Village evening with candles short, a winter evening with and without firewood for the brazier, a master leaving town, both seats founding a page together, the Thread from a cider to its drinkers, a priority set and undone, the storybook printed.
9. **The seams with V4** (V4X landed first, so R3X made them; second session): `main` (P3D #77, V4X #79) merged with four conflicts, both sides kept. The picture seam is wired where a valley opens (`app/GameView.tsx`: `setPictureSource(inkPictureSource(session))`); `pictureFor(ref, { print: true })` is an additive option, and the storybook asks print size only when the player presses Print (on screen it shows the slot-size pictures the books keep; a slot waits at most 20 s). A picture belongs to its place and moment and is never shown twice (`townBookPictured`, `oncePerBook` in `ui/chroniclePictures.ts`). The lamplighter's lamps fold into V4A's developing picture (samples never fall back to zero at 1x or 3x; `r3f-walk.mjs` with `QOTI_WALK_REAL`); a tea break waits on R3's cards (`v4c-tea-break.spec.ts`). The ornamental cherry follows the year (`cherryLook`), the clipped topiary stays green. The specialty mark became a Treat sold at one place on three evenings of a season (out of reach before even if every Treat a household wants were sold on the round). `coop.spec.ts`: no stall and no R3 cost found (snapshot, tick, reload to live match `main`); the host. Shots `r3x-autumn-*`, `r3x-lamps-*`, `r3x-pictures-*`.
10. **Shipped**: spec notes, `CHANGELOG.md`, the board, `docs/playtests/R3.md`, and I4's briefs and wave notes (`i4-wave-notes.md`, Starting after R3X).
