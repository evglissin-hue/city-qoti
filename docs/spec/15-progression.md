# 15. Progression

Every unlock changes how you play (P6). Progress comes from Charters and trials (P40), innovations (P41), achievements (P42) and new land (P43).

## Ranks and Charters

The Charter board at the Town Hall lists the goals for the next rank, each tagged with a lane icon, with progress visible to both seats.

| Next rank | From | Charter goals | Trial | Unlocks on reaching it |
|---|---|---|---|---|
| Village | I2 | 30 residents; 3 patterns discovered; 5 wishes granted; 5 days of food in stock; a season ended in surplus | from I3: the first winter (everyone warm) | zoning, market prices, Craftsfolk, school, tavern, herbalist, carts, streets, Trading Post, loans, 6 new patterns |
| Town | I4 | 120 residents including 40 Craftsfolk; 8 patterns; a 3-star festival; 6 goods at the market; a Watch of 6+ | a bandit gang raid (Medium) | Merchants, districts and styles, contracts, River Dock, canals, clinic, stone walls, watchtowers |
| Market Town | I5 | 400 residents including 80 Merchants; 15 patterns; a 4-star festival; 20 Field Guide species; a weekly market with 10 goods; 2 seasons in surplus | a great flood or the Bandit Chief | Patrons, library, theater, tram, gas lamps, glassworks |
| City | I5 | 900 residents including 100 Patrons; 25 patterns; a 5-star festival; 3 contracts kept; renown 4 | the Long Winter (two cold snaps) | city hall, railway, grand landmarks, new valleys |

**Eras** [I4]: sealing the Town Charter opens the Age of Steam and sealing the City Charter the Bright Age (`18-eras.md`), each with its own moment, look and systems in both lanes.

**The rank-up moment (I2, C4D)**: when the last goal is met, the County Clerk writes to both seats that the claim is open. Claiming at the Town Hall (`charter.claim`) puts the proclamation in the Chronicle, credited to the seats present, gives every resident a mood lift for two days and a hop for an hour, and sends `rank.up` with the proclamation for the UI's celebration (C4F). No trial in I2.

*As built (C5A), trials*: the claim grants the rank as in I2; the trials system (00:08) then opens the Charter's trial for the next time its season comes round (a letter), runs it through that season measuring each day, and judges it the morning after. The Village's first winter is weathered when no household went a whole day without firewood and the larder (food, wheat and flour) never ran dry; weathered seals the Charter (a County letter, a Chronicle page, 3 renown), failed returns next winter and takes nothing. Kinds are rows in `TRIAL_KINDS` (winter now; raid and flood later). The Barometer needs a Watch House and a bell tower, the Seed Drill three farms and a smithy (both from Village rank).

**Trials**: completing a Charter's goals announces the trial for day 5 of the next season, so there is an evening to prepare and one tense dusk to see it through. The rank is granted when the trial is weathered: the town keeps at least half of its food stock, or the raid is repelled, or everyone stays warm. A failed trial returns the next season; nothing else is lost beyond the trial's own damage.

## Renown [I3]

Points from festivals, repelled raids, discovered patterns, kept contracts, royal visits and story finales. Levels 0 to 5. Effects: more and better arrivals, better trade terms (+2% per level), visitors and tourism coins [I4], notable visitors (commissions).

## Innovations [I2]

Technology arrives through conditions in the town, shown as progress bars in the inventor's notebook (P41). Each innovation adds a production method, building or capability.

| Innovation | From | Condition | Unlocks |
|---|---|---|---|
| Wheelbarrows | I2 | a storehouse whose porters were 80%+ busy for 3 days | porters carry 8 |
| Carts | I2 | Village rank and 20+ planks per day | Cart Shed |
| Cobbles | I2 | quarry output 20+ per day | streets |
| Brick Kiln | I2 | a clay pit worked for 2 days | bricks |
| Water Wheel | I2 | a sawpit within 3 tiles of the river and Pippa Quill's step 2 | water-powered sawmill (+80% output, noise) |

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

## Expansion [I4]

- 16 parcels (see `10-world-and-building.md`). Each has an unlock rule in content: rank, a coin price (Ledger), a bridge built to it, or a feature to clear.
- Clearing a bandit camp or wolf den: send a Watch expedition once strength meets the requirement. It takes a day and resolves like a raid in reverse; on failure members return shaken and you may try again.
- New parcels reveal new resources and attract new species or story characters.

## New valleys [I5]

- After City, start a new valley (coast, highlands, lakes) with its own resources and styles. The first town becomes a neighbor: its last state sets what it sells and buys.
- Achievements and the personal journals carry over; the Pattern Book gains valley-specific patterns.
