# 12. Hearth

The Hearth lane is a complete game (P1): real rules, its own progression (Pattern Book, bonds, Field Guide, festival renown) and its own achievements.

## Charm [I1]

A per-tile integer field, 0 to 100 (P20). Stored in sim state as `hearth.charm` (Uint8Array) plus five category fields used for breakdowns and species tastes: `nature`, `comfort`, `light`, `view`, `noise`.

**Recompute** dirty chunks (and their neighbors) at most once per in-game hour, and immediately after a Hearth command in that chunk (debounced to the next tick).

*As built (C3B):* `markCharmDirty(rect)` grows the rect by the charm reach (6 tiles: the largest source radius plus one, enclosure and the height window) before marking chunks, so "and their neighbors" means exactly the chunks a change can reach. The hourly pass runs at offset 50. Hearth commands (decor, trees, `build.customize`) set `hearth.charmSoon`, and the next tick recomputes. When the lanterns are lit (18:00) and put out (07:00) the chunks around every light source are recomputed. A valley's first tick computes the whole map. Recomputed layers are marked on `ctx.dirty`, so clients get LayerPatches only for layers that changed. Budget: under 2 ms per chunk (0.25 ms on the hamlet, 1.5 ms on a block packed with 300 pieces at night).

**Sources** (value at the source tile, linear falloff to 0 at the radius) *(tune)*. As built: value x (radius + 1 - d) / (radius + 1), where d is the distance in tiles from the tile's center to the piece (or to a building's footprint), so the last tile inside the radius still gets a little and nothing past it does. Sources come from content (`charm` on decor and buildings) plus the map:

| Source | Category | Value | Radius |
|---|---|---|---|
| Mature tree tile | nature | +3 | 2 |
| Ornamental tree | nature | +5 | 2 |
| Flower bed, planter, wildflower verge | nature | +4 | 2 |
| Vegetable or herb plot | nature | +2 | 1 |
| Hedge segment | nature | +2 | 1 |
| Water in view (river or pond within 3) | view | +6 | 3 |
| Height 4+ above the 5-tile average | view | +3 | 0 |
| Bench, ring bench, sitting wall | comfort | +3 | 2 |
| Well, fountain, birdbath | comfort | +6 | 3 |
| Statue, landmark | comfort | +8 to +12 | 4 to 5 |
| Lantern | light | +2 by day, +6 at night | 3 |
| Path tile | comfort | +1 | 0 |
| Workshop (noise) | noise | -6 to -10 | 3 to 4 |
| Smelly workshop (fishery, tannery [I2]) | noise | -6 | 3 |
| Storehouse, construction site | noise | -3 | 2 |
| Busy lane or street (traffic) [I2] | noise | -1 to -3 | 1 |

**Rules that keep it thoughtful:**

- **No spam**: for each decor type, only the 2 strongest instances within the radius count for a tile. Fifty identical benches add no more than two. (As built: per type and category; building defs and forest trees are types too; noise is never capped, two sawpits are louder than one.)
- **Variety**: +2 per distinct decor type within 3 tiles, up to +10. (Decor only: ornamental trees count, forest trees do not, so a forest is pleasant but not "varied".)
- **Clutter**: more than 12 decor items within 2 tiles gives -5. (Linear pieces, fences, walls and hedges, are boundaries and never clutter.)
- **Enclosure**: an open tile (no building, not a road wider than a lane) with buildings on 3 or 4 sides within 4 tiles gets +5 (squares feel good). (Looking straight out along each axis; one-tile buildings such as wells and flat plots do not close a square.)
- Pattern site bonuses add on top (below). (As built: a site's bonus radiates from its anchor and member tiles with the same falloff; per tile the strongest site of each pattern counts; a bonus with a category goes to that layer too.)
- *Additions (C3B, tune)*: younger trees (stages 1 and 2) give nature +1 r1; customized window boxes count as nature +2 r1; lanterns are lit from 18:00 to 07:00; "height" means 4+ levels above the average of the 11 x 11 tiles around; water tiles have no charm.
- *Total* = nature + comfort + light + view - noise + variety - clutter + enclosure + uncategorized site bonuses, rounded and clamped to 0 to 100; the five category layers are stored rounded (noise as a magnitude).

**Effects**: home desirability and arrivals, the Beauty need, tier thresholds [I2], wish targets, pattern detection, tourism [I4], Watch morale near defenses [I3]. Charm overlay uses a colorblind-safe ramp.

## The Pattern Book [I1]

The core of Hearth progression (P19). Good places are made of patterns, inspired by Christopher Alexander's *A Pattern Language*. Patterns are discovered by building them, never bought.

**Definition** (content):

```ts
interface PatternDef {
  id: string; name: string;
  flavor: string;          // shown after discovery
  hint: string;            // shown before discovery
  rank: RankId;            // when it can appear
  detector: string;        // id of a detector module in packages/sim
  params: Record<string, number>;
  siteBonus: { charm: number; radius: number; extra?: Effect[] };
  unlocks: string[];       // decor, building or style ids
}
```

**Engine:**

- Each in-game hour, run every pattern's detector over dirty chunks. A detector returns site instances `{ anchorTile, members: EntityId[] }`. *As built (C3B):* the pass runs at offset 100 over the whole map (0.5 ms on the hamlet, 2.7 ms with a dense block added), which keeps re-validation exact for long walks whose anchor sits outside the changed chunk; scoping to dirty chunks is a later optimization. Detectors are modules registered by id in `systems/hearth/patterns/detectors`. Credit ties go to the seat that placed the newest member.
- Instances are keyed by `(patternId, anchorTile)` so they are stable. An existing instance whose members change is re-validated; an invalid one is removed with its bonus.
- **First valid instance anywhere** = discovery: Book entry, Chronicle line, both seats notified. The seat that placed most member pieces is credited; if both seats placed members, the discovery also counts for "Built Together".
- Every valid instance (not only the first) applies its site bonus.
- The Book shows discovered pages (name, flavor, first site snapshot, date, credit) and hints for 3 undiscovered patterns at a time; each discovery reveals the next hint. Curious residents' letters can reveal extra hints.

**I1 patterns (8):**

| Pattern | Rule | Site bonus | Unlocks |
|---|---|---|---|
| Well Gathering Place | a well with 2+ benches within 3 tiles and a tree (any tree on the map, a sapling too, or an ornamental one) within 3; 3+ homes within 8 (round six: 2 tiles and grown trees only) | +8 r4 | Curved Bench |
| Sitting Wall | 4+ low-wall segments in a continuous line (gaps under 0.2 tile) beside a path, with flowers or hedge on the side away from the path | +6 r3 | Planter Wall |
| Tree Place | a mature or ornamental big tree with 2+ benches within 2.5 tiles (round six; 1.5 before), and path tiles leading off in 2+ directions within 2 tiles | +8 r3 | Ring Bench |
| Pocket Park | an area of 2x2 to 4x4 free tiles holding 1+ tree, 1+ bench and 2+ flower pieces, with buildings on 2+ sides within 2 tiles | +6 r3 | Birdbath |
| Kitchen Garden | a home with 2+ vegetable or herb plots within 3 steps of its footprint or of another of its plots, diagonals counting as one step (so two empty tiles may lie between; a row of plots is one garden; playtest round six) and a fence or hedge within 2 steps of them | +5 r2; household food +1 per day | Herb Planter |
| Lantern Walk | a continuous path or lane of 10+ tiles where every run of 3 consecutive tiles has a lantern within 1 tile, and 3+ lanterns in all (C3B: two lanterns made a "walk" too cheaply) | +6 light along the walk; night safety [I3] | Hanging Lantern |
| Promenade by the Water | 8+ consecutive path tiles each within 2 tiles of water (round six; a path on the sand counts), with 2+ benches and 2+ lanterns along it | +10 r2 | Mooring Post; otter arrivals favored |
| Hedgerow Lane | a straight path or lane run of 6+ tiles with hedges on both sides along 4+ of them, a hedge in either of the two rows beside the road (round six: a tile of verge may lie between) | +5 r1; hedgerow habitat [I3] | Wildflower Verge |

Playtest round six: the Pattern Book shows, under each hint and on each page not yet found, the valley's closest attempt and what it still wants in plain words ("1 more bench beside the well; a tree for shade within three steps of it"), with Show me to fly there (`systems/hearth/patterns/progress.ts`, inspect kind `progress`, which reads each detector's own rules). Each wish in the Wishes book says what it still wants the same way ("1 of 3 flowers within 3 steps of the home", "the walk crosses 5 tiles of grass").

**I2 patterns (6, C4C)**, looked for and hinted from Village rank on (each pattern's `rank`; hints follow the Hamlet ones in `hintOrder`):

| Pattern | Rule | Site bonus | Unlocks |
|---|---|---|---|
| Small Square | a paved open space of 3x3 tiles or more (path or street, nothing built on it) with buildings on 3+ of its sides within 2 tiles, and a bench and a lantern on it or at its edge | +8 comfort r4 | Fountain |
| Corner Cafe | a tavern, bakery or corner shop whose door lies within 2 tiles of a corner (a road tile with roads leaving at right angles), with 2+ seats and a flower piece within 2 tiles of it | +6 comfort r3 | Cafe Table |
| Village Green | an open lawn of 5x5 tiles (no building, road, water or field) holding a grown tree (mature or ornamental), with a bench on it or at its edge and 4+ homes within 3 tiles | +8 nature r4 | Maypole |
| Window Gardens | 3+ homes with window boxes side by side on one street: facing the same way, doors on one line, at most 1 tile between neighbors | +5 nature r2 | Flower Cart |
| Market Cross | a crossroads (roads leaving in all four directions) with a well or a grown tree within 1 tile and 2+ market buildings (stalls, shops) within 4 | +8 comfort r4 | Notice Board |
| Bridge Crossing | a bridge (road over water) whose two ends each have a lantern within 1 tile, with a bench within 3 tiles of an end | +6 view r3 | Lamp Post |

The six unlocks are new decor (stand-in art until C4E draws them). Detectors only look at trees near homes (Village Green) and scan the map's roads once a pass (Market Cross, Bridge Crossing); the whole pass stays under 1 ms on the village fixture.

**I3 Hearth patterns (4, C5C)**, looked for and hinted from Village rank on (`seasonsPatterns.ts`; C5D writes Town Gate and Watch Lookout):

| Pattern | Rule | Site bonus | Unlocks |
|---|---|---|---|
| Orchard Path | an orchard with 3+ path or lane tiles running along it (touching its footprint, diagonals too) and a bench within 2 tiles of the orchard | +6 nature r2; pollinator habitat | Pear Tree |
| Children's Corner | a play piece (the Swing, a Village piece) within 8 tiles of 3+ homes where children live, with a bench within 3 tiles of it; play pieces within 3 tiles of a corner belong to it | +6 comfort r3 | See-saw |
| Reading Nook | a bench with 3+ wall, hedge or fence pieces, a flower piece and a lantern within 2 tiles, and noise at its tile of 2 or less | +5 comfort r2; garden nook habitat | Arbor Seat |
| Pond Garden | a pond of 2+ tiles with 2+ flower, reed or tree pieces and a seat within 2 tiles of its water, and a path or lane within 2 tiles | +7 nature r3; wetland habitat | Reed Bed |

The four unlocks and the Swing are new decor with stand-in art until C5E draws them. The detectors look only at orchards, play pieces, benches and pond tiles, so the whole patterns pass stays under 1 ms on the village fixture (bench: `village passes`).

**Later patterns** (rules written in their iteration's planning cycle):

- **I3**: Orchard Path, Children's Corner, Reading Nook, Town Gate, Watch Lookout, Pond Garden.
  - **Town Gate** (C5D, Village rank): a built gate in a wall run (a palisade or stone wall piece beside it), with two lanterns within two tiles and a stone wall dressed with a module (C5C) within three tiles. Site bonus view +6 within 3; unlocks the gate banner.
  - **Watch Lookout** (C5D, Village rank): a built watchtower with a bench within three tiles and a view over a lane (or a better road) or water within six. Site bonus view +5 within 3; unlocks the lookout bench.
- **I4**: Arcade Street, Quiet Lane, Festival Ground, Allotments, Riverside Steps, Rooftop Garden, Bandstand Green, Old Tree Sanctuary.
- **I5**: Grand Avenue, Clock Square, Harbor Quay, Cathedral Close, Night Market, Garden City Block, and more per new valley.

Target: about 40 patterns by City, 60 with later valleys.

## Wishes [I1]

Specific, often spatial wishes; granted ones deepen bonds, ignored ones fade (P18).

**Generation** each day at 07:00:

- Active cap: `2 + floor(population / 15)`, max 12.
- Pick residents weighted toward low mood, no active wish, bond under 5.
- Pick a template whose conditions match the resident (species, traits, needs, home) and whose target is not already met. Bind parameters (their home, their workplace, the nearest market).
- Expiry: 6 days (one season) by default. Expired wishes fade quietly, no penalty.
- *As built (C3B, tune)*: at most 2 new wishes a morning; a resident's weight is 20 + (100 - mood); the same template is never active twice at one home. Distances in conditions are steps between tile rectangles (a tile touching the home is 1 step) within a rounded disk (steps squared at most n x n + n), so diagonal neighbors are within 1. The mood reward is the `wish-granted` modifier for 3 days, fading. Thank-you letters are `notify` events of kind `letter` (body, then a sign-off with the resident's name; a curious resident, or a wish whose reward has `hint`, adds a P.S. with an extra hint: the next undiscovered pattern beyond the three on show). Generation can be limited to a template list for tests and debug tools.

**Template** (content):

```ts
interface WishTemplate {
  id: string; lane: 'hearth' | 'ledger';
  text: string[];                    // variants with {name}, {place}, {species}
  when: Condition;                   // resident and town conditions to offer
  target: Condition;                 // checked hourly; true = granted
  reward: { mood: number; bond: number; unlock?: string; hint?: boolean };
  expiryDays?: number;
}
```

**I1 templates (12):**

| Wish | Target |
|---|---|
| River Bench | a bench within 2 tiles of water and within 10 tiles of home |
| Tree by My Window | a tree within 2 tiles of home |
| Bakery Nearby | a bakery within 12 tiles of home (Ledger) |
| Lantern on My Way Home | lanterns along 50%+ of the route home from work |
| A Garden Plot | a vegetable or herb plot within 3 tiles of home |
| Flowers on the Lane | 3+ flower pieces on the street in front of home |
| Somewhere to Sit | a bench within 3 tiles of home |
| A Proper Path | a road route from home to work with no grass tiles (Ledger) |
| Quiet, Please | noise at home under 3 |
| Fresh Fish | fish in stock at the nearest market stall (Ledger) |
| A Well Closer | a well within 4 tiles of home |
| Neighbors | another occupied home within 4 tiles |

**Feedback**: a wish icon above the home; the Wishes panel; selecting a wish highlights the target area as a soft ghost; on grant, the resident does a little hop, sends a thank-you letter and the Chronicle may note it (weekly digest to avoid spam).

## Festivals [I3]

One per season, day 6 from 18:00 to 22:00 (P23).

**Planning** from the start of the season:

- **Site**: a pattern site or an open area of 6x6+ tiles.
- **Layout**: temporary festival pieces (stalls, bunting, lanterns, a stage, tables, a bonfire in autumn and winter) placed like decor; removed automatically the next morning (or kept as permanent decor where allowed).
- **Menu**: up to 4 goods from stock, quantities reserved (for example pies, cider, bread, fish).
- **Music**: requires a musician resident or a bandstand; quality from both.
- **Theme twist**: a rotating secondary goal so no two festivals feel alike (a pie contest, lanterns on the water, a costume parade, a harvest display, a snow sculpture contest).

**Outcome**: attendance = residents within walking reach x mood factor x weather; joy = site charm + piece variety + menu variety and sufficiency per attendee + music + twist bonus. Rating 1 to 5 stars.

**Rewards**: town mood +5 to +15 for 2 days, bond +1 for attendees (cap per season), renown, Watch morale, a Chronicle entry with a snapshot, unlocks at milestones (first 3, 4 and 5 stars). A poor festival only yields less.

**Seasonal festivals**: Spring Blossom Fair, Midsummer Lantern Night, Harvest Supper, Winter Hearth Feast.

*As built (C5B)*:

- **Planning** (`festival.plan`, either seat, any day of the season until the evening starts): a rect of 6 to 24 tiles a side with no building, water or tree on it, or a pattern site standing now (its ground is the members' bounding box grown by 2 tiles and to 6x6). Up to four menu goods, a twist that is in season and is not the last festival's, and music: `resident` needs a musician in town (Juniper Reed, else an Artistic grown-up), `bandstand` needs Juniper's `bandstand-green` unlock. Re-planning keeps what is already put by for goods still on the menu (up to the new quantity) and sends the rest back to the storehouses. A plan belongs to its season; the 04:00 tidy on day 1 puts a stale one away.
- **Pieces**: festival pieces are locked decor that the ordinary decor tool may place while this season's festival is planned; they are flagged `festival` and listed in `festival.pieces`, and come down at 04:00 on day 1 of the next season unless kept (`festival.keepPiece`, keepable pieces only: bunting and the flower arch). A piece unlocked by a milestone is ordinary decor.
- **The day**: at 12:00 on day 6 the Generous grown-ups with the coins each buy a unit of the cheapest menu good still short at market price (`pay`, `sales`) for the table, then the menu is put by from town stock (no porters; the goods simply leave stock for the evening), never taking food below a unit a resident. At 18:00 the guests are chosen: residents whose home door is within walking reach (24 tiles) of the site, each with a chance of mood (50% at mood 0 to 100% at mood 100) times the weather (rain 70%, storm 45%, snow and fog 90%), drawn from a hash of id and day. The schedule override (priority 50) walks them to a spot on the site, after any shopping trip under way, until 22:00; then the day table sends them home. Weddings due that evening happen as C4D wrote them.
- **Outcome** at 22:00 (content `festivalTuning`): site = average charm over the site against 40 (a pattern site adds 25); variety = distinct festival pieces on the site out of 4; menu = half distinct goods put by out of 3, half units put by a guest; music = none 0, a stand-in musician 35, Juniper with her festival music 70, the bandstand 80, both 100; twist = 100 when its goal holds (pie contest: 10 pies on the menu; harvest display: 12 vegetables; lanterns on the water: within 6 tiles of open water with 2 lights on the site; snow sculptures: the river frozen and 3 festival pieces; costume parade: 8 cloth or 2 coats in stock). Joy is the weighted sum (site 20, variety 20, menu 30, music 15, twist 15); the score is joy x turnout (60% with nobody in reach coming, 100% when everyone does); stars at 20, 40, 60 and 80. A bare Hamlet green with bread and vegetables earns two stars; a planned site with a few pieces, a full table and a twist, three or more.
- **Rewards**: guests eat up to a unit each (the rest goes back to store); the mood lift (+5, 8, 10, 13, 15 by stars, two days) goes to those who came (most of the town; a town-wide lift brought Village claims forward through the mood-weighted tax in a way the tuning did not want); a bond heart for each guest (one festival a season is the cap); renown 1, 2, 4, 6, 9; the history feeds `festivalMorale`; a `festival` Chronicle entry marked for a snapshot; unlocks the first time the town reaches 3 stars (bunting), 4 (the flower arch) and 5 (the festival stage); `seasons.bestStars` for Five Stars. An unplanned day 6 is a quiet evening.
- **A site that goes** (C5X): a festival planned on a pattern site that has stopped standing by the evening (a piece moved, a home built in its corner) is still held, on the smallest ground round the site's anchor (`heldRect`, 6x6), where the guests gather and the stars are scored. Before, the evening silently never happened.
- **Together**: with both seats connected the closing dance comes at 21:00 (`together.moment { kind: 'dance' }`, the guests on the site dance in the agent frame). See `16-coop.md`.

## Nature and the Field Guide [I3]

Wildlife you invite (P24).

- **Habitat layers** (per chunk, daily): pollinator (flowers, orchards, wildflower verges), wetland (ponds, reedy banks), hedgerow (hedges, shrubs), woodland (mature forest, old trees), meadow (unmown meadow), garden nooks (walls, gardens, roofs).
- **Species** (about 30 in I3, 60 eventually), each with habitat thresholds, seasons, time of day and rarity. Examples: bumblebee, honeybee (needs a hive), peacock butterfly, common blue, ladybird, dragonfly, common frog, newt, kingfisher, wren, robin, swallow, mallard, mute swan, grey heron, firefly, glow-worm, moths, song thrush, snail, stag beetle, trout, perch.
- **Sightings** are decided by the sim (deterministic RNG) from habitat scores; the first sighting adds a Field Guide entry for both seats. The renderer shows ambient critters near qualifying habitat (cosmetic, client-side).
- **Effects**: pollinator score raises orchard and farm yields up to +20%; songbirds and frogs cut summer pest losses (pests reduce yields 0 to 15% in summer); a kingfisher marks a healthy river (achievement); a rich garden district attracts Patrons [I4].
- Wildlife never conflicts with residents: residents are folk, wildlife is wildlife (no resident species appear as wild animals).

*As built (C5C)* (`systems/nature`, content `nature.ts`):

- **Habitats**: six scores per chunk (16 x 16 tiles), 0 to 255, the sum of content's `habitatSources` (`from` a decor or building tag per piece, a module per building wearing it, a map terrain, water or tree stage per tile, a pattern site per site anchored in the chunk, or window boxes), capped at 255. Pollinator: flower pieces 10, fruit and blossom trees 8, orchards 60, herb gardens 40, window boxes 6, an Orchard Path site 30. Wetland: pond tiles 14, shallow river 3, deep river 1, reeds 25, birdbaths and fountains 10, a Pond Garden 40. Hedgerow: hedges 14, fences 3, a Hedgerow Lane 80. Woodland: mature trees 1 a tile, ornamental trees 6. Meadow: meadow tiles 1, wildflower verges 12. Garden nooks: low walls 8, planters 8, birdbaths 15, gardens 25, window boxes 10, ivy and flower boxes 30, a Reading Nook 30. The 02:00 pass scores the chunks the charm was told about since the last pass (`nature.dirty`, filled by `markChunks`) plus a rolling sixth of the map, so trees growing up are caught within six days; a valley whose habitats are all zero (new or migrated) scores every chunk. Chunks that moved go out in `habitats.updated`; the snapshot carries the scores (`ViewSnapshot.habitats`).
- **Sightings** (hourly at 140, from Village rank, when the Field Guide opens with the Village patterns and the apiary; a Hamlet's runs stay exactly as tuned): for each species in its seasons and hours, the suitable chunks are those that meet every habitat need and are watched: near homes (a chunk with a home or next to one) and with a path or lane in it or a resident outdoors. Fish need a fisher at work on open water in the chunk instead, the honeybee an apiary. With n suitable chunks the chance is rarity x min(n, 3) permille, at most 900, on the `nature` stream. A first sighting writes a Field Guide page (`species.sighted`), a Chronicle line with a snapshot (`first-sighting`, its wording picked from the nature stream) and refreshes the hints; later sightings only count. Credit goes to the seats whose pieces in that chunk add to the habitats the species needs, like pattern credit; a wild place nobody built credits the seats connected.
- **Hints**: the three commonest species not yet found (highest rarity, then id), each with content's `hint` in words a player can act on ("A pond near a garden, on spring and summer evenings"); `ViewSnapshot.fieldGuideHints`.
- **Species**: 32 (`content.wildlife`): 9 birds besides the kingfisher, 11 insects (the garden snail files under insects, and says so), 3 amphibians, 2 fish, 4 small mammals (pipistrelle, water vole, roe deer, stoat). Specialists ask for what a player builds: the kingfisher wetland 170 (the river and a pond beside it), the mute swan 200, the woodpecker 200 woodland.
- **Effects** (yield hook, `pollinators` and `pests`), from Village rank (a Hamlet's handful of plots is beneath the notice of bees and pests alike; with bees from the first day the autoplayer reached Village a season later on five seeds of eight, so the I2 Hamlet stays as tuned): a crop grower (a farm, or a gatherer of apples, herbs, vegetables or wheat) gains up to +20% at a pollinator score of 200 in its chunk; an apiary makes a quarter of its honey with no flowers about, all of it at 200 (honey rests in winter, `GoodDef.seasons`). Each summer morning every crop grower loses 15% to pests, less each Field Guide species with a `pests` effect (wren, song thrush, blue tit, swallow, ladybird, pipistrelle, common frog, common toad) whose habitat needs the farm's chunk meets: each cuts its share (a wren 30%), together up to all of it. A Hamlet's few plots are beneath a pest's notice.
- **Apiary**: a Hearth building from Village rank (20 coins, 8 planks, one keeper), gathering 2 honey in 6 hours, by the pollinator score as above.
- The season report's nature lines: new Field Guide pages, good habitat (60+) by chunks, and for the Ledger the bees' lift, the honey made and summer's pests.

## The Chronicle [I1]

The town's history, written as it happens (P25).

```ts
interface ChronicleEntry {
  id: EntityId; tick: number; kind: string;
  text: string;                 // rendered from a template at creation (deterministic)
  refs: EntityId[]; seats: SeatId[];
}
```

- **I1 kinds**: founding, household arrived, household left, first-of (first bread, first planks...), pattern discovered, wishes digest (weekly), achievement, season summary.
- *As built (C3B)*: written like a small-town gazette, three or more variants per kind (`packages/content/src/chronicle.ts`, with the phrase tables the sim stitches in: books, credits, place names, letter sign-offs). The founding entry is always first (if another kind is written in a valley's first hour, the founding goes in just ahead). The season summary is written at midnight as a season starts, after the economy closes the books; the wishes digest every seventh evening at 19:00, naming up to three granted wishes. Place names come from what stands at the spot and the nearest family ("at the well, near the Underbank cottage").
- **Later kinds**: rank-up, festival, raid, trial, wedding, birth, story step, flood, innovation, new parcel.
- **While you were away** [I1]: when a seat connects after 1+ in-game day away, the client builds a letter from entries and stat changes since that seat's `lastSeenTick`, plus notes and requests addressed to them. *As built (C3B)*: the worker's `inspect('away', seat)` returns the notable entries since the seat left (newest 12, the rest counted in `more`), the stat rows, notes from the other seat and an `opening` ("Dear Ada, / You were away for three days. While you were gone, one household moved in and four wishes came true. Bo held the fort.").
- **Snapshots** [I3]: the client captures a thumbnail for notable entries and uploads it to valley storage. *As built (C5F)*: the lowest connected seat's client takes it, keyed by the entry's id, first write wins; the gazette shows it as a small print beside the entry. Pictures stay out of sim state and, in I3, out of `.qoti` files (`21-networking-and-saves.md`, Chronicle snapshots).
- **Time-lapse** [I4]: rendered from stored periodic snapshots.
- **Claude-written letters** [I5, optional]: one client asks Claude (with an API key from settings) to write a resident letter from Chronicle data, then submits the text through a `letter.add` command, so both seats see the same text and the sim stays deterministic.

## District styles [I4]

- A style sets defaults for grown buildings: wall material (timber frame, plaster, stone, brick), plaster swatches, roof type and material, accent swatches, detail probabilities (window boxes, shutters, chimneys, ivy).
- Ledger draws districts; Hearth assigns or edits the style (P22). Grown buildings pick variant parameters from the style with RNG keyed by building id.
- Restyling an existing district costs paint and materials and is applied by builders over time.
- Starter styles: Riverside Timber, Hill Stone, Market Brick, Garden Plaster.
- Styles are keyed by era [I4] (`18-eras.md`): restyling to a newer era's style modernizes a district, and an older era's style is a revival, allowed at the same cost. An Old Town (a preserved older-era cluster) is a pattern of its own.
- *As built (C4B, I2 ahead of districts)*: the four are content (`packages/content/src/styles.ts`, ids `timber`, `stone`, `brick`, `plaster`, with names, a blurb and where each comes naturally). Until districts arrive the zoning pass picks one per lot: its neighbors' on the same side of the same road, or what the place suits (`13-ledger.md`, Zoning and growth). `Lot.style` and `Building.style` carry the id.
- As built in C4E: the art kit draws the four starter styles (ids `timber`, `stone`, `brick`, `plaster`; longer names containing them work too) from `Building.style`; see `17-presentation.md`, Village.
