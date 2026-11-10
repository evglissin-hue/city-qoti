# 30. Roadmap

Each iteration (gameplay I0 to I5, with the redesign's R1 to R3 between I3 and I4; visual V1 to V6; V0 was a concept) ends with something both players can play on the live link (P54), a playtest (`22-quality.md`), and an integration cycle that writes the next iteration's briefs. Cycle ids refer to `docs/build/`.

**Where things stand (2026-11-10)**: I0 to I3, V1 and P1 are built. The owner then asked for a step back, and the redesign below is the plan of record: next come **V2 Light and green** and **R1 Zones first**, side by side.

## I0 Valley sandbox

**Goal**: two laptops open a link and build together in a beautiful generated valley.

**Cycles**: C1 foundation (serial) → C2A world and sim, C2B render and art kit, C2C co-op and saves, C2D client UX (parallel) → C2X integration.

**Scope**: valley generation; terrain with heights, river, forests; paths and lanes with bridges; buildings (cottage, house, well, shed, windmill, town hall) with foundations; decor and linear decor; tree planting and removal; day and night; tilt-shift miniature look; quality presets; camera for mouse and trackpad; tools with ghost previews; Hearth and Ledger lens skeleton; presence (cursors, pings, emotes); notes; guardrail on removing the partner's work; time controls with the co-op speed rule; online valleys on Cloudflare; offline solo valleys; snapshots, backups, export and import; desync detection; debug overlay; gallery.

**Acceptance**:

- Create a valley on one laptop, open the invite on the other: both connected within 10 s, each sees the other's cursor.
- 30 minutes of building together (paths, buildings, decor, trees) with identical results on both screens and matching hashes throughout.
- Close both tabs; reopen the next day: the valley is exactly as left. A backup can be restored and a `.qoti` export imported.
- A solo valley works with the network off.
- 60 fps on Medium on the weaker laptop with 300 buildings and 3,000 decor in view.
- Day and night with lit windows and lanterns; it looks like a storybook miniature.
- The game is live on the Cloudflare URL.

## I1 Hamlet

**Goal**: a living hamlet. Residents arrive with names, homes, jobs and wishes; the first chains work; each lane has real gameplay.

**Cycles**: C3.0 hamlet contracts (serial) → C3A residents, C3B Hearth v1, C3C Ledger v1, C3D hamlet art and rendering, C3E hamlet UI (parallel) → C3X integration and I2 planning.

**Scope**: standard valley and starting state; residents (species, traits, names, households, arrival and departure, schedules, movement, needs, mood, friendships, bonds); I1 buildings and goods; construction; porters and logistics; consumption; budget, peddler, lean times; economy dial; Charm and its overlay; Pattern Book with 8 patterns; wishes with 12 templates; Chronicle and the while-you-were-away letter; achievements (10); customization phase 1; undo; resident and building inspectors; Ledger reports and overlays (flows, coverage, status); woodland folk with walk animations; construction stages.

**Acceptance**:

- From founding, a hamlet reaches 30 residents in about two evenings of play without dead ends.
- Every I1 building works and shows its status; food reaches every home; the budget and lean times behave as specified.
- All 8 patterns can be discovered, all 12 wishes can be granted, all 10 achievements can be earned.
- The Ledger player has a reason to look at reports; the Hearth player has a reason to look at wishes and the Pattern Book; each needs the other at least once per evening.
- The hamlet bench stays within budget; hashes still match over a full evening.

**As built (C3X)**, with evidence:

- Growth: the autoplayer (`tools/bench/src/autoplay.ts`) plays a sensible Ledger and Hearth; seeds reach 20 to 41 residents by in-game day 18 (three evenings), most 28+, with no lean times, departures or famine (`autoplay.test.ts` holds willow and hazel to 28+). Human players who tend the Hearth side better should beat it; the first playtest will tell.
- Buildings, food and budget: per-building production at full and partial staffing, construction, logistics reservations, outlets, taxes, upkeep, the peddler and lean times are unit tested (`packages/sim/test/ledger`); a three-day run from the standard start keeps food ahead of eating (`tools/bench/src/hamlet.test.ts`).
- Patterns, wishes and achievements: each of the 8 detectors has positive and negative fixtures, each of the 12 wish templates is generated and granted, each of the 10 achievements unlocks (`packages/sim/test/hearth`).
- Each lane needs the other: residents' wishes ask for Ledger things (a bakery, fish at the stall, a proper path) and Ledger growth needs residents, who come for charm and leave over unhappiness; the alert feed tells each lens what to look at.
- Budgets: hamlet tick 0.03 to 0.06 ms, 2,000-resident movement 0.5 ms, charm under 2 ms per chunk, patterns under 3 ms per hour (`npm run bench`); the i1-hamlet golden script hashes the same twice in Node and in a browser worker.
- Looks: an autoplayed 30-resident hamlet (Thistlecombe, seed willow) at day, close up, dusk and night, under 130 draws and 0.9M triangles on Medium (`docs/build/screenshots/c3x-*.png`, shot with `apps/client/e2e/c3x-shots.mjs`).

## I2 Village

**Scope**: Village Charter; zoning and organic growth; market prices, wages and household budgets (money invariant tested); Craftsfolk tier and home upgrades; goods and chains: clay and bricks, wool to cloth, dairy and cheese, orchards and cider, firewood, herbs, tools; carts; streets and traffic; school, tavern, herbalist; Trading Post, Millhaven and Stonecross, standing orders; loans; plans layer and requests; story characters (Pippa Quill, Odette Fenwick, Juniper Reed); first innovations (wheelbarrows, carts, cobbles, brick kiln, water wheel); 6 new patterns; couples, weddings, births, apprenticeships, retiring; desire paths; terraforming; stairs; minimap; moving a solo valley online.

**Cycles**: C4.0 village contracts (serial) → C4A market and money, C4B growth, C4C village chains, services and tiers, C4D lives, story characters and co-op tools, C4E village art, C4F village UI (parallel) → C4X integration, tuning and I3 planning.

**As built (C4X)**, with evidence:

- From the standard start the autoplayer claims the Village Charter by itself on day 25 to 37 (five seeds), then grows to 138 to 268 residents by day 90 with no lean days and no departures (`tools/bench/src/autoplay.test.ts`, `npm run tune -w @qoti/bench`, the Village half, which C5.0 made the default run):

  | Seed | Village day | Pop / Craftsfolk d60 | Pop / Craftsfolk d90 | Craftsfolk peak | Owed max → d90 (coins) |
  |---|---|---|---|---|---|
  | hazel | 25 | 115 / 0 | 138 / 0 | 0 | 1500 → 0 |
  | willow | 31 | 164 / 0 | 268 / 12 | 22 | 2115 → 66 |
  | oak | 31 | 148 / 0 | 209 / 0 | 12 | 1971 → 0 |
  | alder | 37 | 119 / 0 | 183 / 6 | 18 | 3600 → 3600 |
  | rowan | 35 | 109 / 0 | 181 / 18 | 22 | 1214 → 0 |

- Money: the invariant (`treasury + savings - external` never changes) holds in every economy test and a 10-day village run; from Village rank upkeep is paid to the village's own households, so loans come down again on four of five seeds.
- Not met: 40 Craftsfolk by day 90. The autoplayer peaks at 0 to 22, held back by its own timber and cloth strategy (woodcutters left on felled patches, yarn waiting for a weaver) more than by the rules; the first human playtest decides how much further to lower the bar.
- Integration fixes found by running everything together: the Trading Post costs no bricks (a new Village could not trade before its kiln); every workplace gets its first hand before any gets a second; extra porters are hired while goods pile up, and wheelbarrows carry 8; from Village rank, construction deliveries compete with workshop inputs instead of waiting behind them; taverns and herbalists serve 14 tiles and 100 residents; Craftsfolk need 20 coins put by.
- Looks: an autoplayed village of 130 at day 70 draws 97 to 152 calls and 0.8M to 1.15M triangles on Medium; the I1 playtest's walking, lag, menu icon and lantern notes are fixed and live.

## I3 Seasons and the Watch

**Scope**: seasons (seasonal farming, frozen river, warmth and firewood); weather and events (flood, drought, early frost, cold snap, travelling circus); festivals; habitats and the Field Guide (about 30 species); threat pressure, telegraphing, bandit gangs and winter wolves; defenses; the Watch and raid resolution; threat dial; River Dock; commissions; renown; customization phase 2 (modules); photo mode; Chronicle snapshots; 6 new patterns; together moments; story characters Mother Thornbury and Barnaby Ashcombe; the first winter trial for Village; music, ambience and sound effects from CC0 recordings (pulled forward from I5); a guide for a new valley's first days.

**Cycles**: C5.0 seasons contracts (serial, with C4P roads and folk polish alongside) → C5A seasons and weather, C5B festivals and renown, C5C nature and the Field Guide, C5D threats and the Watch, C5E seasons art, C5F seasons UI, C5G music and sound, C5H the first days guide (parallel) → C5X integration and I4 planning. C5E waits for V1 (below) and then builds the seasons, festivals and defenses on the new look; the other I3 cycles own sim and UI paths and run alongside V1.

**Acceptance** (C5.0, from C5X's proposal):

- A Village prepares for and gets through its first winter: everyone fed on stored food, everyone warm, the trial weathered; unprepared, some are cold and a few leave, and nothing worse.
- Every season ends in a planned festival whose stars follow its site, menu, music and twist; a 5-star festival is reachable.
- Every raid is telegraphed with time to prepare; defenses, lanterns and the Watch visibly change its outcome; nobody is hurt and every loss can be rebuilt; captured bandits can join the town.
- About 30 species can be found; the Field Guide fills for both seats; bees and songbirds change yields.
- Weather and events (flood, drought, early frost, cold snap, circus) are forecast and felt in both lanes.
- Renown, commissions, the River Dock, modules, photo mode and Chronicle pictures work; the 6 new patterns and 5 new achievements can be earned.
- Each lane has seasonal work and needs the other (festival supplies, winter stock, walls dressed for charm, morale from festivals).
- Music follows the hour and the season, ambience follows the camera, and every recording is CC0 and credited.
- A new standard valley's first days are guided for both lanes, and the guide can be hidden by either player.
- Benches within budget at Village scale in winter, during a festival and during a raid; hashes match over a full year, including a raid, in Node and a browser worker.

**As built (C5X)**, with evidence (part 1 #22 merged and tuned the gameplay wave; part 2 tuned the rest, fixed the dead ends below and shipped; the two-player evening is `docs/playtests/I3.md`):

- [x] **The first winter**: the autoplayer (`npm run tune:summary -w @qoti/bench`, every system on, threat Standard, 72 days) weathers The First Winter first time on all four seeds (willow, hazel, oak, alpha), no household leaves, every winter is eaten through on stored food, and no household is cold in any winter but oak's third (22 on its last day, a cold snap with its sheds short of hands). Unprepared: a household with no firewood is cold, cross and counted, and nothing worse (`packages/sim/test/seasons/warmth.test.ts`, `trials.test.ts`).
- [x] **Festivals**: one every season on every seed; 3 stars or more in the first Village year on all four; 5 stars on hazel and oak (`tools/bench/src/advisors/festivals.test.ts` holds willow and hazel to it Peaceful); stars follow site, pieces, menu, music and twist (`packages/sim/test/festivals`).
- [x] **Raids**: every raid telegraphed (band, side, days, signs), 2 to 4 a run, losses 32 to 88 units and recovered with no lean days, some held outright; walls, lanterns and the Watch move the outcome and captives can join (`packages/sim/test/threats`, C5D). Nobody is hurt.
- [x] **Nature**: 32 species in content; 17 to 22 in the autoplayer's first Village year; the Field Guide is per valley and shows to both seats; bees and songbirds are yield modifiers (`packages/sim/test/nature`).
- [x] **Weather and events**: flood, drought, early frost, cold snap and the circus forecast on the season card and felt in both lanes (C5A tests, C5F's season card).
- [x] **Renown, commissions, the River Dock, modules, photo mode, Chronicle pictures**; 6 new patterns and 5 new achievements with detector and unlock tests (C5B, C5C, C5E, C5F).
- [x] **Each lane needs the other**: festival menus and winter stock share one larder, walls carry charm, festival morale feeds the Watch.
- [x] **Music and sound**: the hour, the season and the camera (C5G). Every sound is synthesized in the browser or a CC0 recording (VSCO-2 CE), credited in the manifest; the CC0 hosts were blocked in the build container, so most of the score is synthesized, as the owner allowed.
- [x] **First days guide** for both lanes, hidden by either seat (C5H, `c5h-guide.spec.ts`).
- [x] **Benches and hashes**: every sim budget met at Village scale (seasons day 0.5 to 0.8 ms, festivals 0.46 ms an outcome, habitats 1.8 ms a day, raids 0.18 ms a tick and 0.85 ms the daily pass; the charm chunk's dense block at night sits at 1.4 to 2.3 ms against 2 ms in this container, the same on `main`); a year of the threat fixture with its raid hashes the same in Node and a browser worker (`determinism.spec.ts`), and two browsers play a year online with all 24 daily hash checks matching and no resyncs, through a drought, an early frost, a cold snap and the frozen river (`c5x-year.spec.ts`, `QOTI_YEAR=1`).

| Seed | Village day | Festivals (stars by season) | Species, first Village year | Raids | Loans at the end (peak) | Lean days | Cold households | Trial |
|---|---|---|---|---|---|---|---|---|
| willow | 19 | 1 3 2 2, 3 4 4 3 | 17 | 3, lost 32 to 40, 3 caught | 111 (1,598) | 0 | 0 | weathered first time |
| hazel | 19 | 2 4 3 2, 5 4 4 4 | 21 | 3, lost 48 and 56, one held | 225 (1,740) | 0 | 0 | weathered first time |
| oak | 30 | 2 2 2 2, 3 5 4 3 | 18 | 2, lost 48 and 88 | 2,325 (2,564) | 0 | 22 on the last day (year 3) | weathered first time |
| alpha | 13 | 3 4 4 3, 3 4 3 3 | 22 | 4, lost 48 and 56, two held | 0 (1,349) | 0 | 0 | weathered first time |

Left for humans: the two-player evening on the live link (`docs/playtests/I3.md`) and the laptop numbers (`docs/playtests/V1.md`).

## Visual overhaul (V iterations)

The look gets much more detailed and stays cozy (owner, 2026-11-01; `17-presentation.md`, Visual direction; `18-eras.md`). Like the gameplay iterations, each V iteration is a serial contracts cycle, a parallel wave and an integration cycle, ends playable on the live link and gets a playtest evening. V iterations interleave with the gameplay ones: a V wave owns render and art paths, so gameplay cycles that own sim and UI paths can run beside it.

### V0 Concept and direction (done)

The concept viewer (`docs/concepts/v0-look/index.html`) with three directions, three eras and three times of day, and a live fps, draw call and triangle readout; stills (`docs/build/screenshots/v0-*.jpg`); this eras doc; the budgets by preset (`22-quality.md`). The owner and Kat picked B, the Painted Miniature (2026-11-01). The owner measured the first concept at about 20 to 25 fps on High, so the concept was rebuilt on the lean renderer (`20-architecture.md`, Lean renderer [V1]) to prove the look can run on the weaker laptop; the first engine stays as `docs/concepts/v0-look/v1-engine.html` for comparison. The V1 briefs are written (`docs/build/cycle-v1-*.md`).

### V1 Look foundation (done in V1X, 2026-11-03; the laptop runs and the playtest evening still to come)

Runs alongside the I3 wave's C5B, C5C, C5D, C5F and C5H; C5E waits for V1X.

**Cycles**: V1.0 look contracts (serial) → V1A materials and light, V1B buildings detail, V1C ground, water and nature, V1D lean renderer (parallel) → V1X integration.

- **V1.0 look contracts**: the per-vertex surface id every kit writes and its table; palette 2.0 from the B concept; the pattern texture array interface; `Era` and `eras` reserved in content types; render layers marked static or moving; the quality presets with Ultra; a GPU timer in the `?debug` overlay; the split of `renderer.ts` and `post.ts` so V1A and V1D never share a file; fixed scenes (the hamlet, the village of 130, a 1,000-building town with 2,000 synthetic residents) with a shots script and a perf script that measures moving and idle frames.
- **V1A materials and light**: the Lambert-based kit material with the pattern array generated in code (brick, curved clay tiles, slate, thatch, plaster, timber, cobbles, flags, grass with flowers and the rest), palette 2.0, sky fresnel and sun glint on glass and water, warm haze, night windows and lamp pools, the season, snow and sway hooks on the new material, and the final pass's look (grade, tilt-shift, bloom, tone mapping).
- **V1B buildings detail**: the B detail kit on every generator (frames, sills, lintels, string courses, cornices, roof courses, eave and verge boards, dormers, chimney pots, shutters, window boxes, ivy), joined facades and party walls where neighbors touch, a near and a far level for every kit, baked vertex AO.
- **V1C ground, water and nature**: ground variety (mown grass, meadow, worn edges, soil you can see), kerbs and road edges, the ground AO texture and its chunk updates, trees v2 with two levels, water and banks, blob shadows under residents and carts.
- **V1D lean renderer**: one scene pass, a quarter resolution blur chain and one final pass; cached sun shadows; level choice per preset; the still-frame cache (idle frames draw only the moving layers); dynamic resolution judged on moving frames with a cool-down; Ultra; the budgets measured on both laptops.
- **V1X integration**: merges and tunes; before and after shots of every scene; fps and GPU time from both laptops on each preset, moving and idle; a playtest evening; C5E's brief updated; planning notes for V2 and V3.

**As built (V1X)**: V1A, V1B and V1C merged on V1D (PRs #13, #14 and #16). Before and after shots of every scene are `docs/build/screenshots/v1-before-*.png` and `v1-after-*.png`, with side-by-side sheets (concept, before, after) in `v1x-compare-*.jpg`. Software numbers (`22-quality.md`, As built V1X): the town on Medium moves at 0.58 M triangles (2.66 M before V1) in 122 draws, and with the sim held every rest frame is idle. V1X fixed resting redraws (static layers that invalidated on sim changes that changed nothing), retired the classic chain, and turned the day sun to the concept's height and azimuth so shadows read from the default camera. Left for humans: the laptop perf runs and the playtest evening (`docs/playtests/V1.md`).

**Acceptance**: the scenes read as the B concept from the default camera and close up, by day, golden hour and night; every budget in `22-quality.md` holds on the weaker laptop on Medium, moving and idle; nothing in the sim changes, and hashes match.

### The V iterations after V1, renumbered (2026-11-10)

The redesign added a second pass on the look (`17-presentation.md`, Visual direction, second pass), so the visual iterations now run V2 to V6. Older notes and briefs use the old numbers: their V2 (streets that feel like a town) is now part of V3, their V3 (the Age of Steam) is V5 and their V4 (the Bright Age) is V6.

| Iteration | What | Runs beside |
|---|---|---|
| V2 Light and green | measuring both laptops; the light map and rooms behind windows; painted trees, meadows and flowers; what V1 left half-wired | R1 |
| V3 Yards, streets and the long view | the dressing layer; rows, gardens and corners (the old V2); the horizon, haze and river; the endpaper map | R2 |
| V4 The developing picture | rest-frame refinement; ink-and-wash pictures and illustrated books; tea-break mode | R3 |
| V5 Age of Steam | the Steam kit (was V3) | I4 |
| V6 Bright Age and grand landmarks | the Bright Age kit (was V4) | I5 |

A V wave owns render and art paths and touches no sim state, so it runs beside a gameplay wave that owns sim, content, bench and UI paths, as V1 ran beside I3. V2 to V4 are specified with the redesign below. V5 and V6 are as planned before:

- **V5 Age of Steam (with I4 Town)**: the Age of Steam kit (brick, slate, mansards, ironwork, gas lamps, canal locks, barges, works with stacks and smoke), the era moment at the sealed Town Charter, restyling across eras, the Old Town pattern (`18-eras.md`). Lamps of the era color the light map.
- **V6 Bright Age and grand landmarks (with I5)**: the Bright Age kit (stucco, art deco touches, electric lamps, tram wires, the station), grand landmarks.

## P1 Quality audit and polish (before I4)

The owner's call (2026-11-04): before going wide with I4 Town, a quality audit and polish pass over what I0 to I3 and V1 already ship: the rough edges, the playtest flags, the follow-ups the wave PRs listed, performance on the laptops. The owner starts it. No I4 briefs are written until P1 is done; C5X, which was to write them, ships I3 and stops there.

*As built (P1, 2026-11-08; brief `docs/build/cycle-p1-polish.md`)*: the owner's playtest of 2026-11-08 listed nineteen items; P1 ran them through the new build and review loop (`31-parallel-development.md`): an Opus master tracing and briefing, Sonnet executors in two waves, then quality checks, the dead-end hunt and the player's chair. Fixed: the town hall that could be removed and never rebuilt, the well wish asked from inside a well's radius, festival planning that seemed to do nothing, dead-end wishes, land that could not be flattened (Earthworks), wheat only in spring, stone running dry at the windmill, residents walking through each other. Added: a goal pill, a calmer and more iconic top bar, a Stores panel, the end of the Village chapter with valleys named from their seed, colored window boxes and five pieces that help the work, fuller meadows and trees, a real summer night, homes that dress themselves up, the first slice of callings, peddler imports and a simple trade overview, and the playability audit that hunts dead ends from now on.

**For I4, from the owner's 2026-11-08 notes** (beyond what P1 shipped): zoning that improves buildings further (the dressing ladder is a first rung; more steps and earlier, once the economy's growth can take it), callings that deepen at the Town Charter with district policies, tourism and pilgrim buildings (the inn, the chapel, the guest house), a trade overview that grows with Port Amberly, resident animation beyond keeping apart (the playtest asked for livelier figures and smarter walking), editing an open plan in place (`plan.edit` has no button yet; plans are set aside and redrawn), and fluffier meadows still (the tufts read a little spiky up close).

*2026-11-10*: the redesign takes most of these: zoning that runs the economy is R1, callings are earned in R3, the trade overview is R1's Balances book, livelier figures with somewhere to go are R2's round, and the meadows are V2's. Editing an open plan in place goes into R1's interface cycle.

## The redesign (2026-11-10)

The owner asked for a step back and a few moonshots: a look that really shines within what the laptops can draw, a real connection between the cozy lane and the economy, a clearer interface, and an economy without thirty chains. The findings and designs are in `17-presentation.md` (second pass, and the redesign's interface), `19-evenings.md` and `13-ledger.md`; the principles amended are listed at the top of `01-principles.md`. The owner's calls on the day: all of it; **start fresh** (no valley is converted); **two laptops, online** (no couch mode).

**Order of work.** Three pairs, each a look wave beside a gameplay wave, each ending playable with a playtest evening:

| | Look (render and art paths) | Gameplay (sim, content, bench and UI paths) |
|---|---|---|
| 1 | V2 Light and green | R1 Zones first |
| 2 | V3 Yards, streets and the long view | R2 The evening round |
| 3 | V4 The developing picture | R3 Masters and the Town Book |

Then I4 Town with V5, and I5 with V6. Within a pair the waves share no files: R1's art cycle keeps to the building kits (`packages/art/src/kits/` for buildings, workplaces and services) while V2 holds materials, patterns, surfaces, nature, props and the renderer. Across pairs: V3's dressing needs R1's businesses and its rows need R2.0's lot fields, so V3 starts after R1X and R2.0; the endpaper map's two inks are wired by whichever of V3X and R2X lands second.

Every wave runs the build and review loop (`31-parallel-development.md`), and each of its integration cycles writes the next wave's briefs.

### R1 Zones first

**Goal**: a fresh valley grows from a hamlet to a Village and through its first winter on the zones-first Ledger: the players zone, site a dozen specialized buildings and read five balances, and the town builds, staffs and supplies itself.

**Cycles**: R1.0 zones contracts (serial; it may remove the chain economy's contracts, `20-architecture.md`, Redesign outline) → R1A the economy core (goods and families, baskets, prices, tiers by amount and variety, the carrier), R1B land and businesses (trades and how they are chosen, levels, the farmland kinds, specialized buildings with reach, the season plan), R1C the Ledger's interface (the calmer top bar with demand bars and balances, the Build picker's shelves, the Balances, Purse and Businesses books, cards that wait their turn, editing a plan in place, the help card), R1D the Hearth's tools and the first days (the composing helpers and move, the guide's letters, story arcs, wishes and festival menus in the new goods), R1E art for trades (looks by trade and level from the kits that exist, the Brickworks, Granary, Market Square and Forester's Lodge), R1F the bench (new advisors, the audit's health kinds, the lanes test, the decisions count) (parallel) → R1X integration and tuning.

**Scope**: `13-ledger.md` in full but its [R2], [R3] and [I4] notes; `12-hearth.md`, Decorating that composes itself and the [R1] notes; `11-residents.md` [R1] notes; `14-challenge.md`, the closed pass; the Village Charter in the new terms (`15-progression.md`); the fresh start (`21-networking-and-saves.md`).

**Acceptance**:

- A new standard valley is guided through its first days in the new terms and reaches Village rank in about two evenings; it weathers its first winter when the season plan's reserve is met, and with half the reserve and the pass closed some households are hungry or cold and nothing worse.
- The tuning targets in `13-ledger.md` hold on every bench seed: about a third of hands in food; the Ledger's decisions under 150 in 70 days with no pause and no order; the first Craftsfolk by day 40 and a third of households by day 70; no business a whole day without its raw good while the carrier may buy.
- Every command has a sender; every wish, twist and guide step can be met; nothing removable is unbuildable (the dead-end hunt, `22-quality.md`).
- A valley from before R1 is refused kindly, with its file to keep; the last commit of the old rules is tagged `chains-final`.
- Benches within budget; a year hashes the same in Node and a browser worker, and two browsers play a year online.
- The lanes test is recorded (it is enforced from R2).
- The R1 wave reaches `main` in one merge.

### V2 Light and green

**Goal**: the night becomes the game's signature and the green half of the picture is painted like the buildings, at no cost to the frame, proven on both laptops.

**Cycles**: V2.0 look contracts and measuring (serial: Measure this laptop and where its tables are kept; both laptops' before tables, which is the owner's and Kat's part; the light map's interface; the appended surfaces and room layers; the dab kit's interface; a grown, autoplayed village beside the showcases in the shots and perf scripts) → V2A night (the light map and everything that reads it, rooms behind windows, lamp color by era, paper by lamplight), V2B green (brush-dab trees, the meadow carpet, flower drifts, hedges, reeds and ivy), V2C what V1 left half-wired (surfaces on props, carts and residents, wall occlusion, ribbon smoke, bubbles on the View list, far levels for common decor) (parallel) → V2X integration.

**Acceptance**:

- In the grown village and the town at night, every lantern and every lit window lights the ground and the walls beside it, lamplight shows on the river, and a town reads as a glow from the valley's edge.
- Trees, hedges and meadows read as painted from the default camera and at street zoom, in every season (before and after shots of every scene, and the owner's and Kat's eyes at the playtest evening).
- On Kat's laptop on Medium a night moving frame costs no more GPU time than before V2, and every budget in `22-quality.md` holds, moving and idle; both laptops' tables are in `22-quality.md`.
- Nothing in the sim changes and hashes match.

### R2 The evening round

**Goal**: the Hearth becomes the town's second flow. Residents spend their evenings at the places the Hearth composes, buy their treats there, and the Ledger's shops follow them; each lane can see what the other did for it.

**Cycles**: R2.0 evenings contracts (serial; with the lot fields V3 needs) → R2A places and the round (the place registry, seats and draw, the planner, routes, footfall), R2B evening trade (Treats on the round, shops by footfall, cafes, evening streets, dusk at half speed, the evenings need and the tiers), R2C gaps and the evening's book, R2D the interface (one map with two inks, the place card, a resident's day, the evening edition, the joint season report, the Hearth's strip), R2E the bench (a Hearth advisor that composes places, a Ledger advisor that zones shops, the lanes test enforced) (parallel) → R2X integration and tuning.

**Scope**: `19-evenings.md` from The day in two acts to Gaps, and its R2 acceptance; the [R2] notes in `11-residents.md`, `12-hearth.md`, `13-ledger.md`, `16-coop.md` and `17-presentation.md`.

**Acceptance**: the R2 list in `19-evenings.md`, and:

- Each player can say, from the screen alone, what the other's work did for theirs today (the evening edition, the two inks, a gap closed).
- The lanes test passes on every bench seed.
- A full evening with 2,000 residents stays inside the sim budgets; a year hashes the same in Node and a browser worker.

### V3 Yards, streets and the long view

**Goal**: detail that means something, from the doorstep to the horizon.

**Cycles**: V3.0 contracts (serial: anchors, the dressing rules as data, the endpaper map's interface, on R2.0's lot fields) → V3A the dressing layer and goods you can see, V3B rows, gardens, corners, storeys and street furniture (the old V2; notes in `docs/build/i4-visual-planning-notes.md`), V3C the long view (horizon, haze with height, the river), V3D the endpaper map (parallel) → V3X integration.

**Acceptance**:

- Standing in a street of a grown Village, a player can tell who lives and works there without opening a panel: each trade and level reads, and a household's woodpile is as big as its firewood.
- Streets join into rows with gardens behind; nothing stands alone on a lawn where a street has grown.
- The far view has a horizon and no box; from 240 tiles out the valley is its own map and the scene is not drawn.
- Budgets hold on both laptops, with tables in `22-quality.md`; nothing in the sim changes beyond R2.0's lot fields.

### R3 Masters and the Town Book

**Goal**: good evenings turn into something lasting. Places come alive when supplied, residents grow into masters who bring the town new flavors, and what the town is known for is discovered where a place and a trade keep meeting.

**Cycles**: R3.0 contracts (serial) → R3A supplies and the lamplighter (resting pieces, household candles, place priorities, the fourth gap), R3B masters, apprentices and masters' goods, R3C the Town Book and earned callings, R3D the interface (Follow the thread, the Town Book, the storybook's print layout), R3E the bench (parallel) → R3X integration and tuning.

**Scope**: `19-evenings.md` from Supplies to the Town Book, and its R3 acceptance; callings in `15-progression.md`; the storybook in `12-hearth.md`.

**Acceptance**: the R3 list in `19-evenings.md`, and:

- The Merchants' and Patrons' variety wants (`13-ledger.md`, Population tiers) can be met by masters, specialties and trade, with no good the Ledger has to wire.
- A chapter's storybook prints from the browser with the valley's own pictures.

### V4 The developing picture

**Goal**: the picture gets better when the players stop to look, and the books are illustrated by the valley itself.

**Cycles**: V4.0 contracts (serial) → V4A rest-frame refinement and its governor, V4B photo mode, ink-and-wash captures and illustrated books, V4C tea-break mode (parallel) → V4X integration.

**Acceptance**:

- At rest the picture settles inside 0.6 s on High and idle frames return to their budget on Medium on Kat's laptop; a light step or a small change to the town never makes it pop; moving frames cost what they did.
- Photo mode saves the developed picture; the Chronicle, the Pattern Book and the Town Book show ink-and-wash pictures of the valley.
- If the measured cost does not fit Medium on Kat's laptop, Medium keeps today's still frame and refinement is High's and Ultra's alone. The frame budget is the floor.

## I4 Town

*Waits for R3 and V4 (the redesign above).*

**Scope**: Town Charter and the bandit raid trial; the Age of Steam (`18-eras.md`: era state, steam works as specialized buildings, coal, smoke that costs charm and evenings, the era moment, restyling across eras, Old Town; V5 runs with this wave); Merchants tier by amount, variety and evenings; districts with policies and styles; contracts; Port Amberly and the flavors it trades; canals and barges; parcels and expansion (purchase, bridges, camps and dens with Watch expeditions); great owl, river raiders, bandit chief; block builder for landmarks; library, theater, post office, inn and tourism (visitors who walk the evening round); levees and irrigation; time-lapse; 8 new patterns, each a place; Captain Wendell Rook; more achievements.

*Changed by the redesign*: I4 adds no goods for the Ledger to wire. The nine goods it once listed (paper, books, glass, jam, tea, coal, iron, soap, music boxes) arrive as masters' goods (R3), as flavors that come by trade, or as one specialized building each (coal, glass); the rest are dropped.

## I5 Market Town, City and beyond

**Scope**: Market Town and City Charters and trials; the Bright Age at City (`18-eras.md`; V6 runs with this wave); Patrons tier; tram, gas lamps, railway, glassworks; grand landmarks; music stems that follow the town; stroll mode (a walk along the evening round); optional Claude-written letters; new valleys (coast, highlands, lakes); remappable keys; captions; polish.

*Changed by the redesign*: gamepads and a one-screen couch mode are dropped (the owner, 2026-11-10: two laptops, online).

## Ideas from playtests (not scheduled)

Raised by the owner and Kat after playtest round three; for later increments, not the current one.

- **A little RimWorld flavor, not obviously**: residents already have personalities; lean on them so every villager feels like someone in particular. *Taken up by R3*: keepers, masters and their goods (`19-evenings.md`).
- **Ideology and belief**: once a village has grown into a bigger place (Town at the earliest, maybe later), the two players pick what the town believes and values, and it colors the town: festivals, buildings, wishes, moods.
- **A light technology tree**, kept basic. *Taken up*: innovations open specialized buildings (R1) and masters bring new goods (R3); there is no tree to click through.
- **Decor that is cozy and varied from the start**: no edgy, angular furniture-pack look (Kat's RimWorld comparison: the base game's furniture is too angular until mods make it cute). Start with a small set of basic pieces and combinations that are already charming, and unlock much more with ranks and achievements, with a bit of challenge in earning them.
- **A move mode**: pick up a building or a piece of decor and set it down elsewhere, as in games that let you rearrange the town freely. *Scheduled*: R1 (`12-hearth.md`, Decorating that composes itself).

Raised in playtest round five, not yet done (round five did the rest; see the changelog):

- **Soil you can see**: ground of different fertility looks alike until a plot or farm is chosen (the soil tint) or the pointer rests on it (the hover label). Shade rich and thin soil a little in the ground itself. *V1C*: rich ground is a deeper green with clover, thin a paler straw with a little bare earth showing.
- **Residents easier to spot** from the usual camera height. *Helped by* V2 (bubbles, a lamplit rim at night) and R2 (folk gather where there is something to do).
- **A first-days tutorial**: what to build first and why (C5H's guide is the place for it).
- **The town hall's door walk** did not seem to meet the road; check the door walk against the road on every rotation.

Raised with the redesign (2026-11-10), not scheduled:

- **Postcards**: a picture framed in photo mode becomes a postcard that visitors buy, so a good eye earns renown. It fits I4's tourism.
- **A town motto**: from Town rank the players choose what the town believes from the customs it has earned (the ideology idea above, given a home in the Town Book).
- **Later renderer moonshots** stay unscheduled as before: an OffscreenCanvas worker, WebGPU, temporal upscaling (`20-architecture.md`, Lean renderer).

