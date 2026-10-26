# 30. Roadmap

Each iteration ends with something both players can play on the live link (P54), a playtest (`22-quality.md`), and an integration cycle that writes the next iteration's briefs. Cycle ids refer to `docs/build/`.

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

## I2 Village

**Scope**: Village Charter; zoning and organic growth; market prices, wages and household budgets (money invariant tested); Craftsfolk tier and home upgrades; goods and chains: clay and bricks, wool to cloth, dairy and cheese, orchards and cider, firewood, herbs, tools; carts; streets and traffic; school, tavern, herbalist; Trading Post, Millhaven and Stonecross, standing orders; loans; plans layer and requests; story characters (Pippa Quill, Odette Fenwick, Juniper Reed); first innovations (wheelbarrows, carts, cobbles, brick kiln, water wheel); 6 new patterns; couples, weddings, births, apprenticeships, retiring; desire paths; terraforming; stairs; minimap; moving a solo valley online.

## I3 Seasons and the Watch

**Scope**: seasons (seasonal farming, frozen river, warmth and firewood); weather and events (flood, drought, early frost, cold snap, travelling circus); festivals; habitats and the Field Guide (about 30 species); threat pressure, telegraphing, bandit gangs and winter wolves; defenses; the Watch and raid resolution; threat dial; River Dock; commissions; renown; customization phase 2 (modules); photo mode; Chronicle snapshots; 6 new patterns; together moments; story characters Mother Thornbury and Barnaby Ashcombe; the first winter trial for Village.

## I4 Town

**Scope**: Town Charter and the bandit raid trial; Merchants tier; districts, district policies and styles; contracts; Port Amberly; canals and barges; parcels and expansion (purchase, bridges, camps and dens with Watch expeditions); great owl, river raiders, bandit chief; block builder for landmarks; library, theater, post office, inn and tourism; levees and irrigation; time-lapse; 8 new patterns; Captain Wendell Rook; more achievements.

## I5 Market Town, City and beyond

**Scope**: Market Town and City Charters and trials; Patrons tier; tram, gas lamps, railway, glassworks; grand landmarks; music and ambience; stroll mode; optional Claude-written letters; new valleys (coast, highlands, lakes); gamepads and a one-screen couch mode; remappable keys; captions; polish.
