# 02. Game overview

## Vision

City Qoti is a cozy town builder for two players on two laptops, played in the browser. Together they grow a hamlet in a storybook river valley into a lively little city over many evenings. Two equally deep lanes (Hearth and Ledger) need each other (P1, P2), there are real stakes but no game over (P3), and a light defense layer tests the town a few times a year (P35).

## Players and lanes

- Two seats per valley with equal rights (P7). Each seat has a default lens but can use every tool (P8).
- **Hearth**: residents and wishes, decorating and customizing, Charm, the Pattern Book, festivals, nature and the Field Guide, the Chronicle, district styles.
- **Ledger**: roads, production, construction, logistics, zoning, market and prices, trade, budget, tiers, policies, defenses and the Watch.
- **Shared**: inspect, erase, notes, plans, requests, the Charter board, time controls.

## Loops

**Hearth, minute to minute.** Read wishes and moods, shape a spot (benches, trees, lanterns, gardens, paint), watch residents react, discover a pattern, unlock new pieces.

**Ledger, minute to minute.** Read overlays and reports (shortages, idle buildings, prices), lay roads, place production and storage, tune levers, watch porters and carts settle into flows, see the budget move.

**Session, about one season (P38).** The season card opens with Charter steps, the festival date, the forecast and any telegraphed threat. Both lanes work and trade requests. The season ends with a festival, a two-page season report (Hearth page, Ledger page) and a Chronicle entry.

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
| Work hours | 08:00 to 17:00 |
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
- **Standard valley** [I1]: Town Hall near the river crossing, a Storehouse (logs 40, planks 50, stone 30, bread 16, vegetables 16, fish 8; C3X tuning), two Cottages, a Well and a path to the valley road. Treasury 500 coins. The Town Hall employs up to 4 builders (the first two filled by the first residents, the other two by spare hands) until a Builder's Yard exists. Two households (8 residents) arrive at 08:00 on Spring day 1.
- At creation the players name the town; the valley gets a generated name (for example "Willowmere").

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
