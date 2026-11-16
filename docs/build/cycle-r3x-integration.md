# R3X: Integration and tuning

**Iteration**: R3 Masters and the Town Book. **Wave**: integration. **Branch**: `cycle/r3x-integration` (R3.0 created it at its last commit; the wave's PRs land on it). **Recommended effort**: high.
**Depends on**: R3A to R3E. **Runs alongside**: V4's wave (merged into `main` as it goes). **Ports**: client 5247, relay 8857.

## Goal

The R3 wave is one game: places come alive when supplied and rest when not, a lantern round lights along the lamplighter's walk, residents grow into masters who bring the town new flavors, the Town Book fills with what the town is known for and earns a calling, every inspector can say where a thing came from and where it goes, nothing a player meets is a dead end, R2's lines still hold, and the wave reaches `main` in one merge.

## Read

- `CLAUDE.md`; `docs/build/r3-wave-notes.md` (all of it, with the rulings); the five wave PRs
- `docs/spec/30-roadmap.md`: R3 (Acceptance), V4, I4; `docs/spec/19-evenings.md`: the R3 acceptance
- `docs/spec/22-quality.md`: the R3 budget row, the lanes test, Playability from the redesign, Playtests; `docs/spec/13-ledger.md`: Population tiers
- `docs/spec/31-parallel-development.md`: Integration cycles, Build and review loop

## You own

Everything, but only to merge, fix and tune; plus the seam with V4B's pictures in the Town Book and the storybook if you land second (a small edit, listed in the PR).

## Tasks

1. **Merge the wave** into `cycle/r3x-integration` in a sensible order (R3A and R3B first, then R3C, which reads both, then R3D and R3E), resolving conflicts; merge `main` (V4's wave so far) too. Run everything after each.
2. **Stand-ins**: `grep -rn "R3 stand-in" packages apps tools --exclude-dir=dist --exclude-dir=node_modules` must come back empty; finish or cut what a cycle left, and say which. `OWED_SENDERS` must hold no R3 entry.
3. **Tune** against the R3 acceptance on every bench seed with R3E's tables: with candles for half the lanterns the places kept first are lit and the rest rest; the first master in the first Village year; a master's good on a shelf and stopping when its master goes; six pages found by the two seats and one calling earned; the fourth gap; the Merchants' and Patrons' variety wants met by masters, specialties and trade with no good the Ledger wires. Every number is in content; record what holds in `19-evenings.md` and the roadmap.
4. **Keep R2's lines**: the lanes test on every seed (`npm run lanes -w @qoti/bench`), the first Craftsfolk household by day 40 and a third of households by day 70, a full evening of 2,000 residents inside its budget, R1F's `r1 growth night` under 2 ms on a reference laptop. Supplies move draws, and draws move growth (below): if a line moves, tune supplies and draws, never the test.
5. **Determinism and co-op**: R3.0's skating spots fix and its place index check hold on the merged branch, with R3A's supplies and R3C's specialties and customs among the place inputs (the joining-seat tests pass); a year hashes the same in Node and a browser worker, the lamplighter's walk included; two browsers play a year online (`c5x-year`, `QOTI_YEAR=1`); a version 8 save opens (the migration), and `v6-hazel-day3.json` through every step.
6. **The dead-end hunt and the player's chair** (two rounds): every gap (the fourth too), wish, twist (the pie contest), feat, page and hint can be met; the audit is quiet or each flag explained. Play the first lamplit Village evening with candles short, a winter evening with and without firewood for the brazier, a master leaving town, both seats founding a page together, the Thread from a cider to its drinkers, a priority set and undone, the storybook printed.
7. **The seams with V4**: R3's look as the rulings assigned it (lit lanterns as the lamplighter reaches them, his pole and light, dark windows, resting pieces); V4B's pictures in the Town Book and the storybook if V4X has landed, else the data ready and a note for V4X.
8. **Ship**: one PR from `cycle/r3x-integration` into `main`; update the spec where the build differs (never the design's intent without the owner), `CHANGELOG.md`, the board; write I4's briefs (I4.0 first; V5 runs inside I4, `31-parallel-development.md`) and the playtest notes file (`docs/playtests/R3.md`); tell V4X what R3 left it.

## Acceptance criteria

- [ ] `30-roadmap.md`, R3, Acceptance, and the R3 list in `19-evenings.md`: every line with its evidence in the PR (test, bench table or screenshot).
- [ ] The lanes test passes on every bench seed; R2's Craftsfolk lines hold; the storybook prints from the browser with the valley's own pictures.
- [ ] No `R3 stand-in` left; `OWED_SENDERS` holds no R3 entry; any skip in the wave notes back on or rewritten.
- [ ] A version 8 save opens and plays on the merged branch; a year hashes the same in Node and a browser worker; two browsers play a year online.
- [ ] Typecheck, lint, unit tests, build, e2e (two browsers) and bench pass; budgets hold, including gaps, supplies, masters and the Town Book under 1 ms an hour together.
- [ ] The wave reaches `main` in one merge.

## Out of scope

New design (I4 and later); V4's look work beyond merging it and the seams the rulings name.

## Notes

- **From R2X** (the wave notes have them; check each still holds after the merge):
  - `SAVE_VERSION` was 8 after R2 (R2X did not bump it); R3.0 took 9. If a wave cycle bumped it again, keep one version for the merge and say so.
  - Household arrivals draw from a generator of their own per wave (`arrivalsRng`, seeded from the valley's seed and tick), so the evening and the day no longer reshuffle who arrives; R3's new choices use their own stream or a hash, never the `residents` stream.
  - Newcomers follow good evenings: past `content.places.growthFreeHouseholds` (20) households, homes come only as fast as recent fair evenings send grown-ups out (full pace at `growthFullOutPercent`, 40%; the Homes bar's `quietEvenings`). It is what makes the lanes test pass, and unlit lanterns and cold fires work against it.
  - The audit's gap kinds are two: `gap-unmeetable` (a kind the town cannot meet at all) and `gap-dead-end` (no command could close it where it stands); `shortOfSupplies` must pass both, and `building-cut-off` stays quiet.
  - R2C's "a shop nobody passes" read visitors near the shop for want of per-outlet sales; if R3D's counts now give them, retune that gap on them and say so.
  - The place index's check was the main evening cost at City scale; read R3.0's decision and R3E's line before tuning anything that adds place inputs.
  - The Craftsfolk gate reads evenings (`NeedsBasket.evenings`, 50, with `eveningsSlack`); Merchants and Patrons come in I4 and I5, so their variety acceptance is R3E's content and bench reading.
  - V3 reached `main` through V3X beside R2X; the endpaper map R3D prints is V3D's, and V4's illustrated books meet R3D's storybook at one seam.
- Keep a list of what each cycle's PR left for you, and close it before the merge.
- If R2's tuning moved a number this wave reads (the draw's parts, the baskets, the tiers), say so in the PR.
- A Hamlet's lanterns light for nothing: check the Lamplighter's Round and the custom of a kept supply as the rulings counted them.
- Runs as the build and review loop (`31-parallel-development.md`): two rounds of quality check, dead-end hunt and player's chair before the PR, each round's findings in it.
