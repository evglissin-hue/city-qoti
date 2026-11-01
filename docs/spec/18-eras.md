# 18. Eras

As the town climbs the ranks it moves through three eras (P44): the Old Age, the Age of Steam and the Bright Age. Each era brings a look, its machines and new rules in both lanes, and the older eras stay standing beside the new. It stays cozy throughout: the Bright Age stops around the 1950s, and the valley never becomes a modern metropolis.

Agreed by the owner on 2026-11-01, with Kat's nod pending (`01-principles.md`). Each era's look follows the visual direction in `17-presentation.md`. Era state and the Age of Steam land with I4 Town, the Bright Age with I5; V1 only reserves the data.

## The three eras

| Era | Ranks | Lands | Feels like | Look |
|---|---|---|---|---|
| Old Age | Hamlet, Village | today | a storybook late medieval market village | thatch, timber frames, plaster, wattle, dry stone, oil lanterns, wells, dirt lanes and the first cobbles |
| Age of Steam | Town, Market Town | I4 | a picture-book canal town of the 1800s | brick, slate, mansards, glass, ironwork, canals and barges, gas lamps, chimney stacks |
| Bright Age | City | I5 | storybook modern of the 1920s to 1950s (think *Kiki's Delivery Service*) | stucco in soft colors, art deco touches, electric street lights, tram wires, a railway station, cafes with awnings |

**Old Age**: what the game is today. Ledger: work by hand and by water (the Water Wheel), porters, carts and wheelbarrows. Hearth: wells, greens, kitchen gardens and lantern walks. Challenge: bandit gangs, winter wolves, the great owl (`14-challenge.md`).

**Age of Steam** [I4]:

- Ledger: steam as a production method beside hand and water (more output, needs coal, makes smoke); coal from a pit or by barge; canals, barges and the River Dock as the freight network; the horse tram; the Printing Press and Glassworks; factory rows with shifts. **Smoke** is a Charm cost that drifts downwind, so where industry goes is a real argument between the lanes (P2).
- Hearth: patterns of the era, such as a Victorian Park with a bandstand, a Shopping Arcade, a Glasshouse, a Canal Promenade; brass band Sundays; a new festival theme per season *(tune)*; waistcoats, bonnets and boaters.
- Challenge: smugglers on the canal, river raiders, a factory fire (a mill catches; pumps and a fire crew from the Watch House).

**Bright Age** [I5]:

- Ledger: electric as a production method (clean, needs a power station and wires along streets); the electric tram replaces the horse tram on the same lines; the railway and its station; a department store; a few delivery vans as ambient life only.
- Hearth: patterns such as a Tram Stop Cafe, a Picture House, a Lido, a Rooftop Garden; radio evenings; jazz on the bandstand; cardigans, cloche hats and bicycles.
- Challenge: gentle, written in I5 planning. Candidates: storms, floods, a runaway tram; the Watch becomes a constabulary on bicycles, and bandits retire into legend (and the Chronicle).

**The cozy ceiling**: no skyscrapers, no highways, no car traffic simulation (the "Not doing" list in `01-principles.md`). Streets stay human-sized: four storeys at most outside landmarks *(tune)*. A City of 2,000 woodland folk is a small, lively town, and it should look like one.

## Rules

- **Eras layer, never replace.** A building keeps the era it was built in, through upgrades and repairs. New growth and newly placed pieces use the current era. A Town therefore has an Old Age core inside Steam-era rings, the way real towns grew.
- **Restyling** (`12-hearth.md`, District styles) is the opt-in way to modernize: a district's style names its era, and builders apply it over time for paint and materials. Choosing an older era's look on purpose (a revival) is allowed and costs the same.
- **Older pieces stay buildable.** Content defs list the eras they belong to; pieces from earlier eras remain in the pickers (an oil lantern in a gas-lit town is charming), pieces from later eras appear when their era arrives.
- **No time skip.** The calendar keeps counting and residents live through the change. The anachronism is storybook license, the way Toad's motor car shares the riverbank with picnic baskets in *The Wind in the Willows*.
- **The era opens the palette, innovations bring the machines** (P41). The morning after a new era, builders know brick and slate; the first steam mill still waits for its innovation. Candidates, rows written in I4 and I5 planning: Steam Engine (Town, a coal stock and a smithy), Electric Light (City, a power station), Electric Tram (Electric Light and a tram line).
- **Every era changes how you play** (P6). An era that is only a reskin is not done: each must add at least one system or constraint per lane.

## The era moment [I4]

When the Town Charter is sealed by its weathered trial, the valley enters the Age of Steam; the City Charter's opens the Bright Age. Village and Market Town stay in their era.

- A Chronicle chapter with a title page ("The Age of Steam"), a title card across both screens, and fireworks (C5E's rank-up fireworks).
- The music changes its band: acoustic for the Old Age, a brass band joining in the Age of Steam, jazz and a radio crackle in the Bright Age (`17-presentation.md`, Audio).
- Clothing follows over the next season, a few households a day, so the change ripples through the streets instead of snapping.
- The Charter board lists what the new era opens in both lanes.

## Old Town [I4]

A Pattern Book pattern for a preserved older-era cluster *(rule written in I4 planning)*: about 6+ buildings of an earlier era than the valley's, close together and never restyled, around a gathering place (a square, a well, a fountain). Site bonus: Charm +6 *(tune)*, more visitors and tourism coins. Unlocks: heritage plaques and an old town lantern.

This is the P2 tension of the eras. The Ledger wants denser, newer rows (more homes per frontage, higher tiers, steam in the workshops); the Hearth wants to keep the old core. Redeveloping an Old Town building is always allowed, and it always breaks the site.

## Data

| What | Where | Lands |
|---|---|---|
| `Era` = `'old' \| 'steam' \| 'bright'` | `packages/content/src/types.ts` | V1.0 (reserved, additive) |
| `eras?: Era[]` on building, decor and road defs (absent means every era) | content types | V1.0 (reserved), filled in I4 |
| `StyleDef.era` | content styles | I4 |
| Valley `era`, set by the system that seals a Charter, with an `era.changed` event | sim state | I4 |
| `Building.era`, set when built from the valley's era, changed only by restyling | sim state | I4 |
| Art kits take `era` beside `style` | `packages/art` | V3 (Steam), V4 (Bright) |

The sim state lands with a `SAVE_VERSION` bump and a migration that sets every existing valley and building to `'old'`, with a test (`21-networking-and-saves.md`). The sim never reads an era for anything but rules; looks are the renderer's business.

## Iterations

- **V1**: reserves `Era` and `eras` in content types; the art kit's materials are built so an era is a new parameter set, not a rewrite.
- **I4 and V3**: era state, the Age of Steam kit and systems, the era moment, restyling across eras, Old Town, the Steam threats.
- **I5 and V4**: the Bright Age kit and systems, grand landmarks, the Bright threats.
