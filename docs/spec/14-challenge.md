# 14. Challenge and defense

Real stakes, never a game over (P3). Light defense, not tower defense (P35). Threats are fair (P36), touch both lanes (P37), and sit beside seasons and weather (P38) under two difficulty dials (P39).

**The redesign (owner, 2026-11-10)** changes little here and leans on it more. With a carrier that fills any shortfall (`13-ledger.md`), winter and the closed pass are what make the town's own stores matter, so the gentle exam keeps its teeth. Notes tagged [R1] and [R3] below; goods are named as in `13-ledger.md` (grain for wheat, timber for logs and planks, the granary beside the storehouse as a store raiders want), and the sowing window is P1's (Spring day 1 to Summer day 3), where the Seasons table still says days 1 to 3.

## Threat pressure [I3]

- **Wealth** `W = treasury + sum(stored goods x base price) + 0.1 x sum(building value)`.
- **Pressure** `P` rises each day by `W / k(rank) x threatDial` and falls with **deterrence**: wall coverage of storehouses and the market, tower coverage, lantern lines, Watch strength. A raid resets `P`.
- **Schedule**: on day 1 of each season, if `P` is above the threshold, a raid is scheduled for day 3 to 5 at dusk with strength proportional to `P`. At most one raid per season; none before Village rank.
- **Tutorial**: the first Hamlet winter shows wolves howling at the forest edge; they only spook.
- Threats follow wealth, not the clock: a slow, thoughtful pace is never punished, and hoarding everything in one undefended storehouse is a gamble.

## Telegraphing [I3]

- Two in-game days before a raid, signs appear: tracks in the snow, crows gathering, a merchant's or scout's letter.
- The season card and an alert show the approach side and a strength band (Small, Medium, Large).
- Watchtowers add a day of warning. Fog shortens warnings.

## Threat types

| Threat | From | Approach | Targets | Countered by |
|---|---|---|---|---|
| Bandit gang | I3 | land, from forest or road edges | storehouses, market, outlying farms; the Town Hall at Town rank | walls, gates, towers, the Watch, traps |
| Winter wolves | I3 | forest edges, winter nights | outlying farms; frighten residents out at night (mood, never harm) | light, fences and walls; they flee at dawn |
| Great owl | I4 | the sky, at night | open fish racks and food stalls; frightens folk | lantern lines, covered storage, Watch lantern bearers |
| River raiders | I4 | boats on the river | docks, riverside storehouses | river boom, riverside towers |
| Bandit chief | I4 | land, large | the trial for Town rank | everything above |
| Bandit camp, wolf den | I4 | map features | block a parcel | cleared by a Watch expedition |

Bandits are a gang, not a species: captured bandits can become residents of any species.

## Defenses

| Piece | Lane | Effect | Notes |
|---|---|---|---|
| Fence (decor) | Hearth | raiders crossing slowed 20%; wolves avoid fenced farms | charm-friendly |
| Hedge (decor) | Hearth | slowed 30%; hedgerow habitat | charm-friendly |
| Palisade segment | Ledger | blocks movement, 100 hp | logs |
| Stone wall segment | Ledger | blocks movement, 400 hp; Hearth can dress it (ivy, flower boxes) for charm | stone |
| Gate | shared | passable for residents and carts; closes when the bell rings | |
| Watchtower | Ledger | 1 or 2 Watch members lower raider morale within 6 tiles; +1 day warning | |
| Watch House | Ledger | Watch roster, training and posture | |
| Lantern line | Hearth | night threats avoid lit tiles; raiders lose morale in light; a Lantern Walk doubles it | [R3] only lanterns the lamplighter has lit count, so candles are part of the town's defense |
| Bell tower | shared | residents hurry home, gates close | |
| Pit trap, net trap | Ledger | one-shot slow or capture | |
| Ditch, moat | Ledger [I4] | slows; blocks wolves | |

Walls and towers count for charm when dressed, so defense can be beautiful (P37).

## The Watch [I3]

- Adults with bond 2+ volunteer once a Watch House exists. Ledger sets the target size.
- Members spend 1 day in 4 on duty (away from their job); on a telegraphed raid day, all members turn out.
- **Strength** = members x training (1.0 to 1.6, raised at the Watch House over time and coins) x morale.
- **Morale** from average town mood, recent festivals, friendships among members, and past victories.
- **Posture** (set before a raid): up to 3 guard points (storehouse, market, a farm) and, from I4, patrol routes. Gear is gentle: slings, staffs, nets, lanterns.

## Raid resolution [I3]

Deterministic sim, played out in full view; no unit control (P35).

1. Raiders spawn at the telegraphed edge at dusk. Each has morale 10 and carries up to 8 units.
2. They path toward targets. Walls are obstacles they can break (hp, time); gates are passable when open.
3. Towers lower the morale of raiders in range each tick (rate x crew x training).
4. Watch members move to guard points or intercept raiders within 8 tiles. In contact, each side loses morale each tick in proportion to the other side's strength. A raider at 0 morale flees, or is captured if 2+ Watch members are adjacent. A Watch member at 0 morale retreats shaken and rests for a day. Nobody is hurt beyond that.
5. A raider who reaches a target takes up to 8 of its most valuable goods, lowers its condition by 20%, then runs for the exit. Goods carried by a captured raider are recovered.
6. When the bell rings, residents go indoors. Residents caught outside at night by wolves or the owl get a fright (-10 mood).
7. The raid ends when no raiders remain or at dawn.

**Player actions during a raid**: ring the bell, light all lanterns, open or close gates, pause and watch.

**Result card**: goods lost, damage, captures, renown gained if repelled, Watch morale change, Chronicle entry. The Gate Held achievement: a raid repelled with nothing stolen.

**Captured bandits**: either seat chooses to offer them a home (they join with the Reformed trait and bond 0; some become the town's best workers, +10% productivity, and get a small story) or send them off (renown +1).

### As built (C5D)

- **Pressure** (00:40, Village rank on, never on Peaceful): `W` as above in pennies; each day `P += floor(W / k) x (1000 - min(D, 850)) / 1000` permille of the threshold, with `k` = 1,500 for a Village, 3,000 for a Town and 6,000 for a City (a Village worth 1,500 coins gains about 100 a day), and `P` capped at 3,000. **Deterrence** `D` (permille, the four parts in `threats.deterrence`): walls 450 x the share of stores (storehouses, market stalls, the Trading Post) whose door raiders could not walk to from the valley's edge with every gate shut (a walled area larger than 1,024 tiles counts as the open valley); towers 250 x the share within a built watchtower's range; lanterns 100 x the share with a lit door; the Watch 30 per point of strength, at most 300. The threshold is 1,000 (600 on Fierce); a raid resets `P` to 0 when it comes.
- **Schedule**: on day 1 of a season with `P` at or over the threshold and no raid scheduled, one raid for day 3, 4 or 5 at 18:00 (`threats` stream), with 2 + 4 raiders per threshold of pressure, 3 to 12 (x1.5 on Fierce, still at most 12): Small up to 4, Medium up to 8, Large from 9. The side is drawn weighted by the forest along each edge (bandits come from the woods).
- **Telegraphing**: the signs appear two days before dusk on the raid day (three with a built watchtower, its `warningDays`), at once if that is already past, and never later than the evening before. A foggy day pushes signs not yet shown a day later, never past the evening before, so a raid is never a surprise in any weather (property-tested over seeds and fog). The first sign shows on the tick (`threat.updated`), one more each day: tracks (winter only), crows, a letter.
- **Defenses**: wall runs are painted one piece a tile (`wall.paint`, a construction site each, priced per piece); where a run crosses a road the piece is a gate, so residents and carts keep their way. Stone walls come at Town rank or from Barnaby Ashcombe's third step. A run, or a palisade placed by hand, is refused with `WOULD_ENCLOSE` if it would cut any home, workplace, storehouse or the Town Hall off from the valley gate, gates counting as open (a gate the bell shut opens again at dawn), so nothing can deadlock residents or porters (`canPaintWall` gives the client the same answer). Open gates are walkable ground in the walk grid and the town's reach; a gate shut by `gate.set` or the bell blocks. Breached pieces (0 hp) stay standing for residents and are mended a quarter of their hit points a day by the 05:30 roster; sprung traps are reset there too. A bell tower rings the bell itself when a raid comes. Fences and hedges slow raiders through the walk hook (`DecorDef.slows`) instead of being walked round.
- **The Watch** (05:30): adults with bond 2+ sign on once a Watch House stands, most bond first, up to the target; if the target falls the newest leave. Duty is the day when (day + id) % 4 = 0: the work day (08:00 to 17:00) at the nearest Watch House instead of their job (schedule override 40); on the raid day nobody has duty and everyone gathers at their guard point from 17:00 (90). The budget is a stipend, paid with `pay()` from the treasury to each member's household (category `watch`) while the treasury can cover the day; half a coin a member raises training a point a day, a coin and a half two (100 to 160). There is no gear cost. Morale = the town's average mood + `festivalMorale` + 3 per friendship among members (at most 15) + 4 for each of the last three raids repelled, - 4 for each not, clamped 0 to 100, and +5 or -5 after each raid.
- **Raid resolution** (every tick, raids 84 and defenses 86; morale in 1/1024 steps so every sum is exact): raiders spawn in the eight-tile strip along their side, at the tiles nearest the richest store by walking, and run (60% of a walker's ticks per tile). They head for the three richest stores (round robin) on a grid where standing walls and shut gates cost 20 steps (raiders break them, one hit point a raider a tick), traps and open gates are ground and fences are crossed. Crewed towers (one member each while there are two hands per tower, two with four to spare) drain raiders within range by 12 x crew x training / 100 units a tick; lantern light drains 4 a tick (x2 once every lantern is lit, x2 on a Lantern Walk). The Watch posts at its guard points (two to a point is best) or intercepts raiders within 8 tiles; in contact a raider loses 48 x training x Watch morale / 10,000 units a tick per member beside it and a member 20 per raider (30 on Fierce). **A store with the Watch at its door holds**: a raider waits beside the guard, losing heart, until one side breaks (the gentler reading of step 5). A raider at 0 is captured with two members beside it (its load goes back to the nearest storehouses), else it flees to the nearest tile on its side; a member at 0 is shaken, goes home and rests a day. A net trap catches a raider, a pit costs 3 morale and two tiles' worth of time; each springs once. Folk outdoors within 5 tiles of a raider get a fright (-10 mood, fading over a day). The raid ends when no raider is left on the map, or at 06:00; raiders still there leave with what they carry.
- **After**: the result card (goods lost by good, condition points lost, captures, renown, the Watch's morale change), a Chronicle entry with a snapshot (`raid-held`, `raid-repelled` or `raid-lost`), and the history. A raid is repelled when nothing was stolen or more raiders were turned back (captured, or fled empty-handed) than got away with goods; repelled is +2 renown (`addRenown`, source `raid`), held (nothing stolen) +3 and counts for The Gate Held. Stolen goods leave the valley as goods; no money moves. Captives wait in `threats.captives`: a home (`bandit.decide`, a household of one in a vacant home, any species, the Reformed trait: +10% at work, bond 0, a Chronicle line) needs a vacant home; a send-off is +1 renown.
- **Wolves**: on Winter day 1 two of the season's nights are drawn (never the first). On a wolf night the pack comes from the forest tile nearest the most outlying farm (12 or more tiles from the Town Hall; farmhouses and pastures) with no fence, hedge or wall within two tiles and no lantern at its door, reaching it at 01:00 and back in the trees by 05:00. On the hour, folk outdoors on an unlit tile within 10 tiles of the pack get a fright (-10); that farm makes half as much the next day (yield hook `wolves`), and the morning's Chronicle says where they went. In the first Hamlet winter (before Village rank in year 1) and on Peaceful they only howl at the forest edge. The pack is derived from the clock and the map (agent rows with `AgentFlags.wolf`), never saved.
- **The season report**: raids, losses and wolves' nights for both pages; the pressure band (calm, rising at half the threshold, high), deterrence and the Watch for the Ledger only, never raw pressure on the Hearth's page.

## Seasons [I3]

| Season | Land | River | Needs | Typical events | Festival |
|---|---|---|---|---|---|
| Spring | sow wheat days 1 to 3; vegetables grow | high water | normal | flood | Blossom Fair |
| Summer | crops grow; orchards bloom | best fishing | normal; visitors arrive [I4] | drought, heatwave, storms | Midsummer Lantern Night |
| Autumn | harvest days 1 to 4; apples | normal | stockpiling | early frost, storms | Harvest Supper |
| Winter | nothing grows | freezes from day 2: no fishing, no water wheels, no barges; skating adds charm | warmth: 1 firewood per household per day | cold snap, snowstorm, wolves | Winter Hearth Feast |

Winter is the gentle exam: prepared, it is the coziest season; unprepared, residents are cold, unhappy, and some move away.

[R1] **Prepared has a number.** The Ledger's season plan sets the winter reserve, days of Food and Fuel to hold by Winter day 1 (8 and 8 by default), and a reserve bar shows from Summer day 4 (`13-ledger.md`, The season plan). [R2] Winter evenings want warm places: an open-air place with no fire draws 30 less, so the tavern, the Bath House and a lit bonfire are what keep winter cozy (`19-evenings.md`, Places).

From I3, farming becomes seasonal: wheat sown in spring, harvested in autumn; fields lie fallow in winter.

## Weather and events [I3]

- **Daily weather** from season probabilities (deterministic): clear, cloudy, rain, storm, fog, snow, heat.
  - Rain: farms +10%, outdoor leisure -50%. Storm: some roofs take condition damage. Fog: shorter warnings. Snow: walking -30%. Heat: well capacity -20%.
- **Events**, each forecast 1 to 2 days ahead by the Town Hall barometer:
  - **Flood** (spring): floodplain tiles (height 0 or 1 within 6 of the river, shown in an overlay) flood for 1 to 2 days; buildings there lose condition and stored goods unless protected by levees [I4] or raised foundations.
  - **Drought** (summer): farm yields -40% unless irrigated (ditches [I4]) or near wells.
  - **Early frost** (autumn days 1 to 3): unharvested wheat -50%.
  - **Cold snap** (winter): warmth needs x2 for 2 days.
  - **The pass is closed** (winter) [R1]: heavy snow shuts the valley road for 1 to 3 days of the season *(tune; at most 1 on Gentle, up to 4 on Thoughtful)*, forecast like any event. The carrier does not come, and the boat is already held by the ice, so for those days the town lives on what it has put by and what it makes. This is the price of living on imports.
  - **Travelling circus** (summer, Village+): needs a green; brings visitors, coins and mood.
  - **Royal visit** (Town+): an inspector judges charm, order and stock; renown up or a gentle embarrassment.

### As built (C5A)

- **The season** turns at 00:02 on day 1 (`season.started` with the card; from autumn the card shows the winter stores: days of food, wheat and flour counted, and days of firewood); the report goes out at 23:02 on the last day, after the festival. The river freezes at 00:02 on Winter day 2 and thaws on Spring day 1. While frozen: no fishing, the water sawmill saws by hand at sawpit rate, and one resident in three (not elders) goes skating on the bank nearest home from 17:00 to 20:00 (`AgentFlags.skating`), and the ice within two tiles of each skating spot has +3 comfort charm while it holds (on the ice only: the bank's homes and decor keep their charm, so the tuned Village timing does not move; the chunks by the spots are recomputed at the freeze and the thaw). Trees do not grow in winter.
- **Warmth** at 07:30: in autumn households top their pantries up to four days of firewood; each winter day each burns one (two in a cold snap), fetching what it lacks first: free from the storehouses (or the pile at a chopping shed's door) in a Hamlet, at the till with `buy()` in a Village (*C5X part 2*: in winter, when the shelves are bare, from the woodpile at the till price; and any household that cannot pay takes the rest on the slate, as at breakfast, so a household is cold only when the town has no firewood: before, only newcomers and households with nobody in work could, and a working family that spent its wages by supper went cold beside a full woodpile) (this is the winter basket's firewood line for every tier). Short is cold: a held `cold` mood modifier of -15 (-7 with a Bath House in reach, 3 better again with the herbalist's cover), the shiver flag, and the counts (`warmth.coldHouseholdDays`, and `coldHouseholds` for a whole day without, after a day's grace for newcomers). Warmth is a modifier, not a new need, so saved needs keep their shape. A winter with no cold household-day counts toward Warm Hearths.
- **Arrivals weigh the winter** (C5A tuning): from autumn to the thaw a family moves in only while the larder could feed the town, them included, to the thaw with a little in hand (`larderWelcomes`): a winter's eating and two days more through autumn, counting wheat and flour only as far as the bakeries can bake them by then, and in winter the days left and three more from what is on the shelves; an empty home's inspector says why. While a family waits so in autumn, food work ranks ahead of other workplaces (never ahead of a storehouse's or a builder's first two hands), and the porters come first while goods pile up for want of them; from autumn to the thaw firewood counts as short while the woodpile holds less than a firewood a household for those days, so the chopping sheds hire first.
- **Weather** at 00:04: today comes off the forecast (one day ahead, two with the Barometer) and the next day is rolled from the season's odds (content). Rain: farms +10% and one in two evening outings stays in; storm: everyone stays in for the evening and one roof in eight loses 10 condition; fog: C5D's warnings; snow: every tile 30% slower for residents, carts and raiders (`walk` 1300, permille of tile ticks); heat: wells serve a fifth fewer.
- **Events** are scheduled on day 1 of their season at odds x the economy dial (flood 450, drought 400, early frost 350, cold snap 550, circus 600, permille), never two of their seasons running, with a 1 to 2 day forecast (`event.forecast` and an alert). The flood keeps buildings on the floodplain under water until it ends (`isFlooded`), takes a fifth of their condition and a fifth of each stored good, at most 20 a good. Raised foundations wait for I4's levees. The circus wants Village rank and a Village Green: an evening's joy for everyone (+8, fading over two days) and 20 pennies a resident booked as `visitors`. On the circus day its visitors (one for every five residents, 6 to 16) walk in at the valley gate in time for the show at 19:00, stand round the green, and from 21:00 walk home again, through the gate by a quarter to midnight; a green too far from the gate for that draws none. They are view only (agent rows with `AgentFlags.visitor` and ids from 2^23, worked out from the event and the clock along one cached path): nothing about them is saved or hashed, and they cannot be inspected. The latest of each event stays in `weather.events` after it ends; the views show only those to come or on.

## Difficulty dials

Set together when creating a valley; either seat can change them any time, the partner is notified and the Chronicle notes it.

| Effect | Gentle / Peaceful | Standard | Thoughtful / Fierce |
|---|---|---|---|
| Upkeep | x0.7 | x1.0 | x1.25 |
| Need quantities | x0.85 | x1.0 | x1.15 |
| Price volatility | x0.6 | x1.0 | x1.4 |
| Departure threshold (mood) | under 15 | under 25 | under 35 |
| Weather event frequency | x0.7 | x1.0 | x1.3 |
| Raids (threat dial) | none | standard | threshold x0.6, strength x1.5 |

The economy dial arrives in I1; the threat dial in I3.
