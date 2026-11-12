# 19. Evenings

By day goods move. From 17:00 folk move. This doc is where the two lanes meet (P2): the places the Hearth composes, the round residents make of them each evening, what they buy on the way, and what good evenings turn into over the seasons.

**Status**: accepted by the owner on 2026-11-10. R2 builds places, the round, evening trade, good evenings, evening streets and gaps; R3 builds supplies, masters and the Town Book (`30-roadmap.md`). It stands on the zones-first Ledger (`13-ledger.md`). Every number in this doc is a starting value *(tune)* unless it says "as built".

**Why** (measured 2026-11-10 with the autoplayer, 70 days, Village rank granted on day 19 in every run because the Charter's own Hearth goals would otherwise block it):

| Seed | Hearth lane played | Hearth lane off (no decor, wishes, patterns, nature, festivals or working together) |
|---|---|---|
| willow | 157 residents, 416 coins, mood 93 | 166 residents, 444 coins, mood 80 |
| hazel | 126 residents, 452 coins, mood 88 | 106 residents, 470 coins, mood 82 |

The town grew about the same without the Hearth. The reasons were in the rules: decor was free and charm was never spent; from Village rank mood no longer touched money; the one hard gate (charm 25 at the door for Craftsfolk) could be met with flowers by the door; requests had left the interface. Meanwhile the sim already walked every resident to a bench, well, tree or tavern chosen by charm, species, traits and friends (`systems/residents/outings.ts`), and nothing economic read it. This doc makes that walk the Hearth's economy.

## The loop

Goods make places come alive. Places make good evenings. Good evenings make friends, couples, bonds and, in time, masters. Masters and newcomers make the workforce and what it can make. That makes the goods.

**Volume is the Ledger's, variety is the Hearth's.** Land, streets, specialized buildings and trade decide how much there is. People and places decide what kinds there are and whether anyone enjoys them. Tiers ask for both (`13-ledger.md`, Population tiers).

## The day in two acts [R2]

- Work hours stay 08:00 to 17:00 (builders and porters until 19:00). The evening is 17:00 to 21:00, and on festival nights to 22:00.
- **The evening lingers** *(tune; a valley setting, on by default)*: from 17:00 to 21:00 the clock runs at half the chosen speed, as the night already runs three times as fast. An evening then lasts 160 seconds at 1x instead of 80, through golden hour and dusk, the best light the game has. A turn advances half its ticks, rounded down on odd turns and up on even ones.

## Places [R2]

A place is a spot where folk spend time. Places are derived, never built as such: the sim finds them hourly with the patterns pass and after a Hearth command nearby.

**Where places come from**

- Every standing pattern site (`12-hearth.md`, the Pattern Book).
- A sitting spot: any seat piece that belongs to no pattern site, together with the other such seats within 3 tiles of it, up to four seat pieces *(tune)*. So every bench is somewhere to go, and more benches in a row make more places, not one endless one.
- A porch: a home with a porch (the dressing ladder, or one fitted by hand) has 2 seats for its own household, with the street's charm as its draw. Sitting out front is a modest evening that grows with the town by itself.
- Hosts: the tavern, the Market Square and each stall, the well, the Bath House, the skating ice of a frozen river, a bonfire or brazier, and the festival site on its night. The brazier is a Village decor piece from R2 (room for 8 standing, warm), lit for nothing until R3 gives fires a supply, so winter evenings are possible from the start.

**What a place has**

- **Seats** from its pieces (`DecorDef.seats`): bench 2, curved bench 3, ring bench 4, a low wall segment 1, cafe table 4, arbor seat 2, lookout bench 2, swing and see-saw 2 children each, a festival's trestle table 6 *(all tune)*. Hosts: tavern 12, Bath House 8. **Standing room** where folk gather on their feet: a well 4, a stall 4, the ice 12, a fire 8. A walk (below) holds one stroller for every 2 tiles. Beyond its seats a place has standing room for half as many again (at least 2). A stop lasts about an hour, so over an evening a seat serves three or four residents: a town wants about one seat for every four grown-ups *(tune)*, and a level 2 shop with room at its door puts a table out by itself, so seats also grow with the town.
- **Kinds**, one or more: *sit*, *eat* (an outlet serves it), *view* (water within 3 tiles, or a lookout), *play* (a play piece), *meet* (a well, square, green or market), *walk* (a linear pattern: Lantern Walk, Promenade by the Water, Hedgerow Lane, Orchard Path, Bridge Crossing).
- **Shelter**: the tavern, the Bath House and the Market Hall are sheltered and warm. A place with a lit fire is warm.
- **What it serves**: the outlets with Treats in stock within 3 tiles (a shop door, a stall, the tavern).
- **Draw**, 0 to 100 *(tune)*: its charm (the average over its tiles, counted up to 70), plus 8 for a pattern site, 2 for each kind of piece in it (at most 8), 5 for water within 3 tiles, 5 after 18:00 when its lanterns are lit, 4 when it serves Treats. Charm is most of it on purpose: the flat parts alone never make a fine evening. In winter an open-air place with no fire and no ice draws 20 less.

A place is named for what stands there and the nearest family, as Chronicle places are ("the bench by the Underbank cottage"), and either seat may rename it.

## The round [R2]

- Between 17:00 and 17:30, at their own minute, every young and adult resident plans an evening of one to three stops (`chooseLeisure`, grown into a plan). Builders and porters plan at 19:00.
- **Choosing**: for each place within their leisure radius (12 tiles; Curious 18; Homebody 6) the score is its draw, plus their taste for it (species and traits as built, from minus 10 to plus 15), plus 8 when a friend is going, minus 0.35 a tile of distance (Manhattan, as `chooseLeisure` measures today, so no route is searched to choose), minus 20 for every seat's worth of crowd beyond its room, plus a little whim. A place that scores under 20 for them is not worth the walk: they stay in. The best is the first stop, but one resident in two (by id and day) takes their second best first, so a town does not all arrive at one bench at 17:00. A second and third follow while time allows, each the best place of a kind not yet visited within 8 tiles of the last.
- A stop lasts about an hour, as outings do. They set off for home at 21:00, as built.
- **Shopping comes first**: a resident whose pantry is low shops at the start of the evening, as built, and the shop or stall is the round's first stop; they go on to a place if time allows.
- **An evening at a friend's home** is a stop with a draw of 30 and no bonus for meeting the friend, so visiting is pleasant and still no substitute for somewhere to go: it cannot by itself reach the 50 a Craftsfolk household wants.
- **Seats** are taken on arrival, then the standing room (10 off the evening for standing). A place with neither left sends the latecomer on to their next choice, or home.
- **Routes**: the walk grid gains an evening cost, in whole numbers and never under a tile's ordinary cost (so the search stays as fast as it is): pleasant tiles (charm 40+, or an evening street) cost what they always do, plain tiles a quarter more and tiles with noise 3+ half more *(tune)*. Folk take the pleasant way when it is not much longer. The evening grid is fixed at 17:00 each day, so lanterns lighting and carts passing never throw away the evening's cached routes.
- **Weather** as built: in rain one resident in two skips open-air places; in a storm everyone stays in.
- Children play at play places and near home as built. Elders and residents without work also make a round in the afternoon, and their best outing of the day counts.
- The festival is the season's great round and keeps its own rules (`12-hearth.md`).

**Footfall**: every step a resident takes adds one to the tile's count for the day (`map.footfallDay`); steps on the way to a stop or between stops of a round count for the evening instead (`map.footfallEve`), and the walk home from work or to bed does not, so a street is busy of an evening only when it leads somewhere; both halve at 04:00, so each reads as about two days of walking. The `wear` layer keeps its own job (desire paths).

## Evening trade [R2]

Treats leave the 18:00 household pass and are bought on the round.

- **In a Hamlet** treats are free at the shelf, as food is (wages and prices begin at Village rank, `13-ledger.md`, Budget), so the round is learned before money moves. Everything below about paying holds from Village rank.
- **At a stop that serves Treats**, a resident whose household is still owed a unit that day (the basket's Treats line, accrued as built) buys the flavor they like best from the shelf, pays at the till and has it there, in hand and on the table for anyone to see. A comfortable household (savings above its mark, as built) buys one more.
- **Passing trade**: walking within a tile of an outlet with Treats, a resident still owed one stops and buys one time in five *(tune)*.
- **From the doorstep**: a household none of whose members bought on the round sends to the nearest shop in reach at 21:30 for a third of what it is owed (in hundredths, as the basket accrues), eaten at home without much ceremony. So a town with no places still sells some Treats and nothing dead-ends.
- Food, Fuel and Wares are bought by day as built (`13-ledger.md`, Households).
- Every sale counts toward the outlet's custom (business levels) and the place's line in the Hearth's book.

**Shops follow the walkers.** From R2 a Shops lot's desirability gains up to 30 for evening footfall at its frontage (full when a tenth of the town's grown-ups pass *(tune)*) and 10 for a place within 3 tiles. The Shops demand bar counts each place that drew 8+ visitors with nothing to sell them, beside the households no outlet reaches. A shop of level 2 or more whose door is within 2 tiles of two or more seats puts tables out and becomes a cafe: its tables join the place and it serves there. The Ledger zones shops along the Hearth's walks, or the Hearth builds places by the shops. P2's own example is now literal: merchants will not settle on a street nobody walks.

## Good evenings [R2]

- **An evening's score**, 0 to 100, for each resident: the draw of their best stop as they found it, plus 8 for meeting a friend there, 8 for a treat, 4 for a second kind of stop, less 10 for standing. Staying in scores 20, and 20 is every evening's floor, so going out is never worse than staying home. An evening lost to weather does not count.
- **The evenings need** takes the place of `beauty` in mood (weight 15) and of `social` for Craftsfolk. It starts at 50 for a newcomer, and at 21:00 it moves a third of the way to the evening's score. Charm round the door still feeds home desirability, arrivals and the dressing ladder as built, and no longer opens a tier by itself.
- **Tiers**: a household's grown-ups must average evenings of 50 for Craftsfolk, 65 for Merchants and 80 for Patrons, three days running *(tune)*. A flower by the door cannot do that; a place with a seat in reach can.
- **Friends** are made as built (2 points an hour outdoors at the same spot), so places make friendships and friendships make couples.
- **Bond**: a resident with four of a season's six evenings at 60 or more gains a heart *(tune)*, once a season, up to 5. Wishes still give hearts up to 3, festivals and long residence as built.
- **The evening's tally** (numbers, not a book): the share of grown-ups who went out, the average evening, each place's visitors, seats and takings, and the friendships made. It feeds the Hearth's strip, the place card and the evening edition (`17-presentation.md`).

## Evening streets [R2]

`road.setEvening { tiles, on }` marks road tiles for strolling. From 17:00 to 21:00 carts and porters' barrows treat them as closed and go round (one with no other way waits at the edge, and its shed or store says so), no cart noise falls on them, and walkers prefer them. Carters keep the porters' hours, to 19:00. The cost is real: a longer haul, and a stall or workshop on the stretch gets no delivery after 17:00. The gain is a calmer round. Both show in the two inks.

## Gaps: requests that write themselves [R2, R3]

P13's requests return without a form. A gap opens by rule, shows in both lenses (the left feed and a small paper tag on the ground), says in words what would close it, closes itself, and credits in the evening edition the seat that built the piece that closed it (once a place a season, so nothing is gained by pulling a stall down and putting it back). Gaps open from Village rank; a Hamlet has enough to learn.

| Gap | Opens when | Closes when | Reads like |
|---|---|---|---|
| A place with nothing to sell [R2] | 8+ visitors on two evenings running and no Treats within 3 tiles | an outlet serves there for two evenings | "The Promenade drew 14 folk and had nothing to sell them." |
| A shop nobody passes [R2] | Treats on its shelf and under 4 customers on three evenings running | a place within 3 tiles draws 8+ | "The Underbank shop sold two ciders in three evenings: nobody walks this way." |
| Nowhere to go [R2] | 6+ households stayed in three evenings running for want of a place in reach | half of them go out | "Mill Lane stays in of an evening." |
| A place short of supplies [R3] | its pieces rested two nights running | supplied for two nights | "The Lantern Walk wants 6 candles a night; the town makes 2." |

The `request.*` commands stay for free-text asks, without the ask form. Closed gaps count where fulfilled requests did (Together goals, Odette's arc).

## Supplies: places come alive [R3]

Some pieces draw on the town's goods to be at their best, from Village rank on (a Hamlet's lanterns light for nothing). Homes are served first, then businesses, then places: a place draws only on what the town holds above its reserves and winter marks, and the carrier never buys for places unless the Ledger turns that on for the family (`carrier.setRule`). So a fire never takes a home's firewood, and the Balances book shows what places draw each night. A piece without its supply **rests**: it stays where it is, costs nothing and loses only what the table says. Nothing breaks and nothing is taken away (P5).

| Piece | Draws on | How much | Resting |
|---|---|---|---|
| Lantern, hanging lantern, lamp post | candles (the Old Age's "oil lanterns" burn the chandler's candles) | 1 a night for every 4 | unlit: its day charm only, no night draw, no deterrence |
| Bonfire, brazier | firewood | 1 on an evening someone comes, autumn to the thaw | cold: the place is not warm |
| Cafe table, trestle table | the outlet beside it | its Treats | bare: seats only |
| Bunting, flower arch, maypole, festival stage | cloth | 2 when put up, once a season | faded: half its charm |
| Bandstand | a musician's evening | 2 coins | silent |
| Fountain, birdbath | a well within 8 tiles | nothing | dry: half its charm |

- **The lamplighter**: one job at the Town Hall for every 40 lanterns. At 17:30 he takes the night's candles from the nearest storehouse and walks the lanterns, the places marked first before the rest, nearest first. Which lanterns get a candle is settled at 17:30 from stock and priority, and for the rules (charm, draw, raiders) those count as lit from 18:00 sharp, so a raid at dusk never finds a town half lit. The walk is what the players see: each lamp comes on as he reaches it. Lanterns go out by themselves at 07:00.
- **Windows**: every occupied home keeps the glow it has today (a share of its windows, by the hour). A home with a candle lights all of them until bedtime, with the lamplit rooms behind (`17-presentation.md`); one candle lasts a home five nights *(tune)*, bought within its Wares. So a well supplied street is visibly brighter, a town short of candles dims home by home, and both players can see why. No home ever goes dark.
- **Which places first**: `place.setPriority` (keep first, as it comes, let it rest). This is the Hearth's own small economy: what to keep alive tonight.
- The chandler's candles come from honey, and hives want flowers (`12-hearth.md`, Nature): a loop through both lanes.

## Masters [R3]

- **Becoming one**: a young or adult resident with 4 or more hearts and 20 working days in one trade (apprentice days count double), in a business of level 2 or more or at a specialized building *(tune)*. One new master a trade a season. A sign over the door, a Chronicle line and a letter.
- **What a master brings**:
  - their business may reach level 3 (`13-ledger.md`, Levels);
  - a **master's good**, made from the same raw good in the same building and sold like any flavor. Nine in R3 *(content, tune)*: the baker's pies, the dairy's butter, the orchard's jam, the cider maker's cordial, the beekeeper's mead, the weaver's coats, the carpenter's toys, the chandler's soap, and the Fishery's smoked fish;
  - apprentices: a young resident who serves a season under a master becomes one after 10 working days of their own, so a trade spreads.
- Masters of the other trades and buildings bring something that is not a good *(content)*: the quarryman's carved stone and the forester's ornamental trees are pieces for the Hearth; the miller makes room for one more baker; the grain farmer, the gardener, the shepherd and the shopkeeper let their business reach level 3 and train apprentices.
- **Losing one**: when a master's household leaves the valley, or the master retires, the business keeps its level for six days and then slides, and the master's good stops when the trade has no master left. So the Ledger has reason to care about Hazel by name, and to ask the Hearth to look after her.
- Story characters are masters by their arcs (`11-residents.md`).

## The Town Book: specialties and customs [R3]

A shared book in both lenses, kept like the Pattern Book: found pages, and hints for three not yet found.

- **A specialty** is a flavor the town is known for at one place: sold there to 10+ customers on four evenings of a season *(tune)*, it gets a name and a page ("Orchard Walk Cider": cider at an Orchard Path). About 20 pairs of pattern and good in R3 *(content)*. A specialty counts as one more flavor for households whose round passes the place, sells to neighbors at their full price, can go on a festival menu as a dish of its own, and adds 5 to the place's draw.
- **A custom** is a habit the town falls into: the same place drawing 20+ folk on the same day of three seasons running, or a supply kept every night of a season ("the Lantern Round"). On its day the place draws 15 more, and a custom can be a festival's twist.
- **Credit** goes to both seats when the place and the trade's zone or specialized building were laid by different seats ("Made Together"). A page is worth 2 renown, as a pattern is.
- **Callings are earned here**: each page leans to industry, gardens or pilgrimage, and three pages of one leaning earn the town that calling (`15-progression.md`).

## Data and budgets

- **A place has a stable id**: its pattern and anchor tile for a pattern site, the lowest id among its seat pieces for a sitting spot, the building's id for a host.
- **Saved**: `map.footfallDay` and `map.footfallEve` (16 bits a tile), the `evening` flag on road tiles, each resident's evenings need and last score, working days by trade (`craft`, kept across winters and changes of work) and the master flag, lantern lit bits, Town Book pages, open gaps, and for each place by id its name, its priority and the counts that rules read over time (visitors and takings for the last six evenings, the running counts behind gaps, specialties and customs). From R3 also the door-pair counts behind Follow the thread. **Derived** and rebuilt on load and each hour: a place's seats, kinds, draw and what it serves. A seat joining from a snapshot therefore sees exactly what its partner sees.
- **Budgets** (`22-quality.md`): the place pass under 1 ms an hour at Village scale and 3 ms at City scale; planning the round under 0.4 ms a tick for 2,000 residents, spread over the half hour from 17:00; footfall adds nothing measurable to a step. All of it is deterministic sim code and hashes with the rest.

## Acceptance

**R2**

- On a fair evening in an autoplayed Village, every grown-up with a place in reach goes out; places fill to their room and no further; a town with no places stays in and its Craftsfolk never come.
- Once three places stand, four fifths of Treats are sold on the round.
- Each R2 gap opens and closes in the bench, and closing one credits the right seat.
- The first Craftsfolk household by day 40 holds with evenings of 50 in place of charm 25.
- Carts route round an evening street and arrive within twice their free-flow time; a cart with no other way waits out the evening and delivers after 21:00; none deadlocks.
- The lanes test passes (`22-quality.md`). Budgets hold; a year hashes the same in Node and a browser worker.

**R3**

- A lantern round lights along the lamplighter's walk. With candles for half the lanterns, the places marked first are lit and the rest rest; nothing breaks.
- The first master in the first Village year on every bench seed; a master's good reaches a shelf; a departed master's good stops.
- Six Town Book pages can be found by the autoplayer's two seats and one calling is earned.
- No wish, twist, gap or page is offered that the town cannot meet (the achievable check, `22-quality.md`).
