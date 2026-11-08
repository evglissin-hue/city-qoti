# C4.0: Village contracts

**Iteration**: I2. **Wave**: serial (short). **Branch**: `cycle/04-0-village-contracts`.
**Depends on**: C3X merged. **Unblocks**: C4A to C4F.

## Goal

Every shared type, state slice, command, event, view, content type and system slot that I2 needs exists, with stubs, a grown "village" fixture and UI mocks, so six tracks can build the Village in parallel. Same shape as C3.0 (see its brief and `docs/build/i1-wave-notes.md`): read them first, they worked.

## Read

- `CLAUDE.md`, `docs/spec/20-architecture.md` (I0 and I1 contracts), `docs/build/i1-wave-notes.md`
- `docs/spec/30-roadmap.md`: I2
- `docs/spec/13-ledger.md`: Market and prices, Zoning and growth, Streets and traffic, Services, Population tiers, Trade, Levers (I2 rows)
- `docs/spec/11-residents.md`: Ages and life events (I2 rows), Story characters
- `docs/spec/12-hearth.md`: later patterns (I2 list); `docs/spec/15-progression.md`: Ranks and Charters, Innovations (I2 rows)
- `docs/spec/16-coop.md`: plans and requests

## You own

All contracts files, `packages/sim/src/state` (migration), stubs in every new system folder, `packages/sim/test/fixtures`, `apps/client/src/ui/mocks`, `docs/build/i2-wave-notes.md`.

## Tasks

1. **State**: market (`prices` per good in pennies, demand and cover per good, price history 24 days), household `savings` in use, `wages` per job tier and the wage lever, `loans`, `zones` (map layer `zone` gets values; `lots` with frontage, size, desirability, district), `traffic` (map layer, cart passes per hour), `trade` (neighbors, regional prices, standing orders, caravans), `charter` (rank, goals, progress), `innovations` (progress, unlocked), `plans` and `requests`, `stories` (arc step per character), resident `couple`, `apprenticeship`, `retired`; tier on homes.
2. **Content types**: `NeedsBasket` per tier (need groups with substitutable goods and preference weights), `ZoneDef`, `LotDef`, `NeighborDef`, `InnovationDef`, `CharterDef`, `StoryArc`, `ResidentTemplate`, `PlanItem`, grown building variants (`BuildingDef.grows?`, tier upgrades `upgradesTo?`), carts (`CartDef`), street road kind.
3. **Commands**: `zone.paint`, `zone.clear`, `ledger.setWageLevel`, `ledger.setTaxRate`, `ledger.setPriceCap`, `trade.setStandingOrder`, `loan.take`, `loan.repay`, `plan.add`, `plan.remove`, `plan.approve`, `request.add`, `request.resolve`, `charter.claim`, `terrain.raise`, `terrain.lower`, `build.pinRecipe`. Validate stubs; apply stubs.
4. **Events and views**: prices, trade log, charter, innovations, plans, requests, story steps, couples and births, zone and lot views, traffic patches. Extend `ResidentDetail` (couple, apprenticeship), `BuildingDetail` (profit), `TownView` (rank, charter progress).
5. **Cross-track APIs**: `priceOf(state, good)`, `buy(state, householdId, good, qty)` and `sell`, `pay(state, from, to, pennies, category)` with the **money invariant** helper (`treasury + sum(savings)` changes only by external flows), `growLot(state, lotId, defId)`, `cartRoute(state, from, to)`, `storyStep(state, arcId)`.
6. **Fixture**: `packages/sim/test/fixtures/village.ts`: about 60 residents, two storehouses, zoned frontage, a market, some Craftsfolk; matching UI mocks.
7. **Migration**: bump `SAVE_VERSION`; I1 valleys keep playing (Settlers, no zones, prices at base).
8. **Wave notes** for I2 handshakes (who sets prices, who pays wages, who grows lots, how carts share movement with residents) and an "I2 contracts" section in `20-architecture.md`.

## Acceptance criteria

- [ ] Everything typechecks; stubs registered; fixtures build; the migration test passes; I1 golden scripts still replay.
- [ ] The money invariant has a test helper every economy test can call.
- [ ] Each later I2 brief can start without touching contract files except additively.

## Notes

- Keep `withoutSystems` (tests only) for isolating a track's systems in unit tests; C3X needed it.
- The autoplayer (`tools/bench/src/autoplay.ts`, `npm run tune -w @qoti/bench`) is the tuning harness; extend it for zoning and trade rather than writing a new one.
