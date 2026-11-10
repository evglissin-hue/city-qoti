# 15. Progression

Every unlock changes how you play (P6). Progress comes from Charters and trials (P40), innovations (P41), achievements (P42) and new land (P43).

**The redesign (owner, 2026-11-10)**: ranks ask for amount, variety and good evenings instead of named goods; a rank adds decisions and never a chain (`13-ledger.md`, The five rules); masters and the Town Book are two new, slow kinds of progress that need both lanes (`19-evenings.md`); callings are earned. The tables below carry [R1] to [R3] notes where a goal or unlock changes.

## Ranks and Charters

The Charter board at the Town Hall lists the goals for the next rank, each tagged with a lane icon, with progress visible to both seats.

| Next rank | From | Charter goals | Trial | Unlocks on reaching it |
|---|---|---|---|---|
| Village | I2 | 30 residents; 3 patterns discovered; 5 wishes granted; 5 days of food in stock; a season ended in surplus | from I3: the first winter (everyone warm) | zoning, market prices, Craftsfolk, school, tavern, herbalist, carts, streets, Trading Post, loans, 6 new patterns |
| Town | I4 | 120 residents including 40 Craftsfolk; 8 patterns; a 3-star festival; 6 goods at the market; a Watch of 6+ | a bandit gang raid (Medium) | Merchants, districts and styles, contracts, River Dock, canals, clinic, stone walls, watchtowers |
| Market Town | I5 | 400 residents including 80 Merchants; 15 patterns; a 4-star festival; 20 Field Guide species; a weekly market with 10 goods; 2 seasons in surplus | a great flood or the Bandit Chief | Patrons, library, theater, tram, gas lamps, glassworks |
| City | I5 | 900 residents including 100 Patrons; 25 patterns; a 5-star festival; 3 contracts kept; renown 4 | the Long Winter (two cold snaps) | city hall, railway, grand landmarks, new valleys |

**From the redesign** (each row replaces the matching words above when its iteration lands):

| Next rank | Goals that change | Unlocks that change |
|---|---|---|
| Village | [R1] "5 days of food" reads 5 days of Food with 3 flavors; the trial is unchanged, and the season plan's reserve bar is how to prepare for it. [R2] Add: half the grown-ups out on three fair evenings | [R1] Homes, Workshops and Farmland zones are open from founding, so the Village opens the Shops and Townhouses zones, Craftsfolk, prices and wages, the Sawmill, the Brickworks, the Market Square, the Trading Post and the carrier's Wares and Treats (its default rule turns to Always), the school, tavern and herbalist, carts, streets, loans and the 6 patterns |
| Town | [R1] "6 goods at the market" reads Food of 5 flavors and Wares of 2 on the shelves. [R3] Add: a master in the town and 2 pages in the Town Book | Merchants, districts and their policies, contracts, canals, the clinic, stone walls. No new goods to wire: tea and the like come by trade |
| Market Town | [R1] "a weekly market with 10 goods" reads a market day with every base flavor on the stalls. [R3] Add: 4 masters and 6 pages | Patrons, the library and theater, the tram, gas lamps, the glassworks as a specialized building |
| City | [R3] Add: a calling earned | as planned |

**Eras** [I4]: sealing the Town Charter opens the Age of Steam and sealing the City Charter the Bright Age (`18-eras.md`), each with its own moment, look and systems in both lanes.

**The rank-up moment (I2, C4D)**: when the last goal is met, the County Clerk writes to both seats that the claim is open. Claiming at the Town Hall (`charter.claim`) puts the proclamation in the Chronicle, credited to the seats present, gives every resident a mood lift for two days and a hop for an hour, and sends `rank.up` with the proclamation for the UI's celebration (C4F). No trial in I2.

**The end of the Village chapter** [P1, the owner's playtest: "the end of the game needs work"]: there is no Town Charter yet, so the Village chapter ends when the First Winter is weathered. Each seat then sees, once, "The Village chapter" card: the story so far (founding, residents and households, homes, festivals held and the best stars, species, patterns, plaques, wishes, renown, a Chronicle headline), what is still open (renown to the next level, plaques, the Field Guide, commissions) with one honest line that the Town Charter comes in a later update, and an invitation to found a new valley, whose land will be new. It can be read again from the Charter board and the goal pill ("Village chapter complete"). The First Winter has a plaque of its own, as the County letter promised (`the-first-winter`), and the Build picker no longer teases buildings for a rank no Charter leads to yet.

*As built (C5A), trials*: the claim grants the rank as in I2; the trials system (00:08) then opens the Charter's trial for the next time its season comes round (a letter), runs it through that season measuring each day, and judges it the morning after. The Village's first winter is weathered when no household went a whole day without firewood and the larder (food, wheat and flour; from R1, Food) never ran dry; weathered seals the Charter (a County letter, a Chronicle page, 3 renown), failed returns next winter and takes nothing. Kinds are rows in `TRIAL_KINDS` (winter now; raid and flood later). The Barometer needs a Watch House and a bell tower, the Seed Drill three farms and a smithy (both from Village rank).

**Trials**: completing a Charter's goals announces the trial for day 5 of the next season, so there is an evening to prepare and one tense dusk to see it through. The rank is granted when the trial is weathered: the town keeps at least half of its food stock, or the raid is repelled, or everyone stays warm. A failed trial returns the next season; nothing else is lost beyond the trial's own damage.

## Renown [I3]

Points from festivals, repelled raids, discovered patterns, kept contracts, royal visits and story finales. Levels 0 to 5. Effects: more and better arrivals, better trade terms (+2% per level), visitors and tourism coins [I4], notable visitors (commissions).

*As built (C5B)*: levels at 0, 8, 25, 50, 90 and 150 points (Unknown, Spoken Of, Well Regarded, Admired, Celebrated, Storied). Sources: a festival 1 to 9 by stars, a newly discovered pattern 2, a story finale 5 (the three I2 finales carry `renown`), a commission 2 to 5, the sealed Charter's trial (C5A), repelled raids and send-offs (C5D's calls). Each change sends `renown.updated`; a new level writes a `renown-level` Chronicle line and a letter. Effects by level (`RenownDef.effects`): `trade` 2% a level better on the Trading Post's and the River Dock's prices (sell higher, buy lower), `arrivals` +5% a level on the town's pull, `visitors` notable visitors' commissions open at once (one from level 2, two from level 4). The River Dock needs renown 1 (`BuildingDef.requires.renown`).

## Innovations [I2]

Technology arrives through conditions in the town, shown as progress bars in the inventor's notebook (P41). Each innovation adds a production method, building or capability.

| Innovation | From | Condition | Unlocks |
|---|---|---|---|
| Wheelbarrows | I2 | a storehouse whose porters were 80%+ busy for 3 days | porters carry 8 |
| Carts | I2 | Village rank and 20+ planks per day | Cart Shed |
| Cobbles | I2 | quarry output 20+ per day | streets |
| Brick Kiln | I2 | a clay pit worked for 2 days | bricks |
| Water Wheel | I2 | a sawpit within 3 tiles of the river and Pippa Quill's step 2 | water-powered sawmill (+80% output, noise) |

[R1] Innovations keep their conditions in the new names and open specialized buildings and capabilities, never a percentage (`13-ledger.md`, Land and specialized buildings). Wheelbarrows raise a porter's load to 8. Carts open the Cart Shed. Cobbles let streets be laid. The Brick Kiln (a quarry worked for 2 days) opens the Brickworks. The Water Wheel (a Forester's Lodge within 12 tiles of the river that has worked three days; Pippa Quill's step 2 brings it at once) opens the Sawmill, which lets carpenters set up. No innovation that opens a specialized building waits on a story step alone. The Seed Drill (three grain farms and a windmill) lets a cut field be sown again the same day inside the sowing window, in place of "+20% wheat". Later rows open specialized buildings the same way (the Printing Press, the Glassworks on a sand deposit, Gas Lamps as a lamp of the Age of Steam that needs no candles, where the table says "without oil"). Where the rows above name a smithy or a paper mill, I4's planning names what stands in for them.


*As built (C4C)*: hourly at offset 170 each innovation whose rank is reached updates its measure and bar (`innovation.updated` when it moves) and unlocks when its condition holds, with a notice. Brick Kiln counts days a clay pit dug clay (Hamlet rank, so the kiln is ready for the Village); Cobbles and Carts read yesterday's stone and planks; Wheelbarrows samples the busiest storehouse's share of porters out on trips each work hour and needs an average of 80% for three days in a row, from Village rank (a Hamlet's two porters are always busy, and I1 stays as tuned); Water Wheel is half for a sawpit within 3 tiles of water and half for the story step (`storyStep` arc 0, C4D's first arc). It unlocks the Water Sawmill.
| Barometer | I3 | Watch House and Town Hall upgrade | 2-day forecasts |
| Seed Drill | I3 | 3 farms and a smithy | +20% wheat |
| Printing Press | I4 | library and paper mill | newspaper: +bond, +renown |
| Glassworks | I4 | sand deposit and brick kiln | glass, greenhouses, bigger windows (charm) |
| Gas Lamps | I5 | coal and Market Town | lantern lines without oil |
| Tram | I5 | Market Town, 600 residents, 100 street tiles | tram line |
| Railway | I5 | City | station and a line to the neighbors |

## Achievements [I1]

Feats and stories, never "build 100 roads" (P42). Data-driven conditions, checked hourly (C3B: offset 150, after the patterns pass; credit goes to the seats behind the underlying event, such as the seat credited with a discovery or both seats for Built Together, else to the seats connected at the time). Rewards are cosmetics and options (a plaque, a decor piece, a title, a style), never raw power. Shared achievements hang as plaques in the Town Hall; each seat also keeps a personal journal of the feats it was credited with.

| Achievement | From | Condition |
|---|---|---|
| First Footsteps | I1 | the first household arrives |
| Every Door a Name | I1 | 20 residents |
| Hearth and Home | I1 | the first pattern discovered |
| Well Met | I1 | Well Gathering Place discovered |
| Bread on the Table | I1 | the first bread baked |
| Plank by Plank | I1 | the first planks sawn |
| Wishes Granted | I1 | 5 wishes granted |
| Balanced Books | I1 | a season ended with more income than expenses |
| Built Together | I1 | a pattern site containing pieces placed by both seats |
| The Long Walk Home | I1 | Lantern Walk discovered |
| Everyone Has a Friend | I2 | every resident has a friend at level 2+ |
| Market Day | I2 | 6 goods in stock at the market at once |
| A Village Now | I2 | reach Village |
| The Price Is Right | I2 | no food above 1.5x base for a whole season |
| Desire Lines | I2 | turn 3 desire paths into real paths |
| The Gate Held | I3 | a raid repelled with nothing stolen |
| Warm Hearths | I3 | a winter where nobody was cold |
| Five Stars | I3 | a 5-star festival |
| The River Runs Clean | I3 | a kingfisher sighted |
| Field Notes | I3 | 10 Field Guide species |
| A Winter Without Imports | I4 | a winter with no imports and no shortages |
| The 15-Minute Town | I4 | every home within 15 walking minutes of food, work and a green |
| Contract Kept | I4 | 5 contracts fulfilled |
| Reformed | I4 | a former bandit reaches bond 5 |
| Old Friends | I4 | two residents friends at level 5 for 2 years |
| City of Lanterns | I5 | 200 lit lantern tiles and a Lantern Walk in every district |
| Pattern Master | I5 | 40 patterns discovered |

Target: about 60 achievements by I5.

[R1] Reworded with the goods: Plank by Plank is the first timber cut; Market Day is every base flavor of Food on the stalls at once. A Winter Without Imports moves to R1, when the carrier arrives (a winter in which it brought no Food or Fuel and nobody went short). New feats *(content)*:

| Achievement | From | Condition |
|---|---|---|
| A Town That Builds Itself | R1 | ten businesses standing that nobody placed by hand |
| Porridge No More | R1 | every household has three flavors of Food in reach |
| Out of an Evening | R2 | every grown-up in town went out on one fair evening |
| A Seat for Everyone | R2 | no resident stood for want of a seat for a whole season |
| Mind the Gap | R2 | ten gaps closed, at least three by each seat |
| The Lamplighter's Round | R3 | every lantern lit every night of a season |
| Master of the House | R3 | the first master |
| Made Together | R3 | a Town Book page that needed both seats |

## Callings: what the village is known for [P1 slice, earned from R3]

**From the redesign** (owner, 2026-11-10): a calling is earned, not picked from a card. From R1 a fresh valley no longer offers the Calling card and the Mill Town yield line goes (P6). From R3 each page of the Town Book leans to industry, gardens or pilgrimage, and three pages of one leaning earn the town that calling: its name on the Charter board, the district style lean and the signature piece below. Garden Village's day visitors and Pilgrims' Rest's festival draw stay as built; Mill Town's yield line is replaced by room for one more workshop in the reach of each mill *(tune)*, so no calling is a percentage. A town may earn more than one. The land still shapes it, because what the valley offers decides which trades and places it can pair. The idea from playtest round three that the players choose what the town believes fits here later: from Town rank, a motto chosen among the customs the town has earned (not scheduled). What follows is the P1 slice as built, for the record and for its content.

The owner's playtest (2026-11-08): development paths that follow the map and the place, an industrious village or a pretty one for visitors or pilgrims, with the chosen path shaping how the village looks as it grows.

- **When**: once the Village Charter is claimed, the County writes to ask what the village means to be known for. Until it is chosen the goal pill says so. In a valley for two the choice is made with both seats present; a solo valley chooses alone.
- **What is offered**: the valley offers the two callings its land suits best, scored once from the map at the moment of asking and shown with the reasons, so two valleys rarely offer the same pair.
  - **Mill Town** (industry): stone and clay in open land, a long reach of river.
  - **Garden Village** (visitors): meadow, rich soil, ponds and water's edge.
  - **Pilgrims' Rest** (pilgrimage): high ground and a summit, the quiet far from the valley gate, old woods.
- **What it does** (first slice, kept modest):
  - **Mill Town**: workshops, mills and the quarry work 10% faster (a yield modifier line), and grown districts lean to Market Brick and Hill Stone.
  - **Garden Village**: day visitors spend in the town each afternoon in proportion to its charm and renown (booked as visitors), homes dress themselves up sooner, and districts lean to Garden Plaster.
  - **Pilgrims' Rest**: festivals draw more guests and one more renown, lanterns count for more charm, and districts lean to Hill Stone and Riverside Timber.
  - Each calling unlocks one signature decor piece.
- **Later (I4)**: a second choice at the Town Charter that deepens or changes the calling, district policies by calling, tourism and pilgrim buildings (the inn, the chapel, the guest house), and callings that give each valley's Old Town its character (`18-eras.md`).
- *As built (P1)*: content `callings.ts` (ids `mill-town`, `garden-village`, `pilgrims-rest`). At the Village claim the map is scored once with integer math (deposits and clay; meadow, rich soil and water's edge; high ground, forest and the summit's distance from the gate; the valley's height range and river length turned out the same on every seed, so they do not score) and the best two, ties by id, are stored with a reason each in words (`WorldState.calling`, save version 5; a Village from before P1 is offered its two when it loads). Forty seeds gave three different pairs. `calling.choose` (both seats present in a valley two have played) sets it once, writes a County letter and a Chronicle page and unlocks the signature piece (millstone bench, rose arch, wayside shrine). Mill Town is the `calling` line of the yield registry (+10%); Garden Village's visitors spend at 15:00, about 6 coins a day for a young village, booked as visitors; Pilgrims' Rest raises festival turnout by a fifth, gives a festival of 2 stars or more one more renown, and lit lanterns +1 light; the style weights shift the lots that pick their style from the land (one in five, and lots with no neighbors), so districts turn slowly. The goal pill and the Charter board lead to the Calling card until it is chosen.

## Expansion [I4]

- 16 parcels (see `10-world-and-building.md`). Each has an unlock rule in content: rank, a coin price (Ledger), a bridge built to it, or a feature to clear.
- Clearing a bandit camp or wolf den: send a Watch expedition once strength meets the requirement. It takes a day and resolves like a raid in reverse; on failure members return shaken and you may try again.
- New parcels reveal new resources and attract new species or story characters.

## New valleys [I5]

- After City, start a new valley (coast, highlands, lakes) with its own resources and styles. The first town becomes a neighbor: its last state sets what it sells and buys.
- Achievements and the personal journals carry over; the Pattern Book gains valley-specific patterns.
