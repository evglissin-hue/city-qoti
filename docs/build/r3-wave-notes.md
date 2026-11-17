# R3 wave notes: how the tracks meet

Read this with your brief. R3.0 fixed the types and shapes (`docs/spec/20-architecture.md`, "R3 contracts"; the types are in `packages/sim/src/contracts/masters.ts` and the additions to the other contract files); these notes fix who owns which file, the stand-ins each cycle replaces, the runtime handshakes and the order of a day, so the pieces fit when R3X merges them. If something here is wrong for your track, do the sensible thing, keep it additive, and say so in your PR.

## How the wave works

- **Branches.** `cycle/r3x-integration` was cut at `main` (418fbdb) by the master, and R3.0 lands on it through its PR. Every wave cycle branches from `cycle/r3x-integration` after that merge and opens its PR into it, never into `main`. R3X merges the wave there, tunes, and opens the one PR into `main`. V4 merges into `main` as it goes; R3X merges `main` in before its PR.
- **The cycles**: R3A supplies and the lamplighter (xhigh), R3B masters (xhigh), R3C the Town Book and earned callings (high), R3D Follow the thread and R3's interface (xhigh), R3E the bench (high), R3F lamplight and resting pieces (Opus, xhigh), R3G the storybook (high, client only), then R3X (high).
- **Contracts are additive** (`31-parallel-development.md`, Contracts policy): new optional fields, new union members, new types, each new command or event in its own commit. R3 renames and removes nothing.
- **Saves are at version 9** (R3.0, `state/migrate9.ts`, frozen: it reads no system code and keeps its own small tables). A change to the shape of saved state in the wave adds an optional field, absent until used, rather than bumping the version; if a cycle must change a saved shape, it bumps to 10 with a migration and a test and says so in its PR. R3X keeps one version for the merge.
- **Mark your stand-ins.** R3.0 marked each in code with `// R3 stand-in (R3x): ...`, naming the cycle that replaces it. When you replace one, delete the comment. R3X's first step is `grep -rn "R3 stand-in" packages apps tools --exclude-dir=dist --exclude-dir=node_modules`: anything left is a cycle's unfinished work. A test (`test/r3-0/standins.test.ts`) holds that every marker names one of R3A to R3G.
- **Numbers live in content.** Every number of `19-evenings.md` for R3 is in `content.supplies` (`SUPPLIES`, `content/supplies.ts`), `content.mastery` (`MASTERY`) and `content.masters` (`content/masters.ts`), `content.townBook` (`TOWN_BOOK`), `content.specialties`, `content.customs` (`content/townBook.ts`) and `content.callings` (`content/callings.ts`), never a literal in a system. A cycle that needs a new number adds an optional field to the tuning type (additive) and its value in its own file.
- **Ports** (dev server and relay): R3A 5241 and 8851, R3B 5242 and 8852, R3C 5243 and 8853, R3D 5244 and 8854, R3E 5245 and 8855, R3F 5246 and 8856, R3G 5248 and 8858, R3X 5247 and 8857 (R3.0 had 5240 and 8840). V4's cycles may take the same numbers in their own containers; on one machine, V4 moves.

## Starting after R2X

R2X is merged into `main` (#56, with V3X #55), so the wave starts on it. What it left, each placed in a brief:

- **Saves** were at version 8 after R2 (R2X did not bump it); 9 is R3.0's.
- **Arrivals** draw from a per-wave generator seeded from the valley's seed and the tick (`arrivalsRng`, `systems/residents/index.ts`), not the shared `residents` stream, so new behavior no longer reshuffles who arrives. The schedule still shares that stream: R3's choices use a hash or their own order (priority, distance, days, id), never it. R3.0 added no RNG stream; nothing in R3 needs dice.
- **Newcomers follow good evenings**: past `content.places.growthFreeHouseholds` (16) households, homes come only as fast as recent fair evenings send grown-ups out (full pace at `growthFullOutPercent`, 40%; the Homes bar's `quietEvenings`). It is what makes the lanes test pass, and dark lanterns and cold fires work against it: every R3 cycle that moves a draw runs `npm run lanes -w @qoti/bench`.
- **The audit's gap kinds** are `gap-unmeetable` (`gaps/achievable.ts`: the town cannot meet the kind at all) and `gap-dead-end` (`view/health.ts` `gapClosable`: no command could close it where it stands), with `building-cut-off`. R3.0 wired `shortOfSupplies` to R3A's two rules.
- **The tavern's shelf** was never stocked (porters stock only `market` shelves; a tavern's deliveries go to its pouring input). The owner's ruling (below) makes its pouring stock its Treats on the round: R3A builds it.
- **Treats are scarce** in the autoplayed Villages (0 to 12 in town from day 30 to 66 on willow), so the nothing-to-sell gap seldom closes. Supplies (and the tavern) should make Treats a thing a town keeps up with: R3E measures, R3X tunes.
- **"A shop nobody passes"** read visitors at places near the shop, for want of per-outlet evening sales. R3.0 added the counter (`Building.roundSales`, below); R3X retunes the rule on it.
- **The Craftsfolk gate** reads evenings (`NeedsBasket.evenings` 50, `eveningsSlack` 15). The Merchants' and Patrons' variety wants are R3's acceptance as a content and bench reading (those tiers come in I4 and I5): R3E.
- **V3** reached `main` through V3X; R3G's storybook prints V3D's endpaper map and meets V4B's illustrated books at one seam (`ui/pictures.ts`, below).
- **R2X's misses**, each measured by R3E and tuned by R3X: a third of households Craftsfolk by day 70 held on 1 of 4 seeds (day 70 is a winter); gardens behind rows on 0 to 4 a seed; Treats scarce in autoplayed towns; Village debt tracking the credit line; `npm run fixture:grown -w @qoti/client` lands at 108 residents under `grownFixture.test`'s floor of 130 (R3E picks a new seed or day count, R3X regrows it).

## Rulings

### The owner's (2026-11-17)

- **The evening goal.** R2's "every grown-up with a place in reach goes out on a fair evening" becomes "every grown-up with a place worth the walk goes out": a place they score 20 or more with room at some hour. R2's numbers pass it (mean 76 to 77%, worst fair evening 48 to 54%). R3's supplies should lift the draw: R3E reports the worst fair evening's share on every bench seed, and R3X keeps it from falling. "Out of an Evening" stays. (`19-evenings.md` and the R2 acceptance say so now.)
- **The tavern's Treats.** The tavern sells what it pours from its own input (cider and the like, delivered as today); that pouring stock counts as its Treats on the round. No second shelf, no new chain. Settled as a supply here (below); R3A builds it; R3E confirms the nothing-to-sell gap now opens and closes.
- **The endpaper map's night tint** is V4B's, not R3's.
- **The worldgen rim** (a valley sloping out into the hills, new valleys only) is I4's, beside parcels and expansion (`30-roadmap.md`, I4).

### The master's (R3 and V4 master, 2026-11-17)

- **R3's look: R3F, Lamplight and resting pieces** (Opus, xhigh), on the R1E and R2D precedent: lanterns lit and unlit as the lamplighter reaches them, his pole and light, a home with a candle (all its windows lit until bedtime), and the resting pieces (cold fire, bare table, faded cloth, dry fountain, unlit lamp). R3F reads views only (`SuppliesView`, the agent row's flag and anim, `BuildingView.master`), never the sim. Its files are named under File ownership; V4's drafts claim none of them. Handshake with V4A: lamps come on one by one between 17:30 and 18:00, each a light map change, and the still frame must not pop; every static change goes through `ctx.invalidate()`. Budget: the light map's "one blur only when a light changes" holds during the walk (the lamps reached in one tick batch into one redraw).
- **R3's interface: R3D, all of it** (the priority control, supplies on the place card and in Balances, masters in the inspectors, the lamplighter in the Town Hall's, callings on the Charter board and the goal pill, beside the Thread and the Town Book), raised to xhigh. The brief would not fit two pages of honest work with the storybook in it, so **the storybook's print layout is its own client-only cycle, R3G** (high).
- **Bandstand**: dropped from R3. No such piece and no musician's evening; `bandstand-green` stays an unlock. `19-evenings.md` notes it as waiting for I4 (with the theater and the inn).
- **Cafe and trestle tables**: no stock moves and there is no second ledger. A table is served while an outlet in reach (R2's 3 tiles) has Treats on its shelf, read live as R2 rules; otherwise it rests bare, seats only. Folk buy from the outlet as R2B built. The tavern's pouring stock counts as that shelf. (The festival table is the spec's "trestle table".)
- **Braziers in winter**: places draw only above the reserve and the winter mark, but for places the mark falls through winter: the mark times the winter days left over the winter's length, derived, not saved (the season plan has no proration of its own: `winterMark` in `systems/carrier/api.ts` is flat). So a town that entered winter with its reserve met keeps its fires, and a short town has cold fires. The carrier's places switch is the other way out. Homes and businesses keep the flat mark.
- **A household's candle** is a Wares flavor it buys like any other, inside its Wares budget and counting for variety; no line of its own. The home keeps nights left (`Household.candle`). No home ever goes dark.
- **The lamplighter**: jobs are the ceiling of supplied lanterns over 40, at least one from Village rank once a lantern stands, none in a Hamlet. The lit bits are settled at 17:30 from stock and priority only, never from staffing: with nobody in the job the lamps the town has candles for still count from 18:00 and come on together with no walk, and the Town Hall says the job is open. The job is the show and the work, not a way to darken a town.
- **Credit for the fourth gap**: the seat whose `place.setPriority` (keep first, on that place) or carrier places switch (for that family) was sent last while the gap was open (`PlaceState.prioritySet`, `CarrierFamily.placesSet`); with neither, the seats in the Ledger lens, as R2C credits a business grown on a lot.
- **Apprentices** need no four hearts (the master's bond is how a trade spreads); one new master a trade a season still holds, apprentices included.
- **A custom's "same day"** is the day of the season, three seasons running; a day lost to weather holds the run, as R2C holds streaks.
- **A Hamlet's free lanterns** do not count for the Lamplighter's Round; it counts lanterns lit from Village rank.
- **Town, Market Town and City Charters, Merchants and Patrons** arrive in I4 and I5: R3 adds counts and checks only (`masters`, `townBookPages`, `callings` CountWhats), and R3E checks that the Merchants' and Patrons' variety wants can be met.
- **Callings**: a town may earn several, saved as an ordered list (`TownBookState.callings`); `WorldState.calling` comes back (additive, absent until earned) and mirrors the first earned. The style lean waits for I4's districts. P1's other effects, kept where they still make sense zones first (R3C builds them): Garden Village's day visitors (P1's numbers, `TOWN_BOOK.visitors`); Pilgrims' Rest's festival draw (a fifth more guests, one more renown at 2 stars) and its light on lit lanterns (+1, through `callingLanternCharm`, wired into charm); Mill Town's room for one more workshop in the reach of each mill (the Windmill and the Sawmill, `CallingDef.room`, through `callingRoom`, wired into `capacityOf`) in place of P1's yield line; each signature piece unlocked when earned. Dropped: the yield line (no calling is a percentage), the style weights (kept in content, unread until I4).
- **Per-outlet evening customers** for "a shop nobody passes": R3.0's call is a small counter of its own, `Building.roundSales` (`{ day, customers }`, one a sale, written by `recordSale` for stops and passing trade alike), not R3D's door-pair counts, which decay over days and do not tell evening from day. R3X retunes the rule on it.

### R3.0's own calls

- **The masters' goods**, appended in this order with these families (none sold by any neighbor: a master's good is the town's own): pies (Treats, the baker's, from grain), butter (Food, the dairy's, from its land, raw like cheese), jam (Treats, the orchard's, from fruit), cordial (Treats, the cider maker's, from fruit), mead (Treats, the hives', from honey), coats (Wares, the weaver's, from wool), toys (Wares, the carpenter's, from timber), soap (Wares, the chandler's, from honey), smoked fish (Food, the Fishery's, from fish). With the base flavors (Food 6, Wares 3 on a shelf, Treats 2) that is Food 8, Wares 6, Treats 6 against the Merchants' 5, 3, 3 and the Patrons' 7, 5, 5, before specialties (one more flavor each) and trade.
- **Until a master makes one, a master's good is no flavor anybody wants, counts or misses.** `MASTER_GOOD_IDS` (`state/masters.ts`) keeps them off `SHELF_GOODS` (so off the baskets' groups, variety and the hiring feed), off Market Day's base flavors, and off the Balances book's lines unless made, stocked or on offer; the client's request form (`ui/panels/Requests.tsx`) leaves them out. R3B brings each in once a master makes it; R3D shows them where a player picks a good.
- **The place index**: every R3 input is a moving part recomputed in `refreshDraws` each tick (`places/draw.ts`), never a structural input: the lit part asks `decorLit` for the light pieces on the place's tiles (`PlaceExtra.lamps`), the warmth asks `pieceRests` for its fires (`PlaceExtra.fires`; a heated host stays warm), and the draw adds `parts.specialty` (`placeSpecialty`) and `parts.custom` (`customToday`). Nothing joins the structural signature, so R2X's change counter stays as it is, and `test/r3-0/placeIndex.test.ts` holds that the index equals a full rebuild at every turn of an autoplayed year with the verifier on. Each of these readers must stay cheap (a binary search, no scan of the town).
- **The skating spots** are fixed at the freeze and saved (`weather.river.spots`), so a seat joining mid-freeze reads its partner's spots and ice places whatever was built on the bank since; a river frozen by hand (tests) with no saved spots reads them from the map, uncached. The migration fixes them for a valley saved mid-freeze.
- **The defenses' lantern cache** (`systems/defenses/index.ts`) keyed on the decor alone; it now keys on the night settled too, so a seat joining mid-raid reads the lit tiles its partner reads.
- **Lit for the rules and lit for the threats**: `decorLit(state, decor)` is "burns now" (charm's night values and the place draw), `decorLitTonight` is "has a candle for the night settled last" (the threats read it at any hour: a raid at dusk never finds a town half lit). On stand-ins every light burns from 18:00 to 07:00 and every lantern counts, as before R3.
- **The Thread's write points** (`recordThread`): porters' and carts' deliveries (logistics `deliver`, building to building), every household purchase at an outlet (market `purchase`: outlet to home), a Treat at a stop (to the place; a shop stop's goes home) or in a Hamlet (market trade's `sellTreat`), and a Hamlet shopping trip (`residents/shopping.ts`). `recordSale` itself records no thread (`sellTreat` did).
- **The lamplighter's job** is held at the Town Hall: lamplighters are listed in `SuppliesState.lamplighters`, their `jobId` is the Town Hall's, and they are not among its builders. His walk is a schedule override (`lamplighter`, priority 60: above the festival, below the storm and the bell). On the agent row he carries `AgentFlags.lamplighter` (8192), and `AgentAnim.lightLamp` (9) while he lights one.
- **The tavern as a supply**: a tavern's pouring stock (its input of a Treat) counts as its shelf for the round, `sellsTreats`, `treatsOnShelf` and the cafe and festival tables in reach. R3A changes `systems/market/round.ts` for it (the one place those two live).
- **Callings' content** is P1's three, ids unchanged, with a `leaning` and rewritten effect lines; no command picks one, and `calling.choose` stays removed.
- **The picture seam** (for V4B): `apps/client/src/ui/pictures.ts`, created by R3.0: `PictureRef` (`{ book: 'townBook' | 'patternBook' | 'chronicle'; id }`), `pictureFor(ref)` (a URL or null, never throws) and `setPictureSource(fn)`. Slots are landscape 4:3: a book page 240 x 180 CSS px; in the printed storybook a Chronicle entry's picture at half the text width (80 x 60 mm), a book page's 60 x 45 mm; a source returns at least 1600 x 1200 px. V4B registers its source from its own module; whichever of R3X and V4X lands second makes that one call. The shape is fixed; nobody edits the file but for a bug.

## Lessons carried over (read first)

- I3's lesson stands: write tests that hold when every system runs beside yours; isolate with `withoutSystems([...])` but never assume another system is absent.
- **Derived means a pure function of saved state when read** (R2's rule on `Place`). Which pieces rest, a place's warmth, a specialty's draw: work them out from saved state each time, or cache only against a key that covers every input (the defenses' cache above was a live example). A seat joining from a snapshot must read what its partner reads.
- **Derived caches need a writer list** (R2X): the place index's counter is only as safe as the list of writers that bump it. R3 adds no structural input; if your cycle finds it must, add its bump and let the verifier prove it.
- **One kind of choice, one source of order.** R2X's arrivals reshuffled when the round borrowed the `residents` stream. R3 needs no dice: settle by priority, distance and id; masters by days and id; pages by day and id.
- **A rule that counts a run resets on one bad day** (R2X): count whole unless the design says running; a day lost to weather holds a run.
- **Content a Charter, innovation, master or calling unlocks needs a migration** (R2.0's lesson): a piece added to an unlock list is unlocked for valleys already past it (`test/r2-0/unlocks.test.ts` checks the class). Masters and callings start fresh at version 9, so a piece they unlock needs nothing for older valleys; a piece you add to a Charter's list does.
- The money invariant (`treasury + savings - external`) holds through everything: a candle, a supply bought by the carrier for places, a master's good and Garden Village's visitors all move money with `pay()` or book outside money as the visitors did in P1.
- No cycle edits another's file to make its own test pass. Ask in your PR, or use the cross-track API below.

## File ownership

Each path has one owner in the wave. Outside your paths: small, necessary edits only (a registry line, an export, an additive contract member), listed in your PR. Contracts files (`packages/sim/src/contracts/**`, `packages/content/src/types.ts`, `packages/protocol/src/messages.ts`) are shared: additive members in their own commits. R3.0 wired every reader below to its owner's stub, so the hooks are in place: change the stub's body in your file, not the reader.

### R3A, supplies and the lamplighter

- `packages/sim/src/systems/supplies/**` (`api.ts` bodies: `decorLit`, `decorLitTonight`, `pieceRests`, `supplyGapAchievable`, `supplyGapClosable`, `householdBought`; `gaps.ts`, the fourth gap's rule; `lamplighter.ts`, the walk; `index.ts`, the settling at 17:30 and 07:00; new files as needed), `view/supplies.ts` (`suppliesView`, `placeSupplies`, `placeResting`, `buildingSupplies`).
- `systems/carrier/**` (buying for places, within the day's budget and never on the County tab; the places' winter mark that falls through winter), `systems/residents/jobs.ts` (the lamplighter's jobs: hiring and keeping lamplighters out of the Town Hall's builders), `systems/market/round.ts` (the tavern's pouring stock as its Treats), the R3 lines of `view/balances.ts` (`drawnByPlaces`, `forPlaces`).
- Content: `supplies.ts`, the `supply` data on decor (numbers only), the `shortOfSupplies` words in `gaps.ts` (`text`, `closes`, `closed`, `closedQuiet`).
- It may call `markChunks` (`hearth/charm/dirty.ts`) around a piece whose rest changes, so charm follows.
- Tests: new `packages/sim/test/r3a/**`.

### R3B, masters

- `packages/sim/src/systems/masters/**` (`api.ts` bodies: `canReachLevel3`, `masterRoom`, `masterMakes`; the system: working days, becoming one, apprentices, losing one; `Building.masterId` kept in step), `view/masters.ts` (`residentMastery`, `buildingMastery`, `businessMastery`).
- `systems/levels/**` (level 3 with a master on the crew; `levelKept`; the six days' grace and the slide), `systems/residents/life.ts` (apprenticeships under a master), `systems/production/**` (the master's recipe, made in the same building while a master is on the crew), `systems/market/**` except `round.ts` (a master's good joins `SHELF_GOODS`, the baskets and variety once made: R3A's and R3C's hooks there stay as wired).
- Content: `masters.ts` (numbers, recipes, unlocks), the carved stone and ornamental trees as locked Hearth pieces in a new `masterDecor.ts` (each unlocked by its master; looks from existing kits until R3F gives them their own), the story characters' masteries in `stories.ts`, `herbalist.ts` and `stonemason.ts`, the pie contest in `festivals.ts` (its seasons and its goal on pies).
- Tests: new `packages/sim/test/r3b/**`.

### R3C, the Town Book and earned callings

- `packages/sim/src/systems/townbook/**` (`api.ts` bodies: `specialtiesOnRound`, `placeSpecialty`, `customToday`, `townBookSale`; the system: the counts at the evening's close, detection, pages, hints, credit, renown, callings earned and `WorldState.calling`), `systems/callings/**` (`callingRoom`, `callingLanternCharm`, Garden Village's visitors), `view/townBook.ts`.
- `systems/festivals/{api,rewards,score}.ts` (a specialty as a dish on the menu, Pilgrims' Rest's guests and renown, a custom's twist scored), content `townBook.ts`, `callings.ts`, and the custom twists in a new `customTwists.ts` (FestivalTwistDefs with `custom` set, registered in the twists list).
- Tests: new `packages/sim/test/r3c/**`.

### R3D, Follow the thread and R3's interface

- `packages/sim/src/systems/threads/**` (`recordThread`'s body, the midnight halving, the bound per door), `view/threads.ts` (`threadView`).
- In the client: new `ui/panels/TownBook.tsx` (one registry line), the Thread in `ui/panels/{Inspector,BuildingInspector,ResidentInspector,PlaceCard,GoodCard}.tsx`, the R3 lines in `ui/panels/{Balances,Charter}.tsx` and `ui/GoalPill.tsx`, `state/mirror.ts` (`supplies`, `townBook`), `state/undo.ts` (`place.setPriority`, the places switch), `worker/messages.ts` (additive: the Thread request and its reply) and the worker's handler for it, e2e `apps/client/e2e/r3d-*.spec.ts`, shots `docs/build/screenshots/r3d-*`.
- Senders owed: `place.setPriority` and `carrier.setRule`'s `places` (`OWED_SENDERS`, `OWED_FIELDS`).

### R3E, the bench

- `tools/bench/**` (advisors, `lanes.ts`, `outcomes.ts`, `targets*`, `audit.ts`, `autoplay.ts`, new `r3.bench.ts`), `packages/sim/src/view/health.ts` (the R3 health kinds; R3.0 wired `shortOfSupplies` in `gapClosable` to R3A's rule), `apps/client/scripts/grow-fixture.mjs` (a new seed or day count).
- Tests: `tools/bench/src/**/*.test.ts`, `packages/sim/test/p1/health*`, new `packages/sim/test/r3e/**`.

### R3F, lamplight and resting pieces

- `apps/client/src/render/lightMap.ts`, `render/lighting.ts` (`windowLit` with a candle home), `render/material.ts` (the window glow for candle homes), `render/layers/lights.ts` (lamps by reach tick, candle windows), `render/layers/decor.ts` (resting pieces), `render/layers/agents.ts` (the pole and light), `render/layers/buildings.ts` (candle homes).
- In `packages/art/src/kits`: `residents.ts` (the pole), `props.ts`, and the kits of the supplied pieces for their resting looks: `decor.ts` (lantern), `garden.ts` (hanging lantern, birdbath), `fineDecor.ts` (lamp post, maypole, fountain, cafe table), `festival.ts` (bonfire, bunting, flower arch, stage, festival table); the brazier its own kit (today it is drawn with the lantern kit's `brazier` param).
- If time allows: the master's sign (a line in content `dressingRules.ts` reading `BuildingView.master`), and the carved stone and ornamental tree looks for R3B's pieces.
- V4's drafts claim `render/{cache,post,shadows,resolution,ink}.ts`, `renderer.capture()`, `input/camera.ts`, and for V4X `renderer.ts`, `perf.ts`, `debug.ts`: R3F takes none of them.
- Tests beside the files; shots `docs/build/screenshots/r3f-*`.

### R3G, the storybook

- New `apps/client/src/ui/panels/Storybook.tsx` (one registry line), a print stylesheet `ui/storybook.css`, "Print the storybook" where a chapter closes (the Chapter panel's one line), the endpaper still for print (one method appended to `render/api.ts` and implemented in `render/endpaper.ts`, which neither V4 nor R3F claims), e2e `apps/client/e2e/r3g-*.spec.ts` (`page.pdf`), shots `docs/build/screenshots/r3g-*`.
- It reads views through the Mirror (Chronicle entries and snapshots, the Pattern Book, `TownBookView`, residents' portraits) and pictures through `ui/pictures.ts`.

### Shared, by turn

- `packages/sim/src/index.ts` (exports), `systems/index.ts`, `commands/index.ts`, `content/src/index.ts`, `apps/client/src/ui/panels/index.ts`: one sorted line each.
- `packages/sim/src/systems/residents/index.ts` and `residents/overrides.ts`: nobody edits them in the wave (R3.0 registered the lamplighter's override).
- `apps/client/src/ui/pictures.ts`: R3.0's seam; shape fixed.
- `CHANGELOG.md`, `docs/build/README.md`: one line each, merged by R3X.

## Stand-ins (each replaced by its cycle)

| Stand-in | Where | What it does now | Replaced by |
|---|---|---|---|
| Lit now | `systems/supplies/api.ts` (`decorLit`) | every light burns from 18:00 to 07:00 | R3A |
| Lit tonight | `systems/supplies/api.ts` (`decorLitTonight`) | every lantern counts for the threats | R3A |
| Resting | `systems/supplies/api.ts` (`pieceRests`) | nothing rests | R3A |
| The fourth gap | `systems/supplies/{api,gaps}.ts` (`supplyGapAchievable` false, `supplyGapClosable` true, `keepSupplyGaps` nothing) | never opens | R3A |
| A household's candle | `systems/supplies/api.ts` (`householdBought`) | buys nothing but the candles themselves | R3A |
| The settling | `systems/supplies/index.ts` | nothing settles; no candle burns | R3A |
| The lamplighter's round | `systems/supplies/lamplighter.ts` (`lamplighterRound`) | nobody walks | R3A |
| Supplies' views | `view/supplies.ts` (`suppliesView`: every lantern at 18:00, nothing resting; `placeSupplies`, `placeResting`, the Town Hall's line) | as R2 | R3A |
| Level 3 | `systems/masters/api.ts` (`canReachLevel3`) | the keeper's 20 working days, as R1 | R3B |
| A master's room, a master's good made | `systems/masters/api.ts` (`masterRoom` 0, `masterMakes` false) | none | R3B |
| The masters' day | `systems/masters/index.ts` | no days counted, no master made | R3B |
| Masters' views | `view/masters.ts` | nothing to say | R3B |
| Specialties, customs, sales by good | `systems/townbook/api.ts` (`specialtiesOnRound`, `placeSpecialty`, `customToday` 0; `townBookSale` nothing; `specialtyGood` false) | none | R3C |
| The Town Book's close | `systems/townbook/index.ts` | no counts closed, no page found | R3C |
| Callings' effects | `systems/callings/{api,index}.ts` (`callingRoom`, `callingLanternCharm` 0; no visitors) | none | R3C |
| The thread counts | `systems/threads/{api,index}.ts` (`recordThread` nothing; no halving) | none | R3D |
| The Thread | `view/threads.ts` (`threadView`) | "Nobody has followed this thread yet." | R3D |
| The feats' setups | `packages/sim/test/hearth/achievements.test.ts` (`PENDING`) | The Lamplighter's Round, Master of the House and Made Together are left out of "every achievement has a setup and unlocks once" | R3A, R3B, R3C |

Not stand-ins (real from R3.0): the contracts and their helpers (`state/masters.ts`: `pieceSupply`, `residentIsMaster`, `craftDays`, `MASTER_GOOD_IDS`, `isMasterGood`), `isMaster`, `masterOf`, `mastersCount`, `mastersMade`, `lampSeasons`, `candleHomes`, `customFound`, `pagesFound`, `pagesTogether`, `hasCalling`, `callingsCount`, `townBookView`, `CharterView.callings`, `Building.roundSales`, `place.setPriority` and the places switch (validate and store), the migration, the skating spots, the defenses' key, the six CountWhats.

## Handshakes

### Who writes what

| State | Written by | Read by |
|---|---|---|
| `supplies.night`, `lamps` (lit bits and reach ticks) | R3A (the settling) | `decorLit`, `decorLitTonight` (charm, the draw, threats), R3F (via `SuppliesView`), the defenses' cache key |
| `supplies.pieces` (nights rested, cloth's season, the fire's day) | R3A | `pieceRests`, the fourth gap, the place card |
| `supplies.drawn` | R3A | the Balances line (R3A's view), R3E |
| `supplies.lamplighters` | R3A (`residents/jobs.ts`) | the Town Hall's line, R3F (agent flag), R3E |
| `supplies.roundSeasons` (`lampSeasons`) | R3A | The Lamplighter's Round, R3C's "Lantern Round" custom (through `PlaceState.supplied`) |
| `Household.candle` | R3A (`householdBought`, the settling) | `candleHomes`, the home's detail, R3F |
| `PlaceState.priority`, `prioritySet` | `place.setPriority` (R3.0; R3D sends it) | R3A (settling order, fires, cloth; credit) |
| `CarrierFamily.places`, `placesSet` | `carrier.setRule` (R3.0; R3D sends it) | R3A (the carrier), the Balances line, credit |
| `PlaceState.supplied` | R3A (each night) | R3C (a custom of a kept supply) |
| `Resident.craft`, `mastery`, `ResidentFlags.master`; `Apprenticeship.master` | R3B (`masters`, `life.ts`); the migration | `masterOf`, `mastersCount`, levels, views, R3E |
| `masters.lastMade`, `made` | R3B | the one-a-season cap, Master of the House |
| `Building.masterId`; `BusinessCounters.masterGone`, `levelKept` | R3B (levels, masters); the migration | `BuildingView.master` (R3F's sign), levels |
| `PlaceState.customers` | R3C (`townBookSale`, from `recordSale`) | R3C's close |
| `PlaceState.goodEvenings`, `dayRuns` | R3C (the close) | specialties and customs |
| `townBook.pages`, `hints`, `callings`; `WorldState.calling` | R3C | `townBookView`, `CharterView.callings`, the conditions, the storybook |
| `threads.pairs` | R3D (`recordThread`, the midnight halving) | `threadView` |
| `Building.roundSales` | `recordSale` (R3.0) | R3X's retune of "a shop nobody passes" |
| `weather.river.spots` | the freeze (R3.0) | `skatingSpots`: the ice places, skating, charm |

### Cross-track API (signatures fixed by R3.0)

| API | File | Owner | Readers wired |
|---|---|---|---|
| `decorLit(state, decor)` | `systems/supplies/api.ts` | R3A | charm's night values (`hearth/charm/compute.ts`), the draw's lit part (`places/draw.ts`) |
| `decorLitTonight(state, decor)` | same | R3A | `lanternLit`, `litTiles` (`threats/api.ts`), so `deterrenceAt`, `deterrenceParts`, wolves, the defenses |
| `pieceRests(state, decor)` | same | R3A | a place's warmth (`places/draw.ts`), a faded or dry piece's charm (`charm/compute.ts`, `restCharmPercent`) |
| `supplyGapAchievable(state)`, `supplyGapClosable(state, gap)` | same | R3A | `gaps/achievable.ts`, `view/health.ts` `gapClosable` |
| `keepSupplyGaps(pass, achievable)` | `systems/supplies/gaps.ts` | R3A | the gaps pass (`gaps/index.ts`), after R2's rules |
| `householdBought(state, h, good, units)` | `systems/supplies/api.ts` | R3A | the baskets' Wares purchase (`market/baskets.ts`) |
| `lamplighterRound(state, r, hour)` | `systems/supplies/lamplighter.ts` | R3A | the schedule overrides (`residents/overrides.ts`) |
| `lampSeasons`, `candleHomes`, `supplyOf` | `systems/supplies/api.ts` | R3A (real) | conditions, views |
| `isMaster(r)`, `masterOf(state, b)`, `mastersCount(state, trade?)`, `mastersMade(state)` | `systems/masters/api.ts` | R3B (real) | conditions, views |
| `canReachLevel3(state, b, counters)` | same | R3B | the levels pass |
| `masterRoom(state, specialized)` | same | R3B | `capacityOf` (`specialized/api.ts`) |
| `masterMakes(state, good)` | same | R3B | `goodMakeable` (`festivals/twists.ts`: the pie contest) |
| `residentMastery`, `buildingMastery`, `businessMastery` | `view/masters.ts` | R3B | `residentDetail`, `buildingDetail`, `businessView` |
| `specialtiesOnRound(state, h, family)` | `systems/townbook/api.ts` | R3C | `householdVariety` (`market/balances.ts`) |
| `placeSpecialty(state, place)`, `customToday(state, place)` | same | R3C | the draw (`DrawParts.specialty`, `custom`) |
| `townBookSale(state, row, good)` | same | R3C | `recordSale` (`places/api.ts`) |
| `specialtyGood(state, good)` | same | R3C | the carrier's sale percent (`carrier/terms.ts` `cartPercent`: a specialty sells at the neighbor's full price) |
| `customFound(state, id)` | same | R3C (real) | `twistOffered` (a custom's twist waits for its page) |
| `pagesFound`, `pagesTogether` | same | R3C (real) | conditions |
| `callingRoom(state, specialized)`, `callingLanternCharm(state)` | `systems/callings/api.ts` | R3C | `capacityOf`, charm |
| `hasCalling`, `callingsCount` | same | R3C (real) | conditions, R3C's effects |
| `recordThread(state, from, to, good, qty)` | `systems/threads/api.ts` | R3D | logistics `deliver`, market `purchase`, `sellTreat`, `residents/shopping.ts` |
| `threadView(state, subject)` | `view/threads.ts` | R3D | the client (a worker request R3D adds) |
| `suppliesView`, `placeSupplies`, `placeResting`, `buildingSupplies` | `view/supplies.ts` | R3A | the snapshot, `placeView`, `buildingDetail` |
| `townBookView` | `view/townBook.ts` | R3C (real) | the snapshot, `townBook.updated` |
| `skatingSpots`, `findSkatingSpots` | `systems/seasons/place.ts` | R3.0 (real) | places, charm, skating |

### The order of a day (where each R3 system runs)

| Time | System (order) | R3 work |
|---|---|---|
| 00:00 | threads (41) | the door-pair counts halve and faded ones drop (R3D) |
| 00:02 on a season's first day | seasons (12) | the season turns: R3A closes the Lamplighter's Round for the season just ended (from Village rank) at its next run; R3C's season counts and R3B's one-a-season cap read the absolute season index, so a stale season reads as zeros (nothing to roll) |
| 07:00 | supplies (57) | lamps out (`decorLit` reads the hour); `supplies.updated` (R3A); charm's 07:00 recompute marks every lantern as today |
| 10:00 | carrier (65) | buys for places where the Ledger switched it on, within the budget, never on the tab (R3A) |
| 15:00 | callings (88) | Garden Village's day visitors (R3C) |
| 17:00 | residents (50), baskets (67) | `startEvening` (R2A); Treats accrue (R2B) |
| 17:30 | supplies (57) | the settling: tonight's lit lanterns and reach ticks from stock and priority (keep, then as it comes, then rest; nearest first; ties by id), each household's candle burns a night, fires that may burn tonight, cloth for the season; `supplies.updated`. The lamplighter's walk begins (the `lamplighter` override) |
| 17:30 to 18:00 | residents (50), movement (52) | he walks; each lamp comes on at its reach tick for whoever draws it (R3F) |
| 18:00 | charm (70) | night values only for lanterns that burn (`decorLit`); places' lit part; everything settled counts as lit from 18:00 sharp |
| 17:00 to 21:00 | baskets (67) | Treats at stops and passing: `recordSale` counts `roundSales`, `townBookSale`; `sellTreat` records the thread |
| 18:00 | baskets (67) | the household pass: a candle bought within Wares (`householdBought`) |
| 21:00 | residents (50) | `closeEvening` (R2B) |
| 21:03 | gaps (79) | R2's three rules, then the fourth gap (`keepSupplyGaps`, R3A) |
| 21:20 | townbook (81) | the evening's counts close (customers by good, evenings at 10+, visitors by day of the season), pages found, credit, renown, hints, callings (R3C) |
| 21:30 | baskets (67) | the doorstep errand (R2B; its purchases record threads) |
| 23:30 | levels (69) | level 3 through `canReachLevel3`; the grace and the slide (R3B) |
| 23:45 | masters (87) | working days by trade, new masters (one a trade a season), apprentices, losses (R3B) |

### Events

| Event | Emitted by |
|---|---|
| `supplies.updated` (`SuppliesView`) | R3A: at the settling, at 07:00, and when a priority or a piece's rest changes |
| `townBook.updated` (`TownBookView`) | R3C: a page found, the hints moved on, a calling earned |
| `places.updated` | R2A as before; `place.setPriority` (R3.0) |
| `balances.updated` | as before; `carrier.setRule` with `places` (R3.0); R3A after the night's draws |
| `life.event` with `kind: 'master'` or `'masterLost'` | R3B (the sign, a Chronicle line and a letter) |
| `business.updated`, `building.updated` | as before; R3B when a master comes or goes (`BusinessView` master fields, `BuildingView.master`) |
| `charter.updated` | as before; R3C when a calling is earned (`CharterView.callings`) |

### Panels and the views they read (R3D, R3G)

| Panel | Reads |
|---|---|
| The Thread (every inspector, the place card, the good card) | `threadView` through a worker request (R3D adds it), drawn through the highlight API |
| The place card | `PlaceView.priority`, `supplies`, `resting`, `pages`, `parts.specialty`, `parts.custom`; sends `place.setPriority` |
| Balances | `BalanceLine.drawnByPlaces`, `forPlaces`; sends `carrier.setRule` with `places` |
| The resident inspector | `ResidentDetail.craft`, `master`, `apprenticeOf` |
| The building inspector | `BuildingDetail.master` (a business), `lamplighter` (the Town Hall), `candle` (a home) |
| The Businesses book | `BusinessView.masterId`, `masterGood`, `apprentices`, `graceDays` |
| The Charter board and the goal pill | `CharterView.callings` |
| The Town Book (both lenses) | `TownBookView`; pictures through `ui/pictures.ts` |
| The storybook (R3G) | Chronicle entries and snapshots, the Pattern Book, `TownBookView`, portraits, the endpaper still; pictures through `ui/pictures.ts` |

R3F reads `SuppliesView` (`lamps` with `reach` and `out`, `resting`, `candles`, `candleUntil`), the agent row (`AgentFlags.lamplighter`, `AgentAnim.lightLamp`) and `BuildingView.master`.

## Skipped and changed tests

- No test was skipped by R3.0. One exclusion: the three R3 feats are kept out of `hearth/achievements.test.ts`'s every-achievement loops (`PENDING`) until R3A, R3B and R3C count them.
- Changed: `packages/sim/test/r1/saves.test.ts` and `test/r2-0/saves.test.ts` (version 9; each keeps testing its own step), `test/turn.test.ts` (the R3 slots), `test/hamlet-contracts.test.ts` (the nine goods after the sixteen; the snapshot's `supplies` and `townBook`), `test/seasons/weather.test.ts` (the spots before a freeze come from `findSkatingSpots`), `test/every-command-has-a-sender.test.ts` (`OWED_SENDERS` takes R3D's; `OWED_FIELDS` for `carrier.setRule`'s `places`), the content tests (the nine goods, 26 achievements, `village.test.ts` counts the masters' recipes as makers).
- New: `packages/content/src/r3.test.ts` (R3 content validation), `packages/sim/test/r3-0/**` (the migration on a real version 8 valley and from version 6, stand-ins, the commands, the joining seat mid-freeze, the place index over an autoplayed year), `packages/sim/scripts/r3-0-hash.ts` with two browser-worker tests in `apps/client/e2e/determinism.spec.ts`.
- Golden files: `i0-basic.json`, `i1-hamlet.json` and `r1-year.json` are command scripts with no stored hash, so the new state hashes differently in Node and a browser worker alike and nothing needs regenerating. R3.0 added `v8-willow-day70.json`, a real version 8 valley (willow after 70 autoplayed days, written at 19a031a by `TUNE_SAVE=<file> npm run tune -w @qoti/bench 70 willow`: a Village mid-freeze, 140 residents, three keepered level 3 businesses).
