# R3D: Follow the thread

**Iteration**: R3 Masters and the Town Book. **Wave**: parallel. **Branch**: `cycle/r3d-follow-the-thread`, from `cycle/r3x-integration`; PR into `cycle/r3x-integration`. **Recommended effort**: high.
**Depends on**: R3.0. **Runs alongside**: R3A to R3C, R3E, and V4's wave. **Ports**: client 5244, relay 8854.

## Goal

Every inspector gains a Thread: one sentence of where the thing came from and where it goes, across both lanes, with its route drawn on the ground while it is open ("This cider: fruit from the Hollins orchard, pressed on Mill Lane, drunk by 14 folk at the Promenade"). It reads decaying counts the sim keeps for each pair of doors (maker to store, store to outlet, outlet to home or place). The Town Book shows its pages in both lenses, and when a chapter closes "Print the storybook" lays the chapter out for the browser's print dialog, with the valley's own pictures. With the rulings, this cycle is also the rest of R3's interface, as R2D was R2's: the priority control, supplies on the place card and in Balances, masters in the inspectors, callings on the Charter board.

## Read

- `CLAUDE.md`; `docs/build/r3-wave-notes.md` (the panels and the views they read; the rulings on R3's interface and look)
- `docs/spec/17-presentation.md`: The redesign's interface (Follow the thread, Books, The world carries what it can; R2D's As built: the place card, the highlight's outline, cards that wait their turn)
- `docs/spec/12-hearth.md`: the Chronicle (Snapshots), The storybook of the valley, the Pattern Book (the Town Book's model)
- `docs/spec/19-evenings.md`: Supplies (what the Balances book and the place card show), Masters, The Town Book, Data and budgets
- `docs/spec/13-ledger.md`: Logistics (as built: the flows overlay's counts), Households; `docs/spec/21-networking-and-saves.md`: Chronicle snapshots
- `docs/spec/30-roadmap.md`: V4 (illustrated books); `docs/spec/20-architecture.md`: R3 contracts

## You own

The R3D paths in `r3-wave-notes.md`: new `packages/sim/src/systems/threads/**` (the counts, their decay, the `recordThread` body) and `view/threads.ts` (the sentence and its route); in the client, new `ui/panels/{TownBook,Storybook}.tsx` (one registry line each), the Thread in `ui/panels/{Inspector,BuildingInspector,ResidentInspector,PlaceCard,GoodCard}.tsx`, the R3 lines in `ui/panels/{Balances,Charter}.tsx` and the goal pill as the rulings assign, `state/mirror.ts`, `state/undo.ts`, a print stylesheet, e2e `apps/client/e2e/r3d-*.spec.ts`, and shots `docs/build/screenshots/r3d-*`.

## You can rely on

- R3.0's contracts and stubs: `recordThread`, already called at the write points (porters' and carts' deliveries, `recordSale`, the shopping trip, the doorstep errand), the counts' saved shape, the Thread's view shape and its inspect query, `TownBookView` and `townBook.updated`, the R3 views (supplies and resting pieces on `PlaceView`, what places drew on `BalanceLine`, lanterns, a home's candle, masters on `ResidentDetail` and the business views), and `place.setPriority` and the carrier's places switch, owed to you on `OWED_SENDERS`.
- R2D's Mirror, cards (`ui/cards.ts`), the place card, the highlight API with `outline`, the Town overlay and the feed's fold; the Pattern Book panel; C5F's Chronicle snapshots; the Portrait; V3D's endpaper map (on `main` through V3X). Real data as R3A to R3C land; until then mocks, as R2D's `ui/mocks/evening.ts` did.

## Tasks

1. **The counts**: each pair of doors by good (maker to store, store to outlet, outlet to home or place), added where R3.0's hooks call and decaying as the flows overlay's do (halved at midnight); bounded per door, sorted, saved, deterministic. If the wave notes say so, they also give the per-outlet evening customers R2C's "a shop nobody passes" lacked.
2. **The sentence** (`view/threads.ts`): for a good at a door, a business, a home, a place or a resident, one sentence across both lanes naming the strongest pair at each step, and the route's tiles; short, warm, dry, honest when a thread is thin ("Nobody has bought these candles yet.").
3. **The Thread in every inspector**, its route drawn on the ground through the highlight API while it is open and gone when it closes; a click on a name in it opens that thing's inspector.
4. **The Town Book** in both lenses (the books registry): pages found with their names, credit (Made Together in both seats' colors) and leaning, three hints, the callings earned; one picture slot a page, empty until V4B fills it.
5. **Print the storybook** when a chapter closes (a sealed Charter; today the Village chapter): the valley's endpaper map, the chapter's Chronicle entries with their snapshots, the Pattern Book and Town Book pages found, and the residents' portraits, laid out for the browser's own print dialog, to paper or a file. Built on the client from what the valley already stores; nothing about it is sim state. Leave one seam for V4B's ink-and-wash pictures: whichever of R3X and V4X lands second wires them.
6. **R3's other controls and lines**, as the rulings assign: the priority control on the place card (keep first, as it comes, let it rest; `place.setPriority`, with undo) and the place's supplies and resting pieces in words; what places drew last night and the carrier's switch to buy for places in Balances (with undo); masters, apprentices and the sign in the resident and building inspectors; the lamplighter in the Town Hall's; callings on the Charter board and the goal pill. Take each sender off `OWED_SENDERS`.
7. **e2e and shots**: a Thread from a cider to its drinkers with its route; the Town Book with a page and three hints; a storybook printed to PDF (`page.pdf`); a place kept and one let rest; both lenses, by day and lamplight, at 1250 px.

## Acceptance criteria

- [ ] Every inspector has a Thread that agrees with the counts in an autoplayed Village (a test of the sentence against the saved pairs) and draws its route while open.
- [ ] The Town Book shows its pages and hints in both lenses; the storybook prints from the browser with the valley's own pictures (the e2e writes a PDF).
- [ ] `OWED_SENDERS` holds no R3 entry; each command has undo; cards never cover one another; no two feed lines read the same; words are warm, dry, US spelling, no em dashes.
- [ ] The counts stay inside the shared budget (a bench line, added by one line to R3E's scene list); a year hashes the same in Node and a browser worker; e2e, typecheck, lint, unit tests and build pass.

## Out of scope

The rules behind supplies, masters and pages (R3A to R3C); drawing lamps, the lamplighter, windows and resting pieces (as the rulings assign); ink-and-wash pictures (V4B); the endpaper map itself (V3D's).

## Notes

- The flows overlay already keeps building pairs (`state.logistics.flows`: from, to, units, halved at midnight) without the good, and a place is no building (its id is a string, `seats:12`); the wave notes say whether the Thread extends that list or keeps its own table.
- Panels read views through the Mirror, never the sim (as R1C and R2D).
- The roadmap gives this cycle the Thread, the Town Book's pages and the storybook; if the rulings also give it all of R3's other interface, say in the PR what it cost, so R3X knows what was cut.
- From R2D: keep the Thread's line inside the inspector's width at 1250 px; selections draw an inked outline, never a filled block.
- Runs as the build and review loop (`31-parallel-development.md`): one or two rounds of quality check, dead-end hunt and player's chair (read every new line in place, in both lenses) before the PR.
