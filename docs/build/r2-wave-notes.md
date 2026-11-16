# R2 wave notes: how the tracks meet

Read this with your brief. R2.0 fixed the types and shapes (`docs/spec/20-architecture.md`, "R2 contracts"; the types are in `packages/sim/src/contracts/evenings.ts` and the additions to the other contract files); these notes fix who owns which file, the stand-ins each cycle replaces, the runtime handshakes between tracks and the order of an evening, so the pieces fit when R2X merges them. If something here is wrong for your track, do the sensible thing, keep it additive, and say so in your report.

## How the wave works

- **Branches.** Every wave cycle branches from `cycle/r2x-integration` (R2.0's last commit) and opens its PR into `cycle/r2x-integration`, never into `main`. R2X merges the wave there, tunes, and opens the one PR into `main`. V3 merges into `main` as it goes; R2X merges `main` in before its PR.
- **Contracts are additive** (`31-parallel-development.md`, Contracts policy): new optional fields, new union members and new types only, each new command or event in its own commit. R2 removes nothing; `beauty` and `social` stay in the need union, unread by tiers once R2B lands.
- **Saves are at version 8.** P2 (the R1 playtest, PR #43) took version 7 (`demand.starts`, the day's growth starts); R2.0's migration 7 to 8 (`state/migrate8.ts`) is frozen and reads no system code, and a real version 6 valley is tested through both. A change to the shape of saved state in the wave adds an optional field (absent until used) rather than bumping the version; if a cycle must change a saved shape, it bumps to 9 with a migration and a test and says so in its PR. R2X decides whether the merge ships as 8 or 9.
- **Mark your stand-ins.** R2.0 marked each stand-in in code with `// R2 stand-in (R2x): ...`, naming the cycle that replaces it. When you replace one, delete the comment. R2X's first step is `grep -rn "R2 stand-in" packages apps tools --exclude-dir=dist --exclude-dir=node_modules`: anything left is a cycle's unfinished work.
- **Numbers live in content.** Every number in `19-evenings.md` is in `content.places` (`packages/content/src/places.ts`, the `PLACES` table), the gap table (`content/gaps.ts`) or `NeedsBasket.evenings`, never a literal in a system. A cycle that needs a new number adds a field to `PlacesTuning` (additive) and its value in its own section of `places.ts`.
- **Ports** (dev server and relay, so cycles can run their e2e side by side): R2A 5231 and 8841, R2B 5232 and 8842, R2C 5233 and 8843, R2D 5234 and 8844, R2E 5235 and 8845, R2F 5236 and 8846, R2X 5237 and 8847 (R2.0 had 5230 and 8840). V3.0's brief gives V3A to V3X the same numbers 5231 to 5235; the waves run in separate containers, so this only matters on one machine: there, V3 moves.

## Starting after P2

P2 (the R1 playtest, PR #43, `docs/build/cycle-p2-playtest.md`, As built) is merged into `cycle/r2x-integration` by R2.0, so the wave starts on it. What it changed that the wave builds on, never against:

- **Save version 7** is P2's (`demand.starts`); R2 is 8 (above).
- **Growth**: `systems/growth/{bars,index,site}.ts` reworked: the zone bars give the true reason nothing starts (`DemandReasonCode` gains `noRoad`, `outOfReach`, `unsuitable` with `DemandReason.want`, `materials`, `sitesBusy`; `lotWaiting` carries the next pass's hour), and a midday growth pass is built and switched off (`GROWTH_MIDDAY` false, `GROWTH_HOURS`, the shared day's allowance `demand.starts`). Do not redo or fight either: R2B's Shops reasons (footfall, places with nothing to sell) are new codes beside P2's, and R2F's garden lots are never free lots in any of P2's reasons (`lotWaiting`, `outOfReach`, `unsuitable`, `materials`, `sitesBusy`).
- **The top bar**: in the Ledger the strip is its own row at laptop widths (`ui/topbar/strip.ts`, `Strips.tsx`, `GoalPill.tsx`, new `ui/hands.ts` and `ui/sites.ts`), and cards and side panels sit under it. R2D's Hearth strip sits beside it in the Hearth lens and follows its layout.
- **The feed**: the Ledger's feed lines for waiting sites, wanted zones and waiting lots (`ui/sites.ts`). R2D's gap rows join the same feed and follow its line style.
- **Render**: `render/layers/overlays.ts` draws P2's waiting-site markers in the Ledger lens (`RenderApi.setSiteMarkers`); R2D's Town overlay goes beside them in that file. Roofs keep to their own lot (`ShellSpec.lot` in `packages/art/src/kits/buildings.ts`, with `grown.ts`, `farms.ts`, `workshops.ts` and `lotBounds.test.ts`): R2F's lots and V3B's rows must respect that clamp (rows that join are unchanged).
- **Tuning**: P2 shipped the midday growth pass switched off behind `GROWTH_MIDDAY` (it broke R1X's tuning on three seeds), so growth still runs once, at 01:00, and P2's tune numbers equal `main`'s (`r1-year.json` replays command for command); so R2E's and R2X's tuning starts from R1X's tables in `13-ledger.md` plus P2's measured table for the midday pass.

## Lessons carried over (read first)

- I3's lesson stands: write tests that hold when every system runs beside yours; isolate with `withoutSystems([...])` but never assume another system is absent.
- **Determinism of derived places.** A `Place` is derived and never saved, so it must be a pure function of saved state at the moment it is read (the rule on `Place` in `contracts/evenings.ts`). R2A's index rebuilds lazily when an input changes and caches nothing that moves from tick to tick (stock): whether an outlet has Treats is read live through `treatsOnShelf`. Break this and a seat joining from a snapshot desyncs.
- The money invariant (`treasury + savings - external`) holds through everything: a treat bought on the round moves pennies from a household's savings to the treasury with `pay()` (as every sale does), never across the valley's edge.
- R1X's lessons: the household loop nets the treasury nothing, so evening trade alone does not mend Village debt; growth waits for hands (`HANDS_WAITING`); variance between runs is large, so read targets over several seeds and runs; run the audit after every tuning change.
- No cycle edits another's file to make its own test pass. Ask in your PR, or use the cross-track API stubs below.

## File ownership

Each path has one owner in the wave. Outside your paths: small, necessary edits only (a registry line, an export, an additive contract member), listed in your PR. Contracts files (`packages/sim/src/contracts/**`, `packages/content/src/types.ts`, `packages/protocol/src/messages.ts`) are shared: additive members in their own commits.

### R2A, places and the round

- `packages/sim/src/systems/places/**` (the pass, seats, kinds, draw, ids, names; `api.ts` bodies; `streets.ts`), `systems/residents/{round,outings,schedule,places,friends}.ts` (the planner grows out of `chooseLeisure` and the schedule; `startEvening` at 17:00; friendships made on the round), `systems/movement/**` (the evening cost on the walk grid, fixed at 17:00; footfall counting; the 04:00 halving; `footfall.updated`).
- `packages/sim/src/commands/place.ts` (`place.rename`, as R2.0 wrote it) and the `road.rename` handler in `commands/road.ts` (R2B owns `road.setEvening` there: two handlers in one file, separate functions; keep each to its own).
- `packages/sim/src/view/places.ts` (`placeView`'s `present` and `wants`, streets, a resident's round, footfall), `view/agents.ts` (the `sit` anim and its seat; `carry` is R2B's to set on the resident).
- Content: `packages/content/src/{decor,villageDecor,natureDecor,signatureDecor,threats}.ts` (seats and standing on pieces), the `host` entries on `villageBuildings.ts`, `seasonsBuildings.ts` and `buildings.ts` (data only; R2F owns the defs' lot fields), the place and round sections of `places.ts`.
- Tests: new `packages/sim/test/r2a/**`.

### R2B, evening trade

R2A and R2B share `systems/residents` and `systems/market`; this split is by file.

- `systems/market/{baskets,round,api}.ts` (Treats leave the 18:00 pass and are bought on the round; passing trade; the 21:30 doorstep errand; `sellsTreats` and `treatsOnShelf`), `systems/residents/{evening,needs,shopping,shops,life}.ts` (the 21:00 score and `closeEvening`, the evenings need and its weight in mood, shopping first on the round, the bond heart), `systems/services/**` (the tavern's `social` need folds into evenings; `weightsOf` reads `content.places.needWeight` in beauty's place; never edit `NEED_WEIGHTS` in `constants.ts`), `systems/tiers/**` (tiers read `NeedsBasket.evenings` over `PLACES.tierDays`, not charm or the tavern).
- Porters' barrows walk the residents' grid, which is R2A's: R2B asks `pathFor(state, from, to, 'barrow')` and handles a null (wait at the edge, the store says so); R2A makes the mode keep off evening streets from 17:00 to 21:00. Carts route in `traffic` (R2B's own).
- `systems/growth/{desirability,bars,outlets,cafes}.ts` (Shops desirability by evening footfall and places; the Shops bar counts places with nothing to sell; cafes), `systems/levels/**` (every ten evening steps past a door count as a customer; the cafe check runs from the levels pass), `systems/logistics/**` and `systems/traffic/**` (evening streets: carts and barrows go round from 17:00 to 21:00, no cart noise there, carters keep the porters' hours, a stretch's stall or workshop gets no delivery after 17:00).
- `commands/road.ts`: the `road.setEvening` handler only (R2.0 wrote validate and store).
- `packages/sim/src/turn.ts` and `speed.ts` (dusk at half speed when `settings.eveningLingers !== false`).
- Content: `baskets.ts` (`evenings` per tier; drop `charm` 25 and the tavern from Craftsfolk's gates when tiers read evenings), the trade, need and good-evening sections of `places.ts`.
- Tests: new `packages/sim/test/r2b/**`; the existing tiers, baskets, shopping and logistics tests where R2B changes their system.

### R2C, gaps and the evening's book

- `packages/sim/src/systems/gaps/**` (the rules, `openGap` and `closeGap` bodies, credit), `view/gaps.ts`, `view/evening.ts` (the tally, the edition's lines, the Hearth's strip), `view/season/index.ts` (the joint report's cross-lane lines), `systems/festivals/together.ts` (Together goals count closed gaps), `systems/stories/**` and `conditions/**` (the five R2 `CountWhat`s: `gapsClosed`, `gapsClosedEachSeat`, `eveningsOut`, `eveningsAllOut`, `seatedSeasons`; closed gaps where fulfilled requests counted), `systems/achievements/**`, `commands/request.ts`.
- Content: `gaps.ts` (the words), `achievements.ts` (R2.0 added Out of an Evening, A Seat for Everyone and Mind the Gap with their conditions), `charters.ts` (the Village's evening goal: half the grown-ups out on three fair evenings; add it only with its counter, never before: on stand-ins nobody goes out, so the goal would block every Village).
- `state.evenings`' runs (`outRun`, `allOut`, `stoodThisSeason`, `seatedSeasons`) and `evening.closed`, `gaps.updated`.
- Tests: new `packages/sim/test/r2c/**`.

### R2D, the interface

- `apps/client/src/ui/panels/{PlaceCard,Day,Edition}.tsx` (new, one registry line each in `ui/panels/index.ts`), `ui/panels/{ResidentInspector,SeasonCard,Chapter}.tsx` and the season spread, `ui/topbar/**` (the Hearth's strip), `ui/lenses.ts` (the `town` overlay entry), `ui/cards.ts`, `ui/settings.ts` and `ui/SettingsPanel.tsx` (the lingering evening, the edition as a feed line), `input/tools/road.ts` and a new `input/tools/evening.ts` (the evening street brush), rename in the inspectors, `state/mirror.ts` and `state/undo.ts` (what the panels need: places, gaps, streets, the evening, footfall; inverses for `road.setEvening` and the renames).
- The one render path: the Town overlay's drawing in `render/layers/overlays.ts` and a new `render/overlayTown.ts`, and gap tags through the notes layer's existing API. V3 owns every other render path; V3.0's brief claims neither file. If V3's wave notes say otherwise, draw through `setOverlay` and `highlight` and ask in the PR.
- Senders owed by R2D: `road.setEvening`, `road.rename`, `place.rename` (`OWED_SENDERS` in `test/every-command-has-a-sender.test.ts`).
- e2e: new `apps/client/e2e/r2d-*.spec.ts`; shots `docs/build/screenshots/r2d-*`.

### R2E, the bench

- `tools/bench/**` (a Hearth advisor that composes places, a Ledger advisor that zones shops along walks, the lanes test enforced, R2's outcome tests, the targets script's R2 columns, bench scenes), `packages/sim/src/view/health.ts` (the audit's R2 kinds).
- Tests: `tools/bench/src/**/*.test.ts`, `packages/sim/test/p1/health*`, new `packages/sim/test/r2e/**`.

### R2F, lots for streets

- `packages/sim/src/systems/zoning/**` (`lots.ts`, the hourly idempotent pass; `storeys.ts`), `systems/growth/{index,site,recipes,api,trades,defs,retool}.ts` (garden lots never grow, the corner lot's def by the busier road, `storeys` passed to `growLot`), `view/lots.ts` (`lotView`), `view/zones.ts` (re-exports only).
- Content: `zones.ts` (the per-road-class width and depth table, `ZoneDef`).
- Fixtures: lot fixtures of its own beside `packages/sim/test/fixtures/**`.
- Tests: new `packages/sim/test/r2f/**`.

### Shared, by turn

- `packages/sim/src/index.ts` (exports), `systems/index.ts`, `commands/index.ts`, `view/evenings.ts` (a barrel of the three view files), `content/src/index.ts`, `apps/client/src/ui/panels/index.ts`, `ui/lenses.ts`, `input/tools/index.ts`: one sorted line each.
- `packages/content/src/places.ts`: each cycle edits its own section; new fields additive.
- `packages/sim/src/systems/residents/index.ts`: nobody edits it in the wave. R2.0 wired the two evening moments: `startEvening` (R2A, `residents/round.ts`) at 17:00 and `closeEvening` (R2B, `residents/evening.ts`) at 21:00.
- `CHANGELOG.md`, `docs/build/README.md`: one line each, merged by R2X.

## Stand-ins (each replaced by its cycle)

| Stand-in | Where | What it does now | Replaced by |
|---|---|---|---|
| The place pass | `systems/places/index.ts` (`places`, `placeIndex`) | finds no places; `state.places` stays empty | R2A |
| Who is at a place and what it wants | `view/places.ts` (`present`, `wants`) | 0 and none | R2A |
| Starting the evening | `systems/residents/round.ts` (`startEvening`) | nothing: the tally keeps day -1, no place evening is pushed, nobody plans | R2A |
| Street runs | `systems/places/streets.ts` (`streetTiles`) | a street is its anchor tile; `state.streets` stays empty (nothing names runs) | R2A |
| Path modes | `systems/movement/paths.ts` (`pathFor`) | every mode walks the ordinary grid (no evening cost, barrows not kept off evening streets) | R2A (round and barrow); R2B calls barrow |
| The evening's score | `systems/residents/evening.ts` (`eveningScore`) | every evening scores the floor, `PLACES.stayInScore` (20) | R2B |
| Closing the evening | `systems/residents/evening.ts` (`closeEvening`) | nothing: the evenings need stays at 50 | R2B |
| Which outlets sell Treats | `systems/market/round.ts` (`sellsTreats`) | any built outlet or tavern | R2B |
| Cafes | `systems/growth/cafes.ts` (`cafeTables`) | no shop puts tables out | R2B |
| The gaps pass | `systems/gaps/index.ts` (`gaps`) | opens and closes none; no `evening.closed` | R2C |
| Gap bookkeeping | `systems/gaps/api.ts` (`openGap`, `closeGap`) | dedupes, numbers, credits once a season; no `gaps.updated` | R2C |
| The edition | `view/evening.ts` (`eveningView`) | the tally with no lines and no places list | R2C |
| The evening feats' setups | `packages/sim/test/hearth/achievements.test.ts` (`PENDING`) | Out of an Evening, A Seat for Everyone and Mind the Gap are left out of "every achievement has a setup and unlocks once" until their counts exist | R2C |
| The lot cutter's fields | `systems/zoning/lots.ts` | every lot `row: 0`, `kind: 'plot'`, no corner | R2F |
| Storeys | `systems/zoning/storeys.ts` (`storeysFor`) | by tier (cottage 1.5, townhouse 2, merchant 3) or business level (1, 1.5, 2) alone, set at growth only | R2F |
| Tier gates | `content/baskets.ts`, `systems/tiers/**` | Craftsfolk still need charm 25 and a tavern; `evenings: 50` is in the data and unread | R2B |
| The brazier's look | `content/villageDecor.ts` (`art.params.kit: 'brazier'`) | drawn with the lantern kit | V3 (not R2) |

Not stand-ins (real from R2.0): `placesNear`, `placeById`, `placeDraw`, `placeServes`, `recordVisit`, `recordSale`, `findGap`, the place id helpers, `cleanName`, the view builders' shapes, the commands' validate and store, the migration.

## The lot fields (for V3) and R2.0's planning answers

The fields (`contracts/village.ts`, `Lot`; `contracts/views.ts`, `LotView` and `BuildingView.storeys`): `row` (an id shared by lots cut from one frontage run, 0 for none), `kind` (`'plot' | 'garden'`), `corner?: true` and `frontage2?: number` (the second frontage's road tile), and `Building.storeys` in half-storey steps (1, 1.5, 2 up to 4). The Mirror carries them in `mirror.lots` (`LotView`, which also gains `frontage` and `storeys`) and `mirror.buildings` (`BuildingView.storeys`); `lotView(lot, state)` fills them and `growLot` emits `lot.updated` after growing. V3B's kit parameter is `params.storeys`; the sim's field is `storeys`. R2.0 told V3.0's author through the master on the day the shapes were final.

The planning questions in `i4-visual-planning-notes.md`, decided:

- **A garden lot is never built on**, and every reader of `state.lots` that grows, prices or offers a lot skips `kind: 'garden'` (growth's lot choice, desirability, the Homes and Shops bars, shops opening, the autoplayer). Its `buildingId` stays 0.
- **Not paintable by hand.** Courtyards come from the cutter alone; zone painting never makes or keeps one, and erasing the rows around it releases it.
- **Its tiles count for charm as ordinary ground** (open grass with what grows there); a garden lot adds nothing of its own.
- **No pattern site.** Detectors do not read garden lots as a green, a square or a kitchen garden; the Hearth's own pieces placed on its tiles count as anywhere.
- **A row is restyled house by house** (V3's and I4's restyle reads each building), so `row` joins and fills, and never forces one style.
- **Growth picks the corner lot's def by the busier road**: the entrance faces `frontage` (the busier road, as the cutter chooses it today), and the def is chosen as for a lot on that road.

## Handshakes

### Who writes what

| State | Written by | Read by |
|---|---|---|
| `map.footfallDay`, `map.footfallEve` | R2A (every step; halved at 04:00) | R2B (Shops desirability, steps past a door for levels), R2D (Town overlay via `footfall.updated`), R2E, V3D (the endpaper's sage ink) |
| `Flags.evening` (flags layer) | `road.setEvening` (R2B); `road.remove` clears it | R2A (walkers prefer it), R2B (carts go round), R2D (the brush and the ink) |
| `state.places` (rows: names, per-evening counts) | R2A (rows, names, `visitors` via `recordVisit`, `served`, the 17:00 push); R2B (`sold`, `takings` via `recordSale`); `place.rename` | R2C (gap rules, the edition), R2D (the card), R2E |
| `Place` (derived) | R2A's pass | R2B (where folk buy; cafes join), R2C, views |
| `Resident.round` | R2A (the plan, arrivals, seats, standing, friends met); R2B (the `treat` flag when a treat is bought) | R2B (the score), R2D (a resident's day) |
| `Resident.evening`, `needs[evenings]` | R2B (21:00) | R2B's tiers and mood, R2D, R2E |
| `state.evenings.tonight` | R2A (the 17:00 roll; `grownups`, `out`, `nowhere`, `stood`, `friendships`), R2B (`scoreSum`, `treats*`, `takings`, `weather`) | R2C at 21:00 (the edition, the runs) |
| `state.evenings` runs (`outRun`, `allOut`, `stoodThisSeason`, `seatedSeasons`) | R2C | R2C's conditions (the Charter goal, the feats) |
| `state.gaps` | R2C | R2D (feed, tags), R2E (outcome tests) |
| `state.streets` | R2A (names runs); `road.rename` | R2D (labels, rename), V3D (street names on the endpaper) |
| `Lot.row`, `kind`, `corner`, `frontage2`; `Building.storeys` | R2F | V3B (via `LotView`), R2B (desirability skips gardens) |
| `settings.eveningLingers` | `valley.setSettings` (R2D's control) | R2B's clock |

### Cross-track APIs (signatures fixed by R2.0)

| API | File | Owner |
|---|---|---|
| `placeIndex(state)`, `invalidatePlaces(state)` | `systems/places/index.ts` | R2A |
| `placesNear(state, tile, radius)`, `placeById(state, id)`, `placeDraw(state, place)`, `placeServes(state, place)` | `systems/places/api.ts` | R2A (R2B, R2C, views read them) |
| `recordVisit(state, place, resident, flags)` | `systems/places/api.ts` | R2A (its arrivals call it once a stop) |
| `recordSale(state, place \| null, outlet, good, qty, pennies)` | `systems/places/api.ts` | R2A's body; R2B calls it for every Treat sold on the round (null for passing trade) |
| `streetTiles(state, street)` | `systems/places/streets.ts` | R2A |
| `pathFor(state, from, to, mode)` with `PathMode` `'walk' \| 'round' \| 'barrow'` | `systems/movement/paths.ts` | R2A (the round's evening cost); R2B's porters ask for `'barrow'`, for whom evening streets are closed from 17:00 to 21:00 |
| `startEvening(state, ctx)` | `systems/residents/round.ts` | R2A (17:00) |
| `eveningScore(state, r)`, `closeEvening(state, ctx)` | `systems/residents/evening.ts` | R2B (21:00) |
| `sellsTreats(state, b)`, `treatsOnShelf(state, b)` | `systems/market/round.ts` | R2B (R2A's pass and `placeServes` read them) |
| `cafeTables(state, b)` | `systems/growth/cafes.ts` | R2B (R2A's pass adds the seats) |
| `findGap`, `openGap(state, ctx, kind, subject, tile, n)`, `closeGap(state, ctx, gap, closers)` | `systems/gaps/api.ts` | R2C |
| `storeysFor(state, lot, def, level?)` | `systems/zoning/storeys.ts` | R2F |
| Place ids (`sitePlaceId`, `seatsPlaceId`, `porchPlaceId`, `hostPlaceId`, `firePlaceId`, `icePlaceId`, `festivalPlaceId`), `placeState`, `newPlaceState`, `startPlaceEvening`, `byPlaceId`, `cleanName`, `shownName`, `eveningsNeed` | `state/evenings.ts` | R2.0 (bug fixes by anyone, shapes fixed) |

### Evening trade and the carrier (R2B decides)

The carrier collects surplus Treats at makers' doors before the shelves (R1X), and Treats sold on the round come out of the same output buffers and shelves. R2B takes from the outlet's shelf (`rt.store`, not what porters or the carrier have reserved: `reservedOut`), so the round and the carrier share one stock and the carrier's selling of a surplus is unchanged; if the round empties a shelf before 21:30, the doorstep errand goes to the next outlet in reach. Record the rule in your PR.

### Events

| Event | Emitted by |
|---|---|
| `places.updated` | R2A: when the pass finds, changes or loses a place (at most hourly), and at 21:00 with the evening's counts; `place.rename` (R2.0 wired it) |
| `streets.updated` | R2A: a run named or gone; `road.rename` (R2.0 wired it) |
| `footfall.updated` | R2A: hourly from 17:00 to 21:00 and after the 04:00 halving |
| `evening.closed` | R2C: at 21:00 (the gaps pass, after the score) |
| `gaps.updated` | R2C: when a gap opens, changes or closes |
| `lot.added`, `lot.updated` | R2F: as today, with the lot fields; `lot.updated` when a row's storeys change |

### Panels and the views they read (R2D)

| Panel | Reads |
|---|---|
| Town overlay (two inks) | the flows overlay as built (ochre), `FootfallView.eve` (sage), `PlaceView.serves` (the glint), `Flags.evening` in the flags layer, `GapsView`, specialized reach |
| Place card | `PlaceView` (name, seats, visitors, serves, takings, draw and `parts`, `wants`), `place.rename` |
| A resident's day | `ResidentDetail.round` (`RoundStopView`), `ResidentDetail.evening` |
| The evening edition | `evening.closed` (`EveningView.lines`, each with its seats) |
| Gaps (feed and tags) | `GapsView` (`text`, `closes`, `tile`, `lane`) |
| The Hearth's strip | `TownView.evenings`, `GapsView.open.length` |
| Evening street brush, street rename | the flags layer, `StreetView`; sends `road.setEvening`, `road.rename` |
| The season spread | `SeasonReportView.cross` (`EditionLine[]`, optional; R2D added the member in its own commit, R2C fills it in `view/season/index.ts`; absent, the spread has no cross-lane block) |

### The order of an evening (where each R2 system runs)

| Time | System (order) | R2 work |
|---|---|---|
| 04:00 | movement (52) | footfall halves (R2A); `footfall.updated` |
| hourly, offset 100 | patterns (72), places (73) | the place pass after the patterns pass (R2A) |
| 17:00 | residents (50) | `startEvening`: the tally rolls, every place row pushes a fresh evening (R2A); the evening grid is fixed for the day's routes (R2A, movement); evening streets close to carts (R2B, logistics) |
| 17:00 to 17:30 | residents (50) | each young and adult resident plans at their own minute (R2A); shopping first when the pantry is low |
| 17:00 to 21:00 | residents (50), movement (52) | stops, seats, standing (R2A, `recordVisit`); Treats at stops and passing trade (R2B, `recordSale`); footfall on the round (R2A); the clock at half speed when the evening lingers (R2B, `turn.ts`) |
| 18:00 | baskets (67) | Wares only; Treats have left this pass (R2B) |
| 19:00 | residents (50) | builders and porters plan (R2A); carters stop (R2B) |
| 21:00 | residents (50) | folk set off home; `closeEvening`: scores, the need, the bond heart (R2B) |
| 21:00 + 10 ticks | gaps (79) | the gap rules, the runs, `evening.closed` (R2C) |
| 21:30 | baskets (67) | the doorstep errand (R2B) |
| 23:30 | levels (69) | steps past a door count as custom; cafes put tables out (R2B) |

## Skipped and changed tests

- No test was skipped by R2.0. One exclusion: the three evening feats are kept out of `hearth/achievements.test.ts`'s every-achievement loops (`PENDING`, an R2C stand-in) until R2C counts them.
- Changed: `packages/sim/test/r1/saves.test.ts` (version 8; P2's synthetic version 6 case now checks its own step, 6 to 7, since a current save stripped to "6" carries R2's state), `packages/sim/test/turn.test.ts` (the R2 slots), `apps/client/src/contracts.test.ts` (the pinned unions gain R2's members), `tools/bench/src/r1xEvents.test.ts` (the growth nights' fingerprint drops the R2 lot fields and storeys before hashing, so R1X's pre-speed-up oracle still holds), the lot literals in three sim tests and the village fixture (`row: 0`, `kind: 'plot'`), the content counts (`validate.test.ts`: 23 achievements, the brazier among festival-era decor, charter unlocks count as unlocks; `hamlet-contracts.test.ts`; the client's `books.test.ts`, "of 23 earned").
- Golden files: `i0-basic.json`, `i1-hamlet.json` and `r1-year.json` are command scripts with no stored hash, so the new state and the `round` stream change what they hash to in Node and in a browser worker alike and nothing needs regenerating; `npm run golden` would rewrite `i0-basic.json` only because the decor list grew (the brazier shifts the generator's picks), not because the format changed, so the scripts stay as they were. R2.0 added `v6-hazel-day3.json`, a real version 6 valley (its gzip bytes in base64, written at ad9ca6f; the recipe is in `test/r2-0/saves.test.ts`), for the migration tests and the browser check.

## Found in R2.0, for the wave

- **From the player's chair: content a Charter unlocks needs a migration.** The regrown village (`?debug&fixture=grown`, a version 6 save past its Village Charter) loaded and ran fine on R2.0's version, but its brazier stayed locked forever: a Charter's unlocks go into `hearth.unlocked` at the claim, and that claim came before the brazier existed. The migration now unlocks it for a town at Village rank or above, and `test/r2-0/unlocks.test.ts` checks the class: a migrated valley holds every unlock of every Charter it has claimed. Any cycle that adds a piece to a Charter's or innovation's unlock list must do the same for valleys already past it.
- **The evening bit is in the flags layer** (`Flags.evening`, 16), not the road layer's spare bits as `10-world-and-building.md` said: the road layer's value is compared and indexed as a road kind in over a hundred places. `road.remove` clears it. The spec now says so.
- **Footfall never travels as layer patches** (every step would dirty a chunk): the two layers are `Uint16LayerName`s, saved and hashed after the others but outside `LayerName`, and reach the client only as `FootfallView` (the snapshot and `footfall.updated`).
- **The Village's evening goal waits for R2C's counter.** On stand-ins nobody goes out, so R2.0 left the Charter as R1X shipped it.
- **Tier gates wait for R2B.** `NeedsBasket.evenings` is in the data (Craftsfolk 50) and unread; Craftsfolk still need charm 25 and a tavern until R2B's tiers read evenings, so R1's Craftsfolk numbers hold on stand-ins.
- **The R1 Craftsfolk targets and the stricter growth scene** (moved here by the owner, 2026-11-15) are R2B's and R2E's lines and R2X's acceptance: first Craftsfolk by day 40 and a third by day 70 on every bench seed; R1F's `r1 growth night` under 2 ms on a reference laptop. Village debt (616 to 3,080 coins owed at day 70 in R1X's run) is R2X's tuning; evening trade moves coins inside the valley and does not by itself mend it.
- **The lanes test** is enforced from R2 (R2E): at R1's end the Hearth-off towns ended with 93 to 187% of the residents of the town played by both, so it fails until the evening round gives places their pull.
