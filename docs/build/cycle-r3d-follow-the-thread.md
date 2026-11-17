# R3D: Follow the thread, the Town Book and R3's interface

**Iteration**: R3 Masters and the Town Book. **Wave**: parallel. **Branch**: `cycle/r3d-follow-the-thread`, from `cycle/r3x-integration`; PR into `cycle/r3x-integration`. **Recommended effort**: xhigh (it crosses sim and client).
**Depends on**: R3.0. **Runs alongside**: R3A to R3C, R3E to R3G, and V4's wave. **Ports**: client 5244, relay 8854.

## Goal

Every inspector gains a Thread: one sentence of where the thing came from and where it goes, across both lanes, with its route drawn on the ground while it is open ("This cider: fruit from the Hollins orchard, pressed on Mill Lane, drunk by 14 folk at the Promenade"). It reads decaying counts the sim keeps for each pair of doors (maker to store, store to outlet, outlet to home or place). The Town Book shows its pages in both lenses. And, as R2D was R2's, this cycle is the rest of R3's interface: the priority control and the supplies on the place card, what places drew and the carrier's switch in Balances, masters and apprentices in the inspectors, the lamplighter in the Town Hall's, callings on the Charter board and the goal pill. The printed storybook is R3G's.

## Read

- `CLAUDE.md`; `docs/build/r3-wave-notes.md` (Panels and the views they read; the rulings on R3's interface)
- `docs/spec/17-presentation.md`: The redesign's interface (Follow the thread, Books, The world carries what it can; R2D's As built: the place card, the highlight's outline, cards that wait their turn)
- `docs/spec/12-hearth.md`: the Pattern Book (the Town Book's model); `docs/spec/13-ledger.md`: Logistics (the flows overlay's counts), Reports (Balances)
- `docs/spec/19-evenings.md`: Supplies, Masters, The Town Book (with their rulings), Data and budgets
- `docs/spec/20-architecture.md`: R3 contracts

## You own

The R3D paths in the wave notes: `packages/sim/src/systems/threads/**`, `view/threads.ts`; in the client, a new `ui/panels/TownBook.tsx` (one registry line), the Thread in `ui/panels/{Inspector,BuildingInspector,ResidentInspector,PlaceCard,GoodCard}.tsx`, the R3 lines in `ui/panels/{Balances,Charter}.tsx` and `ui/GoalPill.tsx`, `state/mirror.ts`, `state/undo.ts`, `worker/messages.ts` (additive) and the worker's handler for the Thread, e2e `apps/client/e2e/r3d-*.spec.ts`, shots `docs/build/screenshots/r3d-*`.

## You can rely on

- R3.0: `recordThread` called at every point goods move (deliveries, purchases at an outlet, a Treat at a stop or in a Hamlet, a Hamlet shopping trip; see the wave notes), `ThreadsState` (`pairs`: from, to, place, good, units), `THREAD_PAIRS_PER_DOOR` (8), the `threads` system (41, midnight), `ThreadSubject` and `ThreadView` from `threadView(state, subject)` (exported); `place.setPriority` and `carrier.setRule`'s `places` (validate and store), owed to you on `OWED_SENDERS` and `OWED_FIELDS`; `supplies.updated` and `townBook.updated` with `SuppliesView` and `TownBookView` in the snapshot; `PlaceView.priority`, `supplies`, `resting`, `pages`; `BalanceLine.drawnByPlaces`, `forPlaces`; `ResidentDetail.craft`, `master`, `apprenticeOf`; `BuildingDetail.master`, `lamplighter`, `candle`; `BusinessView` master fields; `CharterView.callings`; the picture seam `ui/pictures.ts` (`pictureFor`).
- R2D's Mirror, cards (`ui/cards.ts`), the place card, the highlight API with `outline`, the feed's fold; the Pattern Book panel; the Portrait. Real data as R3A to R3C land; until then mocks, as R2D's `ui/mocks/evening.ts` did.

## Tasks

1. **The counts** (`systems/threads/**`): `recordThread` adds units to the pair (from, to or place, good), keeping `pairs` sorted and at most `THREAD_PAIRS_PER_DOOR` from each door (the strongest stay, ties by key); at midnight they halve and faded ones drop, as the flows overlay's do. Deterministic, saved, cheap (a binary search; never a scan of the town at a write).
2. **The sentence** (`view/threads.ts`): for a building (a maker, a store, an outlet, a home; with `good` for a good at a door), a resident, a place or a good, one sentence across both lanes naming the strongest pair at each step, its `refs` (`building:<id>`, a PlaceId, `resident:<id>`), and the route's tiles door to door; short, warm, dry, honest when a thread is thin ("Nobody has bought these candles yet."). A test checks the sentence against the saved pairs in an autoplayed Village.
3. **The Thread in every inspector**: a worker request for `threadView` (additive in `worker/messages.ts`), its route drawn on the ground through the highlight API while it is open and gone when it closes; a click on a name opens that thing's inspector.
4. **The Town Book** in both lenses (the books registry): pages with their names, place and credit (Made Together in both seats' colors) and leaning, three hints, the callings earned, the pages by leaning; one picture slot a page (240 x 180, through `pictureFor({ book: 'townBook', id })`, an empty frame with the page's name when it has none).
5. **R3's other controls and lines**: the priority control on the place card (keep first, as it comes, let it rest; `place.setPriority`, with undo) and the place's supplies and resting pieces in words; what places drew last night and the carrier's switch to buy for places in Balances (`carrier.setRule` with `places`, with undo); masters, apprentices and the craft in the resident and building inspectors and the Businesses book; the lamplighter in the Town Hall's (jobs, who holds them, "the job is open"); a home's candle; callings on the Charter board and the goal pill. Take each sender off `OWED_SENDERS` and `OWED_FIELDS`.
6. **e2e and shots**: a Thread from a cider to its drinkers with its route; the Town Book with a page and three hints; a place kept and one let rest, and the undo; the places switch in Balances; both lenses, by day and lamplight, at 1250 px.

## Acceptance criteria

- [ ] `grep -rn "R3 stand-in (R3D)" packages apps tools --exclude-dir=dist` is empty.
- [ ] Every inspector has a Thread that agrees with the counts in an autoplayed Village (a test of the sentence against the saved pairs) and draws its route while open.
- [ ] The Town Book shows its pages and hints in both lenses, with a picture slot a page.
- [ ] `OWED_SENDERS` and `OWED_FIELDS` hold no R3 entry; each command has undo; cards never cover one another; no two feed lines read the same; words are warm, dry, US spelling, no em dashes.
- [ ] The counts stay inside the shared budget (a bench line, by one line in R3E's scene list); a year hashes the same in Node and a browser worker; e2e, typecheck, lint, unit tests and build pass.

## Out of scope

The rules behind supplies, masters and pages (R3A to R3C); the printed storybook (R3G); drawing lamps, the lamplighter, windows, resting pieces and the master's sign (R3F); ink-and-wash pictures (V4B).

## Notes

- The flows overlay keeps building pairs without the good (`state.logistics.flows`); the Thread keeps its own table (R3.0's call), with the good and the place.
- Panels read views through the Mirror, never the sim (as R1C and R2D); the Thread is a worker request like `inspect`.
- From R2D: keep the Thread's line inside the inspector's width at 1250 px; selections draw an inked outline, never a filled block.
- Say in the PR what the interface cost and what you cut, so R3X knows.
- Runs as the build and review loop (`31-parallel-development.md`): one or two rounds of quality check, dead-end hunt and player's chair (read every new line in place, in both lenses) before the PR.
