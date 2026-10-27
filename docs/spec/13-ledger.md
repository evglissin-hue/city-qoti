# 13. Ledger

The Ledger lane is a complete game (P1): space, flows, prices and budgets, with levers instead of busywork (P32). Money is stored as integer pennies (100 pennies = 1 coin); the UI shows coins.

## Goods

| Good | From | Category | Base price (coins) | Source |
|---|---|---|---|---|
| Logs | I1 | material | 1 | woodcutter |
| Planks | I1 | material | 3 | sawpit (sawmill [I2]) |
| Stone | I1 | material | 2 | quarry |
| Wheat | I1 | raw food | 1 | farm |
| Flour | I1 | processed | 2 | windmill |
| Bread | I1 | food | 2 | bakery |
| Vegetables | I1 | food | 1 | vegetable plot, farms [I2] |
| Fish | I1 | food | 2 | fisher's hut |
| Clay, Bricks | I2 | material | 1, 4 | clay pit, brick kiln |
| Wool, Yarn, Cloth | I2 | material, crafted | 2, 4 (C4C, was 3), 6 | sheep pasture, spinner, weaver |
| Milk, Cheese | I2 | food | 1, 5 | dairy farm, cheesemaker |
| Apples, Cider | I2 | food, treat | 1, 4 | orchard, cider press |
| Firewood | I2 | fuel | 1 | chopping shed (logs) |
| Herbs | I2 | raw | 1 | herb garden |
| Tools | I2 | crafted | 8 | smithy (I2: firewood and stone; iron [I4] or trade) |
| Coats, Furniture | I3 | crafted | 12, 15 | tailor, carpenter |
| Pies, Honey, Candles | I3 | treat, crafted | 4, 3, 3 | pie shop, apiary, chandler |
| Paper, Books, Glass, Jam, Tea, Coal, Iron, Soap, Music boxes | I4 | various | 4 to 30 | later chains and imports |

Each good also has `carry` (units a porter carries: 4; a cart: 16) and optional `spoilsDays` [I3] (fish 2, bread 3, milk 2).

## I1 buildings

Costs, upkeep and outputs are *(tune)*. C3X tuned them against a headless pair of players (`npm run tune -w @qoti/bench`): cottages cost 16 planks and 6 stone and have no upkeep (homes pay their way in taxes), the sawpit makes 4 planks from 2 logs, the storehouse reaches 24 tiles, and the starting storehouse holds 50 planks and 30 stone. With those, a sensibly played valley reaches 20 to 40 residents in 18 in-game days (three evenings), most seeds 28 or more, without lean times or departures. Workers are adult or young residents. Production runs while workers are present during work hours, scaled by the fraction of workers present and their mood productivity.

| Building | Size | Cost | Upkeep/day | Workers | Production | Placement |
|---|---|---|---|---|---|---|
| Town Hall | 4x4 | start | 0 | 2 builders | treasury, Charter board, peddler sales; builds sites until a Builder's Yard exists | start area |
| Cottage | 2x2 | 16 planks, 6 stone, 20 coins | 0 | none | home for 1 household (up to 4) | road at entrance |
| Builder's Yard | 3x3 | 20 logs, 10 stone, 30 | 2 | 3 builders | builds sites | road |
| Woodcutter's Hut | 2x2 | 12 logs, 20 | 1 | 2 | fells 1 mature tree per 3 h per worker → 4 logs | mature trees within 8 |
| Forester's Lodge | 2x2 | 12 logs, 6 stone, 20 | 1 | 1 | plants 1 sapling per 2 h within 8 | |
| Sawpit | 2x3 | 16 logs, 6 stone, 30 | 1 | 2 | 2 logs → 4 planks per 2 h | |
| Quarry | 3x3 | 20 planks, 40 | 2 | 3 | 2 stone per 2 h per worker | 4+ stone deposit tiles in footprint |
| Farmhouse | 2x2 | 16 planks, 6 stone, 30 | 1 | 3 | tends fields: 1 wheat per field tile per day, max 12 tiles per worker | |
| Wheat Field | painted tiles within 6 of a farmhouse | 1 per tile | 0 | none | see farmhouse | fertility 40+ |
| Windmill | 2x2 | 24 planks, 12 stone, 50 | 2 | 1 | 3 wheat → 2 flour per h; +25% at height 4+ | |
| Bakery | 2x2 | 20 planks, 16 stone, 50 | 2 | 2 | 2 flour → 5 bread per 2 h | |
| Vegetable Plot | 2x2 | 4 planks, 5 | 0 | 1 | 3 vegetables per 4 h | fertility 30+ |
| Fisher's Hut | 2x2 | 14 planks, 20 | 1 | 2 | 2 fish per 2 h per worker | entrance next to water |
| Storehouse | 3x3 | 30 planks, 10 stone, 40 | 2 | 4 porters | 400 units storage; logistics hub | road |
| Market Stall | 1x2 | 8 planks, 10 | 1 | 1 | food outlet for homes within 14 | road |
| Well | 1x1 | 6 stone, 10 | 0 | none | water for homes within 8, up to 30 residents | |

Sanity check for a 40-resident hamlet: about 20 workers; food needs 40 per day; materials keep growth at about one cottage per 1.5 days. Labor, not money, is the main constraint early on. Tuning targets for this live in `22-quality.md` (bench).

How production runs [I1, C3C]:

- Work is counted per tick: each worker inside adds their mood productivity (Miserable 50% to Glowing 110%), scaled by condition (worn under 70%: 90%; disrepair under 40%: 70%) and the height bonus. A cycle needs `hours` of the full crew at 100% (of one worker for per-worker methods), so half a crew takes twice as long.
- A cycle only runs with its inputs in the input buffer and room in the output buffer (10 per good, farms 30); otherwise the building shows "missing input" or "output full".
- Woodcutters fell the mature tree in range with the most trees around it (nearest on ties), so thick stands thin first and lone trees last. Foresters plant beside existing trees where they can, a tile clear of roads and buildings, in the neighbors' species.
- Wheat fields: painted per tile within 6 tiles of the farmhouse footprint on fertility 40+, 12 tiles per job (36 per farmhouse); painting skips tiles that cannot be fields and is refused only when none can. Each farmer tends 12 tiles: tended tiles grow 4 points (of 255) per quarter hour of tending, ripen in about two work days and yield 2 wheat, about 1 wheat per tile per day. The `crop` layer holds growth; patches go out when a tile crosses one of four drawn stages (bare, sprouts, green, golden). Tiles a road or building takes over stop being fields.
- The first unit of a good ever made writes a "first of" line in the Chronicle.

## I2 buildings [C4C]

Numbers per work day (nine hours, full crew of Content workers); all *(tune)*. Each producer turns its inputs into more value than its wages (basic 6, skilled 10 coins) and upkeep at base prices, so the inspector's profit line reads positive until C4A's prices move. Rank Village unless noted; "skilled" jobs need Craftsfolk.

| Building | Size | Cost | Upkeep | Workers | Per work day | Needs |
|---|---|---|---|---|---|---|
| Clay Pit | 2x2 | 10 planks, 20 | 1 | 2 | 18 clay | 2+ clay deposit tiles; Hamlet rank |
| Brick Kiln | 2x2 | 12 planks, 16 stone, 40 | 2 | 2 | 18 clay + 4.5 firewood -> 13.5 bricks | Brick Kiln innovation |
| Sheep Pasture | 3x3 | 12 planks, 20 | 1 | 1 | 6 wool | fertility 30 |
| Spinner's Cottage | 2x2 | 14 planks, 6 stone, 25 | 1 | 1 | 6 wool -> 6 yarn | |
| Weaver's Shop | 2x2 | 16 planks, 8 stone, 30 | 1 | 1 | 6 yarn -> 6 cloth | |
| Dairy Farm | 3x3 | 16 planks, 6 stone, 30 | 1 | 2 | 18 milk | fertility 30 |
| Cheesemaker | 2x2 | 14 planks, 12 stone, 40 | 2 | 2 skilled | 13.5 milk -> 9 cheese | |
| Orchard | 3x3 | 8 planks, 25 | 1 | 2 | 18 apples | fertility 40 |
| Cider Press | 2x2 | 16 planks, 8 stone, 40 | 2 | 1 | 18 apples -> 9 cider | |
| Chopping Shed | 2x2 | 12 logs, 15 | 1 | 1 | 9 logs -> 18 firewood | Hamlet rank |
| Herb Garden | 2x2 | 4 planks, 8 | 0 | 1 | 9 herbs | fertility 30 |
| Smithy | 2x2 | 12 planks, 16 stone, 45 | 2 | 1 skilled | 9 firewood + 4.5 stone -> 4.5 tools | |
| Water Sawmill | 2x3 | 20 planks, 12 stone, 4 tools, 60 | 2 | 2 | 16 logs -> 32 planks (+80%) | water edge; Water Wheel innovation |
| School | 3x3 | 24 planks, 12 stone, 12 bricks, 60 | 3 | 2 skilled | education for 24 children within 12 | |
| Tavern | 3x2 | 24 planks, 12 stone, 6 bricks, 50 | 2 | 2 | pours 2 cider; social for 60 within 10 | |
| Herbalist | 2x2 | 14 planks, 8 stone, 35 | 2 | 1 | brews 6 herbs; health for 60 within 12 | |
| Trading Post | 4x3 | 30 planks, 16 stone, 8 bricks, 60 | 3 | 2 porters | 200 storage, logistics 16; tagged `trading-post` (C4A trades through it) | |
| Cart Shed | 2x3 | 16 planks, 6 stone, 2 tools, 40 | 2 | 1 carter | one cart | door on a lane or street; Carts innovation |
| Townhouse | 2x2 | (grown, or a cottage upgraded with 10 bricks and 6 planks) | 0 | | a Craftsfolk household of up to 5 | grows on Townhouses lots |
| Corner Shop, Workshop, Farmstead | 2x3, 3x3, 3x3 | 18 to 14 planks and stone | 1 | 1 to 2 | a food outlet with a flat above; five small crafts; five farm methods (the method is chosen by shortage unless pinned) | grown on Shops, Crafts and Farms lots only |

Forty Craftsfolk (ten households) use about 10 firewood, 4 cloth, 12 bread and 8 treats a day; ten upgrades take 100 bricks and 60 planks. `requires` (rank or innovation) is checked by `build.place` (LOCKED) and grown-only defs are not hand-placed (NOT_ALLOWED).

## Construction [I1]

- Placing a building creates a construction site, deducts the coin cost immediately, and requests the material cost. Placement is refused when the treasury cannot cover the coins, and in lean times.
- Porters deliver materials; builders then add work: cottage 8 builder-hours, workshop 12, storehouse 16, windmill 20 *(tune)*. Work keeps pace with deliveries: builders may only do the share of the work that the materials delivered so far allow, so a site waits ("waiting for materials") rather than racing ahead.
- Visible stages: staked plot, foundation, frame, roof, done. Progress is half materials, half work; stages change at 15%, 45% and 80%.
- Builders (town hall and builder's yards) walk to the site's door and work there, up to 3 per site. Order: placement order, raised sites first. Ledger can raise a site to priority (`build.setPriority`). A paused site waits.
- Builders with no site to work on repair the most worn building, outside lean times.
- Cancelling refunds coins in full and delivered materials to the nearest storehouse. Removing a built building returns its stock and buffers to the nearest storehouse, without a coin refund. A building placed over field tiles takes them over; trees in a footprint are cleared at placement.

## Logistics [I1]

- **Buffers**: each building has input buffers (target 2 cycles of input), an output buffer (10 units, 30 for farms), and construction sites have material needs.
- **Requests**: needs (inputs below target, construction, market stall stock below 30) and offers (outputs above 0).
- **Porters**: storehouse workers. Every 20 ticks, each idle porter in id order takes the best job: priority construction (raised) > food to stalls > production inputs > construction (normal) > clearing outputs; ties go to the nearest source. A job reserves units at the source and space at the destination so nothing is double-booked.
- **Trips**: walk to the source, pick up up to 4 units, walk to the destination, drop off. Porters carry visible bundles.
- **Carts** [I2]: cart shed, 16 units, faster on lanes and streets, never on paths. **Barges** [I4]: 60 units on canals and the river.
- **Carts as built [C4C]**: each built cart shed keeps one cart (`state.carts`), parked at the shed's door when idle and not drawn. While its carter is at work, an idle cart takes a long haul from the same needs the porters match, before the porters do: 8 to 16 units, both doors on a lane or street, door to door 12+ tiles apart; or clears a producer's cartload to a storehouse that far away. It drives with C4B's `requestCartMove`, picks up, delivers (flows count it) and drives home. A shed with no cart road at its door shows "No lane or street at the door for the cart" (`noCartRoad`); a removed shed takes its cart and the load goes to the nearest storehouse.
- **Wheelbarrows [C4C, C4X]**: once unlocked, porters carry 8 of every good (C4X: 6 left a Village with a third of its workforce hauling).
- **Relays and reachability [C4C]**: a porter whose own range misses a need, at a place another storehouse in its range reaches, carries the goods to that storehouse when it holds too few. A destination porters cannot walk to from the source (across the river with no bridge, or a door on the water) is skipped for the round rather than retried by every porter.
- **Range**: a storehouse serves buildings within 24 tiles of walking distance (C3X tuning, was 20); buildings outside any range show a "no porters" marker. Until walking distances are cached, door-to-door Manhattan distance stands in for them. A porter only takes jobs whose source and destination both lie in its storehouse's range.
- **Details [I1, C3C]**: production inputs are topped up to 2 cycles' worth. Market stalls ask for the food they hold least of, so stalls stock variety. Sources are storehouses and producers' output buffers (never market stalls), so a mill can feed a bakery directly. Outputs are cleared once 4 units (a load) wait. A porter carries `carry` units of one good (4), walks back to the storehouse after a trip, and can be matched again on the way. At 17:00 porters finish the trip they are on and go home; a paused storehouse keeps its porters in. Flows for the overlay count deliveries per building pair and halve at midnight (a decaying count of about two days).

## Consumption [I1]

- Pantry capacity 8 food units per household. Each resident eats 1 food at 07:00, preferring variety.
- Shopping as in `11-residents.md`. In I1 food is free to residents; in I2 they pay market prices.

## Budget [I1]

- **Income (daily, 00:00)**: resident tax 1 coin per resident x mood tax factor (Glowing 1.2, Content 1.0, Meh 0.8, Unhappy 0.5, Miserable 0.2); peddler sales.
- **Peddler [I1]**: at 10:00 a peddler cart reaches the valley gate and buys up to 40 units of goods the Ledger marked for sale (`ledger.setForSale`) at 60% of base price. Replaced by the Trading Post in I2.
- **Expenses**: building upkeep (daily), construction coin costs (at placement), road costs (at painting).
- **Lean times**: while the treasury is below 0, no new construction can start (roads and fields included), unpaid upkeep lowers building condition by 2% per day (under 70%: -10% output; under 40%: -30% and visible disrepair), and residents get "Lean times" (-5 mood). Recovering above 0 ends it; builders repair condition over time. Never a game over (P33).
- **Order at 00:00 [I1, C3C]**: the day rolls over (stock history, yesterday, the season at its end: a season counts as "in surplus" when income beat expenses), then taxes come in, then upkeep: paid in full while the treasury is at or above 0 (it may tip it into the red, which starts lean times), unpaid in lean times, when each building with upkeep wears instead. So a town in the red pays upkeep at most every other day and climbs back on its taxes.
- **Peddler details [I1, C3C]**: buys from storehouses one unit at a time, always of the marked good the valley holds most of, so a sale spreads over what is plentiful; goods already promised to porters stay. Pays the base price x 60%, rounded down to the penny, per unit.
- **Economy dial [I1, C3C]** (`14-challenge.md`): construction, road and field prices stay as listed in every setting, so the toolbar shows the true price; the dial bends running costs and lean times:

| Effect | Gentle | Standard | Thoughtful |
|---|---|---|---|
| Upkeep | x0.7 | x1.0 | x1.25 |
| Condition lost per unpaid day | 1% | 2% | 3% |
| Repair per builder-hour | 15% | 10% | 8% |
- **Loans** [I2]: the County Bank lends 500, 1,500 or 4,000 coins by rank at 5% interest per season. Repay any time. Credit limit: the treasury may go to -200 coins x rank before construction stops.
- **Loans and credit [I2, C4A]**: the bank lends in all 500, 1,500 or 4,000 coins at Village, Town and Market Town (or 20 coins a resident when that is more). Interest comes due at 00:30 on each season's first day: 5% of each balance, rounded up to the penny, paid from the treasury when it can be and otherwise added to the loan. The credit line is 200 coins per rank step (none at Hamlet rank, so I1 rules hold to the penny): construction may spend into it, upkeep is paid within it, and lean times start only past it; what the treasury owes within the line pays the same 5% a season.

## Market and prices [I2]

A Victoria-lite market (P30). Money circulates between the treasury and households.

- **Flows**: workplaces pay daily wages from the treasury to households; households buy goods at market prices (money returns to the treasury); income tax (lever) returns a share of wages; exports, imports, tourism and loans are the only money entering or leaving the valley.
- **Invariant (test it)**: `treasury + sum(household savings)` changes only by external flows.
- **Wages** per job tier per day *(tune)*: basic 6, skilled 10, merchant 16, patron 26 coins (C4A tuned them to 3, 5, 8 and 12.50, C4X to 4, 6.50, 10 and 16; see Details); lever: wage level 80% to 120%.
- **Needs baskets** per tier list need groups with quantities per day (food 1, warmth 1 per household in winter, clothing 0.1, treats 0.2...). Each group lists substitutable goods with preference weights. Households buy the good with the best `price / preference` they can afford; Thrifty households weigh price more. Unmet quantity lowers that need's satisfaction.
- **Price** per good, updated daily at 00:00:
  - demand `D` = units households wanted yesterday; stock `S` = units in market outlets and storehouses in their range; cover `c = S / max(1, D)` days; target cover `T = 3`.
  - multiplier `m(c / T)` by linear interpolation of: 0.25 → 2.5, 0.5 → 1.6, 0.75 → 1.2, 1 → 1.0, 1.5 → 0.9, 2 → 0.8, 4 → 0.65, 8+ → 0.5.
  - `price += round((base * m - price) * 0.25)`, clamped to 0.4x to 3x base.
- **Profit per building** (report): output at market price minus wages, upkeep and inputs at market price. All buildings belong to the town; profit is a signal, not a cash flow.
- **Details [I2, C4A]**:
  - The market opens with the Village rank (the Charter's `market-prices`). Before it a Hamlet keeps the I1 books exactly: flat tax, free food, no wages, prices at base, and the `goods` need weighs nothing.
  - Wages (tuned): basic 4, skilled 6.50, merchant 10, patron 16 coins a day at wage level 100 (C4X; C4A had 3, 5, 8 and 12.50), so a working household's basket takes most of a wage (a worker keeps about two people fed). Paid at 17:00 to every assigned worker's household, with the income tax (default 10%) paid straight back. The first pay day after the Village charter sends a note explaining the new books. In lean times wages are paid only out of what the till took in from households the day before (sales and taxes), shared pro rata, so the treasury never slides further on wages.
  - Demand `D` for the price rule is what households want, recorded each day at 18:00 from every basket group's daily quantity, shared across its goods by preference weight (so an empty shelf still counts as wanted), or what the town used up that day (production inputs, construction), whichever is more. `S` is town stock in storehouses, stalls and output buffers. A good with neither demand nor stock drifts back to base. Each daily step moves at least a penny. Prices are computed at 00:10.
  - Buying: food is paid for at the till on the residents' shopping outings; every other basket group at the 18:00 household pass, used up at supper. Each group accrues its daily quantity in hundredths (fractions carry over) and buys the whole units it owes, best value first (`price / preference`, where Thrifty households count only half of a preference above 1 and comfortable ones lean in); unmet units are let go and the group's satisfaction moves halfway to the share it got. The `goods` need is the basket's average satisfaction and weighs 10 in mood from Village rank.
  - Comfortable households (6 coins of savings a member) also treat themselves at supper: one unit of their favorite food per member while their purse stays above the mark, so purses that fill flow back through the till.
  - On the slate: newcomers in their first two days and households with nobody in work take breakfast free when they cannot pay (the cheapest food, enough for the morning). Grown-ups without work feel it in their basket; elders and children do not.
  - Price caps and subsidies apply at the till; what they let go shows in the Budget as subsidies (with sales at the full price beside it).
  - A household that leaves takes its savings with it (money leaving the valley).
  - *As built (C4X tuning)*:
    - Wages are 4, 6.50, 10 and 16 coins (`WAGES`). At C4A's 3 coins a working household never got past its basket to the 30 coins Craftsfolk must have put by; at 5 coins purses filled so fast that the town borrowed everything they held.
    - A household saves for its next home: once the Charter unlocks the next tier, the supper treat only comes out of a purse above that tier's savings or above the comfortable mark, whichever is more (`savingFor` in `systems/market/baskets.ts`). Before, treats emptied every purse past 6 coins a head and no household ever had 30 coins.
    - Nobody treats while the town holds under three days of food a head (`TREAT_FOOD_DAYS`). The day the Village charter opened the market, treats doubled what the town ate and ran the Charter's five-day larder down to nothing within a week.
    - What this leaves: purses hold what Craftsfolk need, and the treasury lends it to them through the County Bank. In the 90-day autoplayer runs owed peaks at 1,500 to 3,600 coins (under the credit line, no lean days) and comes down on two seeds of five. Exports (cloth, bricks, planks, cider) pay for sites and interest, but not for purses filling as fast as the town grows.
- **Market Square** [I2]: replaces scattered stalls as the main outlet; market days [I3] (weekly) add shopping capacity, charm and a small fee income.

## Zoning and growth [I2]

- **Zones** (painted per tile): Homes (low or medium density), Shops (ground floor shops, flats above at medium density), Crafts (small workshops), Farms (farmsteads with fields, pastures or orchards).
- **Lots**: the sim subdivides zoned frontage along roads into 2x2 to 3x3 lots facing the road.
- **Growth** (daily): for each empty lot with road access, compute desirability (charm, services, species tastes, noise) and demand (homes: arrivals waiting and attractiveness; shops: households without outlet access; crafts: market shortages of craftable goods; farms: food shortages and fertility). The best lots start a grown construction site in the district style.
- **Grown crafts** choose a recipe from unlocked small crafts by shortage signal; Ledger can pin a recipe.
- **Grown farms** choose a crop by demand and fertility; Ledger can pin a crop.
- Hand-placed production buildings remain the backbone of the chains.
- *As built (C4B)*:
  - **Lots** are cut hourly (offset 70) from frontage runs: straight stretches of free zoned tiles with a road beside them no more than a level away. Streets claim frontage before lanes and lanes before paths, a long straight road before a side spur, so corners go to the busier road. Each run is cut into the zone's shapes (`ZoneDef.lots`, width along the road, depth back from it) picked by weight with a hash of the place, never leaving a lone tile; a deep shape gives way to a shallow one where the ground rises (a lot spreads at most one level) or something stands in the way. Low-density zones leave the odd one-tile garden gap; townhouses and shops stand shoulder to shoulder. A lot never covers road, water, fields or buildings, the tile in front of a door that faces it, or the two tiles straight on from a dead end (so the road can carry on), and never swallows decor. Roads may be painted over empty lots, which then go, and new road leaves its zone. The pass is idempotent and skipped while nothing it reads has changed. Homes zones prefer deep plots (2x3, 3x3) with back gardens where the zone is deep enough.
  - **Desirability** 0 to 100: 35, plus charm around the lot (up to 25), a well (8) and a food outlet (8) in reach, the tastes of the two commonest species (-9 to 15); homes lose up to 25 for noise; shops gain for homes within 8 tiles; crafts gain 10 within a storehouse's reach; farms gain or lose by fertility. Lots are rescored a slice an hour (each once a day).
  - **Demand**, at 01:00. Homes: while the town would draw newcomers (attractiveness before vacant homes count, at least 25) and has open jobs, enough homes (empty or going up) to keep `2 + pop / 30` waiting, at most half the open jobs. Shops: households no outlet reaches (a shop goes where it reaches at least two), or more than eight households per outlet. Crafts: a good short of three days' want (yesterday's market demand or use, plus what construction sites wait for) that the town also makes less of than it wants, and that a grown workshop can make from inputs the valley has. Farms: under four days of food in hand.
  - **Starting sites**: a couple a night, at most three grown sites going up, on the best lots porters can reach, when the storehouses hold half the materials beyond what other sites wait for (the rest comes as it is made; a site waiting on planks makes planks short, so a sawpit may grow). Grown sites cost the treasury nothing. What grows: content defs with `grows.zone`; until a zone has any, I1 stand-ins (cottages, market stalls, the bakery, sawpit and windmill, farmhouses and vegetable plots).
  - **District styles** (I2): the starter four from content (`styles`); a lot takes the style of its neighbors on the same side of the same road in the same kind of zone (one in five breaks ranks), or the one its place suits (timber by water, stone up the hill, brick on streets and for shops and townhouses, plaster among gardens, stone for workshops). C4E draws them; the building id seeds the variants.
  - **Methods**: a grown workshop or farm takes the method whose outputs are shortest (farm methods weighted by the lot's fertility) and changes nightly only for one wanted half a day more; a pinned method (`build.pinRecipe`) never changes. Built grown farms take the free farm-zoned land within reach as fields, nearest first, at no charge.

## Streets and traffic [I2]

- Streets (see `10-world-and-building.md`) carry carts at 1 tile per 3 ticks versus 4 on lanes.
- Each road tile counts cart passes per hour. Above capacity (lane 30 per h, street 80 per h) carts slow by `1 + (flow - cap) / cap`, at most 2x. No gridlock simulation (P28).
- Traffic adds noise to charm.
- *As built (C4B)*: flow is the passes counted since the top of the hour scaled to a whole hour (over at least a quarter hour, so the first carts of an hour never read as a jam). Cart routes are the quickest drive (cart ticks per tile, so a street draws carts off a parallel lane; never more than a level per step), cached until the network changes. A route the network no longer carries is planned again from where the cart stands; a cart whose road went from under it goes back to its shed (parked). Residents and carts share tiles, never block each other, and every cart arrives within twice its free-flow time (a property test). Noise: a road gives its tile its content noise (streets 2) plus a point per 10 passes an hour (at most 6), and half of that to the tiles beside it; chunks where carts are heard are recomputed hourly.

## Services

| Service | From | Coverage | Notes |
|---|---|---|---|
| Well | I1 | water, 8 tiles, 30 residents | |
| School | I2 | education, 12 tiles | children learn; enables apprenticeships |
| Herbalist | I2 | health, 12 tiles | Craftsfolk need; clinic upgrade [I4] |
| Tavern | I2 | social, 10 tiles | Craftsfolk need; evening leisure |
| Watch House | I3 | safety | see `14-challenge.md` |
| Bath House | I3 | warmth and health in winter | |
| Library, Theater, Post Office, Inn | I4 | culture, letters, tourism | Patron needs |

Services as built [C4C]: a school, tavern or herbalist covers homes whose door lies within its radius of its own door while it is built, open and staffed, up to its capacity in residents who use it (grown-ups for the tavern, children for the school, everyone for the herbalist), each household going to the nearest one with room. Hourly (offset 110) the `social`, `health` and `education` needs move a quarter of the way toward 100 (covered), 60 (covered but out of cider or herbs) or 25 (none; education 45). Settlers do not have these needs (they stay at 100 and weigh nothing, so a Hamlet plays as in I1); Craftsfolk grown-ups weigh social and health at 10 each, their children health and education. The tavern is an evening leisure spot. Open services hire before other work and are never "stuck" for want of supplies.

## Population tiers [I2 to I4]

Homes upgrade in place when a household meets the next tier's needs for 3 consecutive days and has the savings; they slide back after 4 days unmet (P34).

| Tier | From | Needs beyond Settler basics | Jobs | Home |
|---|---|---|---|---|
| Settlers | I1 | food, water, home, warmth in winter | basic | Cottage |
| Craftsfolk | I2 | 2 food types including bread, firewood, cloth, tavern and herbalist access, charm 25+ | skilled | Townhouse |
| Merchants | I4 | 3 food types including cheese or pies, coats, furniture, school and clinic, charm 45+, Watch coverage | trade, admin | Merchant House |
| Patrons | I5 | treats (cider, jam, tea), books, library or theater, a festival attended this season, charm 65+, a park within 6 | arts, scholarship | Manor or terrace |

- Upgrades consume materials delivered by porters (Townhouse: 10 bricks, 6 planks).
- *As built (C4C)*: daily at 05:00, once the valley has unlocked the tier (the Village Charter unlocks Craftsfolk). Moving up needs, three days running: bread and another food eaten lately; every other group of the next basket on outlet shelves (or in the pantry) for a day; the basket's services covering the home; average charm within 3 tiles of the door at the basket's level; savings at the basket's level (not spent); a home that can grow (its def holds the tier, or `upgradesTo` one that does). Then a cottage asks for its materials (`rt.upgrade`, status "Becoming a townhouse: waiting for ..."), porters bring them like a site's, and the def swaps in place when the last unit arrives; the household, its members and `rt.tier` move up. Staying needs C4A's basket satisfaction (each group 50+) when the household buys its own basket, else the shelves, the services and charm with 5 points of slack; four failing days slide it back a tier, keeping the house, so three good days later it moves up again with no new bricks. Notices of kind `tier` mark each step. The resident inspector's `tierProgress` names what is missing. While Craftsfolk are unlocked, hiring treats the basket's missing goods (and the inputs of their workshops, and bricks while homes wait) as shortages.
- Skilled jobs at I2: cheesemaker, smithy, school. Residents take jobs at their tier or one below.
- Jobs have a tier. Residents take jobs at their tier or one below; higher tiers refuse basic jobs, so a healthy town keeps a mix (and districts for each).

## Trade

- **Trading Post** [I2] at the valley gate; **River Dock** [I3].
- **Neighbors** (NPC towns): Millhaven (downstream farm town: sells wheat and wool, buys tools and planks), Stonecross (hill town: sells stone and later iron and coal, buys bread and cloth), Port Amberly [I4] (coast: sells tea, salt and fish, buys luxuries).
- **Regional price** per neighbor and good: `base x seasonal factor x drift x impact`. Drift is a deterministic random walk of up to 2% per day bounded 0.7 to 1.4. Impact: each unit you sell lowers that day's price by 0.5% (buying raises it), recovering 10% per day.
- You buy at 1.2x and sell at 0.85x the regional price.
- **Standing orders**: per good, keep stock between min and max: sell above max if the price is at least the floor, buy below min if the price is at most the ceiling. Caravans leave daily at 08:00 with capacity set by the post's level.
- **Details [I2, C4A]**:
  - Drift moves at 00:20 for every good a neighbor trades, by a step from a hash of the valley seed, the day, the neighbor and the good (no RNG stream, so trade never shifts other systems' dice), plus a pull of 4% of the way back to 1. Impact recovers 10% of the price a day in a straight line (a neighbor absorbs about twenty units a day before its price sags) and stays within 0.5x to 2x.
  - At 08:00 caravans due home unload into the post's store (or the nearest storehouse), then the orders run: shortfalls first (counting what is already on the road), then surpluses, best-paying first, unit by unit while the floor or ceiling holds; buying also stops at the credit line. Capacity is 40 units a day, plus 16 for each cart in the valley (up to three). Loads come from the post's store, then the storehouses, so no hauling is needed; money settles at the gate as the caravan leaves (exports and imports), and bought goods arrive the neighbor's `days` later. Export bans are respected. A valley with a Trading Post no longer sees the peddler.
  - Neighbors (tuned): Millhaven also buys logs and Stonecross vegetables, so every Hamlet good has a buyer somewhere.
- **Contracts** [I4]: offers each season such as "deliver 200 wool by Autumn day 5 at 3 coins each". Shortfall costs renown and a fee. Rewards planning, carries risk (P31).
- **Commissions** [I3]: optional requests from neighbors or notable visitors with unlock, decor or renown rewards.
- **Road safety** [I4]: bandit activity on the valley road raises caravan losses unless the road is patrolled; the risk shows as a price premium.

## Levers and policies

| Lever | From |
|---|---|
| Goods for sale (peddler), building priority, pause a building | I1 |
| Income tax 0% to 20%, wage level, price cap or subsidy per food, loans, export bans | I2 |
| Market day, quiet hours (workshops idle 20:00 to 07:00: less noise, less output) | I3 |
| Watch size and budget, gate rules | I3 |
| District policies (no carts, festival district, garden district) | I4 |

## Reports and overlays

- **I1**: Stocks (stock, produced and consumed per day, trend), Workforce (jobs per building, vacancies), Budget (income and expenses by category, today and season), Buildings (status: no workers, missing input, output full, no road, no porters). Overlays: logistics flows (arrows weighted by deliveries per day), well coverage, building status icons.
- **I1 events [C3C]**: `stocks.updated` and `budget.updated` at 00:00 and hourly when they changed; `town.updated` at 00:00, when the treasury moves and from commands that spend; `building.updated` on construction stage and status changes, from levers, and at most hourly otherwise. Status bits refresh hourly. The building inspector names what is missing ("Waiting for flour", "Waiting for 12 planks and 4 stone"), and gives goods per work day with the full crew and goods made today.
- **I2**: price history charts, trade log, profit per building, needs satisfaction by tier, land value and traffic overlays.
- Deep for whoever wants it, invisible for whoever doesn't (P32): the Hearth lens hides all of this unless asked.
