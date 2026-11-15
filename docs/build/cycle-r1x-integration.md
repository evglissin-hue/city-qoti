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
4. **The old valley's answer**: an online room answers a hello for a valley saved before version 6 with `OLD_VALLEY` (the server and the dev relay); the title screen's grayed list (R1C) works against it; nothing is deleted on the device or the server.
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

## As built (2026-11-12)

1. **The wave merged** in the brief's order on `cycle/r1x-integration`: R1A (#36), R1B (#34), R1F (#30), R1D (#31), R1C (#38), R1E (#32), each with `git merge --no-ff` and the checks after it. Conflicts: `view/zones.ts` became a re-export of `balances`, `demand` and `businesses`; the Village Charter keeps R1A's one food goal ("5 days of Food with 3 flavors", `measure.flavors`, which the carrier's wanted variety reads) rather than R1D's second goal; `OWED_SENDERS` is empty (R1C's carrier and plan senders, R1D's moves); the Hearth toolbar has Move and no Zone button. Tests where one cycle's real system met another's stand-in were rewritten (R1D's counts and wishes on R1A's sightings and R1B's road reach; R1B's weaver need on sightings). `main` (still P1's 3b9ee4a; V2's wave has not merged yet) is contained.
2. **Stand-ins**: `grep -rn "R1 stand-in" packages apps tools` is empty once E7's test rewrite lands. Finished here: Porridge No More reads R1A's sightings; the audit's stall check reads `carrierCovers` and skips closed-pass days; the Hearth no longer plants saplings for lodges (R1B's Lodge replants), and the land advisor keeps a felled lodge; the audit's explained list is empty.
3. **Senders**: `OWED_SENDERS` empty.
4. **The old valley's answer**: `RoomCore` reads the newest snapshot's version (`peekSnapshotVersion`, the gzip head only) after the token check and answers `OLD_VALLEY` with close code 4010 (`CloseCode.oldValley`), seating no one and writing nothing; the server and the dev relay both run `RoomCore`. The client treats 4010 as final; R1C's title screen grays the valley and offers Save its file (a solo valley's bytes from this device; an online one's stored snapshot through the room's read-only `GET /api/valleys/:id/old-file`, seat token required, `handleOldFile` in protocol) and Remove (forgets it on this device only). Tests: `packages/protocol/test/room.test.ts`, `apps/client/e2e/r1x-old-valley.spec.ts`.
5. **The grown village scene**: regrown under R1's rules once V2.0 reached `main` (`npm run fixture:grown -w @qoti/client`, now oak for 62 days: a Village of 152 in 60 households, nine wells at least 8.6 tiles apart, two corner shops, 742 decor, eight festivals); `grownFixture.test.ts` passes as V2.0 wrote it, and a `v2-shots.mjs r1x grown` set on the branch with the whole V2 wave merged (`v2-r1x-grown-*`) is V3's before: the light map, the far decor and the trade looks all show on the R1 town. V2's own before and after shots stay on the town V2 was tuned on.
6. **Tuning**: see `13-ledger.md`, the As built (R1X) notes and What holds. Rules changed: Workshops lots 3x3 only (and a content check that every zone's lots fit a building that grows there); no new business while two stand empty for want of hands (demand reason `hands`, additive); porters hired while sites or makers wait on stocked goods; the cart's load each way, surplus collected at makers' doors first, the budget and a site's Materials from coins in hand only, a home upgrade's materials carried like a site's; a Hamlet's Wares and Treats on Essentials; Craftsfolk savings 12. The autoplayer: up to 16 streets of 30 tiles, services and lanes on the Village's credit (Materials the carrier brings counted), the tax under 16%, loans of 1,000 (none under 300) with a tenth of the credit line left unborrowed (the line is 20 coins a resident, so a town that borrows to its end and then shrinks owes past it), a storehouse the town wants anyway placed toward lots no porter reaches (with a short path first when no spot there has a road), no priority bumps, no canceling a site that waits on materials, a garden bed for A Garden Plot. `npm run targets -w @qoti/bench` prints each seed against the targets.
7. **The dead-end hunt**: the audit passes with an empty explained list (the woods check counts young trees; a site waiting on Materials the treasury cannot pay for waits on coins). Found and fixed on the way: Workshops lots no workshop fit (hazel grew no trade there for 45 days); a hamlet that grew 22 businesses for 19 residents; the tavern's brick handed to home upgrades; the carrier unable to sell Treats that sat at the presses; a never-granted A Garden Plot. After the founders' larder grew, the bigger towns found three more: a garden bed whose door step lay inside the storehouse ("reached" across its own footprint, so its site waited forever: `doorReached`, and a grown building never stands on a neighbor's step), a Lodge whose woods the town built into (it now plants rather than fells while its wood is under its rule, and the audit flags thin woods only with no room to plant), and a site counted as unsupplied while the pass was closed (the wait counts from the thaw). Each has a test in `packages/sim/test/r1x/dead-ends.test.ts` or `test/p1/health-r1.test.ts`. From the player's chair on the regrown village: seven wells on one green. The sim was right (A Well Closer is offered only where no well reaches the door, A Second Well only beside a full one); the Hearth advisor answered every such wish with a well wherever one first fit from the town's middle, so the far household's wish stayed open and the next well stood beside the last. It now builds within reach of the door that asked and half a reach clear of any other well, and the audit's new `service-clustered` kind flags any hand-placed service within half its reach of another of its kind (A Well Closer: granted 12 of 22 offered, was 4 of 33). The change moved willow's day-three well a tile (the old spot stood 7.2 tiles from the door that asked, just out of reach), and the run that followed showed two gaps the old layout hid: its second storehouse went up north of town while seven home lots past every porter waited a week with timber in store, and oak, borrowing to the end of its line, owed 318 coins past it once it dipped from 161 to 145 residents. Both are fixed in the autoplayer (item 6); the autoplay tests caught them.
8. **The player's chair** (two rounds, scripts in the session's scratchpad): a new online valley with the guide and a partner joining (both pages on the same hash), the Ledger lens, the books, the Village from an autoplayed save (hazel day 45) into its first winter, the season card, lamplight. Fixed: basket alerts in a Hamlet ("Settler households can't find wares"), alerts for every business resting till spring, "The cider maker are waiting".
9. **Determinism and co-op**: `packages/sim/test/golden/r1-year.json`, a 24-day autoplayed hazel year, hashes alike in Node and a browser worker (`apps/client/e2e/determinism.spec.ts`); `c5x-year` (two browsers a year online, about an hour) is opt-in with `QOTI_YEAR=1`.
10. **The lanes test**: recorded in `22-quality.md`.
11. **Ship**: `origin/main` merged in three times, both sides kept: V2.0 (b23420e: its perf route beside the old-file route, Measure this laptop beside R1C's books) and then the whole V2 wave (V2X, 7f4864b: the light map, painted green, surfaces, wall occlusion, smoke, far decor and the carts' material, over R1E's kits and R1X's showcases), then V2X's follow-up (68b2ba0, #41: building lights a third softer and the night's bloom built once at rest); V2X's lights layer lit an oven or a shop lamp by the building def's kit, so no R1 bakery (a workshop keeping the baker's trade) glowed: it now reads the trade's look; `chains-final` marks `main` before R1 lands (the master named 7f4864b; `main` has since moved to 68b2ba0, V2X's follow-up, still the old rules; the owner pushes the tag); the owner moved the Craftsfolk targets and R1F's stricter growth scene to R2 (`30-roadmap.md`, R1 status); R2's briefs drafted (`cycle-r2-0-evenings-contracts.md` to `cycle-r2x-integration.md`); the playtest notes file `docs/playtests/R1.md`.

12. **From R1C's report** (the master's message): the inspector's top line is the business status the Businesses book shows (one source, `BusinessView.status`), and the inspector re-renders when the business view changes; each business row has a profit line in whole coins (`BusinessView.profit`, additive: takings and wages and upkeep on a full work day, computed in the view); a specialized building's reach is washed along the road tiles it serves (`reachRoadTiles`, the sim's own walk, for the ghost and fainter for each built one), with the circle kept only where no road is in reach.
13. **Speed**: the growth night and the carrier's day read once what they read twice (needOf and supply memoized a night, one census walk, lazy porter indexes, the carrier's neighbor tables), hash for hash. The bench lines are in `22-quality.md` and the roadmap.

For V2X: `apps/client/src/render/showcase.ts` and `townShowcase.ts` now place R1 buildings (plan defs, goods and a trade, level and keeper handout in the new `showcaseBusiness.ts`); no look code was touched.
