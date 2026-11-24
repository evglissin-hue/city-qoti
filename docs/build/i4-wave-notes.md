# I4 wave notes: how the tracks meet

**Draft (R3X, 2026-11-23).** Written for the R3X master, who owes the I4 briefs and will review and edit this; I4.0 makes it final against the types it fixes, as R3.0 did for R3. Every design call in this draft is marked "proposed (R3X draft)": until the master or the owner rules, it is a suggestion, not a decision. Where the spec is silent the question is written down instead (Open questions, below, and in each brief), not answered.

Read this with your brief. I4.0 fixes the types and shapes (`docs/spec/20-architecture.md`, "I4 contracts", which I4.0 writes); these notes fix who owns which file, the stand-ins each cycle replaces, the runtime handshakes and the order of a day, so the pieces fit when I4X merges them. If something here is wrong for your track, do the sensible thing, keep it additive, and say so in your PR.

## The split: two waves (for the owner to confirm)

Proposed (R3X draft): I4's scope (`30-roadmap.md`, I4 Town) does not fit one wave of honest work. R3 ran eight parallel cycles with V4's three beside it; I4 with V5 inside it would need about sixteen. So I4 runs as two waves, each a contracts cycle, a parallel wave and an integration, each ending playable with a playtest evening.

**Wave one, The Town** (this file): I4.0, then I4A to I4H with V5A and V5B, then I4X. Save version 10.

- The Town Charter and its bandit raid trial; the era state and the era moment; the Merchants tier; the clinic.
- The Age of Steam's Ledger: steam works as specialized buildings, coal, smoke that costs charm and evenings; the Steam Engine, Glassworks and Printing Press innovations.
- Districts with policies and styles; restyling across eras; Old Town; the callings' style lean that R3C left for districts.
- Trade contracts; Port Amberly and the flavors it trades.
- The library, theater, post office, inn and bandstand; tourism (guests who stay at the inn and walk the evening round); Captain Wendell Rook; Juniper Reed's mastery.
- The 8 new patterns, each a place; more achievements.
- V5: the Age of Steam kit on buildings, the era's light, smoke and pieces, the era moment's look and sound.

**Wave two, The wider valley** (briefs written by I4X): proposed ids I4.5 (contracts, save version 11), I4J onward, V5C, then I4Y.

- Parcels and expansion (purchase, bridges, camps and dens cleared by Watch expeditions), with the worldgen rim (new valleys only; the owner's ruling of 2026-11-17 puts it beside parcels).
- Canals, locks and barges; levees and irrigation ditches; the ditch and moat.
- The great owl, river raiders and the bandit chief; Watch patrol routes.
- The block builder for landmarks.
- Time-lapse.
- V5C: canals, locks, barges, bridges over canals, levees and ditches, the sloping rim's look.

**Why this split** (proposed, R3X draft):

- Wave one is everything the Town Charter needs to be reached, sealed and felt in both lanes (P6: an era must change how each lane plays). Nothing in wave two gates the Town claim, the trial or the era's play.
- Wave two changes the map: a new water kind in the walk grid and the porters' routes, worldgen (every new valley's hash), parcels that lock land a migrated valley already built on. Keeping it apart keeps wave one's worldgen and every new valley's hash unchanged, so wave one's golden hashes move only where its rules change.
- The three new threats lean on wave two's land and water (river raiders on docks and barges, the owl over open racks, the chief as a Large band); Watch expeditions resolve "like a raid in reverse", so camps, dens and the chief share one threats cycle.
- The block builder and time-lapse are standalone tools (sim, art and client for one; client and storage for the other) that gate nothing.
- Coal in wave one comes by the carrier from Stonecross (proposed, R3X draft; Rulings below); the pit on a seam arrives with parcels ("new parcels reveal new resources", `15-progression.md`, Expansion) and coal by barge with canals.

If the owner prefers one wave, the natural cuts from wave two are time-lapse and the block builder first, then the threats; parcels, the rim and canals stay together either way.

## How the wave works

- **Branches.** I4.0 branches from `main` once R3X has merged (and V4X, if it has landed) and opens its PR into `cycle/i4x-integration`, which the master cuts at `main` for it, as R3.0's PR went into `cycle/r3x-integration`. Every wave cycle branches from `cycle/i4x-integration` at or after I4.0's merge and opens its PR into it, never into `main`. I4X merges the wave there, tunes, and opens the one PR into `main`. Proposed (R3X draft): **V5A and V5B are wave cycles like the rest** (branch from and PR into `cycle/i4x-integration`), unlike V4, which merged into `main` as it went: V5 draws from I4.0's views (the era, smoke, districts), which reach `main` only with I4X.
- **The cycles** (recommended effort; proposed, R3X draft):
  - **I4A** The Town Charter, its trial, Merchants and the era (xhigh)
  - **I4B** Steam works, coal and smoke (xhigh)
  - **I4C** Districts, policies and styles, with restyling and Old Town (Opus, xhigh: it crosses zoning, growth, construction and the patterns)
  - **I4D** Trade contracts and Port Amberly (high)
  - **I4E** The Town's evenings: the library, theater, post office, inn and bandstand, guests, Rook and Juniper (xhigh: it hooks the round's planner)
  - **I4F** The eight patterns and the feats (high)
  - **I4G** The Town's interface (xhigh)
  - **I4H** The bench (high)
  - **V5A** The Steam kit on buildings (Opus, xhigh)
  - **V5B** The era's light, smoke, pieces and moment (Opus, xhigh)
  - then **I4X** (xhigh: it merges a gameplay wave and a look wave at once)
- **Contracts are additive** (`31-parallel-development.md`, Contracts policy): new optional fields, new union members, new types, each new command or event in its own commit. I4 renames and removes nothing.
- **Saves go to version 10** (I4.0, `state/migrate10.ts`, frozen: it reads no system code and keeps its own small tables). A change to the shape of saved state in the wave adds an optional field, absent until used, rather than bumping the version; if a cycle must change a saved shape, it says so in its PR and I4X keeps one version (10) for the merge with an idempotent step. Wave two's contracts take 11. What 10 carries is in I4.0's brief, task 11.
- **Mark your stand-ins.** I4.0 marks each in code with `// I4 stand-in (I4x): ...` (or `(V5A)`, `(V5B)`), naming the cycle that replaces it. When you replace one, delete the comment. I4X's first step is `grep -rn "I4 stand-in" packages apps tools --exclude-dir=dist --exclude-dir=node_modules`: anything left is a cycle's unfinished work. A test (`test/i4-0/standins.test.ts`) holds that every marker names one of I4A to I4H, V5A, V5B.
- **Numbers live in content**, never a literal in a system. Proposed files (R3X draft; I4.0 fixes the names): `content.era` (`era.ts`: the moment's words, what each era opens), `content.steam` (`steam.ts`: smoke and coal numbers), `steamBuildings.ts`, `townBuildings.ts` (the clinic), `eveningBuildings.ts` (library, theater, post office, inn, bandstand), `content.districts` (`districts.ts`: the policies), `styles.ts` (each style's `era`), `content.contracts` (`contracts.ts`), `neighbors.ts` (Port Amberly; Stonecross's coal), `content.tourism` (`tourism.ts`), the Town Charter in `charters.ts`, the Merchants row in `baskets.ts`, `townPatterns.ts`, `townDecor.ts`, `townAchievements.ts`. A cycle that needs a new number adds an optional field to the tuning type (additive) and its value in its own file.
- **Ports** (dev server and relay), a free block (proposed, R3X draft): I4.0 5270 and 8880, I4A 5271 and 8881, I4B 5272 and 8882, I4C 5273 and 8883, I4D 5274 and 8884, I4E 5275 and 8885, I4F 5276 and 8886, I4G 5277 and 8887, I4H 5278 and 8888, V5A 5279 and 8889, V5B 5280 and 8890, I4X 5281 and 8891. Wave two takes 5282 to 5289 and 8892 to 8899. R3 used 5240 to 5249 and 8840 to 8859, V4 5260 to 5264 and 8870 to 8874; none overlaps.
- **Build and review loop** (`31-parallel-development.md`): an Opus master plans and briefs, Sonnet `executor` agents build in their own worktrees (each merges `cycle/i4x-integration` first), the master checks quality, runs the dead-end hunt and plays from the player's chair, one or two rounds before the PR.

## Starting after R3X

Filled at R3X's PR (2026-11-24, R3X's head; R3E's tools, 70 days, four bench seeds with the tuned and newcomer profiles):

- **Saves are at version 9** (R3.0); 10 is I4.0's. R3X kept 9: no saved shape changed in R3X.
- **R3's systems are live**: no `R3 stand-in` is left (R3H removed the last), the newcomer profile is live since P3A merged (`NEWCOMER_LIVE`), "a shop nobody passes" reads the outlet's own evening customers (`Building.roundSales`, R3X), and the golden year (`r1-year.json`) was re-recorded in R3E and R3H because the autoplayer plays new advisors.
- **The Town Charter's numbers meet R3's tuning**: 120 residents including 40 Craftsfolk needs about a third of residents Craftsfolk, and P3A measured the Craftsfolk share at 15% on average over days 40 to 70 (`13-ledger.md`, What holds, P3A). I4H reads the claim day on every bench seed; I4X tunes. R3X's reading: Craftsfolk at day 70 are 13, 23, 5 and 33% of households on willow, hazel, oak and birch (tuned) and 20, 13, 5 and 18% (newcomer), 16% on average; what holds Settlers back is the six coins put by and evenings of 50 more than goods (`r3xWhy`, `r3xCrafts`). A Town Charter at a third Craftsfolk is out of reach on three seeds of four without new money or a lighter savings line.
- **The variety wants**: R3E's `variety.ts` prints which flavors can reach the Merchants' wants (Food 5, Wares 3, Treats 3) and from where; I4A builds the tier on it, I4D adds Port Amberly's flavors.
- **Village money is a closed loop**: the household loop nets the treasury nothing, and debt per resident tracks the autoplayer's share of the credit line (`tools/bench/src/debt.ts`). R3X's figure: 17.3 to 18.6 coins owed per resident on every seed and profile, the loans at 90% of the line; no lean day. R3's one new outside income is the masters' goods on the carrier's cart (38 to 206 units a seed over 70 days, butter and smoked fish; workshop masters do not come in 70 days). I4's new outside money (contracts, Port Amberly, guests) and new sinks (coal, restyling, the new buildings' upkeep) are measured against it.
- **The R3 playtest** (`docs/playtests/R3.md`) ends with "three things to change before I4": the master places each in a brief or a P cycle once the owner has played.
- **R3X's misses**, each with its number and the cycle it needs:
  - **Six Town Book pages and a calling**: 0 to 2 pages a seed (customs only, no specialty), no calling. The marks are already a Village's size (4 customers on 3 evenings; 12 visitors three seasons running); a whole Village sells 2 to 5 Treats an evening, so no flavor reaches four at one place. Needs more Treats sold on the round (I4E's evenings, I4D's flavors by trade), not lower marks.
  - **Candles for half**: R3E's scene measured in the autoplayed towns (kept places lit, the rest resting) misses; the rule holds in the unit tests and from the chair. The bench towns stand 70 to 140 lanterns against 9 to 18 candles a night. I4H's lamps advisor should stand lanterns to the candles the town makes.
  - **The worst fair evening** fell below R2X's 48 to 54% on oak (35%, day 51) and willow (46%, day 46); the means are 62 to 84%. Lanterns resting for want of candles take lamplight's draw from the places R2 lit for nothing. I4E reads it.
  - **A third Craftsfolk by day 70**: 16% on average (above). I4A.
  - **The nothing-to-sell gap at a tavern** opens and rarely closes (willow 5 opened, 1 closed; hazel 6, 0): households owe under one Treat most evenings. I4E.
  - **Hazel's Ledger decisions** sit at 148 of the lanes test's 150; I4's new Ledger levers (contracts, policies) need room: I4H should measure the lanes test first.

## Rulings

### Settled before this draft

- **The worldgen rim** is I4's, new valleys only, beside parcels and expansion (the owner, 2026-11-17).
- **The bandstand** waits for I4 with the theater and the inn; `bandstand-green` stays an unlock (the R3 master, 2026-11-17; `19-evenings.md`).
- **I4 adds no goods for the Ledger to wire** (the redesign, `30-roadmap.md`, I4): coal and glass come from one specialized building each; tea and the like come by trade; paper, books, iron and music boxes are dropped unless they come by trade.
- **Eras layer, never replace; restyling is opt-in; older pieces stay buildable; no time skip; the era opens the palette and innovations bring the machines; every era adds at least one system or constraint per lane** (`18-eras.md`, Rules).
- **The callings' style weights wait for I4's districts** (R3C), and **Juniper Reed's mastery waits for I4** (R3B).
- **The Town Charter adds a master and 2 pages in the Town Book** (`15-progression.md`, from the redesign).

### For the owner to confirm (scope; proposed, R3X draft)

1. **Two waves**, as above.
2. **The library, theater, post office and inn open at Town rank in I4** (the roadmap's I4 scope), though `15-progression.md` lists the library, theater and glassworks among Market Town's unlocks (I5). Proposed: the roadmap wins, with the Glassworks opened by its innovation as `15-progression.md`'s innovations table says (I4); Market Town's row keeps Patrons, the tram and gas lamps, and the Patrons' "library or theater" want reads buildings already standing.
3. **The Town's trial is a Medium bandit gang raid** (`15-progression.md`, the roadmap's "the bandit raid trial"), though `14-challenge.md`'s table names the bandit chief as the Town trial. Proposed: the gang raid seals the Town; the chief is wave two's Large band and a candidate for Market Town's trial (I5 decides).
4. **Coal by the cart in wave one**: Stonecross sells coal from Town rank (the archive's "sells stone and later iron and coal"); the coal pit and seams come with parcels in wave two, coal by barge with canals. The alternative is a seam stamped by worldgen in I4.0 (every new valley's hash moves) and by the migration into migrated valleys (frozen code writing an old valley's map).
5. **Rooftop Garden** is in `12-hearth.md`'s I4 patterns and in `18-eras.md`'s Bright Age patterns. Proposed: it stays one of I4's eight (the roadmap counts eight); `18-eras.md` loses it from the Bright Age list.
6. **Gas lamps**: V5 draws the Age of Steam's lamps burning gas (`18-eras.md`, the era moment's light), but a lamp that needs no candles waits for the Gas Lamps innovation at Market Town (`15-progression.md`, I5). Proposed: in I4 every lamp still burns R3's candles; only its light and look change.
7. **Not in I4** (named in older docs, absent from the roadmap's I4 scope): the horse tram (I5's tram), the royal visit, road safety, smugglers and the factory fire, a new festival theme per season, remappable keys, the chapel and the guest house, a second calling choice at the Town Charter (callings are earned since R3). Each waits for the owner to schedule.

### Proposed design calls (R3X draft), for the master

Each brief carries its own with the open questions; the ones that cross tracks:

- **The era is set by the trials system at the seal** (`18-eras.md`, Data) and saved with the day it turned (`WorldState.era`, `eraSince`). `Building.era` is set when a site is created, from the valley's era, and changed only by restyling. A household's clothes follow over the next season, a few a day, derived from the household id and the days since the era turned (`eraLookOf`, never saved).
- **The wind** is derived: a prevailing wind per valley from its seed, turned by the day's weather (`windOf`), so smoke stays a pure function of saved state.
- **Smoke reaches places through charm only**: `smokeAt` lowers charm downwind, so the draw, home desirability and patterns follow without a second hook (`18-eras.md`: "Smoke lowers charm downwind and with it the draw of every place there").
- **A district** is painted tiles in a `district` map layer (a byte a tile, 0 none, up to 15 districts) with a row each (name, policy, style, the restyle under way). The Ledger draws and sets the policy; the Hearth sets the style (P22). One policy a district.
- **A lamp's light** follows the era of its district's style, else the valley's era (`18-eras.md`: "district by district as they are restyled").
- **Guests never take a resident's seat**: they are planned after residents, on what room is left, so the lanes test reads the town's own evenings.
- **The trial's moment on screen**: the title card shows on both screens when `era.changed` arrives (the morning after the trial); the fireworks and the evening's grade wait for that dusk.
- **No new RNG stream**: offers, guests and shows are chosen by hash and order (seed, day, id), as trade's drift is; the trial's raid takes its side from the `threats` stream as any raid does.

## Lessons carried over (read first)

From R3, still holding:

- I3's lesson stands: write tests that hold when every system runs beside yours; isolate with `withoutSystems([...])` but never assume another system is absent.
- **Derived means a pure function of saved state when read** (R2's rule on `Place`). Smoke at a tile, a district's policy at a lot, tonight's show, a household's era look: work them out from saved state each time, or cache only against a key that covers every input. A seat joining from a snapshot must read what its partner reads.
- **Derived caches need a writer list** (R2X): the place index's counter is only as safe as the writers that bump it. The new hosts are buildings, already structural; guests and shows are moving parts of the draw. If your cycle finds it must add a structural input, add its bump and let the verifier prove it.
- **One kind of choice, one source of order.** R2X's arrivals reshuffled when the round borrowed the `residents` stream. Settle by priority, distance, days and id; choose offers and guests by hash.
- **A rule that counts a run resets on one bad day** (R2X): count whole unless the design says running; a day lost to weather holds a run.
- **Content a Charter, innovation, master or calling unlocks needs a migration** (R2.0's lesson): a piece added to the Village Charter's list, or to an unlock a valley already holds (`bandstand-green`), is unlocked for valleys already past it (`test/r2-0/unlocks.test.ts` checks the class). The Town Charter's own list is new, so it needs nothing.
- **Every hook on a hot path costs every resident** (R3.0, R3A): a schedule override is called on every resident's every schedule decision, and the R2A planning line rose from 0.36 to 0.44 ms a tick with one stand-in registered. A late shift or a guest's hook returns at once for anyone it is not about.
- **The money invariant** (`treasury + savings - external`) holds through everything: contracts, Port Amberly, guests, coal and paint move money with `pay()` or book outside money as the visitors do.
- No cycle edits another's file to make its own test pass. Ask in your PR, or use the cross-track API below.

From R3X, new:

- **A Village's money is a closed loop.** Any new outside income (contracts, Port Amberly's trade, guests' rooms and Treats) or sink (coal, restyling's paint, the new buildings' upkeep) is measured with `tools/bench/src/debt.ts` and against the credit line, seed by seed, before it is tuned: debt per resident, not coins, is the reading.
- **The bench plays two profiles**, tuned and newcomer, and both hold P3A's hands-and-food lines (about a third of hands in food; the newcomer reaches Village with no Hamlet day where a household missed breakfast).
- **Wall-clock tests take the best of several runs** against their budget, and long autoplay tests stay under 300 s on a slow host. A Town takes far more days than a Village: start long runs from a saved fixture, not from founding.
- **Never re-baseline a hash unless the rules changed, and say which rule** in the commit that does it.

## File ownership

Each path has one owner in the wave. Outside your paths: small, necessary edits only (a registry line, an export, an additive contract member), listed in your PR. Contracts files (`packages/sim/src/contracts/**`, `packages/content/src/types.ts`, `packages/protocol/src/messages.ts`, `apps/client/src/render/api.ts`, `apps/client/src/worker/messages.ts`) are shared: additive members in their own commits. I4.0 wires every reader below to its owner's stub, so the hooks are in place: change the stub's body in your file, not the reader. Paths are proposed (R3X draft); I4.0 fixes them.

### I4A, the Town Charter, its trial, Merchants and the era

- `packages/sim/src/systems/charter/**` (the Town claim; the Village chapter card's line that the Town Charter "comes in a later update" goes), `systems/trials/**` (the `raid` row of `TRIAL_KINDS`, the seal, the era set at the seal, `era.changed`, the era moment's Chronicle chapter page), the trial's raid in `systems/threats/**` (`scheduleTrialRaid` only: wave two takes the rest of threats), `systems/tiers/**` (Merchants), `systems/services/**` (the clinic), a new `systems/era/**` (the era's API and what it opens), `view/era.ts`, the Town lines of the Charter's view.
- Content: `charters.ts` (the Town Charter), `era.ts`, the Merchants row in `baskets.ts` and the tier's wants, `townBuildings.ts` (the clinic).
- Tests: new `packages/sim/test/i4a/**`.

### I4B, steam works, coal and smoke

- A new `systems/steam/**` (`smokeAt`, `buildingSmoke`, `steamRoom` bodies; the 06:00 smoke settling; charm chunks marked downwind), `systems/production/**` (steam works burn coal and work through a frozen river; the Glassworks makes glass), `systems/specialized/**` (`capacityOf` adds `steamRoom`), `systems/innovations/**` (Steam Engine, Glassworks, Printing Press), `view/steam.ts`.
- Content: `steam.ts`, `steamBuildings.ts`, the coal and glass numbers in `goods.ts` (I4.0 appends the goods), the three rows in `innovations.ts`.
- Tests: new `packages/sim/test/i4b/**`.

### I4C, districts, policies and styles

- A new `systems/districts/**` (the policies' API bodies: `policyAllows`, `policyDesirability`, `shiftEnd`, `cartsFirst`, `styleFor`; the 06:10 restyle pass), `systems/zoning/**` (a lot's style from its district, else the calling's lean, else as C4B), `systems/growth/**` (policies in the trade choice and desirability), `systems/construction/**` (restyle jobs: paint, materials, a new era and style when done; the season plan's "where to build first" by district), `systems/traffic/**` (carts first), `systems/hearth/patterns/detectors/oldTown.ts` (one file and its registry line), `view/districts.ts`.
- Content: `districts.ts`, `styles.ts` (each style's `era`; the Steam styles), the `styleWeights` reading in `callings.ts`, Old Town's pattern def and its unlocks (heritage plaque, old town lantern).
- Tests: new `packages/sim/test/i4c/**`.

### I4D, trade contracts and Port Amberly

- A new `systems/contracts/**` (offers, acceptance, deliveries, the deadline; renown and the fee), `systems/carrier/**` (contract loads at 10:00; Port Amberly's terms), `systems/trade/**` (Port Amberly's prices and drift), `systems/dock/**` (the boat to Port Amberly), `view/contracts.ts`, the I4 lines of `view/balances.ts`, the `contractsKept` count's body.
- Content: `contracts.ts`, `neighbors.ts` (Port Amberly; I4.0 adds Stonecross's coal line), tea and any other traded flavor's numbers in `goods.ts`.
- Tests: new `packages/sim/test/i4d/**`.

### I4E, the Town's evenings

- A new `systems/tourism/**` (guests at the gate, rooms at the inns, `guestsTonight` and `guestStops` bodies, departures; `hostShow` in `tourism/shows.ts`: the theater's nights and the bandstand's band), `systems/market/round.ts` (a guest's purchase at a stop, money from outside), `systems/stories/**` (Captain Rook's arc; Juniper Reed's mastery), `systems/festivals/api.ts` (`hasBandstand`: a bandstand standing), `view/tourism.ts`.
- Content: `eveningBuildings.ts` (seats, shelter, rooms, shows; the bandstand as a piece), `tourism.ts`, Rook's arc and Juniper's mastery in `stories.ts`, Bookish's library wish in `wishes.ts`.
- Tests: new `packages/sim/test/i4e/**`.

### I4F, the eight patterns and the feats

- `systems/hearth/patterns/detectors/{arcadeStreet,quietLane,festivalGround,allotments,riversideSteps,rooftopGarden,bandstandGreen,oldTreeSanctuary}.ts` (new) and their registry lines, the bodies of the counts its feats read (`oldFriends`, `reformedBond`, `fifteenMinuteTown`, in a new `conditions/i4.ts`).
- Content: `townPatterns.ts` (rules, site bonuses, unlocks, hints, layouts), `townDecor.ts` (the unlock pieces, with existing kits until V5B draws them), `townAchievements.ts`.
- Tests: new `packages/sim/test/i4f/**`.

### I4G, the Town's interface

- In the client: the district tool (`input/tools/district.ts`, one registry line) and a Districts book (`ui/panels/Districts.tsx`, a line on P3B's Books shelf); the Town lines in `ui/panels/{Charter,Trial,RankUp,Chronicle,Balances,BuildingInspector,ResidentInspector,PlaceCard,Edition,SeasonPlan}.tsx` and `ui/GoalPill.tsx`; the contracts card (a line in `ui/cards.ts` and its panel); the era moment's title card (`ui/panels/EraMoment.tsx`, new); the picker by era (`ui/Picker.tsx`); the smoke overlay (`ui/lenses.ts` one line, its ramp in `render/layers/overlays.ts`, the one render file it takes, as R2D took `overlayTown.ts`); `state/mirror.ts` (era, districts, contracts, tourism), `state/undo.ts` (the district commands, a contract accepted), `worker/messages.ts` (additive); e2e `apps/client/e2e/i4g-*.spec.ts`, shots `docs/build/screenshots/i4g-*`.
- Senders owed: every I4 command (`OWED_SENDERS`, `OWED_FIELDS` name I4G).

### I4H, the bench

- `tools/bench/**` (advisors, `lanes.ts`, `outcomes.ts`, `targets*`, `audit.ts`, `autoplay.ts`, `debt.ts`'s new categories, new `i4.bench.ts` and `i4Outcomes.ts`), `packages/sim/src/view/health.ts` (the I4 health kinds; other cycles name theirs in their PRs), `apps/client/scripts/grow-fixture.mjs` (a Town fixture), with their tests (`tools/bench/src/**/*.test.ts`, new `packages/sim/test/i4h/**`).

### V5A, the Steam kit on buildings

- In `packages/art/src`: `kits/{parts,roofs,details,style,district,grown,rows,buildings,business,workplaces,workshops,services,specialized,village,modules}.ts` (the era as a parameter set on the shared parts; the new buildings' looks), the new surfaces' generators in `patterns.ts` and values in `surface.ts`, palette additions by append (shared with V5B), `materials.ts` values.
- In the client: `render/layers/buildings.ts` (kit selection by era and style; a restyle rebuilds through the kit key), `render/kitGeometry.ts` (the key holds the era); the gallery's Steam section (`apps/gallery`); shots `docs/build/screenshots/v5a-*`.

### V5B, the era's light, smoke, pieces and moment

- In the client: `render/lightMap.ts`, `render/lighting.ts`, `render/layers/lights.ts` (lamp color by district era), `render/layers/effects.ts` (plumes from `BuildingView.smoke`, drifting with the wind), `render/layers/street.ts` (street furniture by district style and era), `render/look.ts` (the moment's grade), `render/layers/festivalFx.ts` (the moment's fireworks), `render/layers/{agents,decor}.ts`; and, as a carve-out like V4C's one file under `input/`, `apps/client/src/audio/**` for the brass band.
- In `packages/art/src/kits`: `residents.ts` (waistcoats, bonnets, boaters), `decor.ts`, `fineDecor.ts`, `garden.ts`, `festival.ts`, `props.ts`, `lamplight.ts` (the gas lamp, cast iron benches and railings, the bandstand, the eight patterns' unlock pieces, Old Town's plaque and lantern).
- Shots `docs/build/screenshots/v5b-*`.

### Shared, by turn

- `packages/sim/src/index.ts` (exports), `systems/index.ts`, `commands/index.ts`, `content/src/index.ts`, `systems/hearth/patterns/detectors` registry, `apps/client/src/ui/panels/index.ts`, `input/tools/index.ts`, `ui/lenses.ts`, `render/layers/index.ts`, `packages/art/src/kits/index.ts`: one sorted line each.
- `content/goods.ts`: I4.0 appends the goods (never reordered); each owner tunes only its own goods' numbers.
- `packages/sim/src/conditions/**`: I4.0 wires the new counts to their owners' stubs; bodies live in the owners' files.
- Nobody edits in the wave: `systems/residents/index.ts`, `systems/residents/round.ts` (I4.0 wires the guests' hook), `systems/places/**` (I4.0 wires `hostShow` and the new hosts), `systems/hearth/charm/**` (I4.0 wires `smokeAt`). `residents/overrides.ts` is a registry: I4C may add the late shift's one line, nobody else.
- `CHANGELOG.md`, `docs/build/README.md`: one line each, merged by I4X.

## Stand-ins (each replaced by its cycle)

Proposed (R3X draft); I4.0 fixes the names. Every stand-in keeps today's game: nothing a player meets changes before the Town claim, which the stand-in holds shut.

| Stand-in | Where | What it does now | Replaced by |
|---|---|---|---|
| The Town claim | `systems/charter` (the claim for `town`) | the Town Charter shows its goals but cannot be claimed | I4A |
| The raid trial | `systems/trials` (`TRIAL_KINDS` `raid`), `systems/threats/api.ts` (`scheduleTrialRaid`) | no trial raid; never sealed | I4A |
| The era turning | `systems/trials` (the seal) | the era stays `old` | I4A |
| Merchants | `systems/tiers/api.ts` (`merchantsMet`) | no household reaches Merchants | I4A |
| The clinic | `systems/services` | a building with no cover | I4A |
| Smoke | `systems/steam/api.ts` (`smokeAt`, `buildingSmoke`) | no smoke anywhere | I4B |
| A steam mill's room | `systems/steam/api.ts` (`steamRoom`) | 0 | I4B |
| Coal and glass | `systems/production` | steam works and the Glassworks burn and make nothing | I4B |
| The three innovations | `systems/innovations/measures.ts` | never met | I4B |
| Policies | `systems/districts/api.ts` (`policyAllows` true, `policyDesirability` 0, `shiftEnd` the standard hour, `cartsFirst` false) | no policy does anything | I4C |
| A district's style | `systems/districts/api.ts` (`styleFor`) | the zoning pass's pick as C4B | I4C |
| Restyling | `systems/districts/index.ts` | nothing restyles | I4C |
| Old Town | `systems/hearth/patterns/detectors/oldTown.ts` | never found | I4C |
| Contracts | `systems/contracts/index.ts` | none offered | I4D |
| Port Amberly | `systems/{trade,carrier,dock}` (`neighborReachable`) | not reachable | I4D |
| Guests | `systems/tourism/api.ts` (`guestsTonight`, `guestStops`) | none | I4E |
| Shows | `systems/tourism/shows.ts` (`hostShow`) | 0 | I4E |
| Captain Rook | `content/stories.ts` (his arrival) | never arrives | I4E |
| The eight patterns | `systems/hearth/patterns/detectors/*` | never found | I4F |
| I4 counts | `conditions` (`contractsKept`; `oldFriends`, `reformedBond`, `fifteenMinuteTown`) | 0 | I4D, I4F |
| The feats' setups | `packages/sim/test/hearth/achievements.test.ts` (`PENDING`) | I4's feats left out | I4A, I4D, I4F |
| Era looks | `packages/art` (`KitBuildOptions.era`) | read and ignored: every building draws Old Age | V5A |
| Gas light, plumes, the moment | `render/layers/{lights,effects}.ts`, `render/look.ts`, `festivalFx.ts` | the old lamp color, no plume, no grade | V5B |

Not stand-ins (real from I4.0): the contracts and their helpers, `valleyEra`, `Building.era` set at a site's creation, `eraLookOf`, `windOf`, `districtAt`, the district and contract commands (validate and store), the new hosts' seats and shelter on the round, the migration, the views.

## Handshakes

### Who writes what

| State | Written by | Read by |
|---|---|---|
| `WorldState.era`, `eraSince` | I4A (the seal) | construction (`Building.era`), the pickers (content `eras`), I4C (restyle to the era), `eraLookOf`, V5A and V5B through the views, I4G (the title card) |
| `Building.era` | construction (I4.0, real); I4C (restyle) | V5A (the kit's era), Old Town (I4C), I4H |
| `Building.restyled` (proposed) | I4C | Old Town ("never restyled") |
| Each works' smoke for the day | I4B (06:00) | `smokeAt` (charm, so the draw and desirability), `BuildingView.smoke` (V5B's plume), I4G's overlay, I4H |
| `map.district`, `districts` rows | the district commands (I4.0 validates and stores; I4G sends); I4C (the restyle under way) | I4C's readers, V5A (style and era per building), V5B (lamp color, street furniture), I4G, I4H |
| `contracts` (offers, accepted, delivered, results) | I4D | I4G's card, `contractsKept` (Contract Kept, I4F), renown, I4H |
| `tourism` (guests, rooms) | I4E | the round's planner (the hook), the tally, I4G (edition, place card), I4H |
| `Household.tier` `merchant` | I4A (tiers) | baskets, V5A (floors by tier, as V3B), I4G |
| `trials` (the Town's raid) | I4A | I4G's trial card, I4H |
| Pattern sites | I4F, I4C (Old Town) | places (as R2A: every site is a place), the Pattern Book |
| Story state (Rook) | I4E | letters, as today |

### Cross-track API (signatures fixed by I4.0; proposed, R3X draft)

| API | File | Owner | Readers wired |
|---|---|---|---|
| `valleyEra(state)`, `eraOf(state, b)`, `eraLookOf(state, h)` | `systems/era/api.ts` | I4.0 (real) | construction, views, pickers |
| `merchantsMet(state, h)` | `systems/tiers/api.ts` | I4A | the tiers pass |
| `scheduleTrialRaid(state, band, day)` | `systems/threats/api.ts` | I4A | the trials pass |
| `windOf(state)` | `systems/weather/api.ts` | I4.0 (real) | `smokeAt`, `WeatherView.wind` |
| `smokeAt(state, i)`, `buildingSmoke(state, b)` | `systems/steam/api.ts` | I4B | charm's compute (`hearth/charm/compute.ts`), `BuildingView.smoke` |
| `steamRoom(state, specialized)` | same | I4B | `capacityOf` (`specialized/api.ts`) |
| `districtAt(state, i)` | `systems/districts/api.ts` | I4.0 (real) | everything that asks |
| `policyAllows(state, lot, trade)`, `policyDesirability(state, lot)` | same | I4C | growth's trade choice and desirability |
| `shiftEnd(state, b)`, `cartsFirst(state, i)` | same | I4C | the work schedule (through the late shift's override), traffic |
| `styleFor(state, lot)` | same | I4C | zoning's style pick |
| `neighborReachable(state, neighbor)` | `systems/trade/api.ts` | I4D | the carrier, the dock, Balances |
| `guestsTonight(state)`, `guestStops(state, ctx)` | `systems/tourism/api.ts` | I4E | the round's planner (`residents/round.ts`), after residents plan |
| `hostShow(state, place)` | `systems/tourism/shows.ts` | I4E | the draw (`DrawParts.show`, `places/draw.ts`) |
| `contractsKept(state)` | `systems/contracts/api.ts` | I4D | conditions |
| `oldFriends`, `reformedBond`, `fifteenMinuteTown` | `conditions/i4.ts` | I4F | conditions |

### The order of a day (where each I4 system runs; proposed, R3X draft)

New systems in free slots: `districts` 25, `steam` 61, `contracts` 83, `tourism` 85. I4.0 keeps the system order test true.

| Time | System (order) | I4 work |
|---|---|---|
| 00:04 | weather (14) | the day's weather as before; `windOf` reads it with the valley's prevailing wind (derived, I4.0) |
| 00:08 | trials (95) | after the Town claim the raid trial opens for day 5 of the next season (a letter); judged the morning after; weathered seals the Charter: `era` turns to `steam`, `era.changed`, the Chronicle's chapter page, the Charter board lists what the era opens (I4A) |
| 00:40 | threats (80) | pressure as before; the trial's raid booked for its day (Medium), telegraphed as any raid (I4A) |
| 06:00 | steam (61) | each works' smoke for the day from yesterday's coal and today's wind; charm chunks downwind marked (I4B) |
| 06:10 | districts (25) | the day's restyle jobs handed to the builders (I4C) |
| 09:00 | contracts (83) | offers on days 1 and 4 of a season, as commissions (I4D) |
| 09:00 | tourism (85) | guests leave by the gate (I4E) |
| 10:00 | carrier (65) | coal like any Fuel and any raw good a works rests for; contract loads leave with the cart; Port Amberly's flavors and loads by the boat (I4D) |
| 16:00 | tourism (85) | guests arrive at the valley gate (renown, rooms, the season) and take rooms at the inns (I4E) |
| 17:00 to 17:30 | residents (50) | residents plan the round as R2A; then `guestStops` plans the guests on what room is left (I4E's body) |
| 17:00 to 21:00 | baskets (67), places (73) | guests buy Treats at stops, booked as outside money (I4E); a show adds to a host's draw (`hostShow`) |
| 21:00 | residents (50) | home; a mill quarter's late shift ends at `shiftEnd` (I4C) |
| 23:50 | contracts (83) | deadlines judged: kept (coins, renown, the count) or short (a fee, renown off) (I4D) |

### Events

| Event | Emitted by |
|---|---|
| `era.changed` (`EraView`) | I4A, at the seal |
| `districts.updated` (`DistrictView[]`) | the district commands (I4.0); I4C when a restyle moves on |
| `contracts.updated` (`ContractView[]`) | I4D: an offer, an acceptance, a delivery, a result |
| `tourism.updated` (`TourismView`) | I4E: arrivals, departures, tonight's guests |
| `charter.updated` | as before; I4A for the Town's goals, claim and trial |
| `building.updated` | as before; I4B when a works' smoke changes, I4C when a restyle finishes |

### Panels and the views they read (I4G)

| Panel | Reads |
|---|---|
| The Charter board and the goal pill | `CharterView` (the Town's goals, the trial, what the era opens) |
| The trial card | the trial and the raid's telegraph, as the Village's trial and C5D's raid card |
| The era moment (title card, both screens) | `era.changed`, `EraView` |
| The Districts book and tool | `DistrictView` (name, policy, style, era, the restyle under way); sends the district commands |
| The contracts card | `ContractView`; sends `contract.accept`, `contract.decline` |
| Balances | Port Amberly's flavors and terms, contract loads |
| The building inspector | `BuildingDetail` for the steam works (coal, smoke), the inn (rooms, guests), the theater and bandstand (tonight's show), the library, the post office, the clinic |
| The home inspector | the Next tier line for Merchants |
| The place card and the evening edition | `PlaceView.guests`, `DrawParts.show`, `TourismView` |
| The smoke overlay | `BuildingView.smoke`, `WeatherView.wind` |

V5A reads `BuildingView.era`, `style` and `district`. V5B reads `DistrictView` (style and era), `BuildingView.smoke`, `WeatherView.wind`, `EraView` and `era.changed`, and the agent row's household (for `eraLookOf`, sent in the view).

## Open questions (for I4.0 to settle with the master)

Each brief lists its own; these cross tracks:

- What the bandit raid trial is on the Peaceful threat dial, where no raid ever comes (`14-challenge.md`, Difficulty dials).
- Whether a household may burn coal as a Fuel flavor in winter (coal "joins Fuel"), and whether a home's coal smokes.
- Whether a migrated valley that already meets the Town Charter's goals may claim at once (nothing carries; proposed, R3X draft: yes, from the morning after it loads), and whether I4.0's version 9 fixture should be such a valley.
- Where Port Amberly is reached from (proposed, R3X draft: the River Dock's boat, a longer trip) and which flavors it sells beyond tea (the archive's salt fits no family; a Wares flavor would help the Patrons in I5).
- What the post office does: the spec names it in I4's scope and nowhere else.
- The Steam era's district styles (names and swatches): `12-hearth.md` lists only the four Old Age starters.

## What waits for wave two (shapes reserved by I4.0)

I4.0 reserves names only, with no saved state, so wave two's contracts cycle (proposed: I4.5, save version 11) designs them against what wave one built:

| Item | Reserved in I4.0 | Wave two designs |
|---|---|---|
| Parcels and expansion | the `parcel` layer and `parcelUnlocked` already exist (every parcel unlocked); `ParcelRule` named in content types | the unlock state, purchase, bridges to a parcel, camps and dens as map features, Watch expeditions, what a migrated valley keeps (proposed, R3X draft: every parcel open) |
| The worldgen rim | nothing (worldgen changes only new valleys; maps are saved) | the rim's slope, the horizon meeting it, the golden scripts that generate maps |
| Canals, barges, locks | `water` 4 `canal` (`10-world-and-building.md`, Map layers) | digging, the walk grid, barges as carriers, locks |
| Levees, irrigation, the moat | names in `DefenseDef` and the floodplain overlay | the flood's and drought's rules with them |
| Great owl, river raiders, bandit chief | threat ids in content | their approach, targets and counters, patrol routes |
| The block builder | `LandmarkDef` named | blocks, plots, adapting pieces, the Lighthouse rebuilt by blocks if wave one built it fixed |
| Time-lapse | nothing in the sim | stored periodic snapshots (`21-networking-and-saves.md`, Chronicle snapshots) and the player |
| Coal seams and sand deposits | `deposit` 3 `sand`, 4 `coal` | seams revealed with parcels, the coal pit |
