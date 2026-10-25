# 12. Hearth

The Hearth lane is a complete game (P1): real rules, its own progression (Pattern Book, bonds, Field Guide, festival renown) and its own achievements.

## Charm [I1]

A per-tile integer field, 0 to 100 (P20). Stored in sim state as `hearth.charm` (Uint8Array) plus five category fields used for breakdowns and species tastes: `nature`, `comfort`, `light`, `view`, `noise`.

**Recompute** dirty chunks (and their neighbors) at most once per in-game hour, and immediately after a Hearth command in that chunk (debounced to the next tick).

**Sources** (value at the source tile, linear falloff to 0 at the radius) *(tune)*:

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

- **No spam**: for each decor type, only the 2 strongest instances within the radius count for a tile. Fifty identical benches add no more than two.
- **Variety**: +2 per distinct decor type within 3 tiles, up to +10.
- **Clutter**: more than 12 decor items within 2 tiles gives -5.
- **Enclosure**: an open tile (no building, not a road wider than a lane) with buildings on 3 or 4 sides within 4 tiles gets +5 (squares feel good).
- Pattern site bonuses add on top (below).

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

- Each in-game hour, run every pattern's detector over dirty chunks. A detector returns site instances `{ anchorTile, members: EntityId[] }`.
- Instances are keyed by `(patternId, anchorTile)` so they are stable. An existing instance whose members change is re-validated; an invalid one is removed with its bonus.
- **First valid instance anywhere** = discovery: Book entry, Chronicle line, both seats notified. The seat that placed most member pieces is credited; if both seats placed members, the discovery also counts for "Built Together".
- Every valid instance (not only the first) applies its site bonus.
- The Book shows discovered pages (name, flavor, first site snapshot, date, credit) and hints for 3 undiscovered patterns at a time; each discovery reveals the next hint. Curious residents' letters can reveal extra hints.

**I1 patterns (8):**

| Pattern | Rule | Site bonus | Unlocks |
|---|---|---|---|
| Well Gathering Place | a well with 2+ benches within 2 tiles and a tree (tile or ornamental) within 3; 3+ homes within 8 | +8 r4 | Curved Bench |
| Sitting Wall | 4+ low-wall segments in a continuous line (gaps under 0.2 tile) beside a path, with flowers or hedge on the side away from the path | +6 r3 | Planter Wall |
| Tree Place | a mature or ornamental big tree with 2+ benches within 1.5 tiles, and path tiles leading off in 2+ directions within 2 tiles | +8 r3 | Ring Bench |
| Pocket Park | an area of 2x2 to 4x4 free tiles holding 1+ tree, 1+ bench and 2+ flower pieces, with buildings on 2+ sides within 2 tiles | +6 r3 | Birdbath |
| Kitchen Garden | a home with 2+ vegetable or herb plots within 2 tiles of its footprint and a fence or hedge beside them | +5 r2; household food +1 per day | Herb Planter |
| Lantern Walk | a continuous path or lane of 10+ tiles where every run of 3 consecutive tiles has a lantern within 1 tile | +6 light along the walk; night safety [I3] | Hanging Lantern |
| Promenade by the Water | 8+ consecutive path tiles each next to water, with 2+ benches and 2+ lanterns along it | +10 r2 | Mooring Post; otter arrivals favored |
| Hedgerow Lane | a path or lane run of 6+ tiles with hedges on both sides along 4+ of them | +5 r1; hedgerow habitat [I3] | Wildflower Verge |

**Later patterns** (rules written in their iteration's planning cycle):

- **I2**: Small Square, Corner Cafe, Village Green, Window Gardens (3+ customized homes in a row), Market Cross, Bridge Crossing.
- **I3**: Orchard Path, Children's Corner, Reading Nook, Town Gate, Watch Lookout, Pond Garden.
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

## Nature and the Field Guide [I3]

Wildlife you invite (P24).

- **Habitat layers** (per chunk, daily): pollinator (flowers, orchards, wildflower verges), wetland (ponds, reedy banks), hedgerow (hedges, shrubs), woodland (mature forest, old trees), meadow (unmown meadow), garden nooks (walls, gardens, roofs).
- **Species** (about 30 in I3, 60 eventually), each with habitat thresholds, seasons, time of day and rarity. Examples: bumblebee, honeybee (needs a hive), peacock butterfly, common blue, ladybird, dragonfly, common frog, newt, kingfisher, wren, robin, swallow, mallard, mute swan, grey heron, firefly, glow-worm, moths, song thrush, snail, stag beetle, trout, perch.
- **Sightings** are decided by the sim (deterministic RNG) from habitat scores; the first sighting adds a Field Guide entry for both seats. The renderer shows ambient critters near qualifying habitat (cosmetic, client-side).
- **Effects**: pollinator score raises orchard and farm yields up to +20%; songbirds and frogs cut summer pest losses (pests reduce yields 0 to 15% in summer); a kingfisher marks a healthy river (achievement); a rich garden district attracts Patrons [I4].
- Wildlife never conflicts with residents: residents are folk, wildlife is wildlife (no resident species appear as wild animals).

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
- **Later kinds**: rank-up, festival, raid, trial, wedding, birth, story step, flood, innovation, new parcel.
- **While you were away** [I1]: when a seat connects after 1+ in-game day away, the client builds a letter from entries and stat changes since that seat's `lastSeenTick`, plus notes and requests addressed to them.
- **Snapshots** [I3]: the client captures a thumbnail for notable entries and uploads it to valley storage.
- **Time-lapse** [I4]: rendered from stored periodic snapshots.
- **Claude-written letters** [I5, optional]: one client asks Claude (with an API key from settings) to write a resident letter from Chronicle data, then submits the text through a `letter.add` command, so both seats see the same text and the sim stays deterministic.

## District styles [I4]

- A style sets defaults for grown buildings: wall material (timber frame, plaster, stone, brick), plaster swatches, roof type and material, accent swatches, detail probabilities (window boxes, shutters, chimneys, ivy).
- Ledger draws districts; Hearth assigns or edits the style (P22). Grown buildings pick variant parameters from the style with RNG keyed by building id.
- Restyling an existing district costs paint and materials and is applied by builders over time.
- Starter styles: Riverside Timber, Hill Stone, Market Brick, Garden Plaster.
