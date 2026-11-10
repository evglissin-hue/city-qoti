# R1 wave notes: how the tracks meet

Read this with your brief. R1.0 fixed the types and shapes (`docs/spec/20-architecture.md`, "R1 contracts") and cut the chain economy; these notes fix who owns which file, what R1.0 removed, the stand-ins each cycle replaces, and the runtime handshakes between tracks, so the pieces fit when R1X merges them. If something here is wrong for your track, do the sensible thing, keep it additive, and say so in your report.

## How the wave works

- **Branches.** Every wave cycle branches from `cycle/r1x-integration` (R1.0's last commit) and opens its PR into `cycle/r1x-integration`, never into `main`. R1X merges the wave there, tunes, tags the last `main` commit of the old rules `chains-final`, and opens the one PR into `main` (`docs/spec/21-networking-and-saves.md`, The fresh start). V2 merges into `main` as it goes; R1X merges `main` in before its PR.
- **Contracts are additive again** (`31-parallel-development.md`, Contracts policy). New optional fields, new union members and new types only, each new command or event in its own commit.
- **Saves are at version 6.** A change to the shape of saved state in the wave adds an optional field (absent until used) rather than bumping the version; if a cycle must change a saved shape, it bumps to 7 with a migration and a test, and says so in its PR. R1X decides whether the wave's merge ships as 6 or 7.
- **Mark your stand-ins.** R1.0 marked each stand-in in code with `// R1 stand-in (R1x): ...`. When you replace one, delete the comment. R1X's first step is `grep -rn "R1 stand-in" packages apps tools`: anything left is a cycle's unfinished work.
- **Ports** (dev server and relay, so cycles can run their e2e side by side): R1A 5221 and 8831, R1B 5222 and 8832, R1C 5223 and 8833, R1D 5224 and 8834, R1E 5225 and 8835, R1F 5226 and 8836, R1X 5227 and 8837 (R1.0 had 5220 and 8830; V2.0 has 5210 and 8820, and V2's wave takes its own from V2's notes).

## Lessons carried over (read first)

- I3's lesson stands: write tests that hold when every system runs beside yours; isolate with `withoutSystems([...])` but never assume another system is absent.
- The autoplayer is one planner with advisors (`tools/bench/src/planner.ts`); R1F rewrites the advisors, and until then a cycle that needs the bench to exercise its system adds a want to an advisor, not a new loop.
- The money invariant (`treasury + savings - external`) holds through everything: the carrier books imports and exports with `book()`, the County tab books like a loan, and nothing else moves money across the valley's edge.
- No cycle edits another's file to make its own test pass. Ask in your PR, or use the cross-track API stubs below.

## File ownership

Each path has one owner in the wave. Outside your paths: small, necessary edits only (a registry line, an export, an additive contract member), listed in your PR. Contracts files (`packages/sim/src/contracts/**`, `packages/content/src/types.ts`, `packages/protocol/src/messages.ts`) are shared: additive members in their own commits.

### R1A, the economy core

- `packages/sim/src/systems/carrier/**` (the carrier, the boat, the County tab, deals, the closed pass), `systems/market/**` (prices, baskets by family, variety), `systems/tiers/**`, `systems/trade/**` (drift and impact), `systems/dock/**`, `systems/warmth/**`, `systems/loans/**`, `systems/economy/index.ts` and `emit.ts` (the day's books; `start.ts` and `api.ts` are R1B's).
- `packages/sim/src/view/balances.ts` (the `BalancesView` builder; R1.0 put it in `view/zones.ts`, which R1A and R1B split on day one: see Handshakes), `view/village.ts` (market, trade, levers, loans views).
- Content: `packages/content/src/{goods,baskets,neighbors,commissions,charters}.ts`.
- Tests: `packages/sim/test/{market,village/tiers*,p1/economy*,ledger/economy*}` and new `test/r1a/**`.

### R1B, land and businesses

- `packages/sim/src/systems/growth/**` (the trade score, demand bars, starting sites, retooling), `systems/levels/**`, `systems/production/**`, `systems/logistics/**` (granary and storehouse families, porters' reach), `systems/construction/**`, `systems/zoning/**`, `systems/residents/jobs.ts` (labor needs no lever; the keeper), `systems/seasons/{stores,river,growing}.ts`, `systems/innovations/**`, `systems/economy/{start,api}.ts`, new `systems/specialized/**` (reach and capacity).
- `packages/sim/src/rules/building.ts` (the five new site rules), `rules/reach.ts`.
- `packages/sim/src/commands/{recipe,zone,field}.ts`.
- `packages/sim/src/view/demand.ts` and `view/businesses.ts` (split from `view/zones.ts`), `view/inspect.ts` (BuildingDetail: trades, the pinned trade, reach and served).
- Content: `packages/content/src/{trades,buildings,villageBuildings,seasonsBuildings,zones,innovations}.ts`.
- Tests: `packages/sim/test/{growth,ledger/production*,ledger/construction*,ledger/logistics*,village/innovations*,village/hiring*}` and new `test/r1b/**`.

### R1C, the interface

R1C and R1D share `apps/client/src/ui` and `input`; this split is by file.

- `apps/client/src/ui/TopBar.tsx` and a new `ui/topbar/**` (the calmer top bar, demand bars, balance chips, the reserve bar), `ui/Toolbar.tsx` (the Ledger's Build picker shelves), `input/catalog.ts`, `input/tools/building.ts` and `input/tools/zone.ts` (the brushes beside their bars; the reach ring on the ghost asks R1E's art for nothing: it is an overlay, `render` stays V2's, so R1C draws the ring through the existing `setOverlay`/`highlight` API or asks V2 in its PR).
- Books: `ui/panels/{Market,Trade,Stores,Reports,Policies,Dock}.tsx` become Balances, Purse and Businesses (`ui/panels/{Balances,Purse,Businesses}.tsx`, one registry line each), `ui/panels/SeasonCard.tsx` (the season plan's questions: `season.setPlan`), `ui/panels/BuildingInspector.tsx` (the trade, level, keeper and pin).
- Cards that wait their turn: `ui/GameUI.tsx`, `ui/panels/{Letters,RankUp,Chapter}.tsx`, a new `ui/cards.ts`; paper by lamplight: `ui/theme.css` and `ui/seasons.css`; editing a plan in place: `ui/panels/Plans.tsx`, `ui/plans.ts`; the help card: `ui/copy.ts`, `ui/panels/Notebook.tsx`.
- State: `apps/client/src/state/mirror.ts` (R1C adds what its panels need; R1D asks), `state/undo.ts` (inverses for the carrier rules, reserves, budget and the plan).
- The fresh start's title screen: `apps/client/src/app/Title.tsx` (older valleys grayed, with Save its file and Remove).
- Senders owed by R1C: `carrier.setRule`, `carrier.setReserve`, `carrier.setBudget`, `season.setPlan` (`OWED_SENDERS` in `test/every-command-has-a-sender.test.ts`).
- e2e: new `apps/client/e2e/r1c-*.spec.ts`; the skipped Market and Trade book checks (see Skipped e2e).

### R1D, the Hearth's tools and the first days

- `apps/client/src/input/tools/{decor,fence,tree,customize}.ts`, a new `input/tools/move.ts` and new `input/compose/**` (a seat faces what is worth looking at, runs space themselves and meet roads gracefully, the flower brush, move), `ui/panels/{PatternBook,Wishes,Festival,Guide}.tsx`, `ui/guide.ts`, `ui/decorText.ts`, `ui/festivalPlanning*`.
- Sim: `packages/sim/src/commands/move.ts` (`decor.move`, `build.move`), `commands/{decor,build}.ts` for the moves' validators, `systems/hearth/**` (pattern detectors by trade tag, the garden bed), `systems/stories/**`, `systems/guide/**`, `systems/festivals/**`, `systems/hearth/wishes/**` and `achievable.ts`, `conditions/**` (new counts: businesses, Food flavors), `systems/achievements/**`.
- Content: `packages/content/src/{guide,stories,herbalist,stonemason,wishes,festivals,achievements,seasonsAchievements,patterns,villagePatterns,seasonsPatterns,decor,villageDecor}.ts`.
- Senders owed by R1D: `decor.move`, `build.move`.
- Tests: `packages/sim/test/{hearth,lives,seasons/guide*,festivals,p1/wish*,p1/every-goal*}` and new `test/r1d/**`; e2e `apps/client/e2e/r1d-*.spec.ts` and the guide spec.

### R1E, art for trades

As `31-parallel-development.md` (the redesign's pairs) has it: the building, workplace and service kits in `packages/art/src/kits/` (looks by trade and level from the kits that exist; new kits for the Brickworks, Granary, Market Square and the Forester's Lodge as one), and `apps/client/src/render/layers/buildings.ts`. V2 owns every other render and art path. Decided: R1E draws the trade looks in its own buildings layer; if `render/kitGeometry.ts` (which reads `BuildingRuntimeView.method` today) needs to read `BuildingView.trade`, that is one additive line in a shared file, listed in R1E's PR, not a request to V2. The gallery is V2's path too: R1E adds one section through its existing registry and lists it in its PR. R1E reads `BuildingView.trade`, `.level` and `.keeperId` (the family name for the sign comes from the Mirror's residents).

### R1F, the bench

- `tools/bench/**` (new advisors: one that zones and sites, one that tends the season plan; the decisions count; the lanes test `npm run lanes -w @qoti/bench`; the year view), `packages/sim/src/view/health.ts` (the audit's health kinds: a business a whole day without its raw good while its family's rule lets the carrier buy; a demand bar lit with no zoned land offered; a wish, twist or guide step that cannot be met).
- Tests: `tools/bench/src/**/*.test.ts`, `packages/sim/test/p1/health*`.

### Shared, by turn

- `packages/sim/src/index.ts` (exports): any cycle adds its own export lines, one per line, sorted within its block.
- `packages/sim/src/systems/index.ts`, `commands/index.ts`, `apps/client/src/ui/panels/index.ts`, `ui/lenses.ts`, `input/tools/index.ts`: one sorted registry line each.
- `packages/sim/test/fixtures/**`: R1B owns them (businesses and specialized buildings); others add a fixture of their own beside them rather than editing one.
- `CHANGELOG.md`, `docs/build/README.md`: one line each, merged by R1X.

## What R1.0 removed (the removal map)

Traced before the cut with read-only explorers; R1.0's commits carry it out. Where a removal left behavior a fresh valley needs, a stand-in takes its place (next section).

| Removed | Where it lived | What replaced it |
|---|---|---|
| 13 goods: logs, planks, wheat, flour, clay, bricks, yarn, milk, apples, herbs, tools, coats, pies | `content/{goods,villageGoods,seasonsGoods}.ts`; by id in sim (seasons stores, jobs, innovations measures, nature effects, river, start, economy api, production, tiers, inspect, weather), client (goodIcons, TopBar, purpose, Stores, Festival, mocks, field tool), bench (every advisor), tests | the 16 goods of `13-ledger.md` in one `content/goods.ts` (timber for logs and planks, grain for wheat, fruit for apples, brick for bricks); `GoodDef.family` and `.raw` replace `.category` and `.food` |
| 22 hand-placed production defs (bakery, farmhouse, sawpit, vegetable plot, woodcutter, clay pit, brick kiln, sheep pasture, spinner, weaver, dairy, cheesemaker, orchard, cider press, chopping shed, herb garden, smithy, pie shop, chandler, tailor, carpenter, fisher's hut) | `content/{buildings,villageBuildings,seasonsBuildings}.ts`; growth's I1 stand-ins, construction notices, guide, stories, innovations, fixtures, the bench, the Build picker's chain rows | twelve trades (`content/trades.ts`) on three business defs (workshop, farmstead, shop) and thirteen specialized buildings (`BuildingDef.specialized`); the Apiary stays the Hearth's hives by hand |
| Method switching: grown workshops' five methods, `chooseMethod`, `rt.pinned` | `systems/growth/{index,recipes}.ts`, `commands/recipe.ts`, `BuildingDetail.methods`, the inspector's recipe dial | `Building.trade` and `.pinned`; `build.pinRecipe { id, trade }`; `methodOf(b)` |
| `trade.setStandingOrder`, standing orders, caravans, the dock's orders | `commands/trade.ts`, `systems/trade/{caravans,post}.ts`, `systems/dock`, `view/village.ts` (TradeView), `view/seasons.ts` (DockView), `view/health.ts` (order-never-filled), the Trade book's Orders tab, P1's Deals (`ui/deals.ts`, `Deals.tsx`, `content/dealUse.ts`), the money advisor's order book | the carrier (`state.carrier`, `systems/carrier`; rules, reserves and a budget by family) |
| `ledger.setForSale`, `EconomyState.forSale`, the peddler's sales and imports, the `peddler` ledger category | `commands/ledger.ts`, `systems/economy/index.ts`, the Stocks report's Sell toggles and their undo | the carrier's selling switch per family (`carrier.setRule`'s `sell`) |
| Export bans | `LeversState.exportBans`, `LeversView.exportBans` | a family's rule |
| `calling.choose`, callings, the Calling card and pill, the Mill Town yield line | `commands/calling.ts`, `systems/callings/**`, `WorldState.calling`, `CharterView.calling`, `content/callings.ts` (CallingDef, tuning, phrases, the `calling` Chronicle kind), consumers in growth desirability, festivals, charm, the yield registry; `ui/panels/Calling.tsx`, GoalPill, Charter | nothing until R3 (callings earned from the Town Book); the three signature pieces stay in content, locked (`content/signatureDecor.ts`) |
| The yield registry's `decor` and `calling` lines, `DecorDef.boost` | `systems/production/{decorBoost,modifiers}.ts`, `content/fineDecor.ts`, the inspector's boost line | the five pieces stay as decor with charm (P6: an unlock is never "+5%") |
| Baskets of named goods (`NeedGroup`), the Craftsfolk "bread and another food" rule | `content/baskets.ts`, `systems/market/baskets.ts`, `systems/tiers/api.ts` | `NeedsBasket.wants` by family (`FamilyWant`: amount and variety) |
| Migrations 1 to 5 and their tests | `state/version.ts`, the contracts tests, `p1/save-v5.test.ts` | `SAVE_VERSION` 6; `deserialize` throws `OldValleyError` (`OLD_VALLEY`) under 6 |
| The `standingOrders` CountWhat | `content/types.ts`, `conditions/index.ts`, Odette's last step | her step asks for a Market Square |

## Stand-ins (each replaced by its cycle)

| Stand-in | Where | What it does now | Replaced by |
|---|---|---|---|
| The carrier | `systems/carrier/index.ts`, `carrier/terms.ts` | today's peddler mapped onto families: at 10:00 it buys essentials first in every family not on Never (Food or winter Fuel a household would go without today, Materials an open site waits for), then each Always family up to its reserve, and sells what is over twice the reserve, 20 units a day (40 with a Trading Post) at 140% and 60% (120% and 85% with the post); no County tab, deals, boat, closed pass or winter marks | R1A |
| Balances view | `view/zones.ts` `balancesView` | stock, use (Food a resident, Fuel a household, Wares and Treats the Settler basket), cover from town stock; flavors on offer means in stock anywhere; history from 14 days of stock | R1A |
| Baskets by family | `systems/market/baskets.ts` | every flavor of a family weighs 1 (wool is on no shelf); variety is not tracked | R1A |
| Tiers read amount only | `systems/tiers/api.ts` | moving up needs each wanted family on a shelf in reach, the services, charm and savings; no variety | R1A |
| The boat sails nowhere | `systems/dock/index.ts` | boats stay at the dock until the carrier sails them | R1A |
| Trade choice | `systems/growth/index.ts`, `growth/recipes.ts`, `growth/trades.ts` | the best shortage score among trades whose site wants the lot meets (fertility, pollinators, a reach with room, households); farms fall back to the first fitting trade; no keeper term, no retooling | R1B |
| Demand bars | `systems/growth/index.ts`, `view/zones.ts` `demandView` | bars from growth's site counts (50 a site wanted), lit when no empty lot of the zone has frontage, one reason each; Farmland also wants land when the carrier's last visit brought more than a third of a day's eating (`'imported'`), since the carrier's Food reserve holds a fresh valley near four days of cover | R1B |
| Levels | `systems/levels/index.ts` | businesses stay at level 1; counters are not kept | R1B |
| Keepers | growth | `keeperId` stays 0 | R1B |
| Businesses view | `view/zones.ts` `businessView` | status in words from the stage and the hands at work; served counts businesses of the enabled trades within reach by footprint distance | R1B |
| Site rules | `rules/building.ts` | the five new kinds (woods, river, openGround, road, valleyRoad) are declared in content and not yet checked; the old kinds (deposit, water edge) are | R1B |
| The Forester's Lodge | `content/buildings.ts` | fells as the woodcutter did (4 timber a tree); no replanting of its own wood, no firewood toward the Fuel mark | R1B |
| The windmill and sawmill | content | no method; they only enable bakers and carpenters (the reach check is the trade choice's) | R1B (the frozen-river hand saw) |
| The Seed Drill | `systems/production/fields.ts` | its `resow-same-day` unlock does nothing yet | R1B |
| The frozen Sawmill | `systems/seasons/river.ts` | a frozen river costs the Sawmill nothing yet | R1B |
| Cross-track API stubs | `systems/carrier/api.ts`, `market/balances.ts` (R1A); `systems/specialized/api.ts`, `growth/trades.ts` (R1B) | simple readings of what exists (see each header) | R1A, R1B |
| Innovations' measures | `systems/innovations/measures.ts` | quarryWorked, timberRate, lodgeByRiver (with a simple day counter) | R1B tunes |
| The season plan | `state.seasonPlan` | set by `season.setPlan`; nothing reads it yet | R1A (marks for the carrier), R1B (the Fuel mark for foresters, where to build first) |
| Moving | `commands/move.ts` | `decor.move` and `build.move` refuse with NOT_ALLOWED | R1D |
| The guide's food and timber steps | `content/guide.ts`, `systems/guide/goals.ts` | worded for a fishery or farm and a Forester's Lodge; the other letters as in I3 | R1D (the new letters) |
| Story steps | `content/{stories,herbalist}.ts` | Pippa's bread, lodge by the river and six workshops; Mother Thornbury's market garden and lodges; Odette's Market Square in place of a standing order | R1D |
| A Garden Plot and the Kitchen Garden | `content/wishes.ts`, `systems/hearth/patterns/detectors/kitchenGarden.ts` | a market garden beside the home counts as the plot | R1D (the garden bed) |
| The Pie Contest twist | `content/festivals.ts` | offered in no season (pies wait for a master baker, R3) | R1D, R3 |
| Commissions | `content/commissions.ts` | Stonecross's coats ask cloth; the Dowager's pies ask cider; planks are timber | R1A |
| The Build picker | `apps/client/src/input/catalog.ts`, `ui/Toolbar.tsx` | chain rows gone; specialized buildings in one group | R1C |
| Market, Trade, Stores and Reports books | `ui/panels/*` | show what still exists (prices, neighbors and the log, stores by family) | R1C |
| The inspector's trade dial | `ui/panels/BuildingInspector.tsx` | a plain list of the zone's trades to pin | R1C |
| The autoplayer and audit | `tools/bench/src/**` | zones Homes, Workshops and Farmland from the first day, sites the Hamlet's specialized buildings, sends no order, sale, calling or labor pause | R1F |

## Skipped and deleted tests

R1X checks each skip is rewritten or back on before the merge into `main`.

- **Deleted with their feature (sim)**: `test/p1/callings.test.ts`, `test/p1/save-v5.test.ts`, `test/market/trade.test.ts`, `test/festivals/dock.test.ts`, `test/p1/trade-fixes.test.ts`, `test/village/chains.test.ts`, `test/festivals/trades.test.ts`, and the migration sections of the three contracts tests; other cases of removed features inside kept files are listed in R1.0's report.
- **Deleted with their feature (client)**: `ui/panels/calling.test.ts`, `ui/deals.test.ts`, `ui/panels/deals.test.ts`, `ui/decorText.test.ts` (the decor boost lines); the standing order, caravan, Sell toggle and `ledger.setForSale` undo cases in `panels/village.test.ts`, `swatches.test.ts`, `books.test.ts`, the undo tests and `mocks/village.test.ts`.
- **Skipped, for R1F** (comment `// R1.0: stand-ins; R1F rewrites the advisors and their targets`): `tools/bench/src/autoplay.test.ts` (grows willow and hazel without dead ends; reaches the Village with hazel, and with willow through the post; lives, stories and the together loop; grows on as a Village, oak), `village.test.ts` (homes and shops on willow and hazel), `advisors/festivals.test.ts` (a festival every season with three stars, hazel and willow), `advisors/guide.test.ts` (every step by day 6; also waits on R1D's letters).
- **Skipped, for R1X**: `tools/bench/src/hamlet.test.ts` (keeps food flowing and the treasury in band).
- **Skipped, for R1E** (comments name R1E): `apps/client/src/render/hamlet.test.ts` (turn runtime stock, output and growth into pile levels: the vegetable plot's growth) and `apps/client/src/render/village.test.ts` (carry the district style, what a craft makes, the season and an upgrade: the bakery's make and the orchard's season). Two more test-only edits in V2's paths, with the master's agreement: `packages/art/src/hamlet.test.ts` no longer loops over the bakery def, and `render/hamlet.test.ts`'s flows case uses a Forester's Lodge and timber.
- **Skipped, for R1D**: `tools/bench/src/patterns.test.ts` (the Kitchen Garden built by hand, waiting for the garden bed; `'garden-bed'` in it is a placeholder id).
- **e2e**: no spec needed a skip: `village.spec.ts` lost its Deals, Orders and Caravans steps; the hamlet spec checks the baker and grain, the coop request asks timber, the guide spec places a Forester's Lodge (which R1B's woods rule may refuse at the spot it picks: R1B checks it). The `.mjs` screenshot scripts `p1-calling-shots`, `p1-trade-shots`, `c4f-shots`, `c3d2-shots` and `c3e-shots` still name removed things and are not run by `npm run e2e`; R1C retires or rewrites them.

## Handshakes

### Who writes what

| State | Written by | Read by |
|---|---|---|
| `carrier.families` (rule, reserve, sell, set) | `carrier.*` commands; `applyRankDefaults` at the Village claim (Wares and Treats to Always unless set) | R1A's carrier; R1C's Balances book (via BalancesView) |
| `carrier.budget`, `spentToday`, `tab`, `bought`, `sold`, `offers` | R1A's carrier (10:00) and the deals at a season's start | R1B's trade score (`carrierBrought`), R1B's Farmland bar (a third of a farm good by carrier), R1F's audit, R1C |
| `seasonPlan` | `season.setPlan` only | R1A (from Summer day 4: nothing under a mark is sold; from Autumn day 4 the carrier buys toward the marks), R1B (foresters cut toward the Fuel mark; builders take `buildFirst` sites first), R1C (the season card and reserve bar) |
| `demand` | R1B's growth pass (01:00) | R1C's top bar; R1F's advisors |
| `Building.trade`, `keeperId`, `level`, `pinned`, `counters` | R1B (growth, levels, jobs for the keeper); `build.pinRecipe` | R1E's art (via BuildingView), R1C's Businesses book, R1D's wishes and detectors (`hasTag`), R1A's baskets (a shop's shelf by level) |
| Household variety (new, optional, R1A adds it) | R1A's baskets and shopping | R1A's tiers; R1C (the flavor pips) |
| `market` prices | R1A | everyone |

### Cross-track APIs (signatures fixed here; the stubs land with R1.0's sweep)

| API | File | Owner |
|---|---|---|
| `methodOf(b)`, `jobsOf(b)`, `levelOf(b)`, `hasTag(b, tag)`, `isFood`, `FOOD_GOODS`, `GOODS_BY_FAMILY`, `familyIndex`, `applyRankDefaults` | `state/zones.ts` | R1.0 (bug fixes by anyone, shapes fixed) |
| `carrierDay(state, ctx)` | `systems/carrier/index.ts` | R1A |
| `carrierBrought(state, good, days)`: units the carrier bought of a good over the last `days` days | `systems/carrier/api.ts` | R1A (R1B's need term reads it) |
| `familyCover(state, family)`: days of cover in hundredths; `flavorsOnOffer(state, family)`: flavors on a shelf in reach of some home over three days | `systems/market/balances.ts` | R1A (R1B's need term, R1D's Porridge No More, the Village goal) |
| `winterMark(state, family)`: the plan's mark from Summer day 4, else null | `systems/carrier/api.ts` | R1A (R1B's foresters read it) |
| `withinReach(state, specialized, tile)`, `served(state, specialized)`, `capacityOf(state, specialized)` | `systems/specialized/api.ts` | R1B (R1C's ghost ring and Businesses book, R1A's granary draw) |
| `tradeScore(state, lot, trade)` | `systems/growth/trades.ts` | R1B (R1F's advisors may ask why a lot grew what it did) |
| `demandWhy(reason)` | `view/demand.ts` | R1B (R1C words the hover through the view, never itself) |

On day one R1A and R1B each move their builder out of `view/zones.ts` into their own file (`view/balances.ts`; `view/demand.ts` and `view/businesses.ts`) and leave `view/zones.ts` as a re-export; whoever lands second resolves the one-line conflict.

### Events

| Event | Emitted by |
|---|---|
| `balances.updated` | R1A: at 00:00 with the reports, after the carrier at 10:00, and by the `carrier.*` and `season.setPlan` commands (R1.0 wired the commands) |
| `demand.updated` | R1B: after the 01:00 growth pass and when `zone.paint`/`zone.clear` change what a bar can ask for |
| `business.updated` | R1B: when a business grows, retools, changes level or keeper, or is pinned (`build.pinRecipe`, R1.0 wired it); a specialized building's served count when a business in its reach comes or goes |

### Panels and the views they read (R1C)

| Panel | Reads |
|---|---|
| Top bar: demand bars, balance chips, the reserve bar | `DemandView`, `BalancesView` (lines, `mark`), `TownView` |
| Balances book | `BalancesView`, `MarketView` (per-good prices), `TradeView` (neighbors, the log) |
| Purse | `BudgetView`, `LeversView`, `LoansView`, `BalancesView` (budget, tab) |
| Businesses book | `ViewSnapshot.businesses` and `business.updated`, `BuildingDetail` by `inspect` |
| Season card | `SeasonCardView`, `BalancesView.plan` and `.offers`; sends `season.setPlan` |
| Build picker | content (`specialized`, `ZoneDef.requires`, trades), `DemandView`, `TownView.rank` |

### The order of a day (where each R1 system runs)

| Time | System (order) | R1 work |
|---|---|---|
| 00:00 | economy (60) | the day's books roll; `balances.updated` |
| 00:02 to 00:20 | seasons (12), weather (14), prices (62 at 00:10), trade drift (64 at 00:20) | the closed pass is forecast with the weather (R1A reads it) |
| 01:00 | growth (26) | trade choice, starting sites, retooling, demand bars (R1B) |
| 05:00 | tiers (58) | amount and variety (R1A) |
| 07:30 | warmth (59) | Fuel bought on winter days |
| 10:00 | carrier (65) | imports and exports by family, the boat (R1A) |
| hourly | production (30), logistics (40), residents (50) | trades run; a business short of its raw good asks the carrier before it rests (R1A and R1B) |
| 17:00 | wages (63) | |
| 18:00 | baskets (67) | Wares and Treats bought; Food on the shopping outings through the day |
| 23:30 | levels (69) | level days counted (R1B) |

## Found in R1.0's sweep, for the wave

Observations from building the stand-ins and fixing the tests; each names the cycle it falls to.

- **Start labor** (R1B): the Granary's two porter jobs rank like the Storehouse's, so a fresh town's six working residents all start as builders and porters (the town hall gets only two builders) and Farmland's businesses get hands only once newcomers arrive.
- **Food cover and Farmland** (R1A, R1B): the carrier's Food reserve (3 days) holds a fresh valley near four days of cover, under which Farmland stops asking; R1.0 added the `'imported'` reason so farms still grow. R1B's real Farmland bar reads the carrier's share of a farm good's use.
- **Craftsfolk savings** (R1A, R1X): 20 coins is what most Settler households already hold, so every household aspires at once; the tiers tests isolate one household.
- **The carrier in tests** (R1A): at 10:00 it buys Materials, sells Food and stocks the granary, so construction, carts, lean times and shopping tests switch it off or time their counts around it; keep that in mind when it grows.
- **Fuel all year** (R1A): the stand-in reads Fuel's use as a household a day in every season (as the spec's balance does), so a Hamlet's carrier buys firewood in summer too.
- **"Grain ripens in summer"** (R1B): the status line looks at the fields only, so it shows even when the granary holds grain.
- **The village fixture's market stall** (R1B) still holds 8 firewood although a stall now stores only Food and Treats (`BuildingDef.stores`, which R1.0's logistics reads through `takes(def, good)`); kept so the tests that read it still find it.
- **Fisheries out of reach** (R1F): on kat-1 and willow every fishery spot lies beyond the porters' range from the starting storehouse.
- **Inspector wording** (R1C): a baker's workshop reads "At work at the workshop"; trade names do not fit "at the ...".
- **Fixed in R1.0**: the Village charter listed the Sawmill and the Brickworks among its unlocks, which let both skip their innovations; an apprentice recorded the workshop def instead of the trade; A Garden Plot named a building tag nothing carries; the Corner Cafe could no longer find bakers (a baker's business now counts as a cafe); the dressing pass and the carrier shared a tick (dressing runs at 10:30).

## Calls that proved wrong in the code, and what R1.0 did

- **Rule 2 and services.** The tavern pours cider and the Bath House burns firewood: a service uses a good up and makes nothing. The rule-2 content test checks every trade and every method that makes something; services that only use a good up are outside it. Accepted by the master: `13-ledger.md`, rule 2, now reads "A made good is never an input to making something" and says a service may use a made good up.
- **Site rules.** The brief's shapes include five new placement rule kinds; R1.0 declared them and the reason codes but left the checks to R1B (above), because the autoplayer's spot finder would fail on them until R1F rewrites it.
- **The Apiary.** The spec calls it "the way to place a hives business by hand". R1.0 kept it a plain building with its own keep-bees method (no `Building.trade`), since a business on a hand-placed lot with no zone needs R1B's rules for retooling and levels; R1B decides whether placing one sets `trade: 'hives'`.
- **The Village Charter's food goal** still reads `foodDays`; "5 days of Food with 3 flavors" needs `flavorsOnOffer` (R1A) and a count for it (R1D's conditions).
