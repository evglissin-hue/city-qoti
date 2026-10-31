# 14. Challenge and defense

Real stakes, never a game over (P3). Light defense, not tower defense (P35). Threats are fair (P36), touch both lanes (P37), and sit beside seasons and weather (P38) under two difficulty dials (P39).

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
| Lantern line | Hearth | night threats avoid lit tiles; raiders lose morale in light; a Lantern Walk doubles it | |
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

## Seasons [I3]

| Season | Land | River | Needs | Typical events | Festival |
|---|---|---|---|---|---|
| Spring | sow wheat days 1 to 3; vegetables grow | high water | normal | flood | Blossom Fair |
| Summer | crops grow; orchards bloom | best fishing | normal; visitors arrive [I4] | drought, heatwave, storms | Midsummer Lantern Night |
| Autumn | harvest days 1 to 4; apples | normal | stockpiling | early frost, storms | Harvest Supper |
| Winter | nothing grows | freezes from day 2: no fishing, no water wheels, no barges; skating adds charm | warmth: 1 firewood per household per day | cold snap, snowstorm, wolves | Winter Hearth Feast |

Winter is the gentle exam: prepared, it is the coziest season; unprepared, residents are cold, unhappy, and some move away.

From I3, farming becomes seasonal: wheat sown in spring, harvested in autumn; fields lie fallow in winter.

## Weather and events [I3]

- **Daily weather** from season probabilities (deterministic): clear, cloudy, rain, storm, fog, snow, heat.
  - Rain: farms +10%, outdoor leisure -50%. Storm: some roofs take condition damage. Fog: shorter warnings. Snow: walking -30%. Heat: well capacity -20%.
- **Events**, each forecast 1 to 2 days ahead by the Town Hall barometer:
  - **Flood** (spring): floodplain tiles (height 0 or 1 within 6 of the river, shown in an overlay) flood for 1 to 2 days; buildings there lose condition and stored goods unless protected by levees [I4] or raised foundations.
  - **Drought** (summer): farm yields -40% unless irrigated (ditches [I4]) or near wells.
  - **Early frost** (autumn days 1 to 3): unharvested wheat -50%.
  - **Cold snap** (winter): warmth needs x2 for 2 days.
  - **Travelling circus** (summer, Village+): needs a green; brings visitors, coins and mood.
  - **Royal visit** (Town+): an inspector judges charm, order and stock; renown up or a gentle embarrassment.

### As built (C5A)

- **The season** turns at 00:02 on day 1 (`season.started` with the card; from autumn the card shows the winter stores: days of food, wheat and flour counted, and days of firewood); the report goes out at 23:02 on the last day, after the festival. The river freezes at 00:02 on Winter day 2 and thaws on Spring day 1. While frozen: no fishing, the water sawmill saws by hand at sawpit rate, and one resident in three (not elders) goes skating on the bank nearest home from 17:00 to 20:00 (`AgentFlags.skating`), and the ice within two tiles of each skating spot has +3 comfort charm while it holds (on the ice only: the bank's homes and decor keep their charm, so the tuned Village timing does not move; the chunks by the spots are recomputed at the freeze and the thaw). Trees do not grow in winter.
- **Warmth** at 07:30: in autumn households top their pantries up to four days of firewood; each winter day each burns one (two in a cold snap), fetching what it lacks first: free from the storehouses in a Hamlet, at the till with `buy()` in a Village (a household on the slate takes what it cannot pay for, as at breakfast) (this is the winter basket's firewood line for every tier). Short is cold: a held `cold` mood modifier of -15 (-7 with a Bath House in reach, 3 better again with the herbalist's cover), the shiver flag, and the counts (`warmth.coldHouseholdDays`, and `coldHouseholds` for a whole day without, after a day's grace for newcomers). Warmth is a modifier, not a new need, so saved needs keep their shape. A winter with no cold household-day counts toward Warm Hearths.
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
