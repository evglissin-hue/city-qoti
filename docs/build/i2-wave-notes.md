# I2 wave notes: how the tracks meet

Read this with your brief. C4.0 fixed the types and signatures (`docs/spec/20-architecture.md`, "I2 contracts"); these notes fix the runtime handshakes between tracks, so the pieces fit when C4X merges them. The I1 notes (`docs/build/i1-wave-notes.md`) still hold for everything they cover. If something here is wrong for your track, do the sensible thing, keep it additive, and say so in your report.

## Money (C4A owns it; everyone obeys it)

- **The invariant**: `treasury + sum(household savings) - economy.external` never changes. `book()` is for money crossing the valley's edge (upkeep, construction, roads, fields, terraforming, exports, imports, loans, interest, repayments, the peddler, I1 taxes) and counts it in `external`. `pay(state, from, to, pennies, category)` is for money between purses; with `'outside'` as one side it counts in `external` too.
- **Every economy test** takes `moneySnapshot(state)` first and ends with `expectMoneyInvariant(before, state)` (`packages/sim/test/money.ts`).
- **Wages** (C4A): paid daily at 17:00 (end of work), from the treasury to each worker's household, `WAGES[job tier] x wage level`, booked as `wages`. Income tax (C4A) is a share of those wages paid back at the same pass, booked as `taxes`, and replaces the I1 flat tax for valleys at Village rank (I1 valleys keep the old tax until they rank up, so nothing changes under a migrated save).
- **Purchases** (C4A): households buy their basket with `buy()` at the till price (cap and subsidy applied), money to the treasury as `sales`. When to shop: C4A runs a daily household pass at 18:00 (after wages) for the basket's non-food groups and lets C3A's shopping outing buy food through `buy()` instead of the I1 free take. Unmet quantity lowers the `goods` need (NEED_IDS index 5) and `household.basket`.
- **Prices** (C4A): the market system at 00:10 (`MARKET_OFFSET`) rolls `demandToday` into `demand`, computes cover from town stock and sets prices with the spec's curve, smoothing and clamps, then pushes the day into `history` and emits `market.updated`. C4.0 ships only the roll and the history; prices stay at base until C4A.
- **Trade** (C4A) at 00:20 for prices (drift and impact), 08:00 for caravans (`CARAVAN_HOUR`); goods leave and arrive through the Trading Post's store; money through `book('exports' | 'imports')`. The Trading Post is the building tagged `trading-post` (C4C adds it; `tradeView` finds it by tag). C4A, as built: caravans load from the post's store and then the storehouses (no hauling needed), unload into the post's store when its def has `storage` (else the nearest storehouse), settle money as they leave, and carry 40 units a day plus 16 per cart in `state.carts` (up to three). C4C: give the post a `storage` and a `requires: ['trading-post']` lock; nothing else is needed from the building.
- **Loans**: `loan.take` and `loan.repay` work now; interest at each season's end (C4A, at 00:30 on the season's first day).
- **Credit line** (C4A): from Village rank the treasury may run 200 coins per rank step below zero before lean times (`isLean`, `overdraftLimit` in `systems/loans/credit.ts`); `spendBlocked` counts it. Anything that asks "is the town broke?" should call `isLean(state)` rather than test `treasury < 0`.
- **Savings sinks** (C4A to C4C): purses fill with wages and empty at the till; a home upgrade that charges the household's `NeedsBasket.savings` through `pay(state, { household }, 'treasury', ..., 'sales')` would close the loop nicely, and C4X should tune the treasury with it in.

## Who grows the village (C4B)

- `zone.paint` and `zone.clear` set the `zone` layer now (Village rank, standard valleys). C4B's zoning pass (hourly at offset 70) cuts lots along road frontage: `Lot.x, z, w, d` are a world-axis rectangle, `rot` faces the road, `frontage` is the road tile in front of the entrance; it writes the `lot` layer and emits `lot.added`, `lot.updated`, `lot.removed`.
- The daily growth pass (01:00) scores lots and calls `growLot(state, ctx, lotId, defId, style)`. Grown sites are ordinary construction sites (`Building.lot`, `Building.style`, builders and porters as usual); they cost the treasury nothing up front. `build.remove` frees the lot.
- What may grow: building defs with `grows: { zone }` (C4C writes the grown homes, shops and workshops as content; C4E draws them by `style`). Grown crafts and farms choose a method by shortage unless `rt.pinned` is set (`build.pinRecipe`).
- Terraforming: `terrain.raise` and `terrain.lower` work now (one level, not under buildings, roads or water, `TERRAFORM_COST` per tile). C4B adds slope limits, stairs (`Flags.stairs`) and what happens to fields and trees.
- Desire paths: C4B counts off-road walking into the `wear` layer; it reads resident moves from C3A's movement system (add a hook there, do not fork it).
- *As built (C4B)*, for the other tracks:
  - **C4C**: grown defs need `grows: { zone }` and a size that fits the zone's lots once turned (`ZoneDef.lots`, width along the road by depth: homes 2x2 to 3x3, shops 2x3 and 3x3, crafts 2x3 and 3x3, farms 3x3); `grows.weight` weighs the pick for homes and shops; crafts and farms are picked by what they can make that the town is short of, so give grown workshops several craft methods and grown farms several farm methods. Until a zone has a `grows` def, I1 stand-ins grow there (cottage, market stall, bakery, sawpit, windmill, farmhouse, vegetable plot). Grown farms take free farm-zoned land within reach as fields (`paintFields`); fields still grow wheat through `tendFields` until C4C generalizes it. The Desire Lines achievement: condition `{ code: 'desireLines', params: [['tiles', 12]] }` (the predicate is in `conditions/code.ts`).
  - **C4C carts**: `cartRoute` is cached until `networkVersion` changes and returns a shared array (copy before changing it; `requestCartMove` already copies). A cart whose road was removed from under it is put back in its shed (`parked: true`, `move: null`, tile at the shed's door) when no way on exists; a cart that cannot reach its target but still stands on road just stops (`move: null`) for its owner to redirect.
  - **C4E**: `Lot.style` and `Building.style` are content style ids (`content.styles`: brick, plaster, stone, timber); lot size and facing come with `LotView` (w, d, rot) and `BuildingView.lot`; seed variants by building id. A grown building may be narrower than its lot: it stands flush with the road, set along the frontage by the lot's hash, leaving a side or back garden to dress. `Flags.stairs` marks path tiles that climb a level (the step faces the higher road neighbor, or the lower lane or street). Wear: `WEAR_VISIBLE` (64) trodden, `DESIRE_PATH_WEAR` (128) a path. Street noise and traffic are in the `traffic` layer (passes this hour) and `trafficFlow`/`slowdownPercent` (exported) for overlays.
  - **C4F**: the street tool can preview with `canPaintRoad(reader, 'street', tiles)`; the command refuses with `LOCKED` before Cobbles (`roadKindLocked`) and `CANNOT_AFFORD` without a stone a tile. `growthDemand(state)` gives the zone tool's "what the village wants" (homes, shops, crafts, farms). The district style picker reads `content.styles` (I2 picks styles automatically; a picker command is not in I2). `desirePathTiles(map, x0, z0, x1, z1)` lists worn tiles to offer for paving.
  - **Autoplayer**: `autoplay(seed, days, { village, handsOff })` becomes a Village on day `village`, lays and zones a high street and records each night's demand and starts; `npm run tune -w @qoti/bench 22 willow standard 12` prints it with a map of the frontage, `TUNE_SAVE=file.qoti` writes the valley out.

## Carts share the roads (C4B moves them, C4C runs them)

- Carts live in `state.carts` with ids from `state.nextId`. C4C owns the cart shed and trips: it creates carts (one per shed), picks loads with the porter matching (carts take jobs of 16 units between storehouses, the Trading Post and big producers), sets `cart.job` and `cart.load`, and sends them with `requestCartMove(state, cartId, tile)`; `cartAt` says when they arrived. A parked cart (`parked: true`) is in its shed and not drawn.
- C4B owns the traffic system (order 54): it advances carts along `move` at `cartTicks` per tile (lane 4, street 3, from content), counts passes in the `traffic` layer (cleared at the top of each hour), slows carts above road capacity by `1 + (flow - cap) / cap`, at most `TRAFFIC_SLOWDOWN_MAX`, never gridlocks, and replans routes when `networkVersion` changes. `cartRoute` is a plain breadth-first search in C4.0; C4B may replace it with a cached one with the same signature.
- Residents and carts never block each other (P28): they share tiles, not lanes.
- Agent frames already carry carts (`AgentAnim.cart`); C4E draws them.
- *As built (C4B)*: carts share C3A's tile grid, `MoveState` and progress stepping (`advance` from `systems/movement`, so a tile takes exactly its ticks), with their own speeds: `cartTicks` by road times `slowdownPercent`. Routes are the quickest drive by cart ticks, never more than a level per step.

## Chains, services, tiers and innovations (C4C)

- The twelve I2 goods are already in the goods order (clay to tools); C4C writes their buildings and methods, and may tune base prices with C4A.
- Services: hourly at offset 110 the services system sets the `social`, `health` and `education` needs from coverage (tavern, herbalist, school), and gives them weights for the tiers that need them. Keep `NEED_WEIGHTS` entries for needs a tier does not have at 0 for that tier (or make the weight tier-aware in C3A's mood code); a need a tier does not have stays at 100.
- Tiers: daily at 05:00, `household.tierDays` counts days meeting the next basket (positive) or failing this one (negative); after `TIER_UP_DAYS` with the savings (`NeedsBasket.savings`) the home starts an upgrade (`rt.upgrade`, materials by porter, then the def swaps to `upgradesTo.def` and `rt.tier` moves up); after `TIER_DOWN_DAYS` failing it slides back. Residents' `tier` follows their household's.
- Innovations: conditions use named code predicates (`clayPitWorked`, `plankRate`, `rankAtLeast`, `stoneRate`, `sawpitByRiver`, `storyStep`, `portersBusy`); C4C adds them to `conditions/code.ts` and the measures behind the progress bars, and emits `innovation.updated` when a bar moves. Unlocks land in `hearth.unlocked` (`unlockInnovation`); the porter carry of 6 is the capability id `porter-carry-6`.
- Patterns: the six I2 patterns use C3B's detector engine.

## Lives, stories, plans, requests and the Charter (C4D)

- Life events run in the residents system's daily pass (06:00, C3A's offset); C4D extends `systems/residents/**`. Emit `life.event` and, for weddings and births, a Chronicle line. Nobody dies; elders past `SEASIDE_YEARS` may move to the seaside (a departure with a warm Chronicle entry; their savings go with them as `pay(..., 'outside', null)`).
- Stories: hourly at offset 120. Arrival moves the character in (a household of one, `Resident.story`, `ResidentFlags.story`, never leaves), sets `StoryState.residentId`, then calls `storyStep` (from -1 to 0, which sends the hello letter's successor). Each step's goal met calls `storyStep` again. Letters travel in `story.step`; keep the letter text in content.
- Plans and requests work by command now; C4D adds automatic completion of goods and charm requests (hourly at offset 130, counting `village.requestsFulfilled`) and tidying old plans.
- The Charter: `refreshCharter` counts goals hourly at offset 160 and `charter.claim` grants the rank (unlocks into `hearth.unlocked`, `rank.up`). C4D adds the rank-up moment (letter, Chronicle, a little celebration in the UI with C4F).

## Events (who emits what)

| Event | Emitted by |
|---|---|
| `market.updated` | C4A (daily after prices; levers emit it too) |
| `levers.updated`, `loans.updated`, `trade.updated` | the commands (C4.0), then C4A from its passes |
| `lot.added`, `lot.updated`, `lot.removed` | C4B (`growLot` and `zone.clear` already emit) |
| `innovation.updated`, `innovation.unlocked` | C4C (`unlockInnovation` emits unlocked) |
| `charter.updated`, `rank.up` | C4D (`refreshCharter` and `charter.claim` already emit) |
| `plan.*`, `request.*` | the commands; C4D's request pass |
| `story.step` | `storyStep` (C4D calls it) |
| `life.event` | C4D |
| `town.updated` | as in I1, plus after rank changes |

## Schedules and offsets

Daily (`every: TICKS_PER_DAY`, `offset: dailyOffset(hour, extra)`): 00:00 books (I1), 00:10 market, 00:20 trade prices, 00:30 loans, 01:00 growth, 03:00 plans tidy, 05:00 tiers, 06:00 residents (I1, with life events), 08:00 caravans, 17:00 wages and income tax, 18:00 household shopping. Hourly (`every: TICKS_PER_HOUR`, offset in ticks): 50 charm (I1), 70 zoning, 100 patterns (I1), 110 services, 120 stories, 130 requests, 150 achievements (I1), 160 charter, 170 innovations. Every tick: traffic.

## Testing and benches

- `packages/sim/test/fixtures/village.ts` is shared. Add helpers next to it in your own files; if you must change it, keep existing ids and positions (the UI mocks are built from it).
- `withoutSystems([...])` isolates a track's systems in unit tests; `packages/sim/test/money.ts` checks the money invariant.
- The autoplayer (`tools/bench/src/autoplay.ts`, `npm run tune -w @qoti/bench`) is the tuning harness; extend it for zoning and trade rather than writing a new one. Bench scenarios go in `tools/bench/src/` as new files with one registration line each in `bench.ts`.
- Unique ports for e2e and dev servers per track, so parallel checkouts never collide: C4A 5181 and 8791, C4B 5182 and 8792, C4C 5183 and 8793, C4D 5184 and 8794, C4E 5185 and 8795, C4F 5186 and 8796 (`QOTI_CLIENT_PORT=<n> QOTI_RELAY_PORT=<m> npx playwright test -c apps/client/playwright.config.ts <spec>`; `QOTI_CHROMIUM=/opt/pw-browsers/chromium` in sandboxes).

## Registries

One alphabetical line per entry in every registry (commands, systems, content, render layers, tools, lenses, panels, art kits). Goods stay append-only (the I2 goods are already in). Story arcs: C4D adds `packages/content/src/stories.ts` and one line each in the `stories` list.
