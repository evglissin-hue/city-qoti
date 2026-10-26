# 11. Residents

Residents are individuals (P15), drawn as woodland folk (P16), written with warmth and wit (P4). All resident logic is deterministic sim code; visuals are in `17-presentation.md`.

## Data model [I1]

```ts
interface Resident {
  id: EntityId;
  given: string; family: string;          // unique pair among current residents
  species: SpeciesId;
  stage: 'child' | 'young' | 'adult' | 'elder';
  bornDay: number;                         // absolute day index
  traits: TraitId[];                       // 2 (3 from I2)
  householdId: EntityId;
  jobId: EntityId | 0;                     // workplace building
  tier: TierId;                            // settler | craftsfolk | merchant | patron
  mood: number;                            // 0..100
  needs: Record<NeedId, number>;           // satisfaction 0..100
  bond: number;                            // 0..5 hearts
  friends: { id: EntityId; level: number; points: number }[]; // max 5
  activity: Activity;                      // current schedule block and target
  move: MoveState | null;                  // path progress when walking
  wishId: EntityId | 0;
  history: { day: number; kind: string; ref?: EntityId }[]; // last 20
  flags: number;                           // reformed, story character, watch member...
}

interface Household {
  id: EntityId; family: string; members: EntityId[];
  homeId: EntityId | 0; pantry: Record<GoodId, number>;
  savings: number;                         // pennies [I2]
  tier: TierId; arrivedDay: number;
}
```

## Species

Species shape tastes, never ability. No species is better or worse at any job.

| Species | Likes (desirability bonus) | Dislikes | Look |
|---|---|---|---|
| Rabbit | gardens, flowers, quiet | noise | long ears, round body |
| Badger | stone homes, workshops nearby | dense crowds | stripes, stocky |
| Otter | water within 4 tiles, fish at market | far from water | sleek, long tail |
| Fox | markets, busy streets, trade | quiet backwaters | pointed ears, bushy tail |
| Mouse | dense cozy streets, bakeries | wide empty spaces | large round ears, small |
| Hedgehog | hedgerows, gardens, night quiet | bright busy streets at night | spiny back |
| Squirrel | trees, orchards, height | treeless streets | curled bushy tail |

Each like or dislike maps to a charm category or building tag with a weight *(tune: +-10 desirability)*. Arrivals pick homes with the best desirability for their species.

## Traits [I1]

Two per resident, compatible pairs only (no Cheerful + Grumpy).

| Trait | Effect |
|---|---|
| Cheerful | mood +5; spreads +2 mood to friends |
| Grumpy | mood -5; complains in wishes; befriends Grumpy fast |
| Curious | explores leisure spots further (radius +50%); finds pattern hints |
| Shy | prefers quiet leisure; befriends slowly but deeply |
| Bookish | wants a library [I4]; reading nook wishes |
| Sporty | wants greens and paths; walks faster |
| Romantic | forms couples [I2]; loves lantern-lit spots |
| Thrifty | buys cheapest substitutes [I2]; saves more |
| Generous | gifts to friends; donates to festivals [I3] |
| Artistic | loves variety (charm variety weight x2); paints signs |
| Practical | productivity +5%; dislikes clutter |
| Night Owl | schedule +2 h |
| Early Bird | schedule -2 h |
| Green-Fingered | garden plots +20% yield; garden wishes |
| Sweet Tooth | wants bakery and treats |
| Homebody | short leisure trips; loves Kitchen Gardens |

## Names [I1]

- Given names in species-flavored lists (rabbit: Clover, Hazel, Pip, Bramble; badger: Barnaby, Morwen, Tobias; otter: Wendell, Marina, Finn...). Family names from a shared pool (Thistledown, Bramblewick, Ashby, Millbrook, Underbank, Fernsby, Mossgrove, Puddleford, Hollins, Quill...).
- Targets: 200 given and 100 family names in I1, 400 and 150 by I3. Content, not code.
- A given + family pair is unique among current residents.

## Arrival and departure [I1]

- **Attractiveness** `A` (0 to 100), recomputed each morning: vacant homes (weight 30), food cover in days (20), open jobs (20), average charm near vacant homes (15), average mood (15).
- **Arrivals** at 08:00 if there is a vacant home and `A >= 40` *(tune)*: `k = 1 + floor(vacancies / 4)` households, max 3 per day. They walk in from the valley gate and claim homes in order of desirability for their species.
- **Household makeup** *(tune)*: single 25%, couple 30%, family with 1 to 3 children 35%, elder pair 10%.
- **Departure**: a household whose average mood stays below the departure threshold (25 at Standard, see dials) for 3 consecutive days leaves at 09:00, with a Chronicle line and a short farewell note.
- Sandbox: no residents.

## Ages and life events

Years are 24 days. Stages *(tune)*: child 0 to 3 years, young 3 to 5, adult 5 to 15, elder 15+.

| Event | From | Rule |
|---|---|---|
| Birthdays | I1 | stage changes create Chronicle lines for notable residents only |
| Friendships | I1 | see below |
| Couples | I2 | two adult or young friends at level 4+, compatible, one Romantic or both level 5 → couple; they merge households when a home fits |
| Weddings | I2 | a couple marries at the next festival or on a chosen day; mini event, Chronicle entry |
| Births | I2 | a couple with a spare bed and mood 60+ may have a child (chance per season) |
| Apprenticeships | I2 | young residents learn a trade at a workshop for 1 season, then take skilled jobs |
| Opening a shop | I3 | an adult with savings, a fitting trait and a vacant shop lot opens a named shop |
| Retiring | I2 | elders stop working |
| Moving to the seaside | I2 | elders past 20 years may leave to "live by the sea with family" (warm Chronicle entry). Nobody dies in City Qoti. |

## Schedules and activities [I1]

Default day, shifted by Night Owl (+2 h) and Early Bird (-2 h):

| Time | Adults and young | Children | Elders |
|---|---|---|---|
| 22:00 to 06:00 | sleep at home | sleep | sleep |
| 06:00 to 07:30 | morning at home, breakfast | home | home |
| 07:30 to 08:00 | commute | school [I2] or play near home | stroll |
| 08:00 to 17:00 | work (if employed), else errands and leisure | school or play | leisure, visiting friends |
| 17:00 to 21:00 | shopping if pantry low, leisure, visiting friends | play | leisure |
| 21:00 to 22:00 | walk home | home | home |

- **Leisure spot**: the highest-charm reachable tile within 15 walking minutes, weighted by species tastes and traits; friends often choose the same spot.
- **Shopping**: when the pantry holds less than 2 days of food for the household, one adult walks to the nearest market stall with stock (or storehouse if no stall within 20 tiles) and carries back up to 4 units per trip, repeating until the pantry (8 units) is full or the outlet is empty.
- **Night**: residents outdoors after 21:00 are rare; Night Owls and Hedgehogs are the exception.

## Movement [I1]

- **Graph**: tiles. Blocked: water (except bridges), buildings (except the entrance tile of the destination), cliffs (height difference 2+).
- **Cost** per tile: road 1, grass or meadow 2, sand 2, forest floor 3, field 3, rock 4; +1 when entering a tile one level higher.
- **Speed** in ticks per tile: road 5, grass, meadow and sand 10, forest floor and field 15, rock 20. Sporty x0.8.
- **Pathfinding**: A* with Manhattan heuristic; ties broken by lower f, then lower h, then lower tile index. Max 20,000 node expansions. Paths are cached by `(from, to, networkVersion)`; `networkVersion` increments whenever roads, buildings or walkability change.
- **Unreachable**: the resident is "stuck", returns home, and may raise a "Proper Path" wish.
- **Position**: current tile, next tile and progress 0 to 255; the client interpolates.
- **Budget**: movement for 2,000 residents must fit the sim tick budget (`22-quality.md`).

## Needs [I1, extended per tier]

Satisfaction 0 to 100, updated daily at 06:00 (food) or hourly (others).

| Need | From | Satisfied by |
|---|---|---|
| Food | I1 | 1 unit per resident per day from the pantry; variety bonus +10 for 2+ food types in the last 3 days |
| Water | I1 | home within the coverage radius of a well with capacity left |
| Shelter | I1 | has a home |
| Belonging | I1 | at least one friend at level 2+ |
| Beauty | I1 | average charm around home (radius 3) at or above the tier threshold |
| Warmth | I3 | winter: 1 firewood per household per day (2 in cold snaps) |
| Tier needs | I2 to I4 | goods, services and access per `13-ledger.md` |

## Mood [I1]

- `mood = weighted average of needs` (food 25, water 15, shelter 20, belonging 15, beauty 15, tier needs 10 from I2) plus active modifiers, clamped 0 to 100.
- Modifiers decay linearly over their duration *(tune)*: wish granted +15 for 3 days, new friend +5 for 2 days, festival +5 to +15 for 2 days [I3], raid fright -10 for 2 days [I3], lean times -5 while active, cold -15 while cold [I3].
- Bands: Glowing 80+, Content 60 to 79, Meh 40 to 59, Unhappy 20 to 39, Miserable under 20.
- Effects: productivity (110%, 100%, 90%, 75%, 50%), tax factor (`13-ledger.md`), departure risk, Watch morale [I3].

## Friendships [I1]

- Residents who share a leisure spot, a workplace, or live within 6 tiles gain friendship points with each other each hour they are together.
- Compatibility from traits *(tune table in content)*: matching traits x1.5, clashing x0.5.
- Levels at 10, 30, 60, 100, 150 points. Max 5 friends; the weakest is dropped when a sixth forms.
- Friendship decays slowly (1 point per day) when two residents no longer meet.

## Bond with the town [I1]

0 to 5 hearts. Gained from granted wishes (+1 each up to 3 hearts; above 3 only from festivals [I3], story steps and long residence of 2+ years). Lost slowly (1 heart per season) only while Miserable.

Effects: 3+ hearts sends letters (tips, gossip, pattern hints); 4+ occasionally gifts a rare decor piece; 2+ can volunteer for the Watch [I3]; bonded households tolerate lean times (departure threshold -10).

## Story characters [I2]

Handwritten characters with arcs over several evenings (P17), stored as content:

```ts
interface StoryArc {
  id: string; character: ResidentTemplate;      // fixed name, species, traits, bio
  arrival: Condition;                           // when they move in
  steps: { text: string; goal: Condition; reward: Reward }[];  // 4 to 6 steps
  finale: Reward;                               // landmark, innovation or unique decor
}
```

Initial cast:

| Character | Species | Arc | Finale |
|---|---|---|---|
| Captain Wendell Rook | otter | a retired river captain who misses the water; promenade, moorings, a riverside inn | Lighthouse landmark |
| Pippa Quill | mouse | a young inventor; workshops, the water wheel, then the printing press | Water Wheel and Printing Press innovations |
| Mother Thornbury | hedgehog | an herbalist; herb gardens, a clinic, the first remedies | Herbalist's Cottage and clinic upgrade |
| Barnaby Ashcombe | badger | a stonemason; quarries, walls, the Watch, a proper bridge | Stone Bridge landmark |
| Odette Fenwick | fox | a merchant; market days, the trading post, the first contract | Market Hall |
| Juniper Reed | rabbit | a musician; a bandstand, festivals, a choir | Bandstand Green and festival music upgrade |

Story residents never leave and are marked in the UI. Their letters are the main way new systems are introduced (P6: teach through residents).

## Client needs

- Resident inspector: portrait, name, species, traits, household, home, job, mood with breakdown, needs, friends, wish, short bio and history.
- Follow camera on any resident.
- Mood and wish bubbles above heads (toggleable).

## As built in I1 (C3A)

Where the I1 implementation fills in or differs from the sections above (`packages/sim/src/systems/residents`, `systems/movement`):

- **Tastes**: each `Taste` is measured as a presence from 0 to 1 around the home door (charm category averages, tags of buildings and decor, water, homes nearby for crowds, trees, height above the low ground, quiet) times its weight; `absent: true` counts the missing part ("far from water", "treeless streets"). Home desirability adds 0.15 x average charm (radius 3) and +4 for a well within 8 tiles.
- **Arrivals**: the founding arrival (first day, empty valley) fills every vacant home, up to 3, with working families of four of different species. Later arrivals pick a species weighted by the best vacant home for it, less likely the more households of that species live here, then claim that home.
- **Departure** thresholds follow the economy dial (15, 25, 35); a household whose home is removed moves to the best vacant home for its species, or leaves at once.
- **Schedules**: every resident thinks every 10 ticks at their own phase; departures carry a personal jitter of about 12 minutes. Free time is spent in outings of about an hour (home, a leisure spot, a friend's home, a stroll from home; children play within 4 tiles of home), re-chosen at each resident's own hour boundary. Hedgehogs ramble round the hedges after 22:00 on two nights in three. Children keep Early Bird hours but not Night Owl ones.
- **Leisure spot**: features within 12 tiles (Manhattan; Curious x1.5, Homebody x0.5): benches and seats, flowers, trees, the well, water's edge, the market for foxes and the bakery for mice, scored by appeal, charm, species, traits (Romantic and lanterns, Shy and quiet, Sporty and greenery, Sweet Tooth and the bakery), distance, friends already there (+8) and a little whim.
- **Food** is eaten at 07:00 (breakfast), not 06:00. Households of 4 or more always want a full pantry, so someone shops most evenings.
- **Water**: wells serve households in id order, each from its nearest well in range with capacity left. Needs other than food move a quarter of the way to their target each hour, staggered by household.
- **Beauty** target: 0.7 x min(100, charm x 100 / tier threshold (settler 25)) + 30 + the home's taste score, clamped.
- **Friendships**: an hour together is worth 3 points at a friend's home, 2 outdoors at the same spot, 1 at work (counted every other hour); neighbors within 6 tiles gain 1 point a day with their three nearest neighboring households; children befriend children, family does not count. A full list makes room only by dropping its weakest level 0 acquaintance. Shy friendships decay every other day.
- **Bond**: `addBond` gains from wishes stop at 3 hearts; `addBond(..., 'other')` reaches 5; long residence adds a heart every 2 years.
- **Movement**: a tile takes exactly its ticks (road 5, grass 10, forest floor and fields 15, rock 20; Sporty x0.8), by the tile being entered. Walks replan when the next tile becomes blocked; with no way left the walker stops, marked stuck, goes home, and after an hour finds their way in regardless.
- **Agent frames**: walkers keep to the left of their way, residents sharing a tile spread round it, and idle residents face what they came to see.
