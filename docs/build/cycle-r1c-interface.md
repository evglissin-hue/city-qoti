# R1C: The interface

**Iteration**: R1 Zones first. **Wave**: parallel. **Branch**: `cycle/r1c-interface`, from `cycle/r1x-integration`; PR into `cycle/r1x-integration`. **Recommended effort**: high.
**Depends on**: R1.0. **Runs alongside**: R1A, R1B, R1D to R1F, and V2's wave. **Ports**: client 5223, relay 8833.

## Goal

The Ledger plays the zones-first game from a calmer screen: a top bar with the four demand bars and the five balances; a Build picker with three shelves (Zones, Specialized, Services); the Balances, Purse and Businesses books in place of Market, Trade, Stores and the stocks report; the season card asking its questions; cards that wait their turn; paper by lamplight; editing a plan in place; a corrected help card; and older valleys listed kindly, grayed, with their files to keep.

## Read

- `CLAUDE.md`; `docs/build/r1-wave-notes.md` (File ownership: R1C and R1D split `ui` and `input` by file; Panels and the views they read)
- `docs/spec/17-presentation.md`: The redesign's interface [R1] (the calmer top bar, books, the Build picker, cards wait their turn, paper by lamplight, the help card)
- `docs/spec/13-ledger.md`: Demand; The carrier and trade (rules, reserves, budget); The season plan; Levers; Reports and overlays
- `docs/spec/21-networking-and-saves.md`: The fresh start (the title screen's list)
- `docs/spec/16-coop.md`: the [R1] notes (undo of the carrier's rules and the season plan)
- `docs/spec/20-architecture.md`: R1 contracts (the views)

## You own

The R1C paths in `r1-wave-notes.md`: the top bar, the Ledger's Build picker (`ui/Toolbar.tsx`, `input/catalog.ts`, `input/tools/{building,zone}.ts`), the Ledger books and the season card, the building inspector, cards, the theme's lamplight, plans, the help card, `state/mirror.ts`, `state/undo.ts`, the title screen's valley list (`apps/client/src/app/Title.tsx`), and new `apps/client/e2e/r1c-*.spec.ts`.

## You can rely on

- R1.0's views and events: `DemandView` (`demand.updated`), `BalancesView` (`balances.updated`), `BusinessView` (`business.updated`), `ViewSnapshot.demand/balances/businesses`, `BuildingView.trade/level/keeperId`, `BuildingDetail.trades/pinned`; commands `carrier.setRule/setReserve/setBudget`, `season.setPlan`, `build.pinRecipe { id, trade }`; content's `BuildingDef.specialized`, `ZoneDef.requires`, `TradeDef`. Their insides are stand-ins until R1A and R1B land, so test against fixtures and mocks.
- R1.0's client stand-ins: the books show what still exists; the chain rows are gone; the inspector has a plain trade dial.
- `OldValleyError` / `isOldValley` from `@qoti/sim` and the protocol's `OLD_VALLEY` error code.

## Tasks

1. **The top bar** (17-presentation.md, A calmer top bar): town and valley, coins, the rank pennant with the goal pill, the lens's own strip, the date with clock and weather, the speed; everything else behind one menu. The Ledger's strip: four demand bars (hover says why, from `DemandBarView.why`) and five balance chips (an icon, days of cover as a short bar, pips for flavors on offer); the winter reserve bar from Summer day 4 (`BalanceLine.mark`).
2. **The Build picker**: Zones (Homes, Shops, Workshops, Farmland brushes beside their bars; from Village rank the Homes brush has Townhouses), Specialized (each card says its site rule; choosing one shows its reach on the ground: draw it through the existing overlay or highlight API, since `render` is V2's) and Services. Design note (b): before Village rank the Shops brush is the Market Stall, and its words say so, since the Shops zone is closed.
3. **Books**: Balances (a row per family: amount, variety pips grayed when missing, price, carried in and out, a year's history; a click opens its flavors and who makes them; the carrier's rule, reserve and selling switch and its budget here; deals), Purse (budget, taxes and wages, loans, the County tab), Businesses (every business and specialized building by trade, level and status in words; pin a trade). Ledger: Balances, Purse, Businesses, the Watch, the Notebook; delete the old Market, Trade, Stores and stocks report once the new books cover them.
4. **The season card** asks the season plan's questions (the winter reserve, Food and Fuel apart; this season's deal; where to build first) and sends `season.setPlan`.
5. **Undo** (16-coop.md): the carrier's rules, reserves and budget, and the season plan, each with its inverse.
6. **Cards wait their turn**: letters, result cards and season pages one at a time, with a small stack at the corner saying how many wait; nothing ever covers another card.
7. **Paper by lamplight**: from dusk to dawn panel paper takes a warmer, dimmer tint, as it takes the season's.
8. **Editing a plan in place** (17-presentation.md) and the **help card** correction (a right-drag turns the view with a mouse; Shift and two fingers on a trackpad).
9. **The fresh start's title screen**: older valleys listed grayed, "Founded under the old rules. It cannot be opened in this version.", each with Save its file (the stored bytes, untouched) and Remove; opening an old `.qoti` file says the same (catch `isOldValley`).
10. **Senders**: give `carrier.setRule`, `carrier.setReserve`, `carrier.setBudget` and `season.setPlan` their buttons and take them off `OWED_SENDERS`.
11. **e2e**: un-skip or rewrite the Market and Trade book checks R1.0 skipped (wave notes, Skipped e2e) for the new books; screenshots of the top bar, the picker and each book at 1440 x 900, by day and by lamplight.

## Acceptance criteria

- [ ] Every R1C stand-in and every R1C entry in `OWED_SENDERS` is gone.
- [ ] Every new line of text read in place in the player's chair: warm, dry, no em dashes, US spelling.
- [ ] A newcomer finds the zones, the specialized buildings and the five balances without the old books; nothing covers anything.
- [ ] Typecheck, lint, unit tests, build and e2e pass; screenshots in the PR.

## Out of scope

What the views compute (R1A, R1B), the Hearth's tools and the guide (R1D), the art (R1E), the server's answer to an old valley's hello (R1X).

## Notes

- The Mirror is yours; R1D asks you for what its panels need, and you add it.
- Keep the top bar within the frame budget on Medium (`22-quality.md`): no per-frame allocation, update on events.
