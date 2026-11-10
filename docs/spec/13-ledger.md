# 13. Ledger

The Ledger lane is a complete game (P1): land, streets, trade and budgets, with levers instead of busywork (P32). Money is stored as integer pennies (100 pennies = 1 coin); the UI shows coins.

**Status**: the zones-first Ledger, accepted by the owner on 2026-11-10 and built in R1 (`30-roadmap.md`). It replaces the chain economy of I1 to I3, whose spec is kept in `archive/13-ledger-chains.md`. Until R1X merges, the code on `main` still runs the archived rules, so read the archive for what exists and this doc for what to build. Sections marked *kept* carry over as built; their fine print is in the archive, under the heading each one names.

**Why it changed** (the owner, 2026-11-10: "not 30 different production chains"; measured the same day with the autoplayer on seed willow, 70 days): the chain economy had 25 goods and 27 kinds of hand-placed production building, with nine more goods planned for I4. In 70 days one sensible player placed 154 buildings by hand (69 production buildings of 16 kinds), paused or reopened a workplace 261 times, changed a trade order 321 times and painted a zone 5 times. No household reached Craftsfolk in 52 days at Village rank, on either seed tried. That is micromanagement, which P32 rules out.

## The five rules [R1]

1. **Zones are the economy.** The Ledger zones land and the town builds, staffs and runs the businesses on it. Hand placement is for specialized buildings, services and special homes.
2. **Two steps at most.** Land gives raw goods; a workshop turns raw goods into a made good. A made good is never an input, so no workshop ever waits on another workshop.
3. **Nothing stalls.** The carrier imports any shortfall and sells any surplus by itself, within rules and a budget the Ledger sets and within what it can carry. Making things in the valley is cheaper, gives work and keeps the town safe when the pass is closed, but it is never a precondition.
4. **Five balances.** The Ledger reads Food, Fuel, Materials, Wares and Treats, each as an amount (days of cover) and a variety (flavors on offer), never a list of every good.
5. **Ranks add decisions, never chains.** A new rank or era may add a district policy, a kind of street, a trade route or a specialized building. It never adds a link the Ledger must place for something else to work. The raw goods below are the whole list for the life of the game, but for coal in the Age of Steam.

## Goods: families and flavors [R1]

Every good belongs to one family and is raw or made. A flavor is a good seen from the household's side: bread, fish and cheese are flavors of Food.

| Family | Raw goods (from land) | Made goods (from raw goods only) | Used for |
|---|---|---|---|
| Food | grain, vegetables, fruit, fish, cheese | bread (grain) | eaten daily; grain is eaten as porridge, the plainest flavor |
| Fuel | firewood | none | warmth in winter, brick firing, fires at places [R3] |
| Materials | timber, stone | brick (clay at the brickworks, fired with firewood) | construction, roads, walls |
| Wares | none (wool is raw, and only an input) | cloth (wool), furniture (timber), candles (honey) | household goods; candles light windows and lanterns [R3] |
| Treats | honey | cider (fruit) | bought of an evening (`19-evenings.md`), festival menus |

- **16 goods** in R1: grain, vegetables, fruit, fish, cheese, bread, firewood, timber, stone, brick, wool, cloth, furniture, candles, honey, cider. Base prices carry over from the archive where the good existed (grain takes wheat's, timber planks', brick bricks'); all *(tune)*.
- **Raw goods are useful as they are.** Raw food is eaten; timber and stone build. A workshop adds value and variety and is never a gate: without a baker the town eats porridge, fed and a little bored.
- **A made good takes one or two raw goods**, listed above. Bread feeds more than the grain it uses (2 grain to 3 bread); 1 fruit presses 2 cider and 1 honey makes 3 candles *(all tune)*, so comforts never take many hands.
- **Spoiling** as built (archive, Goods): fish 2 days, bread 3, fruit 4 *(tune)*; cheese, grain and vegetables keep. A granary halves it.
- **Seasons** as built: vegetables and fruit by season, no fishing on a frozen river, honey rests in winter, grain sown from Spring day 1 to Summer day 3 and cut when golden.
- **Later flavors** never add work for the Ledger. They arrive through people and places (`19-evenings.md`): a master's good [R3] (nine, such as pies, smoked fish, jam and coats, each made from the same raw good by the master's own business), a named specialty [R3], or a trade deal (tea from Port Amberly [I4]). Coal joins Fuel in the Age of Steam (`18-eras.md`).
- Gone with the chains: logs, planks (now timber), flour, clay, yarn, milk, herbs, tools, coats, furniture's plank step, pies as a base good (they return as the master baker's). Per-good quantities stay arrays indexed by good index.

## Land and specialized buildings [R1]

About a dozen hand-placed buildings, each one decision about the valley's ground. A specialized building has a **site rule**, and most have a **reach** (walking distance along roads, 24 tiles unless noted *(tune)*) and a **capacity** (how many businesses or homes it serves). Placing one shows its reach on the ground. None is a bonus on someone else's work: each makes something, stores something or lets a trade exist.

| Building | Rank | Site rule | What it does | Crew |
|---|---|---|---|---|
| Forester's Lodge | Hamlet | 12+ mature trees within 8 tiles | fells and replants its wood; makes timber, and firewood toward the season plan's Fuel reserve | 3 |
| Quarry | Hamlet | 4+ stone deposit tiles in the footprint | stone | 3 |
| Fishery | Hamlet | door on the water's edge | fish; rests while the river is frozen | 3 |
| Windmill | Hamlet | open ground, no building within 2 tiles | lets bakers set up in its reach: 2 bakers, or 4 when it stands 4+ levels above the ground around it | 1 |
| Granary | Hamlet | road at the door | keeps 1,200 Food *(tune)*, which spoils half as fast in store, as it does in today's storehouses; homes and shops in reach draw on it | 2 porters |
| Storehouse | Hamlet | road at the door | keeps 800 units of Fuel, Materials, Wares and Treats *(tune)*; the porters' hub | 4 porters |
| Market Stall | Hamlet | road at the door | an outlet for Food and Treats for homes within 14 tiles; either lens may place it | 1 |
| Sawmill | Village (Water Wheel) | door on the river's edge | lets carpenters set up in its reach (3 carpenters); saws by hand, for one carpenter fewer, while the river is frozen | 2 |
| Brickworks | Village (Brick Kiln) | 2+ clay deposit tiles in the footprint | brick, burning 1 firewood for 6 bricks | 3 |
| Market Square | Village | 3x3 of open ground on a street or lane | six stalls in one place selling every family: the town's main outlet, where the carrier sets out what it brought, and the site of market day | 3 |
| Trading Post | Village | within 6 tiles of the valley road | the carrier's depot: more carried each day and better terms (see The carrier) | 2 |
| River Dock | Village, renown 1 | door on the river's edge | a boat to Millhaven every 3 days | 1 |
| Cart Shed | Village (Carts) | door on a lane or street | one cart for long hauls | 1 |

- **Stores are sized for about one granary and one storehouse to every 150 residents** *(tune)*. The winter reserve counts Food and Fuel wherever they lie (granaries, storehouses, shelves, pantries, a farmstead's own buffer and sheaves still standing), so a reserve is never only a matter of building granaries.
- Services and civic buildings stay hand-placed as built: Town Hall, Builder's Yard, Well, School, Herbalist, Tavern (also a place on the evening round from R2), Bath House, Watch House and the defenses (`14-challenge.md`).
- The Forester's Lodge is the old woodcutter, forester and chopping shed in one; the Brickworks is the clay pit and kiln; the Market Square is what Odette Fenwick's story builds toward, and her finale roofs it into the Market Hall.
- Costs are in coins, timber, stone and brick; the archive's numbers convert planks to timber and bricks to brick one for one, and C4X's tuning is redone in R1X.
- **Innovations** keep their conditions (`15-progression.md`) and now open specialized buildings and capabilities: the Water Wheel opens the Sawmill, the Brick Kiln opens the Brickworks, Carts open the Cart Shed, Cobbles let streets be laid, and Wheelbarrows raise a porter's load to 8. No innovation that opens a specialized building waits on a story step: a story character's letter may bring it early, and a plain condition always brings it in the end.

## Zoning and growth [R1]

**Zones** (painted per tile, layer values as shipped). There are four kinds, one for each demand bar: Homes (`homes-low`, with a second density, Townhouses, `homes-medium`, from Village rank), Shops (`shops`, from Village rank), Workshops (`crafts`) and Farmland (`farms`). Homes, Workshops and Farmland are open from founding; the first evening still starts with a lane and a few buildings placed by hand (`02-game-overview.md`, New valley).

**Lots** *kept*: the sim cuts zoned frontage along roads into lots facing the road, as built in C4B (archive, Zoning and growth: frontage runs, shapes by weight, streets before lanes before paths, the hourly idempotent pass). R2 adds rows without gaps, garden lots and corner lots to the cutter, for V3 to draw (`17-presentation.md`, Visual direction, second pass, item 4; `30-roadmap.md`, R2).

**A business** is what grows on a Workshops, Farmland or Shops lot: one building with a trade, a keeper (the first hand hired, or the resident whose trait or apprenticeship tipped the choice; the family name goes on the sign, as on C5B's named shops), a crew, a small input and output buffer and a level. Businesses belong to the town as every building does: wages come from the treasury and sales return to it.

**Trades** are content (`TradeDef`: what it makes and from what, the zone, the site it wants, the specialized building whose reach it needs, its crew by level, its look).

| Zone | Trade | Makes | Wants |
|---|---|---|---|
| Farmland | grain farm | grain | fertility 15+; fields of up to 12 tiles a hand, sown and cut by the season |
| Farmland | market garden | vegetables | any soil, by its fertility |
| Farmland | orchard | fruit | fertility 40+; three days to bear *(tune)* |
| Farmland | dairy | cheese | fertility 30+ |
| Farmland | sheep run | wool | fertility 30+ |
| Farmland | hives | honey | a pollinator score of 100+ in its chunk (`12-hearth.md`, Nature) |
| Workshops | baker | bread from grain | a windmill's reach with room |
| Workshops | weaver | cloth from wool | none |
| Workshops | carpenter | furniture from timber | a sawmill's reach with room |
| Workshops | chandler | candles from honey | none |
| Workshops | cider maker | cider from fruit | none |
| Shops | shop | sells Food and Wares; Treats too from level 2, when it may put tables out (`19-evenings.md`); a longer shelf at level 3 | households or footfall in reach |

**Demand** *kept, and now shown*: the sim already works out each night what the town wants grown (`growthDemand`: homes, shops, crafts, farms). R1 turns it into four **demand bars**, 0 to 100, in the Ledger's top bar: Homes, Shops, Workshops, Farmland.

- Homes: households that would come now (the town's pull is 25+ and jobs are open), as built.
- Shops: households no outlet reaches, or more than eight households an outlet, as built; by footfall from R2 (`19-evenings.md`).
- Workshops: the sum of the best trade scores (below) among needs no business meets.
- Farmland: Food under four days of cover, or more than a third of a farm good's use (grain, vegetables, fruit, cheese, wool, honey) coming by carrier.
- Hovering a bar says why in words ("Cloth is short and wool is plentiful"). A bar is quiet while a free, suitable lot exists (growth is on its way) and lit when the town needs more zoned land, so it asks only when it needs the player.

**Choosing a trade** (the 01:00 growth pass, replacing `chooseMethod`'s shortage rule): for a lot about to grow, each trade the valley's rank and innovations allow scores `need x supply x site x keeper`:

- need: how short its good is. It counts days of cover under the family's reserve, whether a tier still lacks the flavor, and what the carrier had to bring in the last three days (a good the town keeps importing is short, however full the shelf). Wants are read for every tier the valley has unlocked, not only the tiers living in town: until the first household of a newly opened tier arrives, one household in ten counts as if it had *(tune)*, so Wares and Treats reach the shelves before anyone needs them to qualify;
- supply: 1 when the raw good is made in the valley or two days of it are in store, 0.5 when it would come by carrier, 0 when none is here and the carrier may not bring it (the rule that counts is the one for the family of the good the trade makes);
- site: 1 when the lot meets the trade's wants (soil, pollinators, a reach with room), else 0;
- keeper: 1, or a little more when a resident wants the trade (a finished apprentice of it, or a fitting trait: Sweet Tooth bakes, Green-Fingered gardens). It multiplies, so a keen baker never opens a bakery outside a windmill's reach.

The best positive score grows; none positive, nothing grows and the bar stays low. A business retools to another trade only when its own good has been in surplus for six days and another is short (one a night across the town), keeping its keeper; a trade the Ledger pinned (`build.pinRecipe`, kept) never changes. A business whose site wants stop being met (its windmill was moved) retools after three days, pinned or not.

**Starting sites** *kept*: a couple a night, at most three grown sites at once, on the best lots porters can reach, free to the treasury, built from stock by the town's builders.

**Levels** (businesses and shops; homes use tiers): 1, 2 and 3, each a bigger building with a larger crew (workshops 1, 2 and 4 hands; farmsteads 2, 3 and 4; shops 1, 2 and 3 *(tune)*), never a multiplier. A business moves up after three days running of:

- steady custom (it sold at least four fifths of what it made; a shop served 6 customers a day for level 2 and 15 for level 3 *(tune)*, and from R2 every ten evening steps past its door count as one more);
- reliable inputs (no day without its raw good, the carrier's counting);
- room to grow: for a workshop or shop a good street at the door (a lane or better for level 2, a street for level 3); for a farmstead enough free farm-zoned ground in reach for the larger crew;
- for level 3, a master on the crew [R3]; until R3 the keeper's 20 working days there stand in *(tune)*. When R3 lands, a business that reached level 3 that way keeps it, and its keeper is counted a master once they have four hearts.

It slides back one level after four failing days, keeping its walls, as homes do. A business resting because its raw good is out of season (a cider maker in winter) neither fails nor counts those days: its level and its hands' working days wait for spring. Levels are drawn (`17-presentation.md`): a bigger yard, a painted sign, goods out front.

**Homes improve on their own** *kept* (P1's dressing ladder, archive): window boxes, a porch, ivy.

**Labor** needs no lever: residents take the job that matters most (`11-residents.md`, Jobs, kept). A business with nothing to do rests by itself and its hands go where work is (a farmstead's to the forester and the builders in winter). Pausing a building stays as a command for emergencies and is never needed to balance labor.

## Production *kept*

Work is counted per tick as built (archive, How production runs): each worker inside adds their mood productivity, scaled by condition; a cycle needs its hours of the full crew, its raw good in the buffer and room for the output. Grain fields, sowing windows and harvests are as built in C5A and P1. What changes: methods are trades, and a business short of its raw good asks the carrier before it rests.

## Construction *kept*

As built (archive, Construction): a placed or grown building is a site; coins are paid at placement (grown sites are free), porters bring timber, stone and brick, builders add the work, sites explain what they wait for. Two changes:

- Townhouses and everything of the Age of Steam need brick as well as timber and stone.
- A site short of a material asks the carrier when the Materials rule allows, so building is dearer on bought timber and never stuck for want of it.

## Logistics *kept*

As built (archive, Logistics): buffers, needs and offers, porters taking the best job every 20 ticks, carts for long hauls, wheelbarrows, relays, ranges. Food is stored in granaries and everything else in storehouses; shops and stalls restock from both. The player's levers are where stores, markets and streets go (see Streets), never routes or orders.

## Households: amount and variety [R1]

Baskets are per tier and per family (`content.baskets`), bought as built: Food on the residents' shopping outings, Fuel at the 07:30 warmth pass, Wares on the same shopping trip as food (no extra walk), Treats at the 18:00 household pass until R2 moves them to the evening round.

| Tier | Food (a resident a day) | Fuel (a household a winter day) | Wares (a household a day) | Treats (a resident a day) |
|---|---|---|---|---|
| Settlers | 1 | 1 | 0 | 0.1 |
| Craftsfolk | 1 | 1 | 0.2 | 0.2 |
| Merchants [I4] | 1 | 1 | 0.4 | 0.3 |
| Patrons [I5] | 1 | 1 | 0.6 | 0.4 |

Every number in this table is *(tune)*. A day of Fuel is one firewood a household at any time of year, so the Fuel balance reads the same in June as in January. A day of Wares or Treats counts the households that buy them and, while a newly opened tier has no household yet, one household in ten as if it had, so the carrier's one-day reserve is never a reserve of nothing.

- **Amount**: a family's share of what the household wanted, as built (unmet units are let go; satisfaction moves halfway to the share it got).
- **Variety**: the number of a family's flavors the household could buy in the last three days (on a shelf in reach, or in its pantry); from R3 a named specialty on its evening round counts as one more.
- Within a family households choose by price and liking as built (Thrifty households weigh price more; species and traits have favorites), so substitution is the rule: dear bread means more porridge.
- The `goods` need is the basket's average of amount and variety against the tier's wants below, and weighs 10 in mood.

## Market and prices *kept*

Per good, daily, from cover against a three-day target, as built (archive, Market and prices), with one addition: while the carrier runs for a family, a good's price cannot pass the carrier's price by more than a tenth. The Balances book shows a family's price as the average of its flavors, weighted by what was bought.

## The carrier and trade [R1]

The carrier is the peddler grown up: a cart at the valley gate at 10:00 every day the pass is open, and the boat once there is a dock.

- **What it does without being asked**: for each family, buys what is short of the **reserve** (days of cover). It buys in a fixed order while the day's budget and its load last: Food, Fuel, Materials a site waits for, raw goods a business is resting for, Wares, Treats.
- **Selling** is a switch per family (`carrier.setRule`), off for Materials and Fuel by default, so the carrier never sells the town's timber, stone or woodpile unasked. Where it is on, it sells what is over twice the reserve, never what a festival has put by, and nothing under a winter mark from Summer day 4 to the thaw.
- **Which goods**: raw and made alike, from what the neighbors sell (their lists, archive, Trade). Within a family it buys first a flavor some tier in town still lacks, then whatever is cheapest; it sells the flavor the town holds most of. What no neighbor sells it cannot bring, which is why no tier names a single good.
- **Rules** per family (`carrier.setRule`): Always (it buys up to the reserve), Essentials only (Food and Fuel a household would otherwise go without today, Materials an open site is waiting for, raw goods a business is resting for want of; never Wares or Treats themselves) or Never. Defaults: Food and Fuel Always; Materials Essentials only; Wares and Treats Never in a Hamlet and Always from Village rank.
- **Reserves** per family (`carrier.setReserve`): Food 3 days, Fuel 3 days, Wares and Treats 1 day, Materials what open sites need plus 20 *(tune)*. From Summer day 4 to the thaw the season plan's winter marks stand in for the Food and Fuel reserves.
- **Budget** (`carrier.setBudget`): most coins a day on imports, 40 by default *(tune)*. **Essentials are always carried**: when the treasury cannot pay, Food and Fuel for households that would otherwise go without still come, booked to a County tab that works as the bank's loans do (5% a season) and is capped at 20 coins a resident *(tune)*. Past the cap nothing comes and the town goes short, so a town in debt eats plainly, never for nothing and never forever.
- **Terms** by what stands in the valley, on the neighbor's regional price (archive, Trade: seasons, drift and impact as built):

| | Carried a day | Buys at | Sells at |
|---|---|---|---|
| The peddler (Hamlet, nothing built) | 20 units | 140% | 60% |
| With a Trading Post | 40 at Village rank, 120 at Town, 240 at Market Town, 400 at City, and 16 more for each cart (up to three) *(tune)* | 120% | 85% |
| The boat (River Dock) | 120 units every 3 days | 110% | 92% |

- **The pass**: heavy snow closes the valley road on some winter days, forecast on the season card (`14-challenge.md`). The carrier does not come and the boat does not sail on a frozen river, so a town that lives on imports must put by before winter.
- **Deals** (P1's Deals tab, kept and renamed terms): each season a neighbor offers terms for one family (Millhaven grain and wool, Stonecross stone and firewood), such as buying at 110% for the season or taking the town's cloth at 95%. One switch a deal; the carrier does the rest.
- **Why make it here**: no markup, work for the households, something to sell, and stores that hold when the pass is closed. A Winter Without Imports stays an achievement.
- **Commissions** *kept* (archive): asks name goods from the list above.
- **Contracts** [I4] and **Port Amberly** [I4] as planned.
- Gone: standing orders with their floors and ceilings (the carrier's reserves replace them), goods marked for sale, export bans per good (now a family's rule).

## Budget *kept*

As built (archive, Budget): a flat tax in a Hamlet, wages and income tax from Village rank, upkeep, loans and the credit line, lean times with no game over, the money invariant (`treasury + sum(household savings)` changes only by external flows). The carrier's buying and selling book as imports and exports.

## Streets and traffic *kept*

As built (archive, Streets and traffic): paths, cart lanes and streets, cart passes counted per tile and hour, slowing above capacity, traffic noise into charm. Streets are the Ledger's logistics game: where the cart lanes, bridges, stores and market go decides how far goods travel. R2 adds **evening streets** (`19-evenings.md`): a stretch closed to carts from 17:00 to 21:00.

## Services *kept*

As built (archive, Services): wells, school, herbalist, tavern, Watch House, Bath House, their reach and capacity. Two inputs change with the goods: the herbalist grows what she brews in her own garden and needs no supply (herbs are no longer a good), and the tavern pours cider or any other Treat on its shelf. The Bath House burns firewood as built. From R2 the tavern is a place on the evening round and the `social` need folds into evenings.

## Population tiers [R1]

Homes upgrade in place when a household meets the next tier's wants for three days running and has the savings; they slide back after four failing days (P34, as built in C4C).

| Tier | From | Amount | Variety (flavors) | Also |
|---|---|---|---|---|
| Settlers | I1 | Food | Food 1 | water, a home, warmth in winter |
| Craftsfolk | I2 | Food, Wares, Treats | Food 3, Wares 1, Treats 1 | the herbalist in reach and 20 coins put by; until R2 also a tavern in reach and charm 25 at the door, from R2 evenings of 50 in their place |
| Merchants | I4 | as above | Food 5, Wares 3, Treats 3 | school and clinic, Watch cover, evenings of 65 |
| Patrons | I5 | as above | Food 7, Wares 5, Treats 5 | library or theater, a festival attended this season, evenings of 80 |

Every number in this table is *(tune)*. No tier names a single good: any flavors of the family count, so a town with no windmill can reach Craftsfolk on porridge, fish and cheese, and bread only makes it easier.

- The base goods carry a town to Craftsfolk and most of the way to Merchants, whose third Treat is a master's good or comes by trade. Patrons need several flavors that only masters, specialties or far trade bring. So variety beyond the first rungs is the Hearth's to grow (`19-evenings.md`), and never something the Ledger wires.
- In a Hamlet households have no purse (the flat tax, free food and free treats of I1, kept); baskets, prices and wages begin with the Village Charter as built.
- A townhouse upgrade takes 10 brick and 6 timber, brought by porters as built.
- Jobs keep their tiers for wages as built (residents take a job at their tier or one below). In R1 every hand in a business or a specialized building is a basic job and the school's teachers are skilled, so no business ever waits for a tier that does not exist yet; R1X tunes whether keepers and level 3 crews become skilled jobs.

## The season plan [R1]

The season card (`17-presentation.md`) puts two or three questions to the Ledger. Answers are optional, keep until changed and go through `season.setPlan`.

1. **The winter reserve**: days of every family the town uses to hold by the first day of winter, 8 by default *(tune)*, with Food and Fuel settable apart. Winter stops fruit, honey and fishing, so Treats and variety need putting by as much as bread does. From Summer day 4 a reserve bar sits by the balances and nothing under a mark is sold; the foresters cut toward the Fuel mark; the town's own makers get until Autumn day 4, and only then does the carrier buy toward the marks, when the rules allow. Meeting it is what "prepared" means for the First Winter (`15-progression.md`).
2. **This season's deal**: one of the neighbors' offers, or none.
3. **Where to build first**: one zone or district whose sites the builders take first.

## Districts [I4]

Drawn by the Ledger and styled by the Hearth (P22), with policies in place of new chains: a market quarter (shops favored, evening streets), a mill quarter (workshops may work late, carts first), a garden quarter (no workshops), an old town (`18-eras.md`).

## Levers

| Lever | From |
|---|---|
| Building priority, pause a building (emergencies), pin a trade | I1, R1 |
| Income tax 0% to 30%, wage level, price cap or subsidy on Food and Fuel, loans | I2 |
| The carrier's rules, reserves and budget; the season's deal | R1 |
| The season plan | R1 |
| Market day, quiet hours | I3 |
| Evening streets | R2 |
| Watch size and budget, gate rules | I3 |
| District policies | I4 |

## Reports and overlays

- **Balances** (one book, replacing Market, the stocks report, the Stores panel's lists and the Trade book's orders): one row for each family with its amount, variety (flavor icons, grayed when missing), price, what the carrier brought and took, and a year's history; a click opens the family's flavors and who makes them.
- **Purse**: budget by category, taxes and wages, loans.
- **Businesses**: every business and specialized building by trade, level and status in words.
- Overlays as built (flows, coverage, status, soil and stone, floodplain, traffic, zones), plus reach rings for specialized buildings and, from R2, the two inks (`17-presentation.md`).
- Deep for whoever wants it, invisible for whoever does not (P32).

## What R1 removes

- The 27 hand-placed production buildings and their chain rows in the Build picker (the Hearth's Apiary stays, as the way to place a hives business by hand); the generic `workshop` and `farmstead` become businesses with trades, and their art kits become the looks of those trades.
- Intermediate goods and the goods listed as gone above.
- The vegetable plot and herb garden as workplaces: they return as the Hearth's garden bed (`12-hearth.md`, the Pattern Book), and the town's vegetables come from market gardens on Farmland.
- Standing orders, goods for sale and the peddler's own rules.
- The yield registry's `decor` line (P1's five pieces that help the work stay as decor) and `calling` line (callings return in R3, earned: `15-progression.md`). P6 already says an unlock is never "+5%".

## Tuning targets and acceptance [R1]

Starting values for R1X's tuning; record what holds here.

- **Hands**: about a third of working residents in food (it was 40 to 55%), a sixth hauling and building, the rest in materials, workshops, shops and services. One field hand feeds about eight through the growing seasons, which is what a third of the hands needs to carry the town through a winter in which almost nothing grows *(tune)*. The carrier's load is small beside a big town's appetite (a City eats 2,000 Food a day and the road carries about 450), so a Town or City lives on what it makes and imports only fill gaps.
- **Decisions, not chores**: over 70 autoplayed days the Ledger takes under 150 actions, none of them a pause or an order.
- **Tiers move**: on every bench seed the first Craftsfolk household by day 40 and a third of households by day 70.
- **Nothing stalls**: the playability audit finds no business without its raw good for a whole day while its family's rule lets the carrier buy.
- **Winter has teeth**: a town with reserves under half the plan and the pass closed for two days has hungry or cold households and loses none of its buildings.
- **The lanes need each other** (`22-quality.md`, The lanes test).
