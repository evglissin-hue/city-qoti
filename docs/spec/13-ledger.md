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
| Wool, Yarn, Cloth | I2 | material, crafted | 2, 3, 6 | sheep pasture, spinner, weaver |
| Milk, Cheese | I2 | food | 1, 5 | dairy farm, cheesemaker |
| Apples, Cider | I2 | food, treat | 1, 4 | orchard, cider press |
| Firewood | I2 | fuel | 1 | chopping shed (logs) |
| Herbs | I2 | raw | 1 | herb garden |
| Tools | I2 | crafted | 8 | smithy (iron [I4] or trade) |
| Coats, Furniture | I3 | crafted | 12, 15 | tailor, carpenter |
| Pies, Honey, Candles | I3 | treat, crafted | 4, 3, 3 | pie shop, apiary, chandler |
| Paper, Books, Glass, Jam, Tea, Coal, Iron, Soap, Music boxes | I4 | various | 4 to 30 | later chains and imports |

Each good also has `carry` (units a porter carries: 4; a cart: 16) and optional `spoilsDays` [I3] (fish 2, bread 3, milk 2).

## I1 buildings

Costs, upkeep and outputs are *(tune)*. Workers are adult or young residents. Production runs while workers are present during work hours, scaled by the fraction of workers present and their mood productivity.

| Building | Size | Cost | Upkeep/day | Workers | Production | Placement |
|---|---|---|---|---|---|---|
| Town Hall | 4x4 | start | 0 | 2 builders | treasury, Charter board, peddler sales; builds sites until a Builder's Yard exists | start area |
| Cottage | 2x2 | 20 planks, 8 stone, 20 coins | 1 | none | home for 1 household (up to 4) | road at entrance |
| Builder's Yard | 3x3 | 20 logs, 10 stone, 30 | 2 | 3 builders | builds sites | road |
| Woodcutter's Hut | 2x2 | 12 logs, 20 | 1 | 2 | fells 1 mature tree per 2 h per worker → 4 logs | mature trees within 8 |
| Forester's Lodge | 2x2 | 12 logs, 6 stone, 20 | 1 | 1 | plants 1 sapling per 2 h within 8 | |
| Sawpit | 2x3 | 16 logs, 6 stone, 30 | 1 | 2 | 2 logs → 3 planks per 2 h | |
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

## Construction [I1]

- Placing a building creates a construction site, deducts the coin cost immediately, and requests the material cost.
- Porters deliver materials; builders then add work: cottage 8 builder-hours, workshop 12, storehouse 16, windmill 20 *(tune)*.
- Visible stages: staked plot, foundation, frame, roof, done.
- Order: placement order. Ledger can raise a site to priority (`build.setPriority`).
- Cancelling refunds coins in full and delivered materials to the nearest storehouse.

## Logistics [I1]

- **Buffers**: each building has input buffers (target 2 cycles of input), an output buffer (10 units, 30 for farms), and construction sites have material needs.
- **Requests**: needs (inputs below target, construction, market stall stock below 30) and offers (outputs above 0).
- **Porters**: storehouse workers. Every 20 ticks, each idle porter in id order takes the best job: priority construction (raised) > food to stalls > production inputs > construction (normal) > clearing outputs; ties go to the nearest source. A job reserves units at the source and space at the destination so nothing is double-booked.
- **Trips**: walk to the source, pick up up to 4 units, walk to the destination, drop off. Porters carry visible bundles.
- **Carts** [I2]: cart shed, 16 units, faster on lanes and streets, never on paths. **Barges** [I4]: 60 units on canals and the river.
- **Range**: a storehouse serves buildings within 20 tiles of walking distance; buildings outside any range show a "no porters" marker.

## Consumption [I1]

- Pantry capacity 8 food units per household. Each resident eats 1 food at 07:00, preferring variety.
- Shopping as in `11-residents.md`. In I1 food is free to residents; in I2 they pay market prices.

## Budget [I1]

- **Income (daily, 00:00)**: resident tax 1 coin per resident x mood tax factor (Glowing 1.2, Content 1.0, Meh 0.8, Unhappy 0.5, Miserable 0.2); peddler sales.
- **Peddler [I1]**: at 10:00 a peddler cart reaches the valley gate and buys up to 40 units of goods the Ledger marked for sale (`ledger.setForSale`) at 60% of base price. Replaced by the Trading Post in I2.
- **Expenses**: building upkeep (daily), construction coin costs (at placement), road costs (at painting).
- **Lean times**: while the treasury is below 0, no new construction can start (roads included), unpaid upkeep lowers building condition by 2% per day (under 70%: -10% output; under 40%: -30% and visible disrepair), and residents get "Lean times" (-5 mood). Recovering above 0 ends it; builders repair condition over time. Never a game over (P33).
- **Loans** [I2]: the County Bank lends 500, 1,500 or 4,000 coins by rank at 5% interest per season. Repay any time. Credit limit: the treasury may go to -200 coins x rank before construction stops.

## Market and prices [I2]

A Victoria-lite market (P30). Money circulates between the treasury and households.

- **Flows**: workplaces pay daily wages from the treasury to households; households buy goods at market prices (money returns to the treasury); income tax (lever) returns a share of wages; exports, imports, tourism and loans are the only money entering or leaving the valley.
- **Invariant (test it)**: `treasury + sum(household savings)` changes only by external flows.
- **Wages** per job tier per day *(tune)*: basic 6, skilled 10, merchant 16, patron 26 coins; lever: wage level 80% to 120%.
- **Needs baskets** per tier list need groups with quantities per day (food 1, warmth 1 per household in winter, clothing 0.1, treats 0.2...). Each group lists substitutable goods with preference weights. Households buy the good with the best `price / preference` they can afford; Thrifty households weigh price more. Unmet quantity lowers that need's satisfaction.
- **Price** per good, updated daily at 00:00:
  - demand `D` = units households wanted yesterday; stock `S` = units in market outlets and storehouses in their range; cover `c = S / max(1, D)` days; target cover `T = 3`.
  - multiplier `m(c / T)` by linear interpolation of: 0.25 → 2.5, 0.5 → 1.6, 0.75 → 1.2, 1 → 1.0, 1.5 → 0.9, 2 → 0.8, 4 → 0.65, 8+ → 0.5.
  - `price += round((base * m - price) * 0.25)`, clamped to 0.4x to 3x base.
- **Profit per building** (report): output at market price minus wages, upkeep and inputs at market price. All buildings belong to the town; profit is a signal, not a cash flow.
- **Market Square** [I2]: replaces scattered stalls as the main outlet; market days [I3] (weekly) add shopping capacity, charm and a small fee income.

## Zoning and growth [I2]

- **Zones** (painted per tile): Homes (low or medium density), Shops (ground floor shops, flats above at medium density), Crafts (small workshops), Farms (farmsteads with fields, pastures or orchards).
- **Lots**: the sim subdivides zoned frontage along roads into 2x2 to 3x3 lots facing the road.
- **Growth** (daily): for each empty lot with road access, compute desirability (charm, services, species tastes, noise) and demand (homes: arrivals waiting and attractiveness; shops: households without outlet access; crafts: market shortages of craftable goods; farms: food shortages and fertility). The best lots start a grown construction site in the district style.
- **Grown crafts** choose a recipe from unlocked small crafts by shortage signal; Ledger can pin a recipe.
- **Grown farms** choose a crop by demand and fertility; Ledger can pin a crop.
- Hand-placed production buildings remain the backbone of the chains.

## Streets and traffic [I2]

- Streets (see `10-world-and-building.md`) carry carts at 1 tile per 3 ticks versus 4 on lanes.
- Each road tile counts cart passes per hour. Above capacity (lane 30 per h, street 80 per h) carts slow by `1 + (flow - cap) / cap`, at most 2x. No gridlock simulation (P28).
- Traffic adds noise to charm.

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

## Population tiers [I2 to I4]

Homes upgrade in place when a household meets the next tier's needs for 3 consecutive days and has the savings; they slide back after 4 days unmet (P34).

| Tier | From | Needs beyond Settler basics | Jobs | Home |
|---|---|---|---|---|
| Settlers | I1 | food, water, home, warmth in winter | basic | Cottage |
| Craftsfolk | I2 | 2 food types including bread, firewood, cloth, tavern and herbalist access, charm 25+ | skilled | Townhouse |
| Merchants | I4 | 3 food types including cheese or pies, coats, furniture, school and clinic, charm 45+, Watch coverage | trade, admin | Merchant House |
| Patrons | I5 | treats (cider, jam, tea), books, library or theater, a festival attended this season, charm 65+, a park within 6 | arts, scholarship | Manor or terrace |

- Upgrades consume materials delivered by porters (Townhouse: 10 bricks, 6 planks).
- Jobs have a tier. Residents take jobs at their tier or one below; higher tiers refuse basic jobs, so a healthy town keeps a mix (and districts for each).

## Trade

- **Trading Post** [I2] at the valley gate; **River Dock** [I3].
- **Neighbors** (NPC towns): Millhaven (downstream farm town: sells wheat and wool, buys tools and planks), Stonecross (hill town: sells stone and later iron and coal, buys bread and cloth), Port Amberly [I4] (coast: sells tea, salt and fish, buys luxuries).
- **Regional price** per neighbor and good: `base x seasonal factor x drift x impact`. Drift is a deterministic random walk of up to 2% per day bounded 0.7 to 1.4. Impact: each unit you sell lowers that day's price by 0.5% (buying raises it), recovering 10% per day.
- You buy at 1.2x and sell at 0.85x the regional price.
- **Standing orders**: per good, keep stock between min and max: sell above max if the price is at least the floor, buy below min if the price is at most the ceiling. Caravans leave daily at 08:00 with capacity set by the post's level.
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
- **I2**: price history charts, trade log, profit per building, needs satisfaction by tier, land value and traffic overlays.
- Deep for whoever wants it, invisible for whoever doesn't (P32): the Hearth lens hides all of this unless asked.
