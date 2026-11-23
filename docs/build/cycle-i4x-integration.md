# I4X: Integration and tuning

**Iteration**: I4 Town, wave one. **Wave**: integration. **Branch**: `cycle/i4x-integration` (the master cut it for I4.0's PR; the wave's PRs land on it). **Recommended effort**: xhigh (it merges a gameplay wave and V5 at once).
**Depends on**: I4A to I4H, V5A, V5B. **Runs alongside**: nothing in the sim; any P cycle on `main` (merged in as it lands). **Ports**: client 5281, relay 8891.
*Draft (R3X, 2026-11-23); every design call marked "proposed (R3X draft)" waits for the master's or the owner's word.*

## Goal

Wave one is one game: a grown Village claims the Town, weathers its bandit raid trial and enters the Age of Steam with a moment both players see; the Ledger sites steam works whose smoke the Hearth argues about, draws districts with policies, keeps contracts and trades with Port Amberly; the Hearth styles and restyles districts, keeps an Old Town and composes the new evening places; guests walk the round; Merchants move in; the eight pages and the feats can be earned; the town looks and sounds like a picture-book canal town grown round an old core; nothing a player meets is a dead end; R2's and R3's lines still hold; and the wave reaches `main` in one merge.

## Read

- `CLAUDE.md`; `docs/build/i4-wave-notes.md` (all of it, with the rulings); the ten wave PRs
- `docs/spec/30-roadmap.md`: I4 Town, V5; `docs/spec/18-eras.md`; `docs/spec/15-progression.md`: Ranks and Charters
- `docs/spec/22-quality.md`: the redesign's budgets with I4.0's row, the lanes test, Playability from the redesign, Playtests; `docs/spec/13-ledger.md`: Population tiers, What holds
- `docs/spec/31-parallel-development.md`: Integration cycles, Build and review loop

## You own

Everything, but only to merge, fix and tune.

## Tasks

1. **Merge the wave** into `cycle/i4x-integration` in a sensible order (proposed, R3X draft): `main` first (any P cycle, V4X if it landed after I4.0); then I4A (everything reads the era and the Charter), I4B, I4C (districts read the era; restyles meet smoke in charm), I4D, I4E, I4F; then V5A and V5B (they draw from the views); then I4G (it reads everything); then I4H (it measures everything). Run everything after each.
2. **Stand-ins**: `grep -rn "I4 stand-in" packages apps tools --exclude-dir=dist --exclude-dir=node_modules` must come back empty, and `PENDING` in `hearth/achievements.test.ts` must hold no I4 feat; finish or cut what a cycle left, and say which. `OWED_SENDERS` and `OWED_FIELDS` must hold no I4 entry.
3. **Tune** against the roadmap's I4 scope for wave one, on every bench seed and both profiles with I4H's tables. Proposed targets (R3X draft; the spec sets none for the Town, so each needs the master's or the owner's word): the Town claimed on every seed and both profiles by a day the master sets from I4H's first readings (for scale, the Village is claimed on days 17 to 34, and a year is 24 days); the trial weathered first time when prepared and failed (then weathered) when not, with nothing lost beyond the raid's own losses; the first Merchants household within a season of the claim; a steam mill's smoke visibly costing a place downwind; every policy changing what it says; a contract kept and one missed on some seed; guests on summer evenings without a resident losing a seat; each new page found on some seed. Every number is in content; record what holds in `15-progression.md`, `18-eras.md` and the roadmap.
4. **Money** (R3X's lesson): with `debt.ts`'s new categories, debt per resident at the Town no worse than R3X's figure at the Village on any seed, unless the owner rules otherwise; each new flow (contracts, Port Amberly, guests, coal, restyling) measured and named in the PR.
5. **Keep the lines**: the lanes test on every seed (guests counted apart); the evening goal's worst fair evening not below R3X's figure (a mill quarter's late shift is the new pressure on it); P3A's hands and food in both profiles; the decisions count; a full evening of 2,000 residents with a full inn inside its budget. If a line moves, tune the design's numbers, never the test.
6. **Determinism and co-op**: smoke, policies, restyles, guests and shows as pure functions of saved state (the joining-seat tests); a year with a sealed Town hashes the same in Node and a browser worker; two browsers play a year online through the trial and the era moment (`c5x-year`, `QOTI_YEAR=1`); the version 9 fixture opens and plays, and `v8-willow-day70.json` and `v6-hazel-day3.json` through every step.
7. **The fixtures**: regrow `apps/client/src/app/fixtures/grown.qoti` at version 10 (`npm run fixture:grown -w @qoti/client`) so `grownFixture.test` passes, and keep I4H's Town fixture current for V5's shots.
8. **The dead-end hunt and the player's chair** (two rounds): every goal, trial, page, hint, feat, contract offer and story step can be met; the audit is quiet or each flag explained. Play: the Town claim and the trial raid evening from both seats; the era moment on both screens (card, fireworks, band); a district drawn, policied, styled and restyled, each undone; the first steam mill and its smoke over a place; a contract kept and one missed; guests at the inn on a summer evening; Rook's letters to his Lighthouse; an Old Town kept and then broken; winter with a steam mill and the pass closed.
9. **The look**: V5A and V5B on the merged sim with the Town fixture; `v5-shots.mjs` before and after in every scene and hour; `v5-perf.mjs` and both laptops' Measure this laptop runs (or the owner's word) against `22-quality.md`; R3F's lamps with gas color and V4A's refinement (no pop).
10. **Ship**: one PR from `cycle/i4x-integration` into `main`; update the spec where the build differs (never the design's intent without the owner), `CHANGELOG.md`, the board; write wave two's briefs (its contracts cycle first, proposed I4.5, with the wave notes' reserved shapes; V5C beside it) and the playtest notes file (`docs/playtests/I4.md`).

## Acceptance criteria

- [ ] The roadmap's I4 scope for wave one: every item with its evidence in the PR (test, bench table or screenshot), and the targets the master set in task 3.
- [ ] The lanes test, the evening goal, P3A's lines and the decisions count hold on every bench seed in both profiles.
- [ ] No `I4 stand-in` left; `OWED_SENDERS` and `OWED_FIELDS` hold no I4 entry; any skip back on or rewritten.
- [ ] A version 9 save opens and plays on the merged branch; a year hashes the same in Node and a browser worker; two browsers play a year online through the era moment.
- [ ] Typecheck, lint, unit tests, build, e2e (two browsers) and bench pass; budgets hold, including I4.0's new rows and V5's frame budgets.
- [ ] The wave reaches `main` in one merge.

## Out of scope

New design (wave two and I5); wave two's items beyond its briefs.

## Notes

- `SAVE_VERSION` is 10 (I4.0). If a wave cycle bumped it again, keep one version for the merge and say so; wave two takes 11.
- No new RNG stream was planned; if a cycle added one, it must be appended in its own commit with its reason.
- Keep a list of what each cycle's PR left for you, and close it before the merge.
- A Village's money is a closed loop (R3X): read debt per resident, never coins alone.
- Runs as the build and review loop (`31-parallel-development.md`): two rounds of quality check, dead-end hunt and player's chair before the PR, each round's findings in it.
