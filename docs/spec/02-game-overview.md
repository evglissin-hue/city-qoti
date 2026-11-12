# 02. Game overview

## Vision

City Qoti is a cozy town builder for two players on two laptops, played in the browser. Together they grow a hamlet in a storybook river valley into a lively little city over many evenings. Two equally deep lanes (Hearth and Ledger) need each other (P1, P2), there are real stakes but no game over (P3), and a light defense layer tests the town a few times a year (P35).

**The redesign (owner, 2026-11-10)**, in one paragraph: the Ledger zones land and the town builds itself, with a few specialized buildings to site and five balances to read in place of thirty chains (`13-ledger.md`); the Hearth composes places, and the round residents make of them each evening is where treats are sold, friends are made and masters grow (`19-evenings.md`); the look gets a second pass for light, green and detail, and the interface shows each player what the other's work did (`17-presentation.md`). It is built as R1 to R3 and V2 to V4 (`30-roadmap.md`), on fresh valleys.

## Players and lanes

- Two seats per valley with equal rights (P7). Each seat has a default lens but can use every tool (P8).
- **Hearth**: residents and wishes, decorating and customizing, Charm, the Pattern Book, festivals, nature and the Field Guide, the Chronicle, district styles. From the redesign: places and the evening round [R2], supplies, masters and the Town Book [R3]. The Hearth owns variety: what kinds of good things the town has, and whether anyone enjoys them.
- **Ledger**: roads, production, construction, logistics, zoning, market and prices, trade, budget, tiers, policies, defenses and the Watch. From the redesign [R1]: zones, specialized buildings, streets, the five balances, the carrier, the season plan. The Ledger owns volume: how much there is, and how it gets about.
- **Shared**: inspect, erase, notes, plans, requests, the Charter board, time controls. From the redesign: gaps and the evening edition [R2], the Town Book [R3].

## Loops

**Hearth, minute to minute.** Read wishes and moods, shape a spot (benches, trees, lanterns, gardens, paint), watch residents react, discover a pattern, unlock new pieces.

**Ledger, minute to minute.** Read overlays and reports (shortages, idle buildings, prices), lay roads, place production and storage, tune levers, watch porters and carts settle into flows, see the budget move.

**From the redesign.** *Hearth*: read wishes, gaps and last night's evenings; compose a place (a few seats, a tree, light, something to look at) or a walk between two; watch who comes at dusk and what they do; mark which places to keep lit. *Ledger*: read the four demand bars and the five balances; zone a street, site a specialized building, lay or close a street; set the season's reserve and deal; watch the town build itself and the carts settle. *The day* is two acts: work until 17:00, then the round until 21:00, in the day's best light.

**Session, about one season (P38).** The season card opens with Charter steps, the festival date, the forecast and any telegraphed threat. Both lanes work and trade requests. The season ends with a festival, a two-page season report (Hearth page, Ledger page; from R2 one joint spread, with what each lane did for the other first) and a Chronicle entry.

**Long arc.** Hamlet → Village → Town → Market Town → City through Charters and trials (P40). The valley opens parcel by parcel (P43). Later, new valleys.

## Time and calendar

| Constant | Value |
|---|---|
| Sim ticks per real second at 1x | 10 |
| Speeds | paused, 1x, 2x, 3x |
| Ticks per in-game hour | 200 (20 s at 1x) |
| Ticks per day | 4,800 (8 min at 1x) |
| Days per season | 6 (48 min at 1x) |
| Seasons | Spring, Summer, Autumn, Winter |
| Year | 24 days (about 3 h 12 min at 1x) |
| Day phases | night 21:00 to 05:00, dawn 05:00 to 07:00, day 07:00 to 18:00, dusk 18:00 to 21:00 |
| Work hours | 08:00 to 17:00; builders and porters until 19:00 (playtest round five) |
| Night | 22:00 to 06:00 runs three times as fast at any speed (playtest round five) |
| The evening [R2] | 17:00 to 21:00 runs at half the chosen speed (a valley setting, on by default; `19-evenings.md`). With the fast night a day at 1x takes about six minutes of real time today, and about seven and a half once the evening lingers |
| Festival | day 6 of each season, 18:00 to 22:00 [I3] |
| Calendar start | Year 1, Spring, day 1, 06:00 |

All constants live in `packages/sim/src/constants.ts`.

## Scale targets

| Rank | Residents | Buildings | Map in use |
|---|---|---|---|
| Hamlet | up to 40 | 20 to 40 | starting parcel |
| Village | 40 to 150 | 60 to 150 | 2 to 4 parcels |
| Town | 150 to 450 | 150 to 350 | 4 to 7 parcels |
| Market Town | 450 to 1,000 | 350 to 700 | 7 to 11 parcels |
| City | 1,000 to 2,000 (soft cap) | 700 to 1,200 | most of the valley |

Map: 192 x 192 tiles, 1 tile = 4 m. Decor cap 6,000 items. Forest up to about 15,000 tree tiles. Every resident is simulated individually (P15).

## New valley

- **Sandbox valley** (I0, kept later as a creative mode): empty generated valley, no costs, instant building, no residents.
- **Standard valley** [I1]: Town Hall near the river crossing, a Storehouse (logs 40, planks 50, stone 30, bread 16, vegetables 16, fish 8; C3X tuning; P1 tried stone 40 and went back, see `13-ledger.md`), two Cottages, a Well and a path to the valley road. Treasury 500 coins. The Town Hall employs up to 4 builders (the first two filled by the first residents, the other two by spare hands) until a Builder's Yard exists. Two households (8 residents) arrive at 08:00 on Spring day 1.
- **Standard valley from R1** (the zones-first Ledger; every valley is new, `21-networking-and-saves.md`, The fresh start): Town Hall near the river crossing, a Storehouse (timber 60, stone 30), a Granary (grain 24, vegetables 20, fish 12; R1X raised it from 20, 16 and 8 so the founders eat until the first farm is at work), two Cottages, a Well and a path to the valley road *(tune)*. Treasury 500 coins. Homes, Workshops and Farmland can be zoned from the first minute; the Forester's Lodge, Quarry, Fishery, Windmill, Granary, Storehouse and Market Stall can be placed; the peddler is the carrier (`13-ledger.md`).
- At creation the players name the town; the valley gets a generated name (for example "Willowmere"). *As built (P1)*: from its seed (`valleyNameFor`), when nobody types one; before P1 every valley was called Riverbend. Settings shows the seed, so a friend can found the very same valley, and a fresh seed is offered on the title screen.
- **The first days guide** [I3, C5H]: a standard valley made with "Show the founding guide" ticked (the default) gets letters from Tobias Merriweather, the County surveyor, one step at a time: a workplace on a lane that runs to the valley gate (the valley road already reaches the start, so the step asks for the next stretch), four homes, a wish granted, a plot or fisher worked with two days of food in store, a woodcutter and a sawpit making planks, the first Pattern Book page, a day whose takings beat its running costs (building is an investment and left out), and a plan approved or a request filled (skipped in a valley only one seat ever joined). Each step names its lane; a goal met early ticks when its turn comes, one step an hour. A card in the corner shows the open step; soft inked arrows point at the tool, book, overlay or place, gone once it is in hand or open. Each seat can hide it (the first letter's "Skip the guide", or Settings); progress is shared. It ends after the last step with a Chronicle line and a farewell that hands over to Pippa Quill (or says she is already here), or quietly on day 6. It never pays coins or goods. *From R1* the letters are rewritten for the new first days: a lane to the valley gate; homes zoned along it and the first two built; farmland zoned on good soil; a Forester's Lodge by the woods; a wish granted; a fishery or a farmstead at work and three days of Food in store; the first workshop the town opened by itself; the first Pattern Book page; a day in the black; a plan approved or a gap closed [R2].
  *As built (R1D)*: ten letters in that order. The goals: a workplace's door on a road to the gate; two homes built on lots (`guideHomes`); nine Farmland tiles on rich soil (`guideFarmland`, fertility 40 or more); a Forester's Lodge built; a wish granted; a fishery or a farmstead business with a worker and three days of Food in town; a workshop business grown on a lot; the first Pattern Book page; a day in the black; a plan approved or a request filled. Every goal is checked statically against what a Hamlet can do (`p1/every-goal-is-achievable`).

## Glossary

| Term | Meaning |
|---|---|
| Valley | One game world: map, town and history, shared by the seats. |
| Seat | A player slot (seat 0, seat 1) joined by a private link. |
| Lens | A seat's current UI mode, Hearth or Ledger. |
| Tile, level | 4 m grid cell; 2 m height step. |
| Parcel | A region of the map that unlocks as a unit. |
| Tick, turn | Sim step (100 ms at 1x); network step (100 ms real time) that carries commands and advances `speed` ticks. |
| Household | Residents sharing a home, pantry and savings. |
| Tier | Settlers, Craftsfolk, Merchants, Patrons. |
| Charm | Per-tile pleasantness score, 0 to 100. |
| Pattern | A recognized arrangement of pieces that makes a good place; recorded in the Pattern Book. |
| Wish | A resident's specific request with a target condition. |
| Bond | A resident's attachment to the town, 0 to 5 hearts. |
| Chronicle | The town's written history. |
| Charter, rank, trial | Goals for the next rank; Hamlet to City; the test that closes a Charter. |
| Renown | The town's reputation: tourism, trade terms, notable arrivals. |
| The Watch | The volunteer town guard. |
| Threat, raid, telegraph | Something that tests the town; its attack; its advance warning. |
| Innovation | A technology unlocked by conditions in the town. |
| Contract, commission | A seasonal trade agreement with volume and price; an optional request with a reward. |
| District, style | A named area with policies; its architectural look. |
| Plan, note, request | Co-op tools: ghost proposals, pinned messages, tracked asks. |
| Family, flavor [R1] | One of five kinds of goods (Food, Fuel, Materials, Wares, Treats); a good seen from the household's side (bread is a flavor of Food). |
| Amount, variety [R1] | Days of cover of a family; how many of its flavors are on offer. |
| Raw, made [R1] | A good from land; a good a workshop makes from raw goods only. |
| Specialized building [R1] | A hand-placed building tied to the ground (mill, quarry, granary), with a reach and a capacity. |
| Business, trade, keeper, level [R1] | What grows on a zoned lot; what it makes; the resident who keeps it; its size, 1 to 3. |
| Demand bar [R1] | How much the town wants more Homes, Shops, Workshops or Farmland. |
| The carrier [R1] | The daily cart (and boat) that imports shortfalls and sells surplus by rule. |
| Deal, the pass [R1] | A neighbor's terms for a season; the valley road, which snow closes on some winter days. |
| Season plan [R1] | The Ledger's answers on the season card: the winter reserve, a deal, where to build first. |
| Place, seats, draw [R2] | A spot where folk spend time; its room; how much they want to be there. |
| The round, footfall [R2] | A resident's evening of one to three places; steps counted on each tile. |
| Good evening, the evenings need [R2] | An evening's score; the need it feeds, which tiers ask for. |
| Gap [R2] | A request the town writes itself when one lane's work waits on the other's. |
| Evening street, the two inks, the evening edition [R2] | A street closed to carts from 17:00 to 21:00; the overlay of goods routes (ochre) and evening footfall (sage); the day's short page for both seats at 21:00. |
| The endpaper map [V3] | The valley as its own inked map, shown at the far end of the zoom. |
| Supplies, resting [R3] | Goods a piece draws on to be at its best; how it stands without them. |
| Master, master's good [R3] | A resident who has mastered a trade; the flavor only they make. |
| Thread [R3] | An inspector's sentence, with its route on the ground, of where a thing came from and where it goes. |
| The Town Book, specialty, custom [R3] | The shared book of what the town is known for; a flavor named for a place; a habit the town keeps. |
